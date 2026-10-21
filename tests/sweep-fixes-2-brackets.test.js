// The sweep's bracket fixes (Lobule 8, Recompensation 5) were made on the old ladder's phone strip: a raised label's leaders broke
// round it, and its HVPG row kept clear of the hatching. Both slides now show the Gut to heart chart (21 Oct, one chart everywhere),
// whose brackets carry the same guarantees: the bracket's bar breaks round its own label, and no hatching is drawn to collide with.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const prof = readFileSync(new URL('../src/ui/tool-profile.js', import.meta.url), 'utf8');
const lob = readFileSync(new URL('../src/ui/decks/lobule.js', import.meta.url), 'utf8');
const rec = readFileSync(new URL('../src/ui/decks/recompensation.js', import.meta.url), 'utf8');

test('Lobule 8 and Recompensation 5 show the Gut to heart chart', () => {
  assert.match(lob, /id: 'wedge'[^\n]*tool: \{ kind: 'profile' \}/);
  assert.match(rec, /id: 'carv'[^\n]*tool: \{ kind: 'profile' \}/);
});

test('a bracket\'s bar breaks round its own label, never running through "HVPG"', () => {
  assert.match(prof, /const gap = stack \? bracketLabel\(x0, x1, Infinity, \[tw\(name, 600\), tw\(val, 700\)\]\)\.gap : oneLineGap\(x0, x1, z \* tw\(`\$\{name\} \$\{val\}`, 700\)\);/);
  assert.match(prof, /const bar = gap\[1\] - gap\[0\] >= x1 - x0 - 0\.5 \? '' : `M\$\{x0\} \$\{yy\}H\$\{gap\[0\]\}M\$\{gap\[1\]\} \$\{yy\}H\$\{x1\}`;/);
});

test('the chart draws no hatching under its readings for a bracket row to meet', () => {
  assert.doesNotMatch(prof, /pattern|hatch/i);
});
