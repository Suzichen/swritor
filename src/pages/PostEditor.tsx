import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import {
  MarkdownEditor,
  type MarkdownAction,
  type MarkdownEditorHandle,
} from "../components/editor/MarkdownEditor";
import {
  parsePostSource,
  serializePostSource,
  type PostMetadata,
} from "../utils/frontmatter";
import { getPreviewAddress } from "../utils/preview";

interface PostDetail extends PostMetadata {
  filename: string;
  content: string;
  raw: string;
}

interface Props {
  blogDir: string;
  filename: string;
  onBack: () => void;
}


type Notice = { type: "error" | "success"; message: string } | null;

const toolbarActions: Array<{ action: MarkdownAction; icon: string; label: string }> = [
  { action: "heading", icon: "title", label: "标题" },
  { action: "bold", icon: "format_bold", label: "粗体" },
  { action: "italic", icon: "format_italic", label: "斜体" },
  { action: "quote", icon: "format_quote", label: "引用" },
  { action: "link", icon: "link", label: "链接" },
  { action: "code", icon: "code", label: "行内代码" },
  { action: "bullet-list", icon: "format_list_bulleted", label: "无序列表" },
  { action: "ordered-list", icon: "format_list_numbered", label: "有序列表" },
];

function toLocalDateTime(value: string) {
  if (!value) return "";
  return value.replace(" ", "T").slice(0, 16);
}

function fromLocalDateTime(value: string) {
  return value.replace("T", " ");
}

function TagInput({
  label,
  icon,
  description,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  icon: string;
  description: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const addDraft = () => {
    const nextValues = draft
      .split(/[,，]/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (!nextValues.length) return;
    onChange(Array.from(new Set([...values, ...nextValues])));
    setDraft("");
  };

  return (
    <div className="post-meta-tag-field">
      <div className="post-meta-label">
        <mdui-icon name={icon} />
        <span><strong>{label}</strong><small>{description}</small></span>
      </div>
      <div className="post-meta-chip-box">
        {values.map((value) => (
          <span className="post-meta-chip" key={value}>
            {value}
            <button
              type="button"
              aria-label={`删除 ${value}`}
              onClick={() => onChange(values.filter((item) => item !== value))}
            >
              <span className="material-icons" aria-hidden="true">close</span>
            </button>
          </span>
        ))}
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={addDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addDraft();
            } else if (event.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
        />
      </div>
    </div>
  );
}

export function PostEditor({ blogDir, filename, onBack }: Props) {
  const [post, setPost] = useState<PostDetail | null>(null);
  const [metadata, setMetadata] = useState<PostMetadata | null>(null);
  const [content, setContent] = useState("");
  const [initialSource, setInitialSource] = useState("");

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [loadError, setLoadError] = useState("");
  const documentRef = useRef<ReturnType<typeof parsePostSource>["document"] | null>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const leaveDialogRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError("");
    invoke<PostDetail>("get_post", { blogDir, filename })
      .then((loadedPost) => {
        if (cancelled) return;
        const parsed = parsePostSource(loadedPost.raw);
        documentRef.current = parsed.document;
        setPost(loadedPost);
        setMetadata({
          title: loadedPost.title,
          date: loadedPost.date,
          tags: loadedPost.tags,
          categories: loadedPost.categories,
          preview: loadedPost.preview,
        });
        setContent(parsed.body);
        setInitialSource(serializePostSource(parsed.document, {
          title: loadedPost.title,
          date: loadedPost.date,
          tags: loadedPost.tags,
          categories: loadedPost.categories,
          preview: loadedPost.preview,
        }, parsed.body));
      })
      .catch((error) => {
        if (!cancelled) setLoadError(String(error));
      });
    return () => { cancelled = true; };
  }, [blogDir, filename]);

  const source = useMemo(() => {
    if (!metadata || !documentRef.current) return "";
    return serializePostSource(documentRef.current, metadata, content);
  }, [metadata, content]);
  const dirty = Boolean(initialSource && source !== initialSource);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const updateMetadata = <K extends keyof PostMetadata>(key: K, value: PostMetadata[K]) => {
    setMetadata((current) => current ? { ...current, [key]: value } : current);
    setNotice(null);
  };

  const handleSave = useCallback(async () => {
    if (!metadata || !documentRef.current || saving) return;
    if (!metadata.title.trim()) {
      setNotice({ type: "error", message: "文章标题不能为空" });
      return;
    }

    const nextSource = serializePostSource(documentRef.current, metadata, content);
    setSaving(true);
    setNotice(null);
    try {
      await invoke("save_post", { blogDir, filename, content: nextSource });
      setInitialSource(nextSource);
      setNotice({ type: "success", message: "文章已保存" });
    } catch (error) {
      setNotice({ type: "error", message: `保存失败：${String(error)}` });
    } finally {
      setSaving(false);
    }
  }, [blogDir, content, filename, metadata, saving]);

  const handleBack = () => {
    if (!dirty) onBack();
    else leaveDialogRef.current?.setAttribute("open", "");
  };

  const handlePreview = async () => {
    try {
      const slug = filename.replace(/\.md$/, "");
      const addr = await getPreviewAddress(blogDir);
      await invoke("open_url", { url: `${addr}/post/${slug}` });
    } catch (error) {
      setNotice({ type: "error", message: `无法打开预览：${String(error)}` });
    }
  };



  if (loadError) {
    return (
      <div className="post-editor-state">
        <mdui-icon name="error_outline" />
        <h2>无法打开文章</h2>
        <p>{loadError}</p>
        <mdui-button variant="tonal" onClick={onBack}>返回文章列表</mdui-button>
      </div>
    );
  }

  if (!post || !metadata) {
    return <div className="post-editor-state"><mdui-circular-progress /></div>;
  }

  return (
    <div className="post-editor-page">
      <header className="post-editor-appbar">
        <mdui-button-icon icon="arrow_back" aria-label="返回" onClick={handleBack} />
        <div className="post-editor-title">
          <strong>{metadata.title || "未命名文章"}</strong>
          <span>{filename}{dirty ? " · 未保存" : ""}</span>
        </div>
        <div className="post-editor-appbar-actions">
          <mdui-tooltip content="在博客中预览" placement="bottom" trigger="hover">
            <mdui-button-icon icon="open_in_new" aria-label="在博客中预览" onClick={handlePreview} />
          </mdui-tooltip>
          <mdui-button
            variant="filled"
            icon="save"
            disabled={!dirty || saving || undefined}
            loading={saving || undefined}
            onClick={handleSave}
          >
            保存
          </mdui-button>
        </div>
      </header>

      <main className="post-editor-workspace">
        <aside className="post-meta-panel">
          <div className="post-meta-heading">
            <div><mdui-icon name="tune" /></div>
            <span><strong>文章设置</strong><small>标题、发布信息与归类</small></span>
          </div>
          <mdui-text-field
            variant="outlined"
            label="文章标题"
            required
            value={metadata.title}
            onInput={(event: any) => updateMetadata("title", event.target.value)}
          />
          <mdui-text-field
            variant="outlined"
            type="datetime-local"
            label="发布日期"
            value={toLocalDateTime(metadata.date)}
            onInput={(event: any) => updateMetadata("date", fromLocalDateTime(event.target.value))}
          />
          <mdui-text-field
            variant="outlined"
            label="文章摘要"
            rows="4"
            value={metadata.preview}
            onInput={(event: any) => updateMetadata("preview", event.target.value)}
          />
          <TagInput
            label="分类"
            icon="folder"
            description="用于组织文章栏目"
            placeholder="添加分类，按 Enter"
            values={metadata.categories}
            onChange={(value) => updateMetadata("categories", value)}
          />
          <TagInput
            label="标签"
            icon="sell"
            description="帮助读者发现相关内容"
            placeholder="添加标签，按 Enter"
            values={metadata.tags}
            onChange={(value) => updateMetadata("tags", value)}
          />
        </aside>

        <section className="post-content-panel">
          <div className="post-editor-toolbar">
            <div className="post-format-actions">
              {toolbarActions.map(({ action, icon, label }) => (
                <mdui-tooltip key={action} content={label} placement="bottom" trigger="hover">
                  <mdui-button-icon
                    icon={icon}
                    aria-label={label}

                    onClick={() => editorRef.current?.insert(action)}
                  />
                </mdui-tooltip>
              ))}
            </div>

          </div>

          <div className="post-editor-canvas">
            <div className="post-write-pane">
              <MarkdownEditor ref={editorRef} value={content} onChange={(value) => { setContent(value); setNotice(null); }} onSave={handleSave} />
            </div>
          </div>
          <footer className="post-editor-statusbar">
            <span>{content.trim() ? `${content.trim().split(/\s+/).length} 词` : "0 词"}</span>
            <span>{content.length} 字符</span>
            <span>Markdown</span>
            <span className={dirty ? "is-dirty" : undefined}>{dirty ? "有未保存的更改" : "已保存"}</span>
          </footer>
        </section>
      </main>

      {notice && (
        <div className={`post-editor-notice is-${notice.type}`} role="status">
          <mdui-icon name={notice.type === "success" ? "check_circle" : "error"} />
          <span>{notice.message}</span>
          <button type="button" aria-label="关闭提示" onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      <mdui-dialog ref={leaveDialogRef} headline="放弃未保存的更改？">
        <div className="px-6 pb-2">文章还有未保存的内容，离开后这些更改将丢失。</div>
        <mdui-button slot="action" variant="text" onClick={() => leaveDialogRef.current?.removeAttribute("open")}>继续编辑</mdui-button>
        <mdui-button slot="action" variant="text" onClick={onBack}>放弃更改</mdui-button>
      </mdui-dialog>
    </div>
  );
}
