import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The stage labels are drawn in the figure's canvas (S2): at that canvas's density, which the stage caps (2 device px per CSS px and the
// pixel budget, stage-res.js resizeCanvas). The label layer has no canvas of its own to cap.
const src = readFileSync(new URL('../src/ui/label-gl.js', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const res = readFileSync(new URL('../src/ui/stage-res.js', import.meta.url), 'utf8');
test('the labels follow the figure canvas\'s density, which is capped at 2x', () => {
  assert.doesNotMatch(src, /document\.createElement\('canvas'\)|getContext\(/, 'no canvas of its own');
  assert.match(src, /const hostK = \(\) => \(host\.scale \? host\.scale\(\) : 0\) \|\| devicePixelRatio \|\| 1;/);
  assert.match(stage, /scale: \(\) => vCanvas\.width \/ \(stageBox\(\)\.width \|\| 1\)/);
  assert.match(res, /Math\.min\(2, devicePixelRatio \|\| 1\)/);
});
