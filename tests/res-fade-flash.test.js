// A resolution fade (res-fade.js) never changes the figure's brightness (Mohammad, 30 Oct: "it flashes whenever it switches
// resolution"). app.css eases every canvas of the stage's opacity over .25 s; the fade hid the figure's canvas through that ease,
// so it still showed under the mix as the fade began and, with the mix gone at the end, came back up from 0: a blink at every
// change. These tests run a whole fade in a model of the page: CSS transitions taken at each style change (a style read or the end
// of a task) with the transition the element has then, and premultiplied pixels composited as the screen stacks them.
import test from 'node:test';
import assert from 'node:assert/strict';

// ── The model page ──
const live = [];   // elements whose style is watched
let eased = [];    // opacity changes the browser would have animated
function flushStyle(el) {
  if (el.style.opacity !== el.done.opacity) {
    if ((el.style.transition || '') !== 'none') eased.push(`${el.name}: ${el.done.opacity || '1'} → ${el.style.opacity || '1'}`);
    el.done.opacity = el.style.opacity;
  }
}
const endTask = () => { for (const el of live) flushStyle(el); };
globalThis.getComputedStyle = (el) => new Proxy({}, { get: (_, k) => { flushStyle(el); return k === 'zIndex' ? '1' : k === 'opacity' ? el.style.opacity || '1' : ''; } });

// A one-pixel 2D context compositing premultiplied RGBA as a canvas does (source-over, lighter, globalAlpha).
function ctx2d(cv) {
  const c = { buf: [0, 0, 0, 0], globalAlpha: 1, globalCompositeOperation: 'source-over' };
  c.setTransform = () => {}; c.clearRect = () => { c.buf = [0, 0, 0, 0]; };
  c.save = c.restore = c.beginPath = c.rect = c.clip = () => {};   // (the old picture covers this pixel)
  c.drawImage = (img) => {
    const s = img.px.map((v) => v * c.globalAlpha);
    c.buf = c.globalCompositeOperation === 'lighter' ? c.buf.map((v, i) => Math.min(1, v + s[i])) : c.buf.map((v, i) => s[i] + v * (1 - s[3]));
  };
  cv.ctx = c;
  return c;
}
function element(name, extra = {}) {
  const el = { name, style: { opacity: '', transition: '', translate: '' }, done: { opacity: '' }, width: 1, height: 1, offsetWidth: 1, offsetHeight: 1,
    offsetLeft: 0, offsetTop: 0, isConnected: true, setAttribute() {}, remove() { el.isConnected = false; }, after(x) { page.push(x); x.isConnected = true; }, ...extra };
  live.push(el);
  return el;
}
const page = [];   // what is laid over the figure's canvas, in order
globalThis.document = { createElement: () => { const cv = element('mix'); cv.getContext = () => ctx2d(cv); Object.defineProperty(cv, 'px', { get: () => cv.ctx.buf }); return cv; } };
let frames = [];
globalThis.requestAnimationFrame = (f) => { frames.push(f); return frames.length; };
let clock = 0;
performance.now = () => clock;

const pm = (r, g, b, a) => [r * a, g * a, b * a, a];
const over = (top, under) => top.map((v, i) => v + under[i] * (1 - top[3]));
const opacityOf = (el) => (el.done.opacity === '' ? 1 : +el.done.opacity);
// The pixel on screen: the figure's canvas at its opacity over the page, and the mix (if laid) over both.
function screen(canvas, bg) {
  let s = over(canvas.px.map((v) => v * opacityOf(canvas)), bg);
  for (const el of page) if (el.isConnected) s = over(el.px.map((v) => v * opacityOf(el)), s);
  return s;
}

const { fadeOver, fading, FADE_MS, oldPlace, translateOf, snapOpacity } = await import('../src/ui/res-fade.js');

test('a whole fade between two pictures of the same translucent glow: the screen never changes, and the canvas never eases', () => {
  const glow = pm(1, 0.8, 0.3, 0.4), bg = pm(0.96, 0.95, 0.93, 1);   // (a glow over the light theme's page)
  const canvas = element('veins', { px: glow, width: 2, height: 2 });
  canvas.style.translate = '0.800px 0.500px';
  const want = screen(canvas, bg);
  const check = (when) => screen(canvas, bg).forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-9, `${when}: channel ${i} ${v} vs ${want[i]}`));
  fadeOver(canvas, () => [1, 0, 0, 1, 0, 0]);
  endTask(); check('the fade laid');
  assert.ok(fading(canvas));
  assert.equal(page.at(-1).style.translate, '0.800px 0.500px', 'the mix shows where the canvas did');
  // (The canvas resized and drawn again: the same glow.)
  let n = 0;
  while (frames.length && n < 100) {
    clock += 16.7; n++;
    const run = frames; frames = [];
    for (const f of run) f(clock);
    endTask(); check(`frame ${n}`);
  }
  assert.ok(!fading(canvas), 'the fade ends');
  assert.ok(n * 16.7 >= FADE_MS && n * 16.7 < FADE_MS + 40, `in about ${FADE_MS} ms (${(n * 16.7).toFixed(0)})`);
  assert.equal(canvas.style.opacity, '', 'the canvas shows again');
  assert.equal(canvas.style.transition, '', 'with its own transition back');
  assert.ok(!page.some((el) => el.isConnected), 'the mix is gone');
  assert.deepEqual(eased, [], 'no opacity change of the canvas or the mix was eased by CSS');
  check('after the fade');
});

test('a second change while one fades starts from the mix; the canvas stays hidden, its transition kept to put back', () => {
  eased = [];
  const canvas = element('veins2', { px: pm(0.2, 0.4, 0.9, 0.7), width: 2, height: 2 });
  canvas.style.transition = 'opacity 0.5s';   // (an inline transition of its own, to be put back as it was)
  fadeOver(canvas); endTask();
  clock += 100; for (const f of frames.splice(0)) f(clock); endTask();
  fadeOver(canvas); endTask();
  assert.equal(canvas.style.opacity, '0');
  assert.equal(canvas.style.transition, 'none');
  for (let i = 0; i < 40 && frames.length; i++) { clock += 16.7; for (const f of frames.splice(0)) f(clock); endTask(); }
  assert.ok(!fading(canvas));
  assert.equal(canvas.style.transition, 'opacity 0.5s');
  assert.deepEqual(eased, []);
});

test('a canvas that keeps no picture between frames is read only after capture puts its picture back, at the start and every frame', () => {
  eased = [];
  const glow = pm(0.9, 0.3, 0.2, 0.6), bg = pm(0.1, 0.1, 0.12, 1);
  // (The vessel canvas without preserveDrawingBuffer: after the frame that drew it, its buffer reads empty until present() copies the
  // kept picture onto it again.)
  let kept = false, captures = 0;
  const canvas = element('veins3', { width: 2, height: 2 });
  Object.defineProperty(canvas, 'px', { get: () => (kept ? glow : [0, 0, 0, 0]) });
  const capture = () => { captures++; kept = true; };
  fadeOver(canvas, null, capture);
  assert.equal(captures, 1, 'the picture before is read after one capture');
  kept = false; endTask();
  const want = over(glow, bg);
  let n = 0;
  while (frames.length && n < 100) {
    clock += 16.7; n++;
    const run = frames; frames = [];
    for (const f of run) f(clock);
    kept = false;   // (the frame shown: the buffer dropped again)
    endTask();
    if (fading(canvas)) screen(canvas, bg).forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-9, `frame ${n}: channel ${i} ${v} vs ${want[i]}`));
  }
  assert.ok(!fading(canvas));
  assert.equal(captures, n, 'one capture for the copy and one before each frame of the mix but the last, which ends the fade');
  assert.deepEqual(eased, []);
});

test('snapOpacity: the change is taken with no transition, and putting it back starts none', () => {
  eased = [];
  const el = element('snap');
  snapOpacity(el, '0'); endTask();
  snapOpacity(el, ''); endTask();
  assert.deepEqual(eased, []);
  assert.equal(el.style.transition, '');
  el.style.opacity = '0'; endTask();
  assert.deepEqual(eased, ['snap: 1 → 0'], 'the model does see an eased change');
});

test('oldPlace: the old picture stays where it showed, through the canvas’s sub-pixel translate and a moving view', () => {
  assert.deepEqual(translateOf(''), [0, 0]);
  assert.deepEqual(translateOf('0.800px 0.500px'), [0.8, 0.5]);
  assert.deepEqual(translateOf('1.5px'), [1.5, 0]);
  // (On screen a point p of the old picture was at p + at; the view since moved by m; the mix shows moved by now.)
  const place = (m, at, now, p) => { const q = oldPlace(m, at, now); return [q[0] * p[0] + q[2] * p[1] + q[4] + now[0], q[1] * p[0] + q[3] * p[1] + q[5] + now[1]]; };
  const m = [2, 0, 0, 2, -7, -14], at = [0.8, 0.5], now = [-0.3, 1.2], p = [10, 20];
  const was = [p[0] + at[0], p[1] + at[1]], want = [m[0] * was[0] + m[2] * was[1] + m[4], m[1] * was[0] + m[3] * was[1] + m[5]];
  place(m, at, now, p).forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-9));
  assert.deepEqual(oldPlace(null, [0, 0], [0, 0]), [1, 0, 0, 1, 0, 0], 'Full, the view still: as it was');
});
