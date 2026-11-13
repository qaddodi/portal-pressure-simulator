// A frame where only the ascites ripple moved besides the blood counts as the blood's kind (veins-gl.js bloodSeq, with the fluid's band added to its dirty rects) and not as a new picture
// (13 Nov 2026, heat D-3, his Mac warm on an ascites slide): the cards' glass blurs a new picture's region again every third picture and takes the blood's at its own slower pace.
// Node, jsdom, the do-nothing WebGL (tests/stage-gl-boot.js), the renderer's gauge "picture counted as" read frame by frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test('with ascites shown the ripple\'s frames are counted as the blood\'s, not as new pictures', async () => {
  const { st } = await bootGL({ w: 1200, h: 800, labels: 'none' });
  const { store } = await import('../src/ui/store.js');
  const { gpuProbe } = await import('../src/ui/gpu-probe.js');
  const { counts } = await import('../src/ui/frame-counts.js');
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [], healthy = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); else if (m.type === 'healthy') healthy = m; });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'healthyProfile', reqId: 1 });
  store.set({ healthy: { P: healthy.P, Q: healthy.Q, D: healthy.D, metrics: healthy.metrics } });
  await core.handle({ type: 'ackPaint', on: true });
  await core.handle({ type: 'run', running: true });
  store.set({ running: true, params: core.engine().params, layers: { ...store.get().layers, flow: true } });
  const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) { st.update(f); core.handle({ type: 'painted' }); } await tasks(); };
  const watch = async (n) => {
    const seen = [];
    gpuProbe.on = true; gpuProbe.takeGauges();
    try {
      for (let i = 0; i < n; i++) {
        const c0 = counts.composite;
        await step();
        const g = gpuProbe.takeGauges();
        if (counts.composite > c0 && g['picture counted as']) seen.push(g['picture counted as']);
      }
    } finally { gpuProbe.on = false; }
    return seen;
  };
  const tally = (a) => a.reduce((o, k) => (o[k] = (o[k] || 0) + 1, o), {});
  for (let i = 0; i < 300; i++) await step();
  const dry = tally(await watch(90));
  const nDry = Object.values(dry).reduce((a, b) => a + b, 0);
  assert.ok((dry['the blood\'s'] || 0) >= nDry * 0.6 && !dry['the blood\'s, with the ripple\'s band'], `with no fluid shown most frames are the blood's, none carries a ripple's band: ${JSON.stringify(dry)}`);
  await core.handle({ type: 'preset', id: 'cirr-decomp' });
  store.set({ params: core.engine().params });
  for (let i = 0; i < 150; i++) await step();
  const wet = tally(await watch(90));
  const n = Object.values(wet).reduce((a, b) => a + b, 0), ripple = wet['the blood\'s, with the ripple\'s band'] || 0;
  assert.ok(n >= 30, `the figure is drawn (${n} frames)`);
  assert.ok(ripple >= 20, `frames where only the ripple and the blood moved are the blood's: ${JSON.stringify(wet)}`);
  // (What is left is picture that really changed: the vessel rows drawn again from a model frame, a whole picture, the tubes or geometry. Never "uniforms changed": that is the ripple's phase alone.)
  assert.ok(!wet['a new picture: uniforms changed'], `no frame is new for the ripple's phase alone: ${JSON.stringify(wet)}`);
});
