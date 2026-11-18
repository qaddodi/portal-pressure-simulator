// The gallery page's plug-in points (src/ui/gallery/registry.js): ids are checked, a second registration is ignored and counted,
// the lists come back in order, and a part that throws on mount or dispose never stops the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerPanel, registerBench, panelList, benchList, clashes, mountPart } from '../src/ui/gallery/registry.js';

test('a panel and a bench register once, in order', () => {
  assert.equal(registerPanel({ id: 't-panel-b', title: 'B', order: 2, mount() {} }), true);
  assert.equal(registerPanel({ id: 't-panel-a', title: 'A', order: 1, mount() {} }), true);
  assert.equal(registerPanel({ id: 't-panel-a', title: 'Again', mount() {} }), false);
  assert.deepEqual(panelList().filter((p) => p.id.startsWith('t-panel')).map((p) => p.id), ['t-panel-a', 't-panel-b']);
  assert.equal(registerBench({ id: 't-bench', title: 'Bench', group: 'Camera', mount() {} }), true);
  assert.equal(benchList().find((b) => b.id === 't-bench').group, 'Camera');
  assert.ok(clashes().includes('panel t-panel-a'));
});

test('a bad part is refused with a reason', () => {
  assert.throws(() => registerPanel({ id: 'Bad Id', title: 'x', mount() {} }), /id must be/);
  assert.throws(() => registerBench({ id: 'ok-id', title: '', mount() {} }), /title/);
  assert.throws(() => registerBench({ id: 'ok-id', title: 'x' }), /mount/);
  assert.throws(() => registerBench(null), /object/);
});

test('mountPart disposes once, and survives a part that throws', () => {
  const logged = console.error; console.error = () => {};
  try {
    let n = 0;
    const host = { replaceChildren() { n += 10; } };
    const off = mountPart({ id: 'x', mount: () => () => { n += 1; } }, host, {});
    off(); off();
    assert.equal(n, 11);
    const bad = mountPart({ id: 'y', mount() { throw new Error('boom'); } }, host, {});
    assert.doesNotThrow(() => bad());
    const bad2 = mountPart({ id: 'z', mount: () => () => { throw new Error('boom'); } }, host, {});
    assert.doesNotThrow(() => bad2());
  } finally { console.error = logged; }
});
