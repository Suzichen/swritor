// S-Blog Admin - 数据模型定义
// 需求: 3.2

use serde::{Deserialize, Serialize};

/// 博客配置
#[derive(Debug, Serialize, Deserialize)]
pub struct BlogConfig {
    /// 目标目录
    pub target_dir: String,
    /// 项目名称
    pub project_name: String,
    /// 项目描述
    pub description: String,
    /// 作者
    pub author: String,
    /// 站点 URL（可选，用于 SEO）
    pub site_url: Option<String>,
    /// 时区（IANA 时区标识符）
    pub timezone: String,
}

/// 初始化结果
#[derive(Debug, Serialize, Deserialize)]
pub struct InitResult {
    /// 是否成功
    pub success: bool,
    /// 项目路径
    pub project_path: String,
    /// 消息
    pub message: String,
}

/// 文件节点（用于文件树展示）
#[derive(Debug, Serialize, Deserialize)]
pub struct FileNode {
    /// 文件/目录名称
    pub name: String,
    /// 完整路径
    pub path: String,
    /// 是否为目录
    pub is_directory: bool,
    /// 子节点（仅目录有）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}
