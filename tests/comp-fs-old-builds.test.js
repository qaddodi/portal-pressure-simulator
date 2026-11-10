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
const HASH = {
  'COMP_FS()': 'b14e98833562318ff9fe554fd0ea09a2855f323223be055e9e8fda7455cf5bdc',
  'COMP_FS(true)': 'ef1c27ef814e10589abc5fca4504b54c38b83255d53aa35d047d70ebea605a48',
  'COMP_FS(false, true)': 'a7c87cf118cd4fe7fff612f31c8341f1ec07093f743382b3dfd2784bea748a6b',
  'COMP_FS(false, false, true)': '44cea9df597b99ac81e8ce3ddfd2e1f0f1c96464192d59c87d474aa6eac46bd4',
};

test('the full, plain, half-size streak and arrowhead compositor builds are byte for byte what they were at b752802', () => {
  assert.equal(sha(COMP_FS()), HASH['COMP_FS()']);
  assert.equal(sha(COMP_FS(true)), HASH['COMP_FS(true)']);
  assert.equal(sha(COMP_FS(false, true)), HASH['COMP_FS(false, true)']);
  assert.equal(sha(COMP_FS(false, false, true)), HASH['COMP_FS(false, false, true)']);
});
