// DOM & formatting helpers.

// replaceChildren/append stringify null and arrays: flatten and drop empties instead.
for (const m of ['replaceChildren', 'append', 'prepend']) {
  const orig = Element.prototype[m];
  Element.prototype[m] = function (...kids) { return orig.apply(this, kids.flat(Infinity).filter((k) => k != null && k !== false)); };
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

const SVGNS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
  for (const c of children.flat()) if (c) el.append(c);
  return el;
}

export const icon = (id) => {
  const svg = document.createElementNS(SVGNS, 'svg');
  const use = document.createElementNS(SVGNS, 'use');
  use.setAttribute('href', '#i-' + id);
  svg.append(use);
  return svg;
};

export function fmt(v, d = 1) {
  if (v == null || !Number.isFinite(v)) return '—';
  const t = v.toFixed(d);
  // A value that rounds to zero has no sign ("−0" reads as an error).
  return /^-0(\.0+)?$/.test(t) ? t.slice(1) : t.replace('-', '−');
}
/** A flow rate in L/min to one decimal. A small but real flow reads "< 0.1" rather than 0.0, so
 *  a trickle through a collateral never looks like none. */
export function fmtFlow(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a > 0.0005 && a < 0.05) return (v < 0 ? '−' : '') + '< 0.1';
  return fmt(v, 1);
}
const unitConv = {
  pressure: {
    mmHg: { f: (v) => v, d: 1, u: 'mmHg' },
    cmH2O: { f: (v) => v * 1.36, d: 1, u: 'cmH₂O' },
    kPa: { f: (v) => v * 0.1333, d: 2, u: 'kPa' },
  },
  flow: {
    'L/min': { f: (v) => v, d: 1, u: 'L/min' },
    'mL/min': { f: (v) => v * 1000, d: 0, u: 'mL/min' },
  },
};
export const units = { pressure: 'mmHg', flow: 'L/min' };
export function fp(v) { const c = unitConv.pressure[units.pressure]; return [fmt(c.f(v), c.d), c.u]; }
export function ff(v) { const c = unitConv.flow[units.flow]; return [units.flow === 'L/min' ? fmtFlow(v) : fmt(c.f(v), c.d), c.u]; }

// Messages go to a quiet line in the status row above the timeline, never over the figure.
// Settings → "Pop-up notices" brings back the cards at the top.
let popPref;
export const popupsOn = () => { if (popPref === undefined) { try { popPref = localStorage.getItem('pps.popups') === '1'; } catch { popPref = false; } } return popPref; };
export function setPopups(on) { popPref = !!on; try { localStorage.setItem('pps.popups', on ? '1' : '0'); } catch { /* storage unavailable */ } }
let noteTimer = 0;
function inlineNote(msg, kind) {
  const row = document.getElementById('vdStatus');
  if (!row?.closest('.vdock')?.offsetParent) return false;
  let n = row.querySelector('.vd-note');
  if (!n) {
    n = h('span', { class: 'vd-note', role: 'status' });
    n.addEventListener('click', () => { clearTimeout(noteTimer); n.hidden = true; row.classList.remove('noting'); });
    row.append(n);
  }
  n.className = 'vd-note ' + kind; n.textContent = msg; n.title = msg; n.hidden = false;
  row.classList.add('noting');
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { n.hidden = true; row.classList.remove('noting'); }, 4200);
  return true;
}

export function toast(msg, kind = '') {
  if (!msg) return;
  if (!popupsOn() && inlineNote(msg, kind)) return;
  const wrap = document.getElementById('toasts');
  // One message at a time reads calmer than a growing stack.
  while (wrap.children.length >= 2) wrap.firstChild.remove();
  // A card slides down from behind the top bars and settles just below them (below every row on a phone).
  const bars = document.getElementById('topbar');
  const r = document.querySelector('.vdock')?.offsetParent && bars?.getBoundingClientRect();
  wrap.classList.toggle('docked', !!(r && r.height));
  if (r && r.height) {
    const w = Math.min(innerWidth - 24, 560);
    Object.assign(wrap.style, { left: `${(innerWidth - w) / 2 - 20}px`, width: `${w + 40}px`, top: `${r.bottom}px`, bottom: 'auto', height: '', maxWidth: 'none' });
  }
  const t = h('div', { class: 'toast ' + kind, role: 'status' }, h('span', { class: 'toast-msg' }, msg));
  let timer = 0;
  const close = () => { clearTimeout(timer); t.classList.add('leaving'); setTimeout(() => t.remove(), 340); };
  const x = h('button', { class: 'toast-x', 'aria-label': 'Dismiss' }, icon('close'));
  x.addEventListener('click', (e) => { e.stopPropagation(); close(); });
  t.append(x);
  t.addEventListener('click', close);
  // Swipe down (or sideways) to dismiss.
  let sx = 0, sy = 0;
  t.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
  t.addEventListener('pointerup', (e) => { if (Math.abs(e.clientY - sy) > 18 || Math.abs(e.clientX - sx) > 40) close(); });
  wrap.append(t);
  // Fill the docked card: the largest size that fits, stepping down for longer text, never clipped.
  if (wrap.classList.contains('docked')) {
    const m = t.querySelector('.toast-msg');
    if (msg.length > 60) t.style.height = '84px';
    let px = msg.length <= 28 ? 20 : msg.length <= 60 ? 17 : 15;
    for (; px > 12; px--) { m.style.fontSize = `${px}px`; if (m.scrollHeight <= t.clientHeight - 8 && m.scrollWidth <= m.clientWidth) break; }
  }
  timer = setTimeout(close, 4200);
}

let liveLast = 0;
export function announce(msg) {
  const now = Date.now();
  if (now - liveLast < 3000) return;
  liveLast = now;
  document.getElementById('live').textContent = msg;
}

/** Hover/focus tooltip. `text` may be a string, a function, or { text, key }. `side`: 'right' | 'bottom'. */
export function tooltipFor(el, text, side = 'right') {
  const tip = document.getElementById('tooltip');
  const show = () => {
    const r = el.getBoundingClientRect();
    const v = typeof text === 'function' ? text() : text;
    tip.replaceChildren(typeof v === 'object' ? [v.text, v.key ? h('kbd', {}, v.key) : null] : v);
    tip.classList.add('show');
    const tr = tip.getBoundingClientRect();
    let x, y;
    if (side === 'bottom') { x = r.left + r.width / 2 - tr.width / 2; y = r.bottom + 8; }
    else if (side === 'top') { x = r.left + r.width / 2 - tr.width / 2; y = r.top - tr.height - 8; }
    else {
      x = r.right + 10; y = r.top + r.height / 2 - tr.height / 2;
      if (x + tr.width > innerWidth - 8) x = r.left - tr.width - 10;
    }
    tip.style.left = clamp(x, 8, innerWidth - tr.width - 8) + 'px'; tip.style.top = clamp(y, 8, innerHeight - tr.height - 8) + 'px';
  };
  const hide = () => tip.classList.remove('show');
  el.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') show(); });
  el.addEventListener('pointerleave', hide);
  el.addEventListener('focus', () => { if (el.matches(':focus-visible')) show(); });
  el.addEventListener('blur', hide);
  el.addEventListener('click', hide);
}

/** Floating menu/popover anchored to an element. Closes on outside click, Escape or re-open. */
let openMenu = null;
export function popover(anchor, content, { cls = '', align = 'start', place = 'below', onClose } = {}) {
  if (openMenu) { const same = openMenu.anchor === anchor; closePopover(); if (same) return null; }
  const el = h('div', { class: 'menu ' + cls, role: 'dialog' }, content);
  document.body.append(el);
  const r = anchor.getBoundingClientRect(), mr = el.getBoundingClientRect();
  let x = align === 'end' ? r.right - mr.width : align === 'center' ? r.left + r.width / 2 - mr.width / 2 : r.left;
  let y = place === 'above' ? r.top - mr.height - 8 : r.bottom + 8;
  if (y + mr.height > innerHeight - 8) y = Math.max(8, r.top - mr.height - 8);
  el.style.left = clamp(x, 8, innerWidth - mr.width - 8) + 'px';
  el.style.top = clamp(y, 8, innerHeight - mr.height - 8) + 'px';
  const off = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) closePopover(); };
  const esc = (e) => { if (e.key === 'Escape') closePopover(); };
  setTimeout(() => { addEventListener('pointerdown', off, true); addEventListener('keydown', esc); }, 0);
  openMenu = { el, anchor, cleanup: () => { removeEventListener('pointerdown', off, true); removeEventListener('keydown', esc); onClose?.(); } };
  anchor.setAttribute('aria-expanded', 'true');
  return el;
}
export function closePopover() {
  if (!openMenu) return;
  openMenu.el.remove(); openMenu.anchor.setAttribute('aria-expanded', 'false'); openMenu.cleanup();
  openMenu = null;
}
export function menuItem(label, { checked, onClick, kb, icon: ic } = {}) {
  // A toggle with an icon keeps its icon (so every row in a group has one) and shows its state
  // as a trailing check.
  const toggle = checked != null && ic;
  const b = h('button', { class: 'menu-item', role: toggle ? 'menuitemcheckbox' : checked != null ? 'menuitemradio' : 'menuitem', 'aria-checked': checked != null ? String(!!checked) : null },
    toggle ? svgIcon(ic, 'mi-ic') : checked != null ? svgIcon('check', 'mi-check') : ic ? svgIcon(ic, 'mi-ic') : null, h('span', {}, label), kb ? h('span', { class: 'kb' }, kb) : null,
    toggle ? svgIcon('check', 'mi-check mi-trail') : null);
  b.addEventListener('click', (e) => { onClick?.(e); });
  return b;
}
export function svgIcon(id, cls = '') {
  const el = icon(id); if (cls) el.setAttribute('class', cls); return el;
}

/** Wrap a sideways-scrolling row so a phone can see that more lies off either edge: soft fades and a
 *  small chevron (tap to scroll) on whichever side has hidden items, eased in and out as it scrolls. */
export function scrollCue(scroller) {
  const step = (dir) => scroller.scrollBy({ left: dir * scroller.clientWidth * 0.6, behavior: 'smooth' });
  const edge = (cls, dir, id) => h('button', { class: 'cue-edge ' + cls, type: 'button', tabindex: '-1', 'aria-hidden': 'true', 'aria-label': dir < 0 ? 'Scroll tabs left' : 'Scroll tabs right', onclick: () => step(dir) }, icon(id));
  const box = h('div', { class: 'tabs-cue' }, scroller, edge('cue-l', -1, 'chev-left'), edge('cue-r', 1, 'chev-right'));
  const update = () => {
    const max = scroller.scrollWidth - scroller.clientWidth;
    box.classList.toggle('more-l', scroller.scrollLeft > 2);
    box.classList.toggle('more-r', scroller.scrollLeft < max - 2);
  };
  scroller.addEventListener('scroll', update, { passive: true });
  if (typeof ResizeObserver === 'function') new ResizeObserver(update).observe(scroller);
  requestAnimationFrame(update);
  return box;
}

let modalReturn = null;
export function openModal(title, body, { wide = false, sub = null, bare = false } = {}) {
  const back = document.getElementById('modalBack');
  const modal = document.getElementById('modal');
  modalReturn = document.activeElement;
  modal.innerHTML = '';
  modal.style.width = wide ? 'min(960px, 100%)' : '';
  modal.setAttribute('aria-label', title || 'Dialog');
  const close = h('button', { class: 'ib', 'aria-label': 'Close', onclick: closeModal }, icon('close'));
  modal.append(h('header', {}, h('div', { style: { flex: 1, minWidth: 0 } }, bare ? null : h('h2', {}, title), sub ? h('div', { class: 'sub' }, sub) : null), close), h('div', { class: 'body' }, body));
  back.classList.add('show');
  back.onclick = (e) => { if (e.target === back) closeModal(); };
  (modal.querySelector('.body button, .body [tabindex]') || close).focus({ preventScroll: true });
}
export function closeModal() {
  const back = document.getElementById('modalBack');
  if (!back.classList.contains('show')) return;
  back.classList.remove('show');
  modalReturn?.focus?.({ preventScroll: true });
}
export const isModalOpen = () => document.getElementById('modalBack').classList.contains('show');

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/** A touch that starts on the phone's own edge (the home indicator's swipe up, a back swipe): the
 *  system's gesture, not the figure's. */
export const systemEdge = (ev) => ev.pointerType === 'touch' && (ev.clientY > innerHeight - 34 || ev.clientX < 12 || ev.clientX > innerWidth - 12);
export const lerp = (a, b, t) => a + (b - a) * t;

// Theme tokens are read many times per frame by the canvas instruments. getComputedStyle after
// the frame's DOM writes forces a style pass, so values are cached and dropped when the theme
// can change (the data-theme attribute or the system color scheme).
const varCache = new Map();
new MutationObserver(() => varCache.clear()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => varCache.clear());
export function cssVar(name) {
  let v = varCache.get(name);
  if (v === undefined) { v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); varCache.set(name, v); }
  return v;
}

/** Canvas sized to its box with device-pixel ratio. Returns ctx with CSS-pixel units. */
// Each canvas's box is tracked by a ResizeObserver instead of measured on every draw (a
// forced layout when it follows other DOM writes).
const boxes = new WeakMap();
const boxObserver = new ResizeObserver((entries) => { for (const e of entries) boxes.set(e.target, { width: e.contentRect.width, height: e.contentRect.height }); });
export function fitCanvas(canvas) {
  let r = boxes.get(canvas);
  if (!r || r.width < 1 || r.height < 1) {
    const b = canvas.getBoundingClientRect(); r = { width: b.width, height: b.height };
    boxes.set(canvas, r); boxObserver.observe(canvas);
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr)), hh = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}

/** Every range slider in the app, at once (call once):
 *  - a finger anywhere on the track moves the thumb there and drags it (iOS only lets the thumb itself be dragged);
 *  - Shift + arrow keys step ten times as far; the wheel adjusts a slider that has focus;
 *  - a double click puts a slider back to its default (data-def). */
export function enhanceRanges(root = document) {
  const isRange = (t) => t?.matches?.('input[type="range"]:not(:disabled)');
  const setTo = (input, x, commit) => {
    const min = +input.min || 0, max = +(input.max || 100), step = input.step === 'any' ? 0 : +input.step || 1;
    let v = clamp(x, min, max);
    if (step) v = Math.round((v - min) / step) * step + min;
    v = +v.toFixed(6);
    if (+input.value === v && !commit) return;
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (commit) input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const fromX = (input, cx) => {
    const r = input.getBoundingClientRect(), min = +input.min || 0, max = +(input.max || 100), th = 22;
    return min + clamp((cx - r.left - th / 2) / Math.max(1, r.width - th), 0, 1) * (max - min);
  };
  root.addEventListener('pointerdown', (e) => {
    const input = e.target;
    if (e.pointerType !== 'touch' || !isRange(input)) return;
    e.preventDefault();
    input.focus({ preventScroll: true });
    setTo(input, fromX(input, e.clientX));
    try { input.setPointerCapture(e.pointerId); } catch { /* gone */ }
    const move = (ev) => { if (ev.pointerId === e.pointerId) setTo(input, fromX(input, ev.clientX)); };
    const up = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      input.removeEventListener('pointermove', move); input.removeEventListener('pointerup', up); input.removeEventListener('pointercancel', up);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    input.addEventListener('pointermove', move); input.addEventListener('pointerup', up); input.addEventListener('pointercancel', up);
  }, { capture: true });
  root.addEventListener('keydown', (e) => {
    const input = e.target;
    if (!e.shiftKey || !isRange(input) || !/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
    e.preventDefault();
    const step = input.step === 'any' ? ((+input.max - +input.min) / 100) : +input.step || 1;
    setTo(input, +input.value + (e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 10 : -10) * step, true);
  });
  root.addEventListener('wheel', (e) => {
    const input = e.target;
    if (!isRange(input) || document.activeElement !== input) return;
    e.preventDefault();
    const step = input.step === 'any' ? ((+input.max - +input.min) / 100) : +input.step || 1;
    setTo(input, +input.value + (e.deltaY < 0 || e.deltaX > 0 ? 1 : -1) * step * (e.shiftKey ? 10 : 1), true);
  }, { passive: false });
  root.addEventListener('dblclick', (e) => {
    const input = e.target;
    if (!isRange(input) || input.dataset.def == null || input.dataset.def === '') return;
    setTo(input, +input.dataset.def, true);
  });
}

/**
 * Eases an array of values toward a target, frame-rate independent (time constant `tau` seconds),
 * so a chart's line, dots, labels and axis glide rather than jump when the model changes. The
 * Pressure card and the lobule's pressure ladder share it. step(target) → { v, moving }.
 */
export function createEaser(tau = 0.3) {
  let v = null, last = 0;
  return {
    step(target) {
      const now = performance.now(), dt = last ? Math.min(0.25, (now - last) / 1000) : 1;
      last = now;
      if (!v || v.length !== target.length) v = Float64Array.from(target);
      const a = 1 - Math.exp(-dt / tau);
      let moving = false;
      for (let i = 0; i < target.length; i++) {
        const d = target[i] - v[i];
        if (Math.abs(d) > 0.02) { v[i] += d * a; moving = true; } else v[i] = target[i];
      }
      return { v, moving };
    },
  };
}
/** A rounded axis top just above `max` (multiples of 5 mmHg, at least `min`). */
export const axisTop = (max, min = 10) => Math.max(min, Math.ceil((max + 2) / 5) * 5);
