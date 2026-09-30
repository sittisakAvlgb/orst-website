# Office of the Royal Society website — สำนักงานราชบัณฑิตยสภา

A bilingual (Thai / English), search-first website for the Office of the Royal Society.
Plain HTML, CSS and JavaScript, rendered by a small dependency-free Node build script.

---

## Quick start

```bash
npm run build      # renders /th and /en, bundles CSS/JS, checks translations and links
npm run serve      # http://127.0.0.1:5187 — sends no-cache headers so a rebuild is always visible
npm run dev        # rebuilds when src/, assets/css or assets/js change
```

Requirements: Node 18+ (build), any static web server (serve). Open `/th/` or `/en/`;
the root `index.html` redirects to the visitor's saved language (Thai by default).

The build **fails** on a missing translation key, an unresolved template token, a broken
internal link or a missing `#anchor`, and prints every pending `{{ORST_*}}` placeholder.
It also fails when a menu item from `src/navigation.json` is missing from the header or the
sitemap page, or when an indexable page is not listed on the sitemap — a page that is not in
the menus must be linked from `src/templates/pages/sitemap.html`.
CSS and JS URLs carry a content hash (`?v=…`), so assets can be cached long-term and a
changed file is always fetched fresh.

---

## Project structure

```
/
├── index.html              generated · language gateway
├── th/  en/                generated · one folder per language — do not edit
├── sitemap.xml robots.txt  generated
├── src/
│   ├── site.config.json    official data, external systems, interim legacy links, demoData flag
│   ├── pages.json          page manifest: id, template, URL path, parent, nav section, scripts
│   ├── i18n/th.json en.json all interface text (keys must match in both files)
│   └── templates/
│       ├── layout.html     document shell
│       ├── partials/       header, footer, search form, icons, shared states …
│       └── pages/          one template per page type
├── assets/
│   ├── css/                source stylesheets (see CSS architecture)
│   ├── js/                 source scripts (see JavaScript)
│   │   └── data/sample-content.js   SAMPLE data adapter — replace with APIs
│   ├── dist/               generated bundles: site.css, core.js
│   └── images/
│       ├── logo.png         official logo (unaltered)
│       ├── banners/         homepage carousel slides
│       └── headers/         optional page-header photos
└── scripts/build.mjs
```

Directory-style URLs are used (`/th/knowledge/dictionary/`). Switching language keeps the
same page, query string and hash (`/th/search/?q=AI` → `/en/search/?q=AI`).

---

## Templates and localisation

Template tokens use square brackets so that `{{ORST_*}}` data placeholders pass through untouched.

| Token | Output |
| --- | --- |
| `[[t:home.hero.title]]` | text from `src/i18n/<lang>.json` |
| `[[c:contact.email]]` | value from `site.config.json` (escaped) |
| `[[href:dictionary]]`, `[[href:news?category=lecture]]` | relative link to a page in the same language |
| `[[include:search-form]]` | partial from `templates/partials/` |
| `[[date:2026-09-04]]` | `<time>` formatted per language (Buddhist Era on Thai pages) |
| `[[current:knowledge]]` / `[[aria-current:contact]]` | active navigation state |
| `@lang`, `@service` | inside a token: page language / `data` value from `pages.json` |

Components never contain language: JavaScript reads its strings from the `js` section of the
translation files, which the build embeds as `#orst-runtime` JSON. States that need markup
(empty, error, loading, AI answers) are localised `<template>` elements in the page.

**Numerals:** Thai pages read Thai numerals (๐–๙), English pages Arabic ones. Write source content with
Arabic digits — Intl formatters use the `th-TH-u-nu-thai` locale, and `thaiNumerals()` in `scripts/build.mjs`
converts the visible text of every `th/*.html` page as it is written (never markup, attributes, `<script>`,
`<style>` or an element marked `lang="en"`, and never digits inside a Latin word such as `A4`). Text the
components add at runtime goes through `ORST.i18n.digits()`, which `t()`, `localize()` and `formatYear()`
apply for you. Search and sitemap filters fold Thai numerals back to Arabic, so either spelling finds the
same records.

**Add a page:** create `templates/pages/<name>.html`, register it in `pages.json`, add
`pages.<id>.title` and `.description` (and any new keys) to **both** translation files, build.

**Menus:** the header menu, mega menus, mobile drawer and the sitemap page are all generated from
`src/navigation.json`. Each item has a Thai/English `label` (or a `labelKey` into the translation files)
and either a `link` to an existing page (`page`, optional `hash`/`query`), an `external`/`legacy` URL key
from `site.config.json`, or a `path`. Items with a `path` become pages automatically — a hub listing their
children, or a placeholder page with breadcrumb and section menu (`currentSite` adds a link to the matching
page on the current website).

Top-level menus follow the ORST menu sheet (sections 1–7); items that match an existing page link to it. The
menu row (from 1024 px) shows the home icon, the sections it has room for, and a
**เมนูทั้งหมด / Full menu** button. Each section in the row is a disclosure button that opens its own
dropdown: the section as a dark feature card (icon, number, intro, overview link) beside its pages in
columns. `"shortcut": true` puts a section in the row at every width; `"shortcutFrom": 1440 | 1600` adds
one once the viewport is that wide (each step was measured against the longest labels plus a chevron, and
English labels are wider, so they arrive one step later). Sections that never reach the row — and every
section at once — stay in the full menu. The full menu has a rail of sections — each with its
number from the menu sheet, its `icon` and its page count — and shows the chosen section set exactly like
the sitemap page: numbered heading, intro, overview link, then the sub-sections in columns across the
width. Smaller screens use the menu drawer, an accordion with the same items.

The **sitemap page** renders the same tree as a printed index rather than a grid of cards: a deep green title
band, a sticky rail carrying the filter and a numbered table of contents, and beside it one numbered section
per top-level menu — the number is the menu's position in the ORST menu sheet, in Thai numerals on Thai
pages — with its sub-sections spread across the width. No boxes, no icon tiles; a single gold rule under the
page title and a hairline between sections is all the ruling there is. Below 1024 px the rail becomes a
contents strip that scrolls sideways above the index.
`sitemap.js` adds a live filter (matching a section or sub-section title keeps its pages, `/` focuses the
field, Escape clears it), highlights matching text, collapses sections, hides jump links that no longer
match, marks the jump link for the section being read, and reveals sections as they scroll into view. Without
JavaScript every link is still listed and reachable, and printing always gives the full list.

**Page header photos** are optional. A template that carries `[[hero:<name>]]` picks up
`assets/images/headers/<name>.{webp,jpg,jpeg,png,avif}` as the background of its title band; with no file
there the band keeps the ORST gradient. The build lists what it found under **Page headers** — see
`assets/images/headers/README.md` for the sizing and tone the photo needs.

---

## Design system

- **Direction** — Thai government portal pattern in ORST CI colours sampled from the emblem:
  royal gold for identity, the top band, highlights and indicators; deep emblem green for primary
  buttons, links and active states; warm white and ivory as the ground; a deep green footer with gold
  headings. Layout: a curved top band (logo, phone, contact icons, text size ก ก ก, contrast,
  ไทย | ENG), a centred menu row that stays visible, a banner carousel, and a white knowledge-search
  card overlapping the banner. Buttons are pills; cards use a 16 px radius.
- **Tokens** — `assets/css/tokens.css`. Palette tokens are private; components use semantic tokens
  (`--color-brand-primary`, `--color-accent`, `--color-interactive-soft`, `--space-24`, `--radius-button` …).
  Every text and control colour pairing is checked against WCAG AA.
- **Typography** — Noto Serif Thai for H1/H2 and editorial titles on Thai pages; IBM Plex Sans Thai
  for Thai UI and body; Geist for English, numbers, dates, coordinates and IDs. The Thai body stack
  lists Geist first so Latin letters and digits render in Geist automatically.
- **Surfaces** — `.theme-dark` re-maps tokens for the footer instead of overriding components.
- **Motion** — 120–320 ms with `cubic-bezier(0.2, 0, 0, 1)`; all durations collapse under
  `prefers-reduced-motion`. No scroll-triggered section animation.

### CSS architecture (bundled in this order)

`tokens` → `typography` → `base` → `layout` → `components` (buttons, forms, labels, placeholders, loading)
→ `patterns` (tabs, filters, accordion, modal, toast, pagination, states) → `navigation` → `search`
→ `footer` → `pages` (page compositions) → `home` (banner carousel, search card, service tiles).
Media queries live next to the rules they change.

---

## JavaScript

Classic deferred scripts under one `window.ORST` namespace (works from any static host, no bundler).

| File | Responsibility |
| --- | --- |
| `i18n.js` | runtime strings, page URLs, date/number/year formatting, language links |
| `accessibility.js` | the accessibility panel: text size, contrast, easy-read, link/heading highlight, line spacing, reduced motion, large pointer, read aloud — all applied before paint by an inline head script |
| `components.js` | DOM/template helpers, toast, pagination, disclosure, accordion, TOC, footer accordions, back to top, banner carousel (pause, prev/next, reduced-motion aware), floating assistant shortcut |
| `navigation.js` | condensed sticky header, mega menu, mobile drawer (built from the mega menu markup) |
| `search.js` | `ORST.searchService`, suggestion combobox, header search dialog, results page |
| `main.js` | boots core modules, isolating failures |
| `collection.js` | publications, news and Fellows filters with URL state (page script) |
| `sitemap.js` | sitemap page: live filter over every listed page, per-section collapsing, jump index (page script) |
| `ai.js` | ORST Knowledge AI page (page script) |

Append `?simulate=error` to any URL to preview error states.

### Data contracts — replacing the sample adapter

`assets/js/data/sample-content.js` is **sample data only**. Replace the adapter functions in
`search.js` (`loadDataset`, `query`) with API calls that return the same shapes:

- **Search record** — `{ id, type, title, answer?, excerpt?, keywords?, source?, date?, year?, link }`
  where `type` ∈ dictionary · terminology · transliteration · knowledge · publication · member · news,
  localised fields are `{ th, en }`, and `link` is `{ page, params, hash }`, `{ external }` or `{ href }`.
- **AI answer** — `{ summary, official: { term?, termSource?, text?, source? } | null, explanation, related[], sources[] }`.
  `official` must contain **only verified ORST content**. When it is `null` the UI states that no
  official information was found and labels the explanation as AI-generated.

Set `"demoData": false` in `site.config.json` once real data is connected; this removes the
prototype note in the utility bar and the “sample data” labels.

---

## Official data and placeholders

Nothing official is invented. Verified on 11 Sep 2026 from
[the ORST contact page](https://www.orst.go.th/iwfm_list.asp?p=ABOUT-CONTACT&s=0): Thai address,
main telephone 02 141 1717, and saraban@orst.go.th / ribook@orst.go.th.

Still required (the build lists them): English address, fax, webmaster email, latitude/longitude,
visitor counter, office hours, ITA documents, budget documents, annual reports, e-Service list,
policy texts, organisation content (vision, history, structure, executives, emblem), Royal Society
roles, Fellows' names and portraits, publication years, and all photography (placeholders carry
`<!-- Replace with … -->` comments and fixed aspect ratios to prevent layout shift).

**Homepage banners:** put 5 PNG slides (1920 × 600, optional `-mobile` versions) in
`assets/images/banners/` and edit alt text, links and captions in `src/banners.json` — see
`assets/images/banners/README.md`. The build inserts found images with their real dimensions,
shows a labelled placeholder for missing ones, and warns about wrong sizes or heavy files.

Links in `site.config.json → legacy` point to pages on the current website as interim destinations
while content is migrated. Replace them page by page.

Also replace before launch: favicon set (`layout.html` links an interim icon cropped from the emblem
in `logo.png`), 1200×630 Open Graph image, and ideally self-host the three font families with subsetting.

### Before launch

Every build ends with a **Before launch** list; it is empty only when the site is ready. It checks:

- `menuLinksDisabled` in `src/site.config.json` — the prototype keeps header menus from navigating
  (only the sitemap link works). Set it to `false`.
- `demoData` in `src/site.config.json` — shows prototype labels. Set it to `false`.
- `{{ORST_*}}` placeholders still waiting for official values.
- Homepage copy still marked "ตัวอย่าง" (sample): notices, activity calendar and news in
  `src/i18n/th.json` / `en.json`, with their dates in `src/templates/pages/home.html`.

Not checked by the build, but also needed: the official favicon set, and real news headlines that
match the news photos (the photos show B.E. 2567 while the sample dates are B.E. 2569).

**Images:** keep photos as `.jpg` or `.webp`. Wherever the build looks an image up by name
(headers, news, book covers, logos) it prefers `webp`, then `jpg`, then `png`, so a lighter copy
next to a `.png` wins automatically; banners are listed by file name in `src/banners.json`.

---

## Deploying

`npm run package` builds the site and gathers everything a host needs in `_site/` (pages, bundles, images; source
files and heavy PNG originals left out). While `demoData` is on, `_site/robots.txt` asks search engines to stay away.

**GitHub Pages** — `.github/workflows/deploy-pages.yml` builds and publishes `_site/` on every push to `main`.
One-time setup: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**. A project site is
served at `https://<user>.github.io/<repository>/`; the workflow passes that prefix to the build as `ORST_BASE_PATH`
so the 404 page's absolute links resolve (every other page uses relative links). Generated folders are in
`.gitignore`; the workflow builds them again.

**Netlify** — `netlify.toml` runs the same `npm run package` and publishes `_site/`; `_headers` adds `noindex`
and caching.

## Accessibility (target WCAG 2.2 AA)

An **accessibility panel** (top bar → การเข้าถึง / Accessibility, also in the mobile drawer) collects every
display preference in one dialog: text size in four steps, high contrast, easy-read mode (plain typeface,
looser lines), highlight links, highlight headings, extra line spacing, reduced motion, a large pointer, and
read aloud. Each choice applies immediately, is stored under `orst-a11y`, and is re-applied before first
paint by the inline script in `layout.html` — add a preference there as well as in `accessibility.js`.
Read aloud uses the device's own speech voices: the group is hidden when the reader has no voice for the
page's language, rather than offering a control that would stay silent.

Skip link · semantic landmarks and heading order · visible focus ring on every control ·
disclosure-pattern mega menu with arrow-key support · native `<dialog>` for drawer and search
(focus trap, Escape) · ARIA 1.2 combobox for suggestions · radio-group filters that work as
native controls · live status for results, AI answers and toasts · 44 px touch targets ·
the accessibility panel's preferences · reduced-motion support · colour never the only signal
(official vs AI answers use text labels, icons and borders).

## SEO

Per-page title and description, canonical URL, `hreflang` (th, en, x-default), Open Graph,
`GovernmentOrganization`, `WebSite` + `SearchAction` and `BreadcrumbList` JSON-LD (placeholders are
never emitted into structured data), `sitemap.xml` with language alternates. Add `Article` schema
when article detail pages are built.

## AI and back-office governance

The front end is prepared for back-office AI assistance (summaries, tagging, related content,
metadata and alt-text suggestions, duplicate and broken-link detection, document classification,
natural-language search). Any AI-generated content must pass **Draft → Human review → Approval →
Publish**; AI must never publish official academic content directly, and the public assistant must
always show its sources.
