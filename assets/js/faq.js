/**
 * Homepage FAQ: on wide screens the questions form a list on the left and the chosen answer shows on the right
 * (one answer always open); on narrow screens they work as an accordion under each question. Up/Down arrows move
 * between questions. A list marked data-faq-accordion stays an accordion at every width (it sits in half a row).
 * Without JavaScript every question shows with its answer.
 */
(function () {
  "use strict";

  const wide = window.matchMedia("(min-width: 1024px)");

  function initFaq(root) {
    const items = [...root.querySelectorAll("[data-faq-item]")].map((item) => ({
      trigger: item.querySelector(".faq-item__q"),
      panel: item.querySelector(".faq-item__panel"),
    }));
    if (!items.length) return;
    const accordion = root.hasAttribute("data-faq-accordion");
    const beside = () => !accordion && wide.matches;

    function open(index) {
      items.forEach(({ trigger, panel }, i) => {
        trigger.setAttribute("aria-expanded", String(i === index));
        panel.hidden = i !== index;
      });
    }

    items.forEach(({ trigger }, i) => {
      trigger.addEventListener("click", () => {
        const isOpen = trigger.getAttribute("aria-expanded") === "true";
        // Beside the list an answer always shows; in the accordion a second tap closes it.
        open(isOpen && !beside() ? -1 : i);
      });
      trigger.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const next = items[(i + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].trigger;
        next.focus();
      });
    });

    wide.addEventListener("change", () => {
      if (beside() && !items.some(({ trigger }) => trigger.getAttribute("aria-expanded") === "true")) open(0);
    });

    open(0);
    root.classList.add("is-ready");
  }

  document.querySelectorAll("[data-faq]").forEach((root) => {
    try {
      initFaq(root);
    } catch (error) {
      console.error("[ORST] FAQ failed to initialise", error);
    }
  });
})();
