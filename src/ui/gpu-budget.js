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
// Read it: ?perf (the readout's Surfaces block ends with the budget), or pps.budget() in the console. ?gpubudget=0: off (nothing counted).

import { onGLCall, glRec, GL_STATE } from './gl-state.js?v=554eb75e6c';
import { watchFrames } from './frame.js?v=ae4d297959';

const SEARCH = typeof location !== 'undefined' ? location.search || '' : '';
export const GPU_BUDGET = GL_STATE && !/[?&]gpubudget=0\b/.test(SEARCH);

// Envelopes per device class (estimated bytes; pass area in screens per frame). A phone's GPU shares about 6 GB with everything; a
// page that holds past a few hundred MB is the first Safari reclaims. Eight screens a frame is about what a 120 Hz phone GPU fills
// in its share of an 8 ms frame with the shaders this app runs (illustrative, not measured: see docs/gpu-practices.md, bandwidth).
export const ENVELOPES = {
  phone: { mb: 320, screens: 8 },
  tablet: { mb: 512, screens: 8 },
  desktop: { mb: 1024, screens: 10 },
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
const gone = typeof FinalizationRegistry !== 'undefined' ? new FinalizationRegistry((id) => entries.delete(id)) : null;
const owners0 = new WeakMap();      // gl -> owner name
const ctxRefs = [];                 // WeakRef of each context (a context the page let go of drops out)
const ownerOf = (gl) => owners0.get(gl) || 'webgl2';
const liveCtxs = () => { const out = []; for (let i = ctxRefs.length - 1; i >= 0; i--) { const g = ctxRefs[i].deref(); if (g) out.push(g); else ctxRefs.splice(i, 1); } return out; };

/** Names context gl's allocations in the registry (default: its canvas's id or first class). */
export function budgetOwner(gl, name) { owners0.set(gl, name); }

function entryFor(gl, obj, kind) {
  if (!obj) return null;
  let e = byObj.get(obj);
  if (!e) {
    e = { id: nextId++, owner: ownerOf(gl), kind, fmt: '', w: 0, h: 0, d: 1, samples: 0, levels: new Map(), bytes: 0 };
    byObj.set(obj, e); entries.set(e.id, e); gone?.register(obj, e.id);
  }
  return e;
}
const ctxRef = (gl) => (typeof WeakRef !== 'undefined' ? new WeakRef(gl) : { deref: () => gl });
function setLevel(e, level, bytes) { e.levels.set(level, bytes); let b = 0; for (const v of e.levels.values()) b += v; e.bytes = b; }
function drop(obj) { const e = obj && byObj.get(obj); if (e) { entries.delete(e.id); byObj.delete(obj); gone?.unregister?.(obj); } }

// This frame's passes, and the last frames'.
const cur = { targets: 0, draws: 0, area: 0, copies: 0, copyArea: 0, lastFb: undefined };
const last = { targets: 0, draws: 0, area: 0, copies: 0, copyArea: 0 };
let worst = { area: 0, at: 0 }, overFrames = 0, overMem = false, warnedMem = false, memAt = 0;

function onCall(gl, name, x) {
  if (name === 'draw' || name === 'clear') { cur.draws++; cur.area += x; return; }
  if (name === 'copy') { cur.copies++; cur.copyArea += x; return; }
  if (name === 'target') { if (x !== cur.lastFb) { cur.targets++; cur.lastFb = x; } return; }
  if (name === 'context') {
    if (!owners0.has(gl)) { const c = gl.canvas; owners0.set(gl, c?.id || (typeof c?.className === 'string' && c.className.split(' ')[0]) || (c && !c.isConnected ? 'offscreen' : 'canvas')); }
    if (typeof WeakRef !== 'undefined') ctxRefs.push(new WeakRef(gl));
    return;
  }
  if (name === 'restored') { for (const [id, e] of entries) if (e.gl?.deref?.() === gl) entries.delete(id); return; }
  if (name.startsWith('delete')) { drop(x[0]); return; }
  const r = glRec(gl);
  if (!r) return;
  const a = x;
  if (name === 'texStorage2D' || name === 'texStorage3D') {
    if (a[0] !== gl.TEXTURE_2D && name === 'texStorage2D') return;
    const tex = r.tex.get(r.unit), e = entryFor(gl, tex, 'texture'); if (!e) return;
    const [, levels, ifmt, w, h, d = 1] = a, bpp = bppOf(gl, ifmt);
    e.fmt = FMT_NAME(gl, ifmt); e.w = w; e.h = h; e.d = d; e.levels.clear(); e.gl = ctxRef(gl);
    let b = 0; for (let l = 0, lw = w, lh = h; l < levels; l++, lw = Math.max(1, lw >> 1), lh = Math.max(1, lh >> 1)) b += lw * lh * d * bpp;
    setLevel(e, 0, b); e.nLevels = levels;
  } else if (name === 'texImage2D') {
    if (a[0] !== gl.TEXTURE_2D) return;   // (a cube face or another target: not this app's)
    const tex = r.tex.get(r.unit), e = entryFor(gl, tex, 'texture'); if (!e) return;
    let w, h, type;
    if (a.length >= 8) { w = a[3]; h = a[4]; type = a[7]; } else { const src = a[5]; w = src?.width || src?.videoWidth || 0; h = src?.height || src?.videoHeight || 0; type = a[4]; }
    const bpp = bppOf(gl, a[2], type);
    if (a[1] === 0) { e.fmt = FMT_NAME(gl, a[2]); e.w = w; e.h = h; }
    e.gl = ctxRef(gl);
    setLevel(e, a[1], w * h * bpp);
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

// The canvases' own buffers: colour, and depth/stencil, at their backing size, twice (the one shown and the one drawn).
function canvasBytes() {
  let b = 0;
  for (const gl of liveCtxs()) { const c = gl.canvas; if (c && !gl.isContextLost?.()) b += c.width * c.height * 8 * 2; }
  return b;
}
const screenPx = () => { const d = globalThis.devicePixelRatio || 1; return Math.max(1, (globalThis.innerWidth || 1) * (globalThis.innerHeight || 1) * d * d); };

/** The registry and the passes now: bytes against the memory envelope, the last frame's area against the pass envelope. */
export function budget() {
  const env = ENVELOPES[deviceClass()];
  const owners = new Map();
  let bytes = 0;
  for (const e of entries.values()) { bytes += e.bytes; const o = owners.get(e.owner) || { owner: e.owner, bytes: 0, n: 0 }; o.bytes += e.bytes; o.n++; owners.set(e.owner, o); }
  const canvases = canvasBytes();
  bytes += canvases;
  const big = [...entries.values()].sort((a, b) => b.bytes - a.bytes).slice(0, 8).map((e) => ({ owner: e.owner, kind: e.kind, fmt: e.fmt, w: e.w, h: e.h, samples: e.samples, levels: e.nLevels || e.levels.size, mb: +(e.bytes / 1e6).toFixed(1) }));
  const scr = screenPx();
  return {
    device: deviceClass(), envelope: env,
    mb: +(bytes / 1e6).toFixed(1), canvasesMb: +(canvases / 1e6).toFixed(1), overMemory: bytes > env.mb * 1e6,
    owners: [...owners.values()].sort((a, b) => b.bytes - a.bytes).map((o) => ({ owner: o.owner, n: o.n, mb: +(o.bytes / 1e6).toFixed(1) })),
    largest: big,
    frame: { targets: last.targets, draws: last.draws, screens: +(last.area / scr).toFixed(2), copies: last.copies, copyScreens: +(last.copyArea / scr).toFixed(2) },
    worstScreens: +(worst.area / scr).toFixed(2), overPassFrames: overFrames,
  };
}

/** True while the render graph is over its envelope: the last frames ran past the pass envelope, or the registry past memory's. */
export function overBudget() { return overMem || overFrames >= 2; }

/** The ?perf readout's lines. */
export function budgetText() {
  if (!GPU_BUDGET) return 'GPU budget: off (?gpubudget=0)';
  const b = budget();
  const lines = [`GPU budget (${b.device}): ${b.mb} of ${b.envelope.mb} MB${b.overMemory ? ' OVER' : ''} (canvases ${b.canvasesMb}); last frame ${b.frame.screens} of ${b.envelope.screens} screens drawn, ${b.frame.targets} target switches, ${b.frame.draws} passes, ${b.frame.copies} copies (${b.frame.copyScreens} screens); worst ${b.worstScreens}`];
  for (const o of b.owners.slice(0, 6)) lines.push(`  ${o.owner}: ${o.mb} MB in ${o.n}`);
  return lines.join('\n');
}

if (GPU_BUDGET) {
  onGLCall(onCall);
  // (Each frame the scheduler runs: its passes become the last frame's, and are held against the pass envelope.)
  watchFrames((f) => {
    const scr = screenPx(), env = ENVELOPES[deviceClass()];
    last.targets = cur.targets; last.draws = cur.draws; last.area = cur.area; last.copies = cur.copies; last.copyArea = cur.copyArea;
    cur.targets = cur.draws = cur.area = cur.copies = cur.copyArea = 0; cur.lastFb = undefined;
    const area = last.area + last.copyArea;
    if (area > worst.area || f.now - worst.at > 5000) worst = { area, at: f.now };
    overFrames = area > env.screens * scr ? overFrames + 1 : 0;
    // (Memory is looked at twice a second, only while frames run (an idle page counts nothing): an envelope crossed is logged once,
    // with what holds the most.)
    if (f.now - memAt > 500) {
      memAt = f.now;
      let bytes = canvasBytes(); for (const e of entries.values()) bytes += e.bytes;
      overMem = bytes > env.mb * 1e6;
      if (overMem && !warnedMem) { warnedMem = true; const b = budget(); console.warn(`GPU memory over its envelope: ${b.mb} of ${b.envelope.mb} MB`, b.owners.slice(0, 5)); }
      if (!overMem) warnedMem = false;
    }
  });
}
