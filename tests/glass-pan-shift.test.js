// The glass while a hand pans the figure (heat recs H2b, 12 Nov 2026: the phone and the Mac warm, and every frame of a pan blurred again all
// the glasses read). The figure moves whole under the glasses, and a blur moved with it is the blur of the figure moved: the share's grid is held
// to the figure, its small targets are moved the whole texels the figure moved, and only the strip the pan brings under a card is blurred.
// A node replay through the real glass-gl.js, blur-share.js and frame.js (the page and the WebGL context faked, every blit and scissor recorded),
// and blur-share.js's own bookkeeping, alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
const rafs = [];
let clock = 1000;
globalThis.requestAnimationFrame = (cb) => { rafs.push(cb); return rafs.length; };
globalThis.cancelAnimationFrame = () => {};
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });
const timers = new Map(); let tid = 0;
globalThis.setTimeout = (f, ms = 0) => { timers.set(++tid, { f, at: clock + (ms || 0) }); return tid; };
globalThis.clearTimeout = (id) => { timers.delete(id); };
globalThis.setInterval = () => 0; globalThis.clearInterval = () => {};
const runTimers = (upTo = clock) => { for (;;) { let best = null; for (const [id, t] of timers) if (t.at <= upTo && (!best || t.at < best[1].at)) best = [id, t]; if (!best) return; timers.delete(best[0]); best[1].f(); } };
globalThis.MutationObserver = class { constructor() {} observe() {} disconnect() {} takeRecords() { return []; } };
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
globalThis.window = globalThis; globalThis.devicePixelRatio = 2; globalThis.innerWidth = 1200; globalThis.innerHeight = 800;
globalThis.CSS = { supports: () => true }; globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.WebGL2RenderingContext = class {}; globalThis.Path2D = class {};
globalThis.createImageBitmap = () => Promise.resolve({ close() {} });
globalThis.document = { documentElement: { hasAttribute: () => false, setAttribute() {}, removeAttribute() {} }, addEventListener() {}, removeEventListener() {}, timeline: { get currentTime() { return clock; } }, hidden: false, createElement: () => ({ width: 0, height: 0, getContext: () => null }) };

// The figure's context: the blits (with their filter) and the scissored passes' areas, and the region the glass is laid from (uReg).
let blits = [], cut = 0, reg = null, readFb = null;
const fig = new Proxy({}, { get(_, k) {
  if (typeof k !== 'string') return undefined;
  if (/^[A-Z0-9_]+$/.test(k)) return k;
  if (k === 'isContextLost') return () => false;
  if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
  if (k === 'checkFramebufferStatus') return () => 'FRAMEBUFFER_COMPLETE';
  if (k === 'getParameter') return () => 16384;
  if (k === 'createProgram') return () => ({});
  if (k === 'getUniformLocation') return (_p, name) => ({ name });
  if (k === 'bindFramebuffer') return (t, fb) => { if (t === 'READ_FRAMEBUFFER' || t === 'FRAMEBUFFER') readFb = fb; };
  if (k === 'blitFramebuffer') return (...a) => { a.canvas = readFb == null; blits.push(a); };   // (read from the canvas: the figure's own pixels)
  if (k === 'scissor') return (x, y, w, h) => { cut += w * h; };
  if (k === 'uniform4f') return (loc, ...v) => { if (loc?.name === 'uReg') reg = v; };
  return () => (k.startsWith('create') ? {} : undefined);
} });
const rect = (l, t, w, h) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h, x: l, y: t });
const el = (r) => ({ rest: r, isConnected: true, parentElement: null, nodeType: 1, attrs: new Map(), getAnimations: () => [],
  style: { setProperty() {}, removeProperty() {}, getPropertyValue: () => '', getPropertyPriority: () => '', transform: '', opacity: '', translate: '', transition: '' },
  classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
  getAttribute: (k) => (k === 'style' ? '' : null), hasAttribute(k) { return this.attrs.has(k); }, setAttribute(k, v = '') { this.attrs.set(k, String(v)); }, removeAttribute(k) { this.attrs.delete(k); },
  get dataset() { return {}; }, getBoundingClientRect() { return this.rest; }, contains(n) { return n === this; } });
const stage = { nodeType: 1, parentElement: null, isConnected: true, getAnimations: () => [], style: {}, contains: () => false, addEventListener() {}, removeEventListener() {} };
const data = el(rect(820, 200, 300, 420));   // (the data card, standing still while the figure is dragged under it)
data.parentElement = stage;
const look = { display: 'block', visibility: 'visible', opacity: '1', filter: 'none', boxShadow: 'none', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottomRightRadius: '16px', borderBottomLeftRadius: '16px',
  getPropertyValue: (k) => (k === '--gl-glass' ? '1' : k === '--gl-tint' ? 'rgba(252, 249, 243, 0.66)' : k === '--surface' ? '#fcf9f3' : '') };
globalThis.getComputedStyle = (e) => (e === data ? look : { backgroundColor: 'rgba(0, 0, 0, 0)', display: 'block', visibility: 'visible', getPropertyValue: (k) => (k === '--stage-bg' ? '#101820' : ''), opacity: '1', boxShadow: 'none' });
const source = { addEventListener() {}, removeEventListener() {}, width: 2400, height: 1600, getBoundingClientRect: () => rect(0, 0, 1200, 800), getAnimations: () => [], style: {}, parentElement: null, nodeType: 1 };

const F = await import('../src/ui/frame.js');
const { createGlassGL } = await import('../src/ui/glass-gl.js');
const { shareFor, sharePrep, sharePlan, shareKeep, shareShift } = await import('../src/ui/blur-share.js');
const { blurBoxesInto } = await import('../src/ui/glass-gl.js');

const tops = [];
const add = (t) => { tops.push(t); tops.sort((a, b) => a.order - b.order); return () => { const i = tops.indexOf(t); if (i >= 0) tops.splice(i, 1); }; };
let seq = 1, blood = 1, hand = false;
const M = new Float64Array([1, 0, 0, 1, 0, 0]);   // (the figure's matrix, world to stage CSS px: glM)
const present = () => { for (const t of tops) t.prep?.(); for (const t of tops) t.draw(); };
const G = createGlassGL(stage, source, [], { cards: { find: () => [data], watch: [stage], before: { parentNode: stage }, region: () => ({ card: true }) },
  version: () => seq, fresh: () => blood, camKey: () => 0, pan: () => M, panning: () => hand });
G.setHost({ gl: fig, canvas: source, add, now: () => present(), active: () => true, order: { low: 1, high: 3 }, over: () => [], view: () => null });
const settle = () => new Promise((r) => setImmediate(r));
async function frame() {
  runTimers(clock); await settle();
  clock += 16.7; runTimers(clock - 0.1); await settle();
  for (const cb of rafs.splice(0)) cb(clock);
  await settle();
}
// One picture laid at the figure's matrix now (a new picture, the blood moved): what the glass did for it.
function lay() {
  blits = []; cut = 0; seq++; blood++; clock += 16.7;
  present();
  return { halvings: blits.filter((b) => b[9] === 'LINEAR').length, px: blits.filter((b) => b.canvas).reduce((a, b) => a + (b[2] - b[0]) * (b[3] - b[1]), 0), moves: blits.filter((b) => b[9] === 'NEAREST').map((b) => [b[4], b[5]]), cut, reg: reg && [...reg] };
}
for (let i = 0; i < 20; i++) await frame();

test('a hand pans the figure under a card: the copy kept is moved with it, and only the strip the pan brings in is copied', () => {
  const rest = lay();   // (a picture at rest: all the card reads, copied)
  assert.ok(rest.px > 0, 'at rest a new picture is copied at once');
  hand = true;
  const per = [];
  // 64 CSS px a frame to the right: one texel of the field's copy (2 canvas px a CSS px, 128 canvas px a texel: SMOOTH, 12 Nov 2026).
  for (let i = 0; i < 6; i++) { M[4] += 64; per.push(lay()); }
  for (const p of per.slice(1)) {
    assert.deepEqual(p.moves, [[1, 0]], 'the copy moved one texel right, with the figure (no blur passes to move since the field)');
    assert.ok(p.px < rest.px * 0.4, `only the strip copied from the canvas: ${p.px} canvas px against ${rest.px} at rest`);
  }
  // The glass is laid from where the figure is: the region it samples follows the pan, a texel at a time on the grid held to it.
  assert.equal(per.at(-1).reg[0], per[0].reg[0], 'the grid held to the figure: the same phase every whole texel');
  // Half a texel (32 CSS px): the grid alone follows; nothing is moved or copied whole.
  M[4] += 32;
  const half = lay();
  assert.deepEqual(half.moves, [], 'under a texel: the targets stay');
  assert.ok(half.px < rest.px * 0.4, 'and no whole copy');
  assert.ok(Math.abs(half.reg[0] - (per.at(-1).reg[0] + 64)) < 1e-9, 'the region moved the half texel the figure did (64 canvas px)');
});

test('the pictures held through a pan are taken again 4 times a second, and at the let go', () => {
  hand = false; lay(); M[4] += 64;
  const rest = lay();   // (a whole blur: a new picture at rest)
  hand = true;
  let whole = 0;
  for (let i = 0; i < 30; i++) { M[4] += i % 2 ? 64 : -64; const p = lay(); if (p.px > rest.px * 0.5) whole++; }   // (30 frames, 500 ms, a texel back and forth)
  assert.ok(whole >= 1 && whole <= 3, `${whole} whole blurs in 500 ms of pan`);
  hand = false;
  const off = lay();
  assert.ok(off.px > rest.px * 0.5, 'the hand let go: the pictures as they are, blurred at once');
});

test('a zoom under the hand is no pan: blurred at once', () => {
  hand = true;
  lay();
  M[0] = M[3] = 1.1;
  const z = lay();
  assert.deepEqual(z.moves, []);
  assert.ok(z.px > 0, 'a new scale: all the card reads, copied');
  M[0] = M[3] = 1; hand = false; lay();
});

// blur-share.js alone: a kept blur moved with the figure keeps its parts where they now are and blurs only the strip.
const keep = (k) => (out, pool, boxes, ox, oy, tt, w, h) => blurBoxesInto(out, pool, boxes, ox, oy, tt, w, h, k);
test('shareShift: the snapshot\'s parts move with the figure, and the plan on the same pictures blurs only what the move brought in', () => {
  const S = shareFor(new Map(), {}, 'k');
  const grid = { x: 0, y: 0, X0: 0, Y0: 0, X1: 2384, Y1: 1584, T: 16 }, bw = 149, bh = 99, t = 8;
  const card = { x: 820, y: 200, w: 300, h: 420 };
  sharePrep(S, { id: 'a', boxes: [card], v: 5, f: 10 });
  sharePlan(S, grid, t, bw, bh, false, keep(11));
  shareKeep(S, 1000); S.phase = 'draw';
  const before = S.snap.fp.slice(0, 4);
  // The figure moved 3 texels right: in the figure's grid the card moved 3 texels left.
  assert.equal(shareShift(S, 3, 0, grid, bw, bh), true);
  assert.deepEqual(S.snap.fp.slice(0, 4), [before[0] + 3, before[1], Math.min(bw, before[2] + 3), before[3]]);
  assert.equal(S.snap.moved, true);
  sharePrep(S, { id: 'a', boxes: [card], v: 5, f: 10 });
  const p = sharePlan(S, grid, t, bw, bh, false, keep(11), null, null, null, 12);
  assert.equal(p.same, false);
  const area = (ps) => ps.reduce((a, r) => a + (r[2] - r[0]) * (r[3] - r[1]), 0);
  assert.ok(p.parts && area(p.parts) < area([before]) * 0.7, `the passes on the strip and its ring only: ${area(p.parts)} of ${area([before])} texels`);
  assert.ok(p.copy && area(p.copy) <= 3 * (before[3] - before[1]), `the copy of the strip alone: ${p.copy && area(p.copy)} texels`);
  // (Moved out of the copy: nothing kept.)
  assert.equal(shareShift(S, bw, 0, grid, bw, bh), false);
  assert.equal(S.snapOk, false);
});
