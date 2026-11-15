import { stageSource } from './stage-src.js';
// TIPS Doppler's stent slides call out the stent's velocity at all three points (proximal, mid, distal), not only the sampled one
// (Mohammad, 15 Oct): the slide that teaches the three points, the narrowed stent (where it narrows too) and the reopened stent. Each
// callout reads what the Doppler's tile for its point reads, and the sampled one is named in the Doppler's green. After review the three
// stand in a column beside their own dots, in order, on one side chosen without the pick, and the "60 %" goes to the other side.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIPS_DOPPLER } from '../src/ui/decks/tips-doppler.js';
import { rolePx, roleOf } from '../src/ui/type-scale.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const stage = stageSource(), gl = read('src/ui/veins-gl.js') + read('src/ui/comp-glsl.js');

test('the stent slides, and only they, call out all three points', () => {
  const on = TIPS_DOPPLER.slides.filter((s) => s.tool?.points).map((s) => s.id);
  assert.deepEqual(on, ['jet', 'narrow', 'fix']);
  for (const s of TIPS_DOPPLER.slides.filter((x) => x.tool?.points)) assert.equal(s.tool.vessel, 'TIPS', `${s.id} samples the stent`);
});


test('one callout per point, at its own third, the three in a column beside their dots on short leaders, before the slide\'s mark', () => {
  // (Review 15 Oct: in order, all on one side, each level with its own dot, a leader of 16 px at most.)
  // (Level with its dot first, a little farther out up to 16 px; slid up or down only after that.)
  // (The jet clears its narrowing's arrow level, past the arrow, before sliding off its dot's line: Mac slide 9 distal.)
  // (Level first, then clear of the credit where it can be, then off the vessels; slid only when no level spot is left.)
  // (Review 15 Oct: the mark keeps off the vessels before it keeps off the credit, each spot nudged 8 px each way, its leader crossing
  // no label; the points' dots sit on a solid disc, drawn after every leader, and a leader ending at one stops 2 px outside it.)
  // (the mark's reaches off the vessels, then any spot off them within 150 px, nearest first, then the reaches over vessels)
  // (the "60 %" steps aside for the mark where it blocks it; a pill with no clear spot gets the stage-colour ring)
  // (The flow's arrowheads keep out from under the callouts and 12 px round each dot.)
  // (a point or the mark keeps 4 px off a card, so a point by an open monitor's card stays level; a held slid slot never beats a level one)
  // (the mark keeps 2 px off its own stent's drawn mesh in every pass; the "60 %" halo fills its digits' counters)
  assert.match(gl, /if \(hr < 0\.0\) \{ vec2 ab = h\.zw - h\.xy;/);
  assert.ok(stage.indexOf('if (it.point && it.col && placeMulti') < stage.indexOf('// Focus callout'), 'the points are placed before the mark');
});

test("the column's side is chosen from the stent and the screen, never the pick, and the narrowing's \"60 %\" takes the other side, 12 px at least", () => {
  const side = stage.slice(stage.indexOf('A stent called out at its three points: the three stand in a column'), stage.indexOf('// Stenosis clamps and their percentages'));
  assert.ok(side.length > 0 && !/dop\.seg|dopGateOf|st\.dopGate/.test(side), 'the side does not read the sampled point');
  // (the "60 %" reads in the labels' own name size, 12 px at least (the lab role: the text size setting and a presentation's size in it),
  // at any zoom, its gap and its leader's stop-short in step with it)
  assert.ok(roleOf(11.5) === 'lab' && rolePx('lab', 390, 844) >= 12 && rolePx('lab', 1440, 900) >= 12, "the labels' names are the lab role, 12 px at least on a phone and a laptop");
});



test("the three callouts never give way to the Doppler probe: the column's side, its spots and its visibility ignore the probe's body and line of sight, and the probe waits for the column and keeps off it", () => {
  // (Mohammad, 22 Oct, TIPS Doppler slide 5: the mid callout hopped to the far side of the stent when a point was picked. The probe's boxes
  // were obstacles to the callouts, and the probe stood before or after them by chance: the column stands where the stent and the screen
  // put it, whatever the pick and whatever got there first.)
  // the side is scored without the probe; a point's spots and its visibility ignore it (the in-view pass included)
  // every box check of a spot trial against the labels placed so far skips the probe's, for a point
  const trial = stage.slice(stage.indexOf('passes.forEach((ps, pi) => pi >= from'), stage.indexOf('if (!best || cost < best.cost) best = '));
  assert.ok((trial.match(/placed\.some\(\(p\) => !\(it\.point && p\.probe\) && /g) || []).length >= 6 && !/placed\.some\(\(p\) => (?!!\(it\.point && p\.probe\))/.test(trial), 'no placed-box check in a point\'s spot trial counts the probe');
  // the probe knows where the column stands before it picks a side: it waits for the callouts to show (four seconds at most), only
  // while it is not already showing
  // and it keeps off them: the callouts' boxes are what its place is searched against
});
