// The timeline: time, history, events and comparison on one strip under the figure.
//
//  ▶ 1×  |●──◆────◆──▲──────◆───●|  Day 142 · 0:14   [+1 wk][+1 mo][+6 mo]   📌 Pin A
//
// Every change the learner makes is a marker (◆) carrying a full snapshot of the model; clicking
// one goes back to that moment (the model, its clock and its remodeling), and later markers stay
// ahead, faded, until something new happens. Threshold events (▲) are markers too, with their
// detail and a Why?. Jumps (+1 wk / +1 mo / +6 mo) advance the disease clock in one step. Pinning
// freezes the current moment as "A" for comparison. It replaces play/speed, the Seconds/Months
// switch, undo/redo/reset, the Findings list, the Log instrument and Compare mode.

import { store, replaceParams, onParamChange } from './store.js?v=e9304c5ee2';
import { host } from './host.js?v=0489e81e1a';
import { h, fmt, toast, announce, icon, svgIcon, popover, closePopover, tooltipFor, clamp } from './util.js?v=13768f12bf';
import { activeInterventions } from './inspector.js?v=f65bdc872b';

const SEV = { critical: 'var(--critical)', danger: 'var(--danger)', caution: 'var(--caution)', info: 'var(--info)', ok: 'var(--ok)' };
export const EVENT_WHY = { VARIX_RUPTURE: 'varix', RED_WALE: 'varix', VARIX_LARGE: 'varix', HEPATOFUGAL_PV: 'pvFlow', PV_STASIS: 'pvFlow', CSPH: 'hvpg', BLEED_RISK: 'hvpg', ASCITES_FORMING: 'ascites', TENSE_ASCITES: 'ascites', HIGH_SHUNT: 'shunt', LIVER_HYPOPERFUSION: 'liverPerf', RA_HIGH: 'ra', HYPERDYNAMIC: 'co', SPLENOMEGALY: 'spleen' };
const SPEEDS = [0.5, 1, 2, 4];
const JUMPS = [[7, '+1 wk', '1 week'], [30, '+1 mo', '1 month'], [180, '+6 mo', '6 months']];

/** A frozen, self-contained copy of a frame (for pinning A and for markers). */
export function captureFrame(f, params) {
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

export function createTimeline({ root, onWhy, onPlay, onSpeed, onJump, canRevert, scenarioLabel }) {
  let entries = [], cursor = -1, seq = 0, baseline = null, pending = null, lastEv = {};
  const listeners = [];
  const absT = (e) => e.day * 86400 + e.t;
  const frameNow = () => store.get().frame;
  const labelsOf = (p) => new Map(activeInterventions(p).map((a) => [a.key, a.label]));

  // ── DOM ───────────────────────────────────────────
  const playBtn = h('button', { class: 'ib play', 'aria-label': 'Pause', title: 'Play / pause (Space)' }, icon('pause'));
  playBtn.addEventListener('click', () => onPlay());
  const speedBtn = h('button', { class: 'tl-speed', title: 'Playback speed ([ and ])', 'aria-label': 'Playback speed' }, '1×');
  speedBtn.addEventListener('click', () => { const i = SPEEDS.indexOf(store.get().speed); onSpeed(SPEEDS[(i + 1) % SPEEDS.length]); });
  const rail = h('div', { class: 'tl-rail' });
  const fill = h('div', { class: 'tl-fill' });
  const bleedBand = h('div', { class: 'tl-bleed', hidden: true });
  const marks = h('div', { class: 'tl-marks', role: 'list', 'aria-label': 'Changes and events' });
  const nowEl = h('div', { class: 'tl-now', 'aria-hidden': 'true' });
  const track = h('div', { class: 'tl-track' }, rail, bleedBand, fill, marks, nowEl);
  const timeEl = h('span', { class: 'tl-time', 'aria-live': 'off' }, '0:00');
  const jumpBtns = JUMPS.map(([d, l, long]) => {
    const b = h('button', { class: 'tl-jump', title: `Jump ${long} ahead on the disease clock` }, l);
    b.addEventListener('click', () => jump(d, long));
    return b;
  });
  const moreBtn = h('button', { class: 'ib tl-more', 'aria-label': 'More time options', title: 'More' }, icon('more'));
  moreBtn.addEventListener('click', (e) => popover(e.currentTarget, [
    h('div', { class: 'menu-title' }, 'Time'),
    menuBtn('Until something happens', () => jump('event', 'until the next event')),
    menuBtn('Settle to equilibrium', () => { host.send({ type: 'settle' }); toast('Settled to equilibrium.'); }),
    h('div', { class: 'menu-sep' }),
    h('div', { class: 'menu-title' }, 'Playback speed'),
    h('div', { class: 'seg full', style: { margin: '2px 6px 6px' } }, [0.25, ...SPEEDS, 8].map((v) => { const b = h('button', { 'aria-pressed': String(store.get().speed === v) }, `${v}×`); b.addEventListener('click', () => { closePopover(); onSpeed(v); }); return b; })),
  ], { place: 'above', align: 'end', cls: 'time-pop' }));
  const pinBtn = h('button', { class: 'tl-pin', 'aria-pressed': 'false', title: 'Freeze this moment as A to compare against (P)' }, svgIcon('camera', 'mi-ic'), h('span', {}, 'Pin as A'));
  pinBtn.addEventListener('click', () => togglePin());
  root.replaceChildren(h('div', { class: 'tl-left' }, playBtn, speedBtn), track, timeEl, h('div', { class: 'tl-jumps' }, jumpBtns, moreBtn), pinBtn);
  tooltipFor(playBtn, 'Play / pause · Space', 'top');
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
      if (days !== 'event') timeEl.textContent = `Day ${Math.round(d0 + days * (1 - (1 - u) ** 3))}`;
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
    if (store.get().compareSnap) { store.set({ compareSnap: null, compareView: 'B' }); toast('Unpinned A.'); return; }
    const f = frameNow();
    if (!f) return;
    pinFrom(captureFrame(f, store.get().params), scenarioLabel(), fmtClock(f.t, f.day));
    toast('Pinned this moment as A. Change something, then compare A with now.');
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
    // Group markers that would overlap into one, with a count.
    const groups = [];
    entries.forEach((e, i) => {
      const lane = e.kind === 'event' ? 'ev' : 'ch';
      const g = groups.findLast?.((x) => x.lane === lane) || [...groups].reverse().find((x) => x.lane === lane);
      if (g && at[i] - g.x < 11) { g.items.push(i); g.x = (g.x * (g.items.length - 1) + at[i]) / g.items.length; }
      else groups.push({ lane, x: at[i], items: [i] });
    });
    const cur = currentIndex();
    marks.replaceChildren(...groups.map((g) => {
      const es = g.items.map((i) => entries[i]);
      const top = es[es.length - 1];
      const future = cursor >= 0 && g.items[0] > cursor;
      const isCur = g.items.includes(cur) && g.lane === 'ch';
      const sev = g.lane === 'ev' ? es.reduce((a, e) => (['info', 'caution', 'danger', 'critical'].indexOf(e.sev) > ['info', 'caution', 'danger', 'critical'].indexOf(a) ? e.sev : a), 'info') : null;
      const b = h('button', { class: `tl-m ${g.lane === 'ev' ? 'ev' : top.kind}${future ? ' future' : ''}${isCur && cursor >= 0 ? ' cur' : ''}`, role: 'listitem', style: { left: `${g.x}px`, '--sev': sev ? SEV[sev] : '' },
        'aria-label': es.map((e) => `${e.kind === 'event' ? 'Event' : e.kind === 'start' ? 'Start' : 'Change'} at ${fmtClock(e.t, e.day)}: ${e.label}`).join('; ') },
      g.items.length > 1 ? h('span', { class: 'tl-count' }, String(g.items.length)) : null);
      tooltipFor(b, () => (es.length === 1 ? `${fmtClock(top.t, top.day)} · ${top.label}` : `${es.length} ${g.lane === 'ev' ? 'events' : 'changes'} · latest: ${top.label}`), 'top');
      b.addEventListener('click', (ev) => openMarker(ev.currentTarget, g.items));
      return b;
    }));
  }
  function openMarker(anchor, items) {
    const rows = items.slice().reverse().map((i) => {
      const e = entries[i];
      const acts = [];
      if (e.snap && canRevert()) acts.push(h('button', { class: 'btn sm', onclick: () => { closePopover(); goTo(i); } }, icon('undo'), i === liveIndex() && cursor < 0 ? 'Back to this moment' : 'Go back here'));
      if (e.frame) acts.push(h('button', { class: 'btn sm', onclick: () => { closePopover(); pinFrom(e.frame, e.label, fmtClock(e.t, e.day)); toast(`Pinned “${e.label}” as A.`); } }, svgIcon('camera', 'mi-ic'), 'Compare with now'));
      if (e.why) acts.push(h('button', { class: 'btn sm', onclick: (ev) => onWhy(e.why, ev.currentTarget) }, svgIcon('bulb', 'mi-ic'), 'Why?'));
      return h('div', { class: 'tl-pop-row' },
        h('div', { class: 'tl-pop-head' }, h('i', { class: `tl-dot ${e.kind}`, style: { background: e.kind === 'event' ? SEV[e.sev] || SEV.info : '' } }), h('b', {}, e.label), h('span', { class: 'when' }, fmtClock(e.t, e.day))),
        e.detail ? h('div', { class: 'tl-pop-d' }, e.detail) : null,
        acts.length ? h('div', { class: 'btn-row' }, acts) : null);
    });
    popover(anchor, h('div', { class: 'tl-pop' }, rows), { place: 'above', align: 'center' });
  }
  let pulseT = null;
  function pulseLatest() { track.classList.add('pulse'); clearTimeout(pulseT); pulseT = setTimeout(() => track.classList.remove('pulse'), 1400); }

  let lastTime = '', lastRun = null, lastSpeed = null, lastBleed = null;
  function update(f) {
    if (!track.classList.contains('ff')) {
      const t = fmtClock(f.t, f.day);
      if (t !== lastTime) { lastTime = t; timeEl.textContent = t; }
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
    pinBtn.querySelector('span').textContent = s ? 'Unpin A' : 'Pin as A';
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
