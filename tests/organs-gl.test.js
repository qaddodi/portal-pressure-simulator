import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cropToGrid } from '../src/ui/organs-gl.js';

// The organs as layers (organs-gl.js): each layer is cropped to its own box on the whole picture's pixel grid, so its pixels are
// the picture's own samples, and the layers are laid back to front in the SVG's order.

test("a layer's rect is its box grown out to whole pixels of the picture's grid, within the picture", () => {
  const want = [200, -200, 1020, 1320], k = 1.2;
  const r = cropToGrid(want, [500.1, 100.2, 700.7, 300.3], k);
  for (const [i, o] of [[0, 0], [1, 1]]) {
    const px = (r[i] - want[o]) * k;
    assert.ok(Math.abs(px - Math.round(px)) < 1e-9, 'starts on a whole pixel');
  }
  for (const i of [2, 3]) assert.ok(Math.abs(r[i] * k - Math.round(r[i] * k)) < 1e-9, 'a whole number of pixels');
  assert.ok(r[0] <= 500.1 && r[1] <= 100.2 && r[0] + r[2] >= 700.7 && r[1] + r[3] >= 300.3, 'covers the box');
  assert.ok(r[0] > 500.1 - 1 / k && r[0] + r[2] < 700.7 + 1 / k, 'by less than a pixel');
  // Cut to the picture, and nothing where they miss.
  assert.deepEqual(cropToGrid(want, [-Infinity, -Infinity, Infinity, Infinity], k), want);
  assert.equal(cropToGrid(want, [1300, 0, 1400, 10], k), null);
  assert.equal(cropToGrid(want, [0, 0, 0, 0], k), null);
});

test('the stage splits the organs into the layers in the SVG order, and shows a set only whole', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /const ORGAN_LAYERS = \['back', 'behind', 'gut', 'kidney', 'spleen', 'stomach', 'liver', 'front'\];/);
  // (An organ the list does not name goes with the layer before it: the SVG's order is always kept.)
  assert.match(stage, /for \(const k of gOrgans\.children\) \{ last = by\.get\(k\) \|\| last; out\.set\(k, last\); \}/);
  assert.match(stage, /if \(!\(await rasterPlate\(slot, r, scale, L, false, live\)\) \|\| v !== veins \|\| !v\.organs\) return false;/, 'a layer given up gives up the set');
  // (With the changing organs painted live, their layers are not made, and the gut and the stomach are made without their masks.)
  assert.match(stage, /if \(live && LIVE_LAYERS\.has\(L\)\) continue;/);
  assert.match(stage, /const LIVE_LAYERS = new Set\(\['back', 'spleen', 'liver', 'front'\]\);/);
  assert.match(stage, /const MASK_OF = \{ gut: '#gutHide', stomach: '#frontM' \};/);
  assert.match(stage, /v\.organs\.commit\(slot, names\);/);
  assert.match(stage, /\(!SOFTWARE \|\| gpuProbe\.gpuOrgans === 'force'\)/, 'off on a software renderer unless forced');
  const gl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /gl\.blendFunc\(gl\.ONE, gl\.ONE_MINUS_SRC_ALPHA\)/, 'plain "over", premultiplied');
});
