import type { ReactNode } from "react";
import { useMemo } from "react";
import type { ByteTone } from "./hex-viewer-helpers";
import {
  analyzeRow,
  BYTES_PER_ROW,
  getAsciiToneClass,
  getHexToneClass,
  getLegendToneClass,
} from "./hex-viewer-helpers";

export const HEX_COLUMN_HEADERS = Array.from(
  { length: BYTES_PER_ROW },
  (_, i) => (
    <th
      key={i.toString(16)}
      className={`hex-cell hex-byte border-b border-border-base px-0.5 py-1 text-center ${i === 7 ? "pr-2" : ""}`}
    >
      {i.toString(16).toUpperCase().padStart(2, "0")}
    </th>
  ),
);

export function PagerButton({
  disabled,
  onClick,
  title,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
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

export function HexRow({
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

export function LegendSwatch({
  label,
  tone,
}: {
  label: string;
  tone: ByteTone;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`inline-block h-2 w-2 rounded-full ${getLegendToneClass(tone)}`}
      />
      <span>{label}</span>
    </span>
  );
}
