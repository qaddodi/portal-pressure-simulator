// The solver at the step sizes the app really uses, the slow clock's determinism, and the valved leg veins at reversal
// (review Q10 to Q12). Engine only, in Node: no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { solveInPlace } from '../src/engine/linalg.js';
import { Engine } from '../src/engine/engine.js';
import { PRESETS, defaultParams, deepMerge } from '../src/engine/scenario.js';
import { runSteps, changes } from './deck-states.js';

// A small seeded generator, so a failure repeats.
const lcg = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const finite = (e, what) => { for (const v of e.P) assert.ok(Number.isFinite(v), `NaN or Infinity for ${what}`); };

test('linalg: solves random SPD and non-symmetric systems to the reference answer', () => {
  const rnd = lcg(1);
  for (const n of [1, 2, 5, 17, 40]) {
    for (let trial = 0; trial < 5; trial++) {
      const B = Float64Array.from({ length: n * n }, () => rnd() * 2 - 1);
      // SPD: Bᵀ·B + n·I; non-symmetric: B with a strong diagonal.
      for (const spd of [true, false]) {
        const A = new Float64Array(n * n);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          if (spd) { let s = 0; for (let k = 0; k < n; k++) s += B[k * n + i] * B[k * n + j]; A[i * n + j] = s + (i === j ? n : 0); }
          else A[i * n + j] = B[i * n + j] + (i === j ? n : 0);
        }
        const x = Float64Array.from({ length: n }, () => rnd() * 200 - 100);
        const b = new Float64Array(n);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) b[i] += A[i * n + j] * x[j];
        const got = solveInPlace(Float64Array.from(A), b, n);
        for (let i = 0; i < n; i++) assert.ok(Math.abs(got[i] - x[i]) < 1e-8 * (1 + Math.abs(x[i])), `n=${n} spd=${spd} x[${i}] ${got[i]} vs ${x[i]}`);
      }
    }
  }
});

test('linalg: pivots past a zero on the diagonal and reports a singular matrix', () => {
  // [[0, 1], [1, 0]] needs a row swap.
  assert.deepEqual(Array.from(solveInPlace(Float64Array.from([0, 1, 1, 0]), Float64Array.from([3, 4]), 2)), [4, 3]);
  // Rank 1, and all zero.
  assert.throws(() => solveInPlace(Float64Array.from([1, 2, 2, 4]), Float64Array.from([1, 2]), 2), /Singular/);
  assert.throws(() => solveInPlace(new Float64Array(9), new Float64Array(3), 3), /Singular/);
});

// The app's step sizes: 0.004 s live with the heartbeat and 0.02 s without (worker-core), 0.1 s in a played procedure,
// 0.5 s for a live change's relaxation and 5 s for a disease day's settle (both quiet: no breath, no beat).
const PAIRED = [
  { cirrhosis: 1, tips: { on: true, d: 12 } }, { contractility: 0.2, tr: 1 }, { stenosis: { IVCS_RA: 0.95 }, respDepth: 3 },
  { systemicTone: 0.4, splanchnicTone: 3 }, { systemicTone: 3, splanchnicTone: 0.4 }, { pericardial: 1, albumin: 1.5 },
  { cirrhosis: 1, apShunt: 1, thrombus: { PV_TRUNK: 1 } }, { cirrhosis: 1, balloonEso: true }, { contractility: 2, respDepth: 3 },
  { cirrhosis: 1, gestation: 40 }, { stenosis: { PV_TRUNK: 1 }, tr: 1 },
];

test('T18 at 0.004 s with the heartbeat, paired extremes: finite and steady', () => {
  for (const x of PAIRED) {
    const e = new Engine();
    e.setParams(deepMerge(defaultParams(), { ...x, pulsatile: true }));
    for (let i = 0; i < 2500; i++) e.step(0.004);   // 10 s
    finite(e, JSON.stringify(x));
    e.setParams({ ...e.params, respiration: false, pulsatile: false });
    for (let i = 0; i < 7500; i++) e.step(0.004);
    // Over the next second, the to-and-fro beyond any steady drift (a portal bed still filling behind a clot drifts up).
    const a = Float64Array.from(e.P), prev = Float64Array.from(e.P), path = new Float64Array(e.P.length);
    for (let i = 0; i < 250; i++) {
      e.step(0.004);
      e.P.forEach((v, j) => { path[j] += Math.abs(v - prev[j]); prev[j] = v; });
    }
    const swing = Math.max(...Array.from(e.P, (v, j) => path[j] - Math.abs(v - a[j])));
    assert.ok(swing < 0.5, `oscillation ${swing} for ${JSON.stringify(x)}`);
  }
});

test('T18 at 0.5 s and 5 s (quiet, as relax and settle step), paired extremes: finite and converged', () => {
  for (const dt of [0.5, 5]) for (const x of PAIRED) {
    const e = new Engine();
    e.setParams(deepMerge(defaultParams(), x));
    e.quiet = true;
    for (let i = 0; i < Math.round(600 / dt); i++) e.step(dt);
    finite(e, `${JSON.stringify(x)} at ${dt} s`);
    const a = Float64Array.from(e.P);
    e.step(dt);
    const swing = Math.max(...Array.from(e.P, (v, i) => Math.abs(v - a[i])));
    assert.ok(swing < 0.5, `step-to-step change ${swing} for ${JSON.stringify(x)} at ${dt} s`);
  }
});

// End-stage cirrhosis late in pregnancy: the gravid belly holds the hepatic veins at their collapse point, where a long
// settling step used to flip them between collapsed and open on every step, so the state never settled.
test('T18 at 5 s and 10 s, end-stage cirrhosis at 40 weeks: converged', () => {
  for (const dt of [5, 10]) for (const cirrhosis of [0.9, 1]) {
    const e = new Engine();
    e.setParams(deepMerge(defaultParams(), { cirrhosis, gestation: 40 }));
    e.quiet = true;
    for (let i = 0; i < Math.round(900 / dt); i++) e.step(dt);
    const a = Float64Array.from(e.P);
    e.step(dt);
    const swing = Math.max(...Array.from(e.P, (v, i) => Math.abs(v - a[i])));
    assert.ok(swing < 0.5, `step-to-step change ${swing} for cirrhosis ${cirrhosis} at ${dt} s`);
  }
});

test('Every patient takes every action without throwing, and stays finite', () => {
  const actions = [
    ['crystalloid', (e) => e.infuse('crystalloid')], ['prbc', (e) => e.infuse('prbc')], ['albumin', (e) => e.infuse('albumin')],
    ['hemorrhage', (e) => e.hemorrhage(1000)], ['band', (e) => e.band()], ['paracentesis', (e) => e.paracentesis(4000, true)],
    ['valsalva', (e) => e.startValsalva(10)], ['rupture', (e) => e.rupture('VAR', 0.6)], ['rupture GV', (e) => e.rupture('GV', 0.6)],
    ['stopBleed', (e) => { e.rupture('VAR', 0.6); e.step(0.1); e.stopBleed('clot'); }],
  ];
  for (const { id } of PRESETS) {
    const base = new Engine(); base.loadPreset(id);
    const snap = base.snapshot();
    for (const [name, act] of actions) {
      const e = new Engine(); e.restore(snap);
      assert.doesNotThrow(() => {
        act(e);
        for (let i = 0; i < 100; i++) e.step(0.02);
        for (let i = 0; i < 20; i++) e.step(0.1);
        e.relax();
        e.advanceDays(2, { silent: true });
        e.settle();
      }, `${id} / ${name}`);
      finite(e, `${id} / ${name}`);
    }
  }
});

test('Q11 the slow clock is deterministic: days, fractions of a day and a seeded rupture', () => {
  const run = () => {
    const e = new Engine(); e.loadPreset('cirr-decomp');
    e.setParams({ ...e.params, seed: 11, bleeding: true });
    e.advanceDays(20, { silent: true });
    for (let i = 0; i < 12; i++) e.advanceFraction(0.25);
    e.setParams(deepMerge(e.params, { cirrhosis: 0.9 }));
    e.advanceDays(15);
    return JSON.stringify(e.snapshot());
  };
  assert.equal(run(), run());
});

test('Q11 the worker\'s slide sequence is deterministic, whatever ran before it', async () => {
  const DIR = new URL('../src/ui/decks/', import.meta.url);
  const decks = [];
  for (const f of readdirSync(DIR).filter((f) => f.endsWith('.js')).sort()) {
    const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
    if (d && ['ten-years', 'ascites'].includes(d.id)) decks.push(d);
  }
  assert.equal(decks.length, 2, 'the two time-lapse decks are found');
  const stepsOf = (d) => d.slides.map((s) => (changes(s) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, ramp: s.ramp, fine: !!s.lapse } : {}));
  const [a, b] = decks.map(stepsOf);
  const first = JSON.stringify(await runSteps(a));
  await runSteps(b);
  assert.equal(JSON.stringify(await runSteps(a)), first, 'a deck computes the same states after another deck has run');
});

test('Q12 a valved leg vein does not leak backwards at reversal, at any live step size', () => {
  // Deep breathing in raised right-sided pressure reverses the leg-vein gradient each breath. The valve shuts within the
  // step that reverses it (closed, it passes 0.2 % of its conductance), so no step lets a backward surge through.
  for (const id of ['rhf', 'ivc-web', 'constrictive']) for (const dt of [0.004, 0.02, 0.1]) {
    const e = new Engine(); e.loadPreset(id);
    e.setParams(deepMerge(e.params, { respDepth: 3 }));
    const k = e.ei.V_LOW;
    let min = Infinity;
    for (let i = 0; i < Math.round(30 / dt); i++) { e.step(dt); min = Math.min(min, e.Q[k]); }
    assert.ok(min > -0.05, `${id} at ${dt} s: ${min.toFixed(3)} mL/s backwards through the leg-vein valves`);
  }
});

test('Q12 releasing a Valsalva reopens the leg valves without a one-step surge', () => {
  for (const id of ['healthy', 'rhf']) {
    const e = new Engine(); e.loadPreset(id);
    e.startValsalva(10);
    const k = e.ei.V_LOW, q = [];
    for (let i = 0; i < 600; i++) { e.step(0.02); q.push(e.Q[k]); }
    const open = q.findIndex((v, i) => i > 400 && v > 1);
    assert.ok(open > 0, 'the valves reopen after the strain');
    const later = Math.max(...q.slice(open + 1, open + 50));
    assert.ok(q[open] <= 1.1 * later, `${id}: ${q[open].toFixed(1)} mL/s on the release step vs a peak of ${later.toFixed(1)} after`);
  }
});
