/**
 * Boots the core modules. Each module is isolated so one failure cannot disable the rest.
 * Page-specific scripts (ai.js, collection.js) load after this bundle and start themselves.
 */
(function (ORST) {
  "use strict";

  const modules = [
    ["language links", () => ORST.i18n.initLanguageLinks()],
    ["accessibility", () => ORST.accessibility.init()],
    ["components", () => ORST.components.init()],
    ["navigation", () => ORST.navigation.init()],
    ["search", () => ORST.search.init()],
    ["cookie consent", () => ORST.consent.init()],
  ];

  for (const [name, start] of modules) {
    try {
      start();
    } catch (error) {
      console.error(`[ORST] ${name} failed to initialise`, error);
    }
  }
})((window.ORST = window.ORST || {}));
