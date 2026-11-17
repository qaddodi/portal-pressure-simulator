// Every stent mesh in the figure belongs to a stent and lies on that stent's own route (17 Nov 2026, Mohammad: "abnormally placed TIPS still there, it runs horizontally"):
// with a TIPS on, the layer holds one mesh, the TIPS's, within its route's box; with none, no mesh at all; in the Anatomy, the Circuit and the Circuit turned upright.
// The real stage in node (tests/stage-gl-boot.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test('every stent mesh is a stent\'s own, on its route, in each view', async () => {
  const { st, page } = await bootGL({ w: 430, h: 932 });
  const { store } = await import('../src/ui/store.js');
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [];
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'preset', id: 'healthy' });
  const base = JSON.parse(JSON.stringify(core.engine().params));
  let lastF = null;
  const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks(); };
  const frames = async (n) => { for (let i = 0; i < n; i++) await step(); };
  const set = async (tips) => { const P = JSON.parse(JSON.stringify(base)); if (tips) P.tips = { on: true, d: 8 }; await core.handle({ type: 'setParams', params: P, settle: true }); store.set({ params: P }); };
  store.set({ params: base });
  await core.handle({ type: 'run', running: true });
  const meshes = () => [...page.document.querySelectorAll('[data-mk^="vst:"], [data-mk^="stent:"]')].map((e) => {
    const nums = [...e.querySelectorAll('path')].flatMap((p) => (p.getAttribute('d') || '').match(/-?\d+\.?\d*/g) || []).map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2);
    return { key: e.getAttribute('data-mk'), box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
  });
  const check = async (what) => {
    await frames(500);
    const m = meshes();
    assert.deepEqual(m.map((x) => x.key), ['vst:TIPS'], `${what}: one mesh, the TIPS's`);
    const c = st.stentHalf('TIPS', 2).cur, pad = 25;
    const box = [Math.min(...c.map((a) => a[0])) - pad, Math.min(...c.map((a) => a[1])) - pad, Math.max(...c.map((a) => a[0])) + pad, Math.max(...c.map((a) => a[1])) + pad];
    const b = m[0].box;
    assert.ok(b[0] >= box[0] && b[1] >= box[1] && b[2] <= box[2] && b[3] <= box[3], `${what}: the mesh [${b.map((v) => v | 0)}] lies on the TIPS's route [${box.map((v) => v | 0)}]`);
  };
  st.setView?.('anatomy');
  await set(false);
  await frames(60);
  assert.deepEqual(meshes(), [], 'no TIPS, no mesh');
  await set(true);
  await check('anatomy');
  st.setView?.('circuit');
  await check('circuit');
  st.setCircuitRotated(true);
  await check('circuit turned upright');
  st.setCircuitRotated(false);
  await check('circuit turned back');
  st.setView?.('anatomy');
  await check('anatomy again');
  await set(false);
  await frames(400);
  assert.deepEqual(meshes(), [], 'the TIPS removed, no mesh left behind');
});
