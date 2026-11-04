import { stageSource } from './stage-src.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A pan starts where the finger is once it has moved past the slop (8 px touch, 4 px mouse): the figure does not jump the
// slop in its first frame (review item 22). The start point is taken once; later moves keep it.
test('a pan rebases its start point the moment it first counts as moved', () => {
  const st = stageSource();
  assert.match(st, /\(ev\.pointerType === 'touch' \? 8 : 4\)\) \{ if \(!(?:live\.)?(?:live\.)?drag\.moved\) \{ (?:live\.)?(?:live\.)?drag\.moved = true; (?:live\.)?(?:live\.)?drag\.x = ev\.clientX; (?:live\.)?(?:live\.)?drag\.y = ev\.clientY; \} clearPress\(\); \}/);
  assert.match(st, /PAN_IN\.x = (?:live\.)?drag\.vx \+ \(ev\.clientX - (?:live\.)?drag\.x\) \/ (?:live\.)?drag\.s0; PAN_IN\.y = (?:live\.)?drag\.vy \+ \(ev\.clientY - (?:live\.)?drag\.y\) \/ (?:live\.)?drag\.s0;/);
});
