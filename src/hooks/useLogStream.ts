// S-Blog Admin - 日志流监听 Hook
// 需求: 4.2 - WHILE 初始化过程执行中，THE Web_UI SHALL 显示进度指示器和实时日志输出

import { useState, useEffect, useCallback, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { LogEntry, LogLevel } from '../types';

/**
 * 日志流事件名称
 */
const LOG_OUTPUT_EVENT = 'log_output';

/**
 * 默认最大日志条数
 */
const DEFAULT_MAX_LOGS = 1000;

/**
 * useLogStream Hook 配置选项
 */
export interface UseLogStreamOptions {
  /** 最大日志条数，超过后自动清理旧日志 */
  maxLogs?: number;
  /** 是否自动开始监听 */
  autoStart?: boolean;
  /** 日志过滤函数 */
  filter?: (log: LogEntry) => boolean;
}

/**
 * useLogStream Hook 返回值
 */
export interface UseLogStreamResult {
  /** 日志列表 */
  logs: LogEntry[];
  /** 是否正在监听 */
  isListening: boolean;
  /** 开始监听 */
  startListening: () => Promise<void>;
  /** 停止监听 */
  stopListening: () => void;
  /** 清空日志 */
  clearLogs: () => void;
  /** 添加日志（手动添加） */
  addLog: (message: string, level?: LogLevel) => void;
}

/**
 * 解析日志级别
 *
 * 根据日志内容自动判断日志级别
 *
 * @param message 日志消息
 * @returns 日志级别
 */
function parseLogLevel(message: string): LogLevel {
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes('error') ||
    lowerMessage.includes('错误') ||
    lowerMessage.includes('failed') ||
    lowerMessage.includes('失败')
  ) {
    return 'error';
  }

  if (
    lowerMessage.includes('warn') ||
    lowerMessage.includes('warning') ||
    lowerMessage.includes('警告')
  ) {
    return 'warn';
  }

  return 'info';
}

/**
 * 日志流监听 Hook
 *
 * 监听 Rust 后端发送的 `log_output` 事件，收集并管理日志
 *
 * @param options 配置选项
 * @returns Hook 返回值
 *
 * @example
 * ```tsx
 * function ProgressPanel() {
 *   const { logs, isListening, startListening, clearLogs } = useLogStream({
 *     maxLogs: 500,
 *     autoStart: true,
 *   });
 *
 *   return (
 *     <div>
 *       {logs.map((log, index) => (
 *         <div key={index} className={`log-${log.level}`}>
 *           {log.message}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useLogStream(options: UseLogStreamOptions = {}): UseLogStreamResult {
  const { maxLogs = DEFAULT_MAX_LOGS, autoStart = false, filter } = options;

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isListening, setIsListening] = useState(false);

  // 使用 ref 存储 unlisten 函数，避免重复监听
  const unlistenRef = useRef<UnlistenFn | null>(null);

  /**
   * 添加日志
   */
  const addLog = useCallback(
    (message: string, level?: LogLevel) => {
      const logEntry: LogEntry = {
        timestamp: Date.now(),
        level: level ?? parseLogLevel(message),
        message,
      };

      // 应用过滤器
      if (filter && !filter(logEntry)) {
        return;
      }

      setLogs((prevLogs) => {
        const newLogs = [...prevLogs, logEntry];
        // 限制日志数量
        if (newLogs.length > maxLogs) {
          return newLogs.slice(-maxLogs);
        }
        return newLogs;
      });
    },
    [maxLogs, filter]
  );

  /**
   * 开始监听日志事件
   */
  const startListening = useCallback(async () => {
    // 如果已经在监听，先停止
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }

    try {
      const unlisten = await listen<string>(LOG_OUTPUT_EVENT, (event) => {
        addLog(event.payload);
      });

      unlistenRef.current = unlisten;
      setIsListening(true);
    } catch (error) {
      console.error('Failed to start log stream listener:', error);
    }
  }, [addLog]);

  /**
   * 停止监听日志事件
   */
  const stopListening = useCallback(() => {
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
    setIsListening(false);
  }, []);

  /**
   * 清空日志
   */
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // 自动开始监听
  useEffect(() => {
    if (autoStart) {
      startListening();
    }

    // 组件卸载时清理监听器
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [autoStart, startListening]);

  return {
    logs,
    isListening,
    startListening,
    stopListening,
    clearLogs,
    addLog,
  };
}

export default useLogStream;
