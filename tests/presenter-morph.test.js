// The presenter's change of patient on the live model ('morph'): the state eases from where it is to the slide's,
// lesions grow (a new thrombus from nothing), a newer target mid-way eases on from wherever it got to (never a jump),
// and it lands exactly on the slide's computed state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';
import { Engine } from '../src/engine/engine.js';
import { deepMerge } from '../src/engine/scenario.js';

const stateOf = (patch) => { const e = new Engine(); e.setParams(deepMerge(e.params, patch)); e.settle(); return e.snapshot(); };

test('a change of patient eases, retargets smoothly mid-way and lands on the exact state', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const core = createCore(() => {});
  t.after(() => core.dispose());
  const advance = (ms) => { now += ms; t.mock.timers.tick(ms); };
  const healthy = stateOf({}), sick = stateOf({ cirrhosis: 0.7, thrombus: { PV_TRUNK: 0.5 } });
  core.handle({ type: 'init' });
  core.handle({ type: 'restore', snap: healthy });
  const e = () => core.engine(), conf = () => e().P[e().ni.CONF];
  const read = () => ({ c: e().params.cirrhosis, th: e().params.thrombus.PV_TRUNK ?? 0, p: conf() });
  const span = Math.abs(sick.P[e().ni.CONF] - healthy.P[e().ni.CONF]);
  assert.ok(span > 2, 'the two patients differ');

  core.handle({ type: 'morph', snap: sick, ms: 2000 });
  let prev = read();
  const seen = [];
  for (let k = 0; k < 30; k++) {   // about 1 s: part way
    advance(33);
    const r = read();
    assert.ok(r.c >= prev.c - 1e-9 && r.th >= prev.th - 1e-9, 'the lesions only grow on the way');
    assert.ok(Math.abs(r.p - prev.p) < span * 0.12, 'no jump in pressure between frames');
    seen.push(r); prev = r;
  }
  assert.ok(prev.c > 0.1 && prev.c < 0.6, `part way, not popped (cirrhosis ${prev.c})`);
  assert.ok(prev.th > 0.05 && prev.th < 0.45, 'the new thrombus grows from nothing');

  // A newer slide mid-way: eases on from here, back toward the healthy liver.
  core.handle({ type: 'morph', snap: healthy, ms: 2000 });
  for (let k = 0; k < 70; k++) {
    advance(33);
    const r = read();
    assert.ok(Math.abs(r.p - prev.p) < span * 0.12, 'no jump when a newer slide retargets');
    assert.ok(r.c <= prev.c + 1e-9, 'retargeted: heads back without overshooting');
    prev = r;
  }
  assert.equal(e().params.cirrhosis, 0);
  assert.equal(e().params.thrombus.PV_TRUNK ?? 0, 0);
  assert.ok(Math.abs(conf() - healthy.P[e().ni.CONF]) < 0.5, 'lands on the slide state');
});
