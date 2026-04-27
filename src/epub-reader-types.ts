export interface EpubTocItem {
  id: string;
  label: string;
  href: string;
  children: EpubTocItem[];
}

export interface EpubSpineItem {
  id: string;
  href: string;
  mediaType: string;
}

export interface EpubBook {
  spine: EpubSpineItem[];
  toc: EpubTocItem[];
  getChapterHtml: (index: number) => Promise<string>;
  destroy: () => void;
}

export interface EpubViewerProps {
  fileUrl: string;
  isMobi?: boolean;
  parseBook: (buf: ArrayBuffer) => Promise<EpubBook>;
  /** Optional host-supplied binary fetcher for auth/header glue. */
  fetchBook?: (fileUrl: string) => Promise<ArrayBuffer>;
  /** When true, Arrow Left/Right navigate chapters. */
  isActive?: boolean;
}

export interface ReaderTheme {
  label: string;
  bg: string;
  text: string;
  swatch: string;
}
