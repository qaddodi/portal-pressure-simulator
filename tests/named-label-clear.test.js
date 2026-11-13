// Variceal bleed slide 5 on a Mac (screenshot check, 11 Nov 2026, 1440 x 900, the slide's "portal" framing, SMV and the portal vein named): neither
// had a spot clear of the vessels within 24 px of its dot, and each fell back to one on a vessel, "SMV" on the paraumbilical vein beside it and
// "Portal vein" on the trunk. A reading a slide names (or the reader selects) keeps a spot on a vessel only when it has none clear: it now tries
// 40, 58 and 76 px out on a leader first (stage-label-solve.js, the stations' passes, `wide`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test('a named reading at a close framing stands clear of every vessel, on a leader', async () => {
  const { st } = await bootGL({ w: 1440, h: 900, dpr: 1 });
  const { store } = await import('../src/ui/store.js');
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [], last = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'preset', id: 'cirr-decomp' });
  await core.handle({ type: 'run', running: true });
  const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) last = f; if (last) st.update(last); await tasks(); await tasks(); };
  for (let i = 0; i < 60; i++) await step();
  store.set({ presenting: true, presentLabels: ['SMV', 'CONF'], presentTerms: null });
  // (The slide's framing: zoomed 2.2 times, the SMV's dot where the Mac's shot had it, x 925, y 561.)
  let vt = { k: 2.2, x: 0, y: 0 };
  for (let it = 0; it < 3; it++) {
    st.setCamera(vt, 10);
    for (let i = 0; i < 40; i++) await step();
    const m = st.vesselMid('SMV_CONF');
    vt = { ...st.cameraState() }; vt.x += 925 - m.x; vt.y += 561 - m.y;
  }
  for (let i = 0; i < 200; i++) await step();
  const lv = st.labelVessels(), laid = st.labelLaid().items;
  for (const key of ['n:SMV', 'n:CONF']) {
    const it = laid.find((i) => i.key === key);
    assert.ok(it, `${key} shows (${JSON.stringify(laid.map((i) => i.key))})`);
    const [x0, y0, x1, y1] = it.box;
    let worst = Infinity, by = null;
    for (const q of lv.segs) for (let u = 0; u <= 1; u += 0.1) {
      const x = q[0] + (q[2] - q[0]) * u, y = q[1] + (q[3] - q[1]) * u, d = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1)) - q[4];
      if (d < worst) { worst = d; by = q[5]; }
    }
    assert.ok(worst >= 0, `${key} clear of every vessel: ${worst.toFixed(1)} px from ${by} (${JSON.stringify(it.box.map(Math.round))}, slot ${st.labelSlots()[key]})`);
    assert.ok(it.leader, `${key} on a leader to its dot`);
  }
});
