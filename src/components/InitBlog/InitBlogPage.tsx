// S-Blog Admin - 初始化博客完整流程页面
// 需求: 4.1, 4.4, 4.6

import React, { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DirectoryStep } from './DirectoryStep';
import { ConfigForm } from './ConfigForm';
import { ProgressPanel, type InitStatus } from './ProgressPanel';
import { Button } from '../common';
import { useLogStream } from '../../hooks/useLogStream';
import { handleTauriError, ErrorCode, getUserFriendlyMessage } from '../../utils/error';
import type { BlogConfig, InitResult } from '../../types';

/** 初始化步骤 */
type InitStep = 'directory' | 'config' | 'progress';

export interface InitBlogPageProps {
  /** 返回主页回调 */
  onBackToHome: () => void;
  /** 初始化完成回调，传递项目路径 */
  onInitComplete?: (projectPath: string) => void;
}

/**
 * 初始化博客完整流程页面
 *
 * 组合 DirectoryStep、ConfigForm、ProgressPanel 组件
 * 实现步骤流转逻辑
 * 调用 init_blog 命令执行初始化
 * 成功后调用 open_in_explorer 打开目录
 * 处理目录已存在的警告
 */
export const InitBlogPage: React.FC<InitBlogPageProps> = ({ onBackToHome, onInitComplete }) => {
  // 当前步骤
  const [currentStep, setCurrentStep] = useState<InitStep>('directory');

  // 目录选择状态
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null);

  // 配置表单状态
  const [config, setConfig] = useState<BlogConfig | null>(null);
  const [isConfigValid, setIsConfigValid] = useState(false);

  // 初始化状态
  const [initStatus, setInitStatus] = useState<InitStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [projectPath, setProjectPath] = useState<string | undefined>();

  // 目录已存在警告
  const [directoryExistsWarning, setDirectoryExistsWarning] = useState<string | null>(null);

  // 日志流
  const { logs, clearLogs, startListening, stopListening, addLog } = useLogStream({
    autoStart: false,
    maxLogs: 500,
  });

  // 用于防止重复提交
  const isSubmittingRef = useRef(false);

  /**
   * 处理目录变更
   */
  const handleDirectoryChange = useCallback((directory: string | null) => {
    setSelectedDirectory(directory);
    setDirectoryExistsWarning(null);
  }, []);

  /**
   * 处理从目录步骤到配置步骤
   */
  const handleDirectoryNext = useCallback(() => {
    if (selectedDirectory) {
      setCurrentStep('config');
    }
  }, [selectedDirectory]);

  /**
   * 处理从目录步骤返回
   */
  const handleDirectoryBack = useCallback(() => {
    onBackToHome();
  }, [onBackToHome]);

  /**
   * 处理配置表单变更
   */
  const handleConfigChange = useCallback((newConfig: BlogConfig, isValid: boolean) => {
    setConfig(newConfig);
    setIsConfigValid(isValid);
    setDirectoryExistsWarning(null);
  }, []);

  /**
   * 检查目录是否已存在
   * 需求 4.6: 目标目录已存在同名文件夹时显示警告并阻止覆盖操作
   */
  const checkDirectoryExists = useCallback(async (targetDir: string, projectName: string): Promise<boolean> => {
    try {
      const fullPath = `${targetDir}/${projectName}`;
      const exists = await invoke<boolean>('check_directory_exists', { path: fullPath });
      return exists;
    } catch {
      // 如果检查失败，假设不存在，让后续流程处理
      return false;
    }
  }, []);

  /**
   * 处理配置表单提交
   * 需求 4.1: 调用 init_blog 命令创建博客项目
   */
  const handleConfigSubmit = useCallback(async () => {
    if (!config || !isConfigValid || isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;

    try {
      // 需求 4.6: 检查目录是否已存在
      const exists = await checkDirectoryExists(config.targetDir, config.projectName);
      if (exists) {
        setDirectoryExistsWarning(`目录 "${config.projectName}" 已存在于 "${config.targetDir}"，请更换项目名称或选择其他目录`);
        isSubmittingRef.current = false;
        return;
      }

      // 进入进度步骤
      setCurrentStep('progress');
      setInitStatus('running');
      setErrorMessage(undefined);
      setProjectPath(undefined);
      clearLogs();

      // 开始监听日志
      await startListening();
      addLog('开始初始化博客项目...', 'info');

      // 需求 4.1: 调用 init_blog 命令
      const result = await invoke<InitResult>('init_blog', {
        config: {
          target_dir: config.targetDir,
          project_name: config.projectName,
          description: config.description,
          author: config.author,
          site_url: config.siteUrl || null,
          timezone: config.timezone,
        },
      });

      stopListening();

      if (result.success) {
        setInitStatus('success');
        setProjectPath(result.project_path);
        addLog(`✓ ${result.message}`, 'info');
        addLog(`项目路径: ${result.project_path}`, 'info');

        // 需求 4.4: 成功后自动跳转到现有博客页面浏览项目
        if (onInitComplete) {
          addLog('正在跳转到项目浏览页面...', 'info');
          // 延迟一下让用户看到成功消息
          setTimeout(() => {
            console.log('[InitBlogPage] Calling onInitComplete with:', result.project_path);
            onInitComplete(result.project_path);
          }, 1500);
        } else {
          addLog('警告: onInitComplete 回调未定义', 'warn');
        }
      } else {
        setInitStatus('error');
        setErrorMessage(result.message);
        addLog(`✗ ${result.message}`, 'error');
      }
    } catch (err) {
      stopListening();
      const appError = handleTauriError(err);
      setInitStatus('error');

      // 需求 4.6: 处理目录已存在错误
      if (appError.code === ErrorCode.DIRECTORY_ALREADY_EXISTS) {
        setErrorMessage('目标目录已存在同名项目，请更换项目名称或选择其他目录');
      } else {
        setErrorMessage(getUserFriendlyMessage(appError));
      }

      addLog(`✗ 初始化失败: ${appError.message}`, 'error');
    } finally {
      isSubmittingRef.current = false;
    }
  }, [config, isConfigValid, checkDirectoryExists, clearLogs, startListening, stopListening, addLog]);

  /**
   * 处理从配置步骤返回
   */
  const handleConfigBack = useCallback(() => {
    setCurrentStep('directory');
    setDirectoryExistsWarning(null);
  }, []);

  /**
   * 处理重试
   */
  const handleRetry = useCallback(() => {
    setInitStatus('idle');
    setErrorMessage(undefined);
    clearLogs();
    // 重新执行初始化
    handleConfigSubmit();
  }, [clearLogs, handleConfigSubmit]);

  /**
   * 处理从进度步骤返回
   */
  const handleProgressBack = useCallback(() => {
    if (initStatus === 'running') {
      return; // 运行中不允许返回
    }
    setCurrentStep('config');
    setInitStatus('idle');
    setErrorMessage(undefined);
    clearLogs();
  }, [initStatus, clearLogs]);

  /**
   * 处理打开目录（跳转到现有博客页面）
   * 需求 4.4: 在 Admin 内浏览新创建的博客目录
   */
  const handleOpenDirectory = useCallback(() => {
    if (!projectPath) {
      console.error('No project path available');
      return;
    }

    if (onInitComplete) {
      onInitComplete(projectPath);
    }
  }, [projectPath, onInitComplete]);

  /**
   * 处理清空日志
   */
  const handleClearLogs = useCallback(() => {
    clearLogs();
  }, [clearLogs]);

  // 渲染当前步骤
  switch (currentStep) {
    case 'directory':
      return (
        <DirectoryStep
          selectedDirectory={selectedDirectory}
          onDirectoryChange={handleDirectoryChange}
          onNext={handleDirectoryNext}
          onBack={handleDirectoryBack}
        />
      );

    case 'config':
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-2 sm:p-4 lg:p-6">
          <div className="w-full max-w-md sm:max-w-lg">
            {/* 标题区域 */}
            <div className="text-center mb-4 sm:mb-6">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">
                初始化博客
              </h1>
              <p className="text-sm sm:text-base text-gray-600">
                第 2 步：配置博客项目
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
                  <div className="w-8 sm:w-16 h-1 bg-blue-600 mx-1 sm:mx-2" />
                  <div className="w-6 h-6 sm:w-8 sm:h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm">
                    2
                  </div>
                  <div className="w-8 sm:w-16 h-1 bg-gray-300 mx-1 sm:mx-2" />
                  <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gray-300 text-gray-500 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm">
                    3
                  </div>
                </div>
              </div>

              {/* 已选择的目录显示 */}
              <div className="bg-gray-50 rounded-lg p-2 sm:p-3 mb-4 sm:mb-6 border border-gray-200">
                <p className="text-xs sm:text-sm text-gray-500 mb-1">目标目录：</p>
                <p className="text-gray-800 font-mono text-xs sm:text-sm break-all">
                  {selectedDirectory}
                </p>
              </div>

              {/* 目录已存在警告 - 需求 4.6 */}
              {directoryExistsWarning && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 sm:p-3 mb-4">
                  <div className="flex items-start">
                    <svg
                      className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500 mr-2 flex-shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <p className="text-yellow-700 text-xs sm:text-sm">{directoryExistsWarning}</p>
                  </div>
                </div>
              )}

              {/* 配置表单 */}
              <ConfigForm
                initialConfig={config || undefined}
                onChange={handleConfigChange}
                targetDir={selectedDirectory || ''}
                disabled={false}
              />

              {/* 操作按钮区域 */}
              <div className="flex justify-between mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-gray-200">
                <Button variant="secondary" onClick={handleConfigBack}>
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
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  <span className="hidden sm:inline">上一步</span>
                  <span className="sm:hidden">返回</span>
                </Button>

                <Button
                  variant="primary"
                  onClick={handleConfigSubmit}
                  disabled={!isConfigValid}
                >
                  <span className="hidden sm:inline">开始初始化</span>
                  <span className="sm:hidden">开始</span>
                  <svg
                    className="w-4 h-4 ml-1"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </Button>
              </div>
            </div>

            {/* 底部提示 */}
            <p className="text-center text-xs sm:text-sm text-gray-500 mt-3 sm:mt-4">
              项目将创建在：{selectedDirectory}/{config?.projectName || 'my-blog'}
            </p>
          </div>
        </div>
      );

    case 'progress':
      return (
        <ProgressPanel
          status={initStatus}
          logs={logs}
          errorMessage={errorMessage}
          projectPath={projectPath}
          onRetry={handleRetry}
          onBack={handleProgressBack}
          onOpenDirectory={handleOpenDirectory}
          onClearLogs={handleClearLogs}
        />
      );

    default:
      return null;
  }
};

export default InitBlogPage;
