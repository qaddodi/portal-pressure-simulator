import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A pan starts where the finger is once it has moved past the slop (8 px touch, 4 px mouse): the figure does not jump the
// slop in its first frame (review item 22). The start point is taken once; later moves keep it.
test('a pan rebases its start point the moment it first counts as moved', () => {
  const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(st, /\(ev\.pointerType === 'touch' \? 8 : 4\)\) \{ if \(!drag\.moved\) \{ drag\.moved = true; drag\.x = ev\.clientX; drag\.y = ev\.clientY; \} clearPress\(\); \}/);
  assert.match(st, /x: drag\.vx \+ \(ev\.clientX - drag\.x\) \/ drag\.s0, y: drag\.vy \+ \(ev\.clientY - drag\.y\) \/ drag\.s0/);
});
