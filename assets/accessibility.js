(() => {
  "use strict";

  const STORAGE_KEY = "hanpuli.readingPreferences.v1";
  const PREFERENCES = ["sans", "dyslexia", "large", "spacing", "measure", "simple", "motion", "contrast"];
  const root = document.documentElement;
  root.classList.add("reading-js");

  function readPreferences() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (!parsed || typeof parsed !== "object") return {};
      if (parsed.dyslexia === true) parsed.sans = false;
      return parsed;
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

  function initAnchorAlignment() {
    const home = document.body.classList.contains("site-home");
    const header = document.querySelector(home ? ".masthead" : ".page-topbar");
    if (!header) return;

    const property = home ? "--home-anchor-offset" : "--page-anchor-offset";
    const minimumOffset = home ? 20 : 84;
    const updateOffset = () => {
      const sticky = getComputedStyle(header).position === "sticky";
      const offset = sticky ? header.getBoundingClientRect().height + 12 : minimumOffset;
      root.style.setProperty(property, `${Math.ceil(offset)}px`);
    };

    updateOffset();
    if ("ResizeObserver" in window) {
      new ResizeObserver(updateOffset).observe(header);
    } else {
      window.addEventListener("resize", updateOffset, { passive: true });
    }

    let navigationTimer = 0;
    let fallbackTimer = 0;
    let generation = 0;
    let pending = null;

    function cancelPending() {
      generation += 1;
      window.clearTimeout(fallbackTimer);
      pending?.abort();
      pending = null;
    }

    function alignCurrentHash() {
      const hash = window.location.hash;
      if (!hash || hash.length < 2) return;

      let targetId;
      try {
        targetId = decodeURIComponent(hash.slice(1));
      } catch {
        return;
      }

      const target = document.getElementById(targetId);
      if (!target) return;
      if (home && !target.matches("main > section:not(.hero)")) return;

      cancelPending();
      const currentGeneration = generation;
      const controller = new AbortController();
      pending = controller;
      let settled = false;

      const settle = () => {
        if (settled || currentGeneration !== generation) return;
        settled = true;
        window.clearTimeout(fallbackTimer);
        Promise.resolve(document.fonts?.ready).then(() => {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (currentGeneration !== generation || hash !== window.location.hash) return;
            updateOffset();
            const margin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
            const maximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            const desired = Math.min(maximum, Math.max(0, window.scrollY + target.getBoundingClientRect().top - margin));
            if (Math.abs(desired - window.scrollY) < 2) return;

            const previousBehavior = root.style.scrollBehavior;
            root.style.scrollBehavior = "auto";
            window.scrollTo(window.scrollX, desired);
            requestAnimationFrame(() => {
              if (previousBehavior) root.style.scrollBehavior = previousBehavior;
              else root.style.removeProperty("scroll-behavior");
            });
          }));
        });
      };

      if ("onscrollend" in window) {
        window.addEventListener("scrollend", settle, { once: true, signal: controller.signal });
      }
      fallbackTimer = window.setTimeout(settle, 1400);
    }

    function scheduleAlignment() {
      window.clearTimeout(navigationTimer);
      navigationTimer = window.setTimeout(alignCurrentHash, 0);
    }

    window.addEventListener("hashchange", scheduleAlignment);
    document.addEventListener("click", (event) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!link || !link.closest(home ? ".section-nav" : ".page-nav")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.pathname === window.location.pathname && destination.hash) scheduleAlignment();
    });
    document.addEventListener("wheel", cancelPending, { passive: true });
    document.addEventListener("touchstart", cancelPending, { passive: true });
    document.addEventListener("keydown", (event) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) {
        cancelPending();
      }
    });

    if (window.location.hash) scheduleAlignment();
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
    initAnchorAlignment();

    for (const control of document.querySelectorAll("[data-reading-pref]")) {
      const name = control.dataset.readingPref;
      if (!PREFERENCES.includes(name)) continue;

      control.addEventListener("change", () => {
        preferences[name] = control.checked;
        if (control.checked && (name === "sans" || name === "dyslexia")) {
          preferences[name === "sans" ? "dyslexia" : "sans"] = false;
          syncControls();
        }
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
      document.addEventListener("click", (event) => {
        if (disclosure.open && !disclosure.contains(event.target)) {
          disclosure.open = false;
        }
      });
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
