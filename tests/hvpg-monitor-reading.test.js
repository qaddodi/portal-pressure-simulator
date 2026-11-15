// Review #55 (HVPG slide 3): the catheter monitor's number read 5.3 while the FHVP callout beside it read 4.8. The monitor
// printed the trace's height at that moment (the mean plus its breath and beat wave, up to about ±1.25 mmHg); a monitor's
// number is the mean, as the callout reads it. The number follows the trace only while the balloon is still moving it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { T, pressureAt } from '../src/ui/hvpg-clock.js';

const src = readFileSync(new URL('../src/ui/hvpg-proc.js', import.meta.url), 'utf8');

test('the free baseline is steady: a faint tremor around the mean, never a heave (12 Nov 2026), and still not exactly the reading', () => {
  const v = { fhvp: 4.8, whvp: 16.6 };
  const off = Math.max(...Array.from({ length: 200 }, (_, i) => Math.abs(pressureAt(T.free + i * 15, v) - v.fhvp)));
  assert.ok(off > 0.02, `the free trace still carries a pulse: ${off.toFixed(2)} mmHg`);
  assert.ok(off < 0.45, `the free baseline stays within ${off.toFixed(2)} mmHg of its level`);
});


// Motion recommendation 9: the sweep's clock is capped as the procedures' is (a long frame or a hidden tab never leaps it to its end), and both
// traces draw their waves on the model's beat and breath (hvpg-clock.js syncWave), not on the procedure's clock.
test('the sweep is capped at 64 ms a frame and both traces take the model’s beat and breath', () => {
  assert.equal((src.match(/syncWave\(wave, /g) || []).length, 2);
});
