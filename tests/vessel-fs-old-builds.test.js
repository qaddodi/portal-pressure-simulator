// The four vessel fragment shaders that existed before the Tube (veins-gl.js vesselFS) are kept byte for byte: the Tube builds are made only
// with JS in the template, never a change to these (10 Nov 2026, docs/recommendations/tube-renderer-plan.md). The hashes are of the returned
// text at 363a81c, the last commit before the Tube. A change to the shared text on purpose updates them in the same push, with a reason.
// 10 Nov 2026 (cut-across vessels, picture-blood-fills-look.md item 9): tubeShade gained the F_RING block, the pale wall band for the lobule's end-on discs;
// only a row carrying F_RING (512, set by lobule-zoom.js alone) reaches it, so every other pixel of the four builds is unchanged. New hashes below.
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
  'vesselFS(false)': '0c5463895185565e3b0ca054b58e3024a5579d426abf7b2180fe99d9455dd86c',
  'vesselFS(true)': '650c938ba0a56213379631c95e0448877c1a6f5cdfbec201862f9369775d1c19',
  'vesselFS(true, 1)': '312258c5fb3f583a5aa9425ebdf1e6f53f84b67ec6cda6cb5ecb5bdf05ed8de0',
  'vesselFS(false, 2)': '6c68d3a0dd24984198bc688966e08b114be8f1732909718899ce3dda2de35caf',
};

test('the general, one-vessel, mesh strip and mesh patch builds are byte for byte what they were at 363a81c', () => {
  assert.equal(sha(vesselFS(false)), HASH['vesselFS(false)']);
  assert.equal(sha(vesselFS(true)), HASH['vesselFS(true)']);
  assert.equal(sha(vesselFS(true, 1)), HASH['vesselFS(true, 1)']);
  assert.equal(sha(vesselFS(false, 2)), HASH['vesselFS(false, 2)']);
});
