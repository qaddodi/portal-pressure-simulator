import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  END_BASE, JOIN_WIN, JOIN_REACH, JOIN_CUT, JOIN_COLOUR_R, JOIN_COLOUR_MIN, JOIN_ALONG_GLSL, JOIN_MODE, JOIN_FADE_IN, JOIN_FADE_OUT, JOIN_FADE_LINE, endTrunk, endContinues, endKind,
  tubeJoinVS, tubeJoinFS, JOIN_IN_GLSL, trunkGapJS, joinOneJS, joinEndJS,
} from '../src/ui/tube-join-glsl.js';
import { lintGLSL } from './glsl-lint.js';
import { ALONG_GLSL } from '../src/ui/comp-glsl.js';

// A row's end on another row: the codes, the vertex shader's data for each end (joinOneJS, the twin of joinOne), the fragment's decisions (joinEndJS, the twin of
// joinEnd: drop, the lumen's factor fl, the outline's fo) and the GLSL text. Node only; the shaders' own compile is scripts/glsl-compile.mjs.

const line = (x0, y0, x1, y1, n = 64) => Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / (n - 1), y0 + ((y1 - y0) * i) / (n - 1)]);
const PX = 0.5;
const rowsOf = (table) => (r) => table[r];

test('the codes: a trunk is row * 64 + sample, a continuation -(2 + row * 64 + sample), none -1, and each reads back as its kind', () => {
  assert.equal(END_BASE, 64);
  assert.equal(endTrunk(3, 5), 197);
  assert.equal(endContinues(3, 5), -199);
  assert.equal(endContinues(0, 0), -2);
  assert.equal(endKind(0), 'trunk');       // row 0, sample 0 is a trunk too
  assert.equal(endKind(197), 'trunk');
  assert.equal(endKind(-1), 'none');
  assert.equal(endKind(-2), 'continues');
  assert.equal(endKind(-199), 'continues');
  for (const row of [0, 1, 300, 4000]) for (const s of [0, 63]) assert.equal(Math.fround(endContinues(row, s)), endContinues(row, s));
});

// A horizontal trunk along y = 0, radius 6, tier 7; a branch coming down from y = 60 to its centreline at x = 0, ending on sample 32.
const trunk = line(-100, 0, 100, 0), branch = line(0, 60, 0, 0);
const rows = rowsOf({ 0: { pts: trunk, rad: trunk.map(() => 6), tier: 7, colour: () => [0.2, 0.8, 0.2] } });

test('an open end: the vertex shader\'s data is the trunk\'s chord about the sample (at least JOIN_REACH radii each way), its radius and the mode (fade when the branch is in a higher tier)', () => {
  const hi = joinOneJS({ e: endTrunk(0, 32), atStart: false, own: { pts: branch, tier: 16 }, rows });
  assert.deepEqual(hi.K, [6, JOIN_MODE.FADE], 'a branch in tier 16 over a trunk in tier 7: it fades into it');
  assert.ok(Math.abs(hi.J[1]) < 1e-9 && Math.abs(hi.J[3]) < 1e-9, 'the chord runs along the trunk');
  const half = Math.hypot(hi.J[2] - hi.J[0], hi.J[3] - hi.J[1]) / 2;
  assert.ok(half >= JOIN_REACH * 6 - 1e-9, `reaches ${JOIN_REACH} radii each way: ${half}`);
  assert.ok(Math.abs((hi.J[0] + hi.J[2]) / 2 - trunk[32][0]) < 1e-9, 'centred on the sample');
  assert.equal(joinOneJS({ e: endTrunk(0, 32), atStart: false, own: { pts: branch, tier: 7 }, rows }).K[1], JOIN_MODE.CUT, 'the same tier: cut at the wall');
  assert.equal(joinOneJS({ e: endTrunk(0, 32), atStart: false, own: { pts: branch, tier: 3 }, rows }).K[1], JOIN_MODE.CUT, 'a lower tier: cut');
  assert.deepEqual(joinOneJS({ e: -1, atStart: true, own: { pts: branch, tier: 3 }, rows }).K, [-1, -1], 'no end: none');
});

test('an open end in the fragment: a cut drops what lies in the trunk\'s lumen; a fade takes the branch\'s lumen and ink away between outside the wall and inside it', () => {
  const at = (tier, p, vI = 60) => {
    const d = joinOneJS({ e: endTrunk(0, 32), atStart: false, own: { pts: branch, tier }, rows });
    return joinEndJS({ vI, J0: [0, 0, 0, 0], J1: d.J, K: [-1, -1, d.K[0], d.K[1]], p, R: 4, px: PX });
  };
  // cut
  assert.equal(at(7, [0, 3]).drop, true, 'inside the trunk (3 from its centreline, radius 6): the trunk\'s pixel');
  assert.equal(at(7, [0, 6.2]).drop, false); assert.equal(at(7, [0, 6.2]).fl, 1);
  assert.equal(at(7, [0, 6.2]).fo, 1);
  // fade
  const far = at(16, [0, 6 + JOIN_FADE_OUT * 4 + 0.1]);
  assert.deepEqual([far.drop, far.fl, far.fo], [false, 1, 1], 'past the fade: whole');
  const wall = at(16, [0, 6]);
  assert.ok(wall.fl > 0.5 && wall.fl < 1, `at the wall the lumen is mostly there (${wall.fl})`);
  assert.equal(wall.fo, 1, 'and the ink whole');
  const inside = at(16, [0, 6 - 0.7]);
  assert.ok(inside.fl < wall.fl && inside.fl > 0, 'inside the lumen goes on fading');
  assert.ok(inside.fo < 1 && inside.fo > 0, 'the ink fades first');
  assert.equal(at(16, [0, 6 - JOIN_FADE_LINE * 4 - 0.1]).fo, 0, 'ink gone');
  assert.equal(at(16, [0, 6 - JOIN_FADE_IN * 4 - 0.1]).drop, true, 'lumen gone: dropped');
  assert.equal(at(16, [0, 6 - JOIN_FADE_IN * 4 + 0.1]).drop, false);
  // monotone: the further in, the less of it
  let prev = 2;
  for (let y = 12; y >= 0; y -= 0.5) { const j = at(16, [0, y]); assert.ok(j.fl <= prev + 1e-12, `fl falls going in (${y})`); prev = j.fl; }
  // the end window: only a pixel within JOIN_WIN samples of that end looks at it
  assert.equal(at(7, [0, 3], 63 - JOIN_WIN + 0.5).drop, true);
  assert.equal(at(7, [0, 3], 63 - JOIN_WIN - 0.5).drop, false, 'a pixel farther along the row than the window does not look');
  assert.equal(at(7, [0, 3], 3).drop, false, 'the other end is not flagged');
});

test('the chord is a good stand-in for the trunk\'s true gap: within half a world unit on a trunk of radius 6 bending on a 200 radius, over the mouth', () => {
  const n = 64, arc = Array.from({ length: n }, (_, i) => { const a = -0.5 + (i / (n - 1)) * 1.0; return [200 * Math.sin(a), 200 * (1 - Math.cos(a))]; });
  const radC = arc.map(() => 6), radSeg = arc.slice(1).map(() => [6, 6]);
  const rowsC = rowsOf({ 0: { pts: arc, rad: radC, tier: 7 } });
  const d = joinOneJS({ e: endTrunk(0, 32), atStart: false, own: { pts: branch, tier: 7 }, rows: rowsC });
  let worst = 0;
  const c = arc[32];
  for (let a = 0; a < 6.3; a += 0.2) for (const k of [0.4, 0.8, 1.2, 1.8]) {
    const p = [c[0] + Math.cos(a) * 6 * k, c[1] + Math.sin(a) * 6 * k];
    const bx = d.J[2] - d.J[0], by = d.J[3] - d.J[1], qx = p[0] - d.J[0], qy = p[1] - d.J[1];
    const h = Math.min(1, Math.max(0, (qx * bx + qy * by) / (bx * bx + by * by)));
    const gap = Math.hypot(qx - bx * h, qy - by * h) - d.K[0];
    worst = Math.max(worst, Math.abs(gap - trunkGapJS(p, arc, radSeg, 32, 63)));
  }
  assert.ok(worst < 0.5, `the chord's gap is within ${worst} world units of the true one near the mouth`);
});

test('a continuation: both rows end at the bisector plane of the break and are one surface there; looks are left alone', () => {
  const A = line(-100, 0, 0, 0), B = line(0, 0, 100, 0), rowsAB = rowsOf({ 0: { pts: A, tier: 3 }, 1: { pts: B, tier: 3 } });
  const dA = joinOneJS({ e: endContinues(1, 0), atStart: false, own: { pts: A, tier: 3 }, rows: rowsAB });
  const dB = joinOneJS({ e: endContinues(0, 63), atStart: true, own: { pts: B, tier: 3 }, rows: rowsAB });
  assert.deepEqual(dA.K, [0, JOIN_MODE.PLANE]); assert.deepEqual(dB.K, [0, JOIN_MODE.PLANE]);
  const a = (p) => joinEndJS({ vI: 60, J0: [0, 0, 0, 0], J1: dA.J, K: [-1, -1, ...dA.K], p, R: 6, px: PX });
  const b = (p) => joinEndJS({ vI: 3, J0: dB.J, J1: [0, 0, 0, 0], K: [...dB.K, -1, -1], p, R: 6, px: PX });
  assert.equal(a([-5, 2]).drop, false); assert.equal(a([5, 2]).drop, true, 'A drops what lies beyond the plane x = 0');
  assert.equal(b([5, 2]).drop, false); assert.equal(b([-5, 2]).drop, true, 'B drops what lies before it');
  assert.equal(a([JOIN_CUT * PX * 0.5, 0]).drop, false, 'a hair past the plane both still draw: no gap');
  assert.equal(b([-JOIN_CUT * PX * 0.5, 0]).drop, false);
  assert.deepEqual([a([0, 0]).fl, a([0, 0]).fo], [1, 1]);
  // a bend: the plane tilts to the bisector
  const B2 = line(0, 0, 70.7, 70.7), rows2 = rowsOf({ 0: { pts: A, tier: 3 }, 1: { pts: B2, tier: 3 } });
  const d2 = joinOneJS({ e: endContinues(1, 0), atStart: false, own: { pts: A, tier: 3 }, rows: rows2 });
  const mx = 1.707, my = 0.707, ml = Math.hypot(mx, my);
  const a2 = (p) => joinEndJS({ vI: 60, J0: [0, 0, 0, 0], J1: d2.J, K: [-1, -1, ...d2.K], p, R: 6, px: PX });
  const onPlane = [-my / ml * 3, mx / ml * 3];
  assert.equal(a2(onPlane).drop, false);
  assert.equal(a2([onPlane[0] + mx / ml * 2, onPlane[1] + my / ml * 2]).drop, true, 'beyond the tilted plane');
});

test('the GLSL: lints (given the shaders\' own surroundings), reads the end window and the flat data as the twin does', () => {
  const env = (body) => `#version 300 es
precision highp float;
precision highp int;
${body}
void main() {}
`;
  const fs = tubeJoinFS(64);
  assert.deepEqual(lintGLSL(env(fs)), []);
  const vs = `vec2 PT(int id, int i) { return vec2(float(id), float(i)); }
const float MIN_RADIUS = 0.25;
uniform highp sampler2D rad;
uniform highp sampler2D tube;
${tubeJoinVS(64)}`;
  assert.deepEqual(lintGLSL(env(vs)), []);
  assert.deepEqual(lintGLSL(env(JOIN_IN_GLSL)), []);
  assert.match(fs, /bool atStart = vI < 8\.0;/);
  assert.match(fs, /if \(!atStart && !\(vI > 55\.0\)\) return j;/);
  assert.ok(fs.includes(`if (s > ${JOIN_CUT} * px) { j.drop = true; return j; }`));
  assert.match(fs, /if \(gap < -0\.5 \* px\) \{ j\.drop = true; return j; \}/);
  assert.ok(fs.includes(`j.fl = smoothstep(-${JOIN_FADE_IN} * R, ${JOIN_FADE_OUT} * R, gap);`));
  assert.ok(fs.includes(`j.fo = smoothstep(-${JOIN_FADE_LINE} * R, 0.0, gap);`));
  assert.ok(!/texelFetch|texture\(|vesAttrs|for \(/.test(fs), 'the fragment part reads nothing and loops over nothing');
  assert.match(vs, /int k = int\(-e \+ 0\.5\) - 2, pr = k \/ 64, ps = k % 64;/, 'a continuation: -(2 + row * 64 + sample)');
  assert.match(vs, /int ei = int\(e \+ 0\.5\), tr = ei \/ 64, sm = ei % 64;/);
  assert.match(vs, /uniform int joinCut;/);
  assert.throws(() => tubeJoinVS(32), /N_SAMPLES|64/);
  assert.throws(() => tubeJoinFS(32), /N_SAMPLES|64/);
});

test('colour: a cut end and a continuation blend into the other row\'s colour over JOIN_COLOUR_R radii (a continuation to the mean at the plane); a fading branch does not', () => {
  const pale = [0.9, 0.9, 0.9], green = [0.2, 0.8, 0.2];
  // an open end, same tier: cut at the wall, the branch takes the trunk's colour more the nearer its wall
  const cut = joinOneJS({ e: endTrunk(0, 32), atStart: false, own: { pts: branch, tier: 7 }, rows });
  assert.deepEqual(cut.C, green, 'the trunk\'s colour at the sample');
  const at = (d, p, vI = 60) => joinEndJS({ vI, J0: [0, 0, 0, 0], J1: d.J, K: [-1, -1, d.K[0], d.K[1]], C0: [0, 0, 0], C1: d.C, p, R: 4, px: PX });
  const wall = at(cut, [0, 6.2]), far = at(cut, [0, 6 + Math.max(JOIN_COLOUR_R * 4, JOIN_COLOUR_MIN) + 0.1]), mid = at(cut, [0, 6 + 0.5 * Math.max(JOIN_COLOUR_R * 4, JOIN_COLOUR_MIN)]);
  assert.ok(wall.wc > 0.99 && far.wc === 0 && mid.wc > 0.3 && mid.wc < 0.7, `${wall.wc} ${mid.wc} ${far.wc}`);
  assert.deepEqual(wall.col, green);
  // a fading branch (a higher tier): no colour blend, the trunk shows through it
  const fade = joinOneJS({ e: endTrunk(0, 32), atStart: false, own: { pts: branch, tier: 16 }, rows });
  assert.equal(at(fade, [0, 6.2]).wc, 0);
  // a continuation: half at the plane, none past the blend
  const A = line(-100, 0, 0, 0), B = line(0, 0, 100, 0);
  const rowsAB = rowsOf({ 0: { pts: A, tier: 3, colour: () => pale }, 1: { pts: B, tier: 3, colour: () => green } });
  const dA = joinOneJS({ e: endContinues(1, 0), atStart: false, own: { pts: A, tier: 3 }, rows: rowsAB });
  assert.deepEqual(dA.C, green, 'A takes B\'s colour at B\'s end sample');
  const a = (p) => joinEndJS({ vI: 60, J0: [0, 0, 0, 0], J1: dA.J, K: [-1, -1, ...dA.K], C0: [0, 0, 0], C1: dA.C, p, R: 6, px: PX });
  assert.ok(Math.abs(a([0, 0]).wc - 0.5) < 1e-9, 'half at the plane: both rows meet at the mean');
  assert.equal(a([-Math.max(JOIN_COLOUR_R * 6, JOIN_COLOUR_MIN) - 0.1, 0]).wc, 0);
});

test('joinAlong is comp-glsl.js\'s alongAt under another name', () => {
  assert.equal(JOIN_ALONG_GLSL, ALONG_GLSL.trim().replace('alongAt', 'joinAlong'));
});

test('the join-only depth shader shares joinEnd\'s text with the lean and the lumen shaders (so the prepass and the colour pass cannot disagree), lints, and does no shading', async () => {
  const { tubeJoinDepthFS, tubeLeanFS } = await import('../src/ui/tube-lean-glsl.js');
  const { tubeLumenFS } = await import('../src/ui/tube-lumen-glsl.js');
  const fs = tubeJoinDepthFS(64);
  assert.ok(fs.includes(tubeJoinFS(64)), 'the same function text');
  assert.deepEqual(lintGLSL(fs), []);
  assert.ok(!/texelFetch|texture\(|vesAttrs|celShade/.test(fs), 'no reads and no shading');
  assert.match(fs, /if \(joinEnd\(vI, vJ0, vJ1, vJK, vC0, vC1, p, vRad, px\)\.drop\) discard;/);
  const K = { F_DIFFUSE: 2, F_EDGE: 64, F_SHADOW: 4, F_SPEC: 32, F_VEIL: 128, F_WHOLE: 256, F_SEL: 1, F_DOTTED: 8, F_NOCASE: 16, LIFT_EASE_MAX: 1, LIFT_EASE_SHARE: 1, LUMEN2: 32768, ROW2_BITS: 11, VEIL_K: 0.6, EDGE: '', ENT_W: 2048, N_SAMPLES: 64, MAX_TIERS: 20, S_OFF: 96, ALONG_GLSL: '' };
  assert.ok(tubeLeanFS(K).includes(tubeJoinFS(64)));
  assert.equal(typeof tubeLumenFS, 'function');
});

test('a branch on the trunk\'s own end: the chord stops at the trunk\'s end (the capsule is the trunk\'s round cap), so no pixel beyond it is dropped for nothing (the portal fork\'s black wedges, 10 Nov)', () => {
  const t = line(-100, 0, 0, 0), own = line(0, 0, 60, 40);
  const R = 6, rw = rowsOf({ 0: { pts: t, rad: t.map(() => R), tier: 7, colour: () => [0, 0, 0] } });
  const end = joinOneJS({ e: endTrunk(0, 63), atStart: true, own: { pts: own, tier: 7 }, rows: rw });
  assert.ok(end.J[2] <= 1e-9, `the chord ends at the trunk's end: ${end.J[2]}`);
  assert.ok(end.J[0] < -JOIN_REACH * R + 1e-9, 'and still reaches back into the trunk');
  const at = (p) => joinEndJS({ vI: 2, J0: end.J, J1: [0, 0, 0, 0], K: [...end.K, -1, -1], C0: end.C, C1: [0, 0, 0], p, R, px: PX });
  assert.equal(at([R + 2, 0]).drop, false, 'a pixel 2 beyond the trunk\'s cap is the branch\'s');
  assert.equal(at([R + 6, 3]).drop, false, 'and one in the crotch');
  assert.equal(at([R - 2, 0]).drop, true, 'inside the cap it is the trunk\'s');
  assert.equal(at([-10, 0]).drop, true, 'and inside the trunk');
  const near = joinOneJS({ e: endTrunk(0, 61), atStart: true, own: { pts: own, tier: 7 }, rows: rw });
  assert.ok(near.J[2] <= 100 / 63 * 2 + 1e-9, `two samples from the end it reaches only to it: ${near.J[2]}`);
});

test('a continuation between two tiers: the more opaque row eases to the other\'s opacity over the last JOIN_RAMP_R radii (none when the partner is the more opaque, or the tier is the same)', () => {
  const A = line(-100, 0, 0, 0), B = line(0, 0, 100, 0);
  const rw = rowsOf({ 0: { pts: A, tier: 7, colour: () => [1, 1, 1] }, 1: { pts: B, tier: 3, colour: () => [1, 1, 1] } });
  const d = joinOneJS({ e: endContinues(1, 0), atStart: false, own: { pts: A, tier: 7 }, rows: rw });
  assert.equal(d.PT, 3, 'the partner\'s tier rides in the colour\'s w');
  const R = 6, at = (x) => joinEndJS({ vI: 60, J0: [0, 0, 0, 0], J1: d.J, K: [-1, -1, ...d.K], C0: [0, 0, 0], C1: d.C, PT1: d.PT, p: [x, 0], R, px: PX });
  assert.equal(at(-50).rs, 0, 'far from the plane: whole');
  assert.ok(Math.abs(at(0).rs - 1) < 1e-9, 'at the plane: all the way to the partner\'s opacity');
  assert.ok(at(-9).rs > 0 && at(-9).rs < 1, 'between: eased');
});
