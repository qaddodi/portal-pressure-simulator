import { stageSource } from './stage-src.js';
// The stage is made in one long function: a constant it reads while it is being made must be set above that read, or the page
// stops at startup (31 Oct, d213d755: the labels' host read OVER_ON two thousand lines before it was set; nothing showed on any device).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const STAGE = stageSource();

test('OVER_ON is set before the overlays\' watch reads it while the stage is made', () => {
  // (let, not const: renderPath reads both again from the context a restore hands back; the start-up lines are still the first.)
  const set = STAGE.indexOf('  let OVER_ON = '), read = STAGE.indexOf('  if (OVER_ON) overWatch();');
  assert.ok(set > 0 && read > 0, 'both are there');
  assert.ok(set < read, 'set first');
  assert.ok(STAGE.indexOf('  let SOFTWARE = ') < set, 'after what it reads');
  assert.equal(STAGE.split('let OVER_ON = ').length, 2, 'set once');
  assert.equal(STAGE.split('let SOFTWARE = ').length, 2, 'set once');
});
