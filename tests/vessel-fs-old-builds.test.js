// The four vessel fragment shaders that existed before the Tube (veins-gl.js vesselFS) are kept byte for byte: the Tube builds are made only
// with JS in the template, never a change to these (10 Nov 2026, docs/recommendations/tube-renderer-plan.md). The hashes are of the returned
// text at 363a81c, the last commit before the Tube. A change to the shared text on purpose updates them in the same push, with a reason.
// 10 Nov 2026 (cut-across vessels, picture-blood-fills-look.md item 9): tubeShade gained the F_RING block, the pale wall band for the lobule's end-on discs;
// only a row carrying F_RING (512, set by lobule-zoom.js alone) reaches it, so every other pixel of the four builds is unchanged. The same push added ringOpen
// (the disc's mouth mask reader, called only inside that block) to the shade text. New hashes below.
// 11 Nov 2026 (the TIPS's lit third): glowAmt's stretch ends ease over a fifth of the vessel, at most 14 units (min(14, 0.2 L), it was min(6, 0.08 L)), so a stent's
// lit third no longer starts and stops in a hard-edged column. Only a glow asked for a stretch (a stent's third) reads it, so no other pixel changes. New hashes below.
// 17 Nov 2026 (the Meso-Rex bypass passes under the vessels it crosses): MAX_TIERS 20 -> 21 (a tier for them, above the portal tree's), so the two tier arrays' length in the shared text
// reads 21 where it read 20. Checked: the old hashes are the new text with [21] put back to [20]. Nothing else changed. New hashes below.
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
  'vesselFS(false)': 'c4ca8495a0e6c624bf3679de8291b4e816cf2ce70dde0085d0630ed30cb5e6e9',
  'vesselFS(true)': 'a0510c43817c7ec62861640249bcf1f6040e4694a5041373b98bf9265aadb5a8',
};

test('the general and one-vessel (classic) builds are byte for byte what they were at 363a81c', () => {
  assert.equal(sha(vesselFS(false)), HASH['vesselFS(false)']);
  assert.equal(sha(vesselFS(true)), HASH['vesselFS(true)']);
});
