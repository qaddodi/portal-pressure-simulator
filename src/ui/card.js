// The action card: click a structure and a small card opens with the numbers it carries and only the verbs that apply to it
// (card 5 on the side shelf, Mohammad's picks of 13 Nov 2026). It replaces the tool trays, the tool hint card and the sliders that
// used to live in the side panel. Every verb takes effect at once and becomes one entry in the timeline; nothing stays "armed".
//
// One shape for every structure, top to bottom: the name (a tap opens Details) with the direction of flow at its right; the pressure
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

import { store, updateParams } from './store.js';
import { h, svgIcon, paintRange, isPhoneLayout, countTo, swapText, afterExit, markGone, switchIn, releaseWords } from './util.js';
import { sheetParts, dragSheet, glideSheet, stopSheet, setSheetOffset, sheetOffset } from './sheet-move.js';
import { releaseSpeed, isFlick, carryCurve, SHEET_FLICK_MIN, SHEET_FLICK_FAR, SHEET_CLOSE_PX, SHEET_CLOSE_SHARE, D_FLIP, D_SMALL, EASE_ARRIVE, EASE_IN } from './ease.js';
import { cardFor, normalizeSel } from './actions.js';
import { frameFor } from './frame.js';
import { restPass, cancelRest } from './rest-pass.js';
import { runSoon, propSoon, attrSoon } from './class-soon.js';
import { readBox, readMetric } from './layout-snap.js';
import { gradientCss } from './colormap.js';
import { hvpgSev, ppgSev } from '../engine/pressure-cuts.js';
import { reduceMotionMQ } from './motion.js';
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
const P_CS = { class: 'ac-cs' }, P_CS_ONE = { class: 'ac-cs one' }, P_AS = { class: 'ac-as' };
const P_UNMEASURED = { class: 'ac-unmeasured' }, P_UNIT = { class: 'unit' }, P_DELTA_UP = { class: 'ac-delta up' }, P_DELTA_DOWN = { class: 'ac-delta down' }, P_DELTA_NONE = { class: 'ac-delta' };   // (the delta's slot is always there, empty when there is no change: see .ac-delta, app.css)
const P_ABOUT = { class: 'ac-about' };
const P_CTLTOP = { class: 'ctl-top' }, P_CTLNAME = { class: 'ctl-name' }, P_CTLVAL = { class: 'ctl-val' };
const P_RANGEWRAP = { class: 'range-wrap' }, P_TICKS = { class: 'ac-ticks', 'aria-hidden': 'true' }, P_TICK = { class: 'ac-tick', style: '' };
const P_METER = { class: 'ac-meter', 'aria-hidden': 'true' }, P_METER_FILL = { class: 'ac-meter-fill' }, P_METER_ROW = { class: 'ac-c ac-meter-row', role: 'meter', 'aria-label': '', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' };
const P_SWITCHVIS = { class: 'switch-vis', 'aria-hidden': 'true' };
const P_BL = { class: 'ac-bl' }, P_BTN = { class: 'ac-btn', 'aria-label': '', title: '' }, P_BTN_DANGER = { class: 'ac-btn danger', 'aria-label': '', title: '' };
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
const WORDS_OUT = [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 -6px' }], WORDS_OUT_OPT = { duration: D_FLIP, easing: EASE_IN, fill: 'forwards' };
const WORDS_IN = [{ opacity: 0, translate: '0 6px' }, { opacity: 1, translate: '0 0' }], WORDS_IN_OPT = { duration: D_SMALL, delay: D_FLIP / 2, easing: EASE_ARRIVE, fill: 'backwards' };
const FADE_OUT = [{ opacity: 1 }, { opacity: 0 }], FADE_IN = [{ opacity: 0 }, { opacity: 1 }];
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
const CELLS = { slider: 1, toggle: 1, meter: 1, seg: 2 };
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

export function createCard({ view, stage, ctx, onDetails }) {
  const el = h('section', { class: 'action-card stage-blocker', role: 'dialog', 'aria-label': 'Actions', hidden: true });
  view.append(el);
  // A card is a sheet like Details and Treat (Menu system plan W4): a plate (paper and glass) and its content move together under the
  // card's still cut, the one motion (app.css .ac-in, .ac-leaving). The plate is kept across rebuilds (it is the first child).
  sheetParts(el);
  // alloc-rare: the card opens afresh: its class for the entrance's length, once for each open
  const endIn = () => el.classList.remove('ac-in');
  let inTimer = 0;
  const opening = () => { switchIn(el); el.classList.add('ac-in'); clearTimeout(inTimer); inTimer = setTimeout(endIn, D_SMALL + 60); };
  const sizes = { h: 0 };
  new ResizeObserver(() => { sizes.h = readMetric(el, 'offsetHeight'); el.style.setProperty('--sheet-size', sizes.h + 'px'); if (isDocked()) reveal(); }).observe(el);
  new ResizeObserver(() => { if (isDocked()) reveal(); }).observe(view);
  const uiState = {};
  ctx.ui = (key, def) => (uiState[key] ||= def);
  // live: the elements whose reading follows the model (each says which in _acK: 1 the direction word and, on a card with no bar, its
  // reading; 2 a reading; 3 the "about" words; 5 the dye button's label; 6 the bar; 7 a meter); syncs: the controls that follow the
  // params (_acK 1 a slider, 2 a switch); actionable: what the number keys reach, in order. Kept lists, emptied (length 0) and filled
  // again when the card is rebuilt.
  let lastSelTok = [], newSelTok = [], model = null, selRef = null;
  const live = [], syncs = [], actionable = [];

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
  function revealNow() {
    const open = model && !el.hidden && isDocked();
    const covered = open ? coverNow() : 0;
    liftButtons(open ? `${covered + 6}px` : '0px');
    if (open) stage.reveal?.(normalizeSel(selRef) || selRef, covered);
  }
  function reveal() {
    // (A rest pass: the boxes are read between two frames, never inside one.)
    cancelRest(revealRaf);
    revealRaf = restPass(revealNow);
  }
  let closeTimer = 0, sheetWired = false;
  const afterLeave = () => { el.hidden = true; el.classList.remove('ac-leaving'); releaseWords(el); };
  function hide() {
    stopSheetGesture();
    if (el.dataset.swiped) { delete el.dataset.swiped; el.hidden = true; setSheetOffset(el, 0); }   // (pulled away: already out of sight behind the tab row)
    if (!el.hidden && !el.classList.contains('ac-leaving')) {
      // (It fades back toward the edge it came from: the left on a Mac, the foot on a phone. With Reduce Motion it only fades: app.css.)
      el.classList.add('ac-leaving');
      if (isDocked()) markGone(D_SMALL, el);   // (a phone's card sinks like a sheet: whatever opens next crosses over with it, as it does with a sheet)
      closeTimer = afterExit(el, 'ac-leaving', afterLeave);
    }
    model = null; live.length = 0; syncs.length = 0; actionable.length = 0;
    liftButtons('0px');
    stage.unreveal?.();
    relayoutSoon();
  }

  // The kept lists the card is rebuilt with: the children handed to h() as one list, and the words the "about" boxes drew (a box
  // compares the model's words with these, one list a box).
  const kidsBuf = [], aboutSlots = [[], [], [], []];
  let aboutNext = 0;

  // The pieces of the card that are the same every time it is built, made once here because their handlers are this card's own.
  const onNameClick = () => onDetails(selRef);
  const KEEP = { keepFocus: true };
  const renderKeep = () => render(KEEP);
  const renderSoon = () => restPass(renderKeep);   // (the card rebuilds between frames, never as a timer task inside one)

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
    else liveDye(e);
  }
  // A slider shows its number and its fill; a switch its state.
  // (Its number, fill and 'changed' mark are the same for the same x, so they are written when x is not the one shown. `_acShown`: the x it was last painted for.)
  function paintShown(input, x) {
    const v = input._acV;
    input._acShown = x;
    input._acVal.textContent = v.format(x); paintRange(input, (x - v.min) / (v.max - v.min));
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
    // The name (a tap opens Details: the chevron says so) and the direction of flow at its right.
    const pillEl = h('span', P_STATE);
    P_NAME['aria-label'] = `${m.title}: details`;
    const name = m.noDetails ? h('span', P_NAME_PLAIN, m.title) : h('button', P_NAME, h('span', P_NONE, m.title), svgIcon('chev-right', 'ac-chev'));
    if (!m.noDetails) name.addEventListener('click', onNameClick);
    const nr = h('div', P_NR, name, pillEl);
    const body = h('div', P_BODY, nr);
    // The bar, or (a structure with no inflow and outflow: the heart, the spleen, the varices, a lobule part) its one reading.
    let numEl = null;
    if (m.span) body.append(spanEl(m.span));
    else { numEl = h('span', P_NUM); body.append(h('div', P_VALUE, numEl)); }
    nr._acK = 1; nr._acNum = numEl; nr._acPill = pillEl; nr._acM = m; nr._acMode = 0; nr._acHas = false;
    live.push(nr);
    // (The controls take one column where a name is long or there is only one of them: the liver's Cirrhosis runs the card's width.)
    let rs = null, cs = null, as = null, about = null, danger = null, one = false, nCtl = 0;
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
    }
    if (rs) body.append(rs);
    if (about) body.append(about);
    if (cs) body.append(cs);
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
    // A switch to a card of another size is the old card going out and the new one coming in: its height never glides (B, 13 Nov).
    const resized = wasOpen && el.dataset.size !== size;
    el.dataset.card = ns.type || 'vessel';
    el.dataset.size = size;
    model = m; selRef = sel; live.length = 0; syncs.length = 0; actionable.length = 0; aboutNext = 0;
    const old = el.querySelector(':scope > .ac-body');
    el.querySelector(':scope > .ac-ghost')?.remove();
    releaseWords(el);   // (the readings of the content being replaced)
    const body = build(m);
    const swap = wasOpen && !same && !resized && !!el.animate && !!old;
    if (swap) {
      // Another structure picked while the card is open: the old words fade out 6 px up from a layer that takes no taps, the new ones
      // come in from 6 px below a beat later (B: only the words move, the card stays still). With Reduce Motion they only fade.
      old.classList.replace('ac-body', 'ac-ghost');
      old.setAttribute('aria-hidden', 'true'); old.inert = true;
      el.append(body);
      const still = reduceMotionMQ.matches;
      const a = old.animate(still ? FADE_OUT : WORDS_OUT, WORDS_OUT_OPT);
      body.animate(still ? FADE_IN : WORDS_IN, WORDS_IN_OPT);
      // alloc-rare: the ghost goes when its fade ends: once per swap, with the ghost
      a.finished.then(() => old.remove(), () => old.remove());
    } else {
      if (old) old.remove();
      el.append(body);
    }
    // alloc-rare: the card is built when a selection (or the shunting flag) changes, once per pick
    el.setAttribute('aria-label', `${m.title}: actions`);
    if (el.hidden || leaving || resized) opening();   // (opened afresh, or a new size: it comes in from its edge)
    el.hidden = false;
    // Number keys trigger the verbs in order; show the number beside each.
    for (let i = 0; i < actionable.length && i < 9; i++) actionable[i].dataset.key = KEYS[i];
    position();
    update();
    if (focusedIdx >= 0 && actionable[focusedIdx]) focusAction(actionable[focusedIdx]);
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
    if (!isDocked() || !e.isPrimary || e.button !== 0 || e.target.closest('input, button, .ac-c')) return;
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
  const onDyePress = (e) => { if (e.button > 0) return; const b = e.currentTarget; b._acPressed = true; b.setPointerCapture?.(e.pointerId); b._acV.run(DYE_HOLD); };
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
        kidsBuf.push(b);
      }
      P_SEG['aria-label'] = v.label || 'Options';
      const seg = h('div', P_SEG, kidsBuf);
      kidsBuf.length = 0;
      return h('div', P_SEGROW, v.label ? h('div', P_CTLTOP, h('span', P_CTLNAME, v.label)) : null, seg);
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
      return row;
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
    if (v.type === 'button') {
      const b = actBtn(v.danger ? P_BTN_DANGER : P_BTN, v);
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
  function position() {
    if (!model || el.hidden) return;
    if (isPhoneLayout()) {
      if (el.parentNode !== dockHost) dockHost.append(el);
      if (!isDocked()) el.classList.add('docked');
    } else {
      if (el.parentNode !== view) view.append(el);
      if (isDocked()) el.classList.remove('docked');
    }
  }

  // The floating pieces moved (the layout changed between a phone and a wider screen, the dock grew): stand the card in its place again.
  addEventListener('pps:occ', () => { position(); if (isDocked()) reveal(); });
  store.on('selection', () => render());
  store.on('shunting', () => render());
  store.on('colorMode', () => update());
  store.on('params', () => { const p = store.get().params; for (let i = 0; i < syncs.length; i++) syncOne(syncs[i], p); });
  return {
    el, render, update, position,
    isOpen: () => !!model && !el.hidden,
    trigger(n) { const a = actionable[n - 1]; if (a && !a.disabled) { runAction(a); return true; } return false; },
    focusFirst() { if (actionable[0]) focusAction(actionable[0]); },
  };
}

// A meter's percent texts, made once: "0%" … "100%", and its value for a screen reader.
const PCT_TEXT = [], PCT_NUM = [];
for (let k = 0; k <= 100; k++) { PCT_TEXT.push(`${k}%`); PCT_NUM.push(String(k)); }
