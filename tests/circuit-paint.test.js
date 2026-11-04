import { stageSource } from './stage-src.js';
// The circuit's pan and zoom frames (Mohammad, 26 Oct: "Circuit view in particular is slow when zoomed"): what the circuit paints
// on every camera frame and the anatomy does not, cut without changing a pixel. Source patterns (no browser or GL in node).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = stageSource();
const veins = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the map grid is drawn by the GPU, fading by its frames\' dot alpha, with no element, pattern or layer', () => {
  assert.doesNotMatch(stage, /mapGrid|'map-grid'|class: 'zone|fx-zone|id: 'grid'|id: 'nodes'/, 'no SVG grid, zones, lit zone or dots');
  const fs = veins.slice(veins.indexOf('vec4 mapAt(vec2 w)'), veins.indexOf('return c * mapA;'));
  // The steps' alphas as before: the inner frame 0.9 (the old .map-grid rule), then fading out, by how far outside the figure's frame.
  const steps = [...fs.match(/float op = ([^;]*);/)[1].matchAll(/e <= ([\d.]+) \? ([\d.]+)/g)].map((m) => [+m[1], +m[2]]);
  assert.deepEqual(steps, [[0, 0.9], [200, 0.7], [450, 0.5], [750, 0.3], [1100, 0.15], [1500, 0.06]]);
  assert.match(fs, /floor\(w \/ 20\.0\) \* 20\.0 \+ 10\.0/, 'a dot at 10, 10 in each 20-unit square');
  assert.match(veins, /if \(mapA > 0\.0\) pl = over\(pl, mapAt\(w\)\);/, 'under the organs, and not read at all while it is faded out');
  assert.match(veins, /const map = look\.map && look\.map\.a > 0 \? look\.map : null;/);
});

test('the map\'s colours are the theme\'s: dots --map-dot, two zones --text at .028, the lit zone --accent at .09 eased', () => {
  assert.match(stage, /cssColor8\(cs\.getPropertyValue\('--map-dot'\)/);
  assert.match(stage, /MAP\.zone\[3\] = 0\.028; MAP\.fx\[3\] = 0\.09 \* easeArrive\(MAP\.fxU\);/);
  assert.match(stage, /CIRCUIT_ZONES\.filter\(\(z, i\) => i % 2\)/, 'every other band tinted, as before');
  assert.doesNotMatch(css, /map-accent/, 'no token that is defined nowhere (the dots had gone black, 1 Nov)');
});

test('the map turns upright with the turn alone, never with the morph', () => {
  assert.match(stage, /const a = \(\(deg \+ 90 \* rotEase\(rotU\)\) \* Math\.PI\) \/ 180, R = MAP\.rot;/);
  assert.match(stage, /mapTurn\(deg\);\s*world\.setAttribute\('transform', tr\);/);
  assert.match(veins, /w = vec2\(mapRot\.x \* \(w\.x - mapRot\.z\) - mapRot\.y \* \(w\.y - mapRot\.w\)/);
});

test('a plate faded out whole (the circuit) is neither drawn nor read', () => {
  const comp = veins.slice(veins.indexOf('composite(look, blood = NOBLOOD, full = false, part = 0) {'));
  assert.match(comp, /const plate = look\.plate && look\.plate\.alpha > 0 \? look\.plate : null;/);
  assert.match(comp, /const useStack = !!\(plate\?\.stack && stack\?\.has\(0\)\);/, 'no organ layers drawn for a plate at alpha 0');
  assert.match(comp, /const pm = \(plate && !useStack/, 'no plate texture read');
  // The same pixels: the shader uses the plate's alpha only to multiply the plate (so at 0 it laid nothing).
  const fs = veins.slice(veins.indexOf('uniform float plateAlpha'), veins.indexOf('U.plateAlpha'));
  const uses = fs.match(/plateAlpha/g).length;
  assert.equal(uses, 2, 'declared once and used once');
  assert.match(fs, /pl = vec4\([^;]*\) \* plateAlpha;/);
});
