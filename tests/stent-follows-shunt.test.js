// The stent drawn over the TIPS is there only while the shunt is open (16 Nov 2026, Mohammad: "the TIPS comes in and out of existence, pops /
// the stent remained despite the connection blood not being there"). In the real stage, node and jsdom (tests/stage-gl-boot.js): the mesh's
// strength never rises while the shunt narrows, never reads full again once it has faded (a stent taken out dropped its strength, which reads
// as full: a flash), is nothing while the shunt is shut or narrower than a stent, and never steps from one frame to the next.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';
import { EDGES } from '../src/engine/portal/topology.js';
import { STENT_OPEN_D } from '../src/engine/portal/stent-ease.js';

const booted = bootGL({ w: 1200, h: 800, labels: 'none' });   // (one stage for both: a second boot in a process is not made)

test('the TIPS mesh comes in once the shunt is open and goes as it narrows: never on a shut shunt, never a step, never back to full', async () => {
  const { st } = await booted;
  const { store } = await import('../src/ui/store.js');
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  const k = EDGES.findIndex((e) => e.id === 'TIPS');
  let q = [], lastF = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'run', running: true });
  await core.handle({ type: 'preset', id: 'healthy' });
  const run = async (n, on) => {
    const rows = [];
    for (let i = 0; i < n; i++) {
      pump(48);
      const f = q.at(-1); q = [];
      if (f) lastF = f;
      if (lastF) st.update(lastF);
      await tasks(); await tasks();
      if (lastF) rows.push({ a: st.markDraws().find((d) => d.fade === 'vst:TIPS')?.amount ?? 0, D: lastF.D[k] });
    }
    return rows;
  };
  await run(10, false);
  const none = await run(10, false);
  assert.ok(none.every((r) => r.a === 0 && r.D === 0), 'no stent, no shunt: nothing drawn');

  const p = structuredClone(core.engine().params); p.tips = { on: true, d: 8 };
  await core.handle({ type: 'setParams', params: p, settle: false });
  store.set({ params: p });
  const opening = await run(160, true);
  assert.ok(opening.some((r) => r.D > 0 && r.D < 7.9), 'the shunt opens through its width');
  for (const [i, r] of opening.entries()) {
    if (r.a > 0) assert.ok(r.D >= STENT_OPEN_D, `frame ${i}: the mesh at ${r.a.toFixed(2)} on a shunt only ${r.D.toFixed(2)} wide`);
    if (i) assert.ok(r.a - opening[i - 1].a < 0.35 && r.a >= opening[i - 1].a - 1e-9, `frame ${i}: it comes in without a step (${opening[i - 1].a.toFixed(2)} to ${r.a.toFixed(2)})`);
  }
  assert.ok(Math.abs(opening.at(-1).a - 1) < 1e-6, 'the whole stent is in once the shunt is open');

  const off = structuredClone(core.engine().params); off.tips = { on: false, d: 8 };
  await core.handle({ type: 'setParams', params: off, settle: false });
  store.set({ params: off });
  const closing = await run(160, false);
  let faded = false;
  for (const [i, r] of closing.entries()) {
    if (r.a > 0) assert.ok(r.D > 0, `frame ${i}: the mesh at ${r.a.toFixed(2)} on a shunt that is shut`);
    if (i) {
      assert.ok(r.a <= closing[i - 1].a + 1e-9, `frame ${i}: the mesh came back (${closing[i - 1].a.toFixed(2)} to ${r.a.toFixed(2)})`);
      assert.ok(closing[i - 1].a - r.a < 0.35, `frame ${i}: it goes without a step (${closing[i - 1].a.toFixed(2)} to ${r.a.toFixed(2)})`);
    }
    if (r.a === 0) faded = true;
  }
  assert.ok(faded && closing.at(-1).a === 0, 'the mesh is gone once the shunt is');
  assert.equal(closing.at(-1).D, 0);
});

test('a shunt that is shut while it draws on retracts from where it got to, and one opened while it retracts draws on again from there: it never leaves or arrives at once', async () => {
  const { st } = await booted;
  const { store } = await import('../src/ui/store.js');
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [], lastF = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'run', running: true });
  await core.handle({ type: 'preset', id: 'healthy' });
  const frames = async (n) => {
    const seen = [];
    for (let i = 0; i < n; i++) {
      pump(33);
      const f = q.at(-1); q = [];
      if (f) lastF = f;
      if (lastF) st.update(lastF);
      await tasks(); await tasks();
      seen.push(st.shownVessels().includes('TIPS'));
    }
    return seen;
  };
  const set = async (on) => {
    const p = structuredClone(core.engine().params); p.tips = { on, d: 8 };
    await core.handle({ type: 'setParams', params: p, settle: true });   // (the switch at once: the model gives the figure no ease to lean on)
    store.set({ params: p });
  };
  await frames(30);
  await set(true);
  const arriving = await frames(9);   // (about 0.3 s into its 0.9 s draw-on)
  assert.ok(arriving.at(-1), 'the shunt is drawing on');
  await set(false);
  const leaving = await frames(3);   // (it retracts from the quarter it had drawn: about 0.2 s of its 0.7 s)
  assert.ok(leaving.every(Boolean), 'it retracts, still there, and does not vanish at once');
  await set(true);
  const back = await frames(12);
  assert.ok(back.every(Boolean), 'opened again while it retracts, it never goes');
  const settled = await frames(60);
  assert.ok(settled.at(-1), 'and it ends drawn');
  await set(false);
  const gone = await frames(60);
  assert.ok(gone.slice(0, 5).every(Boolean) && !gone.at(-1), 'shut, it retracts and then is gone');
});
