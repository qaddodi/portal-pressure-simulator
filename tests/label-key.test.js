import { stageSource } from './stage-src.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const st = stageSource();

// Review item 25: the label key no longer stringifies the cards' boxes, the slide's marks or its terms on every call.
test('the label key builds the text of its object inputs once per object', () => {
  assert.match(st, /k\[14\] = st\.compareView; k\[15\] = paramJSON\(blockerBoxes\); k\[16\] = sig;/);
  assert.match(st, /st\.focus\?\.marks && paramJSON\(st\.focus\.marks\)/);
  assert.match(st, /st\.presenting && paramJSON\(st\.presentTerms \|\| null\)/);
  assert.doesNotMatch(st, /JSON\.stringify\(blockerBoxes\)/);
});
