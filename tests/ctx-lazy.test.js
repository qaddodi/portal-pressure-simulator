// WebGL contexts are made when their view is about to show and given back after (2 Nov, plan item 5): a page holds only so many
// (iOS Safari about 16, dropping the oldest, which is the figure's). ?ctxlazy=0 restores the old behaviour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

test('the flag is on by default and ?ctxlazy=0 turns it off', () => {
  const g = src('gl-support.js');
  assert.match(g, /CTX_LAZY = !\(typeof location !== 'undefined' && \/\[\?&\]ctxlazy=0\\b\/\.test/);
});

test('the sinusoid view makes its context at setModel / place, not with the lobule', () => {
  const v = src('sinusoid-view.js');
  assert.match(v, /let gpu = null, svYield = null, svSoft = false;/);
  assert.match(v, /if \(!CTX_LAZY\) ensureGpu\(\);/);
  assert.match(v, /setModel\(m\) \{ ensureGpu\(\);/);
  assert.match(v, /if \(opacity > 0\) ensureGpu\(\);/);
  assert.doesNotMatch(v, /^\s*const gpu = createSinusoidGL/m);
  assert.match(src('sinusoid-gl.js'), /if \(warm\) startLater\(\);/);
});

test('the endoscope makes its shader context when shown and gives it back when its tab leaves', () => {
  const i = src('instruments.js');
  assert.match(i, /let gl = CTX_LAZY \? null : mkGl\(\)/);
  assert.match(i, /gl\.dispose\(\); gl = null; glKey = ''; glGone = true;/);
  assert.match(src('dock.js'), /p\.shown\?\.\(open\.includes\(p\.id\)\)/);
});

test('the support question asks the figure\'s context first and gives a probe back at once', () => {
  const g = src('gl-support.js');
  assert.match(g, /getElementById\('veins'\)/);
  assert.match(g, /loseContext\(\)/);
});
