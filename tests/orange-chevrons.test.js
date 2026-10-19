import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Reversed flow on an orange vessel (the Direction lens; an orange step of another lens's ramp): its chevrons' heads
// turn near-white cream with a deep rim, so they stand clear of the orange instead of an orange head on it (Mohammad,
// 19 Oct). Other vessels keep their dark heads, and an orange one where flow is reversed on a vessel that is not orange.

const GL = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
const TOKENS = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const UTIL = readFileSync(new URL('../src/ui/util.js', import.meta.url), 'utf8');

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// The shader's own chevOrange, run in JS.
const body = GL.match(/float chevOrange\(vec3 c\) \{\s*return ([^;]+);/)[1];
const chevOrange = new Function('smoothstep', 'c', `return ${body.replace(/(\d)\.0\b/g, '$1')};`).bind(null, smoothstep);
const hex = (h) => { const n = parseInt(h.slice(1), 16); return { r: (n >> 16) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }; };
const tok = (name) => [...TOKENS.matchAll(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`, 'g'))].map((m) => m[1]);

test('every theme’s reversed orange, and the heat ramp’s orange, count as orange', () => {
  const oranges = [...tok('--flow-reversed'), '#F08A24'];
  assert.ok(oranges.length >= 3);
  for (const c of oranges) assert.ok(chevOrange(hex(c)) > 0.95, `${c}: ${chevOrange(hex(c))}`);
});

test('teal, wine, red, yellow, blue and grey vessels keep their chevrons', () => {
  for (const c of [...tok('--flow-normal'), '#661030', '#9B2B6A', '#D7263D', '#C8414D', '#F4D35E', '#718EDF', '#96989F', '#3FA092'])
    assert.ok(chevOrange(hex(c)) < 0.05, `${c}: ${chevOrange(hex(c))}`);
});

test('the cream head and deep rim are by the eased reversed flag and the vessel colour, not a switch', () => {
  assert.match(GL, /float warm = rv \* chevOrange\(vc\);/);
  assert.match(GL, /col = mix\(col, mix\(inkLight, vc \* 0\.45, warm\), c\.y/);
  assert.match(GL, /col = mix\(col, mix\(mix\(ink, revCol, rv\), chevLight, warm\), c\.x/);
  assert.match(GL, /gl\.uniform3f\(U\.chevLight, /);
  assert.match(UTIL, /chevLight: cssRGB01\('--blood-chevron-light'\)/);
  const cream = hex(tok('--blood-chevron-light')[0]);
  assert.ok(0.299 * cream.r + 0.587 * cream.g + 0.114 * cream.b > 0.9, 'near white');
});
