// The motion budget (merged GPU plan, 2 Nov 2026, item 1; Mohammad: "How can we have SVG and CPU do nothing!!!!"): what the page
// asks of the browser's main thread while something moves. It counts style and layout reads (each one after a write is a forced style
// or layout pass), DOM writes (every attribute, child and text change the document sees), WebGL contexts made and lost, and bytes
// handed to the GPU (texture and buffer uploads), each window from its start to its end. The goal during a slide change, a swipe or a
// view switch is 0 reads, 0 writes, 0 contexts and almost no upload: the CPU and the SVG do nothing while the GPU draws.
//
// Off unless asked for: installMotionBudget() is called only by the ?perf readout or ?budget=1 (main.js). Until then no prototype is
// touched and this file costs nothing. On, each read is attributed to its caller (the first stack frame outside this file), so the
// report names what to move next. Counting is cheap next to what it counts, but a stack per read is not free: measuring builds only.
//
// Windows nest and overlap: a window keeps a copy of the running totals at its start and reports the difference at its end.

const SELF = /motion-budget\.js/;
const READS = new Map(), WRITES = new Map();   // (caller or target → count, since install)
const tot = { reads: 0, writes: 0, made: 0, lost: 0, restored: 0, upload: 0, uploads: 0 };
let installed = false, live = 0;
const seen = new WeakSet();

/** The first stack frame outside this file, as "function file:line", or '?' */
export function callerOf(stack) {
  const lines = String(stack || '').split('\n');
  for (const l of lines) {
    if (!/:\d+:\d+/.test(l) || SELF.test(l)) continue;
    const t = l.trim(), f = /([^/\s()@?]+)(?:\?[^:\s)]*)?:(\d+):\d+\)?$/.exec(t);
    if (!f) continue;
    const name = (/^at\s+([^\s(]+)\s+\(/.exec(t) || /^([^@\s]+)@/.exec(t) || [])[1] || '(anonymous)';
    return `${name} ${f[1]}:${f[2]}`;
  }
  return '?';
}
const bump = (map, k, n = 1) => map.set(k, (map.get(k) || 0) + n);
// (The caller is named only while a window is open: a stack per read at every other time slowed the page it measures.)
let open = 0;
const read = () => { tot.reads++; if (open) bump(READS, callerOf(new Error().stack)); };

/** Bytes in an upload call's data argument, or from width × height × 4 for a texture given by size or by image. */
export function bytesOf(args, tex) {
  if (!tex) { const d = args[1]; return typeof d === 'number' ? d : d?.byteLength || 0; }
  for (const a of args) if (a && typeof a === 'object' && 'byteLength' in a) return a.byteLength;
  const src = args.find((a) => a && typeof a === 'object' && 'width' in a && 'height' in a);
  if (src) return (src.width | 0) * (src.height | 0) * 4;
  // texImage2D(target, level, internal, w, h, border, ...) / texSubImage2D(target, level, x, y, w, h, ...)
  const n = args.filter((a) => typeof a === 'number');
  return n.length >= 6 ? Math.max(0, n[3] | 0) * Math.max(0, n[4] | 0) * 4 : 0;
}

function wrapMethod(proto, name, fn) {
  const orig = proto?.[name];
  if (typeof orig !== 'function') return;
  proto[name] = function (...args) { fn(this, args); return orig.apply(this, args); };
}
function wrapGetter(proto, name) {
  const d = proto && Object.getOwnPropertyDescriptor(proto, name);
  if (!d?.get) return;
  Object.defineProperty(proto, name, { ...d, get() { read(); return d.get.call(this); } });
}

/** Starts counting, once per page. `root` is the document whose writes count; `skip(el)` leaves out a node's writes (a measuring panel). */
export function installMotionBudget({ root = document, skip = () => false } = {}) {
  if (installed || typeof window === 'undefined') return api;
  installed = true;
  const gcs = window.getComputedStyle;
  window.getComputedStyle = function (...a) { read(); return gcs.apply(this, a); };
  for (const n of ['getBoundingClientRect', 'getClientRects']) wrapMethod(Element.prototype, n, read);
  if (typeof SVGGraphicsElement !== 'undefined') for (const n of ['getBBox', 'getCTM', 'getScreenCTM']) wrapMethod(SVGGraphicsElement.prototype, n, read);
  if (typeof SVGGeometryElement !== 'undefined') for (const n of ['getTotalLength', 'getPointAtLength']) wrapMethod(SVGGeometryElement.prototype, n, read);
  for (const n of ['offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft']) wrapGetter(HTMLElement.prototype, n);
  for (const n of ['scrollWidth', 'scrollHeight', 'clientWidth', 'clientHeight', 'scrollTop', 'scrollLeft']) wrapGetter(Element.prototype, n);
  // Contexts: each new WebGL context the page makes, and each it loses or gets back.
  const count = (cv, ctx, type) => {
    if (!ctx || seen.has(ctx) || !/webgl/.test(String(type))) return;
    seen.add(ctx); tot.made++; live++;
    cv.addEventListener?.('webglcontextlost', () => { tot.lost++; live--; });
    cv.addEventListener?.('webglcontextrestored', () => { tot.restored++; live++; });
  };
  for (const C of [window.HTMLCanvasElement, window.OffscreenCanvas]) {
    const orig = C?.prototype?.getContext;
    if (!orig) continue;
    C.prototype.getContext = function (type, ...rest) { const ctx = orig.call(this, type, ...rest); count(this, ctx, type); return ctx; };
  }
  // Uploads: texture and buffer data handed to the GPU, in bytes.
  for (const G of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!G) continue;
    for (const n of ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D']) wrapMethod(G.prototype, n, (_, a) => { tot.uploads++; tot.upload += bytesOf(a, true); });
    for (const n of ['bufferData', 'bufferSubData']) wrapMethod(G.prototype, n, (_, a) => { tot.uploads++; tot.upload += bytesOf(a, false); });
  }
  // Writes: everything the document sees change, by element and attribute (a MutationObserver cannot name the script that wrote).
  new MutationObserver((list) => {
    for (const m of list) {
      const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (t && skip(t)) continue;
      tot.writes++;
      const tag = t ? `${t.namespaceURI === 'http://www.w3.org/2000/svg' ? 'svg:' : ''}${t.localName}` : '#text';
      bump(WRITES, m.type === 'attributes' ? `${tag} ${m.attributeName}` : m.type === 'childList' ? `${tag} children` : `${tag} text`);
    }
  }).observe(root, { subtree: true, attributes: true, childList: true, characterData: true });
  return api;
}

/** A window: the totals now, to subtract at its end. */
function start(kind = 'window') { open++; return { kind, t0: performance.now(), tot: { ...tot }, reads: new Map(READS), writes: new Map(WRITES), live }; }
const diff = (now, was, n) => [...now].map(([k, v]) => [k, v - (was.get(k) || 0)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n);
/** The window's counts, with the top `n` readers and written element/attribute pairs. */
function stop(w, n = 8) {
  if (!w.done) { w.done = true; open = Math.max(0, open - 1); }
  const d = {};
  for (const k in tot) d[k] = tot[k] - w.tot[k];
  return { kind: w.kind, ms: performance.now() - w.t0, ...d, live, liveAtStart: w.live, readers: diff(READS, w.reads, n), written: diff(WRITES, w.writes, n) };
}
/** A window's result as lines of the ?perf report. */
export function budgetText(r) {
  if (!r) return '';
  const kb = (r.upload / 1024).toFixed(0);
  const head = `  motion budget (goal 0 / 0 / 0): ${r.reads} style+layout reads, ${r.writes} DOM writes, ${r.made} contexts made (${r.lost} lost, ${r.live} live), ${kb} KB uploaded in ${r.uploads} calls`;
  const rd = r.readers.length ? `\n    readers: ${r.readers.map(([k, v]) => `${k} ${v}`).join(', ')}` : '';
  const wr = r.written.length ? `\n    written: ${r.written.map(([k, v]) => `${k} ${v}`).join(', ')}` : '';
  return head + rd + wr;
}

const api = { start, stop, totals: () => ({ ...tot, live }), on: () => installed };
export const motionBudget = api;

// (On at load when the address asks: ?perf (the readout shows each window's budget) or ?budget=1 (counting only, for a headless run
// reading pps.motionBudget). Imported first by main.js, so the contexts the page makes at start are counted too.)
if (typeof location !== 'undefined' && /[?&](?:perf\b|budget=1\b)/.test(location.search)) installMotionBudget({ skip: (el) => !!el.closest?.('#perfReadout') });
