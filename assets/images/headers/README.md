# Page header photos

A page whose template carries `[[hero:<name>]]` looks for a photo here and uses it as the background
of its title band. Drop the file in and rebuild — nothing else to edit.

| Page | File name (any one extension) |
| --- | --- |
| Sitemap (`/th/sitemap/`, `/en/sitemap/`) | `sitemap.webp` · `sitemap.jpg` · `sitemap.png` · `sitemap.avif` |
| Homepage services band ("บริการและแหล่งความรู้") | `home-services.png` (or `.webp` · `.jpg` · `.avif`) |
| Homepage notices ("ประกาศและจัดซื้อจัดจ้าง") | `home-notices.png` (or `.webp` · `.jpg` · `.avif`) — a light wash sits on top, so a bright, airy photo works best |
| Homepage books ("หนังสือและ E-Book") | `home-books.png` (or `.webp` · `.jpg` · `.avif`) — an ivory wash sits on top so the covers stay the focus; a calm, bright photo works best |
| Footer on every page | `footer.png` (or `.webp` · `.jpg` · `.avif`) — sits under a deep green shade behind the whole footer; a wide, calm interior or architectural shot works best. Until it is added the library photo `home-books.jpg` is used |

`webp` is tried first, then `jpg`, `jpeg`, `png`, `avif`. The build prints what it found under
**Page headers**, and warns when a file is heavier than 400 KB.

## What the photo needs to be

- **2400 × 900 px or larger**, landscape. The band is cropped to the viewport width, so keep the
  subject away from the extreme left and right edges — the middle ~60 % is what always stays visible.
- **Under 400 KB.** These are decorative; compress hard (quality ~70 for `webp`/`jpg`).
- **Calm and mid-to-dark in tone.** A deep green scrim is laid over the photo so the white title stays
  readable, which means a busy or very bright image mostly disappears under it. Architecture, texture,
  manuscript details and wide interior shots work better than a crowd or a strong focal point.
- **Owned or licensed by the Office.** Nothing is invented or borrowed here — use ORST photography.

The photo is purely decorative: it is a CSS background with no alt text, so it must never carry
information that is not also in the page text.

## No photo yet?

That is a supported state, not a broken one. The band falls back to the deep green ORST gradient with
a quiet gold texture, and the build simply notes that no image is in place.
