// The four vessel fragment shaders that existed before the Tube (veins-gl.js vesselFS) are kept byte for byte: the Tube builds are made only
// with JS in the template, never a change to these (10 Nov 2026, docs/recommendations/tube-renderer-plan.md). The hashes are of the returned
// text at 363a81c, the last commit before the Tube. A change to the shared text on purpose updates them in the same push, with a reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });
const { vesselFS } = await import('../src/ui/veins-gl.js');

const sha = (s) => createHash('sha256').update(s).digest('hex');
const HASH = {
  'vesselFS(false)': 'adec71a102b915faa44924a1d7eb14201748aeeda1494c33f41b5a3b3d226edb',
  'vesselFS(true)': '2360e6859ea04d94c1436480dcdfb1226d5b128a209ed250c68c03398977c4e4',
  'vesselFS(true, 1)': '75773ae44bf1ea9ba8d866608ca91e3dbd50f7cdb5a4e58c4038cf39289e7c62',
  'vesselFS(false, 2)': 'ca9c11115156d86f39896f6342aaaa23163b2ab9b16b88a12f34c57d04b9d194',
};

test('the general, one-vessel, mesh strip and mesh patch builds are byte for byte what they were at 363a81c', () => {
  assert.equal(sha(vesselFS(false)), HASH['vesselFS(false)']);
  assert.equal(sha(vesselFS(true)), HASH['vesselFS(true)']);
  assert.equal(sha(vesselFS(true, 1)), HASH['vesselFS(true, 1)']);
  assert.equal(sha(vesselFS(false, 2)), HASH['vesselFS(false, 2)']);
});
