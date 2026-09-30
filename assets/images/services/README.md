# Service card photos

"บริการและแหล่งความรู้" on the homepage has three cards beside the large "องค์ความรู้" card. Each shows a photo on
its right side, fading towards the text. Until a card has its own file here, it borrows one of the site's photos
(set in `src/templates/pages/home.html`, `[[service-photo:<name>|<fallback>]]`). Drop a file in and rebuild.

| Card | File name (any one extension) | Photo used until then |
| --- | --- | --- |
| หนังสือและ E-Book | `publications.png` | headers/book |
| ค้นหาราชบัณฑิต | `members.png` | banners/slide-5 |
| ถาม-ตอบ (Q&A) | `qa.png` | headers/home-notices |

The large card and the heading's corner use `assets/images/headers/home-services.png` (see the README there).

- **Landscape, about 900 × 600 px, under 150 KB** (a `.jpg` copy keeps it small).
- Only the right ~45% of the card shows the photo, and its left edge fades out, so keep the subject on the right
  (books and a tablet, a building, a desk with a laptop).
