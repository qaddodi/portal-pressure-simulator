// L1 (heat-speed-label-lock.md, 12 Nov 2026): the Circuit's lane captions ("Paraumbilical", "Gastrorenal shunt"...) had no world anchor
// (NO_ANCHOR began with lane:), and a hand's pan started no ride, so they stood at their screen spot while the circuit slid under them and
// jumped back to their lanes when the pan ended. Now every lane caption is pinned by its lane point, and a hand's gesture carries any label
// still unpinned with the camera. A trackpad pan (two-finger scroll, wheel events) over the Circuit: every caption moves with the figure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test('Circuit lane captions move with the figure through a trackpad pan, and the pan ends with no fresh solve', async () => {
  const { st, page } = await bootGL({ w: 1440, h: 900, dpr: 1 });
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [], last = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'preset', id: 'cirr-decomp' });
  await core.handle({ type: 'run', running: true });
  const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) last = f; if (last) st.update(last); await tasks(); await tasks(); };
  for (let i = 0; i < 60; i++) await step();
  st.setView('circuit');
  for (let i = 0; i < 260; i++) await step();
  st.setCamera({ ...st.cameraState(), k: st.cameraState().k * 1.12 }, 10);
  for (let i = 0; i < 200; i++) await step();
  const snap = () => new Map((st.labelSnapshot().items || []).map((d) => [d.key, d]));
  const before = snap(), lanes = [...before.values()].filter((d) => d.key.startsWith('lane:') && d.a > 0.01 && !d.clipped);   // (the ones showing)
  assert.ok(lanes.length >= 2, `lane captions show (${JSON.stringify([...before.values()].filter((d) => d.key.startsWith('lane:')).map((d) => [d.key, Math.round(d.x), Math.round(d.y), d.a, d.clipped]))})`);
  for (const d of lanes) assert.ok(d.pin, `${d.key} is pinned to its lane`);
  const solves = st.labelStats().solves, cam0 = { ...st.cameraState() };
  // (A trackpad's two-finger scroll: wheel events with pixel deltas, one a frame, 20 px right and 12 px down each time.)
  const svg = page.document.querySelector('#stage'), W = page.dom.window;
  const lag = [];
  for (let i = 0; i < 12; i++) {
    svg.dispatchEvent(new W.WheelEvent('wheel', { deltaX: -20, deltaY: -12, deltaMode: 0, clientX: 700, clientY: 450, bubbles: true, cancelable: true }));
    await step();
    const now = snap(), dx = (i + 1) * 20, dy = (i + 1) * 12;
    for (const d of lanes) { const n = now.get(d.key); if (n) lag.push(Math.hypot(n.x - d.x - dx, n.y - d.y - dy)); }
    if (i > 0) assert.ok(st.labelFrame().riding, `the hand's pan carries the unpinned labels (frame ${i})`);
  }
  const cam1 = st.cameraState();
  assert.ok(Math.abs(cam1.k - cam0.k) < 1e-6, 'a pure pan');
  assert.ok(lag.length > 0 && Math.max(...lag) <= 1.5, `each caption moved with the figure (worst ${Math.max(...lag).toFixed(1)} px off)`);
  for (let i = 0; i < 60; i++) await step();
  assert.ok(!st.labelFrame().riding, 'the ride ended at the settle');
  // (Each caption stands where the pan carried it, unless that put it past the stage's edge: then it is pulled back in, as before.)
  const after = snap();
  for (const d of lanes) {
    const n = after.get(d.key), x = d.x + 240, y = d.y + 144;
    if (n && x >= 6 && y >= 6 && x + d.w <= 1434 && y + d.h <= 894) assert.ok(Math.hypot(n.x - x, n.y - y) <= 1.5, `${d.key} stands where the pan carried it (${[n.x, n.y, x, y].map(Math.round)})`);
  }
  assert.equal(st.labelStats().solves, solves, 'no fresh solve after a pure pan');
});
