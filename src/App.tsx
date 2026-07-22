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
