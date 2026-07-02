// Swritor - 目录选择组件（选择现有博客）

import React, { useCallback } from 'react';
import { Button } from '../common';
import { useTauriCommand } from '../../hooks/useTauriCommand';
import { isCancelledError } from '../../utils/error';

export interface DirectorySelectProps {
  /** 已选择的目录路径 */
  selectedDirectory: string | null;
  /** 目录选择变更回调 */
  onDirectoryChange: (directory: string | null) => void;
  /** 是否正在加载（外部控制） */
  externalLoading?: boolean;
}

/**
 * 目录选择组件
 *
 * 需求 5.1: 点击"选择目录"按钮打开系统原生目录选择对话框
 * 需求 5.2: 显示所选目录的完整路径
 * 需求 5.3: 取消选择时保持当前状态不变
 */
export const DirectorySelect: React.FC<DirectorySelectProps> = ({
  selectedDirectory,
  onDirectoryChange,
  externalLoading = false,
}) => {
  // 使用 Tauri 命令调用 Hook
  const {
    loading,
    error,
    execute: selectDirectory,
  } = useTauriCommand<string | null>('select_directory');

  const isLoading = loading || externalLoading;

  /**
   * 处理选择目录按钮点击
   * 需求 5.1: 打开系统原生目录选择对话框
   */
  const handleSelectDirectory = useCallback(async () => {
    const result = await selectDirectory();

    // 需求 5.3: 用户取消选择时，保持当前状态不变
    if (error && isCancelledError(error)) {
      // 静默处理取消操作
      return;
    }

    // 如果返回 null（用户取消），保持当前状态
    if (result === null) {
      return;
    }

    // 需求 5.2: 通知父组件目录已选择
    onDirectoryChange(result);
  }, [selectDirectory, error, onDirectoryChange]);

  /**
   * 处理清除已选目录
   */
  const handleClearDirectory = useCallback(() => {
    onDirectoryChange(null);
  }, [onDirectoryChange]);

  return (
    <div className="space-y-4">
      {/* 选择目录按钮 */}
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          onClick={handleSelectDirectory}
          loading={isLoading}
          disabled={isLoading}
        >
          <svg
            className="w-5 h-5 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
          {isLoading ? '正在打开...' : '选择目录'}
        </Button>
      </div>

      {/* 已选择的目录显示 - 需求 5.2 */}
      {selectedDirectory && (
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-500 mb-1">已选择的目录：</p>
              <p className="text-gray-800 font-mono text-sm break-all">
                {selectedDirectory}
              </p>
            </div>
            <button
              onClick={handleClearDirectory}
              className="ml-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="清除选择"
              disabled={isLoading}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* 错误提示（非取消错误） */}
      {error && !isCancelledError(error) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-600 text-sm">{error.message}</p>
        </div>
      )}
    </div>
  );
};

export default DirectorySelect;
