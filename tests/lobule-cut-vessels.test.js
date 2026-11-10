import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lintGLSL } from './glsl-lint.js';
import { shadeGLSL, F_RING } from '../src/ui/veins-mesh-glsl.js';
import { celGLSL, celShadeJS, celRingJS, celDiscJS, ringOpenJS, CEL } from '../src/ui/tube-cel-glsl.js';

// Vessels cut across in the lobule (picture-blood-fills-look.md item 9, then Mohammad's "outline it, where it's not connecting to a vessel", 10 Nov 2026): the portal
// venule, central vein, arteriole and bile ductule are discs. They keep the flat lumen and the wall ring, and gain the long vessels' pale band just inside the wall (F_RING),
// all round; in the Tube also an ink line inside the wall, and band and line break where a vessel joins (the row's mouth mask, tube texel 3 xyz), so the vessel flows in.

const FLAGS = { F_DIFFUSE: 2, F_EDGE: 64, F_VEIL: 128, F_SHADOW: 4, F_SPEC: 32, F_WHOLE: 256, LIFT_EASE_MAX: 60, LIFT_EASE_SHARE: 0.35, LUMEN2: 32768, ROW2_BITS: 11, VEIL_K: 0.6 };
const near = (a, b, m) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${m}: ${a} vs ${b}`));
const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

test('F_RING is its own bit, clear of the other vessel flags', () => {
  assert.equal(F_RING, 512);
  for (const [k, v] of Object.entries(FLAGS)) if (k.startsWith('F_')) assert.equal(v & F_RING, 0, k);
  assert.equal(F_RING & 0xff, 0, 'above the bits the shaders test with narrow masks');
});

test('the lobule sets F_RING, the mouths and the ink on the four end-on kinds, and only on them', () => {
  const z = src('lobule-zoom.js');
  assert.match(z, /const endOn = t\.kind === 'cv' \|\| t\.kind === 'pv' \|\| t\.kind === 'ha' \|\| t\.kind === 'bd';/);
  assert.match(z, /\(endOn \? F_RING : 0\)/);
  assert.match(z, /if \(endOn\) \{[\s\S]*G\.mouths\.get\(t\.id\)[\s\S]*tubeData\[o \+ 16 \+ i\]/);
  assert.match(z, /akLook === lookSig/, 'a new look makes the attributes again (the ink follows the casing)');
});

test('tubeShade (Classic and Mesh) breaks the band at a mouth, and the cel shade (Tube) calls celDisc with the mask and the row ink', () => {
  const shade = shadeGLSL(FLAGS), cel = celGLSL(FLAGS);
  assert.ok(shade.includes(`(flags & ${F_RING}) != 0 && aL > 0.0`), 'tubeShade');
  assert.ok(shade.includes('(1.0 - ringOpen(T(id, 3).xyz, g))'), 'the band is cut where a vessel joins');
  assert.ok(cel.includes(`(flags & ${F_RING}) != 0 && aL > 0.0) lum = celDisc(lum, T(id, 4).rgb, D, R, 0.8 * wl, aa, ringOpen(T(id, 3).xyz, g));`), 'celShade');
  assert.ok(/vec3 celDisc\(vec3 lum, vec3 ink, float D, float R, float wl, float aa, float open\)/.test(cel), 'celDisc is defined with the tones');
  const host = `#version 300 es\nprecision highp float;\n${shade.slice(shade.indexOf('float ringOpen('), shade.indexOf("// The tier's shape drawn"))}\n${cel.replace(/vec4 celShade[\s\S]*$/, '')}\nout vec4 o; void main(){ o = vec4(celDisc(vec3(0.5), vec3(0.1), -1.0, 10.0, 2.0, 1.0, ringOpen(vec3(1.0, 2.0, 3.0), vec2(1.0, 0.0))), 1.0); }`;
  assert.deepEqual(lintGLSL(host), []);
});

test('the Tube lumen layer lays celDisc last, over the blood, with the same mask and ink', () => {
  const t = src('tube-lumen-glsl.js');
  assert.ok(t.indexOf('col = celDisc(') > t.indexOf('col = celTones('), 'after the tones');
  assert.ok(t.indexOf('col = celDisc(') < t.indexOf('outColor = ditherOut('), 'before the output');
  assert.match(t, /ringOpen\(T\(id, 3\)\.xyz,/);
  assert.match(t, /T\(id, 4\)\.rgb/);
});

// The mouth mask: 72 bins of 5 degrees from -180 (atan(g.y, g.x)), bit b % 24 of word b / 24.
const bins = (list) => { const w = [0, 0, 0]; for (const b of list) w[Math.floor(b / 24)] |= 1 << (b % 24); return w; };
test('ringOpen: 1 inside a mouth, 0 round the rest, soft over one bin, the same across the seam at 180 degrees', () => {
  const at = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
  const m = bins([36, 37, 38]);   // bins 36 .. 38: degrees 0 .. 15 (bin b spans -180 + 5 b .. + 5)
  assert.ok(Math.abs(ringOpenJS(m, at(7.5)) - 1) < 1e-6, 'the middle of the mouth');
  assert.equal(ringOpenJS(m, at(-90)), 0, 'away from it');
  assert.equal(ringOpenJS(m, [0, 0]), 0, 'no direction: closed');
  assert.equal(ringOpenJS([0, 0, 0], at(7.5)), 0, 'no data: a closed rim');
  const edge = ringOpenJS(m, at(0)), out = ringOpenJS(m, at(-6)), inside = ringOpenJS(m, at(4));
  assert.ok(out < edge && edge < inside, `soft at the edge (${out} ${edge} ${inside})`);
  const seam = bins([0, 71]);
  assert.ok(Math.abs(ringOpenJS(seam, at(179)) - 1) < 1e-6, 'bin 71, next to the seam');
  assert.ok(Math.abs(ringOpenJS(seam, at(-179)) - 1) < 1e-6, 'bin 0, the other side');
  const hi = bins([60]);   // the third word's bits too (bins 48 .. 71)
  assert.ok(Math.abs(ringOpenJS(hi, at(-180 + 5 * 60 + 2.5)) - 1) < 1e-6, 'a bin in the second word');
});

// One pixel (Tube): a disc of radius 20 device px (px 0.5 unit), aa 0.5.
const base = { F_DIFFUSE: 2, F_EDGE: 64, F_VEIL: 128, R: 10, col: [0.3, 0.45, 0.75], g: [1, 0], sel: false, cA: 1, aa: 0.5, aL: 1, px: 0.5, fx: 1, rowInk: [0.1, 0.12, 0.2] };
const wl = Math.min(Math.max(CEL.LINE_R * base.R, CEL.LINE_MIN * base.px), CEL.LINE_MAX * base.px);
test('Tube: on a closed rim an ink line just inside the wall, then the pale band, then the plain fill; no flag, none of it', () => {
  const line = celShadeJS({ ...base, flags: F_RING, D: -0.3 * wl }), band = celShadeJS({ ...base, flags: F_RING, D: -(0.8 * wl + 0.5) }), mid = celShadeJS({ ...base, flags: F_RING, D: -8 }), none = celShadeJS({ ...base, flags: 0, D: -0.3 * wl });
  near(line.slice(0, 3), base.rowInk, 'the ink line');
  assert.ok(band[0] > base.col[0] && band[2] > base.col[2], 'the pale band inside it');
  near(mid, [...base.col, 1], 'the middle');
  near(none, [...base.col, 1], 'no flag');
  near(celShadeJS({ ...base, flags: F_RING, fx: 0, D: -0.3 * wl }), [...base.col, 1], 'no fx');
});

test('Tube: where a vessel joins (the mask says open) there is no ink line and no band: the fill runs on to the wall', () => {
  const open = bins([...Array(72).keys()]);
  for (const D of [-0.3 * wl, -(0.8 * wl + 0.5), -1.2]) near(celShadeJS({ ...base, flags: F_RING, D, mask: open }), [...base.col, 1], `open at ${D}`);
  const closed = celShadeJS({ ...base, flags: F_RING, D: -0.3 * wl, mask: [0, 0, 0] });
  assert.notDeepEqual(closed.slice(0, 3).map((v) => +v.toFixed(3)), base.col.map((v) => +v.toFixed(3)), 'closed: the line');
});

test('Tube: the line and band are all round (no lit side) and left out on a hairline disc', () => {
  for (const g of [[1, 0], [0, 1], [-0.7071, -0.7071]]) near(celShadeJS({ ...base, g, flags: F_RING, D: -0.3 * wl }), celShadeJS({ ...base, g: [1, 0], flags: F_RING, D: -0.3 * wl }), 'same at every angle');
  near(celDiscJS(base.col, base.rowInk, -0.3, 0.5, 0.4, 0.5, 0), base.col, 'R / aa under 1.5: nothing inside (the outer outline stays)');
});

test('the band keeps the long vessels\' strength (0.144 of the way to white, less on a pale fill)', () => {
  near(celRingJS([0.2, 0.2, 0.2], -0.2, 20, 0.5), [0.2 + 0.8 * 0.144, 0.2 + 0.8 * 0.144, 0.2 + 0.8 * 0.144], 'a dark fill at the full band');
  const dark = celRingJS([0.2, 0.2, 0.2], -0.2, 20, 0.5), pale = celRingJS([0.95, 0.95, 0.95], -0.2, 20, 0.5);
  assert.ok(dark[0] - 0.2 > pale[0] - 0.95 && pale[0] > 0.95);
});
