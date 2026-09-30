/**
 * Display and reading preferences, set in the accessibility panel.
 * An inline script in <head> applies saved values before first paint; this module opens the panel,
 * keeps its controls in sync, applies every change immediately and stores it.
 *
 * Read aloud is deliberately not stored: it speaks the page the reader asked for, and nothing else.
 */
(function (ORST) {
  "use strict";

  const STORAGE_KEY = "orst-a11y";
  const root = document.documentElement;

  // name → { attribute, values }. A preference with two values is a switch; more than two is a group.
  const PREFERENCES = {
    textSize: { attribute: "data-text-size", values: ["small", "default", "large", "larger"] },
    contrast: { attribute: "data-contrast", values: ["default", "high"] },
    readable: { attribute: "data-readable", values: ["default", "on"] },
    links: { attribute: "data-links", values: ["default", "on"] },
    headings: { attribute: "data-headings", values: ["default", "on"] },
    spacing: { attribute: "data-spacing", values: ["default", "on"] },
    motion: { attribute: "data-motion", values: ["default", "reduced"] },
    cursor: { attribute: "data-cursor", values: ["default", "large"] },
  };

  function read() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch (error) {
      return {};
    }
  }

  function write(prefs) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (error) {
      /* Preferences still apply for this page view. */
    }
  }

  function apply(prefs) {
    for (const [name, { attribute }] of Object.entries(PREFERENCES)) {
      if (prefs[name] && prefs[name] !== "default") root.setAttribute(attribute, prefs[name]);
      else root.removeAttribute(attribute);
    }
  }

  function sync(prefs) {
    for (const form of document.querySelectorAll("[data-a11y-options]")) {
      for (const [name, { values }] of Object.entries(PREFERENCES)) {
        const value = prefs[name] || "default";
        const radio = form.querySelector(`input[type="radio"][name="${name}"][value="${value}"]`);
        if (radio) radio.checked = true;
        const box = form.querySelector(`input[type="checkbox"][name="${name}"]`);
        if (box) box.checked = value === values[1];
      }
    }
  }

  function update(name, value) {
    const prefs = { ...read(), [name]: value };
    apply(prefs);
    write(prefs);
    sync(prefs);
  }

  /* ------------------------------------------------------------- read aloud */

  /** The page's own words, in reading order, without the navigation around them. */
  function pageText() {
    const main = document.getElementById("main");
    if (!main) return "";
    const parts = [];
    for (const node of main.querySelectorAll("h1, h2, h3, p, li")) {
      if (node.closest("[hidden], .visually-hidden")) continue;
      if (node.querySelector("h1, h2, h3, p, li")) continue;
      const text = node.textContent.replace(/\s+/g, " ").trim();
      if (text) parts.push(text);
    }
    return parts.join(". ");
  }

  function initSpeech() {
    const group = document.querySelector("[data-a11y-speech]");
    const button = document.querySelector("[data-a11y-speak]");
    if (!group || !button || !("speechSynthesis" in window)) return;

    const { t, lang } = ORST.i18n;
    const label = document.querySelector("[data-a11y-speak-label]");
    const synth = window.speechSynthesis;

    const voiceFor = () => synth.getVoices().find((voice) => voice.lang.toLowerCase().startsWith(lang === "th" ? "th" : "en"));

    function showWhenSupported() {
      group.hidden = !voiceFor();
    }

    // Chrome loads voices asynchronously, so check again when the list arrives.
    showWhenSupported();
    synth.addEventListener("voiceschanged", showWhenSupported);

    function stop() {
      synth.cancel();
      button.setAttribute("aria-pressed", "false");
      if (label) label.textContent = t("a11y.readAloud");
    }

    button.addEventListener("click", () => {
      if (button.getAttribute("aria-pressed") === "true") {
        stop();
        return;
      }
      const text = pageText();
      if (!text) return;
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = voiceFor();
      if (voice) utterance.voice = voice;
      utterance.lang = voice ? voice.lang : lang;
      utterance.addEventListener("end", stop);
      utterance.addEventListener("error", stop);
      synth.cancel();
      synth.speak(utterance);
      button.setAttribute("aria-pressed", "true");
      if (label) label.textContent = t("a11y.readAloudStop");
    });

    // Leaving the page must not leave a voice talking over the next one.
    window.addEventListener("pagehide", () => synth.cancel());
  }

  /* -------------------------------------------------------------- the panel */

  function initPanel() {
    const panel = document.querySelector("[data-a11y-panel]");
    if (!panel) return;

    for (const button of document.querySelectorAll("[data-a11y-open]")) {
      button.hidden = false;
      button.addEventListener("click", () => {
        if (!panel.open) panel.showModal();
      });
    }

    for (const button of document.querySelectorAll("[data-a11y-close]")) {
      button.addEventListener("click", () => panel.close());
    }

    const reset = panel.querySelector("[data-a11y-reset]");
    if (reset) {
      reset.addEventListener("click", () => {
        apply({});
        write({});
        sync({});
      });
    }

    // Clicking the backdrop closes the dialog, the same as the site's other modals.
    panel.addEventListener("click", (event) => {
      if (event.target === panel) panel.close();
    });
  }

  function init() {
    const prefs = read();
    apply(prefs);
    sync(prefs);

    document.addEventListener("change", (event) => {
      const form = event.target.closest("[data-a11y-options]");
      const name = event.target.name;
      if (!form || !(name in PREFERENCES)) return;
      const { values } = PREFERENCES[name];
      if (event.target.type === "checkbox") update(name, event.target.checked ? values[1] : "default");
      else update(name, event.target.value);
    });

    initPanel();
    initSpeech();
  }

  const prefersReducedMotion = () =>
    root.getAttribute("data-motion") === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  ORST.accessibility = { init, prefersReducedMotion };
})((window.ORST = window.ORST || {}));
