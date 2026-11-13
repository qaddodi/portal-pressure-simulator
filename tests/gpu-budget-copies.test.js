// B11 (bugs-recs, 2 Nov 2026): the resource registry counts storage made by copyTexImage2D and the levels generateMipmap adds,
// replaces it when the same level is made again, and forgets it on delete.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class W2 {}
globalThis.WebGL2RenderingContext = W2;
globalThis.screen = { width: 1440, height: 900 };
const { budget, budgetOwner } = await import('../src/ui/gpu-budget.js');
// (The very module gpu-budget.js imports, by its own address: one record, as in the browser.)
const { trackGL } = await import('../src/ui/gl-state.js');

function fakeGL() {
  const gl = Object.create(W2.prototype);
  Object.assign(gl, { FRAMEBUFFER: 0x8d40, READ_FRAMEBUFFER: 0x8ca8, DRAW_FRAMEBUFFER: 0x8ca9, TEXTURE_2D: 0x0de1, ARRAY_BUFFER: 0x8892, RGBA8: 0x8058,
    RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, TEXTURE0: 0x84c0, ACTIVE_TEXTURE: 0x84e0, TEXTURE_BINDING_2D: 0x8069, VIEWPORT: 0x0ba2, SCISSOR_BOX: 0x0c10 });
  const tex = new Map(); let unit = gl.TEXTURE0;
  gl.canvas = { width: 0, height: 0, addEventListener() {} };
  gl.isContextLost = () => false;
  gl.isEnabled = () => false;
  gl.getParameter = (k) => (k === gl.ACTIVE_TEXTURE ? unit : k === gl.VIEWPORT || k === gl.SCISSOR_BOX ? new Int32Array(4) : k === gl.TEXTURE_BINDING_2D ? tex.get(unit) ?? null : null);
  gl.bindTexture = (t, x) => { tex.set(unit, x); };
  gl.activeTexture = (u) => { unit = u; };
  for (const n of ['enable', 'disable', 'bindFramebuffer', 'viewport', 'scissor', 'useProgram', 'bindVertexArray', 'bindBuffer', 'bindRenderbuffer', 'blendFunc',
    'blendFuncSeparate', 'blendEquation', 'blendEquationSeparate', 'colorMask', 'clearColor', 'stencilMask', 'stencilMaskSeparate', 'texImage2D', 'copyTexImage2D',
    'generateMipmap', 'texStorage2D', 'deleteTexture']) gl[n] = () => {};
  gl.createTexture = () => ({});
  budgetOwner(gl, 'b11');
  return trackGL(gl);
}
const mine = () => budget().owners.find((o) => o.owner === 'b11') || { mb: 0, n: 0 };

test('copyTexImage2D storage is counted, replaced by a second copy at the same level, and forgotten on delete', () => {
  const gl = fakeGL(), t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 0, 0, 1024, 1024, 0);
  assert.equal(mine().mb, 4.2);
  gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 0, 0, 2048, 1024, 0);
  assert.equal(mine().mb, 8.4, 'the level is replaced, not added to');
  gl.deleteTexture(t);
  assert.equal(mine().n, 0);
});

test('generateMipmap adds the levels below the base; an immutable texStorage texture is not counted twice', () => {
  const gl = fakeGL(), t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1024, 1024, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  assert.equal(mine().mb, 4.2);
  gl.generateMipmap(gl.TEXTURE_2D);
  assert.equal(mine().mb, 5.6, 'base plus a third');
  gl.generateMipmap(gl.TEXTURE_2D);
  assert.equal(mine().mb, 5.6, 'asking again changes nothing');
  gl.deleteTexture(t);
  const s = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, s);
  gl.texStorage2D(gl.TEXTURE_2D, 11, gl.RGBA8, 1024, 1024);
  const before = mine().mb;
  gl.generateMipmap(gl.TEXTURE_2D);
  assert.equal(mine().mb, before);
});
