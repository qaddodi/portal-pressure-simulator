import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  END_BASE, JOIN_WIN, JOIN_REACH, JOIN_CUT, JOIN_COLOUR_R, JOIN_COLOUR_MIN, JOIN_ALONG_GLSL, JOIN_MODE, JOIN_FADE_IN, JOIN_FADE_OUT, JOIN_FADE_LINE, endTrunk, endContinues, endKind,
  tubeJoinVS, tubeJoinFS, JOIN_IN_GLSL, trunkGapJS, joinOneJS, joinEndJS, joinToneJS, joinTaperJS, JOIN_TAPER_R, joinPackJS, joinRampGLSL, END_THRU_START, END_THRU_END,
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

test('an open end on a trunk\'s end: the chord stops at the trunk\'s end (flat, the branch drawn beyond) unless the trunk runs on into another row there (END_THRU_*): then it reaches on, and nothing of the branch is drawn whole beyond the seam (the azygos arch\'s hooked tip at the SVC)', () => {
  // a vertical trunk row 0 from y = 0 to y = 100, radius 6; a branch arriving at its end (0, 100) from the left, tier 16
  const tr = line(0, 0, 0, 100), br = line(-60, 130, 0, 100);
  const R6 = rowsOf({ 0: { pts: tr, rad: tr.map(() => 6), tier: 3, colour: () => [0.2, 0.8, 0.2] } });
  const own = { pts: br, tier: 16 };
  const alone = joinOneJS({ e: endTrunk(0, 63), atStart: false, own, rows: R6 });
  assert.equal(alone.PT, -2, 'a trunk that ends there: flat');
  assert.ok(Math.abs(alone.J[3] - 100) < 1e-9, `the forward arm ends at the trunk's end: ${alone.J[3]}`);
  const thru = joinOneJS({ e: endTrunk(0, 63) + END_THRU_END, atStart: false, own, rows: R6 });
  assert.equal(thru.PT, -1, 'a trunk that runs on: no flat end');
  assert.ok(thru.J[3] > 100 + JOIN_REACH * 6 - 1e-6, `the chord reaches on past the end: ${thru.J[3]}`);
  const start = joinOneJS({ e: endTrunk(0, 0) + END_THRU_START, atStart: false, own, rows: R6 });
  assert.ok(start.J[1] < -JOIN_REACH * 6 + 1e-6 && start.PT === -1, 'and the other end the same way');
  const both = joinOneJS({ e: endTrunk(0, 0) + END_THRU_START + END_THRU_END, atStart: false, own, rows: R6 });
  assert.ok(both.J[1] < -JOIN_REACH * 6 + 1e-6 && both.J[3] > JOIN_REACH * 6 - 1e-6, 'both');
  // a pixel of the branch's round end past the seam, inside the trunk's width: alone it is drawn whole; with the trunk running on it fades into the trunk
  const at = (d, p) => joinEndJS({ vI: 62, J0: [0, 0, 0, 0], J1: d.J, K: [-1, -1, d.K[0], d.K[1]], C0: [0, 0, 0], C1: d.C, PT1: d.PT, p, R: 4, px: PX });
  const p = [0.5, 103];
  assert.equal(at(alone, p).fl, 1, 'alone: whole');
  assert.ok(at(thru, p).fl < 0.5 || at(thru, p).drop, `running on: faded into the trunk (${at(thru, p).fl})`);
});

test('an open end follows a trunk that bends within its reach: the arms are the trunk\'s own samples about the knee, not the tangent\'s line (the Circuit\'s cava turns a corner where the hepatic veins arrive: its tangent cut dropped pixels outside it)', () => {
  // an L: down x = 0 from y = 0 to y = 100, then along y = 100 to x = 100, radius 6; 64 samples by arc length
  const corners = [[0, 0], [0, 100], [100, 100]], Ls = [0, 100, 200];
  const pts = Array.from({ length: 64 }, (_, i) => { const s = (i / 63) * 200, k = s <= 100 ? 0 : 1, t = s <= 100 ? s : s - 100; return [corners[k][0] + (corners[k + 1][0] - corners[k][0]) * t / 100, corners[k][1] + (corners[k + 1][1] - corners[k][1]) * t / 100]; });
  const sm = 31;   // just before the corner (the sample nearest arc length 100 is 31.5)
  const Rr = rowsOf({ 0: { pts, rad: pts.map(() => 6), tier: 3, colour: () => [0.2, 0.8, 0.2] } });
  const o = joinOneJS({ e: endTrunk(0, sm), atStart: false, own: { pts: line(-60, 100, 0, 100), tier: 3 }, rows: Rr });
  assert.deepEqual(o.Q, pts[sm], 'the knee is the sample');
  const at = (p) => joinEndJS({ vI: 62, J0: [0, 0, 0, 0], J1: o.J, Q1: o.Q, K: [-1, -1, o.K[0], o.K[1]], C1: o.C, PT1: o.PT, p, R: 4, px: PX });
  // a pixel in the trunk's corner (inside the L's elbow, 3 right of the vertical and 3 above its turn): the trunk's; one beyond the corner outside the L (x -10): not the trunk's
  assert.equal(at([3, 99]).drop, true, 'inside the elbow: the trunk\'s');
  assert.equal(at([-10, 99]).drop, false, 'outside the L: not dropped (a tangent chord dropped it)');
  const straightRows = rowsOf({ 0: { pts: line(0, 0, 0, 100), rad: Array(64).fill(6), tier: 3, colour: () => [0, 0, 0] } });
  const sOne = joinOneJS({ e: endTrunk(0, 31), atStart: false, own: { pts: line(-60, 50, 0, 50), tier: 3 }, rows: straightRows });
  assert.ok(Math.abs(sOne.J[0]) < 1e-6 && Math.abs(sOne.J[2]) < 1e-6 && sOne.J[1] < sOne.Q[1] && sOne.J[3] > sOne.Q[1], 'a straight trunk: the arms run one each way along it');
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
  assert.ok(at(16, [0, 0]).fl < 0.05, 'on the trunk\'s centreline (a radius of 6 inside the wall) the branch is all but gone');
  assert.equal(at(16, [0, -0.5]).fo, 0, 'and its ink');
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
  assert.ok(fs.includes(`if (s > ${JOIN_CUT} * px) {`));
  assert.match(fs, /if \(gap < -0\.5 \* px && !beyond\) \{ j\.drop = true; return j; \}/);
  assert.ok(fs.includes(`j.fl = smoothstep(-${JOIN_FADE_IN} * R, ${JOIN_FADE_OUT.toFixed(1)} * R, gap);`));
  assert.ok(fs.includes(`j.fo = smoothstep(-${JOIN_FADE_LINE} * R, 0.0, gap);`));
  assert.ok(!/texelFetch|texture\(|vesAttrs|for \(/.test(fs), 'the fragment part reads nothing and loops over nothing');
  assert.match(vs, /int k = int\(-e \+ 0\.5\) - 2, pr = k \/ 64, ps = k % 64;/, 'a continuation: -(2 + row * 64 + sample)');
  assert.match(vs, /int ei = int\(e \+ 0\.1\), tr = ei \/ 64, sm = ei % 64;/);
  assert.match(vs, /return vec4\(joinArm\(tr, sm, -1, sp, hl, tb\), joinArm\(tr, sm, 1, sp, hl, tf\)\);/, 'the arms follow the trunk\'s samples; the knee is the sample');
  assert.ok(fs.includes('float gap = min(joinSeg(p, J.xy, CC.yz), joinSeg(p, CC.yz, J.zw)) - K.x;'), 'the fragment measures to the two arms');
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
  assert.equal(d.PT, joinPackJS(3, 0, 1), 'the partner\'s tier, flags and alpha ride in the colour\'s w');
  const R = 6, at = (x) => joinEndJS({ vI: 60, J0: [0, 0, 0, 0], J1: d.J, K: [-1, -1, ...d.K], C0: [0, 0, 0], C1: d.C, PT1: d.PT, p: [x, 0], R, px: PX });
  assert.equal(at(-50).rs, 0, 'far from the plane: whole');
  assert.ok(Math.abs(at(0).rs - 1) < 1e-9, 'at the plane: all the way to the partner\'s opacity');
  assert.ok(at(-9).rs > 0 && at(-9).rs < 1, 'between: eased');
});

test('the opacity ramp\'s GLSL lints in the lean shader\'s surroundings and decodes what joinPackJS packs', () => {
  assert.equal(joinPackJS(3, 128, 1), 3 + 32 + 128 * 255);
  assert.equal(joinPackJS(7, 256, 0.5), 7 + 64 + 128 * 128);
  const g = joinRampGLSL(0.55);
  assert.match(g, /float joinRamp\(JoinEnd j, float ownEff, float occl\)/);
  assert.match(g, /int tp = n & 31;/);
});

test('a trunk whose own end the branches leave from, with no row carrying on, ends flat (its code is itself): the branch is drawn beyond that end, the trunk draws nothing past it (no disc)', () => {
  const t = line(-100, 0, 0, 0), own = line(0, 0, 60, 40), R = 6;
  const rw = rowsOf({ 0: { pts: t, rad: t.map(() => R), tier: 7, colour: () => [0, 0, 0] } });
  const self = joinOneJS({ e: endContinues(0, 63), atStart: false, own: { pts: t, tier: 7 }, id: 0, rows: rw });
  assert.deepEqual(self.K, [0, JOIN_MODE.PLANE], 'a plane');
  assert.deepEqual(self.J, [0, 0, 1, 0], 'at the end point, facing out along the trunk');
  const e0 = joinOneJS({ e: endTrunk(0, 63), atStart: true, own: { pts: own, tier: 7 }, rows: rw });
  assert.equal(e0.PT, -2, 'the branch knows the chord ends flat at b');
  const at = (p) => joinEndJS({ vI: 2, J0: e0.J, J1: [0, 0, 0, 0], K: [...e0.K, -1, -1], C0: e0.C, C1: [0, 0, 0], PT0: e0.PT, p, R, px: PX });
  assert.equal(at([3, 0]).drop, false, 'beyond the trunk\'s end, inside where its cap was: the branch\'s');
  assert.equal(at([-3, 0]).drop, true, 'behind it, inside the trunk: the trunk\'s');
  const plane = joinEndJS({ vI: 60, J0: [0, 0, 0, 0], J1: self.J, K: [-1, -1, ...self.K], C0: [0, 0, 0], C1: self.C, p: [3, 0], R, px: PX });
  assert.equal(plane.drop, true, 'and the trunk draws nothing past its end');
});

test('one tone field over a join: at a bent continuation the cel tones\' direction turns halfway to the next row\'s at the plane (each row by half, in opposite senses, so they meet); a cut branch\'s tones ease in from the trunk\'s wall; a fading branch\'s lumen rises from nothing at its own end', () => {
  const A = line(-100, 0, 0, 0), B = line(0, 0, 86.6, 50), R = 6;
  const rw = rowsOf({ 0: { pts: A, tier: 3, colour: () => [1, 1, 1] }, 1: { pts: B, tier: 3, colour: () => [1, 1, 1] } });
  const dA = joinOneJS({ e: endContinues(1, 0), atStart: false, own: { pts: A, tier: 3 }, id: 0, rows: rw });
  const dB = joinOneJS({ e: endContinues(0, 63), atStart: true, own: { pts: B, tier: 3 }, id: 1, rows: rw });
  assert.ok(Math.abs(dA.K[0] - Math.PI / 6) < 1e-3, `the turn from A to B is 30 degrees: ${dA.K[0]}`);
  assert.ok(Math.abs(dB.K[0] + Math.PI / 6) < 1e-3, 'and from B back to A the other way');
  const a = (x) => joinEndJS({ vI: 60, J0: [0, 0, 0, 0], J1: dA.J, K: [-1, -1, ...dA.K], C0: [0, 0, 0], C1: dA.C, p: [x, 0], R, px: PX });
  const b = (x) => joinEndJS({ vI: 3, J0: dB.J, J1: [0, 0, 0, 0], K: [...dB.K, -1, -1], C0: dB.C, C1: [0, 0, 0], p: [x, 0], R, px: PX });
  assert.equal(a(-60).rot, 0, 'far from the plane the row\'s own direction');
  assert.ok(Math.abs(a(0).rot - Math.PI / 12) < 1e-3, 'at the plane half the turn');
  assert.ok(Math.abs(b(0.1).rot + Math.PI / 12) < 1e-2, 'and the other row meets it from the other side');
  const g = joinToneJS([0, 1], a(0));
  assert.ok(Math.abs(Math.hypot(g[0], g[1]) - 1) < 1e-9, 'a turn keeps g a unit vector');
  // a cut branch
  const t = line(-100, 0, 100, 0), br = line(0, 60, 0, 0);
  const rt = rowsOf({ 0: { pts: t, rad: t.map(() => 6), tier: 7, colour: () => [0, 0, 0] } });
  const cut = joinOneJS({ e: endTrunk(0, 32), atStart: false, own: { pts: br, tier: 7 }, rows: rt });
  const c = (y) => joinEndJS({ vI: 60, J0: [0, 0, 0, 0], J1: cut.J, K: [-1, -1, ...cut.K], C0: [0, 0, 0], C1: cut.C, p: [0, y], R: 4, px: PX });
  assert.ok(c(6.2).tk < 0.05 && c(60).tk === 1, 'flat at the trunk\'s wall, whole far off');
  const fade = joinOneJS({ e: endTrunk(0, 32), atStart: false, own: { pts: br, tier: 16 }, rows: rt });
  const f = joinEndJS({ vI: 60, J0: [0, 0, 0, 0], J1: fade.J, K: [-1, -1, ...fade.K], C0: [0, 0, 0], C1: fade.C, p: [0, 3], R: 4, px: PX });
  assert.equal(f.tp, 1, 'a fading branch at its end tapers at the end');
  assert.equal(joinTaperJS(f, 1, 60, 4), 0, 'nothing at its own end point (its round cap is the end)');
  assert.equal(joinTaperJS(f, 1 - (JOIN_TAPER_R * 4 + 1) / 60, 60, 4), 1, 'whole beyond the taper');
  assert.equal(joinTaperJS({ tp: 0 }, 1, 60, 4), 1, 'and none for a row with no fading end');
});

test('the outer corner of a bend is round, not notched: past the bisector plane a row still draws the wedge between its own end line and the next row\'s start line (the two end caps are one circle there); the inner side and the straight on are the other row\'s', () => {
  const A = line(-100, 0, 0, 0), B = line(0, 0, 86.6, 50), R = 6;
  const rw = rowsOf({ 0: { pts: A, tier: 3, colour: () => [1, 1, 1] }, 1: { pts: B, tier: 3, colour: () => [1, 1, 1] } });
  const dA = joinOneJS({ e: endContinues(1, 0), atStart: false, own: { pts: A, tier: 3 }, id: 0, rows: rw });
  const a = (x, y) => joinEndJS({ vI: 60, J0: [0, 0, 0, 0], J1: dA.J, K: [-1, -1, ...dA.K], C0: [0, 0, 0], C1: dA.C, p: [x, y], R, px: PX });
  assert.equal(a(2, -4).drop, false, 'the outer wedge (a bend to +y has its outer side at -y)');
  assert.equal(a(2, 4).drop, true, 'the inner side is the next row\'s');
  assert.equal(a(3, 0).drop, true, 'straight on is the next row\'s');
  assert.equal(a(-1, -4).drop, false, 'and behind the plane it is its own');
  const straight = joinOneJS({ e: endContinues(1, 0), atStart: false, own: { pts: A, tier: 3 }, id: 0, rows: rowsOf({ 0: { pts: A, tier: 3 }, 1: { pts: line(0, 0, 100, 0), tier: 3 } }) });
  const s = (x, y) => joinEndJS({ vI: 60, J0: [0, 0, 0, 0], J1: straight.J, K: [-1, -1, ...straight.K], C0: [0, 0, 0], C1: [0, 0, 0], p: [x, y], R, px: PX });
  assert.equal(s(2, -4).drop, true, 'a straight continuation has no wedge');
});
