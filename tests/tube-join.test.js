import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  END_BASE, END_SEGS, JOIN_WIN, JOIN_W, JOIN_CUT, endTrunk, endContinues, endKind, tubeJoinGLSL, trunkGapJS, joinEndJS, joinMix, joinRatio,
} from '../src/ui/tube-join-glsl.js';
import { lintGLSL } from './glsl-lint.js';

// A row's end on another row: the codes, the decisions of joinEnd (drop, share of the other's look) and the GLSL text both Tube fragment shaders include
// (tube-join-glsl.js). Node only; the shaders' own compile is scripts/glsl-compile.mjs.

const line = (x0, y0, x1, y1, n = 64) => Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / (n - 1), y0 + ((y1 - y0) * i) / (n - 1)]);
const radOf = (pts, r) => pts.slice(1).map(() => [r, r]);
const PX = 0.5;

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
  // (the codes survive a float32 flat varying: rows up to a few thousand)
  for (const row of [0, 1, 300, 4000]) for (const s of [0, 63]) assert.equal(Math.fround(endContinues(row, s)), endContinues(row, s));
});

test('an open end: a pixel inside the trunk\'s lumen is the trunk\'s (dropped); outside it takes the trunk\'s look more the nearer its wall, and nothing from JOIN_W radii out', () => {
  const trunk = line(-100, 0, 100, 0), rows = (r) => (r === 0 ? { pts: trunk, rad: radOf(trunk, 6) } : null);
  const branchPts = line(0, 60, 0, 0);   // ends (sample 63) at the trunk's centreline
  const at = (p, vI = 60) => joinEndJS({ vI, vEnd: [-1, endTrunk(0, 32)], p, R: 4, px: PX, own: { pts: branchPts }, rows });
  assert.equal(at([0, 3]).drop, true, 'inside the trunk (3 from its centreline, radius 6): the trunk\'s pixel');
  assert.equal(at([0, 3]).w, 0);
  const wall = at([0, 6.2]);   // just outside the wall
  assert.equal(wall.drop, false);
  assert.ok(wall.w > 0.99, `at the wall the branch takes the trunk's look (${wall.w})`);
  assert.equal(wall.row, 0); assert.equal(wall.u, 32 / 63);
  const mid = at([0, 6 + 0.5 * JOIN_W * 4]);
  assert.ok(mid.w > 0.3 && mid.w < 0.7, `half way along the blend: ${mid.w}`);
  assert.equal(at([0, 6 + JOIN_W * 4 + 0.1]).w, 0, 'past the blend: its own look');
  assert.equal(at([0, 30]).w, 0, 'far from the trunk: nothing');
  // the end window: only a pixel within JOIN_WIN samples of that end looks at it
  assert.equal(at([0, 3], 63 - JOIN_WIN + 0.5).drop, true);
  assert.equal(at([0, 3], 63 - JOIN_WIN - 0.5).drop, false, 'a pixel farther along the row than the window does not look');
  assert.equal(joinEndJS({ vI: 3, vEnd: [-1, endTrunk(0, 32)], p: [0, 3], R: 4, px: PX, own: { pts: branchPts }, rows }).drop, false, 'the other end is not flagged');
  // the gap the twin uses is the shader\'s trunkGap
  assert.ok(trunkGapJS([0, 3], trunk, radOf(trunk, 6), 32) < 0 && END_SEGS === 2);
});

test('a continuation: both rows end at the bisector plane of the break, each takes half of the other\'s look near it, and they meet at the same look', () => {
  const A = line(-100, 0, 0, 0), B = line(0, 0, 100, 0), rows = (r) => (r === 1 ? { pts: B, rad: radOf(B, 6) } : { pts: A, rad: radOf(A, 6) });
  const a = (p) => joinEndJS({ vI: 60, vEnd: [-1, endContinues(1, 0)], p, R: 6, px: PX, own: { pts: A }, rows });
  const b = (p) => joinEndJS({ vI: 3, vEnd: [endContinues(0, 63), -1], p, R: 6, px: PX, own: { pts: B }, rows });
  assert.equal(a([-5, 2]).drop, false); assert.equal(a([5, 2]).drop, true, 'A drops what lies beyond the plane x = 0');
  assert.equal(b([5, 2]).drop, false); assert.equal(b([-5, 2]).drop, true, 'B drops what lies before it');
  assert.equal(a([JOIN_CUT * PX * 0.5, 0]).drop, false, 'a hair past the plane both still draw: no gap');
  assert.equal(b([-JOIN_CUT * PX * 0.5, 0]).drop, false);
  // at the plane each takes half of the other's look: the two meet at the mean
  assert.ok(Math.abs(a([0, 0]).w - 0.5) < 1e-9 && Math.abs(b([0, 0]).w - 0.5) < 1e-9);
  assert.equal(a([0, 0]).row, 1); assert.equal(b([0, 0]).row, 0);
  assert.equal(a([0, 0]).u, 0); assert.equal(b([0, 0]).u, 1);
  assert.equal(a([-JOIN_W * 6 - 0.1, 0]).w, 0, 'farther than the blend from the plane: its own');
  // opacities: A is 0.3, B is 1: at the plane both are joinMix(own, other, 0.5) = 0.65
  assert.ok(Math.abs(joinMix(0.3, 1, a([0, 0]).w) - 0.65) < 1e-9 && Math.abs(joinMix(1, 0.3, b([0, 0]).w) - 0.65) < 1e-9);
  // a bend: the plane tilts to the bisector, and a pixel on the plane is on neither side's drop
  const B2 = line(0, 0, 70.7, 70.7), rows2 = (r) => (r === 1 ? { pts: B2, rad: radOf(B2, 6) } : { pts: A, rad: radOf(A, 6) });
  const a2 = (p) => joinEndJS({ vI: 60, vEnd: [-1, endContinues(1, 0)], p, R: 6, px: PX, own: { pts: A }, rows: rows2 });
  // outward A = (1, 0); outward B (from its end toward its start... the partner's own outward, B2's start pointing back) = (-0.707, -0.707): m = (1.707, 0.707)
  const mx = 1.707, my = 0.707, ml = Math.hypot(mx, my);
  const onPlane = [-my / ml * 3, mx / ml * 3];   // 3 along the plane
  assert.equal(a2(onPlane).drop, false);
  assert.equal(a2([onPlane[0] + mx / ml * 2, onPlane[1] + my / ml * 2]).drop, true, 'beyond the tilted plane');
});

test('the opacity the shaders give a pixel: joinMix, and the factor over its own with the floor', () => {
  assert.equal(joinMix(0.2, 1, 0), 0.2); assert.equal(joinMix(0.2, 1, 1), 1); assert.ok(Math.abs(joinMix(0.2, 1, 0.5) - 0.6) < 1e-12);
  assert.ok(Math.abs(joinRatio(0.5, 0.25, 1) - 0.5) < 1e-12);
  assert.equal(joinRatio(0, 1, 1), 1000, 'an invisible row cannot be lit by a ratio: the floor 1e-3');
});

test('the GLSL: lints (given the shader\'s own surroundings), reads the end window, the packing and the plane as the twin does', () => {
  const g = tubeJoinGLSL(64);
  const env = `#version 300 es
precision highp float;
uniform highp sampler2D rad;
uniform float netAlpha;
uniform float tierAlpha[8];
uniform int tierGroup[8];
vec2 PT(int id, int i) { return vec2(float(id), float(i)); }
void vesAttrs(int id, float u, float u2, vec2 p, float occl, out float aTier, out float aZ, out float aFlag, out float aWall, out float aOf, out vec3 aCol, out float aHov, out float aSel, out vec3 aEdge, out float aA) { aTier = 0.0; aZ = 0.0; aFlag = 0.0; aWall = 0.0; aOf = 0.0; aCol = vec3(0.0); aHov = 0.0; aSel = 0.0; aEdge = vec3(0.0); aA = 1.0; }
${g}
void main() {}
`;
  assert.deepEqual(lintGLSL(env), []);
  assert.match(g, /float e = vI < 8\.0 \? vEnd\.x : vI > 55\.0 \? vEnd\.y : -1\.0;/);
  assert.match(g, /int tr = e \/ 64, sm = e % 64;/);
  assert.match(g, /int k = int\(-e \+ 0\.5\) - 2;/, 'a continuation: -(2 + row * 64 + sample)');
  assert.match(g, /if \(gap < -0\.5 \* px\) \{ j\.drop = true; return j; \}/);
  assert.ok(g.includes(`if (s > ${JOIN_CUT} * px) { j.drop = true; return j; }`));
  assert.ok(g.includes(`j.w = 1.0 - smoothstep(0.0, ${JOIN_W} * R, gap);`));
  assert.ok(g.includes(`j.w = 0.5 * (1.0 - smoothstep(0.0, ${JOIN_W} * R, -s));`));
  assert.throws(() => tubeJoinGLSL(32), /N_SAMPLES|64/);
});
