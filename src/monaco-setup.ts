/**
 * Shared Monaco editor setup — workers, loader config, and transparent themes.
 *
 * Import this module (side-effect) in any file that uses Monaco to ensure
 * workers and themes are registered exactly once.
 */

import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

type MonacoEnvironmentConfig = {
  getWorker: (workerId: string, label: string) => Worker;
};

declare global {
  interface WindowOrWorkerGlobalScope {
    MonacoEnvironment?: MonacoEnvironmentConfig;
  }
}

// Configure Monaco workers for local loading (no CDN)
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less")
      return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor")
      return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });

// ─── Transparent themes (shared across all editors) ───

monaco.editor.defineTheme("tokimo-light", {
  base: "vs",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#ffffff00",
    "editorGutter.background": "#ffffff00",
  },
});

monaco.editor.defineTheme("tokimo-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#00000000",
    "editorGutter.background": "#00000000",
  },
});
