//! 从 npm registry 下载 create-s-blog 包并提取 template 目录

use std::io::Read;
use std::path::Path;

use flate2::read::GzDecoder;
use tar::Archive;

const REGISTRY_URL: &str = "https://registry.npmjs.org/create-s-blog/latest";

/// 从 npm registry 下载最新 create-s-blog 模板并解压到 dest
pub async fn fetch_template(dest: &Path) -> Result<(), String> {
    // 1. 获取包元数据拿到 tarball URL
    let meta: serde_json::Value = reqwest::get(REGISTRY_URL)
        .await
        .map_err(|e| format!("获取包信息失败: {e}"))?
        .json()
        .await
        .map_err(|e| format!("解析包信息失败: {e}"))?;

    let tarball_url = meta["dist"]["tarball"]
        .as_str()
        .ok_or("无法获取 tarball URL")?;

    // 2. 下载 tarball
    let bytes = reqwest::get(tarball_url)
        .await
        .map_err(|e| format!("下载模板失败: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("读取模板数据失败: {e}"))?;

    // 3. 解压 .tgz，提取 package/template/* 到 dest
    let gz = GzDecoder::new(bytes.as_ref());
    let mut archive = Archive::new(gz);

    let prefix = "package/template/";

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

        // 去掉 "package/template/" 前缀
        let relative = &path_str[prefix.len()..];
        if relative.is_empty() {
            continue;
        }

        let out_path = dest.join(relative);

        if entry.header().entry_type().is_dir() {
            std::fs::create_dir_all(&out_path)
                .map_err(|e| format!("创建目录失败: {e}"))?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("创建目录失败: {e}"))?;
            }
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf).map_err(|e| format!("读取文件失败: {e}"))?;
            std::fs::write(&out_path, buf)
                .map_err(|e| format!("写入文件失败: {e}"))?;
        }
    }

    Ok(())
}
