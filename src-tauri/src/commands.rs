use std::fs;
use std::path::Path;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::error::AppError;
use crate::models::*;
use crate::state::AppState;

// ── 目录相关 ──────────────────────────────────────────────

#[tauri::command]
pub async fn select_directory(app: AppHandle) -> Result<Option<String>, String> {
    let folder = app
        .dialog()
        .file()
        .set_title("选择目录")
        .blocking_pick_folder();
    Ok(folder.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn check_directory_exists(path: String) -> Result<bool, String> {
    let p = Path::new(&path);
    Ok(p.exists() && p.is_dir())
}

#[tauri::command]
pub async fn open_in_explorer(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(AppError::DirectoryNotFound(path).to_string());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &path])
            .spawn()
            .map_err(|e| format!("无法打开文件管理器: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("无法打开 Finder: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("无法打开文件管理器: {e}"))?;
    }
    Ok(())
}

// ── 文章相关 ──────────────────────────────────────────────

#[tauri::command]
pub async fn list_posts(blog_dir: String) -> Result<Vec<PostSummary>, String> {
    let posts_dir = Path::new(&blog_dir).join("posts");
    if !posts_dir.is_dir() {
        return Ok(vec![]);
    }
    let mut posts = Vec::new();
    let entries = fs::read_dir(&posts_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map(|e| e == "md").unwrap_or(false) {
            let filename = path.file_name().unwrap().to_string_lossy();
            let (_, language) = spage_engine::posts::parse_post_filename(&filename);
            if language.is_some() {
                continue;
            }
            if let Ok(content) = fs::read_to_string(&path) {
                let summary = parse_post_summary(&path, &content);
                posts.push(summary);
            }
        }
    }
    posts.sort_by(|a, b| b.date.cmp(&a.date));
    Ok(posts)
}

#[tauri::command]
pub async fn get_post(blog_dir: String, filename: String) -> Result<PostDetail, String> {
    let path = Path::new(&blog_dir).join("posts").join(&filename);
    if !path.is_file() {
        return Err(format!("文件不存在: {}", filename));
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(parse_post_detail(&filename, &raw))
}

#[tauri::command]
pub async fn save_post(blog_dir: String, filename: String, content: String) -> Result<(), String> {
    let path = Path::new(&blog_dir).join("posts").join(&filename);
    fs::write(&path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_post(blog_dir: String, filename: String) -> Result<(), String> {
    let path = Path::new(&blog_dir).join("posts").join(&filename);
    if path.is_file() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn create_post(
    blog_dir: String,
    filename: String,
    content: String,
) -> Result<(), String> {
    let posts_dir = Path::new(&blog_dir).join("posts");
    fs::create_dir_all(&posts_dir).map_err(|e| e.to_string())?;
    let path = posts_dir.join(&filename);
    if path.exists() {
        return Err(format!("文件已存在: {}", filename));
    }
    fs::write(&path, &content).map_err(|e| e.to_string())
}

// ── 相册相关 ──────────────────────────────────────────────

#[tauri::command]
pub async fn list_albums(blog_dir: String) -> Result<Vec<AlbumInfo>, String> {
    let albums_dir = Path::new(&blog_dir).join("albums");
    if !albums_dir.is_dir() {
        return Ok(vec![]);
    }
    // 读取 album.config.json
    let config_path = Path::new(&blog_dir).join("album.config.json");
    let config: serde_json::Value = if config_path.is_file() {
        let s = fs::read_to_string(&config_path).unwrap_or_default();
        serde_json::from_str(&s).unwrap_or_default()
    } else {
        serde_json::Value::Null
    };

    let mut albums = Vec::new();
    let entries = fs::read_dir(&albums_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let dir_name = path.file_name().unwrap().to_string_lossy().to_string();
        if dir_name.starts_with('.') || dir_name == "thumbs" {
            continue;
        }
        let photo_count = count_photos(&path);
        // 从配置中查找该相册的 name/cover
        let (name, mut cover) = if let Some(arr) = config.get("albums").and_then(|v| v.as_array()) {
            arr.iter()
                .find(|a| a.get("dir").and_then(|d| d.as_str()) == Some(&dir_name))
                .map(|a| {
                    (
                        a.get("name")
                            .and_then(|n| n.as_str())
                            .map(|s| s.to_string()),
                        a.get("cover")
                            .and_then(|c| c.as_str())
                            .map(|s| s.to_string()),
                    )
                })
                .unwrap_or((None, None))
        } else {
            (None, None)
        };
        // 没有配置 cover 时用第一张图
        if cover.is_none() {
            cover = first_photo(&path);
        }
        albums.push(AlbumInfo {
            dir: dir_name,
            name,
            cover,
            photo_count,
        });
    }
    albums.sort_by(|a, b| a.dir.to_lowercase().cmp(&b.dir.to_lowercase()));
    Ok(albums)
}

// ── 设置相关 ──────────────────────────────────────────────

#[tauri::command]
pub async fn read_config(blog_dir: String, filename: String) -> Result<SiteConfig, String> {
    let path = Path::new(&blog_dir).join(&filename);
    if !path.is_file() {
        return Ok(SiteConfig { raw: "{}".into() });
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(SiteConfig { raw })
}

#[tauri::command]
pub async fn write_config(
    blog_dir: String,
    filename: String,
    content: String,
) -> Result<(), String> {
    let path = Path::new(&blog_dir).join(&filename);
    fs::write(&path, &content).map_err(|e| e.to_string())
}

// ── 图片相关 ──────────────────────────────────────────────

#[tauri::command]
pub async fn select_image(app: AppHandle) -> Result<Option<String>, String> {
    let file = app
        .dialog()
        .file()
        .set_title("选择图片")
        .add_filter("图片", &["png", "jpg", "jpeg", "ico", "svg", "webp", "gif"])
        .blocking_pick_file();
    Ok(file.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn copy_to_public(
    blog_dir: String,
    source: String,
    filename: String,
) -> Result<(), String> {
    let public_dir = Path::new(&blog_dir).join("public");
    fs::create_dir_all(&public_dir).map_err(|e| e.to_string())?;
    let dest = public_dir.join(&filename);
    fs::copy(&source, &dest).map_err(|e| format!("复制文件失败: {e}"))?;
    Ok(())
}

// ── 初始化相关 ────────────────────────────────────────────

#[tauri::command]
pub async fn init_blog(app: AppHandle, config: BlogConfig) -> Result<InitResult, String> {
    let target_dir = Path::new(&config.target_dir);
    if !target_dir.exists() {
        return Err(AppError::DirectoryNotFound(config.target_dir.clone()).to_string());
    }
    let project_path = target_dir.join(&config.project_name);
    if project_path.exists() {
        return Err(AppError::DirectoryAlreadyExists(config.project_name.clone()).to_string());
    }

    let _ = app.emit("log_output", "正在生成项目...");

    let input = spage_scaffold::ScaffoldInput {
        target_dir: project_path.display().to_string(),
        name: config.project_name.clone(),
        description: config.description,
        author: config.author,
        site_url: config.site_url,
        timezone: if config.timezone.is_empty() {
            None
        } else {
            Some(config.timezone)
        },
    };

    match spage_scaffold::scaffold(&input) {
        Ok(_) => {
            let _ = app.emit("log_output", "  ✓ config.json");
            let _ = app.emit("log_output", "  ✓ album.config.json");
            let _ = app.emit("log_output", "  ✓ package.json");
            let _ = app.emit("log_output", "");
            let _ = app.emit("log_output", "✓ 博客项目初始化完成");
        }
        Err(e) => {
            spage_scaffold::cleanup(&project_path.display().to_string());
            return Err(format!("初始化失败: {e}"));
        }
    }

    Ok(InitResult {
        success: true,
        project_path: project_path.display().to_string(),
        message: "博客项目初始化成功".to_string(),
    })
}

#[tauri::command]
pub async fn read_directory_tree(path: String) -> Result<FileNode, String> {
    let root = Path::new(&path);
    if !root.exists() {
        return Err(AppError::DirectoryNotFound(path.clone()).to_string());
    }
    if !root.is_dir() {
        return Err(AppError::FileSystemError("指定路径不是目录".into()).to_string());
    }
    let root_name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());
    let mut children = Vec::new();
    let posts_path = root.join("posts");
    if posts_path.is_dir() {
        children.push(read_flat_dir(&posts_path)?);
    }
    let albums_path = root.join("albums");
    if albums_path.is_dir() {
        children.push(read_albums_dir(&albums_path)?);
    }
    let config_path = root.join("config.json");
    if config_path.is_file() {
        children.push(FileNode {
            name: "config.json".into(),
            path: config_path.display().to_string(),
            is_directory: false,
            children: None,
        });
    }
    Ok(FileNode {
        name: root_name,
        path,
        is_directory: true,
        children: Some(children),
    })
}

// ── 内部辅助 ─────────────────────────────────────────────

fn parse_post_summary(path: &Path, content: &str) -> PostSummary {
    let filename = path.file_name().unwrap().to_string_lossy().to_string();
    let (frontmatter, body) = split_frontmatter(content);
    let title =
        extract_fm_str(&frontmatter, "title").unwrap_or_else(|| filename.replace(".md", ""));
    let date = extract_fm_str(&frontmatter, "date").unwrap_or_default();
    let tags = extract_fm_list(&frontmatter, "tags");
    let categories = extract_fm_list(&frontmatter, "categories");
    let preview = extract_fm_str(&frontmatter, "preview")
        .or_else(|| extract_fm_str(&frontmatter, "description"))
        .or_else(|| extract_fm_str(&frontmatter, "excerpt"))
        .unwrap_or_else(|| build_post_preview(&body, 140));
    PostSummary {
        filename,
        title,
        date,
        tags,
        categories,
        preview,
    }
}

fn build_post_preview(body: &str, max_chars: usize) -> String {
    let mut in_code_block = false;
    let plain = body
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with("```") {
                in_code_block = !in_code_block;
                return None;
            }
            if in_code_block || trimmed.is_empty() || trimmed.starts_with("![") {
                return None;
            }
            Some(
                trimmed
                    .trim_start_matches('#')
                    .trim()
                    .replace("**", "")
                    .replace("__", "")
                    .replace('`', ""),
            )
        })
        .collect::<Vec<_>>()
        .join(" ");
    let plain = plain.trim();
    if plain.chars().count() > max_chars {
        format!("{}...", plain.chars().take(max_chars).collect::<String>())
    } else {
        plain.to_string()
    }
}

fn parse_post_detail(filename: &str, raw: &str) -> PostDetail {
    let (frontmatter, body) = split_frontmatter(raw);
    let title =
        extract_fm_str(&frontmatter, "title").unwrap_or_else(|| filename.replace(".md", ""));
    let date = extract_fm_str(&frontmatter, "date").unwrap_or_default();
    let tags = extract_fm_list(&frontmatter, "tags");
    let categories = extract_fm_list(&frontmatter, "categories");
    let preview = extract_fm_str(&frontmatter, "preview").unwrap_or_default();
    PostDetail {
        filename: filename.to_string(),
        title,
        date,
        tags,
        categories,
        preview,
        content: body,
        raw: raw.to_string(),
    }
}

fn split_frontmatter(content: &str) -> (String, String) {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return (String::new(), content.to_string());
    }
    if let Some(end) = trimmed[3..].find("\n---") {
        let fm = trimmed[3..3 + end].trim().to_string();
        let body = trimmed[3 + end + 4..].trim_start().to_string();
        (fm, body)
    } else {
        (String::new(), content.to_string())
    }
}

fn extract_fm_str(fm: &str, key: &str) -> Option<String> {
    for line in fm.lines() {
        let line = line.trim();
        if line.starts_with(&format!("{key}:")) {
            let val = line[key.len() + 1..].trim();
            // Remove surrounding quotes if present
            let val = val.trim_matches('"').trim_matches('\'');
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}

fn extract_fm_list(fm: &str, key: &str) -> Vec<String> {
    for line in fm.lines() {
        let line = line.trim();
        if line.starts_with(&format!("{key}:")) {
            let val = line[key.len() + 1..].trim();
            // [item1, item2] format
            if val.starts_with('[') && val.ends_with(']') {
                return val[1..val.len() - 1]
                    .split(',')
                    .map(|s| s.trim().trim_matches('"').trim_matches('\'').to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
            }
        }
    }
    vec![]
}

fn first_photo(path: &Path) -> Option<String> {
    let exts = ["jpg", "jpeg", "png", "webp", "heic", "gif"];
    let mut entries: Vec<_> = fs::read_dir(path)
        .ok()?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| exts.contains(&ext.to_string_lossy().to_lowercase().as_str()))
                .unwrap_or(false)
        })
        .collect();
    entries.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
    entries
        .first()
        .map(|e| e.file_name().to_string_lossy().to_string())
}

fn count_photos(path: &Path) -> usize {
    let exts = ["jpg", "jpeg", "png", "webp", "heic", "gif"];
    fs::read_dir(path)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.path()
                        .extension()
                        .map(|ext| exts.contains(&ext.to_string_lossy().to_lowercase().as_str()))
                        .unwrap_or(false)
                })
                .count()
        })
        .unwrap_or(0)
}

fn read_flat_dir(path: &Path) -> Result<FileNode, String> {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let mut children = Vec::new();
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let ep = entry.path();
        let fname = ep
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if fname.starts_with('.') {
            continue;
        }
        if ep.is_file() {
            children.push(FileNode {
                name: fname,
                path: ep.display().to_string(),
                is_directory: false,
                children: None,
            });
        }
    }
    children.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(FileNode {
        name,
        path: path.display().to_string(),
        is_directory: true,
        children: Some(children),
    })
}

fn read_albums_dir(path: &Path) -> Result<FileNode, String> {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let mut children = Vec::new();
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let ep = entry.path();
        let fname = ep
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        if fname.starts_with('.') || fname == "thumbs" {
            continue;
        }
        if ep.is_dir() {
            let count = count_photos(&ep);
            children.push(FileNode {
                name: format!("{fname} ({count} 张)"),
                path: ep.display().to_string(),
                is_directory: true,
                children: None,
            });
        }
    }
    children.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(FileNode {
        name,
        path: path.display().to_string(),
        is_directory: true,
        children: Some(children),
    })
}

// ── 控制中心相关 ──────────────────────────────────────────

#[tauri::command]
pub async fn start_serve(
    app: AppHandle,
    state: State<'_, AppState>,
    blog_dir: String,
    port: Option<u16>,
    open_browser: Option<bool>,
) -> Result<String, String> {
    if let Some(mut h) = state.serve_handle.lock().unwrap().take() {
        h.shutdown();
    }

    let shell_dir = crate::shell_fetcher::ensure_shell_cache(&app).await?;

    let config = spage_engine::serve::ServeConfig {
        work_dir: blog_dir.into(),
        shell_dir,
        port: port.unwrap_or(3000),
        ..Default::default()
    };
    let ctx = spage_engine::serve::ServeContext {
        runtime: Some(tokio::runtime::Handle::current()),
    };

    let handle =
        spage_engine::serve::serve_with_context(config, Some(ctx)).map_err(|e| e.to_string())?;

    let addr = format!("http://127.0.0.1:{}", handle.address().port());
    *state.serve_handle.lock().unwrap() = Some(handle);

    if open_browser.unwrap_or(true) {
        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("cmd")
                .args(["/c", "start", "", &addr])
                .spawn();
        }
        #[cfg(target_os = "macos")]
        {
            let _ = std::process::Command::new("open").arg(&addr).spawn();
        }
        #[cfg(target_os = "linux")]
        {
            let _ = std::process::Command::new("xdg-open").arg(&addr).spawn();
        }
    }

    Ok(addr)
}

#[tauri::command]
pub async fn stop_serve(state: State<'_, AppState>) -> Result<(), String> {
    if let Some(mut h) = state.serve_handle.lock().unwrap().take() {
        h.shutdown();
    }
    Ok(())
}

#[tauri::command]
pub async fn get_serve_status(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let mut guard = state.serve_handle.lock().unwrap();
    if let Some(h) = guard.as_ref() {
        let port = h.address().port();
        if std::net::TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return Ok(Some(format!("http://127.0.0.1:{}", port)));
        }
        // 服务已死，清理 handle
        if let Some(mut h) = guard.take() {
            h.shutdown();
        }
    }
    Ok(None)
}

#[tauri::command]
pub async fn get_task_status(state: State<'_, AppState>) -> Result<(bool, bool, bool), String> {
    let building = *state.build_running.lock().unwrap();
    let syncing = *state.sync_running.lock().unwrap();
    let deploying = *state.deploy_running.lock().unwrap();
    Ok((building, syncing, deploying))
}

/// RAII guard that resets a bool flag to false on drop.
pub(crate) struct RunningGuard<'a> {
    flag: &'a std::sync::Mutex<bool>,
}
impl<'a> RunningGuard<'a> {
    pub(crate) fn acquire(flag: &'a std::sync::Mutex<bool>) -> Result<Self, String> {
        let mut running = flag.lock().unwrap();
        if *running {
            return Err("任务正在进行中".into());
        }
        *running = true;
        Ok(Self { flag })
    }
}
impl Drop for RunningGuard<'_> {
    fn drop(&mut self) {
        *self.flag.lock().unwrap() = false;
    }
}

#[tauri::command]
pub async fn build_blog(
    app: AppHandle,
    state: State<'_, AppState>,
    blog_dir: String,
) -> Result<String, String> {
    use spage_engine::build::BuildOptions;
    use spage_engine::progress::{BuildContext, BuildProgressEvent};
    use std::sync::atomic::Ordering;

    let _guard = RunningGuard::acquire(&state.build_running)?;
    state.build_cancel.store(false, Ordering::SeqCst);

    let shell_dir = crate::shell_fetcher::ensure_shell_cache(&app).await?;
    let cancel_token = state.build_cancel.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || {
        // Read S3 credentials from .env if present (for provider/CI mode)
        let env_path = std::path::Path::new(&blog_dir).join(".env");
        let credentials = if env_path.is_file() {
            let mut access_key = None;
            let mut secret_key = None;
            if let Ok(iter) = dotenvy::from_path_iter(&env_path) {
                for item in iter.flatten() {
                    match item.0.as_str() {
                        "S3_ACCESS_KEY" => access_key = Some(item.1),
                        "S3_SECRET_KEY" => secret_key = Some(item.1),
                        _ => {}
                    }
                }
            }
            match (access_key, secret_key) {
                (Some(ak), Some(sk)) => Some(spage_engine::media_sync::S3Credentials { access_key: ak, secret_key: sk }),
                _ => None,
            }
        } else {
            None
        };

        let ctx = BuildContext {
            on_progress: Some(Box::new(move |evt: BuildProgressEvent| {
                let json = match &evt {
                    BuildProgressEvent::StepStart { step } => format!(r#"{{"type":"step_start","step":"{step}"}}"#),
                    BuildProgressEvent::StepDone { step, detail } => format!(r#"{{"type":"step_done","step":"{step}","detail":"{detail}"}}"#),
                    BuildProgressEvent::AlbumsStart { count } => format!(r#"{{"type":"albums_start","count":{count}}}"#),
                    BuildProgressEvent::PhotoProgress { album, current, total } => format!(r#"{{"type":"photo_progress","album":"{album}","current":{current},"total":{total}}}"#),
                    BuildProgressEvent::PhotoAlbumDone { album, count, duration_ms } => format!(r#"{{"type":"photo_album_done","album":"{album}","count":{count},"durationMs":{duration_ms}}}"#),
                };
                let _ = app_clone.emit("build-progress", json);
            })),
            cancelled: Some(cancel_token),
            credentials,
        };
        let opts = BuildOptions {
            work_dir: blog_dir.into(),
            output_dir: "dist".into(),
            shell_dir,
        };
        spage_engine::build::build_with_context(opts, Some(ctx))
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
    .map_err(|e| e.to_string())?;

    serde_json::to_string(&result).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_build(state: State<'_, AppState>) -> Result<(), String> {
    state
        .build_cancel
        .store(true, std::sync::atomic::Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub async fn check_sync_available(blog_dir: String) -> Result<bool, String> {
    let config_path = Path::new(&blog_dir).join("album.config.json");
    if !config_path.is_file() {
        return Ok(false);
    }
    let raw = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    use std::io::Read;
    let mut stripped = String::new();
    json_comments::StripComments::new(raw.as_bytes())
        .read_to_string(&mut stripped)
        .map_err(|e| e.to_string())?;
    let val: serde_json::Value = serde_json::from_str(&stripped).unwrap_or_default();
    Ok(val.get("provider").map(|v| !v.is_null()).unwrap_or(false))
}

#[tauri::command]
pub async fn sync_media(
    app: AppHandle,
    state: State<'_, AppState>,
    blog_dir: String,
) -> Result<String, String> {
    use spage_engine::media_sync::{S3Credentials, SyncConfig, SyncContext, SyncProgress};
    use std::sync::atomic::Ordering;

    let _guard = RunningGuard::acquire(&state.sync_running)?;
    state.sync_cancel.store(false, Ordering::SeqCst);

    let app_clone = app.clone();
    let cancel_token = state.sync_cancel.clone();
    let _ = app.emit("sync-progress", r#"{"type":"scanning","total":0}"#);

    let result = tokio::task::spawn_blocking(move || {
        // Read credentials from .env file explicitly (no env var mutation)
        let env_path = Path::new(&blog_dir).join(".env");
        let credentials = if env_path.is_file() {
            let mut access_key = None;
            let mut secret_key = None;
            if let Ok(iter) = dotenvy::from_path_iter(&env_path) {
                for item in iter.flatten() {
                    match item.0.as_str() {
                        "S3_ACCESS_KEY" => access_key = Some(item.1),
                        "S3_SECRET_KEY" => secret_key = Some(item.1),
                        _ => {}
                    }
                }
            }
            match (access_key, secret_key) {
                (Some(ak), Some(sk)) => Some(S3Credentials { access_key: ak, secret_key: sk }),
                _ => None,
            }
        } else {
            None
        };

        let config = SyncConfig {
            work_dir: blog_dir.into(),
            ..Default::default()
        };
        let ctx = SyncContext {
            on_progress: Some(Box::new(move |evt: SyncProgress| {
                let json = match &evt {
                    SyncProgress::Scanning { total } => format!(r#"{{"type":"scanning","total":{total}}}"#),
                    SyncProgress::Uploading { current, total, file } => format!(r#"{{"type":"uploading","current":{current},"total":{total},"file":"{file}"}}"#),
                    SyncProgress::GeneratingThumbnail { current, total, file } => format!(r#"{{"type":"generating_thumbnail","current":{current},"total":{total},"file":"{file}"}}"#),
                    SyncProgress::UploadingThumbnail { current, total } => format!(r#"{{"type":"uploading_thumbnail","current":{current},"total":{total}}}"#),
                    SyncProgress::Done => r#"{"type":"done"}"#.to_string(),
                };
                let _ = app_clone.emit("sync-progress", json);
            })),
            credentials,
            cancelled: Some(cancel_token),
        };
        spage_engine::media_sync::sync_media_with_context(config, Some(ctx))
    })
    .await
    .map_err(|e| format!("任务执行失败: {e}"))?
    .map_err(|e| e.to_string())?;

    serde_json::to_string(&result).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_sync(state: State<'_, AppState>) -> Result<(), String> {
    state
        .sync_cancel
        .store(true, std::sync::atomic::Ordering::SeqCst);
    Ok(())
}

// ── 工具命令 ──────────────────────────────────────────────

#[tauri::command]
pub async fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &url])
            .spawn()
            .map_err(|e| format!("无法打开浏览器: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("无法打开浏览器: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("无法打开浏览器: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_shell_version(app: AppHandle) -> Result<Option<String>, String> {
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {e}"))?
        .join("shell-cache");
    if let Ok(entries) = std::fs::read_dir(&base_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() && p.join("index.html").exists() {
                if let Some(name) = p.file_name() {
                    return Ok(Some(name.to_string_lossy().to_string()));
                }
            }
        }
    }
    Ok(None)
}

#[tauri::command]
pub async fn get_engine_version() -> Result<String, String> {
    Ok(env!("SPAGE_ENGINE_VERSION").to_string())
}

#[tauri::command]
pub async fn get_template_version() -> Result<String, String> {
    Ok(env!("SPAGE_TEMPLATE_VERSION").to_string())
}

#[tauri::command]
pub async fn update_shell_cache(app: AppHandle) -> Result<String, String> {
    // 清除旧缓存
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {e}"))?
        .join("shell-cache");
    let _ = std::fs::remove_dir_all(&base_dir);
    // 重新下载
    let cache_dir = crate::shell_fetcher::ensure_shell_cache(&app).await?;
    let version = cache_dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    Ok(version)
}

// ── .env 读写 ─────────────────────────────────────────────

#[tauri::command]
pub async fn read_env(blog_dir: String) -> Result<EnvData, String> {
    let env_path = Path::new(&blog_dir).join(".env");
    if !env_path.is_file() {
        return Ok(EnvData {
            s3_access_key: None,
            s3_secret_key: None,
        });
    }
    let mut access_key = None;
    let mut secret_key = None;
    if let Ok(iter) = dotenvy::from_path_iter(&env_path) {
        for item in iter.flatten() {
            match item.0.as_str() {
                "S3_ACCESS_KEY" => access_key = Some(item.1),
                "S3_SECRET_KEY" => secret_key = Some(item.1),
                _ => {}
            }
        }
    }
    Ok(EnvData {
        s3_access_key: access_key,
        s3_secret_key: secret_key,
    })
}

#[tauri::command]
pub async fn write_env(
    blog_dir: String,
    s3_access_key: String,
    s3_secret_key: String,
) -> Result<(), String> {
    let env_path = Path::new(&blog_dir).join(".env");
    let mut lines: Vec<String> = if env_path.is_file() {
        fs::read_to_string(&env_path)
            .unwrap_or_default()
            .lines()
            .map(|l| l.to_string())
            .collect()
    } else {
        vec![]
    };

    lines.retain(|line| {
        let key = line.split('=').next().unwrap_or("").trim();
        key != "S3_ACCESS_KEY" && key != "S3_SECRET_KEY"
    });
    if !s3_access_key.is_empty() {
        lines.push(format!("S3_ACCESS_KEY={s3_access_key}"));
    }
    if !s3_secret_key.is_empty() {
        lines.push(format!("S3_SECRET_KEY={s3_secret_key}"));
    }

    fs::write(&env_path, lines.join("\n")).map_err(|e| e.to_string())
}
