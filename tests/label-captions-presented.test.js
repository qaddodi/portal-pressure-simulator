// A figure's names drawn by the GPU hide the page's own only once the GPU's picture is on the screen (label-captions.js presented): a frame
// at nonzero size whose end() did not return false. A failed hand-over, a lost context or a size of nothing show the page's names again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
for (const k of ['Element', 'HTMLElement', 'Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle', 'matchMedia', 'addEventListener']) globalThis[k] ??= dom.window[k]?.bind ? dom.window[k].bind(dom.window) : dom.window[k];
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.Element = dom.window.Element;
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame ||= (f) => setTimeout(() => f(performance.now()), 0);
globalThis.cancelAnimationFrame ||= (id) => clearTimeout(id);
const { createCaptions } = await import('../src/ui/label-captions.js');

// (A label-gl layer the test drives: its sync() lands or not as the test says, and the box has the size the test gives.)
function rig() {
  const R = { w: 100, h: 50, ok: true, gpuLost: false, ends: 0, pg: true };
  const labelGL = () => ({ get lost() { return R.gpuLost || !R.ok; }, sync() { R.ends++; }, setHoles() {}, dispose() { R.disposed = (R.disposed || 0) + 1; } });
  const box = document.createElement('div');
  document.body.append(box);
  box.getBoundingClientRect = () => ({ width: R.w, height: R.h, left: 0, top: 0, right: R.w, bottom: R.h });
  R.cap = createCaptions(box, { labelGL });
  R.ev = [];
  R.cap.onPresented = () => R.ev.push('presented');
  R.cap.onLost = () => R.ev.push('lost');
  R.drawn = 0; R.cap.onDrawn = () => R.drawn++;
  R.frame = () => { R.cap.drawNow(); };
  return R;
}

test('a failed first hand-over is not presented (the page names stay), and fires no onDrawn', () => {
  const R = rig();
  R.ok = false;
  R.frame();
  assert.equal(R.ends, 1);
  assert.equal(R.cap.presented, false);
  assert.equal(R.drawn, 0);
  assert.deepEqual(R.ev, []);
});

test('a first frame at no size is not presented; a later one that succeeds is', () => {
  const R = rig();
  R.w = 0; R.h = 0;
  R.frame();
  assert.equal(R.cap.presented, false);
  assert.equal(R.drawn, 0);
  R.w = 100; R.h = 50;
  R.frame();
  assert.equal(R.cap.presented, true);
  assert.equal(R.drawn, 1);
  assert.deepEqual(R.ev, ['presented']);
  R.frame();
  assert.deepEqual(R.ev, ['presented'], 'fires on the transition only');
  assert.equal(R.drawn, 1, 'onDrawn once');
});

test('a hand-over that fails after presenting keeps the picture, and draws again until it lands', async () => {
  const R = rig();
  R.frame();
  R.ok = false; R.frame();
  assert.equal(R.cap.presented, true, 'the last picture stays; the page\'s names do not come back');
  const ends = R.ends;
  await new Promise((r) => setTimeout(r, 120));
  assert.ok(R.ends > ends, 'drawn again on the GPU');
  R.ok = true;
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(R.ev, ['presented'], 'never lost');
});

test('a lost context keeps the class and asks for a frame; the drawer going for good loses it', async () => {
  const R = rig();
  R.frame();
  R.gpuLost = true;
  R.cap.paint();
  assert.equal(R.cap.presented, true);
  const ends = R.ends;
  await new Promise((r) => setTimeout(r, 120));
  R.gpuLost = false;
  await new Promise((r) => setTimeout(r, 120));
  assert.ok(R.ends > ends, 'the frame it asked for, drawn once the context is back');
  assert.deepEqual(R.ev, ['presented']);
  R.cap.dispose();
  assert.equal(R.cap.presented, false);
  assert.deepEqual(R.ev, ['presented', 'lost']);
});

test('new words do not take presentation back before the next frame (no flash), but count a generation', () => {
  const R = rig();
  R.frame();
  const g = R.cap.gen;
  R.cap.look('a', { lh: 1, gap: 0, halo: 0, haloC: '', runs: { name: { size: 12, weight: 400, ls: 0, fill: '', op: 1, upper: false, mr: 0 } } });
  assert.equal(R.cap.presented, true);
  assert.ok(R.cap.gen > g);
});

test('a late onPresented hears of a presentation already made', () => {
  const R = rig();
  R.frame();
  let n = 0; R.cap.onPresented = () => n++;
  assert.equal(n, 1);
});

// ── R13: dispose lets go once and for good ──
test('dispose cancels the queued frame, lets go the drawer and callbacks, and every later call does nothing', async () => {
  const R = rig();
  let frames = 0, rest = 0;
  R.cap.onRest = () => rest++;
  R.cap.onFrame = () => { frames++; return false; };
  R.frame();
  const f0 = frames;
  R.cap.paint();                       // (a frame is queued)
  R.cap.dispose();
  assert.equal(R.disposed, 1);
  assert.equal(R.cap.on, false);
  assert.equal(R.cap.presented, false);
  assert.deepEqual(R.ev, ['presented', 'lost']);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(frames, f0, 'the queued frame never ran');
  const ends = R.ends;
  R.cap.look('a', { lh: 1, gap: 0, halo: 0, haloC: '', runs: {} });
  R.cap.put('a', { x: 1, y: 1 });
  R.cap.view(2, 3, 4);
  R.cap.paint(); R.cap.drawNow();
  R.cap.onPresented = () => R.ev.push('late');
  R.cap.onFrame = () => { frames++; };
  assert.equal(R.cap.hasLook('a'), false);
  assert.equal(R.cap.at('a'), null);
  assert.deepEqual([...R.cap.measure('a', [])], [0, 0]);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(R.ends, ends, 'no frame drawn after dispose');
  assert.equal(frames, f0);
  assert.deepEqual(R.ev, ['presented', 'lost'], 'no callback after dispose');
  R.cap.dispose();                     // (idempotent)
  assert.equal(R.disposed, 1);
  assert.deepEqual(R.ev, ['presented', 'lost']);
  assert.equal(rest, 0);
});

test('disposing a layer that never presented fires no lost', () => {
  const R = rig();
  R.cap.dispose();
  assert.deepEqual(R.ev, []);
});

// ── The swap is atomic: the page's names are made clear in the task that handed the GPU's picture over ──
test('onPresented runs inside the frame that handed the picture over, so a view can write its class in that same task', () => {
  const R = rig();
  let seenEnds = -1;
  R.cap.onPresented = () => { seenEnds = R.ends; };
  R.frame();
  assert.equal(seenEnds, 1, 'called before drawNow returned, after the first end()');
});
