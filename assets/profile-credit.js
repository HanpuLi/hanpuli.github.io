(() => {
  const endpoint = "https://hanpuli-geo-proxy.striped-file.workers.dev/api/profile-credit";
  const fontEndpoint = "https://hanpuli-geo-proxy.striped-file.workers.dev/api/profile-credit-font";

  const localeMatch = location.pathname.match(/^\/(zh-hans|zh|ja|de|fr|ru)(?=\/|$)/);
  const locale = localeMatch ? localeMatch[1] : "en";
  const chronology = document.querySelector(".chronology");
  if (!chronology) return;

  function ensureSimplifiedChineseProfileFont() {
    if (locale !== "zh-hans") return;
    if (document.querySelector("style[data-profile-credit-font]")) return;

    const style = document.createElement("style");
    style.dataset.profileCreditFont = "";
    style.textContent = `
      @font-face {
        font-family: "Noto Serif SC Profile";
        src: url("${fontEndpoint}") format("woff2");
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        unicode-range: U+4EAC,U+534F,U+6025,U+613F,U+6B66,U+6C49;
      }
      .locale-zh-hans [data-conditional-profile-credit] p {
        font-family: "EB Garamond", "Site Serif Symbols", Georgia,
          "Noto Serif SC Profile", "Noto Serif SC Site",
          "Songti SC", "Noto Serif CJK SC", serif;
      }
    `;
    document.head.append(style);
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);

  fetch(`${endpoint}?lang=${encodeURIComponent(locale)}`, {
    method: "GET",
    mode: "cors",
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: controller.signal,
  })
    .then((response) => {
      if (response.status === 204) return null;
      if (!response.ok) throw new Error(`profile credit request failed: ${response.status}`);
      return response.json();
    })
    .then((credit) => {
      if (!credit || typeof credit.time !== "string" || typeof credit.text !== "string") return;
      if (chronology.querySelector('[data-conditional-profile-credit]')) return;

      ensureSimplifiedChineseProfileFont();

      const row = document.createElement("div");
      row.className = "credit";
      row.dataset.conditionalProfileCredit = "";

      const time = document.createElement("time");
      time.textContent = credit.time;
      const copy = document.createElement("p");
      copy.textContent = credit.text;
      row.append(time, copy);

      const rows = Array.from(chronology.querySelectorAll(":scope > .credit"));
      const next = rows.find((item) => item.querySelector("time")?.textContent?.trim() === "2024");
      if (next) chronology.insertBefore(row, next);
      else chronology.append(row);
    })
    .catch(() => {
      // Fail closed: if geolocation cannot be established or the Worker is unreachable,
      // the conditional biographical credit remains absent.
    })
    .finally(() => window.clearTimeout(timeout));
})();
