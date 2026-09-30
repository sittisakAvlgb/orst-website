# News photos

The homepage block "ข่าวและกิจกรรม" looks here for a photo for each news item. Drop the file in and rebuild —
nothing else to edit. Until a file exists, a quiet placeholder with a newspaper icon shows.

| Slot on the homepage | File name (any one extension) | Shape |
| --- | --- | --- |
| Featured slider, 1st slide (text sits over the photo) | `news-5.jpg` | wide; a photo without text works best |
| Featured slider, 2nd slide | `news-4.jpg` | wide; a photo without text works best |
| Story card, 1st | `news-1.png` | 16 : 9 |
| Story card, 2nd | `news-3.png` | 16 : 9 |
| Story card, 3rd | `news-2.png` | 16 : 9 |

`webp` is tried first, then `jpg`, `jpeg`, `png`, `avif`. The build reports how many photos it found under **News photos**.

## What the photos need to be

- **At least 1200 px wide for `news-1`, 800 px for the others.** They are cropped to the shape above.
- **Under 250 KB each** (under 400 KB for `news-1`).
- **Photographs of the Office's own events**, owned or licensed by the Office.
