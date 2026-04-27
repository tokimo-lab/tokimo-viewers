import type { EpubTocItem } from "./epub-reader-types";

export function EpubTocTree({
  items,
  activeHref,
  onSelect,
}: {
  items: EpubTocItem[];
  activeHref?: string;
  onSelect: (href: string) => void;
}) {
  return (
    <ul className="m-0 list-none space-y-0.5 pl-0">
      {items.map((item) => {
        const isActive = activeHref === item.href;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item.href)}
              className={`w-full cursor-pointer truncate rounded px-1.5 py-0.5 text-left transition-colors hover:bg-[var(--accent-subtle)] hover:text-[var(--text-primary)] ${
                isActive
                  ? "bg-[var(--accent-subtle)] text-[var(--accent)]"
                  : "text-[var(--text-secondary)]"
              }`}
            >
              {item.label}
            </button>
            {item.children.length > 0 && (
              <div className="pl-3">
                <EpubTocTree
                  items={item.children}
                  activeHref={activeHref}
                  onSelect={onSelect}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
