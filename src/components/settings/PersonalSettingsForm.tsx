import {
  forwardRef,
  useImperativeHandle,
  useState,
  useEffect,
  useCallback,
} from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { useAuth, type SiteInfo } from "../../hooks/useAuth";
import { parseConfig } from "../../utils/configParser";

const PAGES_ROOT_DOMAIN = "spage.me";
const MAX_SITES = 2;

interface SaveProfileOptions {
  persistDefaults?: boolean;
  notify?: boolean;
  /** Create the slug entered in the first-time setup form before closing. */
  siteSlug?: string;
}

export interface PersonalSettingsFormHandle {
  /** Save nickname + avatar. Returns true on success. */
  saveProfile: (options?: SaveProfileOptions) => Promise<boolean>;
}

interface Props {
  blogDir: string;
  mode: "dialog" | "settings";
  /** Whether to render the in-form 保存 button for nickname/avatar.
   *  Defaults to true in settings mode, false in dialog mode (dialog footer saves). */
  showProfileSaveButton?: boolean;
  /** Called after a successful profile save or site application. */
  onSaved?: () => void;
  /** Called to surface a transient message (used by Settings snackbar). */
  onNotify?: (msg: string) => void;
  onReadyChange?: (ready: boolean) => void;
}

function localPublicAssetPath(blogDir: string, assetPath: string): string | null {
  if (
    !assetPath.startsWith("/") ||
    assetPath.startsWith("//") ||
    assetPath.split("/").includes("..")
  ) {
    return null;
  }
  return `${blogDir}/public${assetPath}`;
}

export const PersonalSettingsForm = forwardRef<PersonalSettingsFormHandle, Props>(
  function PersonalSettingsForm({ blogDir, mode, showProfileSaveButton, onSaved, onNotify, onReadyChange }, ref) {
    const {
      user,
      isLoggedIn,
      updateProfile,
      createSite,
      listSites,
    } = useAuth();

    const showSaveBtn = showProfileSaveButton ?? mode === "settings";

    // Profile fields
    const [name, setName] = useState("");
    const [nameEdited, setNameEdited] = useState(false);
    const [configAuthor, setConfigAuthor] = useState("");
    const [configLogo, setConfigLogo] = useState("/logo.png");
    const [pendingAvatar, setPendingAvatar] = useState<string | null>(null);
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileError, setProfileError] = useState("");
    const [profileReady, setProfileReady] = useState(false);

    // Sites
    const [sites, setSites] = useState<SiteInfo[]>([]);
    const [slugInput, setSlugInput] = useState("");
    const [applying, setApplying] = useState(false);
    const [siteError, setSiteError] = useState("");


    const reloadSites = useCallback(async () => {
      if (!isLoggedIn) return;
      try {
        const list = await listSites();
        setSites(list);
      } catch {
        // ignore — listing issues shouldn't break the form
      }
    }, [isLoggedIn, listSites]);

    // Load config defaults (author -> nickname default, logo -> avatar default)
    useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          const { raw } = await invoke<{ raw: string }>("read_config", {
            blogDir,
            filename: "config.json",
          });
          const parsed = parseConfig(raw);
          if (cancelled) return;
          const fallbackAuthor = parsed.author ?? "";
          setConfigAuthor(fallbackAuthor);
          setConfigLogo(parsed.logo || "/logo.png");
          if (!nameEdited) setName(user?.name || fallbackAuthor);
          setProfileReady(true);
        } catch {
          if (!cancelled && !nameEdited) setName(user?.name || "");
          if (!cancelled) setProfileReady(true);
        }
      })();
      reloadSites();
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blogDir]);

    useEffect(() => {
      if (!nameEdited) setName(user?.name || configAuthor);
    }, [configAuthor, nameEdited, user?.name]);

    useEffect(() => {
      onReadyChange?.(profileReady);
    }, [onReadyChange, profileReady]);

    const notify = (msg: string) => onNotify?.(msg);

    // ── Avatar preview ─────────────────────────────────────
    const avatarSrc = (): string => {
      if (pendingAvatar) return convertFileSrc(pendingAvatar);
      if (user?.avatar) return user.avatar;
      const localPath = localPublicAssetPath(blogDir, configLogo);
      return localPath ? convertFileSrc(localPath) : configLogo;
    };

    const selectAvatar = async () => {
      const path = await invoke<string | null>("select_image");
      if (path) setPendingAvatar(path);
    };

    // ── Profile save (exposed to dialog via ref) ───────────
    const saveProfile = useCallback(async (options: SaveProfileOptions = {}): Promise<boolean> => {
      const {
        persistDefaults = false,
        notify: shouldNotify = true,
        siteSlug: requestedSiteSlug,
      } = options;
      if (!profileReady) {
        setProfileError("个人资料仍在加载，请稍后再试");
        return false;
      }
      setProfileError("");
      setSiteError("");
      setSavingProfile(true);
      try {
        const trimmed = name.trim();
        const slug = (requestedSiteSlug ?? (persistDefaults ? slugInput : ""))
          .trim()
          .toLowerCase();
        const avatarPath = pendingAvatar
          ?? (persistDefaults && !user?.avatar
            ? localPublicAssetPath(blogDir, configLogo)
            : null);
        if (trimmed !== (user?.name ?? "") || avatarPath) {
          await updateProfile(trimmed, avatarPath);
          if (avatarPath) setPendingAvatar(null);
        }
        if (slug) {
          await createSite(slug);
          await reloadSites();
          setSlugInput("");
        }
        if (shouldNotify) notify(slug ? "个人资料和博客网址已保存" : "个人资料已保存");
        onSaved?.();
        return true;
      } catch (e: any) {
        setProfileError(String(e));
        return false;
      } finally {
        setSavingProfile(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      blogDir,
      configLogo,
      createSite,
      name,
      pendingAvatar,
      profileReady,
      reloadSites,
      slugInput,
      updateProfile,
      user,
    ]);

    useImperativeHandle(ref, () => ({ saveProfile }), [saveProfile]);

    // ── Site application ───────────────────────────────────
    const applySite = async () => {
      const slug = slugInput.trim().toLowerCase();
      if (!slug) {
        setSiteError("请输入博客网址");
        return;
      }
      setSiteError("");
      setApplying(true);
      try {
        await createSite(slug);
        setSlugInput("");
        await reloadSites();
        notify(`已申请站点 ${slug}.${PAGES_ROOT_DOMAIN}`);
        onSaved?.();
      } catch (e: any) {
        setSiteError(String(e));
      } finally {
        setApplying(false);
      }
    };



    if (!isLoggedIn) {
      return (
        <div className="settings-login-required">
          <mdui-icon name="lock" />
          <div>
            <p>需要登录</p>
            <span>登录后可设置昵称、头像与博客网址。</span>
          </div>
        </div>
      );
    }

    return (
      <div className="personal-settings-form">
        <div className="personal-settings-profile">
          <mdui-text-field
            variant="outlined"
            label="用户昵称"
            placeholder="请输入用户名"
            helper="显示在博客作者资料中"
            value={name}
            onInput={(e: any) => {
              setNameEdited(true);
              setName(e.target.value);
            }}
          />

          <div className="personal-avatar-row">
            <div className="personal-avatar-preview">
              <img
                src={avatarSrc()}
                alt="头像"
                className="max-h-full max-w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
            <div className="personal-avatar-copy">
              <p>头像</p>
              <span>
                {pendingAvatar ? pendingAvatar.split(/[/\\]/).pop() : "默认使用博客 Logo"}
              </span>
            </div>
            <mdui-button variant="tonal" icon="upload" onClick={selectAvatar}>
              更换
            </mdui-button>
          </div>

          {profileError && (
            <p className="text-sm" style={{ color: "#dc2626" }}>{profileError}</p>
          )}

          {showSaveBtn && (
            <div>
              <mdui-button
                variant="tonal"
                loading={savingProfile || undefined}
                disabled={!profileReady || undefined}
                onClick={() => saveProfile()}
              >
                保存个人资料
              </mdui-button>
            </div>
          )}
        </div>

        <div className="personal-settings-sites">
          <div className="personal-settings-subheading">
            <p>博客网址</p>
            <span>申请专属地址，用于一键部署到 spage.me。</span>
          </div>

          {/* 已有站点列表 */}
          {sites.map((site) => (
            <mdui-text-field
              key={site.siteSlug}
              variant="outlined"
              label="已申请的网址"
              value={`${site.siteSlug}.${PAGES_ROOT_DOMAIN}`}
              disabled
            />
          ))}

          {/* 新申请输入框（未达上限时显示） */}
          {sites.length < MAX_SITES && (
            <div className={`personal-site-apply${mode === "dialog" ? " personal-site-apply-dialog" : ""}`}>
              <mdui-text-field
                variant="outlined"
                label={sites.length === 0 ? "申请博客网址" : "再申请一个网址"}
                placeholder="my-blog"
                suffix={`.${PAGES_ROOT_DOMAIN}`}
                helper="3–32 位小写字母、数字或连字符；申请后不可修改"
                value={slugInput}
                onInput={(e: any) => setSlugInput(e.target.value)}
              />
              {mode === "settings" && (
                <mdui-button
                  variant="filled"
                  loading={applying || undefined}
                  onClick={applySite}
                >
                  申请
                </mdui-button>
              )}
            </div>
          )}

          {siteError && (
            <p className="text-sm" style={{ color: "#dc2626" }}>{siteError}</p>
          )}

        </div>
      </div>
    );
  }
);
