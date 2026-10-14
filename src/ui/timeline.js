// The timeline: time, history, events and comparison in one row under the figure (there is no event
// track: History is the list of what has happened, and the latest event is named above the clock).
//
//  ▶ 1×  Day 142 · 0:14  ● Large varices   [jump ahead] History 5  Compare
//
// Every change the learner makes is an entry carrying a full snapshot of the model; History goes
// back to that moment (the model, its clock and its remodeling), and later entries stay ahead,
// faded, until something new happens. Threshold events are entries too, with their detail. Jumps
// (+1 wk / +1 mo / +6 mo) advance the disease clock in one step. "Compare
// from here" freezes the current moment as A for comparison. It replaces play/speed, the Seconds/Months
// switch, undo/redo/reset, the Findings list, the Log instrument and Compare mode.

import { store, replaceParams, onParamChange } from './store.js?v=14d67870c8';
import { host } from './host.js?v=5e24aa7737';
import { h, toast, announce, icon, svgIcon, popover, closePopover, tooltipFor, clamp } from './util.js?v=abb277f29f';
import { activeInterventions } from './inspector.js?v=7b0c1a1dd0';
import { frameFor } from './frame.js?v=0db47e99bf';
const nextFrame = frameFor('timeline');

const COLL = 'Collateral recruited: ';
const isCollateral = (e) => e.kind === 'event' && typeof e.label === 'string' && e.label.startsWith(COLL);
const collName = (e) => e.label.slice(COLL.length);
const collPct = (e) => (/^(\d+) %/.exec(e.detail || '') || [])[1]?.concat('%') || '';
const HIST_FILTERS = [['all', 'All'], ['warn', 'Warnings'], ['coll', 'Collaterals']];
const histMatch = (e, f) => f === 'all' || e.kind === 'start' ? f === 'all' || false
  : f === 'coll' ? isCollateral(e) : e.kind === 'event' && ['caution', 'danger', 'critical'].includes(e.sev);
const SEV = { critical: 'var(--critical)', danger: 'var(--danger)', caution: 'var(--caution)', info: 'var(--info)', ok: 'var(--ok)' };
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
/** Time-lapse rates: [sim days per real second, short label, long label]. */
export const LAPSES = [[1 / 24, '1 h/s', '1 hour per second'], [0.5, '12 h/s', '12 hours per second'], [1, '24 h/s', '1 day per second'], [7, '1 wk/s', '1 week per second']];
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

export function createTimeline({ root, onPlay, onSpeed, onJump, onRestart, canRevert = () => true, scenarioLabel }) {
  let entries = [], cursor = -1, seq = 0, baseline = null, pending = null, lastEv = {}, jumping = false;
  const listeners = [];
  const absT = (e) => e.day * 86400 + e.t;
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
  playBtn.addEventListener('pointerdown', () => { held = false; clearTimeout(holdTimer); holdTimer = setTimeout(() => { held = true; openSpeed(); }, 450); });
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
  // The latest event, named beside the clock; a click opens it like its marker.
  const latestEl = h('button', { class: 'tl-latest', hidden: true });
  latestEl.addEventListener('click', (e) => { const i = latestEventIndex(); if (i >= 0) openMarker(e.currentTarget, [i]); });
  latestEl.addEventListener('transitionend', (e) => { if (e.propertyName === 'opacity' && latestEl.classList.contains('stale')) latestEl.hidden = true; });
  const histCount = h('span', { class: 'tl-hc' });
  const histBtn = h('button', { class: 'tl-hist', 'aria-haspopup': 'dialog', 'aria-label': 'History', title: 'History: every change and event, with a way back to each' }, svgIcon('clock', 'mi-ic'), h('span', { class: 'tl-hl' }, 'History'), histCount);
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
  root.replaceChildren(h('div', { class: 'tl-left' }, h('div', { class: 'tl-split' }, speedBtn, playBtn), restartBtn), timeEl, h('div', { class: 'tl-jumps' }, ffBtn), histBtn, pinBtn);
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
      push({ kind: 'event', label: ev.title, detail: ev.detail, sev: ev.severity, t: ev.t, day: ev.day, evId: ev.id });
      sortEntries();
      announce(`${ev.title}. ${ev.detail || ''}`);
      dispatchEvent(new Event('pps:event'));   // a phone's folded dock opens for it (main.js)
    }
  }
  async function jump(days, long) {
    flushParams();
    const f = frameNow();
    const d0 = f?.day ?? 0;
    onJump(days);
    jumping = true;
    const t0 = performance.now();
    const tick = (now) => {
      const u = clamp((now - t0) / 900, 0, 1);
      if (days !== 'event') timeLong.textContent = timeShort.textContent = `Day ${Math.round(d0 + days * (1 - (1 - u) ** 3))}`;
      if (u < 1) nextFrame(tick); else jumping = false;
    };
    nextFrame(tick);
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
    if (!canRevert()) { toast('Going back in time is off here.'); return false; }
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
  // The latest-event chip and the History count follow the entries; the chip also fades about
  // 20 s of model time after its event, so a light check runs at most once a second.
  let lastRenderKey = '', lastRenderAt = 0;
  function render(force) {
    const key = `${entries.length}|${cursor}`;
    const t = performance.now();
    if (!force && key === lastRenderKey && t - lastRenderAt < 1000) return;
    lastRenderKey = key; lastRenderAt = t;
    paintLatest();
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
      latestEl.classList.remove('stale');
      if (e) {
        latestEl.style.setProperty('--sev', SEV[e.sev] || SEV.info);
        latestEl.replaceChildren(h('i', { class: 'tl-ld', 'aria-hidden': 'true' }), h('span', {}, e.label), h('small', {}, e.kind === 'start' ? '' : fmtClock(e.t, e.day)));
        latestEl.setAttribute('aria-label', `Latest event at ${fmtClock(e.t, e.day)}: ${e.label}`);
        latestEl.title = `${fmtClock(e.t, e.day)} · ${e.label}${e.detail ? `\n${e.detail}` : ''}`;
      }
    }
    // After about 20 s of model time the chip fades away (History keeps the event); live only.
    const f = frameNow();
    const stale = !!e && cursor < 0 && !!f && f.day * 86400 + f.t - absT(e) > 20;
    if (stale !== latestEl.classList.contains('stale')) {
      latestEl.classList.toggle('stale', stale);
      if (!stale) latestEl.hidden = !e;
    }
    const n = entries.filter((x) => x.kind !== 'start').length;
    if (histCount.textContent !== (n ? String(n) : '')) histCount.textContent = n ? String(n) : '';
  }
  function openHistory(anchor) {
    const items = entries.map((_, i) => i);
    if (items.length <= 1) {
      popover(anchor, h('div', { class: 'tl-pop tl-history' }, h('p', { class: 'tl-pop-empty' }, 'Nothing has happened yet. Change something on the figure, or jump ahead in time.')), { place: 'above', align: 'end' });
      return;
    }
    const list = h('div', { class: 'tl-hist-list' });
    let filter = 'all';
    const chips = HIST_FILTERS.map(([k, label]) => h('button', { class: 'tl-chip', 'aria-pressed': String(k === filter), onclick: () => {
      filter = k; chips.forEach((c, j) => c.setAttribute('aria-pressed', String(HIST_FILTERS[j][0] === k))); fill();
    } }, label));
    const fill = () => { list.replaceChildren(...historyGroups(items.filter((i) => histMatch(entries[i], filter)))); };
    fill();
    popover(anchor, h('div', { class: 'tl-pop tl-history' }, h('div', { class: 'tl-chips', role: 'group', 'aria-label': 'Show' }, chips), list), { place: 'above', align: 'end' });
  }
  // History, newest first: one header per day, same-day collaterals folded into one row, and the
  // clock time on a row only when that day holds more than one time.
  function historyGroups(items) {
    if (!items.length) return [h('p', { class: 'tl-pop-empty' }, 'Nothing here yet.')];
    const days = [];
    for (const i of items.slice().reverse()) {
      const e = entries[i], key = e.kind === 'start' ? 'start' : e.day;
      if (!days.length || days[days.length - 1].key !== key) days.push({ key, idx: [] });
      days[days.length - 1].idx.push(i);
    }
    const out = [];
    for (const d of days) {
      const times = new Set(d.idx.map((i) => clockPart(entries[i])));
      const showTime = times.size > 1;
      out.push(h('div', { class: 'tl-day' }, d.key === 'start' ? 'Start' : `Day ${d.key}`, showTime ? null : h('span', {}, d.key === 'start' ? '' : [...times][0])));
      const coll = d.idx.filter((i) => isCollateral(entries[i]));
      let folded = false;
      for (const i of d.idx) {
        if (coll.length > 1 && isCollateral(entries[i])) {
          if (folded) continue;
          folded = true;
          out.push(collateralGroup(coll, showTime));
        } else out.push(historyRow(i, showTime));
      }
    }
    return out;
  }
  const clockPart = (e) => fmtClock(e.t, e.day).split(' · ').pop();
  function rowActs(i) {
    const e = entries[i], acts = [];
    const act = (label, ic, col, fn) => acts.push(h('button', { class: 'tl-pop-ic', style: { gridColumn: col }, title: label, 'aria-label': label, onclick: (ev) => { ev.stopPropagation(); fn(); } }, ic));
    if (e.snap && canRevert()) act(i === liveIndex() && cursor < 0 ? 'Back to this moment' : 'Go back here', svgIcon('rewind', 'mi-ic'), 1, () => { closePopover(); goTo(i); });
    if (e.frame) act('Compare with now', svgIcon('camera', 'mi-ic'), 2, () => { closePopover(); pinFrom(e.frame, e.label, fmtClock(e.t, e.day)); toast(`Comparing with ${fmtClock(e.t, e.day)}: ${e.label}.`); });
    return h('span', { class: 'tl-pop-acts' }, acts);
  }
  const sevOf = (e) => (e.kind === 'event' ? SEV[e.sev] || SEV.info : e.kind === 'jump' ? 'var(--accent)' : 'var(--text-3)');
  const tapOpen = (row) => { row.addEventListener('click', () => row.classList.toggle('open')); return row; };
  function historyRow(i, showTime) {
    const e = entries[i];
    const title = e.kind === 'start' ? `Patient: ${e.label}` : isCollateral(e) ? collName(e) : e.label;
    const future = cursor >= 0 && i > cursor;
    return tapOpen(h('div', { class: `tl-hrow${future ? ' future' : ''}`, style: { '--sev': sevOf(e) } },
      h('div', { class: 'tl-hrow-head' }, h('b', {}, title, isCollateral(e) ? h('span', { class: 'tl-tag' }, 'Collateral') : null),
        showTime && e.kind !== 'start' ? h('span', { class: 'when' }, clockPart(e)) : null, rowActs(i)),
      e.detail ? h('div', { class: 'tl-pop-d' }, e.detail) : null));
  }
  function collateralGroup(idx, showTime) {
    const e = entries[idx[0]];
    const future = cursor >= 0 && idx[0] > cursor;
    return h('details', { class: `tl-hrow tl-hgroup${future ? ' future' : ''}`, style: { '--sev': sevOf(e) } },
      h('summary', { class: 'tl-hrow-head' }, h('b', {}, `${idx.length} collaterals recruited`),
        showTime ? h('span', { class: 'when' }, clockPart(e)) : null, rowActs(idx[0])),
      h('ul', { class: 'tl-hsub' }, idx.map((i) => h('li', {}, h('span', {}, collName(entries[i])), h('span', { class: 'pct' }, collPct(entries[i]))))));
  }
  function openMarker(anchor, items) {
    popover(anchor, h('div', { class: 'tl-pop' }, markerRows(items)), { place: 'above', align: 'center' });
  }
  function markerRows(items) {
    return items.slice().reverse().map((i) => {
      const e = entries[i];
      const acts = [];
      const act = (label, ic, col, fn) => acts.push(h('button', { class: 'tl-pop-ic', style: { gridColumn: col }, title: label, 'aria-label': label, onclick: fn }, ic));
      if (e.snap && canRevert()) act(i === liveIndex() && cursor < 0 ? 'Back to this moment' : 'Go back here', svgIcon('rewind', 'mi-ic'), 1, () => { closePopover(); goTo(i); });
      if (e.frame) act('Compare with now', svgIcon('camera', 'mi-ic'), 2, () => { closePopover(); pinFrom(e.frame, e.label, fmtClock(e.t, e.day)); toast(`Comparing with ${fmtClock(e.t, e.day)}: ${e.label}.`); });
      const future = cursor >= 0 && i > cursor;
      return h('div', { class: `tl-pop-row${future ? ' future' : ''}` },
        h('div', { class: 'tl-pop-head' }, h('i', { class: `tl-dot ${e.kind}`, style: { background: e.kind === 'event' ? SEV[e.sev] || SEV.info : '' } }), h('b', {}, e.kind === 'start' ? `Patient: ${e.label}` : e.label), h('span', { class: 'when' }, e.kind === 'start' ? 'Start' : fmtClock(e.t, e.day)), h('span', { class: 'tl-pop-acts' }, acts)),
        e.detail ? h('div', { class: 'tl-pop-d' }, e.detail) : null);
    });
  }
  let lastTime = '', lastRun = null, lastRunMode = null, lastSpeed = null;
  function update(f) {
    if (!jumping) {
      const t = fmtClock(f.t, f.day);
      if (t !== lastTime) { lastTime = t; timeLong.textContent = t; timeShort.textContent = f.day > 0 ? `Day ${f.day}` : t; }
    }
    if (f.running !== lastRun) { lastRun = f.running; playBtn.setAttribute('aria-label', f.running ? 'Pause' : 'Play'); }
    const st = store.get(), lp = st.lapse || 0, sp = lp ? `L${lp}` : st.speed;
    if (sp !== lastSpeed || f.running !== lastRunMode) {
      lastSpeed = sp; lastRunMode = f.running;
      const lap = LAPSES.find((l) => l[0] === lp);
      speedBtn.textContent = lp ? (lap ? lap[1] : `${lp} d/s`) : `${st.speed}×`;
      for (const el of [playBtn, speedBtn, playBtn.parentElement]) el?.classList.toggle('lapse', !!lp);
      playBtn.replaceChildren(icon(f.running ? 'pause' : (lp ? 'playlapse' : 'play')));
      playBtn.title = lp ? 'Play / pause (Space): time-lapse' : 'Play / pause (Space)';
    }
    render();
  }
  store.on('compareSnap', (s) => {
    pinBtn.setAttribute('aria-pressed', String(!!s));
    pinBtn.querySelector('span').textContent = s ? 'Stop' : 'Compare';
    pinBtn.setAttribute('aria-label', s ? 'Stop comparing' : 'Compare from here');
  });
  onParamChange(({ label, history }) => { if (history || pending) noteParamChange(label); });

  return {
    reset, recordAction, addEvents, update, undo, redo, goTo, togglePin, jump,
    entries: () => entries, cursor: () => cursor,
    onChange: (fn) => listeners.push(fn),
    save: () => ({ entries: entries.slice(), cursor, baseline: structuredClone(baseline) }),
    load: (s) => { entries = s.entries; cursor = s.cursor; baseline = s.baseline; lastRenderKey = ''; render(true); for (const fn of listeners) fn(); },
    flush: flushParams,
  };
}
