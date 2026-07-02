// Swritor - 文件树展示组件

import React, { useEffect, useCallback, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { LogPanel } from '../common';
import { handleTauriError } from '../../utils/error';
import type { FileNode, LogEntry } from '../../types';

export interface FileTreeViewProps {
  /** 要读取的目录路径 */
  directoryPath: string;
  /** 日志面板高度 */
  logPanelHeight?: number | string;
}

/**
 * 将 FileNode 树转换为日志条目
 * 需求 6.3: 清晰显示文件和文件夹的层级关系
 */
function fileNodeToLogEntries(
  node: FileNode,
  depth: number = 0,
  isLast: boolean = true,
  prefix: string = ''
): LogEntry[] {
  const entries: LogEntry[] = [];
  const timestamp = Date.now();

  // 构建树形结构的前缀
  const connector = depth === 0 ? '' : isLast ? '└── ' : '├── ';
  const icon = node.isDirectory ? '📁' : '📄';
  const name = node.isDirectory ? `${node.name}/` : node.name;

  entries.push({
    timestamp,
    level: 'info',
    message: `${prefix}${connector}${icon} ${name}`,
  });

  // 递归处理子节点
  if (node.children && node.children.length > 0) {
    const childPrefix = prefix + (depth === 0 ? '' : isLast ? '    ' : '│   ');
    node.children.forEach((child, index) => {
      const isChildLast = index === node.children!.length - 1;
      entries.push(
        ...fileNodeToLogEntries(child, depth + 1, isChildLast, childPrefix)
      );
    });
  }

  return entries;
}

/**
 * 文件树展示组件
 *
 * 需求 6.1: 读取目录内的文件结构
 * 需求 6.2: 以日志形式展示目录的文件树结构
 * 需求 6.3: 清晰显示文件和文件夹的层级关系
 * 需求 6.4: 读取失败时显示错误信息
 */
export const FileTreeView: React.FC<FileTreeViewProps> = ({
  directoryPath,
  logPanelHeight = 400,
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const lastPathRef = useRef<string | null>(null);

  /**
   * 清空日志
   */
  const handleClearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  /**
   * 读取目录结构并转换为日志
   */
  const fetchFileTree = useCallback(async () => {
    if (!directoryPath || loading) return;

    setLoading(true);

    // 添加开始读取的日志
    setLogs([
      {
        timestamp: Date.now(),
        level: 'info',
        message: `正在读取目录结构: ${directoryPath}`,
      },
    ]);

    try {
      const result = await invoke<FileNode>('read_directory_tree', { path: directoryPath });

      if (result) {
        // 成功读取，转换为日志条目
        const treeEntries = fileNodeToLogEntries(result);
        setLogs((prev) => [
          ...prev,
          {
            timestamp: Date.now(),
            level: 'info',
            message: '─'.repeat(40),
          },
          ...treeEntries,
          {
            timestamp: Date.now(),
            level: 'info',
            message: '─'.repeat(40),
          },
          {
            timestamp: Date.now(),
            level: 'info',
            message: `✓ 目录结构读取完成`,
          },
        ]);
      }
    } catch (err) {
      const appError = handleTauriError(err);
      setLogs((prev) => [
        ...prev,
        {
          timestamp: Date.now(),
          level: 'error',
          message: `读取目录结构失败: ${appError.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [directoryPath, loading]);

  // 当目录路径变化时自动读取（只在路径真正变化时）
  useEffect(() => {
    if (directoryPath && directoryPath !== lastPathRef.current) {
      lastPathRef.current = directoryPath;
      fetchFileTree();
    }
  }, [directoryPath]); // 故意不包含 fetchFileTree 以避免循环

  return (
    <div className="space-y-4">
      {/* 状态指示 */}
      {loading && (
        <div className="flex items-center gap-2 text-blue-600">
          <svg
            className="w-5 h-5 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="text-sm">正在读取目录结构...</span>
        </div>
      )}

      {/* 日志面板 - 需求 6.2 */}
      <LogPanel
        logs={logs}
        title="文件结构"
        height={logPanelHeight}
        onClear={handleClearLogs}
        autoScroll={true}
      />

      {/* 刷新按钮 */}
      <div className="flex justify-end">
        <button
          onClick={fetchFileTree}
          disabled={loading}
          className="
            px-3 py-1.5 text-sm
            text-gray-600 hover:text-gray-800
            bg-gray-100 hover:bg-gray-200
            border border-gray-300
            rounded-md
            transition-colors duration-200
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          <span className="flex items-center gap-1">
            <svg
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            刷新
          </span>
        </button>
      </div>
    </div>
  );
};

export default FileTreeView;
