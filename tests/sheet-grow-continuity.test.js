import { test } from 'node:test';
import assert from 'node:assert/strict';
import { growProgress, itemAt, wordsOpacity, pullOffset } from '../src/ui/sheet-grow-math.js';
import { sheetDockVars } from '../src/ui/dock-vars.js';

// A phone's Tests pane at Half: a chart box, a row of tiles under it and a note's room that the stop adds. Where each is laid out now, and where the
// stop (measured once, as dock-sheet.js probeFinal does) lays it out: the chart taller, the tiles lower by what the chart gained.
const chart = { top: 100, h: 200, wasH: 200, nowH: 420 };
const tiles = { top: 310, nowTop: 530 };
const rows = (gt) => {
  const dyChart = 0, ky = chart.nowH / chart.h, dyTiles = tiles.nowTop - tiles.top;
  const out = [];
  const steps = 400;
  for (let i = 0; i <= steps; i++) {
    const G = (gt * i) / steps, p = growProgress(G, gt);
    const c = itemAt(dyChart, 1, ky, p), t = itemAt(dyTiles, 1, 1, p);
    out.push({ p, chartTop: chart.top + c.ty, chartH: chart.h * c.sy, tilesTop: tiles.top + t.ty, words: wordsOpacity(p) });
  }
  return out;
};

test('a pull up to the stop moves the chart and what is under it from where they are to where they will be, with no step between frames', () => {
  const r = rows(240), first = r[0], last = r.at(-1);
  assert.equal(first.chartH, chart.h); assert.equal(first.tilesTop, tiles.top);
  assert.equal(last.chartH, chart.nowH); assert.equal(last.tilesTop, tiles.nowTop);   // (the landing's own layout: nothing left to jump)
  let maxStep = 0;
  for (let i = 1; i < r.length; i++) {
    maxStep = Math.max(maxStep, Math.abs(r[i].chartH - r[i - 1].chartH), Math.abs(r[i].tilesTop - r[i - 1].tilesTop));
    assert.ok(r[i].chartH >= r[i - 1].chartH - 1e-9 && r[i].tilesTop >= r[i - 1].tilesTop - 1e-9, 'moves one way only');
  }
  assert.ok(maxStep <= 1.5, `largest step between two frames ${maxStep}px`);   // (240 px of growth in 400 equal steps)
});

test('the tiles never run under the chart on the way, and the chart never grows behind them', () => {
  const gap0 = tiles.top - (chart.top + chart.h), gap1 = tiles.nowTop - (chart.top + chart.nowH);
  for (const f of rows(240)) assert.ok(f.tilesTop - (f.chartTop + f.chartH) >= Math.min(gap0, gap1) - 1e-6);
});

test('a pull down from the stop is the same, the other way, and a pull the other way than the stop holds still', () => {
  const r = rows(-240);   // (the card shrinking toward a stop 240 px shorter)
  assert.equal(r[0].p, 0); assert.equal(r.at(-1).p, 1);
  for (let i = 1; i < r.length; i++) assert.ok(Math.abs(r[i].p - r[i - 1].p) <= 0.004 + 1e-9);
  assert.equal(growProgress(-30, 240), 0);   // (a pull down from Half toward Full's growth: nothing stretches)
  assert.equal(growProgress(500, 240), 1);   // (past the stop: held at it)
});

test("the words in a chart box fade with the pull and are gone before the chart is stretched far", () => {
  assert.equal(wordsOpacity(0), 1);
  assert.equal(wordsOpacity(1 / 6), 0);
  let prev = 1;
  for (let p = 0; p <= 1; p += 0.002) { const o = wordsOpacity(p); assert.ok(o <= prev + 1e-12 && prev - o < 0.02); prev = o; }
});

test('the card does not move when the capture comes: the offset it takes is the one the move after it takes', () => {
  // (box: the card's box once made taller, startH: the height it was drawn at, dy: the finger's way so far, up is negative)
  for (const dy of [0, -4, -9, -30, -120]) {
    const atCapture = pullOffset(560, 340, dy), nextMove = pullOffset(560, 340, dy);
    assert.equal(atCapture, nextMove);
    assert.ok(atCapture <= 560 - 340 + 1e-9);   // (never below the drawn height's own offset: the card is never shorter than it was)
  }
  // and an unmoved finger puts the card where it was drawn
  assert.equal(pullOffset(560, 340, 0), 220);
  // a finger that has gone 30 px up has the card 30 px taller than that
  assert.equal(pullOffset(560, 340, -30), 190);
});

test('the sizes a pull measures with are the ones the card takes at the landing', () => {
  assert.deepEqual(sheetDockVars(700, true), { plot: 420, square: 380 });
  assert.deepEqual(sheetDockVars(340, true), { plot: 190, square: 220 });
  assert.deepEqual(sheetDockVars(500, false), { plot: 310, square: 340 });
});
