// Blood that shows trouble (src/ui/blood-trouble.js, brief V7): the shader lints, and its JS twin keeps the promises in the module's comments.
// The tests import the module and judge what it exports (rule PR-02); the real radii of the figure are in the last test (the survey).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lintGLSL } from './glsl-lint.js';
import { TROUBLE, TROUBLE_GLSL, troubleAtJS, narrowingsJS } from '../src/ui/blood-trouble.js';
import { ROWS_GLSL } from '../src/ui/comp-glsl.js';

const T = TROUBLE;
const PX = 0.2;   // world units per device pixel
const step = (at, hi, lo) => (id, s) => (s < at ? hi : lo);   // a vessel of radius hi that drops to lo at `at` (flow +s enters the narrowing there)
const o = (over) => ({ id: 0, s: 50, y: 0.4, R: 4, len: 400, vd: 30, reversed: false, radAt: () => 4, t: 0, still: 0, pxW: PX, ...over });
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

test('the shader lints in a host that has the lumen shader\'s radAt, pxW, bT and still', () => {
  const host = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D rad;
uniform highp sampler2D flow;
uniform float pxW;
uniform highp float bT;
uniform int still;
out vec4 o;
${ROWS_GLSL}
${TROUBLE_GLSL}
void main() { vec4 t = troubleAt(1, 20.0, 0.3, 4.0, 300.0, -12.0, true); o = t; }`;
  assert.deepEqual(lintGLSL(host), []);
  assert.ok(/vec4 troubleAt\(int id, float s, float y, float R, float len, float vd, bool reversed\)/.test(TROUBLE_GLSL));
  assert.ok(!/\buniform\b/.test(TROUBLE_GLSL), 'the module declares no uniform of its own');
});

test('a healthy straight vessel is returned unchanged, exactly', () => {
  for (let k = 0; k < 200; k++) {
    const s = k * 1.7, y = (k % 21) / 10 - 1;
    for (const vd of [30, -30, 0]) {
      const r = troubleAtJS(o({ s, y, vd, t: k * 0.13 }));
      assert.equal(r.s, s); assert.equal(r.y, y); assert.equal(r.gain, 1); assert.equal(r.w, 0);
    }
  }
  // a smooth taper (ordinary anatomy: 6.5 to 3.25 over 300) is not a narrowing
  const taper = (id, s) => 6.5 - (6.5 - 3.25) * Math.min(Math.max(s / 300, 0), 1);
  for (let s = 0; s <= 300; s += 3) assert.equal(troubleAtJS(o({ s, R: taper(0, s), radAt: taper })).w, 0);
});

test('reversed flow gives a wave across the lumen whose mean over a period is y, fullest on the axis, nothing at the wall', () => {
  for (const y of [0, 0.4, -0.7, 0.95]) {
    let mean = 0, peak = 0, n = 240;
    for (let k = 0; k < n; k++) {
      const r = troubleAtJS(o({ y, reversed: true, t: (k / n) / T.F }));
      mean += r.y / n; peak = Math.max(peak, Math.abs(r.y - y));
      assert.equal(r.s, 50, 'the wave moves across, not along');
      assert.ok(near(r.gain, T.REV_GAIN) && r.w === 1);
    }
    assert.ok(near(mean, y, 1e-6), `${y}: mean ${mean}`);
    assert.ok(peak <= T.A * (1 - y * y) + 1e-9 && peak > 0.9 * T.A * (1 - y * y) - 1e-9, `${y}: peak ${peak}`);
  }
  assert.equal(troubleAtJS(o({ y: 1, reversed: true, t: 0.37 })).y, T.YMAX, 'at the wall the wave is nothing, and the result is held under 1');
  // it travels along the vessel: the same phase at s + L R after one more turn of the place
  const a = troubleAtJS(o({ reversed: true, s: 50, t: 0.2 })).y, b = troubleAtJS(o({ reversed: true, s: 50 + T.L * 4, t: 0.2 })).y;
  assert.ok(near(a, b, 1e-6));
});

test('a tight narrowing gives the jet inside it and eddies for three steps downstream only, on the flow\'s side', () => {
  const R0 = 4, R1 = 1.4, at = 100, rad = step(at, R0, R1), d = T.DSTEP * R1;
  const at2 = (s) => troubleAtJS(o({ s, R: rad(0, s), radAt: rad, y: 0.5 }));
  // (a 0.5 narrowing is half-way up the ease from NARROW to TIGHT)
  assert.ok(near(troubleAtJS(o({ s: 100.5, R: 2, radAt: step(100, 4, 2), y: 0.5 })).jet, 0.5, 1e-9));
  // nothing before the narrowing
  for (let s = 0; s < at; s += 2) assert.equal(at2(s).w, 0, `s ${s}`);
  // the jet inside it: the across is scaled by JET_Y and the density up to JET_GAIN; the first 2 d of it
  const jet = at2(at + 0.5);
  assert.ok(near(jet.jet, 1) && near(jet.y, 0.5 * T.JET_Y, 1e-9) && near(jet.gain, T.JET_GAIN, 1e-9), JSON.stringify(jet));
  // eddies: none within the first step (the jet's own), then on for the next three steps, then nothing at all
  let first = Infinity, last = -Infinity;
  for (let s = at; s < at + 12 * d; s += 0.25) { const r = at2(s); if (r.eddy > 0) { first = Math.min(first, s); last = Math.max(last, s); } }
  assert.ok(first >= at + d - 1e-9, `eddies start ${first - at} after the narrowing`);
  assert.ok(last < at + (T.STEPS + 2) * d + 1e-9, `eddies end ${last - at} after it`);
  assert.equal(at2(at + (T.STEPS + 2) * d + 1).w, 0, 'a vessel past the eddies is clear again');
  // they fall off with the steps: strongest nearest the narrowing
  const e1 = at2(at + 1.5 * d).eddy, e3 = at2(at + 3.5 * d).eddy, e5 = at2(at + 4.5 * d).eddy;
  assert.ok(e1 > e3 && e3 > 0 && e5 > 0 && e5 < e3 + 1e-9, `${e1} ${e3} ${e5}`);
  // the eddy moves the place across (outward from the axis, by the side) and along
  let moved = 0;
  for (let k = 0; k < 40; k++) { const r = troubleAtJS(o({ s: at + 2.5 * d, R: R1, radAt: rad, y: 0.5, t: k * 0.05 })); if (Math.abs(r.s - (at + 2.5 * d)) > 1e-6) moved++; }
  assert.ok(moved > 30);
  const up = troubleAtJS(o({ s: at + 2.5 * d, R: R1, radAt: rad, y: 0.5, t: 0.3 })), dn = troubleAtJS(o({ s: at + 2.5 * d, R: R1, radAt: rad, y: -0.5, t: 0.3 }));
  assert.ok(near(up.y - 0.5, -(dn.y + 0.5), 1e-9), 'the swing is outward on each side');
  // reversing vd moves them to the other side: the mirror image of the vessel gives the mirror image of the answer
  const mir = (id, s) => rad(id, 200 - s);
  for (const s of [at + 0.5, at + 1.5 * d, at + 2.5 * d, at + 4.5 * d, at + 7 * d]) {
    const a = at2(s), b = troubleAtJS(o({ s: 200 - s, R: mir(0, 200 - s), radAt: mir, y: 0.5, vd: -30 }));
    assert.ok(near(a.jet, b.jet) && near(a.eddy, b.eddy) && near(a.gain, b.gain), `s ${s}`);
  }
  // and the other way round (same vessel, flow reversed) sees no narrowing at that place at all: the vessel widens along the flow there
  assert.equal(troubleAtJS(o({ s: at + 0.5, R: R1, radAt: rad, vd: -30 })).w, 0);
});

test('under 6 px across nothing is bent, and the effect eases in over the next half', () => {
  const R6 = 6 * PX / 2;
  for (const reversed of [true, false]) {
    const r = troubleAtJS(o({ R: R6 * 0.99, radAt: () => R6 * 0.99, reversed, t: 0.3 }));
    assert.deepEqual([r.s, r.y, r.gain, r.w], [50, 0.4, 1, 0]);
  }
  // the same narrowing in a lumen 9 px wide or more is on, in one of 6 px or less it is not
  const rad = step(100, 4, 1.4), wide = troubleAtJS(o({ s: 100.5, R: 1.4, radAt: rad, pxW: 2 * 1.4 / 9 }));
  assert.ok(near(wide.jet, 1), 'full at 1.5 x the floor');
  assert.equal(troubleAtJS(o({ s: 100.5, R: 1.4, radAt: rad, pxW: 2 * 1.4 / 5.9 })).w, 0);
});

test('time terms are frozen at 0 when still is 1: the bend stays, it does not move', () => {
  const rad = step(100, 4, 2);
  for (const sc of [{ reversed: true }, { s: 100 + 6, R: 2, radAt: rad }, { s: 100 + 12, R: 2, radAt: rad }]) {
    const a = troubleAtJS(o({ ...sc, still: 1, t: 0 })), b = troubleAtJS(o({ ...sc, still: 1, t: 7.3 }));
    assert.deepEqual(a, b);
    assert.ok(a.w > 0);
    const c = troubleAtJS(o({ ...sc, still: 1, t: 0 })), m = troubleAtJS(o({ ...sc, still: 0, t: 0 }));
    assert.deepEqual(c, m, 'still 1 is the same as the clock standing at 0');
    const mv = troubleAtJS(o({ ...sc, still: 0, t: 0.31 }));
    assert.ok(mv.y !== a.y || mv.s !== a.s, 'with the clock running it moves');
  }
});

test('|y\'| stays under 1 on a sweep, and an untroubled place is returned exactly', () => {
  const profiles = [() => 4, step(100, 4, 2), step(100, 4, 1.2), (id, s) => 4 - 3 * Math.exp(-((s - 150) ** 2) / 200), (id, s) => 1 + 0.01 * s];
  let troubled = 0, clear = 0;
  for (const radAt of profiles) for (const vd of [40, -40, 0, 3]) for (const reversed of [false, true]) {
    for (let k = 0; k < 400; k++) {
      const s = (k * 7.3) % 300, y = ((k * 37) % 201) / 100 - 1, R = radAt(0, s), t = k * 0.17;
      const r = troubleAtJS(o({ s, y, R, radAt, vd, reversed, t, pxW: 0.05 }));
      assert.ok(Number.isFinite(r.s) && Number.isFinite(r.y) && Number.isFinite(r.gain));
      assert.ok(Math.abs(r.y) < 1 && Math.abs(r.y) <= T.YMAX || r.w === 0, `${r.y}`);
      assert.ok(r.w >= 0 && r.w <= 1 && r.gain >= 1 && r.gain <= T.REV_GAIN * T.JET_GAIN + 1e-9);
      if (r.w === 0) { clear++; assert.deepEqual([r.s, r.y, r.gain], [s, y, 1]); } else troubled++;
    }
  }
  assert.ok(troubled > 1000 && clear > 1000, `${troubled} troubled, ${clear} clear`);
});

test('the constants are the brief\'s, and the text carries them', () => {
  assert.deepEqual([T.A, T.L, T.F, T.REV_GAIN, T.NARROW, T.DSTEP, T.JET_Y, T.JET_GAIN, T.STEPS, T.MIN_PX], [0.18, 3, 0.6, 1.25, 0.6, 2, 0.6, 1.5, 3, 6]);
  for (const k of ['0.18', '0.6', '1.25', '1.5', '6.0']) assert.ok(TROUBLE_GLSL.includes(k), k);
});

// ---- the figure's real radii: where does a narrowing under 0.7 appear? ----
// tests/tube-web-capture.mjs boots the real stage in jsdom and prints each row's radii and points (as tube-web-real.test.js uses it).
const SCRIPT = fileURLToPath(new URL('./tube-web-capture.mjs', import.meta.url));
const BOOT_MS = 180000;
const capture = new Promise((resolve, reject) => {
  execFile(process.execPath, [SCRIPT, 'figure'], { maxBuffer: 512 * 1024 * 1024, timeout: BOOT_MS }, (err, out, errOut) => {
    if (err) return reject(new Error(`tube-web-capture figure failed: ${err.message}\n${errOut}`));
    const line = out.trim().split('\n').filter((l) => l.startsWith('{')).pop();
    try { resolve(JSON.parse(line)); } catch (e) { reject(new Error(`no JSON: ${e.message}`)); }
  });
});
capture.catch(() => {});

/** The rows of a capture that have a narrowing under T.NARROW by the shader's own rule, in either flow direction: [{ id, len, rMin, rMax, from, to, n }]. */
export function surveyRows(cap) {
  const out = [];
  for (const r of cap.rows) {
    let len = 0;
    for (let i = 1; i < 64; i++) len += Math.hypot(r.P[2 * i] - r.P[2 * i - 2], r.P[2 * i + 1] - r.P[2 * i - 1]);
    const radAt = (id, s, L) => { const u = Math.min(Math.max(s / L, 0), 1) * 63, i0 = Math.min(Math.floor(u), 62); return Math.max(r.R[i0] + (r.R[i0 + 1] - r.R[i0]) * (u - i0), 0.3); };
    const ss = Array.from({ length: 201 }, (_, k) => len * k / 200);
    for (const vd of [1, -1]) {
      const nar = narrowingsJS(radAt, r.id, len, vd, ss);
      if (nar.length) out.push({ id: r.id, vd, len, rMin: Math.min(...r.R), rMax: Math.max(...r.R), from: nar[0].s, to: nar.at(-1).s, n: Math.min(...nar.map((x) => x.n0)) });
    }
  }
  return out;
}

for (const view of ['anatomy', 'circuit']) {
  test(`the figure's ${view}: ordinary tapers do not trip the narrowing (rows that do are listed)`, { timeout: BOOT_MS + 20000 }, async () => {
    const hits = surveyRows((await capture)[view]);
    const f = (x) => Number(x).toFixed(2);
    console.log(`blood-trouble survey, ${view}: ${hits.length} row-directions with a narrowing under ${T.NARROW}\n${hits.map((h) => `  row ${h.id} (flow ${h.vd > 0 ? '+s' : '-s'}): length ${f(h.len)}, radius ${f(h.rMin)} … ${f(h.rMax)}, narrowing at s ${f(h.from)} … ${f(h.to)}, tightest n ${f(h.n)}`).join('\n')}`);
    assert.ok(hits.length <= 4, `${hits.length} rows trip the narrowing on a default figure: ordinary tapers are catching it`);
  });
}
