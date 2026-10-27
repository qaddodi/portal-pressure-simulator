// The relation charts' clutter (26 Oct, the Varix and wall stress chart of Next bleed): cut-offs as coloured numbers on the axis, whole-number
// axis numbers, and the dots' names placed clear of everything (or numbered, with a key, when they cannot all sit close and clear).
// The layout is worked out in pixels from plain numbers, so it is checked here without a browser; the geometry below is Next bleed's chart as
// the layout computes it for a 440 × 260 px card in 12.5 px type from the model's own numbers (two lines, six dots, two walks, the HVPG 10 line).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leftScale, rightScale, fmtTick, yCutsOf, placeWord, placeDotNames, namesCrowded, segHits, walkArrow, spellAxis, xAxisName, xCutName, ringAt, axisMeta } from '../src/ui/tool-curve.js';
import { NEXT_BLEED } from '../src/ui/decks/next-bleed.js';
import { TEN_YEARS } from '../src/ui/decks/ten-years.js';
import { VARICES } from '../src/ui/decks/varices.js';

const slideTool = (d) => d.slides.find((s) => s.id === 'relation').tool;

test('axis numbers: a whole number stays whole whatever the axis\'s decimals', () => {
  assert.equal(fmtTick(5, 1), '5');
  assert.equal(fmtTick(0, 1), '0');
  assert.equal(fmtTick(2.5, 1), '2.5');
  assert.equal(fmtTick(-10, 1), '−10');
  assert.equal(fmtTick(7.25, 2), '7.25');
});

test('cut-offs as ticks: a scale that holds the small and large varix lines, the plain scale unchanged without them', () => {
  const varix = [2, 2.4, 3.1, 5.4, 8.4];
  assert.deepEqual(leftScale('varix', varix).ticks, [2, 4, 6, 8, 10], 'no cut-offs asked for: as before');
  const held = leftScale('varix', varix, 7, [2.5, 5]);
  assert.deepEqual(held.ticks, [0, 2.5, 5, 7.5, 10], 'the numbers 2.5 and 5 stand on the axis');
  assert.deepEqual(rightScale([7, 190], held.ticks.length).ticks, [0, 50, 100, 150, 200], 'the right scale shares its gridlines');
  assert.deepEqual(leftScale('hvpg', [3, 19], 7, [5, 10]).ticks.filter((v) => v === 5 || v === 10), [5, 10]);
  assert.deepEqual(leftScale('hvpg', [3, 19], 7, [50]).ticks, leftScale('hvpg', [3, 19]).ticks, 'a cut-off outside the values asks for nothing');
  const short = leftScale('varix', varix, 3, [2.5, 5]);
  assert.ok(short.ticks.length <= 3, 'a chart too short for them keeps its own numbers (the dashed lines stay)');
});

test('the varix and wall stress charts hold their cut-offs as axis ticks', () => {
  for (const d of [VARICES, TEN_YEARS, NEXT_BLEED]) {
    const t = slideTool(d);
    assert.equal(t.cuts, 'ticks', d.id);
    assert.deepEqual(yCutsOf(t, 'varix'), [{ v: 2.5, rate: 'mid' }, { v: 5, rate: 'hi' }], `${d.id}: the tile's small and large varix cut-offs`);
  }
});

test('placeWord: a spot that lands on anything loses to any clear spot when it is hard, however far the clear one is', () => {
  const cut = { y: 50, x0: 0, x1: 200, w: 5 }, from = { x: 100, y: 55, k: 0.5 };
  const near = [{ x: 100, y: 52, anchor: 'start' }, { x: 100, y: 95, anchor: 'start' }];
  assert.equal(placeWord(near, 40, 12, { lines: [cut], bounds: [0, 0, 200, 100] }, { ...from, k: 0.5 }).y, 52, 'by cost alone a near spot on a line can beat a far clear one');
  assert.equal(placeWord(near, 40, 12, { lines: [{ ...cut, w: 1 }], bounds: [0, 0, 200, 100] }, { ...from, k: 5 }).y, 52);
  assert.equal(placeWord(near, 40, 12, { lines: [cut], bounds: [0, 0, 200, 100] }, { ...from, k: 5, hard: true }).y, 95, 'hard: the clear spot, though far');
});

// Next bleed's chart (see the header): the two lines, the six dots and their walks, the HVPG 10 line, the rings, the plot's box.
const NB = {
  named: ['After the bleed', 'Bands', 'Carvedilol', 'Both'], f: 12.5, W: 440, H: 260,
  pts: [[348, 123], [371, 164], [344, 90], [287, 156], [304, 174], [304, 125]], dotOf: [0, 1, 3, 4],
  data: [[118, 187, 131, 187], [131, 187, 152, 187], [152, 187, 173, 187], [173, 187, 201, 187], [201, 187, 228, 169], [228, 169, 251, 154], [251, 154, 270, 139], [270, 139, 291, 125], [291, 125, 310, 113], [310, 113, 327, 101], [327, 101, 342, 92], [342, 92, 354, 83], [354, 83, 365, 76], [365, 76, 375, 69],
    [118, 218, 131, 218], [131, 218, 152, 218], [152, 218, 173, 216], [173, 216, 201, 216], [201, 216, 228, 205], [228, 205, 251, 193], [251, 193, 270, 178], [270, 178, 291, 159], [291, 159, 310, 139], [310, 139, 327, 119], [327, 119, 342, 100], [342, 100, 354, 81], [354, 81, 365, 63], [365, 63, 375, 47]],
  walks: [[348, 123, 371, 164], [371, 164, 344, 90], [287, 156, 304, 174], [304, 174, 304, 125]], xcut: [221, 39, 221, 224], ring: [304, 125, 157], bounds: [30, 39, 411, 224],
};
const nbObstacles = () => {
  const { f, W, H, pts, data, walks, xcut, ring, bounds } = NB, half = Math.max(3.5, 0.3 * f) + 2, rr = Math.max(5, f * 0.45) + 2;
  const segs = [...data, ...pts.map(([x, y]) => Object.assign([x - 3.75, y, x + 3.75, y], { w: 3 })), ...walks.map((q) => Object.assign(q, { w: 2 })), Object.assign(xcut, { w: 5 })];
  const boxes = [[ring[0] - rr, ring[1] - rr, ring[0] + rr, ring[1] + rr], [ring[0] - rr, ring[2] - rr, ring[0] + rr, ring[2] + rr], ...pts.map(([x, y]) => [x - half, y - half, x + half, y + half])];
  return { half, ob: { segs, boxes, lines: [{ y: bounds[3], x0: bounds[0], x1: bounds[2], w: 3 }], bounds: [bounds[0] + 1, bounds[1] - 16, bounds[2] - 1, bounds[3] - 2], inside: [0, 0, W, H] } };
};
const items = (texts) => texts.map((s, i) => ({ x: NB.pts[NB.dotOf[i]][0], y: NB.pts[NB.dotOf[i]][1], w: 1.08 * 0.6 * NB.f * s.length }));
const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

// What every placed word must be: inside the chart, off every other word, dot and ring, off every line, its leader off every other word.
function assertClear(sp, { half, ob }, label) {
  sp.forEach((p, i) => {
    if (!p.ok) return;
    const others = [...ob.boxes, ...sp.filter((q, j) => j !== i && q.ok).map((q) => q.box)];
    for (const o of others) assert.ok(!overlap(p.box, o), `${label}: word ${i} overlaps a word, dot or ring`);
    for (const sg of ob.segs) assert.ok(sg.w === 3 || !segHits(sg, p.box), `${label}: word ${i} touches a line`);
    assert.ok(p.box[0] >= 0 && p.box[1] >= 0 && p.box[2] <= NB.W && p.box[3] <= NB.H, `${label}: word ${i} is inside the chart`);
    if (p.lead) for (const o of others) assert.ok(!segHits(p.lead, o) || overlap(o, [p.lead[0] - half, p.lead[1] - half, p.lead[0] + half, p.lead[1] + half]), `${label}: word ${i}'s leader crosses a word`);
  });
}

test('Next bleed: the four names cannot all sit close and clear, so the dots carry numbers; the numbers sit clear, close to their dots', () => {
  const o = nbObstacles(), withLines = { ...o.ob, lines: o.ob.lines.map((l) => ({ ...l, w: 3 })) };
  const named = placeDotNames(items(NB.named), NB.f, o.half, withLines);
  assertClear(named, o, 'names');
  assert.ok(namesCrowded(named, NB.f), 'a leader would run far or across a line (or a name has no spot)');
  const numbers = placeDotNames(items(['1', '2', '3', '4']), NB.f, o.half, withLines);
  assert.ok(numbers.every((p) => p.ok), 'every number has a clear spot');
  assertClear(numbers, o, 'numbers');
  numbers.forEach((p, i) => {
    const [x, y] = NB.pts[NB.dotOf[i]], cx = Math.min(Math.max(x, p.box[0]), p.box[2]), cy = Math.min(Math.max(y, p.box[1]), p.box[3]);
    assert.ok(Math.hypot(cx - x, cy - y) < 2.5 * NB.f, `number ${i + 1} stands within two and a half lines of its dot`);
  });
  assert.ok(!namesCrowded(numbers, NB.f) || numbers.every((p) => !p.lead || Math.hypot(p.lead[2] - p.lead[0], p.lead[3] - p.lead[1]) < 3 * NB.f), 'any leader is short');
});

test('a name with no clear spot is left out, never drawn over something; the rest stay clear', () => {
  const half = 5.6, boxes = [], items6 = Array.from({ length: 6 }, (_, i) => ({ x: 60 + (i % 3) * 7, y: 40 + Math.floor(i / 3) * 7, w: 70 }));
  for (const it of items6) boxes.push([it.x - half, it.y - half, it.x + half, it.y + half]);
  const sp = placeDotNames(items6, 12, half, { boxes, segs: [], lines: [], bounds: null, inside: [0, 0, 190, 90] });
  assert.ok(sp.some((p) => !p.ok), 'six wide names in a 190 × 90 box cannot all find a place');
  assert.ok(sp.some((p) => p.ok), 'some do');
  const ok = sp.filter((p) => p.ok);
  ok.forEach((p, i) => ok.slice(i + 1).forEach((q) => assert.ok(!overlap(p.box, q.box), 'two placed names never overlap')));
  ok.forEach((p) => boxes.forEach((b) => assert.ok(!overlap(p.box, b), 'a placed name never covers a dot')));
  assert.ok(namesCrowded(sp, 12));
});

test('names that sit close and clear stay names', () => {
  const sp = placeDotNames([{ x: 200, y: 100, w: 60 }, { x: 300, y: 60, w: 50 }], 12, 5.6, { boxes: [], segs: [], lines: [], inside: [0, 0, 440, 260] });
  assert.ok(sp.every((p) => p.ok && !p.lead), 'a name beside its dot needs no leader');
  assert.ok(!namesCrowded(sp, 12));
});

// The Ascites chart (27 Oct, "what are the dots? it's so busy ... no idea what x axis is ... completely illegible"): one line, the grades as
// the axis numbers, the visits joined by arrows, the HVPG axis written out, the HVPG 10 line named, no ring that floats off the line.
test('cut-offs no even scale can hold become the axis numbers themselves, only where a chart asks (cutTicks), never changing the even scales', () => {
  const asc = [0, 0, 0.3, 1.2, 2.4, 4.3, 5.1];
  const even = leftScale('asc', asc, 7, [1.5, 5]).ticks;
  assert.ok(!(even.includes(1.5) && even.includes(5)), 'no even scale holds both 1.5 and 5');
  assert.deepEqual(leftScale('asc', asc, 7, [1.5, 5], true), { min: 0, max: 5.5, ticks: [0, 1.5, 5] }, 'the baseline, then each cut-off');
  assert.deepEqual(leftScale('asc', asc, 3, [1.5, 5], true).ticks, [0, 1.5, 5], 'a short chart keeps them too');
  assert.deepEqual(leftScale('varix', [2, 2.4, 3.1, 5.4, 8.4], 7, [2.5, 5], true).ticks, [0, 2.5, 5, 7.5, 10], 'an even scale that holds them is kept');
  assert.deepEqual(leftScale('asc', [0, 0.5, 1], 7, [1.5, 5], true), leftScale('asc', [0, 0.5, 1]), 'cut-offs beyond the values ask for nothing');
  assert.deepEqual(leftScale('asc', asc, 7, [1.5, 5]).ticks, leftScale('asc', asc, 7, [1.5, 5], false).ticks, 'without cutTicks nothing changes');
});

test('a walk\'s step wears one arrowhead on its middle, pointing the way it runs, and none where the dots leave no room for it', () => {
  const a = walkArrow([10, 100], [210, 100], 3.6, 12);
  assert.ok(a, 'a long step has one');
  const [bx, by, tx, ty] = a.seg;
  assert.ok(tx > bx && Math.abs(ty - by) < 1e-6, 'pointing right along a rightward step');
  assert.ok(Math.abs((bx + tx) / 2 - 110) < 1, 'on its middle');
  assert.equal(walkArrow([10, 100], [30, 100], 3.6, 12), null, 'a step too short to keep it clear of both dots');
  const down = walkArrow([50, 20], [50, 120], 3.6, 12);
  assert.ok(down.seg[3] > down.seg[1] && Math.abs(down.seg[2] - down.seg[0]) < 1e-6, 'pointing down a downward step');
  const big = walkArrow([0, 0], [300, 0], 3.6, 18);
  assert.ok(big.seg[2] - big.seg[0] > a.seg[2] - a.seg[0], 'the head grows with the type');
  assert.match(a.d, /^M[\d. ]+L[\d. ]+L[\d. ]+Z$/, 'a filled triangle');
});

test('the HVPG axis is written out as the app defines it, and the HVPG 10 line is named for what it marks', () => {
  assert.equal(xAxisName(spellAxis(axisMeta({ x: 'hvpg', param: 'cirrhosis' }))), 'HVPG (wedged − free), mmHg');
  assert.equal(axisMeta({ x: 'hvpg', param: 'cirrhosis' }).name, 'HVPG', 'the card\'s title still says HVPG');
  const lsm = axisMeta({ x: 'lsm', param: 'cirrhosis' });
  assert.equal(spellAxis(lsm), lsm, 'a reading with a plain name is left alone');
  assert.equal(xCutName('hvpg', 10), 'CSPH');
  assert.equal(xCutName('hvpg', 5), '');
  assert.equal(xCutName('lsm', 10), '', 'only the HVPG 10 line');
});

test('ring: false marks no case on the chart: no x, no value on any line', () => {
  const t = { x: 'hvpg', lines: ['asc'], ring: false, points: [{}] }, fp = { hvpg: 7, asc: 0 };
  assert.deepEqual(ringAt(t, {}, fp), { x: null, ys: [null] });
  assert.equal(ringAt({ ...t, ring: undefined }, {}, fp).x, 7, 'a chart without the option still rings its case');
  assert.deepEqual(ringAt({ ...t, lines: ['asc', 'bv'] }, {}, fp).ys, [null, null]);
});
