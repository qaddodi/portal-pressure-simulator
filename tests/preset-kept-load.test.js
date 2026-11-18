// Loading a patient is paid for once (16 Nov 2026, style play-test: "loading a patient freezes the sim clock for 5-8 s"): the worker keeps the state a
// load leaves, as a deck's chain does, and picking the same patient again restores it, to the same model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';

test('the same patient loaded again comes back from its kept snapshot: the same model, and a fraction of the work', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const messages = [];
  const core = createCore((m) => messages.push(m));
  t.after(() => core.dispose());
  await core.handle({ type: 'init' });
  const load = async (reqId) => {
    const t0 = process.hrtime.bigint();
    await core.handle({ type: 'preset', id: 'cirr-decomp', reqId });
    return { ms: Number(process.hrtime.bigint() - t0) / 1e6, params: JSON.parse(JSON.stringify(core.engine().params)), hvpg: core.engine().t };
  };
  const first = await load(1);
  await core.handle({ type: 'preset', id: 'healthy', reqId: 2 });   // (another patient between: the model really changes, then comes back)
  const second = await load(3);
  assert.deepEqual(second.params, first.params, 'the same patient');
  assert.equal(messages.filter((m) => m.type === 'presetLoaded').length, 3);
  assert.ok(second.ms < first.ms / 2, `the second load restores: ${second.ms.toFixed(0)} ms against ${first.ms.toFixed(0)} ms`);
});
