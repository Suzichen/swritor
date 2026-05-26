// S-Blog Admin - 时区检测工具
// 需求: 3.2（时区设置 - 自动检测系统时区并提供确认选项）

/**
 * 获取系统时区（IANA 时区标识符）
 * @returns 系统时区字符串，如 "Asia/Tokyo"、"America/New_York"
 */
export function getSystemTimezone(): string {
  try {
    // 使用 Intl API 获取系统时区
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // 如果获取失败，返回 UTC 作为默认值
    return 'UTC';
  }
}

/**
 * 验证时区字符串是否为有效的 IANA 时区标识符
 * @param timezone 时区字符串
 * @returns 是否为有效时区
 */
export function isValidTimezone(timezone: string): boolean {
  if (!timezone || typeof timezone !== 'string') {
    return false;
  }

  try {
    // 尝试使用该时区创建 DateTimeFormat
    // 如果时区无效，会抛出 RangeError
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取时区的显示名称
 * @param timezone IANA 时区标识符
 * @param locale 语言环境（默认使用系统语言）
 * @returns 时区显示名称，如 "日本标准时间"
 */
export function getTimezoneDisplayName(
  timezone: string,
  locale?: string
): string {
  try {
    const formatter = new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      timeZoneName: 'long',
    });
    const parts = formatter.formatToParts(new Date());
    const timeZonePart = parts.find((part) => part.type === 'timeZoneName');
    return timeZonePart?.value ?? timezone;
  } catch {
    return timezone;
  }
}

/**
 * 获取时区的 UTC 偏移量
 * @param timezone IANA 时区标识符
 * @returns UTC 偏移量字符串，如 "+09:00"、"-05:00"
 */
export function getTimezoneOffset(timezone: string): string {
  try {
    const date = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(date);
    const offsetPart = parts.find((part) => part.type === 'timeZoneName');
    // 格式化为标准格式 (GMT+9 -> +09:00)
    const offset = offsetPart?.value ?? 'UTC';
    if (offset === 'UTC' || offset === 'GMT') {
      return '+00:00';
    }
    // 解析 GMT+9 或 GMT-5 格式
    const match = offset.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (match) {
      const sign = match[1];
      const hours = match[2].padStart(2, '0');
      const minutes = match[3] ?? '00';
      return `${sign}${hours}:${minutes}`;
    }
    return offset;
  } catch {
    return '+00:00';
  }
}

/**
 * 常用时区列表（用于下拉选择）
 */
export const COMMON_TIMEZONES = [
  'UTC',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Seoul',
  'Asia/Singapore',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Australia/Sydney',
  'Pacific/Auckland',
] as const;

export type CommonTimezone = (typeof COMMON_TIMEZONES)[number];
