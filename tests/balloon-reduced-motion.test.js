// Review PROC-6 (15 Nov 2026): under reduced motion the tamponade tube and its balloons go to their end state in one step (no sliding tube, no swelling),
// and let down, they go in one step too. Not under it: they move by their clock, one frame's dt at a time.
import test from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';

const fakeEl = () => ({ setAttribute() {}, append() {}, classList: { add() {} } });
test('the balloon step lands on its goal at once under reduced motion, and only moves by dt otherwise', async () => {
  const saved = { d: globalThis.document, p: globalThis.performance, c: globalThis.document.createElementNS };
  let now = 1000;
  const { reduceMotionMQ } = await import('../src/ui/motion.js');
  const { createBalloon } = await import('../src/ui/stage-balloon.js');
  globalThis.document.createElementNS = fakeEl;
  globalThis.performance = { now: () => now };
  const was = reduceMotionMQ.matches;
  try {
    const mk = () => createBalloon({ ov: { balloons: { innerHTML: '', append() {} } } }, {});
    const on = { balloonGas: true, balloonEso: true };
    reduceMotionMQ.matches = false;
    const a = mk(); a.balloonStep(on, true); now += 16; a.balloonStep(on, true);
    assert.ok(a.bal.adv > 0 && a.bal.adv < 0.1, `moving by its clock: ${a.bal.adv}`);
    assert.equal(a.bal.gas, 0);
    reduceMotionMQ.matches = true;
    const b = mk(); b.balloonStep(on, true);
    assert.deepEqual([b.bal.adv, b.bal.gas, b.bal.eso], [1, 1, 1], 'straight to the end state');
    b.balloonStep({}, true);
    assert.deepEqual([b.bal.adv, b.bal.gas, b.bal.eso], [0, 0, 0], 'and straight out');
    const c = mk(); c.balloonStep({ balloonGas: true }, true);
    assert.deepEqual([c.bal.adv, c.bal.gas, c.bal.eso], [1, 1, 0], 'the gastric balloon alone');
    c.balloonStep(on, false);
    assert.deepEqual([c.bal.adv, c.bal.gas, c.bal.eso], [0, 0, 0], 'off the anatomy view: none');
    await new Promise((r) => setTimeout(r, 30));   // (the drawing the steps asked for runs between frames; nothing may throw)
  } finally { reduceMotionMQ.matches = was; globalThis.document.createElementNS = saved.c; globalThis.performance = saved.p; }
});
