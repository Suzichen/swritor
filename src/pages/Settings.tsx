import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  parseConfig,
  serializeConfig,
  getConfigDefaults,
  SocialLinkItem,
} from "../utils/configParser";
import { COMMON_TIMEZONES, getTimezoneOffset } from "../utils/timezone";
import { PersonalSettingsForm } from "../components/settings/PersonalSettingsForm";

const BUILTIN_PLATFORMS = [
  "github", "rss", "x", "twitter", "weibo", "zhihu",
  "bilibili", "email", "facebook", "instagram", "tiktok",
] as const;

interface Props {
  blogDir: string;
}

interface AlbumProvider {
  type: string;
  endpoint: string;
  region: string;
  bucket: string;
  publicUrl: string;
}

export function Settings({ blogDir }: Props) {
  const configRef = useRef<any>(null);
  const albumConfigRef = useRef<any>(null);

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

  // Album settings
  const [albumEnabled, setAlbumEnabled] = useState(false);
  const [albumProvider, setAlbumProvider] = useState<AlbumProvider>({ type: "s3", endpoint: "", region: "", bucket: "", publicUrl: "" });
  const [s3AccessKey, setS3AccessKey] = useState("");
  const [s3SecretKey, setS3SecretKey] = useState("");

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

    // Load album config
    const albumRes = await invoke<{ raw: string }>("read_config", { blogDir, filename: "album.config.json" });
    try {
      const albumParsed = parseConfig(albumRes.raw);
      albumConfigRef.current = albumParsed;
      setAlbumEnabled(albumParsed.enabled ?? false);
      if (albumParsed.provider) {
        setAlbumProvider({
          type: albumParsed.provider.type ?? "s3",
          endpoint: albumParsed.provider.endpoint ?? "",
          region: albumParsed.provider.region ?? "",
          bucket: albumParsed.provider.bucket ?? "",
          publicUrl: albumParsed.provider.publicUrl ?? "",
        });
      }
    } catch {
      albumConfigRef.current = {};
    }

    // Load .env
    const env = await invoke<{ s3_access_key: string | null; s3_secret_key: string | null }>("read_env", { blogDir });
    setS3AccessKey(env.s3_access_key ?? "");
    setS3SecretKey(env.s3_secret_key ?? "");

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

      // Save album config
      const albumObj = albumConfigRef.current || {};
      albumObj.enabled = albumEnabled;
      albumObj.provider = {
        type: albumProvider.type,
        endpoint: albumProvider.endpoint,
        region: albumProvider.region,
        bucket: albumProvider.bucket,
        publicUrl: albumProvider.publicUrl,
      };
      await invoke("write_config", { blogDir, filename: "album.config.json", content: serializeConfig(albumObj) });

      // Save .env keys
      if (s3AccessKey || s3SecretKey) {
        await invoke("write_env", { blogDir, s3AccessKey: s3AccessKey, s3SecretKey: s3SecretKey });
      }

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
    <div className="p-6 space-y-8 max-w-3xl">
      {/* Header - sticky */}
      <div className="settings-header flex items-center justify-between sticky top-0 z-10 py-4 -mx-6 px-6 bg-[--mdui-color-surface] border-b border-gray-200/60 backdrop-blur">
        <h2 className="text-xl font-medium">网站设置</h2>
        <mdui-button variant="tonal" loading={saving || undefined} onClick={handleSave}>
          保存
        </mdui-button>
      </div>

      {/* 个人设置 */}
      <section className="space-y-4">
        <h2 className="text-xl font-medium">个人设置</h2>
        <PersonalSettingsForm
          blogDir={blogDir}
          mode="settings"
          onNotify={(msg) => {
            setSnackMsg(msg);
            setSnackOpen(true);
            setTimeout(() => setSnackOpen(false), 2000);
          }}
        />
      </section>

      <mdui-divider />

      {/* 基本设置 */}
      <section className="space-y-4">
        <mdui-text-field
          variant="outlined"
          label="网站标题"
          value={title}
          onInput={(e: any) => setTitle(e.target.value)}
          required
        />
        <mdui-text-field
          variant="outlined"
          label="网站描述"
          value={description}
          onInput={(e: any) => setDescription(e.target.value)}
          rows={3}
        />
        <mdui-text-field
          variant="outlined"
          label="作者"
          value={author}
          onInput={(e: any) => setAuthor(e.target.value)}
        />
        <mdui-select
          variant="outlined"
          label="语言"
          value={language}
          onChange={(e: any) => setLanguage(e.target.value)}
        >
          <mdui-menu-item value="en">English</mdui-menu-item>
          <mdui-menu-item value="zh-CN">中文</mdui-menu-item>
          <mdui-menu-item value="ja">日本語</mdui-menu-item>
        </mdui-select>
      </section>

      {/* Logo & Favicon */}
      <section className="space-y-4">
        <h3 className="text-base font-medium text-gray-700">图标</h3>
        <ImageField
          label="Logo"
          src={getImageSrc(logo, pendingLogo)}
          path={pendingLogo ? pendingLogo.split(/[/\\]/).pop()! : logo}
          onSelect={() => selectImage("logo")}
          size="h-10 w-28"
        />
        <ImageField
          label="Favicon"
          src={getImageSrc(favicon, pendingFavicon)}
          path={pendingFavicon ? pendingFavicon.split(/[/\\]/).pop()! : favicon}
          onSelect={() => selectImage("favicon")}
          size="h-10 w-10"
        />
      </section>

      <mdui-divider />

      {/* Links */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-gray-700">友情链接</h3>
          <mdui-switch
            checked={linksEnabled || undefined}
            onChange={(e: any) => setLinksEnabled(e.target.checked)}
          />
        </div>
        {linksEnabled && (
          <div className="space-y-2">
            {linkItems.map((item, i) => (
              <div key={i} className="flex gap-2 items-center">
                <mdui-text-field
                  variant="outlined"
                  label="名称"
                  value={item.name}
                  onInput={(e: any) => {
                    const arr = [...linkItems];
                    arr[i] = { ...arr[i], name: e.target.value };
                    setLinkItems(arr);
                  }}
                  class="flex-1"
                />
                <mdui-text-field
                  variant="outlined"
                  label="URL"
                  value={item.url}
                  onInput={(e: any) => {
                    const arr = [...linkItems];
                    arr[i] = { ...arr[i], url: e.target.value };
                    setLinkItems(arr);
                  }}
                  class="flex-[2]"
                />
                <mdui-button-icon
                  icon="delete"
                  onClick={() => setLinkItems(linkItems.filter((_, j) => j !== i))}
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
      </section>

      <mdui-divider />

      {/* SocialLinks */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-medium text-gray-700">社交链接</h3>
          <mdui-switch
            checked={socialEnabled || undefined}
            onChange={(e: any) => setSocialEnabled(e.target.checked)}
          />
        </div>
        {socialEnabled && (
          <div className="space-y-3">
            {socialItems.map((item, i) => (
              <SocialLinkRow
                key={i}
                item={item}
                onChange={(updated) => {
                  const arr = [...socialItems];
                  arr[i] = updated;
                  setSocialItems(arr);
                }}
                onDelete={() => setSocialItems(socialItems.filter((_, j) => j !== i))}
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
      </section>

      <mdui-divider />

      {/* 高级选项 */}
      <section className="border rounded-lg overflow-hidden">
        <mdui-collapse>
          <mdui-collapse-item value="advanced">
            <div slot="header" className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none">
              <mdui-icon name="tune" />
              <span className="font-medium">高级选项</span>
            </div>
            <div className="space-y-4 px-4 pb-4">
              <div className="flex gap-3 items-center">
                <mdui-switch
                  checked={siteUrlEnabled || undefined}
                  onChange={(e: any) => setSiteUrlEnabled(e.target.checked)}
                />
                <mdui-text-field
                  variant="outlined"
                  label="网站 URL"
                  type="url"
                  value={siteUrl}
                  disabled={!siteUrlEnabled || undefined}
                  placeholder="https://example.com"
                  onInput={(e: any) => setSiteUrl(e.target.value)}
                  class="flex-1"
                />
              </div>
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
                placeholder="/"
                helper="子目录部署路径，如 /blog"
                onInput={(e: any) => setBasePath(e.target.value)}
              />
            </div>
          </mdui-collapse-item>
        </mdui-collapse>
      </section>

      <mdui-divider />

      {/* 相册设置 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium">相册设置</h2>
          <mdui-switch
            checked={albumEnabled || undefined}
            onChange={(e: any) => setAlbumEnabled(e.target.checked)}
          />
        </div>
        <div className="space-y-3">
          <mdui-select
            variant="outlined"
            label="存储类型"
            value={albumProvider.type}
            disabled={!albumEnabled || undefined}
            onChange={(e: any) => setAlbumProvider({ ...albumProvider, type: e.target.value })}
          >
            <mdui-menu-item value="s3">S3 兼容存储</mdui-menu-item>
          </mdui-select>
          <mdui-text-field
            variant="outlined"
            label="Endpoint"
            value={albumProvider.endpoint}
            disabled={!albumEnabled || undefined}
            placeholder="https://s3.amazonaws.com"
            onInput={(e: any) => setAlbumProvider({ ...albumProvider, endpoint: e.target.value })}
          />
          <mdui-text-field
            variant="outlined"
            label="Region"
            value={albumProvider.region}
            disabled={!albumEnabled || undefined}
            placeholder="us-east-1"
            onInput={(e: any) => setAlbumProvider({ ...albumProvider, region: e.target.value })}
          />
          <mdui-text-field
            variant="outlined"
            label="Bucket"
            value={albumProvider.bucket}
            disabled={!albumEnabled || undefined}
            onInput={(e: any) => setAlbumProvider({ ...albumProvider, bucket: e.target.value })}
          />
          <mdui-text-field
            variant="outlined"
            label="Public URL"
            value={albumProvider.publicUrl}
            disabled={!albumEnabled || undefined}
            placeholder="https://cdn.example.com"
            onInput={(e: any) => setAlbumProvider({ ...albumProvider, publicUrl: e.target.value })}
          />
          <mdui-text-field
            variant="outlined"
            label="S3 Access Key"
            value={s3AccessKey}
            disabled={!albumEnabled || undefined}
            type="password"
            toggle-password
            onInput={(e: any) => setS3AccessKey(e.target.value)}
          />
          <mdui-text-field
            variant="outlined"
            label="S3 Secret Key"
            value={s3SecretKey}
            disabled={!albumEnabled || undefined}
            type="password"
            toggle-password
            onInput={(e: any) => setS3SecretKey(e.target.value)}
          />
        </div>
      </section>

      <mdui-divider />

      {/* 软件设置 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-medium mb-0">软件设置</h2>
          <mdui-button variant="text" icon="content_copy" onClick={handleCopyEnv}>
            复制环境信息
          </mdui-button>
        </div>
        <mdui-card class="p-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">博客目录</p>
                <p className="text-sm text-gray-500">{blogDir}</p>
              </div>
              <mdui-button variant="text" onClick={() => invoke("open_in_explorer", { path: blogDir })}>
                打开
              </mdui-button>
            </div>
            <mdui-divider />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">@s-page/core</p>
                <p className="text-sm text-gray-500">{shellVersion ?? "未缓存"}</p>
              </div>
              <mdui-button variant="text" loading={updating || undefined} onClick={handleUpdateShell}>
                检查更新
              </mdui-button>
            </div>
            <div>
              <p className="font-medium">@s-page/engine</p>
              <p className="text-sm text-gray-500">{engineVersion}</p>
            </div>
            <div>
              <p className="font-medium">模板版本</p>
              <p className="text-sm text-gray-500">{templateVersion}</p>
            </div>
          </div>
        </mdui-card>
      </section>

      {/* Snackbar */}
      <mdui-snackbar open={snackOpen || undefined} placement="top">
        {snackMsg}
      </mdui-snackbar>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────

function ImageField({ label, src, path, onSelect, size }: {
  label: string;
  src: string;
  path: string;
  onSelect: () => void;
  size: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className={`${size} bg-gray-100 rounded border flex items-center justify-center overflow-hidden`}>
        <img
          src={src}
          alt={label}
          className="max-h-full max-w-full object-contain"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-gray-500">{path}</p>
      </div>
      <mdui-button variant="tonal" onClick={onSelect}>
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
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
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
          class="w-36"
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
          class="flex-1"
        />
        <mdui-button-icon icon="delete" onClick={onDelete} />
      </div>

      {isCustom && (
        <div className="flex gap-2 items-center">
          <div className="w-36 shrink-0" />
          <mdui-text-field
            variant="outlined"
            label="显示名称"
            value={item.label || ""}
            onInput={(e: any) => onChange({ ...item, label: e.target.value || undefined })}
            class="flex-1"
          />
          <mdui-text-field
            variant="outlined"
            label="图标路径"
            value={item.icon || ""}
            placeholder="https://example.com/icon.svg"
            onInput={(e: any) => onChange({ ...item, icon: e.target.value || undefined })}
            class="flex-1"
          />
          <div className="w-10 shrink-0" />
        </div>
      )}
    </div>
  );
}
