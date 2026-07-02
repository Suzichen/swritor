// Swritor - 目录选择步骤组件

import React, { useState, useCallback } from 'react';
import { Button } from '../common';
import { useTauriCommand } from '../../hooks/useTauriCommand';
import { isCancelledError } from '../../utils/error';

export interface DirectoryStepProps {
  /** 已选择的目录路径 */
  selectedDirectory: string | null;
  /** 目录选择变更回调 */
  onDirectoryChange: (directory: string | null) => void;
  /** 下一步回调 */
  onNext: () => void;
  /** 返回回调 */
  onBack: () => void;
}

/**
 * 目录选择步骤组件
 *
 * 需求 2.1: 显示目录选择流程的第一步
 * 需求 2.2: 点击"选择目录"按钮打开系统原生目录选择对话框
 * 需求 2.3: 显示所选目录的完整路径
 * 需求 2.4: 取消选择时保持当前状态不变
 * 需求 7.3: 响应式设计
 */
export const DirectoryStep: React.FC<DirectoryStepProps> = ({
  selectedDirectory,
  onDirectoryChange,
  onNext,
  onBack,
}) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 使用 Tauri 命令调用 Hook
  const {
    loading,
    error,
    execute: selectDirectory,
  } = useTauriCommand<string | null>('select_directory');

  /**
   * 处理选择目录按钮点击
   * 需求 2.2: 打开系统原生目录选择对话框
   */
  const handleSelectDirectory = useCallback(async () => {
    setErrorMessage(null);

    const result = await selectDirectory();

    // 需求 2.4: 用户取消选择时，保持当前状态不变
    if (error && isCancelledError(error)) {
      // 静默处理取消操作
      return;
    }

    // 如果返回 null（用户取消），保持当前状态
    if (result === null) {
      return;
    }

    // 需求 2.3: 显示所选目录的完整路径
    onDirectoryChange(result);
  }, [selectDirectory, error, onDirectoryChange]);

  /**
   * 处理清除已选目录
   */
  const handleClearDirectory = useCallback(() => {
    onDirectoryChange(null);
    setErrorMessage(null);
  }, [onDirectoryChange]);

  /**
   * 处理下一步
   */
  const handleNext = useCallback(() => {
    if (!selectedDirectory) {
      setErrorMessage('请先选择一个目录');
      return;
    }
    onNext();
  }, [selectedDirectory, onNext]);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-2 sm:p-4 lg:p-6">
      <div className="w-full max-w-md sm:max-w-lg">
        {/* 标题区域 */}
        <div className="text-center mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">
            初始化博客
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            第 1 步：选择博客项目的创建位置
          </p>
        </div>

        {/* 主要内容区域 */}
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
          {/* 步骤指示器 */}
          <div className="flex items-center justify-center mb-4 sm:mb-6">
            <div className="flex items-center">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm">
                1
              </div>
              <div className="w-8 sm:w-16 h-1 bg-gray-300 mx-1 sm:mx-2" />
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gray-300 text-gray-500 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm">
                2
              </div>
              <div className="w-8 sm:w-16 h-1 bg-gray-300 mx-1 sm:mx-2" />
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gray-300 text-gray-500 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm">
                3
              </div>
            </div>
          </div>

          {/* 目录选择区域 */}
          <div className="space-y-3 sm:space-y-4">
            <div className="text-center">
              <p className="text-sm sm:text-base text-gray-700 mb-3 sm:mb-4">
                请选择一个目录作为博客项目的创建位置
              </p>

              {/* 选择目录按钮 */}
              <Button
                variant="primary"
                size="lg"
                onClick={handleSelectDirectory}
                loading={loading}
                disabled={loading}
                className="mb-3 sm:mb-4"
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
                {loading ? '正在打开...' : '选择目录'}
              </Button>
            </div>

            {/* 已选择的目录显示 - 需求 2.3 */}
            {selectedDirectory && (
              <div className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm text-gray-500 mb-1">已选择的目录：</p>
                    <p className="text-gray-800 font-mono text-xs sm:text-sm break-all">
                      {selectedDirectory}
                    </p>
                  </div>
                  <button
                    onClick={handleClearDirectory}
                    className="ml-2 text-gray-400 hover:text-gray-600 transition-colors"
                    title="清除选择"
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

            {/* 错误提示 */}
            {(errorMessage || (error && !isCancelledError(error))) && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 sm:p-3">
                <p className="text-red-600 text-xs sm:text-sm">
                  {errorMessage || error?.message}
                </p>
              </div>
            )}
          </div>

          {/* 操作按钮区域 */}
          <div className="flex justify-between mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-gray-200">
            <Button
              variant="secondary"
              onClick={onBack}
            >
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              返回
            </Button>

            {/* 下一步按钮 - 仅在选择目录后启用 */}
            <Button
              variant="primary"
              onClick={handleNext}
              disabled={!selectedDirectory}
            >
              下一步
              <svg
                className="w-4 h-4 ml-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Button>
          </div>
        </div>

        {/* 底部提示 */}
        <p className="text-center text-xs sm:text-sm text-gray-500 mt-3 sm:mt-4">
          博客项目将在所选目录下创建
        </p>
      </div>
    </div>
  );
};

export default DirectoryStep;
