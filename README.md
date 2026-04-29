# @tokimo/viewers

Embeddable React viewer components for Tokimo apps.

## Viewers

| Component | Description |
|---|---|
| `AudioPlayer` | Audio player with media session support |
| `BookViewer` | Novel/book chapter reader with font size, theme, and navigation settings |
| `EpubViewer` | EPUB ebook reader |
| `HexViewer` | Binary/hex file viewer |
| `HtmlPreview` | Inline HTML preview |
| `ImagePreview` | Image viewer |
| `MonacoTextEditor` | Code/text editor powered by Monaco Editor |
| `PdfEmbed` | PDF document viewer |
| `VideoPreview` | Video player |

## Install

```bash
pnpm add @tokimo/viewers
```

## Usage

```tsx
import { PdfEmbed, ImagePreview, VideoPreview } from '@tokimo/viewers'

function App() {
  return (
    <PdfEmbed src="document.pdf" />
    <ImagePreview src="photo.jpg" />
    <VideoPreview src="video.mp4" />
  )
}
```
