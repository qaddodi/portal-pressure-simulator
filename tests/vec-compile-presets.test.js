// Phase 2 of the compiler's tests (plan 9.A): every preset, in the Anatomy and in the Circuit, compiled from the binning the stage really gives the
// vessel renderer, and judged by the same brute-force oracles as cirr-decomp (tests/vec-oracle.js: tests 1 to 5 and the partition rule). The deck
// slides use these presets (their patients), so a slide's binning is one of these or a patch of one (the width easings are test 7 of vec-compile.test.js).
import { bootAnatomy } from './vec-anatomy.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/engine/scenario.js';
import { build, checkBuilt, check1, check2, check3, check4, check5, check6 } from './vec-oracle.js';

const A = await bootAnatomy();
const FRAMES = 12;
let first = true;
for (const view of ['anatomy', 'circuit']) {
  for (const p of PRESETS) {
    test(`${view}, preset ${p.id}: compiled and judged (tests 1 to 6)`, { timeout: 240000 }, async (t) => {
      if (first) { await A.preset(p.id, 40); first = false; } else await A.preset(p.id, FRAMES);
      if (view === 'circuit' && p === PRESETS[0]) await A.view('circuit', 100);
      const fig = A.figure();
      assert.ok(fig && fig.bins, 'the stage gave the vessel renderer a binning');
      const v = build(fig), name = `${view}/${p.id}`;
      checkBuilt(v, t, name);
      check1(v, t, name, { step: 6 }); check2(v, t, name); check3(v, t, name); check4(v, t, name, { allowNone: true }); check5(v, t, name); check6(v, t, name);
    });
  }
}
