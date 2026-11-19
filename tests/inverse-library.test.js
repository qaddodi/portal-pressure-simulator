// Work backward: the shipped library is the engine's own answers. The file lists exactly the grid of inverse-families.js, and a sample of its
// patients run again now give the same readings, so a change to the engine or a family that moves one fails here (run
// node scripts/gen-inverse-library.mjs, which takes about a minute and a half, and commit the file). Also: a patient made at run time loads
// like a built-in one, and its patch cannot carry a value no control can reach into the model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/engine/portal/inverse-library.js';
import { FAMILIES, FAMILY, keyOf } from '../src/engine/portal/inverse-families.js';
import { pointsOf, rowOf, READING_KEYS } from '../src/engine/portal/inverse.js';
import { runPatient } from '../src/engine/portal/inverse-run.js';
import { Engine } from '../src/engine/portal/engine.js';
import { PRESETS, presetFromPatch, registerPreset, forgetPreset, defaultParams } from '../src/engine/portal/scenario.js';

test('the library lists the grid of every family, in order, once', () => {
  const grid = FAMILIES.flatMap((f) => f.grid.map((p) => keyOf(f.id, p)));
  assert.deepEqual(pointsOf(LIBRARY).map((p) => keyOf(p.f, p.p)), grid);
  assert.equal(new Set(grid).size, grid.length, 'two grid points of one family are the same patient');
});

test('every library row has a number for each reading the search scores, bar the ones the model may not print', () => {
  for (const [f, vals, rs] of LIBRARY) {
    assert.equal(vals.length, FAMILY[f].axes.length);
    assert.equal(rs.length, READING_KEYS.length);
    rs.forEach((v, i) => assert.ok(v === null || Number.isFinite(v), `${f} ${READING_KEYS[i]}`));
    for (const k of ['whvp', 'fhvp', 'pv', 'ra', 'ivc', 'lsm', 'spleen', 'plt', 'asc']) assert.ok(rs[READING_KEYS.indexOf(k)] != null, `${f} ${k}`);
  }
});

test('a sample of patients run again give the readings in the file', () => {
  const pts = pointsOf(LIBRARY);
  // The middle point of each family's grid: one patient per family, every family's days, volume and patch builder run.
  for (const f of FAMILIES) {
    const i = pts.findIndex((pt) => pt.f === f.id) + Math.floor(f.grid.length / 2), pt = pts[i];
    assert.equal(pt.f, f.id);
    assert.deepEqual(rowOf(pt.f, pt.p, runPatient(pt.f, pt.p)), LIBRARY[i], `${pt.f} ${JSON.stringify(pt.p)}`);
  }
});

test('a patient made at run time loads like a built-in and takes the same days and volume', () => {
  const patch = { fibrosis: { R: { pre: 50, sin: 2.2 }, L: { pre: 50, sin: 2.2 } } };
  const e = new Engine(), builtIn = PRESETS.length;
  e.loadPreset(null, { preset: presetFromPatch({ id: 'yours-test', label: 'Test', patch, days: 365 }) });
  assert.equal(PRESETS.length, builtIn, 'loading a patient does not add it to the list');
  assert.equal(e.params.fibrosis.R.pre, 50);
});

test('a run-time patient cannot carry a value no control can reach', () => {
  const pr = presetFromPatch({ id: 'yours-bad', patch: { cirrhosis: 9, fibrosis: { R: { pre: 1e9 } } }, days: -5, volume: 1e9 });
  const p = pr.apply(defaultParams());
  assert.ok(p.cirrhosis <= 1);
  assert.ok(p.fibrosis.R.pre < 1e9);
  assert.equal(pr.days, 0);
  assert.ok(pr.volume <= 3000);
});

test('registering a patient adds it once, replaces its own older copy, never replaces a built-in, and forgetting it takes it out', () => {
  const n = PRESETS.length;
  assert.ok(registerPreset({ id: 'yours-1', label: 'One', patch: {} }));
  assert.ok(registerPreset({ id: 'yours-1', label: 'One again', patch: {} }));
  assert.equal(PRESETS.length, n + 1);
  assert.equal(PRESETS.find((p) => p.id === 'yours-1').label, 'One again');
  assert.equal(registerPreset({ id: PRESETS[0].id, label: 'Imposter', patch: {} }), null);
  assert.notEqual(PRESETS[0].label, 'Imposter');
  assert.equal(forgetPreset('yours-1'), true);
  assert.equal(forgetPreset(PRESETS[0].id), false, 'a built-in is never forgotten');
  assert.equal(PRESETS.length, n);
});
