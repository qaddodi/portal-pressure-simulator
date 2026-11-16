// One hop at a time out of the lobule (view-switch hand-off, 16 Nov 2026): the Circuit asked for over the lobule or the sinusoid waits for the rise to land,
// then the change begins. Begun together, the lobule cut out in a frame and the Circuit stood on a faded anatomy with its captions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test('from the lobule the Circuit begins once the rise has landed, never beside it; a view asked for meanwhile ends the wait', async () => {
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
  // While the lobule rises the Circuit's change has not begun: the figure's morph target is still the anatomy's.
  let rising = 0;
  while (st.lobuleOpen() || !st.lobuleSettled()) { await run(1); rising++; assert.ok(rising < 1500, 'the rise lands'); if (!st.lobuleSettled()) assert.equal(st.morphTargetNow(), 0, 'no change to the Circuit while the lobule is rising'); }
  // The rise has landed: the change runs to the Circuit and settles.
  await run(2);
  assert.equal(st.morphTargetNow(), 1, 'the change to the Circuit has begun');
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
