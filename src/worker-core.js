// Simulation host: owns the Engine, runs the clocks, streams frames (blueprint §13.4).
// Used inside a Web Worker (src/worker.js) or on the main thread as a fallback.

import { Engine } from './engine/engine.js?v=8fdce0dba8';
import { computeMetrics } from './engine/metrics.js?v=37f639c3dd';
import { detectEvents } from './engine/events.js?v=120d432c34';
import { explain } from './engine/explain.js?v=b07ad76de1';
import { defaultParams, deepMerge, sanitizeParams, PRESETS } from './engine/scenario.js?v=2ab3fe1eb2';

const SAMPLE_NODES = ['RA', 'IVCS', 'RHV', 'CONF', 'SIN_R', 'VAR', 'AO', 'SV', 'SMV'];

// A state's fingerprint for the ladder, the presenter's data and tables: the pressures from the portal vein to the
// heart, the gradients, the ascites (volume, SAAG, protein, albumin) and the lymph that makes it, the sinusoidal and
// central vein pressures, varices, spleen, flow and shunting.
// rih: the resistance inside the liver (mmHg per L/min): each lobe's venules, sinusoids and outflow in series, the
// two lobes in parallel, as the circuit view's liver resistor reads it. (PPG ÷ portal flow also counts the collaterals.)
const LOBES = [['PRE_R', 'SIN_RR', 'POST_R_RHV'], ['PRE_L', 'SIN_LL', 'POST_L_LHV']];
function liverRes(e) {
  const P = e.Pf || e.P, Q = e.Qf || e.Q;
  const r = (id) => { const k = e.ei[id], ed = e.edges[k]; return (P[e.ni[ed.from]] - P[e.ni[ed.to]]) / Math.max(1e-6, Math.abs(Q[k]) * 0.06); };
  return 1 / LOBES.reduce((g, ids) => g + 1 / Math.max(1e-6, ids.reduce((s, id) => s + r(id), 0)), 0);
}
const fingerprint = (m, e) => {
  const P = e ? e.Pf || e.P : null, a = m.ascites;
  return { pv: m.pv, whvp: m.whvp, fhvp: m.fhvp, hvpg: m.hvpg, ra: m.ra, ivc: m.ivc, ppg: m.ppg,
    asc: a.volume, saag: a.saag, tp: a.totalProtein, aalb: a.albumin, salb: e?.params.albumin, sigma: a.lymphSigma, hepLymph: a.hepLymph, splLymph: a.splLymph,
    sin: P ? P[e.ni.SIN_R] : null, cv: P ? P[e.ni.CV_R] : null, int: P ? P[e.ni.INT] : null, varix: m.varix.d, gv: m.gastricVarix.d, spleen: m.spleen.length, plt: m.spleen.platelets,
    pvFlow: m.pvFlowMean, shunt: m.shuntFraction, he: m.heRisk.index, liver: m.liverPerfPct, lsm: m.lsm, pvVel: m.pvVelMean, map: m.map, hr: m.hr, hb: m.blood.hb, rih: e ? liverRes(e) : null };
};
// A time-lapse's params on day d of n: each ramped key eased linearly from its first value to its last.
const rampAt = (ramp, d, n) => Object.fromEntries(ramp.map(([k, [a, b]]) => [k, a + (b - a) * Math.min(1, d / n)]));

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
      pulsing: !!(eng.params.pulsatile || eng.beat),
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
    eng.beat = beat;
    if (running) {
      if (clock === 'hemo') {
        const pulse = eng.params.pulsatile || beat;
        const h = pulse ? 0.004 : 0.02;
        let simDt = realDt * speed;
        let n = Math.min(Math.ceil(simDt / h), pulse ? 700 : 400);
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
    if (frameDirty || paramsDirty || eng.newEvents.length || (running && now - lastFrame > 95)) { lastFrame = now; frame(); }
  }

  // A presenter time-lapse: one day at a time, exactly as the presenter's off-screen chain computed it
  // ('sequence' with fine days), then back to bedside time once the days are done.
  function lapseDays(n) {
    for (let k = 0; k < n && lapse; k++) {
      if (lapse.ramp) eng.setParams(deepMerge(eng.params, rampAt(lapse.ramp, lapse.total - lapse.left + 1, lapse.total)));
      eng.advanceDays(1, { noRupture: true, silent: true });
      if (--lapse.left <= 0) { lapse = null; eng.settle(); clock = 'hemo'; speed = 1; diseaseAcc = 0; }
    }
    paramsDirty = true;
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
      if (params) { eng.setParams(sanitizeParams(params)); eng.settle(); }
      paramsDirty = true;
      start();
    },
    setParams({ params, settle }) {
      // UI-originated: not echoed back (avoids overwriting in-flight edits).
      eng.setParams(sanitizeParams(params));
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
      if (c !== undefined) { clock = c; diseaseAcc = 0; if (c === 'hemo') lapse = null; }
    },
    // The presenter's time-lapse: days on the disease clock at speed days a second, ramp's params eased over
    // them ({ key: [from, to] }); days 0 stops one under way.
    lapse({ days, speed: s, ramp }) {
      lapse = days > 0 ? { left: days, total: days, ramp: ramp ? Object.entries(ramp) : null } : null;
      running = true; clock = lapse ? 'disease' : 'hemo'; speed = lapse ? s : 1; diseaseAcc = 0;
    },
    visibility({ visible: v }) { visible = v; },
    // restartClock: the days are the patient's past (a case aging its patient), so the clock and
    // event log start fresh at day 0 afterwards.
    *advance({ days, untilEvent, restartClock }) {
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
      if (restartClock) { eng.day = 0; eng.t = 0; eng.eventLog = []; eng.newEvents = []; }
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
    beat({ on }) { if (beat !== !!on) { beat = !!on; frameDirty = true; } },
    snapshot({ reqId }) { post({ type: 'snapshot', reqId, snap: eng.snapshot() }); },
    restore({ snap }) { eng.restore(snap); lapse = null; paramsDirty = true; },
    explain({ metric, reqId }) {
      const r = explain(eng, metric);
      post({ type: 'explain', reqId, result: r });
    },
    healthyProfile({ reqId }) {
      const h = new Engine();
      post({ type: 'healthy', reqId, P: Array.from(h.P), Q: Array.from(h.Q), metrics: computeMetrics(h) });
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
    // which each slide starts from the one before (base: the state before the first), in the order the
    // lessons use (preset → params → settle → actions → disease days → settle). Each slide is posted as it is
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
        for (let done = 0; done < (st.days || 0);) {
          const n = fine ? 1 : Math.min(30, st.days - done);
          if (ramp) e.setParams(deepMerge(e.params, rampAt(ramp, done + 1, st.days)));
          yield* e.advanceDaySteps(n, { noRupture: true, silent: true });
          done += n;
        }
        if (st.preset || st.params || st.action || st.days) e.settle();
        post({ type: 'seqStep', reqId, i, snap: e.snapshot(), params: structuredClone(e.params), fp: fingerprint(computeMetrics(e), e) });
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
        // Queries must not wake the renderer. Mutations send one immediate frame,
        // including UI-originated parameters without echoing those parameters back.
        if (!['snapshot', 'explain', 'healthyProfile', 'presets', 'counterfactual', 'metrics', 'presetMetrics', 'sequence'].includes(msg.type)) {
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
