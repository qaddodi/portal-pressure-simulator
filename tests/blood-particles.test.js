// Blood style P (blood-particles.js, the Tube renderer plan, brief C): the shader lints, its JS twin keeps the promises in its comments.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintGLSL } from './glsl-lint.js';
import { P_GLSL, STYLE_P, P, pNoiseJS, pFieldMean, pMeanJS, pCellRand, pParticle, pHash, pOnMean, pThreshold, pNoiseParts } from '../src/ui/blood-particles.js';
import { D_CYCLE, STYLE_D, STYLE_E } from '../src/ui/blood-tile.js';

const CELL = 5.12 * 7;   // (the composite's cell: 5.12 times the first parcel scale, SLOT = 7)
const PX = 0.5;          // (world units per device pixel at a typical view)
const CFG = { laneW: 1, invR: 0.0, dens: 1.0 };   // (laneW 1: qy is the world distance across; invR 0: every lane at the axis speed, so the mean is the same in every lane)
const PXC = PX / CELL;

test('the shader lints as part of a host that declares nothing else', () => {
  const host = `#version 300 es
precision highp float;
precision highp int;
out vec4 o;
void main() { o = vec4(pNoise(1, 2.0, 0.3, 4.0, 0.2, 35.84, 0.1, 0.01, 12.0)); }`;
  const src = host.replace('void main()', `${P_GLSL}\nvoid main()`);
  assert.deepEqual(lintGLSL(src), []);
  assert.equal(STYLE_P, 3);
  assert.ok(STYLE_P !== STYLE_D && STYLE_P !== STYLE_E);
});

test('the integer hash spreads: neighbouring cells and lanes give different, well-mixed numbers', () => {
  const seen = new Set();
  for (let i = 0; i < 64; i++) for (let l = 0; l < 8; l++) seen.add(pHash(i, l, 3));
  assert.equal(seen.size, 512);
  let mean = 0;
  for (let i = 0; i < 20000; i++) mean += pCellRand(i, 1, 2, 0).hx;
  assert.ok(Math.abs(mean / 20000 - 0.5) < 0.01);
});

test('coverage is 0 to 1 everywhere, at every speed, direction and density', () => {
  for (const vd of [0, 3, 36, -36, 150]) for (const dens of [0, 0.4, 1, 1.35]) {
    const cfg = { ...CFG, dens };
    for (let k = 0; k < 400; k++) {
      const c = pNoiseJS(k % 5, k * 0.37, (k % 13) * 0.4 - 2.4, k * 1.9, (k % 10) / 10, CELL, 3.1, PXC, vd, cfg);
      assert.ok(c >= 0 && c <= 1, `${vd} ${dens} ${c}`);
    }
  }
});

test('the mean over many cells matches the stated mean within 3 % (4 % sampled)', () => {
  // (a) The closed form against the particles themselves: every cell of a long patch, its capsule's area, its brightness and head ramp.
  for (const [vd, dens, px] of [[0, 0.5, 0.01], [6, 1, 0.5], [36, 1.35, 0.5], [0, 1, 0.55], [6, 0.8, 0.2], [36, 1, 1.5], [0, 1, 1.4]]) for (const L of [P.FRONT, P.BACK]) {
    const cfg = { ...CFG, dens }, t = pThreshold(dens), cl = CELL * L.sc * L.len, laneH = L.lanePx * px;
    let sum = 0, n = 0;
    for (let lane = 0; lane < 12; lane++) for (let i = 0; i < 8000; i++) {
      const r = pCellRand(i, lane, 2, L.seed), p = pParticle(r, CELL, vd, cfg, L, lane, 0, px);
      const on = Math.min(Math.max((t - r.hw) * P.SOFT, 0), 1);
      sum += on * (P.BRIGHT0 + P.BRIGHT1 * r.hb) * ((1 + P.HEAD0) / 2) * (Math.PI * p.r0 * p.r0 + 4 * p.hl * p.r0) / (cl * laneH); n++;
    }
    const want = pMeanJS(CELL, 0, vd, t, L, cfg, px), got = sum / n;
    assert.ok(Math.abs(got - want) / want < 0.03, `layer ${L.sc} vd ${vd} dens ${dens} px ${px}: ${got} against ${want}`);
  }
  // (b) The field itself, sampled at fixed random points, against the same mean (looser: sampling noise).
  let seed = 12345;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (const [vd, dens, px] of [[0, 1, 0.5], [36, 0.5, 0.5], [6, 1.35, 0.2], [6, 1, 1], [36, 1, 1.5]]) {
    const cfg = { ...CFG, dens }, want = pFieldMean(CELL, 0, vd, cfg, px), N = 600000;
    let sum = 0;
    for (let k = 0; k < N; k++) sum += pNoiseJS(2, rnd() * 600 * CELL, (rnd() - 0.5) * 80 * px, 16 * (k % 4) + rnd() * 3, 0, CELL, 0, px / CELL, vd, cfg);
    assert.ok(Math.abs(sum / N - want) / want < 0.04, `field vd ${vd} dens ${dens} px ${px}: ${sum / N} against ${want}`);
  }
});

test('slow blood is a short dash, never a dot; fast blood is a long streak, to at most 0.46 of the cell, longer with the square root of the speed', () => {
  const cfg = CFG, at = (r, vd, L) => pParticle(r, CELL, vd, cfg, L, 0, 0, PX);
  for (const L of [P.FRONT, P.BACK]) {
    const r = pCellRand(7, 0, 1, L.seed);
    const slow = at(r, 0, L), mid = at(r, 10, L), fast = at(r, 36, L), huge = at(r, 4000, L);
    assert.ok(slow.hl >= P.DASH * slow.r0 - 1e-12, 'a dash even at rest: at least 2.2 radii of half-length');
    assert.ok(slow.r0 > 0);
    assert.ok(mid.hl >= slow.hl && fast.hl > mid.hl && huge.hl >= fast.hl);
    assert.ok(Math.abs(huge.hl - (P.HL0 + P.HL1 * Math.sqrt(1.7)) * slow.cl) < 1e-9 && huge.hl <= P.HL_MAX * slow.cl, 'at most 0.46 of the cell (the speed is read up to 1.7 trunks)');
    assert.ok(huge.hl + huge.r0 < 0.5 * slow.cl, 'and never longer than half a cell either side of its place');
    assert.ok(fast.hl > 1.8 * slow.hl, 'the healthy trunk runs a good deal longer than a dash at rest');
  }
});

test('a streak is 0.9 px in radius or more, 0.1 to 0.2 of its lane when that is wider, and with its soft edge it stays inside the lane', () => {
  for (const px of [0.2, 0.5, 1.5]) for (const L of [P.FRONT, P.BACK]) {
    let lo = Infinity, hi = 0;
    for (let i = 0; i < 4000; i++) {
      const p = pParticle(pCellRand(i, 0, 1, L.seed), CELL, 0, CFG, L, 0, 0, px);
      lo = Math.min(lo, p.r0 / px); hi = Math.max(hi, p.r0 / px);
      assert.ok(Math.abs(p.cy) + p.r0 * (1 + P.SOFTE) <= 0.5 * p.laneH + 1e-9, 'inside its lane, soft edge and all');
    }
    const top = Math.max(P.FLOOR_PX, (P.WIDTH0 + P.WIDTH1) * L.lanePx);
    assert.ok(lo >= P.FLOOR_PX - 1e-9 && hi <= top + 1e-9 && hi > top - 0.02, `${px}: ${lo} to ${hi} px, top ${top}`);
  }
});

test('the lanes are the same few pixels at every zoom, so a wide vessel holds many streaks across (not a few tall ones)', () => {
  for (const px of [0.1, 0.5, 2]) {
    const lane = pParticle(pCellRand(1, 0, 1, 0), CELL, 10, CFG, P.FRONT, 0, 0, px).laneH / px;
    assert.ok(Math.abs(lane - P.FRONT.lanePx) < 1e-9);
  }
  assert.ok(P.FRONT.lanePx <= 6 && P.BACK.lanePx <= 4.5, 'under 6 and 4.5 px a lane: a vessel 100 px wide holds more than 30 lanes of streaks');
});

// The coverage along the flow, on the particle's own row, as a list of samples at one instant.
function row(vd, cell = 0) {
  const cfg = { laneW: 1, invR: 0, dens: 1.35 }, id = 1;
  // Find a cell whose front particle is present and sits at the lane's centre line (any cell will do: take the row through its centre).
  let k = cell;
  for (; k < cell + 100; k++) { const r = pCellRand(k, 0, id, 0); if (r.hw < 0.5) break; }
  const r = pCellRand(k, 0, id, 0), p = pParticle(r, CELL, vd, cfg, P.FRONT, 0, 0, PX);   // (the lane's centre line: lane 0 spans qw 0 to laneH)
  const qy = (p.cy + 0.5 * p.laneH) / cfg.laneW;   // (lane 0 spans qw 0 to laneH; its centre is laneH / 2)
  const out = [];
  // D = 0: phase 0 has weight 0, phase 1 (f1 = 0.5) has weight 1, shifted by g * 0.5 * cycle = 1 * 32 world units at the axis speed; unshift by it.
  const g = 0.125 * Math.max(2, 16 * (1 - 0.64 * Math.pow(Math.min(0.5 * p.laneH * 0, 1), 2)));
  const lo = (pHash(0, id, 0) & 0xffff) / 65536 * 31;
  for (let x = -0.5 * p.cl; x <= 0.5 * p.cl; x += 0.2) {   // (this cell only: its neighbours' streaks are not part of it)
    const s = x + (k + 0.28 + 0.44 * r.hx - lo) * p.cl + g * 0.5 * P.CYCLE;
    out.push({ x, c: pNoiseJS(id, s, qy, 0, 0, CELL, 0, PXC, vd, cfg) });
  }
  return { out, p };
}

test('the along extent: a dash at rest, longer at speed, the head the brighter end, reversed with the flow', () => {
  const rest = row(0), fast = row(36), back = row(-36);   // (rest is a dash already, not a dot: see the test above)
  const extent = (o) => { const on = o.out.filter((s) => s.c > 0.5 * Math.max(...o.out.map((q) => q.c))); return on.length ? on[on.length - 1].x - on[0].x : 0; };
  assert.ok(extent(rest) > 0);
  assert.ok(extent(fast) > extent(rest) * 1.2, 'stretched along the flow');
  assert.ok(extent(rest) > 2.5 * 2 * rest.p.r0 * 0.9, 'a dash at rest: its length well over its width');
  assert.ok(extent(fast) <= 2 * (P.HL_MAX * rest.p.cl) + 2 * rest.p.r0 * (1 + P.SOFTE) + 0.1, 'capped');
  const brightEnd = (o) => { const xs = o.out.filter((s) => s.c > 0.05); const mid = (xs[0].x + xs[xs.length - 1].x) / 2; const hi = xs.filter((s) => s.x > mid).reduce((a, s) => a + s.c, 0), lo = xs.filter((s) => s.x < mid).reduce((a, s) => a + s.c, 0); return hi > lo ? 1 : -1; };
  assert.equal(brightEnd(fast), 1, 'downstream (+s) is the head when the flow runs +s');
  assert.equal(brightEnd(back), -1, 'and the other end when it reverses');
});

test('where a whole cell is under 3 pixels long the field is its exact mean: no variance; between 3 and 5 it blends', () => {
  const px = CELL * P.FRONT.len / 2.5;   // (a cell 2.5 pixels long: it cannot show a streak)
  const cfg = { ...CFG, dens: 1 };
  const vals = [];
  for (let k = 0; k < 500; k++) vals.push(pNoiseJS(k % 4, k * 0.91, (k % 7) * 0.5 - 1.5, k * 3.7, 0, CELL, 0.2, px / CELL, 20, cfg));
  const m = vals.reduce((a, v) => a + v, 0) / vals.length;
  assert.ok(vals.every((v) => Math.abs(v - m) < 1e-12), 'every sample the same');
  assert.ok(Math.abs(m - pFieldMean(CELL, 0, 20, cfg, px)) < 1e-12, 'and it is the mean');
  const pxMid = CELL * P.FRONT.len / 4;   // (4 pixels: half way through the fade)
  const mid = [];
  for (let k = 0; k < 500; k++) mid.push(pNoiseJS(1, k * 13, ((k % 7) - 3) * pxMid * 2, 0, 0, CELL, 0.2, pxMid / CELL, 20, cfg));
  assert.ok(Math.max(...mid) - Math.min(...mid) > 0, 'the dashes are on their way in');
});

test('at a typical view (cell 35.84, a pixel 0.55 world units) the blood is streaks, not flat: a dash is at least 1.8 px wide and 4 px long', () => {
  const px = 0.55, cfg = { laneW: 1, invR: 0.01, dens: 1 };
  for (const vd of [0, 4, 36]) {
    // The field: well above zero variance, along a lane and across the vessel.
    const vals = [];
    for (let k = 0; k < 4000; k++) vals.push(pNoiseJS(3, k * 0.37, ((k * 7) % 11) * 2 - 10, 8 + (k % 5), 0.3, CELL, 0.1, px / CELL, vd, cfg));
    const mean = vals.reduce((a, v) => a + v, 0) / vals.length, variance = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length;
    assert.ok(variance > 0.002 && Math.max(...vals) > 0.5, `vd ${vd}: variance ${variance}, peak ${Math.max(...vals)}`);
    // Every particle, front and back layer: at least 1.8 px across and 4 px long.
    for (const L of [P.FRONT, P.BACK]) for (let i = 0; i < 400; i++) {
      const p = pParticle(pCellRand(i, 0, 3, L.seed), CELL, vd, cfg, L, 0, 0, px);
      assert.ok(2 * p.r0 >= 1.8 * px - 1e-12, `width ${2 * p.r0 / px} px`);
      assert.ok(2 * (p.hl + p.r0) >= 4 * px, `length ${2 * (p.hl + p.r0) / px} px`);
    }
  }
  // And the drawn field shows it: along a lane's centre, a run of coverage at least 4 px long.
  const cfgL = { laneW: 1, invR: 0, dens: 1.35 };
  let longest = 0;
  for (let k = 0; k < 6; k++) {
    let run = 0;
    for (let x = 0; x < 6 * CELL; x += px / 8) {
      const c = pNoiseJS(1, x + k * 41.3, 0.5 * P.FRONT.lanePx * px, 0, 0, CELL, 0, px / CELL, 0, cfgL);
      if (c > 0.3) { run += px / 8; longest = Math.max(longest, run); } else run = 0;
    }
  }
  assert.ok(longest >= 4 * px, `a dash ${longest / px} px long`);
});

test('it is carried, not re-rolled: a whole flow-map cycle of D later is the same field, and between, the pattern slides with D at the lane speed', () => {
  const cfg = { ...CFG, dens: 1.2 };
  for (let k = 0; k < 300; k++) {
    const s = k * 0.71, q = (k % 9) * 0.45 - 2, D = (k * 5.3) % 64;
    const a = pNoiseJS(3, s, q, D, 0, CELL, 0.4, PXC, 20, cfg), b = pNoiseJS(3, s, q, D + D_CYCLE, 0, CELL, 0.4, PXC, 20, cfg);
    assert.ok(Math.abs(a - b) < 1e-9, `${a} ${b}`);
  }
  // At D = 0 the weights are 0 and 1 (f0 = 0, f1 = 0.5): the field is the second read alone. Moving D by dD small enough that it
  // stays inside the read's life shifts that read along by the lane speed times dD (the axis: pLaneG(0) = 2, every lane there with invR 0);
  // its weight barely moves (1 - dD / 32), so compare where the field is on, not how strongly.
  const g = 2, dD = 0.02, sh = g * dD;
  let same = 0, total = 0;
  for (let k = 0; k < 3000; k++) {
    const s = k * 0.11, q = (k % 11) * 0.4 - 2.2;
    const a = pNoiseJS(3, s, q, 0, 0, CELL, 0.4, PXC, 0, cfg), b = pNoiseJS(3, s + sh, q, dD, 0, CELL, 0.4, PXC, 0, cfg);
    if (a > 0.05 || b > 0.05) { total++; if ((a > 0.05) === (b > 0.05)) same++; }
  }
  assert.ok(total > 50 && same / total > 0.95, `${same} of ${total}: the pattern moved with D`);
});

test('reversing the flow keeps the particles where they are (only the bright end changes sides); the places ride on D alone', () => {
  const cfg = { ...CFG, dens: 1 };
  for (let k = 0; k < 600; k++) {
    const s = k * 0.43, q = (k % 9) * 0.45 - 2, D = (k * 7.1) % 64;
    const a = pNoiseJS(1, s, q, D, 0, CELL, 0.2, PXC, 20, cfg), b = pNoiseJS(1, s, q, D, 0, CELL, 0.2, PXC, -20, cfg);
    assert.equal(a > 0, b > 0, `${s} ${q}`);
  }
});

test('the thinning: dens 0 holds no particle, a dens high enough holds one in every cell; the mean follows it', () => {
  const cfg0 = { ...CFG, dens: 0 };
  let seen = 0;
  for (let k = 0; k < 2000; k++) seen += pNoiseJS(1, k * 0.2, (k % 9) * 0.3 - 1.2, 0, 0, CELL, 0, PXC, 10, cfg0);
  assert.equal(seen, 0);
  assert.equal(pOnMean(pThreshold(0)), 0);
  assert.ok(Math.abs(pOnMean(pThreshold(2)) - 1) < 1e-12);
  let last = 0;
  for (let d = 0; d <= 1.35; d += 0.05) { const m = pFieldMean(CELL, 0, 10, { ...CFG, dens: d }, PXC * CELL); assert.ok(m >= last); last = m; }
});

// ---- Brief P5: a narrow lumen draws the front layer alone ----

// pNoise's values before brief P5, for a lumen 12 px across (cfg laneW 1.2, invR 1/3 at 0.5 world units a pixel, dens 0.8): [id, s, qy, D, ay, drift, vd, value].
const BEFORE_P5 = [
  [1, 8.161, -2.321, 34.762, 0.928, 6.349, -22, 0.205007080103],
  [2, 364.012, -1.86, 31.737, 0.744, 5.483, 30, 0.282012823537],
  [3, 238.44, 1.361, 2.551, 0.544, 7.438, -22, 0.190446204242],
  [1, 386.324, -2.046, 44.775, 0.819, 4.603, 30, 0.166958993306],
  [2, 158.593, 2.206, 25.992, 0.882, 9.528, -22, 0.205363798583],
  [3, 397.471, 0.786, 27.065, 0.314, 4.999, 30, 0.163229675758],
  [1, 114.914, -0.368, 43.22, 0.147, 1.553, -22, 0.036011166264],
  [2, 35.508, 1.693, 19.94, 0.677, 0.071, 30, 0.153871526562],
  [3, 185.067, -1, 36.671, 0.4, 9.623, -22, 0.068335223601],
  [1, 6.186, 1.343, 19.344, 0.537, 3.211, 30, 0.322898190442],
  [2, 381.995, 0.225, 42.705, 0.09, 6.57, -22, 0],
  [3, 249.366, -1.626, 59.46, 0.65, 7.674, 30, 0],
  [1, 182.827, 1.083, 21.233, 0.433, 7.127, -22, 0.20450390121],
  [2, 230.421, 1.255, 28.335, 0.502, 2.06, 30, 0.375304857695],
  [3, 182.78, 0.825, 33.345, 0.33, 8.727, -22, 0.010883593693],
  [1, 156.642, 2.043, 47.504, 0.817, 1.429, 30, 0.276492836362],
  [2, 274.072, -0.719, 22.927, 0.288, 7.931, -22, 0.07775107445],
  [3, 318.644, -1.555, 7.615, 0.622, 4.041, 30, 0],
  [1, 349.82, 1.073, 34.293, 0.429, 2.477, -22, 0.332584668876],
  [2, 156.778, 1.776, 52.053, 0.71, 3.718, 30, 0.045308103753],
  [3, 332.953, 0.923, 33.81, 0.369, 8.955, -22, 0.009661612591],
  [1, 252.527, 2.017, 24.57, 0.807, 7.832, 30, 0.079746073862],
  [2, 330.116, -1.937, 39.517, 0.775, 6.11, -22, 0.169178036591],
  [3, 44.922, 0.378, 56.902, 0.151, 0.92, 30, 0.012415539975],
];

test('P5: over 9 px across the arithmetic is today\'s, to the last digit', () => {
  const cfg = { laneW: 1.2, invR: 1 / 3, dens: 0.8 };
  for (const [id, s, qy, D, ay, drift, vd, v] of BEFORE_P5) {
    assert.ok(Math.abs(pNoiseJS(id, s, qy, D, ay, CELL, drift, PXC, vd, cfg) - v) < 1e-9, `${id} ${s}`);
  }
});

test('P5: at 4 px the result is the front layer alone times the stated gain, and the back layer is not read', () => {
  const R = 4 * PX / 2, cfg = { laneW: R, invR: 1 / R, dens: 0.8 };
  let any = 0;
  for (let i = 0; i < 200; i++) {
    const y = (i * 0.618) % 1 * 2 - 1, s = i * 3.7, ay = Math.abs(y);
    const parts = pNoiseParts(1, s, y, (i * 0.37) % 64, ay, CELL, 2.2, PXC, 30, cfg);
    assert.equal(parts.kW, 0);
    assert.equal(parts.B, parts.mB, 'the back layer is its mean: no streak was looked up');
    const v = pNoiseJS(1, s, y, (i * 0.37) % 64, ay, CELL, 2.2, PXC, 30, cfg);
    assert.equal(v, Math.min(1, parts.F * parts.gain));
    assert.ok(Math.abs(parts.gain - P.NARROW_GAIN[4]) < 1e-9, 'the table\'s value at 4 px (2, 2.5, 3, 3.5, 4)');
    if (v > 0.05) any++;
  }
  assert.ok(any > 5, 'streaks show in a 4 px lumen');
});

test('P5: between 5 and 9 px the back layer is mixed in by the width', () => {
  const W = 7, R = W * PX / 2, cfg = { laneW: R, invR: 1 / R, dens: 0.8 };
  const parts = pNoiseParts(1, 40.2, 0.1, 12.5, 0.1, CELL, 2.2, PXC, 30, cfg);
  assert.ok(parts.kW > 0.4 && parts.kW < 0.6);
  const full = Math.min(1, Math.max(0, 1 - (1 - parts.F) * (1 - P.BACK.bright * parts.B))), alone = Math.min(1, parts.F * parts.gain);
  assert.ok(Math.abs(pNoiseJS(1, 40.2, 0.1, 12.5, 0.1, CELL, 2.2, PXC, 30, cfg) - (alone * (1 - parts.kW) + full * parts.kW)) < 1e-12);
});

test('P5: the mean tone is flat from 3 to 9 px across (over 9 the field is today\'s, which itself eases down a few percent to 14 px) (the table is the calibration), and the back layer\'s text is behind a branch', () => {
  const mean = (W) => {
    const R = W * PX / 2, cfg = { laneW: R, invR: 1 / R, dens: 0.8 };
    let sum = 0;
    const N = 50000;
    for (let i = 0; i < N; i++) {
      const y = (i * 0.6180339887) % 1 * 2 - 1;
      sum += pNoiseJS(1, i * 0.913, y, (i * 0.37) % 64, Math.abs(y), CELL, 2.2, PXC, 30, cfg);
    }
    return sum / N;
  };
  const ref = mean(9);
  for (const W of [3, 4, 5, 6, 7, 8]) assert.ok(Math.abs(mean(W) / ref - 1) < 0.03, `${W} px: ${mean(W)} against ${ref}`);
  assert.ok(P_GLSL.includes('if (kB > 0.0 && kW > 0.0) {'), 'the back layer runs only where the lumen is over 5 px across');
  assert.equal(P.BACK_PX0, 5); assert.equal(P.BACK_PX1, 9);
  assert.equal(P.NARROW_GAIN.length, (9 - P.NARROW_W0) / P.NARROW_STEP + 1);
});
