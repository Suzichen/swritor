use std::fs;
use std::path::Path;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::error::AppError;
use crate::models::{BlogConfig, FileNode, InitResult};

/// 选择目录
#[tauri::command]
pub async fn select_directory(app: AppHandle) -> Result<Option<String>, String> {
    let folder = app
        .dialog()
        .file()
        .set_title("选择目录")
        .blocking_pick_folder();

    Ok(folder.map(|p| p.to_string()))
}

/// 检查目录是否存在
#[tauri::command]
pub async fn check_directory_exists(path: String) -> Result<bool, String> {
    let p = Path::new(&path);
    Ok(p.exists() && p.is_dir())
}

/// 在文件管理器中打开目录
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

/// 初始化博客项目（纯 Rust 实现，不依赖 Bun/Node）
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

    // 创建项目目录
    fs::create_dir_all(&project_path)
        .map_err(|e| AppError::FileSystemError(e.to_string()).to_string())?;

    let _ = app.emit("log_output", "正在获取模板...");

    // 尝试从 npm registry 在线拉取模板
    let fetch_result = crate::template_fetcher::fetch_template(&project_path).await;

    match &fetch_result {
        Ok(_) => {
            let _ = app.emit("log_output", "  ✓ 从 npm 获取最新模板成功");
        }
        Err(e) => {
            let _ = app.emit("log_output", &format!("  ⚠ 在线获取失败: {e}"));
            let _ = app.emit("log_output", "  → 使用内嵌模板...");

            // Fallback: 从本地 resources 复制
            let template_dir = get_fallback_template_dir(&app);
            match template_dir {
                Some(dir) => {
                    // 清空已创建的目录重新来
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

    // 重命名 _gitignore -> .gitignore
    let gitignore_src = project_path.join("_gitignore");
    if gitignore_src.exists() {
        let _ = fs::rename(&gitignore_src, project_path.join(".gitignore"));
    }

    // 注入 config.json
    let config_path = project_path.join("config.json");
    if config_path.exists() {
        let template_str = fs::read_to_string(&config_path).unwrap_or_default();
        let injected = inject_config_values(&template_str, &config);
        let _ = fs::write(&config_path, injected + "\n");
    }
    let _ = app.emit("log_output", "  ✓ config.json");

    // 注入 album.config.json schema
    let album_config_path = project_path.join("album.config.json");
    if album_config_path.exists() {
        let template_str = fs::read_to_string(&album_config_path).unwrap_or_default();
        let injected = inject_album_config_schema(&template_str);
        let _ = fs::write(&album_config_path, injected + "\n");
    }
    let _ = app.emit("log_output", "  ✓ album.config.json");

    // 生成 package.json
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

/// 读取博客项目结构（关键目录）
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

    // posts/
    let posts_path = root.join("posts");
    if posts_path.is_dir() {
        children.push(read_flat_dir(&posts_path)?);
    }

    // albums/
    let albums_path = root.join("albums");
    if albums_path.is_dir() {
        children.push(read_albums_dir(&albums_path)?);
    }

    // config.json
    let config_path = root.join("config.json");
    if config_path.is_file() {
        children.push(FileNode {
            name: "config.json".into(),
            path: config_path.display().to_string(),
            is_directory: false,
            children: None,
        });
    }

    // album.config.json
    let album_cfg = root.join("album.config.json");
    if album_cfg.is_file() {
        children.push(FileNode {
            name: "album.config.json".into(),
            path: album_cfg.display().to_string(),
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

/// Fallback 模板目录：先查 resource_dir，再查 CARGO_MANIFEST_DIR
fn get_fallback_template_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    // Production: resource_dir/resources/template
    if let Ok(res) = app.path().resource_dir() {
        let p = res.join("resources").join("template");
        if p.exists() {
            return Some(p);
        }
    }
    // Dev: src-tauri/resources/template
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

    // Remove placeholders
    map.remove("__SCHEMA__");
    map.remove("__SITEURL__");
    map.remove("__AUTHOR__");

    // Inject schema
    map.insert(
        "$schema".into(),
        "https://unpkg.com/@s-blog/core/schemas/config.schema.json".into(),
    );

    // Set user values
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
    map.insert(
        "$schema".into(),
        "https://unpkg.com/@s-blog/core/schemas/album.config.schema.json".into(),
    );
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
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut children = Vec::new();
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let ep = entry.path();
        let fname = ep.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
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
        let fname = ep.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
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


