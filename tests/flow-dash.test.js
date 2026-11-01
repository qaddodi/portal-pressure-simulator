import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arcTable, pointAt, chevSpacing, chevHalfWidth, laneSpeed, laneFrames, inHole, rateMoved } from '../src/ui/flow-dash.js';
import { flowClose, FLOW_FIXED } from '../src/ui/flow-rows.js';

const pts = [[0, 0], [100, 0], [100, 100]];
const cum = arcTable(pts);

test('arc length and points along a course', () => {
  assert.equal(cum[2], 200);
  const p = pointAt(pts, cum, 150);
  assert.deepEqual([p.x, p.y], [100, 50]);
  assert.ok(Math.abs(p.ang - Math.PI / 2) < 1e-9);
});

test('heads keep the canvas spacing (power-of-two multiples of 28, 2.5 times wider: fc4b9c6a)', () => {
  for (const [R, sc, dpr] of [[3, 1, 1], [3, 2, 2], [8, 4, 2], [1, 0.5, 1]]) {
    const P = chevSpacing(R, sc, dpr);
    assert.ok(Number.isInteger(Math.log2(P / 28)), `${P}`);
    // At least the canvas's floor before the widening: 3.6 calibers and 60 device px, times 2.5 (within one doubling).
    const floor = Math.max(3.6 * R, 60 / (sc * dpr), 28) * 2.5;
    assert.ok(P >= floor / 2 && P <= floor * 2, `${P} vs ${floor}`);
  }
  const hw = chevHalfWidth(10, 1);
  assert.ok(hw >= 4 && hw <= 8);
  assert.ok(chevHalfWidth(1, 1) <= 0.8);   // never past 0.8 of a thin vessel's caliber
});

test('lanes run at the laminar speed: twice the mean on the axis, slower out toward the wall', () => {
  assert.equal(laneSpeed(0), 2);
  assert.ok(laneSpeed(0.5) < 2 && laneSpeed(0.5) > 1);
  assert.ok(laneSpeed(1) >= 0.25);
});

test('keyframes move at constant speed, hide past the end and where unseen, and fade at the ends', () => {
  const f = laneFrames(pts, cum, { len: 200, loop: 240, step: 5, radius: () => 4, size: 4, ramp: 10, seen: (s) => (s > 120 && s < 140 ? 0 : 1) });
  assert.equal(f[0].offset, 0);
  assert.equal(f[f.length - 1].offset, 1);
  for (let i = 1; i < f.length; i++) assert.ok(Math.abs(f[i].offset - f[i - 1].offset - 1 / (f.length - 1)) < 1e-9);
  const at = (s) => f[Math.round((s / 240) * (f.length - 1))];
  assert.equal(at(0).opacity, 0);
  assert.equal(at(60).opacity, 1);
  assert.equal(at(130).opacity, 0);
  assert.equal(at(220).opacity, 0);   // past the vessel's end: the loop's hidden stretch
  assert.match(at(60).transform, /^translate\(60\.00px, 0\.00px\) rotate\(0\.00deg\)/);
});

test('no head under a reading box or a point callout', () => {
  assert.equal(inHole(5, 5, [[0, 0, 10, 10]]), true);
  assert.equal(inHole(15, 5, [[0, 0, 10, 10]]), false);
  assert.equal(inHole(0, 4, [], [[0, 0, 10, 0, -5]]), true);   // within 5 of a leader
  assert.equal(inHole(0, 20, [], [[0, 0, 0, 0, 17]]), false);
});

test('a rate is sent again only when it moves by 5 % or turns (each change goes to the compositor again)', () => {
  assert.equal(rateMoved(null, 1), true);
  assert.equal(rateMoved(10, 10.4), false);
  assert.equal(rateMoved(10, 10.6), true);
  assert.equal(rateMoved(1, -1), true);
});

test('a still blood table within a hundredth is the same picture; distances must hold to 0.001', () => {
  const stride = 24, a = new Float32Array(stride * 2).fill(5);
  const b = Float32Array.from(a);
  b[1] = 5.04;   // vd within 1 %
  assert.equal(flowClose(b, a, stride, 2), true);
  b[1] = 5.2;
  assert.equal(flowClose(b, a, stride, 2), false);
  const c = Float32Array.from(a);
  c[0] = 5.01;   // the stream's distance: a shift of the streaks
  assert.equal(FLOW_FIXED[0], 1);
  assert.equal(flowClose(c, a, stride, 2), false);
  assert.equal(flowClose(a, null, stride, 2), false);
});

test('stage: today\'s moving blood stays the default; ?flow=dashes stills the canvas streams and its heads', () => {
  const src = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(src, /const FLOW_DASH = typeof location !== 'undefined' && \/\[\?&\]flow=dashes\\b\/\.test\(location\.search\);/);
  assert.match(src, /const moving = st\.running && !reduceMotion\.matches && !dashes;/);
  assert.match(src, /const still = st\.running && \(reduceMotion\.matches \|\| dashes\);/);
  assert.match(src, /tC = chevOn\(\) && !cath\.st && !dashes \? 1 : 0/);
  // Reduce Motion keeps the still flow: no dashes then.
  assert.match(src, /const dashMode = \(\) => !!flowDash && !reduceMotion\.matches;/);
  // A frame that would show the same picture is not drawn, nor counted.
  assert.match(src, /veins\.composite\(vLook, bloodLook\(\), fluidMoved\) !== false\) \{ noteDraw\('stage'\)/);
  const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /if \(still && !fused && !part && !dirt && !pool && !\(fl\?\.ripple && nFluid\) && !cath && figVer === figAt && !moved\.includes\(1\)\) \{/);
});

test('stage: dashes are not rebuilt on every geometry bump, and stay few', () => {
  const src = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  const key = /function dashKey\(\) \{[\s\S]*?\n {2}\}/.exec(src)[0];
  assert.ok(!key.includes('geometryVersion'), 'a coiling varix bumps geometryVersion every frame: it rebuilt every dash a frame');
  assert.ok(!key.includes('vdpr'), 'the canvas share changes while the view moves');
  assert.match(src, /const DASH_MAX = 90;/);
  assert.match(src, /if \(!force && F === dashFlowF && running === dashFlowRun && now - dashFlowAt < 250\) return;/);
});

test('reversed flow runs the keyframes backwards at a positive rate, from a small time (no huge offsets, no negative rate)', async () => {
  const { revFrames } = await import('../src/ui/flow-dash.js');
  const f = [{ offset: 0, transform: 'a', opacity: 0 }, { offset: 0.25, transform: 'b', opacity: 1 }, { offset: 1, transform: 'c', opacity: 0 }];
  const r = revFrames(f);
  assert.deepEqual(r.map((x) => [x.offset, x.transform]), [[0, 'c'], [0.75, 'b'], [1, 'a']]);
  assert.equal(revFrames(f), r);   // (kept: one copy per course)
  const src = readFileSync(new URL('../src/ui/flow-dash.js', import.meta.url), 'utf8');
  assert.ok(!/LOOPS/.test(src));
  assert.match(src, /setRate\(mk, Math\.abs\(f\.v\) \* mk\.lane\)/);
});

test('the head is cut from boxes (clip-path), no SVG: its rim is its outline grown outward, a sharp tip held to twice the rim', async () => {
  const { grow } = await import('../src/ui/flow-dash.js');
  const head = [[11, 0], [-9, 4], [-2.6, 0], [-9, -4]], g = grow(head, 0.6);
  assert.ok(g[0][0] > 11 && g[0][0] <= 11 + 1.2 + 1e-9, 'the tip moves out, no further than 2 d');
  assert.ok(g[2][0] < -2.6, 'the notch moves out too (back, away from the ink)');
  assert.ok(Math.abs(g[1][1]) > 4 && Math.abs(g[3][1]) > 4, 'the wings move out');
  const src = (await import('node:fs')).readFileSync(new URL('../src/ui/flow-dash.js', import.meta.url), 'utf8');
  assert.ok(!/<svg|<path/.test(src), 'no SVG markup');
});
