// The reversed colour and the way the blood and its chevrons run turn on one signal (isReversed), so a
// vein never shows hepatofugal colour while its arrows still point to the liver.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { advanceStream, REVERSE_HOLD, REVERSE_RAMP, REVERSE_SETTLE } from '../src/ui/blood.js';

const STAGE = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('a large forward flow that turns into a small reversed one turns its arrows with the colour', () => {
  const st = { seed: 2 };
  for (let i = 0; i < 200; i++) advanceStream(st, 20, 20, 1 / 60, { rev: false });
  assert.ok(st.vd > 0);
  // Without the signal the eased mean takes 1.5 s × ln(20.3 / 0.3), over 6 s, to cross zero: the old lag.
  const old = { ...st };
  let tOld = null;
  for (let i = 0; i < 1200 && tOld == null; i++) { advanceStream(old, -0.3, -0.3, 1 / 60); if (old.vSlow < 0) tOld = i / 60; }
  assert.ok(tOld > 5, `unruled turn at ${tOld} s`);
  // With it the blood slows, stands still and runs backwards within settle + hold + ramp; it never runs forwards again.
  let t = 0, back = null, prev = st.vd;
  for (let i = 0; i < 300; i++) {
    advanceStream(st, -0.3, -0.3, 1 / 60, { rev: true }); t += 1 / 60;
    if (t > REVERSE_SETTLE + 0.02) assert.ok(st.vd <= 0, `forward again at ${t.toFixed(2)} s`);
    assert.ok(Math.abs(st.vd - prev) < 2, `jump ${prev.toFixed(2)} → ${st.vd.toFixed(2)}`);
    prev = st.vd;
    if (back == null && st.vd < 0) back = t;
  }
  assert.ok(back != null && back < REVERSE_SETTLE + REVERSE_HOLD + REVERSE_RAMP + 0.05, `turned at ${back} s`);
  assert.ok(back >= REVERSE_SETTLE + REVERSE_HOLD - 0.02);
});

test('a flow too small to count as reversed never runs backwards; a phasic swing still does', () => {
  const st = { seed: 4 };
  for (let i = 0; i < 300; i++) { advanceStream(st, -0.1, -0.1, 1 / 60, { rev: false }); assert.ok(st.vd >= 0); }
  const ph = { seed: 5 };
  let back = false;
  for (let i = 0; i < 600; i++) { advanceStream(ph, 2, 2 + 6 * Math.sin(i / 10), 1 / 60, { rev: false, phasic: true }); if (ph.vd < 0) back = true; }
  assert.ok(back);
});

test('reduced motion follows the signal at once', () => {
  const st = { seed: 1 };
  advanceStream(st, 20, 20, 1 / 60, { rev: false, still: true });
  advanceStream(st, -0.3, -0.3, 1 / 60, { rev: true, still: true });
  assert.equal(st.sgn, -1);
  assert.ok(st.vd <= 0);
});

test('the stage passes the colour signal to the stream', () => {
  assert.match(STAGE, /const rt = isReversed\(EDGES\[k\], RF\) \? 1 : 0;\s*const sm = advanceStream\([^;]*rev: !!rt \}\);/);
  assert.match(STAGE, /mode === 'direction'\) \{ const rev = isReversed\(e, f\)/);
});
