// The cases of the warm-frame harness (scripts/warm-alloc.mjs): each is a frame function the page runs every frame, set up with what it
// needs in node. A case returns `frame(i)`, called thousands of times; the harness measures what it allocates once V8 has compiled it.
import { installDomStub } from './dom-stub.mjs';

// (A case that needs the page's DOM asks for it: the real one in jsdom with a GL context that does nothing and SVG geometry from the app's own
// script, or the light stand-in. Never both, and not for a case that touches no DOM.)
let page = null;
const withPage = async () => (page ??= (await import('./dom.mjs')).installPage());
let T = 1000, fake = false;
const realNow = performance.now.bind(performance);
Object.defineProperty(performance, 'now', { value: () => (fake ? T : realNow()), configurable: true });   // (a clock the cases move once the engine's frames are recorded, so a frame is the same on every run)
export const tick = (ms) => { T += ms; };

// Frames of the real engine (worker-core.js), recorded once; a case replays them with the clock moved on.
async function recordFrames(seconds) {
  const was = fake;
  fake = false;   // (the engine steps by the real clock)
  const { createCore } = await import('../../src/worker-core.js');
  const frames = [];
  const core = createCore((m) => { if (m.type === 'frame') frames.push(m); });
  core.handle({ type: 'init' });
  core.handle({ type: 'run', running: true });
  await new Promise((r) => setTimeout(r, seconds * 1000));
  core.handle({ type: 'run', running: false });
  core.dispose?.();
  fake = was;
  return frames;
}
// `n` frames made from the recorded ones, each with its samples' times (and the frame's) shifted on, built here before anything is measured.
function replay(recorded, n) {
  recorded = recorded.filter((f) => f.samples?.t?.length);
  const out = [];
  const span = recorded.reduce((a, f) => a + (f.samples?.t?.length || 0), 0);
  const dt = (recorded.at(-1).samples.t.at(-1) - recorded[0].samples.t[0]) + 0.004;
  for (let i = 0; i < n; i++) {
    const src = recorded[i % recorded.length], cycle = Math.floor(i / recorded.length), shift = cycle * dt;
    const s = src.samples;
    let samples = null;
    if (s) {
      samples = {};
      for (const k of Object.keys(s)) { const a = Float64Array.from(s[k]); if (k === 't') for (let j = 0; j < a.length; j++) a[j] += shift; samples[k] = a; }
    }
    out.push({ ...src, t: src.t + shift, samples });
  }
  void span;
  return out;
}

// The requestAnimationFrame the frame scheduler (frame.js) asks of the page: callbacks queued here and run by `pump`, one display frame each time.
let ask = [], run = [];
globalThis.requestAnimationFrame = (cb) => { ask.push(cb); return ask.length; };
globalThis.cancelAnimationFrame = () => {};
function pump(ms) {
  T += ms;
  const b = ask; ask = run; run = b;
  for (let i = 0; i < run.length; i++) run[i](T);
  run.length = 0;
}

export const CASES = [
  {
    name: 'stage frame with the vessels (stage.js + veins-gl.js, 60 Hz display, 30 Hz model)',
    warm: 1500, measure: 600,
    async setup() {
      const frames = (await recordFrames(4)).filter((f) => f.samples?.t?.length);
      await withPage();
      fake = true;
      const { createStage } = await import('../../src/ui/stage.js');
      const st = createStage({ wrap: page.document.getElementById('stageView'), onSelect() {}, onAction() {}, onOpenTab() {}, onHoverInfo() {}, onViewChange() {} });
      return (i) => {
        if (i % 2 === 0) st.update(frames[(i >> 1) % frames.length]);
        pump(16.7);
      };
    },
  },
  {
    name: 'blood.advanceStream, 40 streams',
    async setup() {
      const { advanceStreamAt, advanceStream } = await import('../../src/ui/blood.js');
      const N = 40, S = Array.from({ length: N }, (_, i) => ({ seed: i }));
      const mean = new Float32Array(N), now = new Float32Array(N);
      const so = { phasic: true, speed: 1, large: true, still: false, rev: false, dt: 0.016, bt: 0 };
      for (let i = 0; i < N; i++) { mean[i] = 5 + Math.sin(i); now[i] = 5 + 2 * Math.sin(i * 7); }
      const step = advanceStreamAt || ((st, m, n, k, o) => advanceStream(st, m[k], n[k], o.dt, o));
      return () => { for (let i = 0; i < N; i++) step(S[i], mean, now, i, so); };
    },
  },
  {
    name: 'pressure-time ingest (real engine frames)',
    async setup() {
      const frames = replay(await recordFrames(5), 9000);
      installDomStub();
      fake = true;
      const { createPressureTime } = await import('../../src/ui/pressure-time.js');
      const pt = createPressureTime();
      return (i) => { tick(33); pt.ingest(frames[i % frames.length]); };
    },
  },
  {
    name: 'flow-rows changedRows + retireRows + flowClose',
    async setup() {
      const { changedRows, retireRows, flowClose } = await import('../../src/ui/flow-rows.js');
      const rows = 60, stride = 32, data = new Float32Array(rows * stride), last = new Float32Array(rows * stride), was = new Uint8Array(rows), now = new Uint8Array(rows);
      const span = [0, 0];
      return (i) => {
        for (let r = 0; r < rows; r++) { now[r] = 1; for (let c = 0; c < stride; c++) data[r * stride + c] = Math.sin(i * 0.01 + r + c); }
        changedRows(data, last, stride, rows, span);
        flowClose(data, last, stride, rows);
        retireRows(data, was, now, stride);
      };
    },
  },
  {
    name: 'uniform-cache, a frame of fifty uniforms',
    async setup() {
      const { uniformCache } = await import('../../src/ui/uniform-cache.js');
      const calls = { n: 0 };
      const count = () => { calls.n++; }, gl = { uniform1f: count, uniform1i: count, uniform2f: count, uniform3f: count, uniform4f: count };
      const UC = uniformCache(gl);
      const locs = Array.from({ length: 50 }, () => ({}));
      const v4 = new Float64Array(4);
      return (i) => {
        for (let k = 0; k < 20; k++) UC.f1(locs[k], (i % 7) * 0.1 + k);
        for (let k = 20; k < 30; k++) UC.i1(locs[k], k);
        for (let k = 30; k < 40; k++) { v4[0] = i * 0.001; v4[1] = k; UC.f2a(locs[k], v4); }
        for (let k = 40; k < 50; k++) UC.f4a(locs[k], v4);
      };
    },
  },
  {
    name: 'veins-bin splitCells into a kept record',
    async setup() {
      const { splitCells } = await import('../../src/ui/veins-bin.js');
      const n = 4000, cells = new Float32Array(n * 6).map((_, i) => i % 97), simple = new Uint8Array(n).map((_, c) => (c % 3 === 0 ? 1 : 0)), mark = new Uint8Array(n).map((_, c) => (c % 5 === 0 ? 1 : 0));
      const out = { gen: new Float32Array(0), one: new Float32Array(0), nGen: 0, nOne: 0 };
      return () => splitCells(cells, n, simple, mark, out);
    },
  },
];
