// The slides' pressure strip (presenter.js bigLadder's phone strip): where a bracket's label sits above a bracket shorter than
// it, its leaders break 4 px round the label instead of running through "HVPG" (Lobule 8, Recompensation 5), and the HVPG row
// keeps clear of the falls' hatching under the readings (it came within 3 px at 200 % text).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

test('a raised bracket label breaks its leaders 4 px round it', () => {
  assert.match(src, /b\.above = above;/);
  assert.match(src, /if \(!b\.above \|\| x < bb\.x0 - 4 \|\| x > bb\.x1 \+ 4\) return `M\$\{sx\} \$\{b\.row - 5\}V\$\{top\}`;/);
  assert.match(src, /V\$\{\(bb\.y1 \+ 4\)\.toFixed\(1\)\}/);
  assert.match(src, /M\$\{sx\} \$\{\(bb\.y0 - 4\)\.toFixed\(1\)\}V\$\{top\}/);
  assert.match(src, /b\.lead\.setAttribute\('d', leg\(b\.x0\) \+ leg\(b\.x1\)\);/);
});

test('the HVPG row sits clear of the hatching under the readings at every text size', () => {
  const m = src.match(/S\.hvpg = S\.ny \+ 0\.5 \* v \+ (\d+) \+ ([\d.]+) \* c;/);
  assert.ok(m, 'HVPG row');
  // A raised label's cap top is 0.4 c + 0.72 c over the row: at least 4 units clear of the hatching (ny + 0.5 v) at any size.
  for (const c of [11, 16, 22, 28]) assert.ok(+m[1] + +m[2] * c - 1.12 * c >= 4 + 0.05 * c, `gap at ${c}`);
});
