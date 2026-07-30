import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { draftly, ThemeEnum } from "draftly/editor";
import { essentialPlugins } from "draftly/plugins";
import { EditorState } from "@codemirror/state";
import { keymap, placeholder, EditorView } from "@codemirror/view";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
}

export interface MarkdownEditorHandle {
  insert: (action: MarkdownAction) => void;
  focus: () => void;
}

export type MarkdownAction =
  | "heading"
  | "bold"
  | "italic"
  | "quote"
  | "link"
  | "code"
  | "bullet-list"
  | "ordered-list";

const actionTemplates: Record<MarkdownAction, { before: string; after: string; placeholder: string }> = {
  heading: { before: "## ", after: "", placeholder: "标题" },
  bold: { before: "**", after: "**", placeholder: "粗体文本" },
  italic: { before: "*", after: "*", placeholder: "斜体文本" },
  quote: { before: "> ", after: "", placeholder: "引用" },
  link: { before: "[", after: "](https://)", placeholder: "链接文本" },
  code: { before: "`", after: "`", placeholder: "代码" },
  "bullet-list": { before: "- ", after: "", placeholder: "列表项" },
  "ordered-list": { before: "1. ", after: "", placeholder: "列表项" },
};

function saveKeymap(onSave: () => void) {
  return keymap.of([
    {
      key: "Mod-s",
      preventDefault: true,
      run: () => {
        onSave();
        return true;
      },
    },
  ]);
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor(
  { value, onChange, onSave },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!hostRef.current) return;

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          draftly({
            theme: ThemeEnum.LIGHT,
            plugins: essentialPlugins,
            history: true,
            indentWithTab: true,
            lineWrapping: true,
            highlightActiveLine: false,
          }),
          saveKeymap(() => onSaveRef.current()),
          placeholder("在这里开始写作……"),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
          EditorView.theme({
            "&": { height: "100%" },
            ".cm-scroller": { overflow: "auto" },
            ".cm-content": { padding: "48px 48px 40vh" },
            ".cm-gutters": { display: "none" },
            "&.cm-focused": { outline: "none" },
          }),
        ],
      }),
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  useImperativeHandle(ref, () => ({
    insert: (action) => applyMarkdownAction(action, viewRef.current),
    focus: () => viewRef.current?.focus(),
  }), []);

  return <div ref={hostRef} className="markdown-editor" />;
});

function applyMarkdownAction(action: MarkdownAction, view: EditorView | null) {
  if (!view) return;
  const template = actionTemplates[action];
  const selection = view.state.selection.main;
  const selectedText = view.state.sliceDoc(selection.from, selection.to);
  const content = selectedText || template.placeholder;
  const insert = `${template.before}${content}${template.after}`;
  const anchor = selectedText
    ? selection.from + insert.length
    : selection.from + template.before.length;
  const head = selectedText ? anchor : anchor + content.length;

  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert },
    selection: { anchor, head },
    scrollIntoView: true,
  });
  view.focus();
}
