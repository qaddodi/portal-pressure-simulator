// The scenario pill on a phone (play-test 17 Nov 2026): "Decomp. cirrhosis + TIPS" broke onto three lines and its last word was cut off. Every preset's short form fits the
// pill's two lines.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/engine/scenario.js';
import { shortName, linesOf } from '../src/ui/scenario-names.js';

test('the names the play-test caught fit two lines of the pill (15 characters a line)', () => {
  const names = PRESETS.map((p) => p.label).filter((l) => /^Decompensated|TIPS/.test(l));
  assert.ok(names.includes('Decompensated cirrhosis + TIPS'));
  const long = names.map((l) => [l, shortName(l)]).filter(([, s]) => linesOf(s) > 2);
  assert.deepEqual(long, [], 'a name over the pill\'s two lines needs its own short form (scenario-names.js)');
  assert.equal(shortName('Decompensated cirrhosis + TIPS'), 'Cirrhosis + TIPS');
  assert.equal(shortName('Decompensated cirrhosis'), 'Decomp. cirrhosis');
});
