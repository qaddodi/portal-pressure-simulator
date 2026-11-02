import test from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../src/ui/store.js';

// Plan "Holding 120 Hz" rev 2 step 3: the store wakes only the listeners of what changed. A '*' listener asked with { frames: false }
// is not woken by a model frame alone, and is by anything else.
test('a model frame alone wakes the frame listeners and every-set listeners, not the rest-of-state listeners', () => {
  const heard = { frame: 0, all: 0, rest: 0 };
  const offs = [
    store.on('frame', () => heard.frame++),
    store.on('*', () => heard.all++),
    store.on('*', () => heard.rest++, { frames: false }),
  ];
  try {
    store.setFrame({ t: 1 });
    store.set({ frame: { t: 2 } });
    assert.deepEqual(heard, { frame: 2, all: 2, rest: 0 });
    store.set({ frame: { t: 3 }, running: true });
    assert.deepEqual(heard, { frame: 3, all: 3, rest: 1 }, 'a frame with another key wakes them');
    store.set({ speed: 1 });
    assert.deepEqual(heard, { frame: 3, all: 4, rest: 2 });
  } finally { for (const off of offs) off(); }
});
