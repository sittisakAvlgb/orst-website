/**
 * Homepage featured knowledge: the lead carousel (dots, autoplay that pauses on hover, focus or a hidden tab,
 * swipe on touch screens) and a one-time entrance when the section scrolls into view. Without JavaScript the
 * first story and the three cards simply show.
 */
(function (ORST) {
  "use strict";

  const { t } = ORST.i18n;
  const INTERVAL = 7000;
  const reducedMotion = () => ORST.accessibility?.prefersReducedMotion?.() ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initCarousel(lead) {
    const slides = [...lead.querySelectorAll("[data-feat-slide]")];
    const dots = lead.querySelector("[data-feat-dots]");
    if (slides.length < 2 || !dots) return;

    let index = 0;
    let timer = null;
    let paused = false;

    const buttons = slides.map((slide, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "feat-dot";
      button.setAttribute("aria-label", t("featured.goToSlide", { n: i + 1 }));
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
      // The bar in the current dot starts filling again with each slide.
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
      if (paused || reducedMotion() || document.hidden) return;
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

    lead.addEventListener("mouseenter", pause);
    lead.addEventListener("mouseleave", resume);
    lead.addEventListener("focusin", pause);
    lead.addEventListener("focusout", (event) => {
      if (!lead.contains(event.relatedTarget)) resume();
    });
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : restart()));

    let startX = null;
    lead.addEventListener("touchstart", (event) => (startX = event.touches[0].clientX), { passive: true });
    lead.addEventListener("touchend", (event) => {
      if (startX === null) return;
      const dx = event.changedTouches[0].clientX - startX;
      startX = null;
      if (Math.abs(dx) < 40) return;
      show(index + (dx < 0 ? 1 : -1));
      restart();
    });

    buttons.forEach((button, i) => button.setAttribute("aria-current", String(i === 0)));
    return restart;
  }

  function initFeatured(root) {
    const lead = root.querySelector("[data-feat-lead]");
    const start = lead ? initCarousel(lead) : null;

    if (reducedMotion()) return;
    if (!("IntersectionObserver" in window)) {
      start?.();
      return;
    }
    root.classList.add("is-waiting");
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        root.classList.remove("is-waiting");
        root.classList.add("is-entering");
        // Autoplay begins once the section is actually on screen.
        start?.();
        observer.disconnect();
      },
      { threshold: 0.15 },
    );
    observer.observe(root);
  }

  document.querySelectorAll("[data-feat]").forEach((root) => {
    try {
      initFeatured(root);
    } catch (error) {
      console.error("[ORST] featured knowledge failed to initialise", error);
    }
  });
})((window.ORST = window.ORST || {}));
