// A slide's numbered steps (deck visuals V10: steps with glowSeq, ext-callouts.js) as the GPU draws them (5 Nov 2026, Mohammad on "Gut blood
// crosses two capillary beds in series": "1,2,3,4,5 without leaders"). A number that does not stand on its vessel's point is joined to it by a
// leader and a dot on the vessel, however near it stands; a group's number by a fan, one line from each of its vessels. The real stage in node
// (tests/stage-gl-boot.js), the slide's glow and steps set as the presenter sets them, the model playing; read back from label-gl's snapshot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL } from './stage-gl-boot.js';

const { st, frame } = await bootGL();
const { store } = await import('../src/ui/store.js');
const { stepPlan } = await import('../src/ui/callout-math.js');
const { EDGES } = await import('../src/engine/topology.js');
const EIDS = new Set(EDGES.map((e) => e.id));
const SEQ = 550;

// (The slide as the presenter lands it: its glow, each entry lit SEQ ms after the one before (presenter.js slideTargets), and its steps.)
function slide(glow) {
  store.set({ presenting: true, presentLabels: [], presentTerms: null });
  st.setGlow(glow.flatMap((g, i) => [g].flat().map((id) => ({ id, tone: 'accent', at: i * SEQ }))));
  st.callouts({ live: {}, organs: [], calipers: [], spans: [], zone: -1, steps: stepPlan(glow, SEQ, (id) => EIDS.has(id), () => false) });
}
const run = async (n) => { for (let i = 0; i < n; i++) await frame(); };
const steps = (sn) => sn.items.filter((d) => d.key.startsWith('fxs:'));
const marksOf = (sn, k) => sn.marks.filter((m) => m.k === k);
const inside = (d, x, y) => x >= d.x && x <= d.x + d.w && y >= d.y && y <= d.y + d.h;

test("every step's number that stands off its vessel's point has a leader to it and a dot on the vessel", async () => {
  slide(['V_INT', 'PV_TRUNK', 'SIN_RR', 'RHV_IVC', 'IVCS_RA']);   // (the demo deck's "Gut blood crosses two capillary beds in series")
  await run(170);   // (past the last step's moment and its fade)
  for (let f = 0; f < 30; f++) {
    await frame();
    const sn = st.labelSnapshot(), drawn = steps(sn);
    assert.equal(drawn.length, 5, `all five numbers drawn: ${drawn.map((d) => d.key)}`);
    for (const d of drawn) {
      assert.ok(d.pin && Number.isFinite(d.px), `${d.key} is pinned to its vessel's point`);
      if (inside(d, d.px, d.py)) continue;   // (one that stands on its point needs neither)
      const mk = marksOf(sn, d.key), dot = mk.find((m) => m.kind === 'leader-dot'), line = mk.find((m) => m.kind === 'line');
      assert.ok(dot, `${d.key}, off its point, has a dot on the vessel (frame ${f}): ${JSON.stringify(mk)}`);
      assert.ok(Math.hypot(dot.x0 - d.px, dot.y0 - d.py) < 1, `${d.key}'s dot is on its point`);
      assert.ok(line && line.a > 0.5, `${d.key} has its leader (frame ${f}): ${JSON.stringify(mk)}`);
      assert.ok(Math.hypot(line.x0 - d.px, line.y0 - d.py) < 6, `${d.key}'s leader starts at its dot`);
    }
  }
});

test("a group's number is joined to each of its vessels by a line of its fan, not by one leader from the point between them", async () => {
  slide([['V_INT', 'V_SPL', 'V_IMV'], ['SIN_RR', 'SIN_LL'], 'RHV_IVC']);   // (the circulation deck's "series": a bed is a group of vessels)
  await run(120);
  const sn = st.labelSnapshot();
  for (const [k, n] of [['fxs:1', 3], ['fxs:2', 2]]) {
    const d = steps(sn).find((x) => x.key === k);
    assert.ok(d, `${k} is drawn`);
    const lines = marksOf(sn, k).filter((m) => m.kind === 'line');
    assert.equal(lines.length, n, `${k}: one line from each of its ${n} vessels: ${JSON.stringify(lines)}`);
    for (const l of lines) assert.ok(Math.hypot(l.x0 - d.px, l.y0 - d.py) > 6, `${k}: no line from the point between its vessels ${d.px},${d.py} ${JSON.stringify(lines)}`);
  }
});
