/**
 * Filterable, paginated collections: publications, news and the Fellows directory.
 * Filters are ordinary form controls marked with data-filter. State is mirrored in the URL
 * so filtered views can be shared, and option labels are read from the localised markup.
 */
(function (ORST) {
  "use strict";

  const { t, localize, formatNumber, formatDate, formatYear } = ORST.i18n;
  const dom = ORST.dom;
  const { resolveLink } = ORST.searchService;

  const yearOf = (item) => item.year ?? (item.date ? Number(item.date.slice(0, 4)) : null);
  const variants = (field) => (field && typeof field === "object" ? Object.values(field) : [field]).filter(Boolean);
  const isExternal = (link) => Boolean(link && (link.external || link.href));

  const SEARCH_FIELDS = {
    publications: (item) => [item.title, item.description],
    news: (item) => [item.title, item.summary],
    members: (item) => [item.name, item.field],
  };

  const RENDERERS = {
    publications(item, view, labels) {
      dom.setText(view, "category", labels.category?.[item.category]);
      const title = dom.slot(view, "link");
      if (item.read) {
        title.href = resolveLink(item.read);
        title.textContent = localize(item.title);
        if (isExternal(item.read)) {
          title.rel = "noopener";
          title.append(dom.create("span", "visually-hidden", t("common.externalLink")));
        }
      } else {
        title.replaceWith(localize(item.title));
      }
      if (item.year) dom.setText(view, "year", formatYear(item.year));
      else dom.slot(view, "year").remove();
      dom.setText(view, "format", t(`collection.formats.${item.format}`));

      for (const action of ["read", "download"]) {
        const link = dom.slot(view, action);
        if (item[action]) link.href = resolveLink(item[action]);
        else link.remove();
      }
      const actions = view.querySelector(".pub-item__actions");
      if (!actions.querySelector("a")) actions.remove();
    },

    news(item, view, labels) {
      dom.setText(view, "category", labels.category?.[item.category]);
      const time = dom.setText(view, "date", formatDate(item.date));
      time.dateTime = item.date;
      const link = dom.slot(view, "link");
      link.href = resolveLink(item.link);
      link.textContent = localize(item.title);
      if (isExternal(item.link)) {
        link.rel = "noopener";
        link.append(dom.create("span", "visually-hidden", t("common.externalLink")));
      }
      dom.setText(view, "summary", localize(item.summary));
    },

    members(item, view, labels) {
      dom.setText(view, "name", localize(item.name));
      dom.setText(view, "field", localize(item.field));
      dom.setText(view, "division", labels.division?.[item.division]);
    },
  };

  /** Maps option values to their visible, already-localised labels. */
  function readLabels(controls) {
    const labels = {};
    for (const control of controls) {
      const name = control.dataset.filter;
      if (control.tagName === "SELECT") {
        labels[name] = Object.fromEntries([...control.options].map((option) => [option.value, option.textContent.trim()]));
      } else if (control.type === "radio") {
        labels[name] = labels[name] || {};
        const label = document.querySelector(`label[for="${control.id}"]`);
        if (label) labels[name][control.value] = label.textContent.trim();
      }
    }
    return labels;
  }

  function initCollection(root) {
    const kind = root.dataset.collection;
    const render = RENDERERS[kind];
    if (!render) return;

    const pageSize = Number(root.dataset.pageSize) || 12;
    const form = root.querySelector("[data-collection-filters]");
    const controls = [...form.querySelectorAll("[data-filter]")];
    const names = [...new Set(controls.map((control) => control.dataset.filter))];
    const list = root.querySelector("[data-collection-list]");
    const summary = root.querySelector("[data-collection-summary]");
    const paginationNav = root.querySelector("[data-collection-pagination]");

    const params = new URLSearchParams(location.search);
    const state = Object.fromEntries(names.map((name) => [name, params.get(name) ?? ""]));
    state.page = Math.max(1, Number.parseInt(params.get("page"), 10) || 1);

    let items = [];
    let labels = {};

    const group = (name) => controls.filter((control) => control.dataset.filter === name);

    function readControl(name) {
      const [first, ...rest] = group(name);
      if (first.type === "radio") return [first, ...rest].find((control) => control.checked)?.value ?? "";
      return first.value.trim();
    }

    function writeControls() {
      for (const name of names) {
        for (const control of group(name)) {
          if (control.type === "radio") control.checked = control.value === state[name];
          else control.value = state[name];
        }
      }
    }

    function writeUrl() {
      const next = new URLSearchParams();
      for (const name of names) if (state[name]) next.set(name, state[name]);
      if (state.page > 1) next.set("page", String(state.page));
      history.replaceState(null, "", `${location.pathname}${next.toString() ? `?${next}` : ""}${location.hash}`);
    }

    function populateYears() {
      const select = form.querySelector('[data-options-from="year"]');
      // Only the "all years" option exists until data arrives; skip on retry.
      if (!select || select.options.length > 1) return;
      const years = [...new Set(items.map(yearOf).filter(Boolean))].sort((a, b) => b - a);
      for (const year of years) {
        const option = dom.create("option", "", formatYear(year));
        option.value = String(year);
        select.append(option);
      }
    }

    function matches(item) {
      return names.every((name) => {
        const value = state[name];
        if (!value) return true;
        if (name === "q") {
          const query = value.toLocaleLowerCase();
          return SEARCH_FIELDS[kind](item).flatMap(variants).some((text) => String(text).toLocaleLowerCase().includes(query));
        }
        if (name === "year") return String(yearOf(item)) === value;
        return String(item[name]) === value;
      });
    }

    function show() {
      const filtered = items.filter(matches);
      const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
      state.page = Math.min(state.page, pages);

      summary.textContent =
        filtered.length === items.length
          ? t("collection.summary", { count: formatNumber(items.length) })
          : t("collection.summaryFiltered", { count: formatNumber(filtered.length), total: formatNumber(items.length) });

      if (!filtered.length) {
        const empty = dom.template("empty");
        empty.querySelector("[data-action='reset']").addEventListener("click", () => form.reset());
        list.replaceChildren(empty);
      } else {
        const start = (state.page - 1) * pageSize;
        list.replaceChildren(
          ...filtered.slice(start, start + pageSize).map((item) => {
            const view = dom.template("item");
            render(item, view, labels);
            return view;
          }),
        );
      }

      ORST.pagination.render(paginationNav, {
        page: state.page,
        pages,
        onChange: (next) => {
          state.page = next;
          show();
          summary.scrollIntoView({ block: "center", behavior: ORST.accessibility.prefersReducedMotion() ? "auto" : "smooth" });
        },
      });
      writeUrl();
    }

    const applyFilters = () => {
      for (const name of names) state[name] = readControl(name);
      state.page = 1;
      show();
    };

    form.addEventListener("change", applyFilters);
    form.addEventListener("input", dom.debounce((event) => {
      if (event.target.dataset.filter === "q") applyFilters();
    }, 200));
    form.addEventListener("submit", (event) => event.preventDefault());
    // The reset event fires before controls are restored; read them on the next task.
    form.addEventListener("reset", () => window.setTimeout(applyFilters, 0));

    async function load() {
      list.setAttribute("aria-busy", "true");
      list.replaceChildren(...Array.from({ length: 4 }, () => dom.template("loading")));
      summary.textContent = t("collection.loading");
      paginationNav.hidden = true;
      try {
        await ORST.searchService.simulateNetwork();
        const data = await ORST.searchService.loadDataset();
        items = data[kind] ?? [];
        populateYears();
        labels = readLabels(controls);
        writeControls();
        show();
      } catch (error) {
        const view = dom.template("error");
        view.querySelector("[data-action='retry']").addEventListener("click", load);
        list.replaceChildren(view);
        summary.textContent = "";
      } finally {
        list.setAttribute("aria-busy", "false");
      }
    }

    load();
  }

  document.querySelectorAll("[data-collection]").forEach(initCollection);
})((window.ORST = window.ORST || {}));
