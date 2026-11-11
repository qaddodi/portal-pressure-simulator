// While the TIPS stent unrolls, its clip (a plain path in a <clipPath>) is not a mark: the GPU marks painter drew it as a solid black rectangle at the
// origin of the figure, which panned and zoomed with it (Mohammad, 11 Nov 2026: "as soon as I placed the TIPS the black box showed up").
// Geometry as the stage holds it, node and jsdom (tests/stage-gl-boot.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test('a stent that is still unrolling has its clip left out of the marks, and every mark and stent coordinate is finite', async () => {
  const { st } = await bootGL({ w: 1200, h: 800, labels: 'none' });
  const { store } = await import('../src/ui/store.js');
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [], lastF = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'run', running: true });
  await core.handle({ type: 'preset', id: 'healthy' });
  await core.handle({ type: 'setParams', params: { ...core.engine().params, tips: { on: true, d: 8 } }, settle: true });
  store.set({ params: core.engine().params });
  let sawClip = false;
  for (let i = 0; i < 80; i++) {
    pump(48); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks();
    for (const c of document.querySelectorAll('clipPath')) {
      for (const el of c.querySelectorAll('*')) {
        if (!c.id.startsWith('vstClip')) continue;
        sawClip = true;
        assert.ok(!el.hasAttribute('data-gl'), `the clip ${c.id} has a path the marks painter took for a mark (frame ${i})`);
      }
    }
  }
  assert.ok(sawClip, 'the test saw the stent while its clip was in the page');
  for (const el of document.querySelectorAll('.stent-mark, .stent-cover, .stent-strut, .stent-rail, .stent-ring')) {
    for (const n of (el.getAttribute('d') || '').match(/-?[\d.]+(?:e-?\d+)?|NaN|Infinity/g) || []) assert.ok(Number.isFinite(Number(n)), `${el.getAttribute('class')} has a coordinate that is not a number: ${n}`);
    for (let e = el; e && e.tagName !== 'BODY'; e = e.parentNode) assert.ok(!/NaN|Infinity/.test(e.getAttribute?.('transform') || ''), 'a stent transform is a number');
  }
});
