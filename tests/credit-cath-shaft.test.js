import { stageSource } from './stage-src.js';
// The corner credit stood on the catheter's shaft (HVPG 2, an iPhone held sideways: the line from the neck ran through "© 2026 Mohammad
// Almeqdadi, MD"). On the GPU the shaft is not in the page, so the credit's art test could not see it; the stage now hands over the route as
// boxes (cathBoxes, the whole way, so they stand still as the catheter travels) and the credit keeps clear of them like any label.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freeSpots } from '../src/ui/credit.js';

const credit = readFileSync(new URL('../src/ui/credit.js', import.meta.url), 'utf8');
const stage = stageSource();

test('the credit counts the catheter shaft among the things it keeps clear of, and it does not make the credit "busy"', () => {
  assert.match(stage, /cathBoxes\(\) \{\s*const st = cath\.st, r = st && cathRoute\(\);/);
  assert.match(credit, /window\.pps\?\.stage\?\.cathBoxes\?\.\(\)/);
  assert.match(credit, /\.\.\.cathBars\]\.filter\(\(o\) => o && hit\(o, fig\)\)/);
  assert.match(credit, /b: Math\.ceil\(q\.b \/ GRID\) \* GRID, chrome: true/);
});

test('a free spot is found clear of a thin vertical shaft running down from the top edge', () => {
  // (A phone held sideways: 844 x 390, the words card at the left, the shaft down from the top at x 640, its boxes 8 px wide and 16 px apart.)
  const fig = { l: 0, t: 0, r: 844, b: 390 }, w = 250, h = 16, shaft = [];
  for (let y = 0; y < 200; y += 16) shaft.push({ l: 632, t: y, r: 648, b: y + 16, chrome: true });
  const spots = freeSpots(fig, shaft, w, h);
  const hits = (s) => s && shaft.some((q) => s.x - 10 < q.r && s.x + w + 10 > q.l && s.y - 10 < q.b && s.y + h + 10 > q.t);
  for (const c of ['bl', 'br', 'tl', 'tr']) assert.ok(!hits(spots[c]), `${c}: ${JSON.stringify(spots[c])} stands clear of the shaft`);
  assert.ok(spots.tr === null || spots.tr.y > 200 - 10 || spots.tr.x >= 648 + 10 || spots.tr.x + w <= 632 - 10, 'the top right corner is not on the shaft');
});
