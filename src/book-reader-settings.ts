export const THEME_MAP = {
  light: {
    bg: "#fefefe",
    text: "#333333",
    secondaryBg: "#f5f5f5",
    accent: "#e5e5e5",
  },
  dark: {
    bg: "#1a1a2e",
    text: "#d4d4d8",
    secondaryBg: "#16213e",
    accent: "#2a2a4e",
  },
  sepia: {
    bg: "#f4ecd8",
    text: "#5b4636",
    secondaryBg: "#e8dcc8",
    accent: "#d4c4a8",
  },
} as const;

export type ReaderTheme = keyof typeof THEME_MAP;

export const FONT_SIZE_MIN = 14;
export const FONT_SIZE_MAX = 24;
export const FONT_SIZE_STEP = 2;

export const FONT_FAMILIES = {
  serif:
    '"Noto Serif SC", "Source Han Serif SC", "Source Han Serif", "SimSun", "STSong", serif',
  "sans-serif":
    '"Noto Sans SC", "Source Han Sans SC", -apple-system, BlinkMacSystemFont, sans-serif',
  monospace: '"JetBrains Mono", "Fira Code", "Source Code Pro", monospace',
} as const;

export type FontFamilyKey = keyof typeof FONT_FAMILIES;

export const FONT_FAMILY_LABELS: Record<FontFamilyKey, string> = {
  serif: "衬线体",
  "sans-serif": "无衬线体",
  monospace: "等宽体",
};

const STORAGE_KEY = "book-reader-settings";

export interface ReaderSettings {
  fontSize: number;
  fontFamily: FontFamilyKey;
  fontWeight: "normal" | "bold";
  theme: ReaderTheme;
}

function defaultSettings(): ReaderSettings {
  return {
    fontSize: 18,
    fontFamily: "serif",
    fontWeight: "normal",
    theme: "light",
  };
}

export function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch (err) {
    console.warn("[BookViewer] Failed to load reader settings:", err);
  }
  return defaultSettings();
}

export function saveSettings(s: ReaderSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}
