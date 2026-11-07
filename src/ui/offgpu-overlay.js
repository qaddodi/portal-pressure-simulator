// ?offgpu=1 in the address: a live count of the work that is not on the GPU, per frame, flashing red when any of it happens while
// something moves. Never loaded without the flag, so a plain load is untouched.
//
// Counted (by wrapping the browser's own methods, so nothing in the app has to report it):
//   2D     canvas 2D drawing: drawImage, putImageData, getImageData, fills, strokes, text, clears
//   SVG    SVG work: an SVG element created or its attributes written, an image loaded from SVG
//   layout layout reads: getBoundingClientRect, getClientRects, getComputedStyle, offset*, client*, scroll*
//   upload texture uploads (texImage*/texSubImage*/compressed*), with their size; red only from UPLOAD_RED bytes in one frame
//   shader shader compiles and links, and synchronous status reads (COMPILE_STATUS, LINK_STATUS)
// "While something moves": the scheduler's frame followed another without a pause (an animation, a zoom, a swipe), or a pointer is
// down, or a wheel turned in the last 150 ms. Work done between frames (a timer, an event) counts with the next frame.
// The first few call sites in a moving frame are kept (from the stack) and the last one is shown, so a red flash names its cause.
// window.pps.offgpu() returns the totals and the recent sites (for tests and the console).
import { restPass } from './rest-pass.js';
import { watchFrames } from './frame.js';

const KINDS = ['2d', 'svg', 'layout', 'upload', 'shader'];
const UPLOAD_RED = 512 * 1024;   // (small row updates every frame are the GPU's normal diet; a big re-upload is the stall)
const SITES_PER_FRAME = 3;
const zero = () => ({ '2d': 0, svg: 0, layout: 0, upload: 0, shader: 0, bytes: 0 });

let now = zero(), spare = zero();   // (the frame's counts, and the last frame's, written over for the next: no new object a frame)
// A set of counts put back to zero, in place.
function resetCounts(o) { o['2d'] = 0; o.svg = 0; o.layout = 0; o.upload = 0; o.shader = 0; o.bytes = 0; return o; }
const total = zero(), inMotion = zero(), sites = [];
let quiet = 0;   // >0 while the overlay itself runs (its own work is never counted)

function site() {
  const s = (new Error().stack || '').split('\n').slice(2).find((l) => !/offgpu-overlay/.test(l)) || '';
  return s.trim().replace(/^at\s+/, '').replace(/\?v=[0-9a-f]+/g, '').replace(/https?:\/\/[^/]+\//, '').slice(0, 120);
}
function count(kind, what, bytes = 0) {
  if (quiet) return;
  now[kind]++; total[kind]++;
  if (bytes) { now.bytes += bytes; total.bytes += bytes; }
  if (moveNow() && now.sitesTaken !== undefined && now.sitesTaken < SITES_PER_FRAME && (kind !== 'upload' || bytes >= UPLOAD_RED)) {
    now.sitesTaken++;
    sites.push(`${kind} ${what} ← ${site()}`);
    if (sites.length > 12) sites.shift();
  }
}

// ---- hooks ----
function wrap(proto, name, kind, bytesOf) {
  const d = proto && Object.getOwnPropertyDescriptor(proto, name);
  if (!d || typeof d.value !== 'function') return;
  const orig = d.value;
  proto[name] = function (...a) { count(kind, name, bytesOf ? bytesOf(a, this) : 0); return orig.apply(this, a); };
}
function wrapGet(proto, name, kind) {
  const d = proto && Object.getOwnPropertyDescriptor(proto, name);
  if (!d || !d.get) return;
  const get = d.get;
  Object.defineProperty(proto, name, { ...d, get() { count(kind, name); return get.call(this); } });
}
const pixelsOf = (src) => (src && (src.videoWidth || src.naturalWidth || src.width || 0) * (src.videoHeight || src.naturalHeight || src.height || 0) * 4) || 0;
// texImage2D(target, level, internal, w, h, border, format, type, data) or (target, level, internal, format, type, source);
// texSubImage2D(target, level, x, y, w, h, format, type, data) or (target, level, x, y, format, type, source).
const texBytes = (sub) => (a) => {
  const n = a.length;
  if (n >= 8) {
    const w = a[sub ? 4 : 3], h = a[sub ? 5 : 4];
    if (typeof w === 'number' && typeof h === 'number') return w * h * 4;
  }
  return pixelsOf(a[n - 1]);
};
const tex3Bytes = (sub) => (a) => { const w = a[sub ? 5 : 3], h = a[sub ? 6 : 4], d = a[sub ? 7 : 5]; return typeof w === 'number' ? w * h * (d || 1) * 4 : pixelsOf(a[a.length - 1]); };

function install() {
  const C2 = [globalThis.CanvasRenderingContext2D?.prototype, globalThis.OffscreenCanvasRenderingContext2D?.prototype];
  for (const p of C2) for (const m of ['drawImage', 'putImageData', 'getImageData', 'fillRect', 'strokeRect', 'clearRect', 'fill', 'stroke', 'fillText', 'strokeText']) wrap(p, m, '2d');
  const GL = [globalThis.WebGLRenderingContext?.prototype, globalThis.WebGL2RenderingContext?.prototype];
  for (const p of GL) {
    wrap(p, 'texImage2D', 'upload', texBytes(false)); wrap(p, 'texSubImage2D', 'upload', texBytes(true));
    wrap(p, 'texImage3D', 'upload', tex3Bytes(false)); wrap(p, 'texSubImage3D', 'upload', tex3Bytes(true));
    wrap(p, 'compressedTexImage2D', 'upload', (a) => a[a.length - 1]?.byteLength || 0); wrap(p, 'compressedTexSubImage2D', 'upload', (a) => a[a.length - 1]?.byteLength || 0);
    wrap(p, 'compileShader', 'shader'); wrap(p, 'linkProgram', 'shader');
    for (const m of ['getShaderParameter', 'getProgramParameter']) {
      const d = p && Object.getOwnPropertyDescriptor(p, m);
      if (!d) continue;
      const orig = d.value;
      p[m] = function (o, pname) { if (pname === this.COMPILE_STATUS || pname === this.LINK_STATUS) count('shader', pname === this.LINK_STATUS ? 'LINK_STATUS' : 'COMPILE_STATUS'); return orig.call(this, o, pname); };
    }
  }
  const E = globalThis.Element?.prototype, H = globalThis.HTMLElement?.prototype;
  wrap(E, 'getBoundingClientRect', 'layout'); wrap(E, 'getClientRects', 'layout');
  for (const g of ['clientWidth', 'clientHeight', 'clientTop', 'clientLeft', 'scrollWidth', 'scrollHeight', 'scrollTop', 'scrollLeft']) wrapGet(E, g, 'layout');
  for (const g of ['offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft', 'offsetParent']) wrapGet(H, g, 'layout');
  if (typeof globalThis.getComputedStyle === 'function') {
    const gcs = globalThis.getComputedStyle;
    globalThis.getComputedStyle = function (...a) { count('layout', 'getComputedStyle'); return gcs.apply(this, a); };
  }
  const S = globalThis.SVGElement?.prototype;
  if (S) {
    // (setAttribute lives on Element; only an SVG element's writes count.)
    for (const m of ['setAttribute', 'setAttributeNS']) {
      const orig = E[m];
      E[m] = function (...a) { if (this instanceof SVGElement) count('svg', m); return orig.apply(this, a); };
    }
    const ns = Document.prototype.createElementNS;
    Document.prototype.createElementNS = function (n, ...r) { if (/svg/.test(n || '')) count('svg', 'createElementNS'); return ns.call(this, n, ...r); };
  }
  const src = globalThis.HTMLImageElement && Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (src?.set) Object.defineProperty(HTMLImageElement.prototype, 'src', { ...src, set(v) { if (/svg\+xml|\.svg(\?|$)/.test(String(v))) count('svg', 'img.src (svg)'); src.set.call(this, v); } });
}

// ---- motion ----
let pointers = 0, wheelAt = -1e9, chained = false;
const moveNow = () => chained || pointers > 0 || performance.now() - wheelAt < 150;

// ---- the readout ----
let el = null, shownAt = 0, red = false, redUntil = 0, sec = zero(), secAt = 0, secShown = zero(), redFrames = 0;
function ensureEl() {
  if (el) return el;
  quiet++;
  el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;right:8px;top:calc(64px + env(safe-area-inset-top));z-index:var(--z-diag);pointer-events:none;padding:5px 9px;border-radius:8px;'
    + 'background:rgb(var(--night-rgb) / .78);color:var(--white);font:600 12px/1.45 ui-monospace,monospace;white-space:pre-wrap;max-width:min(560px,calc(100vw - 16px));box-sizing:border-box';
  const flash = document.createElement('div');
  flash.style.cssText = 'position:absolute;inset:0;border-radius:8px;background:var(--danger);opacity:0;transition:opacity .25s';
  const text = document.createElement('div');
  text.style.cssText = 'position:relative';
  el.append(flash, text);
  document.body.append(el);
  quiet--;
  return el;
}
const line = (c) => `2D ${c['2d']} · SVG ${c.svg} · layout ${c.layout} · upload ${c.upload} (${(c.bytes / 1048576).toFixed(1)} MB) · shader ${c.shader}`;
function writeShow() {
  quiet++;
  try {
    const e = ensureEl();
    e.firstChild.style.opacity = red ? '0.9' : '0';
    e.lastChild.textContent = `off GPU, last second: ${line(secShown)}\nwhile moving, since load: ${line(inMotion)}  (${redFrames} red frames)\n`
      + (sites.length ? `last: ${sites[sites.length - 1]}` : 'last: none');
  } finally { quiet--; }
}
let askedShow = false;
function runShow() { askedShow = false; writeShow(); }
// (Asked from a frame, written between frames: shownAt is stamped now so a frame does not ask again before it runs.)
function show(t) { shownAt = t; if (!askedShow) { askedShow = true; restPass(runShow); } }

function onFrame(f) {
  chained = f.gap > 0;
  const mv = moveNow();
  const c = now;
  now = resetCounts(spare); spare = c; now.sitesTaken = 0;
  for (const k of KINDS) sec[k] += c[k];
  sec.bytes += c.bytes;
  if (mv) {
    for (const k of KINDS) inMotion[k] += c[k];
    inMotion.bytes += c.bytes;
    const bad = c['2d'] || c.svg || c.layout || c.shader || c.bytes >= UPLOAD_RED;
    if (bad) { redFrames++; redUntil = f.now + 400; }
  }
  if (f.now - secAt >= 1000) { const t = secShown; secShown = sec; sec = resetCounts(t); secAt = f.now; }
  const r = f.now < redUntil;
  // (The readout is written between frames, never in one: rest-pass.js.)
  if (r !== red || f.now - shownAt > 250) { red = r; show(f.now); }
}

export function startOffGpuOverlay() {
  install();
  now.sitesTaken = 0;
  addEventListener('pointerdown', () => { pointers++; }, { capture: true, passive: true });
  const up = () => { pointers = Math.max(0, pointers - 1); };
  addEventListener('pointerup', up, { capture: true, passive: true });
  addEventListener('pointercancel', up, { capture: true, passive: true });
  addEventListener('wheel', () => { wheelAt = performance.now(); }, { capture: true, passive: true });
  watchFrames(onFrame);
  ensureEl();   // (built once, here, outside any frame)
  // (Shown at once and kept current when nothing moves: a timer, never a frame of its own.)
  show(performance.now());
  setInterval(() => { if (performance.now() - shownAt > 1000) { red = performance.now() < redUntil; const t = secShown; secShown = sec; sec = resetCounts(t); secAt = performance.now(); show(performance.now()); } }, 1000);
  (globalThis.pps ||= {}).offgpu = () => ({ total: { ...total }, inMotion: { ...inMotion }, redFrames, sites: [...sites] });
}
