import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepScreen } from '../src/ui/keep-screen.js';

// The figure's canvas kept by the renderer (8 Nov 2026): every bind of the canvas binds the screen texture, and the frame's end copies the
// screen onto the canvas once, whole: the only write the shown surface gets.
function fakeGL() {
  const calls = [];
  let n = 1;
  const gl = { FRAMEBUFFER: 1, DRAW_FRAMEBUFFER: 2, READ_FRAMEBUFFER: 3, TEXTURE_2D: 4, RGBA8: 5, RGBA: 6, UNSIGNED_BYTE: 7, COLOR_ATTACHMENT0: 8, COLOR: 9, SCISSOR_TEST: 10, RASTERIZER_DISCARD: 11, COLOR_BUFFER_BIT: 12, NEAREST: 13, TEXTURE_MIN_FILTER: 14, TEXTURE_MAG_FILTER: 15, TEXTURE_WRAP_S: 16, TEXTURE_WRAP_T: 17, CLAMP_TO_EDGE: 18, LINEAR: 19 };
  let scissor = true;
  for (const k of ['bindFramebuffer', 'drawArrays', 'clear', 'blitFramebuffer', 'createTexture', 'createFramebuffer', 'bindTexture', 'texImage2D', 'texParameteri', 'framebufferTexture2D', 'invalidateFramebuffer', 'enable', 'disable', 'deleteTexture', 'deleteFramebuffer', 'scissor']) {
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

// App review R1-1 (15 Nov 2026): a restored context is handed back as the same object, and the stage makes a new renderer in it. The
// screen was wrapped over the first wrapper: the new copy's bind of the canvas came out as the OLD screen, so the frame-end blit went into
// a texture nobody shows and the figure stayed blank. One wrapper per context; the new renderer takes the screen over.
function fakeCanvas(w = 300, h = 200) {
  const ls = {};
  return { width: w, height: h, ls,
    addEventListener(t, f) { (ls[t] ||= []).push(f); },
    fire(t) { for (const f of ls[t] || []) f(); } };
}

test('a second renderer in the same context (a restore) gets the screen, its frame end blits onto the real canvas, and nothing is wrapped twice', () => {
  const { gl, calls } = fakeGL();
  const canvas = fakeCanvas();
  let lostNow = false;
  const alive = new Set();
  gl.isContextLost = () => lostNow;
  const rawCreate = gl.createFramebuffer;
  gl.createFramebuffer = (...a) => { const f = rawCreate(...a); alive.add(f); return f; };
  gl.isFramebuffer = (f) => alive.has(f);
  const hooks = () => { const h = { end: null, asked: 0, copied: 0 }; h.opts = { onEnd: (f) => { h.end = f; return () => { h.end = null; }; }, ask: () => { h.asked++; }, copied: () => { h.copied++; } }; return h; };
  const bindFn = gl.bindFramebuffer;
  const a = hooks();
  const first = keepScreen(gl, canvas, a.opts);
  const wrapped = gl.bindFramebuffer, drew = gl.drawArrays;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const fb1 = first.fb;
  assert.ok(fb1);
  // The loss and the restore: the browser's own events, ahead of the stage's, then the stage disposes the old renderer and builds a new one.
  lostNow = true; alive.clear(); canvas.fire('webglcontextlost');
  lostNow = false; canvas.fire('webglcontextrestored');
  first.dispose();
  const b = hooks();
  const second = keepScreen(gl, canvas, b.opts);
  assert.equal(gl.bindFramebuffer, wrapped, 'the context\'s bind was not wrapped again');
  assert.equal(gl.drawArrays, drew, 'nor its draws');
  assert.equal(canvas.ls.webglcontextlost.length, 1, 'one listener on the canvas for the whole context');
  assert.equal(a.end, null, 'the old renderer\'s frame-end hook is gone');
  assert.ok(typeof b.end === 'function', 'the new one has its own');
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  assert.ok(second.fb && second.fb !== fb1, 'a screen made again in the restored context');
  assert.equal(calls.filter((c) => c[0] === 'bindFramebuffer').at(-1)[2], second.fb, 'the canvas binds the NEW screen');
  gl.drawArrays(5, 0, 4);
  assert.equal(b.asked, 1, 'the new renderer is asked for the frame, the old one is not'); assert.equal(a.asked, 0);
  const n0 = calls.length;
  b.end();
  const after = calls.slice(n0);
  assert.equal(after.filter((c) => c[0] === 'blitFramebuffer').length, 1, 'the frame end blits the screen');
  assert.ok(after.some((c) => c[0] === 'bindFramebuffer' && c[1] === gl.DRAW_FRAMEBUFFER && c[2] === null), 'onto the real canvas (null reaches the context, not a screen)');
  assert.ok(after.some((c) => c[0] === 'bindFramebuffer' && c[1] === gl.READ_FRAMEBUFFER && c[2] === second.fb), 'read from the new screen');
  assert.equal(b.copied, 1);
  // An old handle's late dispose does not take the new renderer's hook away.
  first.dispose();
  assert.ok(typeof b.end === 'function');
  assert.ok(bindFn !== wrapped);
});

test('a renderer that arrives before the restore event has run still gets a screen made in the new generation', () => {
  const { gl, calls } = fakeGL();
  const canvas = fakeCanvas();
  const alive = new Set();
  gl.isContextLost = () => false;
  const rawCreate = gl.createFramebuffer;
  gl.createFramebuffer = (...a) => { const f = rawCreate(...a); alive.add(f); return f; };
  gl.isFramebuffer = (f) => alive.has(f);
  const first = keepScreen(gl, canvas, { onEnd: () => () => {} });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const fb1 = first.fb;
  alive.clear();   // (the generation ended; no event has reached the screen yet)
  const second = keepScreen(gl, canvas, { onEnd: () => () => {} });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  assert.ok(second.fb && second.fb !== fb1);
  assert.equal(calls.filter((c) => c[0] === 'bindFramebuffer').at(-1)[2], second.fb);
});

// GPU-4 (19 Nov 2026): a clip cuts every pass that draws on the screen to a box, whatever scissor the pass sets or switches off, and leaves
// passes on framebuffers of their own and the frame's end copy alone.
function scissorGL() {
  const { gl, calls } = fakeGL();
  const real = { on: false, box: null };
  const en = gl.enable, dis = gl.disable;
  gl.scissor = (x, y, w, h) => { calls.push(['scissor', x, y, w, h]); real.box = [x, y, w, h]; };
  gl.enable = (c) => { en(c); if (c === 10) real.on = true; };
  gl.disable = (c) => { dis(c); if (c === 10) real.on = false; };
  return { gl, calls, real };
}

test('a clip cuts the screen\'s passes to its box, inside their own scissor, and lifts cleanly', () => {
  const { gl, real } = scissorGL();
  const canvas = { width: 300, height: 200 };
  const sc = keepScreen(gl, canvas, { onEnd: () => () => {} });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  sc.clip(10, 20, 100, 50);
  assert.ok(real.on && real.box.join() === '10,20,100,50', 'the box alone');
  gl.disable(gl.SCISSOR_TEST);   // a pass that switches its scissor off (the glass blur does)
  assert.ok(real.on && real.box.join() === '10,20,100,50', 'still cut');
  gl.enable(gl.SCISSOR_TEST); gl.scissor(60, 0, 200, 40);   // a pass with a scissor of its own: the two meet
  assert.equal(real.box.join(), '60,20,50,20');
  const own = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, own);   // a framebuffer of its own: the pass's own scissor, uncut
  assert.equal(real.box.join(), '60,0,200,40');
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  assert.equal(real.box.join(), '60,20,50,20', 'the screen again: cut again');
  sc.unclip();
  assert.ok(real.on && real.box.join() === '60,0,200,40', 'the pass\'s own scissor is back');
  gl.disable(gl.SCISSOR_TEST);
  assert.equal(real.on, false);
});

test('the frame end copy ignores a clip left standing, and the screen counts the writes made on it', () => {
  const { gl, calls, real } = scissorGL();
  const canvas = { width: 300, height: 200 };
  let end = null;
  const sc = keepScreen(gl, canvas, { onEnd: (f) => { end = f; return () => {}; } });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const w0 = sc.writes;
  gl.drawArrays(5, 0, 4); gl.drawArrays(5, 0, 4);
  assert.equal(sc.writes, w0 + 2);
  const own = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, own); gl.drawArrays(5, 0, 4);
  assert.equal(sc.writes, w0 + 2, 'a framebuffer of its own is not the screen');
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  sc.clip(0, 0, 10, 10);
  assert.equal(sc.clipped, true);
  const n0 = calls.length;
  end();
  assert.equal(sc.clipped, false);
  const blit = calls.slice(n0).find((c) => c[0] === 'blitFramebuffer');
  assert.deepEqual(blit.slice(1), [0, 0, 300, 200, 0, 0, 300, 200, gl.COLOR_BUFFER_BIT, gl.NEAREST], 'whole');
  assert.equal(real.on, false, 'no scissor on the copy');
});

// GPU-5 (19 Nov 2026 review): a canvas resized while nothing is drawn into it (the lobule or the sinusoid open, an iPhone turned) showed a cleared figure for the paint between the
// resize and the next draw. The screen now carries its old picture into the new size before the old one is let go, and resized() copies it onto the canvas in the same task.
test('a resized canvas: the old screen is stretched into the new one, the old one let go, and the canvas given the picture at once', () => {
  const { gl, calls } = fakeGL();
  const canvas = { width: 300, height: 200 };
  let end = null;
  const sc = keepScreen(gl, canvas, { onEnd: (f) => { end = f; return () => {}; } });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const old = sc.fb;
  gl.drawArrays(5, 0, 4); end();
  canvas.width = 600; canvas.height = 400;   // (assigning the size clears the shown canvas)
  const n0 = calls.length;
  sc.resized();
  const after = calls.slice(n0);
  const blits = after.filter((c) => c[0] === 'blitFramebuffer');
  assert.equal(blits.length, 2, 'one carry into the new screen, one copy onto the canvas');
  assert.deepEqual(blits[0].slice(1), [0, 0, 300, 200, 0, 0, 600, 400, gl.COLOR_BUFFER_BIT, gl.LINEAR], 'the old picture, stretched');
  assert.deepEqual(blits[1].slice(1), [0, 0, 600, 400, 0, 0, 600, 400, gl.COLOR_BUFFER_BIT, gl.NEAREST], 'then the whole new screen onto the canvas');
  assert.notEqual(sc.fb, old);
  assert.ok(after.some((c) => c[0] === 'deleteFramebuffer' && c[1] === old) && after.some((c) => c[0] === 'deleteTexture'), 'the old screen is let go');
  const carry = after.findIndex((c) => c[0] === 'blitFramebuffer'), gone = after.findIndex((c) => c[0] === 'deleteFramebuffer');
  assert.ok(carry >= 0 && carry < gone, 'carried before it is let go');
  assert.ok(after.some((c) => c[0] === 'bindFramebuffer' && c[1] === gl.READ_FRAMEBUFFER && c[2] === old), 'read from the old screen');
  assert.equal(sc.carried, 1);
  const n1 = calls.length;
  sc.resized();
  assert.equal(calls.length, n1, 'nothing more to do at the size it has');
});

test('a resize met by the next bind of the canvas carries the picture too (whoever draws first)', () => {
  const { gl, calls } = fakeGL();
  const canvas = { width: 300, height: 200 };
  const sc = keepScreen(gl, canvas, { onEnd: () => () => {} });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  canvas.width = 150; canvas.height = 100;
  const n0 = calls.length;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const blits = calls.slice(n0).filter((c) => c[0] === 'blitFramebuffer');
  assert.deepEqual(blits.map((c) => c.slice(1)), [[0, 0, 300, 200, 0, 0, 150, 100, gl.COLOR_BUFFER_BIT, gl.LINEAR]]);
  assert.equal(calls.slice(n0).filter((c) => c[0] === 'bindFramebuffer').at(-1)[2], sc.fb, 'and the new screen is what is bound');
});

test('before any screen exists a resize has nothing to carry or show', () => {
  const { gl, calls } = fakeGL();
  const canvas = { width: 300, height: 200 };
  const sc = keepScreen(gl, canvas, { onEnd: () => () => {} });
  canvas.width = 10;
  const n0 = calls.length;
  sc.resized();
  assert.equal(calls.length, n0);
});
