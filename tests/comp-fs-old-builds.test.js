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
const HASH = {
  'COMP_FS()': '4e87733f627aa6213ae19e78a3f66cc0cb6e0dd551122665ec06d97797cc961a',
  'COMP_FS(true)': '68c68dcb0dd56b6200beaf19295a854b719d0300cc9f98ca28739e55ad0adab0',
  'COMP_FS(false, true)': 'c59fde4a2088bcacd42caf76dc899af867d51886968780e49a2ca3077eac0739',
  'COMP_FS(false, false, true)': 'd0d6a31c55244526df09a2c2690217a17c9705a2f10280a98c456e367cf1b420',
};

test('the full, plain, half-size streak and arrowhead compositor builds are byte for byte what they were at b752802', () => {
  assert.equal(sha(COMP_FS()), HASH['COMP_FS()']);
  assert.equal(sha(COMP_FS(true)), HASH['COMP_FS(true)']);
  assert.equal(sha(COMP_FS(false, true)), HASH['COMP_FS(false, true)']);
  assert.equal(sha(COMP_FS(false, false, true)), HASH['COMP_FS(false, false, true)']);
});
