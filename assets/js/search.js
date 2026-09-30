/**
 * Knowledge search: suggestion combobox for every search box, the header search dialog
 * and the results page.
 *
 * All data access goes through ORST.searchService. The current adapter reads the sample
 * dataset (assets/js/data/sample-content.js); replace `loadDataset` / `query` with API calls
 * without changing the UI code. Add ?simulate=error to a URL to preview the error states.
 */
(function (ORST) {
  "use strict";

  const { t, runtime, localize, pageUrl, formatNumber, formatDate, formatYear } = ORST.i18n;
  const dom = ORST.dom;

  const TYPES = ["dictionary", "terminology", "transliteration", "knowledge", "publication", "member", "news"];
  const DIRECT_ANSWER_TYPES = ["terminology", "dictionary", "transliteration"];
  const SUGGESTION_LIMIT = 8;
  const RESULTS_PER_PAGE = 10;
  const INPUT_DELAY = 180;
  const SIMULATED_LATENCY = 260;

  /* =========================================================== Search service */

  let datasetPromise = null;

  function loadDataset() {
    if (ORST.sampleData) return Promise.resolve(ORST.sampleData);
    if (!datasetPromise) {
      datasetPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = runtime.sampleDataUrl;
        script.onload = () => (ORST.sampleData ? resolve(ORST.sampleData) : reject(new Error("Sample data did not register")));
        script.onerror = () => {
          datasetPromise = null;
          reject(new Error("Sample data failed to load"));
        };
        document.head.append(script);
      });
    }
    return datasetPromise;
  }

  /* Thai numerals fold to Arabic ones so that "๒๕๕๔" and "2554" find the same records. */
  const arabicDigits = (value) => value.replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - 0x0e50));
  const normalize = (value) => arabicDigits(String(value ?? "").normalize("NFC").toLocaleLowerCase()).replace(/\s+/g, " ").trim();

  /** Every language variant of a field, so Thai queries find English titles and vice versa. */
  const variants = (field) => (field && typeof field === "object" ? Object.values(field) : [field]).filter(Boolean);

  /** Resolves a record link descriptor: { page, params, hash } or { external } or { href }. */
  function resolveLink(link) {
    if (!link) return pageUrl("search");
    if (link.external) return runtime.external[link.external] ?? "#";
    if (link.href) return link.href;
    return pageUrl(link.page, link.params, link.hash);
  }

  function toIndex(data) {
    const publications = data.publications.map((item) => ({
      id: item.id,
      type: "publication",
      title: item.title,
      excerpt: item.description,
      year: item.year,
      link: { page: "publications", params: { q: localize(item.title) } },
    }));
    const news = data.news.map((item) => ({
      id: item.id,
      type: "news",
      title: item.title,
      excerpt: item.summary,
      date: item.date,
      link: { page: "news", params: { q: localize(item.title) } },
    }));
    const members = data.members.map((item) => ({
      id: item.id,
      type: "member",
      title: item.name,
      excerpt: item.field,
      link: { page: "royal-society", hash: "members" },
    }));
    // A record still waiting for official data (title "{{ORST_…}}") would show as raw code, so it stays out of search.
    return [...data.entries, ...publications, ...news, ...members].filter((record) => !variants(record.title).some(isPlaceholder));
  }

  const isPlaceholder = (value) => /^\{\{[A-Z0-9_]+\}\}$/.test(String(value).trim());

  function score(record, query, mode) {
    let best = 0;
    const primary = [...variants(record.title), ...variants(record.answer), ...(record.keywords ?? [])];
    for (const value of primary.map(normalize)) {
      if (value === query) best = Math.max(best, 100);
      else if (value.startsWith(query)) best = Math.max(best, 80);
      else if (mode === "contains" && value.includes(query)) best = Math.max(best, 55);
    }
    if (mode === "contains" && variants(record.excerpt).some((value) => normalize(value).includes(query))) {
      best = Math.max(best, 25);
    }
    return best;
  }

  // Read once at load: results and collection pages rewrite the URL, which would drop the flag.
  const SIMULATE_ERROR = new URLSearchParams(location.search).get("simulate") === "error";

  function simulateNetwork() {
    return new Promise((resolve, reject) => {
      window.setTimeout(() => {
        if (SIMULATE_ERROR) reject(new Error("Simulated error"));
        else resolve();
      }, SIMULATED_LATENCY);
    });
  }

  let indexPromise = null;
  const getIndex = () => (indexPromise = indexPromise || loadDataset().then(toIndex));

  /** True when `value` appears in `text`. Latin terms must match whole words, so "ai" does not match "email". */
  function mentions(text, value) {
    if (!value) return false;
    if (!/^[\x20-\x7e]+$/.test(value)) return text.includes(value);
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(text);
  }

  const searchService = {
    loadDataset,
    simulateNetwork,
    normalize,
    mentions,

    /** The direct-answer record whose term appears in free text (longest term wins). */
    async findMentioned(text) {
      const haystack = normalize(text);
      let best = null;
      let bestLength = 0;
      for (const record of await getIndex()) {
        if (!DIRECT_ANSWER_TYPES.includes(record.type) || !record.answer) continue;
        for (const value of [...variants(record.title), ...(record.keywords ?? [])].map(normalize)) {
          if (value.length > bestLength && mentions(haystack, value)) {
            best = record;
            bestLength = value.length;
          }
        }
      }
      return best;
    },

    /** Resolves to { results: [{ record, score }], counts: { all, <type>: n } } sorted by relevance. */
    async query(rawQuery, { mode = "contains" } = {}) {
      await simulateNetwork();
      const index = await getIndex();
      const query = normalize(rawQuery);
      const results = query
        ? index
            .map((record) => ({ record, score: score(record, query, mode) }))
            .filter((match) => match.score > 0)
            .sort((a, b) => b.score - a.score)
        : [];
      const counts = { all: results.length };
      for (const type of TYPES) counts[type] = results.filter((match) => match.record.type === type).length;
      return { results, counts };
    },

    resolveLink,
  };

  /* ======================================================= Suggestion combobox */

  let boxCount = 0;

  function initSearchBox(form) {
    const input = form.querySelector("[data-search-input]");
    const panel = form.querySelector("[data-search-panel]");
    const listbox = form.querySelector("[data-search-listbox]");
    const status = form.querySelector("[data-search-status]");
    const footer = form.querySelector("[data-search-footer]");
    const clear = form.querySelector("[data-search-clear]");
    if (!input || !panel || !listbox) return;

    const id = `search-box-${(boxCount += 1)}`;
    let scope = form.closest("[data-search-scope]")?.dataset.searchScope ?? null;
    // In the search window the suggestions are part of the layout, so they never collapse.
    const inline = Boolean(form.closest("[data-search-dialog]"));
    let options = [];
    let activeIndex = -1;
    let requestId = 0;

    listbox.id = `${id}-listbox`;
    status.setAttribute("aria-live", "polite");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", listbox.id);

    const defaultPlaceholder = input.placeholder;
    const scopeInput = dom.create("input");
    scopeInput.type = "hidden";
    scopeInput.name = "type";

    /** Limits suggestions and results to one database; null searches everything. */
    function setScope(value) {
      scope = value || null;
      scopeInput.value = scope ?? "";
      if (scope) form.append(scopeInput);
      else scopeInput.remove();
      input.placeholder = scope ? t(`search.scopePlaceholders.${scope}`) : defaultPlaceholder;
    }

    setScope(scope);

    // Database tabs next to a search box (homepage search card) switch its scope in place.
    const tabs = form.closest("[data-search-host]")?.querySelector("[data-search-tabs]");
    if (tabs) {
      tabs.hidden = false;
      tabs.addEventListener("change", (event) => {
        setScope(event.target.value);
        input.focus();
        update();
      });
    }

    const openPanel = () => {
      panel.hidden = false;
      input.setAttribute("aria-expanded", "true");
    };

    const closePanel = () => {
      if (inline) {
        setActive(-1);
        return;
      }
      panel.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
      activeIndex = -1;
    };

    const setActive = (index) => {
      options.forEach((option, i) => option.setAttribute("aria-selected", String(i === index)));
      activeIndex = index;
      if (index >= 0) {
        input.setAttribute("aria-activedescendant", options[index].id);
        options[index].scrollIntoView({ block: "nearest" });
      } else {
        input.removeAttribute("aria-activedescendant");
      }
    };

    const resultsHref = (query) => pageUrl("search", scope ? { q: query, type: scope } : { q: query });

    function renderFooter(query) {
      footer.replaceChildren();
      footer.hidden = !query;
      if (!query) return;
      const all = dom.create("a", "text-link", t("search.viewAll", { query }));
      all.href = resultsHref(query);
      const ask = dom.create("a", "text-link");
      ask.href = pageUrl("knowledge-ai", { q: query });
      ask.append(dom.icon("i-ask"), t("search.askAi"));
      footer.append(all, ask);
    }

    function renderOptions(items, query) {
      listbox.replaceChildren();
      panel.querySelector(".search-suggest__empty")?.remove();
      options = items.map((item, index) => {
        const option = dom.create("li", "suggestion");
        option.id = `${id}-option-${index}`;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", "false");
        option.dataset.href = item.href;
        if (item.type) {
          const label = dom.create("span", "type-label", t(`search.types.${item.type}`));
          label.dataset.type = item.type;
          // Spaces keep the option's accessible name readable ("Dictionary ปัญญา …"); grid layout ignores them.
          option.append(label, " ");
        }
        const text = dom.create("span");
        const title = dom.create("span", "suggestion__title");
        title.append(dom.highlight(item.title, query));
        text.append(title);
        if (item.sub) text.append(" ", dom.create("span", "suggestion__sub", item.sub));
        option.append(text);
        return option;
      });
      listbox.append(...options);
      listbox.hidden = options.length === 0;
      activeIndex = -1;
    }

    function showPopular() {
      panel.dataset.mode = "popular";
      status.textContent = t("search.popularTitle");
      renderOptions(
        (runtime.strings.search?.popular ?? []).map((term) => ({ title: term, href: resultsHref(term) })),
        "",
      );
      renderFooter("");
      openPanel();
    }

    function showEmpty(query) {
      renderOptions([], query);
      status.textContent = "";
      const empty = dom.create("p", "search-suggest__empty text-sm text-secondary", t("search.noSuggestions", { query }));
      listbox.after(empty);
      renderFooter(query);
      openPanel();
    }

    async function update() {
      const query = input.value.trim();
      const current = (requestId += 1);
      if (!query) {
        showPopular();
        return;
      }
      delete panel.dataset.mode;
      status.textContent = t("search.loading");
      openPanel();
      try {
        const { results } = await searchService.query(query);
        if (current !== requestId) return;
        const matches = (scope ? results.filter((match) => match.record.type === scope) : results).slice(0, SUGGESTION_LIMIT);
        if (!matches.length) {
          showEmpty(query);
          return;
        }
        status.textContent = t("search.suggestionCount", { count: formatNumber(matches.length) });
        renderOptions(
          matches.map(({ record }) => ({
            type: record.type,
            title: localize(record.title),
            sub: localize(record.answer) || localize(record.excerpt),
            href: resolveLink(record.link),
          })),
          query,
        );
        renderFooter(query);
      } catch (error) {
        if (current !== requestId) return;
        renderOptions([], query);
        status.textContent = t("search.suggestError");
        renderFooter(query);
      }
    }

    const scheduleUpdate = dom.debounce(update, INPUT_DELAY);

    input.addEventListener("input", () => {
      clear.hidden = !input.value;
      scheduleUpdate();
    });

    input.addEventListener("focus", () => {
      if (!input.value.trim()) showPopular();
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (panel.hidden) {
          update();
          return;
        }
        event.preventDefault();
        if (!options.length) return;
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((activeIndex + step + options.length) % options.length);
      } else if (event.key === "Escape" && !inline) {
        if (!panel.hidden) {
          event.preventDefault();
          event.stopPropagation();
          closePanel();
        } else if (input.value) {
          event.preventDefault();
          input.value = "";
          clear.hidden = true;
        }
      }
    });

    listbox.addEventListener("mousedown", (event) => event.preventDefault());
    listbox.addEventListener("click", (event) => {
      const option = event.target.closest("[role='option']");
      if (option) location.href = option.dataset.href;
    });

    clear.addEventListener("click", () => {
      input.value = "";
      clear.hidden = true;
      input.focus();
      showPopular();
    });

    form.addEventListener("focusout", (event) => {
      if (event.relatedTarget && !form.contains(event.relatedTarget)) closePanel();
    });

    document.addEventListener("click", (event) => {
      if (!form.contains(event.target)) closePanel();
    });

    if (inline) showPopular();

    form.addEventListener("submit", (event) => {
      const query = input.value.trim();
      if (activeIndex >= 0) {
        event.preventDefault();
        location.href = options[activeIndex].dataset.href;
        return;
      }
      if (!query) {
        event.preventDefault();
        input.focus();
        return;
      }
      closePanel();
      if (form.dataset.searchInPlace) {
        event.preventDefault();
        form.dispatchEvent(new CustomEvent("orst:search", { detail: { query } }));
      }
    });
  }

  /* ============================================================ Search dialog */

  function initSearchDialog() {
    const dialog = document.querySelector("[data-search-dialog]");
    const supported = dialog && typeof dialog.showModal === "function";

    document.addEventListener("click", (event) => {
      const opener = event.target.closest("[data-search-open]");
      if (opener) {
        if (!supported) {
          location.href = pageUrl("search");
          return;
        }
        opener.closest("dialog[open]")?.close();
        dialog.showModal();
        dialog.querySelector("[data-search-input]").focus();
      } else if (event.target.closest("[data-search-close]")) {
        dialog.close();
      }
    });

    if (!supported) return;
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  /* ============================================================= Results page */

  function initResultsPage(page) {
    const form = document.querySelector(".search-page__form [data-search-box]");
    const input = form.querySelector("[data-search-input]");
    const filters = page.querySelector("[data-search-filters]");
    const sortSelect = page.querySelector("[data-search-sort]");
    const matchSelect = page.querySelector("[data-search-match]");
    const summary = page.querySelector("[data-results-summary]");
    const featureSlot = page.querySelector("[data-search-feature]");
    const resultsSlot = page.querySelector("[data-search-results]");
    const paginationNav = page.querySelector("[data-search-pagination]");

    form.dataset.searchInPlace = "true";

    const state = readState();
    let lastKey = "";
    let lastResponse = null;

    function readState() {
      const params = new URLSearchParams(location.search);
      const prefix = params.get("prefix");
      return {
        q: (prefix ?? params.get("q") ?? "").trim(),
        type: TYPES.includes(params.get("type")) ? params.get("type") : "all",
        mode: prefix || params.get("match") === "prefix" ? "prefix" : "contains",
        sort: ["newest", "title"].includes(params.get("sort")) ? params.get("sort") : "relevance",
        page: Math.max(1, Number.parseInt(params.get("page"), 10) || 1),
      };
    }

    function writeState(push) {
      const params = new URLSearchParams();
      if (state.q) params.set("q", state.q);
      if (state.type !== "all") params.set("type", state.type);
      if (state.mode === "prefix") params.set("match", "prefix");
      if (state.sort !== "relevance") params.set("sort", state.sort);
      if (state.page > 1) params.set("page", String(state.page));
      const url = `${location.pathname}${params.toString() ? `?${params}` : ""}`;
      history[push ? "pushState" : "replaceState"](null, "", url);
    }

    function syncControls() {
      input.value = state.q;
      form.querySelector("[data-search-clear]").hidden = !state.q;
      filters.querySelector(`input[value="${state.type}"]`).checked = true;
      sortSelect.value = state.sort;
      matchSelect.value = state.mode;
    }

    function updateCounts(counts) {
      for (const badge of filters.querySelectorAll("[data-count]")) {
        const count = counts?.[badge.dataset.count];
        badge.textContent = count == null ? "" : formatNumber(count);
      }
    }

    function sortMatches(matches) {
      const title = (match) => localize(match.record.title);
      const time = (match) => (match.record.date ? Date.parse(match.record.date) : match.record.year ? match.record.year : 0);
      if (state.sort === "title") return [...matches].sort((a, b) => title(a).localeCompare(title(b), runtime.locale));
      if (state.sort === "newest") return [...matches].sort((a, b) => time(b) - time(a));
      return matches;
    }

    function renderInitial() {
      summary.textContent = "";
      featureSlot.replaceChildren();
      updateCounts(null);
      paginationNav.hidden = true;
      const view = dom.template("initial");
      const popular = dom.slot(view, "popular");
      for (const term of runtime.strings.search?.popular ?? []) {
        const link = dom.create("a", "text-link", term);
        link.href = pageUrl("search", { q: term });
        popular.append(link);
      }
      resultsSlot.replaceChildren(view);
    }

    function renderEmpty() {
      const view = dom.template("empty");
      dom.setText(view, "query", state.q);
      const similar = dom.slot(view, "similar");
      (runtime.strings.search?.popular ?? []).slice(0, 3).forEach((term, index) => {
        if (index > 0) similar.append(", ");
        const link = dom.create("a", "", term);
        link.href = pageUrl("search", { q: term });
        similar.append(link);
      });
      const all = dom.slot(view, "all");
      if (state.type === "all" && state.mode === "contains") all.remove();
      else all.href = pageUrl("search", { q: state.q });
      dom.slot(view, "ask").href = pageUrl("knowledge-ai", { q: state.q });
      resultsSlot.replaceChildren(view);
    }

    function renderError() {
      summary.textContent = "";
      featureSlot.replaceChildren();
      paginationNav.hidden = true;
      const view = dom.template("error");
      view.querySelector("[data-action='retry']").addEventListener("click", () => {
        lastKey = "";
        run();
      });
      resultsSlot.replaceChildren(view);
    }

    function renderFeature(matches) {
      featureSlot.replaceChildren();
      if (state.page !== 1 || state.mode !== "contains") return;
      const direct = matches.find(
        (match) => match.score === 100 && DIRECT_ANSWER_TYPES.includes(match.record.type) && match.record.answer,
      );
      if (!direct) return;
      const { record } = direct;
      const view = dom.template("feature");
      dom.setText(view, "label", t(`search.featureLabels.${record.type}`));
      dom.setText(view, "term", localize(record.title));
      dom.setText(view, "answer", localize(record.answer));
      dom.setText(view, "source", record.source ? t("search.sourceLabel", { source: localize(record.source) }) : "");
      if (!runtime.demoData) dom.slot(view, "sample").remove();
      dom.slot(view, "detail").href = resolveLink(record.link);
      dom.slot(view, "ask").href = pageUrl("knowledge-ai", { q: state.q });
      featureSlot.append(view);
    }

    function renderResults(matches) {
      const pages = Math.max(1, Math.ceil(matches.length / RESULTS_PER_PAGE));
      state.page = Math.min(state.page, pages);
      const start = (state.page - 1) * RESULTS_PER_PAGE;
      const list = dom.create("ol", "result-list");
      for (const { record } of matches.slice(start, start + RESULTS_PER_PAGE)) {
        const item = dom.template("result");
        const label = dom.setText(item, "type", t(`search.types.${record.type}`));
        label.dataset.type = record.type;
        const link = dom.slot(item, "link");
        link.href = resolveLink(record.link);
        link.append(dom.highlight(localize(record.title), state.q));
        const excerpt = dom.slot(item, "excerpt");
        const text = [localize(record.answer), localize(record.excerpt)].filter(Boolean).join(" — ");
        if (text) excerpt.append(dom.highlight(text, state.q));
        else excerpt.remove();
        const meta = dom.slot(item, "meta");
        const metaParts = [
          record.source && localize(record.source),
          record.date && formatDate(record.date),
          record.year && formatYear(record.year),
        ].filter(Boolean);
        if (metaParts.length) metaParts.forEach((part) => meta.append(dom.create("span", "", part)));
        else meta.remove();
        list.append(item);
      }
      resultsSlot.replaceChildren(list);
      ORST.pagination.render(paginationNav, {
        page: state.page,
        pages,
        onChange: (next) => {
          state.page = next;
          run({ push: true });
          summary.scrollIntoView({ block: "start", behavior: ORST.accessibility.prefersReducedMotion() ? "auto" : "smooth" });
        },
      });
    }

    async function run({ push = false } = {}) {
      writeState(push);
      syncControls();
      if (!state.q) {
        renderInitial();
        return;
      }

      const key = `${state.q}|${state.mode}`;
      if (key !== lastKey) {
        resultsSlot.setAttribute("aria-busy", "true");
        resultsSlot.replaceChildren(dom.template("loading"));
        featureSlot.replaceChildren();
        paginationNav.hidden = true;
        summary.textContent = t("search.loadingResults");
        try {
          lastResponse = await searchService.query(state.q, { mode: state.mode });
          lastKey = key;
        } catch (error) {
          renderError();
          return;
        } finally {
          resultsSlot.setAttribute("aria-busy", "false");
        }
      }

      const { results, counts } = lastResponse;
      updateCounts(counts);
      const matches = sortMatches(state.type === "all" ? results : results.filter((match) => match.record.type === state.type));
      summary.textContent = t(state.mode === "prefix" ? "search.summaryPrefix" : "search.summary", {
        count: formatNumber(matches.length),
        query: state.q,
      });
      renderFeature(matches);
      if (matches.length) renderResults(matches);
      else {
        paginationNav.hidden = true;
        renderEmpty();
      }
    }

    form.addEventListener("orst:search", (event) => {
      state.q = event.detail.query;
      state.page = 1;
      run({ push: true });
    });

    filters.addEventListener("change", (event) => {
      state.type = event.target.value;
      state.page = 1;
      run();
    });

    sortSelect.addEventListener("change", () => {
      state.sort = sortSelect.value;
      state.page = 1;
      run();
    });

    matchSelect.addEventListener("change", () => {
      state.mode = matchSelect.value;
      state.page = 1;
      run();
    });

    window.addEventListener("popstate", () => {
      Object.assign(state, readState());
      run();
    });

    run();
  }

  function init() {
    document.querySelectorAll("[data-search-box]").forEach(initSearchBox);
    initSearchDialog();
    const page = document.querySelector("[data-search-page]");
    if (page) initResultsPage(page);
  }

  ORST.searchService = searchService;
  ORST.search = { init };
})((window.ORST = window.ORST || {}));
