// A treatment's step callout is part of the figure (Mohammad, 6 Nov 2026, iPhone: the TIPS and BRTO callouts "are glitchy and don't stick to
// where they should and flicker"). Its number was a circled numeral (➊) that Inter's cut lacks, so the GPU gave the callout to the SVG, whose
// copy never follows the camera (the view follows the catheter in), and label-gl then told it to give up its full pieces while it waited for
// its style read: it swapped between the SVG and the GPU every frame or two, its leader blinking with it. Played on the real stage with its
// GPU labels on, as the presenter plays it: once the step's callout is drawn it stays on the GPU, pinned to its point on the vessel, with its
// leader, every frame, while the view pans after the tip. And it comes in once (his next ask, 6 Nov: they "still flicker as they appear"):
// its leader was handed to the SVG while its look was read, so the line showed alone for two or three frames, went, and came back with the
// label. No mark of it is ever the SVG's, and the label appears once and stays.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test('a procedure step callout stays drawn by the GPU, pinned to its point, with its leader, every frame', async () => {
  const { st, page } = await bootGL({ w: 395, h: 859, dpr: 3, coarse: true });
  const { store } = await import('../src/ui/store.js');
  const { playProcedure } = await import('../src/ui/proc-anim.js');
  const { createCore } = await import('../src/worker-core.js');
  const doc = page.document, tasks = () => new Promise((r) => setImmediate(r));
  let q = [], lastF = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'preset', id: 'cirr-decomp' });
  await core.handle({ type: 'run', running: true });
  const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks(); };
  doc.querySelector('.app')?.style.setProperty('--pz-b', '260px');
  store.set({ presenting: true, presentLabels: [], params: core.engine().params });
  for (let i = 0; i < 100; i++) await step();
  const W2S = (M, x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
  for (const kind of ['tips', 'brto']) {
    let mk = null, said = '';
    const run = playProcedure(st, kind, { stepped: true, onMark: (m) => { mk = m; if (m) said = m.label; store.set({ focus: m ? { ...m, marks: [m] } : null }); } });
    let drawn = 0, flips = 0, was = null, shows = 0, on = false;
    const bad = [];
    for (let i = 0; i < 600; i++) {
      await step();
      const g = doc.querySelector('#labels [data-key^="focus"]'), gl = g ? g.hasAttribute('data-gl') : null;
      const it = (st.labelSnapshot()?.items || []).find((x) => /^focus/.test(x.key) && +x.a > 0.5);
      if (it && mk) {
        drawn++;
        const e = st.edgeMid(mk.edges[0], mk.f), M = st.glMatrix();
        if (!it.pin) bad.push(`${kind} frame ${i}: not pinned`);
        else if (M && e) { const w = W2S(M, e[0], e[1]), d = Math.hypot(w[0] - it.px, w[1] - it.py); if (d > 1.5) bad.push(`${kind} frame ${i}: ${d.toFixed(1)} px off its point`); }
        if (!(st.labelSnapshot()?.marks || []).some((m) => /^focus/.test(m.k) && m.kind === 'line' && m.a > 0.5)) bad.push(`${kind} frame ${i}: no leader`);
      }
      if (drawn && was != null && gl !== was) flips++;
      for (const el of doc.querySelectorAll('[data-k^="focus"]')) if (el.getAttribute('d') && !el.hasAttribute('data-gl') && !el.classList.contains('ld-gone')) bad.push(`${kind} frame ${i}: its ${el.tagName} drawn by the SVG`);
      const now1 = !!it && !!mk;
      if (now1 && !on) shows++;
      on = now1;
      was = gl;
    }
    run.stop({ home: false });
    store.set({ focus: null });
    for (let i = 0; i < 30; i++) await step();
    assert.ok(drawn > 30, `${kind}: the callout is drawn by the GPU (${drawn} frames)`);
    assert.equal(flips, 0, `${kind}: once drawn it is never handed back to the SVG`);
    assert.equal(shows, 1, `${kind}: it comes in once`);
    assert.deepEqual(bad.slice(0, 6), []);
    assert.equal(said, '1 Catheter in', `${kind}: its first step's callout, its number a plain digit`);
  }
});
