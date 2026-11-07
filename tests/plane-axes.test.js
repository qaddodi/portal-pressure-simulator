// The wedge against the portal pressure is a scatter, a plane with no zones, so it has no coloured shape whose edge could stand for an axis.
// It draws its own (1 Nov, Mohammad on slide 7 of the lobule talk: "this card is good but no axes?! something seems off"): the app's chart
// panel, hairline gridlines at the numbers, an axis line on the left and along the foot with a short tick at each number, every number kept
// (the old plane dropped the 30s where the axes' names stood on their row), one 0 for the origin, and the two names each on a row of their
// own. The lines, numbers and names are pure functions of the plot's size, checked here at the sizes the app draws it at.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { planeOf, hasAxes, axesFrame, axesMarks, scaler, diagOf, layoutPlane, pointR, PAD, AX_TICK } from '../src/ui/visual-plane.js';

const relation = (id) => planeOf(DECKS.find((d) => d.id === id).slides.find((s) => s.id === 'relation').plane);
const wedge = relation('lobule');
// [W, H, fs]: the plot sizes the app draws it at (read off the page, app.css .pze-plot): a Mac, an upright iPad, a sideways iPad, a phone held sideways, an
// iPhone, a 375 px and a 320 px phone; then two synthetic small ones for the numbers and names.
const REAL = [[910, 396, 15.6], [540, 574, 16.7], [800, 361, 12], [1154, 258, 15.6], [340, 362, 17.4], [325, 346, 17.4], [315, 336, 17.4]];
const SIZES = [...REAL, [300, 300, 17.4], [300, 282, 12]];
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, m ?? `${a} is ${b}`);
const touch = (a, o) => a[0] < o[2] && a[2] > o[0] && a[1] < o[3] && a[3] > o[1];

test('only a plane with no zones has axes: the lobule wedge scatter has, the zone planes keep their shape\'s edge', () => {
  assert.equal(wedge.zones.length, 0);
  assert.equal(hasAxes(wedge), true);
  assert.equal(hasAxes(planeOf('csph')), false);
  assert.equal(hasAxes(planeOf('hvpg-ppg')), false);
  assert.equal(hasAxes(relation('where-resistance')), false, 'the HVPG against portal pressure plane has zones');
  assert.equal(hasAxes({ ...planeOf('csph'), axes: true }), true, 'a plane can ask for them');
  assert.equal(hasAxes({ ...wedge, axes: false }), false, 'or leave them off');
});

test('both axes of the wedge scatter run 0 to 30 mmHg, with a number at every 10 including the top', () => {
  assert.deepEqual([wedge.x.min, wedge.x.max, wedge.y.min, wedge.y.max], [0, 30, 0, 30]);
  assert.deepEqual(wedge.x.ticks, [0, 10, 20, 30]);
  assert.deepEqual(wedge.y.ticks, [0, 10, 20, 30]);
});

test('each axis is linear, the origin is the plot\'s corner and the top of each axis its far edge', () => {
  for (const [W, H, fs] of SIZES) {
    const fr = axesFrame(wedge, W, H, fs), { X, Y } = scaler(wedge, fr);
    assert.ok(fr.L > 0 && fr.R < W && fr.T > 0 && fr.B < H && fr.R - fr.L > 100 && fr.B - fr.T > 100, `a plot area at ${W}x${H}`);
    near(X(0), fr.L); near(X(30), fr.R); near(Y(0), fr.B); near(Y(30), fr.T);
    for (const v of [5, 10, 15, 20, 25]) {
      assert.ok(Math.abs((X(v) - X(0)) / (X(30) - X(0)) - v / 30) < 1e-9, `x linear at ${v}`);
      assert.ok(Math.abs((Y(0) - Y(v)) / (Y(0) - Y(30)) - v / 30) < 1e-9, `y linear at ${v}`);
    }
    // (The dashed line is where the two readings are equal: from one corner of the plot to the other, whatever the plot's shape.)
    const d = diagOf(wedge, X, Y, fs);
    [d.seg.x1, d.seg.y1, d.seg.x2, d.seg.y2].forEach((v, i) => near(v, [fr.L, fr.B, fr.R, fr.T][i], 'the diagonal runs corner to corner'));
    // (A reading of 20.5 and 20.0 is drawn 0.5 mmHg right of the line's 20, on the line's 20 level: a point's place is its data's.)
    near(Y(20.0), d.seg.y1 - (d.seg.y1 - d.seg.y2) * 20 / 30);
  }
});

test('the numbers: every tick is written, the origin once, none inside the plot, none on another, none past the panel', () => {
  for (const [W, H, fs] of SIZES) {
    const fr = axesFrame(wedge, W, H, fs), { X, Y } = scaler(wedge, fr), m = axesMarks(wedge, fr, X, Y, fs, W);
    const texts = m.nums.map((n) => n.text).sort();
    assert.deepEqual(texts, ['0', '10', '10', '20', '20', '30', '30'], `x and y numbers 10, 20, 30 and one 0 at ${W}x${H}`);
    const all = [...m.nums, ...m.names];
    for (const n of all) {
      assert.ok(n.box[0] >= PAD && n.box[2] <= W - PAD && n.box[1] >= PAD && n.box[3] <= H - PAD, `"${n.text}" inside the panel's padding at ${W}x${H}: ${n.box.map(Math.round)}`);
      if (n.cls === 'pze-t') assert.ok(!touch(n.box, [fr.L, fr.T, fr.R, fr.B]), `"${n.text}" outside the plot`);
    }
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(!touch(all[i].box, all[j].box), `"${all[i].text}" and "${all[j].text}" apart at ${W}x${H}`);
    // (The x name is on a row of its own, under the numbers; the y name on one above the plot.)
    const xn = m.names.find((n) => n.anchor === 'middle'), yn = m.names.find((n) => n.anchor === 'start');
    assert.ok(xn.box[1] >= Math.max(...m.nums.filter((n) => n.y === fr.numBase).map((n) => n.box[3])), `the x name under the x numbers at ${W}x${H}`);
    assert.ok(yn.box[3] <= fr.T - fs * 0.3, `the y name above the plot at ${W}x${H}`);
    assert.ok(Math.min(...m.nums.filter((n) => n.anchor === 'end' && n.y !== fr.numBase).map((n) => n.box[2])) <= fr.L - AX_TICK, 'the y numbers left of the ticks');
  }
});

test('the names are the axes\' own words where they fit, the short form on a plot too narrow for them, never cut', () => {
  const at = (W, fs) => { const fr = axesFrame(wedge, W, 300, fs), { X, Y } = scaler(wedge, fr); return axesMarks(wedge, fr, X, Y, fs, W).names.map((n) => n.text); };
  for (const [W, , fs] of SIZES) assert.deepEqual(at(W, fs), ['Portal vein pressure, mmHg', 'Wedged pressure, mmHg'], `the full names at ${W} px`);
  assert.deepEqual(at(240, 17.4), ['Portal, mmHg', 'WHVP, mmHg'], 'the short names where the full ones have no room');
});

test('the gridlines, axis lines and ticks: a gridline at each number above the first, the axes meet at the origin, a tick at every number', () => {
  const [W, H, fs] = SIZES[0], fr = axesFrame(wedge, W, H, fs), { X, Y } = scaler(wedge, fr), m = axesMarks(wedge, fr, X, Y, fs, W);
  assert.equal(m.grid.length, 6, 'three upright and three level');
  assert.deepEqual(m.grid.filter((g) => g.x1 === g.x2).map((g) => g.x1).sort((a, b) => a - b), [10, 20, 30].map(X));
  assert.deepEqual(m.grid.filter((g) => g.y1 === g.y2).map((g) => g.y1).sort((a, b) => a - b), [30, 20, 10].map(Y));
  assert.deepEqual(m.axes, [{ x1: fr.L, y1: fr.T, x2: fr.L, y2: fr.B }, { x1: fr.L, y1: fr.B, x2: fr.R, y2: fr.B }]);
  assert.equal(m.ticks.length, 8, 'a tick at each of the four numbers on each axis');
  for (const t of m.ticks) assert.ok(Math.hypot(t.x2 - t.x1, t.y2 - t.y1) === AX_TICK, 'each tick is AX_TICK long, outside the axis');
});

// The six points as the page draws them (the lobule talk's readings, as the tiles print them).
const POINTS = [['Healthy', '', 7.8, 6.5], ['Cirrhosis', '', 22.5, 21.9], ['Sinusoidal obstruction', 'SOS', 15.6, 14.6], ['Heart failure', 'Heart', 20.5, 20.0],
  ['Schistosomiasis', 'Schisto', 20.6, 8.5], ['Portal vein clot', 'Clot', 19.4, 7.3]];

test('the dots are 8 px, smaller only where two lie close, so Schistosomiasis and a clot (1.2 mmHg apart each way) never run together', () => {
  const at = ([W, H, fs]) => { const fr = axesFrame(wedge, W, H, fs), { X, Y } = scaler(wedge, fr); return POINTS.map(([name, , x, y]) => ({ name, x: X(x), y: Y(y) })); };
  assert.equal(pointR(at(REAL[0])), 8, 'a Mac plot keeps its 8 px dots');
  assert.equal(pointR(at(REAL[1])), 8, 'and an upright iPad\'s');
  assert.equal(pointR(at(REAL[3])), 8, 'and a phone held sideways, wide as it is');
  assert.equal(pointR([{ x: 5, y: 5 }]), 8, 'a lone point has its 8 px');
  for (const sz of REAL) {
    const pts = at(sz), r = pointR(pts);
    assert.ok(r >= 5 && r <= 8, `a dot of ${r} px at ${sz.slice(0, 2).join('x')}`);
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const gap = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) - 2 * r;
      assert.ok(gap >= 3 || r === 5, `${pts[i].name} and ${pts[j].name} ${gap.toFixed(1)} px apart (disc to disc) at ${sz.slice(0, 2).join('x')}, dots of ${r}`);
    }
  }
  assert.ok(pointR(at(REAL[4])) < 8 && pointR(at(REAL[4])) >= 6, 'an iPhone\'s dots are a little smaller');
});

test('every point keeps a name beside it, clear of the dots, the dashed line, the axes\' words and the other names, at each plot size', () => {
  for (const [W, H, fs] of REAL) {
    const fr = axesFrame(wedge, W, H, fs), { X, Y } = scaler(wedge, fr), m = axesMarks(wedge, fr, X, Y, fs, W);
    const at = POINTS.map(([name, short, x, y]) => ({ name, short, x: X(x), y: Y(y), f: { pv: x, whvp: y } })), r = pointR(at);
    const { names } = layoutPlane(wedge, fr, X, Y, fs, at, false, [], r, 3);
    const label = diagOf(wedge, X, Y, fs).label.box;
    names.forEach((n, i) => {
      assert.ok(n, `${at[i].name} has a name at ${W}x${H}`);
      assert.ok(n.box[0] >= fr.L && n.box[2] <= fr.R && n.box[1] >= fr.T && n.box[3] <= fr.B, `${at[i].name}'s name inside the plot at ${W}x${H}`);
      for (const [j, o] of names.entries()) if (j !== i) assert.ok(!touch(n.box, [o.box[0] - 2, o.box[1] - 2, o.box[2] + 2, o.box[3] + 2]), `${at[i].name}'s name and ${at[j].name}'s at least 2 px apart at ${W}x${H}`);
      for (const [j, p] of at.entries()) assert.ok(!touch(n.box, [p.x - r, p.y - r, p.x + r, p.y + r]), `${at[i].name}'s name off ${at[j].name}'s dot at ${W}x${H}`);
      for (const w of m.nums) assert.ok(!touch(n.box, w.box), `${at[i].name}'s name off the number ${w.text} at ${W}x${H}`);
      assert.ok(!touch(n.box, label), `${at[i].name}'s name off the dashed line's own name at ${W}x${H}`);
    });
  }
});
