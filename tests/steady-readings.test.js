// The readings hold still at rest (full app review 15 Nov 2026, issues 3 and 4: ENG-2 to ENG-5, and the steady-readings item). The model breathes (a 4 s sine) and
// beats; the readings the screen prints are its means over exactly one breath, then exactly one beat (engine shownMean, display-mean.js),
// with a dead band at their printed precision, so a settled patient's HVPG, PPG, RPP and portal velocity print the same value breath after
// breath (before: HVPG and PPG swung by 0.2 to 1.1 mmHg, RPP by 3 to 7, and SOS at 9.9 crossed the red line with every breath). No preset
// rests within a quarter of a mmHg of a line its tiles colour by, settled or at the bedside, and the worker stops posting frames once nothing moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DisplayMean, holdAt, BREATH_S } from '../src/engine/display-mean.js';
import { HVPG_CUTS, PPG_CUTS } from '../src/engine/pressure-cuts.js';

test('one breath, then one beat: a breathing, beating signal leaves its mean and nothing else', () => {
  const m = new DisplayMean(1), v = new Float64Array(1), beatS = 0.8;
  m.seed(Float64Array.of(10));
  let t = 0, lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 30 / 0.004; i++) {
    // A breath of ±0.6 and a sharp beat wave of ±1 (its second harmonic too), around 10.
    v[0] = 10 + 0.6 * Math.sin(2 * Math.PI * t / BREATH_S) + Math.sin(2 * Math.PI * t / beatS) + 0.5 * Math.cos(4 * Math.PI * t / beatS);
    m.add(v, 0.004, beatS); t += 0.004;
    if (t > 10) { lo = Math.min(lo, m.out[0]); hi = Math.max(hi, m.out[0]); }
  }
  assert.ok(Math.abs(lo - 10) < 0.01 && Math.abs(hi - 10) < 0.01, `the mean holds at 10 (${lo.toFixed(4)} to ${hi.toFixed(4)})`);
  // A step that is no whole number of bins still lands on the mean, and a real change still comes through in about one breath.
  const s = new DisplayMean(1); s.seed(Float64Array.of(0));
  t = 0;
  for (let i = 0; i < 12 / 0.007; i++) { v[0] = 5 + Math.sin(2 * Math.PI * t / BREATH_S); s.add(v, 0.007, 1); t += 0.007; }
  assert.ok(Math.abs(s.out[0] - 5) < 0.02, `a 7 ms step: ${s.out[0]}`);
});

test('the dead band keeps a mean on a rounding boundary in its printed value, and lets a real move through', () => {
  // 9.95 is the boundary between 9.9 and 10.0: a mean that wobbles across it by a few thousandths keeps the value it had.
  let held = 9.9;
  for (const v of [9.951, 9.948, 9.953, 9.949, 9.96]) { held = holdAt(held, v); assert.equal(held.toFixed(1), '9.9', `${v} stays 9.9`); }
  assert.equal(holdAt(9.9, 9.99).toFixed(1), '10.0', 'past the band it moves on');
  assert.equal(holdAt(9.9, 10.3), 10.3, 'two printed values on, it passes as it is');
  assert.equal(holdAt(10.0, 9.949).toFixed(1), '10.0', 'and the same downward');
  assert.equal(holdAt(87, 87.4, 1), 87.4, 'inside its own printed value nothing is held');
  assert.equal(Math.round(holdAt(87, 87.9, 1)), 88, 'a whole-number reading past the band moves on');
  assert.equal(Math.round(holdAt(87, 87.6, 1)), 87, 'and inside it stays');
  assert.equal(holdAt(NaN, 4), 4);
});

const cutsOf = { hvpg: [HVPG_CUTS.amber, HVPG_CUTS.red], ppg: [PPG_CUTS.amber, PPG_CUTS.red] };
const MARGIN = 0.25;   // (a quarter of a mmHg: past the rounding and the bedside model's drift after a load; the meal's PPG rests at 5.7)

test('every preset at the bedside: HVPG, PPG, RPP and portal velocity print one value breath after breath, off the lines they are coloured by', async () => {
  const { Engine } = await import('../src/engine/engine.js');
  const { computeMetrics } = await import('../src/engine/metrics.js');
  const { PRESETS } = await import('../src/engine/scenario.js');
  const bad = [];
  for (const pr of PRESETS) {
    const e = new Engine(); e.loadPreset(pr.id); e.beat = true;
    const settled = computeMetrics(e);
    for (const k of ['hvpg', 'ppg']) for (const c of cutsOf[k]) if (Math.abs(settled[k] - c) < MARGIN) bad.push(`${pr.id}: settled ${k} ${settled[k].toFixed(2)} on the ${c} line`);
    // (30 s for the bedside model to come to its own rest after the load, then 15 s read ten times a second.)
    const h = 0.004, seen = { hvpg: new Set(), ppg: new Set(), rpp: new Set(), pv: new Set() };
    let live = null;
    for (let i = 0; i < 45 / h; i++) {
      e.step(h);
      if (i * h < 30 || i % 25) continue;
      live = computeMetrics(e);
      seen.hvpg.add(live.hvpg.toFixed(1)); seen.ppg.add(live.ppg.toFixed(1));
      seen.rpp.add(Math.round(live.rpp)); seen.pv.add(Math.round(live.pvVelMean));
    }
    for (const [k, s] of Object.entries(seen)) if (s.size > 1) bad.push(`${pr.id}: ${k} prints ${[...s].join(', ')} at rest`);
    for (const k of ['hvpg', 'ppg']) for (const c of cutsOf[k]) if (Math.abs(live[k] - c) < MARGIN) bad.push(`${pr.id}: bedside ${k} ${live[k].toFixed(2)} on the ${c} line`);
  }
  assert.deepEqual(bad, []);
});

// The worker on a fake clock: frames posted per second of a settled patient, with no trace drawing and with one.
test('a settled patient posts the heartbeat frame only, and ten a second while a trace draws its samples', async () => {
  let T = 1000;
  const timers = new Map();
  let tid = 1;
  const ownNow = Object.getOwnPropertyDescriptor(performance, 'now'), sI = globalThis.setInterval, cI = globalThis.clearInterval, sT = globalThis.setTimeout, cT = globalThis.clearTimeout;
  Object.defineProperty(performance, 'now', { value: () => T, configurable: true });
  globalThis.setInterval = (fn, ms) => { timers.set(tid, { fn, at: T + ms, every: ms }); return tid++; };
  globalThis.setTimeout = (fn, ms) => { timers.set(tid, { fn, at: T + (ms || 0), every: 0 }); return tid++; };
  globalThis.clearInterval = globalThis.clearTimeout = (id) => timers.delete(id);
  const run = (ms) => {
    const end = T + ms;
    for (;;) {
      let best = null;
      for (const [id, t] of timers) if (t.at <= end && (!best || t.at < best[1].at)) best = [id, t];
      if (!best) break;
      const [id, t] = best; T = t.at;
      if (t.every) t.at += t.every; else timers.delete(id);
      t.fn();
    }
    T = end;
  };
  try {
    const { createCore } = await import('../src/worker-core.js');
    let frames = 0;
    const core = createCore((m) => { if (m.type === 'frame') frames++; });
    await core.handle({ type: 'init' });
    await core.handle({ type: 'traces', on: false });
    await core.handle({ type: 'run', running: true });
    for (const id of ['healthy', 'cirr-decomp']) {
      await core.handle({ type: 'preset', id });
      run(40000);
      frames = 0; run(10000);
      assert.ok(frames <= 12, `${id}: ${frames} frames in 10 s at rest (the heartbeat is 10)`);
    }
    await core.handle({ type: 'traces', on: true });
    frames = 0; run(10000);
    assert.ok(frames >= 80, `a trace drawing keeps its samples coming: ${frames} frames in 10 s`);
    await core.handle({ type: 'run', running: false });
    core.dispose?.();
  } finally {
    if (ownNow) Object.defineProperty(performance, 'now', ownNow); else delete performance.now;
    Object.assign(globalThis, { setInterval: sI, clearInterval: cI, setTimeout: sT, clearTimeout: cT });
  }
});
