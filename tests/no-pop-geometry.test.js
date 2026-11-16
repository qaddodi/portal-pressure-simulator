// A collateral that closes, and a clot that forms or goes, fade; they are never put on or taken off the figure whole in one frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FRONT_FADE, frontAlpha, frontOpen } from '../src/ui/collateral-front.js';
import { markFade } from '../src/ui/mark-fade.js';

test('a closing collateral fades out whole over the last of its front, so the hairline is never taken off in one frame', () => {
  assert.equal(frontAlpha(0, true), 1);
  assert.equal(frontAlpha(1 - FRONT_FADE, true), 1);
  assert.equal(frontAlpha(1, true), 0);
  let was = 1;
  for (let i = 0; i <= 100; i++) { const a = frontAlpha(i / 100, true); assert.ok(a <= was + 1e-12 && was - a < 0.06, `step ${i}: ${was} to ${a}`); was = a; }
});
test('an opening collateral comes in from nothing, so its hairline never appears whole', () => {
  assert.equal(frontAlpha(0, false), 0);
  assert.equal(frontAlpha(1, false), 1);
  let was = 0;
  for (let i = 0; i <= 100; i++) { const a = frontAlpha(i / 100, false); assert.ok(a >= was - 1e-12 && a - was < 0.06, `step ${i}: ${was} to ${a}`); was = a; }
});
test('by the time a closing collateral fades, all but its last stretch is a hairline already', () => {
  // the portal end is the last to shut: the fade starts as it does, and the rest has long closed
  assert.equal(frontOpen(1 - FRONT_FADE, true, 1), 0);
  assert.ok(frontOpen(1 - FRONT_FADE, true, 0.5) < 0.05);
  assert.ok(frontOpen(0.8, true, 0) < 1);
});

test('a clot (a mark of its own) fades in after the first build, and out when it goes, in steps (the app steps marks the same way under Reduce Motion)', () => {
  {
    const m = markFade();
    m.begin(); m.end();   // the first build: nothing standing
    m.begin();
    const a0 = m.want('clot:PV_TRUNK', { vessel: 'PV_TRUNK', t: 1 });
    m.hold('clot:PV_TRUNK', {});
    m.end();
    assert.equal(a0, 0, 'a clot that forms starts from nothing');
    let steps = 0;
    while (m.moving() && steps < 1000) { m.step(16); steps++; }
    assert.ok(steps > 3, `fades in over ${steps} steps`);
    assert.equal(m.amount('clot:PV_TRUNK'), 1);
    // a build that no longer wants it: it stays, fading out
    m.begin();
    const out = m.end(() => true);
    assert.equal(out.length, 1, 'the clot that goes is kept to fade');
    steps = 0;
    let gone = 0;
    while (steps < 1000) { const r = m.step(16); gone += r.gone.length; if (gone) break; steps++; }
    assert.ok(steps > 3 && gone === 1, `fades out over ${steps} steps`);
  }
});
