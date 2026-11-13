// The live organ stack's shift(name, dy) says whether it moved a layer (13 Nov 2026, heat D-2, his Mac warm at rest): veins-gl.js bumps its picture version only on true, so a bowel
// float handed over again unchanged no longer makes the picture a new one. Numbers: how many shifts moved a layer, over a run of repeats and changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOrganStack } from '../src/ui/organs-gl.js';

function fakeGL() {
  let id = 0;
  const gl = new Proxy({ canvas: { width: 400, height: 300 } }, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return k;
      if (k === 'getShaderParameter' || k === 'getProgramParameter') return (_, what) => (what === 'ACTIVE_UNIFORMS' || what === gl.ACTIVE_UNIFORMS ? 0 : true);
      if (/^create/.test(k)) return () => ({ id: ++id });
      return () => {};
    },
  });
  return gl;
}

test('shift returns true only when a gathered layer\'s offset changed', () => {
  const painter = { describe: () => ({ sig: '1|0', ops: [] }), paintGroup() {}, paintGroupInto() {}, layMasked() {}, endFrame() {}, trim() {}, dropKept() {}, stats: () => ({ meshes: 0, kept: 0 }), dispose() {} };
  const stack = createOrganStack(fakeGL(), { painter });
  const under = [{ name: 'bowel', dy: 0 }, { name: 'other', dy: 0 }];
  const spec = { name: 'gut', x0: 0, x1: 10 };
  stack.setLive(new Map([['gut', [{ spec, m: [1, 0, 0, 1, 0, 0] }]]]), new Map([['gut', { spec, m: [1, 0, 0, 1, 0, 0], under }]]));
  const dys = [0, 0, 0, 3, 3, 3, 3, 5, 5, 0, 0, 0];   // (a bowel float: repeated, then a few real changes)
  const moved = dys.map((dy) => stack.shift('bowel', dy));
  assert.equal(moved.filter(Boolean).length, 3, 'only the three changes (0 to 3, 3 to 5, 5 to 0) move a layer');
  assert.deepEqual(moved, [false, false, false, true, false, false, false, true, false, true, false, false]);
  assert.equal(under[0].dy, 0);
  assert.equal(under[1].dy, 0, 'a layer of another name is not moved');
  assert.equal(stack.shift('nothing', 7), false, 'a name no cut gathers moves nothing');
  const bare = createOrganStack(fakeGL(), { painter });
  assert.equal(bare.shift('bowel', 4), false, 'no cuts, nothing moves');
});
