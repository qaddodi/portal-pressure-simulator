// The vector renderer's blood material (workstream D, docs/recommendations/vector-renderer-plan.md section 5.3 and the acceptance list of
// section 11): the arithmetic that can be judged without a GPU (vec-blood-math.js, run with blood.js's own stream), and the shader text as
// the GPU gets it (src/ui/vec-blood-glsl.js: lint, the uniforms, the entry points, the rules that keep it valid in any control flow).
import test from 'node:test';
import assert from 'node:assert/strict';
import { lintGLSL, uniformsOf } from './glsl-lint.js';

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

const M = await import('../src/ui/vec-blood-math.js');
const G = await import('../src/ui/vec-blood-glsl.js');
const { advanceStream, createStreamChain, REVERSE_HOLD, REVERSE_RAMP, REVERSE_SETTLE, PERIOD } = await import('../src/ui/blood.js');
const { LANE_K: GL_LANE_K, ORIGIN_GREY } = await import('../src/ui/veins-gl.js');

// ── The stream, run as the app runs it: blood.js advanceStream, the anchors the CPU keeps, the GPU's distance on the blood clock ──
const BT_SPAN = 32;
const newStream = (seed = 1) => ({ seed, vSlow: NaN, vFast: NaN, D: 0.5, hold: 0.5, settle: 0.5, vOld: 0.5, vm: NaN, v: 0.5, vd: 0.5, stasis: 0.5, drift: 0.5, aB: NaN, aA: 0, vp: 0, aD: 0.5, aV: 0.5, aT: 0.5, aS: 0.5, aR: 0.5 });
/**
 * frames of dt seconds. plan(t) → { vMean, vNow, rev } the model's flow now. Returns per frame { t, bT, shown (the GPU's distance this
 * frame), vd, reset, anchored (a new anchor was written), before (the old anchor's distance at this clock, when there was one) }.
 */
function run({ frames, dt = 1 / 60, plan, speed = 0.8, phasic = false, seed = 1 }) {
  const sm = newStream(seed), so = { phasic, speed, large: true, still: false, rev: false, dt, bt: 0 };
  let clock = 0, epoch = 0, prev = null;
  const out = [];
  for (let f = 0; f < frames; f++) {
    clock += dt;
    const reset = clock < epoch || clock - epoch > BT_SPAN;
    if (reset) epoch = clock;
    const bT = clock - epoch;
    const { vMean, vNow, rev } = plan(clock);
    so.rev = rev; so.dt = dt; so.bt = bT; so.phasic = phasic;
    advanceStream(sm, vMean, vNow, dt, { phasic, speed, large: true, still: false, rev, dt });
    const aBefore = prev;
    M.anchorStream(sm, so, reset);
    const a = M.anchorOf(sm);
    const anchored = !prev || prev.B0 !== a.B0 || prev.D !== a.D || prev.vd !== a.vd;
    out.push({ t: clock, bT, shown: M.streamDistance(a, bT), vd: sm.vd, reset, anchored, before: aBefore && !reset ? M.streamDistance(aBefore, bT) : null, sm: { ...sm } });
    prev = { ...a };
  }
  return out;
}
const sorted = (xs) => xs.every((x, i) => i === 0 || x >= xs[i - 1]);

test('the distance is continuous through a speed step, a beat, a re-anchor and a reversal, and never jumps', () => {
  // 70 s: a flow that steps from 10 to 22 cm/s at 6 s, beats (phasic) throughout, turns round at 20 s for 8 s, runs past the 32 s epoch twice.
  const plan = (t) => {
    const base = t < 6 ? 10 : 22;
    const rev = t >= 20 && t < 28;
    const vMean = rev ? -base : base;
    return { vMean, vNow: vMean * (1 + 0.4 * Math.sin(2 * Math.PI * 1.2 * t)), rev };
  };
  const dt = 1 / 60, fr = run({ frames: 4200, dt, plan, phasic: true });
  assert.ok(fr.filter((f) => f.reset).length >= 2, 'the blood clock moved its epoch (a re-anchor of every stream) at least twice');
  let steps = 0;
  for (let k = 1; k < fr.length; k++) {
    const d = M.circDiff(fr[k - 1].shown, fr[k].shown);
    const bound = Math.max(Math.abs(fr[k - 1].vd), Math.abs(fr[k].vd)) * 0.8 * dt * 1.5 + 0.02;
    assert.ok(Math.abs(d) <= bound, `frame ${k} (t=${fr[k].t.toFixed(2)}): moved ${d.toFixed(4)} but at most ${bound.toFixed(4)} is the speed`);
    if (fr[k].anchored) steps++;
    // A new anchor starts where the old one stood at that same clock: no jump, only a change of speed.
    if (fr[k].before != null && fr[k].anchored) assert.ok(Math.abs(M.circDiff(fr[k].before, fr[k].shown)) < 1e-6, `frame ${k}: a re-anchor must start where the old anchor stood`);
  }
  assert.ok(steps > 20, 'the speed step, the beat and the reversal each wrote anchors');
  // The CPU's own distance never parts from the GPU's: they are the same number at the anchor.
  for (const f of fr) assert.ok(Math.abs(M.circDiff(f.sm.D, f.shown)) < 1e-3, 'the stream distance the CPU keeps is the one the GPU shows');
});

test('through a reversal the blood settles, stands still for the hold, then runs the other way', () => {
  const plan = (t) => { const rev = t >= 10 && t < 30; return { vMean: rev ? -12 : 12, vNow: rev ? -12 : 12, rev }; };
  const dt = 1 / 60, fr = run({ frames: 2400, dt, plan });
  const at = (t) => fr[Math.round(t / dt) - 1];
  assert.ok(M.circDiff(at(9).shown, at(9.9).shown) > 1, 'before: running forward');
  // Standing: a stretch at least REVERSE_HOLD long (less a few frames) with the distance not moving.
  let run0 = 0, best = 0;
  for (let k = 1; k < fr.length; k++) {
    if (fr[k].t > 10 && fr[k].t < 14 && Math.abs(M.circDiff(fr[k - 1].shown, fr[k].shown)) < 1e-3) { run0++; best = Math.max(best, run0); } else run0 = 0;
  }
  assert.ok(best * dt >= REVERSE_HOLD * 0.8, `stood still ${(best * dt).toFixed(2)} s, expected about ${REVERSE_HOLD} s`);
  assert.ok(M.circDiff(at(20).shown, at(21).shown) < -1, 'afterwards: running the other way');
  // And back again when the flow turns round once more, with no step.
  assert.ok(M.circDiff(at(34).shown, at(35).shown) > 1);
  assert.ok(REVERSE_SETTLE > 0 && REVERSE_RAMP > 0);
});

test('a speed step of the model alone moves the distance smoothly (the beat-filtered mean eases, the slope is integrated on the GPU)', () => {
  const plan = (t) => ({ vMean: t < 4 ? 8 : 40, vNow: t < 4 ? 8 : 40, rev: false });
  const dt = 1 / 60, fr = run({ frames: 900, dt, plan });
  let maxJerk = 0;
  for (let k = 2; k < fr.length; k++) {
    const a = M.circDiff(fr[k - 2].shown, fr[k - 1].shown), b = M.circDiff(fr[k - 1].shown, fr[k].shown);
    maxJerk = Math.max(maxJerk, Math.abs(b - a));
  }
  assert.ok(maxJerk < 0.2, `the per-frame step changes by at most ${maxJerk.toFixed(3)} world units`);
});

test('the speed path reads no drawn radius: the distance, the drift and the anchor take only the model\'s velocity and the clock', () => {
  const allowed = new Set(['D', 'vd', 'stasis', 'dr', 'B0', 'k', 'slope', 'aB', 'aD', 'aV', 'aT', 'aS', 'aA', 'aR', 'vp', 'drift', 'speed', 'bt', 'dt']);
  const seen = new Set();
  const spy = (o) => new Proxy(o, { get(t, p) { if (typeof p === 'string') seen.add(p); return t[p]; }, set(t, p, v) { if (typeof p === 'string') seen.add(p); t[p] = v; return true; } });
  const a = spy({ D: 10, vd: 5, stasis: 0.2, dr: 3, B0: 0, k: 0.8, slope: 1 });
  M.streamDistance(a, 2.5); M.streamDrift(a, 2.5);
  const sm = spy({ ...newStream(), aB: 0, aD: 1, aV: 4, aA: 0, aS: 0.8, aT: 0, aR: 0, D: 1, vd: 4, stasis: 0, vp: 4, drift: 0 });
  M.anchorStream(sm, spy({ speed: 0.8, bt: 1, dt: 1 / 60 }), false);
  for (const p of seen) assert.ok(allowed.has(p), `the speed path touched "${p}"`);
  // The same on the GPU: the three functions that move a stream (flowD, flowDrift, rootDD) in the text read the flow texels and the clock only.
  const body = (name) => { const m = new RegExp(`(?:float|vec2) ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`).exec(G.VEC_BLOOD_GLSL); assert.ok(m, `${name} is in the text`); return m[1]; };
  for (const n of ['vbFlowD', 'vbFlowDrift', 'vbRootDD']) {
    const b = body(n);
    assert.ok(!/\brad\b|radAt|\bR\b|\bpx\b|\bpxw\b|inv\b|world\b/i.test(b.replace(/\/\/.*$/gm, '')), `${n} reads a radius, the zoom or the camera`);
    assert.ok(/vbFlow|vbBT/.test(b), `${n} reads the flow texels and the blood clock`);
  }
});

test('a camera change leaves (s, y) and the pattern\'s coordinates for a world point unchanged', () => {
  // A curved vessel (a polyline) and its caliber; (s, y) of a world point is read from the geometry alone.
  const poly = Array.from({ length: 64 }, (_, i) => [i * 6, 40 * Math.sin(i / 9)]);
  const R = 9;
  const project = (p) => {
    let best = null, acc = 0;
    for (let i = 0; i < poly.length - 1; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[i + 1], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
      const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (L * L)));
      const qx = ax + dx * t, qy = ay + dy * t, d = Math.hypot(p[0] - qx, p[1] - qy);
      if (!best || d < best.d) best = { d, s: acc + t * L, y: ((p[0] - qx) * -dy + (p[1] - qy) * dx) / (L * R) };
      acc += L;
    }
    return best;
  };
  const world = [[100, 20], [180, 38], [250, -30], [300, 5]];
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ref = world.map((w) => project(w));
  for (let c = 0; c < 40; c++) {
    // A random camera: scale, turn, offset (device pixels ← world); the pixel the point lands on, read back to the world through the inverse.
    const k = 0.3 + rnd() * 6, th = rnd() * 6.28, ex = rnd() * 900, ey = rnd() * 600;
    const toPx = (w) => [k * (Math.cos(th) * w[0] - Math.sin(th) * w[1]) + ex, k * (Math.sin(th) * w[0] + Math.cos(th) * w[1]) + ey];
    const toWorld = (p) => { const x = (p[0] - ex) / k, y = (p[1] - ey) / k; return [Math.cos(th) * x + Math.sin(th) * y, -Math.sin(th) * x + Math.cos(th) * y]; };
    const px = 1 / k;   // world units per device pixel
    const zn = M.zoomNumbers(px);
    world.forEach((w, i) => {
      const r = project(toWorld(toPx(w)));
      assert.ok(Math.abs(r.s - ref[i].s) < 1e-6 && Math.abs(r.y - ref[i].y) < 1e-6, 'the coordinates are the geometry\'s, whatever the camera');
      // The pattern reads at two world-fixed cell sizes (cross-faded by lf with the zoom): a cell is one of 35.84 · 2^k, never a size that follows the zoom.
      for (const cell of [zn.cellA, zn.cellB]) assert.ok(Number.isInteger(Math.round(Math.log2(cell / 35.84) * 1e6) / 1e6), `cell ${cell} is a world-fixed scale`);
      const ph = M.patternPhases(r.s, 1234.5, Math.abs(r.y), zn.cellA, 0.3), ph0 = M.patternPhases(ref[i].s, 1234.5, Math.abs(ref[i].y), zn.cellA, 0.3);
      assert.ok(Math.abs(ph.u0 - ph0.u0) < 1e-6 && Math.abs(ph.u1 - ph0.u1) < 1e-6, 'the same world point reads the same pattern');
    });
  }
  // Within a zoom band the cell sizes do not move at all.
  const a = M.zoomNumbers(1.1), b = M.zoomNumbers(1.4);
  assert.equal(a.cellA, b.cellA); assert.equal(a.cellB, b.cellB);
});

test('streaks run on through a join: a chained vessel reads its root\'s pattern at the same point of the pattern, whatever the lane and the time', () => {
  const item = (key, up, down, m, q, len, upPt, downPt) => ({ key, up, down, m, q, upPt, downPt, s0: 0, sj: len });
  const c = createStreamChain();
  const it = [item(1, 'a', 'b', 30, 10, 200, [0, 0], [200, 0]), item(2, 'b', 'c', 40, 9, 150, [200, 0], [350, 0])];
  for (let f = 0; f < 60; f++) c.step(it, 1, 1);
  const cell = 35.84;
  for (const D of [0, 13.7, 5000.25]) for (const ay of [0, 0.4, 0.9]) {
    // The trunk at its end (arc 200) and the branch at its start (arc 0, read in the root's arc se = A + B s).
    const t = M.patternPhases(200, D, ay, cell, 1.5), b = M.patternPhases(M.chainArc(c.A[1], c.B[1], 0), D, ay, cell, 1.5);
    assert.ok(Math.abs(t.u0 - b.u0) < 1e-6 && Math.abs(t.u1 - b.u1) < 1e-6 && t.w0 === b.w0 && t.w1 === b.w1, 'the same parcel on both sides of the join');
  }
});

test('the junction\'s weights sum to 1, favour the member whose blood runs in, and swap smoothly with a reversal', () => {
  // A trunk coming in (flows toward the junction at its far end, vd > 0, nearEnd 1) and a branch going out (nearEnd 0, vd > 0 runs away).
  const w = (vdA, vdB, shares = [0.5, 0.5]) => M.mixWeights(shares, [vdA, vdB], [1, 0]);
  for (const sh of [[0.5, 0.5], [0.9, 0.1], [0.3, 0.7], [1, 0], [0, 0]]) for (const v of [-30, -3, -0.5, 0, 0.5, 3, 30]) {
    const x = w(v, v, sh);
    assert.ok(Math.abs(x[0] + x[1] - 1) < 1e-12, 'weights sum to 1');
    assert.ok(x[0] >= 0 && x[1] >= 0);
  }
  const fwd = w(20, 20), back = w(-20, -20);
  assert.ok(fwd[0] > fwd[1], 'the inflow member supplies the junction');
  assert.ok(back[1] > back[0], 'after a reversal the other supplies it');
  assert.ok(Math.abs(fwd[0] - back[1]) < 1e-12, 'the swap is exact');
  // Eased: sweeping the speed from forward to backward through zero, the weight moves monotonically and in small steps.
  let prev = w(20, 20)[0], maxStep = 0;
  for (let v = 20; v >= -20; v -= 0.01) {
    const x = w(v, v)[0];
    assert.ok(x <= prev + 1e-12, 'monotone');
    maxStep = Math.max(maxStep, Math.abs(prev - x)); prev = x;
  }
  assert.ok(maxStep < 0.01, `no jump in the weights (${maxStep})`);
  assert.ok(Math.abs(w(0, 0)[0] - 0.5) < 1e-9, 'at rest a symmetric junction mixes evenly');
  // The same through a real reversal of two streams (blood.js): the weights cross over at the moment the speed does, with no step.
  const A = newStream(1), B = newStream(2), dt = 1 / 60;
  let last = null, step = 0;
  for (let f = 0; f < 1800; f++) {
    const t = f * dt, rev = t >= 5;
    advanceStream(A, rev ? -10 : 10, rev ? -10 : 10, dt, { rev, dt });
    advanceStream(B, 10, 10, dt, { rev: false, dt });
    const x = M.mixWeights([0.5, 0.5], [A.vd, B.vd], [1, 1])[0];
    if (last != null) step = Math.max(step, Math.abs(x - last));
    last = x;
  }
  assert.ok(step < 0.05, `through a stream's reversal the weight moves at most ${step.toFixed(4)} a frame`);
});

test('the fine octave\'s weight falls smoothly to 0 as the footprint passes 1.5 texels: no step, and the shares and spread follow', () => {
  assert.equal(M.fineWeight(0), 1); assert.equal(M.fineWeight(0.5), 1); assert.equal(M.fineWeight(1.5), 0); assert.equal(M.fineWeight(9), 0);
  let prev = 1, maxStep = 0, prevS = null;
  for (let fp = 0; fp <= 8; fp += 0.001) {
    const w = M.fineWeight(fp);
    assert.ok(w <= prev + 1e-12, 'never rises with the footprint');
    maxStep = Math.max(maxStep, prev - w); prev = w;
    const q = M.attenuatedShares(M.SHARE_B, M.SHARE_F, fp);
    assert.ok(Math.abs(q.wb + q.wf - 1) < 1e-12, 'the shares sum to 1');
    if (prevS) { assert.ok(Math.abs(q.wb - prevS.wb) < 0.003 && Math.abs(q.spread - prevS.spread) < 0.003 && Math.abs(q.mean - prevS.mean) < 0.003, `smooth at ${fp.toFixed(3)}`); }
    prevS = { ...q };
  }
  assert.ok(maxStep < 0.0016, `the steepest step of the weight is ${maxStep}`);
  // Past 1.5 texels the fine octave is gone and the coarse one carries alone; beyond 6 the streaks are the lumen's mean.
  const q = M.attenuatedShares(M.SHARE_B, M.SHARE_F, 2);
  assert.equal(q.wf, 0); assert.equal(q.wb, 1);
  assert.equal(M.attenuatedNoise(0.9, 0.1, M.SHARE_B, M.SHARE_F, 7), 0.5);
  // At a footprint under half a texel (the whole ordinary zoom range) the noise is today's, exactly: 0.62 a + 0.38 b.
  assert.ok(Math.abs(M.attenuatedNoise(0.8, 0.3, M.SHARE_B, M.SHARE_F, 0.2) - (0.62 * 0.8 + 0.38 * 0.3)) < 1e-12);
  // The footprint at the zoom's own cell sizes stays near that range (under 0.75 texels up to 5 world units a pixel, where the fine octave keeps 97 %), so a normal pinch is untouched and only a far zoom-out attenuates.
  for (let px = 0.05; px < 5; px *= 1.05) { const z = M.zoomNumbers(px); assert.ok(M.footprintTexels(px, z.cellA) < 0.75, `px ${px.toFixed(3)}`); }
});

test('the shader text: lint, the uniforms the renderer core sets, the entry points B and C call, no derivative and no implicit-LOD read', () => {
  const HOST = '#version 300 es\nprecision highp float;\nprecision highp int;\nuniform highp sampler2D rad, tube;\nout vec4 o;\n';
  const main = `
void main() {
  int r[2] = int[2](0, 1); float s[2] = float[2](1.0, 2.0), y[2] = float[2](0.0, 0.1), R[2] = float[2](3.0, 3.0), w[2] = float[2](0.5, 0.5);
  vecBloodAt(vec2(1.0));
  o = vecBlood(0, 1.0, 0.0, 3.0, vec3(0.5), 0.5) + vecBloodMix(2, r, s, y, R, w, vec3(0.5), 0.5) + vecBleed(vec2(1.0), 0.5);
}`;
  const src = HOST + G.VEC_BLOOD_GLSL + main;
  assert.deepEqual(lintGLSL(src), [], 'the blood library lints');
  assert.deepEqual(lintGLSL(G.VEC_HEADS_VS()), [], 'the heads\' vertex shader lints');
  // The uniforms are exactly the declared list (and the host's rad and tube).
  assert.deepEqual([...uniformsOf(src)].sort(), ['rad', 'tube', ...G.VEC_BLOOD_UNIFORMS.map((u) => u.name)].sort());
  assert.equal(new Set(G.VEC_BLOOD_UNIFORMS.map((u) => u.name)).size, G.VEC_BLOOD_UNIFORMS.length, 'no uniform listed twice');
  // The published signatures.
  assert.ok(G.VEC_BLOOD_GLSL.includes('vec4 vecBlood(int row, float s, float y, float R, vec3 lumenCol, float px)'));
  assert.ok(G.VEC_BLOOD_GLSL.includes('vec4 vecBloodMix(int n, int rows[2], float s[2], float y[2], float R[2], float w[2], vec3 lumenCol, float px)'));
  const code = G.VEC_BLOOD_GLSL.replace(/\/\/.*$/gm, '');
  assert.ok(!/\b(dFdx|dFdy|fwidth)\b/.test(code), 'no screen-space derivative: the footprint is worked out from px (valid in any control flow)');
  assert.ok(!/\btexture\s*\(/.test(code), 'every texture read has an explicit level or gradient');
  assert.ok(!/^\s*#/m.test(code), 'no preprocessor directive (the lint does not follow them)');
  assert.ok(/textureGrad/.test(code), 'the tile is read with the footprint\'s gradients');
  assert.ok(!/gl_FragCoord|\binv\b|\bmat3\b/.test(code), 'no screen or camera matrix in the material: it reads the vessel\'s coordinates');
  // No flow image: the material reads the flow, tube, rad, bend and dye textures and the tile, never the lumen buffers.
  assert.ok(!/gbuf|usampler2D/.test(code), 'no full-resolution integer flow image');
  // The numbers the text holds are the module\'s own.
  assert.ok(code.includes(`smoothstep(${M.FINE_LO}, ${M.FINE_HI}, fp)`));
  assert.deepEqual(M.LANE_K, GL_LANE_K, 'the lane weights are the composite\'s');
  assert.equal(ORIGIN_GREY, 0.62); assert.ok(code.includes('const float VB_GREY = 0.62'));
});

test('the heads\' quads use blood-heads.js\'s vertex shader unchanged, over this module\'s rows under the composite\'s names', () => {
  const vs = G.VEC_HEADS_VS();
  for (const f of ['radAt', 'flowD', 'rootDD', 'alongAt', 'chevInks', 'zoomOut']) assert.ok(new RegExp(`\\b${f}\\(`).test(vs), `${f} is in the heads' vertex shader`);
  assert.ok(!/\bvb[A-Z]\w*\s*\(/.test(vs.replace(/vbZoomNums/g, '')), 'only the zoom arithmetic carries the vb prefix');
});

test('mod and the period: the stream distance wraps seamlessly', () => {
  const a = { D: PERIOD - 1, vd: 10, stasis: 0, dr: 0, B0: 0, k: 1, slope: 0 };
  assert.ok(Math.abs(M.circDiff(M.streamDistance(a, 0.05), M.streamDistance(a, 0.1)) - 0.5) < 1e-9);
  assert.ok(sorted([0, 1, 2]));
});
