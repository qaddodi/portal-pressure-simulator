// Slides after a TIPS do not place it again (Mohammad, 10 Nov 2026: "slide 9 and 10 on variceal bleed after tips the tips animation plays again twice ... it should just
// measure PPG right there"). The TIPS that has a reading to come holds at "Stent in" with its catheter still in the right portal vein, and the reading (proc-anim.js
// MEASURES.tipsgrad) goes on from that place, never in again from the neck; the slide after it, which coils the vein, goes in through the stent that is already there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';
import { DECKS } from '../src/ui/decks.js';
import { PROCS, PLUGS, MEASURES, procFrame, procKindOf, specOf, stepAt } from '../src/ui/proc-anim.js';

const G = MEASURES.tipsgrad, GT = G.T;
const STOPS = { SVC_RA: [-0.5, -0.1], IVCS_RA: [-0.1, 0.1], IVC_IS: [0.1, 0.45], hv: [0.45, 0.6], tract: [0.6, 0.85], rpv: [0.85, 0.93], trunk: [0.93, 1] };

test('the reading goes on from where the catheter stands: it starts at that place, reaches the trunk, and is the same as before from there on', () => {
  const from = 0.9;
  const a = procFrame('tipsgrad', GT.travel0 * 0 + 0, STOPS, null, from);
  assert.equal(a.u, 0, 'a Back before it goes on draws the catheter right back out');
  let prev = null;
  for (let t = 0; t <= GT.pvRead0; t += 20) {
    const f = procFrame('tipsgrad', t, STOPS, null, from);
    if (prev) assert.ok(f.u >= prev - 1e-9, `never turns back on the way in, ${t}`);
    prev = f.u;
  }
  // (The clock of a carried reading starts at the place; its first frame is the place itself.)
  const start = Math.min(...Array.from({ length: 400 }, (_, i) => i * 20).filter((t) => procFrame('tipsgrad', t, STOPS, null, from).u >= from - 1e-9));
  assert.ok(procFrame('tipsgrad', start, STOPS, null, from).wire === 1, 'the wire is still out ahead of it');
  assert.equal(procFrame('tipsgrad', GT.pvRead0, STOPS, null, from).u, 1, 'in the portal trunk to read it');
  assert.equal(procFrame('tipsgrad', GT.pvRead0, STOPS, null, from).wire, 0, 'the wire is gone once the catheter has caught it up');
  for (const t of [GT.pull0, GT.ivRead0, GT.res0, GT.back, GT.end]) assert.equal(procFrame('tipsgrad', t, STOPS, null, from).u, procFrame('tipsgrad', t, STOPS).u, `the same from there on, ${t}`);
  assert.equal(procFrame('tipsgrad', GT.pvRead0, STOPS).wire, 0, 'a reading that starts from the neck draws no wire');
});

test('the TIPS that has a reading to come holds at "Stent in" with the catheter in; a TIPS with none still goes out', () => {
  assert.equal(PROCS.tips.holdT, PROCS.tips.T.back);
  assert.equal(PLUGS.tipscoil.holdT, PLUGS.tipscoil.T.back);
  const T = PROCS.tips.T, f = procFrame('tips', T.back, STOPS);
  assert.ok(f.u > 0.5 && f.u < 1, 'the catheter is in the right portal vein');
  assert.equal(f.balloon, 0); assert.equal(f.opacity, 1);
  assert.equal(stepAt('tips', T.back), 3, 'the last step is the one on show');
});

test('on the stage: the TIPS holds with its catheter in, and the reading goes on from there without the catheter leaving', async () => {
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
  // (The stage's catheter, watched: every record it is given, and every time it is told there is none.)
  const sets = [];
  const real = st.setCatheter.bind(st);
  st.setCatheter = (c) => { sets.push(c ? { route: c.route, u: c.u, clock: c.clock } : null); return real(c); };
  const P = PROCS.tips;
  let held = 0, ended = null;
  const run = playProcedure(st, 'tips', { stepped: true, hold: true, onHold: () => { held++; }, onEnd: (e) => { ended = e; } });
  const until = async (cond, n = 1500) => { for (let i = 0; i < n && !cond(); i++) await step(); return cond(); };
  for (let s = 0; s < P.steps.length; s++) {
    assert.ok(await until(() => run.held || (s < P.steps.length - 1 && sets.at(-1)?.clock >= P.stops[s])), `step ${s + 1} reached`);
    for (let i = 0; i < 8; i++) await step();
    if (s < P.steps.length - 1) assert.equal(run.next(), true, `Next plays step ${s + 2}`);
  }
  assert.ok(await until(() => run.held), 'the last step holds');
  assert.equal(held, 1, 'asked for the reading once, when it is reached');
  assert.equal(ended, null, 'the run has not ended: the catheter stays in');
  assert.ok(sets.at(-1) && sets.at(-1).clock === P.holdT, 'the catheter is drawn at the hold');
  const u0 = sets.at(-1).u;
  assert.ok(u0 > 0.5 && u0 < 1);
  assert.equal(run.next(), false, 'a Next on the held step moves nothing (the caller goes on to the reading)');
  const c = run.release();
  assert.ok(c && Math.abs(c.u - u0) < 1e-9, 'the place is handed on');
  assert.equal(sets.at(-1) !== null, true, 'releasing takes the catheter nowhere');
  assert.equal(run.release(), null);
  // The reading, from that place.
  const n0 = sets.length;
  const read = playProcedure(st, 'tipsgrad', { stepped: true, from: c.u, read: () => lastF });
  assert.ok(await until(() => sets.length > n0 + 3), 'the reading draws');
  const first = sets[n0];
  assert.ok(first && Math.abs(first.u - u0) < 0.02, `its first frame is where the catheter stood: ${first?.u} vs ${u0}`);
  assert.ok(sets.slice(n0 - 1, n0 + 3).every(Boolean), 'the catheter never leaves between the two');
  for (let i = 0; i < 40; i++) await step();
  assert.ok(sets.slice(n0).every((x) => !x || x.u >= u0 - 0.02 || x.clock > GT.pull0), 'it does not go back out to the neck and in again');
  read.stop({ home: false });
  run.stop?.({ home: false });
});

test('the slide after the TIPS slide goes in through the stent that is already there, and the TIPS slides each read in place', () => {
  const bleed = DECKS.find((d) => d.id === 'variceal-bleed'), ids = bleed.slides.map((s) => s.id);
  const s = bleed.slides[ids.indexOf('tipscoil')];
  assert.equal(procKindOf(s.procedure), 'tipscoilin');
  const P = specOf('tipscoilin');
  assert.equal(P.steps.length, P.stops.length, 'a stop for each step');
  assert.equal(P.apply({ tips: { on: true } }).tips.on, true, 'the stent is left as it is');
  assert.equal(P.apply({ tips: { on: true } }).occluded.C1a, true);
  assert.deepEqual(P.before, { occluded: { C1a: false } }, 'the stent stays when the slide opens; only the vein is open');
  assert.match(P.can({ tips: { on: false } }), /no TIPS/);
  const T = P.T;
  const f0 = procFrame('tipscoilin', T.travel1, STOPS), fc = procFrame('tipscoilin', T.coil1, STOPS);
  assert.ok(f0.u > 0.5 && f0.u < 1 && f0.needle === 0 && f0.balloon === 0, 'one leg in through the stent: no needle, no balloon');
  assert.equal(fc.u, 1, 'the catheter is up the coronary vein for the coil'); assert.ok(fc.coil > 0.99);
  assert.equal(procFrame('tipscoilin', T.end, STOPS).u, 0);
  // Every TIPS slide with a reading holds its TIPS for it; no deck slide that follows another TIPS places the stent twice.
  for (const d of DECKS) {
    const list = d.slides.filter((x) => ['tips', 'tipscoil', 'tipscoilin'].includes(procKindOf(x.procedure)));
    for (const x of list.slice(1)) assert.equal(procKindOf(x.procedure), 'tipscoilin', `${d.id}/${x.id}: after a TIPS the stent is not placed again`);
  }
});
