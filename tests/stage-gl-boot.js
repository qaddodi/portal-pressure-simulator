// The real stage booted in node with its GPU labels on (label-gl.js in the figure's canvas), for tests that read what the GPU drew:
// the page's DOM (jsdom), the do-nothing WebGL2, Inter's outlines, a fixed 1200 × 800 stage (the stage box and its svg), the few label
// and leader styles the GPU reads, and Web Animations as far as label-gl follows them (one opacity fade: keyframes, timing, clock).
// The clock, timers and rAF are fixed: pump(ms) runs one frame. Not a *.test.js: imported by the tests that need it.
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
export const pump = (ms) => { const end = T + ms; runTimers(end); T = end; const run = ask; ask = []; for (const cb of run) cb(T); runTimers(T); };
export const now = () => T;
// (Between two frames: the rest passes, which run as message tasks.)
const tasks = () => new Promise((r) => setImmediate(r));

const CSS = '.lb text { fill: rgb(240, 240, 240); font-size: 12px; font-family: Inter; font-weight: 500; } .lb .lb-bg { fill: rgb(240, 240, 240); }'
  + ' .leader { fill: none; stroke: rgba(236, 228, 214, 0.42); stroke-width: 1px; } .leader-dot { fill: rgb(0, 0, 0); stroke: rgb(200, 200, 200); stroke-width: 1.3px; }'
  + ' .lb.lb-off { opacity: 0; } .lb-leaders > .ld-gone { opacity: 0; }';

// Web Animations, as label-gl reads them (label-track.js): el.animate(keyframes, timing) and el.getAnimations(), on the fixed clock.
function installAnimations(win) {
  const P = win.Element.prototype;
  P.animate = function (kf, o = {}) {
    const el = this, t0 = T, dur = o.duration || 0, delay = o.delay || 0, fill = o.fill || 'none', easing = o.easing || 'linear';
    const keys = kf.map((k, i) => ({ ...k, offset: k.offset ?? i / (kf.length - 1), computedOffset: k.offset ?? i / (kf.length - 1), easing: 'linear', composite: 'auto' }));
    const timing = { duration: dur, delay, fill, easing, iterations: 1, direction: 'normal', iterationStart: 0 };
    const a = {
      effect: { target: el, pseudoElement: null, composite: 'replace', getKeyframes: () => keys, getTiming: () => timing },
      playbackRate: 1, finished: Promise.resolve(),
      get playState() { return T - t0 >= delay + dur ? 'finished' : 'running'; },
      get currentTime() { return T - t0; },
      cancel() { el.__anims = el.__anims.filter((x) => x !== a); },
    };
    (el.__anims ||= []).push(a);
    return a;
  };
  const running = (el) => (el.__anims || []).filter((a) => a.playState !== 'finished' || /forwards|both/.test(a.effect.getTiming().fill));
  P.getAnimations = function (opt) { const out = running(this); if (opt?.subtree) for (const c of this.querySelectorAll('*')) out.push(...running(c)); return out; };
}

export async function bootGL() {
  await (await import('../src/ui/text-gl.js')).loadGlyphs();
  const glMod = await import('../scripts/warm/gl-stub.mjs');
  const { installPage } = await import('../scripts/warm/dom.mjs');
  const page = installPage();
  const win = page.dom.window, g = globalThis;
  { const s = page.document.createElement('style'); s.textContent = CSS; page.document.head.append(s); }
  installAnimations(win);
  globalThis.AbortController = win.AbortController;
  globalThis.WebGL2RenderingContext ??= function WebGL2RenderingContext() {};
  { const cs = win.getComputedStyle.bind(win); globalThis.getComputedStyle = (el, p) => cs(el, p); }   // (each read the page's as it is now)
  for (const k of ['dispatchEvent', 'addEventListener', 'removeEventListener']) if (!g[k]) g[k] = win[k].bind(win);
  const ctx2d = (canvas) => new Proxy({ canvas, measureText: (s) => ({ width: String(s).length * 7, actualBoundingBoxLeft: 0, actualBoundingBoxRight: String(s).length * 7, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 3, fontBoundingBoxAscent: 10, fontBoundingBoxDescent: 3 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }), createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }) },
  { get: (o, k) => (k in o ? o[k] : typeof k === 'symbol' ? undefined : () => (k.startsWith('create') ? { addColorStop() {} } : undefined)), set: (o, k, v) => { o[k] = v; return true; } });
  win.HTMLCanvasElement.prototype.getContext = function (type) {
    if (type === '2d') return (this.__2d ??= ctx2d(this));
    return type === 'webgl2' ? (this.__gl ??= glMod.makeGL(this)) : null;
  };
  const BOX = { x: 0, y: 0, left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 }, NONE = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  win.Element.prototype.getBoundingClientRect = function () { return this.id === 'stageView' || (this.tagName.toLowerCase() === 'svg' && this.parentElement?.id === 'stageView') ? BOX : NONE; };
  for (const [k, v] of [['clientWidth', 1200], ['clientHeight', 800], ['offsetWidth', 1200], ['offsetHeight', 800]]) Object.defineProperty(win.HTMLElement.prototype, k, { get() { return this.id === 'stageView' ? v : 0; }, configurable: true });
  const { createCore } = await import('../src/worker-core.js');
  const frames = [];
  const core = createCore((m) => { if (m.type === 'frame') frames.push(m); });
  core.handle({ type: 'init' }); core.handle({ type: 'run', running: true });
  for (let i = 0; i < 60; i++) pump(33);
  core.handle({ type: 'run', running: false });
  const { createStage } = await import('../src/ui/stage.js');
  const st = createStage({ wrap: page.document.getElementById('stageView'), onSelect() {}, onAction() {}, onOpenTab() {}, onHoverInfo() {}, onViewChange() {} });
  let fi = 0;
  // (One frame of the playing model: its next engine frame, 16.7 ms, the tasks between frames.)
  const frame = async () => { st.update(frames[fi++ % frames.length]); pump(16.7); await tasks(); await tasks(); };
  for (let i = 0; i < 120; i++) await frame();
  return { st, page, frame };
}
