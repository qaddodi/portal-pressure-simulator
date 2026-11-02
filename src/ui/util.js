// DOM & formatting helpers.
import { saver, frame, cancelFrame, easeNow, readFrame } from './frame.js?v=c67ad74ad8';
import { restPass } from './rest-pass.js?v=6eb6322f82';
import { glWords, GL_WORDS } from './gl-words.js?v=cf690c0b24';
import { slideFold } from './fold-slide.js?v=1b10231dcf';
import { releaseSpeed, isFlick, carryCurve, settleSlope, settleAt, easeMove, D_FLIP, D_SMALL, D_SURFACE, EASE_ARRIVE, EASE_MOVE, EASE_IN, RISE_PX } from './ease.js?v=7513a88c68';
import { leaveFromHere } from './menu-leave.js?v=e885166f40';
import { follow2, jumpCount, SHOWN_TAU } from './display-state.js?v=8d062d39dc';
import { measure as measureWords } from './glyph-measure.js?v=d02d2bd1bd';

// replaceChildren/append stringify null and arrays: flatten and drop empties instead.
for (const m of ['replaceChildren', 'append', 'prepend']) {
  const orig = Element.prototype[m];
  Element.prototype[m] = function (...kids) { return orig.apply(this, kids.flat(Infinity).filter((k) => k != null && k !== false)); };
}

// The phone's layout: a phone held upright or on its side, and a tablet held upright (Mohammad, 17 Oct: the upright iPad takes
// the phone's cards, sheets, bottom bar and menus). Every phone block in styles/app.css carries the same upright clause.
export const UPRIGHT_MQ = '(max-width: 1100px) and (orientation: portrait)';
// (A phone on its side; and any short landscape window, which keeps the words at the left and the data at the right.)
export const SIDEWAYS_MQ = '(max-width: 1023px) and (max-height: 500px) and (orientation: landscape)';
export const SHORT_SIDE_MQ = '(orientation: landscape) and (max-height: 500px)';
export const PHONE_MQ = `(max-width: 767px), ${SIDEWAYS_MQ}, ${UPRIGHT_MQ}`;
export const isPhoneLayout = () => matchMedia(PHONE_MQ).matches;
// The stacked layout (the presenter's words under the figure, its data card over it): the phone's layout less a phone on its side.
// The same width and upright clauses as styles/app.css's phone blocks (tests/breakpoints.test.js).
export const STACK_MQ = `(max-width: 767px), ${UPRIGHT_MQ}`;
// (A tablet held upright: the phone's layout, scaled to the tablet: its bottom bar and cards take 70 % of the width, centred, as
// its deck cards do, and its cards the phone's share of the height, never the whole screen. styles/app.css, main.js sheetBehaviour.)
export const TABLET_UP_MQ = '(min-width: 700px) and (max-width: 1100px) and (orientation: portrait)';

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

// An icon is a cell of the icon atlas (brand/icons, drawn once by scripts/icon-atlas.mjs) used as the element's mask and painted in
// its colour: a bitmap the GPU composites, never an SVG the page draws. Its size, colour and line weight come from styles/app.css.
export const icon = (id) => {
  const el = document.createElement('i');
  el.className = 'ic ic-' + id;
  el.setAttribute('aria-hidden', 'true');
  return el;
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

// Messages show as a card at the top, below the bars, never over the bottom bar.
// opts: actions, [[label, fn], …] as buttons after the words (a tap runs it and closes the card); sticky, stays until
// dismissed; onClose, called once when it goes, with 'pushed' when newer messages pushed it out (else 'user': the
// person's own tap, × or swipe, or the caller closing it). Returns a function that closes it.
// A toast that has played its way out leaves, and the ones below it glide up into its place (they jumped).
function dropToast(t) {
  const wrap = t.parentElement;
  if (!wrap) return;
  const others = [...wrap.children].filter((c) => c !== t), tops = others.map((c) => c.getBoundingClientRect().top);
  t.remove();
  if (wrap.classList.contains('docked') || reduceMotionMQ.matches) return;
  others.forEach((c, i) => {
    const dy = tops[i] - c.getBoundingClientRect().top;
    if (Math.abs(dy) > 0.5) c.animate?.([{ translate: `0 ${dy}px` }, { translate: '0 0' }], { duration: D_SMALL, easing: EASE_MOVE });
  });
}
// Where the toasts sit: slid down from behind the top bars, or (no bars to sit under: the sinusoid view's) at the foot of the screen
// by the stylesheet. A card kept on screen (a sticky one) is placed again when the screen turns or resizes, and the geometry the
// docked placement wrote is cleared when a toast is not docked, so it never leaks into the foot placement.
function placeToasts(wrap) {
  const bars = document.getElementById('topbar');
  const r = document.querySelector('.vdock')?.offsetParent && bars?.getBoundingClientRect();
  const docked = !!(r && r.height);
  wrap.classList.toggle('docked', docked);
  if (docked) {
    const W = innerWidth, w = Math.min(W - 24, 560);
    Object.assign(wrap.style, { left: `${(W - w) / 2 - 20}px`, width: `${w + 40}px`, top: `${r.bottom}px`, bottom: 'auto', height: '', maxWidth: 'none' });
  } else if (wrap.getAttribute('style')) wrap.removeAttribute('style');
}
addEventListener('resize', () => { const wrap = document.getElementById('toasts'); if (wrap?.children.length) placeToasts(wrap); });
// A card slides down from behind the top bars and settles just below them (below every row on a phone); docked, it is filled: the
// largest size that fits, stepping down for longer text, never clipped.
function toastFit(wrap, t, msg, actions) {
  if (!t.isConnected) return;
  placeToasts(wrap);
  if (wrap.classList.contains('docked')) {
    const m = t.querySelector('.toast-msg');
    if (msg.length > 60 || actions?.length) t.classList.add('toast-tall');   // (84 px: app.css, a class, so no height is written)
    let px = msg.length <= 28 ? 20 : msg.length <= 60 ? 17 : 15;
    const room = t.clientHeight - 8 - (actions?.length ? t.querySelector('.toast-acts').offsetHeight + 6 : 0);
    for (; px > 12; px--) { m.style.fontSize = `${px}px`; if (m.scrollHeight <= room && m.scrollWidth <= m.clientWidth) break; }
  }
  t.style.visibility = '';
}
// (Since 2 Nov 2026 the card is built and put on the page as a task between frames (rest-pass.js), never inside the frame that asked
// for it: toast is reached from the tick, and the build wrote the page there. The returned close works at once: asked before the card
// exists, it closes the card as soon as it is built. ?restpass=0 runs it on a plain zero timer instead, still never in a frame.)
const toastBuildRest = (job) => { job.close = toastBuild(job.msg, job.kind, job.opts); if (job.early) job.close(job.early); };
export function toast(msg, kind = '', { actions = null, sticky = false, onClose = null, present = false } = {}) {
  if (!msg) return () => {};
  // While presenting, the projected figure stays clear: only errors, cards with buttons and what the presenter asked for
  // (present: a link copied, a slide number typed) show.
  if (kind !== 'bad' && !actions?.length && !present && document.getElementById('app')?.classList.contains('presenting')) return () => {};
  const opts = { actions, sticky, onClose };
  const job = { msg, kind, opts, close: null, early: null };
  restPass(() => toastBuildRest(job));
  return (why = 'user') => { if (job.close) job.close(why); else job.early ||= why; };
}
function toastBuild(msg, kind, { actions, sticky, onClose }) {
  const wrap = document.getElementById('toasts');
  // One message at a time reads calmer than a growing stack. (The oldest leaves through its own close, so it fades out
  // and the one left glides into its place, rather than vanishing mid-exit: P19.)
  const stay = [...wrap.children].filter((c) => !c.classList.contains('leaving'));
  while (stay.length >= 2) { const o = stay.shift(); if (o._close) o._close('pushed'); else o.remove(); }
  // (An error leads with a small warning mark in the danger ink, so it reads as an error by its shape, not by red words alone.)
  const mark = kind === 'bad' ? icon('alert') : null;
  if (mark) mark.setAttribute('class', 'toast-ic');
  const t = h('div', { class: 'toast ' + kind, role: kind === 'bad' ? 'alert' : 'status' }, h('span', { class: 'toast-msg' }, mark, msg));
  let timer = 0, gone = false;
  const close = (why = 'user') => { if (gone) return; gone = true; clearTimeout(timer); onClose?.(why); t.classList.add('leaving'); setTimeout(() => dropToast(t), 340); };
  t._close = close;
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
  t.addEventListener('click', () => close());
  // Swipe down (or sideways) to dismiss.
  let sx = 0, sy = 0;
  t.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
  t.addEventListener('pointerup', (e) => { if (Math.abs(e.clientY - sy) > 18 || Math.abs(e.clientX - sx) > 40) close(); });
  // (A card pushed out by newer ones still counts as closed, as pushed out.)
  if (onClose) new MutationObserver((_, ob) => { if (!t.isConnected) { ob.disconnect(); if (!gone) { gone = true; clearTimeout(timer); onClose?.('pushed'); } } }).observe(wrap, { childList: true });
  // (Placed and sized as a task between frames (rest-pass.js), never inside the frame that asked for it: a toast raised from a frame's
  // tick read the bars and its own text's size among that frame's writes. Unseen until then, so it never shows in the wrong place.)
  t.style.visibility = 'hidden';
  wrap.append(t);
  restPass(() => toastFit(wrap, t, msg, actions));
  // A toast with buttons stays longer, and stays while the pointer or the keyboard is on it, so its button can be reached.
  const life = actions?.length ? 9000 : 4200, arm = () => { clearTimeout(timer); if (!sticky && !gone) timer = setTimeout(close, life); };
  t.addEventListener('pointerenter', () => clearTimeout(timer)); t.addEventListener('focusin', () => clearTimeout(timer));
  t.addEventListener('pointerleave', arm); t.addEventListener('focusout', arm);
  arm();
  return close;
}

/** A part of the app that could not be fetched (a new version went up while this tab stayed open, or the connection dropped): said
 *  once in a while, with the way out, so a button that does nothing is never silent. */
let loadFailAt = -1e9;
export function loadFailed(err) {
  console.error(err);
  if (performance.now() - loadFailAt < 20000) return;
  loadFailAt = performance.now();
  toast('Part of the app could not load. Reload the page to get the latest version.', 'bad', { actions: [['Reload', () => location.reload()]] });
}

// (Announcements close together are coalesced, never dropped: live.js.)
export { announce } from './live.js?v=c7e9ac862b';

/** Hover/focus tooltip. `text` may be a string, a function, or { text, key }. `side`: 'right' | 'bottom'. */
// An ⓘ button: hover (or keyboard focus) shows the tooltip; a tap on touch opens the same text
// under its row instead, easing open, and a second tap or a tap elsewhere closes it.
function closeInfos(except) {
  for (const r of document.querySelectorAll('.info-open')) if (r !== except) { r.querySelector('.info-i')?.setAttribute('aria-expanded', 'false'); foldInfo(r, false); }
}
// (The text slides down out from under its row, and what follows in the panel with it, by transform: fold-slide.js. No height eased.)
const foldInfo = (row, open) => slideFold({ item: row, inner: row.querySelector(':scope > .ac-info > div'), root: row.parentElement?.parentElement, open, set: (v) => row.classList.toggle('info-open', v), ms: D_SMALL });
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
    b.setAttribute('aria-expanded', String(open)); foldInfo(row, open);
  });
  return b;
}

export function tooltipFor(el, text, side = 'right') {
  const tip = document.getElementById('tooltip');
  const show = () => {
    const r = el.getBoundingClientRect();
    const v = typeof text === 'function' ? text() : text;
    tip.replaceChildren(typeof v === 'object' ? [v.text, v.key ? h('kbd', {}, v.key) : null] : v);
    // (Measured by its layout size, which the hidden state's scale does not touch; and shown only once its side is set, so it eases in from
    // this button's side, not from the previous tip's: the transition starts when .show is added.)
    const tr = { width: tip.offsetWidth, height: tip.offsetHeight };
    // A side that would run off the window takes the opposite one (a top-bar button's tip had sat on its own button when
    // 'top' ran off; a timeline tip clipped at a short window's foot), and the tip rises from the side it came from.
    let x, y, at = side;
    if (side === 'bottom' || side === 'top') {
      x = r.left + r.width / 2 - tr.width / 2;
      if (at === 'top' && r.top - tr.height - 8 < 8) at = 'bottom';
      else if (at === 'bottom' && r.bottom + 8 + tr.height > innerHeight - 8 && r.top - tr.height - 8 >= 8) at = 'top';
      y = at === 'top' ? r.top - tr.height - 8 : r.bottom + 8;
    } else {
      x = r.right + 10; y = r.top + r.height / 2 - tr.height / 2;
      if (x + tr.width > innerWidth - 8) { x = r.left - tr.width - 10; at = 'left'; }
    }
    tip.dataset.side = at;
    tip.style.left = clamp(x, 8, innerWidth - tr.width - 8) + 'px'; tip.style.top = clamp(y, 8, innerHeight - tr.height - 8) + 'px';
    tip.classList.add('show');
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
let lastMenu = { anchor: null, t: 0 };   // (the menu that just closed: on iOS a tapped button takes no focus, so a dialog it opens returns here)
const reduceMotionMQ = matchMedia('(prefers-reduced-motion: reduce)');
/** How a scroll the app makes on its own moves: smooth, or at once with Reduce Motion (as the menu's already did). */
export const scrollBehavior = () => (reduceMotionMQ.matches ? 'auto' : 'smooth');
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
// A popover or card settles from, and leaves toward, the thing that opened it (premium-feel R11: scale-settle's origin is its
// anchor): the scale's origin is the anchor's centre, in the piece's own frame, set where the piece is placed.
export function settleFrom(el, anchor, left, top) {
  el.style.transformOrigin = `${(anchor.left + anchor.width / 2 - left).toFixed(0)}px ${(anchor.top + anchor.height / 2 - top).toFixed(0)}px`;
}

export function popover(anchor, content, { cls = '', align = 'start', place = 'below', onClose, sheet = true } = {}) {
  if (openMenu) { const same = openMenu.anchor === anchor; closePopover(); if (same) return null; }
  const asSheet = sheet && (innerWidth < 768 || matchMedia(UPRIGHT_MQ).matches);
  // (from-dock: over the thumb dock a sheet, or a menu from the dock, rises from behind the tab row; one from the top bar,
  // the Colored-by key on an upright iPad, pops in where it rests, as everywhere else, never sliding up from below it.)
  const fromDock = asSheet || !!anchor.closest?.('.vdock');
  const el = h('div', { class: 'menu ' + cls + (asSheet ? ' as-sheet' : '') + (fromDock ? ' from-dock' : ''), role: 'dialog', 'aria-label': anchor.getAttribute?.('aria-label') || anchor.title || anchor.textContent?.trim().slice(0, 40) || 'Menu' }, content);
  enterAfterGone(el);
  document.body.append(el);
  const put = () => {
    if (asSheet) return;
    const r = anchor.getBoundingClientRect(), w0 = el.offsetWidth;
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
      if (below < el.scrollHeight && r.top - 16 > below) { at = 'above'; barTop = null; el.style.maxHeight = (r.top - 16) + 'px'; }
      else el.style.maxHeight = Math.max(160, below) + 'px';
    }
    // A menu from the thumb dock's tab row sits on the tab row's top edge, 8 px clear of it, over the play bar (which steps
    // aside), like the cards and the phone's sheets: it rises from behind the tab row and is cut on its top line. (Above
    // the whole dock, it had risen out of thin air over the faded play bar, its cut-off shadow left as a ghost there.)
    const bar = anchor.closest('.thumb-bar'), tabTop = bar ? bar.getBoundingClientRect().top : null;
    if (bar && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.style.maxHeight = Math.max(160, tabTop - 16) + 'px';
    const vb = visibleBottom();
    // A menu with no height rule of its own (Blood and Colored-by on a phone held sideways: 511-560 px of rows in 284-332 px of
    // room) takes the larger side of its button and scrolls inside it, never off the screen. One that fits is left as it was.
    if (!bar && !el.classList.contains('app-menu')) {
      el.style.maxHeight = ''; el.style.overflowY = '';
      const natural = el.offsetHeight, roomBelow = vb - r.bottom - 16, roomAbove = r.top - 16;
      const above = place === 'above' ? natural <= roomAbove || roomAbove >= roomBelow : natural > roomBelow && roomAbove > roomBelow;
      at = above ? 'above' : 'below';
      const room = Math.max(160, above ? roomAbove : roomBelow);
      if (natural > room) { el.style.maxHeight = room + 'px'; el.style.overflowY = 'auto'; el.style.overscrollBehavior = 'contain'; }
    }
    // Layout size, not the rectangle: the opening animation scales the menu for a moment.
    const mr = { width: el.offsetWidth, height: el.offsetHeight };
    const top = bar ? tabTop : r.top;
    let y = at === 'above' || bar ? top - mr.height - 8 : r.bottom + 8;
    if (y + mr.height > vb - 8) y = Math.max(8, top - mr.height - 8);
    // Clear of the notch and the home indicator: a phone held sideways has 47-59 px of unsafe screen at each side (env() is 0 elsewhere).
    el.style.left = `clamp(calc(8px + env(safe-area-inset-left, 0px)), ${x}px, calc(100% - ${mr.width}px - 8px - env(safe-area-inset-right, 0px)))`;
    const left = el.offsetLeft, topPx = clamp(y, 8, vb - mr.height - 8);
    el.style.top = topPx + 'px';
    settleFrom(el, r, left, topPx);
    barAt = barTop;
    clipBar();
  };
  // Ending just above the bar, the menu's shadow stops at the bar's top edge, so the bar itself stays as it was (sweep 01
  // review). Measured from the menu as laid out (its height settles after it opens), again whenever it resizes.
  let barAt = null;
  const clipBar = () => {
    const gap = barAt == null ? 0 : barAt - (parseFloat(el.style.top) + el.offsetHeight);
    el.style.clipPath = barAt == null ? '' : `inset(-64px -64px ${(-Math.max(0, gap)).toFixed(2)}px -64px)`;
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
  // Opened from the keyboard (the button shows its focus ring): focus goes in, so Tab does not have to cross the whole page to reach
  // the menu. A mouse or a touch leaves focus where it was.
  if (anchor.matches?.(':focus-visible')) setTimeout(() => { if (openMenu?.el === el) el.querySelector('button, input, [tabindex="0"]')?.focus({ preventScroll: true }); }, 0);
  return el;
}
/** A list that scrolls fades at its bottom edge while there is more below it (class .more), as the docked
 *  cards do, so its last row is never just cut at the edge. Returns the check, to run after the content changes. */
export function fadeWhileMore(el) {
  // (A scroll, or the check handed back, measures between frames, never inside the scroll's own frame: moreAsk, a rest pass.)
  const ask = () => moreAsk(el);
  el.addEventListener('scroll', ask, { passive: true });
  const ro = new ResizeObserver(() => { if (!el.isConnected) ro.disconnect(); else moreSync(el); });
  ro.observe(el);
  moreSync(el);
  return ask;
}
const moreAsks = new WeakMap();
function moreAsk(el) { if (!moreAsks.has(el)) moreAsks.set(el, restPass(() => moreSync(el))); }
// (--fade-pb: the list's bottom padding, which the fade reaches down through so it ends at the panel's own edge.)
function moreSync(el) {
  moreAsks.delete(el);
  el.classList.toggle('more', el.scrollHeight - el.clientHeight - el.scrollTop > 4); el.style.setProperty('--fade-pb', getComputedStyle(el).paddingBottom);
}
// Whether an element has a box (neither it nor an ancestor display: none), as getClientRects().length says, without laying
// the page out: checkVisibility needs only styles. (Each read in the middle of a model frame, after its writes, laid the
// page out: 1-2 ms each, several a frame in the Tests card's tiles; round 2 review, P5.)
// Whether a fade on el is worth starting: in the page and under no hidden piece. No layout read (1 Nov 2026, "zero layout inside the
// frame": the number and text swaps ask it from frames); one hidden only by a style still takes its fade, which nobody sees and which
// ends on its own clock as any other. isDrawn is the exact answer, for an input's handler.
export const hasBox = (el) => el.isConnected && !el.closest?.('[hidden]');
export const isDrawn = (el) => (el.checkVisibility ? el.checkVisibility() : el.getClientRects().length > 0);
// One swap at a time per element: its newest content goes in when the old has faded.
const fadeIns = new WeakMap();   // (swapFade: each element's fade-in, cancelled when the next swap lands)
const swaps = new WeakMap();
/** Changes what an element shows without a one-frame jump: the old content fades out (exit curve), fill() puts the new
 *  in, and it fades in. instant: fill now (the content reads the same), unless a swap is still under way, which then
 *  takes this fill instead. A hidden or empty element simply fills. */
export function swapFade(el, fill, { instant = false, out = D_FLIP, inn = D_SMALL } = {}) {
  const job = swaps.get(el);
  if (job) { job.fill = fill; return; }
  if (instant || !el.animate || !el.isConnected || !el.firstChild || !hasBox(el)) { fill(); return; }
  const me = { fill };
  swaps.set(el, me);
  // (From wherever the element is now: a fade-in still under way included, so a quick second swap never jumps to full.)
  const a = el.animate([{ opacity: 0 }], { duration: out, easing: EASE_IN, fill: 'forwards' });
  const done = () => {
    if (swaps.get(el) !== me) return;
    swaps.delete(el);
    try { me.fill(); } finally { fadeIns.get(el)?.cancel(); a.cancel(); fadeIns.set(el, el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: inn, easing: EASE_ARRIVE })); }
  };
  a.finished.then(done, done);
}
/**
 * For `ms` after a swap starts, the elements `sel` finds in `root` glide to wherever each resize of `root` (or of `also`)
 * puts them, instead of jumping (FLIP, transform only). A swap can resize a bar more than once (its readings, then a fit a
 * moment later), so every step is caught, each glide carrying on from where the last one had got to. Reduce Motion: no
 * glide (the bar's readings still fade). (The play bar jumped 15-20 px sideways entering the lobule; round 2 review, RF4.)
 */
export function glideOnResize(root, sel, opts = {}) {
  if (!root?.animate || reduceMotionMQ.matches || typeof ResizeObserver !== 'function') return;
  // (The places before the swap are measured between frames, a rest pass, never in the model frame that asked: the swap's own
  // change lands after its fade out, later still, so nothing it moves is missed.)
  restPass(() => glideWatch(root, sel, opts));
}
function glideWatch(root, sel, { ms = 520, dur = D_SMALL, also = [] }) {
  if (!root.isConnected) return;
  const pos = (el) => { let x = 0, y = 0; for (let n = el; n && n !== document.body; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; } return [x, y]; };
  const measure = () => new Map([...root.querySelectorAll(sel)].filter((el) => el.offsetParent).map((el) => [el, pos(el)]));
  let prev = measure();
  const ro = new ResizeObserver(() => {
    const now = measure();
    for (const [el, [x, y]] of now) {
      const p = prev.get(el);
      if (!p) continue;
      let cx = 0, cy = 0;
      for (const a of el.getAnimations()) if (a.id === 'glide') { const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); cx = m.m41; cy = m.m42; a.cancel(); break; }
      const dx = p[0] + cx - x, dy = p[1] + cy - y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: dur, easing: EASE_ARRIVE }).id = 'glide';
    }
    prev = now;
  });
  ro.observe(root);
  for (const el of also) if (el) ro.observe(el);
  setTimeout(() => ro.disconnect(), ms);
}
/**
 * Runs `fn` once `el`'s exit has played: when the animations then running on it and inside it end, or at `backstop` ms at
 * the latest, and only while it still carries `cls` (the leaving class: an element opened again meanwhile keeps it off, and
 * a later exit starts its own wait). Returns the backstop's timer, for clearTimeout. A fixed timer had hidden closing cards
 * before their fade ended (round 2 review, NP11).
 */
export function afterExit(el, cls, fn, backstop = 450) {
  const tok = {};
  el._exitTok = tok;
  let ran = false;
  const go = () => { if (ran || el._exitTok !== tok || !el.classList.contains(cls)) return; ran = true; fn(); };
  const t = setTimeout(go, backstop);
  const as = el.getAnimations?.({ subtree: true }) || [];
  if (!as.length) setTimeout(go, 0);
  else Promise.all(as.map((a) => a.finished.catch(() => {}))).then(go);
  return t;
}
/** Brings a shown row up to date from a freshly built one without swapping it out: attributes and text are written where they differ,
 *  elements of the same kind are matched in turn, and a button (it carries its own click for this build) is replaced by the new one.
 *  What is new to the row (a button that has just appeared) fades in through `fade`. */
function morphRow(o, r, fade) {
  for (const a of [...o.attributes]) if (!r.hasAttribute(a.name)) o.removeAttribute(a.name);
  for (const a of r.attributes) if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
  const oc = [...o.childNodes], rc = [...r.childNodes];
  rc.forEach((n, i) => {
    const m = oc[i];
    if (!m) { o.append(n); if (n.nodeType === 1) fade?.(n); return; }
    if (n.nodeType === 3 && m.nodeType === 3) { if (m.data !== n.data) m.data = n.data; return; }
    if (n.nodeType === 1 && m.nodeType === 1 && n.tagName === m.tagName && n.tagName !== 'BUTTON') { morphRow(m, n, fade); return; }
    m.replaceWith(n);
    if (n.nodeType === 1 && (m.nodeType !== 1 || n.tagName !== m.tagName)) fade?.(n);
  });
  for (const m of oc.slice(rc.length)) m.remove();
}
/** Updates a list in place from freshly built rows (MOTION_HEAT_REVIEW P18): a row whose data-row is already shown stays
 *  (replaced where it stands if its data-sig changed), a new row rises in over .22 s, and a row no longer wanted fades and
 *  folds away before it leaves. Rows without a key are simply replaced. The list was rebuilt whole, every row popping. */
export function reconcile(list, rows) {
  const old = new Map();
  for (const c of list.children) if (c.dataset.row && !c.classList.contains('rc-out')) old.set(c.dataset.row, c);
  const shown = !!list.isConnected && list.getClientRects().length > 0 && !!list.animate, still = reduceMotionMQ.matches;
  const want = [], fresh = new Set();
  for (const r of rows) {
    const o = r.dataset.row ? old.get(r.dataset.row) : null;
    if (o && o.dataset.sig === r.dataset.sig) { want.push(o); old.delete(r.dataset.row); }
    else if (o) { morphRow(o, r, shown ? (n) => n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing: EASE_ARRIVE }) : null); want.push(o); old.delete(r.dataset.row); }   // (same row, new details: it stays where it stands, so a row still rising in is not cut short, and a fading row eases)
    else { want.push(r); fresh.add(r); }
  }
  const keep = new Set(want);
  const going = [...list.children].filter((c) => !keep.has(c) && !c.classList.contains('rc-out'));
  // A row that goes leaves the flow at once and fades where it stood; the rows under it slide up into its room (FLIP, by
  // transform). Nothing's height is eased: no layout per frame.
  const fly = shown && !still && going.some((g) => g.dataset.row);
  const was = fly ? new Map(want.filter((e) => e.parentNode === list).map((e) => [e, e.offsetTop])) : null;
  let cur = list.firstChild;
  for (const e of want) {
    while (cur && cur !== e && (going.includes(cur) || cur.classList?.contains('rc-out'))) cur = cur.nextSibling;
    if (cur === e) { cur = cur.nextSibling; continue; }
    list.insertBefore(e, cur);
  }
  for (const g of going) {
    if (!shown || !g.dataset.row) { g.remove(); continue; }
    g.classList.add('rc-out'); g.inert = true;
    // (pinned where it stands, out of the flow, as wide as it was: its box laid out once)
    const at = { top: g.offsetTop, left: g.offsetLeft, width: g.offsetWidth };
    Object.assign(g.style, { position: 'absolute', top: `${at.top}px`, left: `${at.left}px`, width: `${at.width}px`, margin: '0', pointerEvents: 'none', boxSizing: 'border-box' });
    const a = g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: D_FLIP, easing: EASE_IN, fill: 'forwards' });
    a.finished.then(() => g.remove(), () => g.remove());
  }
  if (was) for (const [e, y0] of was) {
    const dy = y0 - e.offsetTop;
    if (Math.abs(dy) > 0.5) e.animate([{ translate: `0 ${dy}px` }, { translate: '0 0' }], { duration: D_FLIP, easing: EASE_MOVE });
  }
  if (shown) {
    for (const r of fresh) if (r.dataset.row) r.animate(still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: `translateY(${RISE_PX}px)` }, { opacity: 1, transform: 'none' }], { duration: D_SMALL, easing: EASE_ARRIVE, delay: going.length ? 80 : 0, fill: 'backwards' });
  }
}
/**
 * Shows or hides a strip that sits in the flow (a block kept with `hidden`): it opens from nothing and fades in, or fades and
 * folds shut and is hidden once gone, so what stands under it eases to its place instead of jumping (the Tests card's
 * comparison line and its pick-a-second-instrument hint popped in and out). Where nothing is drawn yet, or the strip is not
 * on screen, it just switches. Reduce Motion: a fade, no movement. A second call mid-way turns round from where it has got to.
 */
const folds = new WeakMap();
const FOLD_PROPS = ['paddingTop', 'paddingBottom', 'marginTop', 'marginBottom'];
// (The fold is measured and started between frames, a rest pass, never inside the model frame that asked; asked again before
// then, the last ask wins.)
const foldWant = new Map();
export function foldHidden(el, hide) {
  if (foldWant.has(el)) { foldWant.set(el, hide); return; }
  const cur = folds.get(el);
  if (cur ? cur.hide === hide : el.hidden === hide) return;
  foldWant.set(el, hide);
  restPass(() => { const want = foldWant.get(el); foldWant.delete(el); foldRun(el, want); });
}
function foldRun(el, hide) {
  const cur = folds.get(el);
  if (cur ? cur.hide === hide : el.hidden === hide) return;
  let now = null;   // (turning round mid-way: from what is drawn now)
  if (cur) {
    const c = getComputedStyle(el);
    now = { opacity: +c.opacity, height: `${el.offsetHeight}px`, ...Object.fromEntries(FOLD_PROPS.map((k) => [k, c[k]])) };
    cur.anim.cancel(); folds.delete(el); el.style.overflow = '';
  }
  const drawn = el.animate && el.isConnected && (cur || (hide ? hasBox(el) : !!el.parentElement && hasBox(el.parentElement)));
  if (!drawn) { el.hidden = hide; return; }
  if (!hide) el.hidden = false;
  const c = getComputedStyle(el);
  const open = { opacity: 1, height: `${el.offsetHeight}px`, ...Object.fromEntries(FOLD_PROPS.map((k) => [k, c[k]])) };
  const shut = { opacity: 0, height: '0px', ...Object.fromEntries(FOLD_PROPS.map((k) => [k, '0px'])) };
  const from = now || (hide ? open : shut), to = hide ? shut : open;
  const still = reduceMotionMQ.matches;
  if (!still) el.style.overflow = 'hidden';
  const a = el.animate(still ? [{ opacity: from.opacity }, { opacity: to.opacity }] : [from, to],
    hide ? { duration: D_FLIP, easing: EASE_IN, fill: 'forwards' } : { duration: D_SMALL, easing: EASE_ARRIVE });
  const me = { hide, anim: a };
  folds.set(el, me);
  a.finished.then(() => {
    if (folds.get(el) !== me) return;
    folds.delete(el); el.style.overflow = '';
    if (hide) el.hidden = true;
    a.cancel();
  }, () => {});
}
/** Text that crossfades when it changes (a status word, an arrow): swapFade, and a fade in from empty, so a word
 *  that appears doesn't pop either. then: run with the new text in (a class that goes with it). */
export function swapText(el, txt, then) {
  const job = swaps.get(el);
  if (job ? job.txt === txt : textNow(el) === txt) return;
  const fill = () => { putText(el, txt); then?.(); };   // (drawn on the GPU, gl-words.js, or written between frames: never into the page in a frame)
  if (!job && !el.firstChild && txt && el.animate && el.isConnected && hasBox(el)) {
    fill(); el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing: EASE_ARRIVE }); return;
  }
  swapFade(el, fill);
  const j = swaps.get(el); if (j) j.txt = txt;
}
/** A number that rolls to its new value instead of jumping (MOTION_HEAT_REVIEW P17): el shows fmt(v, d). eased: the caller
 *  already moves this value gently (a running model's mean), so it follows at once, or carries a roll under way on to the
 *  new value. Otherwise a change of at least the last digit counts from the number shown to v over about a third of a
 *  second (ease out) and always ends on fmt(v, d). null shows "?" at once. Reduce Motion lands at once. */
const counts = new WeakMap(), rolling = new Set();
let rollRaf = 0;
const COUNT_MS = D_SMALL;   // (a roll takes a small step of the motion scale, ease.js)
// Text that changes rewrites its text node in place: setting textContent replaces the node, which re-checks styles for the
// element and, through :has() in the phone and iPad layouts, ~85 others a model frame (round 2 review, P7).
// (Since 2 Nov 2026 (Mohammad: "Move everything to GPU") a number's or word's new text is drawn on the GPU (gl-words.js) and taken into the
// page between frames once it holds still, never written into the page in a frame. An element that cannot be drawn that way (more than
// its own text in it, a roll under way) is written between frames in the order asked, the latest text only. ?glwords=0: written between
// frames with no picture.)
const wordsOfEl = new WeakMap(), putPend = new Map();
let putAsk = 0;
const textNow = (el) => (putPend.has(el) ? putPend.get(el) : el.textContent);
function putFlush() {
  putAsk = 0;
  const now = [...putPend]; putPend.clear();
  for (const [el, t] of now) {
    const n = el.firstChild;
    if (n && n.nodeType === 3 && !n.nextSibling) { if (n.data !== t) n.data = t; } else if (el.textContent !== t) el.textContent = t;
  }
}
const putLater = (el, t) => { putPend.set(el, t); if (!putAsk) putAsk = restPass(putFlush); };
export const putText = (el, t) => {
  t = String(t ?? '');
  if (putPend.has(el)) { putPend.set(el, t); return; }
  let w = wordsOfEl.get(el);
  if (!w && GL_WORDS && el.isConnected && !odos.has(el)) {
    const n = el.firstChild;
    if (!n || (n.nodeType === 3 && !n.nextSibling)) wordsOfEl.set(el, w = glWords(el));
  }
  if (w && !odos.has(el) && (!el.firstChild || (el.firstChild.nodeType === 3 && !el.firstChild.nextSibling))) {
    // (Words written by hand since the last ones put here: the readout is drawn from what the page shows now.)
    if (w.text !== t || el.textContent !== t) { if (el.textContent !== w.text && el.textContent !== t) putLater(el, t); else w.set(t); }
    return;
  }
  if (el.textContent !== t) putLater(el, t);
};
const putNum = putText;
function rollStep(now) {
  rollRaf = 0;
  for (const el of rolling) {
    const c = counts.get(el);
    // (A frame's time is when it began, which can be before the roll was asked for: below 0 the curve ran backwards, far past the
    // number it started from, and a patient load showed an HVPG of -50 for a moment.)
    const u = Math.max(0, Math.min(1, (now - c.t0) / COUNT_MS)), k = 1 - (1 - u) ** 3;
    c.shown = u >= 1 ? c.to : c.from + (c.to - c.from) * k;
    putNum(el, fmt(c.shown, c.d));
    if (u >= 1 || !el.isConnected) { c.t0 = null; rolling.delete(el); }
  }
  if (rolling.size) rollRaf = frame(rollStep, 'numbers');
}
// A number that appears where "?" was (a tile measured again), or "?" where a number was, fades in rather than popping: the roll
// above moves a number between two numbers, and this is the step it cannot take.
/** An element that has just been shown comes up from nothing over a small step (Reduce Motion: at once). */
export function fadeIn(el) { if (!reduceMotionMQ.matches && el.animate && el.isConnected && hasBox(el)) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing: EASE_ARRIVE }); }
const fadeNum = fadeIn;
// (Since 1 Nov 2026 (Mohammad: "Move everything to GPU"; a 120 Hz frame budget) a roll no longer rewrites the number's text on every
// frame, which laid its tile out again each frame of a slide change. Each digit that changes rolls in its own column, a strip of the
// digits between the old one and the new one moved by a transform the compositor eases on the GPU (app.css .odo), and the text is
// written twice: once as the roll starts (the element's text already reads the new number throughout: the strips are CSS content)
// and once as it ends (the plain number again). A number whose shape changes (9.9 to 10.1, a sign) lands at once and fades in.
// ?odo=0: counted frame by frame, as before.)
const ODO = !(typeof location !== 'undefined' && /[?&]odo=0\b/.test(location.search || ''));
const odos = new WeakMap();   // el → { txt, timer } while its digits roll
/** Ends a roll on el at once: its plain final text (unless something else has written over it meanwhile). */
export function odoEnd(el) {
  const o = odos.get(el);
  if (!o) return;
  odos.delete(el); clearTimeout(o.timer);
  restPass(() => odoFinishRest(el, o));
}
function odoFinishRest(el, o) {
  if (putPend.has(el)) return;   // (something else was asked to be written since: that is the newer text)
  if (el.querySelector(':scope > .odo')) el.textContent = o.txt;   // (not putText: the text already reads the same)
  else if (!o.built) putText(el, o.txt);   // (ended before its strips were built: the new number lands plain)
}
/** el's text a → b, each changed digit rolling in its own column (app.css .odo) over ms on easing; up: the value rose. False (nothing
 *  done) when the two are not the same shape: the same length, digits where digits are and every other character the same. The strips
 *  are built between frames (rest-pass.js), the roll itself runs on the compositor. */
export function odoSwap(el, a, b, up, ms = COUNT_MS, easing = null) {
  odoEnd(el);
  a = String(a); b = String(b);
  const dig = (ch) => ch >= '0' && ch <= '9';
  if (a === b || a.length !== b.length || ![...a].every((ch, i) => dig(ch) === dig(b[i]) && (dig(ch) || ch === b[i]))) return false;
  const o = { txt: b, timer: 0, built: false };
  odos.set(el, o);
  restPass(() => odoBuildRest(el, o, a, b, up, ms, easing));
  return true;
}
function odoBuildRest(el, o, a, b, up, ms, easing) {
  if (odos.get(el) !== o || putPend.has(el)) return;   // (ended or replaced before it was built)
  const frag = document.createDocumentFragment();
  let run = '';
  for (let i = 0; i < b.length; i++) {
    if (a[i] === b[i]) { run += b[i]; continue; }
    if (run) { frag.append(run); run = ''; }
    const p = +a[i], q = +b[i], n = Math.abs(q - p), seq = [];
    for (let k = 0; k <= n; k++) seq.push(p + (q > p ? k : -k));
    // (The strip reads old to new top down and climbs when the value rose, new to old and drops when it fell: an odometer either way.)
    const sp = document.createElement('span');
    sp.className = up ? 'odo' : 'odo down';
    sp.dataset.s = (up ? seq : seq.slice().reverse()).join('\n');
    sp.style.setProperty('--odo-n', String(n));
    if (ms !== COUNT_MS) sp.style.setProperty('--odo-ms', `${ms}ms`);
    if (easing) sp.style.setProperty('--odo-ease', easing);
    sp.textContent = b[i];
    frag.append(sp);
  }
  if (run) frag.append(run);
  el.replaceChildren(frag);
  o.built = true;
  o.timer = setTimeout(() => { if (odos.get(el) === o) odoEnd(el); }, ms + 40);
}
export const odoOn = () => ODO;
function odoRoll(el, c, from, to) {
  c.shown = to;
  if (!odoSwap(el, fmt(from, c.d), fmt(to, c.d), to > from)) { putNum(el, fmt(to, c.d)); fadeNum(el); }
}
export function countTo(el, v, d = 1, { eased = false } = {}) {
  let c = counts.get(el);
  if (!c) counts.set(el, c = { shown: null, from: 0, to: 0, t0: null, d });
  c.d = d;
  const odo = odos.has(el);
  if (odo && (eased || v == null || !Number.isFinite(v) || reduceMotionMQ.matches)) odoEnd(el);
  if (ODO && !eased && v != null && Number.isFinite(v) && c.t0 == null) {
    // (A roll under way that is asked for the value it rolls to keeps going; any other value rolls on from the one it lands on.)
    if (odo) { if (Math.abs(v - c.shown) < Math.pow(10, -d) * 0.5) return; odoEnd(el); }
    const same = c.shown != null && fmt(c.shown, d) === fmt(v, d);
    if (!same && c.shown != null && !reduceMotionMQ.matches && el.isConnected && hasBox(el)) { odoRoll(el, c, c.shown, v); return; }
  }
  if (v == null || !Number.isFinite(v)) { rolling.delete(el); c.t0 = null; const was = c.shown != null; c.shown = null; putNum(el, '?'); if (was) fadeNum(el); return; }
  if (c.t0 != null) {   // (a roll under way)
    if (eased || reduceMotionMQ.matches) { if (reduceMotionMQ.matches) { rolling.delete(el); c.t0 = null; c.shown = v; putNum(el, fmt(v, d)); } else c.to = v; return; }
    if (Math.abs(v - c.to) < Math.pow(10, -d) * 0.5) return;
    c.from = c.shown; c.to = v; c.t0 = performance.now(); return;
  }
  const same = c.shown != null && fmt(c.shown, d) === fmt(v, d);
  if (eased || same || c.shown == null || reduceMotionMQ.matches || !el.isConnected || !hasBox(el)) { const fresh = c.shown == null; c.shown = v; putNum(el, fmt(v, d)); if (fresh) fadeNum(el); return; }
  c.from = c.shown; c.to = v; c.t0 = performance.now();
  rolling.add(el);
  if (!rollRaf) rollRaf = frame(rollStep, 'numbers');
}
export const popoverOpen = () => !!openMenu;
/** Places the open menu again, after something it is anchored to has moved or resized. */
export function repositionPopover() { if (openMenu) { openMenu.el.style.left = openMenu.el.style.top = '0px'; openMenu.put(); } }
export function closePopover() {
  if (!openMenu) return;
  // The menu fades out (it is inert at once, so nothing under it waits), then leaves the page.
  const el = openMenu.el;
  // (Focus inside the menu goes back to its button before the menu is made inert; otherwise it would fall to the page.)
  if (el.contains(document.activeElement) && openMenu.anchor.isConnected) openMenu.anchor.focus?.({ preventScroll: true });
  if (!el.isConnected) el.remove();   // (with Reduce Motion it still fades: app.css turns popOut into a fade)
  // A sheet swiped away is already sliding down; it leaves when it is out of sight.
  // (Over the thumb dock it sinks behind the tab row, as the cards do, in the same step: a leave is one flip, app.css thumbOut.)
  else { const ms = D_FLIP; const leave = () => el.classList.add('leaving'); if (el.dataset.swiped) leave(); else leaveFromHere(el, leave); el.inert = true; markGone(el.dataset.swiped ? 0 : ms); setTimeout(() => el.remove(), el.dataset.swiped ? D_SMALL : ms + 10); }
  openMenu.anchor.setAttribute('aria-expanded', 'false'); openMenu.cleanup();
  lastMenu = { anchor: openMenu.anchor, t: performance.now() };
  openMenu = null;
}
/** Over the thumb dock a card slides down behind the tab row by --sink (styles/app.css: it moves the card and cuts it at
 *  its resting bottom edge together). This eases --sink to px frame by frame, so the move and the cut stay in step on
 *  iOS too, then calls done. A new drag stops it (stopSink). */
const sinking = new WeakMap();
export function stopSink(el) { const a = sinking.get(el); if (a) { cancelFrame(a.raf); clearTimeout(a.timer); } sinking.delete(el); }
export function sinkTo(el, px, ms = 220, done, speed = null) {
  stopSink(el);
  const from = parseFloat(el.style.getPropertyValue('--sink')) || 0, t0 = performance.now(), a = {};
  // (speed: the finger's, px per ms down, when it let go: the card carries it on and slows to rest, instead of leaving at the ease's own
  // speed, which a slow pull let go of felt as a lurch. Without it, the cubic ease out as before.)
  const m0 = speed == null ? null : settleSlope(speed, px - from, ms);
  const finish = () => {
    if (sinking.get(el) !== a) return;
    stopSink(el);
    if (px) el.style.setProperty('--sink', `${px}px`); else el.style.removeProperty('--sink');
    done?.();
  };
  const step = (now) => {
    const k = clamp((now - t0) / ms, 0, 1);   // (the frame's time can be a few ms before t0, taken in the handler: held at 0, so the cubic ease out never starts backwards)
    if (k >= 1) { finish(); return; }
    el.style.setProperty('--sink', `${from + (px - from) * (m0 == null ? 1 - (1 - k) ** 3 : settleAt(k, m0))}px`);
    a.raf = frame(step, 'numbers');
  };
  // (A page whose frames stall, in the background or a busy browser, still lands and closes on time.)
  a.timer = setTimeout(finish, ms + 120);
  sinking.set(el, a);
  a.raf = frame(step, 'numbers');
}
/** A phone's bottom sheet follows a vertical drag from anywhere on it and closes past a short pull (or a quick
 *  flick) down; a short one eases back. Content scrolled away from its top scrolls back first, a sideways drag
 *  and a slider keep their own gestures, and taps work as normal. onClose closes it; the sheet is already
 *  sliding out of sight (data-swiped is set) so the close needs no animation of its own. */
/** How far a panel is drawn from where it sits along y right now (px), mid-transition or mid-animation included. */
function liveShift(panel) {
  try {
    const m = getComputedStyle(panel).transform;
    return !m || m === 'none' ? 0 : Math.max(0, new DOMMatrixReadOnly(m).m42 || 0);
  } catch { return 0; }
}
export function swipeSheet(panel, onClose) {
  let s = null, easeT = 0;   // easeT: lets go of the transition a release leaves on the panel (one timer: an older release's must not cut a newer one's short)
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
    // (Where the sheet is drawn and how tall it is, read at the touch, never in the moves that follow: liveShift, offsetHeight.)
    s = { x: t.clientX, y: t.clientY, top: !sc || sc.scrollTop <= 0, on: false, dy: 0, t: 0, trail: [], shift: thumbUi() ? 0 : liveShift(panel), h: panel.offsetHeight };
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
      // (Not over the thumb dock too: the sheet's own transform is still easing back, read where it is drawn now, so the pull takes it
      // over from there and it does not jump to the finger.)
      s.on = true; s.y = t.clientY - (thumbUi() ? parseFloat(panel.style.getPropertyValue('--sink')) || 0 : s.shift); s.t = performance.now();
      panel.style.transition = 'none'; panel.style.animation = 'none'; stopSink(panel);
    }
    if (e.cancelable) e.preventDefault();
    s.dy = Math.max(0, t.clientY - s.y);
    s.trail.push([performance.now(), t.clientY]); if (s.trail.length > 8) s.trail.shift();
    if (thumbUi()) panel.style.setProperty('--sink', `${s.dy}px`);
    else panel.style.transform = `translateY(${s.dy}px)`;
  }, { passive: false });
  const end = () => {
    const s0 = s; s = null;
    if (!s0?.on) return;
    const speed = releaseSpeed(s0.trail, performance.now());   // (px per ms down, as the finger lifted: the settle starts at that speed)
    // (A flick is how fast the finger was going as it lifted, not only the pull's average: a slow start and a quick flick at the end is one.)
    const flick = isFlick(s0.dy, speed, s0.dy / Math.max(1, performance.now() - s0.t), 0.6, 30);
    const H = s0.h;
    const gone = flick || s0.dy > Math.min(90, H * 0.3);
    // (Over the thumb dock it sinks behind the tab row: the move and the cut in one value, never one ahead of the other.)
    if (thumbUi()) {
      panel.style.transition = '';
      if (gone) { sinkTo(panel, H, 220, undefined, speed); panel.dataset.swiped = '1'; onClose(); } else sinkTo(panel, 0, 220, undefined, speed);
      return;
    }
    // (The same, as a CSS curve: its opening slope is the finger's speed over the distance left, up to the .2/.8 curve's own, 4.)
    const left = gone ? H - s0.dy : -s0.dy;
    panel.style.transition = `transform ${D_SMALL}ms ${carryCurve(speed, left, D_SMALL)}`;   // (a let-go carries the finger's own speed, so the curve opens at its slope)
    if (gone) { panel.style.transform = 'translateY(100%)'; panel.dataset.swiped = '1'; onClose(); }
    else { panel.style.transform = ''; clearTimeout(easeT); easeT = setTimeout(() => { if (!s) panel.style.transition = ''; }, D_SMALL); }
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
  const el = icon(id); if (cls) el.classList.add(...cls.split(/\s+/).filter(Boolean)); return el;
}

let modalReturn = null;
// (The main menu and its preview sit outside #app and stay open behind a question asked from one of its rows, Delete script or a name: while
// the dialog is up they are inert, so Tab does not leave the dialog and a letter typed in it does not reach the menu's search.)
const behindDialog = (on) => { for (const m of document.querySelectorAll('.umenu, .um-pv')) m.inert = on; };
// (The on-screen keyboard covers the page's foot without shrinking it: the dialog is held to the room above it, and eases there.)
const modalVV = window.visualViewport;
let modalKbT = 0, modalBand = [0, 0];   // ([top, keyboard] the dialog is centred between now, px)
// (The viewport's moves (a keyboard sliding, the page panned to a field) are followed as a task between frames, once per batch: never
// read in the move's own callback.)
let modalFitAsk = 0;
const fitModalSoon = () => { modalFitAsk ||= restPass(fitModalRest); };
const fitModalRest = () => { modalFitAsk = 0; if (document.getElementById('modalBack')?.classList.contains('show')) fitModal(); };
// (The dialog is centred in that band: a new band moves it by half the change of each edge. It takes its place at once and glides
// there from where it stood by translate; nothing's top, bottom or height is eased.)
const bandTo = (back, top, kb) => {
  const dy = ((top - modalBand[0]) - (kb - modalBand[1])) / 2;
  modalBand = [top, kb];
  const m = back.querySelector('.modal');
  if (m?.animate && Math.abs(dy) > 0.5 && back.classList.contains('show')) m.animate([{ translate: `0 ${-dy}px` }, { translate: '0 0' }], { duration: D_SMALL, easing: EASE_ARRIVE, composite: 'add' });
};
const fitModal = () => {
  // (A page pinched in is not a keyboard: only a visual viewport at the page's own scale counts. iOS also pans the page up to the field with the keyboard
  // up, so the dialog is held to the visible band, from its top down to the keyboard, and not to the band from the page's top.)
  const back = document.getElementById('modalBack'), kb = modalVV && modalVV.scale <= 1.05 ? Math.round(innerHeight - modalVV.offsetTop - modalVV.height) : 0;
  clearTimeout(modalKbT);
  if (kb > 80) { back.classList.add('kb'); bandTo(back, Math.max(0, Math.round(modalVV.offsetTop)), kb); back.style.setProperty('--modal-kb', `${kb}px`); back.style.setProperty('--modal-top', `${Math.max(0, Math.round(modalVV.offsetTop))}px`); }
  else if (back.classList.contains('kb')) {   // (the keyboard went: the dialog eases back down and out to the top, then the class goes)
    bandTo(back, 0, 0); back.style.setProperty('--modal-kb', '0px'); back.style.setProperty('--modal-top', '0px');
    modalKbT = setTimeout(() => { if (!back.classList.contains('leaving')) { back.classList.remove('kb'); back.style.removeProperty('--modal-kb'); back.style.removeProperty('--modal-top'); } }, 320);
  }
};
// compact: a question or a short form (Reset, Delete, a name), 440 px wide, not the reading dialogs' 720. onClose: told once when this
// dialog goes, for any reason (its button, Esc, a tap on the scrim, another dialog opening in its place), so a question always answers.
export function openModal(title, body, { wide = false, sub = null, bare = false, compact = false, onClose = null } = {}) {
  const back = document.getElementById('modalBack');
  const modal = document.getElementById('modal');
  const replacing = back.classList.contains('show');   // (a dialog opened over one that is showing: its words change in place)
  // (The button to come back to is the first opener's: a dialog opened from a dialog, or from a menu row that is about to leave,
  // returns to where the first one began, or to the menu's own button.)
  if (!back.classList.contains('show')) modalReturn = openMenu && openMenu.el.contains(document.activeElement) ? openMenu.anchor : (document.activeElement === document.body && performance.now() - lastMenu.t < 400 ? lastMenu.anchor : document.activeElement);
  // The page behind a dialog cannot be reached by Tab or a screen reader; the dialog's own copy of the page is the only one left.
  const appEl = document.getElementById('app'); if (appEl) appEl.inert = true;
  behindDialog(true);
  const passed = modalDone; modalDone = onClose; passed?.();   // (a dialog opened over another one: the first is answered as closed)
  modal.innerHTML = '';
  modal.style.width = wide ? 'min(960px, 100%)' : compact ? 'min(440px, 100%)' : '';
  modal.classList.toggle('compact', compact);
  modal.scrollTop = 0;
  modal.setAttribute('aria-label', title || 'Dialog');
  const close = h('button', { class: 'ib', 'aria-label': 'Close', onclick: closeModal }, icon('close'));
  const head = h('header', {}, h('div', { style: { flex: 1, minWidth: 0 } }, bare ? null : h('h2', {}, title), sub ? h('div', { class: 'sub' }, sub) : null), close);
  // The title and its close button stay in view over a long page; a hairline marks the edge once the page has scrolled under them.
  // (Told by an observer of a one-pixel mark at the page's top leaving the dialog's view, not by reading the scroll on every scroll.)
  modal.onscroll = null;
  const topMark = h('div', { class: 'modal-top-mark', 'aria-hidden': 'true', style: { height: '1px', marginBottom: '-1px' } });
  modalTopIO?.disconnect();
  modalTopIO = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([e]) => head.classList.toggle('scrolled', !e.isIntersecting), { root: modal, rootMargin: '2px 0px 0px 0px' }) : null;   // (scrolled past 2 px, as before)
  modal.append(topMark, head, h('div', { class: 'body' }, body));
  modalTopIO?.observe(topMark);
  clearTimeout(modalLeaveT); back.classList.remove('leaving');
  back.classList.add('show');
  // (Its page fades in over the old one's place, as every other change of words does, not in one frame.)
  if (replacing && !reduceMotionMQ.matches) modal.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing: EASE_ARRIVE });
  fitModal(); modalVV?.addEventListener('resize', fitModalSoon); modalVV?.addEventListener('scroll', fitModalSoon);
  back.onclick = (e) => { if (e.target === back) closeModal(); };
  (modal.querySelector('.body button, .body [tabindex]') || close).focus({ preventScroll: true });
}
let modalLeaveT = 0, modalTopIO = null;
let modalDone = null;
export function closeModal() {
  const back = document.getElementById('modalBack');
  if (!back.classList.contains('show')) return;
  const done = modalDone; modalDone = null;
  // (It fades out as it faded in, then is hidden: closed in one frame, Help, About and every dialog blinked out.)
  back.classList.remove('show'); back.classList.add('leaving');
  modalVV?.removeEventListener('resize', fitModalSoon); modalVV?.removeEventListener('scroll', fitModalSoon);
  clearTimeout(modalLeaveT); modalLeaveT = setTimeout(() => back.classList.remove('leaving'), 220);
  setTimeout(() => { if (!back.classList.contains('show')) { back.classList.remove('kb'); back.style.removeProperty('--modal-kb'); back.style.removeProperty('--modal-top'); modalBand = [0, 0]; } }, 240);   // (the dialog holds its place while it fades)
  const appEl = document.getElementById('app'); if (appEl) appEl.inert = false;
  behindDialog(false);
  const back0 = modalReturn?.isConnected ? modalReturn : document.getElementById('btnMenu');
  // (Shown, by its own boxes: offsetParent is missing on an SVG element and null on a fixed one, so a vessel or a fixed bar never got its focus back.)
  if (back0 && (back0.checkVisibility ? back0.checkVisibility({ checkVisibilityCSS: true }) : back0.getClientRects().length > 0)) back0.focus?.({ preventScroll: true });
  done?.();
}
/** A question in the app's own dialog, not the browser's: resolves true on the confirming button, false on Cancel, Esc, the close
 *  button or a tap outside. The safe button has focus. danger: the confirming button is drawn as a warning. */
export function confirmDialog({ title, body, yes = 'OK', no = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v) => { if (answered) return; answered = true; resolve(v); };
    openModal(title, h('div', {},
      ...(Array.isArray(body) ? body : [body]).map((t) => (typeof t === 'string' ? h('p', {}, t) : t)),
      h('div', { class: 'btn-row end' },
        h('button', { class: 'btn', onclick: () => closeModal() }, no),
        h('button', { class: 'btn ' + (danger ? 'danger-fill' : 'primary'), onclick: () => { answer(true); closeModal(); } }, yes))),
    { compact: true, onClose: () => answer(false) });
  });
}
/** A short text answer in the app's own dialog: resolves the text (trimmed, never empty) or null when it is cancelled. */
export function askText({ title, label, value = '', yes = 'Save', hint = null }) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (v) => { if (answered) return; answered = true; resolve(v); };
    const input = h('input', { class: 'ask-field', type: 'text', value, 'aria-label': label, autocomplete: 'off', spellcheck: 'false', maxlength: '80' });
    const go = () => { const t = input.value.trim(); if (!t) { input.focus(); return; } answer(t); closeModal(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); go(); } });
    openModal(title, h('div', {},
      h('label', { class: 'ask-label' }, label, input), hint ? h('p', { class: 'sub' }, hint) : null,
      h('div', { class: 'btn-row end' }, h('button', { class: 'btn', onclick: () => closeModal() }, 'Cancel'), h('button', { class: 'btn primary', onclick: go }, yes))),
    { compact: true, onClose: () => answer(null) });
    input.focus({ preventScroll: true }); input.select();
  });
}
export const isModalOpen = () => document.getElementById('modalBack').classList.contains('show');

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/** A touch that starts on the phone's own edge (the home indicator's swipe up, a back swipe): the
 *  system's gesture, not the figure's. */
export const systemEdge = (ev) => ev.pointerType === 'touch' && (ev.clientY > innerHeight - 34 || ev.clientX < 12 || ev.clientX > innerWidth - 12);
export const lerp = (a, b, t) => a + (b - a) * t;

// Theme tokens are read many times per frame by the canvas instruments, and never from the page inside a frame: every token the
// stylesheets declare (and those set on the root's own style) is read outside the frames, at load and whenever the theme can change
// (the root's data-theme, data-palette, style or class, or the system colour scheme). A frame only looks them up. (A name no stylesheet declares has no value at the root: '' until the next pass reads it, as the page would give.)
const varCache = new Map();
const alphaCache = new Map();   // (cleared with the tokens: the instruments ask for the same few colours on every frame)
const varNames = new Set();
let varsAsk = 0;
function collectVarNames(rules) {
  for (const r of rules || []) {
    const st = r.style;
    if (st) for (let i = 0; i < st.length; i++) if (st[i].startsWith('--')) varNames.add(st[i]);
    let inner = null; try { inner = r.cssRules; } catch { /* (a sheet from another origin: no tokens of ours) */ }
    if (inner) collectVarNames(inner);
  }
}
function readVars() {
  varsAsk = 0;
  if (typeof getComputedStyle !== 'function') return;   // (no page: the unit tests' stand-in)
  const root = document.documentElement;
  for (const sh of document.styleSheets || []) { let rules = null; try { rules = sh.cssRules; } catch { /* (another origin) */ } collectVarNames(rules); }
  collectVarNames([root]);   // (the root's own style: --label-k and the like)
  const cs = getComputedStyle(root);
  for (const n of varNames) varCache.set(n, cs.getPropertyValue(n).trim());
  alphaCache.clear();
}
const varsSoon = () => { if (!varsAsk) varsAsk = restPass(readVars); };
// (A theme change is read in the observer's own task, before the frame that draws in it; the root's style, which a frame's work may set
// (--label-k through a zoom), in a rest pass after it.)
// (2 Nov 2026: a theme change is read first thing in the next frame (frame.js readFrame), before anything draws in it, not in the
// observer's microtask straight after the page's writes.)
let varsEarly = 0;
const varsFirst = () => { varsEarly = 0; readVars(); };
new MutationObserver((rs) => { if (rs.some((r) => r.attributeName !== 'style')) { if (!varsEarly) varsEarly = readFrame(varsFirst); } else varsSoon(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette', 'style', 'class'] });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readVars);
readVars();   // (at load, before any frame: the stylesheets are in, a module runs after them)
export function cssVar(name) {
  const v = varCache.get(name);
  if (v !== undefined) return v;
  varNames.add(name); varsSoon();
  return '';
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
export const cssAlpha = (name, a) => { const k = `${name}|${a}`; let v = alphaCache.get(k); if (v === undefined || !varCache.has(name)) { v = `rgba(${cssRGB(name).join(',')},${a})`; if (alphaCache.size > 2000) alphaCache.clear(); alphaCache.set(k, v); } return v; };   // (a fade asks for a new alpha every frame: the cache is cut at 2000)
/** A colour ramp token ('#hex position, #hex position, …') as [[position, '#hex'], …]. */
export const cssRamp = (name) => [...cssVar(name).matchAll(/(#[0-9a-f]{6})\s+(-?[\d.]+)/gi)].map((m) => [+m[2], m[1]]);
// The blood's colours on the GPU (theme independent: they sit on the lumen, not on the page), in 0–1.
// originCol follows ORIGINS (blood.js): SMV, IMV, splenic vein, hepatic artery, systemic.
let bloodCols = null;
export const bloodColors = () => bloodCols || (bloodCols = {
  originCol: ['smv', 'imv', 'spleen', 'artery', 'systemic'].map((o) => cssRGB01(`--origin-${o}`)),
  dyeCol: cssRGB01('--blood-dye'), inkLight: cssRGB01('--blood-ink-light'), inkDark: cssRGB01('--blood-ink-dark'),
  revCol: cssRGB01('--blood-reversed'), chevInk: cssRGB01('--blood-chevron'), chevLight: cssRGB01('--blood-chevron-light'),
});

/** Canvas sized to its box with device-pixel ratio. Returns ctx with CSS-pixel units. */
// Each canvas's box is tracked by a ResizeObserver instead of measured on every draw (a
// forced layout when it follows other DOM writes).
const boxes = new WeakMap();
// The instruments drawn at this many times the screen's density: a zoomed data card (card-zoom.js) shows them larger than they were
// laid out, so they are drawn for the size they are seen at. 1 otherwise.
let canvasBoost = 1;
export const setCanvasBoost = (k) => { canvasBoost = Math.max(1, +k || 1); };
const sizedSubs = new WeakMap();   // (canvas -> functions run when it first has a box, or has one again after none)
const boxObserver = new ResizeObserver((entries) => {
  for (const e of entries) {
    const was = boxes.get(e.target), r = { width: e.contentRect.width, height: e.contentRect.height };
    boxes.set(e.target, r);
    if ((!was || was.width < 1 || was.height < 1) && r.width >= 1 && r.height >= 1) for (const f of sizedSubs.get(e.target) || []) f();
  }
});
/** f() each time the canvas comes to have a box (its first, or again after it had none): a draw that waited redraws. */
export function onCanvasSized(canvas, f) {
  // (observed before f is kept: f runs on a later report, never inside the call that asks for it, its chart not yet made)
  if (!boxes.has(canvas)) { boxes.set(canvas, { width: 0, height: 0 }); boxObserver.observe(canvas); }
  if (!sizedSubs.has(canvas)) sizedSubs.set(canvas, new Set());
  sizedSubs.get(canvas).add(f);
  return () => sizedSubs.get(canvas)?.delete(f);
}
/** A canvas's size as fitCanvas sizes it, without touching it: w × h CSS px, W × H device px at dpr (the GPU charts, trace-gl.js, draw at it). */
// (It never measures, in a frame or out of one: a canvas the observer has not reported yet is 0 x 0, which every caller takes as
// "wait for its measured size", and each chart's pen (createTraceGL's redraw, onCanvasSized) draws it again once it has a box.
// 1 Nov 2026: no layout read in a frame.)
export function canvasSize(canvas) {
  let r = boxes.get(canvas);
  if (!r) { boxes.set(canvas, { width: 0, height: 0 }); boxObserver.observe(canvas); r = boxes.get(canvas); }
  // The instruments (Doppler, FibroScan, the HVPG tracing, scope, wall, charts) at the screen's own density, up to 3x: a 3x iPhone drew
  // their words at 2x, slightly soft (#34). Battery saver keeps 2x.
  const dpr = Math.min(saver() ? 2 : 3, (window.devicePixelRatio || 1) * canvasBoost);
  return { w: r.width, h: r.height, W: Math.max(1, Math.round(r.width * dpr)), H: Math.max(1, Math.round(r.height * dpr)), dpr };
}
// A pen that draws nothing: what a chart is handed where the GPU cannot draw it now (no WebGL2, its shader failed, a lost context, or
// ?tracegl=0). No 2D canvas is drawn on anywhere (Mohammad, 1 Nov 2026: "block everything until everything is on GPU"): the chart's
// GPU drawer redraws it the moment it can (trace-gl.js publish). It keeps the state a chart sets and answers what a chart asks (words
// measured from the GPU atlas's own Inter, as the GPU sets them), so the drawing code runs as it does on the GPU, painting nothing.
const NOOP = () => {}, NO_GRAD = { addColorStop: NOOP }, blankPens = new WeakMap();
function blankPen(canvas) {
  let p = blankPens.get(canvas);
  if (p) return p;
  const st = {
    canvas, onGPU: false, blank: true, font: '10px sans-serif', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,   // colour-exempt: the 2D canvas's own defaults
    textAlign: 'start', textBaseline: 'alphabetic', lineCap: 'butt', lineJoin: 'miter', lineDashOffset: 0, imageSmoothingEnabled: true,
    measureText: (t) => { const px = parseFloat(/([\d.]+)px/.exec(st.font)?.[1]) || 10; return { width: measureWords(String(t), st.font), actualBoundingBoxAscent: px * 0.73, actualBoundingBoxDescent: px * 0.21 }; },
    createLinearGradient: () => NO_GRAD, createRadialGradient: () => NO_GRAD, createPattern: () => null,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), getLineDash: () => [], isPointInPath: () => false, isPointInStroke: () => false,
  };
  // (Any other call is a no-op; an unknown field reads as undefined, so the pen is never taken for a promise.)
  p = new Proxy(st, { get: (o, k) => (k in o ? o[k] : typeof k === 'string' && k !== 'then' && k !== 'toJSON' ? NOOP : undefined) });
  blankPens.set(canvas, p);
  return p;
}
/** The canvas's buffer sized to its box (fitBox) and a pen that draws nothing ({ ctx, w, h }): the charts draw on the GPU (trace-gl.js fitPen),
 *  and this is what they hold where it cannot draw now. */
export function fitCanvas(canvas) {
  const { w, h: hh } = fitBox(canvas);
  return { ctx: typeof canvas.testPen === 'function' ? canvas.testPen() : blankPen(canvas), w, h: hh };   // (testPen: a check's recorder, tests/instruments-draw.test.js)
}
/** The canvas's buffer sized to its box at fitCanvas's density, with no context asked for (a WebGL instrument sizes its buffer this way):
 *  { w, h } in CSS pixels and the dpr its buffer is drawn at. */
export function fitBox(canvas) {
  const { w, h, W, H, dpr } = canvasSize(canvas);
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  return { w, h, dpr };
}

/** ?sliderglide=0 in a page's search string: a slider's dot and fill always jump to a new value, as before. */
export const sliderGlideOff = (search) => /[?&]sliderglide=0\b/.test(String(search ?? ''));
/** The least a slider's value must jump, as a share of its range, before the dot travels there instead of taking it in one frame. */
export const GLIDE_MIN = 0.04;
const glides = new WeakMap();
/** A value that was set from outside (Reset, a double click, a patient or a preset, an undo) used to put the dot and the fill at
 *  the new place in one frame. They now travel there over --d-surface on the quintic ease, the dot (the input's own value) and the
 *  fill (--p) together, so they never part. Only a jump of GLIDE_MIN of the range or more travels: a drag, a key step, the model
 *  following a time-lapse each frame, all smaller, are taken at once as before, and so is anything under a finger or a mouse button
 *  (the dot stays under the pointer). Reduce Motion, a hidden slider and ?sliderglide=0 take it at once too. */
function glideFill(input, wrap, f, prev) {
  const min = +input.min || 0, max = +(input.max || 100), step = input.step === 'any' ? 0 : +input.step || 1, to = +input.value;
  const from = min + prev * (max - min);
  const held = input.classList.contains('held') || input.matches(':active');
  const g = glides.get(input);
  // (Asked again for the place it is already going to, as a model sync does each frame: the dot is put back where the glide has it and the glide goes on.)
  if (g && Math.abs(g.f - f) < 1e-9) { input.value = g.cur; return; }
  if (g) { cancelFrame(g.raf); glides.delete(input); }
  const far = Math.abs(f - prev) >= GLIDE_MIN;
  if (!far || held || reduceMotionMQ.matches || sliderGlideOff(typeof location !== 'undefined' ? location.search : '') || !input.isConnected || !hasBox(input)) { wrap.style.setProperty('--p', String(f)); return; }
  const t0 = easeNow(), run = { raf: 0, f, cur: String(+(+input.value).toFixed(6)) };
  glides.set(input, run);
  const at = (k) => {
    let v = from + (to - from) * k;
    if (step && k < 1) v = Math.round((v - min) / step) * step + min;   // (the dot sits on a step; the fill follows the dot)
    return Math.min(max, Math.max(min, v));
  };
  const tick = () => {
    const u = Math.min(1, (easeNow() - t0) / D_SURFACE), v = u >= 1 ? to : at(easeMove(u));
    input.value = run.cur = String(+v.toFixed(6));
    wrap.style.setProperty('--p', String(max > min ? Math.min(1, Math.max(0, (v - min) / (max - min))) : 0));
    if (u < 1 && glides.get(input) === run) run.raf = frame(tick, 'numbers'); else if (glides.get(input) === run) glides.delete(input);
  };
  input.value = run.cur = String(+at(0).toFixed(6)); wrap.style.setProperty('--p', String(Math.min(1, Math.max(0, prev))));
  run.raf = frame(tick, 'numbers');
}
/** A slider's fill follows its value: the wrapper (.range-wrap, styles/app.css) draws them from --p, 0 to 1. The caller has set
 *  input.value to the new value; a big jump of it from a place outside the pointer's hand glides (glideFill). */
export function paintRange(input, f) {
  const wrap = input.parentElement;
  if (!wrap) return;
  f = Math.min(1, Math.max(0, f));
  const prev = parseFloat(wrap.style.getPropertyValue('--p'));
  if (Number.isFinite(prev)) glideFill(input, wrap, f, prev);
  else wrap.style.setProperty('--p', String(f));
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
  // (r: the slider's box, read once at the press, never in the drag's moves.)
  const fromX = (input, cx, th, r) => {
    const min = +input.min || 0, max = +(input.max || 100);
    return min + clamp((cx - r.left - th / 2) / Math.max(1, r.width - th), 0, 1) * (max - min);
  };
  root.addEventListener('pointerdown', (e) => {
    const input = e.target;
    if (e.pointerType !== 'touch' || !isRange(input)) return;
    e.preventDefault();
    input.focus({ preventScroll: true });
    input.classList.add('held');   // (the thumb's held ring, app.css: iOS gives a range no :active)
    const th = parseFloat(getComputedStyle(input).getPropertyValue('--tw')) || 18;
    const box = input.getBoundingClientRect();
    setTo(input, fromX(input, e.clientX, th, box));
    try { input.setPointerCapture(e.pointerId); } catch { /* gone */ }
    const move = (ev) => { if (ev.pointerId === e.pointerId) setTo(input, fromX(input, ev.clientX, th, box)); };
    const up = (ev) => {
      if (ev.pointerId !== e.pointerId) return;
      input.removeEventListener('pointermove', move); input.removeEventListener('pointerup', up); input.removeEventListener('pointercancel', up);
      input.classList.remove('held');
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
 * Eases an array of values toward a target, frame-rate independent, so a chart's line, dots, labels and axis glide rather than
 * jump when the model changes. The Pressure card and the lobule's pressure ladder share it. step(target) → { v, moving }.
 * It is the shown state's filter (display-state.js follow2, premium-feel R4: the widths', colours' and numbers' one clock, time
 * constant tau): a value at rest takes a step of at most `small` at once (a steady model costs no frames). jumps: a jump of the model
 * (noteJump: a reset, a patient, an intervention, a clock change) is taken at once, never blended into the state before it (the
 * Pressure chart, which drew each model frame as it came before; the lobule, which always glided, still glides).
 * A value whose two stages are both within `small` of its target is shown at the target, at rest or on its way (the shown state's rule,
 * display-state.js: what is left cannot be seen), so a glide ends once it has come that near. step(target, watch): `watch` (a Uint8Array
 * the length of the target, 1 where the value is drawn) names the values that count: one it leaves out is taken at once and never keeps
 * the glide going (the Pressure chart draws eight stations of forty, and the arterial pressures' beat wobble kept it redrawing every frame).
 */
export function createEaser(tau = SHOWN_TAU, { small = 0, eps = 0.02, jumps = false } = {}) {
  let v = null, w = null, last = 0, moved = false, epoch = jumpCount();
  return {
    step(target, watch = null) {
      const now = performance.now(), dt = last && moved ? Math.min(0.25, Math.max(0, (now - last) / 1000)) : 0;   // (from rest: no time has passed under the new target yet)
      last = now;
      if (!v || v.length !== target.length || (jumps && epoch !== jumpCount())) { v = Float64Array.from(target); w = Float64Array.from(target); epoch = jumpCount(); moved = false; return { v, moving: false }; }
      let moving = false;
      for (let i = 0; i < target.length; i++) {
        const T = target[i];
        if ((watch && !watch[i]) || (Math.abs(T - v[i]) <= small && Math.abs(T - w[i]) <= small)) { v[i] = w[i] = T; continue; }
        const r = follow2(v[i], w[i], T, dt, tau, eps);
        v[i] = r.v; w[i] = r.w;
        if (Math.abs(T - v[i]) <= small && Math.abs(T - w[i]) <= small) v[i] = w[i] = T;   // (landed)
        if (v[i] !== T || w[i] !== T) moving = true;
      }
      moved = moving;
      return { v, moving };
    },
  };
}
/** A rounded axis top just above `max` (multiples of 5 mmHg, at least `min`). */
export const axisTop = (max, min = 10) => Math.max(min, Math.ceil((max + 2) / 5) * 5);

// The horizontal shift (layout px) an element's transform is on its way to: the end of a transform transition still under
// way, else the shift it has now. (The zoom pill glides aside with a side card by a transform; a fit read mid-glide had the
// circuit map dip and rise; round 2 review, RF2.)
export function transformEndX(el) {
  const now = getComputedStyle(el).transform;
  let t = now;
  const tr = el.getAnimations?.().find((a) => a.transitionProperty === 'transform');
  if (tr) t = tr.effect?.getKeyframes?.().at(-1)?.transform ?? now;
  try { return t && t !== 'none' ? new DOMMatrixReadOnly(t).e : 0; } catch { return 0; }
}
// An element's box with its horizontal transform at its end (see transformEndX).
export function settledBox(el, q = el.getBoundingClientRect()) {
  const t = getComputedStyle(el).transform, cur = t && t !== 'none' ? new DOMMatrixReadOnly(t).e : 0, end = transformEndX(el);
  if (end === cur) return q;
  const z = el.offsetWidth ? q.width / el.offsetWidth : 1;
  return new DOMRect(q.x + (end - cur) * z, q.y, q.width, q.height);
}
// A CSS translate value ("12px -40px", "12px", "none") as [x, y] layout px.
export function parseTranslate(t) {
  if (!t || t === 'none') return [0, 0];
  const [x = 0, y = 0] = String(t).trim().split(/\s+/).map((v) => parseFloat(v) || 0);
  return [x, y];
}
// An element's box with its translate property at the shift it is gliding to (data-rest-translate, "x y" layout px), not the shift
// it has this frame. The phone's data card opens and closes by a translate set frame by frame (presenter.js dockTo): the camera
// framed 60 ms into that glide counted the card where it stood then, so the figure sat high under a card opening and low under one
// closing, off the middle of the room between the cards (Ascites 8 on an iPhone, 21 Oct).
export function translateRest(el, q = el.getBoundingClientRect()) {
  const rest = el.dataset?.restTranslate;
  if (rest == null) return q;
  const [cx, cy] = parseTranslate(getComputedStyle(el).translate), [ex, ey] = parseTranslate(rest);
  if (cx === ex && cy === ey) return q;
  const z = el.offsetHeight ? q.height / el.offsetHeight : 1;
  return new DOMRect(q.x + (ex - cx) * z, q.y + (ey - cy) * z, q.width, q.height);
}
// An element's box without its own transform (a card's entrance offset): where it rests.
export function restBox(el, q = el.getBoundingClientRect()) {
  if (el.dataset?.zoomed != null) return q;   // (a zoomed card, card-zoom.js, reports the place it rests: its glide is no entrance to take off)
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return q;
  const m = new DOMMatrixReadOnly(t), z = el.offsetHeight ? q.height / el.offsetHeight : 1;
  return new DOMRect(q.x - m.e * z, q.y - m.f * z, q.width, q.height);
}

