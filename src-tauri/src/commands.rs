use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use jsonc_parser::cst::{CstInputValue, CstRootNode};
use jsonc_parser::ParseOptions;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::error::AppError;
use crate::models::*;
use crate::state::AppState;

const SPAGE_POST_LANGUAGES: [&str; 3] = ["en", "zh-CN", "ja"];

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
    let Some(posts_dir) = existing_posts_dir(Path::new(&blog_dir))? else {
        return Ok(vec![]);
    };
    let timezone = read_blog_timezone(Path::new(&blog_dir));
    let mut posts = Vec::new();
    let entries = fs::read_dir(&posts_dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取文章目录失败: {e}"))?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|e| format!("读取文章类型失败: {e}"))?;
        if file_type.is_file() && path.extension().map(|e| e == "md").unwrap_or(false) {
            let filename = entry
                .file_name()
                .into_string()
                .map_err(|_| "文章文件名必须是有效的 Unicode".to_string())?;
            let (_, language) = spage_engine::posts::parse_post_filename(&filename);
            if language.is_some() {
                continue;
            }
            if let Ok(content) = read_post_file(&path) {
                if let Ok(summary) = parse_post_summary(&path, &content, timezone.as_deref()) {
                    posts.push(summary);
                }
            }
        }
    }
    posts.sort_by(|a, b| b.date.cmp(&a.date));
    Ok(posts)
}

#[tauri::command]
pub async fn get_post(blog_dir: String, filename: String) -> Result<PostDetail, String> {
    validate_post_filename(&filename)?;
    let posts_dir = require_existing_posts_dir(Path::new(&blog_dir))?;
    let path = safe_existing_post_path(&posts_dir, &filename)?;
    require_default_post_for_localization(&posts_dir, &filename)?;
    let raw = read_post_file(&path)?;
    let timezone = read_blog_timezone(Path::new(&blog_dir));
    parse_post_detail(&filename, &raw, timezone.as_deref())
}

#[tauri::command]
pub async fn save_post(blog_dir: String, filename: String, content: String) -> Result<(), String> {
    validate_post_filename(&filename)?;
    let posts_dir = require_existing_posts_dir(Path::new(&blog_dir))?;
    let path = safe_existing_post_path(&posts_dir, &filename)?;
    require_default_post_for_localization(&posts_dir, &filename)?;
    write_existing_post(&path, content.as_bytes())
}

#[tauri::command]
pub async fn list_post_versions(
    blog_dir: String,
    filename: String,
) -> Result<PostVersions, String> {
    validate_post_filename(&filename)?;
    let posts_dir = require_existing_posts_dir(Path::new(&blog_dir))?;
    safe_existing_post_path(&posts_dir, &filename)?;
    let (target_slug, _) = spage_engine::posts::parse_post_filename(&filename);
    safe_existing_post_path(&posts_dir, &default_post_filename(&target_slug))?;
    let default_language = read_blog_language(Path::new(&blog_dir));
    let mut versions = Vec::new();
    let mut languages = HashSet::new();

    for entry in fs::read_dir(&posts_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| format!("读取文章目录失败: {e}"))?;
        let file_type = entry
            .file_type()
            .map_err(|e| format!("读取文章类型失败: {e}"))?;
        let path = entry.path();
        if !file_type.is_file() || path.extension().and_then(|value| value.to_str()) != Some("md") {
            continue;
        }
        let candidate = entry
            .file_name()
            .into_string()
            .map_err(|_| "文章文件名必须是有效的 Unicode".to_string())?;
        let (slug, language) = spage_engine::posts::parse_post_filename(&candidate);
        if slug != target_slug {
            continue;
        }
        let language = language.map(|code| normalize_post_language(&code));
        if let Some(code) = &language {
            if code.eq_ignore_ascii_case(&default_language) {
                return Err(format!("{code} 是网站默认语言，不能同时作为本地化版本"));
            }
            if !languages.insert(code.to_ascii_lowercase()) {
                return Err(format!("文章存在重复的语言版本: {code}"));
            }
        }
        versions.push(PostVersion {
            filename: candidate,
            language,
        });
    }

    versions.sort_by(|a, b| match (&a.language, &b.language) {
        (None, None) => std::cmp::Ordering::Equal,
        (None, Some(_)) => std::cmp::Ordering::Less,
        (Some(_), None) => std::cmp::Ordering::Greater,
        (Some(a), Some(b)) => a.cmp(b),
    });

    Ok(PostVersions {
        default_language,
        versions,
    })
}

#[tauri::command]
pub async fn delete_post(
    blog_dir: String,
    filename: String,
    delete_translations: Option<bool>,
) -> Result<(), String> {
    validate_post_filename(&filename)?;
    let posts_dir = require_existing_posts_dir(Path::new(&blog_dir))?;
    let exact_path = safe_existing_post_path(&posts_dir, &filename)?;
    let (target_slug, language) = spage_engine::posts::parse_post_filename(&filename);

    if language.is_some() || !delete_translations.unwrap_or(false) {
        return stage_and_delete_posts(&posts_dir, &[exact_path]);
    }

    let mut targets = Vec::new();
    for entry in fs::read_dir(&posts_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| format!("读取文章目录失败: {e}"))?;
        let file_type = entry
            .file_type()
            .map_err(|e| format!("读取文章类型失败: {e}"))?;
        if entry.path().extension().and_then(|value| value.to_str()) != Some("md") {
            continue;
        }
        let candidate = entry
            .file_name()
            .into_string()
            .map_err(|_| "文章文件名必须是有效的 Unicode".to_string())?;
        let (slug, candidate_language) = spage_engine::posts::parse_post_filename(&candidate);
        if slug == target_slug && candidate_language.is_some() {
            if file_type.is_symlink() || !file_type.is_file() {
                return Err(format!("语言版本不是普通文件，已取消删除: {candidate}"));
            }
            targets.push(entry.path());
        }
    }
    targets.sort();
    // Move the default file last so an interrupted operation leaves the article discoverable.
    targets.push(exact_path);
    stage_and_delete_posts(&posts_dir, &targets)
}

#[tauri::command]
pub async fn create_post(
    blog_dir: String,
    filename: String,
    content: String,
) -> Result<(), String> {
    validate_post_filename(&filename)?;
    let posts_dir = ensure_posts_dir(Path::new(&blog_dir))?;
    let (requested_slug, requested_language) = spage_engine::posts::parse_post_filename(&filename);
    if let Some(requested_language) = requested_language {
        safe_existing_post_path(&posts_dir, &default_post_filename(&requested_slug)).map_err(
            |_| {
                format!(
                    "文件名 {filename} 看起来像语言版本，但默认文章 {} 不存在",
                    default_post_filename(&requested_slug)
                )
            },
        )?;
        let normalized_language = normalize_post_language(&requested_language);
        if normalized_language != requested_language {
            return Err(format!(
                "语言代码应写为 {normalized_language}，而不是 {requested_language}"
            ));
        }
        if requested_language.eq_ignore_ascii_case(&read_blog_language(Path::new(&blog_dir))) {
            return Err(format!(
                "{requested_language} 是网站默认语言，无需创建重复版本"
            ));
        }
        if !SPAGE_POST_LANGUAGES
            .iter()
            .any(|language| language.eq_ignore_ascii_case(&requested_language))
        {
            return Err(format!(
                "Spage 当前只支持 en、zh-CN 和 ja，不能创建 {requested_language} 翻译"
            ));
        }
        for entry in fs::read_dir(&posts_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| format!("读取文章目录失败: {e}"))?;
            if entry.path().extension().and_then(|value| value.to_str()) != Some("md")
                || !entry
                    .file_type()
                    .map_err(|e| format!("读取文章类型失败: {e}"))?
                    .is_file()
            {
                continue;
            }
            let candidate = entry
                .file_name()
                .into_string()
                .map_err(|_| "文章文件名必须是有效的 Unicode".to_string())?;
            let (slug, language) = spage_engine::posts::parse_post_filename(&candidate);
            if language
                .as_deref()
                .is_some_and(|language| language.eq_ignore_ascii_case(&requested_language))
                && slug == requested_slug
            {
                return Err(format!("{requested_language} 语言版本已经存在"));
            }
        }
    }
    let path = posts_dir.join(&filename);
    create_post_file(&path, content.as_bytes()).map_err(|error| {
        if error.kind() == std::io::ErrorKind::AlreadyExists {
            format!("文件已存在: {filename}")
        } else {
            error.to_string()
        }
    })
}

// ── 相册相关 ──────────────────────────────────────────────

#[tauri::command]
pub async fn list_albums(blog_dir: String) -> Result<Vec<AlbumInfo>, String> {
    let blog_dir = Path::new(&blog_dir);
    let albums_dir = blog_dir.join("albums");
    if !albums_dir.is_dir() {
        return Ok(vec![]);
    }
    let config = read_album_config(blog_dir)?;

    let mut albums = Vec::new();
    let entries = fs::read_dir(&albums_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let dir = entry.file_name().to_string_lossy().to_string();
        if !spage_engine::albums::is_valid_dirname(&dir) || dir == "thumbs" {
            continue;
        }

        let photos = list_album_photos(&path)?;
        let configured = find_album_entry(&config, &dir);
        let name = configured
            .and_then(|album| album.get("name"))
            .and_then(|value| value.as_str())
            .map(str::to_string);
        let desc = configured
            .and_then(|album| album.get("desc"))
            .and_then(|value| value.as_str())
            .map(str::to_string);
        let configured_cover = configured
            .and_then(|album| album.get("cover"))
            .and_then(|value| value.as_str())
            .filter(|cover| photos.iter().any(|photo| photo.filename == *cover))
            .map(str::to_string);
        let cover = configured_cover
            .clone()
            .or_else(|| photos.first().map(|photo| photo.filename.clone()));

        albums.push(AlbumInfo {
            dir,
            name,
            desc,
            cover,
            configured_cover,
            photo_count: photos.len(),
            photos,
        });
    }
    albums.sort_by(|a, b| a.dir.to_lowercase().cmp(&b.dir.to_lowercase()));
    Ok(albums)
}

#[tauri::command]
pub async fn create_album(
    blog_dir: String,
    dir: String,
    name: Option<String>,
    desc: Option<String>,
) -> Result<(), String> {
    validate_album_dir(&dir)?;
    let blog_dir = Path::new(&blog_dir);
    let album_dir = blog_dir.join("albums").join(&dir);
    if album_dir.exists() {
        return Err(format!("相册目录已存在: {dir}"));
    }

    let mut config = read_album_config(blog_dir)?;
    if find_album_entry(&config, &dir).is_some() {
        return Err(format!("相册配置已存在: {dir}"));
    }

    fs::create_dir_all(&album_dir).map_err(|e| format!("创建相册失败: {e}"))?;
    upsert_album_entry(&mut config, &dir, name, desc, None)?;
    if let Err(error) = write_album_config(blog_dir, &config) {
        let _ = fs::remove_dir(&album_dir);
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
pub async fn update_album(
    blog_dir: String,
    dir: String,
    name: Option<String>,
    desc: Option<String>,
    cover: Option<String>,
) -> Result<(), String> {
    validate_album_dir(&dir)?;
    let blog_dir = Path::new(&blog_dir);
    let album_dir = blog_dir.join("albums").join(&dir);
    if !album_dir.is_dir() {
        return Err(format!("相册不存在: {dir}"));
    }
    if let Some(filename) = cover.as_deref() {
        validate_photo_filename(filename)?;
        if !album_dir.join(filename).is_file() {
            return Err(format!("封面照片不存在: {filename}"));
        }
    }

    let mut config = read_album_config(blog_dir)?;
    upsert_album_entry(&mut config, &dir, name, desc, cover)?;
    write_album_config(blog_dir, &config)
}

#[tauri::command]
pub async fn select_album_photos(app: AppHandle) -> Result<Vec<String>, String> {
    let files = app
        .dialog()
        .file()
        .set_title("添加照片")
        .add_filter("照片", &["jpg", "jpeg", "png", "webp", "avif"])
        .blocking_pick_files()
        .unwrap_or_default();
    Ok(files.into_iter().map(|path| path.to_string()).collect())
}

#[tauri::command]
pub async fn add_album_photos(
    blog_dir: String,
    dir: String,
    sources: Vec<String>,
) -> Result<usize, String> {
    validate_album_dir(&dir)?;
    let album_dir = Path::new(&blog_dir).join("albums").join(&dir);
    if !album_dir.is_dir() {
        return Err(format!("相册不存在: {dir}"));
    }

    let mut copies = Vec::new();
    for source in sources {
        let source_path = PathBuf::from(&source);
        if !source_path.is_file() {
            return Err(format!("照片不存在: {source}"));
        }
        let filename = source_path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| format!("无效的照片文件名: {source}"))?
            .to_string();
        validate_photo_filename(&filename)?;
        let destination = album_dir.join(&filename);
        if destination.exists() {
            return Err(format!("相册中已存在同名照片: {filename}"));
        }
        if copies
            .iter()
            .any(|(_, existing): &(PathBuf, String)| existing == &filename)
        {
            return Err(format!("选择了多个同名照片: {filename}"));
        }
        copies.push((source_path, filename));
    }

    stage_and_commit_photos(&album_dir, &copies)?;
    Ok(copies.len())
}

#[tauri::command]
pub async fn delete_album_photo(
    blog_dir: String,
    dir: String,
    filename: String,
) -> Result<(), String> {
    validate_album_dir(&dir)?;
    validate_photo_filename(&filename)?;
    let blog_dir = Path::new(&blog_dir);
    let album_dir = blog_dir.join("albums").join(&dir);
    let photo_path = album_dir.join(&filename);
    if !photo_path.is_file() {
        return Err(format!("照片不存在: {filename}"));
    }

    let mut config = read_album_config(blog_dir)?;
    let clears_cover = find_album_entry(&config, &dir)
        .and_then(|album| album.get("cover"))
        .and_then(|cover| cover.as_str())
        == Some(filename.as_str());
    if clears_cover {
        if let Some(album) = find_album_entry_mut(&mut config, &dir) {
            album.remove("cover");
        }
    }

    let trashed_path = unique_temp_path(&album_dir, "deleted-photo");
    fs::rename(&photo_path, &trashed_path).map_err(|e| format!("暂存待删除照片失败: {e}"))?;
    if clears_cover {
        if let Err(error) = write_album_config(blog_dir, &config) {
            let _ = fs::rename(&trashed_path, &photo_path);
            return Err(error);
        }
    }
    let _ = fs::remove_file(&trashed_path);
    Ok(())
}

#[tauri::command]
pub async fn delete_album(blog_dir: String, dir: String) -> Result<(), String> {
    validate_album_dir(&dir)?;
    let blog_dir = Path::new(&blog_dir);
    let album_dir = blog_dir.join("albums").join(&dir);
    if !album_dir.is_dir() {
        return Err(format!("相册不存在: {dir}"));
    }
    let mut config = read_album_config(blog_dir)?;
    if let Some(albums) = config
        .get_mut("albums")
        .and_then(|value| value.as_array_mut())
    {
        albums.retain(|album| album.get("dir").and_then(|value| value.as_str()) != Some(&dir));
    }

    let albums_dir = album_dir
        .parent()
        .ok_or_else(|| "无法确定相册目录".to_string())?;
    let trashed_dir = unique_temp_path(albums_dir, "deleted-album");
    fs::rename(&album_dir, &trashed_dir).map_err(|e| format!("暂存待删除相册失败: {e}"))?;
    if let Err(error) = write_album_config(blog_dir, &config) {
        let _ = fs::rename(&trashed_dir, &album_dir);
        return Err(error);
    }
    let _ = fs::remove_dir_all(&trashed_dir);
    Ok(())
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
    atomic_write(&path, content.as_bytes()).map_err(|e| e.to_string())
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

fn parse_post_summary(
    path: &Path,
    content: &str,
    timezone: Option<&str>,
) -> Result<PostSummary, String> {
    let filename = path.file_name().unwrap().to_string_lossy().to_string();
    let metadata = spage_engine::parse_post_metadata(&filename, content, timezone)
        .map_err(|error| error.to_string())?;

    Ok(PostSummary {
        filename,
        title: metadata.title,
        date: metadata.date,
        tags: metadata.tags,
        categories: metadata.categories,
        preview: metadata.summary,
    })
}

fn parse_post_detail(
    filename: &str,
    raw: &str,
    timezone: Option<&str>,
) -> Result<PostDetail, String> {
    let metadata = spage_engine::parse_post_metadata(filename, raw, timezone)
        .map_err(|error| error.to_string())?;
    let (_, body) = spage_engine::frontmatter::parse_frontmatter(raw, filename)
        .map_err(|error| error.to_string())?;

    Ok(PostDetail {
        filename: filename.to_string(),
        title: metadata.title,
        date: metadata.date,
        tags: metadata.tags,
        categories: metadata.categories,
        preview: metadata.summary,
        content: body.to_string(),
        raw: raw.to_string(),
    })
}

fn read_blog_timezone(blog_dir: &Path) -> Option<String> {
    let config = blog_dir.join("config.json");
    let raw = fs::read_to_string(config).ok()?;
    serde_json::from_reader::<_, serde_json::Value>(json_comments::StripComments::new(
        raw.as_bytes(),
    ))
    .ok()?
    .get("timezone")
    .and_then(|value| value.as_str())
    .map(str::to_string)
}

fn read_blog_language(blog_dir: &Path) -> String {
    let config = blog_dir.join("config.json");
    fs::read_to_string(config)
        .ok()
        .and_then(|raw| {
            serde_json::from_reader::<_, serde_json::Value>(json_comments::StripComments::new(
                raw.as_bytes(),
            ))
            .ok()
        })
        .and_then(|value| {
            value
                .get("language")
                .and_then(|language| language.as_str())
                .map(str::trim)
                .filter(|language| is_valid_post_language(language))
                .map(normalize_post_language)
        })
        .unwrap_or_else(|| "en".to_string())
}

fn validate_post_filename(filename: &str) -> Result<(), String> {
    let path = Path::new(filename);
    let direct_filename = path.file_name().and_then(|value| value.to_str()) == Some(filename);
    let valid_extension = path.extension().and_then(|value| value.to_str()) == Some("md");
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let valid_characters = !filename
        .chars()
        .any(|character| character.is_control() || r#"<>:\"/\\|?*"#.contains(character));
    let valid_stem = !stem.is_empty()
        && filename.trim() == filename
        && stem.trim() == stem
        && !stem.starts_with('.')
        && !stem.ends_with('.')
        && !is_windows_device_name(stem);

    if !direct_filename || !valid_extension || !valid_characters || !valid_stem {
        return Err("文章文件名无效".into());
    }
    Ok(())
}

fn is_windows_device_name(stem: &str) -> bool {
    let basename = stem.split('.').next().unwrap_or_default();
    let uppercase = basename.to_ascii_uppercase();
    matches!(uppercase.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || uppercase.strip_prefix("COM").is_some_and(|suffix| {
            matches!(suffix, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9")
        })
        || uppercase.strip_prefix("LPT").is_some_and(|suffix| {
            matches!(suffix, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9")
        })
}

fn existing_posts_dir(blog_dir: &Path) -> Result<Option<PathBuf>, String> {
    let blog_metadata = match fs::symlink_metadata(blog_dir) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("读取博客目录失败: {error}")),
    };
    if blog_metadata.file_type().is_symlink() {
        return Err("博客目录不能是符号链接".into());
    }
    if !blog_metadata.is_dir() {
        return Err("博客目录无效".into());
    }
    let canonical_blog_dir = blog_dir
        .canonicalize()
        .map_err(|e| format!("解析博客目录失败: {e}"))?;
    let posts_dir = canonical_blog_dir.join("posts");
    match fs::symlink_metadata(&posts_dir) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err("文章目录不能是符号链接".into()),
        Ok(metadata) if !metadata.is_dir() => Err("posts 不是有效的文章目录".into()),
        Ok(_) => {
            let canonical_posts_dir = posts_dir
                .canonicalize()
                .map_err(|e| format!("解析文章目录失败: {e}"))?;
            if canonical_posts_dir.parent() != Some(canonical_blog_dir.as_path()) {
                return Err("文章目录超出博客目录".into());
            }
            Ok(Some(canonical_posts_dir))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("读取文章目录失败: {error}")),
    }
}

fn require_existing_posts_dir(blog_dir: &Path) -> Result<PathBuf, String> {
    existing_posts_dir(blog_dir)?.ok_or_else(|| "文章目录不存在".into())
}

fn ensure_posts_dir(blog_dir: &Path) -> Result<PathBuf, String> {
    if let Some(posts_dir) = existing_posts_dir(blog_dir)? {
        return Ok(posts_dir);
    }
    let canonical_blog_dir = blog_dir
        .canonicalize()
        .map_err(|e| format!("博客目录不存在或无效: {e}"))?;
    fs::create_dir(canonical_blog_dir.join("posts"))
        .map_err(|e| format!("创建文章目录失败: {e}"))?;
    require_existing_posts_dir(blog_dir)
}

fn safe_existing_post_path(posts_dir: &Path, filename: &str) -> Result<PathBuf, String> {
    let path = posts_dir.join(filename);
    let metadata = fs::symlink_metadata(&path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            format!("文件不存在: {filename}")
        } else {
            format!("读取文章文件失败: {error}")
        }
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!("文章文件无效: {filename}"));
    }
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("解析文章路径失败: {e}"))?;
    if canonical.parent() != Some(posts_dir) {
        return Err("文章路径超出 posts 目录".into());
    }
    Ok(canonical)
}

#[cfg(unix)]
fn read_post_file(path: &Path) -> Result<String, String> {
    use std::os::unix::fs::OpenOptionsExt;
    let mut content = String::new();
    OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)
        .and_then(|mut file| file.read_to_string(&mut content))
        .map_err(|e| format!("读取文章失败: {e}"))?;
    Ok(content)
}

#[cfg(not(unix))]
fn read_post_file(path: &Path) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| format!("读取文章失败: {e}"))
}

#[cfg(unix)]
fn open_existing_post_for_write(path: &Path) -> std::io::Result<File> {
    use std::os::unix::fs::OpenOptionsExt;
    OpenOptions::new()
        .write(true)
        .truncate(true)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)
}

#[cfg(not(unix))]
fn open_existing_post_for_write(path: &Path) -> std::io::Result<File> {
    OpenOptions::new().write(true).truncate(true).open(path)
}

fn write_existing_post(path: &Path, content: &[u8]) -> Result<(), String> {
    open_existing_post_for_write(path)
        .and_then(|mut file| file.write_all(content))
        .map_err(|e| format!("保存文章失败: {e}"))
}

#[cfg(unix)]
fn create_post_file(path: &Path, content: &[u8]) -> std::io::Result<()> {
    use std::os::unix::fs::OpenOptionsExt;
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .custom_flags(libc::O_NOFOLLOW)
        .open(path)?
        .write_all(content)
}

#[cfg(not(unix))]
fn create_post_file(path: &Path, content: &[u8]) -> std::io::Result<()> {
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?
        .write_all(content)
}

fn normalize_post_language(language: &str) -> String {
    language
        .split('-')
        .enumerate()
        .map(|(index, part)| {
            if index == 0 {
                part.to_ascii_lowercase()
            } else if part.len() == 2 {
                part.to_ascii_uppercase()
            } else if part.len() == 4 {
                let mut chars = part.chars();
                chars
                    .next()
                    .map(|first| {
                        format!(
                            "{}{}",
                            first.to_ascii_uppercase(),
                            chars.as_str().to_ascii_lowercase()
                        )
                    })
                    .unwrap_or_default()
            } else {
                part.to_ascii_lowercase()
            }
        })
        .collect::<Vec<_>>()
        .join("-")
}

fn is_valid_post_language(language: &str) -> bool {
    let parts: Vec<_> = language.split('-').collect();
    let Some(primary) = parts.first() else {
        return false;
    };
    (2..=3).contains(&primary.len())
        && primary
            .chars()
            .all(|character| character.is_ascii_alphabetic())
        && parts.len() <= 3
        && parts.iter().skip(1).all(|part| {
            (2..=8).contains(&part.len())
                && part
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric())
        })
}

fn default_post_filename(slug: &str) -> String {
    format!("{slug}.md")
}

fn require_default_post_for_localization(posts_dir: &Path, filename: &str) -> Result<(), String> {
    let (slug, language) = spage_engine::posts::parse_post_filename(filename);
    if language.is_none() {
        return Ok(());
    }
    let default_filename = default_post_filename(&slug);
    safe_existing_post_path(posts_dir, &default_filename)
        .map(|_| ())
        .map_err(|_| {
            format!("文件名 {filename} 看起来像语言版本，但默认文章 {default_filename} 不存在")
        })
}

fn stage_and_delete_posts(posts_dir: &Path, targets: &[PathBuf]) -> Result<(), String> {
    stage_and_delete_posts_with(posts_dir, targets, |from, to| fs::rename(from, to))
}

fn stage_and_delete_posts_with<F>(
    posts_dir: &Path,
    targets: &[PathBuf],
    mut rename: F,
) -> Result<(), String>
where
    F: FnMut(&Path, &Path) -> std::io::Result<()>,
{
    let mut target_names = HashSet::new();
    for source in targets {
        if source.parent() != Some(posts_dir) {
            return Err(format!("文章路径超出 posts 目录: {}", source.display()));
        }
        let filename = source
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "文章文件名必须是有效的 Unicode".to_string())?;
        validate_post_filename(filename)?;
        if !target_names.insert(filename.to_string()) {
            return Err(format!("删除目标重复: {filename}"));
        }
        let metadata = fs::symlink_metadata(source).map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                format!("文件不存在: {filename}")
            } else {
                format!("读取文章文件失败: {error}")
            }
        })?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(format!("文章文件无效: {filename}"));
        }
        let canonical = source
            .canonicalize()
            .map_err(|e| format!("解析文章路径失败: {e}"))?;
        if canonical.parent() != Some(posts_dir) {
            return Err(format!("文章路径超出 posts 目录: {filename}"));
        }
    }

    let staging_dir = unique_temp_path(posts_dir, "deleted-posts");
    fs::create_dir(&staging_dir).map_err(|e| format!("创建文章回收目录失败: {e}"))?;

    let mut staged: Vec<std::ffi::OsString> = Vec::new();
    for source in targets {
        let filename = source
            .file_name()
            .ok_or_else(|| "文章文件名无效".to_string())?
            .to_owned();
        let destination = staging_dir.join(&filename);
        if let Err(error) = rename(source, &destination) {
            let mut rollback_failures = Vec::new();
            for staged_name in staged.iter().rev() {
                if let Err(rollback_error) =
                    rename(&staging_dir.join(staged_name), &posts_dir.join(staged_name))
                {
                    rollback_failures.push(format!(
                        "{}: {rollback_error}",
                        staged_name.to_string_lossy()
                    ));
                }
            }
            if rollback_failures.is_empty() {
                let _ = fs::remove_dir(&staging_dir);
                return Err(format!(
                    "删除文章 {} 失败: {error}",
                    filename.to_string_lossy()
                ));
            }
            return Err(format!(
                "删除文章 {} 失败: {error}；部分文件回滚失败（{}），请检查 {}",
                filename.to_string_lossy(),
                rollback_failures.join("；"),
                staging_dir.display()
            ));
        }
        staged.push(filename);
    }

    fs::remove_dir_all(&staging_dir).map_err(|e| {
        format!(
            "文章已移入回收目录，但清理 {} 失败: {e}",
            staging_dir.display()
        )
    })
}

fn read_album_config(blog_dir: &Path) -> Result<serde_json::Value, String> {
    let path = blog_dir.join("album.config.json");
    if !path.is_file() {
        return Ok(serde_json::json!({ "enabled": false, "albums": [] }));
    }

    let raw = fs::read_to_string(&path).map_err(|e| format!("读取相册配置失败: {e}"))?;
    let mut stripped = String::new();
    json_comments::StripComments::new(raw.as_bytes())
        .read_to_string(&mut stripped)
        .map_err(|e| format!("解析相册配置失败: {e}"))?;
    let mut config: serde_json::Value =
        serde_json::from_str(&stripped).map_err(|e| format!("解析相册配置失败: {e}"))?;
    if !config.is_object() {
        return Err("相册配置必须是 JSON 对象".into());
    }
    if config.get("albums").is_none() {
        config["albums"] = serde_json::Value::Array(Vec::new());
    } else if !config["albums"].is_array() {
        return Err("相册配置的 albums 必须是数组".into());
    }
    Ok(config)
}

fn write_album_config(blog_dir: &Path, config: &serde_json::Value) -> Result<(), String> {
    let path = blog_dir.join("album.config.json");
    let content = if path.is_file() {
        let raw = fs::read_to_string(&path).map_err(|e| format!("读取相册配置失败: {e}"))?;
        update_album_config_jsonc(&raw, config)?
    } else {
        format!(
            "{}\n",
            serde_json::to_string_pretty(config).map_err(|e| format!("序列化相册配置失败: {e}"))?
        )
    };
    atomic_write(&path, content.as_bytes()).map_err(|e| format!("保存相册配置失败: {e}"))
}

fn update_album_config_jsonc(raw: &str, config: &serde_json::Value) -> Result<String, String> {
    let root = CstRootNode::parse(raw, &ParseOptions::default())
        .map_err(|e| format!("解析相册配置失败: {e}"))?;
    let object = root
        .object_value()
        .ok_or_else(|| "相册配置必须是 JSON 对象".to_string())?;
    let desired_albums = config
        .get("albums")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "相册配置的 albums 必须是数组".to_string())?;
    let Some(albums_property) = object.get("albums") else {
        object.append(
            "albums",
            serde_value_to_cst(&serde_json::Value::Array(desired_albums.clone()))?,
        );
        return finish_jsonc_update(raw, root);
    };
    let Some(albums_array) = albums_property.array_value() else {
        albums_property.set_value(serde_value_to_cst(&serde_json::Value::Array(
            desired_albums.clone(),
        ))?);
        return finish_jsonc_update(raw, root);
    };

    let mut retained_dirs = HashSet::new();
    for element in albums_array.elements() {
        let Some(existing) = element.to_serde_value() else {
            continue;
        };
        let Some(dir) = existing.get("dir").and_then(serde_json::Value::as_str) else {
            continue;
        };
        let Some(desired) = desired_albums
            .iter()
            .find(|album| album.get("dir").and_then(serde_json::Value::as_str) == Some(dir))
        else {
            element.remove();
            continue;
        };
        retained_dirs.insert(dir.to_string());
        if let (Some(existing_object), Some(desired_object)) =
            (element.as_object(), desired.as_object())
        {
            for field in ["name", "desc", "cover"] {
                match (existing_object.get(field), desired_object.get(field)) {
                    (Some(property), Some(value)) => property.set_value(serde_value_to_cst(value)?),
                    (Some(property), None) => property.remove(),
                    (None, Some(value)) => {
                        existing_object.append(field, serde_value_to_cst(value)?);
                    }
                    (None, None) => {}
                }
            }
        }
    }
    for album in desired_albums {
        let Some(dir) = album.get("dir").and_then(serde_json::Value::as_str) else {
            continue;
        };
        if !retained_dirs.contains(dir) {
            albums_array.append(serde_value_to_cst(album)?);
        }
    }
    albums_array.ensure_multiline();
    finish_jsonc_update(raw, root)
}

fn finish_jsonc_update(raw: &str, root: CstRootNode) -> Result<String, String> {
    let mut content = root.to_string();
    if raw.ends_with('\n') && !content.ends_with('\n') {
        content.push('\n');
    }
    Ok(content)
}

fn serde_value_to_cst(value: &serde_json::Value) -> Result<CstInputValue, String> {
    match value {
        serde_json::Value::Null => Ok(CstInputValue::Null),
        serde_json::Value::Bool(value) => Ok((*value).into()),
        serde_json::Value::Number(value) => Ok(CstInputValue::Number(value.to_string())),
        serde_json::Value::String(value) => Ok(value.clone().into()),
        serde_json::Value::Array(values) => values
            .iter()
            .map(serde_value_to_cst)
            .collect::<Result<Vec<_>, _>>()
            .map(CstInputValue::Array),
        serde_json::Value::Object(values) => values
            .iter()
            .map(|(key, value)| Ok((key.clone(), serde_value_to_cst(value)?)))
            .collect::<Result<Vec<_>, String>>()
            .map(CstInputValue::Object),
    }
}

fn atomic_write(path: &Path, content: &[u8]) -> std::io::Result<()> {
    let parent = path.parent().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "目标文件没有父目录")
    })?;
    let temp_path = unique_temp_path(parent, "config");
    fs::write(&temp_path, content)?;
    if let Err(error) = replace_file(&temp_path, path) {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }
    Ok(())
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        ReplaceFileW, REPLACEFILE_IGNORE_MERGE_ERRORS, REPLACE_FILE_FLAGS,
    };

    if !destination.exists() {
        return fs::rename(source, destination);
    }
    let source_wide: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination_wide: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let result = unsafe {
        ReplaceFileW(
            destination_wide.as_ptr(),
            source_wide.as_ptr(),
            std::ptr::null(),
            REPLACEFILE_IGNORE_MERGE_ERRORS as REPLACE_FILE_FLAGS,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if result == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

fn stage_and_commit_photos(album_dir: &Path, copies: &[(PathBuf, String)]) -> Result<(), String> {
    let staging_dir = unique_temp_path(
        album_dir
            .parent()
            .ok_or_else(|| "无法确定相册目录".to_string())?,
        "add-photos",
    );
    fs::create_dir(&staging_dir).map_err(|e| format!("创建照片暂存目录失败: {e}"))?;

    for (source, filename) in copies {
        if let Err(error) = fs::copy(source, staging_dir.join(filename)) {
            let _ = fs::remove_dir_all(&staging_dir);
            return Err(format!("复制照片 {filename} 失败: {error}"));
        }
    }

    let mut committed = Vec::new();
    for (_, filename) in copies {
        let staged = staging_dir.join(filename);
        let destination = album_dir.join(filename);
        if let Err(error) = fs::rename(&staged, &destination) {
            let mut rollback_failures = Vec::new();
            for committed_name in committed.iter().rev() {
                if let Err(rollback_error) = fs::rename(
                    album_dir.join(committed_name),
                    staging_dir.join(committed_name),
                ) {
                    rollback_failures.push(format!("{committed_name}: {rollback_error}"));
                }
            }
            if rollback_failures.is_empty() {
                let _ = fs::remove_dir_all(&staging_dir);
                return Err(format!("添加照片 {filename} 失败: {error}"));
            }
            return Err(format!(
                "添加照片 {filename} 失败: {error}；部分照片回滚失败（{}）。已保留暂存目录 {}，请检查后再重试",
                rollback_failures.join("；"),
                staging_dir.display()
            ));
        }
        committed.push(filename.clone());
    }
    let _ = fs::remove_dir(&staging_dir);
    Ok(())
}

fn unique_temp_path(parent: &Path, purpose: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    parent.join(format!(".swritor-{purpose}-{}-{nonce}", std::process::id()))
}

#[cfg(test)]
mod post_command_tests {
    use super::*;

    #[test]
    fn rejects_post_paths_and_non_markdown_files() {
        assert!(validate_post_filename("article.md").is_ok());
        assert!(validate_post_filename("article.zh-CN.md").is_ok());
        assert!(validate_post_filename("../article.md").is_err());
        assert!(validate_post_filename("article.txt").is_err());
        assert!(validate_post_filename(".md").is_err());
        assert!(validate_post_filename("article.md:stream.md").is_err());
        assert!(validate_post_filename(" article.md").is_err());
        assert!(validate_post_filename("article .md").is_err());
        assert!(validate_post_filename("article?.md").is_err());
        assert!(validate_post_filename("NUL.md").is_err());
        assert!(validate_post_filename("COM1.notes.md").is_err());
    }

    #[tokio::test]
    async fn deleting_a_default_post_removes_only_its_markdown_versions() {
        let temp = tempfile::tempdir().unwrap();
        let posts = temp.path().join("posts");
        fs::create_dir(&posts).unwrap();
        for filename in [
            "article.md",
            "article.ja.md",
            "article.zh-CN.md",
            "article.txt",
            "other.md",
        ] {
            fs::write(posts.join(filename), "content").unwrap();
        }

        delete_post(
            temp.path().to_string_lossy().into_owned(),
            "article.md".into(),
            Some(true),
        )
        .await
        .unwrap();

        assert!(!posts.join("article.md").exists());
        assert!(!posts.join("article.ja.md").exists());
        assert!(!posts.join("article.zh-CN.md").exists());
        assert!(posts.join("article.txt").exists());
        assert!(posts.join("other.md").exists());
    }

    #[tokio::test]
    async fn deleting_one_post_requires_an_exact_existing_target() {
        let temp = tempfile::tempdir().unwrap();
        let posts = temp.path().join("posts");
        fs::create_dir(&posts).unwrap();
        fs::write(posts.join("article.ja.md"), "content").unwrap();

        let result = delete_post(
            temp.path().to_string_lossy().into_owned(),
            "article.md".into(),
            Some(true),
        )
        .await;

        assert!(result.is_err());
        assert!(posts.join("article.ja.md").exists());
    }

    #[tokio::test]
    async fn exact_delete_does_not_infer_translation_membership() {
        let temp = tempfile::tempdir().unwrap();
        let posts = temp.path().join("posts");
        fs::create_dir(&posts).unwrap();
        fs::write(posts.join("guide.md"), "content").unwrap();
        fs::write(posts.join("guide.api.md"), "content").unwrap();

        delete_post(
            temp.path().to_string_lossy().into_owned(),
            "guide.md".into(),
            Some(false),
        )
        .await
        .unwrap();

        assert!(!posts.join("guide.md").exists());
        assert!(posts.join("guide.api.md").exists());
    }

    #[tokio::test]
    async fn lists_versions_with_the_configured_default_language() {
        let temp = tempfile::tempdir().unwrap();
        let posts = temp.path().join("posts");
        fs::create_dir(&posts).unwrap();
        fs::write(
            temp.path().join("config.json"),
            "{\n  // Default language\n  \"language\": \"  ZH-cn  \"\n}",
        )
        .unwrap();
        fs::write(posts.join("article.md"), "content").unwrap();
        fs::write(posts.join("article.ja.md"), "content").unwrap();
        fs::write(posts.join("other.en.md"), "content").unwrap();

        let result = list_post_versions(
            temp.path().to_string_lossy().into_owned(),
            "article.md".into(),
        )
        .await
        .unwrap();

        assert_eq!(result.default_language, "zh-CN");
        assert_eq!(result.versions.len(), 2);
        assert_eq!(result.versions[0].filename, "article.md");
        assert_eq!(result.versions[1].language.as_deref(), Some("ja"));
    }

    #[tokio::test]
    async fn rejects_duplicate_language_versions_case_insensitively() {
        let temp = tempfile::tempdir().unwrap();
        let posts = temp.path().join("posts");
        fs::create_dir(&posts).unwrap();
        fs::write(temp.path().join("config.json"), r#"{"language":"en"}"#).unwrap();
        fs::write(posts.join("article.md"), "content").unwrap();
        fs::write(posts.join("article.zh-CN.md"), "content").unwrap();

        let result = create_post(
            temp.path().to_string_lossy().into_owned(),
            "article.zh-cn.md".into(),
            "duplicate".into(),
        )
        .await;

        assert!(result.is_err());
        let filenames: Vec<_> = fs::read_dir(&posts)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().into_string().unwrap())
            .collect();
        assert_eq!(
            filenames
                .iter()
                .filter(|filename| filename.eq_ignore_ascii_case("article.zh-cn.md"))
                .count(),
            1
        );
        assert_eq!(
            fs::read_to_string(posts.join("article.zh-CN.md")).unwrap(),
            "content"
        );
    }

    #[tokio::test]
    async fn rejects_translations_the_spage_frontend_cannot_select() {
        let temp = tempfile::tempdir().unwrap();
        let posts = temp.path().join("posts");
        fs::create_dir(&posts).unwrap();
        fs::write(temp.path().join("config.json"), r#"{"language":"en"}"#).unwrap();
        fs::write(posts.join("article.md"), "default").unwrap();

        let result = create_post(
            temp.path().to_string_lossy().into_owned(),
            "article.fr.md".into(),
            "translation".into(),
        )
        .await;

        assert!(result.is_err());
        assert!(!posts.join("article.fr.md").exists());
    }

    #[tokio::test]
    async fn ignores_non_markdown_sidecars_when_creating_a_language_version() {
        let temp = tempfile::tempdir().unwrap();
        let posts = temp.path().join("posts");
        fs::create_dir(&posts).unwrap();
        fs::write(temp.path().join("config.json"), r#"{"language":"en"}"#).unwrap();
        fs::write(posts.join("article.md"), "default").unwrap();
        fs::write(posts.join("article.ja"), "sidecar").unwrap();

        create_post(
            temp.path().to_string_lossy().into_owned(),
            "article.ja.md".into(),
            "translation".into(),
        )
        .await
        .unwrap();

        assert_eq!(
            fs::read_to_string(posts.join("article.ja")).unwrap(),
            "sidecar"
        );
        assert_eq!(
            fs::read_to_string(posts.join("article.ja.md")).unwrap(),
            "translation"
        );
    }

    #[tokio::test]
    async fn rejects_ambiguous_localization_without_a_default_post() {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir(temp.path().join("posts")).unwrap();

        let result = create_post(
            temp.path().to_string_lossy().into_owned(),
            "guide.api.md".into(),
            "content".into(),
        )
        .await;

        assert!(result.is_err());
        assert!(!temp.path().join("posts/guide.api.md").exists());
    }

    #[test]
    fn rolls_back_all_posts_when_a_later_move_fails() {
        let temp = tempfile::tempdir().unwrap();
        let posts = temp.path().join("posts");
        fs::create_dir(&posts).unwrap();
        let first = posts.join("article.ja.md");
        let second = posts.join("article.md");
        fs::write(&first, "ja").unwrap();
        fs::write(&second, "default").unwrap();

        let mut forward_moves = 0;
        let result =
            stage_and_delete_posts_with(&posts, &[first.clone(), second.clone()], |from, to| {
                if from.parent() == Some(posts.as_path()) {
                    forward_moves += 1;
                    if forward_moves == 2 {
                        return Err(std::io::Error::new(
                            std::io::ErrorKind::Other,
                            "injected move failure",
                        ));
                    }
                }
                fs::rename(from, to)
            });

        assert!(result.is_err());
        assert_eq!(fs::read_to_string(first).unwrap(), "ja");
        assert_eq!(fs::read_to_string(second).unwrap(), "default");
        assert!(fs::read_dir(&posts).unwrap().all(|entry| !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".swritor-deleted-posts-")));
    }

    #[test]
    fn validates_every_delete_target_before_moving_anything() {
        let temp = tempfile::tempdir().unwrap();
        let posts = temp.path().join("posts");
        fs::create_dir(&posts).unwrap();
        let existing = posts.join("article.ja.md");
        let missing = posts.join("article.md");
        fs::write(&existing, "ja").unwrap();

        let result = stage_and_delete_posts(&posts, &[existing.clone(), missing]);

        assert!(result.is_err());
        assert_eq!(fs::read_to_string(existing).unwrap(), "ja");
        assert!(fs::read_dir(&posts).unwrap().all(|entry| !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".swritor-deleted-posts-")));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn rejects_symlinked_post_files_and_directories() {
        use std::os::unix::fs::symlink;

        let temp = tempfile::tempdir().unwrap();
        let external = temp.path().join("external");
        fs::create_dir(&external).unwrap();
        fs::write(external.join("article.md"), "outside").unwrap();

        let linked_file_blog = temp.path().join("linked-file-blog");
        let linked_file_posts = linked_file_blog.join("posts");
        fs::create_dir_all(&linked_file_posts).unwrap();
        symlink(
            external.join("article.md"),
            linked_file_posts.join("article.md"),
        )
        .unwrap();
        assert!(get_post(
            linked_file_blog.to_string_lossy().into_owned(),
            "article.md".into()
        )
        .await
        .is_err());
        assert!(save_post(
            linked_file_blog.to_string_lossy().into_owned(),
            "article.md".into(),
            "changed".into(),
        )
        .await
        .is_err());
        assert!(create_post(
            linked_file_blog.to_string_lossy().into_owned(),
            "article.md".into(),
            "changed".into(),
        )
        .await
        .is_err());
        assert!(delete_post(
            linked_file_blog.to_string_lossy().into_owned(),
            "article.md".into(),
            Some(false),
        )
        .await
        .is_err());

        let linked_dir_blog = temp.path().join("linked-dir-blog");
        fs::create_dir(&linked_dir_blog).unwrap();
        symlink(&external, linked_dir_blog.join("posts")).unwrap();
        assert!(delete_post(
            linked_dir_blog.to_string_lossy().into_owned(),
            "article.md".into(),
            Some(true),
        )
        .await
        .is_err());
        assert_eq!(
            fs::read_to_string(external.join("article.md")).unwrap(),
            "outside"
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn bulk_delete_rejects_a_matching_translation_symlink_before_deleting_anything() {
        use std::os::unix::fs::symlink;

        let temp = tempfile::tempdir().unwrap();
        let posts = temp.path().join("posts");
        fs::create_dir(&posts).unwrap();
        fs::write(posts.join("article.md"), "default").unwrap();
        fs::write(posts.join("article.fr.md"), "fr").unwrap();
        let external = temp.path().join("external-ja.md");
        fs::write(&external, "outside").unwrap();
        symlink(&external, posts.join("article.ja.md")).unwrap();

        let result = delete_post(
            temp.path().to_string_lossy().into_owned(),
            "article.md".into(),
            Some(true),
        )
        .await;

        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(posts.join("article.md")).unwrap(),
            "default"
        );
        assert_eq!(
            fs::read_to_string(posts.join("article.fr.md")).unwrap(),
            "fr"
        );
        assert!(fs::symlink_metadata(posts.join("article.ja.md"))
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(fs::read_to_string(external).unwrap(), "outside");
    }
}

#[cfg(test)]
mod album_config_tests {
    use super::*;

    #[test]
    fn leaves_album_unchanged_when_staging_copy_fails() {
        let temp = tempfile::tempdir().unwrap();
        let album_dir = temp.path().join("album");
        fs::create_dir(&album_dir).unwrap();
        let first_source = temp.path().join("first.jpg");
        fs::write(&first_source, b"first").unwrap();
        let missing_source = temp.path().join("missing.jpg");
        let copies = vec![
            (first_source, "first.jpg".to_string()),
            (missing_source, "missing.jpg".to_string()),
        ];

        let result = stage_and_commit_photos(&album_dir, &copies);

        assert!(result.is_err());
        assert!(fs::read_dir(&album_dir).unwrap().next().is_none());
    }

    #[test]
    fn preserves_jsonc_comments_when_updating_albums() {
        let raw = r#"{
  // keep top-level guidance
  "enabled": true,
  "albums": [
    {
      // keep album guidance
      "dir": "travel",
      "name": "Old"
    }
  ]
}
"#;
        let config = serde_json::json!({
            "enabled": true,
            "albums": [{ "dir": "travel", "name": "New", "cover": "cover.jpg" }]
        });

        let updated = update_album_config_jsonc(raw, &config).unwrap();

        assert!(updated.contains("// keep top-level guidance"));
        assert!(updated.contains("// keep album guidance"));
        assert!(updated.contains(r#""name": "New""#));
        assert!(updated.contains(r#""cover": "cover.jpg""#));
    }

    #[test]
    fn removes_only_the_deleted_album_entry() {
        let raw = r#"{
  // keep top-level guidance
  "albums": [
    { "dir": "keep" },
    // deleted album note
    { "dir": "remove" }
  ]
}
"#;
        let config = serde_json::json!({ "albums": [{ "dir": "keep" }] });

        let updated = update_album_config_jsonc(raw, &config).unwrap();

        assert!(updated.contains("// keep top-level guidance"));
        assert!(!updated.contains(r#""dir": "remove""#));
        assert!(updated.contains(r#""dir": "keep""#));
    }
}

fn find_album_entry<'a>(
    config: &'a serde_json::Value,
    dir: &str,
) -> Option<&'a serde_json::Map<String, serde_json::Value>> {
    config
        .get("albums")?
        .as_array()?
        .iter()
        .find(|album| album.get("dir").and_then(|value| value.as_str()) == Some(dir))?
        .as_object()
}

fn find_album_entry_mut<'a>(
    config: &'a mut serde_json::Value,
    dir: &str,
) -> Option<&'a mut serde_json::Map<String, serde_json::Value>> {
    config
        .get_mut("albums")?
        .as_array_mut()?
        .iter_mut()
        .find(|album| album.get("dir").and_then(|value| value.as_str()) == Some(dir))?
        .as_object_mut()
}

fn upsert_album_entry(
    config: &mut serde_json::Value,
    dir: &str,
    name: Option<String>,
    desc: Option<String>,
    cover: Option<String>,
) -> Result<(), String> {
    let albums = config["albums"]
        .as_array_mut()
        .ok_or_else(|| "相册配置的 albums 必须是数组".to_string())?;
    let index = albums
        .iter()
        .position(|album| album.get("dir").and_then(|value| value.as_str()) == Some(dir));
    let index = match index {
        Some(index) => index,
        None => {
            albums.push(serde_json::json!({ "dir": dir }));
            albums.len() - 1
        }
    };
    let album = albums[index]
        .as_object_mut()
        .ok_or_else(|| format!("相册配置项 {dir} 必须是对象"))?;
    set_optional_album_field(album, "name", name);
    set_optional_album_field(album, "desc", desc);
    set_optional_album_field(album, "cover", cover);
    Ok(())
}

fn set_optional_album_field(
    album: &mut serde_json::Map<String, serde_json::Value>,
    field: &str,
    value: Option<String>,
) {
    match value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        Some(value) => {
            album.insert(field.to_string(), serde_json::Value::String(value));
        }
        None => {
            album.remove(field);
        }
    }
}

fn validate_album_dir(dir: &str) -> Result<(), String> {
    if dir == "thumbs" || !spage_engine::albums::is_valid_dirname(dir) {
        return Err("目录名只能包含字母、数字、下划线或连字符，且不能以点开头".into());
    }
    Ok(())
}

fn validate_photo_filename(filename: &str) -> Result<(), String> {
    let path = Path::new(filename);
    if path.file_name().and_then(|name| name.to_str()) != Some(filename)
        || !spage_engine::image_proc::is_photo_file(filename)
    {
        return Err(format!("不支持的照片文件: {filename}"));
    }
    Ok(())
}

fn list_album_photos(path: &Path) -> Result<Vec<AlbumPhoto>, String> {
    let entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    let mut photos: Vec<_> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_file())
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .filter(|filename| spage_engine::image_proc::is_photo_file(filename))
        .map(|filename| AlbumPhoto { filename })
        .collect();
    photos.sort_by(|a, b| a.filename.to_lowercase().cmp(&b.filename.to_lowercase()));
    Ok(photos)
}

fn count_photos(path: &Path) -> usize {
    list_album_photos(path)
        .map(|photos| photos.len())
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
    *state.serve_blog_dir.lock().unwrap() = None;

    let shell_dir = crate::shell_fetcher::ensure_shell_cache(&app).await?;

    let config = spage_engine::serve::ServeConfig {
        work_dir: blog_dir.clone().into(),
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
    *state.serve_blog_dir.lock().unwrap() = Some(blog_dir);

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
    *state.serve_blog_dir.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub async fn get_serve_status(state: State<'_, AppState>) -> Result<Option<ServeStatus>, String> {
    let guard = state.serve_handle.lock().unwrap();
    let Some(handle) = guard.as_ref() else {
        return Ok(None);
    };
    let blog_dir = state
        .serve_blog_dir
        .lock()
        .unwrap()
        .clone()
        .unwrap_or_default();
    Ok(Some(ServeStatus {
        addr: format!("http://127.0.0.1:{}", handle.address().port()),
        blog_dir,
    }))
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
pub async fn open_album_path(
    app: AppHandle,
    blog_dir: String,
    dir: String,
    filename: Option<String>,
) -> Result<(), String> {
    validate_album_dir(&dir)?;
    let mut path = PathBuf::from(blog_dir).join("albums").join(dir);
    if let Some(filename) = filename {
        validate_photo_filename(&filename)?;
        path.push(filename);
    }
    if !path.exists() {
        return Err(format!("路径不存在: {}", path.display()));
    }

    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|e| format!("无法打开路径: {e}"))?;
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
