/**
 * Header behaviour: condensed state on scroll, the desktop "full menu" panel (disclosure pattern)
 * and the mobile navigation drawer (accordion). The build renders both from src/navigation.json.
 */
(function (ORST) {
  "use strict";

  // Must match the horizontal navigation breakpoint in navigation.css.
  const DESKTOP = window.matchMedia("(min-width: 1024px)");
  const CONDENSE_AFTER = 80;

  /* ------------------------------------------------------------ Sticky header */

  function initCondensedHeader(header) {
    let ticking = false;
    const update = () => {
      header.classList.toggle("is-condensed", window.scrollY > CONDENSE_AFTER);
      ticking = false;
    };
    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(update);
      },
      { passive: true },
    );
    update();
  }

  /* --------------------------------------------------------------- Mega menu */

  function initMegaMenu(nav) {
    const triggers = [...nav.querySelectorAll("[data-mega-trigger]")];
    let openTrigger = null;

    const panelOf = (trigger) => document.getElementById(trigger.getAttribute("aria-controls"));

    function close(trigger, { restoreFocus = false } = {}) {
      const panel = panelOf(trigger);
      trigger.setAttribute("aria-expanded", "false");
      panel.classList.remove("is-open");
      ORST.dom.afterTransition(panel, () => {
        if (trigger.getAttribute("aria-expanded") === "false") panel.hidden = true;
      });
      if (restoreFocus) trigger.focus();
      if (openTrigger === trigger) openTrigger = null;
    }

    function open(trigger) {
      if (openTrigger && openTrigger !== trigger) {
        openTrigger.setAttribute("aria-expanded", "false");
        panelOf(openTrigger).classList.remove("is-open");
        panelOf(openTrigger).hidden = true;
      }
      const panel = panelOf(trigger);
      panel.hidden = false;
      // A tall panel scrolls within the space left below the header.
      panel.style.setProperty("--panel-top", `${Math.round(panel.getBoundingClientRect().top)}px`);
      trigger.setAttribute("aria-expanded", "true");
      // Flush styles so the transition starts from the closed state without depending on rAF timing.
      void panel.offsetWidth;
      panel.classList.add("is-open");
      openTrigger = trigger;
    }

    nav.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-mega-trigger]");
      if (!trigger) return;
      if (trigger.getAttribute("aria-expanded") === "true") close(trigger);
      else open(trigger);
    });

    nav.addEventListener("keydown", (event) => {
      const trigger = event.target.closest("[data-mega-trigger]");
      if (!trigger) return;
      const index = triggers.indexOf(trigger);
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const step = event.key === "ArrowRight" ? 1 : -1;
        triggers[(index + step + triggers.length) % triggers.length].focus();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        open(trigger);
        const panel = panelOf(trigger);
        (panel.querySelector('[role="tab"][aria-selected="true"]') ?? panel.querySelector("a"))?.focus();
      }
    });

    // Close when keyboard focus leaves the open item. Pointer clicks are handled below.
    nav.addEventListener("focusout", (event) => {
      if (!openTrigger || !event.relatedTarget) return;
      if (!openTrigger.closest("[data-nav-item]").contains(event.relatedTarget)) close(openTrigger);
    });

    // Close on a click outside the menu, or when the search button inside it opens the search dialog.
    document.addEventListener("click", (event) => {
      if (!openTrigger) return;
      if (!event.target.closest("[data-nav-item]") || event.target.closest("[data-search-open]")) close(openTrigger);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && openTrigger) close(openTrigger, { restoreFocus: true });
    });

    DESKTOP.addEventListener("change", () => {
      if (openTrigger) close(openTrigger);
    });
  }

  /* ------------------------------------------------------- Full menu sections */

  // Vertical tabs (WAI-ARIA tabs pattern): hovering, clicking or arrowing to a section shows its pages.
  function initMenuTabs(nav) {
    const tabs = [...nav.querySelectorAll('[role="tab"]')];
    if (!tabs.length) return;
    let hoverTimer;

    const select = (tab, { focus = false } = {}) => {
      if (tab.getAttribute("aria-selected") !== "true") {
        for (const item of tabs) {
          const selected = item === tab;
          item.setAttribute("aria-selected", String(selected));
          item.tabIndex = selected ? 0 : -1;
          document.getElementById(item.getAttribute("aria-controls")).hidden = !selected;
        }
      }
      if (focus) tab.focus();
    };

    nav.addEventListener("click", (event) => {
      const tab = event.target.closest('[role="tab"]');
      if (tab) select(tab);
    });

    // A short delay stops the panel flickering while the pointer crosses the rail.
    nav.addEventListener("pointerover", (event) => {
      window.clearTimeout(hoverTimer);
      const tab = event.target.closest('[role="tab"]');
      if (tab && event.pointerType === "mouse") hoverTimer = window.setTimeout(() => select(tab), 120);
    });

    nav.addEventListener("keydown", (event) => {
      const tab = event.target.closest('[role="tab"]');
      if (!tab) return;
      const index = tabs.indexOf(tab);
      const next = {
        ArrowDown: tabs[(index + 1) % tabs.length],
        ArrowUp: tabs[(index - 1 + tabs.length) % tabs.length],
        Home: tabs[0],
        End: tabs[tabs.length - 1],
      }[event.key];
      if (!next) return;
      event.preventDefault();
      select(next, { focus: true });
    });
  }

  /* ------------------------------------------------------------ Mobile drawer */

  function initDrawerNav(container) {
    container.addEventListener("click", (event) => {
      const toggle = event.target.closest(".drawer-nav__toggle");
      if (!toggle) return;
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      document.getElementById(toggle.getAttribute("aria-controls")).hidden = expanded;
    });
  }

  function initDrawer() {
    const drawer = document.querySelector("[data-drawer]");
    const openers = [...document.querySelectorAll("[data-drawer-open]")];
    // Without <dialog> support the menu button stays a plain link to the sitemap.
    if (!drawer || typeof drawer.showModal !== "function") return;

    initDrawerNav(drawer.querySelector("[data-drawer-nav]"));

    for (const opener of openers) {
      opener.setAttribute("role", "button");
      opener.setAttribute("aria-haspopup", "dialog");
      opener.setAttribute("aria-controls", drawer.id);
      opener.setAttribute("aria-expanded", "false");
    }

    const openDrawer = (opener) => {
      drawer.showModal();
      document.body.classList.add("is-scroll-locked");
      opener.setAttribute("aria-expanded", "true");
    };

    const resetDrawerState = () => {
      document.body.classList.remove("is-scroll-locked");
      openers.forEach((opener) => opener.setAttribute("aria-expanded", "false"));
    };

    const closeDrawer = () => {
      drawer.close();
      resetDrawerState();
    };

    document.addEventListener("click", (event) => {
      const opener = event.target.closest("[data-drawer-open]");
      if (opener) {
        event.preventDefault();
        openDrawer(opener);
      } else if (event.target.closest("[data-drawer-close]")) {
        closeDrawer();
      }
    });

    document.addEventListener("keydown", (event) => {
      const opener = event.target.closest?.("[data-drawer-open]");
      if (opener && event.key === " ") {
        event.preventDefault();
        openDrawer(opener);
      }
    });

    // A click on the ::backdrop targets the dialog element itself.
    drawer.addEventListener("click", (event) => {
      if (event.target === drawer) closeDrawer();
    });

    // Escape closes the native dialog without our handlers; the close event restores page state.
    drawer.addEventListener("close", resetDrawerState);

    DESKTOP.addEventListener("change", (event) => {
      if (event.matches && drawer.open) closeDrawer();
    });
  }

  /* ------------------------------------------------ Prototype: inert menu links */

  // With "menuLinksDisabled" in site.config.json (prototype review), links to other pages keep their hover styles
  // but do not navigate. Still allowed: the sitemap page and every link on it (the way to reach detail pages),
  // home and the language switch, links within the same page, phone/email links, and forms such as search.
  function initDisabledMenuLinks() {
    if (!ORST.i18n.runtime.menuLinksDisabled) return;
    const pathOf = (id) => new URL(ORST.i18n.pageUrl(id), location.href).pathname;
    const sitemap = pathOf("sitemap");
    const home = pathOf("home");
    const onSitemap = location.pathname === sitemap;
    const blocked = (event) => {
      const link = event.target.closest?.("a[href]");
      if (!link || !/^https?:$/.test(link.protocol)) return;
      const url = new URL(link.href);
      const samePage = url.origin === location.origin && url.pathname === location.pathname;
      if (samePage || url.pathname === sitemap || url.pathname === home || link.hasAttribute("data-lang-link")) return;
      if (onSitemap && link.closest("main")) return;
      event.preventDefault();
    };
    document.addEventListener("click", blocked);
    document.addEventListener("auxclick", blocked);
  }

  function init() {
    const header = document.querySelector("[data-site-header]");
    const nav = document.querySelector("[data-primary-nav]");
    if (!header || !nav) return;
    initCondensedHeader(header);
    initMegaMenu(nav);
    initMenuTabs(nav);
    initDrawer();
    initDisabledMenuLinks();
  }

  ORST.navigation = { init };
})((window.ORST = window.ORST || {}));
