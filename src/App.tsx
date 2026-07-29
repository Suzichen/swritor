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
import { AppSidebar, type AppPage } from "./components/layout/AppSidebar";
import { getPreviewStatus, sameDirectory, stopPreview } from "./utils/preview";

const SKIP_SETUP_KEY = "swritor-skip-site-setup";

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
  const [page, setPage] = useState<AppPage>("control");
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [blogDir, setBlogDir] = useState<string>("");
  const [showInit, setShowInit] = useState(false);
  const [authDialogMode, setAuthDialogMode] = useState<"login" | "register" | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pendingBlogDir, setPendingBlogDir] = useState<string | null>(null);
  const [pendingDirectoryPicker, setPendingDirectoryPicker] = useState(false);
  const [switchingBlogDir, setSwitchingBlogDir] = useState(false);
  const [switchError, setSwitchError] = useState("");

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

  const applyBlogDir = (dir: string) => {
    setBlogDir(dir);
    localStorage.setItem("swritor-dir", dir);
  };

  const requestBlogDirChange = async (dir: string) => {
    if (sameDirectory(blogDir, dir)) return true;
    const status = await getPreviewStatus();
    if (status) {
      setSwitchError("");
      setPendingBlogDir(dir);
      return false;
    }
    applyBlogDir(dir);
    return true;
  };

  const selectAndApplyBlogDir = async () => {
    const dir = await invoke<string | null>("select_directory");
    if (dir) applyBlogDir(dir);
  };

  const selectBlogDir = async () => {
    const status = await getPreviewStatus();
    if (status) {
      setSwitchError("");
      setPendingDirectoryPicker(true);
      return;
    }
    await selectAndApplyBlogDir();
  };

  const confirmBlogDirChange = async () => {
    if (!pendingBlogDir && !pendingDirectoryPicker) return;
    setSwitchingBlogDir(true);
    setSwitchError("");
    try {
      await stopPreview();
      if (pendingBlogDir) {
        applyBlogDir(pendingBlogDir);
        setShowInit(false);
      }
      const shouldOpenPicker = pendingDirectoryPicker;
      setPendingBlogDir(null);
      setPendingDirectoryPicker(false);
      if (shouldOpenPicker) await selectAndApplyBlogDir();
    } catch (error) {
      setSwitchError(`关闭预览服务器失败: ${String(error)}`);
    } finally {
      setSwitchingBlogDir(false);
    }
  };

  const handleInitComplete = async (projectPath: string) => {
    if (await requestBlogDirChange(projectPath)) setShowInit(false);
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

  const directorySwitchDialog = (
    <mdui-dialog
      open={Boolean(pendingBlogDir || pendingDirectoryPicker) || undefined}
      headline={pendingDirectoryPicker ? "关闭预览并选择目录？" : "关闭预览并切换目录？"}
      close-on-esc
      close-on-overlay-click
      onclose={() => {
        if (!switchingBlogDir) {
          setPendingBlogDir(null);
          setPendingDirectoryPicker(false);
        }
      }}
    >
      <div className="px-6 pb-2">
        <p>
          {pendingDirectoryPicker
            ? "预览服务器正在运行。继续后会先关闭当前预览，再打开博客目录选择器。"
            : "预览服务器正在运行。继续后会先关闭当前预览，再切换到新博客目录。"}
        </p>
        {switchError && <p className="mt-3 text-sm text-red-600">{switchError}</p>}
      </div>
      <mdui-button
        slot="action"
        variant="text"
        disabled={switchingBlogDir || undefined}
        onClick={() => {
          setPendingBlogDir(null);
          setPendingDirectoryPicker(false);
        }}
      >
        取消
      </mdui-button>
      <mdui-button
        slot="action"
        variant="text"
        loading={switchingBlogDir || undefined}
        onClick={confirmBlogDirChange}
      >
        关闭并切换
      </mdui-button>
    </mdui-dialog>
  );

  if (showInit) {
    return (
      <>
        <InitBlog onComplete={handleInitComplete} onCancel={() => setShowInit(false)} />
        {directorySwitchDialog}
      </>
    );
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
      <AppSidebar
        page={page}
        setPage={setPage}
        blogDir={blogDir}
        isConfigured={isConfigured}
        isLoggedIn={isLoggedIn}
        user={user}
        logout={logout}
        onInit={() => setShowInit(true)}
        selectBlogDir={selectBlogDir}
        onLogin={() => setAuthDialogMode("login")}
        onCollapsedChange={setSidebarCollapsed}
      />

      <mdui-layout-main>
        {page === "control" && <ControlCenter blogDir={blogDir} />}
        {page === "posts" && (
          <PostList blogDir={blogDir} onEdit={setEditingPost} />
        )}
        {page === "albums" && <Albums blogDir={blogDir} />}
        {page === "settings" && <Settings blogDir={blogDir} />}
      </mdui-layout-main>

      {directorySwitchDialog}

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
