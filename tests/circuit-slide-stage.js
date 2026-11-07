// The real stage booted in node (as scripts/stage-trace.mjs and label-presolve-interleave.test.js do) at a given screen size, on a fixed
// clock, presenting a Circuit slide the way the presenter does: the card's room on the left (--pz-l and the free area between it and the
// right edge), the circuit view, the slide's resistors and its PPG bracket, and the slide's framing (cam-frame.js CIRC_REGIONS). Then
// what the labels' last layout showed, in stage px, against the vessels as the labels see them (labelVessels: each line's segments with
// its half width, the resistors' zigzags as bands) and the stations' rings. Each test file boots one stage (one process each).

let T = 1000;
const timers = new Map();
let tid = 1, order = 0;
const addTimer = (fn, ms, every, args) => { const id = tid++; timers.set(id, { fn, at: T + Math.max(0, ms || 0), every, args, o: order++ }); return id; };
let ask = [];
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

/** Boot a W×H stage presenting a Circuit slide framed on `cam` with a card `cardR` px wide on the left; returns { st, run }. */
export async function bootCircuitSlide({ W, H, cardR, cam = 'gutLiver', sites = ['rLiver', 'rColl'] }) {
  Object.defineProperty(performance, 'now', { value: () => T, configurable: true });
  Date.now = () => 1.7e12 + T;
  let seed = 12345;
  Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  globalThis.setTimeout = (fn, ms, ...a) => addTimer(fn, ms, 0, a);
  globalThis.setInterval = (fn, ms, ...a) => addTimer(fn, ms, Math.max(1, ms || 1), a);
  globalThis.clearTimeout = globalThis.clearInterval = (id) => { timers.delete(id); };
  globalThis.requestAnimationFrame = (cb) => { ask.push(cb); return ask.length; };
  globalThis.cancelAnimationFrame = () => {};
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
  // (The stage and its svg fill the box: the camera's sums read both.)
  const isStage = (el) => el.id === 'stageView' || (el.tagName?.toLowerCase() === 'svg' && el.parentElement?.id === 'stageView');
  const BOX = { x: 0, y: 0, left: 0, top: 0, right: W, bottom: H, width: W, height: H }, NONE = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  win.Element.prototype.getBoundingClientRect = function () { return isStage(this) ? BOX : NONE; };
  for (const [k, v] of [['clientWidth', W], ['clientHeight', H], ['offsetWidth', W], ['offsetHeight', H]]) for (const P of [win.HTMLElement.prototype, win.Element.prototype]) Object.defineProperty(P, k, { get() { return isStage(this) ? v : 0; }, configurable: true });
  for (const [k, v] of [['innerWidth', W], ['innerHeight', H]]) { Object.defineProperty(win, k, { value: v, configurable: true }); Object.defineProperty(globalThis, k, { value: v, configurable: true }); }
  const { createCore } = await import('../src/worker-core.js');
  const frames = [];
  const core = createCore((m) => { if (m.type === 'frame') frames.push(m); });
  core.handle({ type: 'init' }); core.handle({ type: 'run', running: true });
  for (let i = 0; i < 60; i++) pump(33);
  core.handle({ type: 'run', running: false });
  const { store } = await import('../src/ui/store.js');
  const { createStage } = await import('../src/ui/stage.js');
  const { CIRC_REGIONS } = await import('../src/ui/cam-frame.js');
  const st = createStage({ wrap: page.document.getElementById('stageView'), onSelect() {}, onAction() {}, onOpenTab() {}, onHoverInfo() {}, onViewChange() {} });
  let fi = 0;
  const run = (n) => { for (let i = 0; i < n; i++) { st.update(frames[fi++ % frames.length]); pump(16.7); } };
  run(120);
  const last = frames[frames.length - 1];
  store.set({ healthy: { P: last.P, Q: last.Q } });   // (the resistors read against it: resRatio)
  page.document.getElementById('app')?.style.setProperty('--pz-l', cardR + 'px');
  store.set({ presenting: true, presentLabels: [] });
  st.setFreeArea(() => [{ l: cardR, t: 0, r: W, b: H - 80, pref: true }]);
  st.setView('circuit'); run(150);
  st.setSites(sites, null);
  st.callouts({ spans: [{ from: 'CONF', to: 'IVCS', runs: [{ t: 'PPG 5.7 mmHg' }] }] });
  st.frameBox(CIRC_REGIONS[cam], 1300, 3.2, false, {}); run(200);
  return { st, run };
}

// The distance from a box to a segment's middle line, less its half width: below zero the box is on the line.
function boxSegGap(b, [x0, y0, x1, y1, hw]) {
  const pd = (px, py) => { const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L2)); return Math.hypot(px - x0 - dx * t, py - y0 - dy * t); };
  const bd = (px, py) => Math.hypot(Math.max(b[0] - px, 0, px - b[2]), Math.max(b[1] - py, 0, py - b[3]));
  const crosses = (() => {   // (the segment through the box)
    for (let u = 0; u <= 1; u += 1 / 64) { const px = x0 + (x1 - x0) * u, py = y0 + (y1 - y0) * u; if (px >= b[0] && px <= b[2] && py >= b[1] && py <= b[3]) return true; }
    return false;
  })();
  if (crosses) return -hw;
  return Math.min(bd(x0, y0), bd(x1, y1), pd(b[0], b[1]), pd(b[2], b[1]), pd(b[0], b[3]), pd(b[2], b[3])) - hw;
}

/** Each label the last layout showed whose key matches `re`, with the vessels (and zigzags) its box comes within `air` px of, and the station rings it covers. */
export function labelFaults(st, re, air = 0) {
  const L = st.labelLaid(), V = st.labelVessels();
  return L.items.filter((it) => re.test(it.key)).map((it) => ({
    key: it.key, box: it.box.map((v) => Math.round(v)),
    vessels: [...new Set(V.segs.filter((sg) => boxSegGap(it.box, sg) < air).map((sg) => sg[5]))],
    rings: L.rings.filter(([x, y]) => x > it.box[0] - 4 && x < it.box[2] + 4 && y > it.box[1] - 4 && y < it.box[3] + 4),
  }));
}
