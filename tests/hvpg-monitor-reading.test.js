// Review #55 (HVPG slide 3): the catheter monitor's number read 5.3 while the FHVP callout beside it read 4.8. The monitor
// printed the trace's height at that moment (the mean plus its breath and beat wave, up to about ±1.25 mmHg); a monitor's
// number is the mean, as the callout reads it. The number follows the trace only while the balloon is still moving it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { T, pressureAt } from '../src/ui/hvpg-clock.js';

const src = readFileSync(new URL('../src/ui/hvpg-proc.js', import.meta.url), 'utf8');

test('the trace wavers around the mean, so the trace height is not the reading', () => {
  const v = { fhvp: 4.8, whvp: 16.6 };
  const off = Math.max(...Array.from({ length: 200 }, (_, i) => Math.abs(pressureAt(T.free + i * 15, v) - v.fhvp)));
  assert.ok(off > 0.3, `the free trace wavers by ${off.toFixed(2)} mmHg`);
});

test('the monitor and the callouts print the mean FHVP and WHVP, not the trace height', () => {
  assert.match(src, /ph === 'free'\) \{ label = 'FHVP'; num = fmt\(v\.fhvp, 1\)/, 'monitor FHVP');
  assert.match(src, /num = fmt\(t < T\.callout \? pAt\(t, v\) : v\.whvp, 1\)/, 'monitor WHVP once settled');
  assert.match(src, /ph === 'free'\) labels\.push\(\{ key: 'f', at: 'tip', kicker: 'FHVP', text: fmt\(v\.fhvp, 1\)/, 'FHVP callout');
  assert.match(src, /kicker: 'WHVP', text: fmt\(v\.whvp, 1\)/, 'WHVP callout');
  assert.doesNotMatch(src, /kicker: '(?:FHVP|WHVP)', text: fmt\(pAt/, 'no callout prints the trace height');
});
