export const BYTES_PER_ROW = 16;
/** Rows per page — 64 rows × 16 bytes = 1024 bytes per page. */
const ROWS_PER_PAGE = 64;
export const PAGE_SIZE = ROWS_PER_PAGE * BYTES_PER_ROW;

export type ByteTone =
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

export interface RowCell {
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

export function analyzeRow(
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

export async function readFirstBytes(
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

export function getHexToneClass(tone: ByteTone): string {
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

export function getAsciiToneClass(tone: ByteTone): string {
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

export function getLegendToneClass(tone: ByteTone): string {
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

export function formatByteCount(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
