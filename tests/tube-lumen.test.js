// The Tube's lumen shader (src/ui/tube-lumen-glsl.js, brief S3-C): judged from what the module exports (no test reads the text of src/).
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
const { shadeGLSL } = await import('../src/ui/veins-mesh-glsl.js');
const { tubeLumenFS, tubeLumenJS, packedPlaceJS, LUM_MIN, WEB_RATIO, LYMPH_INK, lymphInkJS } = await import('../src/ui/tube-lumen-glsl.js');
const { tubeLeanFS } = await import('../src/ui/tube-lean-glsl.js');
const { programs } = await import('../scripts/glsl-compile-list.mjs');

const K = {
  F_DIFFUSE: gl.F_DIFFUSE, F_EDGE: gl.F_EDGE, F_SHADOW: gl.F_SHADOW, F_SPEC: gl.F_SPEC, F_VEIL: gl.F_VEIL, F_WHOLE: gl.F_WHOLE, F_SEL: gl.F_SEL,
  F_DOTTED: gl.F_DOTTED, F_NOCASE: gl.F_NOCASE, LIFT_EASE_MAX, LIFT_EASE_SHARE, LUMEN2: gl.LUMEN2, ROW2_BITS: gl.ROW2_BITS, VEIL_K: gl.VEIL_K,
  EDGE: EDGE_GLSL, ENT_W, N_SAMPLES: gl.N_SAMPLES, MAX_TIERS: gl.MAX_TIERS, S_OFF: 96,
};
const LUMEN = tubeLumenFS(K), LUMEN_PLAIN = tubeLumenFS({ ...K, PLAIN: 1 });

// The shader's own preprocessor, as far as these shaders use it: #define NAME value, #if NAME == n, #else, #endif (the lint follows no directive).
function resolve(text) {
  const defs = {}, out = [], stack = [];
  for (const line of text.split('\n')) {
    const t = line.trim(), live = stack.every((s) => s);
    let m;
    if ((m = t.match(/^#define (\w+) (.+)$/))) { if (live) defs[m[1]] = m[2].trim(); continue; }
    if ((m = t.match(/^#if (\w+)(?: == (\d+))?$/))) { const v = Number(defs[m[1]] ?? 0); stack.push(m[2] == null ? v !== 0 : v === Number(m[2])); continue; }
    if (t === '#else') { stack.push(!stack.pop()); continue; }
    if (t === '#endif') { stack.pop(); continue; }
    if (live) out.push(line);
  }
  assert.equal(stack.length, 0, 'every #if is closed');
  return out.join('\n');
}
/** name → type for every uniform a text declares (arrays by base name; a comma list gives each its type). */
function uniformTypes(text) {
  const clean = resolve(text).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const out = new Map();
  for (const m of clean.matchAll(/\buniform\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+([^;]+);/g)) {
    for (const part of m[2].split(',')) out.set(part.trim().replace(/\[.*$/, ''), m[1]);
  }
  return out;
}

test('the lumen shader passes the lint, with and without the dye and origin switches', () => {
  assert.deepEqual(lintGLSL(resolve(LUMEN)), []);
  assert.deepEqual(lintGLSL(resolve(LUMEN_PLAIN)), []);
  assert.match(LUMEN, /^#version 300 es\n/);
  assert.match(LUMEN, /\n#define PLAIN 0\n/);
  assert.match(LUMEN_PLAIN, /\n#define PLAIN 1\n/);
});

test('it runs the compositor\'s lumen section (blood, origin, dye) and declares no flow target', () => {
  for (const call of ['bloodAt(', 'originAt(', 'dyeAt(', 'dyeEdge(', 'lymphAt(', 'castAt(', 'flowD(']) assert.ok(LUMEN.includes(call), `${call} is called`);
  assert.ok(!/\bgbuf2?\b/.test(LUMEN), 'no gbuf');
  assert.ok(!/\bhalfL\b/.test(LUMEN), 'no half-size streak layer');
  // The three blood styles are the uniform's, as in the compositor: styles 1, 2 and 3 are all in the text.
  assert.ok(/uniform int bloodStyle;/.test(LUMEN));
  for (const n of [1, 2, 3]) assert.ok(LUMEN.includes(`bloodStyle == ${n}`), `blood style ${n} is in bloodAt`);
});

test('it takes the vessel\'s colour and opacity from the shared vesAttrs, not a copy', () => {
  const shade = shadeGLSL(K);
  const at = shade.indexOf('void vesAttrs(');
  assert.ok(at >= 0);
  const end = shade.indexOf('// A lit vessel', at);
  const vesAttrs = shade.slice(at, end).trim();
  assert.ok(LUMEN.includes(vesAttrs), 'vesAttrs is the shared text');
  assert.ok(LUMEN.includes('vesAttrs(id, u, u, p, occl,'), 'and it is called with the veil\'s occl');
});

test('every uniform it shares with the compositor has the compositor\'s type', () => {
  const comp = uniformTypes(gl.COMP_FS()), mine = uniformTypes(LUMEN);
  let shared = 0;
  for (const [name, type] of mine) {
    if (!comp.has(name)) continue;
    shared++;
    assert.equal(type, comp.get(name), `${name}: ${type} here, ${comp.get(name)} in COMP_FS`);
  }
  assert.ok(shared >= 20, `the two share their lumen uniforms (${shared})`);
  // The uniforms the compositor's lumen text needs are all declared here (the compile check judges the rest).
  for (const n of ['flow', 'rad', 'tube', 'dye', 'pxW', 'bT', 'clock', 'originCol', 'dyeCol', 'inkLight', 'inkDark', 'noiseT', 'bloodStyle', 'lenOn', 'origin', 'dyeOn', 'blood', 'blendA', 'flowA']) {
    assert.ok(mine.has(n), `${n} is declared`);
  }
  // ...and those the vessel's colour and opacity need are tubeLeanFS's, by name.
  const lean = uniformTypes(tubeLeanFS({ ...K, ALONG_GLSL: '' }));
  for (const n of ['tube', 'organ', 'organRect', 'useOrgan', 'organK', 'tierAlpha', 'tierGroup', 'netAlpha', 'invA', 'tOff', 'lOff', 'sizeF', 'ent', 'posBase']) {
    assert.equal(mine.get(n), lean.get(n), `${n} has tubeLeanFS's type`);
  }
});

test('N_SAMPLES must be 64 (the arc length and the ends are packed over 64 samples)', () => {
  assert.throws(() => tubeLumenFS({ ...K, N_SAMPLES: 32 }), /64/);
});

// ---- the twin: the place in the stream equals what the vessel shader stores and the compositor reads back ----

const LAST = 63;
// A curving vessel: 64 points, a taper, and a row length as the data has it.
const pts = Array.from({ length: 64 }, (_, i) => [40 + i * 9, 120 + 30 * Math.sin(i / 9) + 0.4 * i]);
const radii = pts.map((_, i) => 6 - 2.5 * (i / LAST));
const segLen = pts.slice(1).map((b, i) => Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1]));
const LEN = segLen.reduce((a, b) => a + b, 0);
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

/** segNear's numbers for a pixel p (the vessel shader's search over the one vessel), and the vertex shader's vG/vRad/vD for it. */
function vesselSays(p, clip = [0, 1]) {
  let best = null;
  for (let i = 0; i < LAST; i++) {
    const a = pts[i], b = pts[i + 1], ba = [b[0] - a[0], b[1] - a[1]];
    const L2 = Math.max(ba[0] * ba[0] + ba[1] * ba[1], 1e-8);
    const hr = ((p[0] - a[0]) * ba[0] + (p[1] - a[1]) * ba[1]) / L2, h = clamp(hr, 0, 1);
    const q = [p[0] - a[0] - ba[0] * h, p[1] - a[1] - ba[1] * h], dist = Math.hypot(q[0], q[1]);
    const r = radii[i] * (1 - h) + radii[i + 1] * h, d = dist - r;
    if (!best || d < best.d) {
      best = { d, i, ba, vG: q, r, u: (i + h) / LAST, bx: (ba[0] * (p[1] - a[1]) - ba[1] * (p[0] - a[0])) / Math.sqrt(L2) };
    }
  }
  const gS = best.u * LEN, gY = clamp(best.bx / best.r, -1, 1);
  return { ...best, gS, gY };
}

// Pixels on both sides of the centreline, at several places along it, from the axis out to the wall and a little past.
const TABLE = [];
for (const i of [3, 11, 20, 31, 44, 57]) {
  for (const f of [-0.98, -0.7, -0.3, -0.05, 0, 0.2, 0.6, 0.95]) {
    const a = pts[i], b = pts[i + 1], t = 0.37;
    const c = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], n = [-(b[1] - a[1]), b[0] - a[0]], nl = Math.hypot(...n);
    const r = radii[i] * (1 - t) + radii[i + 1] * t;
    TABLE.push([c[0] + (n[0] / nl) * f * r, c[1] + (n[1] / nl) * f * r]);
  }
}

test('across and arc equal packFlow\'s unpacked values, within one packing step, on a table of pixels', () => {
  assert.ok(TABLE.length >= 40);
  let leftPositive = 0, rightNegative = 0;
  for (const p of TABLE) {
    const v = vesselSays(p);
    const t = tubeLumenJS({ vI: v.u * LAST, vD: v.d, vG: v.vG, vRad: v.r, ba: v.ba, len: LEN, aa: 1, R: v.r });
    const packed = packedPlaceJS(v.gS, v.gY);   // what the compositor reads back from the vessel layer's flow target
    assert.ok(Math.abs(t.s - packed.s) <= 1 / 16, `arc ${t.s} vs ${packed.s}`);
    assert.ok(Math.abs(t.y - packed.y) <= 1 / 32767.5, `across ${t.y} vs ${packed.y}`);
    // (and equal to the unpacked numbers before packing too)
    assert.ok(Math.abs(t.s - v.gS) < 1e-9 && Math.abs(t.y - v.gY) < 1e-9);
    if (v.gY > 0.02) leftPositive++; else if (v.gY < -0.02) rightNegative++;
  }
  assert.ok(leftPositive > 5 && rightNegative > 5, 'both sides of the centreline are in the table, and the sign differs between them');
});

test('across is signed by the side of the centreline, and its size is the offset over the radius', () => {
  const ba = [3, 4];   // direction (0.6, 0.8); its left normal (-0.8, 0.6)
  const left = tubeLumenJS({ vI: 10, vD: -1, vG: [-0.8 * 2, 0.6 * 2], vRad: 4, ba, len: 100, aa: 1 });
  const right = tubeLumenJS({ vI: 10, vD: -1, vG: [0.8 * 2, -0.6 * 2], vRad: 4, ba, len: 100, aa: 1 });
  assert.ok(Math.abs(left.across - 2) < 1e-9 && Math.abs(right.across + 2) < 1e-9);
  assert.ok(Math.abs(left.y - 0.5) < 1e-9 && Math.abs(right.y + 0.5) < 1e-9);
  // Along the course the offset adds nothing (a cap's offset has an along part).
  const cap = tubeLumenJS({ vI: 0, vD: -1, vG: [0.6 * 3 - 0.8 * 2, 0.8 * 3 + 0.6 * 2], vRad: 4, ba, len: 100, aa: 1 });
  assert.ok(Math.abs(cap.across - 2) < 1e-9);
  // The arc length is the place along the course times the row's length (packFlow's gS = u * length).
  assert.ok(Math.abs(tubeLumenJS({ vI: 31.5, vD: -1, vG: [0, 0], vRad: 4, ba, len: 200, aa: 1 }).s - 100) < 1e-9);
});

test('coverage is 1 inside the wall, 0 past it, and soft in between', () => {
  const aa = 0.8, base = { vI: 20, vG: [0, 1], vRad: 4, ba: [1, 0], len: 100, aa };
  assert.equal(tubeLumenJS({ ...base, vD: -4 }).coverage, 1);
  assert.equal(tubeLumenJS({ ...base, vD: -aa / 2 }).coverage, 1);
  assert.equal(tubeLumenJS({ ...base, vD: -2 }).coverage, 1);
  assert.equal(tubeLumenJS({ ...base, vD: aa / 2 }).coverage, 0);
  assert.equal(tubeLumenJS({ ...base, vD: 0.3 * aa + 3 }).coverage, 0);
  assert.ok(Math.abs(tubeLumenJS({ ...base, vD: 0 }).coverage - 0.5) < 1e-12, 'half at the wall');
  const soft = tubeLumenJS({ ...base, vD: 0.2 * aa });
  assert.ok(soft.coverage > 0 && soft.coverage < 0.5);
  // The shader discards past the wall (coverage 0), and a lumen too faint to have written a stream (lean's threshold).
  assert.equal(tubeLumenJS({ ...base, vD: 1 }).drawn, false);
  assert.equal(tubeLumenJS({ ...base, vD: -4, opacity: LUM_MIN * 0.9 }).drawn, false);
  assert.equal(tubeLumenJS({ ...base, vD: -4, opacity: 0.5 }).drawn, true);
  assert.equal(tubeLumenJS({ ...base, vD: -4, opacity: 0.5 }).lumA, 0.5);
});

test('past a vessel\'s clipped end the lumen ends in a round cap, as the vessel shader\'s clip rule makes it', () => {
  const base = { vD: -3, vG: [0, 0], vRad: 4, ba: [1, 0], len: 100, aa: 0.8, clip: [0, 0.5] };
  // Inside the drawn stretch: whole. Well past its end: gone. Just past: the cap's curve.
  assert.equal(tubeLumenJS({ ...base, vI: 20 }).coverage, 1);
  assert.equal(tubeLumenJS({ ...base, vI: 0.9 * LAST }).coverage, 0);
  const near = tubeLumenJS({ ...base, vI: (0.5 + 1 / 100) * LAST });   // 1 unit past the end, 3 inside the wall: still inside the cap
  assert.equal(near.coverage, 1);
});

test('a web\'s pixels (vRad 4 x a radius, vG a unit direction) are told by their vRad and take the wall: no streak', () => {
  const R = 5;
  for (const g of [[0, 1], [0.6, 0.8], [-1, 0], [0, 0]]) {
    const t = tubeLumenJS({ vI: 20, vD: -0.1, vG: g, vRad: 4 * R, ba: [1, 0], len: 100, aa: 1, R });
    assert.equal(t.web, true);
    assert.equal(t.y, 1, 'across is the wall');
    assert.equal(1 - smoothstep(0.7, 1, Math.abs(t.y)), 0, 'bloodAt\'s wall term is 0 there');
  }
  // A strip is never taken for one: its vRad is the radius radAt gives (within the interpolation), from the axis to the wall.
  for (const f of [0, 0.4, 0.99]) {
    const t = tubeLumenJS({ vI: 20, vD: -(1 - f) * R, vG: [0, f * R], vRad: R * 1.05, ba: [1, 0], len: 100, aa: 1, R });
    assert.equal(t.web, false);
    assert.ok(Math.abs(t.y - f) < 1e-9);
  }
  // Without the rule, dividing the unit direction by the radius would have put the web's pixels on the axis, where the streaks are.
  assert.ok(1 - smoothstep(0.7, 1, 1 / R) > 0.9);
  // bloodAt's text is the one with that wall term, whose glow along the axis is multiplied by it, and the shader says what it does with a web.
  assert.ok(LUMEN.includes('float wall = 1.0 - smoothstep(0.7, 1.0, ay);'));
  assert.ok(/float a = clamp\(streak \* \(0\.32 \+ 0\.26 \* dens\) \+ glowCore, 0\.0, 0\.75\) \* wall/.test(LUMEN));
  assert.ok(LUMEN.includes(`bool web = vRad > ${WEB_RATIO}.0 * R1;`));
});
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

test('the compile list names the lumen programs (the web\'s waits for its vertex shader)', () => {
  const have = new Set([...programs().map((p) => p.name), ...(programs.skipped || []).map((s) => s.name)]);
  assert.ok([...have].some((n) => n.includes('tubeLumen')), 'tubeLumen is listed');
  assert.ok([...have].some((n) => n.includes('tubeWebLumen')), 'tubeWebLumen is listed');
  const built = programs().filter((p) => p.name.includes('tubeLumen'));
  for (const p of built) { assert.equal(p.error, undefined); assert.ok(p.fs.includes('bloodAt(')); }
});

test('lymph with a stream is drawn as the blood\'s streaks, in an ink that contrasts with the channel and runs with the protein; a row with none keeps its dashes', () => {
  const at = LUMEN.indexOf('bool isLy');
  const ly = LUMEN.slice(LUMEN.indexOf('if (blood == 1 && isLy', at));
  assert.ok(ly.includes('texelFetch(flow, ivec2(7, id1), 0)'), 'the stream is read from texel 7');
  assert.ok(ly.indexOf('bloodAt(') > 0 && ly.indexOf('lymphAt(') > ly.indexOf('bloodAt('), 'streaks first, the dashes as the fallback');
  assert.ok(ly.includes('max(A.a - glowL, 0.0)'), 'the axis glow is taken out: a streak tints, nothing else');
  assert.deepEqual(lintGLSL(resolve(LUMEN)), []);
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const light = [0.88, 0.92, 0.82], dark = [0.25, 0.3, 0.28];
  for (const prot of [0, 0.5, 1]) {
    const onL = lymphInkJS(prot, light), onD = lymphInkJS(prot, dark);
    assert.equal(onL.onLight, 1); assert.equal(onD.onLight, 0);
    assert.ok(lum(light) - lum(onL.ink) > 0.45, `a dark ink on a light channel (protein ${prot}): ${lum(onL.ink)}`);
    assert.ok(lum(onD.ink) - lum(dark) > 0.45, `a light ink on a dark channel (protein ${prot})`);
  }
  // The ramp: cool at 0 %, amber at 100 %, monotone in between; fainter and sparser when poor.
  const lo = lymphInkJS(0, light), mid = lymphInkJS(0.5, light), hi = lymphInkJS(1, light);
  assert.deepEqual(lo.ink, LYMPH_INK.onLight.low);
  assert.deepEqual(hi.ink, LYMPH_INK.onLight.high);
  assert.ok(lo.ink[0] < mid.ink[0] && mid.ink[0] < hi.ink[0], 'red rises toward amber');
  assert.ok(lo.ink[2] > mid.ink[2] && mid.ink[2] > hi.ink[2], 'blue falls toward amber');
  assert.ok(lo.strength < mid.strength && mid.strength < hi.strength && hi.strength === 1);
  assert.ok(lo.occ < hi.occ && hi.occ < 1, 'the gaps between streaks show the channel');
  assert.deepEqual(lymphInkJS(-1, light).ink, lo.ink);
});

test('the lumen layer lays the vessel layer\'s cel tones on its colour, over the blood (it replaces the fill, so without them the shading never shows)', () => {
  for (const text of [LUMEN, LUMEN_PLAIN]) {
    assert.deepEqual(lintGLSL(resolve(text)), []);
    assert.match(text, /^uniform int fx;/m, 'fx is read');
    assert.match(text, /vec3 celTones\(vec3 lum, float D, float R, vec2 g, float aa\)/, 'the shared tone function');
    assert.match(text, /if \(fx == 1 && \(flags & \d+\) != 0\) col = celTones\(/, 'applied to the final colour');
    assert.ok(text.indexOf('col = celTones(') > text.indexOf('dyeAt('), 'after the dye, the last thing done to the colour');
  }
});

test('V7: blood that shows trouble is wired in for style P only, and `still` is a uniform of the compositor\'s type', () => {
  assert.ok(LUMEN.includes('vec4 troubleAt('), 'blood-trouble.js\'s text is included');
  assert.ok(LUMEN.includes('if (bloodStyle == 3) { tr = troubleAt(id1, s1, y1, R1, len1, f0.y, f1.w > 0.5); f0.z *= tr.z; }'));
  assert.ok(LUMEN.includes('bloodAt(id1, tr.x, tr.y, col, f0, f1, len1, R1, vc1)'));
  assert.equal(uniformTypes(LUMEN).get('still'), 'int');
  assert.equal(uniformTypes(gl.COMP_FS()).get('still'), 'int');
});
