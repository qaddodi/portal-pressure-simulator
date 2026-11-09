// Acceptance 1 (vector-renderer-plan.md section 11): seamless joins and region edges at the deepest zoom.
// Node judges: the partition gives every pixel centre one owner (A), and the single-member pixel is drawn by the very same function on
// both sides of a cell edge (B's stretch shader, C's region shader). On the devices: pinch to the deepest zoom over a join and a region edge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as C from '../src/ui/vec-contract.js';

// What each check waits for: a workstream's file that is not in the tree yet (or lacks the export named). While anything is missing the
// check is skipped, and the skip says what for, so a plain `npm test` shows what is left (plan 9.J, Phase 1). A file present with its
// exports means its inputs have landed: Phase 3 replaces each skip with the real judgement (the assert.fail below says what it judges).
const UI = new URL('../src/ui/', import.meta.url);
async function needs(list) {
  const lack = [], mods = {};
  for (const [who, file, names] of list) {
    if (!existsSync(new URL(file, UI))) { lack.push(`${who}: ${file}`); continue; }
    mods[file] = await import(new URL(file, UI).href);
    const no = names.filter((n) => !(n in mods[file]));
    if (no.length) lack.push(`${who}: ${file} to export ${no.join(', ')}`);
  }
  return { mods, skip: lack.length ? `waits for ${lack.join('; ')}` : 'its inputs have landed; J writes this check next (Phase 3)' };
}

test('the contract carries the numbers this point reads', () => {
  for (const k of ['GRID_PAD', 'GRID_W', 'WIN_MAX', 'CELL_EMPTY', 'CELL_SIMPLE', 'CELL_REGION']) assert.equal(typeof C[k], 'number', k);
  assert.ok(C.CELL_EMPTY !== C.CELL_SIMPLE && C.CELL_SIMPLE !== C.CELL_REGION && C.CELL_EMPTY !== C.CELL_REGION, 'three different cell kinds');
});

const grid = await needs([['A', 'vec-graph.js', ['createVecGraph']], ['A', 'vec-compile.js', ['compileGrid']]]);
test('partition: under random cameras up to the deepest zoom every pixel centre has exactly one owner, a strip or a region, never both', { skip: grid.skip }, () => {
  assert.fail('Phase 3: compile every preset binning, then for random cameras (zoom up to the camera limit that F names) find each pixel centre\'s cell with the contract formula and count owners');
});

const same = await needs([['B', 'vec-stretch-glsl.js', ['vecStretchFS']], ['B', 'vec-shade-glsl.js', ['VEC_SHADE_GLSL']], ['C', 'vec-region-glsl.js', ['vecRegionFS']]]);
test('a single-member pixel calls the same vecShadeOne from the stretch shader and the region shader, and both find the cell by the one formula', { skip: same.skip }, () => {
  assert.fail('Phase 3: for FULL, BASE and BLOOD, both fragment sources call vecShadeOne and hold the same inv / gl_FragCoord / floor / gridO / CELL expression');
});
