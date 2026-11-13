// EUS-guided coils and glue played on the real stage (node, jsdom, the do-nothing WebGL; tests/stage-gl-boot.js), as the presenter plays it
// on Treat the spleen: Next by Next. The scope is drawn by the GPU catheter every frame it is on, the camera rides along at one scale on the
// way in (mock B: it only pans), pushes in once to the needle and the varix, holds still while the needle, the coils and the glue go in,
// and pulls back once at the end, no closer than the way in's push; the varix closes (the model's change) exactly once, as step 5 starts,
// and the callouts number the steps on the varix. The last step parks the scope over the varix (no way out): it stays drawn until the slide
// moves on, then fades out where it stands (his ask, 10 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test('EUS coils and glue on the stage: drawn every frame, ride along, one push in, one pull back, the varix closed once', async () => {
  const { st } = await bootGL({ w: 1200, h: 800, labels: 'none' });   // (no station labels: their solve under the moving camera was most of the time)
  const { store } = await import('../src/ui/store.js');
  const { playProcedure, ENDO } = await import('../src/ui/proc-anim.js');
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [], lastF = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'preset', id: 'svt' });
  await core.handle({ type: 'run', running: true });
  // (Frames 48 ms apart, under the 64 ms a run's clock and the camera's follow take at most from one frame: the same run, a third of the
  // frames. At 16.7 ms with the station labels on it took about 100 s alone, and longer beside other tests.)
  const step = async () => { pump(48); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks(); };
  store.set({ presenting: true, presentLabels: [], params: core.engine().params });
  for (let i = 0; i < 20; i++) await step();
  const G = ENDO.eusglue, k0 = st.cameraState().k;
  let applied = 0, at = 0, ended = null, frames = 0;
  const said = [], seen = [];
  const run = playProcedure(st, 'eusglue', {
    stepped: true,
    apply: () => { applied++; at = run.step; },
    onFrame: (f, t) => { frames++; seen.push({ t, step: f.step, shot: f.shot, k: st.cameraState().k, gl: st.gliding() }); },
    onMark: (m) => { if (m && !said.includes(m.label)) said.push(m.label); },
    onEnd: (e) => { ended = e; },
  });
  // Next at each stop, as the presenter's Next does (each step played through and held, then the next).
  for (let s = 0; s < G.steps.length && !ended; s++) {
    for (let i = 0; i < 600 && !ended; i++) { await step(); if (seen.length && seen.at(-1).t >= G.stops[s]) break; }
    for (let i = 0; i < 8; i++) await step();
    if (s < G.steps.length - 1) assert.equal(run.next(), true, `Next plays step ${s + 2}`);
  }
  for (let i = 0; i < 30; i++) await step();
  assert.equal(ended, null, 'held at the last stop with the scope parked, not run out');
  assert.ok(G.stops.at(-1) < G.T.end && seen.at(-1).t === G.stops.at(-1), 'it waits at its last stop');
  assert.ok(frames > 150);
  assert.equal(applied, 1, 'the varix closes once'); assert.equal(at, 4, 'as step 5, No flow, starts');
  assert.deepEqual(said, ['1 Varix found', '2 Needle in', '3 Coils', '4 Glue', '5 No flow'], 'one callout per step, numbered, the first included');
  // The camera: one scale riding in (it only pans while the tip travels), a push in for the needle's work, held there through the coils and
  // the glue, one pull back at the end, wider than the push in and no wider than the way in.
  const still = (sh) => seen.filter((x) => x.shot === sh && !x.gl).map((x) => x.k);
  const way = still('way'), tip = still('tip'), work = still('work');
  assert.ok(way.length && tip.length && work.length, 'every shot lands');
  assert.ok(Math.max(...way) - Math.min(...way) < 1e-6, `the way in at one scale: ${Math.min(...way).toFixed(2)}–${Math.max(...way).toFixed(2)}`);
  assert.ok(Math.max(...tip) - Math.min(...tip) < 1e-6, 'held at one scale through the needle, the coils and the glue');
  assert.ok(tip[0] > way[0] + 0.5, `a push in: ${way[0].toFixed(2)} → ${tip[0].toFixed(2)}`);
  assert.ok(work[0] < tip[0] && work[0] > k0, `one pull back: ${tip[0].toFixed(2)} → ${work[0].toFixed(2)}`);
  assert.ok(way[0] <= 4 + 1e-6 && tip[0] <= 7 + 1e-6 && work[0] <= 5 + 1e-6, 'within the ride-along scales');
  // The slide moves on: the parked scope fades out in place over parkMs, in steps (not cut), then the stage has it taken away.
  const drawn = [], was = st.setCatheter.bind(st);
  st.setCatheter = (c) => { drawn.push(c ? c.opacity : null); return was(c); };
  try {
    run.stop({ home: false });
    for (let i = 0; i < 30; i++) await step();
  } finally { st.setCatheter = was; }
  assert.equal(drawn.at(-1), null, 'then it is taken away');
  const fade = drawn.slice(0, -1);
  assert.ok(fade.length >= 4 && fade[0] > 0.9 && fade.every((x, i) => i === 0 || x <= fade[i - 1] + 1e-9) && fade.at(-1) < 0.2, `a fade in steps, not a cut: ${fade.map((x) => x.toFixed(2)).join(' ')}`);
});
