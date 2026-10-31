// Production pass (31 Oct): whatever the controls (or a hand-made link) put in the model, every number it shows is finite. Random patients with
// parameters at and between their limits, stenoses and clots, shunts and drugs, are settled and run on; none may produce a NaN or an Infinity,
// in the metrics or in the flows and pressures. (A seeded generator, so a failure repeats.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { PRESETS, sanitizeParams } from '../src/engine/scenario.js';

// (The parameter ranges are not exported: read from the source, so the test follows them.)
const src = readFileSync(new URL('../src/engine/scenario.js', import.meta.url), 'utf8');
const at = src.indexOf('const RANGES = {');
const RANGES = new Function(src.slice(at, src.indexOf('};', at) + 1).replace('const RANGES =', 'return'))();

test('the ranges were read (the test is not passing on an empty table)', () => {
  assert.ok(Object.keys(RANGES).length >= 12);
  assert.deepEqual(RANGES.cirrhosis, [0, 1]);
});

test('random patients at and between the controls\' limits never produce a NaN or an Infinity', () => {
  let seed = 20261031;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const walk = (o, path, out) => {
    if (typeof o === 'number') { if (!Number.isFinite(o)) out.push(path); }
    else if (o && typeof o === 'object') for (const k of Object.keys(o)) if (typeof o[k] !== 'function') walk(o[k], `${path}.${k}`, out);
  };
  const bad = [];
  for (let i = 0; i < 24; i++) {
    const e = new Engine(), pr = PRESETS[Math.floor(rnd() * PRESETS.length)];
    e.loadPreset(pr.id);
    const p = structuredClone(e.params);
    for (const [k, [lo, hi]] of Object.entries(RANGES)) if (rnd() < 0.35) { const r = rnd(); p[k] = r < 0.3 ? lo : r < 0.6 ? hi : lo + rnd() * (hi - lo); }
    for (const id of Object.keys(p.stenosis || {})) if (rnd() < 0.3) p.stenosis[id] = rnd() < 0.5 ? 0.95 : rnd() * 0.95;
    for (const id of Object.keys(p.thrombus || {})) if (rnd() < 0.3) p.thrombus[id] = rnd() < 0.5 ? 1 : rnd();
    if (rnd() < 0.3) p.tips = { on: true, d: 6 + rnd() * 6 };
    if (rnd() < 0.2) p.dips = { on: true, d: 6 + rnd() * 6 };
    for (const k of Object.keys(p.drugs || {})) if (rnd() < 0.3) p.drugs[k] = true;
    e.setParams(sanitizeParams(p)); e.settle();
    for (let s = 0; s < 40; s++) e.step(0.25);
    const out = [];
    walk(computeMetrics(e), 'metrics', out); walk(Array.from(e.Q || []), 'Q', out); walk(Array.from(e.P || []), 'P', out);
    if (out.length) bad.push(`${pr.id} #${i}: ${out.slice(0, 4).join(', ')}`);
  }
  assert.deepEqual(bad, []);
});
