// Memory loop bench (card gallery, plan 2.8): the on-device version of tests/gpu-leak-cycles.test.js, for the iPhone's tab kills (18 Nov 2026, killed on a deck's
// slide change). Pick a move, press Start, and the bench plays it there and back N times. At the end of every cycle (and every two seconds on a slow timer chain,
// for the live line) it reads what the page holds: the GPU estimate (gpu-budget.js memoryMB), its highest (peakMB), the live contexts (contextCount), the JS heap
// (performance.memory.usedJSHeapSize, where the browser has one: Chrome; Safari has none, shown "n/a") and the frames drawn (frameCount).
// A cycle is the move and its way back, so every cycle ends where it began. The first two cycles are warm-up (everything the move builds once); after them the
// MB should not climb: leakSlope is the least-squares MB per cycle over the cycles that follow, and verdict says steady, climbing, or near the envelope
// (gpu-budget.js ENVELOPES for this device class).
// Two kinds of move: a pair of views (the Camera bench's list) or a pair of slides in one deck (default the HVPG deck, slide 5 to slide 6, the wedge's sinusoid and
// the result: the move the leak test runs).
// If the tab is killed, the next page's report (report.js) has the "last-seen" line: where the page was and how much it held. It is shown below, and in the copy.
import { DECKS, slideCount } from '../../decks.js';
import { VIEW_KEYS, viewKey } from '../../store.js';
import { frameCount } from '../../frame.js';
import { ENVELOPES, deviceClass, memoryMB, peakMB, contextCount } from '../../gpu-budget.js';
import { moveList, appMove, createSettler, viewName } from './camera-grid.js';
import { benchRoot, h, statusLine, copyButton, ppsOf } from './ui.js';

export const WARMUP = 2;                      // the first cycles build what the move builds once: not counted in the slope
export const CYCLE_CHOICES = Object.freeze([5, 10, 20, 50]);
export const DEFAULT_CYCLES = 10;
export const CLIMB_MB = 0.5;                  // a slope at or over this many MB a cycle is a climb
export const NEAR_SHARE = 0.85;               // holding this share of the envelope is "near" it
export const DEFAULT_DECK = 'hvpg', DEFAULT_FROM = 5, DEFAULT_TO = 6;   // (the HVPG deck's slides 5 and 6, as the presenter numbers them: the outline is 1)

/** MB per cycle by least squares over the last `last` cycles after the first `skip` (warm-up). samples: [{ cycle?, mb }] in order. null when fewer than 3 cycles remain. */
export function leakSlope(samples, { skip = WARMUP, last = 12 } = {}) {
  const pts = (samples || []).map((s, i) => ({ x: Number.isFinite(s?.cycle) ? s.cycle : i + 1, y: +s?.mb })).slice(skip).filter((p) => Number.isFinite(p.y)).slice(-last);
  if (pts.length < 3) return null;
  const n = pts.length, mx = pts.reduce((a, p) => a + p.x, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxx = 0, sxy = 0;
  for (const p of pts) { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); }
  return sxx > 0 ? sxy / sxx : null;
}

/** 'steady' | 'climbing' | 'near the envelope', with the numbers: { verdict, slope, mb, envelopeMb, share, enough, cyclesLeft, text }.
 *  opts.mb: the MB now (default the last sample's); opts.envelope: the device class's envelope ({ mb } from ENVELOPES, or a number of MB).
 *  Near the envelope wins (holding 85 % or more of it is the kill risk whether or not it climbs); else a slope of 0.5 MB a cycle or more is climbing.
 *  With fewer than 3 cycles after the warm-up there is no slope: 'steady' with enough: false, and the text says so. */
export function verdict(samples, { mb, envelope } = {}) {
  const now = Number.isFinite(mb) ? mb : +samples?.at?.(-1)?.mb;
  const env = typeof envelope === 'number' ? envelope : +envelope?.mb;
  const slope = leakSlope(samples), enough = slope !== null, share = env > 0 && Number.isFinite(now) ? now / env : NaN;
  const near = share >= NEAR_SHARE, climbing = enough && slope >= CLIMB_MB;
  const v = near ? 'near the envelope' : climbing ? 'climbing' : 'steady';
  const cyclesLeft = climbing && env > 0 ? Math.max(0, Math.floor((env - now) / slope)) : null;
  const f = (x) => (Number.isFinite(x) ? x.toFixed(1) : '?');
  const bits = [`${f(now)} MB${Number.isFinite(share) ? ` (${Math.round(share * 100)}% of the ${env} MB envelope)` : ''}`];
  bits.push(enough ? `${slope >= 0.005 ? '+' : ''}${Math.abs(slope) < 0.005 ? '0.00' : slope.toFixed(2)} MB per cycle after the ${WARMUP} warm-up cycles` : `no slope yet (needs ${WARMUP + 3} cycles)`);
  if (near && climbing) bits.push('and climbing');
  if (climbing && cyclesLeft !== null) bits.push(`at this rate the envelope is reached in about ${cyclesLeft} cycles`);
  return { verdict: v, slope, mb: now, envelopeMb: env, share, enough, cyclesLeft, text: `${v}: ${bits.join(', ')}` };
}

/** The text a Copy gives: the move, a row a cycle, the verdict, the last-seen lines. rows: [{ cycle, mb, peak, own, charts, heap, frames, s }]. */
export function memoryReport({ move, rows, base, info = {}, lastSeen = [] }) {
  const f = (x) => (x == null || !Number.isFinite(x) ? 'n/a' : x.toFixed(1));
  const line = (r) => `${String(r.cycle).padStart(5)} ${f(r.mb).padStart(8)} ${f(r.peak).padStart(8)} ${`${r.own}+${r.charts}`.padStart(9)} ${f(r.heap).padStart(8)} ${String(r.frames).padStart(8)} ${f(r.s).padStart(6)}`;
  const out = [`Memory loop: ${move || '?'}${info.device ? `, ${info.device}` : ''}${info.when ? `, ${info.when}` : ''}`, 'cycle       MB  peak MB  contexts  heap MB   frames      s'];
  if (base) out.push(line({ ...base, cycle: 'start', s: 0 }));
  for (const r of rows || []) out.push(line(r));
  if (rows?.length) out.push(verdict(rows, { envelope: info.envelope }).text);
  for (const l of lastSeen) out.push(`last seen by the page before: ${l.trim()}`);
  return out.join('\n');
}

/** What the page holds now. heap is MB or null (no performance.memory). Reads three counters: no layout, no DOM. */
export function readNow() {
  let heap = null;
  try { const u = globalThis.performance?.memory?.usedJSHeapSize; if (Number.isFinite(u)) heap = u / 1e6; } catch { /* a browser with no heap figure */ }
  let own = 0, charts = 0;
  try { const c = contextCount(); own = c.own; charts = c.charts; } catch { /* the registry is not up */ }
  let mb = NaN, peak = NaN;
  try { mb = memoryMB(); peak = peakMB(); } catch { /* the registry is not up */ }
  return { mb, peak, own, charts, heap, frames: frameCount() };   // alloc-rare: once per tap or per finished move, never in a frame
}

export default {
  id: 'memory-loop',
  title: 'Memory loop',
  mount(host, ctx) {
    const pps = ppsOf(ctx);
    benchRoot(host, 'Memory loop', 'Plays a move there and back, over and over, and reads the GPU estimate, its highest, the live contexts and the JS heap at the end of each cycle. The first two cycles are warm-up. Steady is good; climbing is a leak.');
    const say = statusLine(), live = h('div', { class: 'gb-note' }), verdictEl = h('div', { class: 'gb-status' }), lastSeenEl = h('pre', null, '…');
    const settler = createSettler(pps), pauses = new Set(), env = ENVELOPES[deviceClass()];
    let gone = false, busy = false, stopReq = false, slowT = 0, startView = null, openedTalk = false, lastSeen = [], rows = [], base = null, moveText = '';

    // ── the move chosen ──
    const pairs = moveList().filter((m) => !m.refit);
    const kindSel = h('select', { 'aria-label': 'Kind of move' }, h('option', { value: 'slides', selected: true }, 'Deck slides'), h('option', { value: 'views' }, 'View pair'));
    const viewSel = h('select', { 'aria-label': 'View pair' }, pairs.map((m) => h('option', { value: m.id }, `${viewName(m.from)} to ${viewName(m.to)}`)));
    const deckSel = h('select', { 'aria-label': 'Deck' }, DECKS.map((d) => h('option', { value: d.id, selected: d.id === DEFAULT_DECK }, `${d.title} (${slideCount(d)})`)));
    const fromIn = h('input', { type: 'number', min: 1, value: DEFAULT_FROM, style: 'width:64px', 'aria-label': 'From slide' });
    const toIn = h('input', { type: 'number', min: 1, value: DEFAULT_TO, style: 'width:64px', 'aria-label': 'To slide' });
    const nSel = h('select', { 'aria-label': 'Cycles' }, CYCLE_CHOICES.map((n) => h('option', { value: n, selected: n === DEFAULT_CYCLES }, `${n} cycles`)));
    const slideRow = h('div', { class: 'gb-row' }, h('span', { class: 'gb-note' }, 'Deck'), deckSel, h('span', { class: 'gb-note' }, 'slide'), fromIn, h('span', { class: 'gb-note' }, 'to'), toIn);
    const viewRow = h('div', { class: 'gb-row', hidden: true }, h('span', { class: 'gb-note' }, 'Views'), viewSel);
    const showKind = () => { const v = kindSel.value === 'views'; viewRow.hidden = !v; slideRow.hidden = v; };
    kindSel.addEventListener('change', showKind);

    // ── the table ──
    const tbody = h('tbody');
    const addRow = (r, label = r.cycle) => {
      tbody.append(h('tr', null, [label, r.mb, r.peak, `${r.own}+${r.charts}`, r.heap, r.frames, r.s].map((v, i) => h('td', null, i === 0 || i === 3 || i === 5 ? String(v) : Number.isFinite(v) ? v.toFixed(1) : 'n/a'))));
    };

    const pause = (ms) => new Promise((resolve) => { const p = { t: 0, resolve }; p.t = setTimeout(() => { pauses.delete(p); resolve(); }, ms); pauses.add(p); });
    const endPauses = () => { for (const p of pauses) { clearTimeout(p.t); p.resolve(); } pauses.clear(); };
    const stop = () => { stopReq = true; settler.cancel(); endPauses(); };

    // The moves. Each returns true when the page landed where it was sent.
    async function viewTo(view) {
      if (viewKey() === view) return true;
      appMove(pps, viewKey(), view);
      await pause(150);
      const s = await settler.wait();
      return !!s.ok && viewKey() === view;
    }
    async function slideTo(i) {
      const p = pps?.presenter;
      p.go(i);
      await pause(150);   // (the presenter takes the ask on its next frame: look for its busy flag after that)
      const s = await settler.wait();
      return !!s.ok && (p.position?.()?.at === i);
    }

    const sample = (cycle, t0) => ({ cycle, ...readNow(), s: (performance.now() - t0) / 1000 });
    function paintVerdict() {
      if (!rows.length) { verdictEl.className = 'gb-status'; verdictEl.textContent = ''; return; }
      const v = verdict(rows, { envelope: env });
      verdictEl.className = `gb-status gb-${v.verdict === 'steady' ? (v.enough ? 'ok' : '') : v.verdict === 'climbing' ? 'warn' : 'bad'}`;
      verdictEl.textContent = v.text;
    }

    async function run() {
      if (busy) return;
      const kind = kindSel.value, cycles = +nSel.value || DEFAULT_CYCLES;
      let from, to, a, b;
      if (kind === 'views') {
        const m = pairs.find((x) => x.id === viewSel.value) || pairs[0]; from = m.from; to = m.to;
        if (!VIEW_KEYS.includes(from)) return;
        a = () => viewTo(to); b = () => viewTo(from); moveText = `${viewName(from)} to ${viewName(to)} and back`;
      } else {
        const d = DECKS.find((x) => x.id === deckSel.value), n = slideCount(d), f = Math.max(1, Math.min(n, +fromIn.value || DEFAULT_FROM)), t = Math.max(1, Math.min(n, +toIn.value || DEFAULT_TO));
        if (!pps?.presenter?.start) { say.set('The presenter is not available here (pps.presenter).', 'bad'); return; }
        if (f === t) { say.set('Pick two different slides.', 'warn'); return; }
        a = () => slideTo(t - 1); b = () => slideTo(f - 1); moveText = `${d.title}, slide ${f} to ${t} and back`;
        from = f - 1;
        busy = true; stopReq = false;
        const wasOpen = !!pps.presenter.active?.();
        say.set(`Opening ${d.title} at slide ${f}…`);
        try { await pps.presenter.start(d.id, f - 1); } catch (err) { say.set(`Would not open the deck: ${err?.message || err}`, 'bad'); busy = false; return; }
        openedTalk = openedTalk || !wasOpen;
        await pause(150); await settler.wait();
        busy = false;
      }
      if (stopReq) return;
      busy = true; stopReq = false; rows = []; base = null; tbody.replaceChildren(); verdictEl.textContent = '';
      if (startView === null) startView = viewKey();
      try {
        if (kind === 'views' && !(await viewTo(from))) { say.set(`Could not reach ${viewName(from)} (the app is in ${viewKey()}).`, 'bad'); return; }
        const t0 = performance.now();
        base = sample(0, t0); base.s = 0; addRow(base, 'start');
        for (let c = 1; c <= cycles && !stopReq && !gone; c++) {
          say.set(`Cycle ${c} of ${cycles}: ${moveText}…`);
          const ok1 = await a(); if (stopReq || gone) break;
          const ok2 = await b();
          if (stopReq || gone) break;
          const r = sample(c, t0); rows.push(r); addRow(r); paintVerdict();
          if (!ok1 || !ok2) { say.set(`Cycle ${c}: the page did not settle where it was sent (${kind === 'views' ? `the app is in ${viewKey()}` : 'the talk did not land'}). Stopped.`, 'bad'); return; }
        }
        say.set(stopReq ? `Stopped after ${rows.length} cycle${rows.length === 1 ? '' : 's'}.` : `Done: ${rows.length} cycles.`, stopReq ? 'warn' : 'ok');
      } finally { busy = false; if (!gone) paintVerdict(); }
    }

    // The live line: every two seconds on a timer chain (never a frame), and the buttons.
    const liveNow = () => {
      const r = readNow();
      live.textContent = `Now: ${Number.isFinite(r.mb) ? r.mb.toFixed(1) : '?'} MB held (highest ${Number.isFinite(r.peak) ? r.peak.toFixed(1) : '?'}) of ${env.mb} MB for a ${deviceClass()}; contexts ${r.own}+${r.charts}; JS heap ${r.heap == null ? 'n/a here' : `${r.heap.toFixed(1)} MB`}; ${r.frames} frames drawn.`;   // alloc-rare: once per tap or per finished move, never in a frame
    };
    const slow = () => { slowT = setTimeout(() => { if (gone) return; liveNow(); slow(); }, 2000); };   // alloc-rare: every two seconds, a timer chain, not a frame callback

    const startBtn = h('button', { type: 'button', onclick: () => { run(); } }, 'Start');
    const stopBtn = h('button', { type: 'button', onclick: stop }, 'Stop');
    const copy = copyButton('Copy results', () => memoryReport({ move: moveText, rows, base, info: { device: `${deviceClass()}, ${env.mb} MB envelope`, when: new Date().toISOString().slice(0, 16).replace('T', ' '), envelope: env }, lastSeen }), (t, tone) => say.set(t, tone), ctx);
    host.append(h('div', { class: 'gb-row' }, h('span', { class: 'gb-note' }, 'Move'), kindSel), slideRow, viewRow,
      h('div', { class: 'gb-row' }, nSel, startBtn, stopBtn, copy), say, verdictEl, live,
      h('table', null, h('thead', null, h('tr', null, ['Cycle', 'MB', 'Peak MB', 'Contexts', 'Heap MB', 'Frames', 's'].map((c) => h('th', null, c)))), tbody),
      h('h3', { style: 'margin-top:14px' }, 'Seen by the page before this one'), h('p', { class: 'gb-note' }, 'After a tab kill the app\'s report (report.js) keeps where the page was and how much it held. It reads here once the page has reloaded.'), lastSeenEl);
    showKind(); liveNow(); slow();
    import('../../report.js').then(({ reportLines }) => {
      if (gone) return;
      const all = reportLines();
      lastSeen = all.filter((l) => /last-seen|\breload\b/.test(l));
      lastSeenEl.textContent = lastSeen.length ? [all[0], ...lastSeen].filter(Boolean).join('\n') : `${all[0] || 'No report lines.'}\nNo kill noticed in this tab: nothing was last seen.`;
    }).catch(() => { if (!gone) lastSeenEl.textContent = 'The report is not available here.'; });

    return () => {
      gone = true; stopReq = true; clearTimeout(slowT); settler.cancel(); endPauses();
      // (Put the page back as found: the talk this bench opened is closed, the figure goes back to the view it was in.)
      try { if (openedTalk) pps?.presenter?.stop?.(); } catch { /* the page is going away */ }
      try { if (startView && !openedTalk && viewKey() !== startView) appMove(pps, viewKey(), startView); } catch { /* the page is going away */ }
    };
  },
};
