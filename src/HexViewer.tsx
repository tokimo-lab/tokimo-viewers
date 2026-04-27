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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const BYTES_PER_ROW = 16;
/** Rows per page — 64 rows × 16 bytes = 1024 bytes per page. */
const ROWS_PER_PAGE = 64;
const PAGE_SIZE = ROWS_PER_PAGE * BYTES_PER_ROW; // 1 KB

type ByteTone =
  | "default"
  | "zero"
  | "ff"
  | "printable"
  | "control"
  | "high"
  | "string"
  | "zero-run"
  | "ff-run"
  | "magic";

interface MagicSignature {
  label: string;
  bytes: number[];
}

interface RowCell {
  localOffset: number;
  byte: number | null;
  ascii: string;
  tone: ByteTone;
}

const MAGIC_SIGNATURES: MagicSignature[] = [
  { label: "PNG", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { label: "JPEG", bytes: [0xff, 0xd8, 0xff] },
  { label: "GIF", bytes: [0x47, 0x49, 0x46, 0x38] },
  { label: "WEBP", bytes: [0x52, 0x49, 0x46, 0x46] },
  { label: "PDF", bytes: [0x25, 0x50, 0x44, 0x46] },
  { label: "ZIP", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { label: "GZIP", bytes: [0x1f, 0x8b, 0x08] },
  { label: "ELF", bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { label: "MZ/PE", bytes: [0x4d, 0x5a] },
  { label: "SQLite", bytes: [0x53, 0x51, 0x4c, 0x69] },
];

/** Pre-built static column headers (0x00–0x0F). */
const HEX_COLUMN_HEADERS = Array.from({ length: BYTES_PER_ROW }, (_, i) => (
  <th
    key={i.toString(16)}
    className={`hex-cell hex-byte border-b border-border-base px-0.5 py-1 text-center ${i === 7 ? "pr-2" : ""}`}
  >
    {i.toString(16).toUpperCase().padStart(2, "0")}
  </th>
));

export interface HexViewerProps {
  fileUrl: string;
  fileName: string;
}

export function HexViewer({ fileUrl, fileName }: HexViewerProps) {
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

      const resp = await fetch(fileUrl, {
        credentials: "include",
        headers: { Range: `bytes=${start}-${end}` },
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
    [fileUrl],
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

// ── Pagination button ──

function PagerButton({
  disabled,
  onClick,
  title,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className="rounded p-0.5 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

// ── Hex row ──

function HexRow({
  offset,
  bytes,
  rowLength,
}: {
  offset: number;
  bytes: Uint8Array;
  rowLength: number;
}) {
  const analysis = useMemo(
    () => analyzeRow(bytes, rowLength),
    [bytes, rowLength],
  );

  return (
    <tr
      className={`hover:bg-[var(--bg-hover)] ${analysis.signature ? "bg-[color:color-mix(in_srgb,var(--accent)_6%,transparent)]" : ""}`}
      title={
        analysis.signature ? `Signature: ${analysis.signature}` : undefined
      }
    >
      <td className="hex-cell hex-offset border-r border-border-base px-3 py-0.5">
        <div className="flex items-center gap-2">
          <span>{offset.toString(16).toUpperCase().padStart(8, "0")}</span>
          {analysis.signature && (
            <span className="rounded bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)] px-1 py-px text-[9px] font-medium uppercase tracking-wide text-[var(--accent)]">
              {analysis.signature}
            </span>
          )}
        </div>
      </td>
      {analysis.cells.map((cell, i) => (
        <td
          key={offset + cell.localOffset}
          className={`hex-cell hex-byte px-0.5 py-0.5 text-center ${i === 7 ? "pr-2" : ""} ${getHexToneClass(cell.tone)}`}
        >
          {cell.byte === null
            ? "  "
            : cell.byte.toString(16).toUpperCase().padStart(2, "0")}
        </td>
      ))}
      <td className="hex-cell hex-ascii border-l border-border-base px-3 py-0.5">
        {analysis.cells.map((cell) => (
          <span
            key={`${offset}-ascii-${cell.localOffset}`}
            className={getAsciiToneClass(cell.tone)}
          >
            {cell.ascii}
          </span>
        ))}
      </td>
    </tr>
  );
}

function LegendSwatch({ label, tone }: { label: string; tone: ByteTone }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-block h-2 w-2 rounded-full ${getLegendToneClass(tone)}`}
      />
      <span>{label}</span>
    </span>
  );
}

// ── Helpers ──

function analyzeRow(
  bytes: Uint8Array,
  rowLength: number,
): { cells: RowCell[]; signature: string | null } {
  const cells: RowCell[] = Array.from({ length: rowLength }, (_, i) => {
    const byte = i < bytes.length ? bytes[i] : null;
    if (byte === null) {
      return { localOffset: i, byte: null, ascii: " ", tone: "default" };
    }

    return {
      localOffset: i,
      byte,
      ascii: toAscii(byte),
      tone: getBaseTone(byte),
    };
  });

  let signature: string | null = null;

  for (const sig of MAGIC_SIGNATURES) {
    if (sig.bytes.length > bytes.length) continue;
    let matched = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (bytes[i] !== sig.bytes[i]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      signature = sig.label;
      for (let i = 0; i < sig.bytes.length; i++) {
        cells[i].tone = "magic";
      }
      break;
    }
  }

  paintRuns(cells, (byte) => byte === 0x00, 4, "zero-run");
  paintRuns(cells, (byte) => byte === 0xff, 4, "ff-run");
  paintRuns(cells, isPrintableAsciiByte, 4, "string");

  return { cells, signature };
}

function paintRuns(
  cells: RowCell[],
  match: (byte: number) => boolean,
  minLength: number,
  tone: ByteTone,
): void {
  let start = -1;
  for (let i = 0; i <= cells.length; i++) {
    const byte = i < cells.length ? cells[i].byte : null;
    const ok = byte !== null && match(byte);
    if (ok && start === -1) {
      start = i;
      continue;
    }
    if (!ok && start !== -1) {
      if (i - start >= minLength) {
        for (let j = start; j < i; j++) {
          cells[j].tone = tone;
        }
      }
      start = -1;
    }
  }
}

function isPrintableAsciiByte(byte: number): boolean {
  return byte >= 0x20 && byte <= 0x7e;
}

function toAscii(byte: number): string {
  if (isPrintableAsciiByte(byte)) return String.fromCharCode(byte);
  if (byte === 0x20) return " ";
  return "·";
}

async function readFirstBytes(
  resp: Response,
  limit: number,
): Promise<Uint8Array> {
  if (!resp.body) {
    return new Uint8Array(await resp.arrayBuffer()).slice(0, limit);
  }

  const reader = resp.body.getReader();
  const out = new Uint8Array(limit);
  let offset = 0;
  let done = false;

  while (offset < limit) {
    const chunk = await reader.read();
    if (chunk.done) {
      done = true;
      break;
    }
    const remaining = limit - offset;
    const bytes = chunk.value.subarray(0, remaining);
    out.set(bytes, offset);
    offset += bytes.length;
    if (chunk.value.length > remaining) break;
  }

  if (!done) {
    await reader.cancel();
  }

  return out.slice(0, offset);
}

function getBaseTone(byte: number): ByteTone {
  if (byte === 0x00) return "zero";
  if (byte === 0xff) return "ff";
  if (isPrintableAsciiByte(byte)) return "printable";
  if (byte < 0x20 || byte === 0x7f) return "control";
  if (byte >= 0x80) return "high";
  return "default";
}

function getHexToneClass(tone: ByteTone): string {
  switch (tone) {
    case "magic":
      return "bg-[color:color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)] font-semibold rounded";
    case "string":
      return "bg-emerald-500/10 text-emerald-300";
    case "zero-run":
      return "bg-sky-500/10 text-sky-300";
    case "ff-run":
      return "bg-amber-500/10 text-amber-300";
    case "zero":
      return "text-sky-300/70";
    case "ff":
      return "text-amber-300/75";
    case "control":
      return "text-rose-300/85";
    case "high":
      return "text-fuchsia-300/85";
    case "printable":
      return "text-[var(--text-primary)]";
    default:
      return "text-[var(--text-primary)]";
  }
}

function getAsciiToneClass(tone: ByteTone): string {
  switch (tone) {
    case "magic":
      return "rounded bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]";
    case "string":
      return "text-emerald-300";
    case "zero-run":
      return "text-sky-300";
    case "ff-run":
      return "text-amber-300";
    case "zero":
      return "text-sky-300/70";
    case "ff":
      return "text-amber-300/75";
    case "control":
      return "text-rose-300/80";
    case "high":
      return "text-fuchsia-300/85";
    case "printable":
      return "text-[var(--text-secondary)]";
    default:
      return "text-[var(--text-secondary)]";
  }
}

function getLegendToneClass(tone: ByteTone): string {
  switch (tone) {
    case "magic":
      return "bg-[var(--accent)]";
    case "string":
      return "bg-emerald-300";
    case "zero-run":
      return "bg-sky-300";
    case "ff-run":
      return "bg-amber-300";
    case "control":
      return "bg-rose-300";
    case "high":
      return "bg-fuchsia-300";
    default:
      return "bg-[var(--text-secondary)]";
  }
}

function formatByteCount(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const hexViewerStyles = /* css */ `
.hex-table {
  font-family: "SF Mono", "JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, Monaco, "Courier New", monospace;
  font-size: 12px;
  line-height: 1.4;
}
.hex-cell {
  white-space: pre;
  user-select: text;
}
.hex-offset {
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.hex-byte {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.hex-ascii {
  color: var(--text-secondary);
  letter-spacing: 0.5px;
}
.hex-jump-input {
  font-family: "SF Mono", "JetBrains Mono", "Fira Code", Menlo, monospace;
}
`;
