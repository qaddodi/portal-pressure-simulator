// DOM & formatting helpers.
import { saver } from './frame.js?v=67ca200c87';

// replaceChildren/append stringify null and arrays: flatten and drop empties instead.
for (const m of ['replaceChildren', 'append', 'prepend']) {
  const orig = Element.prototype[m];
  Element.prototype[m] = function (...kids) { return orig.apply(this, kids.flat(Infinity).filter((k) => k != null && k !== false)); };
}

// The phone's layout: a phone held upright or on its side, and a tablet held upright (Mohammad, 17 Oct: the upright iPad takes
// the phone's cards, sheets, bottom bar and menus). Every phone block in styles/app.css carries the same upright clause.
export const UPRIGHT_MQ = '(max-width: 1100px) and (orientation: portrait)';
export const PHONE_MQ = `(max-width: 767px), (max-width: 1023px) and (max-height: 500px) and (orientation: landscape), ${UPRIGHT_MQ}`;
export const isPhoneLayout = () => matchMedia(PHONE_MQ).matches;
// (A tablet held upright: the phone's layout, scaled to the tablet: its bottom bar and cards take 70 % of the width, centred, as
// its deck cards do, and its cards the phone's share of the height, never the whole screen. styles/app.css, main.js sheetBehaviour.)
export const TABLET_UP_MQ = '(min-width: 768px) and (max-width: 1100px) and (orientation: portrait)';

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
/** A value as fmt prints it, as a number, for the word beside it: a tile never reads "5.0 L · Grade 2". (−0 reads as 0.) */
export const shownOf = (v, d = 1) => (Number.isFinite(v) ? +v.toFixed(d) + 0 : v);
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

// Interface zoom (Settings): screen pixels per CSS pixel of the zoomed page, measured rather than
// read from the setting so browsers that report rectangles either way both place menus right.
export function uiScale() {
  const b = document.body, w = b?.offsetWidth;
  return w ? b.getBoundingClientRect().width / w || 1 : 1;
}

// Messages show as a card at the top, below the bars, never over the bottom bar.
// opts: actions, [[label, fn], …] as buttons after the words (a tap runs it and closes the card); sticky, stays until
// dismissed; onClose, called once when it goes. Returns a function that closes it.
export function toast(msg, kind = '', { actions = null, sticky = false, onClose = null, present = false } = {}) {
  if (!msg) return () => {};
  // While presenting, the projected figure stays clear: only errors, cards with buttons and what the presenter asked for
  // (present: a link copied, a slide number typed) show.
  if (kind !== 'bad' && !actions?.length && !present && document.getElementById('app')?.classList.contains('presenting')) return () => {};
  const wrap = document.getElementById('toasts');
  // One message at a time reads calmer than a growing stack.
  while (wrap.children.length >= 2) wrap.firstChild.remove();
  // A card slides down from behind the top bars and settles just below them (below every row on a phone).
  const bars = document.getElementById('topbar');
  const r = document.querySelector('.vdock')?.offsetParent && bars?.getBoundingClientRect();
  wrap.classList.toggle('docked', !!(r && r.height));
  if (r && r.height) {
    const z = uiScale(), W = innerWidth / z, w = Math.min(W - 24, 560);
    Object.assign(wrap.style, { left: `${(W - w) / 2 - 20}px`, width: `${w + 40}px`, top: `${r.bottom / z}px`, bottom: 'auto', height: '', maxWidth: 'none' });
  }
  const t = h('div', { class: 'toast ' + kind, role: 'status' }, h('span', { class: 'toast-msg' }, msg));
  let timer = 0, gone = false;
  const close = () => { if (gone) return; gone = true; clearTimeout(timer); onClose?.(); t.classList.add('leaving'); setTimeout(() => t.remove(), 340); };
  if (actions?.length) {
    t.classList.add('has-acts');
    t.append(h('span', { class: 'toast-acts' }, ...actions.map(([label, fn]) => {
      const b = h('button', { class: 'btn sm' }, label);
      b.addEventListener('click', (e) => { e.stopPropagation(); close(); fn(); });
      return b;
    })));
  }
  const x = h('button', { class: 'toast-x', 'aria-label': 'Dismiss' }, icon('close'));
  x.addEventListener('click', (e) => { e.stopPropagation(); close(); });
  t.append(x);
  t.addEventListener('click', close);
  // Swipe down (or sideways) to dismiss.
  let sx = 0, sy = 0;
  t.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
  t.addEventListener('pointerup', (e) => { if (Math.abs(e.clientY - sy) > 18 || Math.abs(e.clientX - sx) > 40) close(); });
  // (A card pushed out by newer ones still counts as closed.)
  if (onClose) new MutationObserver((_, ob) => { if (!t.isConnected) { ob.disconnect(); if (!gone) { gone = true; clearTimeout(timer); onClose?.(); } } }).observe(wrap, { childList: true });
  wrap.append(t);
  // Fill the docked card: the largest size that fits, stepping down for longer text, never clipped.
  if (wrap.classList.contains('docked')) {
    const m = t.querySelector('.toast-msg');
    if (msg.length > 60 || actions?.length) t.style.height = '84px';
    let px = msg.length <= 28 ? 20 : msg.length <= 60 ? 17 : 15;
    const room = t.clientHeight - 8 - (actions?.length ? t.querySelector('.toast-acts').offsetHeight + 6 : 0);
    for (; px > 12; px--) { m.style.fontSize = `${px}px`; if (m.scrollHeight <= room && m.scrollWidth <= m.clientWidth) break; }
  }
  if (!sticky) timer = setTimeout(close, 4200);
  return close;
}

// (Announcements close together are coalesced, never dropped: live.js.)
export { announce } from './live.js?v=c7e9ac862b';

/** Hover/focus tooltip. `text` may be a string, a function, or { text, key }. `side`: 'right' | 'bottom'. */
// An ⓘ button: hover (or keyboard focus) shows the tooltip; a tap on touch opens the same text
// under its row instead, easing open, and a second tap or a tap elsewhere closes it.
function closeInfos(except) {
  for (const r of document.querySelectorAll('.info-open')) if (r !== except) { r.classList.remove('info-open'); r.querySelector('.info-i')?.setAttribute('aria-expanded', 'false'); }
}
let infoWired = false;
export function infoButton(text) {
  const b = h('button', { class: 'info-i', type: 'button', 'aria-label': text, 'aria-expanded': 'false' }, icon('info'));
  tooltipFor(b, text);
  if (!infoWired) { infoWired = true; document.addEventListener('pointerdown', (e) => { if (!e.target.closest?.('.info-i, .ac-info')) closeInfos(); }, true); }
  let touch = false;
  b.addEventListener('pointerdown', (e) => { touch = e.pointerType === 'touch' || e.pointerType === 'pen'; });
  b.addEventListener('click', (e) => {
    if (!touch && !matchMedia('(hover: none)').matches) return;
    e.preventDefault(); e.stopPropagation();
    const row = b.closest('.ac-slider, .ctl') || b.parentElement;
    if (!row.querySelector(':scope > .ac-info')) row.append(h('div', { class: 'ac-info' }, h('div', {}, h('p', {}, text))));
    const open = !row.classList.contains('info-open');
    closeInfos(row);
    row.classList.toggle('info-open', open); b.setAttribute('aria-expanded', String(open));
  });
  return b;
}

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
    const z = uiScale();
    tip.style.left = clamp(x, 8, innerWidth - tr.width - 8) / z + 'px'; tip.style.top = clamp(y, 8, innerHeight - tr.height - 8) / z + 'px';
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
const reduceMotionMQ = matchMedia('(prefers-reduced-motion: reduce)');
// One card or menu at a time over the thumb dock: whatever opens while another is still playing its way out waits
// until it has gone (--enter-delay, read by the thumb dock's entrance animations), so the two never overlap.
let goneAt = 0;
/** Notes that a card or menu is playing its way out for the next ms. */
export function markGone(ms) { goneAt = Math.max(goneAt, performance.now() + ms); }
/** Holds a card or menu that is about to come in until the one going out has gone. */
export function enterAfterGone(el) { el.style.setProperty('--enter-delay', Math.round(Math.max(0, goneAt - performance.now())) + 'ms'); }
// sheet: on a phone the menu rises as a bottom sheet (full width, its text wraps) instead of a tall
// popover; pass false for a menu that lays itself out.
/** The bottom of what is visible: above the on-screen keyboard on iOS, where innerHeight does not shrink. */
export const visibleBottom = () => { const v = window.visualViewport; return v ? Math.min(innerHeight, v.offsetTop + v.height) : innerHeight; };
export function popover(anchor, content, { cls = '', align = 'start', place = 'below', onClose, sheet = true } = {}) {
  if (openMenu) { const same = openMenu.anchor === anchor; closePopover(); if (same) return null; }
  const asSheet = sheet && (innerWidth < 768 || matchMedia(UPRIGHT_MQ).matches);
  // (from-dock: over the thumb dock a sheet, or a menu from the dock, rises from behind the tab row; one from the top bar,
  // the Colored-by key on an upright iPad, pops in where it rests, as everywhere else, never sliding up from below it.)
  const fromDock = asSheet || !!anchor.closest?.('.vdock');
  const el = h('div', { class: 'menu ' + cls + (asSheet ? ' as-sheet' : '') + (fromDock ? ' from-dock' : ''), role: 'dialog' }, content);
  enterAfterGone(el);
  document.body.append(el);
  const put = () => {
    if (asSheet) return;
    const r = anchor.getBoundingClientRect(), z = uiScale(), w0 = el.offsetWidth * z;
    let x = align === 'end' ? r.right - w0 : align === 'center' ? r.left + r.width / 2 - w0 / 2 : r.left;
    // A scrolling menu below its button may use all the room down to the 8 px margin, so it ends whole where it fits; never
    // over the bottom bar where the two meet (a phone held sideways: Settings had run 87 px over it; sweep 04 #01).
    let barTop = null, at = place;
    if (place === 'below' && el.classList.contains('app-menu')) {
      const dock = document.getElementById('vdock'), d = dock?.offsetParent ? dock.getBoundingClientRect() : null, xl = clamp(x, 8, innerWidth - w0 - 8);
      if (d && d.height && d.left < xl + w0 && d.right > xl && d.top < visibleBottom()) barTop = d.top;
      // A button low on the screen (the deck nav pill's gear on a Mac or iPad) opens it above, at its full height: below
      // it the room was the 160 px floor, which cut Settings off at "Text size on the figure".
      const below = (barTop ?? visibleBottom()) - r.bottom - 16;
      if (below < el.scrollHeight * z && r.top - 16 > below) { at = 'above'; barTop = null; el.style.maxHeight = (r.top - 16) / z + 'px'; }
      else el.style.maxHeight = Math.max(160, below) / z + 'px';
    }
    // A menu from the thumb dock's tab row sits on the tab row's top edge, 8 px clear of it, over the play bar (which steps
    // aside), like the cards and the phone's sheets: it rises from behind the tab row and is cut on its top line. (Above
    // the whole dock, it had risen out of thin air over the faded play bar, its cut-off shadow left as a ghost there.)
    const bar = anchor.closest('.thumb-bar'), tabTop = bar ? bar.getBoundingClientRect().top : null;
    if (bar && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.style.maxHeight = Math.max(160, tabTop - 16) / z + 'px';
    // Layout size, not the rectangle: the opening animation scales the menu for a moment.
    const mr = { width: el.offsetWidth * z, height: el.offsetHeight * z };
    const top = bar ? tabTop : r.top;
    let y = at === 'above' || bar ? top - mr.height - 8 : r.bottom + 8;
    const vb = visibleBottom();
    if (y + mr.height > vb - 8) y = Math.max(8, top - mr.height - 8);
    el.style.left = clamp(x, 8, innerWidth - mr.width - 8) / z + 'px';
    el.style.top = clamp(y, 8, vb - mr.height - 8) / z + 'px';
    barAt = barTop;
    clipBar();
  };
  // Ending just above the bar, the menu's shadow stops at the bar's top edge, so the bar itself stays as it was (sweep 01
  // review). Measured from the menu as laid out (its height settles after it opens), again whenever it resizes.
  let barAt = null;
  const clipBar = () => {
    const z = uiScale(), gap = barAt == null ? 0 : barAt - (parseFloat(el.style.top) + el.offsetHeight) * z;
    el.style.clipPath = barAt == null ? '' : `inset(-64px -64px ${(-Math.max(0, gap) / z).toFixed(2)}px -64px)`;
  };
  if (el.classList.contains('app-menu')) { const ro = new ResizeObserver(() => { if (!el.isConnected) ro.disconnect(); else clipBar(); }); ro.observe(el); }
  put();
  // (History's list has its own soft edges at both ends.)
  if (!el.classList.contains('tl-history')) fadeWhileMore(el);
  if (asSheet) swipeSheet(el, () => closePopover());
  const off = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) closePopover(); };
  const esc = (e) => { if (e.key === 'Escape') closePopover(); };
  // The keyboard opening or closing (a search field) moves the visible bottom: place the menu again.
  const vv = window.visualViewport, onVV = () => { if (!asSheet) put(); };
  // (Armed after this task, so the tap that opened the menu does not close it; a close before then cancels it.)
  const arm = setTimeout(() => { addEventListener('pointerdown', off, true); addEventListener('keydown', esc); }, 0);
  vv?.addEventListener('resize', onVV);
  openMenu = { el, anchor, put, cleanup: () => { clearTimeout(arm); removeEventListener('pointerdown', off, true); removeEventListener('keydown', esc); vv?.removeEventListener('resize', onVV); onClose?.(); } };
  anchor.setAttribute('aria-expanded', 'true');
  return el;
}
/** A list that scrolls fades at its bottom edge while there is more below it (class .more), as the docked
 *  cards do, so its last row is never just cut at the edge. Returns the check, to run after the content changes. */
export function fadeWhileMore(el) {
  // (--fade-pb: the list's bottom padding, which the fade reaches down through so it ends at the panel's own edge.)
  const sync = () => { el.classList.toggle('more', el.scrollHeight - el.clientHeight - el.scrollTop > 4); el.style.setProperty('--fade-pb', getComputedStyle(el).paddingBottom); };
  el.addEventListener('scroll', sync, { passive: true });
  const ro = new ResizeObserver(() => { if (!el.isConnected) ro.disconnect(); else sync(); });
  ro.observe(el);
  sync();
  return sync;
}
// One swap at a time per element: its newest content goes in when the old has faded.
const swaps = new WeakMap();
/** Changes what an element shows without a one-frame jump: the old content fades out (exit curve), fill() puts the new
 *  in, and it fades in. instant: fill now (the content reads the same), unless a swap is still under way, which then
 *  takes this fill instead. A hidden or empty element simply fills. */
export function swapFade(el, fill, { instant = false, out = 120, inn = 180 } = {}) {
  const job = swaps.get(el);
  if (job) { job.fill = fill; return; }
  if (instant || !el.animate || !el.isConnected || !el.firstChild || !el.getClientRects().length) { fill(); return; }
  const me = { fill };
  swaps.set(el, me);
  const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: out, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' });
  const done = () => {
    if (swaps.get(el) !== me) return;
    swaps.delete(el); me.fill(); a.cancel();
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: inn, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  };
  a.finished.then(done, done);
}
export const popoverOpen = () => !!openMenu;
/** Places the open menu again, after something it is anchored to has moved or resized. */
export function repositionPopover() { if (openMenu) { openMenu.el.style.left = openMenu.el.style.top = '0px'; openMenu.put(); } }
export function closePopover() {
  if (!openMenu) return;
  // The menu fades out (it is inert at once, so nothing under it waits), then leaves the page.
  const el = openMenu.el;
  if (reduceMotionMQ.matches || !el.isConnected) el.remove();
  // A sheet swiped away is already sliding down; it leaves when it is out of sight.
  // (Over the thumb dock it sinks behind the tab row, as the cards do: .2 s.)
  else { const ms = document.documentElement.classList.contains('thumb-ui') && el.classList.contains('from-dock') ? 200 : 120; el.classList.add('leaving'); el.inert = true; markGone(el.dataset.swiped ? 0 : ms); setTimeout(() => el.remove(), el.dataset.swiped ? 240 : ms + 10); }
  openMenu.anchor.setAttribute('aria-expanded', 'false'); openMenu.cleanup();
  openMenu = null;
}
/** Over the thumb dock a card slides down behind the tab row by --sink (styles/app.css: it moves the card and cuts it at
 *  its resting bottom edge together). This eases --sink to px frame by frame, so the move and the cut stay in step on
 *  iOS too, then calls done. A new drag stops it (stopSink). */
const sinking = new WeakMap();
export function stopSink(el) { const a = sinking.get(el); if (a) { cancelAnimationFrame(a.raf); clearTimeout(a.timer); } sinking.delete(el); }
export function sinkTo(el, px, ms = 220, done) {
  stopSink(el);
  const from = parseFloat(el.style.getPropertyValue('--sink')) || 0, t0 = performance.now(), a = {};
  const finish = () => {
    if (sinking.get(el) !== a) return;
    stopSink(el);
    if (px) el.style.setProperty('--sink', `${px}px`); else el.style.removeProperty('--sink');
    done?.();
  };
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    if (k >= 1) { finish(); return; }
    el.style.setProperty('--sink', `${from + (px - from) * (1 - (1 - k) ** 3)}px`);
    a.raf = requestAnimationFrame(step);
  };
  // (A page whose frames stall, in the background or a busy browser, still lands and closes on time.)
  a.timer = setTimeout(finish, ms + 120);
  sinking.set(el, a);
  a.raf = requestAnimationFrame(step);
}
/** A phone's bottom sheet follows a vertical drag from anywhere on it and closes past a short pull (or a quick
 *  flick) down; a short one eases back. Content scrolled away from its top scrolls back first, a sideways drag
 *  and a slider keep their own gestures, and taps work as normal. onClose closes it; the sheet is already
 *  sliding out of sight (data-swiped is set) so the close needs no animation of its own. */
export function swipeSheet(panel, onClose) {
  let s = null;
  // Over the thumb dock the sheet slides down behind the tab row: what passes below its resting bottom edge is clipped.
  const thumbUi = () => document.documentElement.classList.contains('thumb-ui');
  const scroller = (t) => {
    for (let n = t; n && n !== panel.parentElement; n = n.parentElement) if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY)) return n;
    return null;
  };
  panel.addEventListener('touchstart', (e) => {
    s = null;
    if (e.touches.length !== 1 || e.target.closest('input[type="range"], textarea, [contenteditable]')) return;
    const t = e.touches[0], sc = scroller(e.target);
    s = { x: t.clientX, y: t.clientY, top: !sc || sc.scrollTop <= 0, on: false, dy: 0, t: 0 };
  }, { passive: true });
  panel.addEventListener('touchmove', (e) => {
    if (!s) return;
    if (e.touches.length !== 1) { end(); return; }
    const t = e.touches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (!s.on) {
      // A pull down from the top is the sheet's from its first move (so the page never starts scrolling under it).
      const down = s.top && dy > 0 && dy >= Math.abs(dx);
      if (down && e.cancelable) e.preventDefault();
      if (Math.hypot(dx, dy) < 8) return;
      if (!down) { s = null; return; }
      // (Caught while it is still easing back: the pull carries on from where the sheet is, without a jump.)
      s.on = true; s.y = t.clientY - (parseFloat(panel.style.getPropertyValue('--sink')) || 0); s.t = performance.now();
      panel.style.transition = 'none'; panel.style.animation = 'none'; stopSink(panel);
    }
    if (e.cancelable) e.preventDefault();
    s.dy = Math.max(0, t.clientY - s.y);
    if (thumbUi()) panel.style.setProperty('--sink', `${s.dy}px`);
    else panel.style.transform = `translateY(${s.dy}px)`;
  }, { passive: false });
  const end = () => {
    const s0 = s; s = null;
    if (!s0?.on) return;
    const flick = s0.dy > 30 && s0.dy / Math.max(1, performance.now() - s0.t) > 0.6;
    const gone = flick || s0.dy > Math.min(90, panel.offsetHeight * 0.3);
    // (Over the thumb dock it sinks behind the tab row: the move and the cut in one value, never one ahead of the other.)
    if (thumbUi()) {
      panel.style.transition = '';
      if (gone) { sinkTo(panel, panel.offsetHeight); panel.dataset.swiped = '1'; onClose(); } else sinkTo(panel, 0);
      return;
    }
    panel.style.transition = 'transform .22s var(--ease)';
    if (gone) { panel.style.transform = 'translateY(100%)'; panel.dataset.swiped = '1'; onClose(); }
    else { panel.style.transform = ''; setTimeout(() => { if (!s) panel.style.transition = ''; }, 240); }
  };
  panel.addEventListener('touchend', end);
  panel.addEventListener('touchcancel', end);
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
  clearTimeout(modalLeaveT); back.classList.remove('leaving');
  back.classList.add('show');
  back.onclick = (e) => { if (e.target === back) closeModal(); };
  (modal.querySelector('.body button, .body [tabindex]') || close).focus({ preventScroll: true });
}
let modalLeaveT = 0;
export function closeModal() {
  const back = document.getElementById('modalBack');
  if (!back.classList.contains('show')) return;
  // (It fades out as it faded in, then is hidden: closed in one frame, Help, About and every dialog blinked out.)
  back.classList.remove('show'); back.classList.add('leaving');
  clearTimeout(modalLeaveT); modalLeaveT = setTimeout(() => back.classList.remove('leaving'), 220);
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
// A colour token as [r, g, b] in 0–255 (tokens are #rgb, #rrggbb, rgb() or rgba(); the alpha is dropped).
export function parseRGB(c) {
  c = (c || '').trim();
  if (c[0] === '#') { const x = c.length < 6 ? [...c.slice(1, 4)].map((d) => d + d).join('') : c.slice(1, 7); return [0, 2, 4].map((k) => parseInt(x.slice(k, k + 2), 16)); }
  const n = c.match(/[\d.]+/g) || [];
  return [+n[0] || 0, +n[1] || 0, +n[2] || 0];
}
export const cssRGB = (name) => parseRGB(cssVar(name));
export const cssRGB01 = (name) => cssRGB(name).map((v) => v / 255);
/** A colour token with an alpha, for a canvas: cssAlpha('--white', .5) → 'rgba(255,255,255,0.5)' (colour-exempt). */
export const cssAlpha = (name, a) => `rgba(${cssRGB(name).join(',')},${a})`;
/** A colour ramp token ('#hex position, #hex position, …') as [[position, '#hex'], …]. */
export const cssRamp = (name) => [...cssVar(name).matchAll(/(#[0-9a-f]{6})\s+(-?[\d.]+)/gi)].map((m) => [+m[2], m[1]]);
// The blood's colours on the GPU (theme independent: they sit on the lumen, not on the page), in 0–1.
// originCol follows ORIGINS (blood.js): SMV, IMV, splenic vein, hepatic artery, systemic.
let bloodCols = null;
export const bloodColors = () => bloodCols || (bloodCols = {
  originCol: ['smv', 'imv', 'spleen', 'artery', 'systemic'].map((o) => cssRGB01(`--origin-${o}`)),
  dyeCol: cssRGB01('--blood-dye'), inkLight: cssRGB01('--blood-ink-light'), inkDark: cssRGB01('--blood-ink-dark'),
  revCol: cssRGB01('--blood-reversed'), chevInk: cssRGB01('--blood-chevron'),
});

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
  // The instruments (Doppler, FibroScan, the HVPG tracing, scope, wall, charts) at the screen's own density, up to 3x: a 3x iPhone drew
  // their words at 2x, slightly soft (#34). Battery saver keeps 2x.
  const dpr = Math.min(saver() ? 2 : 3, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr)), hh = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}

/** A slider's fill follows its value: the wrapper (.range-wrap, styles/app.css) draws them from --p, 0 to 1. */
export function paintRange(input, f) {
  input.parentElement?.style.setProperty('--p', String(Math.min(1, Math.max(0, f))));
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
  // (th: the thumb's width, the slider's --tw, 18 px or 22 px on a phone: its centre runs from th / 2 to the far end less th / 2.)
  const fromX = (input, cx, th) => {
    const r = input.getBoundingClientRect(), min = +input.min || 0, max = +(input.max || 100);
    return min + clamp((cx - r.left - th / 2) / Math.max(1, r.width - th), 0, 1) * (max - min);
  };
  root.addEventListener('pointerdown', (e) => {
    const input = e.target;
    if (e.pointerType !== 'touch' || !isRange(input)) return;
    e.preventDefault();
    input.focus({ preventScroll: true });
    const th = parseFloat(getComputedStyle(input).getPropertyValue('--tw')) || 18;
    setTo(input, fromX(input, e.clientX, th));
    try { input.setPointerCapture(e.pointerId); } catch { /* gone */ }
    const move = (ev) => { if (ev.pointerId === e.pointerId) setTo(input, fromX(input, ev.clientX, th)); };
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

// An element's box without its own transform (a card's entrance offset): where it rests.
export function restBox(el, q = el.getBoundingClientRect()) {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return q;
  const m = new DOMMatrixReadOnly(t), z = el.offsetHeight ? q.height / el.offsetHeight : 1;
  return new DOMRect(q.x - m.e * z, q.y - m.f * z, q.width, q.height);
}

