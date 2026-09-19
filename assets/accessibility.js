(() => {
  "use strict";

  const STORAGE_KEY = "hanpuli.readingPreferences.v1";
  const PREFERENCES = ["sans", "large", "spacing", "measure", "simple", "motion", "contrast"];
  const root = document.documentElement;
  root.classList.add("reading-js");

  function readPreferences() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function applyPreferences(preferences) {
    for (const name of PREFERENCES) {
      root.toggleAttribute(`data-reading-${name}`, preferences[name] === true);
    }
  }

  function savePreferences(preferences) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // The controls still work for this page when storage is unavailable.
    }
  }

  let preferences = readPreferences();
  applyPreferences(preferences);

  function syncControls() {
    for (const control of document.querySelectorAll("[data-reading-pref]")) {
      const name = control.dataset.readingPref;
      if (PREFERENCES.includes(name)) {
        control.checked = preferences[name] === true;
      }
    }
  }

  function initControls() {
    syncControls();

    for (const control of document.querySelectorAll("[data-reading-pref]")) {
      const name = control.dataset.readingPref;
      if (!PREFERENCES.includes(name)) continue;

      control.addEventListener("change", () => {
        preferences[name] = control.checked;
        applyPreferences(preferences);
        savePreferences(preferences);
      });
    }

    const reset = document.querySelector("[data-reading-reset]");
    if (reset) {
      reset.addEventListener("click", () => {
        preferences = {};
        applyPreferences(preferences);
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // No persistent storage to clear.
        }
        syncControls();
      });
    }

    const disclosure = document.querySelector(".reading-tools details");
    const summary = disclosure?.querySelector("summary");
    if (disclosure && summary) {
      disclosure.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !disclosure.open) return;
        disclosure.open = false;
        summary.focus();
        event.preventDefault();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initControls, { once: true });
  } else {
    initControls();
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    preferences = readPreferences();
    applyPreferences(preferences);
    if (document.readyState !== "loading") syncControls();
  });
})();
