// The figure at rest with the model running and the blood shown (node, jsdom, the do-nothing WebGL; tests/stage-gl-boot.js), 13 Nov 2026, his Mac
// warm on a still slide at Figure size Full (9 MP). A frame where only the blood moved must be the blood's own: the lumens of the vessels whose blood
// did not move are left as drawn ("still lumens left alone", the composite's own gauge), and the frame is not counted as a new picture (the glass then
// takes the blood at 4 Hz instead of blurring a new picture). Two writers made every rest frame new: the bowel's float handed to the live organ stack
// on every draw (stage-vessels.js drawVeinsNow), and the ascites ripple's phase stepped with no fluid shown (stage-transitions.js stepFluid). With the
// fluid shown the ripple is real motion and still moves the picture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test('at rest the blood frames leave still lumens alone; a shown ascites still ripples', async () => {
  const { st } = await bootGL({ w: 1200, h: 800, labels: 'none' });   // (no station labels: their solve was most of the time, and they draw nothing in this composite)
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
  // (One screen frame: the model's newest frame taken in as main.js does, told back, the tasks between frames.)
  const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) { st.update(f); core.handle({ type: 'painted' }); } await tasks(); };
  // (Each composite's gauge, read frame by frame while the probe is on.)
  const watch = async (n) => {
    const seen = [];
    gpuProbe.on = true; gpuProbe.takeGauges();
    try {
      for (let i = 0; i < n; i++) { const c0 = counts.composite; await step(); const g = gpuProbe.takeGauges()['still lumens left alone']; if (counts.composite > c0 && g) seen.push(g); }
    } finally { gpuProbe.on = false; }
    return seen;
  };
  for (let i = 0; i < 300; i++) await step();   // (5 s: past the rest pacing's 4 s, the figure drawn about 30 times a second)
  const rest = await watch(90);
  const left = rest.filter((g) => g !== 'off');
  assert.ok(rest.length >= 30, `the blood is drawn at rest (${rest.length} composites in 1.5 s)`);
  assert.ok(left.length >= rest.length * 0.6, `most rest frames are the blood's alone: ${left.length} of ${rest.length} (${[...new Set(rest)].join('; ')})`);
  const m = /^(\d+) of (\d+) rows$/.exec(left[0]);
  assert.ok(m && +m[1] > +m[2] / 2, `most rows are left as drawn on such a frame: ${left[0]}`);
  // A patient with ascites shown: the ripple moves every frame, so the picture is new each time (its phase still reaches the shader).
  await core.handle({ type: 'preset', id: 'cirr-decomp' });
  store.set({ params: core.engine().params });
  for (let i = 0; i < 150; i++) await step();
  const wet = await watch(60);
  assert.ok(wet.length >= 20, `the blood and the fluid are drawn (${wet.length})`);
  assert.ok(wet.filter((g) => g === 'off').length >= wet.length * 0.8, `with ascites shown the ripple redraws the picture: ${[...new Set(wet)].join('; ')}`);
});
