// The render graph's budget (R06, 2 Nov 2026: "budget the whole render graph, not each canvas").
//
// The 8 MP cap (pixel-budget.js) bounds one canvas. This bounds the whole: every texture, renderbuffer and vertex buffer any WebGL2
// context allocates is entered in one registry (owner, format, size, samples, levels, estimated bytes), and every frame's passes are
// counted (target switches, the logical pixel area drawn and cleared, the area copied by blits and copies). Both are held against an
// envelope per device class (phone, tablet, desktop):
// - memory: the estimated bytes of everything allocated, the canvases' own buffers included;
// - passes: the logical pixel area a frame draws, in screens (one screen = the window's device pixels).
// Nothing here queries the GPU. The registry is fed by gl-state.js's wrappers (R09), which already see every state call; a draw adds
// two numbers. A frame that runs over the pass envelope, or a registry over the memory envelope, is pressure (overBudget()), which the
// quality tiers read (adapt-tier.js, R07) to step the scene's resolution down before the motion skips frames.
// Read it: ?perf (the readout's Surfaces block ends with the budget), or pps.budget() in the console.

import { onGLCall, glRec } from './gl-state.js';
import { onFrameEnd } from './frame.js';

const SEARCH = typeof location !== 'undefined' ? location.search || '' : '';
// (With ?perf, each entry keeps the line of code that made it, so the readout names the biggest creators: a leak names itself.)
const SITES = /[?&]perf\b/.test(SEARCH);
const siteOf = () => {
  const lines = String(new Error().stack || '').split('\n');
  for (const l of lines) if (/\.js/.test(l) && !/gpu-budget\.js|gl-state\.js/.test(l)) return l.trim().replace(/^at\s+/, '').replace(/\?v=[0-9a-f]+/g, '').replace(/^.*\/src\/ui\//, '').replace(/^.*\/(assets|dist)\//, '');
  return '?';
};

// Envelopes per device class (estimated bytes; pass area in screens per frame). A phone's GPU shares about 6 GB with everything; a
// page that holds past a few hundred MB is the first Safari reclaims. Eight screens a frame is about what a 120 Hz phone GPU fills
// in its share of an 8 ms frame with the shaders this app runs (illustrative, not measured: see docs/gpu-practices.md, bandwidth).
export const ENVELOPES = {
  phone: { mb: 320, screens: 8 },
  tablet: { mb: 512, screens: 8 },
  desktop: { mb: 1536, screens: 10 },   // (3 Nov 2026: was 1024, a figure that was never measured; the 8 MP figure canvas and its layers read 1190–1330 MB on a Mac with nothing wrong)
};
export function deviceClass() {
  const s = globalThis.screen, short = s ? Math.min(s.width, s.height) : 1024;
  const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;
  return short < 500 ? 'phone' : touch && short < 1100 ? 'tablet' : 'desktop';
}

// Bytes per texel of the formats this app allocates (sized formats; an unsized one by its type).
const BPP = {};
function bppOf(gl, ifmt, type) {
  if (!BPP.ready) {
    const t = [[gl.RGBA8, 4], [gl.SRGB8_ALPHA8, 4], [gl.RGB8, 4], [gl.RG8, 2], [gl.R8, 1], [gl.RGBA16UI, 8], [gl.RGBA16I, 8], [gl.RG16UI, 4], [gl.R16UI, 2],
      [gl.RGBA32UI, 16], [gl.RG32UI, 8], [gl.R32UI, 4], [gl.RGBA16F, 8], [gl.RG16F, 4], [gl.R16F, 2], [gl.RGBA32F, 16], [gl.RG32F, 8], [gl.R32F, 4],
      [gl.RGB10_A2, 4], [gl.DEPTH24_STENCIL8, 4], [gl.DEPTH_COMPONENT24, 4], [gl.DEPTH_COMPONENT16, 2], [gl.STENCIL_INDEX8, 1], [gl.RGBA4, 2], [gl.RGB565, 2], [gl.RGB5_A1, 2]];
    for (const [k, v] of t) if (k != null) BPP[k] = v;
    BPP.ready = true;
  }
  if (BPP[ifmt]) return BPP[ifmt];
  const per = type === gl.FLOAT ? 4 : type === gl.HALF_FLOAT ? 2 : 1;
  const ch = ifmt === gl.RGBA ? 4 : ifmt === gl.RGB ? 4 : ifmt === gl.LUMINANCE_ALPHA ? 2 : 1;
  return ch * per;
}
const FMT_NAME = (gl, f) => { for (const k of ['RGBA8', 'RGBA16UI', 'RG16UI', 'R8', 'RGBA16F', 'RGBA32F', 'R32F', 'RG8', 'DEPTH24_STENCIL8', 'STENCIL_INDEX8', 'RGBA', 'RGB', 'ALPHA']) if (gl[k] === f) return k; return `0x${Number(f).toString(16)}`; };

// The registry: one entry per object, held weakly (an object the page let go of and the collector took leaves it too).
let nextId = 1;
const entries = new Map();          // id -> entry
const byObj = new WeakMap();        // GL object -> entry
// (regBytes: the entries' bytes summed, kept as they change, so the memory check twice a second walks nothing and allocates nothing:
// plan rev 2 §2.8. Every change to an entry's bytes or to the map goes through setLevel and forget.)
let regBytes = 0;
function forget(id) { const e = entries.get(id); if (!e) return; regBytes -= e.bytes; entries.delete(id); }
const gone = typeof FinalizationRegistry !== 'undefined' ? new FinalizationRegistry(forget) : null;
const owners0 = new WeakMap();      // gl -> owner name
const ctxRefs = [];                 // WeakRef of each context (a context the page let go of drops out)
const ownerOf = (gl) => owners0.get(gl) || 'webgl2';

/** Names context gl's allocations in the registry (default: its canvas's id or first class). */
export function budgetOwner(gl, name) { owners0.set(gl, name); }

function entryFor(gl, obj, kind) {
  if (!obj) return null;
  let e = byObj.get(obj);
  if (!e) {
    e = { id: nextId++, owner: ownerOf(gl), kind, fmt: '', w: 0, h: 0, d: 1, samples: 0, levels: new Map(), bytes: 0, site: SITES ? siteOf() : '' };
    byObj.set(obj, e); entries.set(e.id, e); gone?.register(obj, e.id);
  }
  return e;
}
const ctxRef = (gl) => (typeof WeakRef !== 'undefined' ? new WeakRef(gl) : { deref: () => gl });
function setLevel(e, level, bytes) { e.levels.set(level, bytes); let b = 0; for (const v of e.levels.values()) b += v; if (entries.get(e.id) === e) regBytes += b - e.bytes; e.bytes = b; }
function drop(obj) { const e = obj && byObj.get(obj); if (e) { forget(e.id); byObj.delete(obj); gone?.unregister?.(obj); } }

// This frame's passes, and the last frames'.
const cur = { targets: 0, draws: 0, area: 0, copies: 0, copyArea: 0, transfers: 0, transferArea: 0, uploads: 0, uploadArea: 0, lastFb: undefined };
const last = { targets: 0, draws: 0, area: 0, copies: 0, copyArea: 0, transfers: 0, transferArea: 0, uploads: 0, uploadArea: 0 };
const PASS_KEYS = Object.keys(last);
let worst = { area: 0, at: 0 }, overFrames = 0, overMem = false, warnedMem = false, memAt = 0;

function onCall(gl, name, x, n) {
  if (name === 'draw' || name === 'clear') { cur.draws++; cur.area += x; return; }
  if (name === 'copy') { cur.copies++; cur.copyArea += x; return; }
  if (name === 'target') { if (x !== cur.lastFb) { cur.targets++; cur.lastFb = x; } return; }
  if (name === 'context') {
    if (!owners0.has(gl)) { const c = gl.canvas; owners0.set(gl, c?.id || (typeof c?.className === 'string' && c.className.split(' ')[0]) || (c && !c.isConnected ? 'offscreen' : 'canvas')); }
    if (typeof WeakRef !== 'undefined') ctxRefs.push(new WeakRef(gl));
    return;
  }
  if (name === 'restored') { for (const [id, e] of entries) if (e.gl?.deref?.() === gl) forget(id); return; }
  if (name.startsWith('delete')) { drop(x); return; }   // (x: the object let go)
  const r = glRec(gl);
  if (!r) return;
  const a = x;
  if (name === 'texStorage2D') {
    if (a[0] !== gl.TEXTURE_2D) return;   // (only the 2D binding is in the record: a 3D or array texture is left out, never credited to it)
    const tex = r.tex.get(r.unit), e = entryFor(gl, tex, 'texture'); if (!e) return;
    const levels = a[1], ifmt = a[2], w = a[3], h = a[4], d = a[5] === undefined ? 1 : a[5], bpp = bppOf(gl, ifmt);
    e.fmt = FMT_NAME(gl, ifmt); e.w = w; e.h = h; e.d = d; e.levels.clear(); if (entries.get(e.id) === e) regBytes -= e.bytes; e.bytes = 0; e.gl = ctxRef(gl);
    let b = 0; for (let l = 0, lw = w, lh = h; l < levels; l++, lw = Math.max(1, lw >> 1), lh = Math.max(1, lh >> 1)) b += lw * lh * d * bpp;
    setLevel(e, 0, b); e.nLevels = levels; e.bpp = bpp;
  } else if (name === 'texImage2D') {
    if (a[0] !== gl.TEXTURE_2D) return;   // (a cube face or another target: not this app's)
    const tex = r.tex.get(r.unit), e = entryFor(gl, tex, 'texture'); if (!e) return;
    let w, h, type;
    if (n >= 8) { w = a[3]; h = a[4]; type = a[7]; } else { const src = a[5]; w = src?.width || src?.videoWidth || 0; h = src?.height || src?.videoHeight || 0; type = a[4]; }
    const bpp = bppOf(gl, a[2], type);
    if (a[1] === 0) { e.fmt = FMT_NAME(gl, a[2]); e.w = w; e.h = h; }
    e.gl = ctxRef(gl);
    if (a[1] === 0) e.bpp = bpp;
    setLevel(e, a[1], w * h * bpp);
  } else if (name === 'copyTexImage2D') {
    // (B11: storage made by copying from the framebuffer: copyTexImage2D(target, level, internalformat, x, y, width, height, border).)
    if (a[0] !== gl.TEXTURE_2D) return;
    const tex = r.tex.get(r.unit), e = entryFor(gl, tex, 'texture'); if (!e) return;
    const bpp = bppOf(gl, a[2]), w = a[5] | 0, h = a[6] | 0;
    if (a[1] === 0) { e.fmt = FMT_NAME(gl, a[2]); e.w = w; e.h = h; e.bpp = bpp; }
    e.gl = ctxRef(gl);
    setLevel(e, a[1], w * h * bpp);
  } else if (name === 'generateMipmap') {
    // (B11: the levels below the base, down to 1 x 1, from the base level's size and format. An immutable texture (texStorage2D) already
    // counted its whole chain.)
    if (a[0] !== gl.TEXTURE_2D) return;
    const tex = r.tex.get(r.unit), e = tex && byObj.get(tex); if (!e || e.nLevels || !(e.w > 0 && e.h > 0) || !e.bpp) return;
    for (let l = 1, lw = e.w, lh = e.h; lw > 1 || lh > 1; l++) { lw = Math.max(1, lw >> 1); lh = Math.max(1, lh >> 1); setLevel(e, l, lw * lh * e.bpp); }
  } else if (name === 'renderbufferStorage' || name === 'renderbufferStorageMultisample') {
    const e = entryFor(gl, r.rb, 'renderbuffer'); if (!e) return;
    const ms = name === 'renderbufferStorageMultisample', samples = ms ? a[1] : 0, ifmt = ms ? a[2] : a[1], w = ms ? a[3] : a[2], h = ms ? a[4] : a[3];
    e.fmt = FMT_NAME(gl, ifmt); e.w = w; e.h = h; e.samples = samples; e.gl = ctxRef(gl);
    setLevel(e, 0, w * h * bppOf(gl, ifmt) * Math.max(1, samples));
  } else if (name === 'bufferData') {
    if (a[0] !== gl.ARRAY_BUFFER) return;   // (the bound element or uniform buffer is not in the record: left out)
    const e = entryFor(gl, r.buf, 'buffer'); if (!e) return;
    const n = typeof a[1] === 'number' ? a[1] : a[1]?.byteLength || 0;
    e.w = n; e.h = 1; e.fmt = 'bytes'; e.gl = ctxRef(gl);
    setLevel(e, 0, n);
  }
}

// The context budget (plan item 5, 2 Nov 2026): at most CTX_MAX live contexts of the page's own plus the charts' (the offscreen pool
// contexts that trace-gl.js hands to whichever charts show). A page holds only so many (iOS Safari about 16, dropping the oldest, which is
// the figure's). Dev only (?perf or a local host): a count above it is logged once per new high, with the owners. Walks the
// weak list in place and allocates nothing unless it speaks.
export const CTX_MAX = 2;
const CTX_ASSERT = SITES || (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname || ''));
let ctxWarned = 0;
const ctxCounts = { own: 0, charts: 0 };
/** Live contexts now: { own, charts } (charts: the offscreen pool contexts). The same object each time: read it in the call. */
export function contextCount() {
  let own = 0, charts = 0;
  for (let i = ctxRefs.length - 1; i >= 0; i--) {
    const gl = ctxRefs[i].deref();
    if (!gl) { ctxRefs.splice(i, 1); continue; }
    if (gl.isContextLost?.()) continue;
    if (ownerOf(gl) === 'offscreen') charts++; else own++;
  }
  ctxCounts.own = own; ctxCounts.charts = charts;
  return ctxCounts;
}
function checkContexts() {
  const c = contextCount();
  if (c.own <= CTX_MAX) { ctxWarned = Math.min(ctxWarned, c.own); return; }
  if (c.own <= ctxWarned) return;
  ctxWarned = c.own;
  const names = []; for (let i = 0; i < ctxRefs.length; i++) { const gl = ctxRefs[i].deref(); if (gl && !gl.isContextLost?.() && ownerOf(gl) !== 'offscreen') names.push(ownerOf(gl)); } // alloc-rare: only when the number of live contexts rises past its last high (a dev warning, ?perf or localhost)
  console.warn(`WebGL contexts over budget: ${c.own} of the page's own live (at most ${CTX_MAX}, plus ${c.charts} for charts)`, names); // alloc-rare: only when the number of live contexts rises past its last high (a dev warning, ?perf or localhost)
}

// The canvases' own buffers: colour, and depth/stencil, at their backing size, twice (the one shown and the one drawn).
function canvasBytes() {
  let b = 0;
  for (let i = ctxRefs.length - 1; i >= 0; i--) {
    const gl = ctxRefs[i].deref();
    if (!gl) { ctxRefs.splice(i, 1); continue; }   // (a context the page let go of drops out)
    const c = gl.canvas; if (c && !gl.isContextLost?.()) b += c.width * c.height * 8 * 2;
  }
  return b;
}
// (The window's size in device pixels, read once and again after a resize: innerWidth and innerHeight make the browser lay the page out
// first, and this was read at the end of every frame, after the frame's writes (about 0.6 ms a frame on a phone's change of view).)
let scrPx = 0;
const scrDirty = () => { scrPx = 0; };
if (typeof globalThis.addEventListener === 'function') { globalThis.addEventListener('resize', scrDirty); globalThis.addEventListener('orientationchange', scrDirty); }
const screenPx = () => {
  if (scrPx) return scrPx;
  const d = globalThis.devicePixelRatio || 1;
  return (scrPx = Math.max(1, (globalThis.innerWidth || 1) * (globalThis.innerHeight || 1) * d * d));
};

/** The bytes the registry holds for the contexts named owner (a holder's own count of what its context keeps; walks the entries, no list made). */
export function ownerBytes(owner) { let b = 0; for (const e of entries.values()) if (e.owner === owner) b += e.bytes; return b; }

/** The registry and the passes now: bytes against the memory envelope, the last frame's area against the pass envelope. */
export function budget() {
  const env = ENVELOPES[deviceClass()];
  const owners = new Map(); // alloc-rare: a report read by the ?perf readout and the tests, and once when memory first runs over its envelope
  let bytes = 0;
  for (const e of entries.values()) { bytes += e.bytes; const o = owners.get(e.owner) || { owner: e.owner, bytes: 0, n: 0 }; o.bytes += e.bytes; o.n++; owners.set(e.owner, o); } // alloc-rare: a report read by the ?perf readout and the tests, and once when memory first runs over its envelope
  const canvases = canvasBytes();
  bytes += canvases;
  const big = [...entries.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 8).map((e) => ({ owner: e.owner, kind: e.kind, fmt: e.fmt, w: e.w, h: e.h, samples: e.samples, levels: e.nLevels || e.levels.size, mb: +(e.bytes / 1e6).toFixed(1) })); // alloc-rare: a report read by the ?perf readout and the tests, and once when memory first runs over its envelope
  const sites = new Map(); // alloc-rare: a report read by the ?perf readout and the tests, and once when memory first runs over its envelope
  if (SITES) for (const e of entries.values()) { const k = `${e.owner} ${e.kind} ${e.site}`; const o = sites.get(k) || { site: k, n: 0, bytes: 0 }; o.n++; o.bytes += e.bytes; sites.set(k, o); } // alloc-rare: a report read by the ?perf readout and the tests, and once when memory first runs over its envelope
  const creators = [...sites.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 8).map((o) => ({ site: o.site, n: o.n, mb: +(o.bytes / 1e6).toFixed(1) })); // alloc-rare: a report read by the ?perf readout and the tests, and once when memory first runs over its envelope
  const scr = screenPx();
  return { // alloc-rare: a report read by the ?perf readout and the tests, and once when memory first runs over its envelope
    creators,
    device: deviceClass(), envelope: env,
    mb: +(bytes / 1e6).toFixed(1), canvasesMb: +(canvases / 1e6).toFixed(1), overMemory: bytes > env.mb * 1e6, // alloc-rare: a report read by the ?perf readout and the tests, and once when memory first runs over its envelope
    owners: [...owners.values()].sort((a, b) => b.bytes - a.bytes).map((o) => ({ owner: o.owner, n: o.n, mb: +(o.bytes / 1e6).toFixed(1) })), // alloc-rare: a report read by the ?perf readout and the tests, and once when memory first runs over its envelope
    largest: big,
    frame: { targets: last.targets, draws: last.draws, screens: +(last.area / scr).toFixed(2), copies: last.copies, copyScreens: +(last.copyArea / scr).toFixed(2), transfers: last.transfers, transferScreens: +(last.transferArea / scr).toFixed(2), uploads: last.uploads, uploadScreens: +(last.uploadArea / scr).toFixed(2) }, // alloc-rare: a report read by the ?perf readout and the tests, and once when memory first runs over its envelope
    holders: holdersNow(),
    worstScreens: +(worst.area / scr).toFixed(2), overPassFrames: overFrames, // alloc-rare: a report read by the ?perf readout and the tests, and once when memory first runs over its envelope
  };
}

/** A pass this registry cannot see through gl-state (a picture handed to another canvas: transferToImageBitmap, a texture upload
 *  from an image): kind 'transfer' or 'upload', area in device px. Counted with the frame's copies (review pass item 6). */
export function notePass(kind, area) {
  if (kind === 'transfer') { cur.transfers++; cur.transferArea += area; } else { cur.uploads++; cur.uploadArea += area; }
  cur.copies++; cur.copyArea += area;
}

// ── The enforceable part (review pass item 8, 2 Nov 2026) ──
// Counting is not a budget unless something gives memory back when it runs over. Every resource kept only so that a later frame need
// not make it again registers here as a holder, with what it holds (bytes(), its own estimate)
// and how to let it go (release()). Two kinds:
//   - 'warm': kept for a view out of sight (the vessel layer under the lobule, the painter's targets after a paint). Held to WARM_SHARE
//     of the envelope and WARM_MAX holders together, besides each one's own time (warm-views.js WARM_MS): past either, the one used
//     longest ago is let go first. So rapid navigation never piles up twelve seconds of every view visited.
//   - 'retained': caches a shown view draws from (a chart's still layers, the shared glass blur). Let go only while the whole registry is
//     over its envelope, after every warm one, the least recently used first.
// Ownership: the holder's owner made the resource and is the only one that deletes it; release() is the owner's own disposal, called at
// most once (the holder leaves the registry first), and the owner makes it again on its next use. A context lost forgets its holders
// without a call (what they held is gone with it); a restored context's owners make theirs afresh, under fresh generations of their own,
// and register again. enforce() runs on every hold() and twice a second while frames run.
export const WARM_SHARE = 0.25, WARM_MAX = 6;
const holders = new Set();
let evictions = 0;
const holderBytes = (h) => { try { return Math.max(0, +h.bytes() || 0); } catch { return 0; } };
/**
 * A resource kept for later: { owner, kind: 'warm' | 'retained', bytes(), release(), gl? }. Returns { touch() (just used: last to go),
 * drop() (the owner let it go itself, or uses it again as shown), get held }.
 */
export function hold(spec) {
  const h = { owner: spec.owner || 'gpu', kind: spec.kind === 'retained' ? 'retained' : 'warm', bytes: spec.bytes || (() => 0), release: spec.release, gl: spec.gl || null, at: nowMs() }; // alloc-rare: once per held resource: its owner touches an existing holder instead of holding again
  holders.add(h);
  const handle = { // alloc-rare: once per held resource: its owner touches an existing holder instead of holding again
    touch() { if (holders.has(h)) h.at = nowMs(); },   // (cheap: called on every chart frame; enforce() runs on hold() and the tick)
    drop() { holders.delete(h); },
    get held() { return holders.has(h); }, // alloc-rare: once per held resource: its owner touches an existing holder instead of holding again
  };
  enforce();
  return handle;
}
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
// (recs-production-120hz §12: a release that throws is a failure, kept visible (releaseFails), and its bytes are not counted as reclaimed.)
let releaseFails = 0, unmet = 0;
function letGo(h) {
  holders.delete(h);
  try { h.release?.(); evictions++; return true; } catch (e) { releaseFails++; console.warn(`GPU budget: ${h.owner} could not let go of what it held.`, e); return false; } // alloc-rare: only when a holder's release throws, once, as a warning
}
/** Gives back held resources until the warm ones are within their share and count and the registry within its envelope. */
export function enforce(env = ENVELOPES[deviceClass()]) {
  for (const h of holders) if (h.gl?.isContextLost?.()) holders.delete(h);   // (gone with its context: forgotten, nothing called)
  // (The usual case, nothing to give back, is told by sums over the holders alone: no list is made, plan rev 2 §2.8.)
  {
    let wn = 0, wb = 0, held = 0;
    for (const h of holders) { const hb = holderBytes(h); held += hb; if (h.kind === 'warm') { wn++; wb += hb; } }
    const total = Math.max(registryBytes(), held);
    if (wn <= WARM_MAX && wb <= env.mb * 1e6 * WARM_SHARE && total <= env.mb * 1e6) { unmet = 0; return 0; }
  }
  const before = evictions;
  const lru = (kind) => [...holders].filter((h) => h.kind === kind).sort((a, b) => a.at - b.at); // alloc-rare: only when the holders are over their share or the registry over its envelope (looked at twice a second)
  // (warm: by count, then by their share of the envelope)
  let warm = lru('warm');
  while (warm.length > WARM_MAX) letGo(warm.shift());
  let warmBytes = warm.reduce((a, h) => a + holderBytes(h), 0); // alloc-rare: only when the holders are over their share or the registry over its envelope (looked at twice a second)
  while (warm.length && warmBytes > env.mb * 1e6 * WARM_SHARE) { const h = warm.shift(), b = holderBytes(h); if (letGo(h)) warmBytes -= b; }
  // (the whole: the registry's bytes, or the holders' own where it counts nothing)
  let total = registryBytes(), held = 0;
  for (const h of holders) held += holderBytes(h);
  total = Math.max(total, held);   // (the registry already counts what holders hold)
  const over = () => total > env.mb * 1e6; // alloc-rare: only when the holders are over their share or the registry over its envelope (looked at twice a second)
  for (const kind of ['warm', 'retained']) for (const h of lru(kind)) { if (!over()) break; const b = holderBytes(h); if (letGo(h)) total -= b; } // alloc-rare: only when the holders are over their share or the registry over its envelope (looked at twice a second)
  // (What is left over the envelope once every holder has been asked: pressure no release met, reported, never taken as solved.)
  unmet = over() ? total - env.mb * 1e6 : 0;
  return evictions - before;
}
function registryBytes() { return canvasBytes() + regBytes; }
/** The holders now (tests and ?perf). */
export function holdersNow() { return { evictions, releaseFails, unmetMB: +(unmet / 1e6).toFixed(1), list: [...holders].map((h) => ({ owner: h.owner, kind: h.kind, mb: +(holderBytes(h) / 1e6).toFixed(1) })) }; } // alloc-rare: a report read by the ?perf readout and the tests

/** True while the render graph is over its envelope: the last frames ran past the pass envelope, or the registry past memory's. */
export function overBudget() { return overMem || overFrames >= 2; }
/** True while the registry is over its memory envelope (the last look, twice a second): work that only prepares ahead waits. */
export function overMemory() { return overMem; }

/** The ?perf readout's lines. */
export function budgetText() {
  const b = budget();
  const lines = [`GPU budget (${b.device}): ${b.mb} of ${b.envelope.mb} MB${b.overMemory ? ' OVER' : ''} (canvases ${b.canvasesMb}); last frame ${b.frame.screens} of ${b.envelope.screens} screens drawn, ${b.frame.targets} target switches, ${b.frame.draws} passes, ${b.frame.copies} copies (${b.frame.copyScreens} screens); worst ${b.worstScreens}`];
  for (const o of b.owners.slice(0, 6)) lines.push(`  ${o.owner}: ${o.mb} MB in ${o.n}`);
  if (b.creators.length) { lines.push('  Biggest creators (owner, kind, line that made them):'); for (const c of b.creators) lines.push(`    ${c.mb} MB in ${c.n}: ${c.site}`); }
  lines.push(`  pictures handed over ${b.frame.transfers} (${b.frame.transferScreens} screens), uploads ${b.frame.uploads} (${b.frame.uploadScreens}); held ${b.holders.list.length}, let go ${b.holders.evictions}`);
  return lines.join('\n');
}

onGLCall(onCall);
// (Each frame the scheduler runs: its passes become the last frame's, and are held against the pass envelope.)
onFrameEnd((f) => {
  const scr = screenPx(), env = ENVELOPES[deviceClass()];
  for (let i = 0; i < PASS_KEYS.length; i++) { const k = PASS_KEYS[i]; last[k] = cur[k]; cur[k] = 0; }
  cur.lastFb = undefined;
  const area = last.area + last.copyArea;
  if (area > worst.area || f.now - worst.at > 5000) { worst.area = area; worst.at = f.now; }   // (in place: nothing made a frame)
  overFrames = area > env.screens * scr ? overFrames + 1 : 0;
  // (Memory is looked at twice a second, only while frames run (an idle page counts nothing): an envelope crossed is logged once,
  // with what holds the most.)
  if (f.now - memAt > 500) {
    memAt = f.now;
    const bytes = registryBytes();
    overMem = bytes > env.mb * 1e6;
    if (overMem && !warnedMem) { warnedMem = true; const b = budget(); console.warn(`GPU memory over its envelope: ${b.mb} of ${b.envelope.mb} MB`, b.owners.slice(0, 5)); } // alloc-rare: once, when memory first runs over its envelope (warnedMem)
    if (!overMem) warnedMem = false;
    enforce(env);
    if (CTX_ASSERT) checkContexts();
  }
});
