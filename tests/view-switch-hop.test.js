// Out of the lobule into the Circuit (view-switch hand-off, 16 Nov 2026): begun together with the rise, the lobule cut out in a frame and the Circuit stood on a faded anatomy with its
// captions, so it waited for the landing. Since 18 Nov 2026 ("I'm ok with things happening at once") it begins when the rise is 70% done (stage.js RISE_CIRC_T): the anatomy is whole by then.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test('from the lobule the Circuit begins as the rise nears its end, in one move; a view asked for meanwhile ends the wait', async () => {
  const { st } = await bootGL({ w: 1440, h: 900, dpr: 1, labels: 'all' });
  const { store, setViewKey } = await import('../src/ui/store.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  const run = async (n) => { for (let i = 0; i < n; i++) { pump(16.7); await tasks(); } };
  // (main.js: the store's view change reaches the stage.)
  store.on('view', (v) => st.setView(v));
  const intoLobule = async () => { setViewKey('lobule'); for (let i = 0; i < 400 && !(st.lobuleOpen() && st.lobuleSettled()); i++) await run(1); };
  await intoLobule();
  assert.ok(st.lobuleOpen(), 'the lobule is open');
  setViewKey('circuit');
  assert.equal(store.get().view, 'circuit', 'the store says circuit at once (the view is legal)');
  assert.equal(store.get().lobule, false);
  assert.ok(st.viewChanging(), 'the change is owed from the tap on (a talk waits for it)');
  assert.equal(st.morphTargetNow(), 0, 'the change has not begun at the tap: the lobule rises first');
  await run(1);
  assert.equal(st.lobuleSettled(), false, 'the lobule is still rising a frame later, not cut out in one');
  // While the lobule rises the Circuit's change waits for the last of the rise (RISE_CIRC_T, 18 Nov 2026: "I'm ok with things happening at once"): it begins before the rise has landed, never at its start.
  let rising = 0, began = -1;
  while (st.lobuleOpen() || !st.lobuleSettled() || st.morphTargetNow() === 0) {
    await run(1); rising++; assert.ok(rising < 1500, 'the change begins');
    if (st.morphTargetNow() === 1) { began = rising; assert.equal(st.lobuleSettled(), false, 'the change began while the rise was still finishing, one move'); break; }
    assert.equal(st.morphTargetNow(), 0, 'no change to the Circuit in the first part of the rise');
  }
  assert.ok(began > 1, 'it began after the rise had started, not with it');
  for (let i = 0; i < 1500 && (!st.lobuleSettled() || st.viewChanging()); i++) await run(1);
  assert.equal(st.lobuleSettled(), true, 'the lobule has gone');
  assert.equal(st.morphTargetNow(), 1, 'the change to the Circuit went on');
  for (let i = 0; i < 600 && st.viewChanging(); i++) await run(1);
  assert.equal(st.viewChanging(), false, 'the change landed');
  assert.equal(store.get().view, 'circuit');
  // The Circuit asked for over a lobule, then the anatomy before the rise lands: nothing is owed.
  setViewKey('anatomy'); await run(400);
  await intoLobule();
  setViewKey('circuit'); await run(3);
  setViewKey('anatomy');
  await run(600);
  assert.equal(st.viewChanging(), false, 'nothing is owed');
  assert.equal(st.morphTargetNow(), 0);
  assert.equal(store.get().view, 'anatomic');
});
