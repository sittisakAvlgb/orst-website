/**
 * Cookie consent (PDPA). The bar shows until the visitor chooses "accept all", "necessary only" or saves their own
 * settings; the choice is kept in localStorage and the footer's "ตั้งค่าคุกกี้" button reopens the settings.
 * Other scripts can read the choice with ORST.consent.get() and listen for the "orst:consent" event on document.
 */
(function (ORST) {
  "use strict";

  const KEY = "orst-cookie-consent";
  const VERSION = 1;
  const OPTIONAL = ["analytics", "functional"];

  function read() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      return saved && saved.version === VERSION ? saved : null;
    } catch (error) {
      return null;
    }
  }

  function write(choice) {
    const saved = { version: VERSION, necessary: true, ...choice, savedAt: new Date().toISOString() };
    try {
      localStorage.setItem(KEY, JSON.stringify(saved));
    } catch (error) {
      /* Without storage the choice lasts for this page view only. */
    }
    document.dispatchEvent(new CustomEvent("orst:consent", { detail: saved }));
    return saved;
  }

  const all = (value) => Object.fromEntries(OPTIONAL.map((name) => [name, value]));

  function init() {
    const bar = document.querySelector("[data-cookie-bar]");
    const modal = document.querySelector("[data-cookie-modal]");
    if (!bar || !modal) return;
    const form = modal.querySelector("[data-cookie-form]");

    // The corner buttons (contact, accessibility) rise by the bar's height while it is up.
    const measure = () => document.documentElement.style.setProperty("--cookie-bar-space", `${bar.offsetHeight + 12}px`);
    if ("ResizeObserver" in window) new ResizeObserver(measure).observe(bar);

    const reduced = () => ORST.accessibility?.prefersReducedMotion?.() ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function showBar(show) {
      if (show) {
        bar.hidden = false;
        measure();
        document.body.classList.add("has-cookie-bar");
        return;
      }
      if (bar.hidden) return;
      document.body.classList.remove("has-cookie-bar");
      if (reduced()) {
        bar.hidden = true;
        return;
      }
      // Slide down and fade, then take it out of the page.
      bar.classList.add("is-leaving");
      bar.addEventListener("animationend", () => {
        bar.classList.remove("is-leaving");
        bar.hidden = true;
      }, { once: true });
    }

    const decide = (choice) => {
      write(choice);
      showBar(false);
    };

    function openSettings() {
      const current = read() ?? all(false);
      OPTIONAL.forEach((name) => (form.elements[name].checked = Boolean(current[name])));
      modal.showModal();
    }

    bar.querySelector("[data-cookie-accept]").addEventListener("click", () => decide(all(true)));
    bar.querySelector("[data-cookie-necessary]").addEventListener("click", () => decide(all(false)));
    bar.querySelector("[data-cookie-open]").addEventListener("click", openSettings);
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-cookie-settings]")) openSettings();
    });

    modal.addEventListener("close", () => {
      if (modal.returnValue === "all") decide(all(true));
      else if (modal.returnValue === "save") decide(Object.fromEntries(OPTIONAL.map((name) => [name, form.elements[name].checked])));
      modal.returnValue = "";
    });

    showBar(!read());
  }

  ORST.consent = { init, get: read };
})((window.ORST = window.ORST || {}));
