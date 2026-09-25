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
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
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
  return v.toFixed(d).replace('-', '−');
}
export const unitConv = {
  pressure: {
    mmHg: { f: (v) => v, d: 1, u: 'mmHg' },
    cmH2O: { f: (v) => v * 1.36, d: 1, u: 'cmH₂O' },
    kPa: { f: (v) => v * 0.1333, d: 2, u: 'kPa' },
  },
  flow: {
    'L/min': { f: (v) => v, d: 2, u: 'L/min' },
    'mL/min': { f: (v) => v * 1000, d: 0, u: 'mL/min' },
  },
};
export const units = { pressure: 'mmHg', flow: 'L/min' };
export function fp(v) { const c = unitConv.pressure[units.pressure]; return [fmt(c.f(v), c.d), c.u]; }
export function ff(v) { const c = unitConv.flow[units.flow]; return [fmt(c.f(v), c.d), c.u]; }

export function toast(msg, kind = '') {
  const wrap = document.getElementById('toasts');
  // One message at a time reads calmer than a growing stack.
  while (wrap.children.length >= 2) wrap.firstChild.remove();
  const t = h('div', { class: 'toast ' + kind, role: 'status' }, msg);
  wrap.append(t);
  setTimeout(() => { t.classList.add('leaving'); setTimeout(() => t.remove(), 220); }, 3600);
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
  const b = h('button', { class: 'menu-item', role: checked != null ? 'menuitemradio' : 'menuitem', 'aria-checked': checked != null ? String(!!checked) : null },
    checked != null ? svgIcon('check', 'mi-check') : ic ? svgIcon(ic, 'mi-ic') : null, h('span', {}, label), kb ? h('span', { class: 'kb' }, kb) : null);
  b.addEventListener('click', () => { onClick?.(); });
  return b;
}
export function svgIcon(id, cls = '') {
  const el = icon(id); if (cls) el.setAttribute('class', cls); return el;
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
export const lerp = (a, b, t) => a + (b - a) * t;

export function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

/** Canvas sized to its box with device-pixel ratio. Returns ctx with CSS-pixel units. */
export function fitCanvas(canvas) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr)), hh = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}
