import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface PostSummary {
  filename: string;
  title: string;
  date: string;
  tags: string[];
  categories: string[];
  preview: string;
}

interface Props {
  blogDir: string;
  onEdit: (filename: string) => void;
}

export function PostList({ blogDir, onEdit }: Props) {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const dialogRef = useRef<any>(null);
  const createDialogRef = useRef<any>(null);
  const [newTitle, setNewTitle] = useState("");

  const loadPosts = async () => {
    setLoading(true);
    try {
      const list = await invoke<PostSummary[]>("list_posts", { blogDir });
      setPosts(list);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { loadPosts(); }, [blogDir]);

  const handleDeleteClick = (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(filename);
    dialogRef.current?.setAttribute("open", "");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await invoke("delete_post", { blogDir, filename: deleteTarget });
    setDeleteTarget(null);
    dialogRef.current?.removeAttribute("open");
    loadPosts();
  };

  const cancelDelete = () => {
    setDeleteTarget(null);
    dialogRef.current?.removeAttribute("open");
  };

  const openCreateDialog = () => {
    setNewTitle("");
    createDialogRef.current?.setAttribute("open", "");
  };

  const confirmCreate = async () => {
    if (!newTitle.trim()) return;
    const title = newTitle.trim();
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const filename = title.replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, "-") + ".md";
    const content = `---\ntitle: ${title}\ndate: ${now}\ntags: []\ncategories: []\npreview: \n---\n\n`;
    await invoke("create_post", { blogDir, filename, content });
    createDialogRef.current?.removeAttribute("open");
    onEdit(filename);
  };

  const handlePreview = async (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const slug = filename.replace(/\.md$/, "");
    let addr = await invoke<string | null>("get_serve_status");
    if (!addr) {
      addr = await invoke<string>("start_serve", { blogDir, openBrowser: false });
    }
    await invoke("open_url", { url: `${addr}/post/${slug}` });
  };

  return (
    <div className="workspace-page post-list-page">
      <header className="workspace-header">
        <div>
          <h2>文章</h2>
          <p>{loading ? "正在读取文章" : `${posts.length} 篇文章`}</p>
        </div>
        <mdui-button variant="filled" icon="add" onClick={openCreateDialog}>
          新建文章
        </mdui-button>
      </header>

      {loading ? (
        <div className="post-list-loading">
          <mdui-linear-progress />
        </div>
      ) : posts.length === 0 ? (
        <mdui-card class="post-empty-state" variant="outlined">
          <div className="post-empty-icon"><mdui-icon name="article" /></div>
          <h3>还没有文章</h3>
          <p>创建第一篇文章，开始记录和发布内容。</p>
          <mdui-button variant="tonal" icon="add" onClick={openCreateDialog}>
            创建文章
          </mdui-button>
        </mdui-card>
      ) : (
        <mdui-card class="post-list-surface" variant="outlined">
          <div className="post-list">
            {posts.map((post) => (
              <article
                key={post.filename}
                className="post-row"
                tabIndex={0}
                onClick={() => onEdit(post.filename)}
                onKeyDown={(event) => {
                  if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    onEdit(post.filename);
                  }
                }}
              >
                <div className="post-row-date">
                  <span>{post.date?.slice(5, 10).replace("-", "/") || "--/--"}</span>
                  <small>{post.date?.slice(0, 4) || ""}</small>
                </div>
                <div className="post-row-content">
                  <h3>{post.title || "未命名文章"}</h3>
                  <p className={post.preview ? undefined : "is-empty"}>
                    {post.preview || "暂无摘要"}
                  </p>
                  <div className="post-row-meta">
                    {post.categories.map((category) => (
                      <span key={`category-${category}`} className="post-category">{category}</span>
                    ))}
                    {post.tags.map((tag) => (
                      <span key={`tag-${tag}`} className="post-tag">#{tag}</span>
                    ))}
                    {!post.categories.length && !post.tags.length && (
                      <span className="post-meta-empty">暂无分类和标签</span>
                    )}
                  </div>
                </div>
                <div className="post-row-actions">
                  <mdui-tooltip content="预览" placement="top" trigger="hover">
                    <mdui-button-icon
                      icon="visibility"
                      aria-label="预览文章"
                      onClick={(e: any) => handlePreview(post.filename, e)}
                    />
                  </mdui-tooltip>
                  <mdui-tooltip content="删除" placement="top" trigger="hover">
                    <mdui-button-icon
                      icon="delete"
                      aria-label="删除文章"
                      onClick={(e: any) => handleDeleteClick(post.filename, e)}
                    />
                  </mdui-tooltip>
                </div>
                <mdui-icon class="post-row-arrow" name="chevron_right" aria-hidden="true" />
              </article>
            ))}
          </div>
        </mdui-card>
      )}

      {/* 新建文章 Dialog */}
      <mdui-dialog ref={createDialogRef} headline="新建文章" class="create-dialog">
        <div className="px-6 pb-2">
          <mdui-text-field
            variant="outlined"
            label="文章标题"
            value={newTitle}
            onInput={(e: any) => setNewTitle(e.target.value)}
            onKeyDown={(e: any) => { if (e.key === "Enter") confirmCreate(); }}
          />
        </div>
        <mdui-button slot="action" variant="text" onClick={() => createDialogRef.current?.removeAttribute("open")}>
          取消
        </mdui-button>
        <mdui-button slot="action" variant="text" onClick={confirmCreate}>
          创建
        </mdui-button>
      </mdui-dialog>

      {/* 删除确认 Dialog */}
      <mdui-dialog ref={dialogRef} headline="确认删除">
        <div className="px-6 pb-2">
          确定要删除「{deleteTarget}」吗？此操作不可撤销。
        </div>
        <mdui-button slot="action" variant="text" onClick={cancelDelete}>
          取消
        </mdui-button>
        <mdui-button slot="action" variant="text" onClick={confirmDelete}>
          删除
        </mdui-button>
      </mdui-dialog>
    </div>
  );
}
