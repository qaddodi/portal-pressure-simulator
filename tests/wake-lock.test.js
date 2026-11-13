// A24: a talk keeps the screen awake (src/ui/wake-lock.js), asks again when the page comes back, lets go when the talk ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const flush = () => new Promise((r) => setTimeout(r, 0));

function stage({ refuse = false } = {}) {
  const log = { requests: 0, released: 0 }, listeners = {};
  globalThis.document = { hidden: false, addEventListener: (t, f) => { (listeners[t] ||= []).push(f); } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { wakeLock: { request: async () => {
    log.requests++;
    if (refuse) throw Object.assign(new Error('no'), { name: 'NotAllowedError' });
    const s = { released: false, _l: {}, addEventListener(t, f) { this._l[t] = f; }, async release() { this.released = true; log.released++; this._l.release?.(); } };
    log.last = s; return s;
  } } } });
  return { log, listeners };
}

test('a talk holds the lock once, and lets it go when it ends', async () => {
  const { log } = stage();
  const { keepAwake, awakeState } = await import('../src/ui/wake-lock.js?a');
  keepAwake(true); keepAwake(true); await flush();
  assert.equal(log.requests, 1, 'one lock for two calls');
  assert.equal(awakeState().held, true);
  keepAwake(false); await flush();
  assert.equal(log.released, 1);
  assert.equal(awakeState().held, false);
});

test('the browser letting go (page hidden) is answered by asking again when the page is back', async () => {
  const { log, listeners } = stage();
  const { keepAwake, awakeState } = await import('../src/ui/wake-lock.js?b');
  keepAwake(true); await flush();
  await log.last.release(); await flush();   // (the browser's own release)
  assert.equal(awakeState().held, false);
  assert.equal(awakeState().wanted, true);
  document.hidden = false; for (const f of listeners.visibilitychange) f(); await flush();
  assert.equal(log.requests, 2);
  assert.equal(awakeState().held, true);
});

test('a refused request, or a browser without the API, leaves the talk alone', async () => {
  stage({ refuse: true });
  const a = await import('../src/ui/wake-lock.js?c');
  a.keepAwake(true); await flush();
  assert.equal(a.awakeState().held, false);
  assert.equal(a.awakeState().refused, 'NotAllowedError');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  const b = await import('../src/ui/wake-lock.js?d');
  b.keepAwake(true); b.keepAwake(false);
  assert.equal(b.awakeState().supported, false);
});

test('the talk and the projector both hold it (main.js), and the notes window does too', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.match(main, /store\.on\('presenting', \(v\) => keepAwake\(!!v \|\| projector\)\)/);
  assert.match(main, /keepAwake\(projector \|\| !!store\.get\(\)\.presenting\)/);
  assert.match(readFileSync(new URL('../src/ui/presenter-view-page.js', import.meta.url), 'utf8'), /keepAwake\(!!st\)/);
});
