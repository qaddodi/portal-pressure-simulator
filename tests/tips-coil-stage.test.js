// The TIPS that coils the coronary vein played on the real stage (node, jsdom, the do-nothing WebGL; tests/stage-gl-boot.js), Next by Next as the presenter
// plays a slide: the catheter goes in as the TIPS's does, the camera rides in, holds the tract for the needle and the balloon, then the coil's own shot for the
// vein, and back to the tract for the stent; the model takes the stent and the closed vein once, as the stent step starts; one callout per step, numbered.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test('TIPS with coils on the stage: five steps, a shot for each, the coil drawn on the GPU while it is out, the model changed once', async () => {
  const { st, page } = await bootGL({ w: 1200, h: 800, labels: 'none' });
  const { store } = await import('../src/ui/store.js');
  const { playProcedure, PLUGS } = await import('../src/ui/proc-anim.js');
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  // (How many arrays each frame draws, to tell the frames with the coil from those without it: the same catheter, parked at the same place.)
  let draws = 0;
  for (const c of page.document.querySelectorAll('canvas')) { const gl = c.__gl; if (gl?.drawArrays) { const f = gl.drawArrays.bind(gl); gl.drawArrays = (...a) => { draws++; return f(...a); }; } }
  let q = [], lastF = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'preset', id: 'cirr-decomp' });
  await core.handle({ type: 'run', running: true });
  const step = async () => { pump(48); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks(); };
  store.set({ presenting: true, presentLabels: [], params: core.engine().params });
  for (let i = 0; i < 20; i++) await step();
  const P = PLUGS.tipscoil, T = P.T;
  let applied = 0, at = 0, ended = null;
  const said = [], seen = [];
  const run = playProcedure(st, 'tipscoil', {
    stepped: true,
    apply: () => { applied++; at = run.step; },
    onFrame: (f, t) => { seen.push({ t, step: f.step, shot: f.shot, coil: f.coil, k: st.cameraState().k, gl: st.gliding(), draws }); draws = 0; },
    onMark: (m) => { if (m && !said.includes(m.label)) said.push(m.label); },
    onEnd: (e) => { ended = e; },
  });
  for (let s = 0; s < P.steps.length && !ended; s++) {
    for (let i = 0; i < 700 && !ended; i++) { await step(); if (seen.length && seen.at(-1).t >= P.stops[s]) break; }
    for (let i = 0; i < 8; i++) await step();
    if (s < P.steps.length - 1) assert.equal(run.next(), true, `Next plays step ${s + 2}`);
  }
  for (let i = 0; i < 300 && !ended; i++) await step();
  assert.ok(ended?.done, 'played through to the end');
  assert.equal(applied, 1, 'the model takes the stent and the closed vein once'); assert.equal(at, 4, 'as step 5, Stent in, starts');
  assert.deepEqual(said, ['1 Catheter in', '2 Needle across', '3 Tract dilated', '4 Vein coiled', '5 Stent in'], 'one callout per step, numbered');
  // The camera: the coil's own shot lands at one scale and holds still while the catheter goes in and the coil comes out; the tract's two steps share theirs.
  const still = (sh) => seen.filter((x) => x.shot === sh && !x.gl).map((x) => x.k);
  const coil = still('coil'), tip = still('tip');
  assert.ok(coil.length > 10, 'the coil shot lands');
  assert.ok(Math.max(...coil) - Math.min(...coil) < 1e-6, `the coil shot is held at one scale: ${Math.min(...coil).toFixed(2)}–${Math.max(...coil).toFixed(2)}`);
  assert.ok(Math.max(...coil) <= 9 + 1e-6 && Math.min(...coil) >= 1, 'within the tract close-up’s limits');
  assert.ok(tip.length > 10, 'the tract shot lands');
  // The coil is drawn: with it out, the parked catheter's frames draw more arrays than before it was pushed out.
  const parked = (a, b) => seen.filter((x) => x.t >= a && x.t <= b && !x.gl).map((x) => x.draws);
  const before = parked(T.cv1 + 200, T.coil0), after = parked(T.coil1 + 100, T.coil1 + 500);
  const avg = (v) => v.reduce((s, x) => s + x, 0) / v.length;
  assert.ok(before.length > 3 && after.length > 3 && avg(before) > 0, 'the parked catheter is drawn before and after the coil');
  assert.ok(avg(after) >= avg(before) + 2, `the coil adds its draws (two wire layers and the fibres): ${avg(before).toFixed(1)} → ${avg(after).toFixed(1)} arrays a frame`);
  assert.ok(seen.some((x) => x.coil === 1), 'the coil is fully out at some frame');
  run.stop?.({ home: false });
});
