// Words that change while they show, drawn on the GPU over their own box (Mohammad, 2 Nov 2026: "Move everything to GPU").
//
// A readout's number (a Doppler tile, a scope's grade, a stepper's litres, a monitor's day) used to be written into the page on the
// frame it changed: the browser laid the line out, painted its words and composited them again, a frame of CPU text work each time.
// Here a frame never touches the page. The words' look and place are read between frames (rest-pass.js), once, while nothing moves:
// their size, weight, figures, colour, letter spacing, alignment and baseline. A change in a frame draws the new words from Inter's own
// outlines (text-gl.js), at that look and place, filled by the charts' GPU painter (svg-gl.js, the shared context), over the page's own
// words, which are made clear. When the words have held still a moment (QUIET) the page's own words take them, between frames, and the
// picture goes: the screen reader and the next reading of the layout see the same words the screen showed.
//
//   const w = glWords(el);   // el: an element whose words are set only through w from now on
//   w.set('18.2', 'cm/s');   // the words (and a unit, set small beside them, as <small>)
//   w.text                   // the words it shows now
//   w.dispose()              // (recs-production-120hz §8) lets go of everything it holds: its observer, its place in the theme
//                            // list and the measure queue, its timers and rest passes, and its GPU picture; idempotent, and a
//                            // callback captured before it does nothing after. Its words stay in the page as they last landed.
//
// The words fall back to a write between frames (never in a frame) where the GPU cannot set them: no outlines yet, a character the
// cut glyphs do not have, an element with no box. ?glwords=0: every change is written into the page between frames, with no picture.

import { createSvgGL, svgModel } from './svg-gl.js?v=4d771742f3';
import { textPolys, textWidth, textBox, loadGlyphs, glyphsReady, textCovers, glyphRun } from './text-gl.js?v=d9c4b5088e';
import { restPass, cancelRest } from './rest-pass.js?v=f6a3355959';
import { readMetric } from './layout-snap.js?v=f87939cccb';
import { cssColor } from './css-color.js?v=e56f0c77ae';

/** How long the words hold still (ms) before the page's own words take them. */
export const QUIET = 260;
// Words that land in a box already measured keep its measure: their box's size, type and alignment hold, so the next words are set from the
// same edge (start, end or middle) without reading the page again. A box that changes size is measured again by its ResizeObserver. A
// readout that ticks with the model measured itself each time it landed, some 30 layout and style reads each, 2,000 in an 8 s pinch
// of the anatomy (2 Nov 2026, "zoom is miserable").
if (typeof document !== 'undefined') loadGlyphs();

const dOf = (polys) => {
  let d = '';
  for (const { pts, closed } of polys) {
    for (let i = 0; i < pts.length; i += 2) d += `${i ? 'L' : 'M'}${pts[i].toFixed(2)} ${pts[i + 1].toFixed(2)}`;
    if (closed) d += 'Z';
  }
  return d;
};
const rgba = (c) => { const [r, g, b, a] = (c && c !== 'none' && !/^url\(/.test(c) && cssColor(c)) || [0, 0, 0, 0]; return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`; };
const lookOf = (cs, svgT = false, sc = 1) => ({
  size: (parseFloat(cs.fontSize) || 12) * sc, weight: parseFloat(cs.fontWeight) || 400, tnum: /tabular-nums/.test(cs.fontVariantNumeric || ''),
  ls: (parseFloat(cs.letterSpacing) || 0) * sc, fill: rgba(svgT ? cs.fill : cs.color), upper: cs.textTransform === 'uppercase',
});

// (A new theme or palette: every readout's colour is read again, between frames.)
const ALL = new Set();
if (typeof MutationObserver === 'function' && typeof document !== 'undefined') {
  new MutationObserver(() => { for (const f of ALL) f(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
  globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => { for (const f of ALL) f(); });
}

// (Each step is a function of its own, outside glWords: reading and writing the page happen only in the rest passes and timers that
// call them, never in the frame that asks for new words.)

// ── Read between frames: where and how the page sets the words ──
// (Every readout asked for in a pass is read first, then all are written: a write between two reads made the browser lay the page
// out again for the next, one layout per readout as a slide's cards landed. 2 Nov 2026, "Move everything to GPU".)
// The slide cards whose fit reads their scroll sizes (presenter.js): a picture never reaches past them or their parts (measureRead).
const SLIDE_CARD = '.pz-text, .pz-data, .pz-panel';
const measureQ = new Set();
const live = new Set();   // (every glWords not yet disposed: glWordsLive() counts them, so a view's teardown can be seen to free them)
/** How many GPU word wrappers are alive (not disposed): registry, observers and queued work all follow it back to baseline. */
export const glWordsLive = () => ({ live: live.size, themed: ALL.size, queued: measureQ.size });
let measureAll = 0;
// (2 Nov 2026, bug sweep: a readout whose element had left the page (a slide's card built anew, an instrument closed, a callout
// gone) kept its GPU drawer, its context's buffers and arrays, its observer and its place here for the rest of the session: every
// deck opened added its cards' words again, about a dozen GPU drawers a walk through Ascites. Between frames such a one is put to
// sleep: its GPU picture freed, its observer and its places here let go, so nothing but its owner holds it. Its words stay in the
// page; set, settle or now wakes it, written into the page between frames and measured again (a new picture) once it is back.)
function sleep(S) {
  if (S.dead || S.asleep) return;
  S.asleep = true;
  S.ro?.disconnect();
  ALL.delete(S.ask); measureQ.delete(S); live.delete(S);
  clearTimeout(S.landT); S.landT = 0;
  if (S.on) { S.on = false; S.el.classList.remove('glw-on'); }
  S.pend = false;
  if (S.gl) { try { S.gl.dispose?.(); } catch { /* a lost context: nothing left to free */ } S.gl.cv?.remove(); S.gl = null; S.host.classList.remove('glw'); }
  S.vPath = S.uPath = null; S.vSlots = S.uSlots = null; S.at = null;
}
function wake(S) {
  if (S.dead || !S.asleep) return;
  S.asleep = false;
  ALL.add(S.ask); live.add(S);
  if (S.ro) S.ro.observe(S.el);
}
// (Only isConnected is read: no layout.)
function sweep() { for (const S of live) if (!S.el.isConnected) sleep(S); }
let sweepAsk = 0, madeSince = 0;
const askSweep = () => { if (!sweepAsk) sweepAsk = restPass(() => { sweepAsk = 0; madeSince = 0; sweep(); }); };
function measurePass() {
  measureAll = 0;
  sweep();
  const qs = [...measureQ]; measureQ.clear();
  const reads = qs.map((S) => { S.measureAsk = 0; return measureRead(S); });
  qs.forEach((S, i) => { if (reads[i]) measureWrite(S, reads[i]); });
}
function measureRead(S) {
  const { el, host, after } = S;
  if (S.dead) return;
  // (Words drawn or being drawn: the picture is not replaced under them, which left the page's words clear over an empty picture: a number that
  // vanished as its width changed. It is measured again once they have landed. B02: with the picture up (a readout that never holds still)
  // the ask is kept as stale and the picture is taken down in a rest pass of its own, so a resize or new theme still reaches the next draw.)
  if (S.on || S.pend) { S.stale = true; if (S.on) askLand(S); return; }
  if (!el.isConnected || !glyphsReady() || !S.txt?.data || S.txt.parentNode !== el) { S.at = null; return; }
  const box = host.getBoundingClientRect();
  if (!(box.width > 0 && box.height > 0)) { S.at = null; return; }
  // (A card still easing in, or shrunk by a transform, reads its boxes scaled: every length taken from a box is put back to layout px, the
  // units the picture's canvas and the type are in, or the words were drawn stretched, wide and blocky, as the card came in. 2 Nov 2026.)
  const lw = readMetric(host, 'offsetWidth'), kk = lw > 0 ? box.width / lw : 1, sx = Math.abs(kk - 1) < 0.01 ? 1 : kk;
  // (SVG words, a dial's number: their type is in the drawing's units, scaled to the screen by its transform; their anchor and fill are SVG's.)
  const svgT = typeof SVGElement !== 'undefined' && el instanceof SVGElement, sc = svgT ? Math.abs(el.getScreenCTM?.()?.a || 1) : 1;
  const r = document.createRange();
  r.selectNode(S.txt);
  const tr = r.getBoundingClientRect();
  // (Words over more than one line are the page's to set: they are written between frames.)
  const lines = new Set([...r.getClientRects()].filter((q) => q.width > 0).map((q) => Math.round(q.top)));
  if (lines.size > 1 || !(tr.width > 0)) { S.at = null; return; }
  const small = S.small;
  if (small) r.setEndAfter(small);
  const all = r.getBoundingClientRect();
  const cs = getComputedStyle(el), L = lookOf(cs, svgT, sc), U = small && !after ? lookOf(getComputedStyle(small), svgT, sc) : L;
  const ta = svgT ? ({ middle: 'center', end: 'end' }[cs.textAnchor] || 'start') : cs.textAlign, rtl = cs.direction === 'rtl';
  const align = ta === 'center' ? 'middle' : /right/.test(ta) || (ta === 'end' && !rtl) || (ta === 'start' && rtl) ? 'end' : 'start';
  const k = devicePixelRatio || 1, asc = -textBox('0', 0, 0, { weight: L.weight, size: L.size, k }).y;
  const sAsc = small ? -textBox('0', 0, 0, { weight: U.weight, size: U.size, k }).y : 0;
  const at = { sm: !!small && !small.hidden, L, U, align, w: box.width / sx, h: box.height / sx, y: (tr.top - box.top) / sx + asc, uy: small ? (small.getBoundingClientRect().top - box.top) / sx + sAsc : 0,
    x0: (all.left - box.left) / sx, x1: (all.right - box.left) / sx };
  // (Room past the box on every side, so a longer number than the one laid out is drawn whole, never cut at the box's edge; but never
  // past an ancestor that clips or scrolls, where the picture would count as overflow and a card's fit would shrink the card for it.)
  const most = Math.ceil(L.size * 3);
  let cl = -Infinity, ct = -Infinity, cr = Infinity, cb = Infinity;
  // (A slide card and each part of it count as clipping too: the card is fitted from its own and its parts' scroll sizes (presenter.js
  // overflowOf), so a picture reaching past either read as overflow and shrank the whole card to its half floor, 2 Nov 2026: the Ascites
  // SAAG tiles over The abdomen, Portal vein flow over the Doppler card, drawn at half size behind their own glass.)
  for (let a = host.parentElement, n = 0; a && n < 12; a = a.parentElement, n++) {
    const acs = getComputedStyle(a);
    const card = a.matches(SLIDE_CARD) || a.parentElement?.matches(SLIDE_CARD);
    if (!card && acs.overflowX === 'visible' && acs.overflowY === 'visible' && !/paint|strict|content/.test(acs.contain || '')) continue;
    const ab = a.getBoundingClientRect();
    cl = Math.max(cl, ab.left); ct = Math.max(ct, ab.top); cr = Math.min(cr, ab.right); cb = Math.min(cb, ab.bottom);
  }
  const room = (v) => Math.max(0, Math.min(most, Math.floor(v)));
  const pad = { l: room((box.left - cl) / sx), t: room((box.top - ct) / sx), r: room((cr - box.right) / sx), b: room((cb - box.bottom) / sx) };
  return { at, pad, L, U };
}
function measureWrite(S, { at, pad, L, U }) {
  const { host } = S;
  if (S.dead) return;
  if (!S.gl) {
    S.gl = createSvgGL(host);
    S.gl.cv.setAttribute('aria-hidden', 'true'); S.gl.cv.removeAttribute('role');
    S.gl.cv.classList.add('glw-cv');
    host.classList.add('glw');
    S.gl.drawn = (ok) => drawn(S, ok);
  }
  // (The picture's place and size, for its canvas and the GPU drawer's canvas beside it (trace-gl.js): set outright, as a canvas is a
  // replaced element that insets alone do not stretch. app.css .glw.)
  host.style.setProperty('--glw-l', `${-pad.l}px`); host.style.setProperty('--glw-t', `${-pad.t}px`);
  host.style.setProperty('--glw-w', `${pad.l + pad.r}px`); host.style.setProperty('--glw-h', `${pad.t + pad.b}px`);
  S.vPath = svgModel('path', { fill: L.fill, d: '' });
  S.uPath = svgModel('path', { fill: U.fill, d: '' });
  // (recs-production-120hz §9: capacity reserved now, between frames: a glyph slot each, its path one cached per glyph, placed by a
  // translation. A change fills the slots it needs; longer words than the slots hold take the one-path way, as before.)
  S.vSlots = slotsOf(V_CAP, L.fill); S.uSlots = slotsOf(U_CAP, U.fill);
  S.gl.show(svgModel('svg', { viewBox: `${-pad.l} ${-pad.t} ${at.w + pad.l + pad.r} ${at.h + pad.t + pad.b}`, preserveAspectRatio: 'none' }, S.vPath, S.uPath, S.vSlots.map((q) => q.el), S.uSlots.map((q) => q.el)), false);
  S.at = at; S.stale = false;
  S.gl.paint();   // (a first, empty, drawing: the picture's canvas is sized now, between frames, so the first new words are drawn whole)
}
const askMeasure = (S) => { if (S.dead) return; measureQ.add(S); S.measureAsk = 1; if (!measureAll) measureAll = restPass(measurePass); };

// ── A frame: the new words drawn, nothing written into the page ──
const V_CAP = 24, U_CAP = 12;
const slotsOf = (n, fill) => Array.from({ length: n }, () => ({ el: svgModel('path', { fill, d: '' }), d: '', tr: '' }));
const setA = (q, d, tr) => { if (q.d !== d) { q.d = d; q.el.setAttribute('d', d); } if (tr != null && q.tr !== tr) { q.tr = tr; q.el.setAttribute('transform', tr); } };
const runV = [], runU = [];
// (The slots filled from a run of cached glyph paths; the rest emptied. Only what changed is written.)
function fillSlots(slots, run, y) {
  for (let i = 0; i < slots.length; i++) {
    const g = run[i];
    if (g) setA(slots[i], g[0], `translate(${g[1].toFixed(2)} ${y.toFixed(2)})`); else if (slots[i].d) setA(slots[i], '', null);
  }
}
function clearSlots(S) { for (const q of S.vSlots || []) if (q.d) setA(q, '', null); for (const q of S.uSlots || []) if (q.d) setA(q, '', null); }
function draw(S, t, u) {
  const { at, after } = S, { L, U, align } = at;
  const tt = L.upper ? t.toUpperCase() : t, uu = U.upper ? u.toUpperCase() : u;
  const wv = textWidth(tt, L), sp = u ? textWidth(' ', L) : 0, wu = u ? textWidth(uu, U) : 0, w = after ? wv : wv + sp + wu;
  const x = align === 'end' ? at.x1 - w : align === 'middle' ? (at.x0 + at.x1) / 2 - w / 2 : at.x0;
  // (after: the unit is the element's own ::after (attr(data-…)), set beside the words, outside the box, a no-break space after them)
  const uy = S.small && !after ? at.uy : at.y;
  const rv = glyphRun(tt, x, L, runV).glyphs, ru = u ? glyphRun(uu, x + wv + sp, U, runU).glyphs : (runU.length = 0, runU);
  if (S.vSlots && rv.length <= S.vSlots.length && ru.length <= S.uSlots.length) {
    if (S.vPath.getAttribute('d')) S.vPath.setAttribute('d', '');
    if (S.uPath.getAttribute('d')) S.uPath.setAttribute('d', '');
    fillSlots(S.vSlots, rv, at.y); fillSlots(S.uSlots, ru, uy);
  } else {
    clearSlots(S);
    S.vPath.setAttribute('d', dOf(textPolys(tt, x, at.y, L).polys));
    S.uPath.setAttribute('d', u ? dOf(textPolys(uu, x + wv + sp, uy, U).polys) : '');
  }
  S.pend = true;
  S.gl.paint();
}
// (2 Nov 2026, his iPhone: "the information of the instrument data cards disappear". The page's words were made clear as the new words
// were asked of the GPU, but the GPU does not always draw that frame (its shaders still being built, its context lost or busy, a canvas
// with no size yet: trace-gl.js ctx2d), and a readout that changes every frame never lands, so its words stayed clear. The page's words
// now go clear only in the frame the GPU has drawn the new ones; a frame it cannot draw shows the page's words again, and they are
// written into the page between frames.)
function drawn(S, ok) {
  if (S.dead || S.asleep) return;
  if (ok) { if (S.pend && !S.on) { S.on = true; S.el.classList.add('glw-on'); } S.pend = false; return; }
  if (!S.pend && !S.on) return;
  S.pend = false;
  if (S.on) { S.on = false; S.el.classList.remove('glw-on'); }
  askLand(S);
}

// ── Between frames: the page's own words take what the picture shows, and the picture goes ──
function land(S) {
  S.landAsk = 0;
  if (S.dead) return;
  const { el, want, shown } = S;
  // (Words written into the element by someone else, or none yet: its content is taken over here, between frames, as its words and unit.)
  if (!S.txt || S.txt.parentNode !== el) {
    S.txt = document.createTextNode(want.t); S.small = null;
    el.replaceChildren(...(S.gl && S.host === el ? [S.gl.cv] : []), S.txt);
    if (S.gl && S.host === el) S.gl.show(svgModel('svg', { viewBox: '0 0 1 1' }), false);
    shown.u = '';
  } else if (want.t !== S.txt.data) S.txt.data = want.t;
  if (want.u !== shown.u && !S.after) {
    if (want.u && !S.small) { S.small = document.createElement('small'); if (S.unitClass) S.small.className = S.unitClass; el.append(' ', S.small); }
    const sm = S.small;
    if (sm) { sm.textContent = want.u; sm.hidden = !want.u; const sp = sm.previousSibling; if (sp?.nodeType === 3 && sp !== S.txt) sp.data = want.u ? ' ' : ''; }
  }
  shown.t = want.t; shown.u = want.u;
  S.onLand?.();
  S.pend = false;
  if (S.on) { S.on = false; el.classList.remove('glw-on'); S.vPath.setAttribute('d', ''); S.uPath.setAttribute('d', ''); clearSlots(S); S.gl.paint(); }
  if (!S.at || S.stale || S.at.sm !== (!!S.small && !S.small.hidden)) askMeasure(S);   // (a unit that came or went moves the words: measured again)
}
const askLand = (S) => { clearTimeout(S.landT); S.landT = 0; if (S.dead) return; if (!S.landAsk) S.landAsk = restPass(() => land(S)); };

/** Words set through the GPU while they change (see above). `el`'s content is taken over: its words, then a <small> unit if any. */
export function glWords(el, { unitClass = '', after = false, host = el, onLand = null } = {}) {
  // (Its own text node, when it has one alone; otherwise one is made between frames, as the first words land: nothing is written here.)
  const only = el.firstChild?.nodeType === 3 && !el.firstChild.nextSibling ? el.firstChild : null, t0 = el.textContent || '';
  const S = { el, host, after, unitClass, onLand, txt: only, small: null, want: { t: t0, u: '' }, shown: { t: t0, u: '' },
    at: null, gl: null, vPath: null, uPath: null, on: false, pend: false, stale: false, landT: 0, measureAsk: 0, landAsk: 0, dead: false, ro: null };
  if (!only && t0) askLand(S);
  const ask = S.ask = () => askMeasure(S);
  if (typeof ResizeObserver === 'function') (S.ro = new ResizeObserver(ask)).observe(el);
  else ask();
  ALL.add(ask);
  live.add(S);
  if (++madeSince >= 16) askSweep();   // (a view built anew makes many: the ones it replaced are looked for between frames)
  const dispose = () => {
    if (S.dead) return;
    S.dead = true; S.asleep = false;
    S.ro?.disconnect(); S.ro = null;
    ALL.delete(ask); measureQ.delete(S); live.delete(S);
    clearTimeout(S.landT); S.landT = 0;
    if (S.landAsk) { cancelRest(S.landAsk); S.landAsk = 0; }
    // (The drawing and the flags that hide the page's own words leave together, in one rest pass: the words are never uncovered with
    // the drawing gone, nor left hidden once it has.)
    const gl = S.gl, wasOn = S.on, elx = S.el, host = S.host;
    S.on = false; S.gl = null;
    if (wasOn || gl) restPass(() => {
      const again = [...live].some((o) => o.el === elx || o.host === host);   // (made over again for the same element since: leave its flags)
      if (wasOn && !again) elx.classList.remove('glw-on');
      if (gl) { try { gl.dispose?.(); } catch { /* a lost context: nothing left to free */ } gl.cv?.remove(); if (!again) host.classList.remove('glw'); }
    });
    S.vPath = S.uPath = null; S.vSlots = S.uSlots = null;
  };
  return {
    el,
    dispose,
    get disposed() { return S.dead; },
    /** Whether its words are the element's own text node (not replaced by someone else since). */
    get owns() { return !S.dead && !!S.txt && S.txt.parentNode === el; },
    get text() { return S.want.t; },
    get unit() { return S.want.u; },
    /** Sets the words (and a unit): drawn on the GPU now, written into the page once they hold still. */
    set(t, u = '') {
      t = String(t ?? ''); u = String(u ?? '');
      if (S.dead || (t === S.want.t && u === S.want.u)) return;
      wake(S);
      S.want.t = t; S.want.u = u;
      // (?glwords=0, no look read yet, no outlines, a character not cut, words gone or a unit that has no place yet: written between frames.)
      if (!S.at || S.stale || !glyphsReady() || !t || !textCovers(t + u) || (u && !S.small && !after)) { askLand(S); return; }
      draw(S, t, u);
      clearTimeout(S.landT);
      S.landT = setTimeout(() => askLand(S), QUIET);
    },
    /** Takes the words into the page between frames, where a caller needs them laid out soon. */
    settle: () => { wake(S); askLand(S); },
    /** Writes the words into the page at once: for a caller between frames that measures them (a fit trying its widest words). */
    now(t, u = '') {
      if (S.dead) return;
      wake(S);
      S.want.t = String(t ?? ''); S.want.u = String(u ?? '');
      clearTimeout(S.landT); S.landT = 0; cancelRest(S.landAsk);
      land(S);
    },
  };
}

/** The box of an element's own words (its text nodes'), where a range over its contents would take in a readout's GPU picture too,
 *  which reaches past its words. Measured between frames only. */
export function wordsRect(el, rng = document.createRange()) {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  const w = document.createTreeWalker(el, 4);   // (NodeFilter.SHOW_TEXT)
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.data) continue;
    rng.selectNodeContents(n);
    const q = rng.getBoundingClientRect();
    if (!q.width && !q.height) continue;
    l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
  }
  return r >= l ? { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t } : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
}

/** One setter for several readouts: a glWords for each, made now (as the readouts are built, never in a frame). A node not given here
 *  is written between frames, never in one. */
export function wordSetter(nodes, opts) {
  const m = new Map(nodes.filter(Boolean).map((n) => [n, glWords(n, opts)])), late = new Map();
  let ask = 0, dead = false;
  const flush = () => { ask = 0; if (dead) return; for (const [n, t] of late) if (n.textContent !== t) n.textContent = t; late.clear(); };
  const set = (n, t, u) => {
    if (dead) return;
    const w = m.get(n);
    if (w) { w.set(t, u); return; }
    late.set(n, String(t ?? ''));
    if (!ask) ask = restPass(flush);
  };
  /** Lets go of every readout's glWords and the pending write (recs §8). */
  set.dispose = () => { if (dead) return; dead = true; for (const w of m.values()) w.dispose(); m.clear(); late.clear(); if (ask) { cancelRest(ask); ask = 0; } };
  return set;
}
