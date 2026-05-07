/**
 * HexViewer — Chrome DevTools-style hex dump viewer for binary files.
 *
 * Pure UI component. Caller must provide a `fileUrl` that supports HTTP Range
 * requests (bytes=start-end) for pagination.
 *
 * Layout: offset | hex bytes (with gap at byte 8) | ASCII printable chars.
 */

import { Spin } from "@tokimo/ui";
import { ChevronLeft, ChevronRight, SkipBack, SkipForward } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  HEX_COLUMN_HEADERS,
  HexRow,
  LegendSwatch,
  PagerButton,
} from "./HexRow";
import {
  BYTES_PER_ROW,
  formatByteCount,
  PAGE_SIZE,
  readFirstBytes,
} from "./hex-viewer-helpers";
import { hexViewerStyles } from "./hex-viewer-styles";

export interface HexViewerProps {
  fileUrl: string;
  fileName: string;
  /** Optional host-supplied range fetcher for auth/header glue. */
  fetchRange?: (
    fileUrl: string,
    range: string,
    signal?: AbortSignal,
  ) => Promise<Response>;
}

export function HexViewer({ fileUrl, fileName, fetchRange }: HexViewerProps) {
  const [page, setPage] = useState(0);
  const [pageData, setPageData] = useState<Uint8Array | null>(null);
  const [totalSize, setTotalSize] = useState<number | null>(null);
  const [rangeSupported, setRangeSupported] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousFileUrlRef = useRef(fileUrl);

  const fetchPage = useCallback(
    async (pageNum: number, signal?: AbortSignal) => {
      if (!fileUrl) return null;
      const start = pageNum * PAGE_SIZE;
      const end = start + PAGE_SIZE - 1;
      const range = `bytes=${start}-${end}`;

      const resp = fetchRange
        ? await fetchRange(fileUrl, range, signal)
        : await fetch(fileUrl, {
            headers: { Range: range },
            credentials: "include",
            signal,
          });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      // Parse total size from Content-Range: bytes 0-1023/123456
      const contentRange = resp.headers.get("content-range");
      if (resp.status === 206) {
        setRangeSupported(true);
      }
      if (contentRange) {
        const match = contentRange.match(/\/(\d+)/);
        if (match?.[1]) {
          setTotalSize(Number(match[1]));
        }
      } else if (resp.status === 200) {
        setRangeSupported(false);
        const cl = resp.headers.get("content-length");
        if (cl) setTotalSize(Number(cl));
        return readFirstBytes(resp, PAGE_SIZE);
      }

      return new Uint8Array(await resp.arrayBuffer());
    },
    [fileUrl, fetchRange],
  );

  useEffect(() => {
    if (!fileUrl) {
      setError("No file URL");
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    setLoading(true);
    setError(null);

    fetchPage(page, ac.signal)
      .then((buf) => {
        if (ac.signal.aborted) return;
        setPageData(buf);
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        console.error("[HexViewer] Failed to load page:", e);
        setError(String(e));
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [fileUrl, fetchPage, page]);

  useEffect(() => {
    if (previousFileUrlRef.current === fileUrl) return;
    previousFileUrlRef.current = fileUrl;
    setRangeSupported(true);
    setTotalSize(null);
    setPageData(null);
    setPage(0);
  });

  // Scroll to top when page changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-run on page change
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [page]);

  const totalPages =
    totalSize !== null ? Math.ceil(totalSize / PAGE_SIZE) : null;
  const hasNext =
    rangeSupported &&
    (totalPages !== null
      ? page < totalPages - 1
      : (pageData?.length ?? 0) >= PAGE_SIZE);
  const hasPrev = rangeSupported && page > 0;
  const pageBaseOffset = page * PAGE_SIZE;
  const partialFallback =
    !rangeSupported && totalSize !== null && totalSize > PAGE_SIZE;

  // ── Offset jump ──

  const [jumpInput, setJumpInput] = useState("");
  const handleJump = useCallback(() => {
    const offset = Number.parseInt(jumpInput.replace(/^0x/i, ""), 16);
    if (!Number.isFinite(offset) || offset < 0) return;
    const targetPage = Math.floor(offset / PAGE_SIZE);
    if (totalPages !== null && targetPage >= totalPages) return;
    setPage(targetPage);
    setJumpInput("");
  }, [jumpInput, totalPages]);

  // ── Render ──

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  const rows = pageData ? Math.ceil(pageData.length / BYTES_PER_ROW) : 0;

  return (
    <div className="flex h-full flex-col bg-[var(--bg-primary)]">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-border-base px-4 py-1.5">
        <span className="truncate text-xs font-medium text-[var(--text-secondary)]">
          {fileName}
        </span>

        {totalSize !== null && (
          <span className="text-xs text-[var(--text-tertiary)]">
            {formatByteCount(totalSize)}
          </span>
        )}

        {partialFallback && (
          <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-600 dark:text-amber-300">
            Range unavailable, showing first {formatByteCount(PAGE_SIZE)}
          </span>
        )}

        {/* Offset jump */}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-[var(--text-tertiary)]">Go to</span>
          <input
            type="text"
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && !e.nativeEvent.isComposing && handleJump()
            }
            placeholder="0x0000"
            className="hex-jump-input w-20 rounded border border-border-base bg-[var(--bg-secondary)] px-1.5 py-0.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none"
          />
        </div>

        {/* Pagination */}
        <div className="flex items-center gap-1">
          <PagerButton
            disabled={!hasPrev}
            onClick={() => setPage(0)}
            title="First page"
          >
            <SkipBack className="h-3 w-3" />
          </PagerButton>
          <PagerButton
            disabled={!hasPrev}
            onClick={() => setPage((p) => p - 1)}
            title="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </PagerButton>

          <span className="min-w-[4rem] text-center text-xs tabular-nums text-[var(--text-secondary)]">
            {totalPages !== null
              ? `${page + 1} / ${totalPages}`
              : `${page + 1} / ?`}
          </span>

          <PagerButton
            disabled={!hasNext}
            onClick={() => setPage((p) => p + 1)}
            title="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </PagerButton>
          <PagerButton
            disabled={!hasNext || totalPages === null}
            onClick={() => totalPages && setPage(totalPages - 1)}
            title="Last page"
          >
            <SkipForward className="h-3 w-3" />
          </PagerButton>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-border-base px-4 py-1 text-[10px] text-[var(--text-tertiary)]">
        <LegendSwatch label="magic" tone="magic" />
        <LegendSwatch label="string" tone="string" />
        <LegendSwatch label="00 run" tone="zero-run" />
        <LegendSwatch label="FF run" tone="ff-run" />
        <LegendSwatch label="ctrl" tone="control" />
        <LegendSwatch label="high" tone="high" />
      </div>

      {/* Hex grid */}
      <div ref={scrollRef} className="relative flex-1 overflow-auto">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--bg-primary)]/60">
            <Spin />
          </div>
        )}
        <table className="hex-table w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--bg-secondary)]">
            <tr>
              <th className="hex-cell hex-offset border-b border-r border-border-base px-3 py-1 text-left">
                Offset
              </th>
              {HEX_COLUMN_HEADERS}
              <th className="hex-cell hex-ascii border-b border-l border-border-base px-3 py-1 text-left">
                ASCII
              </th>
            </tr>
          </thead>
          <tbody>
            {pageData &&
              Array.from({ length: rows }, (_, row) => {
                const localOffset = row * BYTES_PER_ROW;
                const absOffset = pageBaseOffset + localOffset;
                const slice = pageData.slice(
                  localOffset,
                  localOffset + BYTES_PER_ROW,
                );
                return (
                  <HexRow
                    key={absOffset}
                    offset={absOffset}
                    bytes={slice}
                    rowLength={BYTES_PER_ROW}
                  />
                );
              })}
          </tbody>
        </table>
      </div>

      <style>{hexViewerStyles}</style>
    </div>
  );
}
