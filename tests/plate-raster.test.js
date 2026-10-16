import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The organs (and the ascites mask) reach the GPU by way of a temporary canvas copied into a texture. Chrome makes that
// copy after texImage2D returns, so a canvas emptied at once left the texture blank and the organs vanished at a
// Retina size. The canvas is emptied a second later; and since every raster draws into a canvas of its own, a quick
// second raster (a view switch, a slide, a resize, a theme change) never has its drawing wiped by an earlier one's timer.
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('a plate raster draws into a canvas of its own and empties it only after the GPU copy', () => {
  assert.match(stage, /const c = document\.createElement\('canvas'\);\n\s+c\.width = W; c\.height = H;\n\s+c\.getContext\('2d'\)\.drawImage\(img, 0, 0, W, H\);\n\s+veins\.setPlate\(slot, c, rect\);\n(\s+\/\/[^\n]*\n)*\s+setTimeout\(\(\) => \{ c\.width = c\.height = 0; \}, 1000\);/);
});

test('the ascites mask likewise: its own canvas, emptied after the copy', () => {
  assert.match(stage, /const R = \[284, 430, 856, 600\], c = document\.createElement\('canvas'\);[\s\S]{0,200}veins\.setFluidMask\(c, R\);\n\s+setTimeout\(\(\) => \{ c\.width = c\.height = 0; \}, 1000\);/);
});

test('no canvas handed to the GPU is emptied in the same task', () => {
  assert.doesNotMatch(stage, /veins\.set(Plate|FluidMask)\([^)]*\);\s*\n\s*c\.width = c\.height = 0;/);
  // (and the timer only ever empties the canvas its own raster made: c is a const of that call)
  assert.equal((stage.match(/setTimeout\(\(\) => \{ c\.width = c\.height = 0; \}, 1000\)/g) || []).length, 2);
});
