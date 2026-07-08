//! Client-side deploy pipeline: scan `dist/`, create a deployment, upload the
//! build artifacts directly to R2 via pre-signed URLs, and finalize the release.
//!
//! Mirrors the build/sync command style: runs in the async runtime, emits
//! `deploy-progress` events, and supports cancellation via an atomic flag.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use tokio::sync::Semaphore;

use crate::auth::{current_auth, DEPLOY_API_BASE_URL};
use crate::commands::RunningGuard;
use crate::sites::map_deploy_error;
use crate::state::AppState;

/// Maximum number of concurrent PUT uploads.
const MAX_CONCURRENT_UPLOADS: usize = 6;
/// Retry attempts per individual file upload.
const MAX_UPLOAD_RETRIES: usize = 3;
/// How many files to request pre-signed URLs for in a single sign-upload call.
const SIGN_BATCH_SIZE: usize = 200;
/// Requested lifetime of the pre-signed URLs, in seconds.
const URL_EXPIRES_SEC: u64 = 900;
/// Maximum finalize rounds (re-signing + re-uploading reported-missing files).
const MAX_FINALIZE_ROUNDS: usize = 3;

fn deploy_api_url() -> Result<&'static str, String> {
    DEPLOY_API_BASE_URL.ok_or_else(|| "部署服务未配置".to_string())
}

/// A single artifact file to upload.
#[derive(Clone)]
struct FileEntry {
    /// Relative path with forward slashes (R2 object suffix).
    rel: String,
    /// Absolute path on disk.
    abs: PathBuf,
    /// File size in bytes.
    size: u64,
}

fn emit_evt(app: &AppHandle, v: Value) {
    let _ = app.emit("deploy-progress", v.to_string());
}

fn is_cancelled(cancel: &Arc<std::sync::atomic::AtomicBool>) -> bool {
    cancel.load(Ordering::SeqCst)
}

/// Recursively scan a directory into a flat list of files.
fn scan_dir(root: &Path) -> Result<Vec<FileEntry>, String> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = std::fs::read_dir(&dir).map_err(|e| format!("扫描目录失败: {e}"))?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            let ft = entry.file_type().map_err(|e| e.to_string())?;
            if ft.is_dir() {
                stack.push(path);
            } else if ft.is_file() {
                let rel = path
                    .strip_prefix(root)
                    .map_err(|_| "路径解析失败".to_string())?
                    .to_string_lossy()
                    .replace('\\', "/");
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                out.push(FileEntry { rel, abs: path, size });
            }
        }
    }
    Ok(out)
}

/// Request pre-signed PUT URLs for a batch of files. Returns a map of
/// normalized path -> signed URL.
async fn sign_batch(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    deployment_id: &str,
    batch: &[FileEntry],
) -> Result<HashMap<String, String>, String> {
    let files: Vec<Value> = batch
        .iter()
        .map(|f| json!({ "path": f.rel, "size": f.size }))
        .collect();

    let res = client
        .post(format!("{}/deployments/{}/sign-upload", base, deployment_id))
        .header("Authorization", format!("Bearer {}", token))
        .json(&json!({ "files": files, "expiresInSec": URL_EXPIRES_SEC }))
        .send()
        .await
        .map_err(|_| "网络连接失败，请检查网络".to_string())?;

    let status = res.status().as_u16();
    let body = res.text().await.unwrap_or_default();
    if status >= 400 {
        return Err(map_deploy_error(status, &body));
    }

    let parsed: Value = serde_json::from_str(&body).map_err(|_| "解析响应失败".to_string())?;
    let mut map = HashMap::new();
    if let Some(urls) = parsed["urls"].as_array() {
        for u in urls {
            if let (Some(path), Some(url)) = (u["path"].as_str(), u["url"].as_str()) {
                map.insert(path.to_string(), url.to_string());
            }
        }
    }
    Ok(map)
}

/// Upload a single file to its pre-signed URL, with retries.
async fn upload_one(
    client: &reqwest::Client,
    entry: &FileEntry,
    url: &str,
    cancel: &Arc<std::sync::atomic::AtomicBool>,
) -> Result<(), String> {
    let bytes = tokio::fs::read(&entry.abs)
        .await
        .map_err(|e| format!("读取文件失败 {}: {}", entry.rel, e))?;

    let mut attempt = 0usize;
    loop {
        if is_cancelled(cancel) {
            return Err("已取消部署".to_string());
        }
        attempt += 1;
        let result = client
            .put(url)
            .body(bytes.clone())
            .send()
            .await;
        match result {
            Ok(resp) if resp.status().is_success() => return Ok(()),
            Ok(resp) => {
                let code = resp.status().as_u16();
                if attempt >= MAX_UPLOAD_RETRIES {
                    return Err(format!("上传失败 {} ({})", entry.rel, code));
                }
            }
            Err(_) => {
                if attempt >= MAX_UPLOAD_RETRIES {
                    return Err(format!("上传失败 {}（网络错误）", entry.rel));
                }
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(500 * attempt as u64)).await;
    }
}

/// Sign + upload the given entries concurrently, emitting per-file progress.
/// `done` and `total` drive the running progress counter across calls.
#[allow(clippy::too_many_arguments)]
async fn sign_and_upload(
    app: &AppHandle,
    client: &reqwest::Client,
    base: &str,
    token: &str,
    deployment_id: &str,
    entries: &[FileEntry],
    cancel: &Arc<std::sync::atomic::AtomicBool>,
    done: &Arc<AtomicUsize>,
    total: usize,
) -> Result<(), String> {
    for chunk in entries.chunks(SIGN_BATCH_SIZE) {
        if is_cancelled(cancel) {
            return Err("已取消部署".to_string());
        }
        let url_map = sign_batch(client, base, token, deployment_id, chunk).await?;

        let sem = Arc::new(Semaphore::new(MAX_CONCURRENT_UPLOADS));
        let mut set = tokio::task::JoinSet::new();

        for entry in chunk {
            let url = url_map
                .get(&entry.rel)
                .cloned()
                .ok_or_else(|| format!("缺少上传授权: {}", entry.rel))?;
            let sem = sem.clone();
            let client = client.clone();
            let app = app.clone();
            let cancel = cancel.clone();
            let done = done.clone();
            let entry = entry.clone();

            set.spawn(async move {
                let _permit = sem.acquire_owned().await.map_err(|_| "并发调度失败".to_string())?;
                if is_cancelled(&cancel) {
                    return Err("已取消部署".to_string());
                }
                upload_one(&client, &entry, &url, &cancel).await?;
                let n = done.fetch_add(1, Ordering::SeqCst) + 1;
                emit_evt(
                    &app,
                    json!({ "type": "uploading", "current": n, "total": total, "file": entry.rel }),
                );
                Ok::<(), String>(())
            });
        }

        while let Some(joined) = set.join_next().await {
            match joined {
                Ok(Ok(())) => {}
                Ok(Err(e)) => {
                    set.abort_all();
                    return Err(e);
                }
                Err(e) => {
                    set.abort_all();
                    return Err(format!("上传任务异常: {e}"));
                }
            }
        }
    }
    Ok(())
}

/// Outcome of a finalize call.
enum FinalizeOutcome {
    Success(String),
    Missing(Vec<String>),
}

async fn finalize_once(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    deployment_id: &str,
    all_files: &[FileEntry],
) -> Result<FinalizeOutcome, String> {
    let files: Vec<Value> = all_files
        .iter()
        .map(|f| json!({ "path": f.rel, "size": f.size }))
        .collect();

    let res = client
        .post(format!("{}/deployments/{}/finalize", base, deployment_id))
        .header("Authorization", format!("Bearer {}", token))
        .json(&json!({ "files": files }))
        .send()
        .await
        .map_err(|_| "网络连接失败，请检查网络".to_string())?;

    let status = res.status().as_u16();
    let body = res.text().await.unwrap_or_default();
    let parsed: Value = serde_json::from_str(&body).unwrap_or(Value::Null);

    if status == 200 && parsed["ok"].as_bool().unwrap_or(false) {
        let url = parsed["url"].as_str().unwrap_or("").to_string();
        return Ok(FinalizeOutcome::Success(url));
    }
    if status == 409 {
        let missing = parsed["missing"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        return Ok(FinalizeOutcome::Missing(missing));
    }
    Err(map_deploy_error(status, &body))
}

// ── Tauri commands ─────────────────────────────────────────

/// Deploy the already-built `dist/` directory to the given site.
/// Returns the live site URL on success.
#[tauri::command]
pub async fn deploy_site(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    blog_dir: String,
    site_slug: String,
) -> Result<String, String> {
    let _guard = RunningGuard::acquire(&state.deploy_running)?;
    state.deploy_cancel.store(false, Ordering::SeqCst);
    let cancel = state.deploy_cancel.clone();

    let base = deploy_api_url()?;
    let (token, _uid) = current_auth(&state)?;

    // 1. Scan dist -> manifest (blocking fs walk moved off the async runtime)
    let dist = Path::new(&blog_dir).join("dist");
    if !dist.is_dir() {
        return Err("未找到构建产物 dist 目录，请先构建".to_string());
    }
    emit_evt(&app, json!({ "type": "scanning" }));
    let scan_dist = dist.clone();
    let files = tokio::task::spawn_blocking(move || scan_dir(&scan_dist))
        .await
        .map_err(|e| format!("扫描任务失败: {e}"))??;
    if files.is_empty() {
        return Err("构建产物为空，请先构建".to_string());
    }
    if !files.iter().any(|f| f.rel == "index.html") {
        return Err("构建产物缺少 index.html".to_string());
    }
    let total_bytes: u64 = files.iter().map(|f| f.size).sum();
    let total_files = files.len();
    emit_evt(
        &app,
        json!({ "type": "scanned", "fileCount": total_files, "totalBytes": total_bytes }),
    );

    if is_cancelled(&cancel) {
        return Err("已取消部署".to_string());
    }

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    // 2. Init deployment
    emit_evt(&app, json!({ "type": "log", "message": "正在创建部署..." }));
    let init_res = client
        .post(format!("{}/deployments/init", base))
        .header("Authorization", format!("Bearer {}", token))
        .json(&json!({
            "siteSlug": site_slug,
            "fileCount": total_files,
            "artifactSize": total_bytes,
        }))
        .send()
        .await
        .map_err(|_| "网络连接失败，请检查网络".to_string())?;
    let status = init_res.status().as_u16();
    let body = init_res.text().await.unwrap_or_default();
    if status >= 400 {
        return Err(map_deploy_error(status, &body));
    }
    let parsed: Value = serde_json::from_str(&body).map_err(|_| "解析响应失败".to_string())?;
    let deployment_id = parsed["deployment"]["id"]
        .as_str()
        .ok_or("响应缺少部署 ID")?
        .to_string();
    let release_id = parsed["deployment"]["releaseId"].as_str().unwrap_or("").to_string();
    emit_evt(&app, json!({ "type": "init", "releaseId": release_id }));

    // 3. Sign + upload all files
    let done = Arc::new(AtomicUsize::new(0));
    sign_and_upload(
        &app, &client, base, &token, &deployment_id, &files, &cancel, &done, total_files,
    )
    .await?;

    // 4. Finalize (with re-sign + re-upload of any reported-missing files)
    for round in 0..MAX_FINALIZE_ROUNDS {
        if is_cancelled(&cancel) {
            return Err("已取消部署".to_string());
        }
        emit_evt(&app, json!({ "type": "finalizing" }));
        match finalize_once(&client, base, &token, &deployment_id, &files).await? {
            FinalizeOutcome::Success(url) => {
                emit_evt(&app, json!({ "type": "done", "url": url }));
                return Ok(url);
            }
            FinalizeOutcome::Missing(missing) => {
                if round + 1 >= MAX_FINALIZE_ROUNDS {
                    return Err(format!("发布校验失败，仍有 {} 个文件缺失", missing.len()));
                }
                emit_evt(
                    &app,
                    json!({ "type": "retry", "missing": missing.len() }),
                );
                let missing_set: std::collections::HashSet<&str> =
                    missing.iter().map(|s| s.as_str()).collect();
                let missing_entries: Vec<FileEntry> = files
                    .iter()
                    .filter(|f| missing_set.contains(f.rel.as_str()))
                    .cloned()
                    .collect();
                if missing_entries.is_empty() {
                    return Err("发布校验失败：缺失文件无法定位".to_string());
                }
                let done2 = Arc::new(AtomicUsize::new(0));
                sign_and_upload(
                    &app,
                    &client,
                    base,
                    &token,
                    &deployment_id,
                    &missing_entries,
                    &cancel,
                    &done2,
                    missing_entries.len(),
                )
                .await?;
            }
        }
    }

    Err("发布失败，请重试".to_string())
}

#[tauri::command]
pub async fn cancel_deploy(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.deploy_cancel.store(true, Ordering::SeqCst);
    Ok(())
}
