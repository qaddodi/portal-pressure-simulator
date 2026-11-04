// The action card: click a structure and a small card opens beside it with the value it carries
// and only the verbs that apply to it. It replaces the tool trays, the tool hint card and the
// sliders that used to live in the side panel. Every verb takes effect at once and becomes one
// entry in the timeline; nothing stays "armed".
//
// Memory (2 Nov 2026, the off-GPU scan's `alloc` category): a card is built when a structure is picked and is read every model frame
// while it is open. Neither makes garbage a frame has to pay for: the props h() reads are kept objects (module scope, or the
// few that vary rewritten in place just before the call), a handler is one function made once per card and finds its element and
// verb in the event (`e.currentTarget._acV`), the live readings are the elements themselves (the card walks `live`, `syncs` and
// `actionable`, kept lists, and each element says what it is in `_acK`), and numbers are compared as numbers, never printed
// into a string to be compared.

import { store, updateParams } from './store.js';
import { h, icon, svgIcon, clamp, infoButton, sinkTo, stopSink, paintRange, isPhoneLayout, countTo, swapText, transformEndX, afterExit, markGone, switchIn, releaseWords } from './util.js';
import { sheetParts } from './sheet-move.js';
import { releaseSpeed, isFlick, D_FLIP, D_SMALL, EASE_ARRIVE, EASE_IN, easeArrive } from './ease.js';
import { glideTranslate, glideStop, glideRunning } from './script-glide.js';
import { signalMove } from './num-move.js';
import { cardFor, normalizeSel } from './actions.js';
import { frameFor } from './frame.js';
import { restPass, cancelRest } from './rest-pass.js';
import { classSoon, runSoon, propSoon, attrSoon, textSoon } from './class-soon.js';
import { placeCard, coverCount, vesselPoints } from './card-place.js';
import { readBox, readMetric } from './layout-snap.js';
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
const P_NUM = { class: 'ac-num' }, P_STATE = { class: 'ac-state' };
const P_BODY = { class: 'ac-body' }, P_STATS = { class: 'ac-stats' }, P_BTNS = { class: 'ac-btns' };
const P_TOP = { class: 'ac-top' }, P_HEAD = { class: 'ac-head' }, P_TITLES = { class: 'ac-titles' }, P_KICKER = { class: 'ac-kicker' }, P_READOUT = { class: 'ac-readout' };
const P_SCROLL = { class: 'ac-scroll' };
const P_FOOT_AT = { class: 'ac-foot at-foot' }, P_FOOT_HEAD = { class: 'ac-foot in-head' }, P_LINK_TEXT = { class: 'ac-link-text' };
const P_UNMEASURED = { class: 'ac-unmeasured' }, P_UNIT = { class: 'unit' }, P_DELTA_UP = { class: 'ac-delta up' }, P_DELTA_DOWN = { class: 'ac-delta down' }, P_DELTA_NONE = { class: 'ac-delta' };   // (the delta's slot is always there, empty when there is no change: see .ac-delta, app.css)
const P_ABOUT = { class: 'ac-about' }, P_STAT = { class: 'ac-stat' }, P_NUMB = { class: 'num' };
const P_ROW = { class: 'ac-row' }, P_LABEL = { class: 'ac-label' }, P_CTLTOP = { class: 'ctl-top' }, P_CTLVAL = { class: 'ctl-val' }, P_CTLSUB = { class: 'ctl-sub' };
const P_RANGEWRAP = { class: 'range-wrap' };
const P_TL = { class: 'ac-tl' }, P_SWITCHVIS = { class: 'switch-vis', 'aria-hidden': 'true' };
const P_BL = { class: 'ac-bl' }, P_BTN = { class: 'ac-btn' }, P_BTN_DANGER = { class: 'ac-btn danger' };
const P_WRAP = { class: 'ac-btn-wrap' }, P_WRAP_WIDE = { class: 'ac-btn-wrap wide' }, P_NOTE = { class: 'ac-note' };
const P_DYE = { class: 'ac-btn ac-dye', title: 'Tap to inject for a few seconds; hold to go on longer' };
const P_VOL = { type: 'range', min: 1, max: 10, step: 0.5, value: 5, 'aria-label': 'Volume to drain (L)' };
const P_ALB = { type: 'checkbox', checked: true };
const P_DRAIN = { class: 'ac-drain' }, P_DRAINROW = { class: 'ac-drain-row' }, P_CHECKROW = { class: 'check-row' };
// Props that vary a little, rewritten in place just before the call that reads them (the key order is the order the attributes are made in).
const P_LINKB = { class: 'link ac-link', onclick: null };
const P_SEG = { class: 'seg full ac-seg', role: 'group', 'aria-label': '' };
const P_PRESSED = { 'aria-pressed': 'false' };
const P_RANGE = { type: 'range', min: 0, max: 0, step: 0, 'aria-label': '', 'data-def': null };
const P_SLIDER = { class: 'ac-slider' };
const P_TOGGLE = { class: 'ac-toggle', role: 'switch', 'aria-checked': 'false' };
// Animation keyframes and timings that never change (WAAPI reads them when animate() is called).
const FADE_IN = { duration: D_SMALL, easing: EASE_ARRIVE };
const GHOST_OUT = [{ opacity: 1 }, { opacity: 0 }], GHOST_OPT = { duration: D_FLIP, easing: EASE_IN, fill: 'forwards' };
// Options for countTo (it reads { eased } at once).
const COUNT_EASED = { eased: true }, COUNT_STEADY = { eased: false };
const DYE_HOLD = { hold: true }, DYE_ONCE = {};
const DYE_END = ['pointerup', 'pointercancel'];
const PASSIVE = { passive: true };
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];   // (the number beside each of the first nine verbs)
const VOL_TEXT = [];   // (the drain's volume label for each step of its slider: "1.0 L" … "10.0 L")
for (let k = 0; k <= 18; k++) VOL_TEXT.push(`${(1 + k * 0.5).toFixed(1)} L`);

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
const sameNum = (a, b) => a === b || (a !== a && b !== b);   // (NaN is the same place as NaN, as its text "NaN" was)

export function createCard({ view, stage, ctx, onWhy, onDetails }) {
  const el = h('section', { class: 'action-card stage-blocker', role: 'dialog', 'aria-label': 'Actions', hidden: true });
  view.append(el);
  // A phone's card is a sheet like Details and Treat (Menu system plan W4): a plate (paper and glass) and its content slide together
  // under the card's still cut, the one motion (app.css .ac-in, .ac-leaving). The plate is kept across rebuilds (it is the first child).
  const plate = (sheetParts(el), el.querySelector(':scope > .sheet-plate'));
  // alloc-rare: the card opens afresh: its class for the entrance's length, once for each open
  const endIn = () => el.classList.remove('ac-in');
  const opening = () => { switchIn(el); el.classList.add('ac-in'); setTimeout(endIn, D_SMALL + 60); };
  // A thin line from the card's nearest edge to the structure, with a dot on it, when they are apart.
  // (Plain boxes, no SVG: the line a dashed box turned to the anchor, the dot a ringed box, each placed by a transform: app.css .ac-lline, .ac-ldot.)
  const leader = document.createElement('div');
  leader.setAttribute('class', 'ac-leader'); leader.setAttribute('aria-hidden', 'true');
  view.append(leader);
  const tabletTouch = matchMedia('(pointer: coarse) and (min-width: 768px) and (max-width: 1366px)');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const sizes = { vw: view.clientWidth, vh: view.clientHeight, w: 0, h: 0 };
  new ResizeObserver(() => { const moved = Math.abs(sizes.vw - view.clientWidth) > 2 || !sizes.vh; sizes.vw = view.clientWidth; sizes.vh = view.clientHeight; if (moved) { placedOk = false; lastLayout = ''; pinned = null; } position(); if (isDocked()) reveal(); }).observe(view);
  new ResizeObserver(() => { const first = !sizes.w; sizes.w = el.offsetWidth; sizes.h = el.offsetHeight; el.style.setProperty('--sheet-size', sizes.h + 'px'); if (first) { placedOk = false; lastLayout = ''; pinned = null; } else lastLayout = ''; position(); syncMore(); if (isDocked()) reveal(); }).observe(el);
  const uiState = {};
  ctx.ui = (key, def) => (uiState[key] ||= def);
  // live: the elements whose reading follows the model (each says which in _acK: 1 the header's value and status, 2 a readout, 3 the
  // "about" words, 4 a button's note, 5 the dye button's label); syncs: the controls that follow the params (_acK 1 a slider, 2 a switch);
  // actionable: what the number keys reach, in order. Kept lists, emptied (length 0) and filled again when the card is rebuilt.
  let lastSelTok = [], newSelTok = [], model = null, selRef = null, placedOk = false, pkx = 0, pky = 0, pax = 0, pay = 0, lastLayout = '', pinned = null;
  const live = [], syncs = [], actionable = [];
  const PIN = { x: 0, y: 0 };   // (where the card stands: pinned points at it once placed)
  const BOX = { top: 0, bottom: 0, right: 0 };   // (the free part of the view, handed to placeCard, which reads it at once)

  const refP = () => { const st = store.get(); return st.compareSnap ? st.compareSnap.P : st.healthy?.P; };
  const lens = () => (store.get().imaging ? 'neutral' : store.get().colorMode);

  // Laying the labels out again (they steer clear of the card) is not needed more than once a frame.
  let relayoutRaf = 0;
  const relayoutRun = () => { relayoutRaf = 0; stage.relayout?.(); };
  const relayoutSoon = () => { if (!relayoutRaf) relayoutRaf = nextFrame(relayoutRun); };
  const isDocked = () => el.classList.contains('docked');
  // The phone sheet lives in the whole figure column, not in the figure itself: it reaches the bottom of the column,
  // over the play and timeline row, and stops just above the readout strip.
  const dockHost = view.closest('.stage-wrap') || view;
  const appStyle = document.getElementById('app').style;
  // A card with more controls than fit scrolls, and fades at the bottom while there is more to see.
  let moreAsk = 0;
  const moreRest = () => { moreAsk = 0; syncMore(); };
  const moreSoon = () => { if (!moreAsk) moreAsk = restPass(moreRest); };
  function syncMore() {
    const sc = el.querySelector('.ac-scroll');
    if (sc) sc.classList.toggle('more', sc.scrollHeight - sc.clientHeight - sc.scrollTop > 4);
  }
  // The sheet covers the bottom of the figure: keep the tapped vessel in the part that is left, and lift
  // the figure's own buttons (Fit, turn) and the credit clear of it.
  let revealRaf = 0, liftedBy = '', liftFound = false, liftPill = null, liftClock = null;
  // The variable goes on the few elements that use it: set on the whole figure it would make the browser re-check
  // the style of every element under it. (The two are looked for the first time the sheet moves, the clock is made after the card.)
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
  // How much of the figure the sheet covers (it also covers the row below the figure): read here, between two frames, through layout-snap.
  function coverNow() {
    return Math.max(0, readBox(view).bottom - (readBox(dockHost).top + readMetric(el, 'offsetTop')));
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
    if (el.dataset.swiped) { delete el.dataset.swiped; el.hidden = true; el.style.removeProperty('--sink'); }   // (pulled away: already out of sight behind the tab row)
    if (!el.hidden && !el.classList.contains('ac-leaving')) {
      // (Docked, it sinks away; a desktop card fades out where it stands: it had closed in one frame.)
      // (With Reduce Motion both only fade: app.css turns the keyframes into fades.)
      el.classList.add('ac-leaving');
      if (isDocked()) markGone(D_SMALL, el);   // (a phone's card sinks like a sheet: whatever opens next crosses over with it, as it does with a sheet)
      closeTimer = afterExit(el, 'ac-leaving', afterLeave);
    }
    model = null; live.length = 0; syncs.length = 0; actionable.length = 0;
    if (leader.firstChild) leader.replaceChildren();
    placedOk = false;
    liftButtons('0px');
    stage.unreveal?.();
    relayoutSoon();
  }

  // The kept lists the card is rebuilt with: the old card's children kept for the fade over the new one, the paragraphs and buttons
  // handed to h() as one list, and the words the "about" boxes drew (a box compares the model's words with these, one list a box).
  const wasKids = [], kidsBuf = [], aboutSlots = [[], [], [], []];
  let aboutNext = 0;

  // The pieces of the card that are the same every time it is built, made once here because their handlers are this card's own.
  const onClose = () => store.set({ selection: null });
  const onWhyClick = (e) => onWhy(e.currentTarget._acWhy, e.currentTarget);
  const onDetailsClick = () => onDetails(selRef);
  const P_CLOSE = { class: 'ib ac-close', 'aria-label': 'Close', title: 'Close (Esc)', onclick: onClose };
  const P_DETAILS = { class: 'link', 'aria-label': 'Details', title: 'Details', onclick: onDetailsClick };
  const KEEP = { keepFocus: true };
  const renderKeep = () => render(KEEP);
  const renderSoon = () => restPass(renderKeep);   // (the card rebuilds between frames, never as a timer task inside one)

  // The header's reading: the number rolls to a new one, the status word crossfades to a new one (its colour easing with it).
  function liveHeader(valEl) {
    const f = store.get().frame;
    if (!f) return;
    const numEl = valEl._acNum, pillEl = valEl._acPill, m = valEl._acM;
    if (lens() === 'neutral' && m.why !== 'spleen' && m.why !== 'ascites') {
      if (valEl._acMode !== 1) { valEl._acMode = 1; releaseWords(numEl); numEl.replaceChildren(h('span', P_UNMEASURED, 'Pressure unmeasured')); }
    } else {
      const v = m.value(f, lens(), refP());
      const vd = v.d || '', vup = v.up ? 1 : 0;
      if (valEl._acMode !== 2 || valEl._acV !== v.v || valEl._acU !== v.u || valEl._acD !== vd || valEl._acUp !== vup) {
        // The same reading with a new number rolls to it, a paused edit or a treatment included (P17); anything else is
        // drawn afresh. (What was drawn last is kept as its four fields: the model hands back kept readings it may rewrite.)
        const a = numOf(v.v, NUM_A), b = valEl._acHas ? numOf(valEl._acV, NUM_B) : null, numB = numEl.firstChild;
        if (a && b && a.d === b.d && valEl._acU === v.u && numB?.tagName === 'B' && numEl.querySelector('.ac-delta')) {
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
        valEl._acMode = 2; valEl._acV = v.v; valEl._acU = v.u; valEl._acD = vd; valEl._acUp = vup; valEl._acHas = true;
      }
    }
    // The status word crossfades to a new one, its colour easing with it.
    const s = m.status?.(f);
    if (s) {
      if (!pillEl._acOn || pillEl._acS0 !== s[0] || pillEl._acS1 !== s[1]) {
        // alloc-rare: the status word changed (the guard above compares it), not a steady per-frame loop
        const cls = 'ac-state st-word ' + s[0];
        if (!pillEl._acOn) pillEl.className = cls;
        // alloc-rare: the status word changed (see above): its swap's end is one closure
        swapText(pillEl, s[1], () => { pillEl.className = cls; });
        pillEl._acOn = true; pillEl._acS0 = s[0]; pillEl._acS1 = s[1];
      }
    // alloc-rare: the status word went away (the guard compares it): one closure for the swap's end, not a per-frame loop
    } else if (pillEl._acOn) { swapText(pillEl, '', () => { pillEl.className = 'ac-state'; }); pillEl._acOn = false; pillEl._acS0 = pillEl._acS1 = null; }
  }
  // What this is and what is happening to it now, in plain words: drawn again when a sentence changes.
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
  function liveNote(note) {
    const st = store.get(), f = st.frame, p = st.params, v = note._acV, lbl = note._acLbl;
    if (v.labelFor) { const txt = v.labelFor(p); if (lbl.textContent !== txt) lbl.textContent = txt; }
    if (v.on) note._acBtn.classList.toggle('on', !!v.on(p));
    const t = f && v.note ? v.note(f, p) : null;
    propSoon(note, 'hidden', !t); if (t) textSoon(note, t);
  }
  function liveDye(lbl) {
    const v = lbl._acV, on = !!v.busy();
    lbl._acBtn.classList.toggle('on', on);
    const t = on ? 'Injecting…' : v.label;
    if (lbl.textContent !== t) lbl.textContent = t;
  }
  function runLive(e) {
    const k = e._acK;
    if (k === 1) liveHeader(e);
    else if (k === 2) { const f = store.get().frame; if (f) { const t = e._acV.value(f); if (e.textContent !== t) e.textContent = t; } }
    else if (k === 3) liveAbout(e);
    else if (k === 4) liveNote(e);
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

  // The Why? and Details links, written twice and shown once: in the header on a phone (where a row of their own would
  // be a strip of wasted sheet) and at the foot on a desktop. The phone header has one word link: Details when there
  // is one (its "Why this value?" holds the Why), otherwise Why?.
  function mkFoot(where, m) {
    // alloc-rare: the card is built when a selection (or the shunting flag) changes, once per pick; the listener runs on that key's change, never per frame
    const why = where === 'in-head' && !m.noDetails ? null : h('button', { class: 'link', 'aria-label': 'Why?', title: 'Why?', onclick: onWhyClick }, svgIcon('bulb', 'mi-ic'), h('span', P_LINK_TEXT, 'Why?'));
    if (why) why._acWhy = m.why;
    return h('div', where === 'in-head' ? P_FOOT_HEAD : P_FOOT_AT,
      why,
      m.noDetails ? null : h('button', P_DETAILS, h('span', P_LINK_TEXT, 'Details'), svgIcon('chev-right', 'mi-ic')));
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
    el.classList.remove('ac-leaving');
    let focusedIdx = -1;
    if (keepFocus) for (let i = 0; i < actionable.length; i++) if (actionable[i].contains(document.activeElement)) { focusedIdx = i; break; }
    // (Told from the last one by tokens, in two kept lists: the same selection rebuilt keeps its place and its size.)
    const ns = normalizeSel(sel) || sel;
    newSelTok.length = 0; encodeSel(ns, newSelTok);
    let same = !el.hidden && !!model && newSelTok.length === lastSelTok.length;
    if (same) for (let i = 0; i < newSelTok.length; i++) if (newSelTok[i] !== lastSelTok[i]) { same = false; break; }
    const tok = lastSelTok; lastSelTok = newSelTok; newSelTok = tok;
    el.dataset.card = ns.type || 'vessel';
    model = m; selRef = sel; live.length = 0; syncs.length = 0; actionable.length = 0; aboutNext = 0;
    const close = h('button', P_CLOSE, icon('close'));
    // The reading, then its status as a coloured word (as the data card tiles' status words).
    const numEl = h('span', P_NUM), pillEl = h('span', P_STATE);
    // alloc-rare: the card is built when a selection (or the shunting flag) changes, once per pick; the listener runs on that key's change, never per frame
    const valEl = h('div', { class: 'ac-value' }, numEl, pillEl);
    valEl._acK = 1; valEl._acNum = numEl; valEl._acPill = pillEl; valEl._acM = m;
    live.push(valEl);
    const body = h('div', P_BODY);
    // Readouts that follow one another sit side by side on a phone (a lone one takes the whole row).
    // Plain buttons that follow one another are grouped too: three of them share one row on a phone.
    let statRun = null, btnRun = null;
    for (const v of m.verbs) {
      const node = verbEl(v);
      if (!node) continue;
      if (node.classList.contains('ac-stat')) {
        btnRun = null;
        if (!statRun) { statRun = h('div', P_STATS); body.appendChild(statRun); }
        statRun.appendChild(node);
      } else if (node.classList.contains('ac-btn-wrap') && !node.classList.contains('wide') && !node.querySelector('.ac-note')) {
        statRun = null;
        if (!btnRun) { btnRun = h('div', P_BTNS); body.appendChild(btnRun); }
        btnRun.appendChild(node);
        btnRun.classList.toggle('tri', btnRun.children.length === 3);
      } else { statRun = btnRun = null; body.appendChild(node); }
    }
    const foot = mkFoot('at-foot', m);
    // One compact phone sheet: drag the header down to dismiss.
    const top = h('div', P_TOP,
      h('header', P_HEAD, h('div', P_TITLES, h('span', P_KICKER, m.kicker), h('h3', P_NONE, m.title)), mkFoot('in-head', m), close),
      h('div', P_READOUT, valEl));
    top.addEventListener('pointerdown', onSheetDown); sheetWired = true;
    const scroller = h('div', P_SCROLL, body);
    // (Its scroll is measured between frames, a rest pass, never in the scroll's own event.)
    scroller.addEventListener('scroll', moreSoon, PASSIVE);
    const swap = !el.hidden && !same && !!el.animate;
    wasKids.length = 0;
    if (swap) for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (!c.classList.contains('ac-ghost') && c !== plate) wasKids.push(c);
    const was = wasKids;
    el.querySelector(':scope > .ac-ghost')?.remove();
    releaseWords(el);   // (the readouts of the content being replaced)
    el.replaceChildren(plate, top, scroller, foot);
    // Another vessel picked while the card is open: its contents fade in, rather than the words changing in one frame, and
    // the old ones fade out over them from a layer on top that takes no taps, instead of vanishing first (round 2 review, RF7).
    if (swap) {
      // alloc-rare: the fade-in of a swapped card's contents: once per pick that swaps one card for another
      for (const c of el.children) if (c !== plate) c.animate([{ opacity: 0 }, { opacity: 1 }], FADE_IN);
      if (was.length) {
        // alloc-rare: the ghost of a swapped card: once per pick that swaps one card for another
        const ghost = h('div', { class: 'ac-ghost', 'aria-hidden': 'true', inert: '' }, ...was);
        el.append(ghost);
        const a = ghost.animate(GHOST_OUT, GHOST_OPT);
        // alloc-rare: the ghost goes when its fade ends: once per swap, with the ghost
        a.finished.then(() => ghost.remove(), () => ghost.remove());
      }
      wasKids.length = 0;
    }
    // alloc-rare: the card is built when a selection (or the shunting flag) changes, once per pick; the listener runs on that key's change, never per frame
    el.setAttribute('aria-label', `${m.title}: actions`);
    if (el.hidden) { at = null; opening(); }   // (opened afresh: it appears where it is placed, no glide from where it last stood)
    el.hidden = false;
    // Number keys trigger the verbs in order; show the number beside each.
    for (let i = 0; i < actionable.length && i < 9; i++) actionable[i].dataset.key = KEYS[i];
    // The same card rebuilt (a value changed what is allowed): keep its place and its size, so nothing moves under the hand.
    update();
    if (!same) { placedOk = false; lastLayout = ''; pinned = null; }
    position();
    if (focusedIdx >= 0 && actionable[focusedIdx]) focusAction(actionable[focusedIdx]);
    relayoutSoon();
    reveal();
    restPass(syncMore);
  }

  // Track swipes outside the header too; release all listeners on close or selection change.
  // Over the thumb dock (an upright phone) the card follows the finger down behind the tab row (--sink, as the other
  // cards there) and, let go past a short pull or flicked, sinks out of sight and closes; a short pull eases back.
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
    // (A tap on the header does not nudge the card: it follows the finger only once the finger has moved a few px, as the other sheets do.)
    if (!held) { if (Math.hypot(e.clientX - px, e.clientY - py) < 6) return; held = true; }
    const pair = trail.length >= 8 ? trail.shift() : trailPool.pop();
    pair[0] = performance.now(); pair[1] = e.clientY; trail.push(pair);
    if (thumb()) el.style.setProperty('--sink', `${dy}px`);
  }
  const sheetGone = () => { if (el.hidden) return; el.dataset.swiped = '1'; store.set({ selection: null }); if (!el.hidden) { delete el.dataset.swiped; el.style.removeProperty('--sink'); } };
  function settle(gone, speed) {
    if (!thumb()) { if (gone) store.set({ selection: null }); return; }
    if (!gone) { sinkTo(el, 0, 220, undefined, speed); return; }
    sinkTo(el, sizes.h, 220, sheetGone, speed);
  }
  function sheetUp(e) {
    if (e.pointerId !== pid) return;
    dy = Math.max(0, e.clientY - y0);
    const speed = releaseSpeed(trail, performance.now());   // (the finger's, px per ms down: the settle carries it on)
    // (A flick is how fast the finger was going as it lifted, not only the pull's average: a slow start and a quick flick at the end is one.)
    const flick = isFlick(dy, speed, dy / Math.max(1, performance.now() - t0), 0.6, 30);
    sheetStop();
    settle(flick || dy > 40, speed);
  }
  function sheetCancel(e) { if (e.pointerId !== pid) return; sheetStop(); settle(false, releaseSpeed(trail, performance.now())); }
  // (Until the first card is built there is no pull to stop.)
  function stopSheetGesture() { if (!sheetWired) return; if (y0 != null) sheetStop(); stopSink(el); el.style.removeProperty('--sink'); }
  function onSheetDown(e) {
    if (!isDocked() || !e.isPrimary || e.button !== 0 || e.target.closest('.ac-close, .ac-foot')) return;
    y0 = e.clientY - (parseFloat(el.style.getPropertyValue('--sink')) || 0); t0 = performance.now(); dy = 0; pid = e.pointerId; px = e.clientX; py = e.clientY; held = false;
    while (trail.length) trailPool.push(trail.pop());
    stopSink(el);
    addEventListener('pointermove', sheetMove);
    addEventListener('pointerup', sheetUp);
    addEventListener('pointercancel', sheetCancel);
  }

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
  // (The volume runs 1 to 10 L in steps of half a litre and the slider keeps to its steps: its 19 labels are made once, above.)
  let drainVol = null, drainLbl = null;
  function paintVol() { drainLbl.textContent = VOL_TEXT[Math.round((+drainVol.value - 1) * 2)]; paintRange(drainVol, (+drainVol.value - 1) / 9); }
  const onDrainGo = (e) => { const go = e.currentTarget; ctx.action({ kind: 'paracentesis', mL: +go._acVol.value * 1000, albumin: go._acAlb.checked }); };
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

  function verbEl(v) {
    const p0 = store.get().params;
    if (v.showIf && !v.showIf(p0)) return null;
    if (v.type === 'stat') {
      const val = h('b', P_NUMB);
      val._acK = 2; val._acV = v; live.push(val);
      return h('div', P_STAT, h('span', P_NONE, v.label), val);
    }
    if (v.type === 'about') {
      // What this is and what is happening to it now, in plain words (as the lobule's cards).
      const box = h('div', P_ABOUT);
      box._acK = 3; box._acV = v; box._acN = -1; box._acSeen = aboutNext < aboutSlots.length ? aboutSlots[aboutNext++] : null;
      live.push(box);
      return box;
    }
    if (v.type === 'link') {
      P_LINKB.onclick = v.run;
      const b = h('button', P_LINKB, v.label, svgIcon('chev-right', 'mi-ic'));
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
      P_SEG.class = v.small ? 'seg full ac-seg small' : 'seg full ac-seg';
      P_SEG['aria-label'] = v.label || 'Options';
      const seg = h('div', P_SEG, kidsBuf);
      kidsBuf.length = 0;
      return h('div', P_ROW, v.label ? h('span', P_LABEL, v.label) : null, seg);
    }
    if (v.type === 'slider') {
      const lab = typeof v.label === 'function' ? v.label() : v.label;
      P_RANGE.min = v.min; P_RANGE.max = v.max; P_RANGE.step = v.step; P_RANGE['aria-label'] = lab; P_RANGE['data-def'] = v.def ?? null;
      const input = h('input', P_RANGE);
      const val = h('span', P_CTLVAL);
      // On a phone a short name sits on one row with its track; a long one stacks above it.
      P_SLIDER.class = lab.length > 13 ? 'ac-slider long' : 'ac-slider';
      const row = h('div', P_SLIDER,
        h('div', P_CTLTOP, h('span', P_LABEL, v.icon ? svgIcon(v.icon, 'ac-ic') : null, lab, v.info ? infoButton(v.info) : null), val),
        h('div', P_RANGEWRAP, input),
        v.sub ? h('div', P_CTLSUB, v.sub) : null);
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
    if (v.type === 'toggle') {
      P_TOGGLE['aria-checked'] = v.get(p0) ? 'true' : 'false';
      const b = h('button', P_TOGGLE,
        v.icon ? svgIcon(v.icon, 'ac-ic') : null, h('span', P_TL, v.label), h('span', P_SWITCHVIS, h('i')));
      b._acV = v;
      b.addEventListener('click', onToggleClick);
      b._acSk = 2; syncs.push(b);
      b._acRun = 1; actionable.push(b);
      return b;
    }
    if (v.type === 'button') {
      const lbl = h('span', P_BL, v.label);
      const b = h('button', v.danger ? P_BTN_DANGER : P_BTN, v.icon ? svgIcon(v.icon, 'ac-ic') : null, lbl);
      b._acV = v;
      b.addEventListener('click', onBtnClick);   // (the card rebuilds between frames, never as a timer task inside one)
      const wrap = h('div', v.label.length > 15 ? P_WRAP_WIDE : P_WRAP, b);   // a long name takes the whole row on a phone
      if (v.note || v.on || v.labelFor) {
        const note = h('div', P_NOTE);
        wrap.append(note);
        note._acK = 4; note._acV = v; note._acBtn = b; note._acLbl = lbl; live.push(note);
      }
      b._acRun = 1; actionable.push(b);
      return wrap;
    }
    if (v.type === 'dye') {
      // A press injects for a few seconds; held, it goes on until let go.
      const lbl = h('span', P_BL, v.label);
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
      return h('div', P_WRAP, b);
    }
    if (v.type === 'drain') {
      const vol = h('input', P_VOL);
      const volLbl = h('span', P_CTLVAL);
      // alloc-rare: the drain volume row is built with the card (once per pick)
      const volWrap = h('div', { class: 'range-wrap' }, vol);
      drainVol = vol; drainLbl = volLbl;
      vol.addEventListener('input', paintVol); paintVol();
      const alb = h('input', P_ALB);
      const go = h('button', P_BTN, svgIcon('needle', 'ac-ic'), h('span', P_BL, 'Drain'));
      go._acVol = vol; go._acAlb = alb;
      go.addEventListener('click', onDrainGo);
      go._acRun = 1; actionable.push(go);
      return h('div', P_DRAIN,
        h('div', P_CTLTOP, h('span', P_LABEL, svgIcon('needle', 'ac-ic'), 'Paracentesis'), volLbl), volWrap,
        h('div', P_DRAINROW, h('label', P_CHECKROW, alb, 'Albumin 8 g/L'), go));
    }
    return null;
  }

  let dragEl = null;
  // (R11, review pass 2: the control in use is kept in place by a ResizeObserver on what can push it (the readout above and the rows
  // of the body), whose callback comes after the browser's own layout, so a drag reads no layout in a frame: the old way read the
  // control's place before and after every model frame's live writes, two forced layouts a frame while a slider was held.
  // The new path only, no off switch.)
  let dragTop = 0;
  const dragRO = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (!dragEl?.isConnected) return;
    const t = readBox(dragEl).top, d = t - dragTop, sc = el.querySelector('.ac-scroll');
    if (d && sc) { const s0 = readMetric(sc, 'scrollTop'); sc.scrollTop = s0 + d; dragTop = t - (readMetric(sc, 'scrollTop') - s0); } else dragTop = t;
  }) : null;
  el.addEventListener('pointerdown', (e) => {
    dragEl = e.target.closest?.('input[type=range], .ac-btn, .ac-toggle, .seg button') || null;
    if (!dragRO || !dragEl) return;
    dragTop = readBox(dragEl).top;   // (once, in the press's own event)
    dragRO.disconnect();
    const topEl = el.querySelector('.ac-top'), body = el.querySelector('.ac-scroll')?.firstElementChild;
    if (topEl) dragRO.observe(topEl);
    for (const c of body?.children || []) dragRO.observe(c);
  });
  const dragEnd = () => { dragEl = null; dragRO?.disconnect(); };
  addEventListener('pointerup', dragEnd, true); addEventListener('pointercancel', dragEnd, true);

  function update() {
    if (!model || el.hidden) return;
    // (The control in use is kept where it is by dragRO, above: nothing is read here.)
    for (let i = 0; i < live.length; i++) runLive(live[i]);
    position();
  }

  // The zoom pill is a column above the dock on the right: a card that reaches it ends above it. The dock's
  // height settles after a card is placed, so this runs again whenever the occupancy changes (pps:occ).
  // The card stands where `translate` puts it (laid out once at the view's corner); a move while it is open glides there on the
  // compositor from where it stood (a new vessel moved it 23 px in one frame: round 2 review, RF7). Nothing is laid out per frame.
  // (`at`: where it stands, null until placed; the pair is a kept one.)
  const AT = [0, 0];
  let at = null;
  function moveTo(x, y) {
    // alloc-rare: the card is placed anew (a new structure, a resize, a moved panel): moveTo runs on a changed place only, then just the leader follows
    const t = `${x}px ${y}px`;
    // alloc-rare: the card glides from its old place to a new one: once per placing, never while it stands
    const moved = at && (Math.abs(at[0] - x) > 0.5 || Math.abs(at[1] - y) > 0.5);
    if (moved && !reduceMotion.matches) glideTranslate(el, at[0], at[1], x, y, D_FLIP, easeArrive);   // (on the eases' clock, in the frame the glass reads it in: script-glide.js)
    else {
      if (!at || reduceMotion.matches) glideStop(el);
      if (!glideRunning(el) && el.style.translate !== t) { el.style.translate = t; signalMove(); }   // (a glide on its way to this very place carries on)
    }
    AT[0] = x; AT[1] = y; at = AT;
  }
  // (Measured in a rest pass, between two frames: placing the card never reads layout. A newer ask replaces one waiting.)
  let fitRest = 0;
  function fitAbovePill() { cancelRest(fitRest); fitRest = restPass(fitNow); }
  function fitNow() {
    el.style.maxHeight = '';
    const pill = view.querySelector('.zoom-pill'), box = readMetric(el, 'offsetParent');
    if (el.hidden || el.classList.contains('docked') || !box || !pill || readMetric(pill, 'offsetParent') !== box || !readMetric(pill, 'offsetHeight')) return;
    const pt = readMetric(pill, 'offsetTop'), pl = readMetric(pill, 'offsetLeft') + transformEndX(pill), top = at ? at[1] : readMetric(el, 'offsetTop'), left = at ? at[0] : readMetric(el, 'offsetLeft');   // (its glide aside is a transform: RF2; the card's own place is its translate)
    if (left < pl + readMetric(pill, 'offsetWidth') && left + readMetric(el, 'offsetWidth') > pl && top + readMetric(el, 'offsetHeight') > pt - 8) el.style.maxHeight = Math.max(200, pt - 8 - top) + 'px';
  }
  // The number of a custom property of the app's inline style (the room the bars and cards leave).
  const cssNum = (k) => parseFloat(appStyle.getPropertyValue(k)) || 0;
  function position() {
    if (!model || el.hidden) return;
    if (isPhoneLayout()) {
      if (el.parentNode !== dockHost) dockHost.append(el);
      // A desktop placement can still be gliding when the layout changes to a phone dock.
      // Stop it before clearing the offset, or its next frame will move the docked card again.
      if (glideRunning(el)) glideStop(el);
      if (el.style.translate) { el.style.translate = ''; signalMove(); }
      at = null; el.classList.add('docked'); if (leader.firstChild) leader.replaceChildren(); return;
    }
    if (el.parentNode !== view) view.append(el);
    el.classList.remove('docked');
    // Where the structure is on screen changes only when the view or the drawn geometry does.
    const lk = stage.layoutKey ? stage.layoutKey() : '';
    if (lk && lk === lastLayout && placedOk) return;
    lastLayout = lk;
    const a = stage.anchorFor(normalizeSel(selRef) || selRef);
    // Once placed, the card stays put while its controls are used (the drawn structure shifting as values change must not
    // move it); only the leader follows. A resize, a new selection or a moved panel places it afresh (placedOk reset).
    // Sizes come from ResizeObservers: measuring here, after the frame's DOM writes, would force
    // a layout every frame while the card is open.
    const W = sizes.vw, H = sizes.vh;
    const w = sizes.w || 288, hh = sizes.h || 240;
    // The figure fills the window: the card stays in the part the top bar, the vitals dock and the
    // cards on the right leave free (published on #app by main.js).
    const top = cssNum('--top-safe') + 8, bottom = H - (cssNum('--bot-occ') || 0) - 8, right = W - cssNum('--right-occ') - 8;
    // Nothing drawn to point at (a vessel this view leaves out, picked from Search): no leader, and the card keeps clear of the cards on the right.
    if (!a) {
      if (leader.firstChild) leader.replaceChildren();
      const x = pinned ? Math.min(pinned.x, Math.max(8, right - w)) : Math.max(8, right - w), y = pinned ? clamp(pinned.y, top, Math.max(top, bottom - hh)) : top;
      if (!pinned || x !== pinned.x || y !== pinned.y) { PIN.x = x; PIN.y = y; pinned = PIN; placedOk = false; moveTo(x, y); fitAbovePill(); }
      return;
    }
    // ...unless it no longer fits there (placed before the dock published its height, the card grew, or
    // Tests, Treat or History opened on the right over it: then it moves left, clear of them).
    // A zoom or pan can bring the vessel under a pinned card: then it moves (gliding) to a clear spot.
    // (A card that has no clear spot left, zoomed right in, stays where it is rather than hunting for one.)
    const fits = pinned && pinned.y >= top - 1 && pinned.y + hh <= Math.max(bottom, top + hh) + 1 && pinned.x + w <= Math.max(right, 8 + w) + 1;
    const clear = fits && (a.r == null || !coverCount(vesselPoints(a), pinned.x, pinned.y, w, hh, a.r + 4));
    if (placedOk && pinned && clear) { drawLeader(pinned.x, pinned.y, w, hh, a); return; }
    // Beside the structure, clear of the whole vessel; failing that, in the empty margin beside the figure
    // (with a leader line back to it), so the card covers as little of the anatomy as it can (card-place.js).
    BOX.top = top; BOX.bottom = bottom; BOX.right = right;
    const best = placeCard(a, w, hh, BOX, stage.contentRect?.(), tabletTouch.matches);
    if (placedOk && pinned && fits && best.cover) { drawLeader(pinned.x, pinned.y, w, hh, a); return; }
    // (Placed for this card's place and this structure's, to the pixel: the same ones again are the same placing.)
    const kx = Math.round(best.x), ky = Math.round(best.y), kax = Math.round(a.x), kay = Math.round(a.y);
    if (placedOk && sameNum(kx, pkx) && sameNum(ky, pky) && sameNum(kax, pax) && sameNum(kay, pay)) return;
    placedOk = true; pkx = kx; pky = ky; pax = kax; pay = kay;
    PIN.x = best.x; PIN.y = best.y; pinned = PIN;
    moveTo(best.x, best.y);
    fitAbovePill();
    drawLeader(best.x, best.y, w, hh, a);
  }
  const lLine = document.createElement('i'), lDot = document.createElement('i');
  lLine.className = 'ac-lline'; lDot.className = 'ac-ldot';
  // (What the leader was last drawn for: the same numbers draw the same line, so it is written only when they change.)
  let lex = NaN, ley = NaN, lax = NaN, lay = NaN;
  function drawLeader(x, y, w, hh, a) {
    // From an organ's outline: the outline point nearest the card; otherwise from the anchor itself.
    let ax = a.x, ay = a.y;
    if (a.outline?.length) {
      let bd = Infinity;
      for (let i = 0; i < a.outline.length; i++) {
        const opx = a.outline[i][0], opy = a.outline[i][1];
        const dd = Math.hypot(opx - clamp(opx, x, x + w), opy - clamp(opy, y, y + hh));
        if (dd < bd) { bd = dd; ax = opx; ay = opy; }
      }
    }
    const ex = clamp(ax, x, x + w), ey = clamp(ay, y, y + hh);
    const d = Math.hypot(ex - ax, ey - ay);
    if (d < (a.outline ? 12 : 30) || isDocked()) { if (leader.firstChild) leader.replaceChildren(); classSoon(leader, 'on', false); lex = NaN; return; }
    // (The line: a box d long from the card's edge, turned toward the anchor; set once each time the card is placed, never in a frame.)
    if (!sameNum(ex, lex) || !sameNum(ey, ley) || !sameNum(ax, lax) || !sameNum(ay, lay)) {
      lex = ex; ley = ey; lax = ax; lay = ay;
      lLine.style.width = `${d.toFixed(1)}px`;
      lLine.style.transform = `translate(${ex.toFixed(1)}px, ${ey.toFixed(1)}px) rotate(${Math.atan2(ay - ey, ax - ex).toFixed(4)}rad)`;
      lDot.style.transform = `translate(${ax.toFixed(1)}px, ${ay.toFixed(1)}px)`;
    }
    if (!lLine.isConnected) { classSoon(leader, 'on', false); leader.replaceChildren(lLine, lDot); nextFrame(leaderOn); }
  }
  const leaderOn = () => classSoon(leader, 'on', true);

  // The floating pieces moved (a card opened on the right, the dock grew): place the card again.
  addEventListener('pps:occ', () => { fitAbovePill(); if (pinned && !isDocked()) { lastLayout = ''; position(); return; } placedOk = false; lastLayout = ''; pinned = null; position(); if (isDocked()) reveal(); });
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
