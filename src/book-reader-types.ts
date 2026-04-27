export interface BookChapterContent {
  id: string;
  title: string | null;
  chapterNumber: number;
  content: string;
  prevChapterId: string | null;
  nextChapterId: string | null;
  bookTitle: string;
  volumeTitle: string | null;
}

export interface BookViewerProps {
  bookId?: string;
  initialChapterId?: string;
  /** Window route string — if it starts with "/chapters/:id", that ID takes precedence. */
  route?: string;
  fetchChapter: (
    bookId: string,
    chapterId: string,
  ) => Promise<BookChapterContent | null>;
  /** When true, Arrow Left/Right navigate chapters. */
  isActive?: boolean;
}
