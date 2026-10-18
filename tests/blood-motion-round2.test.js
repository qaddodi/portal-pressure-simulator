// The moving blood in the round 2 motion review (MOTION_HEAT_REVIEW_ROUND2 B9, B10, B4, B6): what eases must keep easing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const stage = read('src/ui/stage.js');
const fn = (src, head) => { const i = src.indexOf(head); assert.ok(i >= 0, head); return src.slice(i, src.indexOf('\n  }\n', i) + 4); };

test('B10: a reversed colour or chevron fade still on its way keeps the figure awake, so it never stops part-way while paused', () => {
  const blood = fn(stage, '  function stepBlood(dt) {');
  assert.match(blood, /bloodEasing = false;/);
  assert.match(blood, /sm\.rev = sm\.rev == null \? rt : eased\(sm\.rev, rt, ease\);/);
  assert.match(blood, /sm\.chevK = sm\.chevK == null \? ct : eased\(sm\.chevK, ct, ease\);/);
  assert.match(stage, /const eased = \(v, to, k\) => \{ if \(Math\.abs\(to - v\) <= 0\.002\) return to; bloodEasing = true; return v \+ \(to - v\) \* k; \};/);
  // The loop sleeps only once they have landed (exactly on their ends).
  assert.match(stage, /!widthEasing && !bloodEasing && !plateEasing\(\)/);
});

test('B9: while the anatomy still shows during the lobule dive, its blood keeps moving (the plate itself holds still)', () => {
  const i = stage.indexOf('if (diveT > 0 && diveT < 1 && !drawOnce && !forceDraw) {');
  assert.ok(i > 0);
  const block = stage.slice(i, stage.indexOf('lastT = flowGate = now; nextFrame(animate); return;', i));
  assert.match(block, /!diveHid && diveFadeO !== 0 && store\.get\(\)\.running/);
  assert.match(block, /stepBlood\(Math\.min\(0\.1, \(now - lastT\) \/ 1000\)\);\n\s*veins\.composite\(vLook, bloodLook\(\), false\);/);
  assert.doesNotMatch(block.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'), /update\(|refreshCTM|syncVeins/);
});
