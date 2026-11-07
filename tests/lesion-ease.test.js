import { stageSource } from './stage-src.js';
// A narrowing and a clot are drawn as they follow the params in a moment, not whole in one frame (src/ui/lesion-ease.js; stage.js
// updateInner, stepWidths, stepOrgans).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lesionEase, LESION_TAU, LESION_SNAP } from '../src/ui/lesion-ease.js';

const P = (stenosis = {}, thrombus = {}) => ({ stenosis, thrombus, tips: { on: false } });

test('the first call takes the params as they stand, and the same object comes back while they rest', () => {
  const l = lesionEase(), p = P({ PV_TRUNK: 0.6 }, { SV_CONF: 0.8 });
  assert.equal(l.view(p, 0.016), p);
  assert.equal(l.view(p, 0.016), p);
  assert.equal(l.differs(p), false);
});

test('a clot set whole thickens over a few tenths of a second, a frame at a time, never past its amount', () => {
  const l = lesionEase();
  l.view(P(), 0);
  const goal = P({}, { SV_CONF: 0.8 });
  const seen = [];
  let frames = 0;
  for (; frames < 200 && l.differs(goal); frames++) seen.push(l.view(goal, 1 / 60).thrombus.SV_CONF);
  assert.equal(l.view(goal, 1 / 60), goal, 'at rest the params themselves come back');
  assert.ok(frames > 10 && frames < 60, `${frames} frames at 60 Hz`);
  assert.ok(seen[0] > 0 && seen[0] < 0.2, `the first frame is a small step, ${seen[0]}`);
  assert.ok(seen.every((v, i) => v <= 0.8 && (i === 0 || v >= seen[i - 1])), 'only forward, never over');
});

test('a narrowing that goes closes over the same time and is then gone from the lesions', () => {
  const l = lesionEase();
  l.view(P({ PV_TRUNK: 0.7 }), 0);
  const goal = P();
  const first = l.view(goal, 1 / 60);
  assert.ok(first.stenosis.PV_TRUNK < 0.7 && first.stenosis.PV_TRUNK > 0.5);
  for (let i = 0; i < 100 && l.differs(goal); i++) l.view(goal, 1 / 60);
  assert.deepEqual(l.view(goal, 1 / 60).stenosis, {});
  assert.equal(l.differs(goal), false);
});

test('a slider drag follows without lag piling up, and the other params pass through untouched', () => {
  const l = lesionEase();
  l.view(P({ A: 0.2 }), 0);
  const p = P({ A: 0.5 });
  const v = l.view(p, 1 / 60);
  assert.equal(v.tips, p.tips);
  assert.notEqual(v, p);
  assert.ok(v.stenosis.A > 0.2 && v.stenosis.A < 0.5);
  assert.equal(p.stenosis.A, 0.5, 'the params are never written to');
});

test('Reduce Motion lands at once; a long frame carries no further than the time it covers; within a hair it lands', () => {
  const l = lesionEase();
  l.view(P(), 0);
  const goal = P({}, { X: 1 });
  assert.equal(l.view(goal, 1 / 60, true), goal);
  const m = lesionEase();
  m.view(P(), 0);
  assert.ok(m.view(goal, 0.05).thrombus.X < 0.5);
  assert.equal(m.view(goal, 10), goal);
  assert.ok(LESION_SNAP < 0.01 && LESION_TAU > 0.05 && LESION_TAU < 0.15);
});

const stage = stageSource();
test('stage.js: the full update draws the lesions as they follow, and the width and organ steps stand aside while they move', () => {
  assert.match(stage, /const pRaw = f\.viewParams \|\| st\.params, p = lesions\.view\(pRaw, dtW, reduceMotion\.matches\);/);
  assert.match(stage, /if \(lesions\.differs\(pRaw\)\) (?:live\.)?(?:live\.)?widthEasing = true;/);
  assert.match(stage, /(?:live\.)?catchUp \|\| bandsMoving\(\) \|\| lesionsMoving\(\)\) return false;/);
  assert.match(stage, /bandsMoving\(\) \|\| lesionsMoving\(\) \|\| anyReveal\(\) \|\| visWidthMoving\(\)\) return false;/);
});
