// The other view's labels solved ahead of time (stage-view.js preStep) survive the live view's layouts (4 Nov 2026, Anatomy → Circuit: "nothing
// arrives then they show up pop in existence"). On a playing model the Anatomy lays its labels out every frame or two, and each layout used to end
// the Circuit's solve ahead, because the two shared the solver's scratch; so it never landed and the tap solved the Circuit late. Now the solve
// ahead has scratch of its own and goes on between them. The real stage, booted in node (as scripts/stage-trace.mjs does), on a fixed clock: the
// solve ahead run alone, and again with a live solve and a live carry of the Anatomy between every two of its slices, gives the same slots, and
// the live labels are the same as with no solve ahead under way.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---- a fixed world: clock, timers, rAF ----
let T = 1000;
const timers = new Map();
let tid = 1, order = 0;
Object.defineProperty(performance, 'now', { value: () => T, configurable: true });
Date.now = () => 1.7e12 + T;
let seed = 12345;
Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const addTimer = (fn, ms, every, args) => { const id = tid++; timers.set(id, { fn, at: T + Math.max(0, ms || 0), every, args, o: order++ }); return id; };
globalThis.setTimeout = (fn, ms, ...a) => addTimer(fn, ms, 0, a);
globalThis.setInterval = (fn, ms, ...a) => addTimer(fn, ms, Math.max(1, ms || 1), a);
globalThis.clearTimeout = globalThis.clearInterval = (id) => { timers.delete(id); };
let ask = [];
globalThis.requestAnimationFrame = (cb) => { ask.push(cb); return ask.length; };
globalThis.cancelAnimationFrame = () => {};
const runTimers = (until) => {
  for (;;) {
    let best = null;
    for (const [id, t] of timers) if (t.at <= until && (!best || t.at < best[1].at || (t.at === best[1].at && t.o < best[1].o))) best = [id, t];
    if (!best) return;
    const [id, t] = best; T = Math.max(T, t.at);
    if (t.every) { t.at += t.every; t.o = order++; } else timers.delete(id);
    t.fn(...t.args);
  }
};
const pump = (ms) => { const end = T + ms; runTimers(end); T = end; const run = ask; ask = []; for (const cb of run) cb(T); runTimers(T); };

async function boot() {
  const glMod = await import('../scripts/warm/gl-stub.mjs');
  const { installPage } = await import('../scripts/warm/dom.mjs');
  const page = installPage();
  const win = page.dom.window, g = globalThis;
  for (const k of ['dispatchEvent', 'addEventListener', 'removeEventListener']) if (!g[k]) g[k] = win[k].bind(win);
  const ctx2d = (canvas) => new Proxy({ canvas, measureText: (s) => ({ width: String(s).length * 7, actualBoundingBoxLeft: 0, actualBoundingBoxRight: String(s).length * 7, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 3, fontBoundingBoxAscent: 10, fontBoundingBoxDescent: 3 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }), createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }) },
  { get: (o, k) => (k in o ? o[k] : typeof k === 'symbol' ? undefined : () => (k.startsWith('create') ? { addColorStop() {} } : undefined)), set: (o, k, v) => { o[k] = v; return true; } });
  win.HTMLCanvasElement.prototype.getContext = function (type) {
    if (type === '2d') return (this.__2d ??= ctx2d(this));
    return type === 'webgl2' ? (this.__gl ??= glMod.makeGL(this)) : null;
  };
  const BOX = { x: 0, y: 0, left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 }, NONE = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  win.Element.prototype.getBoundingClientRect = function () { return this.id === 'stageView' ? BOX : NONE; };
  for (const [k, v] of [['clientWidth', 1200], ['clientHeight', 800], ['offsetWidth', 1200], ['offsetHeight', 800]]) Object.defineProperty(win.HTMLElement.prototype, k, { get() { return this.id === 'stageView' ? v : 0; }, configurable: true });
  const { createCore } = await import('../src/worker-core.js');
  const frames = [];
  const core = createCore((m) => { if (m.type === 'frame') frames.push(m); });
  core.handle({ type: 'init' }); core.handle({ type: 'run', running: true });
  for (let i = 0; i < 60; i++) pump(33);
  core.handle({ type: 'run', running: false });
  const { createStage } = await import('../src/ui/stage.js');
  const st = createStage({ wrap: page.document.getElementById('stageView'), onSelect() {}, onAction() {}, onOpenTab() {}, onHoverInfo() {}, onViewChange() {} });
  for (let i = 0; i < 120; i++) { st.update(frames[i % frames.length]); pump(16.7); }
  return st;
}

const plain = (m) => (m ? Object.fromEntries([...m].map(([k, v]) => [k, { ...v }])) : null);

test('the solve ahead goes on through the live layouts: the same slots as alone, and the live labels as without it', async () => {
  const st = await boot();
  st.labelLayoutNow();
  const live0 = plain(st.labelLayoutNow());
  assert.ok(Object.keys(live0).some((k) => k.startsWith('n:')), `the Anatomy's own stations are solved: ${Object.keys(live0)}`);
  // (ms -1: the slice is over at once, so the solve yields at every point it can, the most slices and the most layouts between them.)
  const alone = st.labelPresolveRun(-1, null);
  const aloneSlots = plain(alone.slots);
  assert.ok(alone.slices > 5, `the solve ahead ran in slices: ${alone.slices}`);
  assert.ok(Object.keys(aloneSlots).filter((k) => k.startsWith('n:') && !aloneSlots[k].drop).length >= 2, `the Circuit's stations are solved ahead: ${Object.keys(aloneSlots)}`);
  assert.deepEqual(plain(st.labelLayoutNow()), live0, 'a solve ahead leaves the live labels as they were');
  let between = 0;
  const mixed = st.labelPresolveRun(-1, () => {
    between++;
    assert.deepEqual(plain(st.labelLayoutNow()), live0, `a live solve between slice ${between} and the next is the one with no solve ahead`);
    assert.deepEqual(plain(st.labelLayoutNow(false)), live0, 'and a carry');
  });
  assert.equal(mixed.slices, alone.slices, 'not begun again by the live layouts');
  assert.ok(between >= 5 && between === mixed.slices - 1, `a live layout between each two slices: ${between}`);
  assert.deepEqual(plain(mixed.slots), aloneSlots, 'the solve ahead, interleaved with the live layouts, lands the slots it lands alone');
  assert.deepEqual(plain(st.labelLayoutNow()), live0);
});

test("the solve ahead's lines index is its own: the live layouts' two shared buffers are built again and again, and it stays whole", async () => {
  const { indexHits, lineIndex, lineIndexBuf } = await import('../src/ui/seg-hits.js');
  const id = (x, y) => [x, y], line = (y, name) => ({ pts: [[0, y], [400, y]], R: null, flat: 2, wall: 0, id: name });
  const box = { x0: 100, y0: 95, x1: 140, y1: 105 };
  const own = lineIndexBuf(), got = lineIndex([line(100, 'dry')], id, 1, 64, own);
  assert.equal(got, own, 'built into the buffer given');
  assert.equal(indexHits(own, box, 0), 1);
  for (let i = 0; i < 4; i++) {
    const shared = lineIndex([line(300, 'live' + i)], id, 1, 64);   // (each live layout's build, in the two shared buffers by turns)
    assert.notEqual(shared, own);
    assert.equal(indexHits(shared, box, 0), 0);
  }
  assert.equal(indexHits(own, box, 0), 1, 'the kept index still holds its own line');
  assert.equal(indexHits(own, { x0: 100, y0: 295, x1: 140, y1: 305 }, 0), 0, 'and none of the live ones');
});
