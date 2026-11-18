// The parcels' ease (the chevrons on, a patient just picked, then paused): 22 s of pictures at 30 a second before the links had eased to their goals one after another;
// each follows its parent's goal now (blood.js createStreamChain), and the figure sleeps by fourteen seconds. (blood-chain.test.js has the chain alone.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test('a paused figure with the chevrons on stops drawing within fourteen seconds of a patient being picked', async () => {
  const { createCore } = await import('../src/worker-core.js');
  const { store } = await import('../src/ui/store.js');
  const frameMod = await import('../src/ui/frame.js');
  const { st } = await bootGL({ w: 390, h: 844, dpr: 3, coarse: true });
  store.set({ blood: { ...store.get().blood, chevrons: true } });
  const q = [], core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' }); await core.handle({ type: 'ackPaint', on: true }); await core.handle({ type: 'run', running: true });
  const step = async () => { pump(16.7); const f = q.at(-1); q.length = 0; if (f) { st.update(f); core.handle({ type: 'painted' }); } await new Promise((r) => setImmediate(r)); };
  for (let i = 0; i < 60; i++) await step();
  await core.handle({ type: 'preset', id: 'cirr-decomp' });
  for (let i = 0; i < 200; i++) await step();
  await core.handle({ type: 'run', running: false }); store.set({ running: false });
  for (let i = 0; i < 60 * 14; i++) await step();
  const a = { ...frameMod.perf().totals.drawn };
  for (let i = 0; i < 120; i++) await step();
  const d = frameMod.perf().totals.drawn;
  assert.equal((d.stage || 0) - (a.stage || 0), 0, 'no picture drawn, paused and still, fourteen seconds on');
});

