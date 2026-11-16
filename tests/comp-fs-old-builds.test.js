// The four compositor fragment shaders that existed before the Tube (veins-gl.js COMP_FS) are kept byte for byte: the lumen section's
// helpers moved to comp-glsl.js (Tube stage 3, brief S3-X, 10 Nov 2026) and the Tube builds are made only with JS in the template, never
// a change to these. The hashes are of the returned text at b752802, the last commit before the move. A change to the shared text on
// purpose updates them in the same push, with a reason.
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
const { COMP_FS } = await import('../src/ui/veins-gl.js');

const sha = (s) => createHash('sha256').update(s).digest('hex');
// (Updated on purpose with brief P5, 10 Nov 2026: pNoise, in the shared P_GLSL text every build includes, no longer runs its back layer in a
// lumen under 5 px across and centres its lanes there. The change is style P text only (blood styles 1 and 2 run the same arithmetic as before); the hashes before it were the b752802 ones.)
// (Updated on purpose, 16 Nov 2026, with the removal of the blood's Streaks option: the streak shader (bloodAt, its styles, the baked tile, the half-size pass, the
// zoom varyings and the blendA streak share) is gone from every build, so the three builds changed by exactly that text and the half-size streak build ceased to exist.
// tests/no-streaks.test.js names what must not come back.)
const HASH = {
  'COMP_FS()': 'c65d8ae34061be8ad71d8dcf022264822943f2678b98e5af197b4607e39099ae',
  'COMP_FS(true)': 'b9b66b121b56c4c8308858588b52b6635b2cf953ea5388981a39e18af01be149',
  'COMP_FS(false, true)': '76df238257951a955e1413af5bfd7a803c17723fa2fd1134c5bf44118367abd5',
};

test('the full, plain and arrowhead compositor builds are byte for byte what they were when the Streaks option was removed', () => {
  assert.equal(sha(COMP_FS()), HASH['COMP_FS()']);
  assert.equal(sha(COMP_FS(true)), HASH['COMP_FS(true)']);
  assert.equal(sha(COMP_FS(false, true)), HASH['COMP_FS(false, true)']);
});
