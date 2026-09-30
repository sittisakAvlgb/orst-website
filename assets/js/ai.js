/**
 * ORST Knowledge AI page.
 *
 * Every answer keeps official Royal Society information visually and structurally separate
 * from AI-generated explanation, and lists its sources. The current adapter answers from
 * curated sample answers and the search index; a real service must return the same shape:
 * { summary, official: { term?, termSource?, text?, source? } | null, explanation, related[], sources[] }.
 */
(function (ORST) {
  "use strict";

  const app = document.querySelector("[data-ai-app]");
  if (!app) return;

  const { t, localize, pageUrl, runtime } = ORST.i18n;
  const dom = ORST.dom;
  const service = ORST.searchService;

  const form = app.querySelector("[data-ai-form]");
  const input = app.querySelector("[data-ai-input]");
  const submit = app.querySelector("[data-ai-submit]");
  const error = app.querySelector("[data-ai-error]");
  const status = app.querySelector("[data-ai-status]");
  const thread = app.querySelector("[data-ai-thread]");

  const THINKING_TIME = 700;
  const isExternal = (link) => Boolean(link && (link.external || link.href));

  /* ------------------------------------------------------------ Answer source */

  function answerFromRecord(record, question) {
    const type = t(`search.types.${record.type}`);
    const term = localize(record.title);
    return {
      summary: t("ai.recordSummary", { type, term, answer: localize(record.answer) }),
      official: { term: record.answer, termSource: record.title, source: record.source },
      explanation: t("ai.recordExplanation"),
      related: [
        { title: t("ai.searchRelated", { query: term }), link: { page: "search", params: { q: term } } },
        { title: type, link: { page: record.type } },
      ],
      sources: [{ title: record.source, meta: t("search.types." + record.type), link: record.link }],
      question,
    };
  }

  function fallbackAnswer(question) {
    return {
      summary: t("ai.fallbackSummary"),
      official: null,
      explanation: t("ai.fallbackExplanation"),
      related: [{ title: t("ai.searchRelated", { query: question }), link: { page: "search", params: { q: question } } }],
      sources: [],
    };
  }

  async function findAnswer(question) {
    await Promise.all([service.simulateNetwork(), new Promise((resolve) => window.setTimeout(resolve, THINKING_TIME))]);
    const data = await service.loadDataset();
    const text = service.normalize(question);
    const curated = data.ai.find((answer) => answer.match.some((term) => service.mentions(text, service.normalize(term))));
    if (curated) return curated;
    const record = await service.findMentioned(question);
    return record ? answerFromRecord(record, question) : fallbackAnswer(question);
  }

  /* ---------------------------------------------------------------- Rendering */

  function renderOfficial(view, official) {
    if (!official) {
      dom.slot(view, "official-section").remove();
      dom.slot(view, "no-official-section").hidden = false;
      return;
    }

    const term = dom.slot(view, "official-term");
    if (official.term) {
      term.replaceChildren(dom.create("span", "", localize(official.term)));
      if (official.termSource) {
        const source = dom.create("span", "answer-block__term-source", localize(official.termSource));
        source.lang = "en";
        term.append(" ", source);
      }
    } else {
      term.remove();
    }

    if (official.text) dom.setText(view, "official-text", localize(official.text));
    else dom.slot(view, "official-text").remove();

    if (official.source) dom.setText(view, "official-source", t("search.sourceLabel", { source: localize(official.source) }));
    else dom.slot(view, "official-source").remove();

    if (!runtime.demoData) dom.slot(view, "sample").remove();
  }

  function renderList(view, name, entries, templateName, fill) {
    const section = dom.slot(view, `${name}-section`);
    if (!entries?.length) {
      section.remove();
      return;
    }
    const list = dom.slot(view, name);
    for (const entry of entries) {
      const item = dom.template(templateName);
      fill(item, entry);
      list.append(item);
    }
  }

  function renderAnswer(answer, question) {
    const view = dom.template("ai-answer");
    dom.setText(view, "question", question);
    dom.setText(view, "summary", localize(answer.summary));
    renderOfficial(view, answer.official);
    dom.setText(view, "explanation", localize(answer.explanation));

    renderList(view, "related", answer.related, "ai-related", (item, entry) => {
      dom.slot(item, "link").href = service.resolveLink(entry.link);
      dom.setText(item, "title", localize(entry.title));
    });

    renderList(view, "sources", answer.sources, "ai-source", (item, entry) => {
      dom.setText(item, "title", localize(entry.title));
      dom.setText(item, "meta", localize(entry.meta));
      const link = dom.slot(item, "link");
      link.href = service.resolveLink(entry.link);
      if (!isExternal(entry.link)) {
        link.removeAttribute("rel");
        link.querySelector(".icon")?.remove();
        link.querySelector(".visually-hidden")?.remove();
      }
    });

    view.querySelector("[data-feedback-group]").addEventListener("click", (event) => {
      const button = event.target.closest("[data-feedback]");
      if (!button) return;
      for (const option of view.querySelectorAll("[data-feedback]")) {
        option.setAttribute("aria-pressed", String(option === button));
      }
      ORST.toast.show(t("ai.feedbackThanks"));
    });

    return view;
  }

  /* --------------------------------------------------------------------- Flow */

  function setInvalid(invalid) {
    error.hidden = !invalid;
    input.setAttribute("aria-invalid", String(invalid));
    input.setAttribute("aria-describedby", invalid ? "ai-hint ai-error" : "ai-hint");
  }

  async function ask(question) {
    const loading = dom.template("ai-loading");
    dom.setText(loading, "question", question);
    thread.prepend(loading);
    loading.scrollIntoView({ block: "nearest", behavior: ORST.accessibility.prefersReducedMotion() ? "auto" : "smooth" });
    status.textContent = t("ai.status.loading");
    submit.setAttribute("aria-busy", "true");

    try {
      const answer = await findAnswer(question);
      loading.replaceWith(renderAnswer(answer, question));
      status.textContent = t("ai.status.done");
    } catch (failure) {
      const view = dom.template("ai-error");
      dom.setText(view, "question", question);
      view.querySelector("[data-action='retry']").addEventListener("click", () => {
        view.remove();
        ask(question);
      });
      loading.replaceWith(view);
      status.textContent = t("ai.status.error");
    } finally {
      submit.removeAttribute("aria-busy");
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) {
      setInvalid(true);
      input.focus();
      return;
    }
    setInvalid(false);
    input.value = "";
    ask(question);
  });

  // Enter sends; Shift+Enter adds a new line.
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  input.addEventListener("input", () => {
    if (input.value.trim()) setInvalid(false);
  });

  app.addEventListener("click", (event) => {
    const example = event.target.closest("[data-ai-example]");
    if (!example) return;
    setInvalid(false);
    ask(t(`ai.examples.${example.dataset.aiExample}`));
  });

  const params = new URLSearchParams(location.search);
  const example = params.get("example");
  const initialQuestion = example ? t(`ai.examples.${example}`) : params.get("q");
  if (initialQuestion && !initialQuestion.startsWith("ai.examples.")) ask(initialQuestion.trim());
})((window.ORST = window.ORST || {}));
