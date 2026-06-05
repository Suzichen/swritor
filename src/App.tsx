import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PostList } from "./pages/PostList";
import { PostEditor } from "./pages/PostEditor";
import { Albums } from "./pages/Albums";
import { Settings } from "./pages/Settings";

type Page = "posts" | "albums" | "settings";

function App() {
  const [page, setPage] = useState<Page>("posts");
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [blogDir, setBlogDir] = useState<string>("");

  // 启动时尝试加载上次的博客目录
  useEffect(() => {
    const saved = localStorage.getItem("s-blog-admin-dir");
    if (saved) setBlogDir(saved);
  }, []);

  const selectBlogDir = async () => {
    const dir = await invoke<string | null>("select_directory");
    if (dir) {
      setBlogDir(dir);
      localStorage.setItem("s-blog-admin-dir", dir);
    }
  };

  if (!blogDir) {
    return (
      <div className="h-screen flex items-center justify-center">
        <mdui-card class="p-8 text-center" style={{ maxWidth: 400 }}>
          <h2 className="text-xl font-medium mb-4">选择博客目录</h2>
          <p className="text-sm text-gray-600 mb-6">请选择您的 s-blog 项目目录</p>
          <mdui-button variant="filled" onClick={selectBlogDir}>
            选择目录
          </mdui-button>
        </mdui-card>
      </div>
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
    <mdui-layout>
      <mdui-navigation-drawer open contained>
        <div className="p-4 pb-2">
          <h1 className="text-lg font-medium">S-Blog Admin</h1>
          <p className="text-xs text-gray-500 truncate" title={blogDir}>
            {blogDir.split(/[/\\]/).pop()}
          </p>
        </div>
        <mdui-list>
          <mdui-list-item
            active={page === "posts" ? true : undefined}
            onClick={() => setPage("posts")}
            icon="article"
          >
            文章列表
          </mdui-list-item>
          <mdui-list-item
            active={page === "albums" ? true : undefined}
            onClick={() => setPage("albums")}
            icon="photo_library"
          >
            相册列表
          </mdui-list-item>
          <mdui-list-item
            active={page === "settings" ? true : undefined}
            onClick={() => setPage("settings")}
            icon="settings"
          >
            设置
          </mdui-list-item>
        </mdui-list>
        <div className="mt-auto p-4">
          <mdui-button variant="text" full-width onClick={selectBlogDir}>
            切换目录
          </mdui-button>
        </div>
      </mdui-navigation-drawer>

      <mdui-layout-main>
        {page === "posts" && (
          <PostList blogDir={blogDir} onEdit={setEditingPost} />
        )}
        {page === "albums" && <Albums blogDir={blogDir} />}
        {page === "settings" && <Settings blogDir={blogDir} />}
      </mdui-layout-main>
    </mdui-layout>
  );
}

export default App;
