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
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
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
  const t = h('div', { class: 'toast ' + kind, role: 'status' }, msg);
  wrap.append(t);
  setTimeout(() => t.remove(), 4200);
}

let liveLast = 0;
export function announce(msg) {
  const now = Date.now();
  if (now - liveLast < 3000) return;
  liveLast = now;
  document.getElementById('live').textContent = msg;
}

export function tooltipFor(el, text) {
  const tip = document.getElementById('tooltip');
  el.addEventListener('pointerenter', () => {
    const r = el.getBoundingClientRect();
    tip.textContent = typeof text === 'function' ? text() : text;
    tip.classList.add('show');
    const tr = tip.getBoundingClientRect();
    let x = r.right + 8, y = r.top + r.height / 2 - tr.height / 2;
    if (x + tr.width > innerWidth - 8) x = r.left - tr.width - 8;
    if (x < 8) { x = r.left + r.width / 2 - tr.width / 2; y = r.bottom + 6; }
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
  });
  el.addEventListener('pointerleave', () => tip.classList.remove('show'));
}

export function openModal(title, body, { wide = false } = {}) {
  const back = document.getElementById('modalBack');
  const modal = document.getElementById('modal');
  modal.innerHTML = '';
  modal.style.width = wide ? 'min(980px, 100%)' : '';
  const close = h('button', { class: 'btn icon', 'aria-label': 'Close', onclick: closeModal }, icon('close'));
  modal.append(h('header', {}, h('h2', {}, title), close), h('div', { class: 'body' }, body));
  back.classList.add('show');
  back.onclick = (e) => { if (e.target === back) closeModal(); };
  close.focus();
}
export function closeModal() { document.getElementById('modalBack').classList.remove('show'); }

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
