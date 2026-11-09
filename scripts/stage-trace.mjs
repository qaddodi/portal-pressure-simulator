// The node GPU trace (stage-split plan 2.6, S0.4): boots the real createStage in node under jsdom with the warm harness's do-nothing WebGL,
// runs a fixed scripted session on a fake clock, fake timers and a seeded Math.random, and hashes every GL call (name and arguments) per
// frame, plus the label snapshot and the stage's DOM per frame. (Limit: the label layer draws only once its host canvas is active, which the
// do-nothing page here does not reach, so labels show up through the DOM hash and the snapshot only where the page itself puts them.) Same hashes before and after a move = the figure, labels, leaders and glass got exactly the same
// draws in exactly the same frames. Node only: no browser, no screenshots, a few seconds.
//
//   node scripts/stage-trace.mjs --save [file]       write the hashes (default /tmp/stage-trace.json)
//   node scripts/stage-trace.mjs --compare [file]    compare with the saved ones; exit 1 and name the first frame that differs
//   node scripts/stage-trace.mjs                     run twice and say whether the two runs agree (the trace itself is deterministic)
//   --renderer classic|mesh|vector                   run the same session with that vessel renderer chosen (Settings › Display), so a Vector push can be
//                                                    compared with the last Vector one (vector-renderer-plan.md 9.J). Without the flag nothing changes: the
//                                                    stored choice is left alone and the default file is /tmp/stage-trace.json. With it the default file is
//                                                    /tmp/stage-trace-<renderer>.json, and the trace says so and exits 2 when frame.js cannot select that
//                                                    renderer (Vector before workstream H's setting lands), rather than hashing a different renderer's draws.
//                                                    The same when the chosen renderer is selected but cannot be made (veins-gl.js warns and draws with the
//                                                    other one): exit 3 and the reason, nothing saved. --allow-fallback hashes it anyway.
import { readFileSync, writeFileSync } from 'node:fs';
import { RENDERERS, RENDERER_KEY } from '../src/ui/vec-contract.js';

// ---- deterministic world: clock, timers, random, rAF ----
let T = 1000;
const timers = new Map(); let tid = 1, order = 0;
Object.defineProperty(performance, 'now', { value: () => T, configurable: true });
Date.now = () => 1.7e12 + T;
let seed = 12345;
Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const addTimer = (fn, ms, every, args) => { const id = tid++; timers.set(id, { fn, at: T + Math.max(0, ms || 0), every, args, o: order++ }); return id; };
globalThis.setTimeout = (fn, ms, ...a) => addTimer(fn, ms, 0, a);
globalThis.setInterval = (fn, ms, ...a) => addTimer(fn, ms, Math.max(1, ms || 1), a);
globalThis.clearTimeout = globalThis.clearInterval = (id) => { timers.delete(id); };
globalThis.queueMicrotask ??= (f) => Promise.resolve().then(f);
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

// ---- GL recorder ----
const H = { h: 2166136261 >>> 0, calls: 0 };
const ROUND = !!process.env.TRACE_ROUND;   // (a number rounded to 6 significant digits before it is hashed: a change in the order a camera is composed may move a uniform by an ulp)
const DUMP = process.env.TRACE_DUMP ? [] : null;
const mix = (n) => { H.h = Math.imul(H.h ^ (n >>> 0), 16777619) >>> 0; };
const ids = new WeakMap(); let nextId = 1;
const mixStr = (s) => { for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i)); mix(0xff); };
const CONST_NAME = new Map();   // (the stub numbers the GL constants it finds in src/ui in file order, so a new file shifts them: hash such a number by its name)
function mixVal(v, depth = 0) {
  if (v === null || v === undefined) return mix(0x9e37);
  const t = typeof v;
  if (t === 'number' && CONST_NAME.has(v)) return mixStr(CONST_NAME.get(v));
  if (t === 'number') { if (Number.isInteger(v) && Math.abs(v) < 2 ** 31) return mix(v | 0); if (ROUND) v = +v.toPrecision(6); const f = new Float64Array([v]), u = new Uint32Array(f.buffer); mix(u[0]); return mix(u[1]); }
  if (t === 'boolean') return mix(v ? 1 : 2);
  if (t === 'string') return mixStr(v.length > 200 ? v.length + v.slice(0, 64) : v);
  if (ArrayBuffer.isView(v)) { const u = new Uint8Array(v.buffer, v.byteOffset, v.byteLength); mix(u.length); for (let i = 0; i < u.length; i += 1) mix(u[i]); return undefined; }
  if (Array.isArray(v)) { mix(v.length); if (depth < 2) for (const x of v) mixVal(x, depth + 1); return undefined; }
  if (t === 'object' || t === 'function') { let id = ids.get(v); if (!id) { id = nextId++; ids.set(v, id); } return mix(id); }
  return mix(7);
}
async function installRecorder() {
  const glMod = await import('./warm/gl-stub.mjs');
  const domMod = await import('./warm/dom.mjs');
  const proto = Object.getPrototypeOf(glMod.makeGL({ width: 4, height: 4 }));
  const names = Object.getOwnPropertyNames(proto).filter((k) => typeof proto[k] === 'function');
  for (const k of Object.getOwnPropertyNames(proto)) if (typeof proto[k] === 'number' && proto[k] >= 0x20000) CONST_NAME.set(proto[k], k);
  const origGet = globalThis.HTMLCanvasElement?.prototype;
  const page = domMod.installPage();
  const g = globalThis, w0 = page.dom.window;
  for (const k of ['dispatchEvent', 'addEventListener', 'removeEventListener']) if (!g[k]) g[k] = w0[k].bind(w0);
  const win = page.dom.window, cproto = win.HTMLCanvasElement.prototype;
  // A 2D context with fixed text metrics (the label atlas measures text; jsdom has no canvas): drawing does nothing, widths are 7 px a letter.
  const ctx2d = (canvas) => new Proxy({ canvas, measureText: (s) => ({ width: String(s).length * 7, actualBoundingBoxLeft: 0, actualBoundingBoxRight: String(s).length * 7, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 3, fontBoundingBoxAscent: 10, fontBoundingBoxDescent: 3 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }), createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }) },
    { get: (o, k) => (k in o ? o[k] : typeof k === 'symbol' ? undefined : (...a) => (k.startsWith('create') ? { addColorStop() {} } : undefined)), set: (o, k, v) => { o[k] = v; return true; } });
  cproto.getContext = function (type) {
    if (type === '2d') return (this.__2d ??= ctx2d(this));
    if (type !== 'webgl2') return null;
    if (this.__gl) return this.__gl;
    const gl = glMod.makeGL(this);
    for (const k of names) {
      const f = gl[k];
      gl[k] = function (...a) { H.calls++; const h0 = H.h; mixStr(k); for (const x of a) mixVal(x); const r = f.apply(this, a); if (r && typeof r === 'object') mixVal(r); if (DUMP && DUMP.length < 5000) DUMP.push(`${k} ${a.map((x) => (typeof x === 'number' || typeof x === 'string' ? String(x).slice(0, 40) : ArrayBuffer.isView(x) ? `[${x.constructor.name} ${x.length}]` : typeof x)).join(',')} #${(H.h ^ h0 >>> 0).toString(16)}`); return r; };
    }
    for (const k of ['drawArrays', 'drawArraysInstanced', 'drawElements', 'drawElementsInstanced', 'clear']) { const g = gl[k]; gl[k] = function (...a) { return g.apply(this, a); }; }
    this.__gl = gl; return gl;
  };
  void origGet;
  // a fixed stage box: jsdom lays nothing out
  const BOX = { x: 0, y: 0, left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 };
  win.Element.prototype.getBoundingClientRect = function () { return this.id === 'stageView' || this.closest?.('#stageView') === this && false ? BOX : (this.id === 'stageView' ? BOX : { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }); };
  for (const [k, v] of [['clientWidth', 1200], ['clientHeight', 800], ['offsetWidth', 1200], ['offsetHeight', 800]]) Object.defineProperty(win.HTMLElement.prototype, k, { get() { return this.id === 'stageView' ? v : 0; }, configurable: true });
  return page;
}

// The stored choices frame.js reads at load (before the stage is imported): the renderer key (workstream H) and, for the build before it, the
// old mesh key. 'classic' is the old key's '0'; 'mesh' is its default (removed); 'vector' has only the new key.
function chooseRenderer(renderer) {
  if (!renderer) return;
  localStorage.setItem(RENDERER_KEY, renderer);
  if (renderer === 'classic') localStorage.setItem('pps.vesselMesh', '0'); else localStorage.removeItem('pps.vesselMesh');
}

export const FALLBACK_WARNING = /the (\w+) vessel renderer could not be made/;   // (veins-gl.js: the chosen renderer failed and the other one draws)
export async function runTrace({ renderer = null } = {}) {
  const page = await installRecorder();
  chooseRenderer(renderer);
  const warned = new Set(), realWarn = console.warn;
  console.warn = (...a) => { const m = FALLBACK_WARNING.exec(String(a[0])); if (m && m[1] === renderer) warned.add(`${String(a[0])} ${a.slice(1).map((x) => x?.message ?? x).join(' ')}`.trim()); else realWarn(...a); };
  runTrace.warned = warned;
  // The engine's frames: the real core on the fake clock.
  const { createCore } = await import('../src/worker-core.js');
  const frames = [];
  const core = createCore((m) => { if (m.type === 'frame') frames.push(m); });
  core.handle({ type: 'init' }); core.handle({ type: 'run', running: true });
  for (let i = 0; i < 90; i++) pump(33);
  core.handle({ type: 'run', running: false });
  const { createStage } = await import('../src/ui/stage.js');
  if (renderer) {
    // Not hashing the wrong renderer: frame.js has to report the choice that was asked for.
    const f = await import('../src/ui/frame.js');
    const now = typeof f.vesselRenderer === 'function' ? f.vesselRenderer() : (f.vesselMesh?.() ? 'mesh' : 'classic');
    if (now !== renderer) throw Object.assign(new Error(`--renderer ${renderer}: frame.js reports '${now}'${typeof f.vesselRenderer === 'function' ? '' : ' (it has no vesselRenderer() yet: the three-way setting is workstream H)'}`), { notSelectable: true });
  }
  const st = createStage({ wrap: page.document.getElementById('stageView'), onSelect() {}, onAction() {}, onOpenTab() {}, onHoverInfo() {}, onViewChange() {} });
  const out = [];
  let fi = 0;
  const frame = (tag) => {
    if (frames.length && st.update) st.update(frames[fi++ % frames.length]);
    H.h = 2166136261 >>> 0; H.calls = 0;
    pump(16.7);
    let snap;
    try { snap = JSON.stringify(st.labelSnapshot?.() ?? null, (k, v) => (typeof v === 'number' ? Math.round(v * 1e3) / 1e3 : v)); } catch (e) { snap = 'ERR ' + e.message; }
    let lh = 2166136261 >>> 0; for (let i = 0; i < snap.length; i++) lh = Math.imul(lh ^ snap.charCodeAt(i), 16777619) >>> 0;
    // the page's own scene under the stage (SVG model, label host, overlays: every attribute and style the frame set)
    const html = page.document.getElementById('stageView')?.innerHTML ?? ''; let dh = 2166136261 >>> 0; for (let i = 0; i < html.length; i++) dh = Math.imul(dh ^ html.charCodeAt(i), 16777619) >>> 0;
    out.push(`${tag} ${H.h.toString(16)} ${H.calls} ${lh.toString(16)} ${dh.toString(16)}`);
  };
  const run = (n, tag) => { for (let i = 0; i < n; i++) frame(tag); };
  const call = (tag, fn) => { try { fn(); } catch (e) { out.push(`${tag} THREW ${e.message.slice(0, 80)}`); } };
  run(120, 'boot');
  if (process.env.TRACE_DEBUG) console.log(JSON.stringify(st.labelSnapshot?.()).slice(0, 400), Object.keys(st).length);
  call('zoomIn', () => st.zoomIn?.()); run(60, 'zoomIn');
  call('zoomIn2', () => st.zoomIn?.()); run(60, 'zoomIn2');
  call('circuit', () => st.setView?.('circuit')); run(150, 'circuit');
  call('anatomy', () => st.setView?.('anatomy')); run(150, 'anatomy');
  call('zoomOut', () => st.zoomOut?.()); run(60, 'zoomOut');
  // The camera seams (one-camera-record-plan.md push 0): the dive, a card zoom inside the lobule, the rise, a card zoom on the anatomy.
  const { store } = await import('../src/ui/store.js');
  call('dive', () => store.set1('lobule', true)); for (let i = 0; i < 40; i++) { await new Promise((r) => setImmediate(r)); run(5, 'dive'); }
  call('lzCard', () => st.zoomOpen()); for (let i = 0; i <= 30; i++) { call('lzCard', () => st.zoomAt(1 + i / 30, 600, 400, 0, 0)); run(1, 'lzCard'); }
  call('lzCardEnd', () => st.zoomEnd()); run(10, 'lzCardEnd');
  call('rise', () => store.set1('lobule', false)); run(150, 'rise');
  call('card', () => st.zoomOpen()); for (let i = 0; i <= 30; i++) { call('card', () => st.zoomAt(1 + i / 30, 600, 400, 50, 0)); run(1, 'card'); }
  call('cardEnd', () => st.zoomEnd()); run(10, 'cardEnd');
  if (process.env.TRACE_PERF) { const { perf } = await import('../src/ui/frame.js'); const t = perf().totals; console.log(JSON.stringify({ frames: t.frames, asks: t.asks, drawn: t.drawn }, null, 1)); }
  return out;
}

const args = process.argv.slice(2);
const optValue = (flag) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; };
const renderer = optValue('--renderer');
const file = (flag) => optValue(flag) ?? (renderer ? `/tmp/stage-trace-${renderer}.json` : '/tmp/stage-trace.json');
if (process.argv[1]?.endsWith('stage-trace.mjs')) {
  if (args.includes('--renderer') && !RENDERERS.includes(renderer)) { console.error(`stage-trace: --renderer takes ${RENDERERS.join(', ')} (got ${renderer ?? 'nothing'})`); process.exit(2); }
  const t0 = performance.timeOrigin + 0, w0 = process.hrtime.bigint();
  let frames;
  try { frames = await runTrace({ renderer }); } catch (e) {
    if (!e.notSelectable) throw e;
    console.error(`stage-trace: cannot run with ${e.message}`); process.exit(2);
  }
  const dt = Number((process.hrtime.bigint() - w0) / 1000000n); void t0;
  if (renderer && runTrace.warned?.size && !args.includes('--allow-fallback')) {
    console.error(`stage-trace: ${renderer} was chosen but could not be made, so these ${frames.length} frames are another renderer's draws and are not saved or compared:\n  ${[...runTrace.warned].join('\n  ')}`);
    process.exit(3);
  }
  const threw = frames.filter((l) => /THREW|ERR/.test(l));
  if (args.includes('--save')) { writeFileSync(file('--save'), JSON.stringify(frames)); console.log(`stage-trace: saved ${frames.length} frames to ${file('--save')} (${dt} ms)`); }
  else if (args.includes('--compare')) {
    const was = JSON.parse(readFileSync(file('--compare'), 'utf8'));
    const bad = frames.findIndex((l, i) => l !== was[i]);
    if (bad >= 0 || was.length !== frames.length) { console.error(`stage-trace: DIFFERENT at frame ${bad} (${frames[bad]} vs saved ${was[bad]}); ${frames.length} frames vs ${was.length} saved`); process.exit(1); }
    console.log(`stage-trace: same ${frames.length} frames as saved (${dt} ms)`);
  } else console.log(frames.slice(0, 3).join('\n') + `\n… ${frames.length} frames, ${new Set(frames.map((l) => l.split(' ')[1])).size} distinct GL hashes, ${threw.length} threw (${dt} ms)`);
  if (renderer) console.log(`stage-trace: renderer ${renderer}`);
  if (threw.length) console.log(threw.slice(0, 5).join('\n'));
  if (DUMP) writeFileSync(process.env.TRACE_DUMP, DUMP.join('\n'));
  process.exit(0);
}
