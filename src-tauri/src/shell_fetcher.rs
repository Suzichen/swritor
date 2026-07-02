//! 从 npm registry 下载 @s-page/core 包并缓存 dist/shell 目录

use std::io::Read;
use std::path::PathBuf;

use flate2::read::GzDecoder;
use tar::Archive;
use tauri::Manager;

const REGISTRY_URL: &str = "https://registry.npmjs.org/@s-page/core/latest";

/// 确保 shell 缓存存在，返回 shell 目录路径
pub async fn ensure_shell_cache(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用数据目录失败: {e}"))?
        .join("shell-cache");

    // 如果已有缓存目录且包含 index.html，直接返回
    if let Ok(entries) = std::fs::read_dir(&base_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() && p.join("index.html").exists() {
                return Ok(p);
            }
        }
    }

    // 从 npm 获取包元数据
    let meta: serde_json::Value = reqwest::get(REGISTRY_URL)
        .await
        .map_err(|e| format!("获取 @s-page/core 包信息失败: {e}"))?
        .json()
        .await
        .map_err(|e| format!("解析包信息失败: {e}"))?;

    let version = meta["version"]
        .as_str()
        .ok_or("无法获取版本号")?
        .to_string();
    let tarball_url = meta["dist"]["tarball"]
        .as_str()
        .ok_or("无法获取 tarball URL")?;

    let cache_dir = base_dir.join(&version);
    std::fs::create_dir_all(&cache_dir).map_err(|e| format!("创建缓存目录失败: {e}"))?;

    // 下载 tarball
    let bytes = reqwest::get(tarball_url)
        .await
        .map_err(|e| format!("下载 @s-page/core 失败: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("读取数据失败: {e}"))?;

    // 解压，提取 package/dist/shell/* 到 cache_dir
    let gz = GzDecoder::new(bytes.as_ref());
    let mut archive = Archive::new(gz);
    let prefix = "package/dist/shell/";

    for entry in archive.entries().map_err(|e| format!("读取 tar 失败: {e}"))? {
        let mut entry = entry.map_err(|e| format!("读取 tar entry 失败: {e}"))?;
        let path = entry
            .path()
            .map_err(|e| format!("读取路径失败: {e}"))?
            .to_path_buf();

        let path_str = path.to_string_lossy();
        if !path_str.starts_with(prefix) {
            continue;
        }

        let relative = &path_str[prefix.len()..];
        if relative.is_empty() {
            continue;
        }

        let out_path = cache_dir.join(relative);
        if entry.header().entry_type().is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|e| format!("创建目录失败: {e}"))?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
            }
            let mut buf = Vec::new();
            entry
                .read_to_end(&mut buf)
                .map_err(|e| format!("读取文件失败: {e}"))?;
            std::fs::write(&out_path, buf).map_err(|e| format!("写入文件失败: {e}"))?;
        }
    }

    Ok(cache_dir)
}
