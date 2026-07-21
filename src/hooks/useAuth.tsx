import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface UserInfo {
  id: string;
  email: string;
  verified: boolean;
  siteSlug: string | null;
  name?: string | null;
  avatar?: string | null;
}

/** Site record as returned by the Rust `site_create` / `sites_list` commands. */
export interface SiteInfo {
  siteSlug: string;
  hostname: string;
}

interface AuthStatusResponse {
  loggedIn: boolean;
  user: UserInfo | null;
}

interface AuthContextValue {
  user: UserInfo | null;
  isLoggedIn: boolean;
  isConfigured: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserInfo>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  requestVerification: (email: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  // Profile
  updateProfile: (name: string, avatarFilePath?: string | null) => Promise<void>;
  updateName: (name: string) => Promise<void>;
  updateAvatar: (filePath: string) => Promise<string>;
  // Sites
  createSite: (siteSlug: string) => Promise<SiteInfo>;
  listSites: () => Promise<SiteInfo[]>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await invoke<AuthStatusResponse>("auth_get_status");
      setUser(status.loggedIn ? status.user : null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    invoke<boolean>("auth_is_configured").then((configured) => {
      setIsConfigured(configured);
      if (configured) {
        refreshStatus().finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
  }, [refreshStatus]);

  const login = async (email: string, password: string): Promise<UserInfo> => {
    const userInfo = await invoke<UserInfo>("auth_login", { email, password });
    setUser(userInfo);
    return userInfo;
  };

  const register = async (email: string, password: string): Promise<void> => {
    await invoke<void>("auth_register", { email, password });
  };

  const logout = async () => {
    await invoke<void>("auth_logout");
    setUser(null);
  };

  const requestVerification = async (email: string) => {
    await invoke<void>("auth_request_verification", { email });
  };

  // ── Profile ──────────────────────────────────────────────

  const updateProfile = async (name: string, avatarFilePath?: string | null): Promise<void> => {
    await invoke<void>("profile_update", { name, avatarFilePath: avatarFilePath ?? null });
    await refreshStatus();
  };

  const updateName = async (name: string): Promise<void> => {
    await invoke<void>("profile_update_name", { name });
    await refreshStatus();
  };

  const updateAvatar = async (filePath: string): Promise<string> => {
    const url = await invoke<string>("profile_update_avatar", { filePath });
    await refreshStatus();
    return url;
  };

  // ── Sites / hostname ─────────────────────────────────────

  const createSite = async (siteSlug: string): Promise<SiteInfo> => {
    const site = await invoke<SiteInfo>("site_create", { siteSlug });
    await refreshStatus();
    return site;
  };



  const listSites = async (): Promise<SiteInfo[]> => {
    return await invoke<SiteInfo[]>("sites_list");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoggedIn: !!user,
        isConfigured,
        loading,
        login,
        register,
        logout,
        requestVerification,
        refreshStatus,
        updateProfile,
        updateName,
        updateAvatar,
        createSite,
        listSites,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
