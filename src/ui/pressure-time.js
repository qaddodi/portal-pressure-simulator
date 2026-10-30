// Pressure over time: the portal circulation's pressures as a live trace, and below them the
// HVPG (wedged − free hepatic venous pressure) on its own lane, read against its clinical
// thresholds, and over the last beats a schematic EKG strip timed to the model's own heartbeat (ekg.js). Three ranges share one chart: the last beats (every heartbeat and breath), the
// last two minutes (a band from trough to peak around the mean) and the disease clock (one point
// per day). Changes the learner makes and threshold events are marked where they happened, and
// a crosshair (hover, or drag on a touch screen) reads every trace at one moment.

import { store, hiddenNow } from './store.js?v=926dabfaef';
import { h, fmt, fitCanvas, cssVar, cssAlpha, clamp } from './util.js?v=8664598769';
import { FONT as FONT0, FONT } from './charts.js?v=681f8eb19a';
import { frameFor, cancelFrame } from './frame.js?v=c868718bdd';
import { tenthGap } from '../engine/gap.js?v=3aabfbb29b';
import { firstAtOrAbove, firstAbove } from './sorted.js?v=662e543c85';
import { limitLabelX as labelX } from './limit-label.js?v=52dcc41a1e';
import { wrapLabel } from './wrap-label.js?v=1af9654a99';
import { createBeatClock, ekgSeries, leadIISeries } from './ekg.js?v=f27505b539';
import { laneRoom } from './trace-lanes.js?v=3d3cb1915e';
import { olderThan, inFront } from './backfill.js?v=455d888760';
import { plotFill } from './plot-look.js?v=5037697da7';
import { beatTop, beatLayout, colPlan, paperFine, beforeLabelY, sinceText } from './beat-card.js?v=1c985e2f61';
import { VITALS } from './vital-read.js?v=cbba41a6b7';
const nextFrame = frameFor('pressure-time');

// hide: the readout that can stay unmeasured (store.hiddenReadouts); day: the value on the
// disease clock (null where the model keeps no daily value).
const TRACES = [
  { id: 'CONF', label: 'Portal vein', abbr: 'PV', short: 'Portal', c: '--tr-pv', hide: 'pv', on: true, day: (m) => m.pv },
  { id: 'whvp', label: 'Wedged hepatic (WHVP)', abbr: 'WHVP', short: 'Wedged', c: '--tr-wedge', hide: 'trueHVPG', on: true, day: (m) => m.whvp },
  { id: 'RHV', label: 'Free hepatic (FHVP)', abbr: 'FHVP', short: 'Free', c: '--tr-hv', hide: 'trueHVPG', on: true, day: (m) => m.fhvp },
  { id: 'RA', label: 'Right atrium', abbr: 'RA', short: 'RA', c: '--tr-ra', hide: 'ra', on: false, day: (m) => m.ra },
  { id: 'IVCS', label: 'IVC', abbr: 'IVC', short: 'IVC', c: '--tr-ivc', hide: 'ra', on: false, day: (m) => m.ivc },
  { id: 'VAR', label: 'Esophageal varix', abbr: 'Varix', short: 'Varix', c: '--tr-var', hide: 'pv', on: false, day: null },
  { id: 'SV', label: 'Splenic vein', abbr: 'SV', short: 'Splenic', c: '--tr-sv', hide: 'pv', on: false, day: (m) => m.sv },
  { id: 'SMV', label: 'Superior mesenteric vein', abbr: 'SMV', short: 'SMV', c: '--tr-smv', hide: 'pv', on: false, day: null },
];
const KEYS = [...TRACES.map((t) => t.id), 'hvpg'];
const SMOOTH_S = 6; // seconds averaged by the Smooth toggle
const BEAT_CARD_S = 5;
const RANGES = [['beats', '10 s', 10], ['minutes', '2 min', 120], ['days', 'Days', null]];
const LAG_S = 0.12; // wall seconds the trace runs behind the newest sample, so it can glide between frames
const FINE_S = 22, COARSE_S = 140, BIN = 0.25;
// HVPG cut-offs: above normal, clinically significant (Baveno), and 12, below which varices rarely bleed.
const LIMITS = [[5, ''], [10, 'CSPH 10'], [12, 'Can bleed 12']];
const sevOf = (v) => (v < 5 ? 'ok' : v < 10 ? 'caution' : 'danger');
const wordOf = (v) => (v < 5 ? 'Normal' : v < 10 ? 'Mild' : v < 12 ? 'CSPH' : 'CSPH · can bleed');
const nice = (span, n = 4) => { const raw = Math.max(1e-6, span / n); const p = Math.pow(10, Math.floor(Math.log10(raw))); const r = raw / p; return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * p; };

export function createPressureTime({ marks = () => [] } = {}) {
  // ── DOM ───────────────────────────────────────────
  const heroVal = h('b', { class: 'pt-num' }, '—');
  const heroSev = h('span', { class: 'pt-sev' });
  const heroDelta = h('span', { class: 'pt-delta' });
  // The header is one row on every screen: HVPG, the number, and the status over its trend.
  const hero = h('div', { class: 'pt-hero' }, h('span', { class: 'pt-k' }, 'HVPG'), h('span', { class: 'pt-v' }, heroVal, h('small', {}, 'mmHg')), h('span', { class: 'pt-st' }, heroSev, heroDelta));
  let range = 'beats', userRange = 'beats';
  const rangeSeg = h('div', { class: 'seg pt-range', role: 'group', 'aria-label': 'Time range' }, RANGES.map(([id, label]) =>
    h('button', { 'data-range': id, 'aria-pressed': String(id === range), onclick: () => { userRange = id; setRange(id); } }, label)));
  const cv = h('canvas', { role: 'img', 'aria-label': 'Pressure over time' });
  const box = h('div', { class: 'chart-box pt-box' }, cv);
  const chosen = new Set(TRACES.filter((t) => t.on).map((t) => t.id));
  const chips = h('div', { class: 'pt-chips', role: 'group', 'aria-label': 'Traces' }, TRACES.map((t) => {
    // Short names, so every chip fits; the full name is the tooltip and what a screen reader says.
    const b = h('button', { class: 'pt-chip', 'data-trace': t.id, 'aria-pressed': String(chosen.has(t.id)), title: t.label, 'aria-label': t.label, style: { '--chip': `var(${t.c})` } }, h('i'), t.abbr);
    b.addEventListener('click', () => {
      if (chosen.has(t.id)) chosen.delete(t.id); else chosen.add(t.id);
      b.setAttribute('aria-pressed', String(chosen.has(t.id)));
      draw();
    });
    return b;
  }));
  // The two lanes beside the pressures: the EKG strip (the beats range only) and the HVPG lane. Patients mode turns them on and off here; a slide's
  // card does not use the pills (hidden there): it takes both lanes where its room allows, as the slide's tool says (configure).
  let showEkg = false, showLane = true;
  let cfg = { ekg: true, lane: true };
  let before = null;   // (a slide's card: { fp, label }, where the patient stood before the slide's event, its delta; beat-card.js)   // (a slide's tool: ekg: false leaves the strip off, hvpgLane: false the HVPG lane)
  const laneChip = (key, label, title, on, set) => {
    const b = h('button', { class: 'pt-chip', 'data-lane': key, 'aria-pressed': String(on), title, 'aria-label': title, style: { '--chip': 'var(--text)' } }, h('i'), label);
    b.addEventListener('click', () => { set(b.getAttribute('aria-pressed') !== 'true'); b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); yr.pressure = yr.hvpg = null; draw(); });
    return b;
  };
  const ekgChip = laneChip('ekg', 'EKG', 'A schematic EKG over the pressures, timed to the model\'s heartbeat. On the 10 s range only.', false, (v) => { showEkg = v; });
  const laneChipBtn = laneChip('hvpg', 'HVPG lane', 'The HVPG lane under the pressures', true, (v) => { showLane = v; });
  chips.append(ekgChip, laneChipBtn);
  // Display only: averages away the heartbeat and breathing swings; the simulation is untouched.
  let smooth = false;
  const smoothBtn = h('button', { class: 'pt-chip pt-smooth', 'aria-pressed': 'false', title: 'Show the mean: hide beat-to-beat and breathing variation', onclick: () => {
    smooth = !smooth; yr.pressure = yr.hvpg = null; smoothBtn.setAttribute('aria-pressed', String(smooth)); draw();
  } }, 'Smooth');
  // Smooth and the range switch sit with the trace pills under the chart, together at the right end of the pills' last line.
  chips.append(h('div', { class: 'pt-ctl' }, smoothBtn, rangeSeg));
  const el = h('div', { class: 'pt' }, h('div', { class: 'pt-head' }, hero), box, chips);

  function setRange(id) {
    range = id;
    rangeSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === id)));
    ekgChip.disabled = id !== 'beats';   // (one beat is the strip's unit: over two minutes or days it has nothing to show)
    yr.pressure = yr.hvpg = null;
    draw();
  }

  // ── Buffers ───────────────────────────────────────
  // fine: every sample of the last few seconds; coarse: quarter-second bins (trough, peak, mean)
  // for the last two minutes; days: one point per simulated day.
  const fine = { t: [], ph: [], ...Object.fromEntries(KEYS.map((k) => [k, []])) };
  const beatClock = createBeatClock();   // (when the cardiac phase wrapped: each wrap starts a beat on the EKG strip)
  let coarse = [], bin = null;
  let days = [];
  let clock = 'hemo', dayNow = 0, lastT = -Infinity, frame = null, wallAt = 0;

  function resetBuffers() {
    for (const k of Object.keys(fine)) fine[k].length = 0;
    coarse = []; bin = null; lastT = -Infinity; beatClock.reset();
  }
  function clearHemo() { resetBuffers(); steadyAt = 0; }
  // On a slide each reading is its steady value, the mean over the last few seconds, so the lines' end labels, the header and
  // the tiles agree, and a laptop and a tablet show the same numbers whenever they are looked at. (The HVPG is the difference
  // of the two readings as shown, so WHVP − FHVP reads exactly.)
  const steady = {};
  let steadyAt = 0;
  function settle(m) {
    if (!m) return;
    const now = performance.now(), a = steadyAt ? 1 - Math.exp(-Math.min(1, (now - steadyAt) / 1000) / 2.5) : 1;
    steadyAt = now;
    for (const t of TRACES) { const v = t.day?.(m); if (Number.isFinite(v)) steady[t.id] = a < 1 && Number.isFinite(steady[t.id]) ? steady[t.id] + (v - steady[t.id]) * a : v; }
  }
  // (A slide pins the numbers its tiles show, its settled state: the ends and the header read those, so they match the tiles
  // to the digit on every screen. A trace with no tile number keeps its steady mean.)
  let pinned = null;
  const PIN = { CONF: 'pv', whvp: 'whvp', RHV: 'fhvp', RA: 'ra', IVCS: 'ivc' };
  const onSlide = () => !!cv.closest('.pz-tool');
  const endOf = (id) => (Number.isFinite(pinned?.[PIN[id]]) ? pinned[PIN[id]] : steady[id]);
  const steadyHvpg = () => tenthGap(endOf('whvp'), endOf('RHV'), frame.metrics.hvpg);
  // Samples (a frame's, or the history's) into the fine buffer, the quarter-second bins and the beat clock; the buffers keep a fixed window.
  function record(smp) {
    for (let i = 0; i < smp.t.length; i++) {
      const t = smp.t[i];
      if (t <= lastT) continue;
      lastT = t;
      fine.t.push(t); fine.ph.push(smp.ph?.[i] ?? NaN); beatClock.push(t, smp.ph?.[i]);
      for (const k of KEYS) fine[k].push(smp[k]?.[i] ?? NaN);
      const b0 = Math.floor(t / BIN) * BIN;
      if (!bin || bin.t !== b0) {
        if (bin) coarse.push(bin);
        bin = { t: b0, v: {} };
      }
      for (const k of KEYS) {
        const v = smp[k]?.[i];
        if (v == null || Number.isNaN(v)) continue;
        const s = bin.v[k] || (bin.v[k] = [v, v, 0, 0]);
        if (v < s[0]) s[0] = v; if (v > s[1]) s[1] = v; s[2] += v; s[3]++;
      }
    }
    let cut = 0; while (cut < fine.t.length && fine.t[cut] < lastT - FINE_S) cut++;
    if (cut) { for (const k of Object.keys(fine)) fine[k].splice(0, cut); beatClock.trim(fine.t[0]); }
    cut = 0; while (cut < coarse.length && coarse[cut].t < lastT - COARSE_S) cut++;
    if (cut) coarse.splice(0, cut);
  }
  function ingest(f) {
    frame = f; wallAt = performance.now();
    wake();
    if (f.clock !== 'disease') settle(f.metrics);
    if (f.clock !== clock) {
      clock = f.clock;
      // The disease clock is a trend: show it as one while it runs, then return to the learner's range.
      setRange(clock === 'disease' ? 'days' : userRange);
    }
    if (f.day !== dayNow) { clearHemo(); dayNow = f.day; }
    const smp = f.samples;
    if (smp && f.clock !== 'disease' && smp.t.length) {
      // A new patient or a step back in time restarts the engine clock: start a fresh trace.
      if (smp.t[0] < lastT - 1e-9) clearHemo();
      record(smp);
    }
    const m = f.metrics;
    const last = days[days.length - 1];
    if (last && f.day < last.day) days = [];
    if (!days.length || days[days.length - 1].day !== f.day) {
      days.push({ day: f.day, v: { hvpg: m.hvpg, ...Object.fromEntries(TRACES.filter((t) => t.day).map((t) => [t.id, t.day(m)])) } });
      if (days.length > 1500) days.shift();
    } else {
      // Keep today's point current (a treatment changes it without a new day).
      const d = days[days.length - 1];
      d.v.hvpg = m.hvpg;
      for (const t of TRACES) if (t.day) d.v[t.id] = t.day(m);
    }
  }

  // ── Series for the current range ──────────────────
  // Each series: { x: [...], mid: [...], lo?: [...], hi?: [...] } in the range's x units.
  function series(key, x0, x1 = Infinity) {
    if (!smooth || range === 'days') return rawSeries(key, x0, x1);
    // Average over the whole retained history (so the left edge is not a short window), twice,
    // then cut to the view: one pass leaves a ripple of the breathing rhythm at the newest end.
    const all = smoothed(smoothed(rawSeries(key, -Infinity, x1), SMOOTH_S), SMOOTH_S / 2);
    // Where the oldest samples lack a full window the average is lopsided: draw only from where it is complete.
    const from = Math.max(x0 - 0.05, (all.x[0] ?? 0) + SMOOTH_S * 1.5);
    let i = 0; while (i < all.x.length && all.x[i] < from) i++;
    return { x: all.x.slice(i), mid: all.mid.slice(i) };
  }
  // Trailing mean over w seconds, without the trough-to-peak band.
  function smoothed(s, w) {
    const out = { x: s.x, mid: new Array(s.x.length) };
    let j = 0, sum = 0, n = 0;
    for (let i = 0; i < s.x.length; i++) {
      const v = s.mid[i];
      if (!Number.isNaN(v)) { sum += v; n++; }
      while (s.x[j] < s.x[i] - w) { if (!Number.isNaN(s.mid[j])) { sum -= s.mid[j]; n--; } j++; }
      out.mid[i] = n ? sum / n : NaN;
    }
    return out;
  }
  function rawSeries(key, x0, x1) {
    if (range === 'beats') {
      // (The samples are in time order: the window is one run of them, found by bisection and copied whole.)
      const i0 = firstAtOrAbove(fine.t, x0 - 0.05), i1 = firstAbove(fine.t, x1);
      return i1 > i0 ? { x: fine.t.slice(i0, i1), mid: fine[key].slice(i0, i1) } : { x: [], mid: [] };
    }
    if (range === 'minutes') {
      const out = { x: [], mid: [], lo: [], hi: [] };
      const all = coarse; // the bin still filling has few samples and would wiggle at the tail
      for (const b of all) {
        const s = b.v[key];
        if (!s || b.t < x0 - BIN || b.t + BIN / 2 > x1) continue;
        out.x.push(b.t + BIN / 2); out.mid.push(s[2] / s[3]); out.lo.push(s[0]); out.hi.push(s[1]);
      }
      return out;
    }
    const out = { x: [], mid: [] };
    for (const d of days) if (d.v[key] != null && d.day >= x0) { out.x.push(d.day); out.mid.push(d.v[key]); }
    return out;
  }

  // ── Crosshair ─────────────────────────────────────
  let cross = null; // CSS px x within the canvas, or null
  const setCross = (e) => { const r = cv.getBoundingClientRect(); cross = e.clientX - r.left; draw(); };
  cv.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) setCross(e); });
  cv.addEventListener('pointerdown', (e) => { setCross(e); });
  for (const ev of ['pointerleave', 'pointercancel']) cv.addEventListener(ev, () => { cross = null; draw(); });
  cv.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') { cross = null; draw(); } });

  // ── Drawing ───────────────────────────────────────
  const yr = { pressure: null, hvpg: null }; // eased y ranges, so the axis glides instead of jumping
  // Sticky range: it only changes when the data leaves it (grow at once) or fills under 55% of it
  // (shrink), so the scale holds still while the trace scrolls.
  // The axis drawn glides to that range (τ 0.15 s) instead of rescaling in one frame; while it glides, a paused chart draws
  // itself again next frame (round 2 review, Over time y-axis).
  const ys = { pressure: null, hvpg: null }, ysAt = { pressure: 0, hvpg: 0 };
  let gliding = false, glideReq = false;
  function ease(key, lo, hi) {
    const r = yr[key];
    if (!r || lo < r[0] || hi > r[1] || hi - lo < (r[1] - r[0]) * 0.55) {
      const m = (hi - lo) * 0.08;
      yr[key] = [lo - m, hi + m];
    }
    const t = yr[key], now = performance.now();
    let sh = ys[key];
    if (!sh) sh = ys[key] = [t[0], t[1]];
    else {
      const k = -Math.expm1(-Math.min(0.1, (now - ysAt[key]) / 1000) / 0.15), snap = (t[1] - t[0]) * 0.002;
      for (let i = 0; i < 2; i++) sh[i] = Math.abs(t[i] - sh[i]) <= snap ? t[i] : sh[i] + (t[i] - sh[i]) * k;
      if (sh[0] !== t[0] || sh[1] !== t[1]) gliding = true;
    }
    ysAt[key] = now;
    return sh;
  }

  function hiddenSet() {
    const st = store.get();
    if (st.imaging) return new Set(['pv', 'trueHVPG', 'ra']);
    return hiddenNow(st) || new Set();
  }

  // Frames arrive ~10×/s in bursts; the right edge advances with the wall clock in between
  // (a little behind the newest sample), so the trace scrolls steadily instead of in steps.
  function headX() {
    if (lastT === -Infinity) return frame.t;
    if (!frame.running || clock === 'disease') return lastT;
    const rate = frame.speed || 1;
    return lastT - LAG_S * rate + Math.min((performance.now() - wallAt) / 1000, LAG_S) * rate;
  }
  // The scroll loop runs only while the trace is on screen and moving; the next sample (ingest) wakes it.
  let ticking = false, tickRaf = 0;   // (tickRaf: the loop's one frame asked for, let go with the chart)
  // On screen: kept by an observer, not read from cv.offsetParent, which forced a style and layout pass on every model frame
  // (the dock's chart wakes with each sample, shown or not).
  let seen = false;
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; wake(); }) : null;
  io?.observe(cv);
  const live = () => frame?.running && range !== 'days' && (io ? seen : cv.offsetParent) && !document.hidden;
  function tickLoop() {
    tickRaf = 0;
    if (!live()) { ticking = false; return; }
    tickRaf = nextFrame(tickLoop);
    draw();
  }
  function wake() { if (!ticking && live()) { ticking = true; tickRaf = nextFrame(tickLoop); } }

  function draw() {
    gliding = false;
    drawNow();
    if (gliding && !glideReq && !(ticking && live())) { glideReq = true; nextFrame(() => { glideReq = false; draw(); }); }
  }
  // ── The slide's card (beat-card.js) ───────────────
  // The paper's squares are 1 mmHg high, and as wide, so the EKG strip runs on into the pressures below it on one sheet. The wedged and free
  // hepatic pressures with the HVPG shaded between them in its status colour; the portal pressure dashed over the wedged (they read nearly
  // the same); a caliper at "now" spans the gap. Where the patient stood before the slide's event (the slide's delta), the two dotted lines
  // and the old gap faint grey behind, named once. The readings in a column beside, or on a narrow card one line on top and the values at
  // the lines' ends. Every number is the slide's own (pinned), as the tiles show it.
  const MMHG = 'mmHg';
  const HR_CUT = VITALS.find((v) => v.id === 'hr')?.cut ?? 110;
  function drawBeatCard(ctx, w, hh, x0, x1, xNow, FONT, noPv, { text, muted, faint, panel }) {
    const col = (v) => cssVar(v);
    const lay = beatLayout(w, hh, cfg.ekg), { L, R, top, bot } = lay, plotW = R - L;
    const X = (x) => L + ((x - x0) / Math.max(1e-9, x1 - x0)) * plotW;
    const wNow = endOf('whvp'), fNow = endOf('RHV'), pvNow = endOf('CONF'), hv = steadyHvpg();
    const hr = Number.isFinite(pinned?.hr) ? pinned.hr : frame.metrics.hr;
    const was = before?.fp, wWas = was?.whvp, fWas = was?.fhvp;
    const showWas = Number.isFinite(wWas) && Number.isFinite(fWas) && (Math.abs(wWas - wNow) >= 0.3 || Math.abs(fWas - fNow) >= 0.3);
    const data = { whvp: series('whvp', x0, x1), RHV: series('RHV', x0, x1), CONF: series('CONF', x0, x1) };
    let mx = -Infinity;
    for (const k of ['whvp', 'CONF']) { if (k === 'CONF' && noPv) continue; for (const v of data[k].mid) if (v > mx) mx = v; }
    const hi = beatTop([mx, wNow, noPv ? NaN : pvNow, showWas ? wWas : NaN]);
    const sq = (bot - top) / hi, Y = (v) => bot - v * sq;
    const wc = col('--tr-wedge'), fc = col('--tr-hv'), pc = col('--tr-pv');

    // the paper, from the plot's bottom left corner up through the strip: a heavy line every 5 squares
    const paperTop = lay.ekg ? lay.ekg.top : top;
    ctx.save(); ctx.beginPath(); ctx.rect(L, paperTop - 2, plotW, bot - paperTop + 2); ctx.clip();
    // (Its upright lines are laid on time, not on the card: the paper scrolls left with the traces, as a strip runs out of a monitor, Mohammad 29 Oct.)
    const pxS = plotW / Math.max(1e-9, x1 - x0), X0 = L - x0 * pxS, i0 = Math.floor((L - X0) / sq);
    ctx.lineWidth = 1;
    for (const heavy of [false, true]) {
      if (!heavy && !paperFine(sq)) continue;
      ctx.strokeStyle = cssAlpha('--danger', heavy ? 0.26 : 0.11); ctx.beginPath();
      for (let i = i0; X0 + i * sq <= R + 0.5; i++) { if ((((i % 5) + 5) % 5 === 0) !== heavy) continue; const x = Math.round(X0 + i * sq) + 0.5; if (x < L) continue; ctx.moveTo(x, paperTop - 2); ctx.lineTo(x, bot); }
      for (let j = 0; bot - j * sq >= paperTop - 2; j++) { if ((j % 5 === 0) !== heavy) continue; const y = Math.round(bot - j * sq) + 0.5; ctx.moveTo(L, y); ctx.lineTo(R, y); }
      ctx.stroke();
    }
    ctx.restore();
    ctx.font = FONT(500, 12); ctx.fillStyle = faint; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = 0; v <= hi; v += 5) ctx.fillText(String(v), L - 6, Y(v));
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    if (top - 10 > (lay.ekg ? lay.ekg.bot : 0)) ctx.fillText(MMHG, 8, top - 10);

    // the EKG strip, in the text colour, over the model's own beats
    if (lay.ekg && fine.t.length > 1) {
      const { top: et, bot: eb } = lay.ekg;
      // (lead II with its waves in seconds, not stretched to the beat: a narrow QRS, a rounded P and T; it ends at "now", with the pressures)
      const e = leadIISeries(beatClock.times, Math.max(x0, fine.t[0]), Math.min(x1, fine.t[fine.t.length - 1]), 60 / (hr > 20 ? hr : 70));
      const Ye = (v) => eb - 2 - ((v + 0.25) / 1.25) * (eb - et - 4);
      if (e.x.length > 1) {
        ctx.save(); ctx.beginPath(); ctx.rect(L, et - 2, plotW, eb - et + 4); ctx.clip();
        ctx.strokeStyle = text; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
        for (let i = 0; i < e.x.length; i++) ctx[i ? 'lineTo' : 'moveTo'](X(e.x[i]), Ye(e.v[i]));
        ctx.stroke(); ctx.restore();
      }
    }

    ctx.save(); ctx.beginPath(); ctx.rect(L, top - 6, plotW, bot - top + 8); ctx.clip();
    // before: the old gap faint grey, its edges dotted in the lines' own colours
    if (showWas) {
      ctx.fillStyle = cssAlpha('--text-3', 0.08); ctx.fillRect(L, Y(wWas), plotW, Y(fWas) - Y(wWas));
      ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.setLineDash([0.1, 4.5]);
      for (const [v, c] of [[wWas, wc], [fWas, fc]]) { ctx.strokeStyle = c; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(L + 1, Y(v)); ctx.lineTo(R, Y(v)); ctx.stroke(); }
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    // the HVPG, shaded between wedged and free in the colour of its status
    const sw = data.whvp, sf = data.RHV;
    if (sw.x.length > 1 && sw.x.length === sf.x.length) {
      ctx.globalAlpha = 0.12; ctx.fillStyle = col(`--${sevOf(hv)}`); ctx.beginPath();
      for (let i = 0; i < sw.x.length; i++) ctx[i ? 'lineTo' : 'moveTo'](X(sw.x[i]), Y(sw.mid[i]));
      for (let i = sf.x.length - 1; i >= 0; i--) ctx.lineTo(X(sf.x[i]), Y(sf.mid[i]));
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    }
    if (!noPv) { ctx.setLineDash([6, 4]); line(ctx, data.CONF, X, Y, pc, 2, plotW); ctx.setLineDash([]); }
    line(ctx, sw, X, Y, wc, 2, plotW);
    line(ctx, sf, X, Y, fc, 2, plotW);
    ctx.restore();

    // the old gap named once, on a plate, where no line passes under the words
    let wasBox = null;   // (the "before the bleed" plate, so the HVPG's own keeps clear of it)
    if (showWas && before.label) {
      ctx.font = FONT(500, 12);
      const tw = ctx.measureText(before.label).width, lx = L + 6, rx = lx + tw + 12;
      const spans = [];
      for (const s of noPv ? [sw, sf] : [sw, sf, data.CONF]) {
        let a = Infinity, b = -Infinity;
        for (let i = 0; i < s.x.length; i++) { const x = X(s.x[i]); if (x < lx - 2 || x > rx + 2) continue; const y = Y(s.mid[i]); if (y < a) a = y; if (y > b) b = y; }
        if (a <= b) spans.push([a - 2, b + 2]);
      }
      const ly = beforeLabelY(Y(wWas), Y(fWas), spans, top, bot);
      if (ly != null) {
        wasBox = [lx, ly, lx + tw + 12, ly + 18];
        ctx.fillStyle = panel; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(lx, ly, tw + 12, 18, 5) : ctx.rect(lx, ly, tw + 12, 18); ctx.fill();
        ctx.fillStyle = faint; ctx.textBaseline = 'middle'; ctx.fillText(before.label, lx + 6, ly + 9.5); ctx.textBaseline = 'alphabetic';
      }
    }

    // the caliper at "now", from the wedged to the free pressure
    if (Number.isFinite(wNow) && Number.isFinite(fNow)) {
      const cx = Math.round(R + 12) + 0.5, ya = Y(wNow), yb = Y(fNow);
      ctx.strokeStyle = text; ctx.lineWidth = 1.4; ctx.beginPath();
      ctx.moveTo(cx - 5, ya); ctx.lineTo(cx + 5, ya); ctx.moveTo(cx, ya); ctx.lineTo(cx, yb); ctx.moveTo(cx - 5, yb); ctx.lineTo(cx + 5, yb); ctx.stroke();
    }
    // the HVPG named in its gap, beside the caliper's end, so the chart reads without the column (Mohammad 29 Oct); left out where the gap is too low
    if (Number.isFinite(hv) && Number.isFinite(wNow) && Number.isFinite(fNow)) {
      const label = `HVPG ${fmt(hv, 1)}`, ym = (Y(wNow) + Y(fNow)) / 2;
      ctx.font = FONT(700, 13); const lw = ctx.measureText(label).width + 12;
      const lx = R - 8 - lw, clear = !wasBox || wasBox[2] + 6 < lx || wasBox[3] + 4 < ym - 10 || wasBox[1] - 4 > ym + 10;
      if (Y(fNow) - Y(wNow) >= 26 && R - L >= lw + 40 && clear) {
        ctx.fillStyle = panel; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(lx, ym - 10, lw, 20, 6) : ctx.rect(lx, ym - 10, lw, 20); ctx.fill();
        ctx.fillStyle = col(`--${sevOf(hv)}`); ctx.textBaseline = 'middle'; ctx.fillText(label, lx + 6, ym + 0.5); ctx.textBaseline = 'alphabetic';
      }
    }

    // time: every 2 s back from now
    ctx.font = FONT(500, 12); ctx.fillStyle = faint; ctx.textAlign = 'center';
    for (let s = 2; xNow - s > x0 + 1e-9; s += 2) { const xx = X(xNow - s); if (xx < L + 12) break; ctx.fillText(`−${s} s`, xx, hh - 8); }
    const nowX = X(xNow);
    ctx.textAlign = nowX > R - 14 ? 'right' : 'center'; ctx.fillStyle = muted; ctx.fillText('now', Math.min(nowX, R), hh - 8);
    ctx.textAlign = 'left';

    const sevC = col(`--${sevOf(hv)}`), hrC = hr >= HR_CUT ? col('--danger') : text;
    const hvWas = showWas ? tenthGap(wWas, fWas, was.hvpg) : was?.hvpg;
    const keyRows = [[pc, 'Portal vein', pvNow, true], [wc, 'Wedged', wNow, false], [fc, 'Free', fNow, false]].filter((r) => !(noPv && r[1] === 'Portal vein'));
    if (lay.wide) {
      // the column: heart rate, the HVPG and its status, then the three lines named, the quick check's way (hairlines between, no fills)
      const hrSince = sinceText(hr, was?.hr, 0), hvSince = sinceText(hv, hvWas, 1);
      const plan = colPlan(hh, !!(hrSince || hvSince)), k = plan.k, x = lay.colX, cw = w - x - 14, hair = cssAlpha('--text', 0.12);
      const rule = (y) => { ctx.strokeStyle = hair; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, Math.round(y) + 0.5); ctx.lineTo(x + cw, Math.round(y) + 0.5); ctx.stroke(); };
      const big = (y, v, unit, px, c) => {
        ctx.font = FONT(650, px); ctx.fillStyle = c; ctx.fillText(v, x, y);
        const vw = ctx.measureText(v).width; ctx.font = FONT(500, 12); ctx.fillStyle = faint; ctx.fillText(unit, x + vw + 6, y);
      };
      // (a change upward is the bad way for both: red; downward green)
      const since = (y, t) => { if (!t) return; ctx.font = FONT(600, 12); ctx.fillStyle = col(t.startsWith('▲') ? '--danger' : '--ok'); ctx.fillText(t, x, y); };
      let y = 26;
      ctx.font = FONT(600, 12); ctx.fillStyle = muted; ctx.fillText('HEART RATE', x, y);
      y += 32 * k; big(y, Number.isFinite(hr) ? fmt(hr, 0) : '—', '/min', Math.max(20, 28 * k), hrC);
      if (plan.deltas) { y += 20 * k; since(y, hrSince); }
      y += 14 * k; rule(y);
      y += 24 * k; ctx.font = FONT(600, 12); ctx.fillStyle = muted; ctx.fillText('HVPG', x, y);
      y += 36 * k; big(y, Number.isFinite(hv) ? fmt(hv, 1) : '—', 'mmHg', Math.max(22, 32 * k), text);
      y += 21 * k; ctx.font = FONT(600, 12); ctx.fillStyle = sevC; ctx.fillText(wordOf(hv), x, y);
      if (plan.deltas) { y += 18 * k; since(y, hvSince); }
      if (plan.rows) {
        y += 14 * k; rule(y);
        for (const [c, name, v, dashed] of keyRows) {
          y += 26 * k;
          ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.setLineDash(dashed ? [4, 3] : []);
          ctx.beginPath(); ctx.moveTo(x + 1, y - 4); ctx.lineTo(x + 12, y - 4); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'butt';
          ctx.font = FONT(500, 12); ctx.fillStyle = muted; ctx.fillText(name, x + 18, y);
          ctx.font = FONT(650, 12.5); ctx.fillStyle = text; ctx.textAlign = 'right'; ctx.fillText(Number.isFinite(v) ? fmt(v, 1) : '—', x + cw, y); ctx.textAlign = 'left';
          y += 10 * k; rule(y);
        }
      }
    } else {
      // a narrow card: the HVPG and its status on one line on top, the heart rate at its right; each line's value at its end
      const y = 24;
      ctx.font = FONT(600, 12); ctx.fillStyle = muted; ctx.fillText('HVPG', 8, y);
      let x = 8 + ctx.measureText('HVPG').width + 6;
      ctx.font = FONT(650, 17); ctx.fillStyle = text; const hvT = Number.isFinite(hv) ? fmt(hv, 1) : '—'; ctx.fillText(hvT, x, y); x += ctx.measureText(hvT).width + 4;
      ctx.font = FONT(500, 12); ctx.fillStyle = faint; ctx.fillText(MMHG, x, y); x += ctx.measureText(MMHG).width + 8;
      ctx.font = FONT(600, 12); ctx.fillStyle = sevC; ctx.fillText(wordOf(hv), x, y);
      const hrT = Number.isFinite(hr) ? fmt(hr, 0) : '—';
      ctx.textAlign = 'right'; ctx.font = FONT(650, 13); ctx.fillStyle = hrC; ctx.fillText(hrT, w - 8, y);
      const hw = ctx.measureText(hrT).width; ctx.font = FONT(600, 12); ctx.fillStyle = muted; ctx.fillText('HR', w - 12 - hw, y); ctx.textAlign = 'left';
      const es = keyRows.map(([c, name, v]) => ({ c, v, y: Y(v), label: name === 'Portal vein' ? 'PV' : name === 'Wedged' ? 'WHVP' : 'FHVP' })).filter((e) => Number.isFinite(e.v)).sort((a, b) => a.y - b.y);
      for (let i = 1; i < es.length; i++) es[i].y = Math.max(es[i].y, es[i - 1].y + 16);
      const over = es.length ? es[es.length - 1].y - bot : 0;
      if (over > 0) for (const e of es) e.y -= over;
      ctx.textBaseline = 'middle';
      for (const e of es) {
        ctx.fillStyle = e.c; ctx.fillRect(R + 22, e.y - 1.5, 9, 3);
        const vt = fmt(e.v, 1); ctx.font = FONT(650, 12.5); ctx.fillStyle = text; ctx.fillText(vt, R + 35, e.y);
        ctx.font = FONT(600, 12); ctx.fillStyle = e.c; ctx.fillText(e.label, R + 39 + ctx.measureText(vt).width, e.y);
      }
      ctx.textBaseline = 'alphabetic';
    }
  }

  function drawNow() {
    const { ctx, w, h: hh } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, hh);
    if (w < 10 || hh < 10 || !frame) return;
    const col = (v) => cssVar(v);
    // (The plot is one rounded panel the chart's full width, his G2 look, plot-look.js, in the app's tile tone: what must hide a line or ring a dot
    // there, a label's plate, a dot's ring, a marker's halo, takes the panel's tone so no patch shows; the readout card keeps the surface tone.)
    const text = col('--text'), muted = col('--text-2'), faint = col('--text-3'), grid = col('--grid'), surface = col('--surface'), panel = col('--surface-2'), gridOn = col('--border-strong');
    plotFill(ctx, 0, 0, w, hh, panel);
    const hidden = hiddenSet();
    const showHvpg = !hidden.has('trueHVPG');
    const slide = onSlide();   // (a slide's card: its own window, one scale, steady readings and larger lettering, below)
    // (A slide's pressure lane holds the portal pressure alone: the wedged and free lines go, since the HVPG lane under it is their difference.)
    const traces = TRACES.filter((t) => chosen.has(t.id) && !hidden.has(t.hide) && (range !== 'days' || t.day) && (!slide || t.id === 'CONF'));
    const FONT = (wt, px) => FONT0(wt, slide ? px * 13 / 12 : px);
    const narrow = w < 460, tiny = !slide && w < 300 && (hh - 52) * 0.55 >= traces.length * 27;   // (tiny: a tablet's card with its tiles beside; each end's name goes under its value, where the lane has room to stack them)
    // (The numbers stand inside the panel's edge, 8 px in, and the readings at the right end keep 8 px or more of it: so L = 36, R a few px wider than before, B 2 more for the times' own room.)
    const L = 36, R = tiny ? 62 : narrow ? (slide ? 100 : 94) : 104, B = 24, GAP = slide ? 30 : 16;   // (a slide's lanes stand apart, the lower one named)
    let T = 30;
    const plotW = w - L - R;

    // x range
    let x0, x1, xNow;
    if (range === 'days') {
      if (days.length < 2) {
        ctx.fillStyle = faint; ctx.font = FONT(500, 13); ctx.textAlign = 'center';
        ctx.fillText('Advance the disease clock (+1 wk, +1 mo, +6 mo)', w / 2, hh / 2 - 8);
        ctx.fillText('to follow pressure over days and months.', w / 2, hh / 2 + 12);
        return;
      }
      x1 = xNow = days[days.length - 1].day;
      const first = days[0].day;
      x0 = Math.max(first, x1 - 730);
      if (x1 - x0 < 14) x0 = x1 - 14;
    } else {
      // (A slide's beat-by-beat card shows the last 5 s, Mohammad 29 Oct: 10 s was too much; the Patients chart keeps its 10 s.)
      const beatCard = slide && range === 'beats' && showHvpg;
      const span = beatCard ? BEAT_CARD_S : RANGES.find((r) => r[0] === range)[2];
      xNow = headX();
      x1 = xNow; x0 = x1 - span;
      // (On a slide the window starts where its record does: a slide just arrived has no empty left part. Not the beat-by-beat card: like a
      // monitor its readings come in at "now" on the right and run left from the first frame, Mohammad 29 Oct.)
      if (slide && !beatCard) {
        const firstIn = (q) => { for (let i = 0; i < q.x.length; i++) if (Number.isFinite(q.mid[i])) return q.x[i]; return Infinity; };   // (its first reading in the window: after a restart, or a stall that dropped samples, the window starts there)
        const first = Math.min(...[...traces.map((t) => t.id), 'hvpg'].map((k) => firstIn(series(k, x0, x1))));
        // (The scale stays fixed: recording starts at the left edge and fills to the right, then scrolls left.)
        if (Number.isFinite(first) && first > x0) { x0 = first; x1 = first + span; }
      }
    }
    const X = (x) => L + ((x - x0) / Math.max(1e-9, x1 - x0)) * plotW;
    // (A slide's card, with the HVPG measured: the wedged and free pressures on EKG paper, beat-card.js. Any other card, as before.)
    if (slide && range === 'beats' && showHvpg) { drawBeatCard(ctx, w, hh, x0, x1, xNow, FONT, hidden.has('pv'), { text, muted, faint, panel }); return; }

    if (!traces.length && !showHvpg) {
      ctx.fillStyle = faint; ctx.font = FONT(500, 13); ctx.textAlign = 'center';
      ctx.fillText(store.get().imaging ? 'Pressures are not measured in this case.' : 'Choose a trace below.', w / 2, hh / 2);
      return;
    }

    // Marker labels stack in up to three rows, so each stays readable; the plot starts below them.
    const markLayout = layoutMarkers(markers(x0, x1), X, w - 8);
    const T0 = Math.max(T, 30 + markLayout.rows * ROW);
    // lanes: the EKG strip (the last beats only) over the pressures over the HVPG lane; where the room is short the strip goes first, then the lane
    // (trace-lanes.js). The strip stands at the very top when no marker labels need the space there, so it never sits under them.
    const EGAP = slide ? 22 : 16;
    const wantLane = showHvpg && (slide ? cfg.lane : showLane || !traces.length);
    const wantEkg = range === 'beats' && (slide ? cfg.ekg : showEkg);
    const want = { pressure: traces.length > 0, hvpg: wantLane, gap: GAP, egap: EGAP, two: slide ? 0.66 : 0.64 };   // (two lanes: a slide's pressure lane holds the portal vein alone but keeps two thirds, as the dock's keeps 0.64)
    let plan = wantEkg ? laneRoom(hh - (markLayout.rows ? T0 : 10) - B, { ...want, ekg: true }) : null;
    if (plan?.ekg) T = markLayout.rows ? T0 : 10; else { T = T0; plan = laneRoom(hh - T - B, want); }
    const lanes = [];
    let ey = T;
    const ekgLane = plan.ekg ? { key: 'ekg', top: ey, bot: (ey += plan.ekg) } : null;
    if (ekgLane) ey += EGAP;
    if (plan.pressure) { lanes.push({ key: 'pressure', top: ey, bot: ey + plan.pressure }); ey += plan.pressure + GAP; }
    if (plan.hvpg) lanes.push({ key: 'hvpg', top: ey, bot: ey + plan.hvpg });
    // (On a slide both lanes start at zero and end on a round number above every reading, with a tick at the top.)
    const top0 = (key) => { let mx = -Infinity; for (const k of key === 'pressure' ? traces.map((t) => t.id) : ['hvpg']) { const q = series(k, -Infinity, x1); for (let i = 0; i < q.x.length; i++) mx = Math.max(mx, q.hi ? q.hi[i] : q.mid[i]); }
      mx = Math.max(mx, ...(key === 'pressure' ? traces.map((t) => endOf(t.id)) : [steadyHvpg()]).filter(Number.isFinite));   // (and the numbers written at the ends: a reading never sits above its lane)
      return key === 'hvpg' ? Math.max(15, Math.ceil(((Number.isFinite(mx) ? mx : 0) + 3) / 5) * 5) : Math.max(10, Math.ceil(((Number.isFinite(mx) ? mx : 10) * 1.1) / 5) * 5); };
    const fixed = slide ? { pressure: [0, top0('pressure')], hvpg: [0, top0('hvpg')] } : null;

    const data = Object.fromEntries([...traces.map((t) => t.id), 'hvpg'].map((k) => [k, series(k, x0, x1)]));
    const hv = Math.max(0, frame.metrics.hvpg);
    const sevCol = col(`--${sevOf(hv) === 'ok' ? 'ok' : sevOf(hv)}`);
    const ends = [];
    const crossRows = [];
    const cx = cross != null && cross >= L && cross <= L + plotW ? cross : null;
    const xAtCross = cx != null ? x0 + ((cx - L) / plotW) * (x1 - x0) : null;
    const recent = (s) => { // mean over the last second (the last day on the disease clock)
      const n = s.x.length; if (range === 'days') return s.mid[n - 1];
      const from = s.x[n - 1] - 1; let sum = 0, k = 0;
      for (let i = n - 1; i >= 0 && s.x[i] >= from; i--) if (!Number.isNaN(s.mid[i])) { sum += s.mid[i]; k++; }
      return k ? sum / k : s.mid[n - 1];
    };
    const at = (s, x) => { // value of a series at x (nearest sample)
      if (!s.x.length) return null;
      let lo = 0, hi = s.x.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s.x[m] < x) lo = m; else hi = m; }
      const i = Math.abs(s.x[lo] - x) < Math.abs(s.x[hi] - x) ? lo : hi;
      return Math.abs(s.x[i] - x) > (x1 - x0) * 0.03 ? null : s.mid[i];
    };

    for (const lane of lanes) {
      const { top, bot } = lane;
      const keys = lane.key === 'pressure' ? traces.map((t) => t.id) : ['hvpg'];
      let mn = Infinity, mx = -Infinity;
      for (const k of keys) {
        // (The whole record up to the right edge, read in place: building it as a series on every frame cost more than drawing.)
        if (range === 'beats' && !smooth) {
          const v = fine[k], n = firstAbove(fine.t, x1);
          for (let i = 0; i < n; i++) { const a = v[i]; if (a < mn) mn = a; if (a > mx) mx = a; }
          continue;
        }
        if (range === 'minutes' && !smooth) {
          for (const b of coarse) {
            const q = b.v[k];
            if (!q || b.t + BIN / 2 > x1) continue;
            if (q[0] < mn) mn = q[0]; if (q[1] > mx) mx = q[1];
          }
          continue;
        }
        const s = range === 'days' ? data[k] : series(k, -Infinity, x1);
        for (let i = 0; i < s.x.length; i++) {
          const a = s.lo ? s.lo[i] : s.mid[i], b = s.hi ? s.hi[i] : s.mid[i];
          if (a < mn) mn = a; if (b > mx) mx = b;
        }
      }
      if (!Number.isFinite(mn)) { mn = 0; mx = 10; }
      let lo, hi;
      if (lane.key === 'hvpg') { lo = 0; hi = Math.max(16, Math.ceil((mx + 3) / 4) * 4); }
      else {
        const pad = Math.max(1.5, (mx - mn) * 0.1);
        lo = Math.max(lane.key === 'pressure' && mn >= 0 ? 0 : -Infinity, mn - pad); hi = mx + pad;
      }
      [lo, hi] = fixed ? fixed[lane.key] : ease(lane.key, lo, hi);
      const tick = fixed ? [5, 10, 20, 25, 50].find((t) => hi % t === 0 && (bot - top) * t / hi >= 15) ?? hi : nice(hi - lo, (bot - top) > 120 ? 4 : 2);   // (a slide's ticks end on its top line, never closer than 15 px)
      const Y = (v) => bot - ((v - lo) / Math.max(1e-6, hi - lo)) * (bot - top);
      lane.Y = Y;

      // grid
      ctx.lineWidth = 1; ctx.font = FONT(500, 12); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let v = Math.ceil(lo / tick) * tick; v <= hi + 1e-9; v += tick) {
        const yy = Math.round(Y(v)) + 0.5;
        ctx.strokeStyle = gridOn; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(L + plotW, yy); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.fillStyle = faint; ctx.fillText(fmt(v, tick < 1 ? 1 : 0), L - 6, yy);
      }
      ctx.textBaseline = 'alphabetic';

      ctx.save(); ctx.beginPath(); ctx.rect(L, top - 2, plotW, bot - top + 4); ctx.clip();
      if (lane.key === 'hvpg') {
        // clinical thresholds
        const roomy = bot - top > 90;
        // (Every dashed line first, then the labels on their plates, so no later line crosses an earlier label.)
        const labs = [];
        for (const [v, label] of LIMITS) {
          if (v > hi || (v === 5 && !roomy && !slide)) continue;   // (a slide keeps all three faint lines, 5, 10 and 12, as the talk trace's lane does)
          const yy = Math.round(Y(v)) + 0.5;
          ctx.strokeStyle = col(v >= 10 ? '--danger' : '--caution'); ctx.globalAlpha = v >= 10 ? 0.5 : 0.35;
          ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(L + plotW, yy); ctx.stroke(); ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          if (label && !narrow && (slide ? roomy || v === 12 : roomy || v === 10)) labs.push([label, yy]);   // (a slide's short lane names the cut-offs once, at 12)
        }
        let prevLab = null;   // (the label drawn last: one that would sit on it moves along its own line, past its right end)
        for (const [label, yy] of labs) {
          ctx.font = FONT(600, 12); const tw = ctx.measureText(label).width;
          const lx = labelX(prevLab, yy, L + 6);
          ctx.fillStyle = panel; ctx.fillRect(lx, yy - 6, tw + 8, 12);
          ctx.fillStyle = col('--danger'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(label, lx + 4, yy); ctx.textBaseline = 'alphabetic';
          prevLab = { x1: lx + tw + 8, y: yy };
        }
        const s = data.hvpg;
        if (s.x.length > 1) {
          // area under the gradient, in the color of its current status
          const g = ctx.createLinearGradient(0, top, 0, bot);
          g.addColorStop(0, sevCol); g.addColorStop(1, 'transparent');
          ctx.globalAlpha = 0.14; ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(X(s.x[0]), Y(0));
          for (let i = 0; i < s.x.length; i++) ctx.lineTo(X(s.x[i]), Y(s.mid[i]));
          ctx.lineTo(X(s.x[s.x.length - 1]), Y(0)); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
          if (s.lo) band(ctx, s, X, Y, text, 0.1);
          line(ctx, s, X, Y, text, 1.75, plotW);
          const e = range === 'days' ? recent(s) : slide ? steadyHvpg() : hv; ends.push({ y: Y(e), v: e, label: 'HVPG', c: text, lane });   // (the header's own reading)
        }
      } else {
        // the HVPG itself, shaded between wedged and free hepatic pressure
        const sw = data.whvp, sf = data.RHV;
        if (sw && sf && sw.x.length > 1 && sw.x.length === sf.x.length) {
          ctx.globalAlpha = 0.1; ctx.fillStyle = sevCol; ctx.beginPath();
          for (let i = 0; i < sw.x.length; i++) ctx[i ? 'lineTo' : 'moveTo'](X(sw.x[i]), Y(sw.mid[i]));
          for (let i = sf.x.length - 1; i >= 0; i--) ctx.lineTo(X(sf.x[i]), Y(sf.mid[i]));
          ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
        }
        for (const t of traces) {
          const s = data[t.id];
          if (s.x.length < 1) continue;
          const c = col(t.c);
          if (s.lo) band(ctx, s, X, Y, c, 0.16);
          line(ctx, s, X, Y, c, t.id === 'CONF' ? 2 : 1.75, plotW);
          if (range === 'days' && s.x.length < 60) dots(ctx, s, X, Y, c, panel);
          const e = range === 'days' ? recent(s) : (slide && Number.isFinite(endOf(t.id)) ? endOf(t.id) : t.day?.(frame.metrics)) ?? recent(s); ends.push({ y: Y(range !== 'days' && slide && Number.isFinite(recent(s)) ? recent(s) : e), v: e, label: t.abbr, c, lane });   // (on a slide, written at the line's end, its steady number; the live readings, so wedged − free is the header's HVPG)
        }
      }
      ctx.restore();
      if (xAtCross != null) for (const k of keys) {
        const v = at(data[k], xAtCross);
        if (v == null) continue;
        const t = TRACES.find((x) => x.id === k);
        crossRows.push({ label: t ? t.short : 'HVPG', v, c: t ? col(t.c) : text, y: Y(v) });
      }
    }

    // The EKG strip: a schematic rhythm laid over the model's own beats (ekg.js), in the app's text colour, one QRS to a beat. Its end reading is the heart rate
    // (a slide's, the tile's own number).
    if (ekgLane && fine.t.length > 1) {
      const { top, bot } = ekgLane, mid = Math.round((top + bot) / 2);
      const hr = slide && Number.isFinite(pinned?.hr) ? pinned.hr : frame.metrics.hr;
      const e = ekgSeries(beatClock.times, Math.max(x0, fine.t[0]), x1, 60 / (hr > 20 ? hr : 70));
      const Ye = (v) => bot - 3 - ((v + 0.3) / 1.3) * (bot - top - 6);   // (the S wave's dip to the R peak fill the lane)
      if (e.x.length > 1) {
        ctx.save(); ctx.beginPath(); ctx.rect(L, top - 2, plotW, bot - top + 4); ctx.clip();
        ctx.strokeStyle = text; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
        for (let i = 0; i < e.x.length; i++) ctx[i ? 'lineTo' : 'moveTo'](X(e.x[i]), Ye(e.v[i]));
        ctx.stroke(); ctx.restore();
      }
      ctx.font = FONT(500, 12); ctx.fillStyle = faint; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('EKG', 8, mid); ctx.textBaseline = 'alphabetic';
      if (Number.isFinite(hr)) ends.push({ y: mid, v: hr, dec: 0, label: 'HR', c: text, lane: ekgLane });
    }
    ctx.font = FONT(500, 12); ctx.fillStyle = faint; ctx.textAlign = 'left'; ctx.fillText('mmHg', 8, (lanes[0] ? lanes[0].top : T) - (ekgLane ? 8 : 12));
    if (slide && lanes.length > 1) ctx.fillText('HVPG, mmHg', 8, lanes[1].top - 10);

    // markers: learner changes and events, where they happened
    const allBot = drawMarkers(markLayout, ekgLane ? [ekgLane, ...lanes] : lanes);

    // live values at the right edge, nudged apart where they would collide (per lane)
    for (const lane of ekgLane ? [ekgLane, ...lanes] : lanes) {
      const es = ends.filter((e) => e.lane === lane).sort((a, b) => a.y - b.y);
      for (let i = 1; i < es.length; i++) es[i].y = Math.max(es[i].y, es[i - 1].y + (tiny ? 27 : slide ? 18 : 15));
      const over = es.length ? Math.min(es[es.length - 1].y - lane.bot, es[0].y - (lane.top + 4)) : 0;   // (lifted only as far as the top allows: a short lane lets its last label hang below rather than pile the readings on each other)
      if (over > 0) for (const e of es) e.y -= over;
      for (const e of es) {
        const yy = Math.max(lane.top + 4, e.y);
        ctx.fillStyle = e.c; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(L + plotW + 4, yy - 1.5, 10, 3, 1.5) : ctx.rect(L + plotW + 4, yy - 1.5, 10, 3); ctx.fill();   // (a short stroke in the trace's colour, not a dot)
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.font = FONT(650, 12.5); ctx.fillStyle = text;
        const vt = fmt(e.v, e.dec ?? 1);
        ctx.fillText(vt, L + plotW + 17, yy);
        // Each line is named at its end (PV, WHVP, FHVP, HVPG), on every screen.
        const vw = ctx.measureText(vt).width; ctx.font = FONT(600, 12); ctx.fillStyle = e.c === text ? muted : e.c;
        if (tiny) ctx.fillText(e.label, L + plotW + 17, yy + 12); else ctx.fillText(e.label, L + plotW + 20 + vw, yy);
        ctx.textBaseline = 'alphabetic';
      }
    }

    // time axis
    ctx.fillStyle = faint; ctx.font = FONT(500, 12); ctx.textAlign = 'center';
    const span = x1 - x0;
    if (range === 'days') {
      const step = nice(span, narrow ? 3 : 5);
      for (let d = Math.ceil(x0 / step) * step; d <= x1 + 1e-9; d += step) { const xx = X(d); if (xx > L + 20 && xx < L + plotW - 30) ctx.fillText(`Day ${Math.round(d)}`, xx, hh - 8); }
      ctx.textAlign = 'right'; ctx.fillStyle = muted; ctx.fillText(`Day ${Math.round(x1)}`, L + plotW, hh - 8);
    } else {
      const step = range === 'beats' ? (narrow ? 5 : 2) : (narrow ? 60 : 30);
      for (let s = step; xNow - s > x0 + 1e-9; s += step) {
        const xx = X(xNow - s);
        if (xx < L + 12) break;
        ctx.fillText(range === 'beats' ? `−${s} s` : s % 60 === 0 ? `−${s / 60} min` : `−${s} s`, xx, hh - 8);
      }
      const nowX = X(xNow);
      ctx.textAlign = nowX > L + plotW - 14 ? 'right' : 'center'; ctx.fillStyle = muted; ctx.fillText('now', Math.min(nowX, L + plotW), hh - 8);
    }

    // crosshair and its readout card
    if (cx != null && crossRows.length) {
      ctx.strokeStyle = text; ctx.globalAlpha = 0.3; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(cx) + 0.5, (ekgLane || lanes[0]).top); ctx.lineTo(Math.round(cx) + 0.5, allBot); ctx.stroke(); ctx.globalAlpha = 1;
      for (const r of crossRows) { ctx.fillStyle = panel; ctx.beginPath(); ctx.arc(cx, r.y, 4.5, 0, 7); ctx.fill(); ctx.fillStyle = r.c; ctx.beginPath(); ctx.arc(cx, r.y, 3, 0, 7); ctx.fill(); }
      const when = range === 'days' ? `Day ${Math.round(xAtCross)}` : Math.abs(xNow - xAtCross) < 0.05 ? 'now' : `${fmt(xNow - xAtCross, range === 'beats' ? 1 : 0)} s ago`;
      ctx.font = FONT(600, 12);
      const rowH = 18, padX = 10;
      const cw = Math.max(ctx.measureText(when).width, ...crossRows.map((r) => { ctx.font = FONT(500, 12); return ctx.measureText(`${r.label}  ${fmt(r.v, 1)}`).width + 14; })) + padX * 2;
      const ch = 12 + rowH * (crossRows.length + 1);
      let bx = cx + 14; if (bx + cw > L + plotW) bx = cx - 14 - cw;
      const by = clamp(lanes[0].top, 4, hh - ch - 4);
      drawShadow(ctx, bx, by, cw, ch);
      ctx.fillStyle = surface;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, cw, ch, 10) : ctx.rect(bx, by, cw, ch); ctx.fill();
      ctx.strokeStyle = grid; ctx.stroke();
      ctx.textAlign = 'left'; ctx.fillStyle = muted; ctx.font = FONT(600, 12); ctx.fillText(when, bx + padX, by + 18);
      crossRows.forEach((r, i) => {
        const yy = by + 18 + rowH * (i + 1);
        ctx.fillStyle = r.c; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx + padX - 1, yy - 5.5, 9, 3, 1.5) : ctx.rect(bx + padX - 1, yy - 5.5, 9, 3); ctx.fill();
        ctx.fillStyle = muted; ctx.font = FONT(500, 12); ctx.fillText(r.label, bx + padX + 12, yy);
        ctx.fillStyle = text; ctx.font = FONT(650, 12); ctx.textAlign = 'right'; ctx.fillText(fmt(r.v, 1), bx + cw - padX, yy); ctx.textAlign = 'left';
      });
    }
  }

  // The readout card's shadow: a blur drawn once per card size and screen density into a small picture and laid under the
  // card, instead of the browser blurring it again on every frame the crosshair shows while the model runs (shadowBlur is the
  // one costly 2D call in this chart). The card's own fill, edge and words are still drawn live. The picture is laid at the
  // card's fractional place, so a blur may land a fraction of a pixel off its old rendering; the card itself is unchanged.
  const SH_PAD = 40, shadows = new Map();
  function drawShadow(ctx, bx, by, cw, ch) {
    const m = ctx.getTransform(), dpr = m.a || 1, key = `${cw}|${ch}|${dpr}`;
    let pic = shadows.get(key);
    if (!pic) {
      if (shadows.size > 24) shadows.clear();
      const W = Math.ceil((cw + 2 * SH_PAD) * dpr), H = Math.ceil((ch + 2 * SH_PAD) * dpr);
      pic = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
      const c = pic.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      // (the card itself is drawn a picture's width to the left, outside it, and only its shadow lands in it: the same blur and
      // offset as before, in a canvas with the same transform; offsets are not scaled by it)
      c.fillStyle = cssAlpha('--black', 0.14); c.shadowColor = cssAlpha('--black', 0.14); c.shadowBlur = 16; c.shadowOffsetX = W; c.shadowOffsetY = 4;
      c.beginPath(); c.roundRect ? c.roundRect(SH_PAD - W / dpr, SH_PAD, cw, ch, 10) : c.rect(SH_PAD - W / dpr, SH_PAD, cw, ch); c.fill();
      shadows.set(key, pic);
    }
    ctx.drawImage(pic, 0, 0, pic.width, pic.height, bx - SH_PAD, by - SH_PAD, pic.width / dpr, pic.height / dpr);
  }

  // Markers a few pixels apart (several changes made at once) share one dot and one label ("… +2").
  // Each label takes the highest row where it clears the labels already placed, right of its dot or
  // else left of it. Labels are drawn on a halo, so the dotted lines of other markers pass behind
  // them. With no row free the marker keeps its line and a dot at the top of the plot, unlabelled.
  const ROW = 13, MAX_ROWS = 4;
  // (wrapLabel: a long label wraps between words onto the rows below, never cut with an ellipsis.) Cached per label and room.
  const wrapped = new Map();
  function wrapOf(ctx, lab, maxW) {
    const key = `${lab}|${maxW}`;
    if (!wrapped.has(key)) { if (wrapped.size > 200) wrapped.clear(); wrapped.set(key, wrapLabel(lab, maxW, (t) => ctx.measureText(t).width)); }
    return wrapped.get(key);
  }
  function layoutMarkers(ms, X, right) {
    if (!ms.length) return { groups: [], rows: 0 };   // (no markers in the window, the common case and every slide's: the font below cost each frame a font lookup for nothing)
    const ctx = cv.getContext('2d');
    ctx.font = FONT(600, 12);
    const groups = [];
    for (const mk of ms) {
      const xx = Math.round(X(mk.x)) + 0.5, g = groups[groups.length - 1];
      if (g && xx - g.xx < 6) { g.n++; if (!g.sev && mk.sev) g.sev = mk.sev; continue; }
      groups.push({ xx, label: mk.label, sev: mk.sev, n: 1, row: -1, text: null });
    }
    const spans = [];   // placed labels: { x0, x1, row }
    const maxW = Math.min(170, (right - 40) * 0.6);
    for (const g of groups) {
      const lab = g.label ? g.label + (g.n > 1 ? ` +${g.n - 1}` : '') : g.n > 1 ? `${g.n} changes` : '';
      const fit = lab && wrapOf(ctx, lab, maxW);
      if (!fit) continue;
      const tw = fit.w, n = fit.lines.length;
      place: for (let r = 0; r + n <= MAX_ROWS; r++) for (const toRight of [true, false]) {
        const x0 = toRight ? g.xx - 4 : g.xx - 11 - tw, x1 = toRight ? g.xx + 7 + tw : g.xx + 4;
        if (x1 > right || x0 < 8) continue;
        if (spans.some((sp) => sp.row >= r && sp.row < r + n && x0 < sp.x1 + 8 && x1 > sp.x0 - 8)) continue;
        g.row = r; g.text = fit.lines; g.toRight = toRight;
        for (let i = 0; i < n; i++) spans.push({ x0, x1, row: r + i });
        break place;
      }
    }
    const rows = Math.max(groups.length ? 1 : 0, ...groups.map((g) => g.row + (g.text ? g.text.length : 1)));
    return { groups, rows };
  }
  function drawMarkers({ groups }, lanes) {
    const ctx = cv.getContext('2d');
    const top = lanes[0].top, allBot = lanes[lanes.length - 1].bot;
    const muted = cssVar('--text-2'), halo = cssVar('--surface-2');
    const colOf = (g) => cssVar(g.sev ? `--${g.sev}` : '--accent');
    const yOf = (g) => (g.row >= 0 ? 14 + g.row * ROW : top - 8);
    for (const g of groups) {
      ctx.strokeStyle = colOf(g); ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(g.xx, yOf(g) + 4); ctx.lineTo(g.xx, allBot); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.font = FONT(600, 12); ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const g of groups) {
      const y = yOf(g);
      ctx.fillStyle = colOf(g); ctx.beginPath(); ctx.arc(g.xx, y, 3, 0, 7); ctx.fill();
      if (!g.text) continue;
      ctx.textAlign = g.toRight ? 'left' : 'right';
      const tx = g.toRight ? g.xx + 7 : g.xx - 7;
      g.text.forEach((line, i) => {
        ctx.strokeStyle = halo; ctx.lineWidth = 4; ctx.strokeText(line, tx, y + i * ROW + 0.5);
        ctx.fillStyle = muted; ctx.fillText(line, tx, y + i * ROW + 0.5);
      });
    }
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.lineWidth = 1;
    return allBot;
  }
  function markers(x0, x1) {
    const out = [];
    for (const e of marks()) {
      if (e.kind === 'start') continue;
      let x;
      if (range === 'days') x = e.day + (e.t || 0) / 86400;
      else { if (e.day !== dayNow) continue; x = e.t; }
      if (x == null || x < x0 || x > x1) continue;
      out.push({ x, label: e.label || '', sev: e.kind === 'event' ? (e.sev === 'info' ? null : e.sev) : null });
    }
    return out;
  }

  // ── Header readout ────────────────────────────────
  let lastAria = '';
  function updateHero() {
    const hidden = hiddenSet();
    if (hidden.has('trueHVPG')) {
      const meas = store.get().lastHVPG;
      heroVal.textContent = meas ? fmt(meas.hvpg, 1) : '—';
      heroSev.textContent = meas ? 'Measured' : 'Not measured';
      heroSev.dataset.sev = meas ? sevOf(meas.hvpg) : 'none';
      heroDelta.textContent = '';
      return;
    }
    const v = onSlide() && Number.isFinite(endOf('whvp')) ? steadyHvpg() : frame.metrics.hvpg;
    const txt = fmt(v, 1);
    if (heroVal.textContent !== txt) heroVal.textContent = txt;
    const word = wordOf(v);
    if (heroSev.textContent !== word) heroSev.textContent = word;
    heroSev.dataset.sev = sevOf(v);
    // change across the range on screen
    let d = null, over = '';
    if (range === 'days' && days.length > 1) {
      const first = days.find((x) => x.day >= days[days.length - 1].day - 730) || days[0];
      d = v - first.v.hvpg; over = `since day ${first.day}`;
    } else if (range !== 'days' && coarse.length > 60) {
      const first = coarse.find((x) => x.t >= lastT - 120);
      const win = coarse.filter((x) => x.t >= first.t && x.t < first.t + 1 && x.v.hvpg);
      const now = coarse.filter((x) => x.t >= lastT - 1 && x.v.hvpg);
      const mean = (bs) => bs.reduce((a, b) => a + b.v.hvpg[2] / b.v.hvpg[3], 0) / bs.length;
      if (win.length && now.length) { d = mean(now) - mean(win); over = lastT - first.t > 100 ? 'in 2\u00a0min' : `in ${Math.round(lastT - first.t)}\u00a0s`; }   // (a number keeps its unit: never "43" over a lone "s")
    }
    const flat = d == null || Math.abs(d) < 0.4;
    const dt = d == null ? '' : flat ? `Steady ${over}` : `${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d), 1)} ${over}`;
    if (heroDelta.textContent !== dt) heroDelta.textContent = dt;
    heroDelta.dataset.dir = flat ? '' : d > 0 ? 'up' : 'down';
    const aria = `Pressure over time. HVPG ${txt} mmHg, ${word}. Portal vein ${fmt(frame.metrics.pv, 0)} mmHg.`;
    if (aria !== lastAria) { lastAria = aria; cv.setAttribute('aria-label', aria); }
  }

  function update(f) { ingest(f); redraw(); }
  // (Scrolling: its own loop draws the next frame. The canvas is drawn before the hero's text is written: setting a canvas
  // font after a DOM write forced a style pass in the middle of the model's frame, 4–5 ms; round 2 review, P5.)
  function redraw() { if (!frame) return; if (!(ticking && live())) draw(); updateHero(); }
  const offs = ['hiddenReadouts', 'hvpgMeasured', 'showHvpg'].map((k) => store.on(k, () => { yr.pressure = yr.hvpg = null; }));
  // A new patient (or the same one restarted) starts with empty traces.
  function clear() { clearHemo(); days = []; redraw(); }
  function pin(fp) { pinned = fp || null; if (frame) redraw(); }
  /** The window ahead of the record filled with the steady state the card opened on (backfill.js): the samples before its first one go in
   *  front, and the record it has made itself stays. The two minutes' bins and the strip's beats are made from them as from live ones. */
  const SAMPLE_KEYS = ['t', 'ph', ...KEYS];
  function backfill(hs) {
    if (!hs?.t?.length || clock !== 'hemo') return false;
    const n = olderThan(hs, fine.t.length ? fine.t[0] : Infinity);
    if (!n) return false;
    const all = inFront(fine, hs, SAMPLE_KEYS, n);
    resetBuffers();
    record(all);
    if (frame) redraw();
    return true;
  }
  function configure(t, ctx) {
    cfg = { ekg: t?.ekg !== false, lane: t?.hvpgLane !== false }; yr.pressure = yr.hvpg = null;
    before = ctx?.ref ? { fp: ctx.ref, label: t?.deltaLabel || 'before' } : null;
    if (frame) redraw();
  }
  return { id: 'scope', label: 'Pressure over time', el, update, ingest, redraw, clear, pin, configure, backfill, historySecs: () => RANGES[0][2], dispose() { offs.forEach((off) => off()); io?.disconnect(); cancelFrame(tickRaf); tickRaf = 0; ticking = false; frame = null; } };
}

// Thin a series to about two points per pixel column (a pulsatile trace has thousands of samples).
function line(ctx, s, X, Y, color, width, plotW) {
  const n = s.x.length;
  if (n < 2) return;
  const stride = Math.max(1, Math.floor(n / (plotW * 2)));
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < n; i += stride) {
    const v = s.mid[i];
    if (Number.isNaN(v)) { started = false; continue; }
    const px = X(s.x[i]), py = Y(v);
    if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
  }
  if ((n - 1) % stride) ctx.lineTo(X(s.x[n - 1]), Y(s.mid[n - 1]));
  ctx.stroke();
}
function band(ctx, s, X, Y, color, alpha) {
  if (s.x.length < 2) return;
  ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < s.x.length; i++) ctx[i ? 'lineTo' : 'moveTo'](X(s.x[i]), Y(s.hi[i]));
  for (let i = s.x.length - 1; i >= 0; i--) ctx.lineTo(X(s.x[i]), Y(s.lo[i]));
  ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
}
function dots(ctx, s, X, Y, color, ring) {
  for (let i = 0; i < s.x.length; i++) {
    const px = X(s.x[i]), py = Y(s.mid[i]);
    ctx.fillStyle = ring; ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(px, py, 2.6, 0, 7); ctx.fill();
  }
}
