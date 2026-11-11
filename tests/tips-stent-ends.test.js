// The covered TIPS stent runs the whole tract, vein to vein (Mohammad, 11 Nov 2026, 21:19: "it has to extend all the way including the stent"): on the real stage with the stent whole, its two
// rounded tips lie at the two ends of the tract, which are on the centre lines of the right portal vein and the right hepatic vein, so the stent stands inside both veins; it narrows to a point at
// each end (not the width of a stent: no square end, no bar across a mouth), and it is one stent from end to end, nothing of it floating off the tract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

const num = (d) => (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);

function dist(segs, x, y) {   // the nearest of the segments [x0, y0, x1, y1, hw, id]: [distance, its hw]
  let best = [Infinity, 0];
  for (const [x0, y0, x1, y1, hw] of segs) {
    const dx = x1 - x0, dy = y1 - y0, u = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(x0 + dx * u - x, y0 + dy * u - y);
    if (d < best[0]) best = [d, hw];
  }
  return best;
}

test('with the TIPS whole, its stent runs the whole tract and ends in a tip on the centre line of each vein', async () => {
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
  for (let i = 0; i < 140; i++) { pump(48); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks(); }
  // every point of the stent's drawing: its cover, rails, struts and ring (one stent)
  const parts = [...document.querySelectorAll('.stent-cover, .stent-rail, .stent-strut, .stent-ring')];
  assert.ok(parts.length >= 4, 'the stent is drawn');
  const V = [];
  for (const e of parts) { const n = num(e.getAttribute('d')); for (let i = 0; i + 1 < n.length; i += 2) V.push([n[i], n[i + 1]]); }
  assert.ok(V.length > 40 && V.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
  // the veins' courses and half widths, in the world's units (the stage's segments are in its own: the TIPS's two ends, whose world places are the figure's, give the scale)
  const by = {};
  for (const s of st.labelVessels().segs) (by[s[5]] ||= []).push(s);
  const T = by.TIPS, sc = Math.hypot(T.at(-1)[2] - T[0][0], T.at(-1)[3] - T[0][1]) / Math.hypot(578.4 - 560.8, 230.5 - 424.6);
  assert.ok(sc > 0.2 && sc < 20, `the scale ${sc}`);
  const w = (list) => list.map(([x0, y0, x1, y1, hw]) => [x0 / sc, y0 / sc, x1 / sc, y1 / sc, hw / sc]);
  const ox = T[0][0] / sc - 560.8, oy = T[0][1] / sc - 424.6;
  const shift = (list) => list.map(([x0, y0, x1, y1, hw]) => [x0 - ox, y0 - oy, x1 - ox, y1 - oy, hw]);
  const portal = shift(w([...(by.PVH_R || []), ...(by.PRE_R || [])])), hepatic = shift(w([...(by.POST_R_RHV || []), ...(by.RHV_IVC || [])]));
  const tipsWorld = shift(w(T));
  const nearest = (list, x, y) => dist(list, x, y);
  // its two tips: the cover's points nearest each end of the tract lie at that end (within 3 units) and so inside the vein's lumen, on its centre line
  const endP = tipsWorld[0].slice(0, 2), endH = tipsWorld.at(-1).slice(2, 4);
  for (const [name, end, list] of [['portal', endP, portal], ['hepatic', endH, hepatic]]) {
    let tip = null;
    for (const v of V) if (!tip || Math.hypot(v[0] - end[0], v[1] - end[1]) < Math.hypot(tip[0] - end[0], tip[1] - end[1])) tip = v;
    const gap = Math.hypot(tip[0] - end[0], tip[1] - end[1]);
    assert.ok(gap <= 3, `the ${name} tip stands ${gap.toFixed(1)} short of the tract's end: the stent does not reach the vein`);
    const [d, hw] = nearest(list, tip[0], tip[1]);
    assert.ok(d <= hw, `the ${name} tip is ${d.toFixed(1)} off the vein's centre line, outside its half width ${hw.toFixed(1)}: the stent is not inside the vein`);
    const near = V.filter((v) => Math.hypot(v[0] - tip[0], v[1] - tip[1]) < 3);
    assert.ok(near.length >= 2, 'the tip is a point');
    const wide = V.filter((v) => Math.hypot(v[0] - tip[0], v[1] - tip[1]) < 1.5).map((v) => Math.hypot(v[0] - tip[0], v[1] - tip[1]));
    assert.ok(Math.max(...wide, 0) < 1.5, 'the stent is a point there, not the width of a stent');
  }
});
