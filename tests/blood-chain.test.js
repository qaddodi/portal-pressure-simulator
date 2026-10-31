// Parcels and arrowheads carried through junctions (combined plan B1 + C1): blood.js createStreamChain, its wiring in stage.js
// (chainRows, ?bloodchain=0) and the composite's use of it (veins-gl.js). No GL in node: the chain's numbers are checked here,
// the shader as source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chainParents, createStreamChain, CHAIN_NEAR, CHAIN_RATIO } from '../src/ui/blood.js';

// A trunk T (node a → b), a branch run-on C (b → c) and its own run-on G (c → d); a minor inflow M into b.
const item = (key, up, down, m, q, len, upPt = [0, 0], downPt = [0, 0], fwd = true) => ({ key, up, down, m, q, upPt, downPt, s0: fwd ? 0 : len, sj: fwd ? len : 0 });
const net = (mT = 30, mC = 40, mG = 25, mM = 20) => [
  item(1, 'a', 'b', mT, 10, 200, [0, 0], [200, 0]),
  item(2, 'b', 'c', mC, 9, 150, [200, 0], [350, 0]),
  item(3, 'c', 'd', mG, 9, 120, [350, 0], [470, 0]),
  item(4, 'e', 'b', mM, 3, 80, [200, 80], [201, 2]),
];
// The pattern's coordinate (in the root's arc) at arc s of item i: A + B s.
const at = (c, i, s) => c.A[i] + c.B[i] * s;

test('the parent is the largest inflow ending where the vessel begins, with the drawn ends together', () => {
  const it = net();
  assert.deepEqual([...chainParents(it)], [-1, 0, 1, -1]);
  // The minor inflow takes over only when it carries more.
  it[3].q = 12;
  assert.deepEqual([...chainParents(it)], [-1, 3, 1, -1]);
  // Ends apart (beyond CHAIN_NEAR) are not one junction; a vessel that cannot chain (m = 0) has no parent and is none.
  const far = net(); far[0].downPt = [200 + CHAIN_NEAR, 0];
  assert.equal(chainParents(far)[1], 3);
  const still = net(); still[1].m = 0;
  assert.deepEqual([...chainParents(still)], [-1, -1, -1, -1]);
});

test('at every junction the vessel shows exactly what its parent shows there, frame after frame, while speeds change', () => {
  const c = createStreamChain();
  let mT = 30, mC = 40, mG = 25;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let f = 0; f < 1000; f++) {
    // Speeds wander, within the ratios that chain (and hold for the last 150 frames).
    if (f < 850) mT = Math.max(12, Math.min(60, mT * (1 + (rnd() - 0.5) * 0.06)));
    if (f < 850) mC = Math.max(mT / CHAIN_RATIO * 1.05, Math.min(mT * CHAIN_RATIO * 0.95, mC * (1 + (rnd() - 0.5) * 0.06)));
    if (f < 850) mG = Math.max(mC / CHAIN_RATIO * 1.05, Math.min(mC * CHAIN_RATIO * 0.95, mG * (1 + (rnd() - 0.5) * 0.06)));
    const it = net(mT, mC, mG);
    c.step(it, 0.1, 0.05);
    assert.equal(c.w[1], 1); assert.equal(c.w[2], 1);
    assert.equal(c.root[1], 1); assert.equal(c.root[2], 1, 'the run-on of a run-on is drawn from the same root');
    assert.equal(c.A[0], 0); assert.equal(c.B[0], 1);
    // Trunk's end and branch's start; branch's end and its run-on's start: the same point of the pattern (a tenth of a slot is
    // 0.7 world units; this is exact but for rounding).
    assert.ok(Math.abs(at(c, 1, 0) - at(c, 0, 200)) < 1e-9);
    assert.ok(Math.abs(at(c, 2, 0) - at(c, 1, 150)) < 1e-9);
    // Along the branch the pattern runs at the branch's own speed: its B eases toward the root's speed over its own.
    if (f > 990) { assert.ok(Math.abs(c.B[1] - mT / mC) < 1e-3); assert.ok(Math.abs(c.B[2] - mT / mG) < 1e-3); }
  }
});

test('a parcel at the junction is the same parcel on both sides, whatever the lane and the time', () => {
  const c = createStreamChain();
  const it = net();
  for (let f = 0; f < 50; f++) c.step(it, 1, 1);
  // The shader's streak coordinate along a lane of speed k/8: (A + B s − D k / 8) / cell. Same root D on both sides.
  for (const D of [0, 13.7, 5000.25]) for (const k of [2, 8, 16]) {
    const xT = (at(c, 0, 200) - (D * k) / 8) / 35.84, xC = (at(c, 1, 0) - (D * k) / 8) / 35.84;
    assert.ok(Math.abs(xT - xC) < 1e-9);
  }
  // Reversed: a vessel drawn from its far end (s0 = its length, shown flow toward s = 0).
  const r = createStreamChain(), rev = net();
  rev[1] = item(2, 'b', 'c', -40, 9, 150, [200, 0], [350, 0], false);
  r.step(rev, 1, 1);
  assert.equal(r.w[1], 1);
  assert.ok(Math.abs(at(r, 1, 150) - at(r, 0, 200)) < 1e-9);
  assert.ok(r.B[1] < 0, 'B carries the direction: the pattern runs toward s = 0 along it');
});

test('a link changes parent by easing down, switching, easing up: never a jump in what is drawn', () => {
  const c = createStreamChain();
  const it = net();
  c.step(it, 0.2, 0.2);
  assert.equal(c.par[1], 1);
  it[3].q = 12;   // the other inflow now carries more
  let last = c.w[1], sawZero = false;
  for (let f = 0; f < 200; f++) {
    c.step(it, 0.2, 0.2);
    const w = c.w[1];
    if (!sawZero) {
      // Still on the old parent while it lets go, its mapping unchanged.
      if (w > 0) { assert.equal(c.par[1], 1); assert.ok(w <= last); }
      if (w === 0) sawZero = true;
    } else if (w > 0) { assert.equal(c.par[1], 4); assert.ok(w >= last); }
    last = w;
  }
  assert.ok(sawZero);
  assert.equal(c.w[1], 1); assert.equal(c.par[1], 4);
  assert.ok(Math.abs(at(c, 1, 0) - at(c, 3, 80)) < 1e-9);
});

test('a vessel some child is drawn through keeps its link until that child has let go', () => {
  const c = createStreamChain();
  const it = net().slice(0, 3);   // (no other inflow the branch could take up instead)
  c.step(it, 1, 1);
  assert.equal(c.root[2], 1);
  it[0].m = 0;   // the trunk stops: the branch's link ends, and its run-on lets go of the trunk's pattern first
  c.step(it, 0.3, 0.3);
  for (let f = 0; f < 200; f++) {
    c.step(it, 0.3, 0.3);
    // While the run-on is still drawn from the trunk through the branch, the branch's own mapping holds.
    if (c.w[2] > 0 && c.root[2] === 1) assert.equal(c.par[1] === -1 ? 1 : c.root[1], 1);
  }
  assert.equal(c.w[1], 0);
  assert.equal(c.root[2], 2, 'the run-on now draws the branch’s own pattern');
  assert.equal(c.w[2], 1);
});

test('speed ratios beyond CHAIN_RATIO do not chain', () => {
  const c = createStreamChain();
  c.step(net(30, 30 * CHAIN_RATIO * 1.1, 25), 1, 1);
  assert.equal(c.w[1], 0);
  assert.equal(c.par[1], -1);
});

test('the ends: a chained end carries the weight, the minor inflow at that node minus it', () => {
  const c = createStreamChain();
  c.step(net(), 1, 1);
  assert.equal(c.et[0], 1, 'the trunk runs on through its end');
  assert.equal(c.ef[1], 1, 'and the branch from its start');
  assert.equal(c.et[3], -1, 'the minor inflow');
  assert.equal(c.ef[0], 0);
});

test('a vessel drawn again after it went starts afresh, with no ease', () => {
  const c = createStreamChain();
  c.step(net(), 1, 1);
  const short = net().filter((x) => x.key !== 2);
  c.step(short, 0.1, 0.1);
  c.step(short, 0.1, 0.1);
  c.step(net(), 0.1, 0.1);
  assert.equal(c.w[1], 1);
});

const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');

test('stage: ?bloodchain=0 turns it off; the links are written into the rows put() filled, by the model\'s mean speeds', () => {
  assert.match(stage, /const BLOOD_CHAIN = !\(typeof location !== 'undefined' && \/\[\?&\]bloodchain=0\\b\/\.test\(location\.search\)\);/);
  assert.match(stage, /if \(on && BLOOD_CHAIN\) chainRows\(/);
  const fn = stage.slice(stage.indexOf('function chainRows('), stage.indexOf('function stepBlood('));
  assert.match(fn, /it\.m = displaySpeed\(sg \* Math\.max\(0, sg \* velQf\[k\]\)\);/);
  assert.match(fn, /flowData\[o \+ 15\] = c\.par\[i\] \+ 1;/);
  assert.match(fn, /flowData\[o \+ 16\] = c\.root\[i\] \+ 1; flowData\[o \+ 17\] = c\.A\[i\]; flowData\[o \+ 18\] = c\.B\[i\]; flowData\[o \+ 19\] = w;/);
  assert.match(fn, /flowData\[o \+ 20\] = rs\.D; flowData\[o \+ 21\] = rs\.drift \|\| 0;/);
  assert.match(fn, /NO_CHAIN\.has\(x\.e\.id\)/);
  // (After the rows are filled and before they go up.)
  assert.ok(stage.indexOf('if (on && BLOOD_CHAIN) chainRows(') < stage.indexOf('const retired = retireRows(flowData, flowWas, flowNow, FLOW_TEXELS * 4);'));
});

test('composite: with nothing chained, the streaks, the heads and the join are drawn as before', () => {
  assert.match(gl, /export const FLOW_TEXELS = 6;/);
  // The own pattern only while the link's weight is below 1, the root's only above 0.
  assert.match(gl, /if \(cw < 1\.0\) \{\n\s*nz = shimN\(id, s, qy, D, k0, t, sA, drift, zoomB\.x, 1\.0\);/);
  assert.match(gl, /if \(cw < 1\.0\) c = chevOne\(id, s, y, f0, f1, len, Rs, R, s, 1\.0, f0\.x, R, ch5\.zw\);/);
  // Unchained ends fade as before.
  assert.match(gl, /if \(ends\.x <= 0\.0 && ends\.y <= 0\.0\) \{\n\s*float e = min\(sc, len - sc\);\n\s*if \(e < lo\) return vec2\(0\.0\);\n\s*endF = smoothstep\(lo, lo \+ ramp, e\);/);
  // The join: 0.6 as before with rel and mn both 0; 0.3 for the minor inflow; none where one pattern runs through.
  assert.match(gl, /float dimK = mix\(mix\(0\.6, 0\.3, mn\), 0\.0, rel\);\n\s*float a = A\.a \* \(1\.0 - dimK \* smoothstep\(0\.02, 0\.5, b\)\);/);
  assert.match(gl, /c \*= 1\.0 - smoothstep\(0\.02, 0\.25, b\) \* \(1\.0 - rel\);/);
  // A root's noise block is built even when the root itself does not stream.
  assert.match(gl, /const needs = \(r\) => streams\(data, stride, r\) \|\| rootOf\[r\] === 1;/);
});
