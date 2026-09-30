# Featured-knowledge photos

"องค์ความรู้แนะนำ" on the homepage has a lead carousel that cycles through all four items (text on a green
shade over the photo) and three article cards beside it (items 02–04, with small photos).
Until an item has its own file here, it borrows one of the site's photos (set in
`src/templates/pages/home.html`, `[[feature-photo:<name>|<fallback>]]`). Drop a file in and rebuild to replace it.

| # | Item | File name (any one extension) | Photo used until then |
| --- | --- | --- | --- |
| 01 | หลักการเขียนคำทับศัพท์ที่มักเขียนผิด | `transliteration.png` | banners/slide-1 |
| 02 | ศัพท์บัญญัติกับการสื่อสารทางวิทยาศาสตร์ | `terminology.png` | news/news-5 |
| 03 | การใช้เครื่องหมายวรรคตอนในงานเขียนราชการ | `punctuation.png` | headers/home-notices |
| 04 | คำที่มักสะกดผิดในชีวิตประจำวัน | `misspelled.png` | news/news-4 |

- **Landscape, about 1600 × 1000 px.** In the carousel the left ~45% sits under the green shade and the text,
  so put the subject on the right (a warm desk, books, a library). The cards crop the same photo to a small
  rectangle, so keep the subject away from the very edges. Real photographs work better than posters with text.
- Keep each file **under 250 KB** (save a `.jpg` copy; the build prefers `.webp`/`.jpg` over `.png`).
