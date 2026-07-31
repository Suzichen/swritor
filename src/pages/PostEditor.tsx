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
import {
  SPAGE_POST_LANGUAGES,
  isSpagePostLanguage,
  localizedPostFilename,
  parsePostFilename,
  spagePostLanguageName,
} from "../utils/postLanguages";
import { mergePostDraftValues } from "../utils/postDrafts";
import { getPreviewAddress } from "../utils/preview";

interface PostDetail extends PostMetadata {
  filename: string;
  content: string;
  raw: string;
}

interface PostVersion {
  filename: string;
  language: string | null;
}

interface PostVersions {
  defaultLanguage: string;
  versions: PostVersion[];
}

interface Props {
  blogDir: string;
  filename: string;
  onBack: () => void;
}

type Notice = { type: "error" | "success"; message: string } | null;

const toolbarActions: Array<{
  action: MarkdownAction;
  icon: string;
  label: string;
  dividerAfter?: boolean;
}> = [
  { action: "heading", icon: "title", label: "二级标题" },
  { action: "bold", icon: "format_bold", label: "粗体" },
  { action: "italic", icon: "format_italic", label: "斜体", dividerAfter: true },
  { action: "quote", icon: "format_quote", label: "引用" },
  { action: "bullet-list", icon: "format_list_bulleted", label: "无序列表" },
  { action: "ordered-list", icon: "format_list_numbered", label: "有序列表", dividerAfter: true },
  { action: "link", icon: "link", label: "链接" },
  { action: "code", icon: "code", label: "行内代码" },
];

function toLocalDateTime(value: string) {
  if (!value) return "";
  return value.replace(" ", "T").slice(0, 16);
}

function fromLocalDateTime(value: string) {
  return value.replace("T", " ");
}

function countWords(content: string) {
  return content.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{N}]+/gu)?.length ?? 0;
}

function TagInput({
  label,
  placeholder,
  values,
  draft,
  onDraftChange,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  draft: string;
  onDraftChange: (value: string) => void;
  onChange: (values: string[]) => void;
}) {
  const addDraft = () => {
    const nextValues = mergePostDraftValues(values, draft);
    if (nextValues.length !== values.length) onChange(nextValues);
    onDraftChange("");
  };

  return (
    <div className="post-meta-tag-field">
      <label className="post-meta-label">{label}</label>
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
          aria-label={`添加${label}`}
          placeholder={placeholder}
          onChange={(event) => onDraftChange(event.target.value)}
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
  const [currentFilename, setCurrentFilename] = useState(filename);
  const [metadata, setMetadata] = useState<PostMetadata | null>(null);
  const [content, setContent] = useState("");
  const [initialSource, setInitialSource] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [versions, setVersions] = useState<PostVersions>({ defaultLanguage: "en", versions: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [switchingVersion, setSwitchingVersion] = useState(false);
  const [creatingLanguage, setCreatingLanguage] = useState(false);
  const [deletingLanguage, setDeletingLanguage] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [loadError, setLoadError] = useState("");
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [languageChoice, setLanguageChoice] = useState("");
  const [languageError, setLanguageError] = useState("");
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [switchDialogOpen, setSwitchDialogOpen] = useState(false);
  const [languageDialogOpen, setLanguageDialogOpen] = useState(false);
  const [deleteLanguageDialogOpen, setDeleteLanguageDialogOpen] = useState(false);
  const documentRef = useRef<ReturnType<typeof parsePostSource>["document"] | null>(null);
  const metadataRef = useRef<PostMetadata | null>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const savingRef = useRef(false);
  const currentFilenameRef = useRef(currentFilename);
  const loadRequestRef = useRef(0);
  const switchRequestRef = useRef(0);
  metadataRef.current = metadata;
  currentFilenameRef.current = currentFilename;

  const loadVersion = useCallback(async (targetFilename: string) => {
    const request = ++loadRequestRef.current;
    editorRef.current?.blur();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setLoading(true);
    setLoadError("");
    setNotice(null);
    try {
      const [loadedPost, loadedVersions] = await Promise.all([
        invoke<PostDetail>("get_post", { blogDir, filename: targetFilename }),
        invoke<PostVersions>("list_post_versions", { blogDir, filename: targetFilename }),
      ]);
      if (request !== loadRequestRef.current) return false;

      const parsed = parsePostSource(loadedPost.raw);
      const targetLanguage = parsePostFilename(targetFilename).language;
      const nextMetadata: PostMetadata = {
        title: parsed.metadata.title ?? loadedPost.title,
        date: parsed.metadata.date ?? (targetLanguage ? "" : loadedPost.date),
        tags: parsed.metadata.tags ?? loadedPost.tags,
        categories: parsed.metadata.categories ?? loadedPost.categories,
        preview: parsed.metadata.preview ?? "",
      };
      const nextSource = serializePostSource(parsed.document, nextMetadata, parsed.body);
      documentRef.current = parsed.document;
      setCurrentFilename(targetFilename);
      setMetadata(nextMetadata);
      setContent(parsed.body);
      setInitialSource(nextSource);
      setCategoryDraft("");
      setTagDraft("");
      setVersions(loadedVersions);
      return true;
    } catch (error) {
      if (request !== loadRequestRef.current) return false;
      const message = String(error);
      if (metadataRef.current) setNotice({ type: "error", message: `无法切换语言版本：${message}` });
      else setLoadError(message);
      return false;
    } finally {
      if (request === loadRequestRef.current) setLoading(false);
    }
  }, [blogDir]);

  useEffect(() => {
    void loadVersion(filename);
  }, [filename, loadVersion]);

  const effectiveMetadata = useMemo(() => metadata ? {
    ...metadata,
    categories: mergePostDraftValues(metadata.categories, categoryDraft),
    tags: mergePostDraftValues(metadata.tags, tagDraft),
  } : null, [categoryDraft, metadata, tagDraft]);
  const source = useMemo(() => {
    if (!effectiveMetadata || !documentRef.current) return "";
    return serializePostSource(documentRef.current, effectiveMetadata, content);
  }, [effectiveMetadata, content]);
  const dirty = Boolean(metadata && (
    source !== initialSource
    || categoryDraft.trim()
    || tagDraft.trim()
  ));
  const currentLanguage = parsePostFilename(currentFilename).language;
  const translatedVersions = versions.versions.filter((version) => version.language !== null);
  const availableTranslationLanguages = SPAGE_POST_LANGUAGES.filter((language) => (
    language.toLowerCase() !== versions.defaultLanguage.toLowerCase()
    && !translatedVersions.some((version) => version.language?.toLowerCase() === language.toLowerCase())
  ));
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

  const acceptInitialEditorValue = useCallback((value: string) => {
    const currentMetadata = metadataRef.current;
    const document = documentRef.current;
    if (!currentMetadata || !document) return;
    setContent(value);
    setInitialSource(serializePostSource(document, currentMetadata, value));
  }, []);

  const saveCurrent = useCallback(async () => {
    if (!effectiveMetadata || !documentRef.current || savingRef.current) return false;
    if (!effectiveMetadata.title.trim()) {
      setNotice({ type: "error", message: "文章标题不能为空" });
      return false;
    }

    const filenameToSave = currentFilename;
    const categoryDraftToSave = categoryDraft;
    const tagDraftToSave = tagDraft;
    const nextSource = serializePostSource(documentRef.current, effectiveMetadata, content);
    savingRef.current = true;
    setSaving(true);
    setNotice(null);
    try {
      await invoke("save_post", { blogDir, filename: filenameToSave, content: nextSource });
      if (currentFilenameRef.current !== filenameToSave) return true;
      setMetadata((current) => current ? {
        ...current,
        categories: mergePostDraftValues(current.categories, categoryDraftToSave),
        tags: mergePostDraftValues(current.tags, tagDraftToSave),
      } : current);
      setCategoryDraft((current) => current === categoryDraftToSave ? "" : current);
      setTagDraft((current) => current === tagDraftToSave ? "" : current);
      setInitialSource(nextSource);
      setNotice({ type: "success", message: "文章已保存" });
      return true;
    } catch (error) {
      if (currentFilenameRef.current === filenameToSave) {
        setNotice({ type: "error", message: `保存失败：${String(error)}` });
      }
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [blogDir, categoryDraft, content, currentFilename, effectiveMetadata, tagDraft]);

  const handleBack = () => {
    if (!dirty) onBack();
    else setLeaveDialogOpen(true);
  };

  const requestVersionSwitch = (targetFilename: string) => {
    if (targetFilename === currentFilename || loading || savingRef.current || switchingVersion) return;
    if (!dirty) {
      void loadVersion(targetFilename);
      return;
    }
    setPendingSwitch(targetFilename);
    setSwitchDialogOpen(true);
  };

  const closeSwitchDialog = () => {
    if (switchingVersion) return;
    switchRequestRef.current += 1;
    setPendingSwitch(null);
    setSwitchDialogOpen(false);
  };

  const saveAndSwitch = async () => {
    const target = pendingSwitch;
    if (!target || switchingVersion) return;
    const request = ++switchRequestRef.current;
    setSwitchingVersion(true);
    try {
      if (!(await saveCurrent()) || request !== switchRequestRef.current) return;
      setPendingSwitch(null);
      setSwitchDialogOpen(false);
      await loadVersion(target);
    } finally {
      if (request === switchRequestRef.current) setSwitchingVersion(false);
    }
  };

  const discardAndSwitch = async () => {
    const target = pendingSwitch;
    if (!target || switchingVersion) return;
    const request = ++switchRequestRef.current;
    setSwitchingVersion(true);
    setPendingSwitch(null);
    setSwitchDialogOpen(false);
    try {
      await loadVersion(target);
    } finally {
      if (request === switchRequestRef.current) setSwitchingVersion(false);
    }
  };

  const handlePreview = async () => {
    try {
      const { slug } = parsePostFilename(currentFilename);
      const addr = await getPreviewAddress(blogDir);
      await invoke("open_url", { url: `${addr}/post/${slug}` });
    } catch (error) {
      setNotice({ type: "error", message: `无法打开预览：${String(error)}` });
    }
  };

  const openLanguageDialog = () => {
    if (loading || savingRef.current || switchingVersion) return;
    if (dirty) {
      setNotice({ type: "error", message: "请先保存当前内容，再添加翻译" });
      return;
    }
    if (!availableTranslationLanguages.length) return;
    setLanguageChoice(availableTranslationLanguages[0]);
    setLanguageError("");
    setLanguageDialogOpen(true);
  };

  const createLanguageVersion = async () => {
    if (loading || savingRef.current || switchingVersion || creatingLanguage) return;
    if (!effectiveMetadata || !documentRef.current) return;
    if (!isSpagePostLanguage(languageChoice) || !availableTranslationLanguages.includes(languageChoice)) {
      setLanguageError("请选择 Spage 支持且尚未创建的语言");
      return;
    }
    const language = languageChoice;
    if (language.toLowerCase() === versions.defaultLanguage.toLowerCase()) {
      setLanguageError(`${language} 是网站默认语言，无需创建重复版本`);
      return;
    }
    if (versions.versions.some((version) => version.language?.toLowerCase() === language.toLowerCase())) {
      setLanguageError(`${language} 版本已经存在`);
      return;
    }

    const targetFilename = localizedPostFilename(currentFilename, language);
    const translationSource = serializePostSource(
      documentRef.current,
      { ...effectiveMetadata, date: "" },
      content,
    );
    setCreatingLanguage(true);
    try {
      await invoke("create_post", { blogDir, filename: targetFilename, content: translationSource });
      setLanguageDialogOpen(false);
      if (!(await loadVersion(targetFilename))) return;
      setNotice({ type: "success", message: `已创建${spagePostLanguageName(language)}翻译` });
    } catch (error) {
      setLanguageError(`创建翻译失败：${String(error)}`);
    } finally {
      setCreatingLanguage(false);
    }
  };

  const deleteCurrentLanguage = async () => {
    if (!currentLanguage || loading || savingRef.current || switchingVersion || deletingLanguage) return;
    setDeletingLanguage(true);
    try {
      await invoke("delete_post", {
        blogDir,
        filename: currentFilename,
        deleteTranslations: false,
      });
      setDeleteLanguageDialogOpen(false);
      const defaultVersion = versions.versions.find((version) => version.language === null);
      if (!defaultVersion) throw new Error("找不到默认语言版本");
      if (!(await loadVersion(defaultVersion.filename))) return;
      setNotice({ type: "success", message: `已删除${spagePostLanguageName(currentLanguage)}翻译` });
    } catch (error) {
      setNotice({ type: "error", message: `删除翻译失败：${String(error)}` });
    } finally {
      setDeletingLanguage(false);
    }
  };

  if (loadError && !metadata) {
    return (
      <div className="post-editor-state">
        <mdui-icon name="error_outline" />
        <h2>无法打开文章</h2>
        <p>{loadError}</p>
        <mdui-button variant="tonal" onClick={onBack}>返回文章列表</mdui-button>
      </div>
    );
  }

  if (!metadata) {
    return <div className="post-editor-state"><mdui-circular-progress /></div>;
  }

  return (
    <div className="post-editor-page" aria-busy={loading ? "true" : undefined}>
      <header className="post-editor-appbar">
        <mdui-button-icon icon="arrow_back" aria-label="返回" onClick={handleBack} />
        <div className="post-editor-title">
          <strong>{metadata.title || "未命名文章"}</strong>
          <span>{currentFilename}</span>
        </div>
        <div className="post-editor-appbar-actions">
          <mdui-tooltip
            content={currentLanguage ? `翻译：${spagePostLanguageName(currentLanguage)}` : "翻译"}
            placement="bottom"
            trigger="hover"
          >
            <mdui-dropdown placement="bottom-end">
              <mdui-button-icon
                slot="trigger"
                class={currentLanguage ? "is-translation" : undefined}
                icon="translate"
                aria-label="管理文章翻译"
                disabled={loading || saving || switchingVersion || undefined}
              />
              <mdui-menu class="post-translation-menu" dense>
                {versions.versions.map((version) => {
                  const active = version.filename === currentFilename;
                  const supported = version.language === null || isSpagePostLanguage(version.language);
                  const label = version.language === null
                    ? "原文"
                    : spagePostLanguageName(version.language);
                  return (
                    <mdui-menu-item
                      key={version.filename}
                      end-icon={active ? "check" : ""}
                      aria-current={active ? "true" : undefined}
                      onClick={() => requestVersionSwitch(version.filename)}
                    >
                      {label}
                      {!supported && <span slot="end-text">Spage 暂不支持</span>}
                    </mdui-menu-item>
                  );
                })}
                {(availableTranslationLanguages.length > 0 || currentLanguage) && <mdui-divider />}
                {availableTranslationLanguages.length > 0 && (
                  <mdui-menu-item icon="add" disabled={dirty || undefined} onClick={openLanguageDialog}>
                    添加翻译
                  </mdui-menu-item>
                )}
                {currentLanguage && (
                  <mdui-menu-item
                    class="post-translation-delete"
                    icon="delete_outline"
                    disabled={dirty || undefined}
                    onClick={() => setDeleteLanguageDialogOpen(true)}
                  >
                    删除当前翻译
                  </mdui-menu-item>
                )}
              </mdui-menu>
            </mdui-dropdown>
          </mdui-tooltip>
          <mdui-tooltip content="在博客中预览" placement="bottom" trigger="hover">
            <mdui-button-icon icon="open_in_new" aria-label="在博客中预览" onClick={handlePreview} />
          </mdui-tooltip>
          <mdui-button
            variant="filled"
            icon="save"
            disabled={!dirty || saving || undefined}
            loading={saving || undefined}
            onClick={saveCurrent}
          >
            保存
          </mdui-button>
        </div>
      </header>

      <main className="post-editor-workspace">
        <aside className="post-meta-panel">
          <h2 className="post-meta-heading">文章信息</h2>
          <mdui-text-field
            variant="outlined"
            label="标题"
            required
            value={metadata.title}
            onInput={(event: any) => updateMetadata("title", event.target.value)}
          />
          {!currentLanguage && (
            <mdui-text-field
              variant="outlined"
              type="datetime-local"
              label="发布日期"
              value={toLocalDateTime(metadata.date)}
              onInput={(event: any) => updateMetadata("date", fromLocalDateTime(event.target.value))}
            />
          )}
          <mdui-text-field
            variant="outlined"
            label="摘要"
            placeholder="留空则从正文生成"
            rows="3"
            value={metadata.preview}
            onInput={(event: any) => updateMetadata("preview", event.target.value)}
          />
          <TagInput
            label="分类"
            placeholder="添加分类"
            values={metadata.categories}
            draft={categoryDraft}
            onDraftChange={setCategoryDraft}
            onChange={(value) => updateMetadata("categories", value)}
          />
          <TagInput
            label="标签"
            placeholder="添加标签"
            values={metadata.tags}
            draft={tagDraft}
            onDraftChange={setTagDraft}
            onChange={(value) => updateMetadata("tags", value)}
          />
        </aside>

        <section className="post-content-panel">
          <div className="post-editor-toolbar">
            <div className="post-format-actions">
              {toolbarActions.map(({ action, icon, label, dividerAfter }) => (
                <div className="post-format-action" key={action}>
                  <mdui-tooltip content={label} placement="bottom" trigger="hover">
                    <mdui-button-icon
                      icon={icon}
                      aria-label={label}
                      onClick={() => editorRef.current?.insert(action)}
                    />
                  </mdui-tooltip>
                  {dividerAfter && <span className="post-format-divider" aria-hidden="true" />}
                </div>
              ))}
            </div>
          </div>

          <div className="post-editor-canvas">
            <div className="post-write-pane">
              <MarkdownEditor
                key={currentFilename}
                ref={editorRef}
                value={content}
                onChange={(value) => { setContent(value); setNotice(null); }}
                onInitialValue={acceptInitialEditorValue}
                onSave={saveCurrent}
              />
            </div>
          </div>
          <footer className="post-editor-statusbar">
            <span>{countWords(content)} 字词</span>
            <span>{content.length} 字符</span>
            <span className={dirty ? "is-dirty" : undefined}>{dirty ? "有未保存的更改" : "已保存"}</span>
          </footer>
        </section>
      </main>

      {loading && <mdui-linear-progress class="post-editor-loading" />}
      {notice && (
        <div className={`post-editor-notice is-${notice.type}`} role="status">
          <mdui-icon name={notice.type === "success" ? "check_circle" : "error"} />
          <span>{notice.message}</span>
          <button type="button" aria-label="关闭提示" onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      <mdui-dialog
        open={leaveDialogOpen}
        headline="放弃未保存的更改？"
        onclose={() => setLeaveDialogOpen(false)}
      >
        <div className="px-6 pb-2">文章还有未保存的内容，离开后这些更改将丢失。</div>
        <mdui-button slot="action" variant="text" onClick={() => setLeaveDialogOpen(false)}>继续编辑</mdui-button>
        <mdui-button slot="action" variant="text" onClick={onBack}>放弃更改</mdui-button>
      </mdui-dialog>

      <mdui-dialog
        open={switchDialogOpen}
        headline="切换翻译？"
        onclose={closeSwitchDialog}
      >
        <div className="px-6 pb-2">当前内容尚未保存。要先保存再切换吗？</div>
        <mdui-button slot="action" variant="text" disabled={switchingVersion || undefined} onClick={closeSwitchDialog}>取消</mdui-button>
        <mdui-button slot="action" variant="text" disabled={switchingVersion || undefined} onClick={discardAndSwitch}>放弃并切换</mdui-button>
        <mdui-button slot="action" variant="filled" loading={switchingVersion || undefined} onClick={saveAndSwitch}>保存并切换</mdui-button>
      </mdui-dialog>

      <mdui-dialog
        open={languageDialogOpen}
        headline="添加翻译"
        class="post-language-dialog"
        onclose={() => { if (!creatingLanguage) setLanguageDialogOpen(false); }}
      >
        <div className="post-language-dialog-content">
          <p>将复制当前内容作为翻译起点。</p>
          <mdui-select
            variant="outlined"
            label="翻译语言"
            value={languageChoice}
            onChange={(event: any) => setLanguageChoice(event.target.value)}
          >
            {availableTranslationLanguages.map((language) => (
              <mdui-menu-item key={language} value={language}>
                {spagePostLanguageName(language)}
              </mdui-menu-item>
            ))}
          </mdui-select>
          {languageError && <div className="post-dialog-error" role="alert">{languageError}</div>}
        </div>
        <mdui-button slot="action" variant="text" disabled={creatingLanguage || undefined} onClick={() => setLanguageDialogOpen(false)}>取消</mdui-button>
        <mdui-button
          slot="action"
          variant="filled"
          disabled={loading || saving || switchingVersion || undefined}
          loading={creatingLanguage || undefined}
          onClick={createLanguageVersion}
        >
          创建并编辑
        </mdui-button>
      </mdui-dialog>

      <mdui-dialog
        open={deleteLanguageDialogOpen}
        headline={`删除${currentLanguage ? spagePostLanguageName(currentLanguage) : "当前"}翻译？`}
        onclose={() => { if (!deletingLanguage) setDeleteLanguageDialogOpen(false); }}
      >
        <div className="px-6 pb-2">只会删除当前翻译，原文和其他翻译不受影响。删除后无法恢复。</div>
        <mdui-button slot="action" variant="text" disabled={deletingLanguage || undefined} onClick={() => setDeleteLanguageDialogOpen(false)}>取消</mdui-button>
        <mdui-button
          slot="action"
          variant="text"
          disabled={loading || saving || switchingVersion || undefined}
          loading={deletingLanguage || undefined}
          onClick={deleteCurrentLanguage}
        >
          删除翻译
        </mdui-button>
      </mdui-dialog>
    </div>
  );
}
