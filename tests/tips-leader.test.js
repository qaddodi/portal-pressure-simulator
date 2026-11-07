// The TIPS slide's "Right hepatic vein" reading keeps its leader in every frame (5 Nov 2026, Mohammad: "leader doesn't show up and sometimes
// flickers"). The real stage with GPU labels in node (tests/stage-gl-boot.js), the procedure played as a slide plays it (stepped to its
// needle), the model playing: once its shot has landed, the reading and its leader are drawn in every frame, the leader at the reading's
// strength, from the reading's record (want bits), and never off and on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, now } from './stage-gl-boot.js';

const { st, frame } = await bootGL();
const { store } = await import('../src/ui/store.js');
const { playProcedure } = await import('../src/ui/proc-anim.js');

test("the right hepatic vein's reading has its leader in every frame of the TIPS slide once its shot lands", async () => {
  store.set({ presenting: true, presentLabels: ['IVCS', 'RHV'], presentTerms: null });
  playProcedure(st, 'tips', { stepped: true, to: 1, onMark: (m, names) => store.set({ presentLabels: [...names] }) });
  const t0 = now(), rows = [];
  for (let i = 0; i < 560; i++) {
    await frame();
    const t = now() - t0;
    if (t < 6000) continue;   // (the catheter in and its shot landed: 'way' then 'tip', 1.5 s glides)
    const sn = st.labelSnapshot(), d = sn.items.find((x) => x.key === 'n:RHV'), ln = sn.marks.find((m) => m.k === 'n:RHV' && m.kind === 'line');
    rows.push([Math.round(t), !!d, ln ? ln.a : 0, ln ? Math.hypot(ln.x1 - ln.x0, ln.y1 - ln.y0) : 0]);
  }
  assert.ok(rows.length > 100);
  for (const [t, drawn, a, L] of rows) {
    assert.ok(drawn, `the reading is drawn at ${t} ms`);
    assert.ok(a > 0.9 && L > 8, `its leader is drawn in full at ${t} ms: alpha ${a}, ${L.toFixed(1)} px`);
  }
});
