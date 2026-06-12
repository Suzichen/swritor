use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct BlogConfig {
    pub target_dir: String,
    pub project_name: String,
    pub description: String,
    pub author: String,
    pub site_url: Option<String>,
    pub timezone: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InitResult {
    pub success: bool,
    pub project_path: String,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

/// 文章摘要（列表用）
#[derive(Debug, Serialize, Deserialize)]
pub struct PostSummary {
    pub filename: String,
    pub title: String,
    pub date: String,
    pub tags: Vec<String>,
    pub categories: Vec<String>,
    pub preview: String,
}

/// 文章完整内容（编辑用）
#[derive(Debug, Serialize, Deserialize)]
pub struct PostDetail {
    pub filename: String,
    pub title: String,
    pub date: String,
    pub tags: Vec<String>,
    pub categories: Vec<String>,
    pub preview: String,
    pub content: String,
    pub raw: String,
}

/// 相册信息
#[derive(Debug, Serialize, Deserialize)]
pub struct AlbumInfo {
    pub dir: String,
    pub name: Option<String>,
    pub cover: Option<String>,
    pub photo_count: usize,
}

/// 站点配置（前端读写用）
#[derive(Debug, Serialize, Deserialize)]
pub struct SiteConfig {
    pub raw: String,
}

/// .env 文件中的 S3 密钥
#[derive(Debug, Serialize, Deserialize)]
pub struct EnvData {
    pub s3_access_key: Option<String>,
    pub s3_secret_key: Option<String>,
}
