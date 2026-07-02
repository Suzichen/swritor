// Swritor - 配置表单组件

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Input, Select } from '../common';
import { BlogConfig } from '../../types';
import { getSystemTimezone, isValidTimezone, COMMON_TIMEZONES, getTimezoneOffset } from '../../utils/timezone';

export interface ConfigFormProps {
  /** 初始配置值 */
  initialConfig?: Partial<BlogConfig>;
  /** 配置变更回调 */
  onChange: (config: BlogConfig, isValid: boolean) => void;
  /** 目标目录 */
  targetDir: string;
  /** 是否禁用表单 */
  disabled?: boolean;
}

/** 表单验证错误 */
interface FormErrors {
  projectName?: string;
  description?: string;
  author?: string;
  siteUrl?: string;
  timezone?: string;
}

/**
 * 配置表单组件
 *
 * 需求 3.1: 目录选择完成后显示博客配置表单
 * 需求 3.2: 提供所有配置字段的输入控件
 * 需求 3.3: 对必填字段进行验证
 * 需求 3.4: 表单验证失败时显示错误提示信息
 */
export const ConfigForm: React.FC<ConfigFormProps> = ({
  initialConfig,
  onChange,
  targetDir,
  disabled = false,
}) => {
  // 获取系统时区作为默认值
  const systemTimezone = useMemo(() => getSystemTimezone(), []);

  // 表单状态
  const [projectName, setProjectName] = useState(initialConfig?.projectName ?? 'my-spage-blog');
  const [description, setDescription] = useState(initialConfig?.description ?? 'A blog powered by Spage');
  const [author, setAuthor] = useState(initialConfig?.author ?? '');
  const [siteUrl, setSiteUrl] = useState(initialConfig?.siteUrl ?? '');
  const [timezone, setTimezone] = useState(initialConfig?.timezone ?? systemTimezone);

  // 自定义时区输入（当选择"其他"时）
  const [customTimezone, setCustomTimezone] = useState('');
  const [useCustomTimezone, setUseCustomTimezone] = useState(false);

  // 验证错误状态
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // 时区选项列表
  const timezoneOptions = useMemo(() => {
    const options: { value: string; label: string }[] = COMMON_TIMEZONES.map((tz) => ({
      value: tz,
      label: `${tz} (${getTimezoneOffset(tz)})`,
    }));
    // 添加"其他"选项用于手动输入
    options.push({ value: '__custom__', label: '其他（手动输入）' });
    return options;
  }, []);

  /**
   * 验证表单
   * 需求 3.3: 对必填字段进行验证
   */
  const validateForm = useCallback((): FormErrors => {
    const newErrors: FormErrors = {};

    // 项目名称必填验证 - 放宽限制，只禁止文件系统不允许的字符
    if (!projectName.trim()) {
      newErrors.projectName = '项目名称为必填项';
    } else if (/[<>:"/\\|?*]/.test(projectName)) {
      newErrors.projectName = '项目名称不能包含以下字符: < > : " / \\ | ? *';
    } else if (projectName.trim() !== projectName) {
      newErrors.projectName = '项目名称不能以空格开头或结尾';
    }

    // 站点 URL 格式验证（可选字段）
    if (siteUrl.trim() && !/^https?:\/\/.+/.test(siteUrl)) {
      newErrors.siteUrl = '请输入有效的 URL（以 http:// 或 https:// 开头）';
    }

    // 时区验证
    const currentTimezone = useCustomTimezone ? customTimezone : timezone;
    if (!currentTimezone.trim()) {
      newErrors.timezone = '时区为必填项';
    } else if (!isValidTimezone(currentTimezone)) {
      newErrors.timezone = '请输入有效的 IANA 时区标识符';
    }

    return newErrors;
  }, [projectName, siteUrl, timezone, customTimezone, useCustomTimezone]);

  /**
   * 构建配置对象
   */
  const buildConfig = useCallback((): BlogConfig => {
    const currentTimezone = useCustomTimezone ? customTimezone : timezone;
    return {
      targetDir,
      projectName: projectName.trim(),
      description: description.trim(),
      author: author.trim(),
      siteUrl: siteUrl.trim() || undefined,
      timezone: currentTimezone.trim(),
    };
  }, [targetDir, projectName, description, author, siteUrl, timezone, customTimezone, useCustomTimezone]);

  /**
   * 当表单值变化时，通知父组件
   */
  useEffect(() => {
    const validationErrors = validateForm();
    const isValid = Object.keys(validationErrors).length === 0;
    setErrors(validationErrors);
    onChange(buildConfig(), isValid);
  }, [projectName, description, author, siteUrl, timezone, customTimezone, useCustomTimezone, validateForm, buildConfig, onChange]);

  /**
   * 处理字段失焦
   */
  const handleBlur = useCallback((field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  /**
   * 处理时区选择变化
   */
  const handleTimezoneChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === '__custom__') {
      setUseCustomTimezone(true);
      setCustomTimezone('');
    } else {
      setUseCustomTimezone(false);
      setTimezone(value);
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* 项目名称 - 必填 */}
      <Input
        label="项目名称 *"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        onBlur={() => handleBlur('projectName')}
        placeholder="my-blog"
        error={touched.projectName ? errors.projectName : undefined}
        disabled={disabled}
      />

      {/* 项目描述 */}
      <Input
        label="项目描述"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => handleBlur('description')}
        placeholder="A blog powered by Spage"
        disabled={disabled}
      />

      {/* 作者名称 */}
      <Input
        label="作者名称"
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
        onBlur={() => handleBlur('author')}
        placeholder="请输入作者名称"
        disabled={disabled}
      />

      {/* 站点 URL */}
      <Input
        label="站点 URL"
        value={siteUrl}
        onChange={(e) => setSiteUrl(e.target.value)}
        onBlur={() => handleBlur('siteUrl')}
        placeholder="https://example.com（可选，用于 SEO）"
        error={touched.siteUrl ? errors.siteUrl : undefined}
        disabled={disabled}
      />

      {/* 时区设置 - 需求 3.2: 自动检测系统时区并提供确认选项 */}
      <div className="space-y-2">
        <Select
          label="时区设置"
          value={useCustomTimezone ? '__custom__' : timezone}
          onChange={handleTimezoneChange}
          onBlur={() => handleBlur('timezone')}
          options={timezoneOptions}
          error={!useCustomTimezone && touched.timezone ? errors.timezone : undefined}
          disabled={disabled}
        />
        {/* 系统检测到的时区提示 */}
        {!useCustomTimezone && timezone === systemTimezone && (
          <p className="text-sm text-gray-500">
            ✓ 已自动检测到系统时区
          </p>
        )}
        {/* 自定义时区输入 */}
        {useCustomTimezone && (
          <Input
            value={customTimezone}
            onChange={(e) => setCustomTimezone(e.target.value)}
            onBlur={() => handleBlur('timezone')}
            placeholder="请输入 IANA 时区标识符，如 Asia/Tokyo"
            error={touched.timezone ? errors.timezone : undefined}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
};

export default ConfigForm;
