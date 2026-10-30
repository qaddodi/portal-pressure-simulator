import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CELL, MAX_CELLS, cellFor, multiply, invert, boxThrough, regionFor, contains, touches, cellRange, artTest } from '../src/ui/credit-art.js';

// The corner credit's art test lives in the figure's own coordinates (credit-art.js, and credit.js worldTest): a camera move reads no
// shape from the page and no pixel from a canvas. The helpers are pure; the placer's use of them runs here on a small fake page.

test('a cell is between 3 and 6 screen px at any scale: never coarser than the 6 px screen grid it replaces', () => {
  for (let sc = 0.1; sc <= 8; sc *= 1.07) {
    const px = cellFor(sc) * sc;
    assert.ok(px <= CELL + 1e-9 && px > CELL / 2, `scale ${sc}: ${px} px`);
  }
  assert.equal(cellFor(1), 4);
  assert.equal(cellFor(6), 1);
  assert.equal(cellFor(0.3), 16);
});

test('a matrix times its inverse is the identity, and a turned view gives the box round the turned rectangle', () => {
  const m = { a: 0.7, b: 0.2, c: -0.2, d: 0.7, e: 30, f: -12 }, id = multiply(m, invert(m));
  for (const [k, v] of Object.entries({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })) assert.ok(Math.abs(id[k] - v) < 1e-12, k);
  assert.equal(invert({ a: 0, b: 0, c: 0, d: 0, e: 1, f: 1 }), null, 'a flat matrix has none');
  // (A quarter turn: the world's x runs down the screen.)
  const q = { a: 0, b: 2, c: -2, d: 0, e: 100, f: 10 };
  assert.deepEqual(boxThrough(q, 0, 0, 10, 20), { l: 60, r: 100, t: 10, b: 30 });
  const into = {};
  assert.equal(boxThrough(q, 0, 0, 10, 20, into), into, 'written where asked, nothing allocated');
});

test("a grid's region sits on the lattice of cells, holds the view and its margin, and gives way to a smaller margin over the cap", () => {
  const view = { l: 103.3, t: -41.9, r: 703.3, b: 458.1 }, c = 2;
  const reg = regionFor(view, c, 20);
  assert.ok(reg.x0 % c === 0 && reg.y0 % c === 0, 'on the lattice');
  assert.ok(contains(reg, { l: view.l - 320, t: view.t - 270, r: view.r + 320, b: view.b + 270 }), 'half a view each way, and the pad');
  assert.ok(!contains(reg, { l: view.l - 400, t: view.t, r: view.r, b: view.b }));
  const tight = regionFor(view, c, 20, 200000);
  assert.ok(tight.cols * tight.rows < reg.cols * reg.rows, 'a quarter of the margin: smaller');
  assert.ok(contains(tight, { l: view.l - 20, t: view.t - 20, r: view.r + 20, b: view.b + 20 }), '(still the view and its pad)');
  assert.equal(regionFor(view, c, 20, 10), null, 'over the cap even with no margin: the caller falls back to the screen grid');
  assert.ok(MAX_CELLS >= 600000, 'the biggest tablet view at the finest cell fits with its margin');
});

test('cells a box touches are clamped to the grid, empty when it is outside', () => {
  const reg = { x0: 0, y0: 0, cols: 10, rows: 5, c: 4 };
  assert.deepEqual(cellRange(reg, { l: 5, t: 1, r: 13, b: 9 }), [1, 3, 0, 2]);
  assert.deepEqual(cellRange(reg, { l: -50, t: -50, r: 500, b: 500 }), [0, 9, 0, 4]);
  const [c0, c1] = cellRange(reg, { l: 100, t: 0, r: 120, b: 4 });
  assert.ok(c1 < c0 || c0 > 9, 'off to the right: nothing to look at');
  assert.ok(touches(reg, { l: 38, t: 0, r: 44, b: 10 }) && !touches(reg, { l: 60, t: 0, r: 70, b: 10 }), 'a shape one cell past the edge can still touch it');
});

test('how much art a box covers is on the old grid scale whatever the cell size', () => {
  const grid = (c) => {   // organ art over the world square 0–120 × 0–120
    const reg = { x0: 0, y0: 0, cols: Math.ceil(240 / c), rows: Math.ceil(240 / c), c }, org = new Uint8Array(reg.cols * reg.rows), ves = new Uint8Array(org.length);
    for (let j = 0; j < reg.rows; j++) for (let i = 0; i < reg.cols; i++) if (i * c < 120 && j * c < 120) org[j * reg.cols + i] = 1;
    return { reg, org, ves };
  };
  const wr = { left: 0, top: 0, width: 240, height: 240 }, wm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const a = artTest(grid(4), wm, wr).cover({ l: 0, t: 0, r: 100, b: 100 }), b = artTest(grid(2), wm, wr).cover({ l: 0, t: 0, r: 100, b: 100 });
  assert.ok(Math.abs(a - b) / a < 0.15, `${a} and ${b}`);
  assert.ok(Math.abs(a - (100 / CELL) ** 2) / a < 0.2, 'about the cells of the old 6 px grid');
});

// ---- the placer's use of it, on a fake page ----
// Shapes are world rectangles; the fake canvas fills the pixels a rectangle's transformed box covers.
const counts = { shape: 0, readback: 0, style: 0 };
let cam = { a: 1, b: 0, c: 0, d: 1, e: 50, f: 30 };
const rectD = (r) => `R ${r.join(' ')}`;
globalThis.Path2D = class { constructor(d = '') { const m = /^R (\S+) (\S+) (\S+) (\S+)$/.exec(d); this.rect = m ? m.slice(1).map(Number) : null; } };
globalThis.CSS = { escape: String };
globalThis.getComputedStyle = (el) => { counts.style++; return el.cs; };
const shape = (cls, rect, { w = 0, fill = 'rgb(1, 1, 1)', stroke = 'none', tf = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, id = null, parent = null } = {}) => ({
  tagName: 'path', rect, tf, w, parentNode: parent,   // (rect: the shape's outline, changed by a test to move it)
  classList: { contains: (c) => cls.includes(c) },
  getAttribute(k) { return k === 'd' ? rectD(this.rect) : k === 'data-id' ? id : null; },
  getScreenCTM() { counts.shape++; return multiply(cam, this.tf); },
  getBoundingClientRect() { counts.shape++; const r = this.rect, b = boxThrough(multiply(cam, this.tf), r[0], r[1], r[0] + r[2], r[1] + r[3]); return { left: b.l, top: b.t, right: b.r, bottom: b.b, width: b.r - b.l, height: b.b - b.t }; },
  cs: { display: 'inline', strokeWidth: String(w), fill, stroke, strokeLinecap: 'butt', strokeLinejoin: 'miter' },
});
const lumen = { cs: { strokeWidth: '40' }, classList: { contains: () => false } };
const organA = shape('organ', [100, 100, 200, 150]);
const fluid = shape('ascites-fill', [500, 100, 100, 100], { fill: 'rgb(1, 1, 1)' });
const vessel = shape('v-hit', [400, 300, 10, 300], { w: 12, fill: 'none', stroke: 'rgba(0,0,0,0)', id: 'V1', parent: { querySelector: () => lumen } });
const scene = { organs: [organA], fluid: [fluid], hits: [vessel] };
const bySelector = (sel) => (sel.startsWith('#world .v-hit[data-id=') ? scene.hits.filter((h) => sel.includes(`"${h.getAttribute('data-id')}"`)) : sel.includes('g.organ') ? scene.organs : sel.includes('#ascites') ? scene.fluid : sel.includes('.v-lumen') ? scene.hits : []);
class FakeCtx {
  constructor() { this.t = [1, 0, 0, 1, 0, 0]; this.px = new Uint8ClampedArray(4); this.lineWidth = 1; }
  setTransform(...t) { this.t = t; }
  clearRect(x, y, w, h) { this.w = w; this.h = h; this.px = new Uint8ClampedArray(w * h * 4); }
  mark(r) {
    const [a, b, c, d, e, f] = this.t, m = { a, b, c, d, e, f }, q = boxThrough(m, r[0], r[1], r[0] + r[2], r[1] + r[3]);
    for (let j = Math.max(0, Math.floor(q.t)); j <= Math.min(this.h - 1, Math.ceil(q.b) - 1); j++) for (let i = Math.max(0, Math.floor(q.l)); i <= Math.min(this.w - 1, Math.ceil(q.r) - 1); i++) this.px[(j * this.w + i) * 4 + 3] = 255;
  }
  fill(p) { if (p.rect) this.mark(p.rect); }
  stroke(p) { if (p.rect) { const k = this.lineWidth / 2; this.mark([p.rect[0] - k, p.rect[1] - k, p.rect[2] + 2 * k, p.rect[3] + 2 * k]); } }
  getImageData() { counts.readback++; return { data: this.px }; }
}
const canvases = [];
const observers = [];
globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; this.targets = []; observers.push(this); } observe(t) { this.targets.push(t); } disconnect() { this.targets = []; } };
const view = { classList: { contains: (c) => c === 'gl-on' } };
const quiet = { matches: () => true }, artGroup = { matches: () => false };
const world = { children: [artGroup, artGroup, quiet], childElementCount: 3, getScreenCTM: () => cam, closest: (s) => (s === '.stage-view' ? view : null) };
globalThis.document = {
  documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {},
  getElementById: (id) => (id === 'world' ? world : null),
  querySelectorAll: bySelector,
  createElement: () => { const cv = { width: 1, height: 1, getContext: () => (cv.ctx ||= new FakeCtx()) }; canvases.push(cv); return cv; },
};
let glows = [];
window.pps = { stage: { steadyGlows: () => glows } };
const { organTest } = await import('../src/ui/credit.js');

const wr = { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 };
const screenOf = (rect, tf = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) => { const b = boxThrough(multiply(cam, tf), rect[0], rect[1], rect[0] + rect[2], rect[1] + rect[3]); return { l: b.l, t: b.t, r: b.r, b: b.b }; };
const overlap = (a, b, m = 0) => a.l - m < b.r && a.r + m > b.l && a.t - m < b.b && a.b + m > b.t;
const reset = () => { counts.shape = counts.readback = counts.style = 0; };

test('the first look reads each shape once and the grid back twice (organs, vessels); the art is found where it is', () => {
  reset();
  const art = organTest(wr);
  assert.equal(counts.shape, 2 * 3, 'matrix and box of each of the organ, the fluid and the vessel');
  assert.equal(counts.readback, 2, 'one read-back for the organs and the fluid, one for the vessels');
  const a = screenOf(organA.rect);
  assert.equal(art({ l: a.l + 20, t: a.t + 20, r: a.l + 120, b: a.t + 40 }, { pad: 0 }), true, 'on the organ');
  assert.equal(art({ l: 300, t: 450, r: 420, b: 470 }, { pad: 0 }), false, 'bare figure');
  assert.equal(art({ l: a.l + 20, t: a.t + 20, r: a.l + 120, b: a.t + 40 }, { pad: 0, org: false }), false, 'organs switched off');
  const v = screenOf(vessel.rect);
  assert.equal(art({ l: v.l + 1, t: v.t + 10, r: v.r + 1, b: v.t + 30 }, { pad: 0 }), true, 'on a vessel');
  assert.equal(art({ l: v.l + 1, t: v.t + 10, r: v.r + 1, b: v.t + 30 }, { pad: 0, ves: false }), false);
  const f = screenOf(fluid.rect);
  assert.equal(art({ l: f.l + 5, t: f.t + 5, r: f.l + 30, b: f.t + 20 }, { pad: 0 }), true, 'the ascites counts as organ art');
  assert.equal(art({ l: a.l - 14, t: a.t + 20, r: a.l - 2, b: a.t + 30 }, { pad: 18 }), true, 'padding reaches the organ');
  assert.equal(art({ l: a.l - 80, t: a.t + 20, r: a.l - 40, b: a.t + 30 }, { pad: 18 }), false);
});

test('a camera move that stays in the grid reads no shape and no pixel', () => {
  reset();
  for (const [e, f] of [[20, 10], [-80, -50], [140, 60], [0, 0]]) { cam = { ...cam, e, f }; organTest(wr); }
  assert.deepEqual({ ...counts }, { shape: 0, readback: 0, style: 0 });
  cam = { a: 1.4, b: 0, c: 0, d: 1.4, e: -30, f: -20 }; organTest(wr);   // (a zoom in: the cell is still no more than 6 px)
  assert.deepEqual({ ...counts }, { shape: 0, readback: 0, style: 0 });
  assert.ok(observers.every((o) => o.targets.every((t) => t === artGroup)), 'the watch is on the art groups, never the world, whose own transform is the camera');
});

test('past the grid (a far pan, a zoom beyond the cell) the grid is drawn again from the kept facts: pixels read, no shape', () => {
  reset();
  cam = { a: 1, b: 0, c: 0, d: 1, e: -2000, f: 40 }; organTest(wr);
  assert.equal(counts.readback, 2, 'a new grid');
  assert.equal(counts.shape + counts.style, 0, 'no page read');
  reset();
  cam = { a: 3, b: 0, c: 0, d: 3, e: 10, f: 10 }; organTest(wr);
  assert.equal(counts.readback, 2, 'a finer cell for the closer view');
  assert.equal(counts.shape + counts.style, 0);
});

test('the answer is the same wherever the camera is: conservative to the pixel grid, never far off it (pan, zoom, a quarter turn)', () => {
  const rects = [organA, fluid, vessel];
  let seed = 7, touching = 0, bare = 0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const c of [{ a: 1, b: 0, c: 0, d: 1, e: 50, f: 30 }, { a: 0.6, b: 0, c: 0, d: 0.6, e: 90, f: 20 }, { a: 2.2, b: 0, c: 0, d: 2.2, e: -300, f: -120 }, { a: 0, b: 1.1, c: -1.1, d: 0, e: 700, f: 20 }, { a: 0, b: 0.8, c: -0.8, d: 0, e: 600, f: 100 }]) {
    cam = c; organTest(wr);
    const art = organTest(wr);
    const truth = rects.map((s) => { const b = screenOf(s.rect), g = s.cs.strokeWidth * 0.7 / 2 * Math.hypot(c.a, c.b); return s === vessel ? { l: b.l - g, t: b.t - g, r: b.r + g, b: b.b + g } : b; });
    for (let n = 0; n < 600; n++) {
      const l = rnd() * 760, t = rnd() * 560, box = { l, t, r: l + 20 + rnd() * 160, b: t + 6 + rnd() * 30 }, pad = [0, 4, 8, 18][n % 4];
      const near = truth.some((b) => overlap({ l: box.l - pad, t: box.t - pad, r: box.r + pad, b: box.b + pad }, b));
      const far = truth.some((b) => overlap({ l: box.l - pad, t: box.t - pad, r: box.r + pad, b: box.b + pad }, b, 2 * CELL + 1));
      const got = art(box, { pad });
      touching += near ? 1 : 0; bare += far ? 0 : 1;
      if (near) assert.equal(got, true, `touching art, missed: ${JSON.stringify(box)} pad ${pad} camera ${JSON.stringify(c)}`);
      if (!far) assert.equal(got, false, `bare by 12 px, refused: ${JSON.stringify(box)} pad ${pad} camera ${JSON.stringify(c)}`);
    }
  }
  assert.ok(touching > 300 && bare > 300, `the sample has both kinds: ${touching} touching, ${bare} bare`);
  cam = { a: 1, b: 0, c: 0, d: 1, e: 50, f: 30 };
});

test('a change to a shape reads the page again; an overlay group changing does not matter; the facts go stale after 15 s', () => {
  organTest(wr);
  reset();
  const watching = observers.find((o) => o.targets.length);
  assert.ok(watching, 'the art groups are watched');
  assert.equal(watching.targets.length, 2, 'the two art groups, not the quiet one (overlays, guides, nodes)');
  watching.cb([{ type: 'attributes' }]);
  assert.deepEqual(watching.targets, [], 'the watch stops at the first change: a morph writes thousands of attributes');
  organA.rect = [100, 100, 40, 40];
  const art = organTest(wr);
  assert.equal(counts.shape, 2 * 3, 'every shape read again');
  const a = screenOf(organA.rect);
  assert.equal(art({ l: a.l + 5, t: a.t + 5, r: a.l + 30, b: a.t + 30 }, { pad: 0 }), true);
  assert.equal(art({ l: a.l + 120, t: a.t + 80, r: a.l + 150, b: a.t + 100 }, { pad: 0 }), false, 'the organ that was there is gone');
  reset();
  organTest(wr);
  assert.equal(counts.shape, 0, 'read again once, not at every look');
  const now = performance.now;
  try { performance.now = () => now.call(performance) + 16000; organTest(wr); } finally { performance.now = now; }
  assert.equal(counts.shape, 2 * 3, 'a safety net for any change no watch saw');
});

test("a lit vessel's glow counts as the vessel, and a changed glow draws the grid again without reading the page", () => {
  cam = { a: 1, b: 0, c: 0, d: 1, e: 50, f: 30 };
  organTest(wr); reset();
  const v = screenOf(vessel.rect), inside = { l: 480, t: v.t + 100, r: 488, b: v.t + 110 }, beyond = { l: 520, t: v.t + 100, r: 530, b: v.t + 110 };   // (the glow: the lumen's 40 and 12 world units a side, 64 across)
  assert.equal(organTest(wr)(inside, { pad: 0 }), false, 'no glow, no vessel there');
  glows = [['V1', 1]];
  const art = organTest(wr);
  assert.equal(art(inside, { pad: 0 }), true, 'inside the glow');
  assert.equal(art(beyond, { pad: 0 }), false, 'beyond it');
  assert.equal(counts.readback, 2, 'the grid drawn again for the new glow');
  assert.equal(counts.shape, 1, 'only the glowing vessel was read, for its hit stroke (its matrix)');
  glows = [];
  assert.equal(organTest(wr)(inside, { pad: 0 }), false, 'the glow gone');
});

test('the credit falls back to the screen grid in the lobule, with Lite graphics, and where a grid would be over the cap', () => {
  const src = readFileSync(new URL('../src/ui/credit.js', import.meta.url), 'utf8');
  assert.match(src, /export function organTest\(wr, ring = null, spread = null\) \{\n\s+if \(!ring\) \{ const t = worldTest\(wr, spread\); if \(t\) return t; \}\n\s+return screenTest\(wr, ring\);/);
  assert.match(src, /if \(!world\.closest\('\.stage-view'\)\?\.classList\.contains\('gl-on'\)\) \{ artDirty = true; artJob = null; return null; \}/);
  assert.match(src, /const reg = regionFor\(view, cellFor\(sc\), pad\);\n\s+if \(!reg\) return null;/);
});

test('spread over frames, the look answers PENDING, draws a slice a frame, and lands on the same grid one frame draws', async () => {
  const { PENDING } = await import('../src/ui/credit.js');
  const rafs = [];
  const raf0 = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (cb) => { rafs.push(cb); return rafs.length; };
  const now0 = performance.now;
  let clock = now0.call(performance);
  performance.now = () => (clock += 5);   // (every reading of the clock 5 ms on: a slice holds a shape or two)
  try {
    const sync = organTest(wr);
    const boxes = [screenOf(organA.rect), screenOf(fluid.rect), screenOf(vessel.rect), { l: 700, t: 500, r: 760, b: 560 }];
    for (const o of observers) o.cb([]);   // (the art changed: read again)
    let called = 0;
    assert.equal(organTest(wr, null, () => called++), PENDING);
    assert.equal(organTest(wr, null, () => called++), PENDING, 'one job at a time');
    let frames = 0;
    while (!called && frames < 50) { const q = rafs.splice(0); for (const cb of q) cb(clock); frames++; }
    assert.equal(called, 1, 'called back once its grid is in');
    assert.ok(frames > 2, `spread over ${frames} frames`);
    const art = organTest(wr, null, () => called++);
    assert.notEqual(art, PENDING);
    for (const b of boxes) for (const pad of [0, 4, 18]) assert.equal(art(b, { pad }), sync(b, { pad }), JSON.stringify([b, pad]));
    // (Taken for a while after, even with the art changed again: a breath would otherwise keep every look waiting.)
    for (const o of observers) o.cb([]);
    assert.notEqual(organTest(wr, null, () => called++), PENDING);
  } finally { performance.now = now0; globalThis.requestAnimationFrame = raf0; }
});
