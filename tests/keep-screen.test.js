import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepScreen } from '../src/ui/keep-screen.js';

// The figure's canvas kept by the renderer (8 Nov 2026): every bind of the canvas binds the screen texture, and the frame's end copies the
// screen onto the canvas once, whole: the only write the shown surface gets.
function fakeGL() {
  const calls = [];
  let n = 1;
  const gl = { FRAMEBUFFER: 1, DRAW_FRAMEBUFFER: 2, READ_FRAMEBUFFER: 3, TEXTURE_2D: 4, RGBA8: 5, RGBA: 6, UNSIGNED_BYTE: 7, COLOR_ATTACHMENT0: 8, COLOR: 9, SCISSOR_TEST: 10, RASTERIZER_DISCARD: 11, COLOR_BUFFER_BIT: 12, NEAREST: 13, TEXTURE_MIN_FILTER: 14, TEXTURE_MAG_FILTER: 15, TEXTURE_WRAP_S: 16, TEXTURE_WRAP_T: 17, CLAMP_TO_EDGE: 18 };
  let scissor = true;
  for (const k of ['bindFramebuffer', 'drawArrays', 'clear', 'blitFramebuffer', 'createTexture', 'createFramebuffer', 'bindTexture', 'texImage2D', 'texParameteri', 'framebufferTexture2D', 'invalidateFramebuffer', 'enable', 'disable']) {
    gl[k] = (...a) => { calls.push([k, ...a]); if (k === 'disable' && a[0] === 10) scissor = false; if (k === 'enable' && a[0] === 10) scissor = true; return k.startsWith('create') ? { id: n++, kind: k } : undefined; };
  }
  gl.isEnabled = (c) => (c === 10 ? scissor : false);
  return { gl, calls };
}

test('a bind of the canvas binds the screen; drawing marks it, and the frame end copies it onto the canvas once, whole', () => {
  const { gl, calls } = fakeGL();
  const canvas = { width: 300, height: 200 };
  let end = null, asked = 0;
  const sc = keepScreen(gl, canvas, { onEnd: (f) => { end = f; return () => {}; }, ask: () => { asked++; } });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const bound = calls.filter((c) => c[0] === 'bindFramebuffer').at(-1);
  assert.equal(bound[2], sc.fb, 'the screen, not the canvas');
  gl.drawArrays(5, 0, 4); gl.drawArrays(5, 0, 4);
  assert.equal(asked, 1, 'one ask for the frame that shows it');
  const n0 = calls.length;
  end();
  const blits = calls.slice(n0).filter((c) => c[0] === 'blitFramebuffer');
  assert.deepEqual(blits.map((c) => c.slice(1)), [[0, 0, 300, 200, 0, 0, 300, 200, gl.COLOR_BUFFER_BIT, gl.NEAREST]]);
  const binds = calls.slice(n0).filter((c) => c[0] === 'bindFramebuffer');
  assert.ok(binds.some((c) => c[1] === gl.DRAW_FRAMEBUFFER && c[2] === null), 'onto the real canvas');
  assert.deepEqual(binds.at(-1), ['bindFramebuffer', gl.DRAW_FRAMEBUFFER, sc.fb], 'the screen bound again after');
  assert.ok(calls.slice(n0).some((c) => c[0] === 'disable' && c[1] === gl.SCISSOR_TEST) && scissorBack(calls.slice(n0), gl), 'no scissor cuts the copy');
  const n1 = calls.length;
  end();
  assert.equal(calls.length, n1, 'nothing drawn since: no copy');
});
const scissorBack = (cs, gl) => cs.some((c) => c[0] === 'enable' && c[1] === gl.SCISSOR_TEST);

test('a framebuffer of its own is untouched, and the canvas colour invalidated means the screen\'s attachment', () => {
  const { gl, calls } = fakeGL();
  const canvas = { width: 10, height: 10 };
  let end = null;
  keepScreen(gl, canvas, { onEnd: (f) => { end = f; return () => {}; } });
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.drawArrays(5, 0, 4);
  const n0 = calls.length;
  end();
  assert.equal(calls.slice(n0).filter((c) => c[0] === 'blitFramebuffer').length, 0);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  gl.invalidateFramebuffer(gl.DRAW_FRAMEBUFFER, [gl.COLOR]);
  assert.deepEqual(calls.filter((c) => c[0] === 'invalidateFramebuffer').at(-1)[2], [gl.COLOR_ATTACHMENT0]);
});

test('the copy onto the canvas calls copied() after it (the ?perf frame-end step), and only when it copied', () => {
  const { gl } = fakeGL();
  let end = null, n = 0;
  keepScreen(gl, { width: 4, height: 4 }, { onEnd: (f) => { end = f; return () => {}; }, copied: () => { n++; } });
  end();
  assert.equal(n, 0, 'nothing drawn: no copy, no step');
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.drawArrays(5, 0, 4);
  end();
  assert.equal(n, 1);
});
