// A vitals monitor for a slide's data card (tool: { kind: 'vitals', show?: ['hr', 'map', 'hb'] }): a black bedside monitor with the EKG strip
// across the top (ekg.js, timed to the model's heartbeat) and up to three vital signs under it as large numbers (VITALS in vital-read.js:
// hr, map, co, hb). The numbers are the model's own mean over a breath, a slide's settled ones once pinned, so they read as the slide's tiles do.
// A reading past its cut-off takes the monitor's alarm colour, held and cleared as the bottom bar's are (vitalReading), so a patient sitting on a
// cut-off does not flicker. The model has no systolic and diastolic pressure, so the pressure is the mean arterial pressure, named MAP.
// The strip is a schematic rhythm, not a modelled ECG. A recording kind: a new patient starts its strip over (card-keep.js records).

import { h, fmt, fitCanvas, clamp, cssVar } from './util.js?v=d2c95a1b16';
import { FONT } from './charts.js?v=ce74d37e11';
import { frameFor, cancelFrame } from './frame.js?v=19b3f2915c';
import { VITALS, vitalReading } from './vital-read.js?v=cbba41a6b7';
import { createBeatClock, ekgSeries } from './ekg.js?v=f1ff7a3880';
import { olderThan, inFront } from './backfill.js?v=455d888760';
const nextFrame = frameFor('vitals-monitor');

export const VITALS_DEFAULT = ['hr', 'map', 'hb'];
const SPAN_S = 6, LAG_S = 0.12, EASE_S = 0.3;

/** The vitals a slide asks for: up to three of the four the monitor knows, in the order given; the default otherwise. */
export function vitalsShown(t) {
  const ids = (Array.isArray(t?.show) ? t.show : []).filter((id, i, a) => ['hr', 'map', 'co', 'hb'].includes(id) && a.indexOf(id) === i).slice(0, 3);
  return ids.length ? ids : VITALS_DEFAULT;
}
/** A slide's fingerprint as the metrics the vitals read (VITALS[].v falls back to the flat keys). */
export const metricsOfFp = (fp) => ({ map: fp.map, hr: fp.hr, co: fp.co, ra: fp.ra, blood: { hb: fp.hb } });
/** The cells to print: each vital's short name, value, unit, decimals and whether it is past its cut-off (with the bottom bar's hold and hysteresis). */
export function vitalCells(m, ids, xs, running, now) {
  return ids.map((id) => {
    const def = VITALS.find((v) => v.id === id), x = xs.get(id) || xs.set(id, { v: def }).get(id);
    const { v, bad } = vitalReading(x, m, running, now);
    return { id, k: def.k, title: def.title, u: def.u, d: def.d, v, bad };
  });
}

export function createVitalsMonitor() {
  const cv = h('canvas', { role: 'img', 'aria-label': 'Vital signs monitor' });
  const el = h('div', { class: 'chart-box vitals-box' }, cv);
  const clock = createBeatClock();
  const raw = { t: [], ph: [] };   // (the (time, phase) samples the beat clock was made from: a history goes in front of them and the clock is made again)
  let ids = VITALS_DEFAULT, frame = null, pinned = null, wallAt = 0, lastT = -Infinity, firstT = Infinity;
  const xs = new Map(), shownV = new Map();   // (xs: each vital's hold/hysteresis state; shownV: the number as eased to its reading)
  let last = 0, raf = 0, seen = false, lastLabel = '';
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; wake(); }) : null;
  io?.observe(cv);
  const live = () => frame?.running && (io ? seen : cv.offsetParent !== null) && !document.hidden;

  const C = (n) => cssVar(n);
  function headX() {
    if (lastT === -Infinity) return 0;
    if (!frame?.running) return lastT;
    const rate = frame.speed || 1;
    return lastT - LAG_S * rate + Math.min((performance.now() - wallAt) / 1000, LAG_S) * rate;
  }
  function draw(now = performance.now()) {
    const { ctx, w, h: hh } = fitCanvas(cv);
    if (w < 120 || hh < 90) return;
    ctx.clearRect(0, 0, w, hh);
    const bg = C('--mon-bg'), text = C('--mon-text'), bright = C('--mon-bright'), alarm = C('--mon-alarm'), grid = C('--mon-grid');
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(0, 0, w, hh, 12) : ctx.rect(0, 0, w, hh); ctx.fillStyle = bg; ctx.fill();
    const pad = 14, ew = w - 2 * pad, eh = Math.round(clamp(hh * 0.42, 34, 110)), top = pad, bot = pad + eh;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    // The strip: one QRS to a beat across the last few seconds, in the monitor's bright line.
    ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad, Math.round(bot - 6) + 0.5); ctx.lineTo(pad + ew, Math.round(bot - 6) + 0.5); ctx.stroke();
    ctx.font = FONT(600, 12); ctx.fillStyle = text; ctx.fillText('EKG', pad, top + 11);
    const x1 = headX(), x0 = Math.max(x1 - SPAN_S, firstT), hr = frame?.metrics?.hr;
    if (Number.isFinite(x1) && x1 > x0 + 0.05 && clock.times.length) {
      const e = ekgSeries(clock.times, x0, x1, 60 / (hr > 20 ? hr : 70));
      const X = (t) => pad + ((t - (x1 - SPAN_S)) / SPAN_S) * ew, Y = (v) => bot - 6 - ((v + 0.3) / 1.3) * (eh - 22);
      if (e.x.length > 1) {
        ctx.save(); ctx.beginPath(); ctx.rect(pad, top, ew, eh); ctx.clip();
        ctx.strokeStyle = bright; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
        for (let i = 0; i < e.x.length; i++) ctx[i ? 'lineTo' : 'moveTo'](X(e.x[i]), Y(e.v[i]));
        ctx.stroke(); ctx.restore();
      }
    }
    // The readings: each vital's name, its number large, its unit beside it.
    const m = pinned ? metricsOfFp(pinned) : frame?.metrics;
    if (!m) return;
    const cells = vitalCells(m, ids, xs, !!frame?.running, now), y0 = bot + 12, rh = hh - pad - y0, cw = ew / cells.length;
    let moving = false;
    cells.forEach((c, i) => {
      const x = pad + i * cw;
      if (Number.isFinite(c.v)) {
        let s = shownV.get(c.id);
        if (s == null) s = c.v;
        else if (Math.abs(c.v - s) < Math.pow(10, -c.d) * 0.05) s = c.v;
        else { s += (c.v - s) * (1 - Math.exp(-clamp((now - last) / 1000, 0, 0.1) / EASE_S)); moving = true; }
        shownV.set(c.id, s);
      }
      const val = Number.isFinite(c.v) ? fmt(shownV.get(c.id), c.d) : '—';
      ctx.font = FONT(600, 12); ctx.fillStyle = text; ctx.fillText(c.k, x, y0 + 12);
      let big = Math.round(clamp(Math.min(rh - 20, cw * 0.42, 46), 22, 46)), uw;
      for (;;) {
        ctx.font = FONT(500, 12); uw = ctx.measureText(c.u).width;
        ctx.font = FONT(700, big);
        if (ctx.measureText('88.8').width + uw + 10 <= cw - 6 || big <= 18) break;
        big -= 2;
      }
      const by = y0 + 12 + 6 + big;
      ctx.fillStyle = c.bad ? alarm : bright; ctx.fillText(val, x, by);
      const nw = ctx.measureText(val).width;
      ctx.font = FONT(500, 12); ctx.fillStyle = c.bad ? alarm : text; ctx.fillText(c.u, x + nw + 5, by);
    });
    last = now;
    const label = `Vital signs: ${cells.map((c) => `${c.title} ${Number.isFinite(c.v) ? fmt(c.v, c.d) : 'not available'} ${c.u}${c.bad ? ', past its limit' : ''}`).join('; ')}.`;
    if (label !== lastLabel) { lastLabel = label; cv.setAttribute('aria-label', label); }
    if (moving && !raf) raf = nextFrame((t) => { raf = 0; draw(t); });
  }
  // While the model runs and the card is on screen the strip scrolls on every frame the screen offers; otherwise it is drawn when something changes.
  let ticking = false;
  function loop(now) { if (!live()) { ticking = false; return; } draw(now); nextFrame(loop); }
  function wake() { if (!ticking && live()) { ticking = true; nextFrame(loop); } }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!ticking) draw(); }) : null;
  ro?.observe(cv);

  function record(s) {
    for (let i = 0; i < s.t.length; i++) {
      const t = s.t[i];
      if (t <= lastT) continue;
      raw.t.push(t); raw.ph.push(s.ph[i]); clock.push(t, s.ph[i]); lastT = t; if (t < firstT) firstT = t;
    }
    const keep = lastT - 2 * SPAN_S;
    clock.trim(keep);
    let cut = 0; while (cut < raw.t.length && raw.t[cut] < keep) cut++;
    if (cut) { raw.t.splice(0, cut); raw.ph.splice(0, cut); }
  }
  function ingest(f) {
    frame = f; wallAt = performance.now();
    const s = f.samples;
    if (s?.t?.length && s.ph) {
      if (s.t[0] < lastT - 1e-9) { clock.reset(); raw.t.length = raw.ph.length = 0; lastT = -Infinity; firstT = Infinity; }   // (the model's clock went back: a new patient)
      record(s);
    }
  }
  /** The strip's window filled with the steady state the card opened on (backfill.js): the samples before its first go in front, the
   *  beats found again over them, and the recording it has made itself stays. */
  function backfill(hs) {
    if (!hs?.t?.length || !hs.ph) return false;
    const n = olderThan(hs, raw.t.length ? raw.t[0] : Infinity);
    if (!n) return false;
    const all = inFront(raw, hs, ['t', 'ph'], n);
    clock.reset(); raw.t.length = raw.ph.length = 0; lastT = -Infinity; firstT = Infinity;
    record(all);
    draw();
    return true;
  }
  return {
    id: 'vitals', label: 'Vital signs', el,
    configure(t) { ids = vitalsShown(t); },
    update(f) { ingest(f); wake(); if (!ticking) draw(); },
    pin(fp) { pinned = fp || null; if (frame || pinned) draw(); },
    /** A new patient: the strip starts over, its numbers wait for the new state's own. */
    clear() { clock.reset(); raw.t.length = raw.ph.length = 0; lastT = -Infinity; firstT = Infinity; xs.clear(); shownV.clear(); if (frame) draw(); },
    backfill, historySecs: () => SPAN_S,
    restart() { this.clear(); },
    dispose() { cancelFrame(raf); raf = 0; ticking = false; io?.disconnect(); ro?.disconnect(); },
  };
}
