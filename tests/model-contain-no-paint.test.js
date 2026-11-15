import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appCss } from './split-src.js';

// Paint containment on the stage svg painted solid black strips down both edges of the phone (the svg is inset 12 px a side, overflow visible).
test('the model trees are contained for layout and style, never paint', () => {
  const css = appCss();
  const rule = css.match(/html\.model-contain[^{]*\{([^}]*)\}/);
  assert.ok(rule, 'model-contain rule exists');
  assert.match(rule[1], /contain:\s*layout style\s*;/);
  assert.doesNotMatch(rule[1], /paint/);
});
