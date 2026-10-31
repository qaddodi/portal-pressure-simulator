// A vitals monitor for a slide's data card (tool: { kind: 'vitals', show?: ['hr', 'map', 'hb'] }): a black bedside monitor with the EKG strip
// across the top (ekg.js, timed to the model's heartbeat) and up to three vital signs under it as large numbers (VITALS in vital-read.js:
// hr, map, co, hb). The numbers are the model's own mean over a breath, a slide's settled ones once pinned, so they read as the slide's tiles do.
// A reading past its cut-off takes the monitor's alarm colour, held and cleared as the bottom bar's are (vitalReading), so a patient sitting on a
// cut-off does not flicker. The model has no systolic and diastolic pressure, so the pressure is the mean arterial pressure, named MAP.
// The strip is a schematic rhythm, not a modelled ECG. A recording kind: a new patient starts its strip over (card-keep.js records).
// While the model's own clock stands still (a disease time-lapse runs a year in ten seconds with the beat parked, and a state easing in
// parks it for a moment) the monitor goes on: the strip scrolls on this card's clock and lays beats at the heart rate shown, closing in as the
// number climbs, then hands over to the live beat where the model's phase resumes, so the strip neither stalls nor jumps (ekg.js walkBeats).

import { h, fmt, fitCanvas, clamp, cssVar } from './util.js?v=90ca733567';
import { FONT } from './charts.js?v=3cdc018cc1';
import { frameFor, cancelFrame, paceMs, noteDraw } from './frame.js?v=b11d87fd1b';
import { VITALS, vitalReading } from './vital-read.js?v=cbba41a6b7';
import { createBeatClock, ekgSeries, beatWalk, walkBeats, seedBeats } from './ekg.js?v=f27505b539';
import { olderThan, inFront } from './backfill.js?v=455d888760';
const nextFrame = frameFor('vitals-monitor');

export const VITALS_DEFAULT = ['hr', 'map', 'hb'];
const SPAN_S = 6, LAG_S = 0.12, EASE_S = 0.3, JUMP_S = 0.3, STEP_S = 0.004;   // (JUMP_S: more than this ahead of the last sample is a clock that was set, not the next frame)

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
  // (synth: the strip on its own clock while the model's stands still, { w: the beat walk, at: when it was last moved on }; off: the model's
  // time plus off is the strip's, which the walk moves on from; synthed: it has run since the strip was last cleared)
  let synth = null, off = 0, synthed = false;
  const xs = new Map(), shownV = new Map();   // (xs: each vital's hold/hysteresis state; shownV: the number as eased to its reading)
  let last = 0, raf = 0, seen = false, lastLabel = '';
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; wake(); }) : null;
  io?.observe(cv);
  const live = () => frame?.running && (io ? seen : cv.offsetParent !== null) && !document.hidden;

  const C = (n) => cssVar(n);
  function headX() {
    if (synth) return synth.w.x - LAG_S;   // (the beats are laid LAG_S ahead of what is drawn, as the live samples are)
    if (lastT === -Infinity) return 0;
    if (!frame?.running) return lastT;
    const rate = frame.speed || 1;
    return lastT - LAG_S * rate + Math.min((performance.now() - wallAt) / 1000, LAG_S) * rate;
  }
  function draw(now = performance.now()) {
    advanceSynth(now);
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
    const x1 = headX(), x0 = Math.max(x1 - SPAN_S, firstT), hr = synth ? synth.w.bpm : frame?.metrics?.hr;
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
    // (While the strip scrolls its loop draws every frame, the easing numbers with it: a frame of their own would draw it twice.)
    eased = moving;
    if (moving && !raf && !ticking) raf = nextFrame((t) => { raf = 0; draw(t); });
  }
  // While the model runs and the card is on screen the strip scrolls on every frame the screen offers; otherwise it is drawn when something changes.
  // (One frame asked for at a time (loopRaf), let go with the strip: dispose. eased: the numbers were still easing at the last draw.)
  // (Battery saver or Settings › Figure performance › Motion at 60: the strip scrolls at that pace, as the figure's steady motion does;
  // otherwise on every frame, as before. loopAt: when the loop last drew.)
  let ticking = false, loopRaf = 0, eased = false, gone = false, loopAt = -Infinity;
  function loop(now) {
    loopRaf = 0;
    if (gone || !live()) { ticking = false; if (eased && !gone && !raf) raf = nextFrame((t) => { raf = 0; draw(t); }); return; }
    const pace = paceMs();
    if (!pace || now - loopAt >= pace) { loopAt = now; draw(now); noteDraw('vitals-monitor'); }
    loopRaf = nextFrame(loop);
  }
  function wake() { if (!ticking && !gone && live()) { ticking = true; loopRaf = nextFrame(loop); } }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!ticking) draw(); }) : null;
  ro?.observe(cv);

  /** The heart rate the card shows (the slide's pinned reading, else the live one), as the beats are laid at it. */
  const rateNow = () => { const hr = (pinned ? metricsOfFp(pinned) : frame?.metrics)?.hr; return clamp(hr > 20 ? hr : 70, 30, 220); };
  /** The model's clock has stopped (a time-lapse's days, a state easing): the strip goes on by itself from where it is. A strip with nothing
   *  on it is given its window only by a time-lapse (the steady state it opens on at the heart rate shown); an easing leaves it to the live samples. */
  function startSynth(head) {
    const lapsing = frame.clock === 'disease', times = clock.times;
    if (!lapsing && !times.length) return;
    const bpm = rateNow(), period = 60 / bpm, x = head + LAG_S;
    if (!times.length) times.push(x - (Number.isFinite(frame.phase) ? frame.phase : 0) * period);   // (the beat the model is at, if nothing was seen)
    let ph = (x - times[times.length - 1]) / period;
    for (let k = 0; ph >= 1 && k < 4; k++) { times.push(times[times.length - 1] + period); ph = (x - times[times.length - 1]) / period; }
    if (lapsing) {
      if (times[0] > head - SPAN_S) seedBeats(times, period, head - SPAN_S);
      if (head - SPAN_S < firstT) firstT = head - SPAN_S;
    }
    synth = { w: beatWalk(x, ph, bpm), at: performance.now() };
    synthed = true;
  }
  /** Lay the beats for the time that has passed since the strip was last moved on, steering to the model's phase for when it runs again. */
  function advanceSynth(now) {
    if (!synth) return;
    const dt = clamp((now - synth.at) / 1000, 0, 6);
    synth.at = Math.max(synth.at, now);
    if (!frame?.running || !(dt > 0)) return;
    const left = frame.parkSecs == null ? NaN : Math.max(0, frame.parkSecs - (now - wallAt) / 1000);
    walkBeats(synth.w, dt, rateNow(), clock.times, { ph: frame.phase, left });
    clock.trim(synth.w.x - LAG_S - 2 * SPAN_S);
  }
  /** The model's clock runs again: its samples are laid on the strip's clock so that the newest sits where the strip has been laid to, which
   *  keeps what is drawn where it is, and the beat clock starts a new run from them. */
  function land(s) {
    advanceSynth(performance.now());
    off = synth.w.x - s.t[s.t.length - 1];
    lastT = Math.min(lastT, s.t[0] + off - 1e-6);
    clock.restart();
    synth = null;
  }
  function record(s) {
    for (let i = 0; i < s.t.length; i++) {
      const t = s.t[i] + off;
      if (t <= lastT) continue;
      raw.t.push(t); raw.ph.push(s.ph[i]); clock.push(t, s.ph[i]); lastT = t; if (t < firstT) firstT = t;
    }
    const keep = lastT - 2 * SPAN_S;
    clock.trim(keep);
    let cut = 0; while (cut < raw.t.length && raw.t[cut] < keep) cut++;
    if (cut) { raw.t.splice(0, cut); raw.ph.splice(0, cut); }
  }
  function ingest(f) {
    const head = synth ? 0 : headX();   // (where the strip is drawn to now, by the frame it was drawn from)
    frame = f; wallAt = performance.now();
    const s = f.samples;
    // (Parked: the samples of a frozen clock, if any, are one moment repeated, and the strip is on its own clock until the model runs.)
    if (f.clock === 'disease' || f.morphing) { if (f.running && !synth) startSynth(head); return; }
    if (s?.t?.length && s.ph) {
      if (synth) land(s);
      else if (lastT > -Infinity && (s.t[0] + off < lastT - 1e-9 || s.t[0] + off > lastT + JUMP_S)) {
        // The model's clock was set (a state restored as its easing ends puts the clock back by what it has stepped since): the beat goes on, so the
        // strip does too, its time moved to start where it left off. (A new patient clears the strip itself: presenter-tools show.)
        off = lastT + (s.t.length > 1 ? s.t[1] - s.t[0] : STEP_S) - s.t[0];
      }
      record(s);
    }
  }
  /** The strip's window filled with the steady state the card opened on (backfill.js): the samples before its first go in front, the
   *  beats found again over them, and the recording it has made itself stays. */
  function backfill(hs) {
    if (!hs?.t?.length || !hs.ph || synth || synthed || off) return false;   // (a strip that has run on its own keeps its beats)
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
    clear() { clock.reset(); raw.t.length = raw.ph.length = 0; lastT = -Infinity; firstT = Infinity; synth = null; off = 0; synthed = false; xs.clear(); shownV.clear(); if (frame) draw(); },
    backfill, historySecs: () => SPAN_S,
    restart() { this.clear(); },
    dispose() { gone = true; cancelFrame(raf); raf = 0; cancelFrame(loopRaf); loopRaf = 0; ticking = false; io?.disconnect(); ro?.disconnect(); },
  };
}
