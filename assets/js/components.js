/**
 * Shared DOM helpers and small interaction components:
 * templates, icons, highlighting, toast, pagination, disclosure, accordion,
 * in-page navigation, mobile footer accordions and back-to-top.
 */
(function (ORST) {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  /* ---------------------------------------------------------------- DOM helpers */

  const dom = {
    /** Clones the first element of <template data-template="name">. */
    template(name, scope = document) {
      const template = scope.querySelector(`template[data-template="${name}"]`);
      return template ? template.content.firstElementChild.cloneNode(true) : null;
    },

    slot(root, name) {
      return root.querySelector(`[data-slot="${name}"]`);
    },

    setText(root, name, value) {
      const element = dom.slot(root, name);
      if (element) element.textContent = value ?? "";
      return element;
    },

    create(tag, className, text) {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text != null) element.textContent = text;
      return element;
    },

    icon(name, className = "icon") {
      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("class", className);
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
      const use = document.createElementNS(SVG_NS, "use");
      use.setAttribute("href", `#${name}`);
      svg.append(use);
      return svg;
    },

    /** Text with the first match of `query` wrapped in <mark>. Never parses HTML. */
    highlight(text, query) {
      const fragment = document.createDocumentFragment();
      const value = String(text ?? "");
      const index = query ? value.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) : -1;
      if (index < 0) {
        fragment.append(value);
        return fragment;
      }
      fragment.append(value.slice(0, index), dom.create("mark", "", value.slice(index, index + query.length)), value.slice(index + query.length));
      return fragment;
    },

    /** Runs `callback` once the element's transition ends (or immediately with reduced motion). */
    afterTransition(element, callback) {
      if (ORST.accessibility.prefersReducedMotion()) {
        callback();
        return;
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        element.removeEventListener("transitionend", finish);
        callback();
      };
      element.addEventListener("transitionend", finish);
      window.setTimeout(finish, 400);
    },

    debounce(fn, wait) {
      let timer;
      return (...args) => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => fn(...args), wait);
      };
    },
  };

  /* ---------------------------------------------------------------------- Toast */

  const toast = {
    show(message, { variant = "success", duration = 4000 } = {}) {
      const region = document.querySelector("[data-toast-region]");
      if (!region) return;
      const item = dom.create("div", variant === "error" ? "toast toast--error" : "toast");
      item.append(dom.icon(variant === "error" ? "i-alert" : "i-check"), dom.create("p", "", message));
      region.append(item);
      window.setTimeout(() => {
        item.classList.add("is-leaving");
        dom.afterTransition(item, () => item.remove());
      }, duration);
    },
  };

  /* ----------------------------------------------------------------- Pagination */

  function pageWindow(page, pages) {
    const numbers = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
    const sorted = [...numbers].sort((a, b) => a - b);
    return sorted.flatMap((n, i) => (i > 0 && n - sorted[i - 1] > 1 ? ["gap", n] : [n]));
  }

  const pagination = {
    /** Renders client-side pagination into a <nav> and calls onChange(pageNumber). */
    render(nav, { page, pages, onChange }) {
      nav.replaceChildren();
      nav.hidden = pages <= 1;
      if (pages <= 1) return;

      const { t } = ORST.i18n;
      const list = dom.create("ul");
      const button = (target, content, { disabled = false, current = false, label } = {}) => {
        const element = dom.create("button");
        element.type = "button";
        element.dataset.page = String(target);
        element.disabled = disabled;
        if (current) element.setAttribute("aria-current", "page");
        if (label) element.setAttribute("aria-label", label);
        element.append(...content);
        const item = dom.create("li");
        item.append(element);
        return item;
      };

      list.append(
        button(page - 1, [dom.icon("i-chevron-left", "icon icon--sm"), dom.create("span", "pagination__label", t("pagination.previous"))], { disabled: page === 1 }),
      );
      for (const entry of pageWindow(page, pages)) {
        if (entry === "gap") {
          const gap = dom.create("li");
          gap.append(dom.create("span", "", "…"));
          list.append(gap);
        } else {
          list.append(button(entry, [ORST.i18n.formatNumber(entry)], { current: entry === page, label: t("pagination.page", { page: entry }) }));
        }
      }
      list.append(
        button(page + 1, [dom.create("span", "pagination__label", t("pagination.next")), dom.icon("i-chevron-right", "icon icon--sm")], { disabled: page === pages }),
      );

      nav.append(list);
      nav.onclick = (event) => {
        const target = event.target.closest("button[data-page]");
        if (target && !target.disabled) onChange(Number(target.dataset.page));
      };
    },
  };

  /* ----------------------------------------------------------------- Disclosure */

  function setDisclosure(button, open) {
    button.setAttribute("aria-expanded", String(open));
    const panel = document.getElementById(button.getAttribute("aria-controls"));
    if (panel) panel.hidden = !open;
  }

  function initDisclosures() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-disclosure]");
      for (const open of document.querySelectorAll('[data-disclosure][aria-expanded="true"]')) {
        const root = open.closest("[data-disclosure-root]");
        if (open !== button && root && !root.contains(event.target)) setDisclosure(open, false);
      }
      if (button) setDisclosure(button, button.getAttribute("aria-expanded") !== "true");
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const open = document.querySelector('[data-disclosure][aria-expanded="true"]');
      if (!open) return;
      setDisclosure(open, false);
      open.focus();
    });
  }

  /* ------------------------------------------------------------------ Accordion */

  function initAccordions() {
    for (const accordion of document.querySelectorAll("[data-accordion]")) {
      // Panels are open in the markup so content is available without JavaScript.
      for (const trigger of accordion.querySelectorAll(".accordion__trigger")) {
        trigger.setAttribute("aria-expanded", "false");
        document.getElementById(trigger.getAttribute("aria-controls")).hidden = true;
      }
      accordion.addEventListener("click", (event) => {
        const trigger = event.target.closest(".accordion__trigger");
        if (!trigger) return;
        const expanded = trigger.getAttribute("aria-expanded") === "true";
        trigger.setAttribute("aria-expanded", String(!expanded));
        document.getElementById(trigger.getAttribute("aria-controls")).hidden = expanded;
      });
    }
  }

  /* ------------------------------------------------------- In-page navigation */

  function initTableOfContents() {
    if (!("IntersectionObserver" in window)) return;
    for (const toc of document.querySelectorAll("[data-toc]")) {
      const links = [...toc.querySelectorAll('a[href^="#"]')];
      const sections = links.map((link) => document.getElementById(link.hash.slice(1))).filter(Boolean);
      if (!sections.length) continue;

      const observer = new IntersectionObserver(
        (entries) => {
          const visible = entries.filter((entry) => entry.isIntersecting);
          if (!visible.length) return;
          const id = visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0].target.id;
          for (const link of links) {
            if (link.hash === `#${id}`) link.setAttribute("aria-current", "true");
            else link.removeAttribute("aria-current");
          }
        },
        { rootMargin: "-15% 0px -70% 0px" },
      );
      sections.forEach((section) => observer.observe(section));
    }
  }

  /* ------------------------------------------------- Footer accordions (mobile) */

  function initFooterGroups() {
    const groups = [...document.querySelectorAll("[data-footer-group]")];
    if (!groups.length) return;
    const mobile = window.matchMedia("(max-width: 767px)");

    const collapse = (group, index) => {
      if (group.classList.contains("is-collapsible")) return;
      const heading = group.querySelector(".footer-heading");
      const panel = group.querySelector(".footer-group__panel");
      panel.id = panel.id || `footer-panel-${index}`;
      const toggle = dom.create("button", "footer-group__toggle");
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-controls", panel.id);
      const indicator = dom.create("span", "accordion__icon");
      indicator.setAttribute("aria-hidden", "true");
      toggle.append(...heading.childNodes, indicator);
      heading.append(toggle);
      panel.hidden = true;
      group.classList.add("is-collapsible");
    };

    const expand = (group) => {
      const toggle = group.querySelector(".footer-group__toggle");
      if (!toggle) return;
      toggle.querySelector(".accordion__icon").remove();
      toggle.parentElement.replaceChildren(...toggle.childNodes);
      group.querySelector(".footer-group__panel").hidden = false;
      group.classList.remove("is-collapsible");
    };

    const update = () => groups.forEach((group, index) => (mobile.matches ? collapse(group, index) : expand(group)));
    update();
    mobile.addEventListener("change", update);

    document.querySelector("[data-site-footer]").addEventListener("click", (event) => {
      const toggle = event.target.closest(".footer-group__toggle");
      if (!toggle) return;
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      document.getElementById(toggle.getAttribute("aria-controls")).hidden = expanded;
    });
  }

  /* ---------------------------------------------------------------- Back to top */

  function initBackToTop() {
    document.addEventListener("click", (event) => {
      if (!event.target.closest("[data-back-to-top]")) return;
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: ORST.accessibility.prefersReducedMotion() ? "auto" : "smooth" });
      document.querySelector("[data-site-header] .brand")?.focus({ preventScroll: true });
    });
  }

  /* ------------------------------------------------------------------ Carousel */

  const CAROUSEL_INTERVAL = 7000;

  /**
   * Banner carousel following the WAI-ARIA carousel pattern: previous/next, one button per slide
   * and a pause control. Auto-rotation never starts with reduced motion and pauses on hover/focus.
   */
  function initCarousel(root) {
    const slides = [...root.querySelectorAll("[data-carousel-slide]")];
    if (slides.length < 2) return;

    const { t } = ORST.i18n;
    const track = root.querySelector("[data-carousel-track]");
    const controls = root.querySelector("[data-carousel-controls]");
    const pauseButton = root.querySelector("[data-carousel-pause]");
    let index = 0;
    let timer = null;
    let pausedByUser = ORST.accessibility.prefersReducedMotion();
    let pausedByInteraction = false;

    const dots = slides.map((slide, position) => {
      const dot = dom.create("button", "banner__dot");
      dot.type = "button";
      dot.setAttribute("aria-label", t("carousel.goTo", { number: position + 1, title: slide.dataset.title }));
      dot.addEventListener("click", () => {
        show(position);
        restart();
      });
      const item = dom.create("li");
      item.append(dot);
      root.querySelector("[data-carousel-dots]").append(item);
      return dot;
    });

    function show(next) {
      index = (next + slides.length) % slides.length;
      slides.forEach((slide, position) => {
        const active = position === index;
        slide.hidden = false;
        slide.inert = !active;
        slide.classList.toggle("is-active", active);
      });
      dots.forEach((dot, position) => {
        if (position === index) dot.setAttribute("aria-current", "true");
        else dot.removeAttribute("aria-current");
      });
    }

    function restart() {
      window.clearInterval(timer);
      const playing = !pausedByUser && !pausedByInteraction;
      timer = playing ? window.setInterval(() => show(index + 1), CAROUSEL_INTERVAL) : null;
      // Announce slide changes only when the user drives them.
      track.setAttribute("aria-live", playing ? "off" : "polite");
    }

    function updatePauseButton() {
      pauseButton.setAttribute("aria-label", t(pausedByUser ? "carousel.play" : "carousel.pause"));
      pauseButton.querySelector("use").setAttribute("href", pausedByUser ? "#i-play" : "#i-pause");
    }

    root.querySelector("[data-carousel-prev]").addEventListener("click", () => {
      show(index - 1);
      restart();
    });
    root.querySelector("[data-carousel-next]").addEventListener("click", () => {
      show(index + 1);
      restart();
    });
    pauseButton.addEventListener("click", () => {
      pausedByUser = !pausedByUser;
      updatePauseButton();
      restart();
    });

    const holdFor = (paused) => () => {
      pausedByInteraction = paused;
      restart();
    };
    root.addEventListener("mouseenter", holdFor(true));
    root.addEventListener("mouseleave", holdFor(false));
    root.addEventListener("focusin", holdFor(true));
    root.addEventListener("focusout", (event) => {
      if (!root.contains(event.relatedTarget)) holdFor(false)();
    });

    root.classList.add("is-enhanced");
    controls.hidden = false;
    show(0);
    updatePauseButton();
    restart();
  }

  /* --------------------------------------------------------- Floating assistant */

  function initAssistant() {
    const assistant = document.querySelector("[data-assistant]");
    if (!assistant) return;
    const storageKey = "orst-assistant-dismissed";

    try {
      if (sessionStorage.getItem(storageKey)) {
        assistant.hidden = true;
        return;
      }
    } catch (error) {
      /* Without storage the shortcut simply stays available. */
    }

    assistant.querySelector("[data-assistant-close]").addEventListener("click", () => {
      assistant.hidden = true;
      document.getElementById("main").focus({ preventScroll: true });
      try {
        sessionStorage.setItem(storageKey, "1");
      } catch (error) {
        /* Dismissal lasts for this page view only. */
      }
    });

    initContactPanel(assistant);

    // Step aside while a primary search form or the footer's bottom bar is on screen.
    const avoid = document.querySelectorAll("[data-assistant-avoid], .site-footer__bottom");
    if (avoid.length && "IntersectionObserver" in window) {
      const visible = new Set();
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        }
        assistant.classList.toggle("is-tucked", visible.size > 0);
      });
      avoid.forEach((element) => observer.observe(element));
    }
  }

  /**
   * The contact shortcut opens a small panel of ways to reach the Office. It stays a plain link to the contact
   * page until this runs. A channel whose official link is still a {{ORST_*}} placeholder shows as pending.
   */
  function initContactPanel(assistant) {
    const toggle = assistant.querySelector("[data-contact-toggle]");
    const panel = assistant.querySelector("[data-contact-panel]");
    if (!toggle || !panel) return;
    const { t } = ORST.i18n;

    for (const link of panel.querySelectorAll("a[href*='{{']")) {
      link.removeAttribute("href");
      link.removeAttribute("target");
      link.setAttribute("aria-disabled", "true");
      link.classList.add("is-pending");
      const desc = link.querySelector(".contact-channel__desc");
      if (desc) desc.textContent = t("assistant.pending");
    }

    toggle.setAttribute("role", "button");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-haspopup", "true");

    const isOpen = () => !panel.hidden;
    function setOpen(open, { focus = false } = {}) {
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      assistant.classList.toggle("is-open", open);
      if (open && focus) panel.querySelector("input")?.focus();
      if (!open && focus) toggle.focus();
    }

    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      setOpen(!isOpen(), { focus: event.detail === 0 });
    });
    toggle.addEventListener("keydown", (event) => {
      if (event.key === " ") {
        event.preventDefault();
        setOpen(!isOpen(), { focus: true });
      }
    });
    panel.querySelector("[data-contact-close]").addEventListener("click", () => setOpen(false, { focus: true }));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen()) setOpen(false, { focus: true });
    });
    document.addEventListener("click", (event) => {
      if (isOpen() && !assistant.contains(event.target)) setOpen(false);
    });
  }

  /* ------------------------------------------------------------ Footer map */

  /**
   * Google Maps is a third party: the embed loads once the visitor has allowed functional cookies, or when they
   * press "show map" for this page view. Until then the panel keeps the place name and a link out.
   */
  function initFooterMap() {
    const map = document.querySelector("[data-footer-map]");
    if (!map) return;
    const frame = map.querySelector("[data-footer-map-frame]");
    let loaded = false;

    const load = () => {
      if (loaded) return;
      loaded = true;
      const iframe = document.createElement("iframe");
      iframe.src = map.dataset.src;
      iframe.title = map.dataset.title;
      iframe.loading = "lazy";
      iframe.referrerPolicy = "no-referrer-when-downgrade";
      iframe.allowFullscreen = true;
      frame.replaceChildren(iframe);
    };

    map.querySelector("[data-footer-map-show]")?.addEventListener("click", load);
    if (ORST.consent?.get?.()?.functional) load();
    document.addEventListener("orst:consent", (event) => {
      if (event.detail?.functional) load();
    });
  }

  function init() {
    initDisclosures();
    initAccordions();
    initTableOfContents();
    initFooterGroups();
    initFooterMap();
    initBackToTop();
    document.querySelectorAll("[data-carousel]").forEach(initCarousel);
    initAssistant();
  }

  ORST.dom = dom;
  ORST.toast = toast;
  ORST.pagination = pagination;
  ORST.components = { init };
})((window.ORST = window.ORST || {}));
