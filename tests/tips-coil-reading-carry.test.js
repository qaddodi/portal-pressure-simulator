// The coil slide after the TIPS slide holds its catheter in after the coils, and the reading goes on from the same place on the reading's own route
// (stage-cath.js cathCarry; the node stage with the do-nothing WebGL, tests/stage-gl-boot.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';
import { PLUGS } from '../src/ui/proc-anim.js';

test('the coils hold with the catheter in, and the reading goes on from the same place on its own route (stage-cath.js cathCarry)', async () => {
  const { st, page } = await bootGL({ w: 1200, h: 800, labels: 'none' });
  const { store } = await import('../src/ui/store.js');
  const { playProcedure } = await import('../src/ui/proc-anim.js');
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [], lastF = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'preset', id: 'cirr-decomp' });
  await core.handle({ type: 'run', running: true });
  const step = async () => { pump(48); const f = q.at(-1); q = []; if (f) lastF = f; if (lastF) st.update(lastF); await tasks(); await tasks(); };
  store.set({ presenting: true, presentLabels: [], params: core.engine().params });
  for (let i = 0; i < 20; i++) await step();
  const P = PLUGS.tipscoilin;
  let tNow = 0, applied = 0;
  const run = playProcedure(st, 'tipscoilin', { stepped: true, hold: true, apply: () => { applied++; }, onFrame: (f, t) => { tNow = t; } });
  const until = async (cond, n = 3000) => { for (let i = 0; i < n && !cond(); i++) await step(); return cond(); };
  assert.ok(await until(() => tNow >= P.stops[0]), 'the catheter is in through the stent');
  for (let i = 0; i < 8; i++) await step();
  assert.equal(run.next(), true, 'Next plays the coils');
  assert.ok(await until(() => run.held), 'the coils hold, the catheter still in');
  assert.equal(applied, 1, 'the model takes the closed vein once');
  const coil = st.cathStops(), c = run.release();
  assert.ok(c && c.route === 'tipscoilin' && c.u > 0.5 && c.u < 1, `the catheter is back in the right portal vein: ${c?.u}`);
  const carried = st.cathCarry(c.u, c.route, 'tips');
  assert.ok(carried > 0.5 && carried < 1, `a place on the reading's route: ${carried}`);
  assert.equal(st.cathCarry(c.u, 'tips', 'tips'), c.u);
  const read = playProcedure(st, 'tipsgrad', { stepped: true, from: carried, read: () => lastF });
  for (let i = 0; i < 6; i++) await step();
  const tips = st.cathStops();
  // (The two routes share their way in: the same distance is the same place, so the right portal vein's start is where the ratio says.)
  assert.ok(coil.rpv && tips.rpv, 'both routes name the right portal vein');
  assert.ok(Math.abs(carried / c.u - tips.rpv[0] / coil.rpv[0]) < 0.02, `the same place on the longer route: ${(carried / c.u).toFixed(3)} vs ${(tips.rpv[0] / coil.rpv[0]).toFixed(3)}`);
  read.stop({ home: false });
});
