import { stageSource } from './stage-src.js';
// A presenter's small camera move keeps its labels (31 Oct, round2-recs § 6.4, his yes to the combined plan): the names ride with the
// figure as a slow push's do, their leaders and dots carried on the GPU with them (no fade since 5 Nov 2026 review #10). A move that is big, that changes what the labels
// show, or that has a layer of its own to move (callouts, a probe, a scan, a treatment) keeps the usual fade.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = stageSource();
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('rigid labels: a presenter move carries no label, hides none, and the old carry machinery is gone', () => {
  for (const w of ['carryable', 'carryAbort', 'landable', 'solveLanding', 'landRide', 'CARRY_ZOOM']) assert.ok(!stage.includes(w), w);
});

test('a move that carries the labels fades only the labels the SVG still draws; the names on the GPU are untouched', () => {
  // (A label the SVG still draws, with a glyph the GPU's cut lacks, cannot be carried: it eases out with them, 3 Nov 2026.)
  assert.match(css, /\.stage-view\.lb-ride \.lb:not\(\[data-gl\]\) \{ opacity: 0; \}/);
  assert.doesNotMatch(css, /lb-ride[^\n]*#labels\b/, 'only the leaders; the label layer stays');
});

test('the carry\'s class is a gesture\'s: no label is read again for it, no placed piece moves with it, and the stage\'s look is not dropped', () => {
  const keys = readFileSync(new URL('../src/ui/idle-keys.js', import.meta.url), 'utf8');
  assert.match(keys, /export const GESTURE_LOOK = new Set\(\[[^\]]*'lb-ride'\]\);/);
  assert.match(keys, /export const GESTURE_MOVE_FREE = new Set\(\[[^\]]*'lb-ride'\]\);/);
  assert.match(stage, /\(\?:panning\|stage-busy\|figure-focus\|lb-ride\|pinch-hide\|off-home\)\(\?=/);
  // (It sets no custom property and styles nothing in the figure, only the opacity of the labels the SVG still draws: frame-costs-glow.test.js reads every rule that names it.)
  for (const m of css.matchAll(/([^{}]*\.lb-ride\b[^{}]*)\{([^{}]*)\}/g)) {
    assert.doesNotMatch(m[2], /--[\w-]+\s*:/);
    assert.match(m[1], /\.lb:not\(\[data-gl\]\)/);
  }
});
