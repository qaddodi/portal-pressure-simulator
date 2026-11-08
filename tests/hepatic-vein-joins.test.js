// The three hepatic veins meet the cava (IVC), in the Anatomy and in the Circuit, whatever the patient (Mohammad, 8 Nov 2026: Budd–Chiari
// slide, "the hepatic veins stop short of the IVC with round caps"). Only a figure with clotted (thin) veins and a narrow cava showed it: the
// left hepatic vein ended 10.5 units off the cava's axis, its wall 6.2 from it, so the end was outside the wall, out of the join's reach
// (vein-joins.js: glMaxR + half the vein's radius + 2), and drawn as a bare round cap. Veins end well inside the cava's wall at every caliber.
// (Geometry as the stage's vessels hold it, node and jsdom, tests/stage-gl-boot.js; the shader's blend needs a join, and a join needs the end near.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { EDGE_PATH } from '../src/ui/anatomy.js';
import { bootGL, pump } from './stage-gl-boot.js';

const HV = ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'];
const endOf = (d) => { const m = d.match(/(-?[\d.]+)[ ,]+(-?[\d.]+)\s*$/); return [+m[1], +m[2]]; };

test('anatomy: the veins end apart enough to stay three joins on the cava, none a bar across it, none one with the cava stretches\' node', () => {
  // (vein-joins.js clusters the ends of one model node that lie within 20 units of the first: the three veins and the cava's own ends share IVCS.)
  const NODE = [620, 166], ends = HV.map((id) => endOf(EDGE_PATH[id]));
  const all = [NODE, ...ends];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const d = Math.hypot(all[i][0] - all[j][0], all[i][1] - all[j][1]);
    assert.ok(d >= 20.5, `ends ${i} and ${j} are ${d.toFixed(1)} apart: the join would take them as one (needs 20.5 or more)`);
  }
  for (const [i, id] of HV.entries()) assert.ok(Math.abs(ends[i][0] - 620) <= 5, `${id} ends ${Math.abs(ends[i][0] - 620).toFixed(1)} off the cava's axis`);
});

// The nearest point of a vessel's segments to (x, y): [distance, that segment's half width].
function nearest(segs, x, y) {
  let best = [Infinity, 0];
  for (const [x0, y0, x1, y1, hw] of segs) {
    const dx = x1 - x0, dy = y1 - y0, u = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(x0 + dx * u - x, y0 + dy * u - y);
    if (d < best[0]) best = [d, hw];
  }
  return best;
}

test('the hepatic veins end inside the cava\'s wall, in the Anatomy and the Circuit, healthy and with clotted veins', async () => {
  const { st } = await bootGL({ w: 1200, h: 800, labels: 'none' });
  const { store } = await import('../src/ui/store.js');
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [], lastF = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'run', running: true });
  const step = async () => { pump(48); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks(); };
  const seen = [];
  for (const view of ['anatomy', 'circuit']) {
    if (view === 'circuit') st.setView('circuit');
    for (const preset of ['healthy', 'budd-chiari']) {
      await core.handle({ type: 'preset', id: preset });
      store.set({ params: core.engine().params });
      for (let i = 0; i < 70; i++) await step();
      const by = {};
      for (const s of st.labelVessels().segs) (by[s[5]] ||= []).push(s);
      assert.ok(by.IVC_IS?.length, `${view}/${preset}: the cava is drawn`);
      for (const id of HV) {
        assert.ok(by[id]?.length, `${view}/${preset}: ${id} is drawn`);
        const e = by[id].at(-1), [d, hw] = nearest(by.IVC_IS, e[2], e[3]);
        seen.push(`${view}/${preset} ${id} ${d.toFixed(1)} of ${hw.toFixed(1)}`);
        assert.ok(d <= 0.85 * hw, `${view}/${preset}: ${id} ends ${d.toFixed(1)} px off the cava's course, its half width ${hw.toFixed(1)}: out of the wall, a bare round cap`);
      }
    }
  }
  assert.equal(seen.length, 12);
});
