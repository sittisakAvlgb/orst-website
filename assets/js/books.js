/**
 * Homepage books row: category filters and scroll buttons for the sideways row.
 * Without JavaScript the row still scrolls with touch, trackpad or the scrollbar.
 */
(function () {
  "use strict";

  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");

  function initPubs(root) {
    const bar = root.querySelector("[data-pubs-bar]");
    const rail = root.querySelector("[data-pubs-rail]");
    const items = [...root.querySelectorAll("[data-pub]")];
    const filters = [...root.querySelectorAll("[data-pub-filter]")];
    const prev = root.querySelector("[data-pubs-prev]");
    const next = root.querySelector("[data-pubs-next]");
    if (!bar || !rail) return;

    bar.hidden = false;
    const behavior = () => (REDUCED.matches ? "auto" : "smooth");

    /** One card's width plus the gap, so each press moves by whole cards. */
    function stepSize() {
      const first = items.find((item) => !item.hidden);
      if (!first) return rail.clientWidth;
      const gap = parseFloat(getComputedStyle(rail).columnGap) || 0;
      const perView = Math.max(1, Math.floor((rail.clientWidth + gap) / (first.offsetWidth + gap)));
      return perView * (first.offsetWidth + gap);
    }

    function updateArrows() {
      const max = rail.scrollWidth - rail.clientWidth - 2;
      prev.disabled = rail.scrollLeft <= 2;
      next.disabled = rail.scrollLeft >= max;
      root.classList.toggle("is-scrollable", max > 2);
    }

    function filter(group) {
      filters.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.pubFilter === group)));
      let index = 0;
      for (const item of items) {
        const show = group === "all" || item.dataset.group === group;
        item.hidden = !show;
        if (show) item.style.setProperty("--i", String((index += 1)));
      }
      rail.scrollTo({ left: 0, behavior: "auto" });
      rail.classList.remove("is-entering");
      void rail.offsetWidth;
      rail.classList.add("is-entering");
      updateArrows();
    }

    filters.forEach((button) => button.addEventListener("click", () => filter(button.dataset.pubFilter)));
    prev.addEventListener("click", () => rail.scrollBy({ left: -stepSize(), behavior: behavior() }));
    next.addEventListener("click", () => rail.scrollBy({ left: stepSize(), behavior: behavior() }));
    rail.addEventListener("scroll", () => window.requestAnimationFrame(updateArrows), { passive: true });
    window.addEventListener("resize", updateArrows);

    updateArrows();
  }

  document.querySelectorAll("[data-pubs]").forEach((root) => {
    try {
      initPubs(root);
    } catch (error) {
      console.error("[ORST] books row failed to initialise", error);
    }
  });
})();
