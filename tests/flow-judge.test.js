// One judgement of slow, absent and backward flow (velNormal.js judgeFlow, cut-offs in engine/flow-cuts.js). The Doppler's reading, the figure's
// velocity labels, the Details sentences, the lobule's cards, the screen-reader summary, the summary tables and the stasis event all read it;
// this pins the boundaries so they cannot drift apart again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judgeFlow, flowReversed, FLOW_CUTS } from '../src/ui/velNormal.js';
import { FLOW_CUTS as ENGINE_CUTS } from '../src/engine/flow-cuts.js';
import { RATE } from '../src/ui/table-marks.js';

const PV = [15, 40];
const word = (v, q = null, normal = PV, o) => judgeFlow(v, q, normal, o).word;

test('the cut-offs are 1 and 9 cm/s, 2 for a stent, and the engine reads the same', () => {
  assert.deepEqual(FLOW_CUTS, ENGINE_CUTS);
  assert.deepEqual([FLOW_CUTS.none, FLOW_CUTS.stasis, FLOW_CUTS.stentNone], [1, 9, 2]);
});

test('no flow under 1 cm/s, stasis from 1 up to 9, then slow, normal and fast against the vessel\'s range', () => {
  assert.equal(word(0), 'none');
  assert.equal(word(0.9), 'none');
  assert.equal(word(1), 'stasis');
  assert.equal(word(1.1), 'stasis');
  assert.equal(word(8.9), 'stasis');
  assert.equal(word(9), 'slow');
  assert.equal(word(9.1), 'slow');
  assert.equal(word(14.9), 'slow');
  assert.equal(word(15), 'normal');
  assert.equal(word(40), 'normal');
  assert.equal(word(40.1), 'fast');
  assert.equal(word(25, null, null), 'normal', 'a vessel with no range is never slow or fast');
});

test('a reversed velocity is judged by its size first: slow and backward is stasis, brisk and backward is reversed', () => {
  assert.equal(word(-0.5), 'none');
  assert.equal(word(-5), 'stasis');
  assert.equal(word(-8.9), 'stasis');
  assert.equal(word(-9), 'reversed');
  assert.equal(word(-25), 'reversed');
  assert.equal(judgeFlow(-5, null, PV).reversed, true, 'the direction flag stays set under the size words');
  assert.equal(judgeFlow(5, null, PV).reversed, false);
});

test('a waveform that swings across zero is never stasis', () => {
  assert.equal(judgeFlow(3, null, PV, { swings: true }).stasis, false);
  assert.equal(judgeFlow(3, null, PV).stasis, true);
  assert.equal(judgeFlow(0.5, null, PV, { swings: true }).none, true);
});

test('a stent is occluded under 2 cm/s and has no stasis band', () => {
  const S = [90, 190];
  assert.equal(word(1.9, null, S, { stent: true }), 'none');
  assert.equal(word(2, null, S, { stent: true }), 'slow');
  assert.equal(word(89, null, S, { stent: true }), 'slow');
  assert.equal(word(90, null, S, { stent: true }), 'normal');
  assert.equal(word(190.1, null, S, { stent: true }), 'fast');
  assert.equal(judgeFlow(5, null, S, { stent: true }).stasis, false);
});

test('reversed flow has one dead band: the larger of 0.12 mL/s and 2 % of the vessel\'s healthy flow', () => {
  assert.equal(flowReversed(-0.1), false);
  assert.equal(flowReversed(-0.13), true);
  assert.equal(flowReversed(0), false);
  assert.equal(flowReversed(0.5), false);
  // 2 % of an 18 mL/s portal vein is 0.36 mL/s
  assert.equal(flowReversed(-0.3, 18), false);
  assert.equal(flowReversed(-0.4, 18), true);
  assert.equal(judgeFlow(-3, -0.3, PV, { ref: 18 }).reversed, false);
  assert.equal(judgeFlow(-3, -0.4, PV, { ref: 18 }).reversed, true);
});

test('"almost stopped" needs a vessel that normally carries flow', () => {
  assert.equal(judgeFlow(null, 0.04, null, { ref: 1 }).still, true);
  assert.equal(judgeFlow(null, 0.06, null, { ref: 1 }).still, false);
  assert.equal(judgeFlow(null, 0.04, null, { ref: 0.2 }).still, false, 'a collateral that is closed in health has not "stopped"');
});

test('the summary table\'s portal velocity rating uses the same boundaries', () => {
  assert.deepEqual(RATE.pvVel(-0.4), ['hi', 'Reversed']);
  assert.deepEqual(RATE.pvVel(8.9), ['hi', 'Stasis']);
  assert.deepEqual(RATE.pvVel(9), ['mid', 'Slow']);
});

test('no file keeps a private copy of the stasis cut-off', () => {
  const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
  assert.match(src('engine/events.js'), /FLOW_CUTS\.stasis\b/);
  assert.match(src('ui/table-marks.js'), /FLOW_CUTS\.stasis\b/);
  assert.doesNotMatch(src('ui/stage.js'), /best < 9/);
  assert.doesNotMatch(src('ui/a11y.js'), /< 9\b/);
  assert.doesNotMatch(src('ui/doppler.js'), /\ba < (1|9)\b/);
});
