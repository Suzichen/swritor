import React, { useEffect, useRef } from 'react';
import type { LogEntry, LogLevel } from '../../types';

export interface LogPanelProps {
  /** 日志条目列表 */
  logs: LogEntry[];
  /** 面板标题 */
  title?: string;
  /** 是否自动滚动到最新日志 */
  autoScroll?: boolean;
  /** 清空日志回调 */
  onClear?: () => void;
  /** 自定义类名 */
  className?: string;
  /** 面板高度（默认 300px） */
  height?: number | string;
}

/**
 * 根据日志级别获取对应的样式类
 */
const levelStyles: Record<LogLevel, string> = {
  info: 'text-gray-600',
  warn: 'text-yellow-600',
  error: 'text-red-600',
};

/**
 * 根据日志级别获取对应的图标
 */
const levelIcons: Record<LogLevel, string> = {
  info: 'ℹ',
  warn: '⚠',
  error: '✕',
};

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * 日志面板组件
 *
 * 用于显示操作日志，支持不同级别的日志（info/warn/error）和自动滚动
 *
 * 需求: 7.4 - THE Log_Panel SHALL 位于界面的可见区域，便于用户查看操作日志
 */
export const LogPanel: React.FC<LogPanelProps> = ({
  logs,
  title = '日志',
  autoScroll = true,
  onClear,
  className = '',
  height = 300,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);

  // 自动滚动到最新日志
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current && !isUserScrollingRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // 检测用户是否手动滚动
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    // 如果用户滚动到距离底部 50px 以内，认为用户想要自动滚动
    isUserScrollingRef.current = scrollHeight - scrollTop - clientHeight > 50;
  };

  // 响应式高度处理 - 需求 7.3, 7.4
  const getResponsiveHeight = () => {
    if (typeof height === 'string') return height;
    // 默认高度，会被 CSS 类覆盖以实现响应式
    return `${height}px`;
  };

  const heightStyle = getResponsiveHeight();

  return (
    <div
      className={`
        flex flex-col
        bg-gray-50 border border-gray-200 rounded-lg
        overflow-hidden
        log-panel-container
        ${className}
      `.trim().replace(/\s+/g, ' ')}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-700">{title}</h3>
        {onClear && (
          <button
            onClick={onClear}
            className="
              px-2 py-1 text-xs
              text-gray-500 hover:text-gray-700
              hover:bg-gray-200 rounded
              transition-colors duration-200
            "
            title="清空日志"
          >
            清空
          </button>
        )}
      </div>

      {/* 日志内容区域 - 需求 7.4: 确保日志面板位于可见区域 */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto font-mono text-xs"
        style={{ minHeight: '150px', maxHeight: heightStyle }}
      >
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            暂无日志
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {logs.map((log, index) => (
              <div
                key={`${log.timestamp}-${index}`}
                className={`
                  flex items-start gap-2 py-0.5
                  ${levelStyles[log.level]}
                `.trim().replace(/\s+/g, ' ')}
              >
                <span className="flex-shrink-0 w-4 text-center">
                  {levelIcons[log.level]}
                </span>
                <span className="flex-shrink-0 text-gray-400">
                  [{formatTimestamp(log.timestamp)}]
                </span>
                <span className="flex-1 break-all whitespace-pre-wrap">
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LogPanel;
