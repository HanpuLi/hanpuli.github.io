(() => {
  "use strict";

  const PARAM = new URLSearchParams(location.search);
  if (PARAM.get("tune") !== "1") return;

  const STORAGE_KEY = "hanpuli-design-tuner-v1";
  const STYLE_ID = "design-tuner-overrides";
  const BOX_STYLE_ID = "design-tuner-boxes";
  const PAGE_KEY = location.pathname;
  const root = document.documentElement;

  const groups = [
    {
      title: "画布",
      controls: [
        { id: "max", label: "页面最大宽度", kind: "var", name: "--max", unit: "px", min: 960, max: 2200, step: 10, fallback: 1920 },
        { id: "gutter", label: "页面外边距", kind: "var", name: "--gutter", unit: "px", min: 8, max: 72, step: 1, fallback: 30 },
        { id: "gap", label: "栏间距", kind: "var", name: "--gap", unit: "px", min: 0, max: 48, step: 1, fallback: 24 },
        { id: "section-space", label: "章节间距", kind: "var", name: "--space-section", unit: "px", min: 48, max: 220, step: 2, fallback: 128 },
        { id: "copy-measure", label: "正文行宽", kind: "var", name: "--measure-copy", unit: "ch", min: 38, max: 90, step: 1, fallback: 68 },
        { id: "section-rail", label: "章节侧栏", kind: "var", name: "--section-rail", unit: "px", min: 16, max: 160, step: 2, fallback: 96 }
      ]
    },
    {
      title: "首屏文字",
      controls: [
        { id: "hero-size", label: "标题字号", kind: "rule", selector: ".site-home .hero h1", prop: "font-size", unit: "px", min: 72, max: 280, step: 2 },
        { id: "hero-leading", label: "标题行距", kind: "rule", selector: ".site-home .hero h1", prop: "line-height", unit: "", min: 0.72, max: 1.12, step: 0.01 },
        { id: "hero-track", label: "标题字距", kind: "rule", selector: ".site-home .hero h1", prop: "letter-spacing", unit: "em", min: -0.12, max: 0.02, step: 0.002 },
        { id: "hero-copy-size", label: "正文字号", kind: "rule", selector: ".site-home .hero-copy", prop: "font-size", unit: "px", min: 13, max: 26, step: 0.5 },
        { id: "hero-copy-leading", label: "正文行距", kind: "rule", selector: ".site-home .hero-copy", prop: "line-height", unit: "", min: 1.1, max: 2, step: 0.02 },
        { id: "section-title-size", label: "章节标题字号", kind: "rule", selector: ".site-home .section-head h2", prop: "font-size", unit: "px", min: 28, max: 86, step: 1 }
      ]
    },
    {
      title: "垂直节奏",
      controls: [
        { id: "section-bottom", label: "章节底部间距", kind: "rule", selector: ".site-home main > section:not(.hero)", prop: "padding-bottom", unit: "px", min: 48, max: 240, step: 2 },
        { id: "section-head-gap", label: "标题后间距", kind: "rule", selector: ".site-home .section-head", prop: "margin-bottom", unit: "px", min: 20, max: 150, step: 2 },
        { id: "photo-row-gap", label: "图片行间距", kind: "rule", selector: ".site-home .photo-sequence", prop: "row-gap", unit: "px", min: 18, max: 180, step: 2 }
      ]
    }
  ];

  const gridControls = [
    { id: "title-grid", label: "首屏标题", selector: ".site-home .hero h1" },
    { id: "cover-grid", label: "首屏图片", selector: ".site-home .hero-cover" },
    { id: "copy-grid", label: "首屏正文", selector: ".site-home .hero-copy" },
    { id: "id-grid", label: "首屏身份信息", selector: ".site-home .hero-id" },
    { id: "heading-grid", label: "章节标题", selector: ".site-home .section-head h2" },
    { id: "kicker-grid", label: "章节辅助标题", selector: ".site-home .section-kicker" }
  ];

  const advancedFields = [
    ["max-width", "最大宽度", "none / 64ch / 800px"],
    ["min-width", "最小宽度", "0 / 200px"],
    ["min-height", "最小高度", "0 / 300px"],
    ["grid-row", "网格行", "1 / 3"],
    ["grid-template-columns", "网格列模板", "repeat(12, 1fr)"],
    ["top", "上偏移", "auto / 4px"],
    ["right", "右偏移", "auto / 4px"],
    ["bottom", "下偏移", "auto / 4px"],
    ["left", "左偏移", "auto / 4px"]
  ];

  const state = loadState();
  state.elementEdits ||= {};
  state.elementEdits[PAGE_KEY] ||= {};
  const changed = new Set(state.changed || []);
  const initial = captureInitials();

  let selected = null;
  let selectedSelector = "";
  let picking = false;
  let inlineEditing = false;
  let gridAnchor = null;
  let gridDragging = false;

  const overrideStyle = document.createElement("style");
  overrideStyle.id = STYLE_ID;
  document.head.append(overrideStyle);

  applySavedElementContent();

  const panel = buildPanel();
  const readout = panel.querySelector("[data-readout]");
  const gridToggle = panel.querySelector("[data-overlay=grid]");
  const baselineToggle = panel.querySelector("[data-overlay=baseline]");
  const boxesToggle = panel.querySelector("[data-overlay=boxes]");
  const pickButton = panel.querySelector("[data-pick]");
  const selectionName = panel.querySelector("[data-selection-name]");
  const selectionSelector = panel.querySelector("[data-selection-selector]");
  const selectionBoxModel = panel.querySelector("[data-selection-boxmodel]");
  const textArea = panel.querySelector("[data-element-text]");
  const editTextButton = panel.querySelector("[data-edit-text]");
  const visualControls = panel.querySelector("[data-visual-controls]");

  const gridOverlay = document.createElement("div");
  gridOverlay.className = "design-tuner-grid-overlay";
  gridOverlay.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 12; i += 1) gridOverlay.append(document.createElement("i"));
  document.body.append(gridOverlay);

  const baselineOverlay = document.createElement("div");
  baselineOverlay.className = "design-tuner-baseline-overlay";
  baselineOverlay.setAttribute("aria-hidden", "true");
  document.body.append(baselineOverlay);

  const hoverBox = makeSelectionBox("design-tuner-hover-box");
  const selectionBox = makeSelectionBox("design-tuner-selection-box");

  restoreControls();
  apply();
  updateOverlays();
  keepTunerOnInternalLinks();
  activateTab("element");

  window.addEventListener("resize", updateAllOverlays, { passive: true });
  window.addEventListener("scroll", updateAllOverlays, { passive: true });
  window.addEventListener("pointerup", () => {
    if (gridDragging) {
      gridDragging = false;
      commitGridSelection();
    }
  });

  document.addEventListener("pointerover", event => {
    if (!picking || isTunerUi(event.target)) return;
    positionBox(hoverBox, event.target, true);
  }, true);

  document.addEventListener("pointerout", event => {
    if (!picking || isTunerUi(event.target)) return;
    hoverBox.hidden = true;
  }, true);

  document.addEventListener("click", event => {
    if (inlineEditing && selected?.contains(event.target)) {
      event.preventDefault();
      return;
    }
    if (!(picking || event.altKey) || isTunerUi(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    selectElement(event.target);
    setPicking(false);
  }, true);

  document.addEventListener("keydown", event => {
    if (isEditableControl(event.target)) return;
    if (event.altKey && event.key.toLowerCase() === "t") {
      event.preventDefault();
      panel.hidden = !panel.hidden;
    }
    if (event.altKey && event.key.toLowerCase() === "g") {
      event.preventDefault();
      gridToggle.checked = !gridToggle.checked;
      state.grid = gridToggle.checked;
      updateOverlays();
      persist();
    }
    if (event.altKey && event.key.toLowerCase() === "e") {
      event.preventDefault();
      setPicking(!picking);
    }
    if (event.key === "Escape" && picking) setPicking(false);
  });

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function persist() {
    state.changed = [...changed];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function pageEdits() {
    return state.elementEdits[PAGE_KEY];
  }

  function captureInitials() {
    const values = {};
    groups.flatMap(group => group.controls).forEach(control => {
      if (control.kind === "var") {
        values[control.id] = resolvedCustomLength(control.name, control.fallback);
      } else {
        const target = document.querySelector(control.selector);
        const value = target ? getComputedStyle(target).getPropertyValue(control.prop).trim() : "";
        values[control.id] = numeric(value, control.min);
      }
    });
    gridControls.forEach(control => {
      const target = document.querySelector(control.selector);
      const style = target ? getComputedStyle(target) : null;
      const start = style ? parseGridLine(style.gridColumnStart, 1) : 1;
      const end = style ? parseGridLine(style.gridColumnEnd, Math.min(13, start + 1)) : 2;
      values[control.id] = { start, end };
    });
    return values;
  }

  function numeric(value, fallback = 0) {
    const match = String(value).match(/-?\d*\.?\d+/);
    return match ? Number(match[0]) : fallback;
  }

  function resolvedCustomLength(name, fallback) {
    if (name === "--measure-copy") {
      return numeric(getComputedStyle(root).getPropertyValue(name).trim(), fallback);
    }
    const probe = document.createElement("span");
    probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;width:var(${name});font:inherit;`;
    document.body.append(probe);
    const pixels = numeric(getComputedStyle(probe).width, fallback);
    probe.remove();
    return pixels;
  }

  function parseGridLine(value, fallback) {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? Math.max(1, Math.min(13, number)) : fallback;
  }

  function buildPanel() {
    const aside = document.createElement("aside");
    aside.className = "design-tuner";
    aside.innerHTML = `
      <header class="design-tuner__header">
        <div><strong>设计调节器</strong><small>仅本地预览</small></div>
        <button type="button" class="design-tuner__icon" data-collapse aria-label="收起调节器">−</button>
      </header>
      <div class="design-tuner__body">
        <div class="design-tuner__status" data-readout>选择一个元素进行检查</div>
        <nav class="design-tuner__tabs" aria-label="调节器模式">
          <button type="button" data-tab="element">元素</button>
          <button type="button" data-tab="global">全局</button>
        </nav>

        <div data-panel="element">
          <section class="design-tuner__group">
            <div class="design-tuner__pick-row">
              <button type="button" data-pick>选择元素</button>
              <span>或 ⌥ 点击 · ⌥E</span>
            </div>
            <div class="design-tuner__selection-meta">
              <strong data-selection-name>尚未选择元素</strong>
              <code data-selection-selector>点击“选择元素”，再点击页面中的任意元素。</code>
              <small data-selection-boxmodel></small>
            </div>
          </section>

          <div data-visual-controls hidden>
            <section class="design-tuner__group">
              <h2>内容</h2>
              <div class="design-tuner__button-row design-tuner__button-row--primary">
                <button type="button" data-edit-text>页面内编辑文字</button>
                <button type="button" data-reset-element>重置所选元素</button>
              </div>
              <details class="design-tuner__details">
                <summary>精确替换文字</summary>
                <textarea data-element-text rows="4" aria-label="所选元素文字"></textarea>
                <button type="button" data-replace-text>替换为以上纯文字</button>
                <p>此操作会移除该元素内部原有的行内标记。</p>
              </details>
            </section>

            <section class="design-tuner__group">
              <h2>尺寸</h2>
              <div data-dimension="width"></div>
              <div data-dimension="height"></div>
            </section>

            <section class="design-tuner__group">
              <h2>布局</h2>
              <div class="design-tuner__field-label">显示方式</div>
              <div class="design-tuner__segmented" data-segmented="display"></div>
              <div class="design-tuner__field-label">定位方式</div>
              <div class="design-tuner__segmented" data-segmented="position"></div>
              <div data-number-slider="gap"></div>
            </section>

            <section class="design-tuner__group">
              <h2>12 栏网格</h2>
              <div class="design-tuner__grid-note" data-grid-note></div>
              <div class="design-tuner__column-grid" data-column-grid></div>
              <div class="design-tuner__grid-readout" data-grid-readout></div>
            </section>

            <section class="design-tuner__group">
              <h2>位置微调</h2>
              <div class="design-tuner__nudge">
                <button type="button" data-nudge="0,-5">↑ 5</button>
                <button type="button" data-nudge="0,-1">↑ 1</button>
                <button type="button" data-nudge="-5,0">← 5</button>
                <button type="button" data-nudge="-1,0">← 1</button>
                <output data-nudge-readout>0, 0 px</output>
                <button type="button" data-nudge="1,0">→ 1</button>
                <button type="button" data-nudge="5,0">→ 5</button>
                <button type="button" data-nudge="0,1">↓ 1</button>
                <button type="button" data-nudge="0,5">↓ 5</button>
              </div>
              <button type="button" class="design-tuner__subtle" data-nudge-reset>清除微移</button>
            </section>

            <section class="design-tuner__group">
              <h2>盒模型</h2>
              <div class="design-tuner__boxmodel">
                <div class="design-tuner__boxmodel-title">外边距</div>
                <div class="design-tuner__box-grid" data-box="margin"></div>
                <div class="design-tuner__box-inner">
                  <div class="design-tuner__boxmodel-title">内边距</div>
                  <div class="design-tuner__box-grid" data-box="padding"></div>
                  <div class="design-tuner__box-content">内容</div>
                </div>
              </div>
            </section>

            <section class="design-tuner__group">
              <h2>文字</h2>
              <div data-number-slider="font-size"></div>
              <div data-number-slider="line-height"></div>
              <div data-number-slider="letter-spacing"></div>
              <div class="design-tuner__field-label">对齐</div>
              <div class="design-tuner__segmented" data-segmented="text-align"></div>
            </section>

            <details class="design-tuner__group design-tuner__details design-tuner__advanced">
              <summary>高级 CSS</summary>
              <div class="design-tuner__property-grid" data-advanced-fields></div>
            </details>
          </div>
        </div>

        <div data-panel="global" hidden>
          <section class="design-tuner__group">
            <h2>辅助叠层</h2>
            <label class="design-tuner__check"><input type="checkbox" data-overlay="grid"> <span>12 栏网格</span><kbd>⌥G</kbd></label>
            <label class="design-tuner__check"><input type="checkbox" data-overlay="baseline"> <span>8px 基线</span></label>
            <label class="design-tuner__check"><input type="checkbox" data-overlay="boxes"> <span>布局边界</span></label>
          </section>
          <div data-groups></div>
          <section class="design-tuner__group">
            <h2>网格位置</h2>
            <div data-grid-controls></div>
          </section>
        </div>

        <footer class="design-tuner__footer">
          <button type="button" data-copy-css>复制 CSS</button>
          <button type="button" data-copy-patch>复制修改记录</button>
          <button type="button" data-reset>全部重置</button>
        </footer>
        <p class="design-tuner__hint">元素模式用于视觉微调；自由 CSS 输入仅保留在“高级 CSS”。</p>
      </div>
    `;
    document.body.append(aside);

    const groupsHost = aside.querySelector("[data-groups]");
    groups.forEach(group => {
      const section = document.createElement("section");
      section.className = "design-tuner__group";
      section.innerHTML = `<h2>${group.title}</h2>`;
      group.controls.forEach(control => section.append(makeRange(control)));
      groupsHost.append(section);
    });

    const gridHost = aside.querySelector("[data-grid-controls]");
    gridControls.forEach(control => gridHost.append(makeGridControl(control)));

    buildDimensionControl(aside.querySelector('[data-dimension="width"]'), "width", "宽度", 0, 1800);
    buildDimensionControl(aside.querySelector('[data-dimension="height"]'), "height", "高度", 0, 1200);
    buildSegmented(aside.querySelector('[data-segmented="display"]'), "display", [
      ["", "保持"], ["block", "块级"], ["inline-block", "行内块"], ["flex", "弹性"], ["grid", "网格"], ["none", "隐藏"]
    ]);
    buildSegmented(aside.querySelector('[data-segmented="position"]'), "position", [
      ["", "保持"], ["static", "静态"], ["relative", "相对"], ["absolute", "绝对"], ["fixed", "固定"]
    ]);
    buildSegmented(aside.querySelector('[data-segmented="text-align"]'), "text-align", [
      ["", "保持"], ["left", "左"], ["center", "中"], ["right", "右"], ["justify", "两端"]
    ]);

    buildNumberSlider(aside.querySelector('[data-number-slider="gap"]'), {
      prop: "gap", label: "间距", unit: "px", min: 0, max: 160, step: 1
    });
    buildNumberSlider(aside.querySelector('[data-number-slider="font-size"]'), {
      prop: "font-size", label: "字号", unit: "px", min: 6, max: 300, step: 1
    });
    buildNumberSlider(aside.querySelector('[data-number-slider="line-height"]'), {
      prop: "line-height", label: "行距", unit: "", min: 0.5, max: 3, step: 0.01
    });
    buildNumberSlider(aside.querySelector('[data-number-slider="letter-spacing"]'), {
      prop: "letter-spacing", label: "字距", unit: "em", min: -0.2, max: 0.5, step: 0.005
    });

    buildBoxControls(aside.querySelector('[data-box="margin"]'), "margin");
    buildBoxControls(aside.querySelector('[data-box="padding"]'), "padding");
    buildColumnGrid(aside.querySelector("[data-column-grid]"));
    buildAdvancedFields(aside.querySelector("[data-advanced-fields]"));

    aside.querySelector("[data-collapse]").addEventListener("click", () => {
      aside.classList.toggle("is-collapsed");
      aside.querySelector("[data-collapse]").textContent = aside.classList.contains("is-collapsed") ? "+" : "−";
    });
    aside.querySelectorAll("[data-tab]").forEach(button => {
      button.addEventListener("click", () => activateTab(button.dataset.tab));
    });
    aside.querySelector("[data-pick]").addEventListener("click", () => setPicking(!picking));
    aside.querySelector("[data-replace-text]").addEventListener("click", replaceSelectedText);
    aside.querySelector("[data-edit-text]").addEventListener("click", toggleInlineEditing);
    aside.querySelector("[data-reset-element]").addEventListener("click", resetSelectedElement);
    aside.querySelector("[data-reset]").addEventListener("click", resetAll);
    aside.querySelector("[data-copy-css]").addEventListener("click", copyCSS);
    aside.querySelector("[data-copy-patch]").addEventListener("click", copyPatch);
    aside.querySelector("[data-nudge-reset]").addEventListener("click", resetNudge);
    aside.querySelectorAll("[data-nudge]").forEach(button => {
      button.addEventListener("click", () => {
        const [dx, dy] = button.dataset.nudge.split(",").map(Number);
        nudgeSelected(dx, dy);
      });
    });
    aside.querySelectorAll("[data-overlay]").forEach(input => {
      input.addEventListener("change", () => {
        state[input.dataset.overlay] = input.checked;
        updateOverlays();
        persist();
      });
    });
    return aside;
  }

  function activateTab(name) {
    panel.querySelectorAll("[data-panel]").forEach(node => {
      node.hidden = node.dataset.panel !== name;
    });
    panel.querySelectorAll("[data-tab]").forEach(button => {
      button.classList.toggle("is-active", button.dataset.tab === name);
      button.setAttribute("aria-selected", button.dataset.tab === name ? "true" : "false");
    });
  }

  function makeRange(control) {
    const wrap = document.createElement("label");
    wrap.className = "design-tuner__range";
    const value = state[control.id] ?? initial[control.id];
    wrap.innerHTML = `
      <span>${control.label}</span>
      <input type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${value}" data-control="${control.id}">
      <output>${formatValue(value, control.unit)}</output>
    `;
    const input = wrap.querySelector("input");
    const output = wrap.querySelector("output");
    input.addEventListener("input", () => {
      const valueNow = Number(input.value);
      state[control.id] = valueNow;
      changed.add(control.id);
      output.textContent = formatValue(valueNow, control.unit);
      apply();
      updateAllOverlays();
      persist();
    });
    return wrap;
  }

  function makeGridControl(control) {
    const wrap = document.createElement("div");
    wrap.className = "design-tuner__grid-control";
    const saved = state[control.id] || initial[control.id];
    wrap.innerHTML = `
      <span>${control.label}</span>
      <label>起 <input type="number" min="1" max="12" step="1" value="${saved.start}" data-edge="start"></label>
      <label>止 <input type="number" min="2" max="13" step="1" value="${saved.end}" data-edge="end"></label>
    `;
    const start = wrap.querySelector("[data-edge=start]");
    const end = wrap.querySelector("[data-edge=end]");
    const commit = () => {
      let a = Math.max(1, Math.min(12, Number(start.value) || 1));
      let b = Math.max(2, Math.min(13, Number(end.value) || 13));
      if (b <= a) b = Math.min(13, a + 1);
      start.value = a;
      end.value = b;
      state[control.id] = { start: a, end: b };
      changed.add(control.id);
      apply();
      persist();
    };
    start.addEventListener("change", commit);
    end.addEventListener("change", commit);
    return wrap;
  }

  function buildDimensionControl(host, prop, label, min, max) {
    host.className = "design-tuner__visual-row";
    host.innerHTML = `
      <div class="design-tuner__visual-head"><span>${label}</span>
        <select data-dim-unit="${prop}" aria-label="${label}单位">
          <option value="px">px</option>
          <option value="%">%</option>
          <option value="auto">自动</option>
        </select>
      </div>
      <div class="design-tuner__slider-line">
        <input type="range" data-visual-range="${prop}" min="${min}" max="${max}" step="1">
        <input type="number" data-visual-number="${prop}" min="${min}" max="${max}" step="1">
      </div>
    `;
    const range = host.querySelector("[data-visual-range]");
    const number = host.querySelector("[data-visual-number]");
    const unit = host.querySelector("[data-dim-unit]");
    const commit = source => {
      if (!selected) return;
      if (unit.value === "auto") {
        setElementProperty(prop, "auto");
        range.disabled = true;
        number.disabled = true;
        return;
      }
      range.disabled = false;
      number.disabled = false;
      const value = clamp(Number(source.value), Number(source.min), Number(source.max));
      range.value = value;
      number.value = value;
      setElementProperty(prop, `${value}${unit.value}`);
    };
    range.addEventListener("input", () => commit(range));
    number.addEventListener("input", () => commit(number));
    unit.addEventListener("change", () => {
      if (!selected) return;
      if (unit.value === "%") {
        const parentWidth = selected.parentElement?.getBoundingClientRect().width || window.innerWidth;
        const percent = clamp((selected.getBoundingClientRect().width / parentWidth) * 100, 0, 200);
        range.max = "200";
        number.max = "200";
        range.value = percent.toFixed(1);
        number.value = percent.toFixed(1);
      } else {
        range.max = String(max);
        number.max = String(max);
      }
      commit(number);
    });
  }

  function buildNumberSlider(host, config) {
    host.className = "design-tuner__visual-row";
    host.dataset.visualProp = config.prop;
    host.innerHTML = `
      <div class="design-tuner__visual-head"><span>${config.label}</span><output data-visual-output="${config.prop}"></output></div>
      <div class="design-tuner__slider-line">
        <input type="range" data-style-range="${config.prop}" min="${config.min}" max="${config.max}" step="${config.step}">
        <input type="number" data-style-number="${config.prop}" min="${config.min}" max="${config.max}" step="${config.step}">
      </div>
    `;
    const range = host.querySelector("[data-style-range]");
    const number = host.querySelector("[data-style-number]");
    const output = host.querySelector("[data-visual-output]");
    const commit = source => {
      if (!selected) return;
      const value = clamp(Number(source.value), config.min, config.max);
      range.value = value;
      number.value = value;
      output.textContent = `${value}${config.unit}`;
      setElementProperty(config.prop, `${value}${config.unit}`);
    };
    range.addEventListener("input", () => commit(range));
    number.addEventListener("input", () => commit(number));
  }

  function buildSegmented(host, prop, options) {
    options.forEach(([value, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.segmentProp = prop;
      button.dataset.segmentValue = value;
      button.textContent = label;
      button.addEventListener("click", () => {
        if (!selected) return;
        setElementProperty(prop, value);
        syncSegmented(prop, value);
      });
      host.append(button);
    });
  }

  function buildBoxControls(host, prefix) {
    const labels = [["top", "上"], ["right", "右"], ["bottom", "下"], ["left", "左"]];
    labels.forEach(([side, label]) => {
      const wrap = document.createElement("label");
      wrap.className = `design-tuner__box-side design-tuner__box-side--${side}`;
      wrap.innerHTML = `<span>${label}</span><input type="number" step="1" data-box-prop="${prefix}-${side}">`;
      const input = wrap.querySelector("input");
      input.addEventListener("input", () => {
        if (!selected) return;
        setElementProperty(`${prefix}-${side}`, `${Number(input.value) || 0}px`);
      });
      host.append(wrap);
    });
  }

  function buildColumnGrid(host) {
    for (let col = 1; col <= 12; col += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.gridCol = String(col);
      button.textContent = String(col);
      button.addEventListener("pointerdown", event => {
        if (button.disabled) return;
        event.preventDefault();
        gridDragging = true;
        gridAnchor = col;
        previewGridSelection(col, col);
      });
      button.addEventListener("pointerenter", () => {
        if (!gridDragging || gridAnchor == null) return;
        previewGridSelection(Math.min(gridAnchor, col), Math.max(gridAnchor, col));
      });
      button.addEventListener("click", event => {
        if (button.disabled || gridDragging) {
          event.preventDefault();
          return;
        }
        if (gridAnchor == null) {
          gridAnchor = col;
          previewGridSelection(col, col);
        } else {
          previewGridSelection(Math.min(gridAnchor, col), Math.max(gridAnchor, col));
          commitGridSelection();
        }
      });
      host.append(button);
    }
  }

  function buildAdvancedFields(host) {
    advancedFields.forEach(([prop, label, placeholder]) => {
      const wrap = document.createElement("label");
      wrap.className = "design-tuner__property";
      wrap.innerHTML = `<span>${label}</span><input type="text" data-advanced-prop="${prop}" placeholder="${placeholder}">`;
      wrap.querySelector("input").addEventListener("change", event => {
        setElementProperty(prop, event.target.value.trim());
      });
      host.append(wrap);
    });
  }

  function formatValue(value, unit) {
    if (!unit) return Number(value).toFixed(value % 1 ? 2 : 0);
    if (unit === "em") return `${Number(value).toFixed(3)}em`;
    return `${Number(value).toFixed(value % 1 ? 1 : 0)}${unit}`;
  }

  function restoreControls() {
    panel.querySelectorAll("[data-control]").forEach(input => {
      const id = input.dataset.control;
      const control = findControl(id);
      if (state[id] == null) state[id] = initial[id];
      input.value = state[id];
      input.nextElementSibling.textContent = formatValue(state[id], control.unit);
    });
    gridControls.forEach(control => {
      if (!state[control.id]) state[control.id] = initial[control.id];
    });
    gridToggle.checked = state.grid ?? true;
    baselineToggle.checked = state.baseline ?? false;
    boxesToggle.checked = state.boxes ?? false;
  }

  function findControl(id) {
    return groups.flatMap(group => group.controls).find(control => control.id === id);
  }

  function apply() {
    const variables = [];
    const rules = new Map();

    groups.flatMap(group => group.controls).forEach(control => {
      if (!changed.has(control.id)) return;
      const value = state[control.id];
      if (control.kind === "var") {
        variables.push(`${control.name}: ${value}${control.unit};`);
      } else {
        addRule(rules, control.selector, control.prop, `${value}${control.unit}`);
      }
    });

    gridControls.forEach(control => {
      if (!changed.has(control.id)) return;
      const value = state[control.id];
      addRule(rules, control.selector, "grid-column", `${value.start} / ${value.end}`);
    });

    Object.entries(pageEdits()).forEach(([selector, edit]) => {
      Object.entries(edit.styles || {}).forEach(([prop, value]) => {
        if (value) addRule(rules, selector, prop, value);
      });
    });

    let css = variables.length ? `:root { ${variables.join(" ")} }\n` : "";
    for (const [selector, props] of rules) {
      css += `${selector} { ${props.map(([prop, value]) => `${prop}: ${value} !important;`).join(" ")} }\n`;
    }
    overrideStyle.textContent = css;
    updateReadout();
  }

  function addRule(rules, selector, prop, value) {
    if (!rules.has(selector)) rules.set(selector, []);
    rules.get(selector).push([prop, value]);
  }

  function applySavedElementContent() {
    Object.entries(pageEdits()).forEach(([selector, edit]) => {
      if (edit.html == null) return;
      try {
        const target = document.querySelector(selector);
        if (target) target.innerHTML = edit.html;
      } catch {
        // stale selector
      }
    });
  }

  function setPicking(on) {
    picking = on;
    document.documentElement.classList.toggle("design-tuner-picking", on);
    if (!on) hoverBox.hidden = true;
    pickButton.classList.toggle("is-active", on);
    pickButton.textContent = on ? "请点击页面元素…" : "选择元素";
    if (on) readout.textContent = "选择模式：点击任意页面元素 · Esc 取消";
    else updateReadout();
  }

  function selectElement(element) {
    if (!(element instanceof Element) || isTunerUi(element)) return;
    stopInlineEditing();
    selected = element;
    selectedSelector = selectorFor(element);
    positionBox(selectionBox, element, false);
    selectionBox.hidden = false;
    selectionName.textContent = elementLabel(element);
    selectionSelector.textContent = selectedSelector;
    textArea.value = element.textContent || "";
    visualControls.hidden = false;
    fillVisualControls();
    activateTab("element");
    updateAllOverlays();
    updateReadout();
  }

  function selectorFor(element) {
    if (element.id) {
      const idSelector = `#${cssEscape(element.id)}`;
      if (isUnique(idSelector, element)) return idSelector;
    }
    const simple = simpleSelector(element);
    if (isUnique(simple, element)) return simple;
    const parts = [];
    let current = element;
    while (current && current !== document.body) {
      let part = simpleSelector(current);
      const parent = current.parentElement;
      if (parent) {
        const sameTag = [...parent.children].filter(child => child.tagName === current.tagName);
        if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      const candidate = parts.join(" > ");
      if (isUnique(candidate, element)) return candidate;
      current = parent;
    }
    return `body > ${parts.join(" > ")}`;
  }

  function simpleSelector(element) {
    const tag = element.tagName.toLowerCase();
    const classes = [...element.classList]
      .filter(name => !name.startsWith("design-tuner"))
      .slice(0, 3)
      .map(name => `.${cssEscape(name)}`)
      .join("");
    return tag + classes;
  }

  function isUnique(selector, element) {
    try {
      const matches = document.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === element;
    } catch {
      return false;
    }
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, char => `\\${char}`);
  }

  function elementLabel(element) {
    const bits = [element.tagName.toLowerCase()];
    if (element.id) bits.push(`#${element.id}`);
    if (element.classList.length) bits.push(`.${[...element.classList].slice(0, 3).join(".")}`);
    return bits.join("");
  }

  function ensureElementEdit() {
    if (!selected || !selectedSelector) return null;
    const edits = pageEdits();
    if (!edits[selectedSelector]) {
      edits[selectedSelector] = {
        tag: selected.tagName.toLowerCase(),
        originalHTML: selected.innerHTML,
        styles: {}
      };
    }
    edits[selectedSelector].styles ||= {};
    return edits[selectedSelector];
  }

  function setElementProperty(prop, value) {
    const edit = ensureElementEdit();
    if (!edit) return;
    if (value === "" || value == null) delete edit.styles[prop];
    else edit.styles[prop] = value;
    pruneElementEdit(selectedSelector);
    apply();
    persist();
    updateAllOverlays();
  }

  function replaceSelectedText() {
    if (!selected) return;
    const edit = ensureElementEdit();
    stopInlineEditing();
    selected.textContent = textArea.value;
    edit.html = selected.innerHTML;
    persist();
    updateAllOverlays();
    updateReadout();
  }

  function toggleInlineEditing() {
    if (!selected) return;
    if (inlineEditing) {
      stopInlineEditing();
      return;
    }
    ensureElementEdit();
    inlineEditing = true;
    selected.setAttribute("contenteditable", "true");
    selected.setAttribute("data-design-tuner-editing", "true");
    selected.focus({ preventScroll: true });
    editTextButton.textContent = "完成文字编辑";
    editTextButton.classList.add("is-active");
    selected.addEventListener("input", captureInlineEdit);
    readout.textContent = "文字编辑模式：直接在所选元素中输入";
  }

  function captureInlineEdit() {
    if (!selected) return;
    const edit = ensureElementEdit();
    edit.html = selected.innerHTML;
    textArea.value = selected.textContent || "";
    persist();
    updateAllOverlays();
  }

  function stopInlineEditing() {
    if (!inlineEditing || !selected) return;
    captureInlineEdit();
    selected.removeEventListener("input", captureInlineEdit);
    selected.removeAttribute("contenteditable");
    selected.removeAttribute("data-design-tuner-editing");
    inlineEditing = false;
    editTextButton.textContent = "页面内编辑文字";
    editTextButton.classList.remove("is-active");
    updateReadout();
  }

  function fillVisualControls() {
    if (!selected) return;
    const style = getComputedStyle(selected);
    const edit = pageEdits()[selectedSelector];
    fillDimension("width", selected.getBoundingClientRect().width, edit?.styles?.width);
    fillDimension("height", selected.getBoundingClientRect().height, edit?.styles?.height);
    fillNumberSlider("gap", numeric(edit?.styles?.gap ?? style.gap, 0));
    fillNumberSlider("font-size", numeric(edit?.styles?.["font-size"] ?? style.fontSize, 16));

    const fontSize = numeric(style.fontSize, 16);
    const lineHeightRaw = edit?.styles?.["line-height"] ?? style.lineHeight;
    const lineHeight = String(lineHeightRaw).endsWith("px")
      ? numeric(lineHeightRaw, fontSize * 1.2) / fontSize
      : numeric(lineHeightRaw, 1.2);
    fillNumberSlider("line-height", lineHeight);

    const letterRaw = edit?.styles?.["letter-spacing"] ?? style.letterSpacing;
    const letterEm = String(letterRaw).endsWith("em")
      ? numeric(letterRaw, 0)
      : numeric(letterRaw, 0) / fontSize;
    fillNumberSlider("letter-spacing", letterEm);

    syncSegmented("display", edit?.styles?.display ?? "");
    syncSegmented("position", edit?.styles?.position ?? "");
    syncSegmented("text-align", edit?.styles?.["text-align"] ?? "");

    fillBox("margin", style, edit);
    fillBox("padding", style, edit);
    fillAdvanced(style, edit);
    fillGridVisual();
    fillNudge();
  }

  function fillDimension(prop, renderedPx, override) {
    const unitSelect = panel.querySelector(`[data-dim-unit="${prop}"]`);
    const range = panel.querySelector(`[data-visual-range="${prop}"]`);
    const number = panel.querySelector(`[data-visual-number="${prop}"]`);
    let unit = "px";
    let value = renderedPx;
    if (override === "auto") {
      unit = "auto";
    } else if (String(override || "").endsWith("%")) {
      unit = "%";
      value = numeric(override, 100);
    } else if (String(override || "").endsWith("px")) {
      value = numeric(override, renderedPx);
    }
    unitSelect.value = unit;
    const max = unit === "%" ? 200 : (prop === "width" ? 1800 : 1200);
    range.max = String(max);
    number.max = String(max);
    range.disabled = unit === "auto";
    number.disabled = unit === "auto";
    range.value = clamp(value, 0, max);
    number.value = Number(clamp(value, 0, max).toFixed(1));
  }

  function fillNumberSlider(prop, value) {
    const range = panel.querySelector(`[data-style-range="${prop}"]`);
    const number = panel.querySelector(`[data-style-number="${prop}"]`);
    const output = panel.querySelector(`[data-visual-output="${prop}"]`);
    if (!range || !number) return;
    const bounded = clamp(value, Number(range.min), Number(range.max));
    range.value = bounded;
    number.value = Number(bounded.toFixed(3));
    const unit = prop === "letter-spacing" ? "em" : prop === "line-height" ? "" : "px";
    output.textContent = `${Number(bounded.toFixed(3))}${unit}`;
  }

  function syncSegmented(prop, value) {
    panel.querySelectorAll(`[data-segment-prop="${prop}"]`).forEach(button => {
      button.classList.toggle("is-active", button.dataset.segmentValue === value);
    });
  }

  function fillBox(prefix, style, edit) {
    ["top", "right", "bottom", "left"].forEach(side => {
      const prop = `${prefix}-${side}`;
      const input = panel.querySelector(`[data-box-prop="${prop}"]`);
      input.value = Number(numeric(edit?.styles?.[prop] ?? style.getPropertyValue(prop), 0).toFixed(1));
    });
  }

  function fillAdvanced(style, edit) {
    panel.querySelectorAll("[data-advanced-prop]").forEach(input => {
      const prop = input.dataset.advancedProp;
      input.value = edit?.styles?.[prop] ?? style.getPropertyValue(prop).trim();
    });
  }

  function fillGridVisual() {
    const note = panel.querySelector("[data-grid-note]");
    const buttons = [...panel.querySelectorAll("[data-grid-col]")];
    const parentStyle = selected?.parentElement ? getComputedStyle(selected.parentElement) : null;
    const columns = parentStyle && parentStyle.display.includes("grid")
      ? parentStyle.gridTemplateColumns.split(" ").filter(Boolean).length
      : 0;
    const enabled = columns === 12;
    buttons.forEach(button => { button.disabled = !enabled; });
    if (!enabled) {
      note.textContent = columns ? `父级是 ${columns} 栏 Grid；此控件只用于本站的 12 栏结构。` : "父级不是 Grid，12 栏控制不可用。";
      previewGridSelection(0, 0);
      return;
    }
    note.textContent = "拖过栏位即可改变元素所占列；也可先点起点，再点终点。";
    const style = getComputedStyle(selected);
    const edit = pageEdits()[selectedSelector];
    const source = edit?.styles?.["grid-column"];
    let start = source ? numeric(source.split("/")[0], 1) : parseGridLine(style.gridColumnStart, 1);
    let endLine = source ? numeric(source.split("/")[1], start + 1) : parseGridLine(style.gridColumnEnd, start + 1);
    if (!Number.isFinite(start) || !Number.isFinite(endLine) || start < 1 || endLine > 13) {
      start = 1;
      endLine = 2;
    }
    previewGridSelection(start, endLine - 1);
  }

  function previewGridSelection(startCol, endCol) {
    panel.querySelectorAll("[data-grid-col]").forEach(button => {
      const col = Number(button.dataset.gridCol);
      button.classList.toggle("is-selected", startCol > 0 && col >= startCol && col <= endCol);
    });
    const readout = panel.querySelector("[data-grid-readout]");
    readout.textContent = startCol > 0 ? `第 ${startCol}–${endCol} 栏 · CSS: ${startCol} / ${endCol + 1}` : "";
    readout.dataset.start = String(startCol);
    readout.dataset.end = String(endCol);
  }

  function commitGridSelection() {
    const readout = panel.querySelector("[data-grid-readout]");
    const start = Number(readout.dataset.start);
    const end = Number(readout.dataset.end);
    if (selected && start >= 1 && end >= start) {
      setElementProperty("grid-column", `${start} / ${end + 1}`);
    }
    gridAnchor = null;
  }

  function nudgeSelected(dx, dy) {
    if (!selected) return;
    const [x, y] = currentNudge();
    setElementProperty("translate", `${x + dx}px ${y + dy}px`);
    fillNudge();
  }

  function resetNudge() {
    if (!selected) return;
    setElementProperty("translate", "");
    fillNudge();
  }

  function currentNudge() {
    const value = pageEdits()[selectedSelector]?.styles?.translate;
    if (!value) return [0, 0];
    const nums = String(value).match(/-?\d*\.?\d+/g)?.map(Number) || [0, 0];
    return [nums[0] || 0, nums[1] || 0];
  }

  function fillNudge() {
    const [x, y] = currentNudge();
    panel.querySelector("[data-nudge-readout]").textContent = `${x}, ${y} px`;
  }

  function resetSelectedElement() {
    if (!selected || !selectedSelector) return;
    stopInlineEditing();
    const edit = pageEdits()[selectedSelector];
    if (edit?.originalHTML != null) selected.innerHTML = edit.originalHTML;
    delete pageEdits()[selectedSelector];
    apply();
    persist();
    textArea.value = selected.textContent || "";
    fillVisualControls();
    updateAllOverlays();
    updateReadout();
  }

  function pruneElementEdit(selector) {
    const edit = pageEdits()[selector];
    if (!edit) return;
    const hasStyles = Object.keys(edit.styles || {}).length > 0;
    const hasContent = edit.html != null && edit.html !== edit.originalHTML;
    if (!hasStyles && !hasContent) delete pageEdits()[selector];
  }

  function makeSelectionBox(className) {
    const box = document.createElement("div");
    box.className = className;
    box.hidden = true;
    box.innerHTML = "<span></span>";
    document.body.append(box);
    return box;
  }

  function positionBox(box, element, isHover) {
    if (!element?.isConnected) {
      box.hidden = true;
      return;
    }
    const rect = element.getBoundingClientRect();
    box.hidden = false;
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${Math.max(0, rect.width)}px`;
    box.style.height = `${Math.max(0, rect.height)}px`;
    box.querySelector("span").textContent = isHover ? elementLabel(element) : selectedSelector;
  }

  function updateSelectionOverlays() {
    if (selected) {
      positionBox(selectionBox, selected, false);
      updateBoxModelReadout();
    }
  }

  function updateBoxModelReadout() {
    if (!selected) {
      selectionBoxModel.textContent = "";
      return;
    }
    const rect = selected.getBoundingClientRect();
    const style = getComputedStyle(selected);
    const margin = [style.marginTop, style.marginRight, style.marginBottom, style.marginLeft].join(" ");
    const padding = [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].join(" ");
    selectionBoxModel.textContent = `${Math.round(rect.width)}×${Math.round(rect.height)} px · 外边距 ${margin} · 内边距 ${padding}`;
  }

  function updateOverlays() {
    const wrap = document.querySelector(".wrap") || document.body;
    const rect = wrap.getBoundingClientRect();
    gridOverlay.style.display = gridToggle.checked ? "grid" : "none";
    gridOverlay.style.left = `${rect.left + window.scrollX}px`;
    gridOverlay.style.width = `${rect.width}px`;
    gridOverlay.style.height = `${Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)}px`;
    gridOverlay.style.gap = getComputedStyle(root).getPropertyValue("--gap").trim();
    baselineOverlay.style.display = baselineToggle.checked ? "block" : "none";

    let boxStyle = document.getElementById(BOX_STYLE_ID);
    if (boxesToggle.checked) {
      if (!boxStyle) {
        boxStyle = document.createElement("style");
        boxStyle.id = BOX_STYLE_ID;
        document.head.append(boxStyle);
      }
      boxStyle.textContent = `
        .site-home :is(.masthead,.hero,.section-head,.project,.writing-list,.poetry-preview,.photo-sequence),
        .site-home .hero > * { outline: 1px solid rgba(255, 0, 140, .42) !important; outline-offset: -1px; }
      `;
    } else if (boxStyle) {
      boxStyle.remove();
    }
  }

  function updateAllOverlays() {
    updateOverlays();
    updateSelectionOverlays();
  }

  function resetAll() {
    stopInlineEditing();
    Object.entries(pageEdits()).forEach(([selector, edit]) => {
      if (edit.originalHTML == null) return;
      try {
        const target = document.querySelector(selector);
        if (target) target.innerHTML = edit.originalHTML;
      } catch {}
    });
    localStorage.removeItem(STORAGE_KEY);
    changed.clear();
    for (const key of Object.keys(state)) delete state[key];
    state.elementEdits = { [PAGE_KEY]: {} };
    groups.flatMap(group => group.controls).forEach(control => { state[control.id] = initial[control.id]; });
    gridControls.forEach(control => { state[control.id] = initial[control.id]; });
    state.grid = true;
    state.baseline = false;
    state.boxes = false;
    panel.querySelectorAll("[data-control]").forEach(input => {
      const control = findControl(input.dataset.control);
      input.value = state[control.id];
      input.nextElementSibling.textContent = formatValue(state[control.id], control.unit);
    });
    gridToggle.checked = true;
    baselineToggle.checked = false;
    boxesToggle.checked = false;
    apply();
    if (selected) {
      textArea.value = selected.textContent || "";
      fillVisualControls();
    }
    updateAllOverlays();
    persist();
  }

  function updateReadout() {
    if (picking) return;
    const globalCount = changed.size;
    const elementCount = Object.keys(pageEdits()).length;
    const parts = [];
    if (globalCount) parts.push(`${globalCount} 项全局修改`);
    if (elementCount) parts.push(`${elementCount} 个元素修改`);
    if (selected) parts.push(`已选 ${elementLabel(selected)}`);
    readout.textContent = parts.length ? `${parts.join(" · ")} · 仅本地` : "选择一个元素进行检查";
  }

  function cssText() {
    return overrideStyle.textContent.trim() || "/* 暂无设计调节器 CSS 修改。 */";
  }

  function patchObject() {
    return {
      page: PAGE_KEY,
      generatedBy: "Hanpu Li local Design Tuner",
      css: cssText(),
      elements: Object.entries(pageEdits()).map(([selector, edit]) => ({
        selector,
        tag: edit.tag,
        styles: edit.styles || {},
        contentChanged: edit.html != null && edit.html !== edit.originalHTML,
        originalHTML: edit.originalHTML,
        html: edit.html ?? edit.originalHTML
      }))
    };
  }

  async function copyCSS() {
    await copyText(cssText());
    flash("CSS 已复制");
  }

  async function copyPatch() {
    await copyText(JSON.stringify(patchObject(), null, 2));
    flash("修改记录已复制");
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
  }

  function flash(message) {
    const original = readout.textContent;
    readout.textContent = message;
    window.setTimeout(() => { readout.textContent = original; }, 1100);
  }

  function keepTunerOnInternalLinks() {
    document.querySelectorAll("a[href]").forEach(link => {
      const rawHref = link.getAttribute("href");
      if (!rawHref || rawHref.startsWith("#")) return;
      try {
        const url = new URL(rawHref, location.href);
        if (url.origin !== location.origin) return;
        if (!/^https?:$/.test(url.protocol)) return;
        url.searchParams.set("tune", "1");

        // Keep the DOM href attribute site-relative. Turning it into a localhost
        // absolute URL makes the production external-link CSS label it “external”.
        link.setAttribute("href", `${url.pathname}${url.search}${url.hash}`);
      } catch {}
    });
  }

  function isTunerUi(node) {
    return node instanceof Element && Boolean(node.closest(
      ".design-tuner, .design-tuner-grid-overlay, .design-tuner-baseline-overlay, .design-tuner-hover-box, .design-tuner-selection-box"
    ));
  }

  function isEditableControl(node) {
    return node instanceof Element && Boolean(node.closest("input, textarea, select, [contenteditable='true']"));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  }
})();