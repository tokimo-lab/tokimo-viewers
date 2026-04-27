/**
 * ImagePreview — Standalone zoom/rotate/pan image viewer.
 *
 * Extracted from VfsImageViewer so it can be reused in non-window contexts
 * (e.g. document attachment previews) while keeping the full interaction set.
 */

import { Maximize2, Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_SCALE = 0.1;
const MAX_SCALE = 20;
const ZOOM_STEP = 1.15;

const preventDrag = (e: React.SyntheticEvent) => e.preventDefault();

// ── Types ────────────────────────────────────────────────────────────────────

interface ImagePreviewProps {
  src: string;
  alt?: string;
  /** Show bottom toolbar with zoom/rotate controls. Default true. */
  showToolbar?: boolean;
  /** Extra elements to render in the toolbar (e.g. sibling nav, info toggle). */
  toolbarExtra?: React.ReactNode;
  /** Callback when image loads with natural dimensions. */
  onImageLoad?: (width: number, height: number) => void;
  className?: string;
  /**
   * Optional ref from a parent scroll container. When `.current` is true,
   * wheel-zoom is suppressed so the parent can scroll instead.
   * Defaults to an always-false ref (zoom always active).
   */
  scrollGuardRef?: RefObject<boolean>;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ImagePreview({
  src,
  alt,
  showToolbar = true,
  toolbarExtra,
  onImageLoad,
  className,
  scrollGuardRef: scrollGuardRefProp,
}: ImagePreviewProps) {
  // ── State ──────────────────────────────────────────────────────
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Pinch-to-zoom refs
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{
    dist: number;
    scale: number;
    midX: number;
    midY: number;
  } | null>(null);

  // Refs for native wheel listener
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const panXRef = useRef(panX);
  panXRef.current = panX;
  const panYRef = useRef(panY);
  panYRef.current = panY;

  const fallbackScrollGuardRef = useRef<boolean>(false);
  const scrollGuardRef = scrollGuardRefProp ?? fallbackScrollGuardRef;

  // Reset view when src changes
  const prevSrc = useRef(src);
  useEffect(() => {
    if (prevSrc.current !== src) {
      prevSrc.current = src;
      setScale(1);
      setRotation(0);
      setPanX(0);
      setPanY(0);
    }
  }, [src]);

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      onImageLoad?.(img.naturalWidth, img.naturalHeight);
    },
    [onImageLoad],
  );

  // ── Zoom (wheel, cursor-relative, native listener for passive:false) ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handler = (e: WheelEvent) => {
      if (scrollGuardRef.current) return; // skip zoom while parent scrolls
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left - rect.width / 2;
      const cursorY = e.clientY - rect.top - rect.height / 2;

      const oldS = scaleRef.current;
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldS * factor));
      if (next === oldS) return;

      const ratio = 1 - next / oldS;
      setPanX(panXRef.current + (cursorX - panXRef.current) * ratio);
      setPanY(panYRef.current + (cursorY - panYRef.current) * ratio);
      setScale(next);
    };

    container.addEventListener("wheel", handler, { passive: false });
    return () => container.removeEventListener("wheel", handler);
  }, [scrollGuardRef]);

  // ── Pinch helpers ──────────────────────────────────────────────
  const getPointerDist = useCallback(
    (pointers: Map<number, { x: number; y: number }>) => {
      const pts = [...pointers.values()];
      if (pts.length < 2) return 0;
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      return Math.sqrt(dx * dx + dy * dy);
    },
    [],
  );

  const getPointerMid = useCallback(
    (pointers: Map<number, { x: number; y: number }>) => {
      const pts = [...pointers.values()];
      return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    },
    [],
  );

  // ── Pan (drag) & Pinch-to-zoom ──────────────────────────────
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const pointers = pointersRef.current;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      if (pointers.size === 2) {
        // Start pinch — cancel any single-pointer drag
        dragging.current = false;
        setIsDragging(false);
        const dist = getPointerDist(pointers);
        const mid = getPointerMid(pointers);
        pinchStartRef.current = {
          dist,
          scale: scaleRef.current,
          midX: mid.x,
          midY: mid.y,
        };
      } else if (pointers.size === 1) {
        dragging.current = true;
        setIsDragging(true);
        lastPos.current = { x: e.clientX, y: e.clientY };
      }
    },
    [getPointerDist, getPointerMid],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const pointers = pointersRef.current;
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2 && pinchStartRef.current) {
        // Pinch zoom
        const newDist = getPointerDist(pointers);
        const pinch = pinchStartRef.current;
        const ratio = newDist / pinch.dist;
        const next = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, pinch.scale * ratio),
        );

        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const mid = getPointerMid(pointers);
        const cx = mid.x - rect.left - rect.width / 2;
        const cy = mid.y - rect.top - rect.height / 2;

        const oldS = scaleRef.current;
        if (next !== oldS) {
          const r = 1 - next / oldS;
          const newPanX = panXRef.current + (cx - panXRef.current) * r;
          const newPanY = panYRef.current + (cy - panYRef.current) * r;
          setPanX(newPanX);
          setPanY(newPanY);
          setScale(next);
        }
        return;
      }

      // Single-pointer drag
      if (!dragging.current) return;
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };
      setPanX((px) => px + dx);
      setPanY((py) => py + dy);
    },
    [getPointerDist, getPointerMid],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const pointers = pointersRef.current;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) {
      pinchStartRef.current = null;
    }
    if (pointers.size === 0) {
      dragging.current = false;
      setIsDragging(false);
    }
  }, []);

  // ── Double-click to toggle zoom ───────────────────────────────
  const handleDoubleClick = useCallback(() => {
    setScale((prev) => {
      if (Math.abs(prev - 1) < 0.01) {
        return 2;
      }
      setPanX(0);
      setPanY(0);
      return 1;
    });
  }, []);

  // ── Toolbar actions ───────────────────────────────────────────
  const zoomIn = useCallback(
    () => setScale((s) => Math.min(MAX_SCALE, s * 1.3)),
    [],
  );
  const zoomOut = useCallback(
    () => setScale((s) => Math.max(MIN_SCALE, s / 1.3)),
    [],
  );
  const resetView = useCallback(() => {
    setScale(1);
    setRotation(0);
    setPanX(0);
    setPanY(0);
  }, []);
  const rotateCw = useCallback(() => setRotation((r) => (r + 90) % 360), []);
  const rotateCcw = useCallback(
    () => setRotation((r) => (r - 90 + 360) % 360),
    [],
  );

  const zoomPct = `${Math.round(scale * 100)}%`;

  return (
    <div className={`relative flex flex-col ${className ?? ""}`}>
      {/* Image canvas */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: zoom/pan canvas needs pointer events */}
      <div
        ref={containerRef}
        className={`flex-1 overflow-hidden select-none bg-surface-base ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onDragStart={preventDrag}
        onContextMenu={preventDrag}
      >
        <div className="flex h-full w-full items-center justify-center">
          <img
            src={src}
            alt={alt}
            onLoad={handleImageLoad}
            className="max-h-full max-w-full select-none pointer-events-none"
            style={{
              transform: `translate(${panX}px, ${panY}px) scale(${scale}) rotate(${rotation}deg)`,
              transition: isDragging ? "none" : "transform 0.15s ease-out",
              transformOrigin: "center center",
            }}
          />
        </div>
      </div>

      {/* ── Bottom toolbar ─────────────────────────────────── */}
      {showToolbar && (
        <div className="flex h-10 shrink-0 items-center justify-center gap-1 border-t border-border-base bg-surface-elevated px-3">
          <ToolBtn onClick={zoomOut} title="缩小">
            <Minus className="h-4 w-4" />
          </ToolBtn>
          <button
            type="button"
            onClick={resetView}
            className="min-w-[52px] rounded px-2 py-1 text-xs font-mono text-fg-muted hover:bg-fill-tertiary"
            title="重置"
          >
            {zoomPct}
          </button>
          <ToolBtn onClick={zoomIn} title="放大">
            <Plus className="h-4 w-4" />
          </ToolBtn>

          <div className="mx-2 h-4 w-px bg-fill-tertiary" />

          <ToolBtn onClick={rotateCcw} title="逆时针旋转">
            <RotateCcw className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn onClick={rotateCw} title="顺时针旋转">
            <RotateCw className="h-4 w-4" />
          </ToolBtn>

          <div className="mx-2 h-4 w-px bg-fill-tertiary" />

          <ToolBtn onClick={resetView} title="适应窗口">
            <Maximize2 className="h-4 w-4" />
          </ToolBtn>
          {toolbarExtra}
        </div>
      )}
    </div>
  );
}

// ── Toolbar button ───────────────────────────────────────────────────────────

export function ToolBtn({
  onClick,
  title,
  children,
  active,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded p-1.5 transition-colors ${
        active
          ? "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
          : "text-fg-muted hover:bg-fill-tertiary hover:text-fg-secondary"
      }`}
    >
      {children}
    </button>
  );
}
