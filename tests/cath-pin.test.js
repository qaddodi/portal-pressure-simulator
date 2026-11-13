// A measurement's anchor stays where it was taken (Mohammad, 13 Nov 2026: "the FHVP anchor should be where the catheter was and not move continuously
// with it. After the measurement those anchors for FHVP and WHVP should be anchored where they are so they don't glitch. Same for other
// measurements once done"). Played on the real stage as the presenter plays it: once a reading is shown its point in the world never moves
// again, however the vein's calibre eases (the live point ahead of the tip drifts about 0.8 of a world unit as it does; the pin ignores that), until the reading goes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test("every measurement's readings stay where they were taken, even if the vein's calibre eases", async () => {
  const { st } = await bootGL({ w: 1200, h: 800, dpr: 1 });
  const { store } = await import('../src/ui/store.js');
  const { playProcedure } = await import('../src/ui/proc-anim.js');
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [], lastF = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'preset', id: 'cirr-decomp' });
  await core.handle({ type: 'run', running: true });
  const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks(); };
  store.set({ presenting: true, presentLabels: [], params: core.engine().params });
  for (let i = 0; i < 100; i++) await step();
  for (const kind of ['hvpgcath', 'tipsgrad', 'irivc']) {
    const run = playProcedure(st, kind, { stepped: false, read: () => lastF });
    const seen = new Map();   // key -> the point it was first pinned at
    const bad = [];
    let shown = 0, sums = 0, sumBad = 0;
    for (let i = 0; i < 1800; i++) {
      await step();
      const pp = st.cathPoints();
      if (!pp) continue;
      // the summary leads to the points the two readings were taken at
      if (pp.sum && pp.pins.some(([k]) => k === 's')) { sums++; if (!seen.has('f') || !seen.has('w') || pp.sum.tip[0] !== seen.get('f')[0] || pp.sum.ahead[0] !== seen.get('w')[0]) sumBad++; }
      for (const [k, pin] of pp.pins) {
        if (!pin) continue;
        shown++;
        const s = seen.get(k);
        if (!s) seen.set(k, pin);
        else if (Math.hypot(pin[0] - s[0], pin[1] - s[1]) > 1e-9) bad.push(`frame ${i}: ${k} moved`);
      }
    }
    run.stop({ home: false });
    for (let i = 0; i < 60; i++) await step();
    assert.ok(shown > 30 && seen.size > 0, `${kind}: readings were pinned (${shown} frames)`);
    assert.deepEqual(bad.slice(0, 5), [], `${kind}: a pinned reading moved`);
    if (kind === 'hvpgcath') assert.ok(sums > 10 && sumBad === 0, `the summary led to the pinned points (${sums} frames, ${sumBad} off)`);
    console.log(kind, [...seen].map(([k, p]) => `${k}@${p.map((v) => v.toFixed(1))}`).join(' '));
  }
});
