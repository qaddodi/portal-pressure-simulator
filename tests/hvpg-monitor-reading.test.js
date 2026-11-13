// Review #55 (HVPG slide 3): the catheter monitor's number read 5.3 while the FHVP callout beside it read 4.8. The monitor
// printed the trace's height at that moment (the mean plus its breath and beat wave, up to about ±1.25 mmHg); a monitor's
// number is the mean, as the callout reads it. The number follows the trace only while the balloon is still moving it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { T, pressureAt } from '../src/ui/hvpg-clock.js';

const src = readFileSync(new URL('../src/ui/hvpg-proc.js', import.meta.url), 'utf8'), mon = readFileSync(new URL('../src/ui/monitor.js', import.meta.url), 'utf8');

test('the free baseline is steady: a faint tremor around the mean, never a heave (12 Nov 2026), and still not exactly the reading', () => {
  const v = { fhvp: 4.8, whvp: 16.6 };
  const off = Math.max(...Array.from({ length: 200 }, (_, i) => Math.abs(pressureAt(T.free + i * 15, v) - v.fhvp)));
  assert.ok(off > 0.02, `the free trace still carries a pulse: ${off.toFixed(2)} mmHg`);
  assert.ok(off < 0.45, `the free baseline stays within ${off.toFixed(2)} mmHg of its level`);
});

test('the monitor and the callouts print the mean FHVP and WHVP, not the trace height', () => {
  // (The HVPG catheter's script for the one monitor, monitor.js: the number is the mean, and follows the trace only while the balloon still moves it.)
  assert.match(src, /if \(t < T\.inflate\) \{ o\.label = 'FHVP'; o\.num = fmt\(v\.fhvp, 1\)/, 'monitor FHVP');
  assert.match(src, /o\.num = fmt\(t < T\.callout \? pressureAt\(t, v, st\.wave\) : v\.whvp, 1\)/, 'monitor WHVP once settled');
  // (The callouts are kept objects whose text is set in place from the mean, fm1 = fmt cached by the number.)
  assert.match(src, /ph === 'free'\) \{ lblF\.text = fm1\(cF, v\.fhvp\);/, 'FHVP callout');
  assert.match(src, /lblW\.text = fm1\(cW, v\.whvp\)/, 'WHVP callout');
  assert.match(mon, /function fm1\(c, v\) \{\s*if \(!Object\.is\(c\.v, v\)\) \{ c\.v = v; c\.s = fmt\(v, 1\); \}/, 'the cached text is fmt of the number');
  assert.doesNotMatch(src, /fm1\([A-Za-z]+, pAt/, 'no callout prints the trace height');
});

// Motion recommendation 9: the sweep's clock is capped as the procedures' is (a long frame or a hidden tab never leaps it to its end), and both
// traces draw their waves on the model's beat and breath (hvpg-clock.js syncWave), not on the procedure's clock.
test('the sweep is capped at 64 ms a frame and both traces take the model’s beat and breath', () => {
  assert.match(src, /function step\(now\) \{\n\s+const dt = Math\.max\(0, Math\.min\(64, now - last\)\); last = now;/);
  assert.equal((src.match(/syncWave\(wave, /g) || []).length, 2);
  assert.match(src, /at: \(tt, v, w\) => pressureAt\(tt, v, w\),/, 'the HVPG script draws the trace on the wave it is handed: the model\'s beat and breath');
  assert.match(src, /cathA\.u = cruise\(k01\(t, T\.travel0, T\.travel1\)\);/, 'the catheter travels at a steady pace');
});
