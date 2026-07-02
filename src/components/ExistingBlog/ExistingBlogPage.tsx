// Swritor - 选择现有博客页面

import React, { useState, useCallback } from 'react';
import { Button } from '../common';
import { DirectorySelect } from './DirectorySelect';
import { FileTreeView } from './FileTreeView';

export interface ExistingBlogPageProps {
  /** 返回主页回调 */
  onBackToHome: () => void;
  /** 初始目录路径（可选，用于从初始化页面跳转时自动加载） */
  initialDirectory?: string;
}

/**
 * 选择现有博客页面
 *
 * 组合 DirectorySelect 和 FileTreeView 组件
 * 需求 5.1, 5.2, 5.3: 目录选择功能
 * 需求 6.1, 6.2, 6.3, 6.4: 文件结构展示功能
 * 需求 7.3: 响应式设计
 * 需求 7.4: LogPanel 位于可见区域
 */
export const ExistingBlogPage: React.FC<ExistingBlogPageProps> = ({
  onBackToHome,
  initialDirectory,
}) => {
  console.log('[ExistingBlogPage] mounted with initialDirectory:', initialDirectory);
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(initialDirectory || null);
  console.log('[ExistingBlogPage] selectedDirectory state:', selectedDirectory);

  /**
   * 处理目录选择变更
   */
  const handleDirectoryChange = useCallback((directory: string | null) => {
    setSelectedDirectory(directory);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-2 sm:p-4 lg:p-6">
      <div className="max-w-4xl mx-auto">
        {/* 返回按钮 */}
        <div className="mb-3 sm:mb-4">
          <Button variant="secondary" size="sm" onClick={onBackToHome}>
            <svg
              className="w-4 h-4 mr-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            <span className="hidden sm:inline">返回主页</span>
            <span className="sm:hidden">返回</span>
          </Button>
        </div>

        {/* 主内容区域 */}
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6">
            选择现有博客
          </h1>

          {/* 目录选择组件 - 需求 5.1, 5.2, 5.3 */}
          <div className="mb-4 sm:mb-6">
            <DirectorySelect
              selectedDirectory={selectedDirectory}
              onDirectoryChange={handleDirectoryChange}
            />
          </div>

          {/* 文件树展示 - 需求 6.1, 6.2, 6.3, 6.4, 7.4 */}
          {selectedDirectory && (
            <div className="border-t border-gray-200 pt-4 sm:pt-6">
              <h2 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">
                目录结构
              </h2>
              <FileTreeView
                directoryPath={selectedDirectory}
                logPanelHeight={350}
              />
            </div>
          )}

          {/* 未选择目录时的提示 */}
          {!selectedDirectory && (
            <div className="text-center py-6 sm:py-8 text-gray-500">
              <svg
                className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
              <p className="text-sm sm:text-base">请选择一个博客目录以查看文件结构</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExistingBlogPage;
