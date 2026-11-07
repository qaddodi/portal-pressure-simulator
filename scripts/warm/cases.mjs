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
    name: 'pressure-time chart drawn by the GPU pen (pressure-time.js + trace-gl.js, update and redraw)',
    warm: 1500, measure: 600,
    async setup() {
      const frames = replay(await recordFrames(5), 24000);
      // (Every canvas the page watches has a box once it is watched: layout gives none in jsdom.)
      globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; } observe(el) { this.cb([{ target: el, contentRect: { width: 640, height: 320 } }]); } disconnect() {} };
      await withPage();
      fake = true;
      const { createPressureTime } = await import('../../src/ui/pressure-time.js');
      const pt = createPressureTime();
      page.document.body.append(pt.el);
      return (i) => {
        tick(33);
        pt.update(frames[i % frames.length]);
        pump(16.7);
      };
    },
  },
  {
    name: 'display-state: colour follows, scalar follows and the shown state, a frame of each',
    async setup() {
      const { createColourFollow, createFollow, createShownState } = await import('../../src/ui/display-state.js');
      const NK = 40, cf = createColourFollow({ n: 6 }), keys = Array.from({ length: NK }, (_, i) => `v${i}`);
      const tgt = Array.from({ length: NK }, () => new Float32Array(6));
      const fl = Array.from({ length: 12 }, () => createFollow({ small: 0.01 }));
      const keep = new Set(keys.slice(0, NK / 2)), pend = [];
      const shown = createShownState({ ask: (cb) => { pend.push(cb); return pend.length; }, now: () => T });
      const names = Array.from({ length: 16 }, (_, i) => `r${i}`);
      return (i) => {
        T += 16.7;
        for (let k = 0; k < NK; k++) {
          const t = tgt[k];
          for (let c = 0; c < 6; c++) t[c] = 0.5 + 0.4 * Math.sin(i * 0.02 + k + c);
          cf.step(keys[k], t, 0.0167, false);
        }
        if (i % 90 === 0) cf.prune(keep);
        for (let k = 0; k < fl.length; k++) fl[k].step(5 + 3 * Math.sin(i * 0.01 + k), 0.0167);
        for (let k = 0; k < names.length; k++) shown.set(names[k], 10 + 4 * Math.sin(i * 0.05 + k));
        const cbs = pend.splice(0);
        for (let k = 0; k < cbs.length; k++) cbs[k](T);
      };
    },
  },
  {
    name: 'label-gl: reading 30 labels (describeBlock, svgOnly, lookKey), as a sync reads those that changed',
    async setup() {
      await withPage();
      const { createLookStyles, lookKey, svgOnly } = await import('../../src/ui/label-gl.js');
      const looks = createLookStyles();   // (the 30 are of one look: its styles read for the first, kept for the rest, as refresh reads them)
      const NS = 'http://www.w3.org/2000/svg', doc = page.document, svg = doc.createElementNS(NS, 'svg');
      const style = (o) => ({ display: 'inline', opacity: '1', filter: 'none', fill: 'rgb(20, 20, 20)', stroke: 'none', strokeWidth: '0px', paintOrder: 'normal', fontStyle: 'normal', fontWeight: '600', fontSize: '12px', fontFamily: 'Inter', letterSpacing: 'normal', fontVariantNumeric: 'normal', strokeLinejoin: 'round', outlineStyle: 'none', outlineWidth: '0px', outlineColor: '', outlineOffset: '0px', ...o });
      const styles = new WeakMap(), blocks = [];
      for (let i = 0; i < 30; i++) {
        const g = doc.createElementNS(NS, 'g'), r = doc.createElementNS(NS, 'rect'), t = doc.createElementNS(NS, 'text'), sp = doc.createElementNS(NS, 'tspan');
        r.setAttribute('x', '0'); r.setAttribute('y', '0'); r.setAttribute('width', '60'); r.setAttribute('height', '18'); r.setAttribute('rx', '6');
        t.setAttribute('x', '4'); t.setAttribute('y', '13'); sp.textContent = `Label ${i} 12.${i % 10}`;
        t.append(sp); g.append(r, t); svg.append(g); blocks.push(g);
        for (const el of [g, r, t, sp]) styles.set(el, style(el === r ? { fill: 'rgba(255, 255, 255, 0.6)' } : {}));
      }
      const cs = (el) => styles.get(el);
      return (i) => {
        for (let k = 0; k < blocks.length; k++) {
          const d = looks.describe(blocks[k], 1, cs, null);
          if (d && !svgOnly(d, true)) lookKey(d, false, 2);
        }
        void i;
      };
    },
  },
  {
    name: 'glass-gl: the blur plan of eight glasses (blurBoxesInto), a picture',
    async setup() {
      const { blurBoxesInto } = await import('../../src/ui/glass-gl.js');
      const boxes = Array.from({ length: 8 }, (_, k) => ({ x: 20 + k * 60, y: 30 + (k % 3) * 70, w: 90, h: 50 }));
      const out = [], pool = [];
      return (i) => {
        const j = i % 40;
        for (let k = 0; k < boxes.length; k++) boxes[k].x = 20 + k * 60 + j * 0.5;
        blurBoxesInto(out, pool, boxes, 0, 0, 8, 160, 120);
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
    warm: 20000,
    async setup() {
      const frames = replay(await recordFrames(5), 24000);
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
