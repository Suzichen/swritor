import { useState, useEffect, useRef } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import {
  parseConfig,
  serializeConfig,
  getConfigDefaults,
  SocialLinkItem,
} from "../utils/configParser";
import { COMMON_TIMEZONES, getTimezoneOffset } from "../utils/timezone";
import {
  PersonalSettingsForm,
  type PersonalSettingsFormHandle,
} from "../components/settings/PersonalSettingsForm";

const BUILTIN_PLATFORMS = [
  "github", "rss", "x", "twitter", "weibo", "zhihu",
  "bilibili", "email", "facebook", "instagram", "tiktok",
] as const;

interface Props {
  blogDir: string;
}

type SettingsSection = "profile" | "site" | "connections" | "advanced" | "app";

const SETTINGS_SECTIONS: { value: SettingsSection; label: string; icon: string }[] = [
  { value: "profile", label: "账户与站点", icon: "account_circle" },
  { value: "site", label: "网站信息", icon: "web" },
  { value: "connections", label: "链接展示", icon: "link" },
  { value: "advanced", label: "发布选项", icon: "tune" },
  { value: "app", label: "应用信息", icon: "info" },
];

export function Settings({ blogDir }: Props) {
  const configRef = useRef<any>(null);
  const profileFormRef = useRef<PersonalSettingsFormHandle>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");
  const [language, setLanguage] = useState("en");
  const [logo, setLogo] = useState("/logo.png");
  const [favicon, setFavicon] = useState("/favicon.ico");
  const [siteUrl, setSiteUrl] = useState("");
  const [siteUrlEnabled, setSiteUrlEnabled] = useState(false);
  const [timezone, setTimezone] = useState("UTC");
  const [basePath, setBasePath] = useState("");
  const [linksEnabled, setLinksEnabled] = useState(true);
  const [linkItems, setLinkItems] = useState<{ name: string; url: string }[]>([]);
  const [socialEnabled, setSocialEnabled] = useState(true);
  const [socialItems, setSocialItems] = useState<SocialLinkItem[]>([]);

  const [pendingLogo, setPendingLogo] = useState<string | null>(null);
  const [pendingFavicon, setPendingFavicon] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [snackOpen, setSnackOpen] = useState(false);
  const [snackMsg, setSnackMsg] = useState("保存成功");
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");

  // Version
  const [shellVersion, setShellVersion] = useState<string | null>(null);
  const [engineVersion, setEngineVersion] = useState("");
  const [templateVersion, setTemplateVersion] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => { loadConfig(); }, [blogDir]);

  const handleCopyEnv = () => {
    const info = [
      `博客目录: ${blogDir}`,
      `@s-page/core: ${shellVersion ?? "未缓存"}`,
      `@s-page/engine: ${engineVersion}`,
      `模板版本: ${templateVersion}`,
    ].join("\n");
    navigator.clipboard.writeText(info);
    setSnackMsg("已复制到剪贴板");
    setSnackOpen(true);
    setTimeout(() => setSnackOpen(false), 2000);
  };

  const loadConfig = async () => {
    const { raw } = await invoke<{ raw: string }>("read_config", { blogDir, filename: "config.json" });
    const parsed = parseConfig(raw);
    configRef.current = parsed;
    const d = getConfigDefaults();

    setTitle(parsed.title ?? d.title);
    setDescription(parsed.description ?? d.description);
    setAuthor(parsed.author ?? d.author);
    setLanguage(parsed.language ?? d.language);
    setLogo(parsed.logo ?? d.logo);
    setFavicon(parsed.favicon ?? d.favicon);
    setSiteUrl(parsed.siteUrl ?? d.siteUrl);
    setSiteUrlEnabled(!!parsed.siteUrl);
    setTimezone(parsed.timezone ?? d.timezone);
    setBasePath(parsed.basePath ?? "");
    setLinksEnabled(parsed.links?.enabled ?? true);
    setLinkItems(
      parsed.links?.items
        ? Object.entries(parsed.links.items).map(([name, url]) => ({ name, url: url as string }))
        : []
    );
    setSocialEnabled(parsed.socialLinks?.enabled ?? true);
    setSocialItems(parsed.socialLinks?.items ?? []);
    setPendingLogo(null);
    setPendingFavicon(null);


    // Load versions
    const sv = await invoke<string | null>("get_shell_version");
    setShellVersion(sv);
    const ev = await invoke<string>("get_engine_version");
    setEngineVersion(ev);
    const cv = await invoke<string>("get_template_version");
    setTemplateVersion(cv);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const profileSaved = await profileFormRef.current?.saveProfile({
        persistDefaults: false,
        notify: false,
      });
      if (profileSaved === false) {
        setSnackMsg("个人资料保存失败，请检查表单提示");
        setSnackOpen(true);
        setTimeout(() => setSnackOpen(false), 3000);
        return;
      }
      if (pendingLogo) {
        const ext = pendingLogo.split(".").pop() || "png";
        const filename = `logo.${ext}`;
        await invoke("copy_to_public", { blogDir, source: pendingLogo, filename });
        setLogo(`/${filename}`);
        configRef.current.logo = `/${filename}`;
      }
      if (pendingFavicon) {
        const ext = pendingFavicon.split(".").pop() || "ico";
        const filename = `favicon.${ext}`;
        await invoke("copy_to_public", { blogDir, source: pendingFavicon, filename });
        setFavicon(`/${filename}`);
        configRef.current.favicon = `/${filename}`;
      }

      const obj = configRef.current;
      obj.title = title;
      obj.description = description;
      obj.author = author;
      obj.language = language;
      if (!pendingLogo) obj.logo = logo;
      if (!pendingFavicon) obj.favicon = favicon;
      obj.siteUrl = siteUrlEnabled ? siteUrl : "";
      obj.timezone = timezone;
      if (basePath) {
        obj.basePath = basePath;
      } else {
        delete obj.basePath;
      }

      obj.links = { enabled: linksEnabled, items: {} as Record<string, string> };
      for (const item of linkItems) {
        if (item.name) obj.links.items[item.name] = item.url;
      }

      obj.socialLinks = {
        enabled: socialEnabled,
        items: socialItems.map((s) => {
          const item: any = { platform: s.platform };
          if (s.url) item.url = s.url;
          if (s.icon) item.icon = s.icon;
          if (s.label) item.label = s.label;
          return item;
        }),
      };

      const content = serializeConfig(obj);
      await invoke("write_config", { blogDir, filename: "config.json", content });


      setPendingLogo(null);
      setPendingFavicon(null);
      setSnackMsg("保存成功");
      setSnackOpen(true);
      setTimeout(() => setSnackOpen(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateShell = async () => {
    setUpdating(true);
    try {
      const newVersion = await invoke<string>("update_shell_cache");
      setShellVersion(newVersion);
      setSnackMsg(`已更新到 ${newVersion}`);
      setSnackOpen(true);
      setTimeout(() => setSnackOpen(false), 2000);
    } catch (e: any) {
      setSnackMsg(`更新失败: ${e}`);
      setSnackOpen(true);
      setTimeout(() => setSnackOpen(false), 3000);
    }
    setUpdating(false);
  };

  const selectImage = async (target: "logo" | "favicon") => {
    const path = await invoke<string | null>("select_image");
    if (!path) return;
    if (target === "logo") setPendingLogo(path);
    else setPendingFavicon(path);
  };

  const getImageSrc = (configPath: string, pending: string | null) => {
    if (pending) return convertFileSrc(pending);
    const filePath = `${blogDir}/public${configPath}`;
    return convertFileSrc(filePath);
  };

  return (
    <div className="settings-page">
      <header className="settings-header">
        <div>
          <h1>设置</h1>
          <p>管理博客资料、展示内容与发布方式</p>
        </div>
        <mdui-button
          variant="filled"
          icon="save"
          loading={saving || undefined}
          onClick={handleSave}
        >
          保存更改
        </mdui-button>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="设置分类">
          {SETTINGS_SECTIONS.map((section) => (
            <button
              key={section.value}
              type="button"
              className={activeSection === section.value ? "active" : ""}
              onClick={() => setActiveSection(section.value)}
            >
              <mdui-icon name={section.icon} />
              <span>{section.label}</span>
            </button>
          ))}
        </nav>

        <main className="settings-content">
          <div hidden={activeSection !== "profile"}>
            <SettingsPanel
              icon="account_circle"
              title="账户与站点"
              description="设置公开显示的个人资料，并管理 spage.me 博客网址。"
            >
              <PersonalSettingsForm
                ref={profileFormRef}
                blogDir={blogDir}
                mode="settings"
                showProfileSaveButton={false}
                onNotify={(msg) => {
                  setSnackMsg(msg);
                  setSnackOpen(true);
                  setTimeout(() => setSnackOpen(false), 2000);
                }}
              />
            </SettingsPanel>
          </div>

          <div className="settings-panel-stack" hidden={activeSection !== "site"}>
              <SettingsPanel
                icon="article"
                title="基本信息"
                description="这些内容会出现在网站首页和页面元数据中。"
              >
                <div className="settings-fields settings-fields-two">
                  <mdui-text-field
                    variant="outlined"
                    label="网站标题"
                    helper="博客的主标题"
                    value={title}
                    onInput={(e: any) => setTitle(e.target.value)}
                    required
                  />
                  <mdui-text-field
                    variant="outlined"
                    label="作者"
                    helper="文章默认署名"
                    value={author}
                    onInput={(e: any) => setAuthor(e.target.value)}
                  />
                  <mdui-text-field
                    class="settings-field-wide"
                    variant="outlined"
                    label="网站描述"
                    helper="用于搜索摘要和社交分享"
                    value={description}
                    onInput={(e: any) => setDescription(e.target.value)}
                    rows={3}
                  />
                  <mdui-select
                    variant="outlined"
                    label="网站语言"
                    value={language}
                    onChange={(e: any) => setLanguage(e.target.value)}
                  >
                    <mdui-menu-item value="en">English</mdui-menu-item>
                    <mdui-menu-item value="zh-CN">简体中文</mdui-menu-item>
                    <mdui-menu-item value="ja">日本語</mdui-menu-item>
                  </mdui-select>
                </div>
              </SettingsPanel>

              <SettingsPanel
                icon="palette"
                title="品牌图标"
                description="上传博客 Logo 和浏览器标签页图标。"
              >
                <div className="settings-image-list">
                  <ImageField
                    label="Logo"
                    description="建议使用透明背景的 PNG 或 SVG"
                    src={getImageSrc(logo, pendingLogo)}
                    path={pendingLogo ? pendingLogo.split(/[/\\]/).pop()! : logo}
                    onSelect={() => selectImage("logo")}
                    size="h-12 w-28"
                  />
                  <mdui-divider />
                  <ImageField
                    label="Favicon"
                    description="建议使用正方形 ICO 或 PNG"
                    src={getImageSrc(favicon, pendingFavicon)}
                    path={pendingFavicon ? pendingFavicon.split(/[/\\]/).pop()! : favicon}
                    onSelect={() => selectImage("favicon")}
                    size="h-12 w-12"
                  />
                </div>
              </SettingsPanel>
          </div>

          <div className="settings-panel-stack" hidden={activeSection !== "connections"}>
              <SettingsPanel icon="link" title="友情链接" description="在博客中展示你推荐的网站。">
                <SettingToggle
                  title="显示友情链接"
                  description="关闭后保留已填写的链接，但不在网站中展示。"
                  checked={linksEnabled}
                  onChange={setLinksEnabled}
                />
                {linksEnabled && (
                  <div className="settings-repeat-list">
                    {linkItems.length === 0 && <EmptySetting text="还没有友情链接" />}
                    {linkItems.map((item, index) => (
                      <div key={index} className="settings-repeat-row">
                        <mdui-text-field
                          variant="outlined"
                          label="名称"
                          value={item.name}
                          onInput={(e: any) => {
                            const nextItems = [...linkItems];
                            nextItems[index] = { ...nextItems[index], name: e.target.value };
                            setLinkItems(nextItems);
                          }}
                        />
                        <mdui-text-field
                          variant="outlined"
                          type="url"
                          label="网址"
                          placeholder="https://example.com"
                          value={item.url}
                          onInput={(e: any) => {
                            const nextItems = [...linkItems];
                            nextItems[index] = { ...nextItems[index], url: e.target.value };
                            setLinkItems(nextItems);
                          }}
                        />
                        <mdui-button-icon
                          icon="delete"
                          aria-label="删除友情链接"
                          onClick={() => setLinkItems(linkItems.filter((_, itemIndex) => itemIndex !== index))}
                        />
                      </div>
                    ))}
                    <mdui-button
                      variant="tonal"
                      icon="add"
                      onClick={() => setLinkItems([...linkItems, { name: "", url: "" }])}
                    >
                      添加链接
                    </mdui-button>
                  </div>
                )}
              </SettingsPanel>

              <SettingsPanel icon="share" title="社交链接" description="让读者在其他平台找到你。">
                <SettingToggle
                  title="显示社交链接"
                  description="关闭后保留平台配置，但不在网站中展示。"
                  checked={socialEnabled}
                  onChange={setSocialEnabled}
                />
                {socialEnabled && (
                  <div className="settings-repeat-list">
                    {socialItems.length === 0 && <EmptySetting text="还没有社交链接" />}
                    {socialItems.map((item, index) => (
                      <SocialLinkRow
                        key={index}
                        item={item}
                        onChange={(updated) => {
                          const nextItems = [...socialItems];
                          nextItems[index] = updated;
                          setSocialItems(nextItems);
                        }}
                        onDelete={() => setSocialItems(socialItems.filter((_, itemIndex) => itemIndex !== index))}
                      />
                    ))}
                    <mdui-button
                      variant="tonal"
                      icon="add"
                      onClick={() => setSocialItems([...socialItems, { platform: "github", url: "" }])}
                    >
                      添加社交链接
                    </mdui-button>
                  </div>
                )}
              </SettingsPanel>
          </div>

          <div hidden={activeSection !== "advanced"}>
            <SettingsPanel
              icon="rocket_launch"
              title="发布选项"
              description="配置正式环境地址、时区与子目录部署路径。"
            >
              <div className="settings-fields">
                <SettingToggle
                  title="使用自定义网站 URL"
                  description="用于生成规范链接、站点地图和分享地址。"
                  checked={siteUrlEnabled}
                  onChange={setSiteUrlEnabled}
                />
                {siteUrlEnabled && (
                  <mdui-text-field
                    variant="outlined"
                    label="网站 URL"
                    type="url"
                    value={siteUrl}
                    placeholder="https://example.com"
                    helper="请输入包含协议的完整公开地址"
                    onInput={(e: any) => setSiteUrl(e.target.value)}
                  />
                )}
                <mdui-select
                  variant="outlined"
                  label="时区"
                  value={timezone}
                  onChange={(e: any) => setTimezone(e.target.value)}
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <mdui-menu-item key={tz} value={tz}>
                      {tz} (UTC{getTimezoneOffset(tz)})
                    </mdui-menu-item>
                  ))}
                </mdui-select>
                <mdui-text-field
                  variant="outlined"
                  label="Base Path"
                  value={basePath}
                  placeholder="/blog"
                  helper="仅在部署到域名子目录时填写，例如 /blog"
                  onInput={(e: any) => setBasePath(e.target.value)}
                />
              </div>
            </SettingsPanel>
          </div>

          <div hidden={activeSection !== "app"}>
            <SettingsPanel icon="info" title="应用信息" description="查看当前环境与博客依赖版本。">
              <div className="settings-info-list">
                <InfoRow
                  label="博客目录"
                  value={blogDir}
                  action={<mdui-button variant="text" icon="folder_open" onClick={() => invoke("open_in_explorer", { path: blogDir })}>打开</mdui-button>}
                />
                <mdui-divider />
                <InfoRow
                  label="@s-page/core"
                  value={shellVersion ?? "未缓存"}
                  action={<mdui-button variant="text" loading={updating || undefined} onClick={handleUpdateShell}>检查更新</mdui-button>}
                />
                <mdui-divider />
                <InfoRow label="@s-page/engine" value={engineVersion || "未知"} />
                <mdui-divider />
                <InfoRow label="模板版本" value={templateVersion || "未知"} />
              </div>
              <div className="settings-panel-actions">
                <mdui-button variant="tonal" icon="content_copy" onClick={handleCopyEnv}>
                  复制环境信息
                </mdui-button>
              </div>
            </SettingsPanel>
          </div>
        </main>
      </div>

      <mdui-snackbar open={snackOpen || undefined} placement="top">
        {snackMsg}
      </mdui-snackbar>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────

function SettingsPanel({ icon, title, description, children }: {
  icon: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <mdui-card variant="outlined" class="settings-panel">
      <div className="settings-panel-heading">
        <span className="settings-panel-icon"><mdui-icon name={icon} /></span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="settings-panel-body">{children}</div>
    </mdui-card>
  );
}

function SettingToggle({ title, description, checked, onChange }: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="settings-toggle-row">
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <mdui-switch
        checked={checked || undefined}
        onChange={(event: any) => onChange(event.target.checked)}
      />
    </label>
  );
}

function EmptySetting({ text }: { text: string }) {
  return (
    <div className="settings-empty">
      <mdui-icon name="add_link" />
      <span>{text}</span>
    </div>
  );
}

function InfoRow({ label, value, action }: {
  label: string;
  value: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="settings-info-row">
      <div>
        <p>{label}</p>
        <span>{value}</span>
      </div>
      {action}
    </div>
  );
}

function ImageField({ label, description, src, path, onSelect, size }: {
  label: string;
  description: string;
  src: string;
  path: string;
  onSelect: () => void;
  size: string;
}) {
  return (
    <div className="settings-image-row">
      <div className={`${size} settings-image-preview`}>
        <img
          src={src}
          alt={label}
          className="max-h-full max-w-full object-contain"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      </div>
      <div className="settings-image-copy">
        <p>{label}</p>
        <span>{description}</span>
        <small>{path}</small>
      </div>
      <mdui-button variant="tonal" icon="upload" onClick={onSelect}>
        更换
      </mdui-button>
    </div>
  );
}

function SocialLinkRow({ item, onChange, onDelete }: {
  item: SocialLinkItem;
  onChange: (item: SocialLinkItem) => void;
  onDelete: () => void;
}) {
  const isCustom = item.platform === "custom" || (!BUILTIN_PLATFORMS.includes(item.platform as any) && item.platform !== "");
  const selectValue = isCustom ? "__custom__" : item.platform;

  return (
    <div className="settings-social-row">
      <div className="settings-social-main">
        <mdui-select
          variant="outlined"
          label="平台"
          value={selectValue}
          onChange={(e: any) => {
            const v = e.target.value;
            if (v === "__custom__") {
              onChange({ ...item, platform: "custom", icon: "", label: "" });
            } else {
              onChange({ platform: v, url: item.url, icon: undefined, label: undefined });
            }
          }}
          class="settings-social-platform"
        >
          {BUILTIN_PLATFORMS.map((p) => (
            <mdui-menu-item key={p} value={p}>{p}</mdui-menu-item>
          ))}
          <mdui-menu-item value="__custom__">自定义</mdui-menu-item>
        </mdui-select>

        <mdui-text-field
          variant="outlined"
          label="URL"
          value={item.url || ""}
          placeholder={item.platform === "rss" ? "可选" : "https://..."}
          onInput={(e: any) => onChange({ ...item, url: e.target.value || undefined })}
        />
        <mdui-button-icon icon="delete" aria-label="删除社交链接" onClick={onDelete} />
      </div>

      {isCustom && (
        <div className="settings-social-custom">
          <mdui-text-field
            variant="outlined"
            label="显示名称"
            value={item.label || ""}
            onInput={(e: any) => onChange({ ...item, label: e.target.value || undefined })}
          />
          <mdui-text-field
            variant="outlined"
            label="图标路径"
            value={item.icon || ""}
            placeholder="https://example.com/icon.svg"
            onInput={(e: any) => onChange({ ...item, icon: e.target.value || undefined })}
          />
        </div>
      )}
    </div>
  );
}
