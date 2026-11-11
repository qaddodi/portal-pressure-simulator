// The TIPS stent's two ends, as the stage draws them with the stent in (Mohammad, 11 Nov 2026: "the ends are disconnected in between the vessels"):
// each end lies inside the wall of the vein it joins (the end of the drawn tube within the vein's half width of the vein's course), and the drawn stent is a curve.
// (Geometry as the stage's vessels hold it, node and jsdom, tests/stage-gl-boot.js; a join needs the end inside the vein, vein-joins.js.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

function nearest(segs, x, y) {
  let best = [Infinity, 0];
  for (const [x0, y0, x1, y1, hw] of segs) {
    const dx = x1 - x0, dy = y1 - y0, u = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(x0 + dx * u - x, y0 + dy * u - y);
    if (d < best[0]) best = [d, hw];
  }
  return best;
}

test('with the TIPS in, both its ends lie inside the wall of the vein they join, and the stent is drawn as a curve', async () => {
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
  for (let i = 0; i < 80; i++) { pump(48); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks(); }
  const by = {};
  for (const s of st.labelVessels().segs) (by[s[5]] ||= []).push(s);
  const tips = by.TIPS;
  assert.ok(tips?.length > 4, 'the stent is drawn');
  const a = [tips[0][0], tips[0][1]], b = [tips.at(-1)[2], tips.at(-1)[3]];
  // the portal end lies on the right portal vein (its two stretches), the hepatic end on the right hepatic vein
  const rpv = [...(by.PVH_R || []), ...(by.PRE_R || [])], rhv = [...(by.POST_R_RHV || []), ...(by.RHV_IVC || [])];
  const [dp, hp] = nearest(rpv, a[0], a[1]), [dh, hh] = nearest(rhv, b[0], b[1]);
  assert.ok(dp <= hp, `the portal end is ${dp.toFixed(1)} off the right portal vein's course, its half width ${hp.toFixed(1)}`);
  assert.ok(dh <= hh, `the hepatic end is ${dh.toFixed(1)} off the right hepatic vein's course, its half width ${hh.toFixed(1)}`);
  // a curve: the drawn course's farthest point from its chord, a tenth of the chord or more
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let dev = 0;
  for (const s of tips) dev = Math.max(dev, Math.abs((b[0] - a[0]) * (a[1] - s[1]) - (a[0] - s[0]) * (b[1] - a[1])) / L);
  assert.ok(dev / L >= 0.1, `the stent bows ${dev.toFixed(1)} off a chord of ${L.toFixed(0)}`);
});
