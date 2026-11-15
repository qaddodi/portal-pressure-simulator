// Reduced motion for the tamponade tube (review PROC-6, owner 15 Nov 2026: nothing pops in or out, Reduce Motion included): the tube and its balloons do not slide or swell,
// they fade, in over D_SURFACE and out over D_SMALL, and the picture is never changed while it shows. Not under Reduce Motion: they move by their clock, as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';

const fakeEl = () => ({ setAttribute() {}, append() {}, classList: { add() {} } });
test('under reduced motion the tube fades in and out, never pops; otherwise it moves by dt', async () => {
  const saved = { p: globalThis.performance, c: globalThis.document.createElementNS };
  let now = 1000;
  const { reduceMotionMQ } = await import('../src/ui/motion.js');
  const { D_SMALL, D_SURFACE } = await import('../src/ui/ease.js');
  const { createBalloon } = await import('../src/ui/stage-balloon.js');
  globalThis.document.createElementNS = fakeEl;
  globalThis.performance = { now: () => now };
  const was = reduceMotionMQ.matches;
  try {
    const mk = () => {
      const g = { op: null, innerHTML: '', append() {}, setAttribute(k, v) { if (k === 'opacity') this.op = +v; }, removeAttribute(k) { if (k === 'opacity') this.op = null; } };
      const live = { mk: { ver: 0 } };
      return { g, live, ...createBalloon({ ov: { balloons: g } }, live) };
    };
    const tick = (b, p, ms, anat = true) => { const seen = []; for (let t = 0; t < ms; t += 16) { now += 16; b.balloonStep(p, anat); seen.push(b.g.op ?? 1); } return seen; };
    const on = { balloonGas: true, balloonEso: true };
    reduceMotionMQ.matches = false;
    const a = mk(); a.balloonStep(on, true); now += 16; a.balloonStep(on, true);
    assert.ok(a.bal.adv > 0 && a.bal.adv < 0.1, `moving by its clock: ${a.bal.adv}`);
    assert.equal(a.g.op, null, 'no fade of the group');
    reduceMotionMQ.matches = true;
    const b = mk(); b.balloonStep(on, true);
    assert.equal(b.g.op, 0, 'in from nothing: invisible, then fading in');
    const up = tick(b, on, D_SURFACE + 64);
    assert.ok(up.every((v, i) => i === 0 || v >= up[i - 1]) && up.at(-1) === 1, 'rises to whole');
    assert.ok(up.filter((v) => v > 0 && v < 1).length >= 8, 'in many steps, not a jump');
    assert.deepEqual([b.bal.adv, b.bal.gas, b.bal.eso], [1, 1, 1], 'the end state is drawn whole under the fade');
    assert.ok(b.live.mk.ver > 0, 'the marks are asked to be read again as it fades');
    const down = tick(b, {}, D_SMALL + D_SURFACE + 200);
    assert.ok(down.slice(0, 3).every((v) => v < 1) && down.slice(0, 3).every((v) => v > 0), 'out by steps');
    assert.deepEqual([b.bal.adv, b.bal.gas, b.bal.eso], [0, 0, 0], 'gone once it has faded');
    assert.equal(b.g.op, null, 'and the group is whole again for the next');
    // the gastric balloon alone, then the off-anatomy view
    const c = mk(); c.balloonStep({ balloonGas: true }, true); tick(c, { balloonGas: true }, D_SURFACE + 64);
    assert.deepEqual([c.bal.adv, c.bal.gas, c.bal.eso], [1, 1, 0]);
    tick(c, { balloonGas: true }, D_SMALL + D_SURFACE + 200, false);
    assert.deepEqual([c.bal.adv, c.bal.gas, c.bal.eso], [0, 0, 0], 'off the anatomy view: faded out');
    // a change mid-fade-in turns round from where it is, not from whole
    const d = mk(); d.balloonStep(on, true); const half = tick(d, on, D_SURFACE / 2).at(-1);
    const turn = tick(d, {}, 32);
    assert.ok(turn[0] <= half + 1e-9 && turn.at(-1) < half, `fades out from ${half}: ${turn}`);
    await new Promise((r) => setTimeout(r, 150));   // (the drawing the steps asked for runs between frames; nothing may throw)
  } finally { reduceMotionMQ.matches = was; globalThis.document.createElementNS = saved.c; globalThis.performance = saved.p; }
});
