/**
 * Sitemap page: a live filter over every listed page, animated section collapsing and a jump index
 * that follows the reading position. Progressive enhancement — without this script every link is
 * already visible, and collapsing is the only behaviour that needs it.
 */
(function (ORST) {
  "use strict";

  const { t } = ORST.i18n;

  const grid = document.querySelector("[data-sitemap-grid]");
  if (!grid) return;

  const input = document.querySelector("[data-sitemap-input]");
  const keyHint = document.querySelector("[data-sitemap-key]");
  const clearButton = document.querySelector("[data-sitemap-clear]");
  const countLine = document.querySelector("[data-sitemap-count]");
  const collapseButton = document.querySelector("[data-sitemap-collapse]");
  const collapseLabel = document.querySelector("[data-sitemap-collapse-label]");
  const empty = document.querySelector("[data-sitemap-empty]");
  const emptyTitle = document.querySelector("[data-sitemap-empty-title]");
  const chips = [...document.querySelectorAll(".sitemap-chip")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /** Thai has no case, but menu labels mix in Latin names; compare on a normalised copy. */
  const normalise = (value) =>
    value.toLocaleLowerCase().replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - 0x0e50)).replace(/​/g, "").trim();

  const groups = [...grid.querySelectorAll("[data-sitemap-group]")].map((group) => {
    const branches = [...group.querySelectorAll("[data-sitemap-branch]")].map((branch) => {
      const title = branch.querySelector(".sitemap-branch__title [data-sitemap-label]");
      const items = [...branch.querySelectorAll("[data-sitemap-item]")].map((item) => {
        const label = item.querySelector("[data-sitemap-label]");
        return { element: item, label, text: label.textContent, haystack: normalise(label.textContent) };
      });
      return {
        element: branch,
        title,
        titleText: title ? title.textContent : "",
        titleHaystack: title ? normalise(title.textContent) : "",
        items,
      };
    });
    const title = group.querySelector("[data-sitemap-group-title] [data-sitemap-label]");
    return {
      element: group,
      id: group.id,
      title,
      titleText: title ? title.textContent : "",
      titleHaystack: title ? normalise(title.textContent) : "",
      body: group.querySelector("[data-sitemap-body]"),
      toggle: group.querySelector("[data-sitemap-section-toggle]"),
      branches,
    };
  });

  const total = groups.reduce((sum, group) => sum + group.branches.reduce((n, branch) => n + branch.items.length, 0), 0);

  /* ------------------------------------------------------------- collapsing */

  function setExpanded(group, expanded) {
    if (!group.toggle || !group.body) return;
    group.toggle.setAttribute("aria-expanded", String(expanded));
    group.element.classList.toggle("is-collapsed", !expanded);
    group.body.hidden = !expanded;
  }

  const isExpanded = (group) => group.toggle.getAttribute("aria-expanded") === "true";
  const allExpanded = () => groups.every((group) => group.element.hidden || isExpanded(group));

  function syncCollapseButton() {
    if (!collapseButton) return;
    const expanded = allExpanded();
    collapseButton.setAttribute("aria-pressed", String(!expanded));
    if (collapseLabel) collapseLabel.textContent = expanded ? t("sitemap.collapseAll") : t("sitemap.expandAll");
  }

  /* ---------------------------------------------------------------- filter */

  /** Rewrites a label so the matching run is wrapped in <mark>; restores plain text when there is no query. */
  function highlight(element, text, query) {
    const at = query ? normalise(text).indexOf(query) : -1;
    if (at === -1) {
      if (element.firstElementChild) element.textContent = text;
      return;
    }
    const mark = document.createElement("mark");
    mark.className = "sitemap-mark";
    mark.textContent = text.slice(at, at + query.length);
    element.replaceChildren(text.slice(0, at), mark, text.slice(at + query.length));
  }

  let lastCount = null;

  function apply(rawQuery) {
    const query = normalise(rawQuery);
    let visible = 0;

    for (const group of groups) {
      const groupMatch = query !== "" && group.titleHaystack.includes(query);
      let groupVisible = 0;

      for (const branch of group.branches) {
        const branchMatch = groupMatch || (query !== "" && branch.titleHaystack.includes(query));
        let branchVisible = 0;

        for (const item of branch.items) {
          const match = query === "" || branchMatch || item.haystack.includes(query);
          item.element.hidden = !match;
          if (match) branchVisible += 1;
          highlight(item.label, item.text, query);
        }

        branch.element.hidden = branchVisible === 0;
        if (branch.title) highlight(branch.title, branch.titleText, query);
        groupVisible += branchVisible;
      }

      group.element.hidden = groupVisible === 0;
      if (group.title) highlight(group.title, group.titleText, query);
      if (query !== "") {
        group.element.classList.add("is-revealed");
        setExpanded(group, true);
      }
      visible += groupVisible;
    }

    for (const chip of chips) {
      const target = document.getElementById(chip.getAttribute("href").slice(1));
      chip.hidden = Boolean(target && target.hidden);
    }

    countLine.textContent = query === "" ? t("sitemap.total", { total }) : t("sitemap.filtered", { count: visible, total });
    if (lastCount !== null && lastCount !== visible && !reducedMotion.matches) {
      countLine.classList.remove("is-changing");
      void countLine.offsetWidth;
      countLine.classList.add("is-changing");
    }
    lastCount = visible;

    if (clearButton) clearButton.hidden = rawQuery === "";
    if (keyHint) keyHint.hidden = rawQuery !== "";
    if (empty) {
      empty.hidden = visible !== 0;
      if (emptyTitle && visible === 0) emptyTitle.textContent = t("sitemap.noResults", { query: rawQuery });
    }
    if (collapseButton) collapseButton.disabled = visible === 0;
    syncCollapseButton();
  }

  /* ------------------------------------------------------------- behaviour */

  for (const group of groups) {
    if (!group.toggle) continue;
    group.toggle.addEventListener("click", () => {
      setExpanded(group, !isExpanded(group));
      syncCollapseButton();
    });
  }

  if (collapseButton) {
    collapseButton.hidden = false;
    collapseButton.addEventListener("click", () => {
      const collapse = allExpanded();
      for (const group of groups) setExpanded(group, !collapse);
      syncCollapseButton();
    });
  }

  if (input) {
    let pending = 0;
    input.addEventListener("input", () => {
      clearTimeout(pending);
      grid.classList.add("is-filtering");
      pending = setTimeout(() => {
        apply(input.value);
        grid.classList.remove("is-filtering");
      }, 90);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && input.value !== "") {
        event.stopPropagation();
        input.value = "";
        apply("");
      }
    });

    if (keyHint) keyHint.hidden = false;
    // "/" jumps to the filter, the way search fields behave on documentation sites.
    document.addEventListener("keydown", (event) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const active = document.activeElement;
      if (active && (active.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName))) return;
      event.preventDefault();
      input.focus();
      input.select();
    });
  }

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      input.value = "";
      apply("");
      input.focus();
    });
  }

  /** A jump link must land on an open section. */
  for (const chip of chips) {
    chip.addEventListener("click", () => {
      const group = groups.find((candidate) => candidate.id === chip.getAttribute("href").slice(1));
      if (group) {
        setExpanded(group, true);
        syncCollapseButton();
      }
    });
  }

  /* ------------------------------------------------- entrance and scroll-spy */

  if ("IntersectionObserver" in window && !reducedMotion.matches) {
    grid.classList.add("is-animated");
    const reveal = new IntersectionObserver(
      (entries, observer) => {
        const arriving = entries.filter((entry) => entry.isIntersecting);
        arriving.forEach((entry, index) => {
          entry.target.style.setProperty("--reveal-delay", `${Math.min(index, 6) * 60}ms`);
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    for (const group of groups) reveal.observe(group.element);
    // Safety net: nothing on this page may stay invisible because an observer never fired.
    setTimeout(() => {
      for (const group of groups) group.element.classList.add("is-revealed");
    }, 1500);
  }

  /* The chip for the section being read lights up. Cards flow down each column rather than across
     the page, so the marker is the visible card crossing the reading line, leftmost column first. */
  const chipFor = new Map(chips.map((chip) => [chip.getAttribute("href").slice(1), chip]));

  function updateCurrentChip() {
    const line = window.innerHeight * 0.3;
    let current = null;
    for (const group of groups) {
      if (group.element.hidden) continue;
      const box = group.element.getBoundingClientRect();
      if (box.top > line || box.bottom <= line) continue;
      if (!current || box.left < current.left) current = { id: group.id, left: box.left };
    }
    for (const chip of chips) chip.classList.toggle("is-current", Boolean(current) && chip === chipFor.get(current.id));
  }

  let spyPending = 0;
  addEventListener(
    "scroll",
    () => {
      clearTimeout(spyPending);
      spyPending = setTimeout(updateCurrentChip, 60);
    },
    { passive: true },
  );
  addEventListener("resize", updateCurrentChip, { passive: true });

  apply("");
})((window.ORST = window.ORST || {}));
