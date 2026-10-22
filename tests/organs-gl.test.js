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

// The bowel floats up on the ascites. Painted live, its picture is moved on the GPU while the fluid eases (and made again once it
// settles), under the rest of the gut, the gut's opacity and mask laid over the two as one group (as the SVG lays it): nothing is drawn again while the
// fluid eases (it was every half step of the bulge, the bowel standing still until each new picture landed).
test('the bowel is a picture at rest gathered under the gut, moved by its float on the GPU', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  const gl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  assert.match(stage, /const LIVE_ORDER = \['back', 'behind', 'bowel', 'gut', /);
  assert.match(stage, /for \(const L of live \? LIVE_ORDER : ORGAN_LAYERS\) \{/);
  assert.match(stage, /opacity: parseFloat\(getComputedStyle\(gGut\)\.opacity\), under: \[\{ name: 'bowel', dy: bowelDy\(\) \}\]/);
  assert.match(stage, /if \(liveSet\) veins\.organs\.shift\('bowel', bowelDy\(\)\);/);
  // The picture: the bowel alone, or the rest without it; the group's opacity left to the GPU. Drawn where the bowel is in the
  // copy (at), its float held in the pictures' state while the fluid eases and taken once it settles.
  assert.match(stage, /if \(mine !== \(layer === 'bowel'\)\) drop\.push\(\[g, g\.parentNode, g\.nextSibling\]\);/);
  assert.match(stage, /v\.organs\.stage\(slot, layer, job, rect, layer === 'bowel' \? plateCopy\.bowelDy : 0\)/);
  assert.match(stage, /if \(!fluidEasing\(\)\) bowelHeld = organG\.bowel\.getAttribute\('transform'\);\n\s+if \(liveOn\(\)\) return \['live', bowelHeld, /);
  assert.match(stage, /unmasked\.push\(\[k, 'opacity', k\.getAttribute\('opacity'\)\]\); k\.removeAttribute\('opacity'\);/);
  // On the GPU: moved by whole device pixels, drawn under the gut's picture, laid with the gut's opacity.
  assert.match(gl, /const dy = Math\.round\(\(\(u\.dy \|\| 0\) - U0\.at\) \* m\[3\]\), mm = mat\.slice\(\);\n\s+mm\[7\] \+= dy;/);
  assert.match(gl, /for \(const \[U0, U1, mm\] of under\) drawLayer\(U0, U1, mm\); drawLayer\(L0, L1\); \}, box, cut\.spec, mul\(m, cut\.m\), w, h, fbo, cut\.opacity \?\? 1\);/);
});
