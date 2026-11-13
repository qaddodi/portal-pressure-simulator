// The four vessel fragment shaders that existed before the Tube (veins-gl.js vesselFS) are kept byte for byte: the Tube builds are made only
// with JS in the template, never a change to these (10 Nov 2026, docs/recommendations/tube-renderer-plan.md). The hashes are of the returned
// text at 363a81c, the last commit before the Tube. A change to the shared text on purpose updates them in the same push, with a reason.
// 10 Nov 2026 (cut-across vessels, picture-blood-fills-look.md item 9): tubeShade gained the F_RING block, the pale wall band for the lobule's end-on discs;
// only a row carrying F_RING (512, set by lobule-zoom.js alone) reaches it, so every other pixel of the four builds is unchanged. The same push added ringOpen
// (the disc's mouth mask reader, called only inside that block) to the shade text. New hashes below.
// 11 Nov 2026 (the TIPS's lit third): glowAmt's stretch ends ease over a fifth of the vessel, at most 14 units (min(14, 0.2 L), it was min(6, 0.08 L)), so a stent's
// lit third no longer starts and stops in a hard-edged column. Only a glow asked for a stretch (a stent's third) reads it, so no other pixel changes. New hashes below.
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
  'vesselFS(false)': 'd3515f4c2b3f32e1911c82843189441f55ec4392b2992e6168bcede4ef92acb2',
  'vesselFS(true)': '1f6163e6ac65cc5abae5fde67f1f8187e2988f770f9eaa33c52809da27a649dd',
};

test('the general and one-vessel (classic) builds are byte for byte what they were at 363a81c', () => {
  assert.equal(sha(vesselFS(false)), HASH['vesselFS(false)']);
  assert.equal(sha(vesselFS(true)), HASH['vesselFS(true)']);
});
