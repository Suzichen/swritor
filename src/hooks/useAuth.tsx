import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface UserInfo {
  id: string;
  email: string;
  verified: boolean;
  siteSlug: string | null;
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
