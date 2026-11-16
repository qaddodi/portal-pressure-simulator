// A stent is never switched in one step (16 Nov 2026, Mohammad: "the TIPS comes in and out of existence, pops"): a change of patient
// (the presenter's arm buttons) and a live change (the treatment menu) open or close it through its width, so the shunt's flow, its drawn
// width (the engine's diameter) and the mesh drawn over it come and go together, with no jump between two frames.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';
import { Engine } from '../src/engine/engine.js';
import { STENT_CLOSED_D, stentMix } from '../src/engine/stent-ease.js';
import { deepMerge } from '../src/engine/scenario.js';

const stateOf = (patch) => { const e = new Engine(); e.setParams(deepMerge(e.params, patch)); e.settle(); return e.snapshot(); };
const STENTS = [['tips', 'TIPS'], ['dips', 'DIPS']];

test('stentMix eases the width from or to nothing, and lands on the slide exactly', () => {
  const off = { on: false, d: 8 }, on = { on: true, d: 8 };
  assert.deepEqual(stentMix(off, on, 0), off);
  assert.deepEqual(stentMix(off, on, 1), on);
  assert.deepEqual(stentMix(on, off, 0), on);
  assert.deepEqual(stentMix(on, off, 1), off);
  let prev = 0;
  for (let k = 0.05; k < 1; k += 0.05) {
    const m = stentMix(off, on, k), w = m.on ? m.d : 0;
    assert.ok(m.on && w >= STENT_CLOSED_D && w <= 8, `open on the way, ${w}`);
    assert.ok(w >= prev - 1e-9 && w - prev < 1.2, `grows in small steps (${prev} to ${w})`);
    prev = w;
  }
  prev = 8;
  for (let k = 0.05; k < 1; k += 0.05) {
    const m = stentMix(on, off, k);
    assert.ok(m.on && m.d <= prev + 1e-9 && prev - m.d < 1.2, `narrows in small steps (${prev} to ${m.d})`);
    prev = m.d;
  }
  assert.deepEqual(stentMix(on, { on: true, d: 10 }, 0.5), { on: true, d: 9 }, 'a stent that stays eases its size as before');
  assert.deepEqual(stentMix(off, { on: false, d: 8 }, 0.7), { on: false, d: 8 }, 'two closed sides: nothing to ease');
  assert.equal(stentMix(undefined, undefined, 0.5), undefined);
});

for (const [key, id] of STENTS) {
  test(`${id}: a change of patient opens and closes the shunt with no step in its width or its flow`, (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    let now = 0;
    t.mock.method(performance, 'now', () => now);
    const core = createCore(() => {});
    t.after(() => core.dispose());
    const advance = (ms) => { now += ms; t.mock.timers.tick(ms); };
    const shut = stateOf({ preset: undefined, cirrhosis: 0.7 }), open = stateOf({ cirrhosis: 0.7, [key]: { on: true, d: 8 } });
    core.handle({ type: 'init' });
    for (const [from, to, label] of [[shut, open, 'opening'], [open, shut, 'closing']]) {
      core.handle({ type: 'restore', snap: from });
      const e = () => core.engine(), k = () => e().edges.findIndex((x) => x.id === id);
      const width = () => e().diameterShown(id), flow = () => Math.abs(e().Q[k()]);
      core.handle({ type: 'morph', snap: to, ms: 1200 });
      const qFull = Math.abs((to === open ? to : from).Q[k()]);
      let w = width(), q = flow(), maxW = 0, maxQ = 0, sawOn = 0;
      const wEnd = to === open ? 8 : 0;
      for (let i = 0; i < 50; i++) {
        advance(33);
        const nw = width(), nq = flow();
        maxW = Math.max(maxW, Math.abs(nw - w)); maxQ = Math.max(maxQ, Math.abs(nq - q));
        if (nw > 0 && nw < 8) sawOn++;
        w = nw; q = nq;
      }
      assert.ok(maxW < 1.6, `${label}: the width never steps (largest step ${maxW.toFixed(2)} mm)`);
      assert.ok(sawOn > 5, `${label}: it is partly open for a while (${sawOn} frames)`);
      assert.ok(Math.abs(width() - wEnd) < 1e-9, `${label}: it lands on the slide's width`);
      assert.ok(maxQ < 0.3 * Math.max(qFull, 1), `${label}: no step in the flow (${maxQ.toFixed(2)} of ${qFull.toFixed(2)} mL/s)`);
    }
  });

  test(`${id}: a live change eases the switch through the width and ends with the switch as asked`, () => {
    const e = new Engine();
    e.setParams(deepMerge(e.params, { cirrhosis: 0.7 }));
    e.settle();
    const on = deepMerge(structuredClone(e.params), { [key]: { on: true, d: 8 } });
    e.easeParams(on);
    assert.ok(e.easing(), 'it eases');
    assert.ok(e.diameterShown(id) <= STENT_CLOSED_D + 1e-6, 'it starts narrow, not at its width');
    const seen = [];
    for (let i = 0; i < 400 && e.easing(); i++) { e.easeStep(0.01); seen.push(e.diameterShown(id)); }
    assert.ok(seen.some((d) => d > 0.5 && d < 7.5), 'partly open on the way');
    assert.ok(seen.every((d, i) => i === 0 || d >= seen[i - 1] - 1e-9), 'only widening');
    assert.equal(e.params[key].on, true); assert.equal(e.params[key].d, 8);
    // Closing: narrows through its width, and is out only at the end, at its own width again.
    const off = deepMerge(structuredClone(e.params), { [key]: { on: false } });
    e.easeParams(off);
    assert.equal(e.params[key].on, true, 'still in while it narrows');
    assert.deepEqual(e.paramsTarget()[key], { on: false, d: 8 });
    const back = [];
    for (let i = 0; i < 400 && e.easing(); i++) { e.easeStep(0.01); back.push(e.diameterShown(id)); }
    assert.ok(back.some((d) => d > 0.5 && d < 7.5), 'partly narrowed on the way');
    assert.equal(e.params[key].on, false); assert.equal(e.params[key].d, 8);
    assert.equal(e.diameterShown(id), 0);
  });
}
