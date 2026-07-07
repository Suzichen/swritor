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

export interface PersonalSettingsFormHandle {
  /** Save nickname + avatar. Returns true on success. */
  saveProfile: () => Promise<boolean>;
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
}



export const PersonalSettingsForm = forwardRef<PersonalSettingsFormHandle, Props>(
  function PersonalSettingsForm({ blogDir, mode, showProfileSaveButton, onSaved, onNotify }, ref) {
    const {
      user,
      isLoggedIn,
      updateName,
      updateAvatar,
      createSite,
      listSites,
    } = useAuth();

    const showSaveBtn = showProfileSaveButton ?? mode === "settings";

    // Profile fields
    const [name, setName] = useState("");
    const [configLogo, setConfigLogo] = useState("/logo.png");
    const [pendingAvatar, setPendingAvatar] = useState<string | null>(null);
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileError, setProfileError] = useState("");

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
          setConfigLogo(parsed.logo ?? "/logo.png");
          setName((prev) => prev || user?.name || parsed.author || "");
        } catch {
          if (!cancelled) setName((prev) => prev || user?.name || "");
        }
      })();
      reloadSites();
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blogDir]);

    const notify = (msg: string) => onNotify?.(msg);

    // ── Avatar preview ─────────────────────────────────────
    const avatarSrc = (): string => {
      if (pendingAvatar) return convertFileSrc(pendingAvatar);
      if (user?.avatar) return user.avatar;
      return convertFileSrc(`${blogDir}/public${configLogo}`);
    };

    const selectAvatar = async () => {
      const path = await invoke<string | null>("select_image");
      if (path) setPendingAvatar(path);
    };

    // ── Profile save (exposed to dialog via ref) ───────────
    const saveProfile = useCallback(async (): Promise<boolean> => {
      setProfileError("");
      setSavingProfile(true);
      try {
        const trimmed = name.trim();
        if (trimmed !== (user?.name ?? "")) {
          await updateName(trimmed);
        }
        if (pendingAvatar) {
          await updateAvatar(pendingAvatar);
          setPendingAvatar(null);
        }
        notify("个人资料已保存");
        onSaved?.();
        return true;
      } catch (e: any) {
        setProfileError(String(e));
        return false;
      } finally {
        setSavingProfile(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name, pendingAvatar, user, updateName, updateAvatar]);

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
      return <p className="text-sm text-gray-500">登录后可设置昵称、头像与博客网址。</p>;
    }

    return (
      <div className="space-y-6">
        {/* 昵称 + 头像 */}
        <div className="space-y-4">
          <mdui-text-field
            variant="outlined"
            label="用户昵称"
            placeholder="请输入用户名"
            value={name}
            onInput={(e: any) => setName(e.target.value)}
          />

          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-gray-100 border flex items-center justify-center overflow-hidden shrink-0">
              <img
                src={avatarSrc()}
                alt="头像"
                className="max-h-full max-w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">头像</p>
              <p className="text-xs text-gray-500">
                {pendingAvatar ? pendingAvatar.split(/[/\\]/).pop() : "默认使用博客 Logo"}
              </p>
            </div>
            <mdui-button variant="tonal" onClick={selectAvatar}>
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
                onClick={saveProfile}
              >
                保存个人资料
              </mdui-button>
            </div>
          )}
        </div>

        <mdui-divider />

        {/* 博客网址 / 站点 */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">博客网址</p>

          {/* 已有站点列表 */}
          {sites.map((site) => (
            <div key={site.siteSlug} className="flex items-center gap-2">
              <mdui-text-field
                variant="outlined"
                label="博客网址"
                value={site.siteSlug}
                disabled
                class="flex-1"
              />
              <span className="text-sm text-gray-500 shrink-0">.{PAGES_ROOT_DOMAIN}</span>
            </div>
          ))}

          {/* 新申请输入框（未达上限时显示） */}
          {sites.length < MAX_SITES && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <mdui-text-field
                  variant="outlined"
                  label={sites.length === 0 ? "博客网址" : "再申请一个网址"}
                  placeholder="例如 my-blog"
                  value={slugInput}
                  onInput={(e: any) => setSlugInput(e.target.value)}
                  class="flex-1"
                />
                <span className="text-sm text-gray-500 shrink-0">.{PAGES_ROOT_DOMAIN}</span>
                <mdui-button
                  variant="filled"
                  loading={applying || undefined}
                  onClick={applySite}
                >
                  申请
                </mdui-button>
              </div>
              <p className="text-xs text-gray-400">
                只能包含小写字母、数字和连字符（3-32 位），申请后不可修改。
              </p>
            </div>
          )}

          {siteError && (
            <p className="text-sm" style={{ color: "#dc2626" }}>{siteError}</p>
          )}

          <p className="flex items-center gap-1 text-xs text-gray-400">
            <mdui-icon name="info" style={{ fontSize: 14 }} />
            申请后可一键部署到 spage.me。
          </p>
        </div>
      </div>
    );
  }
);
