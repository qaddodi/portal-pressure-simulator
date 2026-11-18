// The flow and resistance plane (C1 of docs/recommendations/new-features-recs.md): portal flow across, the PPG up, a line from the origin for each
// resistance (ΔP = Q × R). The rays and their names are pure functions of the plot's size; each slide that uses the plane puts its patients where the
// model's own flow and PPG put them, and every ray is named once, inside the plot, clear of the points' boxes.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { deckStates } from './deck-states.js';
import { planeOf, hasAxes, axesFrame, scaler, isoOf, isoRays, lineBoxes, layoutPlane, shownReading, wasAt, PAD, PLANES } from '../src/ui/visual-plane.js';

const SIZES = [[910, 396, 15.6], [540, 574, 16.7], [340, 362, 17.4], [315, 336, 17.4]];
const deck = (id) => DECKS.find((d) => d.id === id);
const slides = [['circuit', 'flowres'], ['treatment', 'flowres'], ['circulation', 'flowres']];

test('the flow plane is a scatter of portal flow against the PPG, from the origin', () => {
  const pl = planeOf('flow-ppg');
  assert.deepEqual([pl.x.key, pl.y.key, pl.x.min, pl.y.min], ['pvFlow', 'ppg', 0, 0]);
  assert.equal(hasAxes(pl), true);
  assert.equal(pl.zones.length, 0);
  assert.equal(PLANES['flow-ppg'].cuts.y[0], 12, 'the PPG bleed cut-off, from the table');
});

test('a ray is y = R x: it starts at the origin, ends on the plot\'s edge, and its slope in the data is R', () => {
  for (const [W, H, fs] of SIZES) {
    const pl = planeOf({ base: 'flow-ppg', iso: { rays: [32, 4, 8] } }), fr = axesFrame(pl, W, H, fs), { X, Y } = scaler(pl, fr);
    const io = isoOf(pl, X, Y, fr, fs);
    assert.deepEqual(io.lines.map((l) => l.r), [4, 8, 32], 'in order of slope');
    for (const l of io.lines) {
      assert.ok(Math.abs(l.seg.x1 - X(0)) < 1e-6 && Math.abs(l.seg.y1 - Y(0)) < 1e-6, 'from the origin');
      const dx = (l.seg.x2 - l.seg.x1) / (fr.R - fr.L) * (pl.x.max - pl.x.min), dy = (l.seg.y1 - l.seg.y2) / (fr.B - fr.T) * (pl.y.max - pl.y.min);
      assert.ok(Math.abs(dy / dx - l.r) < 1e-6, `slope ${l.r}`);
      const onRight = Math.abs(l.seg.x2 - fr.R) < 1e-6, onTop = Math.abs(l.seg.y2 - fr.T) < 1e-6;
      assert.ok(onRight || onTop, `ray ${l.r} ends on the right or top edge`);
      const b = l.label.box;
      assert.ok(b[0] >= fr.L && b[2] <= fr.R + PAD && b[1] >= PAD && b[3] <= fr.B, `ray ${l.r}'s name is inside the plot at ${W}x${H}: ${b}`);
    }
  }
});

test('no rays without iso, or where an axis does not start at 0', () => {
  const pl = planeOf('flow-ppg'), fr = axesFrame(pl, 400, 300, 14), { X, Y } = scaler(pl, fr);
  assert.equal(isoOf({ ...pl, iso: undefined }, X, Y, fr), null);
  assert.equal(isoOf({ ...pl, x: { ...pl.x, min: 0.2 } }, X, Y, fr), null);
  assert.equal(planeOf('csph').iso, undefined);
});

test('the rays are lines the points\' names keep clear of', () => {
  const pl = planeOf('flow-ppg'), fr = axesFrame(pl, 540, 574, 16), { X, Y } = scaler(pl, fr);
  const io = isoOf(pl, X, Y, fr, 16), lb = lineBoxes(pl, X, Y, fr, 16);
  for (const b of io.boxes.slice(0, io.boxes.length - io.lines.length)) assert.ok(lb.some((o) => o[0] === b[0] && o[1] === b[1]), 'every ray box is among the line boxes');
});

test('each slide on the plane puts every patient where the model\'s own flow and PPG are, laid out with every name or a lead line', async () => {
  for (const [id, sid] of slides) {
    const d = deck(id), s = d.slides.find((x) => x.id === sid), st = await deckStates(d);
    assert.ok(s, `${id} has the slide`);
    assert.equal(s.visual, 'plane');
    const pl = planeOf(s.plane);
    assert.ok(pl && hasAxes(pl) && pl.iso, `${id}: the plane has rays`);
    const fpOf = (x) => st[d.slides.findIndex((y) => y.id === x)];
    for (const o of s.of) {
      assert.ok(fpOf(o.id), `${id}: ${o.id} has a state`);
      if (o.from) assert.ok(fpOf(o.from), `${id}: ${o.id} starts from a slide with a state`);
    }
    for (const [W, H, fs] of SIZES) {
      const fr = axesFrame(pl, W, H, fs), { X, Y } = scaler(pl, fr);
      const at = s.of.map((o) => { const f = shownReading(pl, fpOf(o.id)); return { name: o.name, short: o.short, f, x: X(f.pvFlow), y: Y(f.ppg), was: wasAt(pl, o.from ? fpOf(o.from) : null, X, Y) }; });
      for (const p of at) assert.ok(p.x >= fr.L && p.x <= fr.R && p.y >= fr.T && p.y <= fr.B, `${id}/${p.name} is inside the plot at ${W}x${H} (${p.f.pvFlow}, ${p.f.ppg})`);
      const { names } = layoutPlane(pl, fr, X, Y, fs, at, false, [], 6, 3);
      assert.deepEqual(at.filter((p, i) => !names[i]).map((p) => p.name), [], `${id} at ${W}x${H}: every patient is named`);
    }
  }
});

test('a drug that cuts the inflow moves the patient left; carvedilol stays near its line and a TIPS drops to a lower one', async () => {
  const d = deck('treatment'), st = await deckStates(d), at = (i) => st[d.slides.findIndex((s) => s.id === i)];
  const r = (i) => at(i).ppg / at(i).pvFlow, base = at('target');
  for (const i of ['prop', 'carv', 'oct', 'terli']) assert.ok(at(i).pvFlow < base.pvFlow, `${i}: less inflow`);
  assert.ok(Math.abs(r('carv') - r('target')) / r('target') < 0.1, 'carvedilol stays near the starting line');
  for (const i of ['prop', 'oct', 'terli']) assert.ok(r(i) > r('target'), `${i}: the pressure falls less than the flow`);
  assert.ok(r('vs') < r('target') / 2, 'a TIPS drops the patient onto a much lower line');
  const c = deck('circuit'), cs = await deckStates(c), cq = (i) => cs[c.slides.findIndex((s) => s.id === i)];
  assert.ok(cq('meal').pvFlow > cq('ohm').pvFlow && cq('both').pvFlow > cq('resist').pvFlow, 'a meal moves right');
  assert.ok(cq('resist').ppg / cq('resist').pvFlow > 2 * (cq('ohm').ppg / cq('ohm').pvFlow), 'cirrhosis lifts the patient onto a steeper line');
});

test('the rays\' names never touch each other, another ray or a point, at every width (B22: R = 40, 30, 20 ran together on a phone, R = 5 stood under a dot)', () => {
  const meets = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  for (const rays of [[40, 30, 20, 10, 5], [32, 16, 8, 4], [24, 16, 8, 4]]) for (const [W, H, fs] of [...SIZES, [375, 420, 16], [330, 300, 14]]) {
    const pl = planeOf({ base: 'flow-ppg', iso: { rays } }), fr = axesFrame(pl, W, H, fs), { X, Y } = scaler(pl, fr);
    // (A point on each ray's far end and one near the origin: the places a name is tempted to stand.)
    const dots = [[1.4, 9], [0.4, 14.5], [0.8, 17.5]].map(([x, y]) => [X(x) - 16, Y(y) - 16, X(x) + 16, Y(y) + 16]);
    const io = isoOf(pl, X, Y, fr, fs, dots), rs = isoRays(pl, X, Y);
    const labels = io.lines.map((l) => l.label);
    labels.forEach((a, i) => {
      const at = `${rays} at ${W}x${H}: ${a.text}`;
      for (let j = i + 1; j < labels.length; j++) assert.ok(!meets(a.box, labels[j].box), `${at} touches ${labels[j].text}`);
      rs.own.forEach((boxes, k) => { if (rs.lines[k].r !== io.lines[i].r) assert.ok(!boxes.some((b) => meets(a.box, b)), `${at} sits on the ray of R = ${rs.lines[k].r}`); });
    });
    // (Where a name found a clear place it is clear of the points too; a plot too small for any leaves it at the end of its ray.)
    const clear = labels.filter((a) => !dots.some((d) => meets(a.box, d))).length;
    assert.ok(clear >= labels.length - 1, `${rays} at ${W}x${H}: at most one name stands on a point (${clear} of ${labels.length} clear)`);
  }
});
