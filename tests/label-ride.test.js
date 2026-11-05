import { stageSource } from './stage-src.js';
// A presenter's camera move with every label on the GPU: the labels ride it on the GPU (label-gl.js ride) instead of fading out for the
// whole move, and glide on to their new places at the landing (Mohammad, 1 Nov: "Labels don't seem like GPU").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const st = stageSource();
const lg = readFileSync(new URL('../src/ui/label-gl.js', import.meta.url), 'utf8');

test('a presenter move rides no label: they are pose-driven, and never faded for it', () => {
  assert.match(st, /camMove = true; dpr\.carry = dpr\.on && performance\.now\(\) < dpr\.refitUntil; stageScope\.timer/);
});

test('each frame of the glide carries them on the GPU; the landing ends the ride before the labels are laid out again', () => {
  assert.match(st, /applyVT\(\); (?:live\.)?CTM = null;\n\s+if \((?:live\.)?rideCTM\) rideStep\(\);/);
  const settle = st.match(/function camSettle\(\) \{[\s\S]*?\n {2,4}\}\n/)[0];
  assert.ok(settle.indexOf('rideStop();') > 0 && settle.indexOf('rideStop();') < settle.indexOf('updateLabels(live.F)'));
});

test('the ride moves pictures only: each centre carried, at whole device pixels, and the landing eases every label', () => {
  assert.match(lg, /const ux = Math\.round\(\(M\[0\] \* cx \+ M\[2\] \* cy \+ M\[4\]\) \* dpr - st\.w \/ 2\), uy = Math\.round\(\(M\[1\] \* cx \+ M\[3\] \* cy \+ M\[5\]\) \* dpr - st\.h \/ 2\);/);   // (R: now held inside the stage by rideAt)
  // (Rigid labels: no glide after a ride and no fade-out where it rode: those records are gone.)
  for (const w of ['glides', 'outgoing', 'RIDE_MS', 'fadeIn', 'rideFrom', 'fromMap']) assert.ok(!lg.includes(w), w);
});

// The carry itself: the camera's move since the layout, as stage.js works it out (rideStep), takes a point laid out under one view to
// where the same world point stands under the next.
test('the carry matrix maps a laid-out point to where its world point is now', () => {
  const ctm = (k, x, y) => [k, 0, 0, k, x, y];
  const apply = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
  const ride = (r, n) => {
    const [a, b, c, d, e, f] = r, det = a * d - b * c;
    const i = [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
    return [n[0] * i[0] + n[2] * i[1], n[1] * i[0] + n[3] * i[1], n[0] * i[2] + n[2] * i[3], n[1] * i[2] + n[3] * i[3], n[0] * i[4] + n[2] * i[5] + n[4], n[1] * i[4] + n[3] * i[5] + n[5]];
  };
  const r0 = ctm(1.2, 30, -40), r1 = ctm(2.7, -310, 95), w = [412, 233];
  const M = ride(r0, r1), q = apply(M, apply(r0, w)), want = apply(r1, w);
  assert.ok(Math.abs(q[0] - want[0]) < 1e-9 && Math.abs(q[1] - want[1]) < 1e-9);
  const th = 0.4, rot = [Math.cos(th) * 2, Math.sin(th) * 2, -Math.sin(th) * 2, Math.cos(th) * 2, 10, 20];
  const M2 = ride(r0, rot), q2 = apply(M2, apply(r0, w)), w2 = apply(rot, w);
  assert.ok(Math.abs(q2[0] - w2[0]) < 1e-9 && Math.abs(q2[1] - w2[1]) < 1e-9);
});
