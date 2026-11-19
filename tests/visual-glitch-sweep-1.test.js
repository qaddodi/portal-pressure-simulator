// Visual glitch sweep 1 (31 Oct): the change halos and the shunt's target name keep their size on screen at any zoom and fade in;
// a catheter leaving for a new patient no longer dims the whole figure first; the lobule's zone bands stay on through its way out.
import { test } from 'node:test';
import assert from 'node:assert/strict';







// Sweep 2: anatomy.
import { EDGE_PATH } from '../src/ui/anatomy.js';
const end = (d) => d.trim().split(/[\s,]+/).slice(-2).map(Number);

test('the hepatic veins meet the cava at three heights, never two within 20 units (they were joined as one bar)', () => {
  const e = ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'].map((id) => end(EDGE_PATH[id]));
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) assert.ok(Math.hypot(e[a][0] - e[b][0], e[a][1] - e[b][1]) >= 20, `${a}-${b}`);
});

test('the portocaval shunt meets the cava above the left renal vein', () => {
  const [, y] = end(EDGE_PATH.S_PC), [, yr] = end(EDGE_PATH.LRV_IVC);
  assert.ok(y < yr - 20);
});


// Sweep 3: no ghost copies while the GPU draws the vessels. (The umbilicus stays where it was drawn, at (500, 800): Mohammad, 31 Oct.)



test('the beat card on a phone keeps "17.1 WHVP" inside its edge, and its top number gives way to the unit over it', async () => {
  const { beatLayout } = await import('../src/ui/beat-card.js');
  const l = beatLayout(340, 300);
  assert.ok(340 - l.R >= 116, 'room for a value and WHVP at the line ends');
});


