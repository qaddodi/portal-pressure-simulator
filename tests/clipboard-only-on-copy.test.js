// The app writes to the system clipboard only when the user asks to copy (play-test, 16 Nov 2026: the clipboard was written after picking a patient).
// The rule is a source shape: every write in src/ is listed with the control that asks for it, in scripts/source-shapes/clipboard-slide-history.mjs
// (run by npm run lint). This test keeps the behaviour: the paths that load a patient never touch the clipboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';

test('loading state through the store never writes the clipboard', async () => {
  const writes = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: (t) => { writes.push(t); return Promise.resolve(); } } } });
  const { updateParams, replaceParams, clearHistory } = await import('../src/ui/store.js');
  clearHistory();
  replaceParams({ x: 0 });
  updateParams({ x: 1 }, { label: 'a pick' });
  assert.deepEqual(writes, []);
});
