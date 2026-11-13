// 13 Nov 2026, the Circuit's TIPS slide on an iPhone (headless shot): "R collaterals ×6.5 / vs healthy liver" lay on the liver's zigzag, and the
// "Esophageal route → azygos" caption ran through the collaterals' zigzag on its own lane. A resistor's zigzag keeps at least 8 px of teeth on the
// screen, but the labels kept off a 22-unit band that shrank with the map to about 5 px on a phone. Now the band is the zigzag as drawn (its teeth,
// line and outline), and a lane caption that must ride on its lane takes a spot along it clear of the zigzag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

// (The distance from a point to a segment.)
const segD = (px, py, x0, y0, x1, y1) => { const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L)); return Math.hypot(px - x0 - t * dx, py - y0 - t * dy); };
// (Whether a box comes within `r` px of a polyline: its corners, centre and edge midpoints against each segment, and each vertex inside it.)
function boxNear(b, pts, r) {
  const [x0, y0, x1, y1] = b, P = [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [(x0 + x1) / 2, (y0 + y1) / 2], [(x0 + x1) / 2, y0], [(x0 + x1) / 2, y1], [x0, (y0 + y1) / 2], [x1, (y0 + y1) / 2]];
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const [ax, ay, bx, by] = [pts[i], pts[i + 1], pts[i + 2], pts[i + 3]];
    if (ax >= x0 && ax <= x1 && ay >= y0 && ay <= y1) return true;
    for (const [px, py] of P) if (segD(px, py, ax, ay, bx, by) < r) return true;
  }
  return false;
}

const DEV = { iPhone: [390, 844, 3, true], Mac: [1440, 900, 1, false] };
for (const name of (process.env.RES_DEV || 'iPhone').split(',')) {
  const [w, h, dpr, coarse] = DEV[name];
  test(`${name}: no figure label lies on a resistor's zigzag in the Circuit with a TIPS`, async () => {
    const { st } = await bootGL({ w, h, dpr, coarse });
    const { store } = await import('../src/ui/store.js');
    const { createCore } = await import('../src/worker-core.js');
    const tasks = () => new Promise((r) => setImmediate(r));
    let q = [], healthy = null;
    const core = createCore((m) => { if (m.type === 'frame') q.push(m); else if (m.type === 'healthy') healthy = m; });
    await core.handle({ type: 'init' });
    await core.handle({ type: 'healthyProfile', reqId: 1 });
    store.set({ healthy: { P: healthy.P, Q: healthy.Q, D: healthy.D, metrics: healthy.metrics } });
    await core.handle({ type: 'preset', id: 'cirr-decomp' });
    await core.handle({ type: 'setParams', params: { ...core.engine().params, tips: { on: true, d: 8 } }, settle: true });
    await core.handle({ type: 'run', running: true });
    store.set({ running: true, params: core.engine().params });
    const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) st.update(f); await tasks(); await tasks(); };
    for (let i = 0; i < 60; i++) await step();
    st.setView('circuit');
    st.setSites(['rGut', 'rColl', 'rLiver']);
    for (let i = 0; i < 400; i++) await step();
    const zigs = st.resZigs().filter((z) => z.pts.length >= 4);
    assert.ok(zigs.length >= 2, `the resistors are drawn (${zigs.length})`);
    // (Each zigzag as the labels keep off it: the straight run from its first point to its last, as wide as its band (teeth, line, outline).)
    const local = zigs.map((z) => ({ band: z.band, pts: [...st.worldToLocal(z.pts[0], z.pts[1]), ...st.worldToLocal(z.pts.at(-2), z.pts.at(-1))] }));
    const items = st.labelLaid().items.filter((d) => d.box && !d.hide);
    assert.ok(items.some((d) => d.key.startsWith('r:')), `the resistors' readings show (${items.map((d) => d.key).join(' ')})`);
    const on = [];
    for (const d of items) for (const z of local) if (boxNear(d.box, z.pts, z.band - 1)) on.push(`${d.key} [${d.box.map(Math.round)}] zig ${local.indexOf(z)} band ${z.band.toFixed(1)} at ${z.pts.slice(0, 2).map(Math.round)}..${z.pts.slice(-2).map(Math.round)}`);
    // (The lane captions, from what the GPU drew: its picture's box, device px over dpr.)
    const lanes = (st.labelSnapshot().items || []).filter((d) => d.key.startsWith('lane:') && d.a > 0.01 && !d.clipped);
    for (const d of lanes) for (const z of local) if (boxNear([d.x, d.y, d.x + d.w, d.y + d.h], z.pts, z.band - 1)) on.push(`${d.key} [${[d.x, d.y, d.w, d.h].map(Math.round)}]`);
    assert.deepEqual(on, [], 'labels on a zigzag');
  });
}
