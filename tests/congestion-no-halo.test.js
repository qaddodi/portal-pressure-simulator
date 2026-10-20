// The Congestion lens shows congestion by the vessels' colour alone, as every other lens shows its data: no halo
// around the backed-up veins (his card pick, 20 Oct 2026: the halo was too heavy and repeated the colour).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the Congestion lens draws no halo: GPU, Lite graphics or CSS', () => {
  const gl = read('../src/ui/veins-gl.js'), stage = read('../src/ui/stage.js'), css = read('../styles/app.css');
  assert.doesNotMatch(gl, /uniform int heat\b/, 'no congestion-glow switch in the vein shader');
  assert.doesNotMatch(gl, /sheat\[|shcol\[/, 'no per-vessel congestion-glow strength or colour');
  assert.doesNotMatch(stage, /heatGlow|heatBlur|v-heat|heatA\b/, 'no SVG halo layer for Lite graphics');
  assert.doesNotMatch(css, /#heatGlow|\.v-heat\b/);
  // The lens gets the usual reach: its cells are no wider than any other lens's.
  assert.match(stage, /reach: glow\.lit\.size \? 20 : 11,/);
});

test('the Congestion lens still colours the vessels by the heat ramp', () => {
  const stage = read('../src/ui/stage.js');
  assert.match(stage, /else if \(mode === 'heat'\) \{ c1 = heatColor\(/);
});
