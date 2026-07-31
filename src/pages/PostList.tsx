import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { Document } from "yaml";
import { serializePostSource } from "../utils/frontmatter";
import { getPreviewAddress } from "../utils/preview";

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
  const [deleting, setDeleting] = useState(false);
  const [listError, setListError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const activeBlogDirRef = useRef(blogDir);
  const loadSequenceRef = useRef(0);
  const createOperationRef = useRef(0);
  const deleteOperationRef = useRef(0);
  const creatingRef = useRef(false);
  const deletingRef = useRef(false);
  activeBlogDirRef.current = blogDir;

  const loadPosts = useCallback(async () => {
    const requestedBlogDir = blogDir;
    const sequence = ++loadSequenceRef.current;
    setLoading(true);
    setListError("");
    try {
      const list = await invoke<PostSummary[]>("list_posts", { blogDir: requestedBlogDir });
      if (sequence !== loadSequenceRef.current || activeBlogDirRef.current !== requestedBlogDir) return;
      setPosts(list);
    } catch (loadError) {
      if (sequence !== loadSequenceRef.current || activeBlogDirRef.current !== requestedBlogDir) return;
      setListError(`无法读取文章：${String(loadError)}`);
    } finally {
      if (sequence === loadSequenceRef.current && activeBlogDirRef.current === requestedBlogDir) {
        setLoading(false);
      }
    }
  }, [blogDir]);

  useEffect(() => {
    loadSequenceRef.current += 1;
    createOperationRef.current += 1;
    deleteOperationRef.current += 1;
    creatingRef.current = false;
    deletingRef.current = false;
    setPosts([]);
    setDeleteTarget(null);
    setDeleting(false);
    setDeleteError("");
    setCreateDialogOpen(false);
    setCreating(false);
    setCreateError("");
    setNewTitle("");
    void loadPosts();

    return () => {
      loadSequenceRef.current += 1;
      createOperationRef.current += 1;
      deleteOperationRef.current += 1;
      creatingRef.current = false;
      deletingRef.current = false;
    };
  }, [blogDir, loadPosts]);

  const handleDeleteClick = (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteError("");
    setDeleteTarget(filename);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deletingRef.current) return;
    const requestedBlogDir = blogDir;
    const operation = ++deleteOperationRef.current;
    deletingRef.current = true;
    setDeleteError("");
    setDeleting(true);
    try {
      await invoke("delete_post", {
        blogDir: requestedBlogDir,
        filename: deleteTarget,
        deleteTranslations: true,
      });
      if (operation !== deleteOperationRef.current || activeBlogDirRef.current !== requestedBlogDir) return;
      setDeleteTarget(null);
      await loadPosts();
    } catch (operationError) {
      if (operation !== deleteOperationRef.current || activeBlogDirRef.current !== requestedBlogDir) return;
      setDeleteError(`删除失败：${String(operationError)}`);
    } finally {
      if (operation === deleteOperationRef.current && activeBlogDirRef.current === requestedBlogDir) {
        deletingRef.current = false;
        setDeleting(false);
      }
    }
  };

  const cancelDelete = () => {
    if (deletingRef.current) return;
    setDeleteTarget(null);
    setDeleteError("");
  };

  const openCreateDialog = () => {
    setNewTitle("");
    setCreateError("");
    setCreateDialogOpen(true);
  };

  const closeCreateDialog = () => {
    if (creatingRef.current) return;
    setCreateDialogOpen(false);
    setCreateError("");
    setNewTitle("");
  };

  const prepareDialogFocus = (event: Event) => {
    const dialog = event.currentTarget as HTMLElement;
    dialog.shadowRoot
      ?.querySelector<HTMLElement>("[part='panel']")
      ?.setAttribute("tabindex", "-1");
  };

  const confirmCreate = async () => {
    if (!newTitle.trim() || creatingRef.current) return;
    const requestedBlogDir = blogDir;
    const operation = ++createOperationRef.current;
    creatingRef.current = true;
    const title = newTitle.trim();
    const date = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    const now = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    const slug = title
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || `post-${Date.now()}`;
    const filename = `${slug}.md`;
    const content = serializePostSource(new Document({}), {
      title,
      date: now,
      tags: [],
      categories: [],
      preview: "",
    }, "\n");
    setCreateError("");
    setCreating(true);
    try {
      await invoke("create_post", { blogDir: requestedBlogDir, filename, content });
      if (operation !== createOperationRef.current || activeBlogDirRef.current !== requestedBlogDir) return;
      setCreateDialogOpen(false);
      onEdit(filename);
    } catch (operationError) {
      if (operation !== createOperationRef.current || activeBlogDirRef.current !== requestedBlogDir) return;
      setCreateError(`创建失败：${String(operationError)}`);
    } finally {
      if (operation === createOperationRef.current && activeBlogDirRef.current === requestedBlogDir) {
        creatingRef.current = false;
        setCreating(false);
      }
    }
  };

  const handlePreview = async (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const slug = filename.replace(/\.md$/, "");
    const addr = await getPreviewAddress(blogDir);
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

      {listError && <div className="post-list-error" role="alert">{listError}</div>}

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

      {createPortal(
        <>
          <mdui-dialog
            open={createDialogOpen || undefined}
            headline="新建文章"
            class="create-dialog"
            close-on-esc={!creating || undefined}
            close-on-overlay-click={!creating || undefined}
            onopen={prepareDialogFocus}
            onclose={closeCreateDialog}
          >
            <div className="post-create-dialog-content">
              <mdui-text-field
                variant="outlined"
                label="文章标题"
                value={newTitle}
                autofocus
                onInput={(event) => setNewTitle((event.currentTarget as HTMLElement & { value: string }).value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void confirmCreate();
                  }
                }}
              />
              {createError && <div className="post-dialog-error" role="alert">{createError}</div>}
            </div>
            <mdui-button slot="action" variant="text" disabled={creating || undefined} onClick={closeCreateDialog}>
              取消
            </mdui-button>
            <mdui-button
              slot="action"
              variant="filled"
              disabled={!newTitle.trim() || creating || undefined}
              loading={creating || undefined}
              onClick={confirmCreate}
            >
              创建文章
            </mdui-button>
          </mdui-dialog>

          <mdui-dialog
            open={Boolean(deleteTarget) || undefined}
            headline="确认删除"
            close-on-esc={!deleting || undefined}
            close-on-overlay-click={!deleting || undefined}
            onopen={prepareDialogFocus}
            onclose={cancelDelete}
          >
            <div className="px-6 pb-2">
              确定要删除「{deleteTarget}」吗？已有翻译也会一并删除。删除后无法恢复。
              {deleteError && <div className="post-dialog-error" role="alert">{deleteError}</div>}
            </div>
            <mdui-button slot="action" variant="text" disabled={deleting || undefined} onClick={cancelDelete}>
              取消
            </mdui-button>
            <mdui-button slot="action" variant="text" loading={deleting || undefined} onClick={confirmDelete}>
              删除
            </mdui-button>
          </mdui-dialog>
        </>,
        document.body,
      )}
    </div>
  );
}
