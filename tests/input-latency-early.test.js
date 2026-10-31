import test from 'node:test';
import assert from 'node:assert/strict';

// The input tracker made at load when the address asks for it (?perf or ?inputs). The presenter's window key listener stops the keys
// it uses (stopImmediatePropagation, presenter.js onKey), so a tracker made later, on the first read of perf(), never saw a Next on a
// phone: the frame gate (scripts/frame-gate.mjs) found "Next: the page answered none of them" on 31 Oct. A page with neither in its
// address has no listener of the tracker's until something reads it (tests/glass-sleep.test.js counts the window's listeners).

let n = 0;
/** Imports a fresh frame.js in a page whose address is `search`; returns the window listeners it added as 'type:capture'. */
async function load(search) {
  const added = [];
  Object.assign(globalThis, {
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    requestAnimationFrame: () => 1,
    location: { search },
    document: {},
    MutationObserver: class { observe() {} disconnect() {} },
    addEventListener: (type, fn, opts) => added.push(`${type}:${opts?.capture ? 'capture' : 'bubble'}`),
  });
  const mod = await import(`../src/ui/frame.js?early=${++n}`);
  return { added, mod };
}
const TRACKER = ['click:capture', 'keydown:capture', 'pointerdown:capture'];
const mine = (added) => added.filter((a) => /^(click|keydown|pointerdown):/.test(a)).sort();

test('?perf makes the tracker at load, before any other listener is added', async () => {
  const { added } = await load('?preset=cirr-decomp&perf');
  assert.deepEqual(mine(added), TRACKER);
});

test('?inputs does too, with or without a value, and after other parameters', async () => {
  for (const search of ['?inputs', '?inputs=1', '?script=hvpg&slide=1&inputs', '?inputs#top', '?perf=1']) {
    const { added } = await load(search);
    assert.deepEqual(mine(added), TRACKER, search);
  }
});

test('a parameter that only starts with the word, and a page without it, add no listener at load', async () => {
  for (const search of ['', '?preset=cirr-decomp', '?performance=1', '?x=perf', '?inputsx', '?myinputs=1']) {
    const { added } = await load(search);
    assert.deepEqual(mine(added), [], search || '(no address)');
  }
});

test('without the parameter the tracker is still made on the first read of perf(), once', async () => {
  const { added, mod } = await load('');
  assert.deepEqual(mine(added), []);
  const a = mod.perf().inputToPaint;
  assert.deepEqual(mine(added), TRACKER);
  assert.equal(mod.perf().inputToPaint, a, 'the same tracker, not a second one');
  assert.equal(mine(added).length, 3);
});
