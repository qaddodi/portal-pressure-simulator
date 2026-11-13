// The tamponade tube's gastric balloon (balloon-gas.js) is the first step: filled in the stomach, the tube drawn up so it seats against the
// cardia. It must stay inside the stomach as drawn at every stage (Mohammad, 31 Oct: "the gastric balloon has to remain within the bounds of
// the stomach"), and it is fitted to the stomach's own outline, not to fixed coordinates. Drawn up it gives against the gastro-esophageal
// junction from the stomach's side (Mohammad, 1 Nov: "deform a bit against the GE junction from the gastric side"): softly, only there,
// and never through the wall.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAS, outlineOf, stomachOutline, paintedOutline, standoffAt, wallPress, bendArc, clearance, fitGas, gasShape, tubePath, tubeTip, tubeTo, pathAt, arcAtY, sheath, sheathArcs, pullArrow, PULL } from '../src/ui/balloon-gas.js';
import { balloonShape, smoothPath } from '../src/ui/balloon-eso.js';
import { esoAt, BALLOON } from '../src/ui/balloon-eso.js';
import { SEAM_D } from '../src/ui/anatomy.js';

const STOMACH = stomachOutline(), PAINTED = paintedOutline(), MOUTH = [esoAt(251).c, 251];
const steps = (n) => Array.from({ length: n + 1 }, (_, i) => i / n);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('the wall is the outline as the stage paints it: the cardia and the body are in, the esophagus runs into it, the spleen is out', () => {
  assert.ok(PAINTED.length > 60 && STOMACH.length > 40);
  assert.ok(clearance([870, 300]) > 20, 'the fundus is well inside');
  assert.ok(clearance([MOUTH[0], 200]) > 3, 'the esophagus above the cardia is one shape with the stomach, so it is inside');
  assert.ok(clearance([MOUTH[0], 200], STOMACH) < 0, 'the stomach path itself stops at the cardia');
  assert.ok(clearance([1040, 360]) < 0, 'the spleen is not the stomach');
  assert.ok(clearance([MOUTH[0] + 10, 252]) > 0 && clearance([MOUTH[0], 252]) > 3, 'the cardia is open: the opening is inside the painted outline');
  assert.equal(PAINTED.length, outlineOf(SEAM_D).length);
});

test('the gastric balloon stays inside the stomach at every inflation and every stage of the traction, off the wall by its standoff (the margin, less at the junction where it presses)', () => {
  for (const k of steps(20)) for (const q of steps(10)) {
    const s = gasShape(k, q);
    for (const p of s.outline) {
      assert.ok(clearance(p) >= standoffAt(p) - 1e-6, `k ${k} q ${q}: ${p.map((v) => v.toFixed(1))} is ${clearance(p).toFixed(2)} from the wall, its standoff ${standoffAt(p).toFixed(2)}`);
      assert.ok(clearance(p) > 0.5, 'always inside, with the wall line and the balloon\'s edge clear of each other');
      // (Away from the junction the stomach path and the painted outline are one wall: the full margin from it.)
      if (Math.hypot(p[0] - MOUTH[0], p[1] - MOUTH[1]) > GAS.reach[1]) assert.ok(clearance(p, STOMACH) >= GAS.margin - GAS.nudge - 1e-6, `k ${k} q ${q}: clear of the stomach's own outline away from the cardia`);
    }
  }
});

test('its rims, which the latex is drawn with, lie inside it', () => {
  const s = gasShape(1, 1);
  for (const f of [0.86, 0.7]) for (const p of s.ring(f)) assert.ok(clearance(p) >= standoffAt(p) - 1e-6);
});

test('the balloon is fitted to the stomach it is given, not to fixed coordinates', () => {
  const home = fitGas();
  // A stomach under a third the size about the cardia: the balloon is smaller, and still inside it.
  const small = PAINTED.map(([x, y]) => [MOUTH[0] + (x - MOUTH[0]) * 0.3, MOUTH[1] + (y - MOUTH[1]) * 0.3]), fs = fitGas(small, MOUTH);
  assert.ok(fs.b < home.b, `${fs.b.toFixed(1)} against ${home.b.toFixed(1)}`);
  for (const k of [1]) for (const q of [0, 1]) {
    const s = gasShape(k, q, 40, fs);
    for (const p of s.outline) assert.ok(clearance(p, small) >= standoffAt(p, MOUTH) - 0.3, `smaller stomach, q ${q}: ${clearance(p, small).toFixed(2)}`);
  }
  // The same stomach and cardia moved over: the balloon moves with them.
  const dx = 31, dy = 14, moved = PAINTED.map(([x, y]) => [x + dx, y + dy]), fm = fitGas(moved, [MOUTH[0] + dx, MOUTH[1] + dy]);
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
  // Its upper end is where the tube's bend ends, at the cardia: the bend from the esophageal balloon's lower end into the axis.
  const end = bendArc(f.deg).at(-1), eb = BALLOON.bottom - GAS.lead, E = [esoAt(eb).c, eb];
  assert.ok(dist(seated.p0, [E[0] + end[0], E[1] + end[1]]) < 1e-9, 'its upper end is where the bend ends');
  const near = (s) => Math.min(...s.outline.map((p) => dist(p, MOUTH)));
  assert.ok(near(seated) < near(loose) - 1, 'the balloon is closer to the cardia once drawn up');
  assert.ok(near(seated) <= 3.5, `against the cardia: ${near(seated).toFixed(1)} from the middle of its opening`);
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
    if (y <= BALLOON.bottom - GAS.lead) assert.ok(Math.abs(x - esoAt(y).c) < 1e-9, `the middle of the esophagus at ${y}, down to where the bend starts`);
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
  // The bend is one smooth curve at the cardia, from the esophagus's line into the axis (about half a right angle, a radius of GAS.bend): no step turns more than 15°, no corner, no hook.
  for (let i = 2; i < P.pts.length; i++) {
    const a = [P.pts[i - 1][0] - P.pts[i - 2][0], P.pts[i - 1][1] - P.pts[i - 2][1]], b = [P.pts[i][0] - P.pts[i - 1][0], P.pts[i][1] - P.pts[i - 1][1]];
    const turn = Math.acos(Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b))));
    assert.ok(turn < (15 * Math.PI) / 180, `a turn of ${((turn * 180) / Math.PI).toFixed(0)}° at ${P.pts[i].map((v) => v.toFixed(0))}`);
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
  // (Its middle is the tube's line: the esophagus's middle, and the start of the bend at its lower end.)
  const mid = (y) => pathAt(arcAtY(y)).p[0];
  for (const [x, y] of sh.ring) assert.ok(Math.abs(Math.abs(x - mid(y)) - ball.half(y)) < 0.25, `at ${y.toFixed(1)}`);
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

// ── The give against the junction ──────────────────────
const moved = (s) => s.given.map((p, i) => dist(p, s.raw[i]));   // (the give of the wall: the skin pressed in, before the cardia's hold draws it out: snugPress)
const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, u = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0; return Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy); };
const toRing = (ring, p) => Math.min(...ring.map((a, i) => segDist(p, a, ring[(i + 1) % ring.length])));
const hausdorff = (A, B) => Math.max(...A.map((p) => toRing(B, p)), ...B.map((p) => toRing(A, p)));

test('drawn up, the balloon gives against the gastro-esophageal junction: a visible flattening there, a little more with every unit of traction, and none elsewhere', () => {
  const full = (q) => gasShape(1, q), deepest = (q) => Math.max(...moved(full(q)));
  // At full traction it is pressed in by a couple of units, no more than the limit, and not a hair's breadth.
  assert.ok(deepest(1) >= 1.5, `${deepest(1).toFixed(2)} units`);
  assert.ok(deepest(1) <= GAS.push + 1e-9);
  // It grows with the traction, never going back.
  let last = -1;
  for (const q of steps(20)) { const d = deepest(q); assert.ok(d >= last - 1e-9, `q ${q}`); last = d; }
  assert.ok(deepest(1) > deepest(0.5) + 0.5 && deepest(0.5) > deepest(0.2));
  // It is the junction that presses: every point that gives by more than the wall's own softness is within the junction's reach of the cardia.
  const s = full(1);
  s.given.forEach((p, i) => {
    const d = dist(p, s.raw[i]), r = dist(p, MOUTH);
    if (d > GAS.nudge) assert.ok(r <= GAS.reach[1], `a point ${r.toFixed(0)} from the cardia gave by ${d.toFixed(2)}`);
  });
  // The rest of the balloon is the free pear: it is only the skin near the junction that moves.
  const far = s.given.filter((p) => dist(p, MOUTH) > GAS.reach[1]);
  assert.ok(far.length > 20);
  s.given.forEach((p, i) => { if (dist(p, MOUTH) > GAS.reach[1]) assert.ok(dist(p, s.raw[i]) <= GAS.nudge, 'the far skin is the free pear'); });
  // Collapsed on the tube it presses on nothing.
  for (const q of steps(4)) assert.ok(Math.max(...moved(gasShape(0, q))) < 0.05, `collapsed, q ${q}`);
});

test('the give is soft: no corner where the skin meets the wall, and the outline changes in small steps as the traction and the filling go on', () => {
  const turn = (ring) => {
    let worst = 0;
    ring.forEach((b, i) => {
      const a = ring[(i + ring.length - 1) % ring.length], c = ring[(i + 1) % ring.length], u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
      worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v) || 1)))));
    });
    return (worst * 180) / Math.PI;
  };
  for (const q of [0.5, 0.75, 1]) assert.ok(turn(gasShape(1, q).outline) < 40, `q ${q}: a turn of ${turn(gasShape(1, q).outline).toFixed(0)}° between two steps of the outline`);
  // (the shape, not its points: how far one outline is from the next, 1/50th of the way on, in either direction)
  for (let i = 0; i < 50; i += 3) {
    const q = i / 50, k = i / 50;
    assert.ok(hausdorff(gasShape(1, q).outline, gasShape(1, q + 0.02).outline) < 0.9, `traction at ${q}`);
    assert.ok(hausdorff(gasShape(k + 0.0001, 1).outline, gasShape(k + 0.02, 1).outline) < 0.9, `filling at ${k}`);
  }
});

test('drawn up, the balloon lies snug against the wall all across the cardia: the lesser curvature below the opening as well as the roof beside it', () => {
  const s = gasShape(1, 1), { p0, dir } = s;
  // The lesser curvature's side of the pear: the left of its axis (down the stomach), 16 … 26 from the cardia, the side the pear alone left about ten off the wall.
  const lesser = (ring) => ring.filter((p) => dist(p, MOUTH) >= 16 && dist(p, MOUTH) <= GAS.reach[0] && (p[0] - p0[0]) * -dir[1] + (p[1] - p0[1]) * dir[0] > 0);
  const gap = (ring) => { const c = lesser(ring).map((p) => clearance(p)); return c.reduce((a, v) => a + v, 0) / c.length; };
  assert.ok(lesser(s.outline).length >= 4);
  for (const p of lesser(s.outline)) assert.ok(clearance(p) <= standoffAt(p) + 3.5, `${p.map((v) => v.toFixed(1))} stands ${clearance(p).toFixed(1)} off the wall`);
  assert.ok(gap(s.given) > 8, `the pear alone: ${gap(s.given).toFixed(1)} off`);
  // It is the traction that draws it out, and the filling: the further along, the nearer the wall, and collapsed it is the pear's.
  assert.ok(gap(gasShape(1, 0.5).outline) < gap(s.given) && gap(s.outline) < gap(gasShape(1, 0.5).outline));
  assert.ok(gap(gasShape(0.5, 1).outline) > gap(s.outline));
  for (const q of steps(4)) assert.ok(Math.max(...gasShape(0, q).outline.map((pt, i) => dist(pt, gasShape(0, q).raw[i] || pt))) < 0.05, `collapsed, q ${q}`);
  // The skin's top at the opening stays on the tube (the neck), and across the cardia it spreads to both sides of it.
  const left = s.outline.reduce((a, p) => (dist(p, MOUTH) <= GAS.reach[1] && p[0] < a[0] ? p : a), [1e9, 0]), right = s.outline.reduce((a, p) => (dist(p, MOUTH) <= GAS.reach[1] && p[0] > a[0] ? p : a), [-1e9, 0]);
  assert.ok(right[0] - left[0] > 2 * esoAt(251).h, `the skin spans ${(right[0] - left[0]).toFixed(1)} across the cardia`);
});

test('wallPress: a ring clear of the wall is left alone, and one through it is brought back in, softly, to rest off the wall', () => {
  const M = MOUTH;
  const circle = (c, r, n = 48) => Array.from({ length: n }, (_, i) => [c[0] + r * Math.cos((2 * Math.PI * i) / n), c[1] + r * Math.sin((2 * Math.PI * i) / n)]);
  const free = circle([880, 330], 15), left = wallPress(free);
  assert.deepEqual(left.ring, free, 'clear of the wall: not a point moved');
  assert.ok(left.deepest < 1e-3);
  // Through the roof at the junction: back in, off it by about the seat.
  const through = circle([M[0] + 14, M[1] + 8], 12), back = wallPress(through, PAINTED, M);
  assert.ok(back.deepest > 3, 'it was pressed on');
  for (const p of back.ring) assert.ok(clearance(p) >= GAS.seat - 0.2, `at ${p.map((v) => v.toFixed(1))}: ${clearance(p).toFixed(2)}`);
  // Through the greater curvature, far from the cardia: the same, to the margin there (the standoff eases from the seat to the margin).
  const out = circle([960, 400], 25), farBack = wallPress(out, PAINTED, M);
  for (const p of farBack.ring) assert.ok(clearance(p) >= GAS.margin - 0.3, `far from the cardia: ${clearance(p).toFixed(2)}`);
  // The standoff: the seat at the cardia, the margin beyond the junction's reach, between them in between.
  assert.equal(standoffAt(M, M), GAS.seat);
  assert.equal(standoffAt([M[0] + GAS.reach[1] + 1, M[1]], M), GAS.margin);
  const mid = standoffAt([M[0] + (GAS.reach[0] + GAS.reach[1]) / 2, M[1]], M);
  assert.ok(mid > GAS.seat && mid < GAS.margin);
});

test('the fit keeps the full size with the give: the balloon is as large as before, only its skin is pressed, and it presses on the junction rather than elsewhere', () => {
  const f = fitGas();
  assert.equal(f.b, GAS.bMax);
  assert.equal(f.poly, PAINTED);
  // Its cone is at the opening, where the tube's bend ends, and it presses on the roof round it, not on the lesser curvature below.
  const s = gasShape(1, 1), by = moved(s), at = s.given[by.indexOf(Math.max(...by))];
  assert.ok(dist(at, MOUTH) < GAS.reach[0] + 4, `the deepest give is ${dist(at, MOUTH).toFixed(0)} from the cardia`);
  assert.ok(at[1] < MOUTH[1] + 12, 'on the roof, not down the wall');
});

test('the tube is drawn as one smooth curve from the esophagus into the balloon, at every stage: no corner, no loop, no break at the cardia', () => {
  // The curve the stage draws (a smooth path through the tube's points), sampled finely, and the heading at each sample.
  const sample = (pts) => {
    const n = smoothPath(pts).match(/-?\d+\.?\d*/g).map(Number), out = [[n[0], n[1]]];
    let cur = [n[0], n[1]];
    for (let i = 2; i + 5 < n.length + 1; i += 6) {
      const c1 = [n[i], n[i + 1]], c2 = [n[i + 2], n[i + 3]], e = [n[i + 4], n[i + 5]];
      for (let s = 1; s <= 12; s++) { const u = s / 12, m = 1 - u; out.push([m ** 3 * cur[0] + 3 * m * m * u * c1[0] + 3 * m * u * u * c2[0] + u ** 3 * e[0], m ** 3 * cur[1] + 3 * m * m * u * c1[1] + 3 * m * u * u * c2[1] + u ** 3 * e[1]]); }
      cur = e;
    }
    return out;
  };
  const worstTurn = (line) => {
    let worst = 0;
    for (let i = 2; i < line.length; i++) {
      const a = [line[i - 1][0] - line[i - 2][0], line[i - 1][1] - line[i - 2][1]], b = [line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]];
      if (Math.hypot(...a) < 1e-6 || Math.hypot(...b) < 1e-6) continue;
      worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b))))));
    }
    return (worst * 180) / Math.PI;
  };
  const P = tubePath();
  for (const a of Array.from({ length: 29 }, (_, i) => 0.3 + i * 0.025)) for (const q of [0, 0.5, 1]) {   // (the tube as it slides in, the tip in the esophagus, through the bend and in the stomach)
    const line = sample(tubeTo(a, q, P));
    assert.ok(worstTurn(line) < 7, `advance ${a}, traction ${q}: a turn of ${worstTurn(line).toFixed(1)}° between samples a twelfth of a step apart`);
  }
  // The radius of the bend is about GAS.bend where it is tightest (the drawn curve is the arc, not a corner rounded off).
  const line = sample(tubeTo(1, 1, P));
  // (Each radius is the circle through three samples half a step apart: the path's numbers are written to two decimals, and at a
  // twelfth of a step that rounding alone reads as a bend several units tight.)
  let tight = Infinity;
  for (let i = 6; i + 6 < line.length; i += 1) {
    const A = line[i - 6], B = line[i], C = line[i + 6], ab = dist(A, B), bc = dist(B, C), ca = dist(C, A);
    const area2 = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]));
    if (area2 > 1e-6 && ab > 1e-6 && bc > 1e-6) tight = Math.min(tight, (ab * bc * ca) / (2 * area2));
  }
  assert.ok(tight >= GAS.bend * 0.6, `the tightest curve has a radius of ${tight.toFixed(1)}, the bend's is ${GAS.bend}`);
});
