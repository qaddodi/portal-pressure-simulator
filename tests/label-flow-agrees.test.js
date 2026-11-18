// "Portal inflow" and the portal vein's label name one quantity (play-test B18/B19, 16 Nov 2026). In the Flow lens the confluence's label summed
// the blood entering that node (SMV + splenic, 0.7 L/min in a decompensated patient on propranolol) while the slide's words, the tile and the
// Doppler read the portal vein's own flow beyond the coronary vein's take-off (0.5). The station named for a vessel now reads that vessel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test('the Flow lens reads the portal vein station as the portal flow the tile and the words give', async () => {
  const { st } = await bootGL({ w: 1440, h: 900, dpr: 1, labels: 'all' });
  const { store } = await import('../src/ui/store.js'), { fmtFlow } = await import('../src/ui/util.js');
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [], last = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) last = f; if (last) st.update(last); await tasks(); await tasks(); };
  await core.handle({ type: 'preset', id: 'cirr-comp' });
  await core.handle({ type: 'params', params: { drugs: { propranolol: true } } });
  await core.handle({ type: 'run', running: true });
  store.set({ colorMode: 'flow' });
  for (let i = 0; i < 240; i++) await step();
  const it = st.labelLaid().items.find((x) => x.key === 'n:CONF');
  assert.ok(it, 'the portal vein station is labelled: ' + st.labelLaid().items.map((x) => x.key + '=' + x.text).join(' | '));
  const want = fmtFlow(last.metrics.pvFlow), got = it.text.match(/-?\d+\.\d|< 0\.1/)?.[0];
  assert.equal(Math.round(Math.abs(parseFloat(got) - parseFloat(want)) * 10), 0, `label "${it.text}" vs the portal flow ${want}`);
});
