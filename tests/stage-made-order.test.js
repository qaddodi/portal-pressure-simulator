// The stage is made in one long function: a constant it reads while it is being made must be set above that read, or the page
// stops at startup (31 Oct, d213d755: the labels' host read OVER_ON two thousand lines before it was set; nothing showed on any device).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const STAGE = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('OVER_ON is set before the labels\' host reads it while the stage is made', () => {
  const set = STAGE.indexOf('  const OVER_ON = '), read = STAGE.indexOf('  const labelHost = OVER_ON');
  assert.ok(set > 0 && read > 0, 'both are there');
  assert.ok(set < read, 'set first');
  assert.ok(STAGE.indexOf('  const SOFTWARE = ') < set, 'after what it reads');
  assert.equal(STAGE.split('const OVER_ON = ').length, 2, 'set once');
});
