// Simulation host: owns the Engine, runs the clocks, streams frames (blueprint §13.4).
// Used inside a Web Worker (src/worker.js) or on the main thread as a fallback.

import { Engine } from './engine/engine.js';
import { computeMetrics } from './engine/metrics.js';
import { fingerprintOf } from './engine/fingerprint.js';
import { detectEvents } from './engine/events.js';
import { explain } from './engine/explain.js';
import { deepMerge, sanitizeParams, PRESETS } from './engine/scenario.js';

const SAMPLE_NODES = ['RA', 'IVCS', 'RHV', 'CONF', 'SIN_R', 'VAR', 'AO', 'SV', 'SMV'];

// A state's fingerprint (engine/fingerprint.js: the presenter builds the live model's from the same function).
const fingerprint = (m, e) => fingerprintOf(m, {
  P: e.Pf || e.P, Q: e.Qf || e.Q, D: Float32Array.from(e.edges, (ed) => e.diameter(ed.id)), copy: true,
  params: e.params, fluid: e.starling() });
// A time-lapse's params on day d of n: each ramped key eased linearly from its first value to its last.
// (A dotted key names a nested param: 'fibrosis.R.post'.)
const rampAt = (ramp, d, n) => ramp.reduce((o, [k, [a, b]]) => {   // alloc-rare: runs in the simulation worker (its own thread and heap), not on the page's render thread; only while a time-lapse ramp is under way
  const path = k.split('.'), last = path.pop();   // alloc-rare: runs in the simulation worker (its own thread and heap), not on the page's render thread; only while a time-lapse ramp is under way
  let at = o;
  for (const p of path) at = at[p] ||= {};   // alloc-rare: runs in the simulation worker (its own thread and heap), not on the page's render thread; only while a time-lapse ramp is under way
  at[last] = a + (b - a) * Math.min(1, d / n);
  return o;
}, {});   // alloc-rare: runs in the simulation worker (its own thread and heap), not on the page's render thread; only while a time-lapse ramp is under way
// The presenter's eased change of patient ('morph'): the live state blended from where it is to a slide's state. Numbers ease
// (a number only one side has, such as a new thrombus or stenosis, grows from 0); a switch flips halfway; everything else
// (events, bands, the random state) is the slide's from the start.
const MORPH_KEYS = ['params', 'V', 'P', 'Q', 'MAPf', 'hr', 'baro', 'habr', 'slow', 'blood', 'iap', 'day', 't'];
function mix(a, b, k) {
  if (typeof a === 'number' || typeof b === 'number') {
    if ((typeof a === 'number' || a === undefined) && (typeof b === 'number' || b === undefined)) return (a ?? 0) + ((b ?? 0) - (a ?? 0)) * k;
  } else if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length === b.length) return a.map((x, i) => mix(x, b[i], k));   // alloc-rare: runs in the simulation worker (its own thread and heap), not on the page's render thread; only while an eased change of patient (a morph) is under way
  } else if (a && b && typeof a === 'object' && typeof b === 'object') {
    const o = {};   // alloc-rare: runs in the simulation worker (its own thread and heap), not on the page's render thread; only while an eased change of patient (a morph) is under way
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) o[key] = mix(a[key], b[key], k);   // alloc-rare: runs in the simulation worker (its own thread and heap), not on the page's render thread; only while an eased change of patient (a morph) is under way
    return o;
  }
  return k < 0.5 ? a : b;
}
const morphAt = (from, to, k) => ({ ...to, ...Object.fromEntries(MORPH_KEYS.map((key) => [key, mix(from[key], to[key], k)])) });   // alloc-rare: runs in the simulation worker (its own thread and heap), not on the page's render thread; only while an eased change of patient (a morph) is under way
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

// A slide's extra work, asked for by a deck visuals package (slide-ext.js steps), on scratch engines so the chain is untouched:
// explain: a metric id or a list (engine/explain.js METRICS), the Why? contributions at the slide's state;
// wave: a vessel id, { vessel, secs } or a list of them, the Doppler velocity (cm/s, signed) over secs (default 3) of beats
// from the slide's state, a point every 20 ms after a second's run-in: { t: [s], v: [cm/s] }.
const WAVE_DT = 0.004, WAVE_EVERY = 5, WAVE_RUNIN = 1;
function* waveAt(snap, vessel, secs = 3) {
  const w = new Engine();
  w.restore(snap);
  w.beat = true;
  const t = [], v = [], n = Math.round((WAVE_RUNIN + secs) / WAVE_DT), n0 = Math.round(WAVE_RUNIN / WAVE_DT);
  for (let i = 0; i <= n; i++) {
    if (i >= n0 && (i - n0) % WAVE_EVERY === 0) { t.push(+((i - n0) * WAVE_DT).toFixed(3)); v.push(w.dopplerVelocity(vessel)); }
    if (i < n) w.step(WAVE_DT);
    if (i % 100 === 99) yield;
  }
  return { t, v };
}
function* stepExtras(e, st) {
  if (st.explain == null && st.wave == null) return null;
  const out = {};
  if (st.explain != null) { out.explain = {}; for (const id of [st.explain].flat()) { out.explain[id] = explain(e, id); yield; } }
  if (st.wave != null) {
    out.wave = {};
    const snap = e.snapshot();
    for (const w of [st.wave].flat()) {
      const id = typeof w === 'string' ? w : w?.vessel;
      if (id && e.ei[id] != null) out.wave[id] = yield* waveAt(snap, id, typeof w === 'object' && w.secs > 0 ? Math.min(10, w.secs) : 3);
    }
  }
  return out;
}

// The bedside clock's step (seconds): 4 ms with the pulse on, 20 ms without. At 4× and 8× the pulse takes 8 ms steps, half
// as many a tick, so a phone keeps up; the beat-averaged readings move by about 0.01 mmHg (MAP and heart rate by 0.15 at
// most, tests/hemo-step.test.js). 1× and 2× (and every Present slide, which runs at 1×) keep 4 ms.
export const hemoStep = (pulse, speed) => (pulse ? (speed >= 4 ? 0.008 : 0.004) : 0.02);
// The history's step (the bedside clock's own 4 ms), the longest window it will make, its run-in before the window, and the work it does between ticks.
const HIST_DT = 0.004, HIST_MAX_S = 14, HIST_RUNIN_S = 1.5, HIST_SLICE_MS = 6;

export function createCore(post) {
  let eng = new Engine();
  let running = true;
  let speed = 1;
  let clock = 'hemo'; // 'hemo' | 'disease'
  let last = null;
  let probe = 'PV_TRUNK';
  let diseaseAcc = 0;
  let timer = null;
  let visible = true;
  let frameDirty = true;
  let paramsDirty = true;
  let samples = null;
  // The presenter's time-lapse on the live model: days left, and the params ramped day by day (see 'lapse').
  let lapse = null;
  // The presenter's eased change of patient on the live model: { from, to, t0, ms } (see 'morph').
  let morph = null;
  // Until this time (ms) every tick also relaxes a hidden copy of the model quietly, so a live change settles while the clock runs on.
  let relaxUntil = 0;
  let beat = true; // the heartbeat always runs (the Over time trace is beat to beat from the start)
  const newSamples = () => ({ t: [], ph: [], vel: [], pvVel: [], hvVel: [], whvp: [], hvpg: [], ...Object.fromEntries(SAMPLE_NODES.map((n) => [n, []])) });   // alloc-rare: runs in the simulation worker (its own thread and heap), not on the page's render thread; a sample set is begun when a history or a stretch of samples starts

  // One sample of model e into s, stamped t (the model's own time unless a history labels it, see history below).
  function takeSample(e, s, vessel, t = e.t) {
    s.t.push(t);
    s.ph.push(e.phase());   // (the cardiac phase 0..1: the EKG strip's QRS lands where it wraps, ekg.js)
    s.vel.push(e.velocity(vessel));
    s.pvVel.push(e.velocity('PV_TRUNK'));
    s.hvVel.push(e.velocity('RHV_IVC'));
    const hv = e.hvpgTrue();
    s.whvp.push(hv.whvp);
    s.hvpg.push(hv.hvpg);
    for (const n of SAMPLE_NODES) s[n].push(e.P[e.ni[n]]);
  }
  // The newest sample, and the newest sample posted in a frame (its time and the heart's cycle count): a history ends on the last one posted,
  // so the live samples that follow it begin right after, with no overlap and no hole.
  let sampT = NaN, sampCyc = 0, postedT = NaN, postedCyc = 0;
  function sample() {
    if (!samples) samples = newSamples();
    takeSample(eng, samples, probe);
    sampT = eng.t; sampCyc = eng.cyc || 0;
  }

  // ── History ──────────────────────────────────────
  // A recording instrument (the beat trace, the vitals monitor, the Doppler) that opens on a steady state would sweep in from empty
  // for the length of its window. The history is what it would have recorded had the state stood: a scratch copy of the live model
  // (taken as relaxHidden takes its copy, filters and all) runs the last `secs` of model time with the beat on and is posted in the
  // samples' own form, ending at the moment of the request. Two things make the live samples follow on without a seam: the copy's clock
  // stays positive and a whole number of breaths long (the breath is the clock modulo 4 s; a negative time reads as Valsalva's), and
  // the beat count is steered to the live one at the end, so the last sample is the same moment of the same beat. It runs in slices
  // between the live ticks and never stops the clock. Only a steady state is lent a past: not while the model is easing, on a time-lapse
  // or on the disease clock, and a change of state cancels it.
  let hist = null, histEng = null, histTimer = 0;
  function endHistory(done) {
    clearTimeout(histTimer); histTimer = 0;
    if (!hist) return;
    const { reqId } = hist, h = hist; hist = null;
    post({ type: 'history', reqId, samples: done ? h.s : null, probe: h.probe, t: h.T });   // alloc-rare: runs in the simulation worker (its own thread and heap), not on the page's render thread; once when a history ends
  }
  // The model was given another state (a patient, a restore, an action): the history under way is of the old one, and nothing posted is the new one's.
  // (jumpDirty: the next frame tells the page the model jumped, so nothing it shows is blended across the change: display-state.js noteJump.)
  let jumpDirty = true, postedClock = null;
  // (EXT-WRK-1: a patient, a reset, a restore or a morph REPLACES the state: the samples taken from the old one are dropped, with their bookkeeping,
  // and `gen` counts the replacements so a page can tell a frame's samples are of the state it names. An action goes on from the same state.)
  let gen = 0;
  function stateChanged(replaced = true) {
    endHistory(false); postedT = NaN; jumpDirty = true;
    if (replaced) { gen++; samples = null; sampT = NaN; sampCyc = 0; }
  }
  // EXT-WRK-2: a new patient (a preset, a reset) ends what was acting on the old one: an eased change of patient, a presenter's time-lapse
  // and its ramp, the easing of a slider. The clock the PAGE chose (its own time-lapse, a speed) stays; only a clock a presenter's lapse owned
  // goes back to the bedside, as when a lapse ends.
  function endTransitions() {
    if (lapse) { clock = 'hemo'; speed = 1; }
    morph = null; lapse = null; stoppedAt = null; relaxUntil = 0; diseaseAcc = 0;
  }
  function histSlice() {
    histTimer = 0;
    const j = hist;
    if (!j) return;
    try {
      const c = j.c, t0 = performance.now(), keepFrom = j.n - Math.round(j.secs / HIST_DT);
      while (j.i < j.n) {
        c.step(HIST_DT);
        // (The copy's heart rate drifts as it settles: a little of the difference is taken out of every step, all of it on the last.)
        const rem = (j.n - 1 - j.i) * HIST_DT;
        c.cyc += (j.cycT - (c.cyc + c.hr * rem / 60)) * HIST_DT / (rem + HIST_DT);
        if (j.i >= keepFrom) takeSample(c, j.s, j.probe, j.T - rem);
        j.i++;
        if (j.i % 16 === 0 && performance.now() - t0 > HIST_SLICE_MS) break;
      }
      if (j.i < j.n) histTimer = setTimeout(histSlice, 0);
      else endHistory(true);
    } catch { endHistory(false); }
  }
  function startHistory(secs, reqId) {
    endHistory(false);   // (one still running is answered empty: the newer request is the instrument's)
    if (crashed || clock !== 'hemo' || lapse || morph || !(eng.t >= 0)) { post({ type: 'history', reqId, samples: null }); return; }
    const W = Math.min(HIST_MAX_S, Math.max(2, +secs || 10)), D = 4 * Math.ceil((W + HIST_RUNIN_S) / 4);
    const fresh = postedT <= eng.t, T = fresh ? postedT : eng.t, cycT = fresh ? postedCyc : eng.cyc || 0, c = (histEng ||= new Engine());
    c.restore(eng.snapshot());
    // (What restore() starts over and the copy must have as the live model has it: relaxHidden.)
    Object.assign(c, { COf: eng.COf, pvQm: eng.pvQm, pvVm: eng.pvVm, vitM: eng.vitM && [...eng.vitM], vitM1: eng.vitM1 && [...eng.vitM1] });
    c.Pf = Float64Array.from(eng.Pf || eng.P); c.Qf = Float64Array.from(eng.Qf || eng.Q);
    c.beat = true; c.quiet = false;
    c.bleed = { ...c.bleed, active: false }; c.infusions = []; c.valsalva = { until: -1, start: -1 };
    c.t = T % 4;
    c.cyc = cycT - D * (eng.hr || 70) / 60;
    hist = { reqId, c, secs: W, T, cycT, i: 0, n: Math.round(D / HIST_DT), probe, s: newSamples() };
    histTimer = setTimeout(histSlice, 0);
  }

  // How long the model's own clock stands still from now, while it does (a time-lapse's days on the disease clock, a state easing in): the beat
  // and the breath are parked then, the same moment of the same beat until it runs on. A strip drawn over the wait (the vitals monitor) keeps
  // its own beat going and brings it to this one's phase (frame.phase) as the wait ends. Undefined when the model is running.
  function parkSecs() {
    if (morph) return Math.max(0, morph.t0 + morph.ms - performance.now()) / 1000;
    return clock === 'disease' && lapse && !lapse.bedside ? Math.max(0, lapse.left - diseaseAcc) / Math.max(speed, 1e-6) : undefined;
  }
  function frame() {
    const m = detectEvents(eng);
    const D = new Float32Array(eng.E);   // alloc-rare: runs in the simulation worker (its own thread and heap), not on the page's render thread; a posted frame's buffers are transferred to the page, so each frame needs fresh ones
    for (let k = 0; k < eng.E; k++) D[k] = eng.diameter(eng.edges[k].id);
    const f = {   // alloc-rare: runs in the simulation worker (its own thread and heap), not on the page's render thread; the posted frame message itself
      type: 'frame',
      changed: frameDirty, gen,
      jump: jumpDirty || clock !== postedClock,
      t: eng.t, day: eng.day, running, speed, clock, probe,
      parkSecs: parkSecs(),
      lapseDay: lapse?.bedside ? lapse.total - lapse.left : undefined,
      pulsing: !!(eng.params.pulsatile || eng.beat),
      resp: !!eng.params.respiration,
      morphing: !!morph,
      // A live change still settling (a slider moving, a button, eased in and relaxed): the Doppler holds its scale until it ends.
      // (Not a bedside time-lapse's own relaxing: its meal is what the trace is there to show, so the scale follows it.)
      settling: (performance.now() < relaxUntil && !lapse?.bedside) || eng.easing(),
      phase: eng.phase(),
      P: Float32Array.from(eng.P),
      Pf: Float32Array.from(eng.Pf || eng.P),
      Q: Float32Array.from(eng.Q),
      Qf: Float32Array.from(eng.Qf || eng.Q),
      ext: Float32Array.from(eng.ext),
      D,
      metrics: m,
      slow: eng.slow,
      bands: eng.bands,
      bleed: eng.bleed,
      events: eng.newEvents.splice(0),
      samples: packSamples(samples),
      params: paramsDirty ? eng.paramsTarget() : undefined,
    };
    paramsDirty = false;
    frameDirty = false;
    jumpDirty = false; postedClock = clock;
    if (samples) { postedT = sampT; postedCyc = sampCyc; }
    samples = null;
    unpainted = ackOn;
    const xfer = [f.P.buffer, f.Pf.buffer, f.Q.buffer, f.Qf.buffer, f.ext.buffer, f.D.buffer];   // alloc-rare: runs in the simulation worker (its own thread and heap), not on the page's render thread; the transfer list of the posted frame
    if (f.samples) xfer.push(f.samples.t.buffer);
    post(f, xfer);
  }
  // (Plan "Holding 120 Hz" rev 2 step 3: a frame's samples go out as one Float64Array, transferred, not as a dozen arrays cloned: each channel
  // is a view of its own stretch of it, so the page reads s.t[i], s.vel[i] and their lengths as before. Every sample is a number.)
  function packSamples(s) {
    if (!s) return null;
    const keys = Object.keys(s), n = s.t.length, buf = new Float64Array(keys.length * n), out = {};   // alloc-rare: runs in the simulation worker (its own thread and heap), not on the page's render thread; the samples go out as one transferred buffer
    for (let j = 0; j < keys.length; j++) { const a = s[keys[j]], v = buf.subarray(j * n, (j + 1) * n); for (let i = 0; i < n; i++) v[i] = a[i]; out[keys[j]] = v; }
    return out;
  }

  // An engine that throws, or whose pressures or flows stop being numbers, stops the clock and says so once
  // ('crash'): the figure keeps the last good frame and the page offers Reload or Restart. Loading a patient
  // (or any state) clears it.
  let crashed = false;
  const RECOVER = ['init', 'preset', 'reset', 'restore', 'morph'];
  const finite = (a) => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false; return true; };
  function crash(err) {
    stop();
    crashed = true; morph = null; lapse = null; samples = null;
    post({ type: 'crash', message: String(err && err.stack || err) });   // alloc-rare: runs in the simulation worker (its own thread and heap), not on the page's render thread; once, if the engine crashes
  }
  function tick() {
    try { tickOnce(); } catch (err) { crash(err); }
  }

  let stepAcc = 0;   // W1: model seconds owed to the bedside clock, less than one step
  let lastFrame = 0, ackOn = false, unpainted = false, owed = false;
  const ACK_MAX_MS = 400;
  // A frame goes out only when the model moved past a small hysteresis since the last one posted, or once a second as a heartbeat (the
  // samples taken meanwhile wait in `samples` and go out with it, so the traces lose nothing). Anything that changes the model sets
  // frameDirty/paramsDirty and posts at once, so nothing waits on the heartbeat.
  let still = null;
  const HEARTBEAT_MS = 1000, EPS_REL = 2e-4, EPS_ABS = 1e-5;
  const near = (a, b) => { if (!b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > EPS_ABS + EPS_REL * Math.abs(b[i])) return false; return true; };
  // (The figure's colours, widths and readouts follow the eased Pf, Qf and D; the beat-by-beat P, Q and ext ride the heartbeat frame and the samples.)
  // (The last posted state, kept in buffers made once and written in place: no arrays made a posted frame, rev 2 step 3.)
  function keepStill() {
    const pf = eng.Pf || eng.P, qf = eng.Qf || eng.Q;
    if (!still || still.Pf.length !== pf.length || still.Qf.length !== qf.length || still.D.length !== eng.E) still = { Pf: new Float64Array(pf.length), Qf: new Float64Array(qf.length), D: new Float64Array(eng.E) };   // alloc-rare: runs in the simulation worker (its own thread and heap), not on the page's render thread; the kept copy is made once and written in place after (reallocated only if the engine's size changes)
    still.Pf.set(pf); still.Qf.set(qf);
    for (let k = 0; k < eng.E; k++) still.D[k] = eng.diameter(eng.edges[k].id);
  }
  function movedSincePost() {
    if (!still) return true;
    if (!near(eng.Pf || eng.P, still.Pf) || !near(eng.Qf || eng.Q, still.Qf)) return true;
    for (let k = 0; k < eng.E; k++) { const d = eng.diameter(eng.edges[k].id); if (Math.abs(d - still.D[k]) > EPS_ABS + EPS_REL * Math.abs(still.D[k])) return true; }
    return false;
  }
  function tickOnce() {
    const now = performance.now();
    const realDt = last == null ? 0 : Math.min(0.1, (now - last) / 1000);
    last = now;
    eng.beat = beat;
    if (morph) {
      const k = Math.min(1, (now - morph.t0) / morph.ms);
      // W2: the beat runs on through the blend. The snapshots carry no cardiac phase, so it is advanced here at the blended heart
      // rate (as step() does), so the pulse does not stop for 1.2 s. NO sample is taken: the blend's clock runs from the old moment to the
      // slide's (here backwards), and a trace fed one sample per frame of it saw a jump every frame and drew no line (3 Nov: the HVPG
      // catheter tracing and Pressure gut to heart). The traces take their first samples from the landed state.
      const cyc = eng.cyc || 0, COf = eng.COf;   // (a blend carries neither the phase nor the output filter: the live ones go on)
      eng.restore(k >= 1 ? morph.to : morphAt(morph.from, morph.to, easeInOut(k)));
      eng.cyc = cyc + realDt * (eng.hr || 60) / 60; eng.COf = COf;
      if (k >= 1) morph = null;
      paramsDirty = true; frameDirty = true;
    } else if (running) {
      if (clock === 'hemo') {
        if (lapse?.bedside) bedsideStep(now);
        // (On a hidden copy of the model: the beat runs on, so the Doppler and tracings stay smooth while a slider moves.)
        if (now < relaxUntil) eng.relaxHidden(); else eng.relaxDone();
        const h = hemoStep(eng.params.pulsatile || beat, speed);
        // W1: the part of a tick that is not a whole step is kept for the next one (stepAcc), so model time equals real time x speed
        // (the steps used to be rounded up, which ran the clock about 6% fast at 1x). A tick the page held up past the cap drops the excess.
        const cap = h < 0.02 ? 700 : 400;
        stepAcc += realDt * speed;
        let n = Math.min(Math.floor(stepAcc / h + 1e-9), cap);
        stepAcc = n >= cap ? 0 : Math.max(0, stepAcc - n * h);
        const every = Math.max(1, Math.floor(n / 24));
        for (let i = 0; i < n; i++) {
          eng.step(h);
          if (i % every === 0) sample();
        }
      } else {
        diseaseAcc += realDt * speed; // speed = sim days per real second
        const days = speed < 1 ? 0 : Math.floor(diseaseAcc);
        if (speed < 1) {
          // Sub-day rates: advance in fractions of a day (about 12 per sim-day at most) so 1 h/s still moves smoothly.
          if (diseaseAcc >= 1 / 24 - 1e-9) {
            const f = diseaseAcc; diseaseAcc = 0;
            const r = eng.advanceFraction(f);
            if (r.ruptured) { clock = 'hemo'; speed = 1; }
            if (eng.params.anticoag) paramsDirty = true;
            sample();
          }
        } else if (days > 0) {
          diseaseAcc -= days;
          if (lapse) lapseDays(days);
          else {
            const r = eng.advanceDays(days);
            if (r.ruptured) { clock = 'hemo'; speed = 1; }
            if (eng.params.anticoag) paramsDirty = true;
          }
          sample();
        }
      }
    }
    if (!finite(eng.P) || !finite(eng.Q)) throw new Error('The model produced a pressure or flow that is not a number.');
    const due = running && now - lastFrame > 95 && (!ackOn || !unpainted || now - lastFrame > ACK_MAX_MS);
    // (Held only by the page's paint: owed, and built the moment its 'painted' comes, not on the next 33 ms tick (rev 2 step 3).)
    owed = running && !due && ackOn && unpainted && now - lastFrame > 95;
    if (frameDirty || paramsDirty || eng.newEvents.length || (due && (now - lastFrame > HEARTBEAT_MS || morph || lapse || eng.easing() || movedSincePost()))) {
      lastFrame = now; frame();
      keepStill();
    }
  }

  // A presenter time-lapse: one day at a time, exactly as the presenter's off-screen chain computed it
  // ('sequence' with fine days), then back to bedside time once the days are done.
  function lapseDays(n) {
    for (let k = 0; k < n && lapse; k++) {
      if (lapse.ramp) eng.setParams(deepMerge(eng.paramsTarget(), rampAt(lapse.ramp, lapse.total - lapse.left + 1, lapse.total)));
      eng.advanceDays(1, { noRupture: true, silent: true });   // alloc-rare: runs in the simulation worker (its own thread and heap), not on the page's render thread; once for each day of a presenter time-lapse
      if (--lapse.left <= 0) { lapse = null; eng.settle(); clock = 'hemo'; speed = 1; diseaseAcc = 0; }
    }
    paramsDirty = true;
  }

  // A bedside time-lapse (lapse.clock 'seconds'): the ramp eased over real seconds on the seconds clock, the beat running,
  // so the Doppler keeps sampling as it plays (a meal). Its progress is reported in the slide's days (frame.lapseDay).
  function bedsideStep(now) {
    const b = lapse.bedside, k = Math.min(1, (now - b.t0) / b.ms);
    if (lapse.ramp) eng.setParams(deepMerge(eng.paramsTarget(), rampAt(lapse.ramp, k, 1)));
    // (Settled as it goes, as a slider is, on a hidden copy: the flow climbs with the ramp, not tens of seconds behind it.)
    relaxUntil = now + 1200;
    lapse.left = lapse.total * (1 - k);
    paramsDirty = true;
    if (k >= 1) lapse = null;
  }

  // (A bedside time-lapse is timed on the wall clock: the time the model stood still (the page hidden, the model paused) is added to its start,
  // so it carries on from where it was, as the disease clock's lapse does, instead of jumping to its end.)
  let stoppedAt = null;
  function start() {
    if (timer || crashed || !running || !visible) return;
    // (EXT-WRK-3: the time the clock stood still, the page hidden or paused, is not the time-lapse's or the morph's own.)
    if (stoppedAt != null) { const d = performance.now() - stoppedAt; if (lapse?.bedside) lapse.bedside.t0 += d; if (morph) morph.t0 += d; }
    stoppedAt = null;
    last = null;
    timer = setInterval(tick, 33);
  }

  function stop() {
    if (timer) { clearInterval(timer); if ((lapse?.bedside || morph) && stoppedAt == null) stoppedAt = performance.now(); }
    timer = null;
    last = null;
  }

  function applyAction(e, a) {
    switch (a.kind) {
      case 'infuse': e.infuse(a.fluid); break;
      case 'hemorrhage': e.hemorrhage(a.mL); break;
      case 'band': e.band(); break;
      case 'paracentesis': e.paracentesis(a.mL, a.albumin); break;
      case 'valsalva': e.startValsalva(a.sec || 10); break;
      case 'rupture': e.rupture(a.site || 'VAR', a.tear || 0.6); break;
      case 'stopBleed': e.stopBleed('clot'); break;
    }
  }

  const handlers = {
    init({ params }) {
      if (params) { eng.setParams(sanitizeParams(params)); eng.settle(); }
      paramsDirty = true; jumpDirty = true;
      start();
    },
    setParams({ params, settle, ease }) {
      endHistory(false);
      morph = null;
      // UI-originated: not echoed back (avoids overwriting in-flight edits).
      // (Its numbers eased in over a fraction of a second, so a slider moves the model, and the Doppler, without steps.)
      if (settle) { eng.setParams(sanitizeParams(params)); eng.settle(); } else eng.easeParams(sanitizeParams(params));
      // ease (ms): the presenter's live buttons and sliders, eased to the new steady state over that long (see tick).
      relaxUntil = ease > 0 ? performance.now() + ease : 0;
    },
    *preset({ id, days, reqId }) {
      stateChanged();
      endTransitions();
      yield* eng.loadPresetSteps(id, days != null ? { days: days + (PRESETS.find((p) => p.id === id)?.days || 0) } : {});
      post({ type: 'presetLoaded', reqId, id, params: eng.params });
    },
    reset() { stateChanged(); endTransitions(); eng = new Engine(); paramsDirty = true; },
    run({ running: r, speed: s, clock: c }) {
      if (r !== undefined) running = r;
      if (s !== undefined) speed = s;
      if (c !== undefined) { clock = c; diseaseAcc = 0; if (c === 'hemo') lapse = null; }
    },
    // The presenter's time-lapse: days on the disease clock at speed days a second, ramp's params eased over
    // them ({ key: [from, to] }); days 0 stops one under way.
    // bedside: the ramp plays over the slide's seconds on the seconds clock instead (see bedsideStep).
    lapse({ days, speed: s, ramp, bedside }) {
      endHistory(false);   // (a history under way is of the state the days leave)
      morph = null; stoppedAt = null;
      lapse = days > 0 ? { left: days, total: days, ramp: ramp ? Object.entries(ramp) : null, bedside: bedside ? { t0: performance.now(), ms: (days / s) * 1000 } : null } : null;
      running = true; clock = lapse && !bedside ? 'disease' : 'hemo'; speed = lapse && !bedside ? s : 1; diseaseAcc = 0;
      // (Begun while the model stands still, the page hidden: it has not begun to play, so the time until it starts again is not its own.)
      stoppedAt = lapse?.bedside && !timer ? lapse.bedside.t0 : null;
    },
    // Next during a bedside time-lapse: what is left of it runs in ms.
    lapseFast({ ms }) {
      if (!lapse?.bedside) return;
      // (Stood still, its progress is where it stopped: start() adds the time it stood still to t0 afterwards, so judged at the later time it would run backwards.)
      const at = stoppedAt ?? performance.now(), b = lapse.bedside, k = Math.min(1, (at - b.t0) / b.ms);
      b.ms = ms / Math.max(1e-6, 1 - k); b.t0 = at - k * b.ms;
    },
    // The presenter's slide that turns breathing off stops it on the live model as the slide begins (only that switch;
    // a morph under way keeps easing to its own state).
    breath({ on }) { eng.params.respiration = !!on; paramsDirty = true; },
    visibility({ visible: v }) { visible = v; },
    // (Plan "Holding 120 Hz, always" §3.2: a page that says so (ackPaint) tells the worker each model frame it has painted; while one is
    // unpainted the clock's next frame waits (up to ACK_MAX_MS), so frames the page could not paint are never built, cloned and posted.)
    ackPaint({ on }) { ackOn = !!on; unpainted = false; },
    painted() { unpainted = false; if (owed && timer) { owed = false; tick(); } },
    // restartClock: the days are the patient's past (the patient aged before the story starts), so the clock and
    // event log start fresh at day 0 afterwards.
    *advance({ days, untilEvent, restartClock }) {
      morph = null; jumpDirty = true;
      const n0 = eng.eventCount;   // (a count, not the log's length: the log is capped at 200)
      let done = 0;
      const max = untilEvent ? 730 : days;
      while (done < max) {
        const step = Math.min(untilEvent ? 1 : 30, max - done);
        const r = yield* eng.advanceDaySteps(step);
        done += step;
        if (r.ruptured) { clock = 'hemo'; break; }
        if (untilEvent && eng.eventCount > n0) break;
      }
      if (restartClock) { eng.day = 0; eng.t = 0; eng.eventLog = []; eng.newEvents = []; }
      paramsDirty = true;
    },
    settle() { eng.settle(); },
    action({ action }) { stateChanged(false); morph = null; applyAction(eng, action); paramsDirty = true; },
    // Run the model forward at bedside time (so the vitals have settled before they are shown).
    *preroll({ seconds, reqId }) {
      for (let t = 0; t < seconds; t += 0.1) { eng.step(0.1); yield; }
      paramsDirty = true;
      if (reqId) post({ type: 'prerolled', reqId });
    },
    // (The samples already taken belong to the old vessel: they go out under its name first, so the new one's record starts clean.)
    probe({ id }) { if (id !== probe && samples?.t.length) frame(); probe = id; },
    beat({ on }) { if (beat !== !!on) { beat = !!on; frameDirty = true; } },
    snapshot({ reqId }) { post({ type: 'snapshot', reqId, snap: eng.snapshot() }); },
    // The steady state's last `secs` seconds, for an instrument whose window opens empty (see History above).
    history({ secs, reqId }) { startHistory(secs, reqId); },
    restore({ snap }) { stateChanged(); morph = null; relaxUntil = 0; eng.restore(snap); lapse = null; paramsDirty = true; },
    // The presenter's change of patient, eased over ms from the live state (wherever it is, a change under way included) to snap.
    morph({ snap, ms }) {
      stateChanged();
      lapse = null; clock = 'hemo'; speed = 1; diseaseAcc = 0; relaxUntil = 0;
      if (!(ms > 0)) { morph = null; eng.restore(snap); paramsDirty = true; return; }
      morph = { from: eng.snapshot(), to: snap, t0: performance.now(), ms };
      stoppedAt = timer ? null : morph.t0;   // (begun while the model stands still, the page hidden: it has not begun to play)
      running = true; start();
    },
    explain({ metric, reqId }) {
      const r = explain(eng, metric);
      post({ type: 'explain', reqId, result: r });
    },
    healthyProfile({ reqId }) {
      const h = new Engine();
      post({ type: 'healthy', reqId, P: Array.from(h.P), Q: Array.from(h.Q), D: h.edges.map((e) => h.diameter(e.id)), metrics: computeMetrics(h) });
    },
    // The presenter tour's fingerprint: the live state, or each listed preset loaded fresh.
    metrics({ reqId }) { post({ type: 'metrics', reqId, result: fingerprint(computeMetrics(eng), eng) }); },
    presetMetrics({ ids, reqId }) {
      const result = {};
      for (const id of ids || []) {
        const e = new Engine(), g = e.loadPresetSteps(id, {});
        for (let n = g.next(); !n.done; n = g.next());
        e.settle();
        result[id] = fingerprint(computeMetrics(e), e);
      }
      post({ type: 'presetMetrics', reqId, result });
    },
    // The presenter's slides, computed off screen so the figure only ever shows finished states: a chain in
    // which each slide starts from the one before (base: the state before the first), in a fixed order
    // (preset → params → settle → actions → disease days → settle). Each slide is posted as it is
    // ready ('seqStep': snapshot, params, fingerprint); 'sequence' ends the chain. A slide the presenter plays
    // as a time-lapse (fine, or a ramp) steps its days one at a time, as the live 'lapse' does.
    // A step with restart: true starts again from base (a fresh model without one): a chart's points, each its own change
    // from the slide's state (tool-curve.js).
    *sequence({ steps, base, reqId }) {
      let e = new Engine();
      if (base) e.restore(base);
      for (let i = 0; i < (steps || []).length; i++) {
        const st = steps[i] || {};
        if (st.restart && i) { e = new Engine(); if (base) e.restore(base); }
        if (st.preset) yield* e.loadPresetSteps(st.preset, st.presetDays != null ? { days: st.presetDays + (PRESETS.find((p) => p.id === st.preset)?.days || 0) } : {});
        if (st.params) { e.setParams(deepMerge(e.params, st.params)); e.settle(); }
        for (const a of [st.action || []].flat()) applyAction(e, a);
        const ramp = st.ramp ? Object.entries(st.ramp) : null, fine = !!(ramp || st.fine);
        // trail: two readings on each day of the time-lapse, [day, a, b] (the presenter's flow-time chart): the fingerprint
        // keys st.trail names, or (true) the portal pressure and flow.
        const tk = Array.isArray(st.trail) ? st.trail : ['pv', 'pvFlow'];
        const at = (d, m) => { const f = fingerprint(m, e); return [d, ...tk.map((k) => f[k])]; }, trail = st.trail && st.days ? [at(0, computeMetrics(e))] : null;
        // start: a time-lapse with its own params plays from here (params set and settled, no day run yet), not from the slide before.
        const start = st.fine && st.days && st.params ? { snap: e.snapshot(), params: structuredClone(e.params), fp: fingerprint(computeMetrics(e), e) } : null;
        for (let done = 0; done < (st.days || 0);) {
          const n = fine ? 1 : Math.min(30, st.days - done);
          if (ramp) e.setParams(deepMerge(e.params, rampAt(ramp, done + 1, st.days)));
          yield* e.advanceDaySteps(n, { noRupture: true, silent: true });
          done += n;
          if (trail && done < st.days) trail.push(at(done, computeMetrics(e)));
        }
        if (st.preset || st.params || st.action || st.days) e.settle();
        const m = computeMetrics(e);
        if (trail) trail.push(at(st.days, m));
        const extra = yield* stepExtras(e, st);
        // before: a slide that plays a procedure opens on its state with the procedure not done yet (st.before undoes it, settled on a
        // copy, so the chain goes on from the slide's own state).
        let before = null;
        if (st.before) {
          const b = new Engine(); b.restore(e.snapshot()); b.setParams(deepMerge(b.params, st.before)); b.settle();
          before = { snap: b.snapshot(), params: structuredClone(b.params), fp: fingerprint(computeMetrics(b), b) };
        }
        post({ type: 'seqStep', reqId, i, snap: e.snapshot(), params: structuredClone(e.params), fp: fingerprint(m, e), trail, start, before, ...(extra ? { extra } : {}) });
        yield;
      }
      post({ type: 'sequence', reqId });
    },
    presets({ reqId }) { post({ type: 'presets', reqId, presets: PRESETS.map(({ id, label, group, summary, days }) => ({ id, label, group, summary, days })) }); },
  };

  // Serialize commands while a long job yields. Timer ticks must not advance
  // partially constructed scenarios or interleave with a disease-clock jump.
  const queue = [];
  let busy = false;
  async function drain() {
    if (busy) return;
    busy = true;
    while (queue.length) {
      const { msg, resolve } = queue.shift();
      try {
        const handler = handlers[msg.type];
        const job = handler?.(msg);
        if (job?.next) {
          stop();
          let deadline = performance.now() + 8;
          for (let result = job.next(); !result.done; result = job.next()) {
            if (performance.now() >= deadline) {
              await new Promise((done) => setTimeout(done, 0));
              deadline = performance.now() + 8;
            }
          }
        }
        if (RECOVER.includes(msg.type)) crashed = false;
        // Queries must not wake the renderer. Mutations send one immediate frame,
        // including UI-originated parameters without echoing those parameters back.
        if (!crashed && !['snapshot', 'explain', 'healthyProfile', 'presets', 'metrics', 'presetMetrics', 'sequence', 'history', 'painted', 'ackPaint'].includes(msg.type)) {
          frameDirty = true;
          if (visible) { lastFrame = performance.now(); frame(); }
        }
      }
      catch (err) { post({ type: 'error', reqId: msg.reqId, message: String(err && err.stack || err) }); }   // reqId: the waiting request settles
      resolve();
    }
    busy = false;
    if (running && visible) start(); else stop();
  }

  return {
    handle(msg) {
      return new Promise((resolve) => { queue.push({ msg, resolve }); drain(); });
    },
    engine: () => eng,
    dispose() { endHistory(false); stop(); },
  };
}
