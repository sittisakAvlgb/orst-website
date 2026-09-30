/**
 * Homepage related websites: the tiles rise in one after another when the section scrolls into view.
 * Without JavaScript every tile shows as it is.
 */
(function (ORST) {
  "use strict";

  const reducedMotion = () => ORST.accessibility?.prefersReducedMotion?.() ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initLinks(section) {
    const list = section.querySelector("[data-links-list]");
    const cards = [...section.querySelectorAll("[data-link-card]")];
    if (!list || !cards.length) return;
    cards.forEach((card, i) => card.style.setProperty("--i", String(i)));

    if (reducedMotion() || !("IntersectionObserver" in window)) return;
    section.classList.add("is-waiting");
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        section.classList.remove("is-waiting");
        list.classList.add("is-entering");
        observer.disconnect();
      },
      { threshold: 0.1 },
    );
    observer.observe(list);
  }

  document.querySelectorAll(".links-section").forEach((section) => {
    try {
      initLinks(section);
    } catch (error) {
      console.error("[ORST] related links failed to initialise", error);
    }
  });
})((window.ORST = window.ORST || {}));
