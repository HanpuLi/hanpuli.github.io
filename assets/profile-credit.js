(() => {
  const endpoint = "https://hanpuli-geo-proxy.striped-file.workers.dev/api/profile-credit";
  const fontEndpoint = "https://hanpuli-geo-proxy.striped-file.workers.dev/api/profile-credit-font";

  const localeMatch = location.pathname.match(/^\/(zh-hans|zh|ja|de|fr|ru)(?=\/|$)/);
  const locale = localeMatch ? localeMatch[1] : "en";

  function restoreStructuredData(altName) {
    if (typeof altName !== "string" || !altName) return;
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(script.textContent || "");
        const graph = Array.isArray(data?.["@graph"]) ? data["@graph"] : [];
        const person = graph.find((node) => node?.["@type"] === "Person");
        if (!person) continue;
        const names = Array.isArray(person.alternateName) ? person.alternateName : [];
        if (!names.includes(altName)) names.push(altName);
        person.alternateName = names;
        script.textContent = JSON.stringify(data);
      } catch {
        // Ignore unrelated or malformed structured-data blocks.
      }
    }
  }

  async function ensureSimplifiedChineseRegionalFont() {
    if (locale !== "zh-hans") return;
    if (!document.querySelector("style[data-profile-credit-font]")) {
      const style = document.createElement("style");
      style.dataset.profileCreditFont = "";
      style.textContent = `
        @font-face {
          font-family: "Noto Serif SC Profile";
          src: url("${fontEndpoint}") format("woff2");
          font-style: normal;
          font-weight: 400;
          font-display: swap;
        }
        .locale-zh-hans [data-regional-identity],
        .locale-zh-hans [data-conditional-profile-credit],
        .locale-zh-hans #quality .about-section-copy > p:first-child {
          font-family: "EB Garamond", "Site Serif Symbols", Georgia,
            "Noto Serif SC Profile", "Noto Serif SC Site",
            "Songti SC", "Noto Serif CJK SC", serif;
        }
      `;
      document.head.append(style);
    }
    if (document.fonts?.load) {
      await document.fonts.load(
        '16px "Noto Serif SC Profile"',
        "\u4eac\u534f\u6025\u613f\u6b66\u6c49",
      );
    }
  }

  function restoreHome(data) {
    const heroId = document.querySelector(".hero-id");
    if (heroId && data.alias && !heroId.querySelector("[data-regional-alias]")) {
      const alias = document.createElement("p");
      alias.dataset.regionalAlias = "";
      alias.dataset.regionalIdentity = "";
      alias.textContent = data.alias;
      const chinese = heroId.querySelector('p[lang="zh-Hant-HK"]');
      if (chinese) chinese.insertAdjacentElement("afterend", alias);
      else heroId.prepend(alias);
    }

    const educationSlot = heroId?.querySelector("template[data-regional-education]");
    if (educationSlot && typeof data.education === "string" && data.education) {
      const education = document.createElement("p");
      education.dataset.regionalEducation = "";
      education.textContent = data.education;
      educationSlot.replaceWith(education);
    }

    if (data.ledeNote) {
      const lede = document.querySelector(".hero-copy .zh-lede");
      if (lede && !lede.querySelector("[data-regional-footnote-mark]")) {
        const mark = document.createElement("sup");
        mark.className = "hero-footnote-mark";
        mark.dataset.regionalFootnoteMark = "";
        mark.setAttribute("aria-hidden", "true");
        mark.textContent = "*";
        lede.append(mark);
      }
      const heroCopy = document.querySelector(".hero-copy");
      if (heroCopy && !document.querySelector("[data-regional-footnote]")) {
        const note = document.createElement("p");
        note.className = "hero-footnote";
        note.dataset.regionalFootnote = "";
        note.dataset.regionalIdentity = "";
        note.setAttribute("role", "note");
        const star = document.createElement("span");
        star.setAttribute("aria-hidden", "true");
        star.textContent = "*";
        note.append(star, document.createTextNode(" " + data.ledeNote));
        heroCopy.insertAdjacentElement("afterend", note);
      }
    }

    const footer = document.querySelector(".footer-identity");
    if (footer && data.altName && !footer.querySelector("[data-regional-footer-name]")) {
      const line = document.createElement("p");
      line.dataset.regionalFooterName = "";
      line.dataset.regionalIdentity = "";
      line.textContent = `${data.altName} · ${data.location || ""}`;
      footer.append(line);
    }
  }

  function restoreChronology(data) {
    const chronology = document.querySelector(".chronology");
    if (!chronology || typeof data.time !== "string" || typeof data.text !== "string") return;
    if (chronology.querySelector("[data-conditional-profile-credit]")) return;

    const row = document.createElement("div");
    row.className = "credit";
    row.dataset.conditionalProfileCredit = "";
    row.dataset.regionalIdentity = "";

    const time = document.createElement("time");
    time.textContent = data.time;
    const copy = document.createElement("p");
    copy.textContent = data.text;
    row.append(time, copy);

    const rows = Array.from(chronology.querySelectorAll(":scope > .credit"));
    const next = rows.find((item) => item.querySelector("time")?.textContent?.trim() === "2024");
    if (next) chronology.insertBefore(row, next);
    else chronology.append(row);
  }

  function restoreContexts(data) {
    const records = document.querySelector("#credit-map .contexts-records");
    const record = data.contextRecord;
    if (!records || !record || records.querySelector("[data-regional-context-record]")) return;

    const article = document.createElement("article");
    article.className = "contexts-record";
    article.dataset.regionalContextRecord = "";
    article.dataset.regionalIdentity = "";

    const date = document.createElement("p");
    date.className = "contexts-date";
    date.textContent = record.date || "";

    const main = document.createElement("div");
    main.className = "contexts-record-main";
    const title = document.createElement("h3");
    title.textContent = record.title || "";
    const detail = document.createElement("p");
    detail.className = "contexts-detail";
    detail.textContent = record.detail || "";
    const credit = document.createElement("p");
    credit.className = "contexts-credit";
    const label = document.createElement("span");
    label.textContent = data.contextCreditLabel || "";
    credit.append(label, document.createTextNode(" " + (record.credit || "")));
    main.append(title, detail, credit);
    article.append(date, main);

    const first = records.querySelector(":scope > .contexts-record");
    if (first) first.insertAdjacentElement("afterend", article);
    else records.append(article);
  }

  function restoreAbout(data) {
    const paragraph = document.querySelector("#quality .about-section-copy > p:first-child");
    if (!paragraph || typeof data.aboutQualityFirst !== "string" || !data.aboutQualityFirst) return;
    paragraph.dataset.regionalIdentity = "";
    paragraph.textContent = data.aboutQualityFirst;
  }

  function restoreEmailSlots(data) {
    for (const slot of document.querySelectorAll("[data-regional-email]")) {
      const kind = slot.dataset.regionalEmail;
      const address = kind === "mail-assistant" ? data.mailAssistantEmail : data.email;
      if (typeof address !== "string" || !address) continue;

      const link = document.createElement("a");
      link.href = "mailto:" + address;
      link.textContent = slot.dataset.label || address;

      const fragment = document.createDocumentFragment();
      if (slot.dataset.prefix) fragment.append(document.createTextNode(slot.dataset.prefix));
      fragment.append(link);
      slot.replaceWith(fragment);
    }
  }

  function restoreEducationalContext(data) {
    const trainspottingNote = document.querySelector("[data-regional-trainspotting-note]");
    if (
      trainspottingNote &&
      typeof data.trainspottingNote === "string" &&
      data.trainspottingNote
    ) {
      trainspottingNote.textContent = data.trainspottingNote;
      trainspottingNote.dataset.regionalEducation = "";
    }
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
      if (!response.ok) throw new Error(`regional identity request failed: ${response.status}`);
      return response.json();
    })
    .then(async (data) => {
      if (!data) return;
      await ensureSimplifiedChineseRegionalFont();
      restoreStructuredData(data.altName);
      restoreHome(data);
      restoreChronology(data);
      restoreContexts(data);
      restoreAbout(data);
      restoreEmailSlots(data);
      restoreEducationalContext(data);
    })
    .catch(() => {
      // Fail closed: CN, unknown geolocation, an unreachable Worker, or a font failure
      // leaves all conditional identity material absent.
    })
    .finally(() => window.clearTimeout(timeout));
})();
