use std::fs;
use std::path::Path;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::error::AppError;
use crate::models::*;

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
pub async fn create_post(blog_dir: String, filename: String, content: String) -> Result<(), String> {
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
        let (name, cover) = if let Some(arr) = config.get("albums").and_then(|v| v.as_array()) {
            arr.iter()
                .find(|a| a.get("dir").and_then(|d| d.as_str()) == Some(&dir_name))
                .map(|a| {
                    (
                        a.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()),
                        a.get("cover").and_then(|c| c.as_str()).map(|s| s.to_string()),
                    )
                })
                .unwrap_or((None, None))
        } else {
            (None, None)
        };
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
pub async fn write_config(blog_dir: String, filename: String, content: String) -> Result<(), String> {
    let path = Path::new(&blog_dir).join(&filename);
    fs::write(&path, &content).map_err(|e| e.to_string())
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
    fs::create_dir_all(&project_path)
        .map_err(|e| AppError::FileSystemError(e.to_string()).to_string())?;

    let _ = app.emit("log_output", "正在获取模板...");
    let fetch_result = crate::template_fetcher::fetch_template(&project_path).await;

    match &fetch_result {
        Ok(_) => {
            let _ = app.emit("log_output", "  ✓ 从 npm 获取最新模板成功");
        }
        Err(e) => {
            let _ = app.emit("log_output", &format!("  ⚠ 在线获取失败: {e}"));
            let _ = app.emit("log_output", "  → 使用内嵌模板...");
            let template_dir = get_fallback_template_dir(&app);
            match template_dir {
                Some(dir) => {
                    let _ = fs::remove_dir_all(&project_path);
                    fs::create_dir_all(&project_path)
                        .map_err(|e| AppError::FileSystemError(e.to_string()).to_string())?;
                    copy_dir_recursive(&dir, &project_path)
                        .map_err(|e| AppError::FileSystemError(e.to_string()).to_string())?;
                    let _ = app.emit("log_output", "  ✓ 内嵌模板已复制");
                }
                None => {
                    let _ = fs::remove_dir_all(&project_path);
                    return Err("无法获取模板：在线下载失败且无内嵌模板".to_string());
                }
            }
        }
    }

    let gitignore_src = project_path.join("_gitignore");
    if gitignore_src.exists() {
        let _ = fs::rename(&gitignore_src, project_path.join(".gitignore"));
    }

    let config_path = project_path.join("config.json");
    if config_path.exists() {
        let template_str = fs::read_to_string(&config_path).unwrap_or_default();
        let injected = inject_config_values(&template_str, &config);
        let _ = fs::write(&config_path, injected + "\n");
    }
    let _ = app.emit("log_output", "  ✓ config.json");

    let album_config_path = project_path.join("album.config.json");
    if album_config_path.exists() {
        let template_str = fs::read_to_string(&album_config_path).unwrap_or_default();
        let injected = inject_album_config_schema(&template_str);
        let _ = fs::write(&album_config_path, injected + "\n");
    }
    let _ = app.emit("log_output", "  ✓ album.config.json");

    let package_json = generate_package_json(&config);
    fs::write(
        project_path.join("package.json"),
        serde_json::to_string_pretty(&package_json).unwrap() + "\n",
    )
    .map_err(|e| AppError::FileSystemError(e.to_string()).to_string())?;
    let _ = app.emit("log_output", "  ✓ package.json");
    let _ = app.emit("log_output", "");
    let _ = app.emit("log_output", "✓ 博客项目初始化完成");

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
    let (frontmatter, _body) = split_frontmatter(content);
    let title = extract_fm_str(&frontmatter, "title").unwrap_or_else(|| filename.replace(".md", ""));
    let date = extract_fm_str(&frontmatter, "date").unwrap_or_default();
    let tags = extract_fm_list(&frontmatter, "tags");
    let categories = extract_fm_list(&frontmatter, "categories");
    let preview = extract_fm_str(&frontmatter, "preview").unwrap_or_default();
    PostSummary { filename, title, date, tags, categories, preview }
}

fn parse_post_detail(filename: &str, raw: &str) -> PostDetail {
    let (frontmatter, body) = split_frontmatter(raw);
    let title = extract_fm_str(&frontmatter, "title").unwrap_or_else(|| filename.replace(".md", ""));
    let date = extract_fm_str(&frontmatter, "date").unwrap_or_default();
    let tags = extract_fm_list(&frontmatter, "tags");
    let categories = extract_fm_list(&frontmatter, "categories");
    let preview = extract_fm_str(&frontmatter, "preview").unwrap_or_default();
    PostDetail { filename: filename.to_string(), title, date, tags, categories, preview, content: body, raw: raw.to_string() }
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

fn get_fallback_template_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    if let Ok(res) = app.path().resource_dir() {
        let p = res.join("resources").join("template");
        if p.exists() {
            return Some(p);
        }
    }
    let p = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("template");
    if p.exists() {
        return Some(p);
    }
    None
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dest_path)?;
        } else {
            fs::copy(&src_path, &dest_path)?;
        }
    }
    Ok(())
}

fn inject_config_values(template: &str, config: &BlogConfig) -> String {
    let mut obj: serde_json::Value = serde_json::from_str(template).unwrap_or_default();
    let map = obj.as_object_mut().unwrap();
    map.remove("__SCHEMA__");
    map.remove("__SITEURL__");
    map.remove("__AUTHOR__");
    map.insert("$schema".into(), "https://unpkg.com/@s-blog/core/schemas/config.schema.json".into());
    map.insert("title".into(), config.project_name.clone().into());
    map.insert("description".into(), config.description.clone().into());
    if let Some(ref url) = config.site_url {
        if !url.is_empty() {
            map.insert("siteUrl".into(), url.clone().into());
        }
    }
    if !config.author.is_empty() {
        map.insert("author".into(), config.author.clone().into());
    }
    if !config.timezone.is_empty() {
        map.insert("timezone".into(), config.timezone.clone().into());
    }
    serde_json::to_string_pretty(&obj).unwrap()
}

fn inject_album_config_schema(template: &str) -> String {
    let mut obj: serde_json::Value = serde_json::from_str(template).unwrap_or_default();
    let map = obj.as_object_mut().unwrap();
    map.remove("__SCHEMA__");
    map.insert("$schema".into(), "https://unpkg.com/@s-blog/core/schemas/album.config.schema.json".into());
    serde_json::to_string_pretty(&obj).unwrap()
}

fn generate_package_json(config: &BlogConfig) -> serde_json::Value {
    serde_json::json!({
        "name": config.project_name,
        "private": true,
        "version": "0.0.0",
        "type": "module",
        "description": config.description,
        "author": config.author,
        "scripts": {
            "dev": "s-blog serve",
            "build": "s-blog build"
        },
        "dependencies": {
            "@s-blog/core": "^0.3.7",
            "@s-blog/engine": "^0.3.11"
        }
    })
}

fn read_flat_dir(path: &Path) -> Result<FileNode, String> {
    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let mut children = Vec::new();
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let ep = entry.path();
        let fname = ep.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        if fname.starts_with('.') { continue; }
        if ep.is_file() {
            children.push(FileNode { name: fname, path: ep.display().to_string(), is_directory: false, children: None });
        }
    }
    children.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(FileNode { name, path: path.display().to_string(), is_directory: true, children: Some(children) })
}

fn read_albums_dir(path: &Path) -> Result<FileNode, String> {
    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let mut children = Vec::new();
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let ep = entry.path();
        let fname = ep.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        if fname.starts_with('.') || fname == "thumbs" { continue; }
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
    Ok(FileNode { name, path: path.display().to_string(), is_directory: true, children: Some(children) })
}
