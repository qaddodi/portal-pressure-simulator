import test from 'node:test';
import assert from 'node:assert/strict';
import { store, logAction } from '../src/ui/store.js';

// store.setSoon (2 Nov 2026): a set from a frame callback changes the state at once, and its listeners (cards, legend, pills, text in
// the page) run in a task of their own straight after, never inside the frame.
// (Several turns of the loop: store.js asks its own copy of class-soon.js (its ?v= import), so the test waits the task out.)
const tick = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 2)); };

test('setSoon changes the state at once and wakes its listeners after the current task, once per key, newest value', async () => {
  const heard = [];
  const r0 = store.rev;
  const offs = [store.on('speed', (v) => heard.push(['speed', v])), store.on('lapse', (v) => heard.push(['lapse', v])), store.on('*', (keys) => heard.push(['*', keys.join()]))];
  try {
    store.setSoon({ speed: 2 });
    store.setSoon({ lapse: 3, speed: 4 });
    assert.equal(store.get().speed, 4, 'the state is there at once');
    assert.equal(store.get().lapse, 3);
    assert.ok(store.rev > r0, 'the revision moves at once');
    assert.deepEqual(heard, [], 'no listener runs inside the task that set it');
    await tick();
    assert.deepEqual(heard, [['speed', 4], ['lapse', 3], ['*', 'speed,lapse']]);
  } finally { for (const off of offs) off(); store.set({ speed: 1, lapse: 0 }); }
});

test('a plain set of a waiting key hears it at once and takes it off the wait', async () => {
  const heard = [];
  const off = store.on('speed', (v) => heard.push(v));
  try {
    store.setSoon({ speed: 2 });
    store.set({ speed: 3 });
    assert.deepEqual(heard, [3]);
    await tick();
    assert.deepEqual(heard, [3], 'not heard again after the frame');
  } finally { off(); store.set({ speed: 1 }); }
});

test('logAction keeps every entry at once, its listeners hear it after', async () => {
  const heard = [];
  const off = store.on('actionLog', (v) => heard.push(v.length));
  try {
    const n = (store.get().actionLog || []).length;
    logAction('probe', 'a'); logAction('probe', 'b');
    assert.equal(store.get().actionLog.length, Math.min(60, n + 2));
    assert.equal(store.get().actionLog.at(-1).target, 'b');
    assert.deepEqual(heard, []);
    await tick();
    assert.deepEqual(heard, [Math.min(60, n + 2)]);
  } finally { off(); }
});
