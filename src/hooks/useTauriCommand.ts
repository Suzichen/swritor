// Swritor - Tauri 命令调用 Hook

import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { handleTauriError, type AppError } from '../utils/error';

/**
 * Tauri 命令执行状态
 */
export interface CommandState<T> {
  /** 执行结果数据 */
  data: T | null;
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: AppError | null;
}

/**
 * useTauriCommand Hook 返回值
 */
export interface UseTauriCommandResult<T, A extends unknown[]> {
  /** 执行结果数据 */
  data: T | null;
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: AppError | null;
  /** 执行命令 */
  execute: (...args: A) => Promise<T | null>;
  /** 重置状态 */
  reset: () => void;
}

/**
 * Tauri 命令调用 Hook
 *
 * 提供统一的命令调用接口，包含加载状态和错误处理
 *
 * @template T 命令返回值类型
 * @template A 命令参数类型数组
 * @param commandName Tauri 命令名称
 * @param argsBuilder 参数构建函数，将调用参数转换为命令参数对象
 * @returns Hook 返回值，包含 data、loading、error、execute、reset
 *
 * @example
 * ```tsx
 * // 无参数命令
 * const { data, loading, error, execute } = useTauriCommand<string | null>(
 *   'select_directory'
 * );
 *
 * // 有参数命令
 * const { data, loading, error, execute } = useTauriCommand<boolean, [string]>(
 *   'check_directory_exists',
 *   (path) => ({ path })
 * );
 *
 * // 调用
 * await execute('/some/path');
 * ```
 */
export function useTauriCommand<T, A extends unknown[] = []>(
  commandName: string,
  argsBuilder?: (...args: A) => Record<string, unknown>
): UseTauriCommandResult<T, A> {
  const [state, setState] = useState<CommandState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(
    async (...args: A): Promise<T | null> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const commandArgs = argsBuilder ? argsBuilder(...args) : undefined;
        const result = await invoke<T>(commandName, commandArgs);

        setState({
          data: result,
          loading: false,
          error: null,
        });

        return result;
      } catch (err) {
        const appError = handleTauriError(err);

        setState({
          data: null,
          loading: false,
          error: appError,
        });

        return null;
      }
    },
    [commandName, argsBuilder]
  );

  const reset = useCallback(() => {
    setState({
      data: null,
      loading: false,
      error: null,
    });
  }, []);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    execute,
    reset,
  };
}

/**
 * 创建预配置的 Tauri 命令 Hook
 *
 * 用于创建特定命令的 Hook 工厂函数
 *
 * @template T 命令返回值类型
 * @template A 命令参数类型数组
 * @param commandName Tauri 命令名称
 * @param argsBuilder 参数构建函数
 * @returns Hook 函数
 *
 * @example
 * ```tsx
 * // 创建预配置的 Hook
 * const useSelectDirectory = createTauriCommand<string | null>('select_directory');
 * const useCheckDirectory = createTauriCommand<boolean, [string]>(
 *   'check_directory_exists',
 *   (path) => ({ path })
 * );
 *
 * // 在组件中使用
 * function MyComponent() {
 *   const { execute: selectDir } = useSelectDirectory();
 *   const { execute: checkDir } = useCheckDirectory();
 * }
 * ```
 */
export function createTauriCommand<T, A extends unknown[] = []>(
  commandName: string,
  argsBuilder?: (...args: A) => Record<string, unknown>
) {
  return () => useTauriCommand<T, A>(commandName, argsBuilder);
}

export default useTauriCommand;
