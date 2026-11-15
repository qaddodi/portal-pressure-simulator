// The origin and first-pass colours ease when they change (15 Nov 2026, Mohammad: "the shift in origin still doesn't transition nicely, it pops when things change").
// Nothing may pop: a change of patient moved every vessel to its new blend in one frame. The figure shows the blends eased toward what the passes work out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { deepMerge } from '../src/engine/scenario.js';
import { EDGES, NODES } from '../src/engine/topology.js';
import { originFractionsInto, ORIGIN_N } from '../src/ui/blood.js';
import { easeOrigins, ORIGIN_EASE_S } from '../src/ui/origin-ease.js';

const E = EDGES.length, N = ORIGIN_N;
const goalOf = (preset, params, pass) => {
  const e = new Engine(); e.loadPreset(preset);
  if (params) { e.setParams(deepMerge(e.params, params)); e.settle(); }
  const g = { origins: new Float32Array(E * N), down: new Float32Array(E * N), pe: new Float32Array(E), slosh: new Float64Array(E), len: new Float64Array(E).fill(120) };
  originFractionsInto(EDGES, NODES, Float64Array.from(e.Qf), Float64Array.from(e.Pf), g.origins, g, pass);
  return g;
};
const shownOf = (g) => ({ origins: g.origins.slice(), down: g.down.slice(), pe: g.pe.slice() });

for (const pass of [false, true]) {
  test(`a change of patient eases the ${pass ? 'first-pass' : 'origin'} colours: no vessel jumps in a frame, all arrive, and it stops`, () => {
    const a = goalOf('healthy', null, pass), b = goalOf('cirr-decomp', { tips: { on: true, d: 8 } }, pass);
    let differ = 0;
    for (let i = 0; i < a.origins.length; i++) if (Math.abs(a.origins[i] - b.origins[i]) > 0.3) differ++;
    assert.ok(differ > 5, `the two patients differ (${differ} blends)`);
    const shown = shownOf(a);
    const dt = 1 / 60;
    let worstStep = 0, frames = 0, moving = true;
    for (; moving && frames < 600; frames++) {
      const before = shown.origins.slice();
      moving = easeOrigins(shown, b, dt, N);
      for (let i = 0; i < before.length; i++) worstStep = Math.max(worstStep, Math.abs(shown.origins[i] - before[i]));
      for (let k = 0; k < E; k++) { let s = 0; for (let c = 0; c < N; c++) s += shown.origins[k * N + c]; assert.ok(s < 1.001, `${EDGES[k].id}: a blend adds to ${s}`); }
    }
    assert.ok(worstStep < 0.12, `the biggest step in a frame is ${worstStep.toFixed(3)}`);
    assert.ok(frames > ORIGIN_EASE_S * 60 * 0.5 && frames < 600, `it takes about ${ORIGIN_EASE_S} s a step and stops (${frames} frames)`);
    for (let i = 0; i < a.origins.length; i++) assert.ok(Math.abs(shown.origins[i] - b.origins[i]) < 1e-3, `blend ${i} arrived`);
    for (let k = 0; k < E; k++) assert.equal(shown.pe[k], b.pe[k], `${EDGES[k].id}: its ramp ends as the model's does`);
    assert.equal(easeOrigins(shown, b, dt, N), false, 'at rest nothing moves');
  });
}

test('a vessel\'s ramp stays on while its blend is still easing to its own (it never switches off under a colour that is not there yet)', () => {
  const n = 2, shown = { origins: Float32Array.of(0, 1, 0, 1), down: Float32Array.of(1, 0, 0, 1), pe: Float32Array.of(5, 0) };
  const goal = { origins: Float32Array.of(0, 1, 0, 1), down: Float32Array.of(0, 1, 0, 1), pe: Float32Array.of(0, 0) };
  let steps = 0;
  while (easeOrigins(shown, goal, 1 / 60, n) && steps < 600) { steps++; if (shown.down[0] > 5e-4) assert.equal(shown.pe[0], 5, 'the ramp is on until the blend is its own'); }
  assert.equal(shown.pe[0], 0, 'then it goes');
  assert.ok(steps > 10, 'and the blend eased there');
});
