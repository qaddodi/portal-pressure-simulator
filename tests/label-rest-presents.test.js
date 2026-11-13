// L-H1 (docs/recommendations/mac-heat-nov13.md, 13 Nov 2026, Mohammad's Mac warm at rest at Figure size Full): at rest the stage lays its labels
// out on every model frame (about 10 a second) and labelGL.sync asked for a picture each time, whatever had changed. The figure waits on its
// rest timer between its paced frames, so each of those asks laid a whole present for the labels alone. Now sync asks only when a label's
// place, alpha, pin or set (or a leader or dot) changed since the last sync; a label whose words change still asks, through its writer (told).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);

test('at rest the labels lay no presents of their own; with a TIPS only its readings\' new values do', async () => {
  const { st } = await bootGL({ w: 1440, h: 900, dpr: 1 });
  const { store } = await import('../src/ui/store.js');
  const { counts } = await import('../src/ui/frame-counts.js');
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [];
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'ackPaint', on: true });
  await core.handle({ type: 'run', running: true });
  store.set({ running: true, params: core.engine().params });
  const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) { st.update(f); core.handle({ type: 'painted' }); } await tasks(); await tasks(); };
  // (2 s at rest, after 5.5 s to get past the rest pacing's 4 s: the presents laid and the figure's composites.)
  const rest = async () => {
    for (let i = 0; i < 330; i++) await step();
    const labels = st.labelSnapshot().items?.filter((d) => d.a > 0.01).length || 0;
    assert.ok(labels >= 5, `labels show (${labels})`);
    const p0 = total(counts.present), c0 = counts.composite;
    for (let i = 0; i < 120; i++) await step();
    return { presents: total(counts.present) - p0, composites: counts.composite - c0 };
  };
  // Healthy: nothing on the figure changes its words at rest, so every present is the figure's (before: 69 presents against 54 composites).
  const h = await rest();
  assert.ok(h.composites >= 30, `the figure is drawn at rest (${h.composites} composites in 2 s)`);
  assert.ok(h.presents <= h.composites * 1.08 + 2, `healthy: no present for the labels alone: ${h.presents} presents against ${h.composites} composites in 2 s`);
  // Decompensated cirrhosis with a TIPS: its readings tick a few times a second, and each new value is a picture of its own (before: 95 against
  // 60; after, about 74).
  await core.handle({ type: 'preset', id: 'cirr-decomp' });
  await core.handle({ type: 'setParams', params: { ...core.engine().params, tips: { on: true, d: 8 } }, settle: true });
  store.set({ params: core.engine().params });
  const t = await rest();
  assert.ok(t.composites >= 30, `the figure is drawn at rest with a TIPS (${t.composites})`);
  assert.ok(t.presents <= t.composites * 1.3 + 2, `TIPS: ${t.presents} presents against ${t.composites} composites in 2 s`);
});
