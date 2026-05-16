/**
 * MonacoTextEditor — VS Code editor component.
 *
 * Pure UI component. No API calls.
 * Caller provides content or fetchContent / saveContent callbacks.
 */

import "./monaco-setup";
import type { OnMount } from "@monaco-editor/react";
import { Button, Markdown } from "@tokimo/ui";
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

/* ── Sync types ────────────────────────────────────── */

interface Anchor {
  line: number;
  top: number;
}

/** Find anchor pair {a,b} such that a.line <= line < b.line. */
function findAnchorPairByLine(
  anchors: readonly Anchor[],
  line: number,
): { a: Anchor; b: Anchor } | null {
  if (anchors.length < 2) return null;
  if (line <= anchors[0].line) {
    return { a: anchors[0], b: anchors[1] };
  }
  const last = anchors[anchors.length - 1];
  if (line >= last.line) {
    return { a: anchors[anchors.length - 2], b: last };
  }
  let lo = 0;
  let hi = anchors.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid].line <= line) lo = mid;
    else hi = mid;
  }
  return { a: anchors[lo], b: anchors[hi] };
}

/** Find anchor pair {a,b} such that a.top <= top < b.top. */
function findAnchorPairByTop(
  anchors: readonly Anchor[],
  top: number,
): { a: Anchor; b: Anchor } | null {
  if (anchors.length < 2) return null;
  if (top <= anchors[0].top) {
    return { a: anchors[0], b: anchors[1] };
  }
  const last = anchors[anchors.length - 1];
  if (top >= last.top) {
    return { a: anchors[anchors.length - 2], b: last };
  }
  let lo = 0;
  let hi = anchors.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid].top <= top) lo = mid;
    else hi = mid;
  }
  return { a: anchors[lo], b: anchors[hi] };
}

/** Scan preview DOM for `[data-source-line]` elements and build sorted anchor list. */
function buildAnchors(previewEl: HTMLElement, lastLineOfDoc: number): Anchor[] {
  const nodes = previewEl.querySelectorAll<HTMLElement>("[data-source-line]");
  const baseTop = previewEl.offsetTop;
  const raw: Anchor[] = [];
  for (const n of nodes) {
    const lnStr = n.dataset.sourceLine;
    if (!lnStr) continue;
    const ln = parseInt(lnStr, 10);
    if (!Number.isFinite(ln)) continue;
    raw.push({ line: ln, top: n.offsetTop - baseTop });
  }
  raw.sort((a, b) => a.line - b.line);

  // Sentinels at head & tail so interpolation always finds a pair.
  const scrollHeight = previewEl.scrollHeight;
  const anchors: Anchor[] = [];
  if (raw.length === 0 || raw[0].line > 1) {
    anchors.push({ line: 1, top: 0 });
  }
  anchors.push(...raw);
  const tailLine = Math.max(
    lastLineOfDoc,
    anchors[anchors.length - 1].line + 1,
  );
  if (anchors[anchors.length - 1].top < scrollHeight) {
    anchors.push({ line: tailLine, top: scrollHeight });
  }
  return anchors;
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
  /** Live content mirrored from Monaco — drives the markdown preview. */
  const [liveContent, setLiveContent] = useState<string>("");
  /** Width % of left (editor) pane in markdown split mode. */
  const [leftPct, setLeftPct] = useState<number>(50);
  /** Whether the user is currently dragging the splitter. */
  const [dragging, setDragging] = useState(false);
  const originalRef = useRef<string>("");
  const editorInstanceRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(
    null,
  );
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  /** Counter (not boolean) guarding against echo-loops between editor↔preview. */
  const programmaticCountRef = useRef<number>(0);
  /** Cached anchors + dirty flag — rebuilt only when content changes. */
  const anchorsRef = useRef<Anchor[]>([]);
  const anchorsDirtyRef = useRef<boolean>(true);
  /** Pending rAF ids for throttled scroll callbacks. */
  const rafEditorToPreviewRef = useRef<number | null>(null);
  const rafPreviewToEditorRef = useRef<number | null>(null);
  /** True while user drags the splitter — disables sync to avoid layout jitter. */
  const isDraggingRef = useRef<boolean>(false);

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
        setLiveContent(text);
        anchorsDirtyRef.current = true;
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

  /** Run `fn` while bumping the programmatic counter; decays after 2 rAF ticks. */
  const runProgrammatic = useCallback((fn: () => void) => {
    programmaticCountRef.current++;
    try {
      fn();
    } finally {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          programmaticCountRef.current = Math.max(
            0,
            programmaticCountRef.current - 1,
          );
        });
      });
    }
  }, []);

  /** Ensure anchors are fresh; returns null if preview not mounted. */
  const ensureAnchors = useCallback((): Anchor[] | null => {
    const previewEl = previewRef.current;
    const editor = editorInstanceRef.current;
    if (!previewEl || !editor) return null;
    if (anchorsDirtyRef.current || anchorsRef.current.length === 0) {
      const model = editor.getModel();
      const lastLine = model?.getLineCount() ?? 1;
      anchorsRef.current = buildAnchors(previewEl, lastLine);
      anchorsDirtyRef.current = false;
    }
    return anchorsRef.current;
  }, []);

  /** Editor → preview: interpolate the visible top line onto preview pixels. */
  const syncPreviewToEditor = useCallback(() => {
    if (isDraggingRef.current) return;
    const previewEl = previewRef.current;
    const editor = editorInstanceRef.current;
    if (!previewEl || !editor) return;
    const visible = editor.getVisibleRanges();
    if (visible.length === 0) return;
    const anchors = ensureAnchors();
    if (!anchors) return;

    // Use a fractional "line" derived from the editor's scrollTop for sub-line
    // precision (visibleRanges only exposes integer line numbers).
    const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);
    const startLine = visible[0].startLineNumber;
    const lineTop = editor.getTopForLineNumber(startLine);
    const scrollTop = editor.getScrollTop();
    const frac =
      lineHeight > 0
        ? Math.max(0, Math.min(1, (scrollTop - lineTop) / lineHeight))
        : 0;
    const line = startLine + frac;

    const pair = findAnchorPairByLine(anchors, line);
    if (!pair) return;
    const span = Math.max(1, pair.b.line - pair.a.line);
    const progress = Math.max(0, Math.min(1, (line - pair.a.line) / span));
    const targetTop = pair.a.top + progress * (pair.b.top - pair.a.top);

    runProgrammatic(() => {
      previewEl.scrollTo({ top: targetTop, behavior: "auto" });
    });
  }, [ensureAnchors, runProgrammatic]);

  /** Preview → editor: interpolate scrollTop onto a fractional source line. */
  const syncEditorToPreview = useCallback(() => {
    if (isDraggingRef.current) return;
    const previewEl = previewRef.current;
    const editor = editorInstanceRef.current;
    if (!previewEl || !editor) return;
    const anchors = ensureAnchors();
    if (!anchors) return;

    const scrollTop = previewEl.scrollTop;
    const pair = findAnchorPairByTop(anchors, scrollTop);
    if (!pair) return;
    const span = Math.max(1, pair.b.top - pair.a.top);
    const progress = Math.max(0, Math.min(1, (scrollTop - pair.a.top) / span));
    const targetLine = pair.a.line + progress * (pair.b.line - pair.a.line);

    const wholeLine = Math.max(1, Math.floor(targetLine));
    const frac = targetLine - wholeLine;
    const lineTop = editor.getTopForLineNumber(wholeLine);
    const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);

    runProgrammatic(() => {
      editor.setScrollTop(
        lineTop + frac * lineHeight,
        monaco.editor.ScrollType.Immediate,
      );
    });
  }, [ensureAnchors, runProgrammatic]);

  /** rAF-coalesced trigger for editor→preview sync. */
  const scheduleSyncPreviewToEditor = useCallback(() => {
    if (rafEditorToPreviewRef.current != null) return;
    rafEditorToPreviewRef.current = requestAnimationFrame(() => {
      rafEditorToPreviewRef.current = null;
      if (programmaticCountRef.current > 0) return;
      syncPreviewToEditor();
    });
  }, [syncPreviewToEditor]);

  /** rAF-coalesced trigger for preview→editor sync. */
  const scheduleSyncEditorToPreview = useCallback(() => {
    if (rafPreviewToEditorRef.current != null) return;
    rafPreviewToEditorRef.current = requestAnimationFrame(() => {
      rafPreviewToEditorRef.current = null;
      if (programmaticCountRef.current > 0) return;
      syncEditorToPreview();
    });
  }, [syncEditorToPreview]);

  const handleEditorMount: OnMount = useCallback(
    (editor) => {
      editorInstanceRef.current = editor;

      // Mirror content into `liveContent` so the markdown preview can re-render.
      editor.onDidChangeModelContent(() => {
        const current = editor.getValue();
        setLiveContent(current);
        anchorsDirtyRef.current = true;
        if (!readOnly) {
          const isDirty = current !== originalRef.current;
          setDirty(isDirty);
          onDirtyChangeRef.current?.(isDirty);
        }
      });

      // Editor → preview synchronized scroll (only active in markdown split).
      editor.onDidScrollChange(() => {
        if (!previewRef.current) return;
        if (programmaticCountRef.current > 0) return;
        scheduleSyncPreviewToEditor();
      });

      if (readOnly) return;

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        handleSave();
      });
    },
    [handleSave, readOnly, scheduleSyncPreviewToEditor],
  );

  /** Preview scroll handler — drives Monaco. */
  const handlePreviewScroll = useCallback(() => {
    if (programmaticCountRef.current > 0) return;
    scheduleSyncEditorToPreview();
  }, [scheduleSyncEditorToPreview]);

  /** Splitter drag — clamp 15..85 and disable text selection while dragging. */
  const handleSplitterMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    setDragging(true);
    isDraggingRef.current = true;

    const onMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(85, Math.max(15, pct));
      setLeftPct(clamped);
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // Resume sync next frame so layout settles before we recompute anchors.
      requestAnimationFrame(() => {
        isDraggingRef.current = false;
        anchorsDirtyRef.current = true;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

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
  const isMarkdown = lang === "markdown";

  const editorPane = (
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
  );

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
      {isMarkdown ? (
        <div
          ref={splitContainerRef}
          className={`flex h-full min-h-0 flex-1 ${
            dragging ? "select-none" : ""
          }`}
        >
          <div style={{ width: `${leftPct}%` }} className="min-w-0">
            {editorPane}
          </div>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only splitter has no semantic role */}
          <div
            onMouseDown={handleSplitterMouseDown}
            className="w-[3px] shrink-0 cursor-col-resize bg-black/[0.06] hover:bg-blue-500/40 dark:bg-white/[0.08]"
          />
          <div
            ref={previewRef}
            onScroll={handlePreviewScroll}
            style={{ width: `${100 - leftPct}%` }}
            className="min-w-0 overflow-y-auto px-4 py-3"
          >
            <Markdown content={liveContent} />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1">{editorPane}</div>
      )}
    </div>
  );
}
