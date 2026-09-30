/**
 * Homepage activity calendar in the style of a desktop calendar app: month, week and schedule views,
 * a mini month for jumping between dates, type filters and a detail card for each event.
 * Events come from the list the build rendered ([data-event]); without JavaScript that list stands alone.
 */
(function (ORST) {
  "use strict";

  const { runtime, t, digits } = ORST.i18n;
  const MAX_CHIPS = 2;
  const VIEW_KEY = "orst-calendar-view";
  const UPCOMING = 3;
  const PHONE = window.matchMedia("(max-width: 767px)");

  /* ------------------------------------------------------------------ dates */

  const pad = (value) => String(value).padStart(2, "0");
  const isoOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const parse = (iso) => {
    const [year, month, day] = iso.split("-").map(Number);
    return new Date(year, month - 1, day);
  };
  const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  const startOfWeek = (date) => addDays(date, -date.getDay());
  const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

  const format = (options) => new Intl.DateTimeFormat(runtime.locale, options);
  /** Bare day numbers follow the page language too (Thai numerals on Thai pages). */
  const dayNumber = (date) => digits(date.getDate());
  const monthTitle = format({ month: "long", year: "numeric" });
  const monthShort = format({ month: "short" });
  const dayMonth = format({ day: "numeric", month: "short" });
  const weekdayShort = format({ weekday: "short" });
  const weekdayNarrow = format({ weekday: runtime.lang === "th" ? "narrow" : "short" });
  const fullDate = format({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const rangeFormat = format({ day: "numeric", month: "short", year: "numeric" });

  const weekRange = (start) => {
    const end = addDays(start, 6);
    return typeof rangeFormat.formatRange === "function"
      ? rangeFormat.formatRange(start, end)
      : `${rangeFormat.format(start)} – ${rangeFormat.format(end)}`;
  };

  const timeText = (event) =>
    event.allDay ? t("calendar.allDay") : `${digits(event.start)}–${digits(event.end)}${t("calendar.timeUnit") ? ` ${t("calendar.timeUnit")}` : ""}`;

  function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  /* --------------------------------------------------------------- calendar */

  /* ---------------------------------------------------------- compact card */

  /**
   * The homepage card (data-cal-compact), like a desk calendar: a green date page (today, or the chosen day, with
   * its number of events) beside a small month grid where days with events are tinted in the event's colour.
   * Under them, the next few events; choosing a day lists that day's events by time instead, choosing it again
   * goes back. The arrows move the grid a month at a time.
   */
  function renderCompact(root, events, today) {
    const stage = root.querySelector("[data-cal-stage]");
    const sourceList = root.querySelector("[data-cal-source]");
    const monthShort = format({ month: "short" });
    const monthLong = format({ month: "long", year: "numeric" });
    const weekdayLong = format({ weekday: "long" });
    const weekdayNarrow = format({ weekday: runtime.lang === "th" ? "narrow" : "short" });
    const dayMonth = format({ day: "numeric", month: "long" });
    const fullDate = format({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const on = (iso) => events.filter((event) => event.iso === iso);
    const timeUnit = t("calendar.timeUnit") ? ` ${t("calendar.timeUnit")}` : "";

    let month = startOfMonth(parse(today));
    let selected = null;

    const panel = el("div", "gcal-c__panel");
    const head = el("div", "gcal-c__head");
    const title = el("h3", "gcal-c__title");
    title.setAttribute("aria-live", "polite");
    const arrow = (step, iconName, label) => {
      const button = el("button", "gcal-c__nav");
      button.type = "button";
      button.append(ORST.dom.icon(iconName), el("span", "visually-hidden", t(label)));
      button.addEventListener("click", () => {
        month = new Date(month.getFullYear(), month.getMonth() + step, 1);
        drawGrid();
      });
      return button;
    };
    head.append(title, arrow(-1, "i-chevron-left", "calendar.prevMonth"), arrow(1, "i-chevron-right", "calendar.nextMonth"));
    const grid = el("div", "gcal-c__grid");
    const listHead = el("div", "gcal-c__list-head");
    const list = el("ul", "gcal-up");

    const choose = (iso) => {
      selected = selected === iso ? null : iso;
      if (selected) month = startOfMonth(parse(selected));
      draw();
    };

    function drawPanel() {
      const iso = selected ?? today;
      const date = parse(iso);
      const count = on(iso).length;
      panel.replaceChildren(
        el("span", "gcal-c__panel-label", selected ? weekdayLong.format(date) : `${t("calendar.today")} · ${weekdayLong.format(date)}`),
        el("span", "gcal-c__panel-day", dayNumber(date)),
        el("span", "gcal-c__panel-month", monthLong.format(date)),
        el("span", "gcal-c__panel-count", count ? t("calendar.eventCount", { count: digits(count) }) : t("calendar.noneOnDay")),
      );
    }

    function drawGrid() {
      title.textContent = monthTitle.format(month);
      grid.replaceChildren();
      const start = startOfWeek(month);
      for (let i = 0; i < 7; i += 1) grid.append(el("span", "gcal-c__weekday", weekdayNarrow.format(addDays(start, i))));
      // Only the weeks this month touches (four to six rows), so the card keeps its height down.
      const cells = Math.ceil((month.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7;
      for (let i = 0; i < cells; i += 1) {
        const date = addDays(start, i);
        const iso = isoOf(date);
        if (date.getMonth() !== month.getMonth()) {
          grid.append(el("span", "gcal-c__day is-other"));
          continue;
        }
        const dayEvents = on(iso);
        const button = el("button", "gcal-c__day");
        button.type = "button";
        button.append(el("span", "gcal-c__num", dayNumber(date)));
        if (dayEvents.length) {
          button.classList.add("has-events");
          button.dataset.type = dayEvents[0].type;
          if (dayEvents.length > 1) button.append(el("span", "gcal-c__more", digits(dayEvents.length)));
        }
        button.classList.toggle("is-today", iso === today);
        button.classList.toggle("is-past", iso < today);
        button.setAttribute("aria-pressed", String(iso === selected));
        const count = dayEvents.length ? `, ${t("calendar.eventCount", { count: digits(dayEvents.length) })}` : "";
        button.setAttribute("aria-label", `${fullDate.format(date)}${count}`);
        button.addEventListener("click", () => choose(iso));
        grid.append(button);
      }
    }

    function row(event, byTime) {
      const date = parse(event.iso);
      const link = el("a", "gcal-up__item");
      link.href = event.href;
      link.dataset.type = event.type;
      let lead;
      if (byTime) {
        lead = el("span", "gcal-up__time");
        if (event.allDay) lead.append(el("span", "gcal-up__start", t("calendar.allDay")));
        else lead.append(el("span", "gcal-up__start", digits(event.start)), el("span", "gcal-up__end", `– ${digits(event.end)}${timeUnit}`));
      } else {
        lead = el("span", "gcal-up__date");
        lead.append(el("span", "gcal-up__day", dayNumber(date)), el("span", "gcal-up__month", monthShort.format(date)));
      }
      const meta = el("span", "gcal-up__meta");
      const when = event.allDay ? t("calendar.allDay") : `${digits(event.start)}–${digits(event.end)}${timeUnit}`;
      if (!byTime) meta.append(ORST.dom.icon("i-calendar"), el("span", "", `${weekdayLong.format(date)} ${when}`));
      if (event.place) meta.append(ORST.dom.icon("i-pin"), el("span", "", event.place));
      const kind = el("span", "gcal-up__type", event.typeLabel);
      if (event.iso < today) kind.append(el("span", "gcal-up__past", t("calendar.past")));
      const body = el("span", "gcal-up__body");
      body.append(kind, el("span", "gcal-up__title", event.title), meta);
      link.append(lead, body, ORST.dom.icon("i-arrow-right", "icon gcal-up__go"));
      const item = el("li");
      item.append(link);
      return item;
    }

    function drawList() {
      let shown;
      listHead.replaceChildren();
      if (selected) {
        shown = on(selected);
        listHead.append(el("p", "gcal-c__list-title", t("calendar.onDay", { date: dayMonth.format(parse(selected)) })));
        const back = el("button", "gcal-c__back", t("calendar.backToUpcoming"));
        back.type = "button";
        back.addEventListener("click", () => choose(selected));
        listHead.append(back);
      } else {
        const next = events.filter((event) => event.iso >= today);
        shown = (next.length ? next : events.slice(-UPCOMING)).slice(0, UPCOMING);
        listHead.append(el("p", "gcal-c__list-title", t(next.length ? "calendar.upcoming" : "calendar.recent")));
      }
      list.replaceChildren(...(shown.length ? shown.map((event) => row(event, Boolean(selected))) : [el("li", "gcal-c__none", t("calendar.noneOnDay"))]));
    }

    function draw() {
      drawPanel();
      drawGrid();
      drawList();
    }

    const month_ = el("div", "gcal-c__month");
    month_.append(head, grid);
    const top = el("div", "gcal-c__top");
    top.append(panel, month_);
    const bottom = el("div", "gcal-c__bottom");
    bottom.append(listHead, list);
    draw();
    stage.replaceChildren(top, bottom);
    stage.hidden = false;
    sourceList.hidden = true;
    root.classList.add("is-enhanced");
  }

  function initCalendar(root) {
    const toolbar = root.querySelector("[data-cal-toolbar]");
    const side = root.querySelector("[data-cal-side]");
    const stage = root.querySelector("[data-cal-stage]");
    const sourceList = root.querySelector("[data-cal-source]");
    const title = root.querySelector("[data-cal-title]");
    const mini = root.querySelector("[data-cal-mini]");
    const popover = root.querySelector("[data-cal-popover]");
    const viewButtons = [...root.querySelectorAll("[data-cal-view]")];
    const filterInputs = [...root.querySelectorAll("[data-cal-filter]")];
    if (!stage || !sourceList) return;

    const events = [...sourceList.querySelectorAll("[data-event]")]
      .map((item, index) => {
        const link = item.querySelector("[data-event-title]");
        return {
          id: String(index),
          iso: item.dataset.date,
          start: item.dataset.start,
          allDay: !item.dataset.start,
          end: item.dataset.end,
          type: item.dataset.type,
          typeLabel: item.querySelector("[data-event-type]")?.textContent.trim() ?? "",
          title: link.textContent.trim(),
          href: link.getAttribute("href"),
          place: item.querySelector("[data-event-place]")?.textContent.trim() ?? "",
        };
      })
      .sort((a, b) => (a.iso + a.start).localeCompare(b.iso + b.start));
    const byId = new Map(events.map((event) => [event.id, event]));

    const today = isoOf(new Date());
    if (root.hasAttribute("data-cal-compact")) {
      renderCompact(root, events, today);
      return;
    }
    if (!toolbar) return;
    let cursor = parse(today);
    let selected = today;
    let miniMonth = startOfMonth(cursor);
    let view = readView();
    const hiddenTypes = new Set();
    let lastAnchor = null;

    toolbar.hidden = false;
    side.hidden = false;
    stage.hidden = false;
    sourceList.hidden = true;
    root.classList.add("is-enhanced");

    function readView() {
      if (PHONE.matches) return "agenda";
      try {
        const saved = localStorage.getItem(VIEW_KEY);
        return ["month", "week", "agenda"].includes(saved) ? saved : "month";
      } catch (error) {
        return "month";
      }
    }

    const visibleEvents = () => events.filter((event) => !hiddenTypes.has(event.type));
    const eventsOn = (iso) => visibleEvents().filter((event) => event.iso === iso);

    /* ---- pieces shared by the views ---- */

    function chip(event, className = "gcal-chip") {
      const button = el("button", className);
      button.type = "button";
      button.dataset.type = event.type;
      button.dataset.eventId = event.id;
      button.append(el("span", `${className}__time`, event.allDay ? t("calendar.allDay") : digits(event.start)), el("span", `${className}__title`, event.title));
      button.setAttribute("aria-label", `${event.title}, ${fullDate.format(parse(event.iso))}, ${timeText(event)}`);
      return button;
    }

    function dateButton(date, className, label) {
      const button = el("button", className, label);
      button.type = "button";
      button.dataset.gotoDate = isoOf(date);
      button.setAttribute("aria-label", fullDate.format(date));
      return button;
    }

    /* ---- month ---- */

    function renderMonth() {
      const first = startOfMonth(cursor);
      const start = startOfWeek(first);
      const weeks = Math.ceil((first.getDay() + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7);

      const grid = el("div", "gcal-month");
      const head = el("div", "gcal-month__head");
      for (let i = 0; i < 7; i += 1) {
        const cell = el("span", "gcal-month__weekday");
        cell.append(el("span", "gcal-month__wd-long", weekdayShort.format(addDays(start, i))), el("span", "gcal-month__wd-short", weekdayNarrow.format(addDays(start, i))));
        head.append(cell);
      }
      grid.append(head);

      const body = el("div", "gcal-month__weeks");
      body.style.setProperty("--weeks", String(weeks));
      for (let i = 0; i < weeks * 7; i += 1) {
        const date = addDays(start, i);
        const iso = isoOf(date);
        const cell = el("div", "gcal-month__cell");
        cell.classList.toggle("is-other", date.getMonth() !== first.getMonth());
        cell.classList.toggle("is-today", iso === today);
        cell.classList.toggle("is-selected", iso === selected);
        const label = date.getDate() === 1 ? dayMonth.format(date) : dayNumber(date);
        const number = dateButton(date, "gcal-month__date", label);
        number.tabIndex = -1;
        cell.append(number);

        const dayEvents = eventsOn(iso);
        if (dayEvents.length) {
          const list = el("ul", "gcal-month__events");
          dayEvents.slice(0, MAX_CHIPS).forEach((event) => {
            const item = el("li");
            item.append(chip(event));
            list.append(item);
          });
          if (dayEvents.length > MAX_CHIPS) {
            const more = dateButton(date, "gcal-month__more", t("calendar.more", { count: dayEvents.length - MAX_CHIPS }));
            more.dataset.gotoView = "week";
            const item = el("li");
            item.append(more);
            list.append(item);
          }
          cell.append(list);
        }
        body.append(cell);
      }
      grid.append(body);
      return grid;
    }

    /* ---- week ---- */

    function renderWeek() {
      const start = startOfWeek(cursor);
      const week = el("div", "gcal-week");
      for (let i = 0; i < 7; i += 1) {
        const date = addDays(start, i);
        const iso = isoOf(date);
        const column = el("div", "gcal-week__day");
        column.classList.toggle("is-today", iso === today);
        column.classList.toggle("is-selected", iso === selected);
        const head = dateButton(date, "gcal-week__head");
        head.append(el("span", "gcal-week__weekday", weekdayShort.format(date)), el("span", "gcal-week__num", dayNumber(date)));
        column.append(head);

        const dayEvents = eventsOn(iso);
        const list = el("ul", "gcal-week__events");
        dayEvents.forEach((event) => {
          const item = el("li");
          const card = chip(event, "gcal-card");
          card.append(el("span", "gcal-card__place", event.place));
          item.append(card);
          list.append(item);
        });
        column.append(list);
        week.append(column);
      }
      return week;
    }

    /* ---- schedule ---- */

    function renderAgenda() {
      const first = startOfMonth(cursor);
      const next = new Date(first.getFullYear(), first.getMonth() + 1, 1);
      const inMonth = visibleEvents().filter((event) => {
        const date = parse(event.iso);
        return date >= first && date < next;
      });
      if (!inMonth.length) return el("p", "gcal-empty", t("calendar.empty"));

      const list = el("ol", "gcal-agenda");
      const days = [...new Set(inMonth.map((event) => event.iso))];
      for (const iso of days) {
        const date = parse(iso);
        const day = el("li", "gcal-agenda__day");
        day.classList.toggle("is-today", iso === today);
        day.classList.toggle("is-past", iso < today);
        const stamp = el("p", "gcal-agenda__date");
        stamp.append(el("span", "gcal-agenda__num", dayNumber(date)), el("span", "gcal-agenda__wd", `${monthShort.format(date)} · ${weekdayShort.format(date)}`));
        day.append(stamp);

        const items = el("ul", "gcal-agenda__items");
        inMonth
          .filter((event) => event.iso === iso)
          .forEach((event) => {
            const item = el("li");
            const button = chip(event, "gcal-row");
            button.querySelector(".gcal-row__time").textContent = timeText(event);
            button.append(el("span", "gcal-row__place", event.place));
            item.append(button);
            items.append(item);
          });
        day.append(items);
        list.append(day);
      }
      return list;
    }

    /* ---- mini month ---- */

    function renderMini() {
      mini.replaceChildren();
      const head = el("div", "gcal-mini__head");
      const prev = el("button", "gcal-mini__nav");
      prev.type = "button";
      prev.dataset.miniStep = "-1";
      prev.append(ORST.dom.icon("i-chevron-left"), el("span", "visually-hidden", t("calendar.prevMonth")));
      const next = el("button", "gcal-mini__nav");
      next.type = "button";
      next.dataset.miniStep = "1";
      next.append(ORST.dom.icon("i-chevron-right"), el("span", "visually-hidden", t("calendar.nextMonth")));
      head.append(el("p", "gcal-mini__title", monthTitle.format(miniMonth)), prev, next);
      mini.append(head);

      const grid = el("div", "gcal-mini__grid");
      const start = startOfWeek(miniMonth);
      for (let i = 0; i < 7; i += 1) grid.append(el("span", "gcal-mini__weekday", weekdayNarrow.format(addDays(start, i))));
      for (let i = 0; i < 42; i += 1) {
        const date = addDays(start, i);
        const iso = isoOf(date);
        const button = dateButton(date, "gcal-mini__day", dayNumber(date));
        button.classList.toggle("is-other", date.getMonth() !== miniMonth.getMonth());
        button.classList.toggle("is-today", iso === today);
        button.classList.toggle("is-selected", iso === selected);
        button.classList.toggle("has-events", eventsOn(iso).length > 0);
        grid.append(button);
      }
      mini.append(grid);
    }

    /* ---- render all ---- */

    function render({ direction = 0 } = {}) {
      title.textContent = view === "week" ? weekRange(startOfWeek(cursor)) : monthTitle.format(cursor);
      viewButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.calView === view)));
      root.dataset.view = view;

      const content = view === "week" ? renderWeek() : view === "agenda" ? renderAgenda() : renderMonth();
      stage.replaceChildren(content);
      stage.dataset.direction = direction < 0 ? "back" : direction > 0 ? "forward" : "none";
      stage.classList.remove("is-entering");
      void stage.offsetWidth;
      stage.classList.add("is-entering");

      renderMini();
    }

    function step(direction) {
      if (view === "week") cursor = addDays(cursor, direction * 7);
      else cursor = new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1);
      miniMonth = startOfMonth(cursor);
      closePopover();
      render({ direction });
    }

    function goTo(iso, nextView) {
      selected = iso;
      cursor = parse(iso);
      miniMonth = startOfMonth(cursor);
      if (nextView) setView(nextView, { quiet: true });
      closePopover();
      render();
    }

    function setView(next, { quiet = false } = {}) {
      view = next;
      try {
        localStorage.setItem(VIEW_KEY, view);
      } catch (error) {
        /* The choice lasts for this page view only. */
      }
      if (!quiet) {
        closePopover();
        render();
      }
    }

    /* ---- detail card ---- */

    function openPopover(event, anchor) {
      lastAnchor = anchor;
      popover.dataset.type = event.type;
      popover.querySelector("[data-pop-type]").textContent = event.typeLabel;
      popover.querySelector("[data-pop-title]").textContent = event.title;
      popover.querySelector("[data-pop-date]").textContent = `${fullDate.format(parse(event.iso))} · ${timeText(event)}`;
      popover.querySelector("[data-pop-place]").textContent = event.place;
      popover.querySelector("[data-pop-link]").href = event.href;
      popover.hidden = false;

      // Beside the event on wide screens; a bottom sheet on phones (see home.css).
      const box = root.getBoundingClientRect();
      const spot = anchor.getBoundingClientRect();
      const width = popover.offsetWidth;
      const height = popover.offsetHeight;
      let left = spot.left - box.left;
      left = Math.max(8, Math.min(left, box.width - width - 8));
      let top = spot.bottom - box.top + 8;
      if (spot.bottom + height + 16 > window.innerHeight) top = spot.top - box.top - height - 8;
      popover.style.left = `${left}px`;
      popover.style.top = `${Math.max(8, top)}px`;
      popover.classList.remove("is-open");
      void popover.offsetWidth;
      popover.classList.add("is-open");
      popover.querySelector("[data-cal-popover-close]").focus();
    }

    function closePopover({ restoreFocus = false } = {}) {
      if (popover.hidden) return;
      popover.hidden = true;
      popover.classList.remove("is-open");
      if (restoreFocus && lastAnchor?.isConnected) lastAnchor.focus();
    }

    /* ---- events ---- */

    root.addEventListener("click", (event) => {
      const target = event.target;
      const eventButton = target.closest("[data-event-id]");
      if (eventButton) {
        openPopover(byId.get(eventButton.dataset.eventId), eventButton);
        return;
      }
      const dateTarget = target.closest("[data-goto-date]");
      if (dateTarget) {
        const inMini = Boolean(dateTarget.closest("[data-cal-mini]"));
        goTo(dateTarget.dataset.gotoDate, dateTarget.dataset.gotoView ?? (inMini || view === "agenda" ? null : "week"));
        return;
      }
      const miniStep = target.closest("[data-mini-step]");
      if (miniStep) {
        miniMonth = new Date(miniMonth.getFullYear(), miniMonth.getMonth() + Number(miniStep.dataset.miniStep), 1);
        renderMini();
        return;
      }
      if (target.closest("[data-cal-popover-close]")) {
        closePopover({ restoreFocus: true });
        return;
      }
      if (!popover.hidden && !target.closest("[data-cal-popover]")) closePopover();
    });

    document.addEventListener("click", (event) => {
      if (!root.contains(event.target)) closePopover();
    });

    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !popover.hidden) {
        event.stopPropagation();
        closePopover({ restoreFocus: true });
      }
    });

    root.querySelector("[data-cal-prev]").addEventListener("click", () => step(-1));
    root.querySelector("[data-cal-next]").addEventListener("click", () => step(1));
    root.querySelector("[data-cal-today]").addEventListener("click", () => goTo(today));
    viewButtons.forEach((button) => button.addEventListener("click", () => setView(button.dataset.calView)));
    filterInputs.forEach((input) =>
      input.addEventListener("change", () => {
        if (input.checked) hiddenTypes.delete(input.value);
        else hiddenTypes.add(input.value);
        closePopover();
        render();
      }),
    );

    render();
  }

  document.querySelectorAll("[data-calendar]").forEach((root) => {
    try {
      initCalendar(root);
    } catch (error) {
      console.error("[ORST] calendar failed to initialise", error);
    }
  });
})((window.ORST = window.ORST || {}));
