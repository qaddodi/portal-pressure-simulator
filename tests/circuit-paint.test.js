// The circuit's pan and zoom frames (Mohammad, 26 Oct: "Circuit view in particular is slow when zoomed"): what the circuit paints
// on every camera frame and the anatomy does not, cut without changing a pixel. Source patterns (no browser or GL in node).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const veins = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the map grid fades by its dots, not by layers: no frame of it has an opacity of its own', () => {
  const grid = stage.slice(stage.indexOf('const GRID_STEPS'), stage.indexOf('CIRCUIT_ZONES.forEach'));
  assert.match(grid, /'fill-opacity': op/, 'each step sets its own pattern dots\' alpha');
  assert.match(grid, /fill: `url\(#mapGrid\$\{i\}\)`/, 'each frame uses its own pattern');
  assert.doesNotMatch(grid, /opacity:\$\{op\}/, 'no opacity on a frame (a screen-sized layer each)');
  assert.doesNotMatch(css, /\.map-grid\s*\{[^}]*opacity/, 'no opacity on the frames from the style sheet');
  // The steps' alphas as before: the inner frame 0.9 (the old .map-grid rule), then fading out.
  const steps = JSON.parse(grid.match(/GRID_STEPS = (\[\[.*?\]\]);/)[1]);
  assert.deepEqual(steps.map(([, op]) => op), [0.9, 0.7, 0.5, 0.3, 0.15, 0.06]);
});

test('a zone band with no tint, and the lit zone when off, are not painted', () => {
  assert.match(css, /\n\.zone \{ fill: none; \}/);
  assert.match(css, /\n\.zone\.alt \{ fill: var\(--text\); fill-opacity: \.028; \}/);
  const off = css.match(/\n\.fx-zone \{([^}]*)\}/)[1], on = css.match(/\n\.fx-zone\.on \{([^}]*)\}/)[1];
  assert.match(off, /visibility: hidden/);
  assert.match(off, /visibility 0s \.5s/, 'hidden only after its fade out has run');
  assert.match(on, /visibility: visible/);
  assert.doesNotMatch(on, /visibility 0s/, 'shown at once when lit, so the fade in shows');
});

test('a plate faded out whole (the circuit) is neither drawn nor read', () => {
  const comp = veins.slice(veins.indexOf('composite(look, blood = {}, full = false, part = 0) {'));
  assert.match(comp, /const plate = look\.plate && look\.plate\.alpha > 0 \? look\.plate : null;/);
  assert.match(comp, /const useStack = !!\(plate\?\.stack && stack\?\.has\(0\)\);/, 'no organ layers drawn for a plate at alpha 0');
  assert.match(comp, /const pm = \(plate && !useStack/, 'no plate texture read');
  // The same pixels: the shader uses the plate's alpha only to multiply the plate (so at 0 it laid nothing).
  const fs = veins.slice(veins.indexOf('uniform float plateAlpha'), veins.indexOf('U.plateAlpha'));
  const uses = fs.match(/plateAlpha/g).length;
  assert.equal(uses, 2, 'declared once and used once');
  assert.match(fs, /pl = vec4\([^;]*\) \* plateAlpha;/);
});
