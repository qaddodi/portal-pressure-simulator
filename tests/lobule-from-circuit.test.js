// The Lobule button from the Circuit is two moves, not one (play-test A2, 16 Nov 2026): the figure turns to the anatomy in view, and only then dives.
// The store used to say "lobule" over a circuit that was still turning, and the figure stood empty, its old labels left, for about a second.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

test('from the Circuit the store never says lobule before the anatomy is back, and a view asked for meanwhile ends the wait', async () => {
  const { st } = await bootGL({ w: 1440, h: 900, dpr: 1, labels: 'all' });
  const { store, setViewKey } = await import('../src/ui/store.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  const run = async (n) => { for (let i = 0; i < n; i++) { pump(16.7); await tasks(); } };
  setViewKey('circuit'); await run(150);
  assert.equal(store.get().view, 'circuit');
  st.diveToLobule();
  assert.equal(store.get().lobule, false, 'the lobule is not asked for over the circuit');
  assert.equal(store.get().view, 'anatomic', 'the figure turns to the anatomy first');
  // A newer ask (the Circuit again) ends the wait: the lobule never opens behind it.
  setViewKey('circuit'); await run(300);
  assert.equal(store.get().lobule, false, 'a view asked for meanwhile ended the wait');
  assert.equal(store.get().view, 'circuit');
  // Left alone, it turns and then dives.
  st.diveToLobule(); await run(300);
  assert.equal(store.get().lobule, true, 'once the anatomy is back the lobule is asked for');
});
