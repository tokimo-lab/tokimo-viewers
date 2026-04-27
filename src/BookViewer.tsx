/**
 * BookViewer — novel/book chapter reader.
 *
 * Pure UI component. Caller provides:
 *  - `bookId`           — book identifier.
 *  - `initialChapterId` — chapter to open initially.
 *  - `route`            — current window route (used to extract chapterId from
 *                         "/chapters/:id" pattern if present).
 *  - `fetchChapter`     — async function that fetches a chapter's content.
 *  - `isActive`         — when true, enables Arrow Left/Right keyboard navigation.
 */

import { Spin } from "@tokimo/ui";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Minus,
  Moon,
  Plus,
  Settings,
  Sun,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookSettingsPanel } from "./BookSettingsPanel";
import type { ReaderSettings, ReaderTheme } from "./book-reader-settings";
import {
  FONT_FAMILIES,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  loadSettings,
  saveSettings,
  THEME_MAP,
} from "./book-reader-settings";
import type { BookChapterContent, BookViewerProps } from "./book-reader-types";
import { ReadingProgressBar } from "./ReadingProgressBar";

export type { BookChapterContent, BookViewerProps } from "./book-reader-types";

/* ── Main Component ─────────────────────────────────── */

export function BookViewer({
  bookId,
  initialChapterId,
  route = "",
  fetchChapter,
  isActive = false,
}: BookViewerProps) {
  const routeChapterId = route.startsWith("/chapters/")
    ? route.slice("/chapters/".length)
    : undefined;
  const [currentChapterId, setCurrentChapterId] = useState(
    routeChapterId ?? initialChapterId,
  );
  const [chapter, setChapter] = useState<BookChapterContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<ReaderSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const themeColors = THEME_MAP[settings.theme];

  const updateSettings = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  // Fetch chapter when bookId or chapterId changes
  useEffect(() => {
    if (!bookId || !currentChapterId) return;
    setLoading(true);
    fetchChapter(bookId, currentChapterId)
      .then((ch) => {
        setChapter(ch ?? null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        console.error("[BookViewer] Failed to fetch chapter:", err);
        setLoading(false);
      });
  }, [bookId, currentChapterId, fetchChapter]);

  // Split content into paragraphs
  const paragraphs = useMemo(() => {
    if (!chapter?.content) return [];
    return chapter.content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((text, i) => ({
        id: `${currentChapterId}-${i}-${text.slice(0, 8)}`,
        text,
      }));
  }, [chapter?.content, currentChapterId]);

  // Scroll to top when chapter changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on chapter change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentChapterId]);

  const handlePrev = useCallback(() => {
    if (chapter?.prevChapterId) setCurrentChapterId(chapter.prevChapterId);
  }, [chapter?.prevChapterId]);

  const handleNext = useCallback(() => {
    if (chapter?.nextChapterId) setCurrentChapterId(chapter.nextChapterId);
  }, [chapter?.nextChapterId]);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handlePrev, handleNext, isActive]);

  if (loading) {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ backgroundColor: themeColors.bg }}
      >
        <Spin />
      </div>
    );
  }

  if (!chapter) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3"
        style={{ backgroundColor: themeColors.bg, color: themeColors.text }}
      >
        <p className="text-sm">章节内容不可用</p>
      </div>
    );
  }

  const ThemeIcon =
    settings.theme === "dark"
      ? Moon
      : settings.theme === "sepia"
        ? BookOpen
        : Sun;

  return (
    <div
      className="relative flex h-full flex-col transition-colors duration-300"
      style={{ backgroundColor: themeColors.bg, color: themeColors.text }}
    >
      <ReadingProgressBar
        color={settings.theme === "dark" ? "#6366f1" : "#3b82f6"}
        containerRef={scrollRef}
      />

      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between px-4 py-2 text-xs opacity-70"
        style={{ backgroundColor: themeColors.secondaryBg }}
      >
        <span className="truncate">{chapter.bookTitle}</span>
        <span className="ml-2 truncate">
          {chapter.volumeTitle ? `${chapter.volumeTitle} · ` : ""}
          {chapter.title ?? `第${chapter.chapterNumber}章`}
        </span>
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[700px] px-6 py-8 md:px-8">
          {/* Chapter title */}
          <h1
            className="mb-8 text-center font-bold leading-tight"
            style={{
              fontSize: settings.fontSize + 4,
              fontFamily: FONT_FAMILIES[settings.fontFamily],
            }}
          >
            {chapter.title ?? `第${chapter.chapterNumber}章`}
          </h1>

          {/* Paragraphs */}
          <article
            style={{
              fontSize: `${settings.fontSize}px`,
              fontFamily: FONT_FAMILIES[settings.fontFamily],
              fontWeight: settings.fontWeight,
              lineHeight: 1.9,
              letterSpacing: "0.04em",
            }}
          >
            {paragraphs.map((para) => (
              <p key={para.id} className="mb-4" style={{ textIndent: "2em" }}>
                {para.text}
              </p>
            ))}
          </article>

          {/* Bottom chapter navigation */}
          <div
            className="mt-12 flex items-center justify-between rounded-lg px-4 py-4"
            style={{ backgroundColor: themeColors.secondaryBg }}
          >
            <button
              type="button"
              className="flex items-center gap-1 text-sm disabled:opacity-30"
              disabled={!chapter.prevChapterId}
              onClick={handlePrev}
              style={{ color: themeColors.text }}
            >
              <ChevronLeft size={16} />
              上一章
            </button>
            <span className="text-xs opacity-50">
              第{chapter.chapterNumber}章
            </span>
            <button
              type="button"
              className="flex items-center gap-1 text-sm disabled:opacity-30"
              disabled={!chapter.nextChapterId}
              onClick={handleNext}
              style={{ color: themeColors.text }}
            >
              下一章
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Floating controls bar */}
      <div className="pointer-events-none absolute right-0 bottom-3 left-0 z-10 flex justify-center">
        <div
          className="pointer-events-auto flex items-center gap-1 rounded-full px-3 py-2 shadow-lg backdrop-blur-md"
          style={{ backgroundColor: `${themeColors.secondaryBg}ee` }}
        >
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:opacity-70 disabled:opacity-30"
            disabled={!chapter.prevChapterId}
            onClick={handlePrev}
            title="上一章"
          >
            <ChevronLeft size={18} />
          </button>

          <div
            className="mx-1 h-5 w-px opacity-20"
            style={{ backgroundColor: themeColors.text }}
          />

          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:opacity-70 disabled:opacity-30"
            disabled={settings.fontSize <= FONT_SIZE_MIN}
            onClick={() =>
              updateSettings({
                fontSize: Math.max(
                  FONT_SIZE_MIN,
                  settings.fontSize - FONT_SIZE_STEP,
                ),
              })
            }
            title="缩小字体"
          >
            <Minus size={16} />
          </button>

          <span className="w-8 text-center text-xs opacity-60">
            {settings.fontSize}
          </span>

          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:opacity-70 disabled:opacity-30"
            disabled={settings.fontSize >= FONT_SIZE_MAX}
            onClick={() =>
              updateSettings({
                fontSize: Math.min(
                  FONT_SIZE_MAX,
                  settings.fontSize + FONT_SIZE_STEP,
                ),
              })
            }
            title="放大字体"
          >
            <Plus size={16} />
          </button>

          <div
            className="mx-1 h-5 w-px opacity-20"
            style={{ backgroundColor: themeColors.text }}
          />

          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:opacity-70"
            onClick={() => {
              const cycle: ReaderTheme[] = ["light", "dark", "sepia"];
              const idx = cycle.indexOf(settings.theme);
              updateSettings({ theme: cycle[(idx + 1) % cycle.length] });
            }}
            title={`主题: ${settings.theme}`}
          >
            <ThemeIcon size={16} />
          </button>

          <div
            className="mx-1 h-5 w-px opacity-20"
            style={{ backgroundColor: themeColors.text }}
          />

          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:opacity-70"
            onClick={() => setShowSettings((v) => !v)}
            title="设置"
          >
            <Settings size={16} />
          </button>

          <div
            className="mx-1 h-5 w-px opacity-20"
            style={{ backgroundColor: themeColors.text }}
          />

          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:opacity-70 disabled:opacity-30"
            disabled={!chapter.nextChapterId}
            onClick={handleNext}
            title="下一章"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {showSettings && (
        <BookSettingsPanel
          settings={settings}
          onUpdate={updateSettings}
          themeColors={themeColors}
        />
      )}
    </div>
  );
}

export default BookViewer;
