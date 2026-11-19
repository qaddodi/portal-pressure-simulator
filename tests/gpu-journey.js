// The page walked along the paths a learner takes, with the GPU budget's own registry reading what a phone would hold (18 Nov 2026: the iPhone's tab was killed on the
// HVPG deck's slide 5 to 6 and on the Tests card's IR pane to Doppler, and nothing in the node checks saw either: they counted what was left after a visit, never what a
// visit asked for on top of what the page already held).
//
// What it boots: the real stage on a phone-sized screen (tests/stage-gl-boot.js) AND the real Tests card (the dock with its panes) and structure card, in the one page,
// on a WebGL stand-in that the budget registry (src/ui/gpu-budget.js, fed by gl-state.js) counts as a browser's context: so `memoryMB()` reads what the page's real
// accounting reads, canvases and textures and targets, and `holdersNow()` the warm and retained holders it may give back. Charts draw in the shared pool as in a browser
// (an OffscreenCanvas stand-in), so the context count is the page's own and not one per chart.
//
// What it says: the most the registry read while a path was walked (sampled every frame), the contexts live, the registry's unmet pressure (what no holder could give back).
// What it cannot say: what a real driver adds on top (alignment, mip chains it was not asked for), the JS heap, the compositor's layers; so a path must stay under the
// phone's envelope with room to spare, not just under it (tests/gpu-journeys.test.js says how much). Not a *.test.js: imported by tests/gpu-journeys.test.js.
import './gl-live.js';

const W2 = globalThis.WebGL2RenderingContext = class WebGL2RenderingContext {};
const track = globalThis.__glTrack;
// (every stand-in context a WebGL2RenderingContext as gl-state.js asks: the registry then counts it)
globalThis.__glTrack = (gl) => { const P = Object.getPrototypeOf(gl); if (Object.getPrototypeOf(P) !== W2.prototype) Object.setPrototypeOf(P, W2.prototype); track(gl); };

const PHONE = { w: 440, h: 894, dpr: 3 };   // (the screen of the iPhone whose bug packet read 304.8 MB of the 320 MB envelope on HVPG slide 6, 19 Nov 2026)
globalThis.screen = { width: PHONE.w, height: PHONE.h };


let rig = null;
export async function journeyRig() {
  if (rig) return rig;
  const { bootGL, pump } = await import('./stage-gl-boot.js');
  const glMod = await import('../scripts/warm/gl-stub.mjs');
  // (The charts' shared pool: an OffscreenCanvas with a context and transferToImageBitmap, and a bitmaprenderer context on each chart's own canvas.)
  globalThis.OffscreenCanvas = class OffscreenCanvas {
    constructor(w, h) { this.width = w; this.height = h; this.__l = {}; }
    getContext(t) { return t === 'webgl2' ? (this.__gl ??= glMod.makeGL(this)) : null; }
    transferToImageBitmap() { return { close() {} }; }
    addEventListener(n, f) { (this.__l[n] ||= []).push(f); }
    removeEventListener() {}
  };
  const { st, page, frame } = await bootGL({ ...PHONE, coarse: true, labels: 'all' });
  const win = page.dom.window;
  const get = win.HTMLCanvasElement.prototype.getContext;
  win.HTMLCanvasElement.prototype.getContext = function (type, ...a) { return type === 'bitmaprenderer' ? (this.__br ??= { canvas: this, transferFromImageBitmap() {} }) : get.call(this, type, ...a); };
  // (jsdom has no layout: a chart in the Tests card has no box and so draws nothing and asks the GPU for nothing. Everything inside the card's body is given the phone card's
  // box, 359 × 230 CSS px, so the charts size and draw as they do on the phone: the pool's buffer grows to the largest of them, and the Doppler's ring and lines are made.)
  const inCard = (el) => !!el.closest?.('#dockBody, .dock-pane');
  const rect = win.Element.prototype.getBoundingClientRect;
  win.Element.prototype.getBoundingClientRect = function () { return inCard(this) ? { x: 18, y: 600, left: 18, top: 600, right: 377, bottom: 830, width: 359, height: 230 } : rect.call(this); };
  for (const [k, v] of [['clientWidth', 359], ['clientHeight', 230], ['offsetWidth', 359], ['offsetHeight', 230]]) {
    const d = Object.getOwnPropertyDescriptor(win.HTMLElement.prototype, k), old = d.get;
    Object.defineProperty(win.HTMLElement.prototype, k, { get() { return inCard(this) ? v : old.call(this); }, configurable: true });
  }
  const none = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  win.Range.prototype.getBoundingClientRect ??= () => ({ ...none, width: 60, height: 14, right: 60, bottom: 14 });
  win.Range.prototype.getClientRects ??= () => [];
  const { store, setViewKey } = await import('../src/ui/store.js');
  const budget = await import('../src/ui/gpu-budget.js');
  const { snapshotLive } = await import('./gl-live.js');
  const { createCore } = await import('../src/worker-core.js');
  const { createDock } = await import('../src/ui/dock.js');
  const { createDoppler } = await import('../src/ui/doppler.js');
  const { createFibroScan } = await import('../src/ui/fibroscan.js');
  const { createTrialsPane } = await import('../src/ui/trials-pane.js');
  const noop = () => {};
  const frames = [];
  const core = createCore((m) => { if (m.type === 'frame') frames.push(m); });
  core.handle({ type: 'visibility', visible: true });
  await core.handle({ type: 'run', running: false });
  await core.handle({ type: 'preset', id: 'cirr-decomp' });
  const tasks = () => new Promise((r) => setImmediate(r));
  for (let i = 0; i < 6; i++) { pump(16.7); await tasks(); }
  const f0 = frames.at(-1);
  store.set({ presetId: 'cirr-decomp', params: core.engine().paramsTarget(), frame: f0 });
  const lazyOf = (inst) => ({ now: () => inst, get: () => Promise.resolve(inst) });
  const dock = createDock({ strip: document.getElementById('strip'), head: document.getElementById('dockHead'), body: document.getElementById('dockBody'), onWhy: noop, onAction: noop, onProbe: noop,
    lazy: { doppler: lazyOf(createDoppler({ onProbe: noop })), fibroscan: lazyOf(createFibroScan()), trials: lazyOf(createTrialsPane()) },
    onReveal: noop, onLobule: noop, onOpen: noop, onClose: noop, onLayout: noop, isVisible: () => true, marks: () => [], onBeat: noop, onFromReadings: noop });

  let peak = 0, peakAt = '', where = '', unmetMax = 0;
  const sample = () => {
    budget.enforce();
    const mb = budget.memoryMB();
    if (mb > peak) { peak = mb; peakAt = where; }
    const u = budget.holdersNow().unmetMB; if (u > unmetMax) unmetMax = u;
  };
  /** n frames of the page: the stage and the dock fed the model's frame, the registry read after each. */
  const run = async (n, at = where) => {
    where = at;
    for (let i = 0; i < n; i++) {
      const f = frames.at(-1); if (f) { store.setFrame(f); dock.update(f, i % 4 === 0); st.update(f); }
      pump(16.7); await tasks(); sample();
    }
  };
  rig = {
    st, dock, store, setViewKey, budget, run, core,
    /** The Tests card's pane named (a dock pane id), shown as the learner taps it. */
    async pane(id, n = 80) { dock.show(id, { reveal: true }); await run(n, `pane ${id}`); },
    /** A view of the figure as the learner taps it. */
    async view(key, n = 220) { setViewKey(key); await run(n, `view ${key}`); },
    /** Starts a path: the registry's peak is read from here on. */
    start() { peak = budget.memoryMB(); peakAt = 'start'; unmetMax = 0; },
    report() { const s = snapshotLive(), c = budget.contextCount(); return { peakMB: +peak.toFixed(1), peakAt, nowMB: +budget.memoryMB().toFixed(1), unmetMB: unmetMax, ownContexts: c.own, chartContexts: c.charts, objects: s.texture + s.framebuffer + s.renderbuffer, owners: budget.budget().owners.filter((o) => o.mb >= 5).map((o) => `${o.owner} ${o.mb}`), holders: budget.holdersNow().list.filter((h) => h.mb > 1).map((h) => `${h.owner}/${h.kind} ${h.mb} MB`) }; },
    envelopeMB: budget.ENVELOPES.phone.mb,
  };
  return rig;
}
