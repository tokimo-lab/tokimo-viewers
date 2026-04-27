/**
 * MonacoTextEditor — VS Code editor component.
 *
 * Pure UI component. No API calls.
 * Caller provides content or fetchContent / saveContent callbacks.
 */

import "./monaco-setup";
import type { OnMount } from "@monaco-editor/react";
import { Button } from "@tokimo/ui";
import { Save } from "lucide-react";
import * as monaco from "monaco-editor";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const Editor = lazy(() =>
  import("@monaco-editor/react").then((m) => ({ default: m.default })),
);

/* ── Language detection ────────────────────────────── */

const EXT_TO_LANG: Record<string, string> = {
  ass: "plaintext",
  cfg: "ini",
  conf: "ini",
  css: "css",
  csv: "plaintext",
  dockerfile: "dockerfile",
  env: "shell",
  go: "go",
  graphql: "graphql",
  html: "html",
  ini: "ini",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "javascript",
  less: "less",
  log: "plaintext",
  makefile: "shell",
  md: "markdown",
  nfo: "xml",
  prisma: "graphql",
  py: "python",
  rs: "rust",
  scss: "scss",
  sh: "shell",
  sql: "sql",
  srt: "plaintext",
  ssa: "plaintext",
  svelte: "html",
  toml: "ini",
  ts: "typescript",
  tsx: "typescript",
  txt: "plaintext",
  vue: "html",
  vtt: "plaintext",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
};

function getLanguage(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const base = fileName.toLowerCase();
  if (base === "dockerfile") return "dockerfile";
  if (base === "makefile") return "shell";
  return EXT_TO_LANG[ext] ?? "plaintext";
}

/* ── Props ─────────────────────────────────────────── */

export interface MonacoTextEditorProps {
  fileName?: string;
  content?: string;
  fetchContent?: () => Promise<string>;
  saveContent?: (content: string) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  /** When true, shows no save button and editor is read-only */
  readOnly?: boolean;
  /** Override detected language */
  language?: string;
  className?: string;
}

/* ── Component ─────────────────────────────────────── */

export function MonacoTextEditor({
  fileName = "untitled.txt",
  content,
  fetchContent,
  saveContent,
  onDirtyChange,
  readOnly = false,
  language: languageOverride,
  className,
}: MonacoTextEditorProps) {
  const [initialContent, setInitialContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const originalRef = useRef<string>("");
  const editorInstanceRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(
    null,
  );

  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  const fetchContentRef = useRef(fetchContent);
  fetchContentRef.current = fetchContent;

  // Re-load when fileName/content changes (signals a different document)
  // biome-ignore lint/correctness/useExhaustiveDependencies: fileName/content change = new document
  useEffect(() => {
    setLoading(true);
    setError(null);
    setDirty(false);
    const loadContent =
      fetchContentRef.current ?? (() => Promise.resolve(content ?? ""));
    loadContent()
      .then((text) => {
        setInitialContent(text);
        originalRef.current = text;
        setLoading(false);
        onDirtyChangeRef.current?.(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [fileName, content]);

  const getEditorContent = useCallback((): string => {
    return editorInstanceRef.current?.getValue() ?? originalRef.current;
  }, []);

  const handleSave = useCallback(() => {
    if (saving || !saveContent) return;
    const content = getEditorContent();
    setSaving(true);
    saveContent(content)
      .then(() => {
        originalRef.current = content;
        setDirty(false);
        onDirtyChangeRef.current?.(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setSaving(false));
  }, [saving, saveContent, getEditorContent]);

  const handleEditorMount: OnMount = useCallback(
    (editor) => {
      editorInstanceRef.current = editor;
      if (readOnly) return;

      editor.onDidChangeModelContent(() => {
        const current = editor.getValue();
        const isDirty = current !== originalRef.current;
        setDirty(isDirty);
        onDirtyChangeRef.current?.(isDirty);
      });

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        handleSave();
      });
    },
    [handleSave, readOnly],
  );

  if (loading) {
    return (
      <div
        className={`flex h-full items-center justify-center text-sm text-[var(--text-tertiary)] ${className ?? ""}`}
      >
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex h-full items-center justify-center text-sm text-red-500 ${className ?? ""}`}
      >
        {error}
      </div>
    );
  }

  const lang = languageOverride ?? getLanguage(fileName);
  const isDark =
    typeof window !== "undefined" &&
    document.documentElement.classList.contains("dark");

  return (
    <div className={`flex h-full flex-col ${className ?? ""}`}>
      {!readOnly && (
        <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] px-3 py-1 dark:border-white/[0.08]">
          <span className="text-xs text-[var(--text-quaternary)]">{lang}</span>
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs text-[var(--text-quaternary)]">
                Unsaved changes
              </span>
            )}
            <Button
              size="small"
              variant={dirty ? "primary" : "default"}
              onClick={handleSave}
              loading={saving}
              disabled={!dirty}
              icon={<Save size={12} />}
            >
              Save
            </Button>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-tertiary)]">
              Loading editor…
            </div>
          }
        >
          <Editor
            height="100%"
            language={lang}
            theme={isDark ? "tokimo-dark" : "tokimo-light"}
            defaultValue={initialContent ?? ""}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              wordWrap: "on",
              automaticLayout: true,
              padding: { top: 8 },
              renderWhitespace: "selection",
              bracketPairColorization: { enabled: true },
              ...(readOnly ? { readOnly: true } : {}),
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}
