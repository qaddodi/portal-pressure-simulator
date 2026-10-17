// The scope draws the red wale marks the model reports: on a varix of 5 mm or more (F2, Large) they are at full strength,
// whatever the size, in both the WebGL and the 2D drawings (pregnancy deck, 17 Oct: a 5.5 mm varix with red wale signs
// showed them at a third of their strength).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

test('red wale marks are full from the 5 mm of a large varix', () => {
  const grow5 = (() => { const m = src('instruments.js').match(/gNow = clamp\(\(mv\.d - ([\d.]+)\) \/ ([\d.]+), 0, 1\)/); return (5 - +m[1]) / +m[2]; })();
  const gl = src('endo-gl.js').match(/spot \* 0\.75\) \* sst\(([\d.]+), ([\d.]+), uGrow\)/);
  const cpu = src('endo-render.js').match(/spot \* 0\.75\) \* sstep\(([\d.]+), ([\d.]+), grow\)/);
  assert.ok(gl && cpu, 'both drawings gate the marks by size');
  assert.deepEqual([gl[1], gl[2]], [cpu[1], cpu[2]], 'the two drawings agree');
  assert.ok(+gl[2] <= grow5 + 1e-9, `full at grow ${gl[2]}, a 5 mm varix is ${grow5}`);
});
