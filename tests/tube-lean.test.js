// The Tube's short fragment shader and depth shader (src/ui/tube-lean-glsl.js, brief S2-B): judged from what the module exports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintGLSL } from './glsl-lint.js';

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });
const gl = await import('../src/ui/veins-gl.js');
const { EDGE_GLSL } = await import('../src/ui/edge.js');
const { ENT_W } = await import('../src/ui/veins-bin.js');
const { LIFT_EASE_SHARE, LIFT_EASE_MAX } = await import('../src/ui/highlight-math.js');
const { tubeLeanFS, TUBE_DEPTH_FS, trunkGapJS, leanDistanceJS, tubeLeanJS, END_SEGS } = await import('../src/ui/tube-lean-glsl.js');
const { CEL } = await import('../src/ui/tube-cel-glsl.js');

// What veins-gl.js passes: the same constants it builds the strip with, and the alongAt text it keeps (written out here as a guard: the strip build must contain it).
const ALONG_GLSL = `
float alongAt(int id, float u) {
  float ui = u * ${gl.N_SAMPLES - 1}.0;
  int i0 = min(int(ui), ${gl.N_SAMPLES - 2});
  vec2 a = texelFetch(rad, ivec2(i0, id), 0).ba;
  return a.x < 0.0 ? u : mix(a.x, a.y, ui - float(i0));
}`;
const K = {
  F_DIFFUSE: gl.F_DIFFUSE, F_EDGE: gl.F_EDGE, F_SHADOW: gl.F_SHADOW, F_SPEC: gl.F_SPEC, F_VEIL: gl.F_VEIL, F_WHOLE: gl.F_WHOLE, F_SEL: gl.F_SEL,
  F_DOTTED: gl.F_DOTTED, F_NOCASE: gl.F_NOCASE, LIFT_EASE_MAX, LIFT_EASE_SHARE, LUMEN2: gl.LUMEN2, ROW2_BITS: gl.ROW2_BITS, VEIL_K: gl.VEIL_K,
  EDGE: EDGE_GLSL, ENT_W, N_SAMPLES: gl.N_SAMPLES, MAX_TIERS: gl.MAX_TIERS, S_OFF: 96, ALONG_GLSL,
};
const LEAN = tubeLeanFS(K);
const STRIP = gl.vesselFS(true, 1, 1);

test('the lean shader and the depth shader pass the lint', () => {
  assert.deepEqual(lintGLSL(LEAN), []);
  assert.deepEqual(lintGLSL(TUBE_DEPTH_FS), []);
});

test('the lean shader has no search, no joins, no loop over vessels and no depth write; the depth shader has no outputs and no work', () => {
  // (segNear is in the shared shading text, defined and never called: its name appears once, at its definition.)
  assert.equal(LEAN.split('segNear(').length - 1, 1);
  assert.match(LEAN, /void segNear\(/);
  assert.ok(!/\bMAXS\b|\bMAXJ\b/.test(LEAN), 'no loop over vessels or joins');
  assert.ok(!LEAN.includes('gl_FragDepth'));
  assert.ok(!/\bcorner\(|\bsmin\(/.test(LEAN), 'no join arithmetic');
  assert.match(TUBE_DEPTH_FS, /^#version 300 es\nprecision highp float;\nvoid main\(\) \{\}\n$/);
  assert.ok(!/\bout\b|gl_FragDepth|discard/.test(TUBE_DEPTH_FS));
  assert.throws(() => tubeLeanFS({ ...K, N_SAMPLES: 32 }), /N_SAMPLES must be 64/);
});

test('it reads the contract\'s varyings and writes the strip build\'s four outputs', () => {
  for (const decl of [/in float vI;/, /flat in int vRow;/, /in float vD;/, /in vec2 vG;/, /in float vRad;/, /flat in vec4 vJ0;/, /flat in vec4 vJ1;/, /flat in vec4 vJK;/]) assert.match(LEAN, decl);
  for (const out of ['layout(location=0) out vec4 outColor;', 'layout(location=1) out uvec4 outFlow;', 'layout(location=2) out uvec4 outFlow2;', 'layout(location=3) out vec4 outDep;']) {
    assert.ok(LEAN.includes(out), out);
    assert.ok(STRIP.includes(out), `the strip build has ${out}`);
  }
});

const uniformsOf = (src) => {
  const m = new Map();
  for (const x of src.matchAll(/^uniform\s+(?:highp\s+)?(\w+)\s+(\w+)(\[\d+\])?\s*;/gm)) m.set(x[2], `${x[1]}${x[3] ?? ''}`);
  return m;
};

test('every uniform it declares is declared with the same type in the Tube strip build, so the pass feeds it unchanged', () => {
  const lean = uniformsOf(LEAN), strip = uniformsOf(STRIP);
  assert.ok(lean.size > 25, 'the uniforms were found');
  // (isWeb is new: 0 for the strips, 1 for the web program, which D sets; the strip build has no such thing.)
  assert.equal(lean.get('isWeb'), 'int');
  for (const [name, type] of lean) if (name !== 'isWeb') assert.equal(strip.get(name), type, `${name}: ${type} (the strip build has ${strip.get(name)})`);
  // (The shared text it takes in whole is the strip's: the alongAt text and the constants are the strip build's.)
  assert.ok(STRIP.includes(ALONG_GLSL), 'the alongAt text matches veins-gl.js');
  assert.ok(STRIP.includes('const float S_OFF = 96.0;') && STRIP.includes('const float LAST = 63.0;'));
  assert.ok(STRIP.includes('vec4 T(int id, int k) { return texelFetch(tube, ivec2(k, id), 0); }'));
  assert.ok(STRIP.includes('vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }'));
  const pt = /vec2 PT\(int id, int i\) \{[^\n]*\}/.exec(LEAN)[0];
  assert.ok(STRIP.includes(pt.replaceAll(String(ENT_W), 'ENT_W')), 'PT matches the strip build\'s (which names the width ENT_W)');
});

// ---- the twin, one pixel at a time ----
const FILL = [0.8, 0.3, 0.3];
const attrs = { tier: 1, flags: gl.F_DIFFUSE, wall: 1, col: FILL, alpha: 1, hov: 0, sel: 0, edge: [0, 0, 0], of: 1 };
const base = {
  ...K, D: -9, R: 10, g: [1, 0], u: 0.5, clip: [0, 1, 100], attrs, tierNow: 1, grp: 1, px: 0.5, aa: 0.5, light: [1, 0], fx: 1, tierAlpha: 1, row: 7, lit: false,
};
const near = (got, want, msg) => { assert.equal(got.length, want.length, msg); got.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-9, `${msg}: ${got} vs ${want}`)); };
const wlOf = (R, px) => Math.min(Math.max(CEL.LINE_R * R, CEL.LINE_MIN * px), CEL.LINE_MAX * px);
const deepOf = (col) => col.map((v, i) => v * 0.34 * 0.75 + CEL.INK[i] * 0.25);

test('the centre of a lumen gives the fill, the outline band the ink, and past it nothing', () => {
  const lumen = tubeLeanJS(base);
  assert.equal(lumen.kind, 'draw');
  near(lumen.colour, [...FILL, 1], 'the fill');
  assert.equal(lumen.dep, 1, 'a lumen colour reaches this pixel');
  assert.deepEqual(lumen.flow, { id: 7, s: 50, w: 1 }, 'its stream: the row, the arc position, its visibility');
  const wl = wlOf(base.R, base.px);
  const band = tubeLeanJS({ ...base, D: wl / 2 });
  assert.equal(band.kind, 'draw');
  near(band.colour, [...deepOf(FILL), 1], 'the ink');
  assert.equal(band.flow, null, 'no stream outside a lumen');
  assert.equal(tubeLeanJS({ ...base, D: wl + base.aa }).kind, 'discard', 'past the outline');
});

test('the tier, the group and the alphas scale the picture as the vessel shader does', () => {
  const r = tubeLeanJS({ ...base, attrs: { ...attrs, alpha: 0.5 }, tierAlpha: 0.5 });
  near(r.colour, [...FILL.map((v) => v * 0.25), 0.25], 'alpha x tier alpha');
  assert.equal(tubeLeanJS({ ...base, attrs: { ...attrs, tier: 2 } }).kind, 'discard', 'a row of another tier');
  const behind = tubeLeanJS({ ...base, grp: 0, occl: 0.4, attrs: { ...attrs, of: 1 } });
  near(behind.colour, [...FILL.map((v) => v * 0.6), 0.6], 'behind an organ: faded by the cover');
});

test('a web is drawn in the tier it is given, whichever tier its owner\'s row is in; a strip of another tier is discarded', () => {
  assert.match(LEAN, /uniform int isWeb;/);
  assert.match(LEAN, /if \(ti != tierNow && isWeb == 0\) discard;/);
  assert.match(LEAN, /int tt = ti;/);   // (a web carries its owner's tier alpha and group, as the lumen layer's shader gives it)
  assert.match(LEAN, /int grp = tierGroup\[tt\];/);
  const other = { ...base, attrs: { ...attrs, tier: 1 }, tierNow: 2, grp: 0, tierAlpha: 0.5 };
  assert.equal(tubeLeanJS(other).kind, 'discard', 'a strip whose row is in tier 1, drawn in tier 2');
  const web = tubeLeanJS({ ...other, isWeb: true });
  assert.equal(web.kind, 'draw', 'a web of that row');
  near(web.colour, [...FILL.map((v) => v * 0.5), 0.5], 'the owner\'s colour and opacity (alpha and group come in as given)');
  assert.equal(tubeLeanJS({ ...base, isWeb: true }).kind, 'draw', 'a web in its owner\'s own tier too');
});

test('a dotted gap is empty and a dot is drawn without a stream', () => {
  const dotted = { ...base, R: 1, D: -1, clip: [0, 1, 12], attrs: { ...attrs, flags: gl.F_DIFFUSE | gl.F_DOTTED } };
  // 12 units long: u 0.3125 is 3.75 along, the middle of a gap (2.25 from the nearest dot); u 0.04 is half a unit along, in a dot.
  assert.equal(tubeLeanJS({ ...dotted, u: 0.3125 }).kind, 'discard', 'the gap');
  const dot = tubeLeanJS({ ...dotted, u: 0.04 });
  assert.equal(dot.kind, 'draw');
  assert.equal(dot.flow, null, 'a dot has no stream');
  // (a narrow vessel: the cel tones are only faintly in, so within a hair of the fill)
  [...FILL, 1].forEach((v, i) => assert.ok(Math.abs(dot.colour[i] - v) < 0.01, `a dot is the fill: ${dot.colour}`));
  assert.ok(leanDistanceJS({ D: -1, R: 1, u: 0.3125, clip: [0, 1, 12], dotted: true }) > 1, 'the gap\'s distance past the wall');
  assert.equal(leanDistanceJS({ D: -1, R: 1, u: 0.04, clip: [0, 1, 12], dotted: true }), -1, 'a dot\'s centre: unchanged');
});

test('a part cut off by the clip is empty, with a round end where the clip stops', () => {
  const cut = { ...base, clip: [0, 0.4, 100] };
  assert.equal(tubeLeanJS({ ...cut, u: 0.9 }).kind, 'discard', 'far past the cut');
  assert.equal(tubeLeanJS({ ...cut, u: 0.9, redraw: 1 }).kind, 'empty', 'written empty when the cells are drawn again');
  assert.equal(tubeLeanJS({ ...cut, u: 0.2 }).kind, 'draw', 'inside the drawn part');
  // just past the cut, on the centreline: the round end's radius still holds
  const cap = leanDistanceJS({ D: -10, R: 10, u: 0.405, clip: [0, 0.4, 100] });
  assert.ok(Math.abs(cap - (Math.hypot(0, 0.5) - 10)) < 1e-9, 'a round end');
});

test('a row\'s end on another row: a dropped pixel (inside the trunk, lumen or outline) is the other row\'s, the ink outside it stays', () => {
  const skirt = { ...base, D: 0.5, attrs };
  assert.equal(tubeLeanJS({ ...skirt, join: { drop: true, fl: 1, fo: 1 } }).kind, 'discard', 'inside the trunk\'s lumen');
  assert.equal(tubeLeanJS({ ...skirt, join: { drop: true, fl: 1, fo: 1 }, redraw: 1 }).kind, 'empty');
  assert.equal(tubeLeanJS({ ...base, D: -2, join: { drop: true, fl: 1, fo: 1 } }).kind, 'discard', 'the lumen too: a capsule end inside a faded trunk is not drawn');
  const out = tubeLeanJS({ ...skirt, join: { drop: false, fl: 1, fo: 1 } });
  assert.equal(out.kind, 'draw', 'outside the trunk');
  near(out.colour, [...deepOf(FILL), 1], 'the ink');
  assert.equal(tubeLeanJS({ ...skirt, join: null }).kind, 'draw', 'a row with no end');
  // the multi-segment gap the first version read in every fragment: negative inside the lumen, over the four segments about the sample
  const pts = [[0, 0], [10, 0], [20, 0], [30, 0], [40, 0], [50, 0]], rad = pts.slice(1).map(() => [3, 3]);
  assert.ok(trunkGapJS([20, 1], pts, rad, 2) < 0 && trunkGapJS([20, 5], pts, rad, 2) > 0);
  assert.equal(trunkGapJS([20, 0], pts, rad, 2), -3);
  assert.ok(trunkGapJS([20, 0], pts, rad, 5) > 0 || END_SEGS === 2, 'only the segments about the sample count');
  assert.ok(trunkGapJS([50, 4], pts, rad, 0) > 0, 'far along the trunk: not inside it');
});

test('a branch fading into its trunk: the lumen\'s factor fl and the outline\'s fo scale what is drawn, the lumen\'s share by fl and the ink by fo', () => {
  const own = tubeLeanJS({ ...base, D: -2, join: { drop: false, fl: 1, fo: 1 } });
  const half = tubeLeanJS({ ...base, D: -2, join: { drop: false, fl: 0.5, fo: 0 } });
  near([half.colour[3] / own.colour[3]], [0.5], 'a lumen pixel is scaled by fl', 1e-6);
  assert.ok(Math.abs(half.flow.w / own.flow.w - 0.5) < 1e-6, 'and the stream\'s visibility with it');
  const ink = tubeLeanJS({ ...base, D: 0.5, attrs, join: { drop: false, fl: 1, fo: 0.25 } }), ink1 = tubeLeanJS({ ...base, D: 0.5, attrs, join: { drop: false, fl: 1, fo: 1 } });
  near([ink.colour[3] / ink1.colour[3]], [0.25], 'an outline pixel is scaled by fo', 1e-6);
  assert.equal(tubeLeanJS({ ...base, D: 0.5, attrs, join: { drop: false, fl: 1, fo: 0 } }).kind, 'discard', 'ink gone: nothing is drawn there');
  assert.match(LEAN, /c \*= mix\(je\.fo, je\.fl, aL\) \* jr;/);
  assert.match(LEAN, /lumA \*= je\.fl \* jr;/);
});

test('a web carries its owner\'s tier alpha and group (the lumen layer gives it the same), not those of the tier it is drawn in', () => {
  assert.match(LEAN, /int tt = ti;/);
  assert.ok(!/isWeb == 1 \? tierNow : ti/.test(LEAN));
});

test('the lift draws the selected vessel\'s own share only', () => {
  const sel = { ...base, grp: 1, attrs: { ...attrs, sel: 1 }, lift: true };
  near(tubeLeanJS(sel).colour, [...FILL, 1], 'the selected vessel at full share');
  assert.equal(tubeLeanJS({ ...sel, attrs: { ...attrs, sel: 0 } }).kind, 'discard', 'nothing of a vessel that is not selected');
});
