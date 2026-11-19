// An embedded figure (?embed, an iframe on someone else's page) never goes full screen on the first tap (SHL-5, 19 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHighRefresh } from '../src/ui/high-refresh.js';

function rig(embed) {
  const listeners = [];
  globalThis.addEventListener = (k) => listeners.push(k);
  Object.defineProperty(globalThis, 'navigator', { value: { maxTouchPoints: 5, userAgent: 'iPad' }, configurable: true });
  const doc = { fullscreenEnabled: true, documentElement: { hasAttribute: (a) => embed && a === 'data-embed' } };
  globalThis.document = doc;
  return { doc, listeners };
}
test('in an embed no listener is added; on the app itself the tap and key listeners are', () => {
  const e = rig(true);
  startHighRefresh(e.doc);
  assert.deepEqual(e.listeners, []);
  const p = rig(false);
  globalThis.sessionStorage = { getItem: () => null, setItem() {} };
  startHighRefresh(p.doc);
  assert.deepEqual(p.listeners, ['pointerup', 'keydown']);
});
