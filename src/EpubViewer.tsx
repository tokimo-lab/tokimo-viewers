/**
 * EpubViewer — EPUB / MOBI / AZW3 reader component.
 *
 * Pure UI component. Caller provides:
 *  - `fileUrl`   — URL to fetch the ebook binary.
 *  - `isMobi`    — true for MOBI/AZW3 files (vs EPUB).
 *  - `parseBook` — async function that parses an ArrayBuffer into an EpubBook.
 *  - `fetchBook` — optional host fetcher for auth/header glue.
 *  - `isActive`  — when true, enables keyboard (Arrow left/right) navigation.
 */

import { ScrollArea } from "@tokimo/ui";
import {
  ChevronLeft,
  ChevronRight,
  List,
  Minus,
  Palette,
  Plus,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EpubTocTree } from "./EpubTocTree";
import { buildReaderCSS, READER_THEMES } from "./epub-reader-theme";
import { startScrollTracking } from "./epub-reader-toc";
import type {
  EpubBook,
  EpubTocItem,
  EpubViewerProps,
  ReaderTheme,
} from "./epub-reader-types";

export type {
  EpubBook,
  EpubSpineItem,
  EpubTocItem,
  EpubViewerProps,
} from "./epub-reader-types";

async function fetchEbookBinary(fileUrl: string): Promise<ArrayBuffer> {
  const res = await fetch(fileUrl, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.arrayBuffer();
}

export function EpubViewer({
  fileUrl,
  parseBook,
  fetchBook,
  isActive = false,
}: EpubViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const scrollCleanupRef = useRef<(() => void) | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toc, setToc] = useState<EpubTocItem[]>([]);
  const [showToc, setShowToc] = useState(true);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [totalChapters, setTotalChapters] = useState(0);
  const [fontSize, setFontSize] = useState(100);
  const [theme, setTheme] = useState<ReaderTheme>(READER_THEMES[0]);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [activeHref, setActiveHref] = useState("");

  const fontSizeRef = useRef(fontSize);
  const themeRef = useRef(theme);
  fontSizeRef.current = fontSize;
  themeRef.current = theme;

  /* ── Shadow root init ──────────────────────────────── */

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    shadowRef.current = shadow;

    const styleEl = document.createElement("style");
    styleEl.textContent = buildReaderCSS(fontSizeRef.current, themeRef.current);
    shadow.appendChild(styleEl);
    styleRef.current = styleEl;

    const bodyEl = document.createElement("div");
    bodyEl.className = "reader-body";
    shadow.appendChild(bodyEl);
    contentRef.current = bodyEl;
  }, []);

  /* ── Load ebook ─────────────────────────────────── */

  useEffect(() => {
    if (!fileUrl) return;
    let destroyed = false;

    (async () => {
      try {
        const buf = await (fetchBook ?? fetchEbookBinary)(fileUrl);
        if (destroyed) return;

        const book = await parseBook(buf);
        if (destroyed) {
          book.destroy();
          return;
        }

        bookRef.current = book;
        setToc(book.toc);
        setTotalChapters(book.spine.length);
        setChapterIndex(0);

        const content = contentRef.current;
        if (content) {
          const html = await book.getChapterHtml(0);
          content.innerHTML = html;
        }

        const host = hostRef.current;
        const shadow = shadowRef.current;
        if (host && shadow) {
          host.scrollTo(0, 0);
          startScrollTracking(
            book.toc,
            book.spine[0]?.href ?? "",
            host,
            shadow,
            setActiveHref,
            scrollCleanupRef,
          );
        }
        if (!destroyed) setLoading(false);
      } catch (err) {
        console.error("[EpubViewer] Failed to load ebook:", err);
        if (!destroyed) {
          setError(err instanceof Error ? err.message : "Failed to load ebook");
          setLoading(false);
        }
      }
    })();

    return () => {
      destroyed = true;
      scrollCleanupRef.current?.();
      if (bookRef.current) {
        bookRef.current.destroy();
        bookRef.current = null;
      }
    };
  }, [fileUrl, fetchBook, parseBook]);

  /* ── Update styles on theme / font change ────────── */

  useEffect(() => {
    if (styleRef.current) {
      styleRef.current.textContent = buildReaderCSS(fontSize, theme);
    }
  }, [fontSize, theme]);

  /* ── Navigation ─────────────────────────────────── */

  const goTo = useCallback(
    async (index: number, fragment?: string) => {
      const book = bookRef.current;
      const host = hostRef.current;
      const shadow = shadowRef.current;
      const content = contentRef.current;
      if (!book || !host || !shadow || !content) return;
      if (index < 0 || index >= book.spine.length) return;
      setChapterIndex(index);

      const html = await book.getChapterHtml(index);
      content.innerHTML = html;

      if (fragment) {
        const el = shadow.querySelector<HTMLElement>(
          `[id="${CSS.escape(fragment)}"]`,
        );
        if (el) el.scrollIntoView();
        else host.scrollTo(0, 0);
      } else {
        host.scrollTo(0, 0);
      }
      startScrollTracking(
        toc,
        book.spine[index]?.href ?? "",
        host,
        shadow,
        setActiveHref,
        scrollCleanupRef,
      );
    },
    [toc],
  );

  const goPrev = useCallback(
    () => goTo(chapterIndex - 1),
    [goTo, chapterIndex],
  );
  const goNext = useCallback(
    () => goTo(chapterIndex + 1),
    [goTo, chapterIndex],
  );

  const goToHref = useCallback(
    (href: string) => {
      const book = bookRef.current;
      if (!book) return;
      const hashIdx = href.indexOf("#");
      const base = hashIdx >= 0 ? href.substring(0, hashIdx) : href;
      const fragment = hashIdx >= 0 ? href.substring(hashIdx + 1) : undefined;
      const idx = book.spine.findIndex(
        (s) =>
          s.href === base ||
          s.href.endsWith(`/${base}`) ||
          base.endsWith(s.href),
      );
      if (idx >= 0) goTo(idx, fragment);
    },
    [goTo],
  );

  /* ── Keyboard navigation ── */

  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goPrev, goNext, isActive]);

  /* ── Font size ──────────────────────────────────── */

  const changeFontSize = useCallback((next: number) => {
    setFontSize(next);
  }, []);

  const increaseFontSize = useCallback(
    () => changeFontSize(Math.min(fontSize + 10, 200)),
    [changeFontSize, fontSize],
  );
  const decreaseFontSize = useCallback(
    () => changeFontSize(Math.max(fontSize - 10, 60)),
    [changeFontSize, fontSize],
  );
  const resetFontSize = useCallback(
    () => changeFontSize(100),
    [changeFontSize],
  );

  if (!fileUrl) return null;

  /* ── Render ─────────────────────────────────────── */

  return (
    <div className="flex h-full flex-col">
      {/* ── Toolbar ── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-base bg-[var(--bg-glass)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
        {toc.length > 0 && (
          <button
            type="button"
            onClick={() => setShowToc((v) => !v)}
            className={`rounded p-1 hover:bg-[var(--bg-glass-hover)] ${
              showToc
                ? "bg-[var(--bg-glass-hover)] text-[var(--text-primary)]"
                : ""
            }`}
            title="Table of contents"
          >
            <List size={14} />
          </button>
        )}

        <button
          type="button"
          onClick={goPrev}
          disabled={chapterIndex <= 0}
          className="rounded p-1 hover:bg-[var(--bg-glass-hover)] disabled:opacity-30"
          title="Previous chapter"
        >
          <ChevronLeft size={14} />
        </button>

        <span className="tabular-nums">
          {totalChapters > 0 ? `${chapterIndex + 1} / ${totalChapters}` : ""}
        </span>

        <button
          type="button"
          onClick={goNext}
          disabled={chapterIndex >= totalChapters - 1}
          className="rounded p-1 hover:bg-[var(--bg-glass-hover)] disabled:opacity-30"
          title="Next chapter"
        >
          <ChevronRight size={14} />
        </button>

        <div className="flex-1" />

        {/* Theme picker */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowThemePicker((v) => !v)}
            className={`rounded p-1 hover:bg-[var(--bg-glass-hover)] ${
              showThemePicker
                ? "bg-[var(--bg-glass-hover)] text-[var(--text-primary)]"
                : ""
            }`}
            title="Reader theme"
          >
            <Palette size={14} />
          </button>
          {showThemePicker && (
            <div className="absolute right-0 top-full z-20 mt-1 flex gap-1.5 rounded-lg border border-border-base bg-[var(--bg-elevated)] p-2 shadow-lg">
              {READER_THEMES.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => {
                    setTheme(t);
                    setShowThemePicker(false);
                  }}
                  className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                    theme.label === t.label
                      ? "border-[var(--accent)] scale-110"
                      : "border-border-base"
                  }`}
                  style={{ background: t.swatch }}
                  title={t.label}
                />
              ))}
            </div>
          )}
        </div>

        <div className="mx-1 h-3 w-px bg-[var(--border-base)]" />

        <button
          type="button"
          onClick={decreaseFontSize}
          className="rounded p-1 hover:bg-[var(--bg-glass-hover)]"
          title="Decrease font size"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          onClick={resetFontSize}
          className="rounded px-1.5 py-0.5 tabular-nums hover:bg-[var(--bg-glass-hover)]"
        >
          {fontSize}%
        </button>
        <button
          type="button"
          onClick={increaseFontSize}
          className="rounded p-1 hover:bg-[var(--bg-glass-hover)]"
          title="Increase font size"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* ── Content ── */}
      {error ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-muted)]">
          {error}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* TOC sidebar */}
          {showToc && (
            <ScrollArea
              className="w-56 shrink-0 border-r border-border-base bg-[var(--sidebar-bg)] text-xs"
              direction="vertical"
              innerClassName="p-2"
            >
              <EpubTocTree
                items={toc}
                activeHref={activeHref}
                onSelect={goToHref}
              />
            </ScrollArea>
          )}

          {/* Reader area */}
          <div className="relative flex-1 overflow-hidden">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-[var(--text-muted)]">
                Loading…
              </div>
            )}
            <div ref={hostRef} className="h-full w-full" />
          </div>
        </div>
      )}
    </div>
  );
}
