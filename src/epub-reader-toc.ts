import type { MutableRefObject } from "react";
import type { EpubTocItem } from "./epub-reader-types";

function collectTocFragments(
  items: EpubTocItem[],
  chapterHref: string,
): { href: string; fragment: string }[] {
  const result: { href: string; fragment: string }[] = [];
  for (const item of items) {
    const hashIdx = item.href.indexOf("#");
    const base = hashIdx >= 0 ? item.href.substring(0, hashIdx) : item.href;
    const fragment = hashIdx >= 0 ? item.href.substring(hashIdx + 1) : "";
    if (base === chapterHref) {
      result.push({ href: item.href, fragment });
    }
    result.push(...collectTocFragments(item.children, chapterHref));
  }
  return result;
}

export function startScrollTracking(
  tocItems: EpubTocItem[],
  spineHref: string,
  host: HTMLDivElement,
  shadow: ShadowRoot,
  onActiveChange: (href: string) => void,
  cleanupRef: MutableRefObject<(() => void) | null>,
): void {
  cleanupRef.current?.();
  cleanupRef.current = null;

  const entries = collectTocFragments(tocItems, spineHref);

  if (entries.length === 0) {
    onActiveChange(spineHref);
    return;
  }

  const updateActive = () => {
    let current = entries[0]?.href ?? spineHref;
    for (const entry of entries) {
      if (!entry.fragment) continue;
      const el = shadow.querySelector<HTMLElement>(
        `[id="${CSS.escape(entry.fragment)}"]`,
      );
      if (el && el.getBoundingClientRect().top <= 30) {
        current = entry.href;
      }
    }
    onActiveChange(current);
  };

  updateActive();
  host.addEventListener("scroll", updateActive, { passive: true });
  cleanupRef.current = () => host.removeEventListener("scroll", updateActive);
}
