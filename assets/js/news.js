/**
 * Homepage news: the featured slider (dots, autoplay that pauses on hover, focus or a hidden tab),
 * the type filters for the list beside it, and a one-time entrance when the section scrolls into view.
 * Without JavaScript the first featured story and the full list show as they are.
 */
(function (ORST) {
  "use strict";

  const { t } = ORST.i18n;
  const INTERVAL = 6500;
  const REDUCED = () => ORST.accessibility?.prefersReducedMotion?.() ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initSlider(root) {
    const slides = [...root.querySelectorAll("[data-hnews-slide]")];
    const dots = root.querySelector("[data-hnews-dots]");
    if (slides.length < 2 || !dots) return;

    let index = 0;
    let timer = null;
    let paused = false;

    const buttons = slides.map((slide, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hnews__dot";
      button.setAttribute("aria-label", t("news.goToSlide", { n: i + 1 }));
      button.addEventListener("click", () => {
        show(i);
        restart();
      });
      dots.append(button);
      return button;
    });
    dots.hidden = false;

    function show(next) {
      const previous = slides[index];
      index = (next + slides.length) % slides.length;
      const current = slides[index];
      if (previous !== current) {
        previous.classList.remove("is-active");
        previous.classList.add("is-leaving");
        window.setTimeout(() => {
          previous.classList.remove("is-leaving");
          if (!previous.classList.contains("is-active")) previous.hidden = true;
        }, 700);
      }
      current.hidden = false;
      void current.offsetWidth;
      current.classList.add("is-active");
      buttons.forEach((button, i) => button.setAttribute("aria-current", String(i === index)));
      // The progress bar in the active dot restarts with each slide.
      dots.classList.remove("is-running");
      void dots.offsetWidth;
      if (timer) dots.classList.add("is-running");
    }

    function stop() {
      window.clearInterval(timer);
      timer = null;
      dots.classList.remove("is-running");
    }

    function restart() {
      stop();
      if (paused || REDUCED() || document.hidden) return;
      timer = window.setInterval(() => show(index + 1), INTERVAL);
      dots.style.setProperty("--interval", `${INTERVAL}ms`);
      dots.classList.add("is-running");
    }

    const pause = () => {
      paused = true;
      stop();
    };
    const resume = () => {
      paused = false;
      restart();
    };

    const feature = root.querySelector(".hnews__feature");
    feature.addEventListener("mouseenter", pause);
    feature.addEventListener("mouseleave", resume);
    feature.addEventListener("focusin", pause);
    feature.addEventListener("focusout", (event) => {
      if (!feature.contains(event.relatedTarget)) resume();
    });
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : restart()));

    // Swipe on touch screens.
    let startX = null;
    feature.addEventListener("touchstart", (event) => (startX = event.touches[0].clientX), { passive: true });
    feature.addEventListener("touchend", (event) => {
      if (startX === null) return;
      const dx = event.changedTouches[0].clientX - startX;
      startX = null;
      if (Math.abs(dx) < 40) return;
      show(index + (dx < 0 ? 1 : -1));
      restart();
    });

    buttons.forEach((button, i) => button.setAttribute("aria-current", String(i === 0)));
    restart();
  }

  function initFilters(section, root) {
    const bar = section.querySelector("[data-hnews-filters]");
    const buttons = [...section.querySelectorAll("[data-hnews-filter]")];
    const items = [...root.querySelectorAll("[data-hnews-item]")];
    const empty = root.querySelector("[data-hnews-empty]");
    if (!bar || !buttons.length) return;
    bar.hidden = false;

    buttons.forEach((button) =>
      button.addEventListener("click", () => {
        const group = button.dataset.hnewsFilter;
        buttons.forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
        let shown = 0;
        for (const item of items) {
          const match = group === "all" || item.dataset.group === group;
          item.hidden = !match;
          if (match) item.style.setProperty("--i", String(shown++));
        }
        empty.hidden = shown > 0;
        root.classList.remove("is-filtering");
        void root.offsetWidth;
        root.classList.add("is-filtering");
      }),
    );
  }

  function initReveal(section) {
    section.querySelectorAll("[data-hnews-item]").forEach((item, i) => item.style.setProperty("--i", String(i)));
    if (REDUCED() || !("IntersectionObserver" in window)) return;
    section.classList.add("is-waiting");
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        section.classList.remove("is-waiting");
        section.classList.add("is-revealed");
        observer.disconnect();
      },
      { threshold: 0.2 },
    );
    observer.observe(section);
  }

  document.querySelectorAll(".hnews").forEach((section) => {
    const root = section.querySelector("[data-hnews]");
    if (!root) return;
    try {
      initSlider(root);
      initFilters(section, root);
      initReveal(section);
    } catch (error) {
      console.error("[ORST] news failed to initialise", error);
    }
  });
})((window.ORST = window.ORST || {}));
