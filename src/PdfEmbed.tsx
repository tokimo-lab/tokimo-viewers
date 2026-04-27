/**
 * PdfEmbed — Canvas-based PDF viewer using pdfjs-dist directly.
 *
 * Three view modes:
 *  - "scroll" (default): continuous vertical scroll of all pages.
 *  - "single": one page at a time with prev/next controls.
 *  - "tile": multi-column grid fitting as many pages as the container allows.
 *
 * Performance: pages render only when visible (IntersectionObserver),
 * and width changes are debounced so dragging the zoom slider is smooth.
 */

import {
  FileText,
  GalleryVertical,
  Grid2x2,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// pdfjs bootstrap — main-thread worker (no Web Worker)
// ---------------------------------------------------------------------------
let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function getPdfjs() {
  if (!pdfjsPromise) {
    // @ts-expect-error — worker module has no type declarations
    pdfjsPromise = import("pdfjs-dist/build/pdf.worker.min.mjs")
      .then((workerMod) => {
        (globalThis as Record<string, unknown>).pdfjsWorker = workerMod;
        return import("pdfjs-dist");
      })
      .then((mod) => {
        mod.GlobalWorkerOptions.workerSrc = "data:,";
        return mod;
      });
  }
  return pdfjsPromise;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type PdfViewMode = "scroll" | "single" | "tile";

interface PdfEmbedProps {
  src: string;
  title?: string;
  className?: string;
  /** View mode — default "scroll" */
  mode?: PdfViewMode;
  /** Maximum width in px for the rendered pages (scroll/single modes only) */
  maxWidth?: number;
  /** Show built-in mode switcher toolbar */
  showModeBar?: boolean;
  /** Called when user changes mode via the toolbar */
  onModeChange?: (mode: PdfViewMode) => void;
  /** Zoom level (0.25–3.0, default 1.0). Persisted externally. */
  zoom?: number;
  /** Called when user changes zoom */
  onZoomChange?: (zoom: number) => void;
}

type PDFDocumentProxy = Awaited<
  ReturnType<typeof import("pdfjs-dist")["getDocument"]>["promise"]
>;

const MODE_OPTIONS: {
  value: PdfViewMode;
  icon: typeof FileText;
  label: string;
}[] = [
  { value: "scroll", icon: GalleryVertical, label: "连页" },
  { value: "single", icon: FileText, label: "单页" },
  { value: "tile", icon: Grid2x2, label: "平铺" },
];

const RENDER_DEBOUNCE_MS = 250;

// ---------------------------------------------------------------------------
// PdfEmbed
// ---------------------------------------------------------------------------
export function PdfEmbed({
  src,
  className,
  mode = "scroll",
  maxWidth,
  showModeBar = true,
  onModeChange,
  zoom: externalZoom,
  onZoomChange,
}: PdfEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [internalZoom, setInternalZoom] = useState(1);

  const zoom = externalZoom ?? internalZoom;
  const setZoom = useCallback(
    (z: number) => {
      const clamped = Math.round(Math.max(0.25, Math.min(3, z)) * 100) / 100;
      if (onZoomChange) onZoomChange(clamped);
      else setInternalZoom(clamped);
    },
    [onZoomChange],
  );

  // Measure container width
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    setContainerWidth(node.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;
    setPdf(null);
    setError(false);
    setCurrentPage(1);

    let loadingTask: ReturnType<
      typeof import("pdfjs-dist")["getDocument"]
    > | null = null;

    getPdfjs()
      .then((pdfjsLib) => {
        if (cancelled) return;
        loadingTask = pdfjsLib.getDocument(src);
        return loadingTask.promise;
      })
      .then((doc) => {
        if (!cancelled && doc) setPdf(doc);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[PdfEmbed] Load failed:", err);
          setError(true);
        }
      });

    return () => {
      cancelled = true;
      loadingTask?.destroy();
    };
  }, [src]);

  // For scroll/single: apply maxWidth then zoom
  const baseWidth = maxWidth
    ? Math.min(containerWidth || maxWidth, maxWidth)
    : containerWidth || undefined;
  const effectiveWidth = baseWidth ? Math.round(baseWidth * zoom) : undefined;

  const pageNumbers = useMemo(
    () => (pdf ? Array.from({ length: pdf.numPages }, (_, i) => i + 1) : []),
    [pdf],
  );

  const goPage = useCallback(
    (delta: number) => {
      if (!pdf) return;
      setCurrentPage((p) => Math.max(1, Math.min(pdf.numPages, p + delta)));
    },
    [pdf],
  );

  // Tile mode: use full containerWidth, zoom scales min page width
  const BASE_TILE_PAGE_WIDTH = 150;
  const TILE_GAP = 8;
  const minTilePageWidth = Math.round(BASE_TILE_PAGE_WIDTH * zoom);
  const tileCols = useMemo(() => {
    if (!containerWidth) return 1;
    return Math.max(
      1,
      Math.floor((containerWidth + TILE_GAP) / (minTilePageWidth + TILE_GAP)),
    );
  }, [containerWidth, minTilePageWidth]);

  const tilePageWidth = containerWidth
    ? Math.floor((containerWidth - (tileCols - 1) * TILE_GAP) / tileCols)
    : undefined;

  // Zoom controls component
  const zoomControls = (
    <>
      <div className="mx-1.5 h-3.5 w-px bg-border-base" />
      <button
        type="button"
        className="cursor-pointer rounded p-0.5 text-content-secondary transition-colors hover:bg-fill-tertiary disabled:cursor-default disabled:opacity-30"
        disabled={zoom <= 0.25}
        onClick={() => setZoom(zoom - 0.1)}
      >
        <Minus size={13} />
      </button>
      <input
        type="range"
        className="h-1 w-16 cursor-pointer accent-fill-brand"
        min={25}
        max={300}
        step={5}
        value={Math.round(zoom * 100)}
        onChange={(e) => setZoom(Number(e.target.value) / 100)}
      />
      <button
        type="button"
        className="cursor-pointer rounded p-0.5 text-content-secondary transition-colors hover:bg-fill-tertiary disabled:cursor-default disabled:opacity-30"
        disabled={zoom >= 3}
        onClick={() => setZoom(zoom + 0.1)}
      >
        <Plus size={13} />
      </button>
      <button
        type="button"
        className="cursor-pointer rounded px-1 py-0.5 tabular-nums text-content-secondary transition-colors hover:bg-fill-tertiary"
        onClick={() => setZoom(1)}
        title="重置缩放"
      >
        {zoom === 1 ? <RotateCcw size={13} /> : `${Math.round(zoom * 100)}%`}
      </button>
    </>
  );

  // Mode bar component — always shown when showModeBar is true
  const modeBar = showModeBar && pdf && (
    <div className="flex shrink-0 items-center justify-center gap-1 border-t border-border-base bg-surface-base/80 px-3 py-1 text-xs backdrop-blur">
      {pdf.numPages > 1 &&
        MODE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              className={`flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 transition-colors ${
                active
                  ? "bg-fill-brand-secondary text-fg-on-emphasis"
                  : "text-content-secondary hover:bg-fill-tertiary"
              }`}
              onClick={() => onModeChange?.(opt.value)}
            >
              <Icon size={13} />
              <span>{opt.label}</span>
            </button>
          );
        })}

      {mode === "single" && pdf.numPages > 1 && (
        <>
          <div className="mx-1.5 h-3.5 w-px bg-border-base" />
          <button
            type="button"
            className="cursor-pointer rounded px-2 py-0.5 text-content-secondary transition-colors hover:bg-fill-tertiary disabled:cursor-default disabled:opacity-30"
            disabled={currentPage <= 1}
            onClick={() => goPage(-1)}
          >
            ‹
          </button>
          <span className="tabular-nums text-content-secondary">
            {currentPage} / {pdf.numPages}
          </span>
          <button
            type="button"
            className="cursor-pointer rounded px-2 py-0.5 text-content-secondary transition-colors hover:bg-fill-tertiary disabled:cursor-default disabled:opacity-30"
            disabled={currentPage >= pdf.numPages}
            onClick={() => goPage(1)}
          >
            ›
          </button>
        </>
      )}

      {zoomControls}
    </div>
  );

  if (error) {
    return (
      <div
        className={`flex h-full items-center justify-center text-sm text-content-tertiary ${className ?? ""}`}
      >
        PDF 加载失败
      </div>
    );
  }

  if (!pdf) {
    return (
      <div
        ref={containerRef}
        className={`flex h-full items-center justify-center text-sm text-content-tertiary ${className ?? ""}`}
      >
        加载 PDF 中…
      </div>
    );
  }

  // --- Scroll mode ---
  if (mode === "scroll") {
    return (
      <div
        ref={containerRef}
        className={`relative flex h-full flex-col bg-neutral-200 dark:bg-neutral-800 ${className ?? ""}`}
      >
        <div className="min-h-0 flex-1 overflow-auto">
          {pageNumbers.map((pageNum) => (
            <PdfPage
              key={pageNum}
              pdf={pdf}
              pageNumber={pageNum}
              width={effectiveWidth}
            />
          ))}
        </div>
        {modeBar}
      </div>
    );
  }

  // --- Tile mode ---
  if (mode === "tile") {
    return (
      <div
        ref={containerRef}
        className={`relative flex h-full flex-col bg-neutral-200 dark:bg-neutral-800 ${className ?? ""}`}
      >
        <div className="min-h-0 flex-1 overflow-auto">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${tileCols}, 1fr)`,
              gap: `${TILE_GAP}px`,
              padding: `${TILE_GAP}px`,
            }}
          >
            {pageNumbers.map((pageNum) => (
              <PdfPage
                key={pageNum}
                pdf={pdf}
                pageNumber={pageNum}
                width={tilePageWidth}
              />
            ))}
          </div>
        </div>
        {modeBar}
      </div>
    );
  }

  // --- Single page mode ---
  return (
    <div
      ref={containerRef}
      className={`relative flex h-full flex-col bg-neutral-200 dark:bg-neutral-800 ${className ?? ""}`}
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <PdfPage pdf={pdf} pageNumber={currentPage} width={effectiveWidth} />
      </div>
      {modeBar}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PdfPage — renders a single PDF page to canvas
//
// - Debounces width changes: immediately scales canvas via CSS transform,
//   then re-renders at full quality after RENDER_DEBOUNCE_MS.
// - Uses IntersectionObserver to skip rendering for off-screen pages.
// ---------------------------------------------------------------------------
function PdfPage({
  pdf,
  pageNumber,
  width,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  // Track the width that was actually rendered so we can CSS-scale in the gap
  const renderedWidthRef = useRef<number | undefined>(undefined);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const renderIdRef = useRef(0);

  // IntersectionObserver — mark visible when within 200px of viewport
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Render logic — debounced on width changes, gated on visibility
  useEffect(() => {
    if (!visible) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // If we already have a rendered canvas and width changed, apply CSS scale
    // for instant visual feedback while debounce timer runs
    const canvas = canvasRef.current;
    if (canvas && renderedWidthRef.current && width) {
      const ratio = width / renderedWidthRef.current;
      canvas.style.transform = `scale(${ratio})`;
      canvas.style.transformOrigin = "top center";
    }

    debounceRef.current = setTimeout(() => {
      const id = ++renderIdRef.current;
      let renderTask: ReturnType<
        Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]
      > | null = null;

      pdf.getPage(pageNumber).then((page) => {
        if (id !== renderIdRef.current) return;
        const c = canvasRef.current;
        if (!c) return;

        const desiredWidth = width ?? page.getViewport({ scale: 1 }).width;
        const scale = desiredWidth / page.getViewport({ scale: 1 }).width;
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: scale * dpr });

        c.width = viewport.width;
        c.height = viewport.height;
        c.style.width = `${viewport.width / dpr}px`;
        c.style.height = `${viewport.height / dpr}px`;
        c.style.transform = "";
        c.style.transformOrigin = "";

        const ctx = c.getContext("2d");
        if (!ctx) return;

        renderTask = page.render({
          canvasContext: ctx,
          viewport,
        } as Parameters<typeof page.render>[0]);
        renderTask.promise
          .then(() => {
            renderedWidthRef.current = desiredWidth;
          })
          .catch(() => {
            // cancelled or failed
          });
      });

      return () => {
        renderTask?.cancel();
      };
    }, RENDER_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [pdf, pageNumber, width, visible]);

  // Cleanup render id on unmount to cancel any in-flight renders
  useEffect(() => {
    return () => {
      renderIdRef.current++;
    };
  }, []);

  return (
    <div ref={wrapRef} className="flex justify-center overflow-hidden">
      <canvas ref={canvasRef} className="mb-2 block last:mb-0" />
    </div>
  );
}
