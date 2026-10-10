// Pressure over time: the portal circulation's pressures as a live trace, and below them the
// HVPG (wedged − free hepatic venous pressure) on its own lane, read against its clinical
// thresholds. Three ranges share one chart: the last beats (every heartbeat and breath), the
// last two minutes (a band from trough to peak around the mean) and the disease clock (one point
// per day). Changes the learner makes and threshold events are marked where they happened, and
// a crosshair (hover, or drag on a touch screen) reads every trace at one moment.

import { store, hiddenNow } from './store.js?v=5edd069b32';
import { h, fmt, fitCanvas, cssVar, clamp } from './util.js?v=e0101a3fa2';
import { FONT } from './charts.js?v=87f57389af';

// hide: the readout a case can keep unmeasured (store.hiddenReadouts); day: the value on the
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
const RANGES = [['beats', '10 s', 10], ['minutes', '2 min', 120], ['days', 'Days', null]];
const LAG_S = 0.12; // wall seconds the trace runs behind the newest sample, so it can glide between frames
const FINE_S = 22, COARSE_S = 140, BIN = 0.25;
// HVPG cut-offs (Baveno): above normal, clinically significant, variceal bleeding risk.
const LIMITS = [[5, ''], [10, 'CSPH 10'], [12, 'Bleeding risk 12']];
const sevOf = (v) => (v < 5 ? 'ok' : v < 10 ? 'caution' : 'danger');
const wordOf = (v) => (v < 5 ? 'Normal' : v < 10 ? 'Subclinical' : v < 12 ? 'CSPH' : 'CSPH · bleeding risk');
const nice = (span, n = 4) => { const raw = Math.max(1e-6, span / n); const p = Math.pow(10, Math.floor(Math.log10(raw))); const r = raw / p; return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * p; };

export function createPressureTime({ marks = () => [] } = {}) {
  // ── DOM ───────────────────────────────────────────
  const heroVal = h('b', { class: 'pt-num' }, '—');
  const heroSev = h('span', { class: 'pt-sev' });
  const heroDelta = h('span', { class: 'pt-delta' });
  const hero = h('div', { class: 'pt-hero' }, h('span', { class: 'pt-k' }, 'HVPG'), h('span', { class: 'pt-v' }, heroVal, h('small', {}, 'mmHg')), heroSev);
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
  // Display only: averages away the heartbeat and breathing swings; the simulation is untouched.
  let smooth = false;
  const smoothBtn = h('button', { class: 'pt-chip pt-smooth', 'aria-pressed': 'false', title: 'Show the mean: hide beat-to-beat and breathing variation', onclick: () => {
    smooth = !smooth; yr.pressure = yr.hvpg = null; smoothBtn.setAttribute('aria-pressed', String(smooth)); draw();
  } }, 'Smooth');
  const el = h('div', { class: 'pt' }, h('div', { class: 'pt-head' }, hero, heroDelta, smoothBtn, rangeSeg), box, chips);

  function setRange(id) {
    range = id;
    rangeSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === id)));
    yr.pressure = yr.hvpg = null;
    draw();
  }

  // ── Buffers ───────────────────────────────────────
  // fine: every sample of the last few seconds; coarse: quarter-second bins (trough, peak, mean)
  // for the last two minutes; days: one point per simulated day.
  const fine = { t: [], ...Object.fromEntries(KEYS.map((k) => [k, []])) };
  let coarse = [], bin = null;
  let days = [];
  let clock = 'hemo', dayNow = 0, lastT = -Infinity, frame = null, wallAt = 0;

  function clearHemo() {
    for (const k of Object.keys(fine)) fine[k].length = 0;
    coarse = []; bin = null; lastT = -Infinity;
  }
  function ingest(f) {
    frame = f; wallAt = performance.now();
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
      for (let i = 0; i < smp.t.length; i++) {
        const t = smp.t[i];
        if (t <= lastT) continue;
        lastT = t;
        fine.t.push(t);
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
      if (cut) for (const k of Object.keys(fine)) fine[k].splice(0, cut);
      cut = 0; while (cut < coarse.length && coarse[cut].t < lastT - COARSE_S) cut++;
      if (cut) coarse.splice(0, cut);
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
      const out = { x: [], mid: [] };
      for (let i = 0; i < fine.t.length; i++) if (fine.t[i] >= x0 - 0.05 && fine.t[i] <= x1) { out.x.push(fine.t[i]); out.mid.push(fine[key][i]); }
      return out;
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
  function ease(key, lo, hi) {
    const r = yr[key];
    if (!r || lo < r[0] || hi > r[1] || hi - lo < (r[1] - r[0]) * 0.55) {
      const m = (hi - lo) * 0.08;
      yr[key] = [lo - m, hi + m];
    }
    return yr[key];
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
  function tickLoop() {
    requestAnimationFrame(tickLoop);
    if (frame?.running && range !== 'days' && cv.offsetParent && !document.hidden) draw();
  }
  requestAnimationFrame(tickLoop);

  function draw() {
    const { ctx, w, h: hh } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, hh);
    if (w < 10 || hh < 10 || !frame) return;
    const col = (v) => cssVar(v);
    const text = col('--text'), muted = col('--text-2'), faint = col('--text-3'), grid = col('--grid'), surface = col('--surface');
    const hidden = hiddenSet();
    const showHvpg = !hidden.has('trueHVPG');
    const traces = TRACES.filter((t) => chosen.has(t.id) && !hidden.has(t.hide) && (range !== 'days' || t.day));
    const narrow = w < 460;
    const L = 34, R = narrow ? 90 : 104, B = 22, GAP = 16;
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
      const span = RANGES.find((r) => r[0] === range)[2];
      xNow = headX();
      x1 = xNow; x0 = x1 - span;
    }
    const X = (x) => L + ((x - x0) / Math.max(1e-9, x1 - x0)) * plotW;

    if (!traces.length && !showHvpg) {
      ctx.fillStyle = faint; ctx.font = FONT(500, 13); ctx.textAlign = 'center';
      ctx.fillText(store.get().imaging ? 'Pressures are not measured in this case.' : 'Choose a trace below.', w / 2, hh / 2);
      return;
    }

    // Marker labels stack in up to three rows, so each stays readable; the plot starts below them.
    const markLayout = layoutMarkers(markers(x0, x1), X, L + plotW + R - 4);
    T = Math.max(T, 24 + markLayout.rows * ROW);
    // lanes
    const avail = hh - T - B;
    const lanes = [];
    if (traces.length && showHvpg) {
      const pH = Math.round((avail - GAP) * 0.64);
      lanes.push({ key: 'pressure', top: T, bot: T + pH }, { key: 'hvpg', top: T + pH + GAP, bot: T + avail });
    } else lanes.push({ key: traces.length ? 'pressure' : 'hvpg', top: T, bot: T + avail });

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
      [lo, hi] = ease(lane.key, lo, hi);
      const tick = nice(hi - lo, (bot - top) > 120 ? 4 : 2);
      const Y = (v) => bot - ((v - lo) / Math.max(1e-6, hi - lo)) * (bot - top);
      lane.Y = Y;

      // grid
      ctx.lineWidth = 1; ctx.font = FONT(500, 10.5); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let v = Math.ceil(lo / tick) * tick; v <= hi + 1e-9; v += tick) {
        const yy = Math.round(Y(v)) + 0.5;
        ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(L + plotW, yy); ctx.stroke();
        ctx.fillStyle = faint; ctx.fillText(fmt(v, tick < 1 ? 1 : 0), L - 8, yy);
      }
      ctx.textBaseline = 'alphabetic';

      ctx.save(); ctx.beginPath(); ctx.rect(L, top - 2, plotW, bot - top + 4); ctx.clip();
      if (lane.key === 'hvpg') {
        // clinical thresholds
        const roomy = bot - top > 90;
        for (const [v, label] of LIMITS) {
          if (v > hi || (v === 5 && !roomy)) continue;
          const yy = Math.round(Y(v)) + 0.5;
          ctx.strokeStyle = col(v >= 10 ? '--danger' : '--caution'); ctx.globalAlpha = v >= 10 ? 0.5 : 0.35;
          ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(L + plotW, yy); ctx.stroke(); ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          if (label && !narrow && (roomy || v === 10)) {
            ctx.font = FONT(600, 10); const tw = ctx.measureText(label).width;
            ctx.fillStyle = surface; ctx.fillRect(L + 6, yy - 6, tw + 8, 12);
            ctx.fillStyle = col('--danger'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(label, L + 10, yy); ctx.textBaseline = 'alphabetic';
          }
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
          const e = recent(s); ends.push({ y: Y(e), v: e, label: 'HVPG', c: text, lane });
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
          if (range === 'days' && s.x.length < 60) dots(ctx, s, X, Y, c, surface);
          const e = recent(s); ends.push({ y: Y(e), v: e, label: t.abbr, c, lane });
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

    ctx.font = FONT(500, 10); ctx.fillStyle = faint; ctx.textAlign = 'left'; ctx.fillText('mmHg', 4, T - 12);

    // markers: learner changes and events, where they happened
    const allBot = drawMarkers(markLayout, lanes);

    // live values at the right edge, nudged apart where they would collide (per lane)
    for (const lane of lanes) {
      const es = ends.filter((e) => e.lane === lane).sort((a, b) => a.y - b.y);
      for (let i = 1; i < es.length; i++) es[i].y = Math.max(es[i].y, es[i - 1].y + 15);
      const over = es.length ? es[es.length - 1].y - lane.bot : 0;
      if (over > 0) for (const e of es) e.y -= over;
      for (const e of es) {
        const yy = Math.max(lane.top + 4, e.y);
        ctx.fillStyle = e.c; ctx.beginPath(); ctx.arc(L + plotW + 9, yy, 3.5, 0, 7); ctx.fill();
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.font = FONT(650, 12.5); ctx.fillStyle = text;
        const vt = fmt(e.v, 1);
        ctx.fillText(vt, L + plotW + 17, yy);
        // Each line is named at its end (PV, WHVP, FHVP, HVPG), on every screen.
        const vw = ctx.measureText(vt).width; ctx.font = FONT(600, 11); ctx.fillStyle = e.c === text ? muted : e.c; ctx.fillText(e.label, L + plotW + 20 + vw, yy);
        ctx.textBaseline = 'alphabetic';
      }
    }

    // time axis
    ctx.fillStyle = faint; ctx.font = FONT(500, 10.5); ctx.textAlign = 'center';
    const span = x1 - x0;
    if (range === 'days') {
      const step = nice(span, narrow ? 3 : 5);
      for (let d = Math.ceil(x0 / step) * step; d <= x1 + 1e-9; d += step) { const xx = X(d); if (xx > L + 20 && xx < L + plotW - 30) ctx.fillText(`Day ${Math.round(d)}`, xx, hh - 6); }
      ctx.textAlign = 'right'; ctx.fillStyle = muted; ctx.fillText(`Day ${Math.round(x1)}`, L + plotW, hh - 6);
    } else {
      const step = range === 'beats' ? (narrow ? 5 : 2) : (narrow ? 60 : 30);
      for (let s = step; s < span - 1e-9; s += step) {
        const xx = X(x1 - s);
        ctx.fillText(range === 'beats' ? `−${s} s` : s % 60 === 0 ? `−${s / 60} min` : `−${s} s`, xx, hh - 6);
      }
      ctx.textAlign = 'right'; ctx.fillStyle = muted; ctx.fillText('now', L + plotW, hh - 6);
    }

    // crosshair and its readout card
    if (cx != null && crossRows.length) {
      ctx.strokeStyle = text; ctx.globalAlpha = 0.3; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(cx) + 0.5, lanes[0].top); ctx.lineTo(Math.round(cx) + 0.5, allBot); ctx.stroke(); ctx.globalAlpha = 1;
      for (const r of crossRows) { ctx.fillStyle = surface; ctx.beginPath(); ctx.arc(cx, r.y, 4.5, 0, 7); ctx.fill(); ctx.fillStyle = r.c; ctx.beginPath(); ctx.arc(cx, r.y, 3, 0, 7); ctx.fill(); }
      const when = range === 'days' ? `Day ${Math.round(xAtCross)}` : Math.abs(xNow - xAtCross) < 0.05 ? 'now' : `${fmt(xNow - xAtCross, range === 'beats' ? 1 : 0)} s ago`;
      ctx.font = FONT(600, 12);
      const rowH = 18, padX = 10;
      const cw = Math.max(ctx.measureText(when).width, ...crossRows.map((r) => { ctx.font = FONT(500, 12); return ctx.measureText(`${r.label}  ${fmt(r.v, 1)}`).width + 14; })) + padX * 2;
      const ch = 12 + rowH * (crossRows.length + 1);
      let bx = cx + 14; if (bx + cw > L + plotW) bx = cx - 14 - cw;
      const by = clamp(lanes[0].top, 4, hh - ch - 4);
      ctx.fillStyle = surface; ctx.shadowColor = 'rgba(0,0,0,.14)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, cw, ch, 10) : ctx.rect(bx, by, cw, ch); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = grid; ctx.stroke();
      ctx.textAlign = 'left'; ctx.fillStyle = muted; ctx.font = FONT(600, 11); ctx.fillText(when, bx + padX, by + 18);
      crossRows.forEach((r, i) => {
        const yy = by + 18 + rowH * (i + 1);
        ctx.fillStyle = r.c; ctx.beginPath(); ctx.arc(bx + padX + 3, yy - 4, 3, 0, 7); ctx.fill();
        ctx.fillStyle = muted; ctx.font = FONT(500, 12); ctx.fillText(r.label, bx + padX + 12, yy);
        ctx.fillStyle = text; ctx.font = FONT(650, 12); ctx.textAlign = 'right'; ctx.fillText(fmt(r.v, 1), bx + cw - padX, yy); ctx.textAlign = 'left';
      });
    }
  }

  // Markers a few pixels apart (several changes made at once) share one dot and one label ("… +2").
  // Each label takes the highest row where it clears the labels already placed, right of its dot or
  // else left of it. Labels are drawn on a halo, so the dotted lines of other markers pass behind
  // them. With no row free the marker keeps its line and a dot at the top of the plot, unlabelled.
  const ROW = 13, MAX_ROWS = 4;
  function layoutMarkers(ms, X, right) {
    const ctx = cv.getContext('2d');
    ctx.font = FONT(600, 10.5);
    const groups = [];
    for (const mk of ms) {
      const xx = Math.round(X(mk.x)) + 0.5, g = groups[groups.length - 1];
      if (g && xx - g.xx < 6) { g.n++; if (!g.sev && mk.sev) g.sev = mk.sev; continue; }
      groups.push({ xx, label: mk.label, sev: mk.sev, n: 1, row: -1, text: '' });
    }
    const spans = [];   // placed labels: { x0, x1, row }
    const maxW = Math.min(170, (right - 40) * 0.6);
    for (const g of groups) {
      let lab = g.label ? g.label + (g.n > 1 ? ` +${g.n - 1}` : '') : g.n > 1 ? `${g.n} changes` : '';
      while (lab.length > 4 && ctx.measureText(lab).width > maxW) lab = lab.slice(0, -2).trimEnd() + '…';
      if (!lab) continue;
      const tw = ctx.measureText(lab).width;
      place: for (let r = 0; r < MAX_ROWS; r++) for (const toRight of [true, false]) {
        const x0 = toRight ? g.xx - 4 : g.xx - 11 - tw, x1 = toRight ? g.xx + 7 + tw : g.xx + 4;
        if (x1 > right || x0 < 2) continue;
        if (spans.some((sp) => sp.row === r && x0 < sp.x1 + 8 && x1 > sp.x0 - 8)) continue;
        g.row = r; g.text = lab; g.toRight = toRight;
        spans.push({ x0, x1, row: r });
        break place;
      }
    }
    const rows = Math.max(groups.length ? 1 : 0, ...groups.map((g) => g.row + 1));
    return { groups, rows };
  }
  function drawMarkers({ groups }, lanes) {
    const ctx = cv.getContext('2d');
    const top = lanes[0].top, allBot = lanes[lanes.length - 1].bot;
    const muted = cssVar('--text-2'), halo = cssVar('--surface');
    const colOf = (g) => cssVar(g.sev ? `--${g.sev}` : '--accent');
    const yOf = (g) => (g.row >= 0 ? 8 + g.row * ROW : top - 8);
    for (const g of groups) {
      ctx.strokeStyle = colOf(g); ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(g.xx, yOf(g) + 4); ctx.lineTo(g.xx, allBot); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.font = FONT(600, 10.5); ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const g of groups) {
      const y = yOf(g);
      ctx.fillStyle = colOf(g); ctx.beginPath(); ctx.arc(g.xx, y, 3, 0, 7); ctx.fill();
      if (!g.text) continue;
      ctx.textAlign = g.toRight ? 'left' : 'right';
      const tx = g.toRight ? g.xx + 7 : g.xx - 7;
      ctx.strokeStyle = halo; ctx.lineWidth = 4; ctx.strokeText(g.text, tx, y + 0.5);
      ctx.fillStyle = muted; ctx.fillText(g.text, tx, y + 0.5);
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
    const v = frame.metrics.hvpg;
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
      if (win.length && now.length) { d = mean(now) - mean(win); over = lastT - first.t > 100 ? 'in 2 min' : `in ${Math.round(lastT - first.t)} s`; }
    }
    const flat = d == null || Math.abs(d) < 0.4;
    const dt = d == null ? '' : flat ? `Steady ${over}` : `${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d), 1)} ${over}`;
    if (heroDelta.textContent !== dt) heroDelta.textContent = dt;
    heroDelta.dataset.dir = flat ? '' : d > 0 ? 'up' : 'down';
    const aria = `Pressure over time. HVPG ${txt} mmHg, ${word}. Portal vein ${fmt(frame.metrics.pv, 0)} mmHg.`;
    if (aria !== lastAria) { lastAria = aria; cv.setAttribute('aria-label', aria); }
  }

  function update(f) { ingest(f); redraw(); }
  function redraw() { if (!frame) return; updateHero(); draw(); }
  for (const k of ['hiddenReadouts', 'hvpgMeasured', 'showHvpg']) store.on(k, () => { yr.pressure = yr.hvpg = null; });
  // A new patient (or the same one restarted) starts with empty traces.
  function clear() { clearHemo(); days = []; redraw(); }
  return { id: 'scope', label: 'Pressure over time', el, update, ingest, redraw, clear };
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
