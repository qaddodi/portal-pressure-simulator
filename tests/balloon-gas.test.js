// The tamponade tube's gastric balloon (balloon-gas.js) is the first step: filled in the stomach, the tube drawn up so it seats against the
// cardia. It must stay inside the stomach as drawn at every stage (Mohammad, 31 Oct: "the gastric balloon has to remain within the bounds of
// the stomach"), and it is fitted to the stomach's own outline, not to fixed coordinates.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAS, outlineOf, stomachOutline, clearance, fitGas, gasShape, tubePath, tubeTip, tubeTo, pathAt, arcAtY, sheath, sheathArcs, pullArrow, PULL } from '../src/ui/balloon-gas.js';
import { balloonShape } from '../src/ui/balloon-eso.js';
import { esoAt, BALLOON } from '../src/ui/balloon-eso.js';
import { SEAM_D } from '../src/ui/anatomy.js';

const STOMACH = stomachOutline(), SEAM = outlineOf(SEAM_D), MOUTH = [esoAt(251).c, 251];
const steps = (n) => Array.from({ length: n + 1 }, (_, i) => i / n);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('the stomach outline is the drawn one: the cardia and the body are in, the esophagus above it is out', () => {
  assert.ok(STOMACH.length > 40);
  assert.ok(clearance([870, 300]) > 20, 'the fundus is well inside');
  assert.ok(clearance([800, 200]) < 0, 'the lower esophagus is not the stomach');
  assert.ok(clearance([1040, 360]) < 0, 'the spleen is not the stomach');
});

test('the gastric balloon stays inside the stomach at every inflation and every stage of the traction, a margin from the wall', () => {
  for (const k of steps(20)) for (const q of steps(10)) {
    const s = gasShape(k, q);
    for (const p of s.outline) {
      assert.ok(clearance(p, STOMACH) >= GAS.margin - 1e-6, `k ${k} q ${q}: ${p.map((v) => v.toFixed(1))} is ${clearance(p, STOMACH).toFixed(2)} from the wall`);
      assert.ok(clearance(p, SEAM) >= GAS.margin - 1.5, `k ${k} q ${q}: inside the stomach as the stage paints it (esophagus and stomach in one shape)`);
    }
  }
});

test('its rims, which the latex is drawn with, lie inside it', () => {
  const s = gasShape(1, 1);
  for (const f of [0.86, 0.7]) for (const p of s.ring(f)) assert.ok(clearance(p, STOMACH) >= GAS.margin - 1e-6);
});

test('the balloon is fitted to the stomach it is given, not to fixed coordinates', () => {
  const home = fitGas();
  // A stomach under a third the size about the cardia: the balloon is smaller, and still inside it.
  const small = STOMACH.map(([x, y]) => [MOUTH[0] + (x - MOUTH[0]) * 0.3, MOUTH[1] + (y - MOUTH[1]) * 0.3]), fs = fitGas(small, MOUTH);
  assert.ok(fs.b < home.b, `${fs.b.toFixed(1)} against ${home.b.toFixed(1)}`);
  for (const k of [1]) for (const q of [0, 1]) {
    const s = gasShape(k, q, 40, fs);
    for (const p of s.outline) assert.ok(clearance(p, small) >= GAS.margin - 1e-6, `smaller stomach, q ${q}: ${clearance(p, small).toFixed(2)}`);
  }
  // The same stomach and cardia moved over: the balloon moves with them.
  const dx = 31, dy = 14, moved = STOMACH.map(([x, y]) => [x + dx, y + dy]), fm = fitGas(moved, [MOUTH[0] + dx, MOUTH[1] + dy]);
  assert.ok(Math.abs(fm.b - home.b) < 0.05 && Math.abs(fm.deg - home.deg) < 1e-6);
  assert.ok(dist(fm.p0, [home.p0[0] + dx, home.p0[1] + dy]) < 1e-6);
});

test('it is a balloon: it grows, from a sheath on the tube to a pear wider than the esophagus, which it cannot be drawn through', () => {
  const f = fitGas(), widths = steps(10).map((k) => gasShape(k, 1).b);
  for (let i = 1; i < widths.length; i++) assert.ok(widths[i] > widths[i - 1], 'wider with every step');
  assert.equal(widths[0], GAS.neck);
  assert.ok(f.b >= 1.5 * esoAt(251).h, `${f.b.toFixed(1)} against the esophagus's ${esoAt(251).h.toFixed(1)}`);
  assert.ok(f.b <= GAS.bMax + 1e-9);
  // Nested as it fills: at every point along its length it is no narrower than at the step before.
  for (const [a, b] of [[0.25, 0.5], [0.5, 1]]) for (const u of steps(40)) assert.ok(gasShape(a, 1).half(u) <= gasShape(b, 1).half(u) + 1e-9, `at ${u} of its length, ${a} against ${b}`);
});

test('the traction draws it up the tube to the cardia, and the cone seats there', () => {
  const f = fitGas(), loose = gasShape(1, 0), seated = gasShape(1, 1);
  assert.ok(Math.abs(dist(seated.p0, loose.p0) - GAS.slack) < 1e-9, 'drawn up by the slack, along the tube');
  assert.ok(dist(seated.p0, f.mouth) - GAS.pole < 1e-6, 'its upper end is the pole from the cardia');
  const near = (s) => Math.min(...s.outline.map((p) => dist(p, MOUTH)));
  assert.ok(near(seated) < near(loose) - 1, 'the balloon is closer to the cardia once drawn up');
  assert.ok(near(seated) <= GAS.pole + GAS.neck, 'against the cardia: no further from it than the tube between, and its sheath');
  // The axis runs down into the stomach from the cardia, not across it.
  assert.ok(f.deg > 20 && f.deg < 80);
  // A half-filled balloon is part way, on the same axis.
  const mid = gasShape(0.5, 0.5);
  assert.ok(dist(mid.p0, loose.p0) < GAS.slack && dist(mid.p0, loose.p0) > 0);
});

test('the tube runs down the middle of the esophagus, bends at the cardia, and goes through the balloon on its axis to a tip inside the stomach', () => {
  const P = tubePath(), f = fitGas();
  assert.equal(P.pts[0][1], BALLOON.from);
  for (const [x, y] of P.pts) {
    if (y <= BALLOON.bottom) assert.ok(Math.abs(x - esoAt(y).c) < 1e-9, `the middle of the esophagus at ${y}, all the esophageal balloon's length`);
    else if (y <= 249) { const e = esoAt(y); assert.ok(e.h - Math.abs(x - e.c) >= 4, `inside the esophagus's walls at ${y}`); }
    else if (y <= 253) assert.ok(Math.abs(x - MOUTH[0]) <= esoAt(251).h - 3, `through the cardia's opening at ${y}`);
    else assert.ok(clearance([x, y], STOMACH) >= 3, `inside the stomach at ${x.toFixed(1)}, ${y.toFixed(1)}`);
  }
  // Past the bend it is the axis itself, through the balloon from its upper end to its lower and the tail beyond.
  const [dx, dy] = f.dir, onAxis = P.pts.filter((p) => dist(p, f.p0) < 1e-6 || ((p[0] - f.p0[0]) * dx + (p[1] - f.p0[1]) * dy) > 0.5);
  assert.ok(onAxis.length > 10);
  for (const p of onAxis) assert.ok(Math.abs((p[0] - f.p0[0]) * -dy + (p[1] - f.p0[1]) * dx) < 1e-9, 'on the axis');
  const tip = P.pts[P.pts.length - 1];
  assert.ok(dist(tip, f.p0) > f.L, 'the tip is past the balloon');
  assert.ok(Math.abs(dist(tip, f.p0) - (f.L + GAS.tail + GAS.slack)) < 1e-9, 'before the traction it rests the slack further in');
  assert.ok(clearance(tip) >= GAS.margin, 'the tip is inside the stomach too');
  for (let i = 1; i < P.arc.length; i++) assert.ok(P.arc[i] > P.arc[i - 1], 'one steady run');
  // The bend is gentle: no turn of more than 40° between two steps.
  for (let i = 2; i < P.pts.length; i++) {
    const a = [P.pts[i - 1][0] - P.pts[i - 2][0], P.pts[i - 1][1] - P.pts[i - 2][1]], b = [P.pts[i][0] - P.pts[i - 1][0], P.pts[i][1] - P.pts[i - 1][1]];
    const turn = Math.acos(Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b))));
    assert.ok(turn < (40 * Math.PI) / 180, `a turn of ${((turn * 180) / Math.PI).toFixed(0)}° at ${P.pts[i].map((v) => v.toFixed(0))}`);
  }
});

test('the tube slides in: its tip goes down the esophagus and into the stomach as it advances, and the points before it do not move', () => {
  const P = tubePath(), tipOf = (a, q = 0) => tubeTo(a, q).at(-1);
  let last = -Infinity;
  for (const a of steps(20)) { const y = tipOf(a)[1]; assert.ok(y >= last - 1e-9, 'the tip never goes back'); last = y; }
  assert.deepEqual(tipOf(1), P.pts[P.pts.length - 1], 'in, it rests a little past where the traction will leave it');
  assert.ok(tubeTo(0).length >= 2, 'a line even at the start');
  assert.ok(tipOf(0.5)[1] < 232, 'half way in it is still in the esophagus');
  const part = tubeTo(0.6), whole = tubeTo(1);
  for (let i = 0; i < part.length - 1; i++) assert.deepEqual(part[i], whole[i]);
});

test('the traction draws the tip up by the slack, the way the balloon is drawn up, and the tube ends where the balloon and its tail say', () => {
  const P = tubePath(), f = fitGas();
  assert.ok(Math.abs(tubeTip(1, 0) - tubeTip(1, 1) - GAS.slack) < 1e-9);
  assert.ok(Math.abs(P.total - P.final - GAS.slack) < 1e-9);
  const rest = pathAt(tubeTip(1, 1)).p;
  assert.ok(Math.abs(dist(rest, f.p0) - (f.L + GAS.tail)) < 1e-6, 'drawn up, the tip is the tail past the balloon');
  const loose = pathAt(tubeTip(1, 0)).p;
  assert.ok(Math.abs(dist(loose, f.p0) - (f.L + GAS.tail + GAS.slack)) < 1e-6);
  // The balloon is never past the tip, however far the tube has been drawn: its lower end is the tail short of it.
  for (const q of steps(10)) {
    const s = gasShape(1, q), end = [s.p0[0] + s.dir[0] * s.L, s.p0[1] + s.dir[1] * s.L], tip = pathAt(tubeTip(1, q)).p;
    assert.ok(Math.abs(dist(end, tip) - GAS.tail) < 1e-6, `q ${q}`);
  }
});

test('the balloons lie collapsed on the tube and ride in with it: each sits its own distance behind the tip, and shows only as far as the tube has come', () => {
  const P = tubePath(), home = sheathArcs(P.final);
  assert.ok(home.eso[0] < home.eso[1] && home.eso[1] < home.gas[0] && home.gas[0] < home.gas[1], 'the esophageal balloon above the gastric one, on one tube');
  assert.ok(home.gas[0] - home.eso[1] > 6, 'a stretch of bare tube between them');
  // Drawn up (the tube at rest), the esophageal sheath is where balloon-eso.js has the balloon, the gastric one where the pear starts.
  assert.ok(Math.abs(pathAt(home.eso[0]).p[1] - BALLOON.top) < 0.5 && Math.abs(pathAt(home.eso[1]).p[1] - BALLOON.bottom) < 0.5);
  assert.ok(dist(pathAt(home.gas[0]).p, fitGas().p0) < 1e-6);
  // Half way in, the tip is where the sheaths' own lengths are behind it.
  const tip = tubeTip(0.5, 0), s = sheathArcs(tip);
  assert.ok(Math.abs((tip - s.gas[1]) - (P.final - home.gas[1])) < 1e-9, 'the same distance behind the tip');
  assert.ok(Math.abs((tip - s.eso[0]) - (P.final - home.eso[0])) < 1e-9);
  // Not yet in view: nothing of it (the esophageal sheath's top is still above the start of the path).
  assert.equal(sheath(...sheathArcs(tubeTip(0.1, 0)).eso, () => 1), null);
  // Part in view: a ring that stops at the path's start and does not run on beyond the tip.
  const a = sheathArcs(tubeTip(0.45, 0)), r = sheath(a.eso[0], a.eso[1], () => 1.6);
  assert.ok(r && r.ring.length > 6);
  for (const [, y] of r.ring) assert.ok(y >= BALLOON.from - 2 && y <= pathAt(tubeTip(0.45, 0)).p[1] + 1e-6);
});

test('the sheath of the esophageal balloon is the balloon at no inflation, so it fills out of it without a jump', () => {
  const a = sheathArcs(tubeTip(1, 1)), half = (t) => Math.max(BALLOON.shaftR, BALLOON.sleeve * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)));
  const sh = sheath(a.eso[0], a.eso[1], half), ball = balloonShape(0);
  for (const [x, y] of sh.ring) assert.ok(Math.abs(Math.abs(x - esoAt(y).c) - ball.half(y)) < 0.25, `at ${y.toFixed(1)}`);
  assert.ok(Math.abs(arcAtY(BALLOON.bottom) - a.eso[1]) < 1e-9);
});

test('the gastric balloon at no inflation is its sheath, so it fills out of it without a jump', () => {
  for (const q of [0, 1]) {
    const gs = gasShape(0, q), a = sheathArcs(tubeTip(1, q)), sh = sheath(a.gas[0], a.gas[1], () => GAS.neck);
    const edge = (ring) => ring.map(([x, y]) => Math.abs(clearanceToAxis([x, y], gs)));
    for (const w of edge(sh.ring)) assert.ok(Math.abs(w - GAS.neck) < 1e-6, `q ${q}`);
    assert.ok(dist(sh.ring[0], gs.p0) < GAS.neck + 1e-6);
  }
});
function clearanceToAxis([x, y], gs) { return (x - gs.p0[0]) * -gs.dir[1] + (y - gs.p0[1]) * gs.dir[0]; }

test('the traction arrow rises beside the bare tube, clear of the esophagus wall and above the esophageal balloon', () => {
  const a = pullArrow();
  for (const [x, y] of [...a.line, ...a.head]) {
    const e = esoAt(y);
    assert.ok(x - e.c - e.h >= 4, `clear of the wall at ${y}`);
    assert.ok(y < BALLOON.top - 8, 'above the balloon');
  }
  const [tip, l, r] = a.head;
  assert.ok(tip[1] < l[1] && tip[1] < r[1], 'the head points up');
  assert.ok(a.line[0][1] > a.line.at(-1)[1], 'the shaft runs up');
  assert.equal(tip[1], PULL.to);
});
