// Heat, 26 Oct (steps 2 and 10): every surface draws at most once in a frame, and a closed one does no more work. The scheduler's
// phases, the vitals monitor's strip and numbers (one loop, never a second frame of their own while it scrolls), and the instruments
// a presentation lets go of (no frame, timer or observer left running).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './dom-shim.js';
import { createCore } from '../src/worker-core.js';

let frameQueue = [];
globalThis.requestAnimationFrame = (fn) => { frameQueue.push(fn); return frameQueue.length; };
globalThis.cancelAnimationFrame = () => {};
globalThis.window.devicePixelRatio = 2;
globalThis.getComputedStyle = () => ({ fontSize: '14px', getPropertyValue: () => '#808080' });
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// A context that accepts every call and property and writes down the words and the colours it was given.
function fakeCtx(log) {
  const state = {};
  const fns = {
    fillText: (s, x, y) => { log.texts.push({ s: String(s), x, y, font: state.font, fill: state.fillStyle }); if (!(Number.isFinite(x) && Number.isFinite(y))) log.bad.push(`fillText ${s} at ${x},${y}`); },
    strokeText: () => {},
    measureText: (s) => ({ width: String(s).length * 7 }),
    createLinearGradient: () => { log.gradients++; return { addColorStop() {} }; },
  };
  const num = (a) => a.every((v) => typeof v !== 'number' || Number.isFinite(v));
  return new Proxy(state, {
    get(t, k) {
      if (k in fns) return fns[k];
      if (k in t) return t[k];
      return (...a) => { if (!num(a)) log.bad.push(`${String(k)}(${a.join(',')})`); log.calls++; };
    },
    set(t, k, v) { t[k] = v; if (k === 'font') log.fonts.push(v); return true; },
  });
}

class Node {
  constructor(tag) {
    this.tag = tag; this.nodeType = 1; this.attrs = {}; this.kids = []; this.style = { setProperty() {} }; this.dataset = {}; this.className = '';
    this.isConnected = true; this.width = 0; this.height = 0; this.offsetWidth = 400; this.offsetParent = {}; this.parent = null; this.slide = false;
    this.log = { texts: [], fonts: [], bad: [], calls: 0, gradients: 0 };
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  append(...k) { for (const c of k) { this.kids.push(c); if (c && typeof c === 'object') c.parent = this; } }
  appendChild(c) { this.append(c); return c; }
  replaceChildren(...k) { this.kids = []; this.append(...k); }
  addEventListener() {}
  removeEventListener() {}
  querySelectorAll() { return []; }
  querySelector() { return null; }
  closest(sel) { for (let n = this; n; n = n.parent) if (n.slide && sel.includes('.pz-tool')) return n; return null; }
  getBoundingClientRect() { return { width: this.bw ?? 400, height: this.bh ?? 220, left: 0, top: 0 }; }
  getContext() { return (this.ctx ??= fakeCtx(this.log)); }
  remove() {}
}
globalThis.document.createElement = (tag) => new Node(tag);
globalThis.document.createTextNode = (s) => ({ nodeType: 3, text: String(s) });
globalThis.document.hidden = false;
globalThis.document.documentElement = new Node('html');
// (a browser reports an observed box a moment later, never inside observe())
globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe() { queueMicrotask(() => this.cb([{ isIntersecting: true }])); } disconnect() {} };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };

const runFrames = (now = performance.now()) => { const q = frameQueue; frameQueue = []; for (const fn of q) fn(now); };
const canvasOf = (el) => el.kids.find((k) => k.tag === 'canvas') || (function find(n) { for (const k of n.kids || []) { if (k.tag === 'canvas') return k; const r = find(k); if (r) return r; } return null; })(el);


const { frame, lateFrame, finalFrame, cancelFrame, framePhase } = await import('../src/ui/frame.js');

test('the scheduler runs a frame\'s early, late and final callbacks in that order, and says which part is running', () => {
  const seen = [];
  finalFrame(() => seen.push(['final', framePhase()]));
  lateFrame(() => { seen.push(['late', framePhase()]); finalFrame(() => seen.push(['final, asked late', framePhase()])); });
  frame(() => { seen.push(['early', framePhase()]); lateFrame(() => seen.push(['late, asked early', framePhase()])); });
  const gone = finalFrame(() => seen.push(['cancelled']));
  cancelFrame(gone);
  assert.equal(framePhase(), null, 'outside a frame');
  runFrames(16);
  assert.deepEqual(seen, [['early', 'early'], ['late', 'late'], ['late, asked early', 'late'], ['final', 'final'], ['final, asked late', 'final']]);
  // (One asked for while the final ones run waits for the next frame, as with requestAnimationFrame.)
  seen.length = 0;
  finalFrame(() => { seen.push('a'); finalFrame(() => seen.push('b')); });
  runFrames(32);
  assert.deepEqual(seen, ['a']);
  runFrames(48);
  assert.deepEqual(seen, ['a', 'b']);
});

async function modelFrames(preset) {
  const out = [];
  const core = createCore((m) => { if (m.type === 'frame' && m.samples?.t.length) out.push(m); });
  await core.handle({ type: 'preset', id: preset });
  core.handle({ type: 'run', running: true });
  const t0 = Date.now();
  while (Date.now() - t0 < 3000 && out.length < 8) await new Promise((r) => setTimeout(r, 40));
  core.dispose();
  return out;
}
const healthy = await modelFrames('healthy');
const { createVitalsMonitor } = await import('../src/ui/vitals-monitor.js');

test('the vitals monitor draws its strip once a frame while it scrolls, its easing numbers included, and stops when let go', async () => {
  const v = createVitalsMonitor();
  const cv = canvasOf(v.el);
  cv.bw = 420; cv.bh = 200;
  await new Promise((r) => queueMicrotask(r));   // (on screen)
  v.update({ ...healthy[0], running: true, speed: 1 });
  // A new reading far from the one shown: the numbers ease over the next frames while the strip scrolls.
  const strips = () => cv.log.texts.filter((t) => t.s === 'EKG').length;
  let now = 1000;
  for (let i = 1; i < healthy.length; i++) {
    const f = healthy[i];
    v.update({ ...f, running: true, speed: 1, metrics: { ...f.metrics, hr: f.metrics.hr + (i % 2 ? 30 : -30) } });
    const before = strips();
    runFrames(now += 16);
    assert.ok(strips() - before <= 1, `frame ${i}: drawn ${strips() - before} times`);
  }
  assert.ok(frameQueue.length > 0, 'still scrolling');
  v.dispose();
  const before = strips();
  for (let i = 0; i < 5; i++) runFrames(now += 16);
  assert.equal(frameQueue.length, 0, 'no frame asked for once let go');
  assert.equal(strips(), before, 'nothing drawn once let go');
});

test('the endoscope\'s field is drawn once a frame: a model frame taken in early is drawn by its own late callback', () => {
  const src = read('../src/ui/instruments.js');
  assert.match(src, /const drawFrame = lateFrameFor\('instruments'\);/);
  assert.match(src, /if \(framePhase\(\) === 'early'\) \{ last = \{ f, vx \}; if \(!raf\) raf = drawFrame\(\(\) => \{ raf = 0; if \(last\) draw\(last\.f, last\.vx\); \}\); return; \}\n\s+draw\(f, vx\);/);
  assert.doesNotMatch(src.slice(src.indexOf('export function createEndoscopy'), src.indexOf('export function createVarixWall')), /nextFrame\(/, 'every follow-up draw on the same late callback');
});

test('the figure\'s pass is one owned request, whoever asks for it', () => {
  const st = read('../src/ui/stage.js');
  assert.match(st, /const askAnimate = \(\) => \{ if \(!animRaf\) animRaf = drawFrame\(animate\); \};\n\s+function animate\(now\) \{\n\s+animRaf = 0;/);
  assert.equal((st.match(/drawFrame\(animate\)/g) || []).length, 1, 'asked for only through askAnimate');
});

test('a presentation\'s instruments let go of their frames and observers', () => {
  const fib = read('../src/ui/fibroscan.js');
  assert.match(fib, /function dispose\(\) \{ gone = true; running = false; cancelFrame\(raf\); raf = 0; io\?\.disconnect\(\); offRun\(\); \}/);
  assert.match(fib, /if \(gone \|\| !onScreen\(\) \|\| document\.hidden\) \{ running = false; return; \}/);
  assert.match(read('../src/ui/pressure-time.js'), /io\?\.disconnect\(\); cancelFrame\(tickRaf\); tickRaf = 0; ticking = false; frame = null;/);
  assert.match(read('../src/ui/flow-time.js'), /dispose\(\) \{ cancelFrame\(raf\); raf = 0; ro\?\.disconnect\(\); \},/);
  assert.match(read('../src/ui/talk-trace.js'), /dispose\(\) \{ ro\?\.disconnect\(\); \}/);
  const tools = read('../src/ui/presenter-tools.js');
  assert.match(tools, /offFrame\(\); ro\?\.disconnect\(\); cancelFrame\(svkRaf\); svkRaf = 0;\n\s+for \(const k of Object\.keys\(made\)\) \{ made\[k\]\?\.dispose\?\.\(\); delete made\[k\]; \}/);
});
