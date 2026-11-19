// The action card: click a structure and a small card opens with the numbers it carries and only the verbs that apply to it
// (card 5 on the side shelf, Mohammad's picks of 13 Nov 2026). It replaces the tool trays, the tool hint card and the sliders that
// used to live in the side panel. Every verb takes effect at once and becomes one entry in the timeline; nothing stays "armed".
//
// One shape for every structure, top to bottom: the name (a tap slides the card to its own details, card-details.js) with the direction of flow at its right; the pressure
// where the blood comes in and where it leaves, on a bar in the pressure colours with the drop between them (Δ, or the PPG across a
// stent and the HVPG across the liver, in their cut colours); the readings, named by their units; the controls, each with the app's
// icon; the actions, an icon and one word. Every card has one fixed size for its kind (app.css [data-size]) and shows all it holds:
// nothing scrolls. Where it stands never depends on what was picked: on a Mac or iPad a shelf at the left edge under the case pill, on
// a phone a card above the view switch. There is no leader line: the figure keeps the picked vessel and its label in full ink.
//
// Memory (2 Nov 2026, the off-GPU scan's `alloc` category): a card is built when a structure is picked and is read every model frame
// while it is open. Neither makes garbage a frame has to pay for: the props h() reads are kept objects (module scope, or the
// few that vary rewritten in place just before the call), a handler is one function made once per card and finds its element and
// verb in the event (`e.currentTarget._acV`), the live readings are the elements themselves (the card walks `live`, `syncs` and
// `actionable`, kept lists, and each element says what it is in `_acK`), and numbers are compared as numbers, never printed
// into a string to be compared.

import { widgetsPending, widgetState, enterWhenReady } from './widget-ready.js';
import { capture } from './pointer-capture.js';
import { warmSliders } from './slider-gl.js';
import { store, updateParams } from './store.js';
import { h, svgIcon, paintRange, isPhoneLayout, countTo, swapText, afterExit, markGone, switchIn, releaseWords } from './util.js';
import { sheetParts, dragSheet, glideSheet, stopSheet, setSheetOffset, sheetOffset } from './sheet-move.js';
import { releaseSpeed, isFlick, carryCurve, SHEET_FLICK_MIN, SHEET_FLICK_FAR, SHEET_CLOSE_PX, SHEET_CLOSE_SHARE, D_FLIP, D_SMALL, EASE_IN } from './ease.js';
import { cardFor, normalizeSel } from './actions.js';
import { createCardDetails } from './card-details.js';
import { frameFor } from './frame.js';
import { restPass, cancelRest } from './rest-pass.js';
import { runSoon, propSoon, attrSoon, classSoon, classNow, removeSoon } from './class-soon.js';
import { readBox, readMetric, readStyle } from './layout-snap.js';
import { gradientCss } from './colormap.js';
import { hvpgSev, ppgSev } from '../engine/portal/pressure-cuts.js';
import { reduceMotionMQ } from './motion.js';
import { handOver } from './hand-over.js';
import { glideCard, GLIDE_EVENT } from './card-glide.js';
import { cardMoveFor } from './card-motion.js';
const nextFrame = frameFor('card');

// A reading's printed number ("12.5", "−3.0"), with its decimals, or null for one that isn't a plain number: `out` ({ n, d }, a kept
// object the caller owns) is filled in and returned. The text is scanned by its characters, never copied or split: [−-]?\d+(\.\d+)?
// (the model's readings are strings). An ASCII text is the number JavaScript reads from it; with the typographic minus the magnitude
// is the digits as one integer over a power of ten (both exact up to fifteen digits, as a reading's are, so the division is the
// correctly rounded value the parse gives).
const NUM_A = { n: 0, d: 0 }, NUM_B = { n: 0, d: 0 };
const POW10 = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15, 1e16, 1e17, 1e18, 1e19, 1e20, 1e21, 1e22];
function numOf(t, out) {
  if (typeof t !== 'string') return null;
  const len = t.length, c0 = t.charCodeAt(0);
  let i = c0 === 45 || c0 === 0x2212 ? 1 : 0, m = 0, c;
  const i0 = i;
  while (i < len && (c = t.charCodeAt(i)) >= 48 && c <= 57) { m = m * 10 + (c - 48); i++; }
  if (i === i0) return null;
  let d = 0;
  if (i < len) {
    if (t.charCodeAt(i) !== 46) return null;
    i++;
    while (i < len && (c = t.charCodeAt(i)) >= 48 && c <= 57) { m = m * 10 + (c - 48); i++; d++; }
    if (d === 0 || i < len) return null;
  }
  out.d = d;
  out.n = c0 === 0x2212 ? -(m / (d < POW10.length ? POW10[d] : Math.pow(10, d))) : +t;
  return out;
}

// Props that never change, for h() (it reads them and keeps nothing).
const P_NONE = {};
const P_NUM = { class: 'ac-num' }, P_STATE = { class: 'ac-state' }, P_VALUE = { class: 'ac-value' };
const P_BODY = { class: 'ac-body' }, P_NR = { class: 'ac-nr' }, P_NAME = { class: 'ac-name', type: 'button' }, P_NAME_PLAIN = { class: 'ac-name plain' };
const P_SP = { class: 'ac-sp' }, P_EL = { class: 'ac-el' }, P_EL_R = { class: 'ac-el r' }, P_DV = { class: 'ac-dv' }, P_PA = { class: 'ac-pa' }, P_PB = { class: 'ac-pb' };
const P_TRACK = { class: 'ac-track', 'aria-hidden': 'true' }, P_RAMP = { class: 'ac-ramp' };
const P_RS = { class: 'ac-rs' }, P_R = { class: 'ac-r' }, P_EM = { class: 'ac-em' }, P_RV = { class: 'ac-rv' }, P_U = { class: 'ac-u' };
const P_CS = { class: 'ac-cs' }, P_CS_ONE = { class: 'ac-cs one' }, P_AS = { class: 'ac-as' }, P_PANEL = { class: 'ac-panel' };
const P_UNMEASURED = { class: 'ac-unmeasured' }, P_UNIT = { class: 'unit' }, P_DELTA_UP = { class: 'ac-delta up' }, P_DELTA_DOWN = { class: 'ac-delta down' }, P_DELTA_NONE = { class: 'ac-delta' };   // (the delta's slot is always there, empty when there is no change: see .ac-delta, app.css)
const P_ABOUT = { class: 'ac-about' };
const P_CTLTOP = { class: 'ctl-top' }, P_CTLNAME = { class: 'ctl-name' }, P_CTLVAL = { class: 'ctl-val' };
const P_RANGEWRAP = { class: 'range-wrap' }, P_TICKS = { class: 'ac-ticks', 'aria-hidden': 'true' }, P_TICK = { class: 'ac-tick', style: '' };
const P_METER = { class: 'ac-meter', 'aria-hidden': 'true' }, P_METER_FILL = { class: 'ac-meter-fill' }, P_METER_ROW = { class: 'ac-c ac-meter-row', role: 'meter', 'aria-label': '', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' };
const P_SWITCHVIS = { class: 'switch-vis', 'aria-hidden': 'true' };
const P_BL = { class: 'ac-bl' }, P_BTN = { class: 'ac-btn', 'aria-label': '', title: '' }, P_BTN_DANGER = { class: 'ac-btn danger', 'aria-label': '', title: '' }, P_BTN_QUIET = { class: 'ac-btn quiet', 'aria-label': '', title: '' };
const P_DYE = { class: 'ac-btn ac-dye', 'aria-label': 'Inject dye', title: 'Tap to inject for a few seconds; hold to go on longer' };
// Props that vary a little, rewritten in place just before the call that reads them (the key order is the order the attributes are made in).
const P_LINKB = { class: 'ac-btn ac-link', 'aria-label': '', onclick: null };
const P_SEG = { class: 'seg full ac-seg small', role: 'group', 'aria-label': '' };
const P_SEGROW = { class: 'ac-c ac-segrow' };
const P_PRESSED = { 'aria-pressed': 'false' };
const P_RANGE = { type: 'range', min: 0, max: 0, step: 0, 'aria-label': '', 'data-def': null };
const P_SLIDER = { class: 'ac-c ac-slider' };
const P_TOGGLE = { class: 'ac-c ac-toggle', role: 'switch', 'aria-checked': 'false', 'aria-label': '' };
// Animation keyframes and timings that never change (WAAPI reads them when animate() is called). A switch to another structure of the
// same size crossfades the words only, 6 px up, while the card stays still (B).
const WORDS_OUT = [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 -6px' }];
const WORDS_IN = [{ opacity: 0, translate: '0 6px' }, { opacity: 1, translate: '0 0' }];
// A pick while the card is open crosses the old words over the new ones on one clock, one for one: what the old words give up the new ones take, so the two opacities always make 1 (linear, together,
// D_FLIP). Out on its own curve and a delayed start, the old words were half gone before the new ones began and the words dipped to half for 100 ms on every pick (the tester, 17 Nov 2026).
const SWAP_OUT_OPT = { duration: D_FLIP, easing: 'linear', fill: 'forwards' }, SWAP_IN_OPT = { duration: D_FLIP, easing: 'linear', fill: 'backwards' };   // motion-scale: own pace (a crossfade of the old words and the new ones: linear, so the two opacities add up to one at every step, never a dip or a flash)
const FADE_OUT = [{ opacity: 1 }, { opacity: 0 }], FADE_IN = [{ opacity: 0 }, { opacity: 1 }];
// The card's face and its details trade places in the same box (17 Nov 2026): the face leaves 20 px toward the left as the details come in from 20 px at the right,
// and Back is the same two moves reversed. Opacity and translate only; the card's height never changes. With Reduce Motion they only fade.
const SIDE_FACE_OUT = [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '-20px 0' }], SIDE_FACE_IN = [{ opacity: 0, translate: '-20px 0' }, { opacity: 1, translate: '0 0' }];
const SIDE_DET_IN = [{ opacity: 0, translate: '20px 0' }, { opacity: 1, translate: '0 0' }], SIDE_DET_OUT = [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '20px 0' }];
// Options for countTo (it reads { eased } at once).
const COUNT_EASED = { eased: true }, COUNT_STEADY = { eased: false };
const DYE_HOLD = { hold: true }, DYE_ONCE = {};
const DYE_END = ['pointerup', 'pointercancel'];
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];   // (the number beside each of the first nine verbs)
// The bar's colours: the pressure ramp from 0 to RAMP_TOP mmHg, laid once on a strip that a transform slides and stretches so the
// track shows the stretch from the inflow's pressure to the outflow's. A new pair of pressures moves the strip on the compositor; its
// colours are never painted again.
const RAMP_TOP = 30;
// The cut colour of a gradient (HVPG, PPG) as a class: ok, caution, danger.
const CUT_CLS = { ok: 'ac-cut ok', caution: 'ac-cut caution', danger: 'ac-cut danger' };
// What each kind of control takes of the card (a segmented choice is two cells); a card with more than SMALL_CELLS is the tall size.
const CELLS = { slider: 1, toggle: 1, meter: 1, seg: 2, panel: 2 };   // (a panel: a component of its own, a stent's editor, stent-editor.js)
const SMALL_CELLS = 2;
const CTL = new Set(['slider', 'toggle', 'meter', 'seg']), ACT = new Set(['button', 'dye', 'link']), READ = new Set(['read', 'stat']);

// ---- A selection as a list of tokens, so two selections are told apart without printing either (what JSON.stringify told) ----
// Object keys and values in order (a key whose value is undefined, a function or a symbol left out, as JSON leaves it out; in a list it is
// null), a number that is not finite as null, markers for where an object or a list begins and ends. Two selections give the same tokens
// exactly when JSON.stringify gives them the same text.
const SEL_OBJ = Symbol('obj'), SEL_ARR = Symbol('arr'), SEL_END = Symbol('end');
const OWN = Object.prototype.hasOwnProperty;
const skipped = (v) => v === undefined || typeof v === 'function' || typeof v === 'symbol';
function encodeSel(v, out) {
  const ty = typeof v;
  if (ty === 'number') { out.push(Number.isFinite(v) ? v : null); return; }
  if (ty !== 'object' || v === null) { out.push(v === undefined || ty === 'function' || ty === 'symbol' ? null : v); return; }
  if (Array.isArray(v)) {
    out.push(SEL_ARR);
    for (let i = 0; i < v.length; i++) { if (skipped(v[i])) out.push(null); else encodeSel(v[i], out); }
  } else {
    out.push(SEL_OBJ);
    for (const k in v) { if (OWN.call(v, k) && !skipped(v[k])) { out.push(k); encodeSel(v[k], out); } }
  }
  out.push(SEL_END);
}

// The text of a pressure on the bar: one decimal, a dash where it is not measured (kept texts for the numbers met, by tenths).
const P_TEXT = new Map();
function pText(x) {
  const k = Math.round(x * 10);
  let t = P_TEXT.get(k);
  if (t === undefined) {
    if (P_TEXT.size > 4000) P_TEXT.clear();
    // alloc-rare: a pressure's text met for the first time (kept in P_TEXT)
    t = (k < 0 ? '−' : '') + (Math.abs(k) / 10).toFixed(1);
    P_TEXT.set(k, t);
  }
  return t;
}

/** The card's size class: 's' (the most a card holds: two controls), 'l' (three or four), 'x' (a lobule part, with its words). */
export function cardSize(m, p) {
  let cells = 0, about = false;
  for (const v of m.verbs) {
    if (v.showIf && !v.showIf(p)) continue;
    if (v.type === 'about') about = true;
    cells += CELLS[v.type] || 0;
  }
  return about ? 'x' : cells > SMALL_CELLS ? 'l' : 's';
}

/** The rows a card is made of, as one word: the bar or the one reading, the readings, the controls and the actions, and how many lines the name takes. Two cards
 *  with the same shape are the same height on the shelf, where a card is as tall as what it holds. */
export function cardShape(m, p) {
  let r = 0, about = 0, c = 0, seg = 0, a = 0, d = 0;
  for (const v of m.verbs) {
    if (v.showIf && !v.showIf(p)) continue;
    if (READ.has(v.type)) r++;
    else if (CTL.has(v.type)) { c++; if (v.type === 'seg') seg++; }
    else if (ACT.has(v.type)) { if (v.danger) d++; else a++; }
    else if (v.type === 'about') about = 1;
    else if (v.type === 'panel') { c++; seg++; }   // (a panel's one row: its height as a choice's)
  }
  return `${m.span ? 'b' : 'v'}${r}${about}.${c}${seg}.${a}${d}.${Math.min(3, Math.floor(m.title.length / 16))}`;
}

export function createCard({ view, stage, ctx, onWhy }) {
  const el = h('section', { class: 'action-card stage-blocker', role: 'dialog', 'aria-label': 'Actions', hidden: true });
  view.append(el);
  // A card is a sheet like Details and Treat (Menu system plan W4): a plate (paper and glass) and its content move together under the
  // card's still cut, the one motion (app.css .ac-in, .ac-leaving). The plate is kept across rebuilds (it is the first child).
  sheetParts(el);
  // alloc-rare: the card opens afresh: its class for the entrance's length, once for each open
  // A phone's card holds the height it first measured while it comes in (18 Nov 2026, Mohammad on his iPhone: "the card bounces up and down as it opens"): its height is its words', and a word that wraps, a font that
  // arrives or a control's picture that is drawn changes it in the middle of the entrance, which moves the card's own foot-anchored top and what the entrance is measured against. It is as tall as it first measured until it has
  // landed, then lets go to its words' height with the card glide (card-glide.js), never a step.
  let pinH = 0, releasing = false;
  // The card opens when its widgets are up (18 Nov 2026, Mohammad, the iPhone: "half-rendered: a default background, sliders not in their final render, then it switches to the real look"). Built hidden (ac-prep: its box is laid
  // out, so its pictures are drawn), then its plate, glass, paper and words all begin together, in the same frame, on the final render. At most PREP_MAX_MS; widget-ready.js says when waiting is pointless.
  const PREP_MAX_MS = 250;   // motion-scale: not a move (the longest a card waits for its widgets before it opens)
  let prepOn = false, prepT = 0, prepAt = 0, prepFilled = false;
  function prepEnd() { prepOn = false; clearTimeout(prepT); el.classList.remove('ac-prep'); }
  function prepBegin() {
    prepOn = true; prepFilled = false; prepAt = performance.now(); el.classList.add('ac-prep');
    let framesSeen = 0, warmed = false;
    // (Two frames of the page's own: its observers have reported and every fit that follows a width (the stent picture's height, tips-figure.js) has landed before the card is shown, so nothing in it changes size after it appears.)
    nextFrame(() => nextFrame(() => { framesSeen = 2; }));
    const poll = () => {
      if (!prepOn) return;
      if (!warmed && !el.hidden) { warmed = true; warmSliders(el); }   // (laid out now: its sliders' pictures are made and drawn at once, not when their boxes are first seen)
      const up = framesSeen >= 2 && prepFilled && !widgetsPending(el) && document.fonts?.status !== 'loading', late = performance.now() - prepAt >= PREP_MAX_MS;
      if (!up && !late) { prepT = setTimeout(poll, 24); return; }
      if (!up) widgetState.misses++;
      prepEnd(); opening(); backIn(null); reveal();
    };
    prepT = setTimeout(poll, 0);   // (after this build's own frame: the widgets are drawn in a rest pass of their own)
  }
  const endIn = () => {
    el.classList.remove('ac-in'); backIn(null);
    if (pinH) { pinH = 0; releasing = true; el.style.height = ''; setTimeout(() => { releasing = false; }, 400); }
    reveal();
  };   // (entered: its rest size known, bring the vessel above it)
  let inTimer = 0;
  // A pick that comes while the card is still on its way out takes it from where it is (below, render): the glass comes back from the opacity and place it had reached, never from nothing.
  const backIn = (from) => {
    const p = el.querySelector(':scope > .sheet-plate');
    if (!p) return;
    if (from) { p.style.setProperty('--edge-o', String(from.o)); p.style.setProperty('--edge-x', `${from.x}px`); p.style.setProperty('--edge-y', `${from.y}px`); }
    else { p.style.removeProperty('--edge-o'); p.style.removeProperty('--edge-x'); p.style.removeProperty('--edge-y'); }
  };
  const opening = () => { cardMoveFor(D_SMALL + 120); switchIn(el); el.classList.add('ac-in'); clearTimeout(inTimer); inTimer = setTimeout(endIn, D_SMALL + 60); };
  const sizes = { h: 0 };
  // (A change of height its content asks to glide, card-glide.js: the height it had when asked, glided from when the observer sees the new one.)
  let glideFrom = 0, glides = [];
  el.addEventListener(GLIDE_EVENT, () => { if (!el.classList.contains('ac-in') && !reduceMotionMQ?.matches) glideFrom = sizes.h; });
  new ResizeObserver(() => {
    const was = sizes.h;
    if (!pinH && el.classList.contains('ac-in') && el.classList.contains('docked') && !el.hidden) { pinH = readMetric(el, 'offsetHeight'); if (pinH > 0) el.style.height = pinH + 'px'; else pinH = 0; }
    sizes.h = readMetric(el, 'offsetHeight'); el.style.setProperty('--sheet-size', sizes.h + 'px');
    if (releasing && was > 0 && Math.abs(sizes.h - was) > 1 && !reduceMotionMQ?.matches && !el.classList.contains('ac-in')) { releasing = false; glides = glideCard(el, was, sizes.h, { foot: true, prior: glides }); }
    else if (glideFrom > 0) { const h0 = glideFrom; glideFrom = 0; if (was === h0) glides = glideCard(el, h0, sizes.h, { foot: el.classList.contains('docked'), prior: glides }); }
    // A lobule part's card is as tall as its words (18 Nov 2026, Mohammad, the iPhone: a hepatocyte card with 140 px of empty glass above the title, a cut row, a blank bottom third and a body that scrolled):
    // it grows and shrinks with them, the glide carrying either, and is never held at a height it once stood at (a ratchet of the tallest it had been, min-height, stood the card at a height a
    // moment of the swap had made, taller than any words it held).
    else if (el.dataset.size === 'x' && !el.hidden) {
      if (was > 0 && Math.abs(sizes.h - was) > 1 && !el.classList.contains('ac-in') && !reduceMotionMQ?.matches) glides = glideCard(el, was, sizes.h, { foot: el.classList.contains('docked'), prior: glides });
    }
    reveal();
  }).observe(el);
  new ResizeObserver(() => { reveal(); }).observe(view);
  const uiState = {};
  ctx.ui = (key, def) => (uiState[key] ||= def);
  // live: the elements whose reading follows the model (each says which in _acK: 1 the direction word and, on a card with no bar, its
  // reading; 2 a reading; 3 the "about" words; 5 the dye button's label; 6 the bar; 7 a meter); syncs: the controls that follow the
  // params (_acK 1 a slider, 2 a switch); actionable: what the number keys reach, in order. Kept lists, emptied (length 0) and filled
  // again when the card is rebuilt.
  let lastSelTok = [], newSelTok = [], model = null, selRef = null;
  const live = [], syncs = [], actionable = [], panels = [];   // (panels: the components a card holds, each destroyed when the card is rebuilt or closed)
  const dropPanels = () => { for (const x of panels) x.destroy?.(); panels.length = 0; };

  const refP = () => { const st = store.get(); return st.compareSnap ? st.compareSnap.P : st.healthy?.P; };
  const lens = () => (store.get().imaging ? 'neutral' : store.get().colorMode);

  // Laying the labels out again (they steer clear of the card) is not needed more than once a frame.
  let relayoutRaf = 0;
  const relayoutRun = () => { relayoutRaf = 0; stage.relayout?.(); };
  const relayoutSoon = () => { if (!relayoutRaf) relayoutRaf = nextFrame(relayoutRun); };
  const isDocked = () => el.classList.contains('docked');
  // The phone's card lives in the whole figure column, not in the figure itself: it stands above the view switch, over the play bar.
  const dockHost = view.closest('.stage-wrap') || view;
  // The card covers the bottom of the figure on a phone: keep the tapped vessel in the part that is left (the figure eases up), and
  // lift the figure's own buttons (Fit, turn) and the credit clear of it.
  let cardTall = false;   // (the docked card's words are taller than its room: its body scrolls)
  let revealRaf = 0, liftedBy = '', liftFound = false, liftPill = null, liftClock = null;
  // The variable goes on the few elements that use it: set on the whole figure it would make the browser re-check
  // the style of every element under it. (The two are looked for the first time the card moves, the clock is made after the card.)
  function liftButtons(amount) {
    if (amount === liftedBy) return;
    liftedBy = amount;
    if (!liftFound) { liftFound = true; liftPill = dockHost.querySelector('.zoom-pill'); liftClock = dockHost.querySelector('.stage-clock'); }
    if (liftPill) liftPill.style.setProperty('--sheet-h', amount);
    if (liftClock) liftClock.style.setProperty('--sheet-h', amount);
    // Keep the zoom and Fit pill above the card; hide only if it would reach the top bar.
    if (liftPill) {
      liftPill.classList.toggle('under-sheet', isDocked() && parseFloat(amount) > 0);
      liftPill.classList.remove('no-room');
    }
  }
  // How much of the figure the card covers, from its top down: read here, between two frames, through layout-snap.
  function coverNow() {
    return Math.max(0, readBox(view).bottom - readBox(el).top);
  }
  // The card is up over the foot of the screen: a class on the page, so Tests' sheet leaves it room (dock-sheet.js stops, stack-plan.js) and the card is a strip above it (F46).
  let stripped = false;
  function stripState(on) {
    if (on === stripped) return;
    stripped = on;
    document.documentElement.classList.toggle('vessel-card', on);
    dispatchEvent(new Event('pps:vessel-card'));
  }
  // Where the words of a card's body end, from its top (px): its in-flow children's lower edges and the body's own padding. Not scrollHeight: a control's GPU picture (the slider's, .wgl) is an
  // absolutely placed canvas bleeding 14 px past its row, and scrollHeight counts it, so a card that held every word whole read as taller than its room and let its body be dragged (18 Nov 2026,
  // Mohammad, the iPhone: "it scrolls when it shouldn't"). Read between frames (a rest pass), through layout-snap.
  function wordsEnd(body) {
    const b = readBox(body), st = readMetric(body, 'scrollTop');
    let end = 0;
    for (const c of body.children) {
      const r = readBox(c);
      if (r.height > 0 && !c.classList.contains('wgl')) end = Math.max(end, r.bottom - b.top + st);
    }
    return end + (parseFloat(readStyle(body).paddingBottom) || 0);
  }
  function revealNow() {
    const open = model && !el.hidden && isDocked();   // (the phone's sheet: its cover lifts the zoom pill and the clock)
    const covered = open ? coverNow() : 0;
    liftButtons(open ? `${covered + 6}px` : '0px');
    stripState(open && !el.classList.contains('ac-leaving'));
    // A phone's card grows with its words up to the room there is (app-03-layouts.css); past that its body scrolls, and takes the vertical touch for it.
    // (While the details are open the face under them is not what is touched: the details' own scroller is the one measured, so tall details take the vertical touch too.)
    const body = open ? el.querySelector(detOpen ? ':scope > .ac-details > .ad-scroll' : ':scope > .ac-body') : null, tall = !!body && wordsEnd(body) > readMetric(body, 'clientHeight') + 1;
    if (tall !== cardTall) { cardTall = tall; el.classList.toggle('ac-scroll', tall); }
    // (Every screen: the view pans for this card as for the others, then the selected vessel is brought into the room all the open cards leave.)
    const shown = !!model && !el.hidden && !el.classList.contains('ac-leaving');
    if (shown) { stage.cardsMoved?.(); stage.reveal?.(normalizeSel(selRef) || selRef, covered); }
  }
  function reveal() {
    // (A rest pass: the boxes are read between two frames, never inside one.)
    cancelRest(revealRaf);
    revealRaf = restPass(revealNow);
  }
  let closeTimer = 0, sheetWired = false;
  const afterLeave = () => { el.hidden = true; el.classList.remove('ac-leaving'); finishDet(); dropDetails(); releaseWords(el); stage.cardsMoved?.(); };   // (gone: the view pans back)
  function hide() {
    stopSheetGesture();
    if (prepOn) { prepEnd(); el.hidden = true; }   // off-screen: it was never shown, so there is no leave to play
    if (el.dataset.swiped) { delete el.dataset.swiped; el.hidden = true; setSheetOffset(el, 0); }   // (pulled away: already out of sight behind the tab row)
    if (!el.hidden && !el.classList.contains('ac-leaving')) {
      // (It fades back toward the edge it came from: the left on a Mac, the foot on a phone. With Reduce Motion it only fades: app.css.)
      el.classList.add('ac-leaving'); cardMoveFor(D_FLIP * 4 / 3 + 120);
      if (isDocked()) markGone(D_SMALL, el);   // (a phone's card sinks like a sheet: whatever opens next crosses over with it, as it does with a sheet)
      closeTimer = afterExit(el, 'ac-leaving', afterLeave);
    }
    model = null; live.length = 0; syncs.length = 0; actionable.length = 0; dropPanels();
    liftButtons('0px'); stripState(false);
    stage.unreveal?.();
    relayoutSoon();
  }

  // The kept lists the card is rebuilt with: the children handed to h() as one list, and the words the "about" boxes drew (a box
  // compares the model's words with these, one list a box).
  const kidsBuf = [], aboutSlots = [[], [], [], []];
  let aboutNext = 0;

  // The pieces of the card that are the same every time it is built, made once here because their handlers are this card's own.
  const onNameClick = () => openDetails();
  const KEEP = { keepFocus: true };
  const renderKeep = () => render(KEEP);
  const renderSoon = () => restPass(renderKeep);   // (the card rebuilds between frames, never as a timer task inside one)

  // ---- The card's details, inside the card (17 Nov 2026) ----
  // A tap on the name slides the card's face away and its details (card-details.js) in, in the same box; Back, Esc or the name row slides the face home. There is no
  // panel or sheet any more. The face stays built under the details (hidden, taking no taps, still updating), so Back is only a slide. The card never changes height
  // for it (a taller view scrolls inside the box, as the face does past its room), and nothing pops: both layers move by opacity and translate.
  // `det`: the details view, from the tap until it has slid out; `detOpen`: whether they are the one in view; `detDone`: what the running slide does at its end.
  let det = null, detOpen = false, detDone = null;
  const finishDet = () => { if (detDone) { const d = detDone; detDone = null; d(); } };   // (a second tap in the middle of a slide: the first slide is taken to its end)
  function dropDetails() {
    detOpen = false;
    if (!det) return;
    const d = det; det = null;
    releaseWords(d.el); removeSoon(d.el);
    const i = live.indexOf(d.el);
    if (i >= 0) live.splice(i, 1);
  }
  function openDetails() {
    if (!model || el.hidden || detOpen || el.classList.contains('ac-leaving')) return;
    if (isDocked() && el.closest('.app.dock-open:not(.instrument-focus)')) return;   // (over Tests the phone's card is a strip of its name and state: no room for a view)
    finishDet(); dropDetails();
    const d = createCardDetails(model, { onWhy, onBack: closeDetails });
    if (!d) return;
    det = d; detOpen = true;
    d.el._acK = 8; d.el._acD = d; live.push(d.el);
    const face = el.querySelector(':scope > .ac-body');
    el.append(d.el);
    d.update(store.get().frame);
    // (The details come in when their widgets are drawn, with the face going out, in one task: enterWhenReady holds them unseen till then, widget-ready.js.)
    const begin = () => {
      if (det !== d || !detOpen) return;
      const still = reduceMotionMQ.matches;
      d.el.animate(still ? FADE_IN : SIDE_DET_IN, SWAP_IN_OPT);
      if (face) {
        const a = face.animate(still ? FADE_OUT : SIDE_FACE_OUT, SWAP_OUT_OPT);
        // alloc-rare: one slide per tap; the face is hidden for good when it has gone (its words keep updating under the details)
      const done = () => { detDone = null; if (face.isConnected && detOpen) { classSoon(face, 'ac-under', true); propSoon(face, 'inert', true); } runSoon(() => a.cancel()); };   // (the class lands first, in the same task: the face is never seen again between the two)
        detDone = done;
        a.finished.then(() => { if (detDone === done) done(); }, () => {});
      }
      d.focus();
    };
    enterWhenReady(d.el, begin);
    reveal();   // (the details' room is measured once they stand: tall ones scroll, and take the vertical touch)
  }
  function closeDetails() {
    if (!detOpen || !det) return;
    finishDet();
    const d = det, face = el.querySelector(':scope > .ac-body'), still = reduceMotionMQ.matches;
    detOpen = false;
    propSoon(d.el, 'inert', true);
    if (face) { classNow(face, 'ac-under', false); propSoon(face, 'inert', false); face.animate(still ? FADE_IN : SIDE_FACE_IN, SWAP_IN_OPT); face.querySelector('.ac-name')?.focus({ preventScroll: true }); }
    const a = d.el.animate(still ? FADE_OUT : SIDE_DET_OUT, SWAP_OUT_OPT);
    // alloc-rare: one slide per tap
    const done = () => { detDone = null; if (det === d) dropDetails(); };
    detDone = done;
    a.finished.then(() => { if (detDone === done) done(); }, () => {});
    reveal();   // (the face is back: its own height decides again whether the card scrolls)
  }

  // The direction word crossfades to a new one (its colour easing with it); a card with no bar has its one reading beside it, whose
  // number rolls to a new one.
  function liveHeader(hd) {
    const f = store.get().frame;
    if (!f) return;
    const numEl = hd._acNum, pillEl = hd._acPill, m = hd._acM;
    if (!numEl) { /* (the bar shows the pressures) */ } else if (lens() === 'neutral' && m.why !== 'spleen' && m.why !== 'ascites') {
      if (hd._acMode !== 1) { hd._acMode = 1; releaseWords(numEl); numEl.replaceChildren(h('span', P_UNMEASURED, 'Pressure unmeasured')); }
    } else {
      const v = m.value(f, lens(), refP());
      const vd = v.d || '', vup = v.up ? 1 : 0;
      if (hd._acMode !== 2 || hd._acV !== v.v || hd._acU !== v.u || hd._acD !== vd || hd._acUp !== vup) {
        // The same reading with a new number rolls to it, a paused edit or a treatment included (P17); anything else is
        // drawn afresh. (What was drawn last is kept as its four fields: the model hands back kept readings it may rewrite.)
        const a = numOf(v.v, NUM_A), b = hd._acHas ? numOf(hd._acV, NUM_B) : null, numB = numEl.firstChild;
        if (a && b && a.d === b.d && hd._acU === v.u && numB?.tagName === 'B' && numEl.querySelector('.ac-delta')) {
          countTo(numB, a.n, a.d, store.get().running ? COUNT_EASED : COUNT_STEADY);
          const dl = numEl.querySelector('.ac-delta');
          if (dl.textContent !== vd) dl.textContent = vd;
          const dc = !vd ? 'ac-delta' : v.up ? 'ac-delta up' : 'ac-delta down';
          if (dl.className !== dc) dl.className = dc;
        } else {
          releaseWords(numEl);
          numEl.replaceChildren(h('b', P_NONE, v.v), h('span', P_UNIT, v.u), h('span', !v.d ? P_DELTA_NONE : v.up ? P_DELTA_UP : P_DELTA_DOWN, v.d || null));
          if (a) countTo(numEl.firstChild, a.n, a.d);   // (its starting point for the next roll)
        }
        hd._acMode = 2; hd._acV = v.v; hd._acU = v.u; hd._acD = vd; hd._acUp = vup; hd._acHas = true;
      }
    }
    const s = m.status?.(f);
    if (s) {
      if (!pillEl._acOn || pillEl._acS0 !== s[0] || pillEl._acS1 !== s[1]) {
        // alloc-rare: the direction word changed (the guard above compares it), not a steady per-frame loop
        const cls = 'ac-state st-word ' + s[0];
        if (!pillEl._acOn) pillEl.className = cls;
        // alloc-rare: the direction word changed (see above): its swap's end is one closure
        swapText(pillEl, s[1], () => { pillEl.className = cls; });
        pillEl._acOn = true; pillEl._acS0 = s[0]; pillEl._acS1 = s[1];
      }
    // alloc-rare: the direction word went away (the guard compares it): one closure for the swap's end, not a per-frame loop
    } else if (pillEl._acOn) { swapText(pillEl, '', () => { pillEl.className = 'ac-state'; }); pillEl._acOn = false; pillEl._acS0 = pillEl._acS1 = null; }
  }
  // The bar: the two pressures, the drop's number in its cut colour, and the strip of colour slid to show the stretch between them.
  // (Each is written only when what it shows changes; the strip's move is written between frames, a transform the compositor draws.)
  function liveSpan(sp) {
    const f = store.get().frame;
    if (!f) return;
    const r = sp._acV.at(f), ok = r.ok && lens() !== 'neutral';
    const ka = ok ? Math.round(r.a * 10) : NaN, kb = ok ? Math.round(r.b * 10) : NaN, kd = ok ? Math.round(r.d * 10) : NaN;
    if (ka === sp._acA && kb === sp._acB && kd === sp._acD) return;
    const was = sp._acOk;
    sp._acA = ka; sp._acB = kb; sp._acD = kd; sp._acOk = ok;
    const ta = ok ? pText(r.a) : '—', tb = ok ? pText(r.b) : '—', td = ok ? pText(r.d) : 'not measured';
    if (sp._acPa.textContent !== ta) sp._acPa.textContent = ta;
    if (sp._acPb.firstChild.textContent !== tb) sp._acPb.firstChild.textContent = tb;
    if (sp._acDvB.textContent !== td) sp._acDvB.textContent = td;
    const cut = sp._acV.cut, sev = ok && cut ? (cut === 'hvpg' ? hvpgSev(r.d) : ppgSev(r.d)) : null;
    const dc = sev ? CUT_CLS[sev] : 'ac-cut';
    if (sp._acDvB.className !== dc) sp._acDvB.className = dc;
    if (ok || was !== ok) { sp._acRa = ok ? r.a : RAMP_TOP / 2; sp._acRb = ok ? r.b : RAMP_TOP / 2; runSoon(sp._acSlide); }
  }
  // A collateral's opening, from closed to its widest: the bar's fill is a transform, the number its text.
  function liveMeter(row) {
    const f = store.get().frame;
    if (!f) return;
    const x = Math.min(1, Math.max(0, row._acV.share(f))), k = Math.round(x * 100);
    if (k === row._acK2) return;
    row._acK2 = k;
    row._acVal.textContent = PCT_TEXT[k];
    attrSoon(row, 'aria-valuenow', PCT_NUM[k]);
    row._acX = x; runSoon(row._acFill);
  }
  // What this is and what is happening to it now, in plain words (a lobule part): drawn again when a sentence changes.
  function liveAbout(box) {
    const t = box._acV.text(store.get().frame), n = t ? t.length : 0, seen = box._acSeen;
    if (seen !== null && box._acN === n) {
      let i = 0;
      while (i < n && seen[i] === t[i]) i++;
      if (i === n) return;
    }
    if (seen !== null) { seen.length = n; for (let i = 0; i < n; i++) seen[i] = t[i]; }
    box._acN = n;
    for (let i = 0; i < n; i++) kidsBuf.push(h('p', P_NONE, t[i]));
    box.replaceChildren(kidsBuf);
    kidsBuf.length = 0;
  }
  function liveDye(lbl) {
    const v = lbl._acV, on = !!v.busy();
    lbl._acBtn.classList.toggle('on', on);
    const t = on ? 'Injecting' : v.short || v.label;
    if (lbl.textContent !== t) lbl.textContent = t;
  }
  function runLive(e) {
    const k = e._acK;
    if (k === 1) liveHeader(e);
    else if (k === 2) { const f = store.get().frame; if (f) { const t = e._acV.value(f); if (e.textContent !== t) e.textContent = t; } }
    else if (k === 3) liveAbout(e);
    else if (k === 6) liveSpan(e);
    else if (k === 7) liveMeter(e);
    else if (k === 8) e._acD.update(store.get().frame);
    else liveDye(e);
  }
  // A slider shows its number and its fill; a switch its state.
  // (Its number, fill and 'changed' mark are the same for the same x, so they are written when x is not the one shown. `_acShown`: the x it was last painted for.)
  function paintShown(input, x) {
    const v = input._acV;
    input._acShown = x;
    const vt = v.format(x); input._acVal.textContent = vt; attrSoon(input, 'aria-valuetext', vt);   // (a screen reader says "60%", not the thumb's 0.6: SHELL-13)
    paintRange(input, (x - v.min) / (v.max - v.min));
    input._acRow.classList.toggle('changed', v.def != null && Math.abs(x - v.def) > 1e-9);
  }
  // A value the model gives (a preset, an undo, a step of the timeline): the input's own value follows it between frames (propSoon).
  function paintSlider(input, x) {
    if (x === input._acShown) return;
    // alloc-rare: the value's text is made only when the value shown changes (a preset, an undo, a timeline step), never while it holds still
    propSoon(input, 'value', String(x));
    paintShown(input, x);
  }
  function syncOne(e, p) {
    if (e._acSk === 1) { if (document.activeElement !== e) paintSlider(e, e._acV.get(p)); }
    else if (e._acSk === 3) attrSoon(e, 'aria-pressed', e._acV.get() === e._acVal ? 'true' : 'false');   // (a choice another card or a slide set: the stent's End, its Ends)
    else if (e._acSk === 4) e.classList.toggle('ac-dim', !!e._acV.dimIf(p));   // (a control that does nothing now, dimmed and still there: the waist's length with no waist)
    else attrSoon(e, 'aria-checked', e._acV.get(p) ? 'true' : 'false');
  }
  // What a number key or trigger() does with an actionable element, and where its focus goes.
  function runAction(a) {
    const r = a._acRun;
    if (r === 1) a.click();
    else if (r === 2) a._acV.run(DYE_ONCE);
    else a._acF.focus();
  }
  const focusAction = (a) => (a._acF || a).focus();

  // The content of the card, built for a model: its rows in their fixed order (app.css .ac-body).
  function build(m) {
    const p0 = store.get().params;
    // The name (a tap slides the card to its details: the chevron says so) and the direction of flow at its right.
    const pillEl = h('span', P_STATE);
    P_NAME['aria-label'] = `${m.title}: details`;
    const name = m.noDetails ? h('span', P_NAME_PLAIN, m.title) : h('button', P_NAME, h('span', P_NONE, m.title), svgIcon('chev-right', 'ac-chev'));
    if (!m.noDetails) name.addEventListener('click', onNameClick);
    const nr = h('div', P_NR, name, pillEl);
    const body = h('div', P_BODY, nr);
    // The bar, or (a structure with no inflow and outflow: the heart, the spleen, the varices, a lobule part) its one reading.
    let numEl = null;
    if (m.span) body.append(spanEl(m.span));
    else if (!m.noValue) { numEl = h('span', P_NUM); body.append(h('div', P_VALUE, numEl)); }   // (noValue: a body that reads its own numbers, the TIPS's line: no reading here)
    nr._acK = 1; nr._acNum = numEl; nr._acPill = pillEl; nr._acM = m; nr._acMode = 0; nr._acHas = false;
    live.push(nr);
    // (The controls take one column where a name is long or there is only one of them: the liver's Cirrhosis runs the card's width.)
    let rs = null, cs = null, as = null, about = null, danger = null, one = false, nCtl = 0, panel = null;
    for (const v of m.verbs) if (CTL.has(v.type) && !(v.showIf && !v.showIf(p0))) { nCtl++; if ((v.short || v.label).length > 14) one = true; }
    if (nCtl === 1) one = true;
    for (const v of m.verbs) {
      if (v.showIf && !v.showIf(p0)) continue;
      const node = verbEl(v, p0);
      if (!node) continue;
      if (READ.has(v.type)) (rs ||= h('div', P_RS)).append(node);
      else if (CTL.has(v.type)) (cs ||= h('div', one ? P_CS_ONE : P_CS)).append(node);
      else if (ACT.has(v.type)) { if (v.danger) danger = node; else (as ||= h('div', P_AS)).append(node); }
      else if (v.type === 'about') about = node;
      else if (v.type === 'panel') panel = node;
    }
    if (rs) body.append(rs);
    if (about) body.append(about);
    if (cs) body.append(cs);
    if (panel) body.append(panel);
    if (danger) (as ||= h('div', P_AS)).append(danger);   // (taking a device out stands apart, at the right)
    if (as) body.append(as);
    return body;
  }
  // The bar: the inflow's pressure, the track, the outflow's; above them the end labels (only where they are clinical terms: PV and
  // IVC, WHVP and FHVP) and the drop's name and number.
  function spanEl(sv) {
    const dvB = h('b', P_NONE);
    const ramp = h('i', P_RAMP);
    ramp.style.background = gradientCss('to right', RAMP_TOP);
    const pa = h('b', P_PA), pb = h('b', P_PB, h('span', P_NONE), h('u', P_NONE, 'mmHg'));
    const sp = h('div', P_SP,
      h('span', P_EL, sv.el ? sv.el[0] : null), h('span', P_DV, sv.dn || 'Δ', ' ', dvB), h('span', P_EL_R, sv.el ? sv.el[1] : null),
      pa, h('div', P_TRACK, ramp), pb);
    sp._acK = 6; sp._acV = sv; sp._acPa = pa; sp._acPb = pb; sp._acDvB = dvB; sp._acA = sp._acB = sp._acD = NaN; sp._acOk = null; sp._acRa = sp._acRb = 0;
    // (The strip runs 0 to RAMP_TOP mmHg across its own width; stretched by 1/(ub − ua) and slid by −ua of that, the track shows ua to ub.
    // Two pressures the same draw it 0.2 mmHg wide, so a still vessel shows its one colour.)
    // alloc-rare: the bar's slide, one closure per card built (a pick)
    sp._acSlide = () => {
      const ua = Math.min(1, Math.max(0, sp._acRa / RAMP_TOP)), ub0 = Math.min(1, Math.max(0, sp._acRb / RAMP_TOP));
      const w = 0.2 / RAMP_TOP, ub = Math.abs(ub0 - ua) < w ? (ua + w > 1 ? ua - w : ua + w) : ub0;   // (an artery above the scale shows its top colour)
      const k = 1 / (ub - ua);
      // alloc-rare: the strip's transform, written between frames and only when a pressure on the bar changes by a tenth
      ramp.style.transform = `translateX(${(-ua * k * 100).toFixed(2)}%) scaleX(${k.toFixed(4)})`;
    };
    live.push(sp);
    return sp;
  }

  function render(opts) {
    const keepFocus = opts !== undefined && opts.keepFocus;
    const st = store.get();
    const sel = st.selection;
    if (!sel || st.shunting) { hide(); return; }
    const m = cardFor(sel, ctx);
    if (!m) { hide(); return; }
    stopSheetGesture();
    clearTimeout(closeTimer);
    const leaving = el.classList.contains('ac-leaving');
    // (Where the words (and so the glass, which fades with them) of a card going out stand now, read before its leave class is taken off: opacity and place.)
    let lo = null;
    if (leaving && typeof DOMMatrixReadOnly === 'function') {
      const p0 = el.querySelector(':scope > .ac-body');   // (the words: the plate's own opacity is the glass's to hold)
      if (p0) { const cs = readStyle(p0), mx = new DOMMatrixReadOnly(cs.transform === 'none' ? undefined : cs.transform), o = parseFloat(cs.opacity); if (o > 0.02 && o < 0.999) lo = { o, x: mx.m41, y: mx.m42 }; }   // alloc-rare: a pick during a card's leave
    }
    el.classList.remove('ac-leaving');
    let focusedIdx = -1;
    if (keepFocus) for (let i = 0; i < actionable.length; i++) if (actionable[i].contains(document.activeElement)) { focusedIdx = i; break; }
    // (Told from the last one by tokens, in two kept lists: the same selection rebuilt keeps its words still.)
    const ns = normalizeSel(sel) || sel;
    newSelTok.length = 0; encodeSel(ns, newSelTok);
    let same = !el.hidden && !!model && newSelTok.length === lastSelTok.length;
    if (same) for (let i = 0; i < newSelTok.length; i++) if (newSelTok[i] !== lastSelTok[i]) { same = false; break; }
    const tok = lastSelTok; lastSelTok = newSelTok; newSelTok = tok;
    const size = cardSize(m, st.params), wasOpen = !el.hidden && !!model && !leaving;
    el.dataset.card = ns.type || 'vessel';
    // The details stay for a rebuild of the same card (a verb, the shunting flag); any other pick puts them away (below, once it is known whether the card is new).
    const keepDet = detOpen && same && !leaving;
    model = m; selRef = sel; live.length = 0; syncs.length = 0; actionable.length = 0; aboutNext = 0; dropPanels();
    const old = el.querySelector(':scope > .ac-body');
    const oldH = wasOpen && !same && old ? readMetric(old, 'offsetHeight') : 0;   // (the words' own height, read before anything is changed: they keep it while they fade, below)
    el.querySelector(':scope > .ac-ghost')?.remove();
    releaseWords(keepDet ? old : el);   // (the readings of the content being replaced; the details' own stay)
    const body = build(m);
    // The shelf's card is as tall as its words (16 Nov 2026), so a pick of the same size can still be a different height. The shape of the rows says it (cardShape),
    // worked out from the model with no read of the page. A pick while the card is open is always the same move, whatever its size or shape (17 Nov 2026, Mohammad:
    // opening, closing and choosing still felt glitchy): the old words fade out where they stood, the new ones come in a beat later, and a different height is the card's
    // own glide (card-glide.js). It used to be "the old card out and the new one in" for a card of another shape (B, 13 Nov): the box snapped to its new height, every old
    // word went in one frame, and the card's glass and words fell to nothing and came back from the edge, which is a blink on every pick of a vessel whose name or rows
    // differ in length. The card is one still box that changes height; it never leaves and comes again while it is open.
    const shape = cardShape(m, st.params);
    const resized = wasOpen && (el.dataset.size !== size || el.dataset.shape !== shape);
    el.dataset.size = size; el.dataset.shape = shape;
    if (!same) el.style.minHeight = '';   // (a card never keeps a height of the last one's)
    const swap = wasOpen && !same && !!el.animate && !!old;
    if (swap) cardMoveFor(D_FLIP + 120);
    // (The height it has now is the one the glide starts from, asked before the change is made; the observer sees the new one and glides there. A card still coming in
    // has no height of its own to glide from, and Reduce Motion has no glide: the height changes under the fade.)
    if (swap && resized && !el.classList.contains('ac-in') && !reduceMotionMQ?.matches) glideFrom = sizes.h;
    // The old words keep their own height while they fade: as the ghost fills the card's box (the card's, which has the new height at once, or its minimum, a phone's)
    // their foot rows would slide to the box's foot. From the new top, as the new words are, so the glide's ride (a phone's card grows or shrinks from its foot)
    // carries both the same way.
    if (swap && oldH > 0) { old.style.height = `${oldH}px`; old.style.bottom = 'auto'; }
    // Another pick with the details showing: they fade out as the new words come in.
    if (det && !keepDet) {
      finishDet();
      const d = det;
      if (swap && detOpen) {
        detOpen = false; propSoon(d.el, 'inert', true);
        const still = reduceMotionMQ.matches, a = d.el.animate(still ? FADE_OUT : WORDS_OUT, SWAP_OUT_OPT);
        // alloc-rare: one fade per pick that leaves details behind
        const done = () => { detDone = null; if (det === d) dropDetails(); };
        detDone = done;
        a.finished.then(() => { if (detDone === done) done(); }, () => {});
      } else dropDetails();
    }
    if (swap) {
      // Another structure picked while the card is open: the old words fade out 6 px up from a layer that takes no taps, the new ones
      // come in from 6 px below a beat later (B: only the words move, the card stays still). With Reduce Motion they only fade.
      old.classList.replace('ac-body', 'ac-ghost');
      old.setAttribute('aria-hidden', 'true'); old.inert = true;
      el.append(body);
      const still = reduceMotionMQ.matches;
      const a = old.animate(still ? FADE_OUT : WORDS_OUT, SWAP_OUT_OPT);
      body.animate(still ? FADE_IN : WORDS_IN, SWAP_IN_OPT);
      // alloc-rare: the ghost goes when its fade ends: once per swap, with the ghost
      a.finished.then(() => old.remove(), () => old.remove());
    } else if (lo && old && el.animate) {
      // (A pick while the card was still on its way out: its old words, at the opacity they had reached, finish going out as a ghost while the new ones come in, and the glass
      // comes back from where it is. Before, the old words went in one frame and the glass fell to nothing and rose again: a dip.)
      old.classList.replace('ac-body', 'ac-ghost');
      old.setAttribute('aria-hidden', 'true'); old.inert = true;
      el.append(body);
      const still = reduceMotionMQ.matches;
      const a = old.animate(still ? [{ opacity: lo.o }, { opacity: 0 }] : [{ opacity: lo.o, translate: `${lo.x}px ${lo.y}px` }, { opacity: 0, translate: '0 -6px' }], { duration: D_FLIP * lo.o, easing: EASE_IN, fill: 'forwards' });
      // alloc-rare: the ghost goes when its fade ends: once per pick that follows a leave
      a.finished.then(() => old.remove(), () => old.remove());
    } else {
      if (old) old.remove();
      el.append(body);
    }
    if (keepDet) { classNow(body, 'ac-under', true); body.inert = true; if (det) live.push(det.el); }   // (the rebuilt face goes under the details that are showing)
    // alloc-rare: the card is built when a selection (or the shunting flag) changes, once per pick
    el.setAttribute('aria-label', `${m.title}: actions`);
    // (A card coming up from nothing is built where it cannot be seen and opened once its GPU widgets are drawn, ac-prep: never shown in the page's fallback look and then changed. A pick that finds it open or going out is the swap and the glide as before.)
    if (el.hidden && !leaving && !prepOn) prepBegin();
    else if (el.hidden || leaving || (resized && !swap)) { if (!prepOn) { opening(); backIn(leaving ? lo : null); } }   // (opened afresh: it comes in from its edge. A pick while it is open never does: it is the swap above, with the glide)
    el.hidden = false;
    // Number keys trigger the verbs in order; show the number beside each.
    for (let i = 0; i < actionable.length && i < 9; i++) actionable[i].dataset.key = KEYS[i];
    position();
    // (A card being built has its readings put in a rest pass of its own, still before it is shown (prepBegin waits for it): the number's picture and the direction word cost 10 to 20 ms between them, and a
    // tap's own frame is not the place for that. The tester, 390 px: 22 to 110 ms of script in the first frame after the tap.)
    if (prepOn && !prepFilled) restPass(() => { prepFilled = true; update(); }); else update();
    if (focusedIdx >= 0 && actionable[focusedIdx] && !keepDet) focusAction(actionable[focusedIdx]);
    relayoutSoon();
    reveal();
  }

  // Swipe the phone's card down to put it away; release all listeners on close or selection change. Over the thumb dock (an upright
  // phone) the card follows the finger down behind the dock, as the other sheets do: its box and its still cut stand where they are and
  // its plate and content ride one offset (sheet-move.js dragSheet/glideSheet, no --sink, no clip written per move).
  // Let go past a short pull or flicked (the shared sheet rules, ease.js SHEET_*), it sinks out of sight in 240 ms and closes; a short one eases back.
  // (The gesture's state is this card's own, kept here: a second finger's moves and lifts are not the pull (pid: the finger that has the
  // card); px, py: where it came down; held: past the 6 px a tap may wobble; trail: the last eight [time, y] of the finger, pairs
  // taken from a pool of eight and given back when the next pull begins.)
  let y0 = null, t0 = 0, dy = 0, pid = -1, px = 0, py = 0, held = false;
  const trail = [], trailPool = [];
  for (let i = 0; i < 8; i++) trailPool.push([0, 0]);
  const thumb = () => document.documentElement.classList.contains('thumb-ui');
  function sheetStop() {
    y0 = null;
    removeEventListener('pointermove', sheetMove);
    removeEventListener('pointerup', sheetUp);
    removeEventListener('pointercancel', sheetCancel);
  }
  function sheetMove(e) {
    if (e.pointerId !== pid) return;
    dy = Math.max(0, e.clientY - y0);
    // (A tap does not nudge the card: it follows the finger only once the finger has moved a few px, as the other sheets do.)
    if (!held) { if (Math.hypot(e.clientX - px, e.clientY - py) < 6) return; held = true; }
    const pair = trail.length >= 8 ? trail.shift() : trailPool.pop();
    pair[0] = performance.now(); pair[1] = e.clientY; trail.push(pair);
    if (thumb()) dragSheet(el, dy);
  }
  const sheetGone = () => { if (el.hidden) return; el.dataset.swiped = '1'; store.set({ selection: null }); if (!el.hidden) { delete el.dataset.swiped; setSheetOffset(el, 0); } };
  function settle(gone, speed) {
    if (!thumb()) { setSheetOffset(el, 0); if (gone) store.set({ selection: null }); return; }
    // (One let-go for every sheet over the dock: D_SMALL on the curve that carries the finger's speed on, as swipeSheet and dock-sheet.js.)
    const from = sheetOffset(el), to = gone ? sizes.h + 8 : 0;
    // alloc-rare: a let-go
    glideSheet(el, to, { easing: carryCurve(speed, to - from, D_SMALL), duration: D_SMALL, done: gone ? sheetGone : undefined });
  }
  function sheetUp(e) {
    if (e.pointerId !== pid) return;
    dy = Math.max(0, e.clientY - y0);
    const speed = releaseSpeed(trail, performance.now());   // (the finger's, px per ms down: the settle carries it on)
    // (A flick is how fast the finger was going as it lifted, not only the pull's average: a slow start and a quick flick at the end is one.)
    const flick = isFlick(dy, speed, dy / Math.max(1, performance.now() - t0), SHEET_FLICK_MIN, SHEET_FLICK_FAR);
    sheetStop();
    settle(dy > 0 && (flick || dy > Math.min(SHEET_CLOSE_PX, sizes.h * SHEET_CLOSE_SHARE)), speed);
  }
  function sheetCancel(e) { if (e.pointerId !== pid) return; sheetStop(); settle(false, releaseSpeed(trail, performance.now())); }
  // (Until the first card is built there is no pull to stop.)
  function stopSheetGesture() { if (!sheetWired) return; if (y0 != null) sheetStop(); setSheetOffset(el, 0); }
  // (The pull starts anywhere on the card but on a control: a slider, a switch, a button.)
  function onSheetDown(e) {
    if (!isDocked() || !e.isPrimary || e.button !== 0 || e.target.closest('input, .ac-c, .ad-scroll') || (e.target.closest('button') && !e.target.closest('.ad-head'))) return;   // (the details face's own head, its Back button too, pulls the sheet down: the scrolling words below it do not, V13)
    sheetWired = true;
    stopSheet(el);   // (caught mid-ease: the pull carries on from where the content is drawn)
    y0 = e.clientY - sheetOffset(el); t0 = performance.now(); dy = 0; pid = e.pointerId; px = e.clientX; py = e.clientY; held = false;
    while (trail.length) trailPool.push(trail.pop());
    addEventListener('pointermove', sheetMove);
    addEventListener('pointerup', sheetUp);
    addEventListener('pointercancel', sheetCancel);
  }
  el.addEventListener('pointerdown', onSheetDown);

  // ---- What the verbs' controls do (one function each, for every card and every verb: the verb and the parts are on the element) ----
  const onSegClick = (e) => { const b = e.currentTarget; b._acV.set(b._acVal); render(KEEP); };
  const onToggleClick = (e) => {
    const v = e.currentTarget._acV, on = !v.get(store.get().params);
    updateParams((pp) => { v.set(pp, on); return pp; }, { label: `${v.hist || v.label} ${on ? 'on' : 'off'}` });
  };
  const onBtnClick = (e) => { e.currentTarget._acV.run(); setTimeout(renderSoon, 30); };
  const onDyePress = (e) => { if (e.button > 0) return; const b = e.currentTarget; b._acPressed = true; capture(b, e.pointerId); b._acV.run(DYE_HOLD); };
  const onDyeClick = (e) => { if (e.detail === 0) e.currentTarget._acV.run(DYE_ONCE); };   // keyboard
  const noMenu = (e) => e.preventDefault();
  // A slider: the thumb and its number follow the pointer at once; the model gets the newest value once per frame, the sliders that
  // have one waiting together (kept in the order they were asked), and at once when the hand lets go. The send is a task of its own
  // straight after that frame (class-soon runSoon), so the cards, legend and readouts the change wakes are built between frames,
  // never inside one.
  const FLUSH_OPT = { history: true, label: '' };
  let flushV = null, flushX = 0;
  const applyFlush = (pp) => { flushV.set(pp, flushX); return pp; };
  const sendQ = [];   // (the sliders whose send is waiting for its task, in the order asked)
  function sendSlider() {
    const input = sendQ.shift();
    if (!input._acPend) return;
    input._acPend = false;
    flushV = input._acV; flushX = input._acX;
    FLUSH_OPT.history = input._acHist; FLUSH_OPT.label = flushV.hist || input._acLab;
    updateParams(applyFlush, FLUSH_OPT);
  }
  function flushSlider(input) {
    input._acRaf = 0;
    if (input._acPend) { sendQ.push(input); runSoon(sendSlider); }
  }
  const sliderQ = [];
  let sliderRaf = 0;
  function flushSliders() {
    sliderRaf = 0;
    while (sliderQ.length) flushSlider(sliderQ.shift());
  }
  const onSliderFresh = (e) => { e.currentTarget._acFresh = true; };
  const onSliderInput = (e) => {
    const input = e.currentTarget, x = parseFloat(input.value);
    propSoon(input, 'value', input.value);   // (the input already holds x: this only replaces a write still waiting for another value)
    paintShown(input, x);
    if (!input._acPend) { input._acPend = true; input._acHist = input._acFresh; }
    input._acX = x;
    input._acFresh = false;
    if (!input._acRaf) { input._acRaf = 1; sliderQ.push(input); if (!sliderRaf) sliderRaf = nextFrame(flushSliders); }
  };
  const onSliderChange = (e) => flushSlider(e.currentTarget);

  // A control's title row: its icon, its word, and its value (or switch) at the right.
  const ctlTop = (v, valEl) => h('div', P_CTLTOP, v.icon ? svgIcon(v.icon, 'ac-ic') : null, h('span', P_CTLNAME, v.short || (typeof v.label === 'function' ? v.label() : v.label)), valEl);
  // An action: the app's icon and one word (the full name is its accessible name and tip).
  function actBtn(props, v) {
    const word = v.short || v.label;
    props['aria-label'] = v.label; props.title = v.label;
    const lbl = h('span', P_BL, word);
    const b = h('button', props, v.icon ? svgIcon(v.icon, 'ac-ic') : null, lbl);
    props['aria-label'] = ''; props.title = '';
    b._acLbl = lbl;
    return b;
  }

  // A control with dimIf(p) (true: it does nothing now) is dimmed and stays where it is, never hidden: nothing on the card moves.
  function dimmable(row, v, p0) {
    if (!v.dimIf) return row;
    row.classList.toggle('ac-dim', !!v.dimIf(p0));
    const d = { _acSk: 4, _acV: v, classList: row.classList };
    syncs.push(d);
    return row;
  }
  function verbEl(v, p0) {
    if (v.type === 'read' || v.type === 'stat') {
      // A reading named by its unit (`read`), or by its name where the unit would not say it (a lobule part's `stat`).
      const val = h('b', P_RV);
      val._acK = 2; val._acV = v; live.push(val);
      return h('span', P_R, v.label ? h('em', P_EM, v.label) : null, val, v.unit ? h('u', P_U, v.unit) : null);
    }
    if (v.type === 'about') {
      // What this lobule part is and what is happening to it now, in plain words.
      const box = h('div', P_ABOUT);
      box._acK = 3; box._acV = v; box._acN = -1; box._acSeen = aboutNext < aboutSlots.length ? aboutSlots[aboutNext++] : null;
      live.push(box);
      return box;
    }
    if (v.type === 'link') {
      P_LINKB.onclick = v.run;
      const b = actBtn(P_LINKB, v);
      P_LINKB.onclick = null;
      return b;
    }
    if (v.type === 'seg') {
      for (let i = 0; i < v.options.length; i++) {
        const o = v.options[i];
        P_PRESSED['aria-pressed'] = v.get() === o[0] ? 'true' : 'false';
        const b = h('button', P_PRESSED, o[1]);
        b._acV = v; b._acVal = o[0];
        b.addEventListener('click', onSegClick);
        b._acSk = 3; syncs.push(b);
        kidsBuf.push(b);
      }
      P_SEG['aria-label'] = v.label || 'Options';
      const seg = h('div', P_SEG, kidsBuf);
      kidsBuf.length = 0;
      return dimmable(h('div', P_SEGROW, v.label ? h('div', P_CTLTOP, h('span', P_CTLNAME, v.label)) : null, seg), v, p0);
    }
    if (v.type === 'slider') {
      const lab = typeof v.label === 'function' ? v.label() : v.label;
      P_RANGE.min = v.min; P_RANGE.max = v.max; P_RANGE.step = v.step; P_RANGE['aria-label'] = lab; P_RANGE['data-def'] = v.def ?? null;
      const input = h('input', P_RANGE);
      const val = h('span', P_CTLVAL);
      let ticks = null;
      if (v.ticks) {
        for (let i = 0; i < v.ticks.length; i++) {
          P_TICK.style = `--t: ${(v.ticks[i] - v.min) / (v.max - v.min)}`;
          kidsBuf.push(h('i', P_TICK));
        }
        P_TICK.style = '';
        ticks = h('div', P_TICKS, kidsBuf);
        kidsBuf.length = 0;
        if (v.tickNames) input.setAttribute('aria-description', v.tickNames);
      }
      const row = h('div', P_SLIDER, ctlTop(v, val), h('div', P_RANGEWRAP, input, ticks));
      input._acV = v; input._acVal = val; input._acRow = row; input._acLab = lab;
      input._acFresh = true; input._acPend = false; input._acHist = false; input._acX = 0; input._acRaf = 0;
      input.addEventListener('pointerdown', onSliderFresh);
      input.addEventListener('keydown', onSliderFresh);
      input.addEventListener('input', onSliderInput);
      input.addEventListener('change', onSliderChange);
      paintSlider(input, v.get(p0));
      input._acSk = 1; syncs.push(input);
      row._acRun = 3; row._acF = input; actionable.push(row);
      return dimmable(row, v, p0);
    }
    if (v.type === 'meter') {
      const val = h('span', P_CTLVAL), fill = h('i', P_METER_FILL);
      P_METER_ROW['aria-label'] = v.label;
      const row = h('div', P_METER_ROW, ctlTop(v, val), h('div', P_METER, fill));
      row._acK = 7; row._acV = v; row._acVal = val; row._acK2 = -1; row._acX = 0;
      // alloc-rare: the meter's fill, one closure per card built (a pick); it runs between frames when the share moves a percent
      row._acFill = () => { fill.style.transform = `scaleX(${row._acX.toFixed(3)})`; };
      live.push(row);
      return row;
    }
    if (v.type === 'toggle') {
      P_TOGGLE['aria-checked'] = v.get(p0) ? 'true' : 'false';
      P_TOGGLE['aria-label'] = v.label;
      const b = h('button', P_TOGGLE, ctlTop(v, h('span', P_SWITCHVIS, h('i'))));
      b._acV = v;
      b.addEventListener('click', onToggleClick);
      b._acSk = 2; syncs.push(b);
      b._acRun = 1; actionable.push(b);
      return b;
    }
    if (v.type === 'panel') {
      // A component with its own controls and its own following of the params (a stent's editor: one row of value chips, stent-editor.js).
      const x = v.make();
      panels.push(x);
      return h('div', P_PANEL, x.el);
    }
    if (v.type === 'button') {
      const b = actBtn(v.danger ? P_BTN_DANGER : v.quiet ? P_BTN_QUIET : P_BTN, v);
      b._acV = v;
      b.addEventListener('click', onBtnClick);   // (the card rebuilds between frames, never as a timer task inside one)
      b._acRun = 1; actionable.push(b);
      return b;
    }
    if (v.type === 'dye') {
      // A press injects for a few seconds; held, it goes on until let go.
      const lbl = h('span', P_BL, v.short || v.label);
      const b = h('button', P_DYE, v.icon ? svgIcon(v.icon, 'ac-ic') : null, lbl);
      b._acV = v; b._acPressed = false;
      // alloc-rare: the hold button is built with the card (once per pick), its release is one closure
      const up = () => { if (b._acPressed) { b._acPressed = false; v.release(); } };
      b.addEventListener('pointerdown', onDyePress);
      for (const t of DYE_END) b.addEventListener(t, up);
      // alloc-rare: the hold button is built with the card (once per pick)
      b.addEventListener('lostpointercapture', (e) => { if (e.target === b) up(); });   // (a child's lost capture, a touch handing it to the button, is not the end of the press)
      b.addEventListener('click', onDyeClick);
      b.addEventListener('contextmenu', noMenu);
      lbl._acK = 5; lbl._acV = v; lbl._acBtn = b; live.push(lbl);
      b._acRun = 2; actionable.push(b);
      return b;
    }
    return null;
  }

  function update() {
    if (!model || el.hidden) return;
    for (let i = 0; i < live.length; i++) runLive(live[i]);
  }

  // Where the card stands: a phone's in the figure column, above the view switch (app.css .action-card.docked); a Mac's or an iPad's
  // in the figure, on the shelf at its left edge under the case pill (app.css). Neither depends on what was picked, so nothing is
  // measured to place it.
  const placed = {};
  function position() {
    if (!model || el.hidden) return;
    if (isPhoneLayout()) {
      if (el.parentNode !== dockHost) dockHost.append(el);
      if (!isDocked()) el.classList.add('docked');
    } else {
      if (el.parentNode !== view) view.append(el);
      if (isDocked()) el.classList.remove('docked');
    }
    handOver(placed, isDocked() ? 'sheet' : 'shelf', [el.querySelector(':scope > .ac-body')]);   // (turned between the shelf and the sheet: its words start at the top again, F35)
    // The camera counts this card like Tests and Details: over the foot of a phone, on the left shelf elsewhere (it pans for it, stage-fit.js; 17 Nov 2026, F9, F27).
    const edge = isDocked() ? 'bottom' : 'left';
    if (el.dataset.safe !== edge) el.dataset.safe = edge;
  }

  // The floating pieces moved (the layout changed between a phone and a wider screen, the dock grew): stand the card in its place again.
  addEventListener('pps:occ', () => { position(); reveal(); });
  addEventListener('pps:reframed', () => { if (model) reveal(); });   // (the camera moved by itself: judged again from where it is going)
  store.on('selection', () => render());
  store.on('shunting', () => render());
  store.on('colorMode', () => update());
  store.on('params', () => { const p = store.get().params; for (let i = 0; i < syncs.length; i++) syncOne(syncs[i], p); });
  return {
    el, render, update, position,
    isOpen: () => !!model && !el.hidden,
    /** Whether the card's details are the view showing (Esc takes them back before it takes the card away). */
    detailsOpen: () => detOpen,
    closeDetails,
    trigger(n) { if (detOpen) return false; const a = actionable[n - 1]; if (a && !a.disabled) { runAction(a); return true; } return false; },
    focusFirst() { if (actionable[0]) focusAction(actionable[0]); },
  };
}

// A meter's percent texts, made once: "0%" … "100%", and its value for a screen reader.
const PCT_TEXT = [], PCT_NUM = [];
for (let k = 0; k <= 100; k++) { PCT_TEXT.push(`${k}%`); PCT_NUM.push(String(k)); }
