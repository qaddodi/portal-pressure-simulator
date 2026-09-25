// Simulation host: owns the Engine, runs the clocks, streams frames (blueprint §13.4).
// Used inside a Web Worker (src/worker.js) or on the main thread as a fallback.

import { Engine } from './engine/engine.js?v=a1c8cd3788';
import { computeMetrics } from './engine/metrics.js?v=151f4a8d03';
import { detectEvents } from './engine/events.js?v=05c3d4dce1';
import { explain } from './engine/explain.js?v=1309272cac';
import { defaultParams, deepMerge, PRESETS } from './engine/scenario.js?v=5ce6f00fdc';

const SAMPLE_NODES = ['RA', 'IVCS', 'RHV', 'CONF', 'SIN_R', 'VAR', 'AO', 'SV', 'SMV'];

export function createCore(post) {
  let eng = new Engine();
  let running = true;
  let speed = 1;
  let clock = 'hemo'; // 'hemo' | 'disease'
  let last = null;
  let probe = 'PV_TRUNK';
  let diseaseAcc = 0;
  let timer = null;
  let paramsDirty = true;
  let samples = null;
  const newSamples = () => ({ t: [], vel: [], pvVel: [], hvVel: [], ...Object.fromEntries(SAMPLE_NODES.map((n) => [n, []])) });

  function sample() {
    if (!samples) samples = newSamples();
    samples.t.push(eng.t);
    samples.vel.push(eng.velocity(probe));
    samples.pvVel.push(eng.velocity('PV_TRUNK'));
    samples.hvVel.push(eng.velocity('RHV_IVC'));
    for (const n of SAMPLE_NODES) samples[n].push(eng.P[eng.ni[n]]);
  }

  function frame() {
    const m = detectEvents(eng);
    const D = new Float32Array(eng.E);
    for (let k = 0; k < eng.E; k++) D[k] = eng.diameter(eng.edges[k].id);
    const f = {
      type: 'frame',
      t: eng.t, day: eng.day, running, speed, clock, probe,
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
      params: paramsDirty ? eng.params : undefined,
    };
    paramsDirty = false;
    samples = null;
    post(f, [f.P.buffer, f.Pf.buffer, f.Q.buffer, f.Qf.buffer, f.ext.buffer, f.D.buffer]);
  }

  let lastFrame = 0;
  function tick() {
    const now = performance.now();
    const realDt = last == null ? 0 : Math.min(0.1, (now - last) / 1000);
    last = now;
    if (running) {
      if (clock === 'hemo') {
        const h = eng.params.pulsatile ? 0.004 : 0.02;
        let simDt = realDt * speed;
        let n = Math.min(Math.ceil(simDt / h), eng.params.pulsatile ? 700 : 400);
        const every = Math.max(1, Math.floor(n / 24));
        for (let i = 0; i < n; i++) {
          eng.step(h);
          if (i % every === 0) sample();
        }
      } else {
        diseaseAcc += realDt * speed; // 1× = 1 day per second
        const days = Math.floor(diseaseAcc);
        if (days > 0) {
          diseaseAcc -= days;
          const r = eng.advanceDays(days);
          if (r.ruptured) { clock = 'hemo'; speed = 1; }
          if (eng.params.anticoag) paramsDirty = true;
          sample();
        }
      }
    }
    // Paused, nothing is evolving: a few frames a second keep the page in step with any action
    // taken, without recomputing and repainting everything 30 times a second.
    if (running || paramsDirty || now - lastFrame > 250) { lastFrame = now; frame(); }
  }

  function start() {
    if (timer) return;
    last = null;
    timer = setInterval(tick, 33);
  }

  const handlers = {
    init({ params }) {
      if (params) { eng.setParams(deepMerge(defaultParams(), params)); eng.settle(); }
      paramsDirty = true;
      start();
    },
    setParams({ params, settle }) {
      // UI-originated: not echoed back (avoids overwriting in-flight edits).
      eng.setParams(deepMerge(defaultParams(), params));
      if (settle) eng.settle();
    },
    preset({ id, days, reqId }) {
      eng.loadPreset(id, days != null ? { days: days + (PRESETS.find((p) => p.id === id)?.days || 0) } : {});
      post({ type: 'presetLoaded', reqId, id, params: eng.params });
    },
    reset() { eng = new Engine(); paramsDirty = true; },
    run({ running: r, speed: s, clock: c }) {
      if (r !== undefined) running = r;
      if (s !== undefined) speed = s;
      if (c !== undefined) { clock = c; diseaseAcc = 0; }
    },
    advance({ days, untilEvent }) {
      const n0 = eng.eventLog.length;
      let done = 0;
      const max = untilEvent ? 730 : days;
      while (done < max) {
        const step = Math.min(untilEvent ? 1 : 30, max - done);
        const r = eng.advanceDays(step);
        done += step;
        if (r.ruptured) { clock = 'hemo'; break; }
        if (untilEvent && eng.eventLog.length > n0) break;
      }
      paramsDirty = true;
    },
    settle() { eng.settle(); },
    action({ action }) {
      const a = action;
      switch (a.kind) {
        case 'infuse': eng.infuse(a.fluid); break;
        case 'hemorrhage': eng.hemorrhage(a.mL); break;
        case 'band': eng.band(); break;
        case 'paracentesis': eng.paracentesis(a.mL, a.albumin); break;
        case 'valsalva': eng.startValsalva(a.sec || 10); break;
        case 'rupture': eng.rupture(a.site || 'VAR', a.tear || 0.6); break;
        case 'stopBleed': eng.stopBleed('clot'); break;
      }
      paramsDirty = true;
    },
    probe({ id }) { probe = id; },
    snapshot({ reqId }) { post({ type: 'snapshot', reqId, snap: eng.snapshot() }); },
    restore({ snap }) { eng.restore(snap); paramsDirty = true; },
    explain({ metric, reqId }) {
      const r = explain(eng, metric);
      post({ type: 'explain', reqId, result: r });
    },
    healthyProfile({ reqId }) {
      const h = new Engine();
      post({ type: 'healthy', reqId, P: Array.from(h.P), Q: Array.from(h.Q), metrics: computeMetrics(h) });
    },
    presets({ reqId }) { post({ type: 'presets', reqId, presets: PRESETS.map(({ id, label, group, summary, days }) => ({ id, label, group, summary, days })) }); },
  };

  return {
    handle(msg) {
      try { handlers[msg.type]?.(msg); }
      catch (err) { post({ type: 'error', message: String(err && err.stack || err) }); }
    },
    engine: () => eng,
  };
}
