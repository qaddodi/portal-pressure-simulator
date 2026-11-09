// Phase 2 of the compiler's tests (plan 9.A), the lobule: the stage booted in node, the dive into the lobule, and the lobule's own vessel renderer
// instance (veins-gl who 'lobule') as the stage hands it its binning, tube attributes and radii. Judged by the same oracles as the figure
// (tests/vec-oracle.js, tests 1 to 6). Test 7 and 8 do not apply: the lobule has no morph sets, and its widths are the CPU's own per frame.
import { bootAnatomy, taps } from './vec-anatomy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build, checkBuilt, check1, check2, check3, check4, check5, check6 } from './vec-oracle.js';

const A = await bootAnatomy();
await A.preset('cirr-decomp', 30);
await A.view('lobule', 220);
const tap = taps.find((x) => x.who === 'lobule' && x.bins);
const fig = tap && { nTubes: tap.nTubes, bins: { ent: tap.bins.ent.slice(), cells: tap.bins.cells.slice(0, tap.bins.nCells * 6), nCells: tap.bins.nCells, nEnt: tap.bins.nEnt, rows: tap.bins.rows }, tube: tap.tube.slice(), rad: tap.rad.slice() };

test('the lobule: its vessels compile (rows, joins, regions by kind)', (t) => {
  assert.ok(fig, 'the lobule\'s renderer was given a binning');
  const v = build(fig);
  checkBuilt(v, t, 'lobule');
  assert.ok(v.graph.rows.filter((r) => r.on).length > 100, 'the lobule\'s vessels are on');
});
test('the lobule: tests 1 to 6 (points in reach, ordinary runs, join cells, tiers, members, one owner a pixel)', (t) => {
  const v = build(fig), name = 'lobule';
  check1(v, t, name, { step: 2 }); check2(v, t, name, { minSimple: 1 });   // (the lobule is nearly all regions: 29 ordinary cells of 1056)
  check3(v, t, name); check4(v, t, name, { allowNone: true }); check5(v, t, name); check6(v, t, name);
});
