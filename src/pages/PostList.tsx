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
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-medium">文章列表</h2>
        <mdui-button variant="tonal" icon="add" onClick={openCreateDialog}>
          新建
        </mdui-button>
      </div>

      {loading ? (
        <mdui-linear-progress></mdui-linear-progress>
      ) : posts.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <p>暂无文章</p>
          <mdui-button variant="tonal" class="mt-4" onClick={openCreateDialog}>
            创建第一篇文章
          </mdui-button>
        </div>
      ) : (
        <mdui-list>
          {posts.map((post) => (
            <mdui-list-item
              key={post.filename}
              class="post-list-item"
              headline={post.title}
              description={`${post.date}${post.tags.length ? " · " + post.tags.join(", ") : ""}`}
              onClick={() => onEdit(post.filename)}
            >
              <div slot="end-icon" className="flex items-center">
                <mdui-button-icon
                  icon="visibility"
                  onClick={(e: any) => handlePreview(post.filename, e)}
                ></mdui-button-icon>
                <mdui-button-icon
                  icon="delete"
                  onClick={(e: any) => handleDeleteClick(post.filename, e)}
                ></mdui-button-icon>
              </div>
            </mdui-list-item>
          ))}
        </mdui-list>
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
