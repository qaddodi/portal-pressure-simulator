// Simulation host: owns the Engine, runs the clocks, streams frames (blueprint §13.4).
// Used inside a Web Worker (src/worker.js) or on the main thread as a fallback.

import { Engine } from './engine/engine.js?v=8fb6617747';
import { computeMetrics } from './engine/metrics.js?v=f681c36fd7';
import { fingerprintOf } from './engine/fingerprint.js?v=8faea80b59';
import { detectEvents } from './engine/events.js?v=4fb56a35e5';
import { explain } from './engine/explain.js?v=c42c3b96c6';
import { deepMerge, sanitizeParams, PRESETS } from './engine/scenario.js?v=d7d3ea5b70';

const SAMPLE_NODES = ['RA', 'IVCS', 'RHV', 'CONF', 'SIN_R', 'VAR', 'AO', 'SV', 'SMV'];

// A state's fingerprint (engine/fingerprint.js: the presenter builds the live model's from the same function).
const fingerprint = (m, e) => fingerprintOf(m, {
  P: e.Pf || e.P, Q: e.Qf || e.Q, D: Float32Array.from(e.edges, (ed) => e.diameter(ed.id)), copy: true,
  params: e.params, fluid: e.starling() });
// A time-lapse's params on day d of n: each ramped key eased linearly from its first value to its last.
// (A dotted key names a nested param: 'fibrosis.R.post'.)
const rampAt = (ramp, d, n) => ramp.reduce((o, [k, [a, b]]) => {
  const path = k.split('.'), last = path.pop();
  let at = o;
  for (const p of path) at = at[p] ||= {};
  at[last] = a + (b - a) * Math.min(1, d / n);
  return o;
}, {});
// The presenter's eased change of patient ('morph'): the live state blended from where it is to a slide's state. Numbers ease
// (a number only one side has, such as a new thrombus or stenosis, grows from 0); a switch flips halfway; everything else
// (events, bands, the random state) is the slide's from the start.
const MORPH_KEYS = ['params', 'V', 'P', 'Q', 'MAPf', 'hr', 'baro', 'habr', 'slow', 'blood', 'iap', 'day', 't'];
function mix(a, b, k) {
  if (typeof a === 'number' || typeof b === 'number') {
    if ((typeof a === 'number' || a === undefined) && (typeof b === 'number' || b === undefined)) return (a ?? 0) + ((b ?? 0) - (a ?? 0)) * k;
  } else if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length === b.length) return a.map((x, i) => mix(x, b[i], k));
  } else if (a && b && typeof a === 'object' && typeof b === 'object') {
    const o = {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) o[key] = mix(a[key], b[key], k);
    return o;
  }
  return k < 0.5 ? a : b;
}
const morphAt = (from, to, k) => ({ ...to, ...Object.fromEntries(MORPH_KEYS.map((key) => [key, mix(from[key], to[key], k)])) });
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
  const newSamples = () => ({ t: [], vel: [], pvVel: [], hvVel: [], whvp: [], hvpg: [], ...Object.fromEntries(SAMPLE_NODES.map((n) => [n, []])) });

  function sample() {
    if (!samples) samples = newSamples();
    samples.t.push(eng.t);
    samples.vel.push(eng.velocity(probe));
    samples.pvVel.push(eng.velocity('PV_TRUNK'));
    samples.hvVel.push(eng.velocity('RHV_IVC'));
    const hv = eng.hvpgTrue();
    samples.whvp.push(hv.whvp);
    samples.hvpg.push(hv.hvpg);
    for (const n of SAMPLE_NODES) samples[n].push(eng.P[eng.ni[n]]);
  }

  function frame() {
    const m = detectEvents(eng);
    const D = new Float32Array(eng.E);
    for (let k = 0; k < eng.E; k++) D[k] = eng.diameter(eng.edges[k].id);
    const f = {
      type: 'frame',
      changed: frameDirty,
      t: eng.t, day: eng.day, running, speed, clock, probe,
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
      samples,
      params: paramsDirty ? eng.paramsTarget() : undefined,
    };
    paramsDirty = false;
    frameDirty = false;
    samples = null;
    post(f, [f.P.buffer, f.Pf.buffer, f.Q.buffer, f.Qf.buffer, f.ext.buffer, f.D.buffer]);
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
    post({ type: 'crash', message: String(err && err.stack || err) });
  }
  function tick() {
    try { tickOnce(); } catch (err) { crash(err); }
  }

  let lastFrame = 0;
  function tickOnce() {
    const now = performance.now();
    const realDt = last == null ? 0 : Math.min(0.1, (now - last) / 1000);
    last = now;
    eng.beat = beat;
    if (morph) {
      const k = Math.min(1, (now - morph.t0) / morph.ms);
      eng.restore(k >= 1 ? morph.to : morphAt(morph.from, morph.to, easeInOut(k)));
      if (k >= 1) morph = null;
      paramsDirty = true; frameDirty = true;
    } else if (running) {
      if (clock === 'hemo') {
        if (lapse?.bedside) bedsideStep(now);
        // (On a hidden copy of the model: the beat runs on, so the Doppler and tracings stay smooth while a slider moves.)
        if (now < relaxUntil) eng.relaxHidden(); else eng.relaxDone();
        const h = hemoStep(eng.params.pulsatile || beat, speed);
        let simDt = realDt * speed;
        let n = Math.min(Math.ceil(simDt / h), h < 0.02 ? 700 : 400);
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
    if (frameDirty || paramsDirty || eng.newEvents.length || (running && now - lastFrame > 95)) { lastFrame = now; frame(); }
  }

  // A presenter time-lapse: one day at a time, exactly as the presenter's off-screen chain computed it
  // ('sequence' with fine days), then back to bedside time once the days are done.
  function lapseDays(n) {
    for (let k = 0; k < n && lapse; k++) {
      if (lapse.ramp) eng.setParams(deepMerge(eng.paramsTarget(), rampAt(lapse.ramp, lapse.total - lapse.left + 1, lapse.total)));
      eng.advanceDays(1, { noRupture: true, silent: true });
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

  function start() {
    if (timer || crashed || !running || !visible) return;
    last = null;
    timer = setInterval(tick, 33);
  }

  function stop() {
    if (timer) clearInterval(timer);
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
      paramsDirty = true;
      start();
    },
    setParams({ params, settle, ease }) {
      morph = null;
      // UI-originated: not echoed back (avoids overwriting in-flight edits).
      // (Its numbers eased in over a fraction of a second, so a slider moves the model, and the Doppler, without steps.)
      if (settle) { eng.setParams(sanitizeParams(params)); eng.settle(); } else eng.easeParams(sanitizeParams(params));
      // ease (ms): the presenter's live buttons and sliders, eased to the new steady state over that long (see tick).
      relaxUntil = ease > 0 ? performance.now() + ease : 0;
    },
    *preset({ id, days, reqId }) {
      morph = null;
      yield* eng.loadPresetSteps(id, days != null ? { days: days + (PRESETS.find((p) => p.id === id)?.days || 0) } : {});
      post({ type: 'presetLoaded', reqId, id, params: eng.params });
    },
    reset() { morph = null; eng = new Engine(); paramsDirty = true; },
    run({ running: r, speed: s, clock: c }) {
      if (r !== undefined) running = r;
      if (s !== undefined) speed = s;
      if (c !== undefined) { clock = c; diseaseAcc = 0; if (c === 'hemo') lapse = null; }
    },
    // The presenter's time-lapse: days on the disease clock at speed days a second, ramp's params eased over
    // them ({ key: [from, to] }); days 0 stops one under way.
    // bedside: the ramp plays over the slide's seconds on the seconds clock instead (see bedsideStep).
    lapse({ days, speed: s, ramp, bedside }) {
      morph = null;
      lapse = days > 0 ? { left: days, total: days, ramp: ramp ? Object.entries(ramp) : null, bedside: bedside ? { t0: performance.now(), ms: (days / s) * 1000 } : null } : null;
      running = true; clock = lapse && !bedside ? 'disease' : 'hemo'; speed = lapse && !bedside ? s : 1; diseaseAcc = 0;
    },
    // Next during a bedside time-lapse: what is left of it runs in ms.
    lapseFast({ ms }) {
      if (!lapse?.bedside) return;
      const now = performance.now(), b = lapse.bedside, k = Math.min(1, (now - b.t0) / b.ms);
      b.ms = ms / Math.max(1e-6, 1 - k); b.t0 = now - k * b.ms;
    },
    // The presenter's slide that turns breathing off stops it on the live model as the slide begins (only that switch;
    // a morph under way keeps easing to its own state).
    breath({ on }) { eng.params.respiration = !!on; paramsDirty = true; },
    visibility({ visible: v }) { visible = v; },
    // restartClock: the days are the patient's past (the patient aged before the story starts), so the clock and
    // event log start fresh at day 0 afterwards.
    *advance({ days, untilEvent, restartClock }) {
      morph = null;
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
    action({ action }) { morph = null; applyAction(eng, action); paramsDirty = true; },
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
    restore({ snap }) { morph = null; relaxUntil = 0; eng.restore(snap); lapse = null; paramsDirty = true; },
    // The presenter's change of patient, eased over ms from the live state (wherever it is, a change under way included) to snap.
    morph({ snap, ms }) {
      lapse = null; clock = 'hemo'; speed = 1; diseaseAcc = 0; relaxUntil = 0;
      if (!(ms > 0)) { morph = null; eng.restore(snap); paramsDirty = true; return; }
      morph = { from: eng.snapshot(), to: snap, t0: performance.now(), ms };
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
    *sequence({ steps, base, reqId }) {
      const e = new Engine();
      if (base) e.restore(base);
      for (let i = 0; i < (steps || []).length; i++) {
        const st = steps[i] || {};
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
        post({ type: 'seqStep', reqId, i, snap: e.snapshot(), params: structuredClone(e.params), fp: fingerprint(m, e), trail, start, ...(extra ? { extra } : {}) });
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
        if (!crashed && !['snapshot', 'explain', 'healthyProfile', 'presets', 'metrics', 'presetMetrics', 'sequence'].includes(msg.type)) {
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
    dispose: stop,
  };
}
