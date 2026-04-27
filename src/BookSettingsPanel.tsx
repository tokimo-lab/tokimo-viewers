import { Minus, Plus } from "lucide-react";
import type {
  FontFamilyKey,
  ReaderSettings,
  ReaderTheme,
} from "./book-reader-settings";
import {
  FONT_FAMILIES,
  FONT_FAMILY_LABELS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  THEME_MAP,
} from "./book-reader-settings";

export function BookSettingsPanel({
  settings,
  onUpdate,
  themeColors,
}: {
  settings: ReaderSettings;
  onUpdate: (patch: Partial<ReaderSettings>) => void;
  themeColors: (typeof THEME_MAP)[ReaderTheme];
}) {
  return (
    <div
      className="absolute right-4 bottom-16 z-20 w-56 rounded-xl p-4 shadow-xl backdrop-blur-md"
      style={{
        backgroundColor: `${themeColors.secondaryBg}f0`,
        color: themeColors.text,
      }}
    >
      <div className="mb-3">
        <p className="mb-1.5 text-xs opacity-60">字体大小</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:opacity-70 disabled:opacity-30"
            style={{ backgroundColor: themeColors.accent }}
            disabled={settings.fontSize <= FONT_SIZE_MIN}
            onClick={() =>
              onUpdate({
                fontSize: Math.max(
                  FONT_SIZE_MIN,
                  settings.fontSize - FONT_SIZE_STEP,
                ),
              })
            }
          >
            <Minus size={14} />
          </button>
          <span className="flex-1 text-center text-sm">
            {settings.fontSize}px
          </span>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:opacity-70 disabled:opacity-30"
            style={{ backgroundColor: themeColors.accent }}
            disabled={settings.fontSize >= FONT_SIZE_MAX}
            onClick={() =>
              onUpdate({
                fontSize: Math.min(
                  FONT_SIZE_MAX,
                  settings.fontSize + FONT_SIZE_STEP,
                ),
              })
            }
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="mb-3">
        <p className="mb-1.5 text-xs opacity-60">字体</p>
        <div className="flex gap-1">
          {(Object.keys(FONT_FAMILIES) as FontFamilyKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className="flex-1 rounded-md px-1.5 py-1 text-xs transition-colors"
              style={{
                backgroundColor:
                  settings.fontFamily === key
                    ? themeColors.accent
                    : "transparent",
                opacity: settings.fontFamily === key ? 1 : 0.6,
              }}
              onClick={() => onUpdate({ fontFamily: key })}
            >
              {FONT_FAMILY_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <p className="mb-1.5 text-xs opacity-60">字重</p>
        <div className="flex gap-1">
          {(["normal", "bold"] as const).map((w) => (
            <button
              key={w}
              type="button"
              className="flex-1 rounded-md px-2 py-1 text-xs transition-colors"
              style={{
                backgroundColor:
                  settings.fontWeight === w
                    ? themeColors.accent
                    : "transparent",
                opacity: settings.fontWeight === w ? 1 : 0.6,
                fontWeight: w,
              }}
              onClick={() => onUpdate({ fontWeight: w })}
            >
              {w === "normal" ? "正常" : "加粗"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs opacity-60">背景</p>
        <div className="flex items-center gap-2">
          {(["light", "dark", "sepia"] as ReaderTheme[]).map((t) => (
            <button
              key={t}
              type="button"
              className="h-7 w-7 rounded-full border-2 transition-all"
              style={{
                backgroundColor: THEME_MAP[t].bg,
                borderColor:
                  settings.theme === t ? themeColors.text : "transparent",
              }}
              onClick={() => onUpdate({ theme: t })}
              title={t === "light" ? "白色" : t === "dark" ? "暗色" : "护眼"}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
