"use strict";

// Injected on demand from the toolbar button. The first run builds the
// overlay, every later run toggles its visibility.
(() => {
  if (window.__pixelGuides) {
    window.__pixelGuides.toggle();
    return;
  }

  const RULER = 20; // ruler thickness in px
  const SNAP = 6; // snap distance to element edges while dragging, in px
  const STORAGE_KEY = "pixel-guides:" + location.origin + location.pathname;

  // Guide positions are in document coordinates so they stay attached to the
  // page content while scrolling. Each guide is { axis: "x" | "y", pos, el }.
  const state = { guides: [], center: false, grid: 0, inspect: false };
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    if (saved) {
      state.guides = saved.guides || [];
      state.center = Boolean(saved.center);
      state.grid = Number(saved.grid) || 0;
    }
  } catch {
    // Ignore unreadable storage.
  }

  const host = document.createElement("div");
  host.id = "pixel-guides";
  host.style.setProperty("--ruler", RULER + "px");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host {
        all: initial;
        position: fixed; inset: 0; z-index: 2147483647;
        pointer-events: none;
        font: 11px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        color: #fff;
      }
      :host([hidden]) { display: none; }
      * { box-sizing: border-box; }
      [hidden] { display: none !important; }

      .capture { position: fixed; inset: 0; pointer-events: auto; cursor: crosshair; }

      .ruler { position: fixed; pointer-events: auto; }
      .ruler.top { top: 0; left: var(--ruler); cursor: row-resize; }
      .ruler.left { top: var(--ruler); left: 0; cursor: col-resize; }
      .corner { position: fixed; top: 0; left: 0; width: var(--ruler); height: var(--ruler); background: #1f2328; }

      .grid {
        position: fixed; inset: 0;
        /* Faint lines every cell, a stronger line every fourth cell. */
        background-image:
          linear-gradient(to right, rgba(43, 179, 255, 0.35) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(43, 179, 255, 0.35) 1px, transparent 1px),
          linear-gradient(to right, rgba(43, 179, 255, 0.12) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(43, 179, 255, 0.12) 1px, transparent 1px);
      }

      .center { position: fixed; }
      .center.x { left: 50%; top: 0; bottom: 0; border-left: 1px dashed rgba(255, 79, 163, 0.8); }
      .center.y { top: 50%; left: 0; right: 0; border-top: 1px dashed rgba(255, 79, 163, 0.8); }

      .guide { position: fixed; pointer-events: auto; }
      .guide.y { left: 0; right: 0; height: 7px; cursor: row-resize; }
      .guide.x { top: 0; bottom: 0; width: 7px; cursor: col-resize; }
      .guide::before { content: ""; position: absolute; background: #2bb3ff; }
      .guide.y::before { top: 3px; left: 0; right: 0; height: 1px; }
      .guide.x::before { left: 3px; top: 0; bottom: 0; width: 1px; }
      .guide.snap::before { background: #ff4fa3; }
      .guide .label {
        position: absolute; padding: 2px 4px; border-radius: 3px;
        background: #2bb3ff; white-space: nowrap;
      }
      .guide.snap .label { background: #ff4fa3; }
      .guide.active::before { background: #ffd166; }
      .guide.active .label { background: #ffd166; color: #1f2328; }
      .guide.y .label { left: calc(var(--ruler) + 4px); top: 5px; }
      .guide.x .label { top: calc(var(--ruler) + 4px); left: 5px; }

      .gap {
        position: fixed; transform: translate(-50%, -50%);
        padding: 2px 4px; border-radius: 3px; background: rgba(31, 35, 40, 0.9);
      }

      .box { position: fixed; border: 1px solid #ff4fa3; background: rgba(255, 79, 163, 0.08); }
      .ext { position: fixed; }
      .ext.h { left: 0; right: 0; border-top: 1px dashed rgba(255, 79, 163, 0.6); }
      .ext.v { top: 0; bottom: 0; border-left: 1px dashed rgba(255, 79, 163, 0.6); }
      .info {
        position: fixed; max-width: 360px;
        padding: 6px 8px; border-radius: 4px; background: #1f2328; line-height: 1.6;
        white-space: pre; overflow: hidden; text-overflow: ellipsis;
      }
      .info b { color: #ff4fa3; font-weight: 600; }

      .panel {
        position: fixed; right: 12px; bottom: 12px; pointer-events: auto;
        display: flex; gap: 4px; padding: 4px; border-radius: 6px; background: #1f2328;
        font: 500 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      }
      .panel button, .panel select {
        all: unset; cursor: pointer; padding: 6px 10px; border-radius: 4px; color: #fff;
      }
      .panel button:hover, .panel select:hover { background: #3a3f45; }
      .panel button.on, .panel select.on { background: #2bb3ff; }
      .panel select option { background: #1f2328; color: #fff; }
    </style>
    <div class="capture" hidden></div>
    <canvas class="ruler top"></canvas>
    <canvas class="ruler left"></canvas>
    <div class="corner"></div>
    <div class="grid" hidden></div>
    <div class="center x" hidden></div>
    <div class="center y" hidden></div>
    <div class="guides"></div>
    <div class="gaps"></div>
    <div class="box" hidden></div>
    <div class="ext h" hidden></div>
    <div class="ext h" hidden></div>
    <div class="ext v" hidden></div>
    <div class="ext v" hidden></div>
    <div class="info" hidden></div>
    <div class="panel">
      <button data-action="inspect" title="Hover elements to see their box, size and spacing. Click to add guides at its edges, Shift+click for its center. Esc exits.">Inspect</button>
      <button data-action="center" title="Dashed lines through the center of the viewport">Center</button>
      <select data-action="grid" title="Grid overlay, aligned to the top left of the page">
        <option value="0">Grid</option>
        <option value="4">4px grid</option>
        <option value="8">8px grid</option>
        <option value="10">10px grid</option>
        <option value="12">12px grid</option>
        <option value="16">16px grid</option>
        <option value="24">24px grid</option>
      </select>
      <button data-action="clear" title="Remove all guides">Clear</button>
      <button data-action="close" title="Hide Pixel Guides (click the toolbar button to show again)">×</button>
    </div>
  `;

  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => [...root.querySelectorAll(selector)];
  const capture = $(".capture");
  const rulerTop = $(".ruler.top");
  const rulerLeft = $(".ruler.left");
  const centerLines = $$(".center");
  const grid = $(".grid");
  const gridSelect = $(".panel select");
  const guidesEl = $(".guides");
  const gapsEl = $(".gaps");
  const box = $(".box");
  const [extTop, extBottom] = $$(".ext.h");
  const [extLeft, extRight] = $$(".ext.v");
  const info = $(".info");
  const buttons = Object.fromEntries($$(".panel button").map((b) => [b.dataset.action, b]));

  function save() {
    const guides = state.guides.map(({ axis, pos }) => ({ axis, pos }));
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ guides, center: state.center, grid: state.grid }));
    } catch {
      // Storage may be unavailable; guides then live for this page view only.
    }
  }

  // Topmost page element under a viewport point, ignoring the overlay itself.
  function elementAt(x, y) {
    return document.elementsFromPoint(x, y).find((el) => el !== host && el !== document.documentElement) || null;
  }

  const fmt = (n) => String(Math.round(n * 10) / 10);

  // ---- Rulers -------------------------------------------------------------

  function drawRuler(canvas, horizontal) {
    const dpr = window.devicePixelRatio || 1;
    const length = (horizontal ? innerWidth : innerHeight) - RULER;
    const w = horizontal ? length : RULER;
    const h = horizontal ? RULER : length;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#1f2328";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#d0d7de";
    ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textBaseline = "top";

    const scroll = horizontal ? scrollX : scrollY;
    const first = Math.floor(scroll / 10) * 10;
    for (let p = first; p < scroll + length; p += 10) {
      const v = p - scroll;
      if (v < 0) continue;
      const tick = p % 100 === 0 ? RULER : p % 50 === 0 ? 8 : 4;
      if (horizontal) {
        ctx.fillRect(v, RULER - tick, 1, tick);
        if (tick === RULER) ctx.fillText(String(p), v + 3, 2);
      } else {
        ctx.fillRect(RULER - tick, v, tick, 1);
        if (tick === RULER) {
          // Rotated so the label reads top to bottom along the ruler.
          ctx.save();
          ctx.translate(RULER - 2, v + 3);
          ctx.rotate(Math.PI / 2);
          ctx.fillText(String(p), 0, 0);
          ctx.restore();
        }
      }
    }
  }

  // ---- Guides -------------------------------------------------------------

  // The last guide that was created, dragged or clicked. Arrow keys nudge it.
  let active = null;

  function setActive(g) {
    if (active) active.el.classList.remove("active");
    active = g;
    if (g) g.el.classList.add("active");
  }

  function positionGuide(g) {
    const scroll = g.axis === "x" ? scrollX : scrollY;
    g.el.style[g.axis === "x" ? "left" : "top"] = g.pos - scroll - 3 + "px";
    g.el.firstElementChild.textContent = g.pos + "px";
  }

  function addGuide(axis, pos) {
    pos = Math.round(pos);
    const existing = state.guides.find((g) => g.axis === axis && g.pos === pos);
    if (existing) return existing;

    const el = document.createElement("div");
    el.className = "guide " + axis;
    el.append(document.createElement("span"));
    el.firstElementChild.className = "label";
    const g = { axis, pos, el };
    el.addEventListener("pointerdown", (e) => startDrag(g, e));
    el.addEventListener("dblclick", () => removeGuide(g));
    guidesEl.append(el);
    state.guides.push(g);
    positionGuide(g);
    setActive(g);
    save();
    return g;
  }

  function removeGuide(g) {
    if (active === g) setActive(null);
    g.el.remove();
    state.guides = state.guides.filter((other) => other !== g);
    save();
  }

  function nudge(g, delta) {
    g.pos = Math.max(0, g.pos + delta);
    positionGuide(g);
    save();
  }

  // Snap a dragged guide to the nearest edge or center of the element under
  // the pointer. Returns the snapped document position or null.
  function snapTo(axis, clientX, clientY, pos) {
    const el = elementAt(clientX, clientY);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const candidates =
      axis === "x"
        ? [r.left, r.right, (r.left + r.right) / 2].map((v) => v + scrollX)
        : [r.top, r.bottom, (r.top + r.bottom) / 2].map((v) => v + scrollY);
    let best = null;
    for (const v of candidates) {
      if (Math.abs(v - pos) <= SNAP && (best === null || Math.abs(v - pos) < Math.abs(best - pos))) best = v;
    }
    return best;
  }

  // While dragging, show the distance to the neighbouring guide on each side.
  function showGaps(g, clientX, clientY) {
    gapsEl.replaceChildren();
    const others = state.guides.filter((o) => o !== g && o.axis === g.axis).map((o) => o.pos);
    const prev = Math.max(...others.filter((p) => p < g.pos));
    const next = Math.min(...others.filter((p) => p > g.pos));
    for (const other of [prev, next]) {
      if (!Number.isFinite(other)) continue;
      const label = document.createElement("div");
      label.className = "gap";
      label.textContent = Math.abs(g.pos - other) + "px";
      const mid = (g.pos + other) / 2;
      if (g.axis === "x") {
        label.style.left = mid - scrollX + "px";
        label.style.top = clientY + "px";
      } else {
        label.style.left = clientX + "px";
        label.style.top = mid - scrollY + "px";
      }
      gapsEl.append(label);
    }
  }

  function startDrag(g, e) {
    e.preventDefault();
    e.stopPropagation();
    setActive(g);
    g.el.setPointerCapture(e.pointerId);

    const move = (e) => {
      const client = g.axis === "x" ? e.clientX : e.clientY;
      const scroll = g.axis === "x" ? scrollX : scrollY;
      const raw = client + scroll;
      const snapped = e.shiftKey ? null : snapTo(g.axis, e.clientX, e.clientY, raw);
      g.pos = Math.round(snapped ?? raw);
      g.el.classList.toggle("snap", snapped !== null);
      positionGuide(g);
      showGaps(g, e.clientX, e.clientY);
    };
    const end = (e) => {
      g.el.removeEventListener("pointermove", move);
      g.el.removeEventListener("pointerup", end);
      g.el.removeEventListener("pointercancel", end);
      g.el.classList.remove("snap");
      gapsEl.replaceChildren();
      const client = g.axis === "x" ? e.clientX : e.clientY;
      const duplicate = state.guides.some((o) => o !== g && o.axis === g.axis && o.pos === g.pos);
      if (client < RULER || duplicate) removeGuide(g);
      else save();
    };
    g.el.addEventListener("pointermove", move);
    g.el.addEventListener("pointerup", end);
    g.el.addEventListener("pointercancel", end);
  }

  rulerTop.addEventListener("pointerdown", (e) => startDrag(addGuide("y", e.clientY + scrollY), e));
  rulerLeft.addEventListener("pointerdown", (e) => startDrag(addGuide("x", e.clientX + scrollX), e));

  // ---- Inspect mode -------------------------------------------------------

  let hovered = null;
  let pointer = null; // last pointer position while inspecting

  function describe(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    const classes = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean) : [];
    if (classes.length) s += "." + classes.slice(0, 2).join(".");
    return s;
  }

  // Nearest ancestor that has a box of its own. Skips display: contents
  // wrappers and collapsed elements, which would give meaningless distances.
  function container(el) {
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const r = p.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return p;
    }
    return null;
  }

  function showBox(el, clientX, clientY) {
    hovered = el;
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    extTop.style.top = r.top + "px";
    extBottom.style.top = r.bottom + "px";
    extLeft.style.left = r.left + "px";
    extRight.style.left = r.right + "px";

    const name = document.createElement("b");
    name.textContent = describe(el);
    const lines = [`  ${fmt(r.width)} × ${fmt(r.height)}`];
    const parent = container(el);
    if (parent) {
      const p = parent.getBoundingClientRect();
      const left = r.left - p.left;
      const right = p.right - r.right;
      const top = r.top - p.top;
      const bottom = p.bottom - r.bottom;
      const centeredX = Math.abs(left - right) < 0.5 ? "  centered" : "";
      const centeredY = Math.abs(top - bottom) < 0.5 ? "  centered" : "";
      lines.push(`in ${describe(parent)}`);
      lines.push(`← ${fmt(left)}  ${fmt(right)} →${centeredX}`);
      lines.push(`↑ ${fmt(top)}  ${fmt(bottom)} ↓${centeredY}`);
    }
    info.replaceChildren(name, lines.join("\n"));

    const infoRect = info.getBoundingClientRect();
    const x = clientX + 16 + infoRect.width > innerWidth ? clientX - 16 - infoRect.width : clientX + 16;
    const y = clientY + 16 + infoRect.height > innerHeight ? clientY - 16 - infoRect.height : clientY + 16;
    info.style.left = Math.max(0, x) + "px";
    info.style.top = Math.max(0, y) + "px";

    for (const el of [box, extTop, extBottom, extLeft, extRight, info]) el.hidden = false;
  }

  function hideBox() {
    hovered = null;
    for (const el of [box, extTop, extBottom, extLeft, extRight, info]) el.hidden = true;
  }

  function setInspect(on) {
    state.inspect = on;
    capture.hidden = !on;
    buttons.inspect.classList.toggle("on", on);
    if (!on) hideBox();
  }

  // Re-evaluates the element under the pointer, also after scrolling.
  function refreshBox() {
    if (!state.inspect || !pointer) return;
    const el = elementAt(pointer.x, pointer.y);
    if (el) showBox(el, pointer.x, pointer.y);
    else hideBox();
  }

  capture.addEventListener("pointermove", (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    refreshBox();
  });
  capture.addEventListener("pointerleave", () => {
    pointer = null;
    hideBox();
  });
  capture.addEventListener("click", (e) => {
    if (!hovered) return;
    const r = hovered.getBoundingClientRect();
    if (e.shiftKey) {
      addGuide("x", (r.left + r.right) / 2 + scrollX);
      addGuide("y", (r.top + r.bottom) / 2 + scrollY);
    } else {
      addGuide("x", r.left + scrollX);
      addGuide("x", r.right + scrollX);
      addGuide("y", r.top + scrollY);
      addGuide("y", r.bottom + scrollY);
    }
  });

  // ---- Panel and lifecycle -------------------------------------------------

  function positionGrid() {
    if (!state.grid) return;
    const major = `${-(scrollX % (state.grid * 4))}px ${-(scrollY % (state.grid * 4))}px`;
    const minor = `${-(scrollX % state.grid)}px ${-(scrollY % state.grid)}px`;
    grid.style.backgroundPosition = `${major}, ${major}, ${minor}, ${minor}`;
  }

  function setGrid(size) {
    state.grid = size;
    grid.hidden = !size;
    const major = `${size * 4}px ${size * 4}px`;
    const minor = `${size}px ${size}px`;
    grid.style.backgroundSize = `${major}, ${major}, ${minor}, ${minor}`;
    gridSelect.value = String(size);
    gridSelect.classList.toggle("on", size > 0);
    positionGrid();
    save();
  }

  function setCenter(on) {
    state.center = on;
    for (const line of centerLines) line.hidden = !on;
    buttons.center.classList.toggle("on", on);
    save();
  }

  buttons.inspect.addEventListener("click", () => setInspect(!state.inspect));
  buttons.center.addEventListener("click", () => setCenter(!state.center));
  gridSelect.addEventListener("change", () => {
    setGrid(Number(gridSelect.value));
    gridSelect.blur();
  });
  buttons.clear.addEventListener("click", () => {
    for (const g of [...state.guides]) removeGuide(g);
  });
  buttons.close.addEventListener("click", () => toggle());

  const NUDGE = { x: { ArrowLeft: -1, ArrowRight: 1 }, y: { ArrowUp: -1, ArrowDown: 1 } };
  const isEditing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  document.addEventListener(
    "keydown",
    (e) => {
      if (host.hidden) return;
      if (e.key === "Escape") {
        if (state.inspect) setInspect(false);
        else if (active) setActive(null);
        else return;
        e.stopPropagation();
        return;
      }
      if (!active || isEditing(document.activeElement) || isEditing(root.activeElement)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        removeGuide(active);
      } else if (e.key in NUDGE[active.axis]) {
        nudge(active, NUDGE[active.axis][e.key] * (e.shiftKey ? 10 : 1));
      } else {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );

  let frame = 0;
  function render() {
    frame = 0;
    if (host.hidden) return;
    drawRuler(rulerTop, true);
    drawRuler(rulerLeft, false);
    for (const g of state.guides) positionGuide(g);
    positionGrid();
    refreshBox();
  }
  function scheduleRender() {
    if (!frame) frame = requestAnimationFrame(render);
  }
  // Capture phase so scrolling inside nested containers also refreshes the inspector.
  addEventListener("scroll", scheduleRender, { passive: true, capture: true });
  addEventListener("resize", scheduleRender);

  function toggle() {
    host.hidden = !host.hidden;
    if (host.hidden) setInspect(false);
    else render();
  }

  // Restored guides need their elements created.
  const restored = state.guides;
  state.guides = [];
  for (const { axis, pos } of restored) addGuide(axis, pos);
  setActive(null);
  setCenter(state.center);
  setGrid(state.grid);

  document.documentElement.append(host);
  render();
  window.__pixelGuides = { toggle };
})();
