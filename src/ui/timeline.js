// The timeline: time, history, events and comparison in one row under the figure (there is no event
// track and no floating event pill: History is the list of what has happened).
//
//  ▶ 1×  Day 142 · 0:14   [jump ahead] History 5  Compare
//
// Every change the learner makes is an entry carrying a full snapshot of the model; History goes
// back to that moment (the model, its clock and its remodeling), and later entries stay ahead,
// faded, until something new happens. Threshold events are entries too, with their detail. Jumps
// (+1 wk / +1 mo / +6 mo) advance the disease clock in one step. "Compare
// from here" freezes the current moment as A for comparison. It replaces play/speed, the Seconds/Months
// switch, undo/redo/reset, the Findings list, the Log instrument and Compare mode.

import { store, replaceParams, onParamChange } from './store.js';
import { host } from './host.js';
import { h, toast, announce, icon, svgIcon, popover, closePopover, tooltipFor, clamp, putText, swapText } from './util.js';
import { activeInterventions } from './inspector.js';
import { removedLabel } from './removed-label.js';
import { frameFor } from './frame.js';
import { D_FLIP, D_SMALL, EASE_ARRIVE, EASE_IN } from './ease.js';
import { createSvgGL, svgModel, setPolys } from './svg-gl.js';
import { textPolys, textBox, loadGlyphs, glyphsReady } from './text-gl.js';
import { textSoon, attrSoon } from './class-soon.js';
import { restPass } from './rest-pass.js';
import { reduceMotionMQ } from './motion.js';
const nextFrame = frameFor('timeline');

const SEV = { critical: 'var(--critical)', danger: 'var(--danger)', caution: 'var(--caution)', info: 'var(--info)', ok: 'var(--ok)' };
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
/** Time-lapse rates: [sim days per real second, short label, long label]. */
export const LAPSES = [[1 / 24, '1 h/s', '1 hour per second'], [0.5, '12 h/s', '12 hours per second'], [1, '24 h/s', '1 day per second'], [7, '1 wk/s', '1 week per second']];
const JUMPS = [[7, '+1 wk', '1 week'], [30, '+1 mo', '1 month'], [180, '+6 mo', '6 months']];

/** A frozen, self-contained copy of a frame (for pinning A and for markers). */
export function captureFrame(f, params) {
  return { // alloc-rare: once per pin or marker (a learner action), never per frame
    P: Array.from(f.P), metrics: structuredClone(f.metrics), params: structuredClone(params), // alloc-rare: once per pin or marker (a learner action), never per frame
    frame: { ...f, P: Array.from(f.P), Pf: f.Pf ? Array.from(f.Pf) : undefined, Q: Array.from(f.Q), Qf: f.Qf ? Array.from(f.Qf) : undefined, D: Array.from(f.D), // alloc-rare: once per pin or marker (a learner action), never per frame
      ext: Array.from(f.ext), slow: structuredClone(f.slow), metrics: structuredClone(f.metrics), bleed: structuredClone(f.bleed), events: [], samples: null, params: undefined, viewParams: structuredClone(params) }, // alloc-rare: once per pin or marker (a learner action), never per frame
  };
}
export const fmtClock = (t, day) => {
  const s = Math.max(0, Math.floor(t)), m = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0');
  const tt = m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  return day > 0 ? `Day ${day} · ${tt}` : tt;
};

export function createTimeline({ root, onPlay, onSpeed, onJump, onRestart, scenarioLabel }) {
  let entries = [], cursor = -1, seq = 0, baseline = null, pending = null, lastEv = {}, jumping = false, jumpSeq = 0;
  // EXT-HIS-1: a timer belongs to the edit (or the history) that made it. `editSeq` names the edit being typed in, `tlGen` the history since the
  // last reset: a timer that fires for an older one does nothing, and a flush or a reset cancels the timer it owns.
  let editSeq = 0, tlGen = 0;
  const later = (fn, ms) => { const g = tlGen; return setTimeout(() => { if (g === tlGen) fn(); }, ms); };
  const listeners = [];
  const absT = (e) => e.day * 86400 + e.t;
  const byTime = (a, b) => absT(a) - absT(b) || a.id - b.id;
  const frameNow = () => store.get().frame;
  const labelsOf = (p) => new Map(activeInterventions(p).map((a) => [a.key, a.label]));

  // ── DOM ───────────────────────────────────────────
  const playBtn = h('button', { class: 'ib play', 'aria-label': 'Pause', title: 'Play / pause (Space)' }, icon('pause'));
  // Click toggles play/pause; press and hold opens the speed menu.
  let holdTimer = 0, held = false;
  const openSpeed = () => popover(speedBtn, [
    h('div', { class: 'menu-title' }, 'Real time (every heartbeat)'),
    ...SPEEDS.map((v) => { const it = menuBtn(`${v}×`, () => onSpeed(v)); it.setAttribute('aria-pressed', String(!store.get().lapse && store.get().speed === v)); return it; }),
    h('div', { class: 'menu-title' }, 'Time-lapse (averaged, no beat)'),
    ...LAPSES.map(([d, , long]) => { const it = menuBtn(long, () => onSpeed(d, true)); it.setAttribute('aria-pressed', String(store.get().lapse === d)); return it; }),
  ], { place: 'above', align: 'start', cls: 'time-pop' });
  playBtn.addEventListener('pointerdown', () => { held = false; clearTimeout(holdTimer); holdTimer = setTimeout(() => { held = true; restPass(openSpeed); }, 450); });   // (the menu is placed between frames, in a rest pass)
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) playBtn.addEventListener(ev, () => clearTimeout(holdTimer));
  playBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  playBtn.addEventListener('click', () => { if (held) { held = false; return; } onPlay(); });
  // Restart: the same patient from its first moment, every change and the clock cleared.
  const restartBtn = h('button', { class: 'ib tl-restart', 'aria-label': 'Restart this patient' }, icon('reset'));
  restartBtn.addEventListener('click', () => onRestart?.());
  const speedBtn = h('button', { class: 'tl-speed', 'aria-haspopup': 'menu', title: 'Playback speed', 'aria-label': 'Playback speed' }, '1×');
  speedBtn.addEventListener('click', () => openSpeed());
  // The full clock, and a short one (just the day) for a phone's play bar.
  const timeLong = h('span', { class: 'tl-t-long' }, '0:00'), timeShort = h('span', { class: 'tl-t-short', 'aria-hidden': 'true' }, '0:00');
  const timeEl = h('span', { class: 'tl-time', 'aria-live': 'off' }, timeLong, timeShort);
  // A jump's day count (900 ms, a new number most frames) is drawn on the GPU, over the clock (2 Nov 2026, "Move everything to GPU"):
  // Inter's own outlines with its tabular figures (text-gl.js), at the clock's size, weight, colour and place, filled by the charts'
  // painter (svg-gl.js), so no frame of it writes a word into the page. The clock's own words wait, hidden, and take the last day as
  // the count lands, between frames.
  loadGlyphs();
  let dayGL = null, dayPath = null, dayAt = null;
  // (The count's outlines for a day, handed to the picture as they are (setPolys): no path string is made or written for a new number.)
  const dayPolys = (t) => {
    const { size, weight, x, y, align } = dayAt, w = textBox(t, 0, 0, { weight, size, tnum: true }).width; // alloc-rare: once per distinct day shown during a jump, not per frame
    const x0 = align === 'end' ? x - w : align === 'middle' ? x - w / 2 : x;
    return textPolys(t, x0, y, { weight, size, tnum: true }).polys; // alloc-rare: once per distinct day shown during a jump, not per frame
  };
  // (The first day's path text, for the model's piece at the jump's start, in the task that starts it.)
  const dayD = (t) => {
    return dayPolys(t)
      .map(({ pts, closed }) => { let d = ''; for (let i = 0; i < pts.length; i += 2) d += `${i ? 'L' : 'M'}${pts[i].toFixed(2)} ${pts[i + 1].toFixed(2)}`; return closed ? d + 'Z' : d; }).join(''); // alloc-rare: once per distinct day shown during a jump, not per frame
  };
  // (The count landed: the clock's own words take its last day between frames, and the picture goes.)
  function dayLand() { if (dayEnd !== dayTok) return;   // (a newer jump's count is under way: it lands itself)
    timeLong.textContent = timeShort.textContent = shownDay; timeEl.classList.remove('tl-gpu'); dayGL.clear(); jumping = false; }
  let shownDay = '', dayTok = 0, dayEnd = -1;
  // (The clock's own words take the last day at once, hidden, so the clock is laid out once, at the width it lands at, and the count is
  // drawn in that place: nothing beside it moves again as it lands. Where its words stand is read here, in the task that starts the jump,
  // never in a frame.)
  function dayStart(t, last) {
    if (!glyphsReady()) return false;
    timeLong.textContent = timeShort.textContent = last;
    timeEl.classList.add('tl-gpu');
    const vis = [timeLong, timeShort].find((e) => e.getClientRects().length);
    if (!vis) return false;
    const cs = getComputedStyle(vis), size = parseFloat(cs.fontSize) || 12, weight = parseFloat(cs.fontWeight) || 600;
    const b = timeEl.getBoundingClientRect(), r = vis.getBoundingClientRect(), k = devicePixelRatio || 1;
    if (!(b.width > 0 && b.height > 0)) { timeEl.classList.remove('tl-gpu'); return false; }
    const ta = getComputedStyle(timeEl).textAlign, align = /right|end/.test(ta) ? 'end' : ta === 'center' ? 'middle' : 'start';
    const asc = -textBox('0', 0, 0, { weight, size, k }).y;   // (the baseline under the box's top, rounded as the browser rounds it)
    dayAt = { size, weight, y: r.top - b.top + asc, x: align === 'end' ? r.right - b.left : align === 'middle' ? (r.left + r.right) / 2 - b.left : r.left - b.left, align };
    if (!dayGL) { dayGL = createSvgGL(timeEl, { host: 'dock' }); dayGL.cv.setAttribute('aria-hidden', 'true'); dayGL.cv.removeAttribute('role'); }
    dayGL.setCtx({ view: timeEl.closest('.stage-wrap.cmap') ? 'circuit' : 'anatomic' });   // (the Circuit view's dark tokens, as the page's clock has them)
    dayPath = svgModel('path', { class: 'tl-day-gl', 'data-look': 'small.day', d: dayD(t) });
    dayGL.show(svgModel('svg', { 'data-look': 'small.root', viewBox: `0 0 ${b.width} ${b.height}`, preserveAspectRatio: 'none' }, dayPath), false);
    dayTok++;
    return true;
  }
  const histCount = h('span', { class: 'tl-hc' });
  const histBtn = h('button', { class: 'tl-hist', 'aria-haspopup': 'dialog', 'aria-label': 'History', title: 'History: every change and event, with a way back to each' }, svgIcon('clock', 'mi-ic'), h('span', { class: 'tl-hl' }, 'History'), histCount);
  histBtn.addEventListener('click', (e) => openHistory(e.currentTarget));
  const ffBtn = h('button', { class: 'ib tl-ff', 'aria-label': 'Jump ahead', 'aria-haspopup': 'menu', title: 'Fast forward' }, icon('ffwd'));
  ffBtn.addEventListener('click', (e) => popover(e.currentTarget, [
    // Undo on touch (no Ctrl Z there): the last change, one tap from the play bar.
    ...(canUndo() ? [menuBtn('Undo the last change', () => undo())] : []),
    h('div', { class: 'menu-title' }, 'Jump ahead'),
    ...JUMPS.map(([d, , long]) => menuBtn(`Jump ${long} ahead`, () => jump(d, long))),
    menuBtn('Until something happens', () => jump('event', 'until the next event')),
    menuBtn('Settle to equilibrium', () => { host.send({ type: 'settle' }); toast('Settled to equilibrium.'); }),
    (() => { const it = menuBtn(store.get().compareSnap ? 'Stop comparing' : 'Compare from here', () => togglePin()); it.classList.add('tl-phone-only'); return it; })(),
  ], { place: 'above', align: 'end', cls: 'time-pop' }));
  const pinBtn = h('button', { class: 'tl-pin', 'aria-pressed': 'false', 'aria-label': 'Compare from here', title: 'Freeze this moment and compare the live model with it (P)' }, svgIcon('compare', 'mi-ic'), h('span', {}, 'Compare'));
  // Restart lives in More; the jumps share one segmented control.
  pinBtn.addEventListener('click', () => togglePin());
  root.replaceChildren(h('div', { class: 'tl-left' }, h('div', { class: 'tl-split' }, speedBtn, playBtn), restartBtn), timeEl, h('div', { class: 'tl-jumps' }, ffBtn), histBtn, pinBtn);
  tooltipFor(playBtn, 'Play / pause · Space', 'top');
  tooltipFor(restartBtn, 'Restart this patient', 'top');
  function menuBtn(label, fn) { const b = h('button', { class: 'menu-item' }, label); b.addEventListener('click', () => { closePopover(); fn(); }); return b; }

  // ── Recording ─────────────────────────────────────
  // Entries stay in true time order (events that happen during a jump sit inside it).
  function sortEntries() {
    const curId = cursor >= 0 ? entries[cursor]?.id : null;
    entries.sort(byTime);
    if (curId != null) { cursor = -1; for (let i = 0; i < entries.length; i++) if (entries[i].id === curId) { cursor = i; break; } }
  }
  async function snapInto(e) {
    const g = tlGen;
    let snap;
    // B4: an engine that is slow or stopped leaves the entry without a snapshot; it says so ("can't go back here") instead of being skipped by Undo unseen.
    try { ({ snap } = await host.request('snapshot')); } catch { snap = null; }
    if (g !== tlGen) return;   // (a reset came meanwhile: this entry is not in the history any more)
    if (!snap) { e.snapFailed = true; render(true); for (const fn of listeners) fn(); return; }
    e.snapFailed = false;
    e.snap = snap; e.t = snap.t; e.day = snap.day;
    const f = frameNow();
    if (f) e.frame = captureFrame(f, snap.params);
    sortEntries();
    render(true);
    // (The History card repaints too: the row now has its day and its go-back and compare buttons, review #22.)
    for (const fn of listeners) fn();
  }
  function truncateFuture() {
    if (cursor < 0) return;
    entries = entries.slice(0, cursor + 1);
    cursor = -1;
  }
  function push(e) {
    truncateFuture();
    e.id = ++seq;
    const f = frameNow();
    if (e.t == null) { e.t = f?.t ?? 0; e.day = f?.day ?? 0; }
    entries.push(e);
    if (entries.length > 300) entries.splice(1, 1);
    for (const fn of listeners) fn();
    render();
    return e;
  }
  function reset(label) {
    if (pending) clearTimeout(pending.timer);
    tlGen++;
    entries = []; cursor = -1; pending = null; lastEv = {};
    const e = push({ kind: 'start', label: label || scenarioLabel() });
    baseline = structuredClone(store.get().params);
    snapInto(e);
  }
  /** A change made by the learner (debounced so a slider drag is one marker). */
  const PENDING = { label: '', timer: 0 };
  function noteParamChange(label) {
    // (One kept record, written in place: a slider drag asks for this on every step.)
    if (pending) clearTimeout(pending.timer); else { pending = PENDING; PENDING.label = ''; }
    pending.label = pending.label || label;
    const mine = ++editSeq;
    pending.timer = setTimeout(() => { if (pending && mine === editSeq) flushParams(); }, 650);
  }
  function flushParams() {
    if (!pending) return;
    const fallback = pending.label;
    clearTimeout(pending.timer);
    pending = null;
    const p = store.get().params;
    const before = labelsOf(baseline || p), after = labelsOf(p);
    const parts = [];
    for (const [k, l] of after) if (before.get(k) !== l) parts.push(l);
    for (const [k, l] of before) if (!after.has(k)) parts.push(removedLabel(k, l));
    baseline = structuredClone(p);
    const e = push({ kind: 'change', label: parts.length ? parts.slice(0, 3).join(' · ') + (parts.length > 3 ? ` · +${parts.length - 3} more` : '') : fallback || 'Change', keys: [...after.keys()].filter((k) => before.get(k) !== after.get(k)) });
    snapInto(e);
  }
  /** An engine action (band, fluids, paracentesis…). */
  function recordAction(label) {
    flushParams();
    const e = push({ kind: 'change', label, action: true });
    later(() => snapInto(e), 80);
  }
  function addEvents(evs) {
    for (const ev of evs) {
      const now = performance.now();
      if (lastEv[ev.id] && now - lastEv[ev.id] < 30000 && ev.severity !== 'critical') continue;
      lastEv[ev.id] = now;
      push({ kind: 'event', label: ev.title, detail: ev.detail, sev: ev.severity, t: ev.t, day: ev.day, evId: ev.id });
      sortEntries();
      announce(`${ev.title}. ${ev.detail || ''}`);
    }
  }
  async function jump(days, long) {
    flushParams();
    const f = frameNow();
    const d0 = f?.day ?? 0;
    onJump(days);
    jumping = true;
    const mine = ++jumpSeq;   // (a newer jump takes the count over: this one's frames stop, so two counts never draw over each other)
    const t0 = performance.now();
    const dayNum = (u) => Math.round(d0 + days * (1 - (1 - u) ** 3));
    const dayOf = (u) => `Day ${dayNum(u)}`;   // alloc-rare: at a jump's start and end and when the counted day changes, not each frame
    let shownN = dayNum(0);
    const gpu = days !== 'event' && dayStart(shownDay = dayOf(0), dayOf(1));
    // (Where the count cannot be drawn on the GPU, its glyphs not loaded yet, the clock takes its last day here, in the task that
    // starts the jump: no frame writes its words. 2 Nov 2026, "Move everything to GPU".)
    if (!gpu && dayGL && timeEl.classList.contains('tl-gpu')) { timeEl.classList.remove('tl-gpu'); dayGL.clear(); }   // (an older count still drawn: the clock takes over from it)
    if (!gpu && days !== 'event') timeLong.textContent = timeShort.textContent = dayOf(1);
    const tick = (now) => {
      if (mine !== jumpSeq) return;
      const u = clamp((now - t0) / 900, 0, 1);
      // (Drawn again only when the day shown changes: most frames of the count keep it.)
      const dn = dayNum(u);
      if (gpu && dn !== shownN) { shownN = dn; const t = dayOf(u); shownDay = t; setPolys(dayPath, dayPolys(t)); dayGL.paint(); }
      if (u < 1) nextFrame(tick);
      else if (gpu) { dayEnd = dayTok; restPass(dayLand); }
      else jumping = false;
    };
    nextFrame(tick);
    const e = push({ kind: 'jump', label: days === 'event' ? 'Ran until the next event' : `+${long}` });
    later(() => snapInto(e), 120);
  }

  // ── Revert / redo ─────────────────────────────────
  const restorable = (i) => entries[i] && entries[i].kind !== 'event' && entries[i].snap;
  const liveIndex = () => { for (let i = entries.length - 1; i >= 0; i--) if (restorable(i)) return i; return -1; };
  const currentIndex = () => (cursor >= 0 ? cursor : liveIndex());
  function goTo(i, { quiet = false } = {}) {
    const e = entries[i];
    if (!e?.snap) return false;
    flushParams();
    host.send({ type: 'restore', snap: e.snap });
    replaceParams(structuredClone(e.snap.params));
    baseline = structuredClone(e.snap.params);
    cursor = i === liveIndex() && !entries.slice(i + 1).length ? -1 : i;
    store.set({ lastHVPG: null });
    if (!quiet) toast(`Back to: ${e.label}`);
    for (const fn of listeners) fn();
    render();
    return true;
  }
  /** Whether there is an earlier moment to go back to (and going back is allowed here). */
  function canUndo() {
    if (pending) return liveIndex() >= 0;   // (a change still being typed in becomes an entry when Undo flushes it)
    for (let i = currentIndex() - 1; i >= 0; i--) if (restorable(i)) return true;
    return false;
  }
  /** The label of the change Undo would take back (the newest change at or before now), or null. */
  function lastChangeLabel() {
    if (pending) return pending.label || null;
    for (let i = currentIndex(); i > 0; i--) if (entries[i]?.kind === 'change') return entries[i].label;
    return null;
  }
  function undo() {
    flushParams();
    const cur = currentIndex();
    for (let i = cur - 1; i >= 0; i--) if (restorable(i)) return goTo(i) && entries[i].label;
    toast('Nothing to undo.');
    return false;
  }
  function redo() {
    if (cursor < 0) { toast('Nothing to redo.'); return false; }
    for (let i = cursor + 1; i < entries.length; i++) if (restorable(i)) { goTo(i); if (i === liveIndex()) cursor = -1; render(); return entries[i].label; }
    return false;
  }

  // ── Pin A ─────────────────────────────────────────
  function pinFrom(snapLike, label, when) {
    store.set({ compareSnap: { ...snapLike, label, when, changes: activeInterventions(snapLike.params).map((a) => a.label) }, compareView: 'B' });
  }
  function togglePin() {
    if (store.get().compareSnap) { store.set({ compareSnap: null, compareView: 'B' }); toast('Stopped comparing.'); return; }
    const f = frameNow();
    if (!f) return;
    pinFrom(captureFrame(f, store.get().params), scenarioLabel(), fmtClock(f.t, f.day));
    toast(`Comparing with ${fmtClock(f.t, f.day)}. Change something, then switch between then and now.`);
  }

  // ── Rendering ─────────────────────────────────────
  // The History count follows the entries, so a light check runs at most once a second.
  let lastRenderLen = -1, lastRenderCur = -2, lastRenderAt = 0;
  function render(force) {
    const t = performance.now();
    if (!force && entries.length === lastRenderLen && cursor === lastRenderCur && t - lastRenderAt < 1000) return;
    lastRenderLen = entries.length; lastRenderCur = cursor; lastRenderAt = t;
    let n = 0;
    for (let i = 0; i < entries.length; i++) if (entries[i].kind !== 'start') n++;
    textSoon(histCount, n ? String(n) : '');   // alloc-rare: at most once a second and when the history changes
  }
  // The history rows, shared by the phone sheet and the History card on larger screens.
  function historyRows() {
    const items = entries.map((_, i) => i);
    return items.length > 1 ? markerRows(items)
      : [h('p', { class: 'tl-pop-empty' }, h('b', {}, 'Nothing has happened yet.'), ' Change something on the figure, or jump ahead in time.')];
  }
  function historyBody() { return h('div', { class: 'tl-pop tl-history' }, historyRows()); }
  function openHistory(anchor) {
    popover(anchor, h('div', { class: 'tl-pop tl-history' }, historyRows()), { place: 'above', align: 'end' });
  }
  function markerRows(items) {
    return items.slice().reverse().map((i) => {
      const e = entries[i];
      const acts = [];
      const act = (label, ic, col, fn) => acts.push(h('button', { class: 'tl-pop-ic', style: { gridColumn: col }, title: label, 'aria-label': label, onclick: fn }, ic));
      if (e.snap) act(i === liveIndex() && cursor < 0 ? 'Back to this moment' : 'Go back here', svgIcon('rewind', 'mi-ic'), 1, () => { closePopover(); goTo(i); });
      if (e.frame) act('Compare with now', svgIcon('camera', 'mi-ic'), 2, () => { closePopover(); pinFrom(e.frame, e.label, fmtClock(e.t, e.day)); toast(`Comparing with ${fmtClock(e.t, e.day)}: ${e.label}.`); });
      const future = cursor >= 0 && i > cursor;
      // (key and sig: the History card updates its list in place, main.js reconcile.)
      return h('div', { class: `tl-pop-row${future ? ' future' : ''}`, 'data-row': `${e.t}|${e.day || 0}|${e.kind}|${e.label}`, 'data-sig': `${future}|${acts.map((b) => b.title).join(',')}|${e.detail || ''}|${e.snapFailed && !e.snap ? 'nogo' : ''}` },
        h('div', { class: 'tl-pop-head' }, h('i', { class: `tl-dot ${e.kind}`, style: { background: e.kind === 'event' ? SEV[e.sev] || SEV.info : '' } }), h('b', {}, e.kind === 'start' ? `Patient: ${e.label}` : e.label), h('span', { class: 'when' }, e.kind === 'start' ? 'Start' : fmtClock(e.t, e.day)), h('span', { class: 'tl-pop-acts' }, acts)),
        e.detail ? h('div', { class: 'tl-pop-d' }, e.detail) : null,
        e.snapFailed && !e.snap ? h('div', { class: 'tl-pop-d tl-nogo' }, 'Can’t go back here: the model did not save this moment.') : null);
    });
  }
  let lastTime = '', lastRun = null, lastRunMode = null, lastSpeed = null, lastIcon = 'pause';
  function update(f) {
    if (!jumping) {
      const t = fmtClock(f.t, f.day);
      if (t !== lastTime) { lastTime = t; putText(timeLong, t); putText(timeShort, f.day > 0 ? `Day ${f.day}` : t); }
    }
    if (f.running !== lastRun) { lastRun = f.running; playBtn.setAttribute('aria-label', f.running ? 'Pause' : 'Play'); }
    const st = store.get(), lp = st.lapse || 0, sp = lp ? `L${lp}` : st.speed;
    if (sp !== lastSpeed || f.running !== lastRunMode) {
      lastSpeed = sp; lastRunMode = f.running;
      const lap = LAPSES.find((l) => l[0] === lp);
      speedBtn.textContent = lp ? (lap ? lap[1] : `${lp} d/s`) : `${st.speed}×`;
      speedBtn.setAttribute('aria-label', `Playback speed, ${speedBtn.textContent}`);
      for (const el of [playBtn, speedBtn, playBtn.parentElement]) el?.classList.toggle('lapse', !!lp);
      // A new icon grows in from the old one's place (.18 s) rather than swapping in one frame (motion review P14); with
      // Reduce Motion it only fades. The old icon stays in the same grid cell and fades out under it, so the button is never
      // empty for a frame (round 2 review, RF7).
      const ic = f.running ? 'pause' : (lp ? 'playlapse' : 'play');
      if (ic !== lastIcon) {
        lastIcon = ic;
        const nu = icon(ic), still = reduceMotionMQ.matches;
        const old = [...playBtn.children];
        if (!nu.animate || !playBtn.isConnected) playBtn.replaceChildren(nu);
        else {
          playBtn.append(nu);
          for (const o of old) {
            if (o.dataset.going) continue;
            o.dataset.going = '1';
            const a = o.animate(still ? [{ opacity: 0 }] : [{ opacity: 0, transform: 'scale(.6)' }], { duration: D_FLIP, easing: EASE_IN, fill: 'forwards' });
            a.finished.then(() => o.remove(), () => o.remove());
          }
          nu.animate(still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: D_SMALL, easing: EASE_ARRIVE });
        }
      }
      playBtn.title = lp ? 'Play / pause (Space): time-lapse' : 'Play / pause (Space)';
    }
    render();
  }
  store.on('compareSnap', (s) => {
    attrSoon(pinBtn, 'aria-pressed', s ? 'true' : 'false');   // (between frames: a compare can be asked from a model frame's change)
    swapText(pinBtn.querySelector('span'), s ? 'Stop' : 'Compare');   // (the word crossfades; it popped)
    attrSoon(pinBtn, 'aria-label', s ? 'Stop comparing' : 'Compare from here');
  });
  onParamChange(({ label, history }) => { if (history || pending) noteParamChange(label); });

  return {
    reset, recordAction, addEvents, update, undo, canUndo, lastChangeLabel, redo, goTo, togglePin, jump, openHistory, historyBody,
    entries: () => entries, cursor: () => cursor,
    onChange: (fn) => listeners.push(fn),
    save: () => ({ entries: entries.slice(), cursor, baseline: structuredClone(baseline) }),
    load: (s) => { entries = s.entries; cursor = s.cursor; baseline = s.baseline; lastRenderLen = -1; render(true); for (const fn of listeners) fn(); },
    flush: flushParams,
  };
}
