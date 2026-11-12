// WebGL contexts are made when their view is about to show and given back after (2 Nov, plan item 5): a page holds only so many
// (iOS Safari about 16, dropping the oldest, which is the figure's).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

test('contexts are always made late: no switch to make them at the start', () => {
  for (const f of ['gl-support.js', 'sinusoid-view.js', 'instruments.js']) assert.doesNotMatch(src(f), /CTX_LAZY|ctxlazy/, f);
  assert.match(src('gl-support.js'), /if \(hostHolds\(\)\) support = true;\n\s+else if \(typeof WebGL2RenderingContext !== 'undefined'\) return true;/);
});

test('the endoscope makes its shader context when shown and gives it back when its tab leaves', () => {
  const i = src('instruments.js');
  assert.match(i, /let gl = null, wasGl = false,/);
  assert.match(i, /gl\.dispose\(\); gl = null; glId = 0; glGone = true;/);
  assert.match(src('dock.js'), /const on = open\.includes\(p\.id\) \|\| stage\?\.p === p;[^\n]*p\.shown\?\.\(on\)/);   // (a staged pane's context starts before the swap; cancelStage gives it back)
  assert.match(src('dock.js'), /s\.p\.el\.classList\.remove\('active'\); s\.p\.shown\?\.\(false\);/);
});

test('the support question asks the figure\'s context first and gives a probe back at once', () => {
  const g = src('gl-support.js');
  assert.match(g, /getElementById\('veins'\)/);
  assert.match(g, /loseContext\(\)/);
});

test('the support question asks the host (the figure, then any context the state record holds) before it would make one', () => {
  const g = src('gl-support.js');
  assert.match(g, /heldGL\(\)/);
  assert.match(g, /if \(hostHolds\(\)\) support = true;/);
  assert.match(src('gl-state.js'), /export function heldGL\(\)/);
});

test('charts share ONE context, always (U2: no second pool, no prewarm)', () => {
  const t = src('trace-gl.js');
  assert.doesNotMatch(t, /best\.users > 0 && pools\.length < POOLS/);
  assert.doesNotMatch(t, /prewarmSoon|POOLS/);
});

test('a dev assert allows at most 2 of the page\'s own live contexts plus the charts\'', () => {
  const b = src('gpu-budget.js');
  assert.match(b, /export const CTX_MAX = 2;/);
  assert.match(b, /if \(CTX_ASSERT\) checkContexts\(\);/);
  assert.match(b, /WebGL contexts over budget/);
});
