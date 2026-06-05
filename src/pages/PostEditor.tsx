import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface PostDetail {
  filename: string;
  title: string;
  date: string;
  tags: string[];
  categories: string[];
  preview: string;
  content: string;
  raw: string;
}

interface Props {
  blogDir: string;
  filename: string;
  onBack: () => void;
}

export function PostEditor({ blogDir, filename, onBack }: Props) {
  const [post, setPost] = useState<PostDetail | null>(null);
  const [raw, setRaw] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke<PostDetail>("get_post", { blogDir, filename }).then((p) => {
      setPost(p);
      setRaw(p.raw);
    });
  }, [blogDir, filename]);

  const handleSave = async () => {
    setSaving(true);
    await invoke("save_post", { blogDir, filename, content: raw });
    setSaving(false);
  };

  if (!post) {
    return (
      <div className="h-screen flex items-center justify-center">
        <mdui-circular-progress></mdui-circular-progress>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <mdui-top-app-bar>
        <mdui-button-icon icon="arrow_back" onClick={onBack}></mdui-button-icon>
        <mdui-top-app-bar-title>{post.title}</mdui-top-app-bar-title>
        <div style={{ flexGrow: 1 }}></div>
        <mdui-button variant="filled" loading={saving || undefined} onClick={handleSave}>
          保存
        </mdui-button>
      </mdui-top-app-bar>
      <div className="flex-1 overflow-hidden">
        <textarea
          className="w-full h-full p-6 font-mono text-sm resize-none outline-none border-none bg-white"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
