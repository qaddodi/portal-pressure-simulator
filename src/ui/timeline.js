// The timeline: time, history, events and comparison on one strip under the figure. It is the
// one place for what has happened: the latest event is named beside the clock, and History lists
// every change and event (it replaces the chart's old Story section).
//
//  ▶ ↺ 1×  |●──◆────◆──●──────◆───●|  Day 142 · 0:14  ● Large varices  [+1 wk][+1 mo][+6 mo] ⋯  History 5  Compare
//
// Every change the learner makes is a marker (◆) carrying a full snapshot of the model; clicking
// one goes back to that moment (the model, its clock and its remodeling), and later markers stay
// ahead, faded, until something new happens. Threshold events (▲) are markers too, with their
// detail and a Why?. Jumps (+1 wk / +1 mo / +6 mo) advance the disease clock in one step. "Compare
// from here" freezes the current moment as A for comparison. It replaces play/speed, the Seconds/Months
// switch, undo/redo/reset, the Findings list, the Log instrument and Compare mode.

import { store, replaceParams, onParamChange } from './store.js?v=f469aaac6e';
import { host } from './host.js?v=5e48797f55';
import { h, toast, announce, icon, svgIcon, popover, closePopover, tooltipFor, clamp } from './util.js?v=86153645a3';
import { activeInterventions } from './inspector.js?v=5796f2885b';

const SEV = { critical: 'var(--critical)', danger: 'var(--danger)', caution: 'var(--caution)', info: 'var(--info)', ok: 'var(--ok)' };
export const EVENT_WHY = { VARIX_RUPTURE: 'varix', RED_WALE: 'varix', VARIX_LARGE: 'varix', HEPATOFUGAL_PV: 'pvFlow', PV_STASIS: 'pvFlow', CSPH: 'hvpg', BLEED_RISK: 'hvpg', ASCITES_FORMING: 'ascites', TENSE_ASCITES: 'ascites', HIGH_SHUNT: 'shunt', LIVER_HYPOPERFUSION: 'liverPerf', RA_HIGH: 'ra', HYPERDYNAMIC: 'co', SPLENOMEGALY: 'spleen' };
/** One-to-two-word tags shown beside each event marker on the strip (full title stays in the tooltip and History). */
export const EVENT_TAG = { HEPATOFUGAL_PV: 'PV Reversed', SV_REVERSAL: 'SV Reversed', SMV_REVERSAL: 'SMV Reversed', INTRAHEPATIC_REVERSAL: 'IHPV Reversed', PV_STASIS: 'PV Stasis', CSPH: 'CSPH', BLEED_RISK: 'HVPG ≥ 12', VARIX_LARGE: 'Large Varices', RED_WALE: 'Red Wale', VARIX_RUPTURE: 'Varix Rupture', BLEED_STOPPED: 'Bleed Stopped', ASCITES_FORMING: 'Ascites', TENSE_ASCITES: 'Tense Ascites', HYPERDYNAMIC: 'Hyperdynamic', HIGH_SHUNT: 'High Shunt', LIVER_HYPOPERFUSION: 'Liver Hypoperf.', CAUDATE: 'Caudate Spared', RA_HIGH: 'High RAP', SPLENOMEGALY: 'Splenomegaly', SHOCK_2: 'Shock II', SHOCK_3: 'Shock III' };
export const eventTag = (id) => EVENT_TAG[id] || (id?.startsWith('COLL_') ? 'Collat. Recruited' : '');
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
const JUMPS = [[7, '+1 wk', '1 week'], [30, '+1 mo', '1 month'], [180, '+6 mo', '6 months']];

/** A frozen, self-contained copy of a frame (for pinning A and for markers). */
function captureFrame(f, params) {
  return {
    P: Array.from(f.P), metrics: structuredClone(f.metrics), params: structuredClone(params),
    frame: { ...f, P: Array.from(f.P), Pf: f.Pf ? Array.from(f.Pf) : undefined, Q: Array.from(f.Q), Qf: f.Qf ? Array.from(f.Qf) : undefined, D: Array.from(f.D),
      ext: Array.from(f.ext), slow: structuredClone(f.slow), metrics: structuredClone(f.metrics), bleed: structuredClone(f.bleed), events: [], samples: null, params: undefined, viewParams: structuredClone(params) },
  };
}
export const fmtClock = (t, day) => {
  const s = Math.max(0, Math.floor(t)), m = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0');
  const tt = m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  return day > 0 ? `Day ${day} · ${tt}` : tt;
};

export function createTimeline({ root, onWhy, onPlay, onSpeed, onJump, onRestart, canRevert, scenarioLabel }) {
  let entries = [], cursor = -1, seq = 0, baseline = null, pending = null, lastEv = {};
  const listeners = [];
  const absT = (e) => e.day * 86400 + e.t;
  const frameNow = () => store.get().frame;
  const labelsOf = (p) => new Map(activeInterventions(p).map((a) => [a.key, a.label]));

  // ── DOM ───────────────────────────────────────────
  const playBtn = h('button', { class: 'ib play', 'aria-label': 'Pause', title: 'Play / pause (Space)' }, icon('pause'));
  // Click toggles play/pause; press and hold opens the speed menu.
  let holdTimer = 0, held = false;
  const openSpeed = () => popover(speedBtn, [
    h('div', { class: 'menu-title' }, 'Playback speed'),
    ...SPEEDS.map((v) => { const it = menuBtn(`${v}×`, () => onSpeed(v)); it.setAttribute('aria-pressed', String(store.get().speed === v)); return it; }),
  ], { place: 'above', align: 'start', cls: 'time-pop' });
  playBtn.addEventListener('pointerdown', () => { held = false; clearTimeout(holdTimer); holdTimer = setTimeout(() => { held = true; openSpeed(); }, 450); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) playBtn.addEventListener(ev, () => clearTimeout(holdTimer));
  playBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  playBtn.addEventListener('click', () => { if (held) { held = false; return; } onPlay(); });
  // Restart: the same patient from its first moment, every change and the clock cleared.
  const restartBtn = h('button', { class: 'ib tl-restart', 'aria-label': 'Restart this patient' }, icon('reset'));
  restartBtn.addEventListener('click', () => onRestart?.());
  const speedBtn = h('button', { class: 'tl-speed', 'aria-haspopup': 'menu', title: 'Playback speed', 'aria-label': 'Playback speed' }, '1×');
  speedBtn.addEventListener('click', () => openSpeed());
  const rail = h('div', { class: 'tl-rail' });
  const fill = h('div', { class: 'tl-fill' });
  const bleedBand = h('div', { class: 'tl-bleed', hidden: true });
  const marks = h('div', { class: 'tl-marks', role: 'list', 'aria-label': 'Changes and events' });
  const nowEl = h('div', { class: 'tl-now', 'aria-hidden': 'true' });
  const core = h('div', { class: 'tl-core' }, rail, bleedBand, fill, marks, nowEl);
  const tagsSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  tagsSvg.setAttribute('class', 'tl-tags'); tagsSvg.setAttribute('aria-hidden', 'true');
  const track = h('div', { class: 'tl-track' }, tagsSvg, core);
  // The full clock, and a short one (just the day) for a phone's play bar.
  const timeLong = h('span', { class: 'tl-t-long' }, '0:00'), timeShort = h('span', { class: 'tl-t-short', 'aria-hidden': 'true' }, '0:00');
  const timeEl = h('span', { class: 'tl-time', 'aria-live': 'off' }, timeLong, timeShort);
  // The latest event, named beside the clock; a click opens it like its marker.
  const latestEl = h('button', { class: 'tl-latest', hidden: true });
  latestEl.addEventListener('click', (e) => { const i = latestEventIndex(); if (i >= 0) openMarker(e.currentTarget, [i]); });
  const histCount = h('span', { class: 'tl-hc' });
  const histBtn = h('button', { class: 'tl-hist', 'aria-haspopup': 'dialog', title: 'History: every change and event, with a way back to each' }, svgIcon('menu', 'mi-ic'), h('span', { class: 'tl-hl' }, 'History'), histCount);
  histBtn.addEventListener('click', (e) => openHistory(e.currentTarget));
  // The latest event sits in the dock's status row (with the bleed), above the play bar, on every screen.
  (document.getElementById('vdStatus') || root).append(latestEl);
  const ffBtn = h('button', { class: 'ib tl-ff', 'aria-label': 'Jump ahead', 'aria-haspopup': 'menu', title: 'Fast forward' }, icon('ffwd'));
  ffBtn.addEventListener('click', (e) => popover(e.currentTarget, [
    h('div', { class: 'menu-title' }, 'Jump ahead'),
    ...JUMPS.map(([d, , long]) => menuBtn(`Jump ${long} ahead`, () => jump(d, long))),
    menuBtn('Until something happens', () => jump('event', 'until the next event')),
    menuBtn('Settle to equilibrium', () => { host.send({ type: 'settle' }); toast('Settled to equilibrium.'); }),
    (() => { const it = menuBtn(store.get().compareSnap ? 'Stop comparing' : 'Compare from here', () => togglePin()); it.classList.add('tl-phone-only'); return it; })(),
  ], { place: 'above', align: 'end', cls: 'time-pop' }));
  const pinBtn = h('button', { class: 'tl-pin', 'aria-pressed': 'false', 'aria-label': 'Compare from here', title: 'Freeze this moment and compare the live model with it (P)' }, svgIcon('compare', 'mi-ic'), h('span', {}, 'Compare'));
  // Restart lives in More; the jumps share one segmented control.
  pinBtn.addEventListener('click', () => togglePin());
  root.replaceChildren(h('div', { class: 'tl-left' }, h('div', { class: 'tl-split' }, speedBtn, playBtn), restartBtn), track, timeEl, h('div', { class: 'tl-jumps' }, ffBtn), histBtn, pinBtn);
  tooltipFor(playBtn, 'Play / pause · Space', 'top');
  tooltipFor(restartBtn, 'Restart this patient', 'top');
  function menuBtn(label, fn) { const b = h('button', { class: 'menu-item' }, label); b.addEventListener('click', () => { closePopover(); fn(); }); return b; }

  // ── Recording ─────────────────────────────────────
  // Entries stay in true time order (events that happen during a jump sit inside it).
  function sortEntries() {
    const curId = cursor >= 0 ? entries[cursor]?.id : null;
    entries.sort((a, b) => absT(a) - absT(b) || a.id - b.id);
    if (curId != null) cursor = entries.findIndex((e) => e.id === curId);
  }
  async function snapInto(e) {
    const { snap } = await host.request('snapshot');
    e.snap = snap; e.t = snap.t; e.day = snap.day;
    const f = frameNow();
    if (f) e.frame = captureFrame(f, snap.params);
    sortEntries();
    render(true);
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
    entries = []; cursor = -1; pending = null; lastEv = {};
    const e = push({ kind: 'start', label: label || scenarioLabel() });
    baseline = structuredClone(store.get().params);
    snapInto(e);
  }
  /** A change made by the learner (debounced so a slider drag is one marker). */
  function noteParamChange(label) {
    clearTimeout(pending?.timer);
    pending = { label: pending?.label || label, timer: setTimeout(flushParams, 650) };
  }
  function flushParams() {
    if (!pending) return;
    const fallback = pending.label;
    pending = null;
    const p = store.get().params;
    const before = labelsOf(baseline || p), after = labelsOf(p);
    const parts = [];
    for (const [k, l] of after) if (before.get(k) !== l) parts.push(l);
    for (const [k, l] of before) if (!after.has(k)) parts.push(`No ${l.replace(/ \d.*$/, '').toLowerCase()}`);
    baseline = structuredClone(p);
    const e = push({ kind: 'change', label: parts.length ? parts.slice(0, 3).join(' · ') + (parts.length > 3 ? ` · +${parts.length - 3}` : '') : fallback || 'Change', keys: [...after.keys()].filter((k) => before.get(k) !== after.get(k)) });
    snapInto(e);
  }
  /** An engine action (band, fluids, paracentesis…). */
  function recordAction(label) {
    flushParams();
    const e = push({ kind: 'change', label, action: true });
    setTimeout(() => snapInto(e), 80);
  }
  function addEvents(evs) {
    for (const ev of evs) {
      const now = performance.now();
      if (lastEv[ev.id] && now - lastEv[ev.id] < 30000 && ev.severity !== 'critical') continue;
      lastEv[ev.id] = now;
      push({ kind: 'event', label: ev.title, detail: ev.detail, sev: ev.severity, why: EVENT_WHY[ev.id] || (ev.id.startsWith('COLL_') ? 'shunt' : null), t: ev.t, day: ev.day, evId: ev.id });
      sortEntries();
      announce(`${ev.title}. ${ev.detail || ''}`);
      pulseLatest();
    }
  }
  async function jump(days, long) {
    flushParams();
    const f = frameNow();
    const d0 = f?.day ?? 0;
    onJump(days);
    track.classList.add('ff');
    const t0 = performance.now();
    const tick = (now) => {
      const u = clamp((now - t0) / 900, 0, 1);
      if (days !== 'event') timeLong.textContent = timeShort.textContent = `Day ${Math.round(d0 + days * (1 - (1 - u) ** 3))}`;
      if (u < 1) requestAnimationFrame(tick); else track.classList.remove('ff');
    };
    requestAnimationFrame(tick);
    const e = push({ kind: 'jump', label: days === 'event' ? 'Ran until the next event' : `+${long}` });
    setTimeout(() => snapInto(e), 120);
  }

  // ── Revert / redo ─────────────────────────────────
  const restorable = (i) => entries[i] && entries[i].kind !== 'event' && entries[i].snap;
  const liveIndex = () => { for (let i = entries.length - 1; i >= 0; i--) if (restorable(i)) return i; return -1; };
  const currentIndex = () => (cursor >= 0 ? cursor : liveIndex());
  function goTo(i, { quiet = false } = {}) {
    const e = entries[i];
    if (!e?.snap) return false;
    if (!canRevert()) { toast('Going back in time is off during a case.'); return false; }
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
  function positions(W) {
    // A story axis: each gap grows with the log of the time between markers, so seconds and
    // months both stay readable on one strip.
    const xs = [0];
    for (let i = 1; i < entries.length; i++) xs.push(xs[i - 1] + 1 + Math.log10(1 + Math.max(0, absT(entries[i]) - absT(entries[i - 1])) / 6));
    const f = frameNow();
    const last = entries[entries.length - 1];
    const nowAbs = f ? f.day * 86400 + f.t : last ? absT(last) : 0;
    const liveX = xs[xs.length - 1] + 0.6 + Math.log10(1 + Math.max(0, nowAbs - (last ? absT(last) : 0)) / 6);
    const total = Math.max(liveX, 8);
    const pad = 10;
    const px = (x) => pad + (x / total) * (W - 2 * pad);
    let nowX;
    if (cursor >= 0) {
      const c = entries[cursor];
      nowX = xs[cursor] + Math.min(0.9, Math.log10(1 + Math.max(0, nowAbs - absT(c)) / 6));
    } else nowX = liveX;
    return { at: xs.map(px), now: px(nowX) };
  }
  // Track width is cached (reading it after the frame's DOM writes would force a layout). The
  // playhead moves every frame; the markers, which only drift slowly on the story axis, are
  // rebuilt when the timeline's contents change, or at most once a second as time passes.
  let trackW = 0;
  new ResizeObserver(() => { trackW = track.clientWidth; render(true); }).observe(track);
  let lastRenderKey = '', lastMarksAt = 0, lastNow = -1;
  function render(force) {
    const W = trackW || (trackW = track.clientWidth);
    if (!W) return;
    const { at, now } = positions(W);
    const rn = Math.round(now);
    if (rn !== lastNow) { lastNow = rn; fill.style.width = `${rn}px`; nowEl.style.left = `${rn}px`; }
    const key = `${entries.length}|${cursor}|${W}|${entries.map((e) => (e.snap ? 1 : 0)).join('')}`;
    const t = performance.now();
    if (!force && key === lastRenderKey && t - lastMarksAt < 1000) return;
    lastRenderKey = key; lastMarksAt = t;
    paintLatest();
    // Group markers that would overlap into one, with a count.
    const groups = [];
    entries.forEach((e, i) => {
      const lane = e.kind === 'event' ? 'ev' : 'ch';
      const g = groups.findLast?.((x) => x.lane === lane) || [...groups].reverse().find((x) => x.lane === lane);
      if (g && at[i] - g.x < 11) { g.items.push(i); g.x = (g.x * (g.items.length - 1) + at[i]) / g.items.length; }
      else groups.push({ lane, x: at[i], items: [i] });
    });
    // Events alternate above/below the line, whichever side has more room.
    const lastSide = { up: -1e9, down: -1e9 };
    for (const g of groups) {
      if (g.lane !== 'ev') continue;
      g.side = g.x - lastSide.up >= g.x - lastSide.down ? 'up' : 'down';
      lastSide[g.side] = g.x;
    }
    const cur = currentIndex();
    marks.replaceChildren(...groups.map((g) => {
      const es = g.items.map((i) => entries[i]);
      const top = es[es.length - 1];
      const future = cursor >= 0 && g.items[0] > cursor;
      const isCur = g.items.includes(cur) && g.lane === 'ch';
      const sev = g.lane === 'ev' ? es.reduce((a, e) => (['info', 'caution', 'danger', 'critical'].indexOf(e.sev) > ['info', 'caution', 'danger', 'critical'].indexOf(a) ? e.sev : a), 'info') : null;
      const b = h('button', { class: `tl-m ${g.lane === 'ev' ? 'ev' : top.kind}${g.side === 'down' ? ' below' : ''}${future ? ' future' : ''}${isCur && cursor >= 0 ? ' cur' : ''}`, role: 'listitem', style: { left: `${g.x}px`, '--sev': sev ? SEV[sev] : '' },
        'aria-label': es.map((e) => `${e.kind === 'event' ? 'Event' : e.kind === 'start' ? 'Start' : 'Change'} at ${fmtClock(e.t, e.day)}: ${e.label}`).join('; ') },
      g.items.length > 1 ? h('span', { class: 'tl-count' }, String(g.items.length)) : null);
      if (!(g.items.length === 1 && top.kind === 'start')) tooltipFor(b, () => (es.length === 1 ? `${fmtClock(top.t, top.day)} · ${top.label}` : `${es.length} ${g.lane === 'ev' ? 'events' : 'changes'} · latest: ${top.label}`), 'top');
      if (g.items.length === 1 && top.kind === 'start') {
        b.title = 'Restart this patient';
        b.addEventListener('click', (ev) => popover(ev.currentTarget, [menuBtn('Restart this patient', () => onRestart?.())], { place: 'above', align: 'start', cls: 'time-pop' }));
      } else b.addEventListener('click', (ev) => openMarker(ev.currentTarget, g.items));
      return b;
    }));
    paintTags(groups, W);
  }

  // One label per event type and side, joined to every one of its markers by right-angle leaders:
  // a stem from each marker out to a shared bus, with the name at the end of the bus. Rows are
  // stacked outward; a label is placed in the first row where it, and the stems that pass
  // through, touch nothing else. Anything that finds no room keeps its tooltip only.
  const SVGNS = 'http://www.w3.org/2000/svg', ROW = 13, CORE = 44, MAXROWS = 4, GAP = 110;
  const svgEl = (n, a, t) => { const e = document.createElementNS(SVGNS, n); for (const k in a) e.setAttribute(k, a[k]); if (t != null) e.textContent = t; return e; };
  const shortLabel = (l) => { const t = String(l).replace(/^Ran until the next event$/, 'Ran to event').split(' · ')[0]; return t.length > 15 ? `${t.slice(0, 14)}…` : t; };
  const dockExpanded = () => !!root.closest('.vdock')?.querySelector('.readouts.all');
  addEventListener('resize', () => render(true));
  function paintTags(groups, W) {
    if (!dockExpanded()) { core.style.top = ''; track.style.height = ''; tagsSvg.replaceChildren(); return; }
    const bySide = { up: new Map(), down: new Map() };
    for (const g of groups) {
      const top = entries[g.items[g.items.length - 1]];
      if (g.lane !== 'ev') {
        // The learner's own moments (changes, jumps) get a short neutral label under the line.
        if (top.kind === 'start') continue;
        const tag = shortLabel(top.label);
        const k = `C:${tag}`;
        if (!bySide.down.has(k)) bySide.down.set(k, { tag, sev: null, xs: [], y0: 31, mine: true });
        bySide.down.get(k).xs.push(g.x);
        continue;
      }
      const tag = eventTag(top.evId);
      if (!tag) continue;
      const m = bySide[g.side === 'down' ? 'down' : 'up'];
      const k = top.evId.startsWith('COLL_') ? 'COLL' : top.evId;
      if (!m.has(k)) m.set(k, { tag, sev: top.sev, xs: [] });
      m.get(k).xs.push(g.x);
    }
    // Occurrences far apart on the strip are separate stories: each gets its own label.
    for (const side of ['up', 'down']) {
      const split = [];
      for (const t of bySide[side].values()) {
        const xs = t.xs.slice().sort((a, b) => a - b);
        let cur = [xs[0]];
        const out = [];
        for (let i = 1; i < xs.length; i++) { if (xs[i] - xs[i - 1] > GAP) { out.push(cur); cur = []; } cur.push(xs[i]); }
        out.push(cur);
        for (const c of out) split.push({ ...t, xs: c });
      }
      bySide[side] = new Map(split.map((t, i) => [i, t]));
    }
    const placed = { up: [], down: [] };
    for (const side of ['up', 'down']) {
      const rows = Array.from({ length: MAXROWS }, () => []), stems = Array.from({ length: MAXROWS }, () => []);
      const list = [...bySide[side].values()].sort((a, b) => Math.min(...a.xs) - Math.min(...b.xs));
      for (const t of list) {
        const x0 = Math.min(...t.xs), x1 = Math.max(...t.xs), w = t.tag.length * 5.7 + 4;
        // The name goes after the bus, before it, or (on a long bus) in a gap in its middle.
        const modes = [['right', x0 - 5, x1 + 5 + w], ['left', x0 - 5 - w, x1 + 4]];
        if (x1 - x0 >= w + 16) modes.push(['mid', x0 - 3, x1 + 3]);
        const hit = (a, b, c, d) => a < d + 4 && c < b + 4;
        let done = false;
        for (let r = 0; r < MAXROWS && !done; r++) {
          for (const [mode, lo, hi] of modes) {
            if (lo < 0 || hi > W + 2) continue;
            const ok = !rows[r].some(([a, b]) => hit(lo, hi, a, b))
              && !rows.slice(0, r).some((iv) => iv.some(([a, b]) => t.xs.some((x) => x > a - 3 && x < b + 3)))
              && !stems.slice(r + 1).some((xs) => xs.some((x) => x > lo - 3 && x < hi + 3));
            if (!ok) continue;
            rows[r].push([lo, hi]); stems[r].push(...t.xs);
            placed[side].push({ ...t, r, x0, x1, mode, w });
            done = true;
            break;
          }
        }
      }
    }
    const nUp = Math.max(0, ...placed.up.map((t) => t.r + 1)), nDown = Math.max(0, ...placed.down.map((t) => t.r + 1));
    const padT = nUp ? nUp * ROW + 4 : 0, padB = nDown ? nDown * ROW + 4 : 0;
    core.style.top = `${padT}px`;
    track.style.height = `${padT + CORE + padB}px`;
    const parts = [];
    for (const side of ['up', 'down']) {
      for (const t of placed[side]) {
        const up = side === 'up';
        const y = up ? padT - 4 - t.r * ROW : padT + CORE + 4 + t.r * ROW;
        const yStart = up ? padT + 1 : t.y0 ? padT + t.y0 : padT + CORE - 1;
        const col = t.mine ? 'var(--text-2)' : SEV[t.sev] || SEV.info;
        const g = svgEl('g', { class: `tl-lead${t.mine ? ' mine' : ''}`, style: `--sev:${col}` });
        const cx = (t.x0 + t.x1) / 2, hw = t.w / 2 + 2;
        const bus = t.mode === 'mid' ? `M${t.x0} ${y}H${cx - hw}M${cx + hw} ${y}H${t.x1}` : `M${t.x0} ${y}H${t.x1}`;
        g.append(svgEl('path', { d: bus + t.xs.map((x) => `M${x} ${yStart}V${y}`).join('') }));
        const tx = t.mode === 'mid' ? cx : t.mode === 'left' ? t.x0 - 5 : t.x1 + 5;
        g.append(svgEl('text', { x: tx, y: y + 0.5, 'text-anchor': t.mode === 'mid' ? 'middle' : t.mode === 'left' ? 'end' : 'start', 'dominant-baseline': 'middle' }, t.tag));
        parts.push(g);
      }
    }
    tagsSvg.setAttribute('height', String(padT + CORE + padB));
    tagsSvg.replaceChildren(...parts);
  }
  function latestEventIndex() {
    const end = cursor >= 0 ? cursor : entries.length - 1;
    for (let i = end; i >= 0; i--) if (entries[i].kind === 'event') return i;
    return -1;
  }
  let lastLatest = null;
  function paintLatest() {
    const i = latestEventIndex(), e = entries[i];
    const k = e ? `${e.id}` : '';
    if (k !== lastLatest) {
      lastLatest = k;
      latestEl.hidden = !e;
      if (e) {
        latestEl.style.setProperty('--sev', SEV[e.sev] || SEV.info);
        latestEl.replaceChildren(h('i', { class: 'tl-ld', 'aria-hidden': 'true' }), h('span', {}, e.label), h('small', {}, e.kind === 'start' ? '' : fmtClock(e.t, e.day)));
        latestEl.setAttribute('aria-label', `Latest event at ${fmtClock(e.t, e.day)}: ${e.label}`);
        latestEl.title = `${fmtClock(e.t, e.day)} · ${e.label}${e.detail ? `\n${e.detail}` : ''}`;
      }
    }
    const n = entries.filter((x) => x.kind !== 'start').length;
    if (histCount.textContent !== (n ? String(n) : '')) histCount.textContent = n ? String(n) : '';
  }
  function openHistory(anchor) {
    const items = entries.map((_, i) => i);
    const copy = h('button', { class: 'link st-act', title: 'Copy the history as text' }, 'Copy');
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(historyText()); toast('History copied.'); } catch { toast('Copy is not available here.'); } });
    const head = h('div', { class: 'tl-pop-top' }, h('b', {}, 'History'), h('span', { class: 'sp' }), copy);
    const body = items.length > 1 ? markerRows(items)
      : [h('p', { class: 'tl-pop-empty' }, 'Nothing has happened yet. Change something on the figure, or jump ahead in time.')];
    popover(anchor, h('div', { class: 'tl-pop tl-history' }, head, body), { place: 'above', align: 'end' });
  }
  function historyText() {
    return entries.map((e) => `${e.kind === 'start' ? 'Start' : fmtClock(e.t, e.day)}  ${e.kind === 'start' ? 'Patient: ' : ''}${e.label}${e.detail ? ': ' + e.detail : ''}`).join('\n');
  }
  function openMarker(anchor, items) {
    popover(anchor, h('div', { class: 'tl-pop' }, markerRows(items)), { place: 'above', align: 'center' });
  }
  function markerRows(items) {
    return items.slice().reverse().map((i) => {
      const e = entries[i];
      const acts = [];
      if (e.snap && canRevert()) acts.push(h('button', { class: 'btn sm', onclick: () => { closePopover(); goTo(i); } }, icon('undo'), i === liveIndex() && cursor < 0 ? 'Back to this moment' : 'Go back here'));
      if (e.frame) acts.push(h('button', { class: 'btn sm', onclick: () => { closePopover(); pinFrom(e.frame, e.label, fmtClock(e.t, e.day)); toast(`Comparing with ${fmtClock(e.t, e.day)}: ${e.label}.`); } }, svgIcon('camera', 'mi-ic'), 'Compare with now'));
      if (e.why) acts.push(h('button', { class: 'btn sm', onclick: (ev) => onWhy(e.why, ev.currentTarget) }, svgIcon('bulb', 'mi-ic'), 'Why?'));
      const future = cursor >= 0 && i > cursor;
      return h('div', { class: `tl-pop-row${future ? ' future' : ''}` },
        h('div', { class: 'tl-pop-head' }, h('i', { class: `tl-dot ${e.kind}`, style: { background: e.kind === 'event' ? SEV[e.sev] || SEV.info : '' } }), h('b', {}, e.kind === 'start' ? `Patient: ${e.label}` : e.label), h('span', { class: 'when' }, e.kind === 'start' ? 'Start' : fmtClock(e.t, e.day))),
        e.detail ? h('div', { class: 'tl-pop-d' }, e.detail) : null,
        acts.length ? h('div', { class: 'btn-row' }, acts) : null);
    });
  }
  let pulseT = null;
  function pulseLatest() { track.classList.add('pulse'); clearTimeout(pulseT); pulseT = setTimeout(() => track.classList.remove('pulse'), 1400); }

  let lastTime = '', lastRun = null, lastSpeed = null, lastBleed = null;
  function update(f) {
    if (!track.classList.contains('ff')) {
      const t = fmtClock(f.t, f.day);
      if (t !== lastTime) { lastTime = t; timeLong.textContent = t; timeShort.textContent = f.day > 0 ? `Day ${f.day}` : t; }
    }
    if (f.running !== lastRun) { lastRun = f.running; playBtn.replaceChildren(icon(f.running ? 'pause' : 'play')); playBtn.setAttribute('aria-label', f.running ? 'Pause' : 'Play'); }
    const sp = store.get().speed;
    if (sp !== lastSpeed) { lastSpeed = sp; speedBtn.textContent = `${sp}×`; }
    // Active bleeding: a steady red band from the rupture to now.
    const bleeding = !!f.metrics.bleeding;
    if (bleeding !== lastBleed || bleeding) {
      lastBleed = bleeding;
      bleedBand.hidden = !bleeding;
      if (bleeding) {
        const W = trackW || track.clientWidth, { at, now } = positions(W);
        let i = entries.length - 1;
        while (i > 0 && !(entries[i].kind === 'event' && entries[i].evId === 'VARIX_RUPTURE')) i--;
        const x0 = i > 0 ? at[i] : now - 30;
        bleedBand.style.left = `${x0}px`; bleedBand.style.width = `${Math.max(4, now - x0)}px`;
      }
    }
    render();
  }
  store.on('compareSnap', (s) => {
    pinBtn.setAttribute('aria-pressed', String(!!s));
    pinBtn.querySelector('span').textContent = s ? 'Stop' : 'Compare';
    pinBtn.setAttribute('aria-label', s ? 'Stop comparing' : 'Compare from here');
  });
  onParamChange(({ label, history }) => { if (history || pending) noteParamChange(label); });
  new ResizeObserver(() => render(true)).observe(track);

  return {
    reset, recordAction, addEvents, update, undo, redo, goTo, togglePin, jump,
    entries: () => entries, cursor: () => cursor,
    onChange: (fn) => listeners.push(fn),
    save: () => ({ entries: entries.slice(), cursor, baseline: structuredClone(baseline) }),
    load: (s) => { entries = s.entries; cursor = s.cursor; baseline = s.baseline; lastRenderKey = ''; render(true); for (const fn of listeners) fn(); },
    flush: flushParams,
  };
}
