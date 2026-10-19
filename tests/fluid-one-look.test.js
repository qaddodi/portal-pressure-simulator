import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The ascites has one look: the GPU draws it whenever it draws the vessels, with the organ plate or without it (the plate is down
// while a large fill eases), and the page's SVG copy stays hidden then. The copy had shown during the fill on Ascites slide 5,
// with a brighter line along its surface, and the fluid snapped to the GPU's look when the plate came back (17 Oct).
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');

test('the GPU draws the fluid with the plate off too', () => {
  assert.match(gl, /gl\.uniform4f\(U\.fluidInk, \.\.\.\(fl \? fl\.ink : \[0, 0, 0, 0\]\)\);/);
  assert.ok(!/fluidInk[^\n]*\bpm\b/.test(gl), 'the fluid does not wait for a plate');
});

test('the SVG fluid hides whenever the GPU draws the vessels', () => {
  assert.match(css, /\.stage-view\.gl-on #ascites \{ visibility: hidden; \}/);
});
