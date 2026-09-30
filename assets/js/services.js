/**
 * Homepage services: each part fades up once when it scrolls into view. Without JavaScript (or with reduced
 * motion) everything simply shows.
 */
(function (ORST) {
  "use strict";

  const reducedMotion = () => ORST.accessibility?.prefersReducedMotion?.() ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function reveal(element) {
    element.classList.add("is-waiting");
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        element.classList.remove("is-waiting");
        element.classList.add("is-entering");
        observer.disconnect();
      },
      { threshold: 0.15 },
    );
    observer.observe(element);
  }

  if (reducedMotion() || !("IntersectionObserver" in window)) return;
  document.querySelectorAll("[data-srv], [data-srv-more]").forEach((element) => {
    try {
      reveal(element);
    } catch (error) {
      console.error("[ORST] services entrance failed to initialise", error);
    }
  });
})((window.ORST = window.ORST || {}));
