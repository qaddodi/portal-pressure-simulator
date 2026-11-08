// Performance recs B1, the vitals panel: the monitor's rectangles and words (and the GPU instance data built from them) are made again only when
// something they show changes, not on every frame the strip scrolls. A frame that only scrolls the strip writes none of its lists, makes no
// version, builds no instance data and sends nothing to the GPU but the strip's points (the panel and words are drawn from the buffers as they are).
// No browser: the monitor against a recording drawer (the lists' versions and writes counted), and vitals-gl.js against a recording context.
import { test } from 'node:test';
import { CanvasObserver } from './canvas-observer.js';
import assert from 'node:assert/strict';
import './dom-shim.js';

let now = 1000, queue = [];
performance.now = () => now;
globalThis.requestAnimationFrame = (fn) => { queue.push(fn); return queue.length; };
globalThis.cancelAnimationFrame = () => {};
globalThis.window.devicePixelRatio = 1;
const TOKENS = { '--mon-bg': '#050608', '--mon-text': '#9aa4ad', '--mon-bright': '#7cf08c', '--mon-alarm': '#ff5a4d', '--mon-grid': '#1c232a' };
globalThis.getComputedStyle = () => ({ fontSize: '14px', getPropertyValue: (n) => TOKENS[n] ?? '#808080' });
class Node {
  constructor(tag) {
    this.tag = tag; this.nodeType = 1; this.attrs = {}; this.kids = []; this.style = { setProperty() {} }; this.dataset = {}; this.className = '';
    this.isConnected = true; this.width = 0; this.height = 0; this.offsetWidth = 400; this.offsetParent = {}; this.rec = {};
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  append(...k) { for (const c of k) this.kids.push(c); }
  appendChild(c) { this.kids.push(c); return c; }
  replaceChildren(...k) { this.kids = [...k]; }
  addEventListener() {}
  removeEventListener() {}
  querySelectorAll() { return []; }
  querySelector() { return null; }
  closest() { return null; }
  getBoundingClientRect() { return { width: 420, height: 200, left: 0, top: 0 }; }
  getContext() { return null; }
  remove() {}
}
globalThis.document.createElement = (tag) => new Node(tag);
globalThis.document.createTextNode = (s) => ({ nodeType: 3, text: String(s) });
globalThis.document.hidden = false;
globalThis.document.documentElement = new Node('html');
globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe() { queueMicrotask(() => this.cb([{ isIntersecting: true }])); } disconnect() {} };
globalThis.ResizeObserver = CanvasObserver;
const { createVitalsMonitor } = await import('../src/ui/vitals-monitor.js');
await Promise.resolve();

const canvasOf = (el) => el.kids.find((k) => k.tag === 'canvas');
// A drawer that writes down each draw's version and strip, and can freeze the lists it is handed: a write to a frozen entry throws.
function keptGL(cv) {
  const rec = cv.rec;
  rec.draws = 0; rec.vers = []; rec.n = []; rec.strips = []; rec.texts = []; rec.rects = [];
  return {
    lost: false,
    draw(D) {
      rec.draws++; rec.vers.push(D.ver); rec.n.push([D.rects.length, D.texts.length]);
      rec.strips.push(D.line ? Array.from(D.line.pts.subarray(0, D.line.n * 2)).join() : '');
      rec.texts = D.texts.map((t) => t.slice()); rec.rects = D.rects.map((r) => r.slice());
      if (rec.freeze) { for (const e of D.texts) Object.freeze(e); for (const e of D.rects) Object.freeze(e); }
      return true;
    },
    dispose() {},
  };
}
const frameOf = (hr, map, t0) => {
  const t = [], ph = [];
  for (let k = 0; k < 8; k++) { const x = t0 + k * 0.004; t.push(x); ph.push((x * hr / 60) % 1); }
  return { running: true, clock: 'hemo', speed: 1, morphing: false, metrics: { hr, map, co: 6 }, phase: ph[7], samples: { t, ph } };
};
function monitor() {
  const v = createVitalsMonitor({ makeGL: keptGL });
  v.configure({ kind: 'vitals', show: ['hr', 'map', 'co'] });
  const cv = canvasOf(v.el);
  let t = 10;
  const step = (hr = 70, map = 80, n = 1) => { for (let i = 0; i < n; i++) { now += 17; v.update(frameOf(hr, map, t)); t += 0.032; const q = queue; queue = []; for (const fn of q) fn(now); } };
  return { v, cv, step };
}

test('frames that only scroll the strip keep the lists and their version; a changed number, flag or size makes a new one', () => {
  const { v, cv, step } = monitor();
  step(70, 80, 30);   // (the first readings, eased in)
  const rec = cv.rec, base = rec.vers.length;
  step(70, 80, 40);
  const same = rec.vers.slice(base);
  assert.ok(same.length >= 40, `${same.length} draws`);
  assert.ok(same.every((x) => x === same[0]), `the version holds through ${same.length} draws that only scroll the strip`);
  assert.ok(new Set(rec.strips.slice(base)).size > 20, 'and the strip did move');
  const v0 = same[0];
  step(130, 80, 3);   // (a new heart rate: the printed number changes as it eases)
  assert.ok(rec.vers.at(-1) > v0, 'a changed reading is a new version');
  step(130, 80, 120);
  const v1 = rec.vers.at(-1);
  step(130, 80, 30);
  assert.equal(rec.vers.at(-1), v1, 'and holds again once the reading has settled');
  step(130, 40, 120);   // (a pressure past its cut-off turns its patch on)
  assert.ok(rec.vers.at(-1) > v1 && rec.rects.length > 2, `the alarm patch is drawn: ${rec.rects.length} rectangles`);
  v.dispose();
});

test('a held frame writes none of the lists, and the lists a changed frame leaves are the ones a fresh monitor writes', () => {
  const { v, cv, step } = monitor();
  step(70, 80, 40);
  cv.rec.freeze = true;   // (every rectangle and word is frozen from here: a write to one throws)
  assert.doesNotThrow(() => step(70, 80, 40), 'a frame that changes nothing rewrites no rectangle or word');
  v.dispose();
  // The same final state reached by changes and reached at once: the same lists.
  const a = monitor(), b = monitor();
  for (const m of [a, b]) { m.v.pin({ map: 62, hr: 131, co: 4.1, hb: 9.2, ra: 4 }); m.v.update({ ...frameOf(131, 62, 10), running: false }); }
  a.v.pin({ map: 80, hr: 70, co: 6, hb: 12, ra: 4 }); a.v.pin({ map: 62, hr: 131, co: 4.1, hb: 9.2, ra: 4 });
  b.v.pin({ map: 62, hr: 131, co: 4.1, hb: 9.2, ra: 4 });
  assert.deepEqual(a.cv.rec.texts, b.cv.rec.texts);
  assert.deepEqual(a.cv.rec.rects, b.cv.rec.rects);
  a.v.dispose(); b.v.dispose();
});

// ── vitals-gl.js against a recording context: what is built and sent a frame ──
test('the GPU drawer sends the rectangles and glyphs only when the version changes, and draws them every frame', async () => {
  globalThis.WebGL2RenderingContext ??= class {};
  const { createVitalsGL } = await import('../src/ui/vitals-gl.js');
  const calls = { sub: [], data: 0, draws: [] };
  let cur = null;
  const gl = new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'isContextLost') return () => false;
      if (k === 'getExtension') return () => null;
      if (k === 'getProgramParameter') return () => true;
      if (k === 'bufferSubData') return (target, off, data) => { calls.sub.push([cur, data.length]); };
      if (k === 'bufferData') return () => { calls.data++; };
      if (k === 'bindBuffer') return (target, b) => { cur = b; };
      if (k === 'createBuffer') return () => ({ id: ++t.nb });
      if (k === 'drawArraysInstanced') return (mode, first, n, inst) => { calls.draws.push(inst); };
      if (k === 'getUniformLocation') return () => ({});
      if (typeof k === 'string' && /^[A-Z_0-9]+$/.test(k)) return 1;
      return () => ({});
    },
  });
  gl.nb = 0;
  let under = null, pageGL = gl;
  const fakePen = (host, o) => { under = o.under; return { gen: 0, atlas: {}, lost: false, glNow: () => pageGL, begin: () => true, end: () => { under(pageGL); return true; }, dispose() {} }; };
  const r = createVitalsGL({}, { makePen: fakePen });
  assert.ok(r, 'a drawer is made');
  const col = [0.2, 0.3, 0.4, 1];
  const S = { W: 840, H: 400, dpr: 2, ver: 1, rects: [[0, 0, 420, 200, 12, col], [14, 80, 392, 1, 0, col]], texts: [['EKG', 600, 12, 14, 25, col], ['HR', 600, 12, 14, 110, col], ['72', 700, 44, 30, 160, col]], line: null };
  const strip = (n) => ({ pts: new Float32Array(2 * n), n, half: 1.6, col, clip: [0, 0, 100, 100] });
  const frame = (o) => { calls.sub.length = 0; calls.draws.length = 0; assert.equal(r.draw({ ...S, ...o }), true); return { sub: calls.sub.map((c) => c[1]), draws: [...calls.draws] }; };
  const first = frame({ line: strip(40) });
  assert.equal(first.sub.length, 3, `rectangles, strip and glyphs sent the first time: ${first.sub}`);
  assert.deepEqual(first.draws, [2, 39, 7], 'two rectangles, 39 strip segments, 7 glyphs');
  for (let i = 0; i < 5; i++) {
    const again = frame({ line: strip(41 + i) });
    assert.deepEqual(again.sub, [2 * (41 + i)], `a held version sends only the strip's points: ${again.sub}`);
    assert.deepEqual(again.draws, [2, 40 + i, 7], 'and still draws the rectangles and glyphs');
  }
  const newer = frame({ ver: 2, texts: [...S.texts.slice(0, 2), ['73', 700, 44, 30, 160, col]], line: strip(40) });
  assert.equal(newer.sub.length, 3, `a new version sends the rectangles, the strip and the glyphs once: ${newer.sub}`);
  const rects = frame({ ver: 3, rects: [...S.rects, [10, 10, 20, 20, 5, col]], line: strip(40) });
  assert.deepEqual(rects.draws, [3, 39, 7], 'and draws what the new version lists');
  const bare = frame({ ver: undefined, line: strip(40) });
  assert.equal(bare.sub.length, 3, 'a caller with no version is built every time');
  assert.equal(frame({ ver: undefined, line: strip(40) }).sub.length, 3);
  // A context made again holds none of it: sent afresh.
  pageGL = new Proxy(gl, {});
  const fresh = frame({ ver: 3, rects: [...S.rects, [10, 10, 20, 20, 5, col]], line: strip(40) });
  assert.equal(fresh.sub.length, 3, 'a new context is sent everything');
  r.dispose();
});
