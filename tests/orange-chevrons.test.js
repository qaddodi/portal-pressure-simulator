import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Reversed flow on an orange vessel (the Direction lens; an orange step of another lens's ramp): its chevrons' heads
// turn near-white cream with a deep rim, so they stand clear of the orange instead of an orange head on it (Mohammad,
// 19 Oct). Other vessels keep their dark heads, and an orange one where flow is reversed on a vessel that is not orange.

const GL = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8') + readFileSync(new URL('../src/ui/comp-glsl.js', import.meta.url), 'utf8');
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
  for (const c of [...tok('--flow-normal'), '#661030', '#9B2B6A', '#680C2F', '#A4216E', '#925CDD', '#6787E8', '#D7263D', '#C8414D', '#F4D35E', '#718EDF', '#96989F', '#3FA092',
    // (the dark looks' pressure ramp and the lifted dark ends of their flow, velocity, heat and drop ramps; Linen's paler blue end)
    '#D7E7F4', '#9DC9F7', '#7BA1FC', '#A074F4', '#BD2C92', '#B31553', '#3F5C94', '#684DB1', '#9E3D55', '#456F4A', '#B8D5ED', '#85B6E9'])
    assert.ok(chevOrange(hex(c)) < 0.05, `${c}: ${chevOrange(hex(c))}`);
});

test('the cream head and deep rim are by the eased reversed flag and the vessel colour, not a switch', () => {
  const inks = GL.slice(GL.indexOf('void chevInks('), GL.indexOf('const ZOOM_VS'));
  assert.match(inks, /float warm = rk \* chevOrange\(vc\);/);
  assert.match(inks, /core = mix\(mix\(mix\(ink, chevLight, dark\), revCol, rk\), chevLight, warm\);/);
  assert.match(inks, /rim = mix\(inkLight, vc \* 0\.45, max\(dark, warm\)\);/);
  // (The composite and the quads take their inks from the one function.)
  assert.match(GL, /chevInks\(vc1, f1\.w, hCore, hRim\);\n\s+col = mix\(col, hRim, c\.y/);
  assert.match(GL, /col = mix\(col, hCore, c\.x \* vis \* flowA \* blendA\.y\);/);
  assert.match(readFileSync(new URL('../src/ui/blood-heads.js', import.meta.url), 'utf8'), /chevInks\(vc, f1\.w, hInk, hRim\);/);
  assert.match(GL, /UC\.f3a\(U\.chevLight, /);
  assert.match(UTIL, /chevLight: cssRGB01\('--blood-chevron-light'\)/);
  const cream = hex(tok('--blood-chevron-light')[0]);
  assert.ok(0.299 * cream.r + 0.587 * cream.g + 0.114 * cream.b > 0.9, 'near white');
});

test('B1: a head flips to near-white with a dark rim on a dark lumen, over a small band of its lightness', () => {
  const inks = GL.slice(GL.indexOf('void chevInks('), GL.indexOf('const ZOOM_VS'));
  const band = inks.match(/float dark = 1\.0 - smoothstep\(([\d.]+), ([\d.]+), dot\(vc, vec3\(0\.299, 0\.587, 0\.114\)\)\);/);
  assert.ok(band, 'the flip is by the vessel colour\'s luma');
  const [lo, hi] = [+band[1], +band[2]];
  const dark = (c) => 1 - smoothstep(lo, hi, 0.299 * c.r + 0.587 * c.g + 0.114 * c.b);
  assert.ok(hi - lo > 0.05 && hi - lo < 0.15, 'a small band: wide enough never to pop, narrow enough to leave the mid lumens alone');
  // The pressure ramp's ends (Linen / Dark): 30 and 20 mmHg flip, 12 mmHg and the pale end keep the dark head.
  for (const c of ['#B31553', '#BD2C92']) assert.ok(dark(hex(c)) > 0.95, `${c} takes the light head`);
  for (const c of ['#A074F4', '#7BA1FC', '#DCEBF7', '#2CC5BD']) assert.ok(dark(hex(c)) < 0.05, `${c} keeps the dark head`);
  // (A reversed head stays orange on a dark lumen: the flip applies to the normal ink, then reversal takes over.)
  assert.match(inks, /mix\(ink, chevLight, dark\), revCol, rk\)/);
});

test('B2: a reversed head carries a smaller » pair behind it, and the origin lens keeps the head\'s own ink', () => {
  const CH = readFileSync(new URL('../src/ui/chevron-glsl.js', import.meta.url), 'utf8');
  assert.match(CH, /vec2 chevHead\(float u, float ay, float hw, float px, float rev\)/);
  assert.match(CH, /if \(rev > 0\.0\) \{[^}]*float d2 = 0\.6 \* chevD\(/);
  assert.match(CH, /c = max\(c, rev \* /);
  assert.match(GL, /chevHead\(u, ay, hw, pxW, f1\.w\) \* fade/);
  assert.match(readFileSync(new URL('../src/ui/blood-heads.js', import.meta.url), 'utf8'), /hS\.x, pxW, hS\.w\)/);
  const inks = GL.slice(GL.indexOf('void chevInks('), GL.indexOf('const ZOOM_VS'));
  assert.match(inks, /float rk = origin == 1 \? rv \* \(1\.0 - blendA\.z\) : rv;/);
});

test('B3: the blood\'s reversed orange is the look\'s own, read again after a look change', () => {
  assert.match(TOKENS, /--blood-reversed: var\(--flow-reversed\);/);
  assert.match(UTIL, /export const bloodColors = \(\) => bloodCols && bloodColsAt === varsRead \?/);
  assert.match(UTIL, /varsRead\+\+;/);
});
