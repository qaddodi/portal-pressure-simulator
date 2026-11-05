// A vitals monitor for a slide's data card (tool: { kind: 'vitals', show?: ['hr', 'map', 'hb'] }): a black bedside monitor with the EKG strip
// across the top (ekg.js, timed to the model's heartbeat) and up to three vital signs under it as large numbers (VITALS in vital-read.js:
// hr, map, co, hb). The numbers are the model's own mean over a breath, a slide's settled ones once pinned, so they read as the slide's tiles do.
// A reading past its cut-off takes the monitor's alarm colour, held and cleared as the bottom bar's are (vitalReading), so a patient sitting on a
// cut-off does not flicker. The model has no systolic and diastolic pressure, so the pressure is the mean arterial pressure, named MAP.
// The strip is a schematic rhythm, not a modelled ECG. A recording kind: a new patient starts its strip over (card-keep.js records).
// While the model's own clock stands still (a disease time-lapse runs a year in ten seconds with the beat parked, and a state easing in
// parks it for a moment) the monitor goes on: the strip scrolls on this card's clock and lays beats at the heart rate shown, closing in as the
// number climbs, then hands over to the live beat where the model's phase resumes, so the strip neither stalls nor jumps (ekg.js walkBeats).

import { h, fmt, canvasSize, clamp, cssVar } from './util.js';
import { createVitalsGL, colorOf, textWidth } from './vitals-gl.js';
import { frameFor, cancelFrame, paceMs, noteDraw, frameAnimating, pageRest, onPageWake } from './frame.js';
import { VITALS, vitalReading } from './vital-read.js';
import { createBeatClock, ekgSeries, beatWalk, walkBeats, seedBeats } from './ekg.js';
import { olderThan, inFront } from './backfill.js';
import { dropFrontNums } from './drop-front.js';
import { attrSoon } from './class-soon.js';
import { restPass } from './rest-pass.js';
const nextFrame = frameFor('vitals-monitor');

export const VITALS_DEFAULT = ['hr', 'map', 'hb'];
// The monitor on the GPU (vitals-gl.js: rounded rectangles, the strip as a line of capsules, words and digits from one glyph atlas); no
// 2D canvas is drawn while the strip scrolls.
const SPAN_S = 6, LAG_S = 0.12, EASE_S = 0.3, JUMP_S = 0.3, STEP_S = 0.004;   // (JUMP_S: more than this ahead of the last sample is a clock that was set, not the next frame)

/** The vitals a slide asks for: up to three of the four the monitor knows, in the order given; the default otherwise. */
export function vitalsShown(t) {
  const ids = (Array.isArray(t?.show) ? t.show : []).filter((id, i, a) => ['hr', 'map', 'co', 'hb'].includes(id) && a.indexOf(id) === i).slice(0, 3);
  return ids.length ? ids : VITALS_DEFAULT;
}
/** A slide's fingerprint as the metrics the vitals read (VITALS[].v falls back to the flat keys). */
// (The metrics are one kept object written in place, read by the draw that asks: a pinned slide's frame draws many times a second.)
const FP_METRICS = { map: 0, hr: 0, co: 0, ra: 0, blood: { hb: 0 } };
export const metricsOfFp = (fp) => { const m = FP_METRICS; m.map = fp.map; m.hr = fp.hr; m.co = fp.co; m.ra = fp.ra; m.blood.hb = fp.hb; return m; };
/** The cells to print: each vital's short name, value, unit, decimals and whether it is past its cut-off (with the bottom bar's hold and hysteresis).
 *  The list and its cells are kept per monitor (its `xs`) and written in place: a frame makes none, and a caller reads them as they are returned. */
const CELL_LISTS = new WeakMap();
const defOf = (id) => { for (let i = 0; i < VITALS.length; i++) if (VITALS[i].id === id) return VITALS[i]; return undefined; };
export function vitalCells(m, ids, xs, running, now) {
  let out = CELL_LISTS.get(xs);
  if (!out) CELL_LISTS.set(xs, (out = []));   // alloc-rare: a monitor's first frame
  out.length = ids.length;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i], def = defOf(id);
    let x = xs.get(id);
    if (!x) xs.set(id, (x = { v: def, cell: null }));   // alloc-rare: a vital's first frame
    const { v, bad } = vitalReading(x, m, running, now);
    const c = x.cell || (x.cell = { id, k: def.k, title: def.title, u: def.u, d: def.d, v: NaN, bad: false });   // alloc-rare: a vital's first frame
    c.v = v; c.bad = bad; out[i] = c;
  }
  return out;
}


/** `makeGL`: how the GPU drawer is made (vitals-gl.js; the tests give a recorder). `gpu: false`: nothing is drawn (the strip's clock still runs). */
export function createVitalsMonitor({ gpu = true, makeGL = createVitalsGL } = {}) {
  const cv = h('canvas', { role: 'img', 'aria-label': 'Vital signs monitor' });
  const el = h('div', { class: 'chart-box vitals-box' }, cv);
  // (The box is made before the drawer: the drawer lays its picture's canvas after `cv` (trace-gl.js host.after), which does nothing for a canvas with no parent, so a monitor made the other way round was never shown.)
  // (The GPU drawer works in the chart pool's context (vitals-gl.js) and shows its picture in a canvas of its own beside `cv`, which stays the
  // monitor's box: its size, its role and its label. null where WebGL 2 is not there: nothing is drawn; makeGL: the tests give a recorder.
  // The pool asks for the monitor to be drawn again when its programs or glyphs come in.)
  const glr = gpu ? makeGL(cv, { redraw: () => { if (!gone) draw(); } }) : null;
  const clock = createBeatClock();
  const WALK_TO = { ph: NaN, left: NaN };   // (walkBeats reads it as it is called)
  const raw = { t: [], ph: [] };   // (the (time, phase) samples the beat clock was made from: a history goes in front of them and the clock is made again)
  let ids = VITALS_DEFAULT, frame = null, pinned = null, wallAt = 0, lastT = -Infinity, firstT = Infinity;
  // (synth: the strip on its own clock while the model's stands still, { w: the beat walk, at: when it was last moved on }; off: the model's
  // time plus off is the strip's, which the walk moves on from; synthed: it has run since the strip was last cleared)
  let synth = null, off = 0, synthed = false;
  const xs = new Map(), shownV = new Map();   // (xs: each vital's hold/hysteresis state; shownV: the number as eased to its reading)
  let last = 0, raf = 0, seen = false, lastLabel = '';
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; wake(); }) : null;
  io?.observe(cv);
  const live = () => frame?.running && (io ? seen : true) && !document.hidden && !pageRest();   // (no IntersectionObserver: taken as on screen; no layout is read in a frame)

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
    if (glr) drawGL(now);
  }
  // ── The GPU's way (vitals-gl.js): the same layout, the same numbers, colours and eases, sent as rectangles, a line and glyphs. ──
  // (lay: the readings' font sizes, found again only when the size or the cells' words change, from the atlas's own advances (no canvas);
  // pts: the strip's points, kept from frame to frame.)
  let lay = null, layW = -1, layH = -1, layN = -1, pts = new Float32Array(512);
  const layK = [], layU = [];   // (the cells' words the layout was found for)
  function layout(w, hh, cells) {
    let same = lay && w === layW && hh === layH && cells.length === layN;
    for (let i = 0; same && i < cells.length; i++) if (layK[i] !== cells[i].k || layU[i] !== cells[i].u) same = false;
    if (same) return lay;
    const pad = 14, ew = w - 2 * pad, eh = Math.round(clamp(hh * 0.42, 34, 110)), top = pad, bot = pad + eh;   // alloc-rare: only when the size or the cells' words change
    const y0 = bot + 12, rh = hh - pad - y0, cw = ew / cells.length;
    const cl = [];   // alloc-rare: only when the size or the cells' words change
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      let big = Math.round(clamp(Math.min(rh - 20, cw * 0.42, 46), 22, 46));
      const uw = textWidth(c.u, 500, 12);
      while (!(textWidth('88.8', 700, big) + uw + 10 <= cw - 6 || big <= 18)) big -= 2;
      cl.push({ x: pad + i * cw, big });   // alloc-rare: only when the size or the cells' words change
      layK[i] = c.k; layU[i] = c.u;
    }
    layW = w; layH = hh; layN = cells.length;
    lay = { pad, ew, eh, top, bot, y0, rh, cw, cells: cl };   // alloc-rare: only when the size or the cells' words change
    return lay;
  }
  // The pictures' lists for the GPU, kept and written in place (vitals-gl.js draw reads them as it is called): a rectangle or a word is one
  // kept entry [.., col], and a frame sets how many are in use.
  const RECTS = [], TEXTS = [], LINE = { pts: null, n: 0, half: 0, col: null, clip: [0, 0, 0, 0] }, DRAW = { W: 0, H: 0, dpr: 1, rects: RECTS, line: null, texts: TEXTS, redraw: null };
  const rectAt = (i, x, y, w, h, r, col) => {
    const e = RECTS[i] || (RECTS[i] = [0, 0, 0, 0, 0, null]);   // alloc-rare: the first frame that needs this many rectangles
    e[0] = x; e[1] = y; e[2] = w; e[3] = h; e[4] = r; e[5] = col;
  };
  const textAt = (i, str, wt, px, x, y, col) => {
    const e = TEXTS[i] || (TEXTS[i] = ['', 0, 0, 0, 0, null]);   // alloc-rare: the first frame that needs this many words
    e[0] = str; e[1] = wt; e[2] = px; e[3] = x; e[4] = y; e[5] = col;
  };
  const inkOf = (id, ecg, art, bright) => (id === 'hr' ? ecg : id === 'map' ? art : bright);
  // The cells with no metrics yet: the names, no numbers (kept, one per id).
  const BLANK = new Map(), BLANK_LIST = [];
  function blankCells() {
    BLANK_LIST.length = ids.length;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      let c = BLANK.get(id);
      if (!c) { const def = defOf(id); BLANK.set(id, (c = { id, k: def.k, u: def.u, v: NaN, bad: false, d: def.d, title: def.title })); }   // alloc-rare: the first frame without metrics
      BLANK_LIST[i] = c;
    }
    return BLANK_LIST;
  }
  // The reading's words for a screen reader, made between frames and only when a number or a flag changed (the snapshot is taken in the frame).
  const snapV = [], snapBad = [], snapCells = [], txtQ = [], txtD = [], txtS = [];
  let snapN = -1, labelAsk = 0;
  function writeLabel() {
    labelAsk = 0;
    const label = `Vital signs: ${snapCells.map((c, i) => `${c.title} ${Number.isFinite(snapV[i]) ? fmt(snapV[i], c.d) : 'not available'} ${c.u}${snapBad[i] ? ', past its limit' : ''}`).join('; ')}.`;
    if (label !== lastLabel) { lastLabel = label; attrSoon(cv, 'aria-label', label); }
  }
  function noteLabel(cells) {
    let ch = cells.length !== snapN;
    for (let i = 0; !ch && i < cells.length; i++) if (!Object.is(snapV[i], cells[i].v) || snapBad[i] !== cells[i].bad || snapCells[i] !== cells[i]) ch = true;
    if (!ch) return;
    snapN = cells.length;
    for (let i = 0; i < cells.length; i++) { snapV[i] = cells[i].v; snapBad[i] = cells[i].bad; snapCells[i] = cells[i]; }
    if (!labelAsk) labelAsk = restPass(writeLabel);
  }
  const rafDraw = (t) => { raf = 0; draw(t); };
  function drawGL(now) {
    const { w, h: hh, dpr, W: devW, H: devH } = canvasSize(cv);
    if (w < 120 || hh < 90) return;
    const m = pinned ? metricsOfFp(pinned) : frame?.metrics;
    const cells = m ? vitalCells(m, ids, xs, !!frame?.running, now) : blankCells();
    const L = layout(w, hh, cells), { pad, ew, eh, top, bot, y0 } = L;
    const bg = colorOf(C('--mon-bg')), text = colorOf(C('--mon-text')), bright = colorOf(C('--mon-bright')), alarm = colorOf(C('--mon-alarm')), grid = colorOf(C('--mon-grid'));
    const ecg = colorOf(C('--mon-ecg') || C('--mon-bright')), art = colorOf(C('--mon-art') || C('--mon-bright'));
    rectAt(0, 0, 0, w, hh, 12, bg); rectAt(1, pad, Math.round(bot - 6), ew, 1, 0, grid);
    let nr = 2, nt = 0;
    textAt(nt++, 'EKG', 600, 12, pad, top + 11, text);
    // The strip.
    let line = null;
    const x1 = headX(), x0 = Math.max(x1 - SPAN_S, firstT), hr = synth ? synth.w.bpm : frame?.metrics?.hr;
    if (Number.isFinite(x1) && x1 > x0 + 0.05 && clock.times.length) {
      const e = ekgSeries(clock.times, x0, x1, 60 / (hr > 20 ? hr : 70));
      const n = e.x.length;
      if (n > 1) {
        if (pts.length < n * 2) pts = new Float32Array(n * 4);   // alloc-rare: the strip has more points than ever before
        for (let i = 0; i < n; i++) {
          pts[2 * i] = (pad + ((e.x[i] - (x1 - SPAN_S)) / SPAN_S) * ew) * dpr;
          pts[2 * i + 1] = (bot - 6 - ((e.v[i] + 0.3) / 1.3) * (eh - 22)) * dpr;
        }
        LINE.pts = pts; LINE.n = n; LINE.half = 0.8 * dpr; LINE.col = ecg;
        LINE.clip[0] = pad * dpr; LINE.clip[1] = top * dpr; LINE.clip[2] = ew * dpr; LINE.clip[3] = eh * dpr;
        line = LINE;
      }
    }
    // The readings, eased to their values as on the 2D canvas.
    let moving = false;
    if (m) {
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        let val = '—';
        if (Number.isFinite(c.v)) {
          let sv = shownV.get(c.id);
          if (sv == null) sv = c.v;
          else if (Math.abs(c.v - sv) < Math.pow(10, -c.d) * 0.05) sv = c.v;
          else { sv += (c.v - sv) * (1 - Math.exp(-clamp((now - last) / 1000, 0, 0.1) / EASE_S)); moving = true; }
          shownV.set(c.id, sv);
          // (The printed words are made again only when the number printed changes: a few times a second while it eases, not every frame.)
          const q = Math.round(sv * Math.pow(10, c.d));
          if (txtQ[i] !== q || txtD[i] !== c.d) { txtQ[i] = q; txtD[i] = c.d; txtS[i] = fmt(sv, c.d); }   // alloc-rare: only when the printed number changes
          val = txtS[i];
        }
        // (2 Nov 2026, "stop numbers jiggling": the number stands in a box of the widest it can be (three figures, or two and a decimal; the
        // figures are tabular), flush to its right edge, so the unit and the alarm patch never move as a reading goes from 99 to 100 or a
        // digit changes. The cell's size was already found for the "88.8" box.)
        const { x, big } = L.cells[i], by = y0 + 12 + 6 + big, nw = textWidth(val, 700, big), rw = textWidth(c.d ? '88.8' : '888', 700, big), ink = inkOf(c.id, ecg, art, bright);
        textAt(nt++, c.k, 600, 12, x, y0 + 12, c.bad ? alarm : ink === bright ? text : ink);
        if (c.bad) rectAt(nr++, x - 5, by - big * 0.78 - 4, rw + 10, big * 0.78 + 10, 5, alarm);
        textAt(nt++, val, 700, big, x + rw - nw, by, c.bad ? bg : ink);
        textAt(nt++, c.u, 500, 12, x + rw + 5, by, c.bad ? alarm : text);
      }
    }
    RECTS.length = nr; TEXTS.length = nt;
    DRAW.W = devW; DRAW.H = devH; DRAW.dpr = dpr; DRAW.line = line; DRAW.redraw = atlasIn;
    const drawn = glr.draw(DRAW);
    if (!drawn && !glr.lost && !ticking && !raf) raf = nextFrame(rafDraw);   // (its programs are not ready yet: the next frame)
    if (!m) return;
    last = now;
    noteLabel(cells);
    eased = moving;
    if (moving && !raf && !ticking) raf = nextFrame(rafDraw);
  }
  const atlasIn = () => { if (!gone && !ticking && !raf) draw(); };   // (the glyph atlas came in after a draw: drawn again with its words)
  cv.addEventListener('webglcontextrestored', () => { lay = null; draw(); });

  // While the model runs and the card is on screen the strip scrolls on every frame the screen offers; otherwise it is drawn when something changes.
  // (One frame asked for at a time (loopRaf), let go with the strip: dispose. eased: the numbers were still easing at the last draw.)
  // (Battery saver or Settings › Figure performance › Motion at 60: the strip scrolls at that pace, as the figure's steady motion does;
  // otherwise on every frame, as before. loopAt: when the loop last drew.)
  let ticking = false, loopRaf = 0, eased = false, gone = false, loopAt = -Infinity;
  function loop(now) {
    loopRaf = 0;
    if (gone || !live()) { ticking = false; frameAnimating('vitals-monitor', false); if (eased && !gone && !raf) raf = nextFrame(rafDraw); return; }
    const pace = paceMs();
    if (!pace || now - loopAt >= pace) { loopAt = now; draw(now); noteDraw('vitals-monitor'); }
    loopRaf = nextFrame(loop);
  }
  // (R10: while the strip scrolls, Locked never carries its frames over: frame.js frameAnimating.)
  function wake() { if (!ticking && !gone && live()) { ticking = true; frameAnimating('vitals-monitor', true); loopRaf = nextFrame(loop); } }
  const offRest = onPageWake(wake);   // (idle rest ends: the strip scrolls again)
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
    WALK_TO.ph = frame.phase; WALK_TO.left = left;
    walkBeats(synth.w, dt, rateNow(), clock.times, WALK_TO);
    clock.dropBefore(synth.w.x - LAG_S - 2 * SPAN_S);
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
    clock.dropBefore(keep);
    let cut = 0; while (cut < raw.t.length && raw.t[cut] < keep) cut++;
    if (cut) { dropFrontNums(raw.t, cut); dropFrontNums(raw.ph, cut); }
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
    dispose() { gone = true; cancelFrame(raf); raf = 0; cancelFrame(loopRaf); loopRaf = 0; if (ticking) frameAnimating('vitals-monitor', false); ticking = false; io?.disconnect(); ro?.disconnect(); offRest(); glr?.dispose(); },
  };
}
