import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PostList } from "./pages/PostList";
import { PostEditor } from "./pages/PostEditor";
import { Albums } from "./pages/Albums";
import { Settings } from "./pages/Settings";
import { InitBlog } from "./pages/InitBlog";
import { ControlCenter } from "./pages/ControlCenter";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { LoginDialog } from "./components/auth/LoginDialog";
import { RegisterDialog } from "./components/auth/RegisterDialog";
import { FirstTimeSetupDialog } from "./components/settings/FirstTimeSetupDialog";
import { WindowShell } from "./components/common/WindowShell";

type Page = "control" | "posts" | "albums" | "settings";

const SKIP_SETUP_KEY = "swritor-skip-site-setup";
const SIDEBAR_COLLAPSE_QUERY = "(max-width: 719px)";

function App() {
  return (
    <WindowShell>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </WindowShell>
  );
}

function AppContent() {
  const { user, isLoggedIn, isConfigured, logout } = useAuth();
  const [page, setPage] = useState<Page>("control");
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [blogDir, setBlogDir] = useState<string>("");
  const [showInit, setShowInit] = useState(false);
  const [authDialogMode, setAuthDialogMode] = useState<"login" | "register" | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.matchMedia(SIDEBAR_COLLAPSE_QUERY).matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(SIDEBAR_COLLAPSE_QUERY);
    const syncSidebarWithViewport = (event: MediaQueryListEvent) => {
      setSidebarCollapsed(event.matches);
    };

    mediaQuery.addEventListener("change", syncSidebarWithViewport);
    return () => mediaQuery.removeEventListener("change", syncSidebarWithViewport);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("swritor-dir");
    if (saved) setBlogDir(saved);
  }, []);

  // This effect only opens the dialog. Closing remains an explicit user action
  // so refreshing the profile while the dialog is open cannot dismiss it.
  useEffect(() => {
    if (!isLoggedIn) {
      setShowSetup(false);
      return;
    }
    if (
      user &&
      !user.siteSlug &&
      !localStorage.getItem(SKIP_SETUP_KEY)
    ) {
      setShowSetup(true);
    }
  }, [isLoggedIn, user?.id, user?.siteSlug]);

  const skipSetup = () => {
    localStorage.setItem(SKIP_SETUP_KEY, "1");
    setShowSetup(false);
  };

  const selectBlogDir = async () => {
    const dir = await invoke<string | null>("select_directory");
    if (dir) {
      setBlogDir(dir);
      localStorage.setItem("swritor-dir", dir);
    }
  };

  const handleInitComplete = (projectPath: string) => {
    setBlogDir(projectPath);
    localStorage.setItem("swritor-dir", projectPath);
    setShowInit(false);
  };

  if (!blogDir && !showInit) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <mdui-card class="p-8 text-center" style={{ maxWidth: 420 }}>
          <h2 className="text-2xl font-medium mb-2">Swritor</h2>
          <p className="text-sm text-gray-600 mb-6">博客管理桌面应用程序</p>
          <div className="space-y-3">
            <mdui-button variant="filled" full-width onClick={selectBlogDir}>
              选择现有博客目录
            </mdui-button>
            <mdui-button variant="outlined" full-width onClick={() => setShowInit(true)}>
              初始化新博客
            </mdui-button>
          </div>
        </mdui-card>
      </div>
    );
  }

  if (showInit) {
    return <InitBlog onComplete={handleInitComplete} onCancel={() => setShowInit(false)} />;
  }

  if (editingPost !== null) {
    return (
      <PostEditor
        blogDir={blogDir}
        filename={editingPost}
        onBack={() => setEditingPost(null)}
      />
    );
  }

  return (
    <mdui-layout
      class={`app-layout${sidebarCollapsed ? " app-layout-sidebar-collapsed" : ""}`}
      full-height
    >
      <mdui-navigation-drawer
        class={`app-sidebar${sidebarCollapsed ? " app-sidebar-collapsed" : ""}`}
        open
        contained
      >
        <div className="app-sidebar-header">
          {!sidebarCollapsed && (
            <div className="app-sidebar-title">
              <h1>Swritor</h1>
              <p title={blogDir}>{blogDir.split(/[/\\]/).pop()}</p>
            </div>
          )}
          <mdui-tooltip content={sidebarCollapsed ? "展开侧栏" : "收起侧栏"} placement="right" trigger="hover">
            <mdui-button-icon
              icon={sidebarCollapsed ? "menu" : "menu_open"}
              aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            />
          </mdui-tooltip>
        </div>
        <mdui-list>
          <mdui-tooltip content="控制中心" placement="right" trigger="hover" disabled={!sidebarCollapsed}>
            <mdui-list-item
              active={page === "control" ? true : undefined}
              onClick={() => setPage("control")}
              icon="dashboard"
              aria-label="控制中心"
            >
              控制中心
            </mdui-list-item>
          </mdui-tooltip>
          <mdui-tooltip content="文章" placement="right" trigger="hover" disabled={!sidebarCollapsed}>
            <mdui-list-item
              active={page === "posts" ? true : undefined}
              onClick={() => setPage("posts")}
              icon="article"
              aria-label="文章"
            >
              文章
            </mdui-list-item>
          </mdui-tooltip>
          <mdui-tooltip content="相册" placement="right" trigger="hover" disabled={!sidebarCollapsed}>
            <mdui-list-item
              active={page === "albums" ? true : undefined}
              onClick={() => setPage("albums")}
              icon="photo_library"
              aria-label="相册"
            >
              相册
            </mdui-list-item>
          </mdui-tooltip>
          <mdui-tooltip content="设置" placement="right" trigger="hover" disabled={!sidebarCollapsed}>
            <mdui-list-item
              active={page === "settings" ? true : undefined}
              onClick={() => setPage("settings")}
              icon="settings"
              aria-label="设置"
            >
              设置
            </mdui-list-item>
          </mdui-tooltip>
        </mdui-list>
        <div className="app-sidebar-actions">
          {sidebarCollapsed ? (
            <>
              <mdui-tooltip content="初始化新博客" placement="right" trigger="hover">
                <mdui-button-icon icon="add_box" aria-label="初始化新博客" onClick={() => setShowInit(true)} />
              </mdui-tooltip>
              <mdui-tooltip content="切换目录" placement="right" trigger="hover">
                <mdui-button-icon icon="folder_open" aria-label="切换目录" onClick={selectBlogDir} />
              </mdui-tooltip>
              {isConfigured && (isLoggedIn ? (
                <mdui-tooltip content="退出登录" placement="right" trigger="hover">
                  <mdui-button-icon icon="logout" aria-label="退出登录" onClick={logout} />
                </mdui-tooltip>
              ) : (
                <mdui-tooltip content="登录" placement="right" trigger="hover">
                  <mdui-button-icon icon="person" aria-label="登录" onClick={() => setAuthDialogMode("login")} />
                </mdui-tooltip>
              ))}
            </>
          ) : (
            <>
              <mdui-button variant="text" full-width onClick={() => setShowInit(true)}>
                初始化新博客
              </mdui-button>
              <mdui-button variant="text" full-width onClick={selectBlogDir}>
                切换目录
              </mdui-button>
              {isConfigured && (isLoggedIn ? (
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-gray-500 truncate">
                    {user?.siteSlug ? `${user.siteSlug}.spage.me` : "已登录"}
                  </p>
                  <mdui-button-icon icon="logout" aria-label="退出登录" onClick={logout} />
                </div>
              ) : (
                <mdui-button variant="text" icon="person" onClick={() => setAuthDialogMode("login")}>
                  登录
                </mdui-button>
              ))}
            </>
          )}
        </div>
      </mdui-navigation-drawer>

      <mdui-layout-main>
        {page === "control" && <ControlCenter blogDir={blogDir} />}
        {page === "posts" && (
          <PostList blogDir={blogDir} onEdit={setEditingPost} />
        )}
        {page === "albums" && <Albums blogDir={blogDir} />}
        {page === "settings" && <Settings blogDir={blogDir} />}
      </mdui-layout-main>

      <LoginDialog
        open={authDialogMode === "login"}
        onClose={() => setAuthDialogMode(null)}
        onSwitchToRegister={() => setAuthDialogMode("register")}
      />
      <RegisterDialog
        open={authDialogMode === "register"}
        onClose={() => setAuthDialogMode(null)}
        onSwitchToLogin={() => setAuthDialogMode("login")}
      />
      <FirstTimeSetupDialog
        open={showSetup}
        blogDir={blogDir}
        onSkip={skipSetup}
        onClose={() => setShowSetup(false)}
      />
    </mdui-layout>
  );
}

export default App;
