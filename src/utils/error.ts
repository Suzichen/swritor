// Swritor - 错误处理工具

export interface AppError {
  code: string;
  message: string;
  details?: string;
}

export const ErrorCode = {
  UNKNOWN: 'UNKNOWN',
  TAURI_ERROR: 'TAURI_ERROR',
  DIRECTORY_CANCELLED: 'DIRECTORY_CANCELLED',
  DIRECTORY_NOT_FOUND: 'DIRECTORY_NOT_FOUND',
  DIRECTORY_ALREADY_EXISTS: 'DIRECTORY_ALREADY_EXISTS',
  FILE_SYSTEM_ERROR: 'FILE_SYSTEM_ERROR',
  ENGINE_ERROR: 'ENGINE_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export function handleTauriError(error: unknown): AppError {
  if (typeof error === 'string') {
    return parseErrorString(error);
  }
  if (error instanceof Error) {
    return { code: ErrorCode.TAURI_ERROR, message: error.message, details: error.stack };
  }
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    return {
      code: String(obj.code ?? ErrorCode.TAURI_ERROR),
      message: String(obj.message ?? '未知错误'),
      details: obj.details ? String(obj.details) : undefined,
    };
  }
  return { code: ErrorCode.UNKNOWN, message: String(error) };
}

function parseErrorString(errorStr: string): AppError {
  const lower = errorStr.toLowerCase();

  if (lower.includes('cancelled') || lower.includes('取消')) {
    return { code: ErrorCode.DIRECTORY_CANCELLED, message: '目录选择已取消' };
  }
  if (lower.includes('not found') || lower.includes('不存在')) {
    return { code: ErrorCode.DIRECTORY_NOT_FOUND, message: errorStr };
  }
  if (lower.includes('already exists') || lower.includes('已存在')) {
    return { code: ErrorCode.DIRECTORY_ALREADY_EXISTS, message: errorStr };
  }
  if (lower.includes('引擎') || lower.includes('engine')) {
    return { code: ErrorCode.ENGINE_ERROR, message: errorStr };
  }
  if (lower.includes('permission') || lower.includes('权限') || lower.includes('io error') || lower.includes('文件系统')) {
    return { code: ErrorCode.FILE_SYSTEM_ERROR, message: errorStr };
  }

  return { code: ErrorCode.UNKNOWN, message: errorStr };
}

export function isRetryableError(error: AppError): boolean {
  return ([ErrorCode.FILE_SYSTEM_ERROR, ErrorCode.ENGINE_ERROR] as string[]).includes(error.code);
}

export function isCancelledError(error: AppError): boolean {
  return error.code === ErrorCode.DIRECTORY_CANCELLED;
}

export function getUserFriendlyMessage(error: AppError): string {
  switch (error.code) {
    case ErrorCode.DIRECTORY_CANCELLED:
      return '操作已取消';
    case ErrorCode.DIRECTORY_NOT_FOUND:
      return '指定的目录不存在，请重新选择';
    case ErrorCode.DIRECTORY_ALREADY_EXISTS:
      return '目标目录已存在同名项目，请选择其他位置';
    case ErrorCode.FILE_SYSTEM_ERROR:
      return '文件系统操作失败，请检查权限后重试';
    case ErrorCode.ENGINE_ERROR:
      return '引擎执行失败，请查看日志了解详情';
    case ErrorCode.VALIDATION_ERROR:
      return error.message || '输入验证失败，请检查表单内容';
    default:
      return error.message || '发生未知错误';
  }
}
