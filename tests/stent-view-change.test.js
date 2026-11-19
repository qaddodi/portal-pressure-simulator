// The stent never stands on the old view's route while the view changes (17 Nov 2026, Mohammad: "glitched abnormal TIPS stent appearing in circuit view" after adding a
// TIPS and switching to the Circuit): its mesh is built once, between frames, on the route the vessel has then, so through the morph it fades out and comes back, built on
// the new route, once the view has landed. The real stage in node (tests/stage-gl-boot.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test('the TIPS stent fades out as the view changes and returns on the new route', async () => {
  const { st, page } = await bootGL({ w: 1000, h: 1300 });
  const { store } = await import('../src/ui/store.js');
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [];
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'preset', id: 'psvd' });
  const base = JSON.parse(JSON.stringify(core.engine().params));
  let lastF = null;
  const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks(); };
  const frames = async (n) => { for (let i = 0; i < n; i++) await step(); };
  store.set({ params: base });
  await core.handle({ type: 'run', running: true });
  st.setView?.('anatomy');
  await frames(60);
  const P = JSON.parse(JSON.stringify(base));
  P.tips = { on: true, d: 8 };
  await core.handle({ type: 'setParams', params: P, settle: true });
  store.set({ params: P });
  await frames(300);
  assert.ok(st.stentAmount('TIPS') > 0.95, `the stent stands in Anatomy: ${st.stentAmount('TIPS')}`);
  const bbox = () => {
    const r = page.document.querySelector('[data-mk="vst:TIPS"]');
    if (!r) return null;
    const nums = [...r.querySelectorAll('path')].flatMap((e) => (e.getAttribute('d').match(/-?\d+\.?\d*/g) || []).map(Number));
    let x0 = 1e9, x1 = -1e9;
    for (let i = 0; i + 1 < nums.length; i += 2) { x0 = Math.min(x0, nums[i]); x1 = Math.max(x1, nums[i]); }
    return [x0, x1];
  };
  const anatomyBox = bbox();
  st.setView?.('circuit');
  let sawMorph = 0, shownMid = 0, firstGone = -1;
  for (let i = 0; i < 400; i++) {
    await step();
    const t = st.viewMorph(), a = st.stentAmount('TIPS');
    if (t > 0 && t < 1) { sawMorph++; if (a > 0.05) shownMid++; if (a <= 0.05 && firstGone < 0) firstGone = sawMorph; }
  }
  assert.ok(sawMorph > 5, `the view morphs over some frames: ${sawMorph}`);
  assert.ok(firstGone > 0 && firstGone <= 20, `the stent is gone within a few frames of the change starting: frame ${firstGone} of ${sawMorph}`);
  assert.ok(shownMid <= 20, `and is not drawn through the middle of the change: ${shownMid} of ${sawMorph} frames`);
  assert.ok(st.stentAmount('TIPS') > 0.95, `it is back once the view has landed: ${st.stentAmount('TIPS')}`);
  const b = bbox(), cur = st.stentHalf('TIPS', 2).cur;
  const cx0 = Math.min(...cur.map((c) => c[0])), cx1 = Math.max(...cur.map((c) => c[0]));
  assert.ok(b && Math.abs(b[0] - cx0) < 30 && Math.abs(b[1] - cx1) < 30, `on the Circuit's route: mesh ${b}, route ${cx0}-${cx1} (Anatomy's was ${anatomyBox})`);
});
