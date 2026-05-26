use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("目录不存在: {0}")]
    DirectoryNotFound(String),

    #[error("目录已存在同名项目: {0}")]
    DirectoryAlreadyExists(String),

    #[error("文件系统错误: {0}")]
    FileSystemError(String),

    #[error("引擎错误: {0}")]
    EngineError(String),

    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
