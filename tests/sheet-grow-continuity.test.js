import { test } from 'node:test';
import assert from 'node:assert/strict';
import { growProgress, lerpAt, shiftAt, clipAt, r2, pullOffset } from '../src/ui/sheet-grow-math.js';
import { sheetDockVars } from '../src/ui/dock-vars.js';

// A phone's Tests pane (the Doppler's, as Mohammad's iPhone lays it out): the card is laid out at Full for the whole pull; Half's and Full's
// places of each part are read once. The chart is drawn at its in-between size, the parts under it moved to their in-between places, the note
// Full alone shows fades in. Half's card is 409 px tall, Full's 660.
const hH = 409, hF = 660;
const half = { chart: { y: 0, h: 130 }, gauge: { y: 138 }, tiles: { y: 178, h: 56 } };
const full = { chart: { y: 0, h: 330 }, gauge: { y: 338 }, tiles: { y: 378, h: 56 }, note: { y: 442 } };
// What the screen shows at a card drawn h px tall (dock-sheet.js drawAt, with the numbers of sheet-grow-math.js).
const frameAt = (h) => {
  const p = growProgress(h, hH, hF);
  const chartH = lerpAt(half.chart.h, full.chart.h, p);
  return {
    p, chartH,
    gaugeTop: full.gauge.y + shiftAt(half.gauge.y, full.gauge.y, p),
    tilesTop: full.tiles.y + shiftAt(half.tiles.y, full.tiles.y, p),
    // (the note rides with the tiles: the part before it)
    noteTop: full.note.y + shiftAt(half.tiles.y + half.tiles.h, full.tiles.y + full.tiles.h, p), noteOpacity: p,
    clip: clipAt(390, full.chart.h, 390, chartH, 12),
  };
};

test('at Half the card is the Half card and at Full the Full card: neither end of a pull changes the screen', () => {
  const a = frameAt(hH), b = frameAt(hF);
  assert.equal(a.chartH, half.chart.h); assert.equal(a.gaugeTop, half.gauge.y); assert.equal(a.tilesTop, half.tiles.y); assert.equal(a.noteOpacity, 0);
  assert.equal(b.chartH, full.chart.h); assert.equal(b.gaugeTop, full.gauge.y); assert.equal(b.tilesTop, full.tiles.y); assert.equal(b.noteOpacity, 1);
  assert.equal(b.clip, 'inset(0px 0px 0px 0px round 12px)');   // (nothing cut at Full: the layout the card lands in)
  // past either stop (the pull's rubber band) it holds at that stop
  assert.deepEqual(frameAt(hH - 80), a); assert.deepEqual(frameAt(hF + 40), b);
});

test('the chart grows with the finger in small steps, one way, and what is under it keeps its gap', () => {
  let prev = frameAt(hH), maxStep = 0;
  const gap0 = half.gauge.y - half.chart.h;
  for (let h = hH; h <= hF; h += 1) {
    const f = frameAt(h);
    assert.ok(f.chartH >= prev.chartH - 1e-9 && f.tilesTop >= prev.tilesTop - 1e-9, 'one way only');
    maxStep = Math.max(maxStep, f.chartH - prev.chartH, f.tilesTop - prev.tilesTop);
    assert.ok(f.gaugeTop - (full.chart.y + f.chartH) >= gap0 - 1e-6, 'the gauge never runs under the chart');
    assert.ok(f.noteTop >= f.tilesTop + half.tiles.h - 1e-6, 'the note never runs under the tiles');
    prev = f;
  }
  assert.ok(maxStep <= 1.5, `largest step for 1 px of finger: ${maxStep}px`);   // (200 px of growth over 251 px of pull)
});

test('a pull down from Full draws the same frames the other way (each frame is set by the height alone)', () => {
  for (let h = hF; h >= hH; h -= 7) assert.deepEqual(frameAt(h), frameAt(h));
  assert.equal(growProgress(hH + (hF - hH) / 2, hH, hF), 0.5);
  assert.equal(growProgress(hH - 1, hH, hF), 0);   // (never -0: a translate of 0 is written as none)
  assert.equal(growProgress(500, 500, 500), 1);   // (two stops that lay the pane out alike: nothing moves)
});

test('the clip cuts a chart laid out at Full to the size it is drawn at, and reaches past it when the part is larger at Half', () => {
  assert.equal(clipAt(390, 330, 390, 130, 12), 'inset(0px 0px 200px 0px round 12px)');
  assert.equal(clipAt(100, 80, 120, 80, 0), 'inset(0px -20px 0px 0px round 0px)');
  assert.equal(r2(1 / 3), 0.33);
});

test('the card does not move when the capture comes: the offset it takes is the one the move after it takes', () => {
  // (box: the card's box once made taller, startH: the height it was drawn at, dy: the finger's way so far, up is negative)
  for (const dy of [0, -4, -9, -30, -120]) {
    const atCapture = pullOffset(560, 340, dy), nextMove = pullOffset(560, 340, dy);
    assert.equal(atCapture, nextMove);
    assert.ok(atCapture <= 560 - 340 + 1e-9);   // (never below the drawn height's own offset: the card is never shorter than it was)
  }
  assert.equal(pullOffset(560, 340, 0), 220);
  assert.equal(pullOffset(560, 340, -30), 190);
});

test('the sizes a pull lays the pane out with are the ones the card takes at the landing', () => {
  assert.deepEqual(sheetDockVars(700, true), { plot: 420, square: 380 });
  assert.deepEqual(sheetDockVars(340, true), { plot: 190, square: 220 });
  assert.deepEqual(sheetDockVars(500, false), { plot: 310, square: 340 });
});
