// S-Blog Admin - TypeScript 类型定义
// 需求: 3.2

/** 博客配置 */
export interface BlogConfig {
  /** 目标目录 */
  targetDir: string;
  /** 项目名称 */
  projectName: string;
  /** 项目描述 */
  description: string;
  /** 作者 */
  author: string;
  /** 站点 URL（可选，用于 SEO） */
  siteUrl?: string;
  /** 时区（IANA 时区标识符） */
  timezone: string;
}

/** 初始化结果 */
export interface InitResult {
  /** 是否成功 */
  success: boolean;
  /** 项目路径 (Rust 返回 snake_case) */
  project_path: string;
  /** 消息 */
  message: string;
}

/** 文件节点（用于文件树展示） */
export interface FileNode {
  /** 文件/目录名称 */
  name: string;
  /** 完整路径 */
  path: string;
  /** 是否为目录 */
  isDirectory: boolean;
  /** 子节点（仅目录有） */
  children?: FileNode[];
}

/** 日志级别 */
export type LogLevel = 'info' | 'warn' | 'error';

/** 日志条目 */
export interface LogEntry {
  /** 时间戳（毫秒） */
  timestamp: number;
  /** 日志级别 */
  level: LogLevel;
  /** 日志消息 */
  message: string;
}
