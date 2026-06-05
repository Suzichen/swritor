import { useState, useEffect } from "react";
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

  const handleDelete = async (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`确定删除 "${filename}"？`)) return;
    await invoke("delete_post", { blogDir, filename });
    loadPosts();
  };

  const handleCreate = async () => {
    const title = prompt("文章标题：");
    if (!title) return;
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const filename = title.replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, "-") + ".md";
    const content = `---\ntitle: ${title}\ndate: ${now}\ntags: []\ncategories: []\npreview: \n---\n\n`;
    await invoke("create_post", { blogDir, filename, content });
    onEdit(filename);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-medium">文章列表</h2>
        <mdui-button-icon icon="add" onClick={handleCreate}></mdui-button-icon>
      </div>

      {loading ? (
        <mdui-linear-progress></mdui-linear-progress>
      ) : posts.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <p>暂无文章</p>
          <mdui-button variant="tonal" class="mt-4" onClick={handleCreate}>
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
              <mdui-button-icon
                slot="end-icon"
                icon="delete"
                onClick={(e: any) => handleDelete(post.filename, e)}
              ></mdui-button-icon>
            </mdui-list-item>
          ))}
        </mdui-list>
      )}
    </div>
  );
}
