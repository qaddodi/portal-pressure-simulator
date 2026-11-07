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
const READS = new Map(), WRITES = new Map(), UPS = new Map();   // (caller or target → count, since install; UPS: caller → KB uploaded)
const tot = { reads: 0, writes: 0, made: 0, lost: 0, restored: 0, upload: 0, uploads: 0, alloc: 0, allocs: 0, copy: 0, copies: 0, bitmaps: 0, bitmap: 0 };
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

// Upload accounting (recs_cgpt R02, 2 Nov 2026): each WebGL call decoded by its own argument layout, so a bufferSubData's bytes come
// from its data (args[2]), not its byte offset (args[1]), a typed array's srcOffset and length are honoured, and a texture's bytes
// per texel follow its format and type. CPU uploads, GPU room made (texStorage, renderbuffers), GPU-local copies (blits, copyTex,
// pixel-buffer reads) and bitmap transfers are four counters, not one.

const CHANNELS = { 0x1908: 4, 0x1907: 3, 0x1903: 1, 0x8227: 2, 0x1909: 1, 0x1906: 1, 0x190a: 2, 0x8d99: 4, 0x8d98: 3, 0x8d94: 1, 0x8228: 2, 0x80e1: 4, 0x1902: 1, 0x84f9: 1 };
const TYPE_BYTES = { 0x1400: 1, 0x1401: 1, 0x1402: 2, 0x1403: 2, 0x1404: 4, 0x1405: 4, 0x1406: 4, 0x140b: 2, 0x8d61: 2 };
const PACKED = { 0x8033: 2, 0x8034: 2, 0x8363: 2, 0x8368: 4, 0x8c3b: 4, 0x8c3e: 4, 0x8dad: 8, 0x84fa: 4 };
/** Bytes per texel of a (format, type) pair: packed types are whole texels, others channels × bytes per channel; 4 when unknown. */
export function texelBytes(format, type) {
  if (PACKED[type]) return PACKED[type];
  return (CHANNELS[format] || 4) * (TYPE_BYTES[type] || 1);
}
// (Sized internal formats, for room made with texStorage / renderbufferStorage; 4 bytes a texel when unknown.)
const SIZED = { 0x8229: 1, 0x822b: 2, 0x8051: 3, 0x8058: 4, 0x8c43: 4, 0x822d: 2, 0x822f: 4, 0x881a: 8, 0x822e: 4, 0x8230: 8, 0x8814: 16, 0x8d48: 1, 0x81a5: 2, 0x81a6: 3, 0x88f0: 4, 0x8cac: 4, 0x8cad: 8, 0x8c3a: 4, 0x8059: 4, 0x8d62: 2, 0x8056: 2, 0x8057: 2, 0x81a7: 4 };
const sizedBytes = (f) => SIZED[f] || 4;
const isView = (a) => !!a && typeof a === 'object' && ArrayBuffer.isView(a);
const isImage = (a) => !!a && typeof a === 'object' && !isView(a) && 'width' in a && 'height' in a;
const dims = (a) => [(a.width | 0) || (a.displayWidth | 0) || (a.videoWidth | 0), (a.height | 0) || (a.displayHeight | 0) || (a.videoHeight | 0)];
// (A typed array's bytes from element srcOffset for `length` elements (0: to its end), as WebGL 2's overloads read them.)
function viewBytes(v, srcOffset = 0, length = 0) {
  const bpe = v.BYTES_PER_ELEMENT || 1, n = (v.byteLength / bpe) | 0;
  const off = Math.max(0, Math.min(n, srcOffset | 0));
  return (length > 0 ? Math.min(length, n - off) : n - off) * bpe;
}

/**
 * One WebGL call decoded: { kind, bytes } where kind is 'upload' (crosses from the CPU), 'alloc' (room made, no pixels),
 * 'copy' (GPU-local: a blit, a copyTex, a pixel buffer source) or null (not a transfer). `m` is the method's name.
 */
export function decodeCall(m, a) {
  switch (m) {
    case 'bufferData': {
      if (typeof a[1] === 'number') return { kind: 'alloc', bytes: a[1] };
      if (isView(a[1])) return { kind: 'upload', bytes: viewBytes(a[1], a[3], a[4]) };
      return { kind: a[1] ? 'upload' : 'alloc', bytes: a[1]?.byteLength || 0 };
    }
    case 'bufferSubData': {
      const d = a[2];
      if (isView(d)) return { kind: 'upload', bytes: viewBytes(d, a[3], a[4]) };
      return { kind: 'upload', bytes: d?.byteLength || 0 };
    }
    case 'texImage2D': case 'texSubImage2D': {
      const sub = m === 'texSubImage2D';
      // (Short form: (target, level, internal|x, [y], format, type, source); long form: ..., w, h, [border], format, type, data.)
      const short = sub ? a.length === 7 : a.length === 6;
      if (short) {
        const src = a[a.length - 1], [w, h] = isImage(src) ? dims(src) : [0, 0];
        return { kind: 'upload', bytes: w * h * texelBytes(a[a.length - 3], a[a.length - 2]) };
      }
      const w = a[sub ? 4 : 3] | 0, h = a[sub ? 5 : 4] | 0, fi = 6, f = a[fi], t = a[fi + 1], d = a[fi + 2];
      const full = Math.max(0, w) * Math.max(0, h) * texelBytes(f, t);
      if (d == null) return { kind: sub ? null : 'alloc', bytes: sub ? 0 : full };
      if (typeof d === 'number') return { kind: 'copy', bytes: full };   // (from a bound pixel buffer: already on the GPU)
      if (isView(d)) return { kind: 'upload', bytes: Math.min(full || Infinity, viewBytes(d, a[fi + 3])) };
      if (isImage(d)) { const [iw, ih] = dims(d); return { kind: 'upload', bytes: (w * h || iw * ih) * texelBytes(f, t) }; }
      return { kind: 'upload', bytes: full };
    }
    case 'texImage3D': case 'texSubImage3D': {
      const sub = m === 'texSubImage3D', o = sub ? 5 : 3;
      const w = a[o] | 0, h = a[o + 1] | 0, dp = a[o + 2] | 0, fi = sub ? 8 : 7, f = a[fi], t = a[fi + 1], d = a[fi + 2];
      const full = Math.max(0, w) * Math.max(0, h) * Math.max(0, dp) * texelBytes(f, t);
      if (d == null) return { kind: sub ? null : 'alloc', bytes: sub ? 0 : full };
      if (typeof d === 'number') return { kind: 'copy', bytes: full };
      if (isView(d)) return { kind: 'upload', bytes: Math.min(full || Infinity, viewBytes(d, a[fi + 3])) };
      return { kind: 'upload', bytes: full };
    }
    case 'texStorage2D': return { kind: 'alloc', bytes: (a[3] | 0) * (a[4] | 0) * sizedBytes(a[2]) * (a[1] > 1 ? 4 / 3 : 1) };
    case 'texStorage3D': return { kind: 'alloc', bytes: (a[3] | 0) * (a[4] | 0) * (a[5] | 0) * sizedBytes(a[2]) };
    case 'renderbufferStorage': return { kind: 'alloc', bytes: (a[2] | 0) * (a[3] | 0) * sizedBytes(a[1]) };
    case 'renderbufferStorageMultisample': return { kind: 'alloc', bytes: (a[3] | 0) * (a[4] | 0) * sizedBytes(a[2]) * Math.max(1, a[1] | 0) };
    case 'copyTexImage2D': return { kind: 'copy', bytes: (a[5] | 0) * (a[6] | 0) * sizedBytes(a[2]) };
    case 'copyTexSubImage2D': return { kind: 'copy', bytes: (a[6] | 0) * (a[7] | 0) * 4 };
    case 'copyTexSubImage3D': return { kind: 'copy', bytes: (a[7] | 0) * (a[8] | 0) * 4 };
    case 'blitFramebuffer': return { kind: 'copy', bytes: Math.abs((a[6] | 0) - (a[4] | 0)) * Math.abs((a[7] | 0) - (a[5] | 0)) * 4 };
    case 'copyBufferSubData': return { kind: 'copy', bytes: a[4] | 0 };
    default: return { kind: null, bytes: 0 };
  }
}

/** Bytes in an upload call. With `m` (the method), decoded by its overload (decodeCall); without, a buffer call is read as bufferData. */
export function bytesOf(args, tex, m) {
  if (!m) {
    if (!tex) m = 'bufferData';
    else { const n = args.length; m = n === 6 ? 'texImage2D' : n === 7 ? 'texSubImage2D' : args[5] === 0 ? 'texImage2D' : 'texSubImage2D'; }
  }
  return Math.round(decodeCall(m, args).bytes);
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
  const note = (b, kind) => {
    if (kind === 'alloc') { tot.allocs++; tot.alloc += b; return; }
    if (kind === 'copy') { tot.copies++; tot.copy += b; return; }
    if (kind !== 'upload') return;
    tot.uploads++; tot.upload += b; if (open) bump(UPS, callerOf(new Error().stack), b / 1024);
  };
  for (const G of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!G) continue;
    for (const n of ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D', 'bufferData', 'bufferSubData', 'texStorage2D', 'texStorage3D', 'renderbufferStorage', 'renderbufferStorageMultisample', 'copyTexImage2D', 'copyTexSubImage2D', 'copyTexSubImage3D', 'blitFramebuffer', 'copyBufferSubData']) {
      wrapMethod(G.prototype, n, (_, a) => { const d = decodeCall(n, a); note(Math.round(d.bytes), d.kind); });
    }
  }
  // (Bitmap transfers: an ImageBitmap handed to a bitmaprenderer canvas, counted by its pixels.)
  if (window.ImageBitmapRenderingContext) wrapMethod(window.ImageBitmapRenderingContext.prototype, 'transferFromImageBitmap', (_, a) => { tot.bitmaps++; tot.bitmap += ((a[0]?.width | 0) * (a[0]?.height | 0) * 4); });
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
function start(kind = 'window') { open++; return { kind, t0: performance.now(), tot: { ...tot }, reads: new Map(READS), writes: new Map(WRITES), ups: new Map(UPS), live }; }
const diff = (now, was, n) => [...now].map(([k, v]) => [k, v - (was.get(k) || 0)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n);
/** The window's counts, with the top `n` readers and written element/attribute pairs. */
function stop(w, n = 8) {
  if (!w.done) { w.done = true; open = Math.max(0, open - 1); }
  const d = {};
  for (const k in tot) d[k] = tot[k] - w.tot[k];
  return { kind: w.kind, ms: performance.now() - w.t0, ...d, live, liveAtStart: w.live, readers: diff(READS, w.reads, n), written: diff(WRITES, w.writes, n), uploaders: diff(UPS, w.ups, n).map(([k, v]) => [k, Math.round(v)]) };
}
/** A window's result as lines of the ?perf report. */
export function budgetText(r) {
  if (!r) return '';
  const kb = (r.upload / 1024).toFixed(0);
  const head = `  motion budget (goal 0 / 0 / 0): ${r.reads} style+layout reads, ${r.writes} DOM writes, ${r.made} contexts made (${r.lost} lost, ${r.live} live), ${kb} KB uploaded in ${r.uploads} calls${r.allocs ? `, ${(r.alloc / 1024).toFixed(0)} KB of GPU room made in ${r.allocs}` : ''}${r.copies ? `, ${(r.copy / 1024).toFixed(0)} KB copied on the GPU in ${r.copies}` : ''}${r.bitmaps ? `, ${r.bitmaps} bitmap transfers` : ''}`;
  const rd = r.readers.length ? `\n    readers: ${r.readers.map(([k, v]) => `${k} ${v}`).join(', ')}` : '';
  const wr = r.written.length ? `\n    written: ${r.written.map(([k, v]) => `${k} ${v}`).join(', ')}` : '';
  const up = r.uploaders?.length ? `\n    uploaded (KB): ${r.uploaders.map(([k, v]) => `${k} ${v}`).join(', ')}` : '';
  return head + rd + wr + up;
}

const api = { start, stop, totals: () => ({ ...tot, live }), on: () => installed };
export const motionBudget = api;

// (On at load when the address asks: ?perf (the readout shows each window's budget) or ?budget=1 (counting only, for a headless run
// reading pps.motionBudget). Imported first by main.js, so the contexts the page makes at start are counted too.)
if (typeof location !== 'undefined' && /[?&](?:perf\b|budget=1\b)/.test(location.search)) installMotionBudget({ skip: (el) => !!el.closest?.('#perfReadout') });
