import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardCanvas } from '../src/ui/canvas-guard.js';

// The figure's canvas is not kept (f56992f): a write to it before the whole picture is laid in a display cycle goes to a 1x1 target off
// screen, so the browser never shows the canvas cleared under it (Mohammad's flicker, 8 Nov 2026). A write after the lay lands as before.
function fakeGL() {
  const calls = [];
  let n = 1;
  const gl = { FRAMEBUFFER: 1, DRAW_FRAMEBUFFER: 2, READ_FRAMEBUFFER: 3, TEXTURE_2D: 4, RGBA8: 5, RGBA: 6, UNSIGNED_BYTE: 7, COLOR_ATTACHMENT0: 8 };
  for (const k of ['bindFramebuffer', 'drawArrays', 'clear', 'blitFramebuffer', 'createTexture', 'createFramebuffer', 'bindTexture', 'texImage2D', 'framebufferTexture2D']) {
    gl[k] = (...a) => { calls.push([k, ...a]); return k.startsWith('create') ? { id: n++ } : undefined; };
  }
  return { gl, calls };
}
const drawTargets = (calls) => { let fb = null; const out = []; for (const c of calls) { if (c[0] === 'bindFramebuffer' && c[1] !== 3) fb = c[2]; if (c[0] === 'drawArrays' || c[0] === 'clear') out.push(fb); } return out; };

test('a canvas write before the lay goes off screen; one after it lands on the canvas', () => {
  const { gl, calls } = fakeGL();
  let laid = false;
  const st = guardCanvas(gl, () => laid);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.drawArrays(5, 0, 4);
  laid = true;
  gl.clear(16384);
  const t = drawTargets(calls);
  assert.ok(t[0] && t[0].id, 'the stray draw went to the 1x1 target');
  assert.equal(t[1], null, 'the write after the lay is on the canvas');
  assert.equal(st.redirected, 1);
  // (the canvas is bound again after the stray write)
  assert.deepEqual(calls.filter((c) => c[0] === 'bindFramebuffer').at(-1), ['bindFramebuffer', gl.DRAW_FRAMEBUFFER, null]);
});

test('a write to a framebuffer of its own is never touched', () => {
  const { gl, calls } = fakeGL();
  const st = guardCanvas(gl, () => false);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.drawArrays(5, 0, 4);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  gl.clear(16384);
  assert.deepEqual(drawTargets(calls), [fb, fb]);
  assert.equal(st.redirected, 0);
});
