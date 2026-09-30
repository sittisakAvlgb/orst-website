/**
 * Homepage notices: tabs (announcements, procurement, jobs), a search box for the open tab,
 * list or grid layout (remembered) and paging. The build renders every notice, so without
 * JavaScript the three lists simply stack.
 */
(function (ORST) {
  "use strict";

  const { t, formatNumber } = ORST.i18n;
  const PAGE_SIZE = { list: 4, grid: 6 };
  const VIEW_KEY = "orst-notices-view";

  function readView() {
    try {
      return localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "list";
    } catch (error) {
      return "list";
    }
  }

  function saveView(view) {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch (error) {
      /* Without storage the choice lasts for this page view only. */
    }
  }

  function initNotices(root) {
    const bar = root.querySelector("[data-notices-bar]");
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const search = root.querySelector("[data-notices-search]");
    const viewButtons = [...root.querySelectorAll("[data-notices-view]")];
    if (!bar || !tabs.length) return;

    const panels = new Map(
      tabs.map((tab) => {
        const panel = document.getElementById(tab.getAttribute("aria-controls"));
        const items = [...panel.querySelectorAll("[data-notice]")].map((element) => ({
          element,
          text: element.textContent.replace(/\s+/g, " ").trim().toLocaleLowerCase(),
        }));
        panel.setAttribute("role", "tabpanel");
        return [tab, { panel, items, page: 1 }];
      }),
    );

    let active = tabs.find((tab) => tab.getAttribute("aria-selected") === "true") ?? tabs[0];
    let view = readView();

    bar.hidden = false;
    root.classList.add("is-enhanced");

    /** Replays the entrance animation on the rows that just became visible. */
    function animate(list, shown) {
      shown.forEach((item, index) => item.element.style.setProperty("--i", String(index)));
      list.classList.remove("is-entering");
      void list.offsetWidth;
      list.classList.add("is-entering");
    }

    function render({ animateRows = true } = {}) {
      const state = panels.get(active);
      const { panel, items } = state;
      const list = panel.querySelector("[data-notices-list]");
      const empty = panel.querySelector("[data-notices-empty]");
      const pager = panel.querySelector("[data-notices-pager]");
      const range = panel.querySelector("[data-notices-range]");
      const query = search.value.trim().toLocaleLowerCase();

      const matches = query ? items.filter((item) => item.text.includes(query)) : items;
      const size = PAGE_SIZE[view];
      const pages = Math.max(1, Math.ceil(matches.length / size));
      state.page = Math.min(state.page, pages);
      const from = (state.page - 1) * size;
      const shown = matches.slice(from, from + size);

      for (const item of items) item.element.hidden = !shown.includes(item);
      list.dataset.view = view;
      list.hidden = shown.length === 0;
      empty.hidden = shown.length > 0;
      if (!shown.length) empty.textContent = t("notices.empty", { query: search.value.trim() });

      pager.hidden = matches.length === 0;
      range.textContent = t("notices.range", {
        from: formatNumber(from + 1),
        to: formatNumber(from + shown.length),
        total: formatNumber(matches.length),
      });
      pager.querySelector("[data-notices-prev]").disabled = state.page <= 1;
      pager.querySelector("[data-notices-next]").disabled = state.page >= pages;

      if (animateRows && shown.length) animate(list, shown);
    }

    function select(tab, { focus = false } = {}) {
      active = tab;
      for (const [item, { panel }] of panels) {
        const selected = item === tab;
        item.setAttribute("aria-selected", String(selected));
        item.tabIndex = selected ? 0 : -1;
        panel.hidden = !selected;
      }
      if (focus) tab.focus();
      render();
    }

    function setView(next) {
      view = next;
      viewButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.noticesView === view)));
      saveView(view);
      for (const state of panels.values()) state.page = 1;
      render();
    }

    tabs.forEach((tab) => tab.addEventListener("click", () => select(tab)));

    bar.querySelector('[role="tablist"]').addEventListener("keydown", (event) => {
      const index = tabs.indexOf(document.activeElement);
      if (index < 0) return;
      const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length], { focus: true });
    });

    search.addEventListener(
      "input",
      ORST.dom.debounce(() => {
        panels.get(active).page = 1;
        render();
      }, 150),
    );

    viewButtons.forEach((button) => button.addEventListener("click", () => setView(button.dataset.noticesView)));

    root.addEventListener("click", (event) => {
      const step = event.target.closest("[data-notices-prev]") ? -1 : event.target.closest("[data-notices-next]") ? 1 : 0;
      if (!step) return;
      panels.get(active).page += step;
      render();
    });

    viewButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.noticesView === view)));
    select(active);
  }

  document.querySelectorAll("[data-notices]").forEach((root) => {
    try {
      initNotices(root);
    } catch (error) {
      console.error("[ORST] notices failed to initialise", error);
    }
  });
})((window.ORST = window.ORST || {}));
