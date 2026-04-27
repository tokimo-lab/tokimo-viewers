import type { ReaderTheme } from "./epub-reader-types";

export const READER_THEMES: ReaderTheme[] = [
  { label: "Light", bg: "#ffffff", text: "#1a1a1a", swatch: "#ffffff" },
  { label: "Warm", bg: "#f8f1e3", text: "#3b2e1a", swatch: "#f8f1e3" },
  { label: "Green", bg: "#e0eee0", text: "#2a3a2a", swatch: "#e0eee0" },
  { label: "Dark", bg: "#1a1a1a", text: "#d4d4d4", swatch: "#1a1a1a" },
];

const SCROLLBAR_CSS = `
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-button,
  ::-webkit-scrollbar-button:hover,
  ::-webkit-scrollbar-button:active {
    width: 0;
    height: 0;
    background: transparent;
    background-image: none;
    border: none;
    box-shadow: none;
  }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-track-piece { background: transparent; background-image: none; }
  ::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.24); border-radius: 999px; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.16); }
  ::-webkit-scrollbar-corner { background: transparent; }
  * { scrollbar-width: thin; scrollbar-color: rgba(128,128,128,0.24) transparent; }
`;

export function buildReaderCSS(
  fontSizePct: number,
  theme: ReaderTheme,
): string {
  return `
    :host {
      display: block;
      overflow: auto;
      height: 100%;
      background: ${theme.bg};
    }
    .reader-body {
      margin: 0;
      padding: 16px 24px;
      font-family: "Noto Serif", "Source Han Serif", Georgia, serif;
      font-size: ${fontSizePct}%;
      line-height: 1.8;
      color: ${theme.text};
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .reader-body img, .reader-body svg { max-width: 100%; height: auto; }
    .reader-body a { color: #2563eb; }
    .reader-body pre, .reader-body code { white-space: pre-wrap; word-break: break-all; }
    .reader-body table { border-collapse: collapse; max-width: 100%; }
    .reader-body td, .reader-body th { border: 1px solid #ddd; padding: 4px 8px; }
    ${SCROLLBAR_CSS}
  `;
}
