// Laptop-heat quick item Q2: a uniform is sent to the GPU only when its value is not the one the program already holds (uniform-cache.js).
// The figure's composite set about fifty uniforms on every frame the blood moved, nearly all unchanged, and in Safari each call is a message to
// the GPU process. The picture is the same: a program keeps its uniforms until it is linked again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { uniformCache } from '../src/ui/uniform-cache.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
function fakeGL() {
  const calls = [];
  return new Proxy({ calls }, { get: (t, k) => (k === 'calls' ? calls : (...a) => { calls.push([String(k), ...a.map((x) => (ArrayBuffer.isView(x) ? Array.from(x) : x))]); }) });
}
const loc = (n) => ({ n });

test('a scalar or vector is sent the first time and when it changes, never when it is the value the program holds', () => {
  const gl = fakeGL(), U = uniformCache(gl), a = loc('a'), b = loc('b'), c = loc('c'), d = loc('d'), e = loc('e');
  for (let i = 0; i < 4; i++) { U.f1(a, 0.5); U.i1(b, 1); U.f2(c, 1, 2); U.f3(d, 1, 2, 3); U.f4(e, 1, 2, 3, 4); }
  assert.deepEqual(gl.calls.map((x) => x[0]), ['uniform1f', 'uniform1i', 'uniform2f', 'uniform3f', 'uniform4f'], 'one send each, however often they are asked');
  gl.calls.length = 0;
  U.f1(a, 0.5); U.f1(a, 0.75); U.f1(a, 0.75); U.f3(d, 1, 2, 3); U.f3(d, 1, 2, 4); U.f4(e, 1, 2, 3, 4); U.f4(e, 0, 2, 3, 4);
  assert.deepEqual(gl.calls, [['uniform1f', a, 0.75], ['uniform3f', d, 1, 2, 4], ['uniform4f', e, 0, 2, 3, 4]]);
  gl.calls.length = 0;
  U.f1(a, 0.5); U.f1(a, 0.75); U.f1(a, 0.5);
  assert.equal(gl.calls.length, 3, 'a value that goes back is sent again: only what the program holds now counts');
});

test('the array forms take arrays, and compare what is in them, not the array', () => {
  const gl = fakeGL(), U = uniformCache(gl), p = loc('p'), q = loc('q'), r = loc('r'), v = loc('v'), m = loc('m');
  U.f4a(p, [1, 2, 3, 4]); U.f4a(p, [1, 2, 3, 4]); U.f4a(p, [1, 2, 3, 5]);
  U.f3a(q, [1, 2, 3]); U.f3a(q, [1, 2, 3]);
  U.f2a(r, [7, 8]); U.f2a(r, [7, 8]);
  assert.deepEqual(gl.calls, [['uniform4f', p, 1, 2, 3, 4], ['uniform4f', p, 1, 2, 3, 5], ['uniform3f', q, 1, 2, 3], ['uniform2f', r, 7, 8]]);
  gl.calls.length = 0;
  const arr = new Float32Array([1, 2, 3, 4, 5, 6]);
  U.fv3(v, arr); U.fv3(v, arr);
  arr[4] = 9; U.fv3(v, arr); U.fv3(v, arr);
  assert.deepEqual(gl.calls, [['uniform3fv', v, [1, 2, 3, 4, 5, 6]], ['uniform3fv', v, [1, 2, 3, 4, 9, 6]]], 'the same array changed in place is sent once more, then held');
  gl.calls.length = 0;
  const mat = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  U.m3(m, mat); U.m3(m, mat); mat[0] = 2; U.m3(m, mat);
  assert.deepEqual(gl.calls.map((x) => [x[0], x[2]]), [['uniformMatrix3fv', false], ['uniformMatrix3fv', false]]);
  assert.deepEqual(gl.calls.map((x) => x[3][0]), [1, 2]);
});

test('each location holds its own value, and a missing location is left alone as the GPU leaves it', () => {
  const gl = fakeGL(), U = uniformCache(gl), a = loc('a'), b = loc('b');
  U.f1(a, 1); U.f1(b, 1); U.f1(a, 1); U.f1(b, 1);
  assert.equal(gl.calls.length, 2, 'two programs holding the same number each need it once');
  gl.calls.length = 0;
  U.f1(null, 1); U.f1(undefined, 1); U.i1(null, 1); U.f4a(undefined, [1, 2, 3, 4]); U.fv4(null, new Float32Array(4)); U.m3(undefined, new Float32Array(9));
  assert.deepEqual(gl.calls, []);
  const other = uniformCache(fakeGL());
  other.f1(a, 1);
  const g2 = fakeGL(), U2 = uniformCache(g2); U2.f1(a, 1);
  assert.equal(g2.calls.length, 1, 'a cache is made for one context: another context holds nothing yet');
});

test('a frame in which only the clock moved sends one uniform', () => {
  const gl = fakeGL(), U = uniformCache(gl), L = Object.fromEntries(['inv', 'H', 'pxW', 'plates', 'blood', 'clock', 'dyeCol', 'bleedE'].map((n) => [n, loc(n)]));
  const frame = (t) => {
    U.m3(L.inv, new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])); U.f1(L.H, 982); U.f1(L.pxW, 0.5); U.i1(L.plates, 3); U.i1(L.blood, 1);
    U.f3a(L.dyeCol, [0.8, 0.95, 0.2]); U.fv4(L.bleedE, new Float32Array(96)); U.f1(L.clock, t);
  };
  frame(0);
  assert.equal(gl.calls.length, 8, 'the first frame sets them all');
  gl.calls.length = 0;
  for (let t = 1; t <= 60; t++) frame(t / 60);
  assert.equal(gl.calls.length, 60, 'then one a frame');
  assert.ok(gl.calls.every((c) => c[0] === 'uniform1f' && c[1] === L.clock));
});

// The cache is only right if nothing else sets what it holds: these names are set through it and nowhere else.
test('veins-gl.js sets the composite\'s per-frame uniforms through the cache and nowhere else', () => {
  const src = read('../src/ui/veins-gl.js');
  const names = ['inv', 'H', 'pxW', 'plates', 'plateAlpha', 'plateSat', 'plateRect0', 'plateRect1', 'fluidRect', 'fluidS', 'fluidInk', 'fluidLv', 'blood', 'chev', 'still', 'flowA', 'blendA', 'chevInk', 'chevLight', 'cssPx', 'origin', 'dyeOn', 'clock', 'rows', 'originCol', 'dyeCol', 'revCol', 'inkLight', 'inkDark', 'bleedE', 'bleedB', 'bleedN', 'noChev', 'noChevN', 'chevHole', 'chevHoleR', 'chevHoleN', 'lA', 'lWrap', 'lSize', 'lH', 'lineOn', 'glowOn', 'warmOn', 'stackOn', ];
  for (const n of names) {
    const uses = src.split('\n').filter((l) => new RegExp(`(?<![\\w.])(?:U|u|P\\.u|cathPass\\.u)\\.${n}\\b`).test(l));
    assert.ok(uses.length >= 1, `${n} is set`);
    for (const l of uses) assert.match(l, /UC\.\w+\(U\./, `${n}: ${l.trim().slice(0, 90)}`);
  }
  assert.match(src, /const UC = uniformCache\(gl\);/);
  assert.match(src, /import \{ uniformCache \} from '\.\/uniform-cache\.js/);
});

test('reset() forgets what is held (context loss and restore)', () => {
  const gl = fakeGL(), a = loc('a'), m = loc('m');
  const U = uniformCache(gl);
  U.f1(a, 2); U.f1(a, 2); U.iv1(m, new Int32Array([1, 2])); U.iv1(m, new Int32Array([1, 2]));
  assert.equal(gl.calls.length, 2, 'equal sets are skipped');
  U.reset();
  U.f1(a, 2); U.iv1(m, new Int32Array([1, 2]));
  assert.equal(gl.calls.length, 4, 'after a loss the same values are sent again');
});

test('veins-gl.js sends no uniform around the cache, and forgets the cache on loss and restore', () => {
  const src = read('../src/ui/veins-gl.js');
  assert.equal(src.split('\n').filter((l) => /\bgl\.uniform/.test(l)).length, 0, 'every uniform goes through UC');
  assert.match(src, /uniformCache\(gl\)/);
  assert.doesNotMatch(src, /ucache|UNIFORM_CACHE/, 'no address switch sends every uniform');
  assert.doesNotMatch(read('../src/ui/uniform-cache.js'), /ucache|location\.search|\bon\b =/);
  assert.match(src, /onLost = \(e\) => \{[^}]*UC\.reset\(\)/);
  assert.match(src, /webglcontextrestored', onRestored/);
});

test('the lobule, dive field, lymph overlay and organ stack draws set their per-frame uniforms through the cache', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['tissue-gl', 'field-gl', 'fx-gl', 'organs-gl']) {
    const src = readFileSync(new URL(`../src/ui/${f}.js`, import.meta.url), 'utf8');
    assert.match(src, /import \{ uniformCache \} from '\.\/uniform-cache\.js/, f);
    assert.match(src, /uniformCache\(gl\)/, f);
  }
  const fx = readFileSync(new URL('../src/ui/fx-gl.js', import.meta.url), 'utf8');
  assert.doesNotMatch(fx, /new Float32Array\(MAX_DUCTS \* 4\), d1/, 'no array made per frame for the ductules');
  const organs = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  assert.doesNotMatch(organs, /gl\.uniform[0-9A-Za-z]*\(U\./, 'the stack layer sets nothing around the cache');
});

test('one location set from an array, then from numbers, and back: sent each time, never thrown (a linear gradient then a radial one)', () => {
  // (6 Nov 2026: the scope's bleed fills a linear gradient (fv4 of its ends) then a radial one (f4) through the same uniform; the array's
  // record had no numbers, f4 threw on every frame and the bleed never drew: Mohammad, "varix still not bleeding on scope view".)
  const gl = fakeGL(), U = uniformCache(gl), pl = loc('pl');
  U.fv4(pl, new Float32Array([0, 1, 2, 3]));
  U.f4(pl, 4, 5, 6, 7);
  U.fv4(pl, new Float32Array([0, 1, 2, 3]));
  U.f4(pl, 4, 5, 6, 7);
  assert.deepEqual(gl.calls.map((x) => x[0]), ['uniform4fv', 'uniform4f', 'uniform4fv', 'uniform4f']);
});
