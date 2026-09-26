// Simulation host: owns the Engine, runs the clocks, streams frames (blueprint §13.4).
// Used inside a Web Worker (src/worker.js) or on the main thread as a fallback.

import { Engine } from './engine/engine.js?v=6ab91924d3';
import { computeMetrics } from './engine/metrics.js?v=19da291c1c';
import { detectEvents } from './engine/events.js?v=d8b29adc5b';
import { explain } from './engine/explain.js?v=b1777c7edf';
import { defaultParams, deepMerge, PRESETS } from './engine/scenario.js?v=3bed5bf285';

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
  let visible = true;
  let frameDirty = true;
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
      changed: frameDirty,
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
    frameDirty = false;
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
    if (frameDirty || paramsDirty || eng.newEvents.length || (running && now - lastFrame > 95)) { lastFrame = now; frame(); }
  }

  function start() {
    if (timer || !running || !visible) return;
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
      if (params) { eng.setParams(deepMerge(defaultParams(), params)); eng.settle(); }
      paramsDirty = true;
      start();
    },
    setParams({ params, settle }) {
      // UI-originated: not echoed back (avoids overwriting in-flight edits).
      eng.setParams(deepMerge(defaultParams(), params));
      if (settle) eng.settle();
    },
    *preset({ id, days, reqId }) {
      yield* eng.loadPresetSteps(id, days != null ? { days: days + (PRESETS.find((p) => p.id === id)?.days || 0) } : {});
      post({ type: 'presetLoaded', reqId, id, params: eng.params });
    },
    reset() { eng = new Engine(); paramsDirty = true; },
    run({ running: r, speed: s, clock: c }) {
      if (r !== undefined) running = r;
      if (s !== undefined) speed = s;
      if (c !== undefined) { clock = c; diseaseAcc = 0; }
    },
    visibility({ visible: v }) { visible = v; },
    *advance({ days, untilEvent }) {
      const n0 = eng.eventLog.length;
      let done = 0;
      const max = untilEvent ? 730 : days;
      while (done < max) {
        const step = Math.min(untilEvent ? 1 : 30, max - done);
        const r = yield* eng.advanceDaySteps(step);
        done += step;
        if (r.ruptured) { clock = 'hemo'; break; }
        if (untilEvent && eng.eventLog.length > n0) break;
      }
      paramsDirty = true;
    },
    settle() { eng.settle(); },
    action({ action }) { applyAction(eng, action); paramsDirty = true; },
    // Run the model forward at bedside time (e.g. so a case opens with vitals that match its story).
    *preroll({ seconds, reqId }) {
      for (let t = 0; t < seconds; t += 0.1) { eng.step(0.1); yield; }
      paramsDirty = true;
      if (reqId) post({ type: 'prerolled', reqId });
    },
    // Counterfactual for a case debrief: from a snapshot, replay a plan of timed parameter sets
    // and actions in a separate engine, and report how the patient would have done.
    *counterfactual({ snap, plan, seconds, reqId }) {
      const e = new Engine();
      e.restore(snap);
      const steps = plan.slice().sort((a, b) => a.t - b.t);
      let i = 0, minMap = Infinity, stopAt = null;
      for (let t = 0, k = 0; t < seconds; t += 0.1, k++) {
        while (i < steps.length && steps[i].t <= t) {
          const s0 = steps[i++];
          if (s0.params) e.setParams(deepMerge(defaultParams(), s0.params));
          if (s0.action) applyAction(e, s0.action);
        }
        e.step(0.1);
        if (k % 10 === 0) minMap = Math.min(minMap, computeMetrics(e).map);
        if (stopAt == null && !e.bleed.active && t > 1) stopAt = t;
        yield;
      }
      const m = computeMetrics(e);
      post({ type: 'counterfactual', reqId, result: { minMap, lost: e.blood.lost, hb: m.blood.hb, map: m.map, bleeding: e.bleed.active, stopAt } });
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
        // Queries must not wake the renderer. Mutations send one immediate frame,
        // including UI-originated parameters without echoing those parameters back.
        if (!['snapshot', 'explain', 'healthyProfile', 'presets', 'counterfactual'].includes(msg.type)) {
          frameDirty = true;
          if (visible) { lastFrame = performance.now(); frame(); }
        }
      }
      catch (err) { post({ type: 'error', message: String(err && err.stack || err) }); }
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
