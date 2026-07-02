// Swritor - 进度和日志面板组件

import React from 'react';
import { Button } from '../common';
import { LogPanel } from '../common/LogPanel';
import type { LogEntry } from '../../types';

/** 初始化状态 */
export type InitStatus = 'idle' | 'running' | 'success' | 'error';

export interface ProgressPanelProps {
  /** 当前状态 */
  status: InitStatus;
  /** 日志列表 */
  logs: LogEntry[];
  /** 错误消息 */
  errorMessage?: string;
  /** 项目路径（成功时显示） */
  projectPath?: string;
  /** 重试回调 */
  onRetry: () => void;
  /** 返回回调 */
  onBack: () => void;
  /** 打开目录回调 */
  onOpenDirectory: () => void;
  /** 清空日志回调 */
  onClearLogs?: () => void;
}

/**
 * 进度和日志面板组件
 *
 * 需求 4.2: 显示进度指示器和实时日志输出
 * 需求 4.3: 初始化成功完成后显示成功消息
 * 需求 4.5: 初始化过程中发生错误时显示错误信息并允许用户重试
 * 需求 7.3: 响应式设计
 * 需求 7.4: LogPanel 位于可见区域
 */
export const ProgressPanel: React.FC<ProgressPanelProps> = ({
  status,
  logs,
  errorMessage,
  projectPath,
  onRetry,
  onBack,
  onOpenDirectory,
  onClearLogs,
}) => {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-2 sm:p-4 lg:p-6">
      <div className="w-full max-w-xl sm:max-w-2xl">
        {/* 标题区域 */}
        <div className="text-center mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">
            初始化博客
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            第 3 步：执行初始化
          </p>
        </div>

        {/* 主要内容区域 */}
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
          {/* 步骤指示器 */}
          <div className="flex items-center justify-center mb-4 sm:mb-6">
            <div className="flex items-center">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-green-500 text-white rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm">
                ✓
              </div>
              <div className="w-8 sm:w-16 h-1 bg-green-500 mx-1 sm:mx-2" />
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-green-500 text-white rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm">
                ✓
              </div>
              <div className="w-8 sm:w-16 h-1 bg-blue-600 mx-1 sm:mx-2" />
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm">
                3
              </div>
            </div>
          </div>

          {/* 状态显示区域 */}
          <div className="mb-3 sm:mb-4">
            {/* 运行中状态 - 需求 4.2 */}
            {status === 'running' && (
              <div className="flex items-center justify-center py-3 sm:py-4">
                <div className="flex items-center space-x-2 sm:space-x-3">
                  {/* 旋转加载指示器 */}
                  <svg
                    className="animate-spin h-5 w-5 sm:h-6 sm:w-6 text-blue-600"
                    xmlns="http://www.w3.org/2000/svg"
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
                  <span className="text-sm sm:text-base text-blue-600 font-medium">
                    正在初始化博客项目...
                  </span>
                </div>
              </div>
            )}

            {/* 空闲状态 */}
            {status === 'idle' && (
              <div className="flex items-center justify-center py-3 sm:py-4">
                <span className="text-sm sm:text-base text-gray-500">
                  等待开始初始化...
                </span>
              </div>
            )}

            {/* 成功状态 - 需求 4.3 */}
            {status === 'success' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-5 w-5 sm:h-6 sm:w-6 text-green-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div className="ml-2 sm:ml-3 flex-1">
                    <h3 className="text-sm sm:text-base text-green-800 font-medium">
                      博客项目初始化成功！
                    </h3>
                    {projectPath && (
                      <p className="mt-1 text-xs sm:text-sm text-green-700 font-mono break-all">
                        项目路径：{projectPath}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 错误状态 - 需求 4.5 */}
            {status === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-5 w-5 sm:h-6 sm:w-6 text-red-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div className="ml-2 sm:ml-3 flex-1">
                    <h3 className="text-sm sm:text-base text-red-800 font-medium">
                      初始化失败
                    </h3>
                    {errorMessage && (
                      <p className="mt-1 text-xs sm:text-sm text-red-700">
                        {errorMessage}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 日志面板 - 需求 4.2, 7.4: 确保日志面板位于可见区域 */}
          <LogPanel
            logs={logs}
            title="初始化日志"
            autoScroll={true}
            onClear={onClearLogs}
            height={250}
            className="mb-3 sm:mb-4"
          />

          {/* 操作按钮区域 */}
          <div className="flex justify-between pt-3 sm:pt-4 border-t border-gray-200">
            {/* 返回按钮 */}
            <Button
              variant="secondary"
              onClick={onBack}
              disabled={status === 'running'}
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

            {/* 右侧按钮组 */}
            <div className="flex space-x-2 sm:space-x-3">
              {/* 重试按钮 - 需求 4.5 */}
              {status === 'error' && (
                <Button
                  variant="primary"
                  onClick={onRetry}
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
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  重试
                </Button>
              )}

              {/* 打开目录按钮 - 成功时显示 */}
              {status === 'success' && (
                <Button
                  variant="primary"
                  onClick={onOpenDirectory}
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
                      d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span className="hidden sm:inline">浏览项目</span>
                  <span className="sm:hidden">浏览</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* 底部提示 */}
        <p className="text-center text-xs sm:text-sm text-gray-500 mt-3 sm:mt-4">
          {status === 'running' && '请耐心等待，初始化过程可能需要几分钟...'}
          {status === 'success' && '初始化完成，即将自动跳转到项目浏览页面...'}
          {status === 'error' && '您可以点击"重试"重新执行初始化'}
          {status === 'idle' && '准备就绪，等待开始初始化'}
        </p>
      </div>
    </div>
  );
};

export default ProgressPanel;
