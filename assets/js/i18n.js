/**
 * Runtime localisation and page configuration.
 * The build renders strings, page URLs and settings into #orst-runtime, so no component
 * hard-codes language or paths.
 */
(function (ORST) {
  "use strict";

  const source = document.getElementById("orst-runtime");
  const runtime = source
    ? JSON.parse(source.textContent)
    : { lang: document.documentElement.lang, locale: "th-TH", strings: {}, pages: {}, external: {} };

  /* Thai pages read Thai numerals; digits inside a Latin word or code (A4, MP3) stay as they are.
     The build does this for rendered pages — this covers text the components add later. */
  const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

  function digits(value) {
    const text = String(value ?? "");
    if (runtime.lang !== "th") return text;
    return text.replace(/(?<![A-Za-z])[0-9]+(?![A-Za-z])/g, (run) => run.replace(/[0-9]/g, (digit) => THAI_DIGITS[Number(digit)]));
  }

  function lookup(key) {
    return key.split(".").reduce((node, part) => (node == null ? undefined : node[part]), runtime.strings);
  }

  /** Localised string for a dotted key; {name} placeholders are replaced from `values`. */
  function t(key, values) {
    const template = lookup(key);
    if (typeof template !== "string") return key;
    if (!values) return digits(template);
    return digits(template.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match)));
  }

  /** Relative URL of a page in the current language, with optional query params and hash. */
  function pageUrl(id, params, hash) {
    const base = runtime.pages[id];
    if (!base) return "#";
    const query = params ? new URLSearchParams(params).toString() : "";
    return `${base}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  }

  const dateFormatter = new Intl.DateTimeFormat(runtime.locale, { day: "numeric", month: "short", year: "numeric" });
  const numberFormatter = new Intl.NumberFormat(runtime.locale);

  function formatDate(iso) {
    return dateFormatter.format(new Date(`${iso}T12:00:00`));
  }

  function formatNumber(value) {
    return numberFormatter.format(value);
  }

  /** Thai pages show Buddhist Era years; data stores Common Era years. */
  function formatYear(year) {
    return digits(runtime.lang === "th" ? Number(year) + 543 : year);
  }

  /** Localised value of a { th, en } field, falling back to Thai. */
  function localize(field) {
    if (field == null || typeof field !== "object") return field == null ? "" : digits(field);
    return digits(field[runtime.lang] ?? field.th ?? "");
  }

  /** Language links keep the current query and hash, and remember the choice. */
  function initLanguageLinks() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest("[data-lang-link]");
      if (!link) return;
      try {
        localStorage.setItem("orst-lang", link.dataset.langLink);
      } catch (error) {
        /* Storage can be unavailable (private mode); switching still works. */
      }
      if (location.search || location.hash) {
        event.preventDefault();
        location.href = link.href.split(/[?#]/)[0] + location.search + location.hash;
      }
    });
  }

  ORST.i18n = { runtime, lang: runtime.lang, t, pageUrl, digits, formatDate, formatNumber, formatYear, localize, initLanguageLinks };
})((window.ORST = window.ORST || {}));
