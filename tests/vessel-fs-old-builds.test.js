// The four vessel fragment shaders that existed before the Tube (veins-gl.js vesselFS) are kept byte for byte: the Tube builds are made only
// with JS in the template, never a change to these (10 Nov 2026, docs/recommendations/tube-renderer-plan.md). The hashes are of the returned
// text at 363a81c, the last commit before the Tube. A change to the shared text on purpose updates them in the same push, with a reason.
// 10 Nov 2026 (cut-across vessels, picture-blood-fills-look.md item 9): tubeShade gained the F_RING block, the pale wall band for the lobule's end-on discs;
// only a row carrying F_RING (512, set by lobule-zoom.js alone) reaches it, so every other pixel of the four builds is unchanged. The same push added ringOpen
// (the disc's mouth mask reader, called only inside that block) to the shade text. New hashes below.
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
  'vesselFS(false)': '5a23b2e397ea858fd137900bbb426a69daf6ebfe5dc944c265681f0cded2138d',
  'vesselFS(true)': '01899b9c760f2e7b03eee1cc1f3bbca927e6d5cc19890b6fbc975e71b71d01fe',
};

test('the general and one-vessel (classic) builds are byte for byte what they were at 363a81c', () => {
  assert.equal(sha(vesselFS(false)), HASH['vesselFS(false)']);
  assert.equal(sha(vesselFS(true)), HASH['vesselFS(true)']);
});
