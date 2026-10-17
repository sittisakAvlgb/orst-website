#!/usr/bin/env node
/**
 * Static site builder for the bilingual ORST website. No dependencies (Node 18+).
 *
 * Renders every page in src/pages.json once per language into /th and /en, using
 * src/i18n/<lang>.json for all text and src/site.config.json for official data.
 * Also bundles CSS/JS into assets/dist, writes sitemap.xml and robots.txt, and fails
 * on missing translations, unresolved tokens, broken internal links or missing anchors, and when a
 * menu item is missing from the header or the sitemap page, or a page is not listed on the sitemap.
 *
 * Template tokens use square brackets so {{ORST_*}} data placeholders pass through untouched:
 *   [[t:key.path]]            translated text (translation files may contain markup and tokens)
 *   [[c:key.path]]            site config value, HTML-escaped
 *   [[href:pageId#hash]]      relative URL to another page in the same language (+ optional ?query/#hash)
 *   [[include:name]]          partial from src/templates/partials/<name>.html
 *   [[date:YYYY-MM-DD]]       <time> formatted for the page language
 *   [[current:section]]       " is-current" when the page belongs to that navigation section
 *   [[aria-current:pageId]]   ' aria-current="page"' on the matching page
 *   [[asset:assets/dist/site.css]]  URL with a content hash (?v=) so browsers never run stale CSS/JS
 *   [[root]] [[lang]] [[alt-lang]] [[lang-href:en]] [[year]] [[map-url]] [[fonts]]
 *   [[head-meta]] [[breadcrumb]] [[runtime]] [[scripts]] [[content]] [[banners]]
 *   [[primary-nav]] [[drawer-nav]] [[sitemap-tree]] [[sitemap-index]] [[sitemap-number:n]] [[sitemap-count:n]] [[sitemap-sections:n]] [[hero:name]] [[book-cover:name]] [[news-image:name]] [[link-logo:name|ABBR]] [[feature-photo:name|fallback]] [[service-photo:name|fallback]] [[assistant-mascot]] [[nav-page:title|section|body|tree]]  menus and pages from src/navigation.json
 * Inside any token argument, @lang is the page language and @name reads page.data.name.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const TEMPLATES = path.join(SRC, "templates");

const CSS_ORDER = ["tokens", "typography", "base", "layout", "components", "patterns", "navigation", "search", "footer", "pages", "home"];
const CORE_JS_ORDER = ["i18n", "accessibility", "navigation", "components", "search", "consent", "main"];
const PAGE_SCRIPTS = { ai: "assets/js/ai.js", collection: "assets/js/collection.js", sitemap: "assets/js/sitemap.js", notices: "assets/js/notices.js", calendar: "assets/js/calendar.js", books: "assets/js/books.js", "home-news": "assets/js/news.js", "home-links": "assets/js/links.js", "home-featured": "assets/js/featured.js", "home-services": "assets/js/services.js", "home-faq": "assets/js/faq.js" };
const SAMPLE_DATA_SCRIPT = "assets/js/data/sample-content.js";

const FONT_URLS = {
  th: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=IBM+Plex+Sans+Thai:wght@400;500;600&family=Noto+Serif+Thai:wght@500;600;700&display=swap",
  en: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Noto+Serif+Thai:wght@600&display=swap",
};

const LOCALES = {
  // "u-nu-thai": Thai pages show Thai numerals (๐–๙) in dates and numbers; see thaiNumerals() for the rest of the text.
  th: { intl: "th-TH-u-nu-thai", og: "th_TH" },
  en: { intl: "en-GB", og: "en_US" },
};

const TOKEN = /\[\[([a-z-]+)(?::([^\]]*))?\]\]/g;
const PLACEHOLDER = /\{\{[A-Z0-9_]+\}\}/g;

/* ---------------------------------------------------------------- helpers */

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const stripTags = (html) => String(html).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

const hasPlaceholder = (value) => typeof value === "string" && value.includes("{{");

const exists = (file) => access(file).then(() => true, () => false);

function lookup(source, key, label) {
  const value = key.split(".").reduce((node, part) => (node == null ? undefined : node[part]), source);
  if (value === undefined || value === null) throw new Error(`Missing ${label}: "${key}"`);
  return value;
}

function lookupOptional(source, key) {
  return key.split(".").reduce((node, part) => (node == null ? undefined : node[part]), source);
}

/** JSON safe to embed in a <script> element. Optionally drops unresolved {{placeholders}}. */
function scriptJson(data, { dropPlaceholders = false } = {}) {
  const replacer = dropPlaceholders ? (_, v) => (hasPlaceholder(v) ? undefined : v) : undefined;
  return JSON.stringify(data, replacer).replace(/</g, "\\u003c");
}

function flattenKeys(node, prefix = "") {
  if (node === null || typeof node !== "object") return [prefix];
  return Object.entries(node).flatMap(([key, value]) => flattenKeys(value, prefix ? `${prefix}.${key}` : key));
}

const templateCache = new Map();

function loadTemplate(relativePath) {
  if (!templateCache.has(relativePath)) {
    templateCache.set(relativePath, readFileSync(path.join(TEMPLATES, relativePath), "utf8"));
  }
  return templateCache.get(relativePath);
}

/* ------------------------------------------------------------------- URLs */

const outputFile = (lang, page) => (page.path.endsWith(".html") ? `${lang}/${page.path}` : `${lang}/${page.path}index.html`);
const urlTarget = (lang, page) => `${lang}/${page.path}`;
const absoluteUrl = (config, lang, page) => `${config.siteUrl}/${urlTarget(lang, page)}`;

function relativeUrl(fromFile, target) {
  const isDirectory = target === "" || target.endsWith("/");
  const rel = path.posix.relative(path.posix.dirname(fromFile), target.replace(/\/$/, "") || ".");
  if (isDirectory) return rel === "" ? "./" : `${rel}/`;
  return rel;
}

/**
 * Where the site sits on its host, for the few pages that need absolute links (the 404 page, which the host serves
 * at any depth). "/" on its own domain; "/<repository>/" on a GitHub Pages project site (set by the deploy workflow).
 */
const BASE_PATH = `/${(process.env.ORST_BASE_PATH ?? "/").replace(/^\/+|\/+$/g, "")}/`.replace("//", "/");

/* -------------------------------------------------------------- rendering */

function createContext({ lang, page, pages, dict, config, versions, banners, navigation }) {
  const file = outputFile(lang, page);
  return {
    lang,
    altLang: lang === "th" ? "en" : "th",
    page,
    pages,
    dict,
    config,
    versions,
    banners,
    navigation,
    file,
    content: "",
    link: (target) => (page.absoluteLinks ? `${BASE_PATH}${target}` : relativeUrl(file, target)),
  };
}

function resolveArgument(arg, ctx) {
  return arg.replace(/@([a-zA-Z]+)/g, (_, name) =>
    name === "lang" ? ctx.lang : lookup(ctx.page.data ?? {}, name, `page data on "${ctx.page.id}"`),
  );
}

/** Title, description or crumb for a page; menu-generated pages take theirs from src/navigation.json. */
function pageText(ctx, id, field) {
  const page = ctx.pages.get(id);
  if (page?.navItem) {
    const label = navLabel(page.navItem, ctx);
    return field === "description" ? String(lookup(ctx.dict, "navPage.description", "translation")).replace("{label}", label) : label;
  }
  return lookup(ctx.dict, `pages.${id}.${field}`, `translation [${ctx.lang}]`);
}

const crumbLabel = (ctx, page) =>
  page.navItem ? navLabel(page.navItem, ctx) : lookupOptional(ctx.dict, `pages.${page.id}.crumb`) ?? pageText(ctx, page.id, "title");

function breadcrumbTrail(ctx) {
  const trail = [];
  for (let page = ctx.page; page; page = page.parent ? ctx.pages.get(page.parent) : null) trail.unshift(page);
  return trail;
}

function formatDate(iso, lang) {
  const formatter = new Intl.DateTimeFormat(LOCALES[lang].intl, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
  return formatter.format(new Date(`${iso}T12:00:00+07:00`));
}

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const OPAQUE_ELEMENTS = new Set(["script", "style", "textarea"]);

/** Digits become Thai numerals, except when they belong to a Latin word or code (A4, MP3). */
const thaiDigits = (value) =>
  value.replace(/(?<![A-Za-z])[0-9]+(?![A-Za-z])/g, (run) => run.replace(/[0-9]/g, (digit) => THAI_DIGITS[Number(digit)]));

/** Converts a text run, leaving HTML entities (&#8212;) alone. */
const thaiDigitsInText = (text) =>
  text.split(/(&[#\w]+;)/).map((part, index) => (index % 2 ? part : thaiDigits(part))).join("");

/**
 * Thai pages are written with Thai numerals, English pages with Arabic ones.
 * Rewrites the digits a visitor actually reads: text inside <body>, never markup, attributes,
 * script or style content, or an element marked as another language (<span lang="en">).
 */
function thaiNumerals(html) {
  const bodyStart = html.indexOf("<body");
  if (bodyStart < 0) return html;
  const body = html.slice(bodyStart);
  const tags = /<\/?([a-zA-Z][\w-]*)\b([^>]*)>/g;
  let out = "";
  let last = 0;
  let skipping = null;
  let depth = 0;
  let match;
  while ((match = tags.exec(body))) {
    const text = body.slice(last, match.index);
    out += skipping ? text : thaiDigitsInText(text);
    out += match[0];
    last = tags.lastIndex;
    const name = match[1].toLowerCase();
    const closing = match[0].startsWith("</");
    const empty = VOID_ELEMENTS.has(name) || match[2].trimEnd().endsWith("/");
    if (skipping) {
      if (name !== skipping || empty) continue;
      if (closing) depth -= 1;
      else depth += 1;
      if (depth === 0) skipping = null;
    } else if (!closing && !empty && (OPAQUE_ELEMENTS.has(name) || /\slang="(?!th)/.test(match[2]))) {
      skipping = name;
      depth = 1;
    }
  }
  out += skipping ? body.slice(last) : thaiDigitsInText(body.slice(last));
  return html.slice(0, bodyStart) + out;
}

const handlers = {
  t: (key, ctx) => String(lookup(ctx.dict, key, `translation [${ctx.lang}]`)),
  c: (key, ctx) => escapeHtml(lookup(ctx.config, key, "config value")),
  href: (arg, ctx) => {
    const [, id, suffix] = arg.match(/^([\w-]+)(.*)$/);
    const target = ctx.pages.get(id);
    if (!target) throw new Error(`Unknown page id "${id}" in [[href]] on "${ctx.page.id}"`);
    return ctx.link(urlTarget(ctx.lang, target)) + suffix;
  },
  data: (key, ctx) => escapeHtml(lookup(ctx.page.data ?? {}, key, `page data on "${ctx.page.id}"`)),
  demo: (key, ctx) => (ctx.config.demoData ? String(lookup(ctx.dict, key, `translation [${ctx.lang}]`)) : ""),
  asset: (file, ctx) => {
    const version = ctx.versions[file];
    if (!version) throw new Error(`Unknown asset "${file}" on "${ctx.page.id}"`);
    return `${ctx.link("")}${file}?v=${version}`;
  },
  root: (_, ctx) => ctx.link(""),
  lang: (_, ctx) => ctx.lang,
  "page-id": (_, ctx) => ctx.page.id,
  "alt-lang": (_, ctx) => ctx.altLang,
  "lang-href": (lang, ctx) => ctx.link(urlTarget(lang, ctx.page)),
  "alt-href": (_, ctx) => ctx.link(urlTarget(ctx.altLang, ctx.page)),
  "lang-current": (lang, ctx) => (ctx.lang === lang ? ' aria-current="true"' : ""),
  current: (section, ctx) => (ctx.page.section === section ? " is-current" : ""),
  "aria-current": (id, ctx) => (ctx.page.id === id ? ' aria-current="page"' : ""),
  year: (_, ctx) => String(new Date().getFullYear() + (ctx.lang === "th" ? 543 : 0)),
  date: (iso, ctx) => `<time class="date" datetime="${iso}">${formatDate(iso, ctx.lang)}</time>`,
  // A date split for a calendar-style block: [[date-block:2026-09-18]] → day, then month and year.
  "date-block": (iso, ctx) => {
    const date = new Date(`${iso}T12:00:00+07:00`);
    const part = (options) => new Intl.DateTimeFormat(LOCALES[ctx.lang].intl, { ...options, timeZone: "Asia/Bangkok" }).format(date);
    return `<time class="date-block" datetime="${iso}"><span class="date-block__day">${part({ day: "numeric" })}</span><span class="date-block__month">${part({ month: "short", year: "numeric" })}</span></time>`;
  },
  // The footer's visitor count: a number from site.config (for now the figure read from the current official
  // site, with the day it was read). A value still left as a {{ORST_*}} placeholder stays in a comment instead.
  visitors: (_, ctx) => {
    const count = ctx.config.visitorCount;
    if (typeof count !== "number") return `<!-- visitor count: ${escapeHtml(String(count ?? ""))} -->`;
    const figure = new Intl.NumberFormat(LOCALES[ctx.lang].intl).format(count);
    const asOf = ctx.config.visitorCountAsOf
      ? `<span class="footer-visitors__asof">${translate(ctx, "footer.visitorsAsOf").replace("{date}", formatDate(ctx.config.visitorCountAsOf, ctx.lang))}</span>`
      : "";
    return `<p class="footer-visitors">${svgIcon("i-chart")}<span>${translate(ctx, "footer.visitors")}</span> <strong class="footer-visitors__count number">${figure}</strong> <span>${translate(ctx, "footer.visitorsUnit")}</span>${asOf}</p>`;
  },
  "map-url": (_, ctx) =>
    escapeHtml(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ctx.config.contact.mapQuery)}`),
  "map-embed": (_, ctx) =>
    escapeHtml(`https://www.google.com/maps?q=${encodeURIComponent(ctx.config.contact.mapQuery)}&z=16&hl=${ctx.lang}&output=embed`),
  fonts: (_, ctx) => escapeHtml(FONT_URLS[ctx.lang]),
  "head-meta": (_, ctx) => renderHeadMeta(ctx),
  breadcrumb: (_, ctx) => renderBreadcrumb(ctx),
  runtime: (_, ctx) => renderRuntime(ctx),
  scripts: (_, ctx) =>
    (ctx.page.scripts ?? []).map((name) => `<script src="${handlers.asset(PAGE_SCRIPTS[name], ctx)}" defer></script>`).join("\n    "),
  content: (_, ctx) => ctx.content,
  banners: (_, ctx) => renderBanners(ctx),
  "primary-nav": (_, ctx) => renderPrimaryNav(ctx),
  "drawer-nav": (_, ctx) => renderDrawerNav(ctx),
  "sitemap-tree": (_, ctx) => renderSitemapTree(ctx),
  "sitemap-index": (_, ctx) => renderSitemapIndex(ctx),
  "sitemap-number": (value, ctx) => sectionNumber(Number(value), ctx),
  "sitemap-count": (extra, ctx) => String(countSitemapItems(ctx) + Number(extra ?? 0)),
  "sitemap-sections": (extra, ctx) => String(ctx.navigation.menus.filter((top) => top.children?.length).length + Number(extra ?? 0)),
  hero: (name, ctx) => renderHero(name, ctx),
  "book-cover": (name, ctx) => renderBookCover(name, ctx),
  "news-image": (name, ctx) => renderNewsImage(name, ctx),
  "link-logo": (arg, ctx) => renderLinkLogo(arg, ctx),
  "feature-photo": (arg, ctx) => renderFolderPhoto(FEATURE_DIR, "feat__img", arg, ctx),
  "service-photo": (arg, ctx) => renderFolderPhoto(SERVICE_DIR, "srv-card__img", arg, ctx),
  "assistant-mascot": (_, ctx) => renderFolderPhoto("assets/images/assistant", "contact-panel__mascot", "mascot", ctx),
  "nav-page": (part, ctx) => renderNavPage(part, ctx),
};

function render(source, ctx) {
  let output = source;
  // Several passes: includes and translations may themselves contain tokens.
  for (let pass = 0; pass < 8 && output.includes("[["); pass += 1) {
    output = output.replace(TOKEN, (match, name, arg) => {
      if (name === "include") return loadTemplate(`partials/${resolveArgument(arg, ctx)}.html`);
      const handler = handlers[name];
      if (!handler) throw new Error(`Unknown token ${match} on "${ctx.page.id}"`);
      return handler(arg === undefined ? undefined : resolveArgument(arg, ctx), ctx);
    });
  }
  const leftover = output.match(TOKEN);
  if (leftover) throw new Error(`Unresolved token ${leftover[0]} on "${ctx.page.id}" [${ctx.lang}]`);
  return output;
}

function renderHeadMeta(ctx) {
  const { page, lang, dict, config } = ctx;
  const siteName = dict.org.name;
  const title = stripTags(pageText(ctx, page.id, "title"));
  const fullTitle = page.id === "home" ? `${siteName} | ${dict.org.tagline}` : `${title} | ${siteName}`;
  const description = stripTags(pageText(ctx, page.id, "description"));
  const canonical = absoluteUrl(config, lang, page);

  const lines = [`<title>${escapeHtml(fullTitle)}</title>`, `<meta name="description" content="${escapeHtml(description)}">`];

  if (page.noindex) {
    lines.push('<meta name="robots" content="noindex">');
  } else {
    lines.push(`<link rel="canonical" href="${canonical}">`);
    for (const alt of config.languages) {
      lines.push(`<link rel="alternate" hreflang="${alt}" href="${absoluteUrl(config, alt, page)}">`);
    }
    lines.push(`<link rel="alternate" hreflang="x-default" href="${absoluteUrl(config, config.defaultLang, page)}">`);
  }

  lines.push(
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${escapeHtml(siteName)}">`,
    `<meta property="og:title" content="${escapeHtml(fullTitle)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<!-- Replace with an official 1200×630 share image -->`,
    `<meta property="og:image" content="${config.siteUrl}/assets/images/logo-emblem.png">`,
    `<meta property="og:locale" content="${LOCALES[lang].og}">`,
    `<meta property="og:locale:alternate" content="${LOCALES[ctx.altLang].og}">`,
    '<meta name="twitter:card" content="summary">',
    `<script type="application/ld+json">${scriptJson(buildSchema(ctx, canonical), { dropPlaceholders: true })}</script>`,
  );

  return lines.join("\n    ");
}

function buildSchema(ctx, canonical) {
  const { config, dict, lang, page, pages } = ctx;
  const contact = config.contact;
  const organizationId = `${config.siteUrl}/#organization`;

  const graph = [
    {
      "@type": "GovernmentOrganization",
      "@id": organizationId,
      name: dict.org.nameTh,
      alternateName: dict.org.nameEn,
      url: config.siteUrl,
      logo: `${config.siteUrl}/assets/images/logo-emblem.png`,
      email: contact.email,
      telephone: contact.phoneHref,
      address: {
        "@type": "PostalAddress",
        streetAddress: contact.address.th,
        postalCode: contact.postalCode,
        addressCountry: "TH",
      },
    },
  ];

  if (page.schema === "website") {
    graph.push({
      "@type": "WebSite",
      url: canonical,
      name: dict.org.name,
      inLanguage: lang,
      publisher: { "@id": organizationId },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${absoluteUrl(config, lang, pages.get("search"))}?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    });
  }

  const trail = breadcrumbTrail(ctx);
  if (trail.length > 1 && !page.noindex) {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: trail.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: stripTags(crumbLabel(ctx, item)),
        item: absoluteUrl(config, lang, item),
      })),
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

function renderBreadcrumb(ctx) {
  const trail = breadcrumbTrail(ctx);
  const items = trail.map((page, index) => {
    const label = crumbLabel(ctx, page);
    return index === trail.length - 1
      ? `<li><span aria-current="page">${label}</span></li>`
      : `<li><a href="${ctx.link(urlTarget(ctx.lang, page))}">${label}</a></li>`;
  });
  return `<nav class="breadcrumb" aria-label="${escapeHtml(ctx.dict.a11y.breadcrumb)}"><ol>${items.join("")}</ol></nav>`;
}

function renderRuntime(ctx) {
  const pageUrls = Object.fromEntries([...ctx.pages.values()].map((page) => [page.id, ctx.link(urlTarget(ctx.lang, page))]));
  const data = {
    lang: ctx.lang,
    locale: LOCALES[ctx.lang].intl,
    demoData: ctx.config.demoData,
    menuLinksDisabled: ctx.config.menuLinksDisabled === true,
    sampleDataUrl: handlers.asset(SAMPLE_DATA_SCRIPT, ctx),
    pages: pageUrls,
    external: ctx.config.external,
    strings: ctx.dict.js,
  };
  return `<script type="application/json" id="orst-runtime">${scriptJson(data)}</script>`;
}

/* ------------------------------------------------------------- navigation */

const translate = (ctx, key) => String(lookup(ctx.dict, key, `translation [${ctx.lang}]`));

const navLabel = (item, ctx) => (item.labelKey ? translate(ctx, item.labelKey) : escapeHtml(localized(item.label, ctx.lang)));

const navDesc = (item, ctx) => {
  if (item.descKey) return translate(ctx, item.descKey);
  return item.desc ? escapeHtml(localized(item.desc, ctx.lang)) : "";
};

/** Page entries for every menu item with a "path"; each page's parent is the nearest ancestor page. */
function menuPages(navigation, existingPages) {
  const created = [];
  const paths = new Set(existingPages.map((page) => page.path));
  const ids = new Set(existingPages.map((page) => page.id));

  const walk = (items, top, parentId) => {
    for (const item of items) {
      let ownPageId = parentId;
      if (item.path) {
        if (ids.has(item.id)) throw new Error(`Menu item id "${item.id}" clashes with an existing page id`);
        if (paths.has(item.path)) throw new Error(`Menu path "${item.path}" is already used by another page`);
        ids.add(item.id);
        paths.add(item.path);
        created.push({ id: item.id, template: "nav-page.html", path: item.path, parent: parentId, section: top.section, navItem: item, navTop: top });
        ownPageId = item.id;
      } else if (item.link?.page && !item.link.hash && !item.link.query) {
        ownPageId = item.link.page;
      }
      if (item.children) walk(item.children, top, ownPageId);
    }
  };

  for (const top of navigation.menus) walk([top], top, "home");
  return created;
}

/** { href, pageId, external } for a menu item, or null for a plain group label. */
function navTarget(item, ctx) {
  if (item.path) return { href: ctx.link(urlTarget(ctx.lang, ctx.pages.get(item.id))), pageId: item.id };
  const link = item.link;
  if (!link) return null;
  if (link.page) {
    const page = ctx.pages.get(link.page);
    if (!page) throw new Error(`Unknown page id "${link.page}" in src/navigation.json`);
    const suffix = `${link.query ? `?${link.query}` : ""}${link.hash ? `#${link.hash}` : ""}`;
    return { href: ctx.link(urlTarget(ctx.lang, page)) + suffix, pageId: suffix ? null : link.page };
  }
  if (link.external) return { href: lookup(ctx.config, `external.${link.external}`, "config value"), external: true };
  if (link.legacy) return { href: lookup(ctx.config, `legacy.${link.legacy}`, "config value"), external: true };
  throw new Error(`Menu item "${item.id}" has an unsupported link`);
}

function linkAttributes(target, ctx) {
  return `href="${escapeHtml(target.href)}"${target.external ? ' rel="noopener"' : ""}${target.pageId && target.pageId === ctx.page.id ? ' aria-current="page"' : ""}`;
}

const externalMark = (ctx) =>
  `<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-external"></use></svg><span class="visually-hidden">${translate(ctx, "a11y.externalLink")}</span>`;

/** A menu entry as a link (with the external-site mark where needed), or plain text when it has no page. */
function menuLink(item, ctx, className) {
  const target = navTarget(item, ctx);
  const label = navLabel(item, ctx);
  const classAttribute = className ? ` class="${className}"` : "";
  if (!target) return `<span${classAttribute}>${label}</span>`;
  return `<a${classAttribute} ${linkAttributes(target, ctx)}>${label}${target.external ? externalMark(ctx) : ""}</a>`;
}

const svgIcon = (id, className = "icon") =>
  `<svg class="${className}" aria-hidden="true" focusable="false"><use href="#${id}"></use></svg>`;

/** The pages of one section, set like the sitemap index: sub-sections in columns, no cards.
 *  Used both inside the full menu (as a tab panel) and in a section's own dropdown (with a feature card). */
function renderMenuSection(top, ctx, { selected = false, feature = false, prefix = "am" } = {}) {
  const target = navTarget(top, ctx);
  const intro = top.introKey ? translate(ctx, top.introKey) : top.intro ? escapeHtml(localized(top.intro, ctx.lang)) : "";
  // Keep the sheet's order: a run of single pages becomes one group among the sub-sections.
  const blocks = [];
  let run = null;
  for (const child of top.children) {
    if (child.children?.length) {
      run = null;
      blocks.push(`<div class="all-menu__group">
                      <p class="all-menu__group-title" id="${prefix}c-${child.id}">${menuLink(child, ctx, "all-menu__group-link")}</p>
                      <ul class="all-menu__list" aria-labelledby="${prefix}c-${child.id}">${child.children.map((grandchild) => `<li>${menuLink(grandchild, ctx, "all-menu__item")}</li>`).join("")}</ul>
                    </div>`);
    } else {
      if (!run) {
        run = [];
        blocks.push(run);
      }
      run.push(`<li>${menuLink(child, ctx, "all-menu__item")}</li>`);
    }
  }
  const runClass = "all-menu__group all-menu__group--plain";
  const body = blocks
    .map((block) => (Array.isArray(block) ? `<div class="${runClass}"><ul class="all-menu__list">${block.join("")}</ul></div>` : block))
    .join("\n                    ");

  if (feature) {
    // A section's own dropdown leads with the section itself, then its pages.
    return `<div class="section-menu__inner container">
                  <div class="section-menu__feature theme-dark">
                    <span class="section-menu__feature-icon">${svgIcon(top.icon ?? "i-arrow-right")}</span>
                    <p class="section-menu__feature-title" id="${prefix}t-${top.id}">${navLabel(top, ctx)}</p>
                    ${intro ? `<p class="section-menu__feature-intro">${intro}</p>` : ""}
                    ${target ? `<a class="button button--primary section-menu__feature-link" ${linkAttributes(target, ctx)}>${translate(ctx, "navPage.overview")}${svgIcon("i-arrow-right")}</a>` : ""}
                  </div>
                  <div class="all-menu__body">
                    ${body}
                  </div>
                </div>`;
  }

  return `<div class="all-menu__panel" role="tabpanel" id="${prefix}p-${top.id}" aria-labelledby="${prefix}t-${top.id}"${selected ? "" : " hidden"}>
                  <div class="all-menu__panel-head">
                    <div class="all-menu__panel-text">
                      <p class="all-menu__panel-title">${navLabel(top, ctx)}</p>
                      ${intro ? `<p class="all-menu__panel-intro">${intro}</p>` : ""}
                    </div>
                    ${target ? `<a class="text-link all-menu__panel-link" ${linkAttributes(target, ctx)}>${translate(ctx, "navPage.overview")}${svgIcon("i-arrow-right")}</a>` : ""}
                  </div>
                  <div class="all-menu__body">
                    ${body}
                  </div>
                </div>`;
}

/** Header menu row: the home icon, the sections flagged "shortcut", and the full-menu panel. */
function renderPrimaryNav(ctx) {
  const menus = ctx.navigation.menus;
  const current = (top) => (top.section && top.section === ctx.page.section ? " is-current" : "");

  // "shortcutFrom" is the viewport width at which the row has room for that section (see navigation.css).
  // A section in the row opens its own dropdown; sections that do not fit stay in the full menu.
  const shortcuts = menus
    .filter((top) => top.iconOnly || top.shortcut || top.shortcutFrom)
    .map((top) => {
      const label = navLabel(top, ctx);
      const step = top.shortcutFrom ? ` primary-nav__item--from-${top.shortcutFrom}` : "";
      if (!top.children?.length) {
        const content = top.iconOnly ? `${svgIcon(top.icon)}<span class="visually-hidden">${label}</span>` : label;
        return `<li class="primary-nav__item${step}"><a class="primary-nav__link${top.iconOnly ? " primary-nav__link--icon" : ""}${current(top)}" ${linkAttributes(navTarget(top, ctx), ctx)}>${content}</a></li>`;
      }
      return `<li class="primary-nav__item${step}" data-nav-item>
            <button type="button" class="primary-nav__link primary-nav__trigger${current(top)}" aria-expanded="false" aria-controls="menu-${top.id}" data-mega-trigger>
              ${label}${svgIcon("i-chevron-down", "icon primary-nav__chevron")}
            </button>
            <div class="mega-menu section-menu" id="menu-${top.id}" hidden data-mega-menu>
              ${renderMenuSection(top, ctx, { feature: true, prefix: "dm" })}
            </div>
          </li>`;
    });

  // The section of the current page is shown first when the menu opens.
  const sections = menus.filter((top) => top.children?.length);
  const selected = sections.find((top) => top.section === ctx.page.section) ?? sections[0];
  const tabs = sections.map(
    (top) => `<button type="button" class="all-menu__tab${current(top)}" role="tab" id="amt-${top.id}" aria-controls="amp-${top.id}" aria-selected="${top === selected}" tabindex="${top === selected ? 0 : -1}">
                    <span class="all-menu__tab-icon">${svgIcon(top.icon ?? "i-arrow-right")}</span>
                    <span class="all-menu__tab-label">${navLabel(top, ctx)}</span>
                    <span class="all-menu__tab-count" aria-hidden="true">${countNavLinks(top.children, ctx)}</span>
                  </button>`,
  );

  const allMenu = translate(ctx, "nav.allMenu");
  const sitemap = ctx.pages.get("sitemap");
  return `${shortcuts.join("\n          ")}
          <li class="primary-nav__item primary-nav__item--all" data-nav-item>
            <button type="button" class="primary-nav__all" aria-expanded="false" aria-controls="all-menu" data-mega-trigger>
              ${svgIcon("i-menu", "icon primary-nav__all-icon primary-nav__all-icon--open")}
              ${svgIcon("i-close", "icon primary-nav__all-icon primary-nav__all-icon--close")}
              ${allMenu}
            </button>
            <div class="mega-menu all-menu" id="all-menu" hidden data-mega-menu>
              <div class="container all-menu__inner">
                <div class="all-menu__rail" role="tablist" aria-orientation="vertical" aria-label="${allMenu}">
                  ${tabs.join("\n                  ")}
                </div>
                <div class="all-menu__panels">
                ${sections.map((top) => renderMenuSection(top, ctx, { selected: top === selected })).join("\n                ")}
                </div>
              </div>
              <div class="all-menu__foot">
                <div class="container all-menu__foot-inner">
                  <a class="text-link" ${linkAttributes({ href: ctx.link(urlTarget(ctx.lang, sitemap)), pageId: sitemap.id }, ctx)}>${translate(ctx, "nav.sitemap")}${svgIcon("i-arrow-right")}</a>
                  <button type="button" class="all-menu__search" aria-haspopup="dialog" data-search-open>${svgIcon("i-search")}${translate(ctx, "search.submit")}</button>
                </div>
              </div>
            </div>
          </li>`;
}

/** Mobile drawer: one accordion group per section, with sub-section pages indented. */
function renderDrawerNav(ctx) {
  return ctx.navigation.menus
    .filter((top) => top.children?.length)
    .map((top) => {
      const target = navTarget(top, ctx);
      const items = [];
      if (target) items.push(`<li><a ${linkAttributes(target, ctx)}>${translate(ctx, "navPage.overview")}</a></li>`);
      for (const child of top.children) {
        items.push(`<li>${menuLink(child, ctx)}</li>`);
        for (const grandchild of child.children ?? []) items.push(`<li>${menuLink(grandchild, ctx, "drawer-nav__sublink")}</li>`);
      }
      return `<div class="drawer-nav__group">
          <button type="button" class="drawer-nav__toggle" aria-expanded="false" aria-controls="drawer-${top.id}"><span>${navLabel(top, ctx)}</span>${svgIcon("i-chevron-down")}</button>
          <ul class="drawer-nav__panel" id="drawer-${top.id}" hidden>${items.join("")}</ul>
        </div>`;
    })
    .join("\n        ");
}

function renderNavTree(items, ctx) {
  return items
    .map((item) => {
      const target = navTarget(item, ctx);
      const label = navLabel(item, ctx);
      const link = target ? `<a ${linkAttributes(target, ctx)}>${label}${target.external ? `<span class="visually-hidden">${translate(ctx, "a11y.externalLink")}</span>` : ""}</a>` : `<span>${label}</span>`;
      const nested = item.children?.length ? `<ul class="section-nav__list">${renderNavTree(item.children, ctx)}</ul>` : "";
      return `<li>${link}${nested}</li>`;
    })
    .join("");
}

/* ---- Sitemap page: one card per top-level menu, filterable by sitemap.js ---- */

/** How many linked pages a branch of the menu contains. */
function countNavLinks(items, ctx) {
  let total = 0;
  for (const item of items) {
    if (navTarget(item, ctx)) total += 1;
    if (item.children?.length) total += countNavLinks(item.children, ctx);
  }
  return total;
}

/** A sitemap entry. The label sits in its own span so the filter can highlight the matching part. */
function sitemapLink(item, ctx, className) {
  const target = navTarget(item, ctx);
  const text = `<span class="sitemap-label" data-sitemap-label>${navLabel(item, ctx)}</span>`;
  if (!target) return `<span class="${className}">${text}</span>`;
  const external = target.external
    ? `${svgIcon("i-external", "icon sitemap-external")}<span class="visually-hidden">${translate(ctx, "a11y.externalLink")}</span>`
    : "";
  return `<a class="${className}" ${linkAttributes(target, ctx)}>${text}${external}</a>`;
}

const sitemapItem = (item, ctx) => `<li class="sitemap-item" data-sitemap-item>${sitemapLink(item, ctx, "sitemap-item__link")}</li>`;

/** Children of a section: one titled branch per sub-section, with runs of single pages sharing a list.
 *  A section made only of single pages spans the row and flows into columns; a run that sits beside
 *  titled sub-sections stays one column wide, so no section is left with a hole in it. */
function renderSitemapBranches(children, ctx) {
  const onlyPages = children.every((child) => !child.children?.length);
  const blocks = [];
  let run = null;
  for (const child of children) {
    if (child.children?.length) {
      run = null;
      blocks.push(`<div class="sitemap-branch" data-sitemap-branch>
            <h3 class="sitemap-branch__title">${sitemapLink(child, ctx, "sitemap-branch__link")}</h3>
            <ul class="sitemap-list">${child.children.map((grandchild) => sitemapItem(grandchild, ctx)).join("")}</ul>
          </div>`);
    } else {
      if (!run) {
        run = [];
        blocks.push(run);
      }
      run.push(sitemapItem(child, ctx));
    }
  }
  const plainClass = `sitemap-branch sitemap-branch--plain${onlyPages ? " sitemap-branch--full" : ""}`;
  return blocks
    .map((block) =>
      Array.isArray(block)
        ? `<div class="${plainClass}" data-sitemap-branch><ul class="sitemap-list">${block.join("")}</ul></div>`
        : block,
    )
    .join("\n          ");
}

/** Section numbers follow the menu sheet, in Thai numerals on Thai pages. */
const sectionNumber = (value, ctx) => (ctx.lang === "th" ? thaiDigits(String(value)) : String(value));

/** One section of the index: a numbered gutter, the heading, and its links in columns. */
function sitemapGroup({ id, number, heading, count, body }, ctx) {
  return `<section class="sitemap-group" id="sm-${id}" aria-labelledby="sm-${id}-title" data-sitemap-group>
      <p class="sitemap-group__number" aria-hidden="true">${number ?? ""}</p>
      <div class="sitemap-group__content">
        <div class="sitemap-group__head">
          <h2 class="sitemap-group__title" id="sm-${id}-title" data-sitemap-group-title>${heading}</h2>
          <p class="sitemap-group__meta">${translate(ctx, "sitemapPage.pageCount").replace("{count}", String(count))}</p>
          <button class="icon-button sitemap-group__toggle" type="button" aria-expanded="true" aria-controls="sm-${id}-body" data-sitemap-section-toggle>
            ${svgIcon("i-chevron-down")}
            <span class="visually-hidden">${translate(ctx, "sitemapPage.toggleSection")}</span>
          </button>
        </div>
        <div class="sitemap-group__body" id="sm-${id}-body" data-sitemap-body>
          ${body}
        </div>
      </div>
    </section>`;
}

function renderSitemapTree(ctx) {
  return ctx.navigation.menus
    .filter((top) => top.children?.length)
    .map((top) =>
      sitemapGroup(
        {
          id: top.id,
          number: sectionNumber(ctx.navigation.menus.indexOf(top) + 1, ctx),
          heading: sitemapLink(top, ctx, "sitemap-group__link"),
          count: countNavLinks(top.children, ctx),
          body: renderSitemapBranches(top.children, ctx),
        },
        ctx,
      ),
    )
    .join("\n    ");
}

/** Entries the sitemap lists as rows (sub-section titles are headings, not rows). */
function countSitemapItems(ctx) {
  let total = 0;
  for (const top of ctx.navigation.menus) {
    for (const child of top.children ?? []) total += child.children?.length ? child.children.length : 1;
  }
  return total;
}

/** Jump links, rendered above the grid so the menu-coverage check never sees these anchors. */
function renderSitemapIndex(ctx) {
  return ctx.navigation.menus
    .filter((top) => top.children?.length)
    .map(
      (top) =>
        `<li><a class="sitemap-chip" href="#sm-${top.id}"><span class="sitemap-chip__number" aria-hidden="true">${sectionNumber(ctx.navigation.menus.indexOf(top) + 1, ctx)}</span><span class="sitemap-chip__label">${navLabel(top, ctx)}</span><span class="sitemap-chip__count">${countNavLinks(top.children, ctx)}</span></a></li>`,
    )
    .join("\n        ");
}

/** Body parts of a generated menu page: hubs list their children, leaves show a content placeholder. */
function renderNavPage(part, ctx) {
  const { navItem: item, navTop: top } = ctx.page;
  if (!item) throw new Error(`[[nav-page:${part}]] used on "${ctx.page.id}", which is not a menu page`);

  if (part === "title") return navLabel(item, ctx);
  if (part === "section") return item === top ? translate(ctx, "org.name") : navLabel(top, ctx);
  if (part === "tree") return `<ul class="section-nav__list">${renderNavTree(top.children ?? [], ctx)}</ul>`;
  if (part !== "body") throw new Error(`Unknown token [[nav-page:${part}]]`);

  if (item.children?.length) {
    const rows = item.children.map((child) => {
      const target = navTarget(child, ctx);
      const summary = child.children?.length ? child.children.map((grandchild) => navLabel(grandchild, ctx)).join(" · ") : navDesc(child, ctx);
      return `<li class="link-row">
          <h2 class="link-row__title h4"><a class="stretched-link" href="${escapeHtml(target.href)}"${target.external ? ' rel="noopener"' : ""}>${navLabel(child, ctx)}${target.external ? `<span class="visually-hidden">${translate(ctx, "a11y.externalLink")}</span>` : ""}</a></h2>
          ${summary ? `<p class="link-row__desc">${summary}</p>` : ""}
          <svg class="icon link-row__icon" aria-hidden="true" focusable="false"><use href="#${target.external ? "i-external" : "i-arrow-right"}"></use></svg>
        </li>`;
    });
    return `<ul class="link-rows link-rows--two">${rows.join("")}</ul>`;
  }

  const currentSite = item.currentSite
    ? `<p class="action-row"><a class="text-link" href="${escapeHtml(lookup(ctx.config, `legacy.${item.currentSite}`, "config value"))}" rel="noopener">${translate(ctx, "navPage.readCurrent")}${externalMark(ctx)}</a></p>`
    : "";
  return `<div class="notice">
        <svg class="icon" aria-hidden="true" focusable="false"><use href="#i-info"></use></svg>
        <p>${translate(ctx, "navPage.pending")}</p>
      </div>
      <!-- Replace with official content supplied by ORST -->
      <div class="content-placeholder nav-page__children">{{ORST_PAGE_CONTENT}}</div>
      ${currentSite}`;
}

/* ---------------------------------------------------------------- banners */

const MAX_BANNER_BYTES = 600 * 1024;
const imageCache = new Map();

/** Width and height from a PNG's IHDR chunk, or null for other formats. */
function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Size, byte count and content hash of an image in the project, or null if it has not been added yet. */
function imageInfo(relativePath) {
  if (!relativePath) return null;
  if (!imageCache.has(relativePath)) {
    const file = path.join(ROOT, relativePath);
    let info = null;
    if (existsSync(file)) {
      const content = readFileSync(file);
      info = {
        size: pngSize(content),
        bytes: content.length,
        version: createHash("sha1").update(content).digest("hex").slice(0, 10),
      };
    }
    imageCache.set(relativePath, info);
  }
  return imageCache.get(relativePath);
}

const localized = (field, lang) => (typeof field === "string" ? field : field?.[lang] ?? field?.th ?? "");

const HERO_DIR = "assets/images/headers";
const HERO_EXTENSIONS = ["webp", "jpg", "jpeg", "png", "avif"];

/** Optional decorative photo behind a page title: assets/images/headers/<name>.<ext>. */
function heroImage(name) {
  for (const extension of HERO_EXTENSIONS) {
    const relativePath = `${HERO_DIR}/${name}.${extension}`;
    const info = imageInfo(relativePath);
    if (info) return { relativePath, info };
  }
  return null;
}

/** Attributes for a page hero; without a photo the band falls back to its own gradient. */
function renderHero(name, ctx) {
  if (!name) throw new Error("[[hero:<name>]] needs a name");
  const found = heroImage(name);
  if (!found) return `data-hero="${name}" data-hero-missing`;
  // A url() in a custom property resolves against the stylesheet that uses it (assets/dist/site.css), not the page.
  return `data-hero="${name}" style="--hero-image: url('../../${found.relativePath}?v=${found.info.version}')"`;
}

const BOOK_DIR = "assets/images/books";
const BOOK_COVERS = ["dictionary-2554", "sign-language", "punctuation", "transliteration", "romanization", "abbreviations", "gazetteer", "place-names"];

/** Optional cover photo for a book: assets/images/books/<name>.<ext>. */
function bookImage(name) {
  for (const extension of HERO_EXTENSIONS) {
    const relativePath = `${BOOK_DIR}/${name}.${extension}`;
    const info = imageInfo(relativePath);
    if (info) return { relativePath, info };
  }
  return null;
}

/** The cover image when one has been added; otherwise nothing, and the shared cover underneath shows. */
function renderBookCover(name, ctx) {
  if (!name) throw new Error("[[book-cover:<name>]] needs a name");
  const found = bookImage(name);
  if (!found) return "";
  const size = found.info.size ? ` width="${found.info.size.width}" height="${found.info.size.height}"` : "";
  return `<img class="book__img" src="${ctx.link("")}${found.relativePath}?v=${found.info.version}" alt=""${size} loading="lazy" decoding="async">`;
}

const LINK_DIR = "assets/images/links";

/**
 * Logo for a related-website tile: [[link-logo:name|ABBR]] uses assets/images/links/<name>.<ext> when it exists,
 * otherwise the organisation's abbreviation set in type, so every tile has a recognisable mark.
 */
function renderLinkLogo(arg, ctx) {
  const [name, abbr = ""] = String(arg ?? "").split("|");
  if (!name) throw new Error("[[link-logo:<name>|<abbr>]] needs a name");
  for (const extension of HERO_EXTENSIONS) {
    const relativePath = `${LINK_DIR}/${name}.${extension}`;
    const info = imageInfo(relativePath);
    if (info) return `<img class="ext-card__logo-img" src="${ctx.link("")}${relativePath}?v=${info.version}" alt="" loading="lazy" decoding="async">`;
  }
  return `<span class="ext-card__abbr" lang="en">${abbr}</span>`;
}

function reportLinkLogos(names) {
  const own = names.filter((name) => HERO_EXTENSIONS.some((extension) => imageInfo(`${LINK_DIR}/${name}.${extension}`)));
  return [`  ${own.length}/${names.length} logos in ${LINK_DIR}/ (the rest show the organisation's abbreviation)`];
}

const LINK_LOGOS = ["citizen-guide", "ginfo", "etda", "complaints", "knowledge-center", "info-center", "nacc", "nacc-learning", "oath"];

const FEATURE_DIR = "assets/images/featured";
const FEATURE_PHOTOS = ["transliteration", "terminology", "punctuation", "misspelled"];

const SERVICE_DIR = "assets/images/services";
const SERVICE_PHOTOS = ["publications", "members", "qa"];

/**
 * A photo from one of the homepage photo folders: [[feature-photo:name|fallback]] (assets/images/featured) or
 * [[service-photo:name|fallback]] (assets/images/services) uses <folder>/<name>.<ext> when it exists,
 * otherwise the fallback (one of the site's own photos).
 */
function renderFolderPhoto(dir, className, arg, ctx) {
  const [name, fallback] = String(arg ?? "").split("|");
  if (!name) throw new Error(`A photo token for ${dir} needs a name`);
  const candidates = HERO_EXTENSIONS.map((extension) => `${dir}/${name}.${extension}`);
  if (fallback) candidates.push(fallback);
  for (const relativePath of candidates) {
    const info = imageInfo(relativePath);
    if (info) return `<img class="${className}" src="${ctx.link("")}${relativePath}?v=${info.version}" alt="" loading="lazy" decoding="async">`;
  }
  return "";
}

function reportFolderPhotos(dir, names) {
  const own = names.filter((name) => HERO_EXTENSIONS.some((extension) => imageInfo(`${dir}/${name}.${extension}`)));
  return [`  ${own.length}/${names.length} own photos in ${dir}/ (the rest borrow one of the site's photos)`];
}

const NEWS_DIR = "assets/images/news";
const NEWS_IMAGES = ["news-1", "news-2", "news-3", "news-4", "news-5"];

/** A news photo from assets/images/news/<name>.<ext>, or a quiet placeholder until one is added. */
function renderNewsImage(name, ctx) {
  if (!name) throw new Error("[[news-image:<name>]] needs a name");
  for (const extension of HERO_EXTENSIONS) {
    const relativePath = `${NEWS_DIR}/${name}.${extension}`;
    const info = imageInfo(relativePath);
    if (!info) continue;
    const size = info.size ? ` width="${info.size.width}" height="${info.size.height}"` : "";
    return `<img class="news-media__img" src="${ctx.link("")}${relativePath}?v=${info.version}" alt=""${size} loading="lazy" decoding="async">`;
  }
  return `<span class="news-media__empty" aria-hidden="true">${svgIcon("i-newspaper")}</span>`;
}

function reportNewsImages(names) {
  const found = names.filter((name) => HERO_EXTENSIONS.some((extension) => imageInfo(`${NEWS_DIR}/${name}.${extension}`)));
  return [`  ${found.length}/${names.length} photos in ${NEWS_DIR}/ (placeholders shown for the rest)`];
}

function reportBookCovers(names) {
  return names.map((name) => {
    const found = bookImage(name);
    if (!found) return `  ${name}: no image — drop one in ${BOOK_DIR}/ (shared cover shown meanwhile)`;
    const kb = Math.round(found.info.bytes / 1024);
    return `  ${name}: ${found.relativePath} (${kb} KB)${kb > 250 ? " — compress below 250 KB" : ""}`;
  });
}

function reportHeroes(names) {
  return names.map((name) => {
    const found = heroImage(name);
    if (!found) return `  ${name}: no image — drop one in ${HERO_DIR}/ (gradient shown meanwhile)`;
    const kb = Math.round(found.info.bytes / 1024);
    const size = found.info.size ? `${found.info.size.width}×${found.info.size.height} px, ` : "";
    return `  ${name}: ${found.relativePath} (${size}${kb} KB)${kb > 400 ? " — compress below 400 KB" : ""}`;
  });
}

/** Homepage carousel slides from src/banners.json; a labelled placeholder stands in for missing images. */
function renderBanners(ctx) {
  const { slides, size, defaultCaption } = ctx.banners;
  const imageUrl = (relativePath, info) => `${ctx.link("")}${relativePath}?v=${info.version}`;
  const dimensions = (info) => (info.size ? ` width="${info.size.width}" height="${info.size.height}"` : "");

  return slides
    .map((slide, index) => {
      const title = escapeHtml(localized(slide.title, ctx.lang));
      const alt = escapeHtml(localized(slide.alt, ctx.lang));
      const caption = escapeHtml(localized(slide.caption ?? defaultCaption, ctx.lang));

      let href = slide.href ?? "#";
      if (slide.page) {
        const target = ctx.pages.get(slide.page);
        if (!target) throw new Error(`Unknown page id "${slide.page}" in src/banners.json`);
        href = ctx.link(urlTarget(ctx.lang, target));
      }

      const desktop = imageInfo(slide.image);
      const mobile = desktop ? imageInfo(slide.mobileImage) : null;
      let media;
      if (desktop) {
        const loading = index === 0 ? ' fetchpriority="high"' : ' loading="lazy"';
        const img = `<img class="banner__image" src="${imageUrl(slide.image, desktop)}"${dimensions(desktop.size ? desktop : { size })} alt="${alt}"${loading} decoding="async">`;
        media = mobile
          ? `<picture><source media="(max-width: 767px)" srcset="${imageUrl(slide.mobileImage, mobile)}"${dimensions(mobile)}>${img}</picture>`
          : img;
      } else {
        media = `<div class="banner__image banner__image--placeholder" role="img" aria-label="${alt}">
          <span class="banner__placeholder-label" aria-hidden="true">${escapeHtml(slide.image)} · ${size.width} × ${size.height}</span>
          <span class="banner__placeholder-title" aria-hidden="true">${title}</span>
        </div>`;
      }

      return `<div class="banner__slide" role="group" aria-roledescription="slide" aria-label="${index + 1} / ${slides.length}" data-title="${title}"${index ? " hidden" : ""} data-carousel-slide>
        <a class="banner__link" href="${href}">
          ${media}
        </a>
        <p class="banner__caption">${caption}</p>
      </div>`;
    })
    .join("\n      ");
}

function reportBanners({ slides, size }) {
  const notes = [];
  let ready = 0;
  slides.forEach((slide, index) => {
    const info = imageInfo(slide.image);
    const label = `slide ${index + 1}`;
    if (!info) {
      notes.push(`${label}: waiting for ${slide.image}`);
      return;
    }
    ready += 1;
    if (info.size && (info.size.width !== size.width || info.size.height !== size.height)) {
      notes.push(`${label}: ${info.size.width}×${info.size.height} px — cropped to the ${size.width}:${size.height} banner ratio on wide screens`);
    }
    if (info.bytes > MAX_BANNER_BYTES) {
      notes.push(`${label}: ${Math.round(info.bytes / 1024)} KB — compress below ${MAX_BANNER_BYTES / 1024} KB for faster loading`);
    }
  });
  console.log(`Banners: ${ready}/${slides.length} images in place.${notes.length ? `\n  ${notes.join("\n  ")}` : ""}`);
}

/* ------------------------------------------------------ extra site files */

function renderLanguageGateway(config) {
  const alternates = config.languages
    .map((lang) => `<link rel="alternate" hreflang="${lang}" href="${config.siteUrl}/${lang}/">`)
    .join("\n    ");
  return `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>สำนักงานราชบัณฑิตยสภา | Office of the Royal Society</title>
    <link rel="icon" href="data:,">
    ${alternates}
    <link rel="alternate" hreflang="x-default" href="${config.siteUrl}/${config.defaultLang}/">
    <script>
      (function () {
        var lang = "${config.defaultLang}";
        try { if (localStorage.getItem("orst-lang") === "en") lang = "en"; } catch (error) {}
        location.replace(lang + "/");
      })();
    </script>
    <noscript><meta http-equiv="refresh" content="0; url=${config.defaultLang}/"></noscript>
  </head>
  <body>
    <p><a href="th/">ภาษาไทย</a> · <a href="en/" lang="en">English</a></p>
  </body>
</html>
`;
}

function renderSitemap(config, pageList) {
  const urls = pageList
    .filter((page) => !page.noindex)
    .flatMap((page) =>
      config.languages.map((lang) => {
        const links = config.languages
          .map((alt) => `    <xhtml:link rel="alternate" hreflang="${alt}" href="${absoluteUrl(config, alt, page)}"/>`)
          .join("\n");
        return `  <url>\n    <loc>${absoluteUrl(config, lang, page)}</loc>\n${links}\n  </url>`;
      }),
    );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>
`;
}

/** Short content hashes for every CSS/JS file referenced by pages. */
async function assetVersions(bundles) {
  const entries = Object.entries(bundles);
  for (const file of [...Object.values(PAGE_SCRIPTS), SAMPLE_DATA_SCRIPT]) {
    entries.push([file, await readFile(path.join(ROOT, file))]);
  }
  return Object.fromEntries(entries.map(([file, content]) => [file, createHash("sha1").update(content).digest("hex").slice(0, 10)]));
}

async function bundle(files, kind) {
  const banner = `/* Generated by scripts/build.mjs — edit the source files in assets/${kind}/, not this bundle. */\n`;
  const parts = await Promise.all(
    files.map(async (file) => `\n/* ==== ${file} ==== */\n${await readFile(path.join(ROOT, file), "utf8")}`),
  );
  return banner + parts.join("");
}

/* ------------------------------------------------------------- validation */

function checkTranslationParity(dicts) {
  const [base, ...others] = Object.keys(dicts);
  const baseKeys = new Set(flattenKeys(dicts[base]));
  const problems = [];
  for (const lang of others) {
    const keys = new Set(flattenKeys(dicts[lang]));
    for (const key of baseKeys) if (!keys.has(key)) problems.push(`[${lang}] missing ${key}`);
    for (const key of keys) if (!baseKeys.has(key)) problems.push(`[${base}] missing ${key}`);
  }
  if (problems.length) throw new Error(`Translation files are out of sync:\n  ${problems.join("\n  ")}`);
}

async function checkLinks(generated) {
  const problems = new Set();
  const attribute = /\s(?:href|src)="([^"]+)"/g;

  for (const [file, html] of generated) {
    if (!file.endsWith(".html") || file === "index.html") continue;
    for (const [, raw] of html.matchAll(attribute)) {
      const url = raw.replace(/&amp;/g, "&");
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url) || url.includes("{{")) continue;

      const [pathPart, hash] = url.split("#");
      const cleanPath = pathPart.split("?")[0];
      if (cleanPath === "") {
        // "#top" scrolls to the start of the document by specification; no element is required.
        if (hash && hash !== "top" && !new RegExp(`\\sid="${hash}"`).test(html)) problems.add(`${file} → missing anchor #${hash}`);
        continue;
      }

      const base = cleanPath.startsWith("/") ? "" : path.posix.dirname(file);
      // Absolute links carry the host prefix (BASE_PATH); files on disk start at the site root.
      const rooted = cleanPath.startsWith(BASE_PATH) ? cleanPath.slice(BASE_PATH.length) : cleanPath.replace(/^\//, "");
      let resolved = path.posix.normalize(path.posix.join(base, rooted));
      if (cleanPath.endsWith("/")) resolved = path.posix.join(resolved, "index.html");

      const target = generated.get(resolved);
      if (target === undefined && !(await exists(path.join(ROOT, resolved)))) {
        problems.add(`${file} → broken link ${raw}`);
      } else if (hash && target !== undefined && !new RegExp(`\\sid="${hash}"`).test(target)) {
        problems.add(`${file} → missing anchor ${raw}`);
      }
    }
  }
  return [...problems];
}

/** Every menu item must be reachable from the header and the sitemap page, and every indexable page must be on the sitemap. */
function checkNavigationCoverage(generated, { config, pages, pageList, navigation }) {
  const problems = [];
  let checked = 0;
  const linksIn = (html, start, end) => {
    const from = html.indexOf(start);
    const to = from === -1 ? -1 : html.indexOf(end, from);
    if (to === -1) return null;
    return new Set([...html.slice(from, to).matchAll(/\shref="([^"]+)"/g)].map(([, href]) => href.replace(/&amp;/g, "&")));
  };

  for (const lang of config.languages) {
    const sitemap = pages.get("sitemap");
    const html = generated.get(outputFile(lang, sitemap));
    const headerLinks = linksIn(html, "data-primary-nav>", "</nav>");
    const sitemapLinks = linksIn(html, "sitemap-grid", "</main>");
    if (!headerLinks || !sitemapLinks) {
      problems.push(`[${lang}] header menu or sitemap list not found on the sitemap page`);
      continue;
    }
    const ctx = createContext({ lang, page: sitemap, pages, dict: {}, config, versions: {}, navigation });

    const walk = (items, trail) => {
      for (const item of items) {
        const name = [...trail, item.id].join(" › ");
        const target = navTarget(item, ctx);
        if (target) {
          checked += 1;
          if (!headerLinks.has(target.href)) problems.push(`[${lang}] header menu is missing ${name}`);
          if (!sitemapLinks.has(target.href)) problems.push(`[${lang}] sitemap page is missing ${name}`);
        }
        if (item.children) walk(item.children, [...trail, item.id]);
      }
    };
    walk(navigation.menus, []);

    for (const page of pageList) {
      if (page.noindex || page.id === "sitemap") continue;
      if (!sitemapLinks.has(ctx.link(urlTarget(lang, page)))) problems.push(`[${lang}] sitemap page does not list page "${page.id}"`);
    }
  }
  return { problems, checked };
}

/* ------------------------------------------------------------------ build */

/** Things that are fine in the prototype but must be settled before the site goes live. */
function launchChecklist(config, dicts, placeholders) {
  const items = [];
  if (config.menuLinksDisabled) items.push("menu links are switched off — set \"menuLinksDisabled\": false in src/site.config.json");
  if (config.demoData) items.push("prototype labels are on — set \"demoData\": false in src/site.config.json");
  if (placeholders.size) items.push(`${placeholders.size} official values still pending ({{ORST_*}} placeholders listed above)`);
  if (config.visitorCountAsOf) items.push(`the footer's visitor count is a snapshot (${config.visitorCountAsOf}) from the current official site — connect the live counter and drop "visitorCountAsOf"`);
  const samples = flattenKeys(dicts.th.home ?? {}, "home").filter((key) => /ตัวอย่าง/.test(String(lookupOptional(dicts.th, key) ?? "")));
  if (samples.length) items.push(`${samples.length} homepage texts are still sample copy ("ตัวอย่าง") — notices, calendar and news in src/i18n/th.json and en.json`);
  return items.length ? ["Before launch:", ...items.map((item) => `  - ${item}`)] : ["Before launch: nothing outstanding."];
}

async function build() {
  const started = Date.now();
  const config = await readJson(path.join(SRC, "site.config.json"));
  const { pages: basePages } = await readJson(path.join(SRC, "pages.json"));
  const banners = await readJson(path.join(SRC, "banners.json"));
  const navigation = await readJson(path.join(SRC, "navigation.json"));
  const pageList = [...basePages, ...menuPages(navigation, basePages)];
  const pages = new Map(pageList.map((page) => [page.id, page]));
  const dicts = Object.fromEntries(
    await Promise.all(config.languages.map(async (lang) => [lang, await readJson(path.join(SRC, "i18n", `${lang}.json`))])),
  );

  checkTranslationParity(dicts);

  const generated = new Map();
  const layout = loadTemplate("layout.html");
  const bundles = {
    "assets/dist/site.css": await bundle(CSS_ORDER.map((name) => `assets/css/${name}.css`), "css"),
    "assets/dist/core.js": await bundle(CORE_JS_ORDER.map((name) => `assets/js/${name}.js`), "js"),
  };
  const versions = await assetVersions(bundles);

  for (const lang of config.languages) {
    for (const page of pageList) {
      const ctx = createContext({ lang, page, pages, dict: dicts[lang], config, versions, banners, navigation });
      ctx.content = render(loadTemplate(`pages/${page.template}`), ctx);
      generated.set(ctx.file, render(layout, ctx));
    }
  }

  generated.set("index.html", renderLanguageGateway(config));
  generated.set("sitemap.xml", renderSitemap(config, pageList));
  generated.set("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
  for (const [file, content] of Object.entries(bundles)) generated.set(file, content);

  await Promise.all(config.languages.map((lang) => rm(path.join(ROOT, lang), { recursive: true, force: true })));
  for (const [file, content] of generated) {
    const destination = path.join(ROOT, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.startsWith("th/") && file.endsWith(".html") ? thaiNumerals(content) : content);
  }

  const linkProblems = await checkLinks(generated);
  const navigationCheck = checkNavigationCoverage(generated, { config, pages, pageList, navigation });
  const placeholders = new Set();
  for (const [file, content] of generated) {
    if (file.endsWith(".html")) for (const match of content.matchAll(PLACEHOLDER)) placeholders.add(match[0]);
  }

  const pageCount = [...generated.keys()].filter((file) => /^(th|en)\//.test(file)).length;
  console.log(`Built ${pageCount} pages in ${Date.now() - started} ms.`);
  if (placeholders.size) {
    console.log(`Pending official data (${placeholders.size}): ${[...placeholders].sort().join(", ")}`);
  }
  reportBanners(banners);
  for (const line of ["Page headers:", ...reportHeroes(["sitemap", "home-services", "home-notices", "home-books", "book", "footer"])]) console.log(line);
  for (const line of ["Book covers:", ...reportBookCovers(BOOK_COVERS)]) console.log(line);
  for (const line of ["News photos:", ...reportNewsImages(NEWS_IMAGES)]) console.log(line);
  for (const line of ["Related-site logos:", ...reportLinkLogos(LINK_LOGOS)]) console.log(line);
  for (const line of ["Featured-knowledge photos:", ...reportFolderPhotos(FEATURE_DIR, FEATURE_PHOTOS)]) console.log(line);
  for (const line of ["Service photos:", ...reportFolderPhotos(SERVICE_DIR, SERVICE_PHOTOS)]) console.log(line);
  console.log(`Menus: ${navigationCheck.checked} menu links checked in the header and on the sitemap page (all languages).`);
  for (const line of launchChecklist(config, dicts, placeholders)) console.log(line);
  if (linkProblems.length) {
    console.error(`\nLink check failed (${linkProblems.length}):\n  ${linkProblems.join("\n  ")}`);
    process.exitCode = 1;
  }
  if (navigationCheck.problems.length) {
    console.error(`\nMenu coverage check failed (${navigationCheck.problems.length}):\n  ${navigationCheck.problems.join("\n  ")}`);
    process.exitCode = 1;
  }
}

build().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
