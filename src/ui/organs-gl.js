// The organs on the GPU as a stack (WebGL2, on the vessels' context: veins-gl.js): the organs' picture drawn layer by layer,
// back to front, into a texture the size of the canvas, which the composite then lays under the vessels in place of the
// one flattened organ picture (the plate).
//
// Each layer is a picture of some of the organs, rasterized from the same SVG copy the plate is (stage.js rasterPlate), as
// the plate is: one of the whole of it at the whole plate's scale (slot 0) and, once a pan or zoom has settled, a sharper
// one of the part in view (slot 1), each cropped to the layer's own box on the plate's pixel grid. Composited in the SVG's
// order with plain "over", each layer with its group's opacity baked in, they give the plate's picture (within a level of
// rounding a layer). The split is what lets an organ that changes shape (the liver, the spleen) be drawn on its own while
// the rest stay pictures: no organ below it or above it is drawn again when it changes.
//
// A layer set is made a slot at a time and swapped in whole (commit), so the picture never shows layers of two states.
//
// The organs that change (the liver with its ghost line, the spleen, the diaphragm, the falciform line) can instead be painted
// live from their own SVG at each render (organ-paint.js, setLive), at the screen's resolution, in their place in the order;
// and a layer whose mask changes with them (the gut's cut by the liver and the spleen, the stomach's see-through liver) is a
// picture of its organs without the mask, the mask painted live over it (its cut). A cut can gather other layers under its
// layer into the one group (`under`, each with its own shift): the bowel, which floats up on the ascites, is a picture of its
// own, moved on the GPU from where it was drawn (`at`) to where it is, under the rest of the gut, the gut's opacity and its mask
// laid over the two together, as the SVG lays its group: no picture is made again while the fluid eases.
//
// A layer's picture is painted on the GPU from its organs' own shapes where the painter can read them (bake): into a texture of its
// own, which stays on the GPU, so a pan or zoom only moves it and a change paints it again, a few organs a frame, with no image,
// canvas, read back or upload on the way. Only a layer it cannot read is still rasterized from the SVG copy (stage.js rasterPlate).

const LAYER_VS = `#version 300 es
layout(location=0) in vec2 corner;
uniform vec4 rect;     // the layer's world rectangle (x, y, w, h)
uniform mat3 world;    // world → device pixels (y down)
uniform vec2 size;
out vec2 vW;
void main() {
  vW = rect.xy + corner * rect.zw;
  vec2 d = (world * vec3(vW, 1.0)).xy;
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
}`;
const LAYER_FS = `#version 300 es
precision highp float;
in vec2 vW;
uniform sampler2D t0, t1, t2;   // the layer's whole picture, its sharper one of the view and, while that fades in, the view before (premultiplied)
uniform vec4 r0, r1, r2;
uniform int has1, has2;
uniform float k1;           // how far the view's picture has faded in (1: all of it, as before)
uniform ivec3 flip;         // a picture painted on the GPU (bake) has its first row at the bottom
out vec4 o;
vec4 at(sampler2D t, vec4 r, int f) { vec2 u = (vW - r.xy) / r.zw; return texture(t, f == 1 ? vec2(u.x, 1.0 - u.y) : u); }
bool inside(vec4 r) { vec2 u = (vW - r.xy) / r.zw; return all(greaterThanEqual(u, vec2(0.0))) && all(lessThanEqual(u, vec2(1.0))); }
void main() {
  vec2 u1 = (vW - r1.xy) / r1.zw;
  bool in1 = has1 == 1 && all(greaterThanEqual(u1, vec2(0.0))) && all(lessThanEqual(u1, vec2(1.0)));
  if (in1 && k1 >= 1.0) o = texture(t1, flip.y == 1 ? vec2(u1.x, 1.0 - u1.y) : u1);
  else {
    vec2 u0 = (vW - r0.xy) / r0.zw; o = texture(t0, flip.x == 1 ? vec2(u0.x, 1.0 - u0.y) : u0);
    // (Fading in: from what showed there before, the view before where it lay, else the whole picture; out of the new view, back to the whole.)
    vec4 was = has2 == 1 && inside(r2) ? at(t2, r2, flip.z) : o;
    if (in1) o = mix(was, at(t1, r1, flip.y), k1);
    else if (has2 == 1) o = mix(was, o, k1);
  }
}`;

// Camera-only frames (2 Nov 2026, Mohammad: "when I zoom in the fps goes to shit"): while only the camera moves (a pinch, the wheel, a
// pan, a slide's glide) and nothing in the stack changed, the stack is not painted again from its shapes. The last picture painted
// exactly (the base) is moved on the GPU by the camera alone, one full-screen pass: each pixel of this frame looks up where it was in
// the base (toS), and, outside it, in a wider picture of the same stack a little softer (the margin, painted once when a zoom out or a
// pan first leaves the base, toM). The live organs (the liver, the spleen, the diaphragm) had been painted shape by shape on every
// frame of a zoom: some 220 passes a frame over large parts of the screen. A zoom in past a step of 1.42 from the base, or a view
// that leaves both pictures, paints the stack exactly again (that frame's base); once the camera has held still for MOVE_SETTLE_MS
// the stack is painted exactly, as at rest.
const MOVE_FS = `#version 300 es
precision highp float;
uniform sampler2D tS, tM;
uniform mat3 toS, toM;   // this frame's device px (y down) → the base's / the margin picture's device px
uniform vec2 size;
uniform int hasS, hasM;
out vec4 o;
vec2 uvOf(vec2 p) { return vec2(p.x / size.x, 1.0 - p.y / size.y); }
void main() {
  vec3 d = vec3(gl_FragCoord.x, size.y - gl_FragCoord.y, 1.0);
  if (hasS == 1) {
    vec2 p = (toS * d).xy;
    if (all(greaterThanEqual(p, vec2(0.0))) && all(lessThanEqual(p, size))) { o = texture(tS, uvOf(p)); return; }
  }
  o = hasM == 1 ? texture(tM, uvOf((toM * d).xy)) : vec4(0.0);
}`;
const MOVE_VS = `#version 300 es
layout(location=0) in vec2 corner;
void main() { gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0); }`;
/** How long the camera holds still before the stack is painted exactly again (ms). */
export const MOVE_SETTLE_MS = 90;
/** The base serves a zoom in up to this factor past the scale it was painted at, and a zoom out down to its half. */
export const MOVE_ZOOM_IN = 1.42;
/** The margin picture covers this many times the view across (centred on it), at the canvas's own size. */
export const MOVE_MARGIN = 1.25;
const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
/** Whether the device rectangle 0..cw × 0..ch under view m lies inside the picture painted under view p (same size): within a pixel. */
export function viewInside(p, m, cw, ch) {
  const q = mulTo(VQ, p, invTo(VI, m));
  for (let c = 0; c < 4; c++) {
    const x = c & 1 ? cw : 0, y = c & 2 ? ch : 0;
    const u = q[0] * x + q[2] * y + q[4], v = q[1] * x + q[3] * y + q[5];
    if (!(u >= -1 && u <= cw + 1 && v >= -1 && v <= ch + 1)) return false;
  }
  return true;
}
const VQ = [1, 0, 0, 1, 0, 0], VI = [1, 0, 0, 1, 0, 0], VM = [1, 0, 0, 1, 0, 0];   // (viewInside's and marginViewTo's scratch)
/** The view the margin picture is painted under: m with the canvas's centre kept and everything MOVE_MARGIN times smaller about it. */
export function marginView(m, cw, ch) { return marginViewTo([0, 0, 0, 0, 0, 0], m, cw, ch); }
/** marginView written into `o`. */
export function marginViewTo(o, m, cw, ch) {
  const k = 1 / MOVE_MARGIN, cx = cw / 2, cy = ch / 2;
  VM[0] = k; VM[1] = 0; VM[2] = 0; VM[3] = k; VM[4] = cx * (1 - k); VM[5] = cy * (1 - k);
  return mulTo(o, VM, m);
}

import { createShapeGL } from './shape-gl.js';
import { createOrganPaint, mul, mulTo, invTo, prestartOrganPaint } from './organ-paint.js';
import { prestart, linkProgram, exerciseDraw } from './gl-compile.js';
import { netChanged } from './idle-keys.js';
import { uniformCache } from './uniform-cache.js';
import { easeMove, D_SURFACE } from './ease.js';
// (The colour a clear writes, one array for every clear: none made per call, plan rev 2 §2.8.)
const CLEAR0 = new Float32Array(4);

/** The pixels (bytes) of live groups' pictures kept at a time on a canvas cw × ch: most of a screen, never more than 12 MB (an iPhone's budget is a few MB). */
export const cacheBudget = (cw, ch) => Math.min(cw * ch * 4 * 0.75, 12e6);

// Settle and sharpen (combined plan step 12, 31 Oct): the view's sharper picture, made once a pan or a zoom has settled, fades in over
// the same 350 ms smoothstep as a resolution change (res-fade FADE_MS) inside the organ stack alone, from what showed there before
// (the view before where it lay, else the whole picture), so the blood over it is never mixed with a still picture of itself.
// A view that lies inside the one before (the same pan, drawn again) takes its place at once, as before.
export const VIEW_FADE_MS = D_SURFACE;   // (the lens crossfade's clock, on its curve: stage.js LENS_FADE)
const EMPTY_ORGANS = new Map();   // (never written: no live organs, no cuts)
const numEq = (a, b) => a === b || (a !== a && b !== b);   // (equal as the numbers' text would be: NaN is NaN)
/** A key record: the stack's version numbers, the view m (n numbers), the canvas size, and a clock reading while a view's picture fades in (-1: none). */
const newKey = () => ({ ok: false, ver: 0, liveVer: 0, page: 0, n: 0, m: [0, 0, 0, 0, 0, 0], cw: 0, ch: 0, f: -1 });   // alloc-rare: a key record, made three times when a stack is made
function setView(k, ver, m, cw, ch) {
  k.ver = ver; k.n = m.length; k.cw = cw; k.ch = ch;
  for (let i = 0; i < m.length; i++) k.m[i] = m[i];
}
function sameView(k, ver, m, cw, ch) {
  if (!k.ok || k.ver !== ver || k.n !== m.length || k.cw !== cw || k.ch !== ch) return false;
  for (let i = 0; i < m.length; i++) if (!numEq(k.m[i], m[i])) return false;
  return true;
}
const copyView = (o, m) => { o[0] = m[0]; o[1] = m[1]; o[2] = m[2]; o[3] = m[3]; o[4] = m[4]; o[5] = m[5]; };

const within4 = (a, b) => b[0] >= a[0] && b[1] >= a[1] && b[0] + b[2] <= a[0] + a[2] && b[1] + b[3] <= a[1] + a[3];

// (Linked through gl-compile.js: the program the figure's renderer started at its setup (prestartOrganStack), else compiled here.)
function program(gl, vs, fs) {
  const p = linkProgram(gl, vs, fs);
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);   // alloc-rare: a program's uniform table, built once when it is linked
  for (let k = 0; k < n; k++) { const name = gl.getActiveUniform(p, k).name; u[name] = gl.getUniformLocation(p, name); }
  return { p, u };   // alloc-rare: a program's uniform table, built once when it is linked
}

/**
 * A rectangle `want` (world x, y, w, h) cut to `box` ([x0, y0, x1, y1]) and grown outward to whole pixels of `want`'s grid
 * at `scale` (so a layer's pixels sit on the plate's own: the same samples). Null when they miss.
 */
export function cropToGrid(want, box, scale) {
  const x0 = Math.max(want[0], box[0]), y0 = Math.max(want[1], box[1]);
  const x1 = Math.min(want[0] + want[2], box[2]), y1 = Math.min(want[1] + want[3], box[3]);
  if (!(x1 > x0 && y1 > y0)) return null;
  const gx0 = Math.floor((x0 - want[0]) * scale), gy0 = Math.floor((y0 - want[1]) * scale);
  const gx1 = Math.min(Math.round(want[2] * scale), Math.ceil((x1 - want[0]) * scale)), gy1 = Math.min(Math.round(want[3] * scale), Math.ceil((y1 - want[1]) * scale));
  if (gx1 <= gx0 || gy1 <= gy0) return null;
  return [want[0] + gx0 / scale, want[1] + gy0 / scale, (gx1 - gx0) / scale, (gy1 - gy0) / scale];   // alloc-rare: the layer's rect, which the caller keeps: made once per layer when a picture begins (a view settling, a patient change), not per frame
}

// `shared`: another stack's painter to paint with (the figure's overlays share the organs': organ-paint keeps its targets grown to the
// largest size asked, so the two never make them again), which this one then neither makes nor gives back.
/** Starts the stack's program and its painter's on gl, nothing read (gl-compile.js prestart): createOrganStack takes them up (the
 *  figure's own stack at its setup, the overlays' at their first set). */
export function prestartOrganStack(gl) { prestartLayer(gl); prestart(gl, MOVE_VS, MOVE_FS); prestartOrganPaint(gl); }
/** The stack's own program alone (a second stack sharing the first one's painter: the overlays). */
const UNIT_RECT = [0, 0, 1, 1];   // (a layer's rect when it has none)
export function prestartLayer(gl) { prestart(gl, LAYER_VS, LAYER_FS); }

// `moves`: camera-only frames drawn from its pictures (MOVE_FS). Off for a stack sharing another's painter (the figure's overlays): it is
// drawn after the figure's, in the present, and a moved frame of it would wait for a present to be painted exactly.
export function createOrganStack(gl, { painter: shared = null, moves = !shared } = {}) {   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  let layerP, moveP = null;
  try { layerP = program(gl, LAYER_VS, LAYER_FS); } catch (e) { console.warn('Organ stack: shader failed; the organs stay one picture.', e); return null; }
  // (Without it, every frame is painted exactly, as before: slower under a moving camera, never wrong.)
  if (moves) try { moveP = program(gl, MOVE_VS, MOVE_FS); } catch (e) { console.warn('Organ stack: the camera-move shader failed; the stack is painted at every view.', e); }
  const quad = gl.createBuffer(), vao = gl.createVertexArray();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  // (The camera-move program drawn once now, into a throwaway pixel: its first real draw, a pinch's first frame, finds it ready.)
  if (moveP) exerciseDraw(gl, () => { gl.useProgram(moveP.p); gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); });   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  // live[slot]: Map name → { tex, rect }, in the order the layers are drawn; staged[slot]: the set on its way in.
  const live = [new Map(), new Map()], staged = [new Map(), new Map()];   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  const order = [];   // (the layers' names, back to front: rewritten in place by commit and setOrder)   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  const stackTex = gl.createTexture(), fbo = gl.createFramebuffer();
  // (The four parameters every texture here takes, in this order: the filter for both, and the edges clamped.)
  const setTexParams = (f) => {   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };
  gl.bindTexture(gl.TEXTURE_2D, stackTex);
  setTexParams(gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  let w = 0, h = 0, ver = 0;
  // The live groups and cuts as last drawn (name → [{ sig, ops: [[sig, box]] }], organ-paint describe) and the view they were drawn
  // in: a render with the same view draws again only the boxes of the ops that changed (a liver ease moves the liver's own box, not
  // the whole screen). `liveVer` moves with setLive; `ver` with anything that needs the whole stack drawn again.
  let liveVer = 0;
  // (What a render is compared by, kept as numbers: the key of the render asked for (kNow) and of the last drawn (kDrawn), and the view
  // and layers the stack was last drawn at (kAt). Each is written in place; a built string for every frame of a pan or a zoom was the
  // one thing the stack made again in each.)
  let kNow = newKey(), kDrawn = newKey();
  const kAt = newKey();
  const EMPTY_DESC = new Map();   // (never written: the descriptions of nothing drawn yet)   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  let drawnDesc = EMPTY_DESC, descFlip = 0;
  const descMaps = [new Map(), new Map()], descSlots = [new Map(), new Map()];   // (two sets of descriptions, drawn now and before; their records kept for the next render of the same parity)   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  // The live organs (name → [{ spec (organ-paint readGroup), m (its frame → world) }]) and the layers' live masks (name → { spec, m }).
  let liveOrgans = EMPTY_ORGANS, cuts = EMPTY_ORGANS, painter = null, full = false;
  if (shared) painter = shared;
  else try { painter = createOrganPaint(gl, createShapeGL(gl)); } catch (e) { console.warn('Organ stack: the live painter failed; the organs stay pictures.', e); }
  // What the painter reads from the page at each paint (organ-paint liveOf, describe) is the live groups' elements' own attributes
  // and inline styles (an outline's d, a transform, an opacity), and each entry's own frame (its `el`, the m getter's element). A
  // watch on exactly those elements moves `pageVer` on any write that leaves one different, so a render with nothing written since
  // the last returns at once, without describing every op as strings on every blood frame (review item 3). The records are taken
  // synchronously at each check (takeRecords), so a write made in the same task as the composite is seen by that composite.
  // (No MutationObserver: every render describes, as before.)
  let pageVer = 0;
  const watch = typeof MutationObserver === 'function' ? new MutationObserver((rs) => { if (netChanged(rs)) pageVer++; }) : null;   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  const pull = () => { if (!watch) return; const rs = watch.takeRecords(); if (rs.length && netChanged(rs)) pageVer++; };   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  const elsOf = (spec, out) => {   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
    if (!spec) return;
    out.add(spec.root);
    for (const op of spec.ops) {
      out.add(op.el); out.add(op.geom?.el);
      for (const e of op.chain || []) out.add(e);   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
      if (op.clip) { out.add(op.clip.geom?.el); for (const e of op.clip.chain || []) out.add(e); }   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
      if (op.clip?.outer) { out.add(op.clip.outer.geom?.el); for (const e of op.clip.outer.chain || []) out.add(e); }   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
    }
    elsOf(spec.mask, out);
  };
  function watchLive() {
    full = false;   // (called by every setLive: a new set is not the whole set unless setLiveAll says so, after it)
    if (!watch) return;
    pull(); watch.disconnect();
    const els = new Set();   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
    for (const list of liveOrgans.values()) for (const o of list) { elsOf(o.spec, els); els.add(o.el); }
    for (const c of cuts.values()) { elsOf(c.spec, els); els.add(c.el); }
    for (const el of els) if (el?.nodeType === 1) watch.observe(el, { attributes: true, attributeOldValue: true });   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
    pageVer++;
  }
  // A live group that stands still while another eases beside it (the diaphragm under the easing liver) is kept as a picture of its own
  // (spec → { key, tex, fb, box }), laid again in place of painting its shapes: its coverage is cut from the whole outline whatever
  // the box being drawn, so a ease of the liver's box repainted every shape of the diaphragm that reached it, on every frame. Made once
  // a group has held still across two renders, within a budget of pixels (the iPhone's memory), and given up the moment the view,
  // the layers or the live set change, on trim and on dispose. Laid "over" what is under it as its shapes are, so the stack is
  // the same within a level of rounding.
  const cache = new Map();   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  let cacheBytes = 0;
  const dropEntry = (spec) => { const e = cache.get(spec); if (!e) return; gl.deleteTexture(e.tex); gl.deleteFramebuffer(e.fb); cacheBytes -= e.bytes; cache.delete(spec); };   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  const freeCache = () => { for (const e of cache.values()) { gl.deleteTexture(e.tex); gl.deleteFramebuffer(e.fb); } cache.clear(); cacheBytes = 0; };   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  // (A kept picture holds the description it was made from: its signature and its ops' strings; a description is the same when those are.)
  const sameKept = (e, d) => {   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
    if (e.sig !== d.sig || e.ops.length !== d.ops.length) return false;
    for (let k = 0; k < e.ops.length; k++) if (e.ops[k] !== d.ops[k][0]) return false;
    return true;
  };
  const sameDesc = (a, b) => {   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
    if (!a || !b || a.sig !== b.sig || a.ops.length !== b.ops.length) return false;
    for (let k = 0; k < a.ops.length; k++) if (a.ops[k][0] !== b.ops[k][0]) return false;
    return true;
  };
  const liveNow = () => !!(painter && (liveOrgans.size || cuts.size));   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  // The key of a render at view m: filled into `k` (kNow) and returned; the same as another when every part of it is.
  // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  const keyOf = (k, m, cw, ch) => {
    pull();
    setView(k, ver, m, cw, ch);
    k.liveVer = liveVer; k.page = watch ? pageVer : -1; k.f = pending() ? performance.now() : -1; k.ok = true;
    return k;
  };
  const sameKey = (a, b) => {   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
    if (!b.ok || a.ver !== b.ver || a.liveVer !== b.liveVer || a.page !== b.page || a.f !== b.f || a.n !== b.n || a.cw !== b.cw || a.ch !== b.ch) return false;
    for (let i = 0; i < a.n; i++) if (!numEq(a.m[i], b.m[i])) return false;
    return true;
  };
  const dropPrev = (L) => { if (L.prev) { gl.deleteTexture(L.prev.tex); L.prev = null; } };   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  const free = (map) => { for (const L of map.values()) { gl.deleteTexture(L.tex); dropPrev(L); } map.clear(); };   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  // (A view's picture fading in: its key moves with the clock until it is whole, so each frame draws it a step further.)
  // (`fading()`: one is still to be drawn whole; the stage's frames are kept going for it, for no longer than three fades whatever is drawn.)
  const pending = () => { for (const L of live[1].values()) if (L.from != null) return true; return false; };   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  const fading = () => { const t = performance.now(); for (const L of live[1].values()) if (L.from != null && t - L.from < 3 * VIEW_FADE_MS) return true; return false; };   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  const mat = new Float32Array(9);   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  const setNames = (names) => { order.length = names.length; for (let i = 0; i < names.length; i++) order[i] = names[i]; };   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  const UC = uniformCache(gl);   // (the stack program's uniforms are set only through it: a value it already holds is not sent again, uniform-cache.js)
  // The stack painted exactly under m into `target` (w × h), within a device box (null: all of it). `desc`/`prev`: the live groups' descriptions
  // now and at the last render, for laying a group that held still from its picture (only within a box).
  // (What the painting of one stack works on, set by paintStack and read by the helpers below: its view, box, target and canvas.)
  let pm = null, pWithin = null, pTarget = null, pCw = 0, pCh = 0;
  const CL = { tex: null, rect: [0, 0, 0, 0], flip: true };   // (the layer record of a kept picture laid again: drawLayer reads it at once)   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  const SHIFT = [1, 0, 0, 1, 0, 0], MM = [1, 0, 0, 1, 0, 0], MM2 = [1, 0, 0, 1, 0, 0], CB = [0, 0, 0, 0], DB = [0, 0, 0, 0], CUTB = [0, 0, 0, 0];   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  // (A layer's quad within the box being drawn: `b` for one laid under a cut, else the stack's.)
  function drawLayer(L0, L1, mm, b) {
    const U = layerP.u;
    if (b) { gl.enable(gl.SCISSOR_TEST); gl.scissor(b[0], h - b[3], b[2] - b[0], b[3] - b[1]); } else gl.disable(gl.SCISSOR_TEST);
    gl.useProgram(layerP.p);
    UC.m3(U.world, mm);
    UC.f2(U.size, w, h);
    UC.i1(U.t0, 0); UC.i1(U.t1, 1);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(vao);
    UC.f4a(U.rect, L0.rect); UC.f4a(U.r0, L0.rect);
    UC.f4a(U.r1, L1 ? L1.rect : UNIT_RECT); UC.i1(U.has1, L1 ? 1 : 0);
    // (Fading in: how far, and the view before where it was drawn as this one is.)
    const k = L1 && L1.from != null ? L1.k : 1, P = k < 1 && L1.prev && L1.prev.at === L1.at ? L1.prev : null;
    UC.f1(U.k1, k);
    UC.i1(U.t2, 2); UC.f4a(U.r2, P ? P.rect : UNIT_RECT); UC.i1(U.has2, P ? 1 : 0);
    UC.i3(U.flip, L0.flip ? 1 : 0, L1?.flip ? 1 : 0, P?.flip ? 1 : 0);
    // (Unit 2 first, so the unit left active is the one it was before: 1.)
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, P ? P.tex : L0.tex);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, L0.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, L1 ? L1.tex : L0.tex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
  }
  // A layer's world rect r as a device box under the view being painted, written into `o`.
  function devOf(o, r) {
    const a0 = pm[0] * r[0] + pm[4], a1 = pm[0] * (r[0] + r[2]) + pm[4], c0 = pm[3] * r[1] + pm[5], c1 = pm[3] * (r[1] + r[3]) + pm[5];
    o[0] = Math.min(a0, a1); o[1] = Math.min(c0, c1); o[2] = Math.max(a0, a1); o[3] = Math.max(c0, c1);
    return o;
  }
  // A live group that is the same as when last drawn, laid from its picture within the box being drawn (made now if it has stood
  // still since the render before and the budget allows); false for any other, which is painted from its shapes.
  function layCached(o, d, was) {
    const e = cache.get(o.spec), within = pWithin, cw = pCw, ch = pCh, m = pm;
    if (e && sameKept(e, d)) {
      if (!(e.box[2] > within[0] && e.box[0] < within[2] && e.box[3] > within[1] && e.box[1] < within[3])) return true;   // (reaches nothing of it)
      gl.bindFramebuffer(gl.FRAMEBUFFER, pTarget); gl.viewport(0, 0, w, h);
      CL.tex = e.tex; CL.rect[0] = (e.box[0] - m[4]) / m[0]; CL.rect[1] = (e.box[1] - m[5]) / m[3]; CL.rect[2] = (e.box[2] - e.box[0]) / m[0]; CL.rect[3] = (e.box[3] - e.box[1]) / m[3];
      drawLayer(CL, null, mat, within);
      return true;
    }
    if (e) dropEntry(o.spec);   // (it changed: the old picture is no use, and its memory goes at once)
    if (!sameDesc(d, was)) return false;
    let has = false;
    for (let i = 0; i < d.ops.length; i++) {
      const b = d.ops[i][1];
      if (!b) continue;
      if (has) { CB[0] = Math.min(CB[0], b[0]); CB[1] = Math.min(CB[1], b[1]); CB[2] = Math.max(CB[2], b[2]); CB[3] = Math.max(CB[3], b[3]); }
      else { CB[0] = b[0]; CB[1] = b[1]; CB[2] = b[2]; CB[3] = b[3]; has = true; }
    }
    if (!has) return false;
    CB[0] = Math.max(0, Math.floor(CB[0])); CB[1] = Math.max(0, Math.floor(CB[1])); CB[2] = Math.min(cw, Math.ceil(CB[2])); CB[3] = Math.min(ch, Math.ceil(CB[3]));
    const bw = CB[2] - CB[0], bh = CB[3] - CB[1];
    if (!(bw > 0 && bh > 0)) return false;
    if (!(CB[2] > within[0] && CB[0] < within[2] && CB[3] > within[1] && CB[1] < within[3])) return false;
    const bytes = bw * bh * 4;
    if (cacheBytes + bytes > cacheBudget(cw, ch)) return false;
    const tex = gl.createTexture(), fb = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    setTexParams(gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, bw, bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, bw, bh);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearBufferfv(gl.COLOR, 0, CLEAR0);
    // (Its frame moved by whole device pixels, so every shape is cut as it is in place.)
    SHIFT[4] = -CB[0]; SHIFT[5] = -CB[1];
    painter.paintGroupInto(o.spec, mulTo(MM2, SHIFT, mulTo(MM, m, o.m)), bw, bh, fb, cw, ch);
    // (The picture keeps the description it was made from, and its box: its own copies.)
    const ops = []; for (let i = 0; i < d.ops.length; i++) ops.push(d.ops[i][0]);   // alloc-rare: a kept picture is made once a group has held still across two renders (the render after a change), not every frame
    cache.set(o.spec, { sig: d.sig, ops, tex, fb, box: CB.slice(), bytes }); cacheBytes += bytes;   // alloc-rare: as above
    return layCached(o, d, was);
  }
  // The layers gathered under a cut, each moved by whole device pixels (kept: grown to the most a cut has gathered), and the cut's own layers.
  const underU0 = [], underU1 = [], underMM = [];   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  let nUnder = 0, cutL0 = null, cutL1 = null;
  function drawCut(_, b) {
    gl.viewport(0, 0, w, h);
    for (let i = 0; i < nUnder; i++) drawLayer(underU0[i], underU1[i], underMM[i], b);
    drawLayer(cutL0, cutL1, mat, b);
  }
  function paintStack(m, within, target, cw, ch, desc, prev) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, w, h);
    if (within) { gl.enable(gl.SCISSOR_TEST); gl.scissor(within[0], ch - within[3], within[2] - within[0], within[3] - within[1]); } else gl.disable(gl.SCISSOR_TEST);
    gl.clearBufferfv(gl.COLOR, 0, CLEAR0);
    gl.disable(gl.SCISSOR_TEST);
    mat[0] = m[0]; mat[1] = m[1]; mat[2] = 0; mat[3] = m[2]; mat[4] = m[3]; mat[5] = 0; mat[6] = m[4]; mat[7] = m[5]; mat[8] = 1;
    pm = m; pWithin = within; pTarget = target; pCw = cw; pCh = ch;
    for (let oi = 0; oi < order.length; oi++) {
      const n = order[oi];
      const lv = painter && liveOrgans.get(n);
      if (lv) {
        const ds = desc?.get(n), ps = prev?.get(n);
        for (let i = 0; i < lv.length; i++) {
          const o = lv[i];
          if (within && layCached(o, ds[i], ps && ps[i])) continue;
          painter.paintGroup(o.spec, mulTo(MM, m, o.m), w, h, target, within);
        }
        continue;
      }
      const L0 = live[0].get(n), L1 = live[1].get(n);
      if (!L0) continue;
      const cut = painter && cuts.get(n);
      if (cut) {
        // (The layers gathered under it, each moved by whole device pixels: on the view's picture's own pixel grid, as sharp as at rest.)
        nUnder = 0;
        const box = devOf(CUTB, L0.rect), un = cut.under;
        if (un) for (let i = 0; i < un.length; i++) {
          const u = un[i];
          const U0 = live[0].get(u.name), U1 = live[1].get(u.name);
          if (!U0) continue;
          const dy = Math.round(((u.dy || 0) - U0.at) * m[3]);
          const mm = underMM[nUnder] || (underMM[nUnder] = new Float32Array(9));   // alloc-rare: a transform for each layer gathered under a cut, made the first time a cut gathers that many
          mm.set(mat);
          mm[7] += dy;
          const b = devOf(DB, U0.rect);
          box[0] = Math.min(box[0], b[0]); box[1] = Math.min(box[1], b[1] + dy); box[2] = Math.max(box[2], b[2]); box[3] = Math.max(box[3], b[3] + dy);
          underU0[nUnder] = U0; underU1[nUnder] = U1 && U1.at === U0.at ? U1 : null; nUnder++;   // (the view's picture only if drawn where the whole one was)
        }
        cutL0 = L0; cutL1 = L1;
        painter.layMasked(drawCut, box, cut.spec, mulTo(MM, m, cut.m), w, h, target, cut.opacity ?? 1, within);
      }
      else { gl.bindFramebuffer(gl.FRAMEBUFFER, target); gl.viewport(0, 0, w, h); drawLayer(L0, L1, mat, within); }
    }
    painter?.endFrame();
  }
  // ── Camera-only frames (MOVE_FS) ──
  // exactAt: the view and content the stack's texture holds exactly (null once a moved frame is in it). base: the exact picture the moved
  // frames look up (a copy, mvS), with its view, its scale and its content; marg: the margin picture (mvM), with its view, the camera's
  // scale it was made at and its content. mvShown: the texture holds a moved frame (painted exactly once the camera holds still).
  // (The three pictures' views and contents are kept in records of their own, rewritten in place: exactBuf, baseBuf, margBuf.)
  const exactBuf = { m: [1, 0, 0, 1, 0, 0], ck: '' }, baseBuf = { m: [1, 0, 0, 1, 0, 0], s: 1, ck: '' }, margBuf = { p: [1, 0, 0, 1, 0, 0], s: 1, ck: '' };   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  let exactAt = null, base = null, marg = null, mvShown = false, mvAt = 0, mvS = null, mvM = null;
  const setExact = (m, ck) => { copyView(exactBuf.m, m); exactBuf.ck = ck; exactAt = exactBuf; };   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  const moveStats = { moved: 0, bases: 0, margins: 0, exact: 0, restored: 0, ahead: 0 };   // (for the tests and ?organpaths: frames moved, bases copied, margins painted, exact paints)   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  // (The content's name, built again only when a number in it moved: a camera-only frame finds the same string.)
  let ckVer = -1, ckLive = -1, ckPage = -1, ckW = -1, ckH = -1, ckStr = '';
  // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  const contentKey = (cw, ch) => {
    if (ckVer !== ver || ckLive !== liveVer || ckPage !== pageVer || ckW !== cw || ckH !== ch) {
      ckVer = ver; ckLive = liveVer; ckPage = pageVer; ckW = cw; ckH = ch;
      ckStr = `${ver}|${liveVer}|${pageVer}|${cw}x${ch}`;   // alloc-rare: built when the content changed (a live group written, the layers or the size), not for a camera-only frame
    }
    return ckStr;
  };
  const moveTarget = (t, cw, ch) => {   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
    if (t && t.w === cw && t.h === ch) return t;
    if (!t) {
      t = { tex: gl.createTexture(), fb: gl.createFramebuffer(), w: 0, h: 0 };   // alloc-rare: a camera-move target, made the first time a camera move needs it, kept after
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      setTexParams(gl.LINEAR);
    }
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cw, ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    t.w = cw; t.h = ch;
    return t;
  };
  const dropTarget = (t) => { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } return null; };   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  // (Given back once the camera has settled, on trim and on dispose: two canvas-sized textures held only while the camera moves.)
  function moveDrop() { mvS = dropTarget(mvS); mvM = dropTarget(mvM); base = marg = null; }
  // Whether a frame at view m lands on the base's own view (to a hundredth of a device pixel), its content as the base was copied, with no
  // view's picture still fading in: the base's copy is then the exact picture for it (render puts it back).
  const landsOnBase = (m, ck, cw, ch) => {   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
    if (!base || !mvS || base.ck !== ck || !painter || w !== cw || h !== ch || mvS.w !== cw || mvS.h !== ch) return false;
    const b = base.m;
    if (Math.abs(b[0] - m[0]) > 1e-6 || Math.abs(b[1] - m[1]) > 1e-6 || Math.abs(b[2] - m[2]) > 1e-6 || Math.abs(b[3] - m[3]) > 1e-6 || Math.abs(b[4] - m[4]) > 0.01 || Math.abs(b[5] - m[5]) > 0.01) return false;
    for (const L of live[1].values()) if (L.from != null) return false;
    return true;
  };
  // (Only with live groups, whose shapes are what a frame paints; a stack of pictures alone lays a quad a layer, cheaper than a copy.
  // Never while a view's picture fades in (each frame of it is drawn a step further) or without the page watch, which says that nothing
  // in the live groups was written.)
  const moveOk = (ck, cw, ch) => !!(moveP && painter && watch && liveNow() && !pending() && w === cw && h === ch && (base?.ck === ck || exactAt?.ck === ck));   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  // ── What render keeps ──
  // The box that changed (DIRTY, when dirtyOn): grown by addBox/addRect, and handed to the caller, who reads it at once.
  const DIRTY = [0, 0, 0, 0], ended = [];   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  let dirtyOn = false;
  const addRect = (x0, y0, x1, y1) => {   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
    if (dirtyOn) { DIRTY[0] = Math.min(DIRTY[0], x0); DIRTY[1] = Math.min(DIRTY[1], y0); DIRTY[2] = Math.max(DIRTY[2], x1); DIRTY[3] = Math.max(DIRTY[3], y1); }
    else { DIRTY[0] = x0; DIRTY[1] = y0; DIRTY[2] = x1; DIRTY[3] = y1; dirtyOn = true; }
  };
  const addBox = (b) => { if (b) addRect(b[0], b[1], b[2], b[3]); };   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  const allOf = (d) => { for (let i = 0; i < d.ops.length; i++) addBox(d.ops[i][1]); };   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  const allList = (list) => { if (list) for (let i = 0; i < list.length; i++) allOf(list[i]); };   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  // One layer's descriptions now (b) against the last drawing's (a): the boxes of what changed.
  function diffName(a, b) {
    if (!a || !b || a.length !== b.length) { allList(a); allList(b); return; }
    for (let i = 0; i < a.length; i++) {
      if (a[i].sig !== b[i].sig || a[i].ops.length !== b[i].ops.length) { allOf(a[i]); allOf(b[i]); continue; }
      for (let k = 0; k < a[i].ops.length; k++) if (a[i].ops[k][0] !== b[i].ops[k][0]) { addBox(a[i].ops[k][1]); addBox(b[i].ops[k][1]); }
    }
  }
  // A view's picture fading in, or the view before it: its device box under m, within the canvas, joins the changed box.
  function fadeBox(r, m, cw, ch) {
    const a0 = m[0] * r[0] + m[4], a1 = m[0] * (r[0] + r[2]) + m[4], c0 = m[3] * r[1] + m[5], c1 = m[3] * (r[1] + r[3]) + m[5];
    const x0 = Math.max(0, Math.floor(Math.min(a0, a1))), y0 = Math.max(0, Math.floor(Math.min(c0, c1))), x1 = Math.min(cw, Math.ceil(Math.max(a0, a1))), y1 = Math.min(ch, Math.ceil(Math.max(c0, c1)));
    if (!(x1 > x0 && y1 > y0)) return;
    addRect(x0, y0, x1, y1);
  }
  // (Whole now: the last step drawn at 1, the view before given up after it.)
  const endFade = () => { for (let i = 0; i < ended.length; i++) { const L = ended[i]; L.from = null; L.k = undefined; dropPrev(L); } };   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  // The key just compared becomes the drawn one (the two records swap, nothing is copied).
  const keepKey = () => { const k = kDrawn; kDrawn = kNow; kNow = k; };   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  const slotsFor = (slots, n) => { const se = { pool: [], list: [] }; slots.set(n, se); return se; };   // alloc-rare: a layer's records, made the first time it is described
  // A cut's signature: its group's, its opacity and where the layers gathered under it stand. Kept per cut and built again only when one differs.
  const cutSigs = new WeakMap();   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  function cutSig(cut, base) {
    const un = cut.under, nu = un ? un.length : 0, op = cut.opacity ?? 1;
    let r = cutSigs.get(cut);
    if (r && r.base === base && r.op === op && r.n === nu) {
      let same = true;
      for (let i = 0; i < nu && same; i++) same = r.names[i] === un[i].name && r.dys[i] === (un[i].dy || 0);
      if (same) return r.out;
    }
    if (!r) cutSigs.set(cut, (r = { base: '', op: 0, n: 0, names: [], dys: [], out: '' }));   // alloc-rare: one record per cut, the first time it is described
    r.base = base; r.op = op; r.n = nu;
    for (let i = 0; i < nu; i++) { r.names[i] = un[i].name; r.dys[i] = un[i].dy || 0; }
    let parts = '';   // alloc-rare: built when the group's signature, the cut's opacity or a layer under it changed
    for (let i = 0; i < nu; i++) parts += (i ? ',' : '') + `${un[i].name}:${un[i].dy || 0}`;   // alloc-rare: built when the group's signature, the cut's opacity or a layer under it changed, not for a frame that kept them
    return (r.out = `${base}|${op}|${parts}`);   // alloc-rare: built when the group's signature, the cut's opacity or a layer under it changed, not for a frame that kept them
  }
  const IM = [1, 0, 0, 1, 0, 0], MA = [1, 0, 0, 1, 0, 0], MB = [1, 0, 0, 1, 0, 0], MP = [1, 0, 0, 1, 0, 0], IDM = [1, 0, 0, 1, 0, 0];   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  const margOk = (ck, s, m, cw, ch) => marg?.ck === ck && s <= marg.s * 1.05 && s >= marg.s * 0.5 && viewInside(marg.p, m, cw, ch);   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  const setM = (u, a) => { mat[0] = a[0]; mat[1] = a[1]; mat[2] = 0; mat[3] = a[2]; mat[4] = a[3]; mat[5] = 0; mat[6] = a[4]; mat[7] = a[5]; mat[8] = 1; UC.m3(u, mat); };   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  /** A frame of a moving camera drawn from the pictures (true), or false when it must be painted exactly (its base then dropped). */
  // The base of a move: the exact picture copied (mvS) as the camera sets off. False when there is no exact picture of this content.
  function ensureBase(ck, cw, ch) {
    if (base?.ck === ck) return true;
    if (exactAt?.ck !== ck) return false;
    mvS = moveTarget(mvS, cw, ch);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, mvS.fb);
    gl.disable(gl.SCISSOR_TEST);
    gl.blitFramebuffer(0, 0, cw, ch, 0, 0, cw, ch, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    copyView(baseBuf.m, exactAt.m); baseBuf.s = scaleOf(exactAt.m); baseBuf.ck = ck; base = baseBuf; moveStats.bases++;
    if (marg?.ck !== ck) marg = null;
    return true;
  }
  // The margin around view m (mvM), painted from the shapes: what a move outside the base is drawn from.
  function paintMargin(m, s, ck, cw, ch) {
    const p = marginViewTo(MP, m, cw, ch);
    mvM = moveTarget(mvM, cw, ch);
    paintStack(p, null, mvM.fb, cw, ch, null, null);
    copyView(margBuf.p, p); margBuf.s = s; margBuf.ck = ck; marg = margBuf; moveStats.margins++;
  }
  function moveFrame(m, ck, cw, ch) {
    if (!ensureBase(ck, cw, ch)) return false;
    const s = scaleOf(m);
    // (Zoomed in past the step: the base would be drawn blurred; this frame is painted exactly and becomes the next base.)
    if (s > base.s * MOVE_ZOOM_IN) return false;
    const inS = s >= base.s * 0.5 && viewInside(base.m, m, cw, ch);
    if (!inS && !margOk(ck, s, m, cw, ch)) paintMargin(m, s, ck, cw, ch);
    const useM = !inS || (marg?.ck === ck && margOk(ck, s, m, cw, ch));
    const U = moveP.u, im = invTo(IM, m);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND);
    gl.useProgram(moveP.p);
    setM(U.toS, mulTo(MA, base.m, im));
    setM(U.toM, useM ? mulTo(MB, marg.p, im) : IDM);
    UC.f2(U.size, w, h);
    UC.i1(U.hasS, inS ? 1 : 0); UC.i1(U.hasM, useM ? 1 : 0);
    UC.i1(U.tS, 0); UC.i1(U.tM, 1);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, useM ? mvM.tex : mvS.tex);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, mvS.tex);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // (What the texture holds is no exact picture now: the next exact render draws it whole.)
    exactAt = null; kAt.ok = false; mvShown = true; mvAt = performance.now(); moveStats.moved++;
    return true;
  }
  // alloc-rare: built once when the stack is made (once per GL context), never in a frame
  return {
    /**
     * A layer's raster for `slot` (0 whole, 1 view), its texture filled (veins-gl plateJob), over world rect: held until commit.
     * `at`: for a layer that can be moved (shift), where it was drawn.
     */
    stage(slot, name, tex, rect, at = 0, flip = false) {
      const was = staged[slot].get(name);
      if (was) gl.deleteTexture(was.tex);
      staged[slot].set(name, { tex, rect, at, flip });   // alloc-rare: one layer record per staged picture (a view settling, a patient change), kept as the live layer
    },
    /**
     * A layer's picture painted on the GPU from its organs' own shapes (organ-paint readGroup, nest), with no image, canvas or
     * upload on the way: `groups` (each { spec, m: its frame → world }, back to front) over world rect at `scale` px per unit,
     * into a texture of its own that stays on the GPU. Returns a job: step(until) paints on until that time (performance.now)
     * and returns true once the picture is whole, the texture then staged for `slot` as a raster's would be (commit shows it);
     * drop() gives it up. `at`: as stage's.
     */
    bake(slot, name, groups, rect, scale, at = 0) {
      if (!painter) return null;
      const W = Math.max(1, Math.round(rect[2] * scale)), H = Math.max(1, Math.round(rect[3] * scale));
      const tex = gl.createTexture(), fb = gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      setTexParams(gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.viewport(0, 0, W, H);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearBufferfv(gl.COLOR, 0, CLEAR0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      // (World → the picture's pixels, y down; on the GPU its first row lands at the bottom, which the layer's draw turns back: flip.)
      const T = [W / rect[2], 0, 0, H / rect[3], -rect[0] * W / rect[2], -rect[1] * H / rect[3]];   // alloc-rare: a picture's job, made once per layer picture (a patient change or a view settling), not per frame
      const pic = painter.beginPicture();
      // (gi: the group being painted, its job `cur`; a group's job paints a few ops a step, however deep its groups nest.)
      let gi = 0, cur = null, done = false, live = true;
      const free = () => { cur?.drop(); cur = null; if (fb) gl.deleteFramebuffer(fb); };   // alloc-rare: a picture's job, made once per layer picture (a patient change or a view settling), not per frame
      return {   // alloc-rare: a picture's job, made once per layer picture (a patient change or a view settling), not per frame
        step(until = Infinity) {
          if (!live || done) return done;
          while (gi < groups.length) {
            const g = groups[gi];
            cur ||= painter.bakeJob(g.spec, mul(T, g.m), W, H, fb, pic);
            const r = cur.step(until);
            if (r === 'lost') {
              // (The painter's layers were made again meanwhile, a half-painted group with them: the picture starts over.)
              cur = null; gi = 0;
              gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, W, H); gl.disable(gl.SCISSOR_TEST);
              gl.clearBufferfv(gl.COLOR, 0, CLEAR0);
              break;
            }
            if (r !== 'done') break;
            cur = null; gi++;
            if (performance.now() > until) break;
          }
          gl.bindVertexArray(null); gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST); gl.activeTexture(gl.TEXTURE0);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
          if (gi < groups.length) return false;
          done = true; live = false; free();
          const was = staged[slot].get(name);
          if (was) gl.deleteTexture(was.tex);
          staged[slot].set(name, { tex, rect, at, flip: true });   // alloc-rare: one layer record per staged picture (a view settling, a patient change), kept as the live layer
          return true;
        },
        drop() { if (!live) return; live = false; free(); gl.deleteTexture(tex); },
      };
    },
    /** Lets go of the shapes the pictures keep on the GPU (bake), when no picture is being made. */
    dropKept() { painter?.dropKept(); },
    /** What the painter holds on the GPU (organ-paint stats), or null without one. */
    stats: () => (painter ? { ...painter.stats(), cached: cache.size, cacheBytes, moves: { ...moveStats, shown: mvShown } } : null),   // alloc-rare: diagnostic counts for the ?perf and ?organpaths readouts, not read in a frame
    /** The names of the layers painted live now, and how many shapes each holds (a diagnostic: the checks ask whether the diaphragm's layer ('back') is there). */
    liveLayers: () => Object.fromEntries([...liveOrgans].map(([n, gs]) => [n, gs.reduce((k, g) => k + (g.spec?.ops?.length || 0), 0)])),   // alloc-rare: diagnostic for the checks, not read in a frame
    /** Shows the staged set for `slot` in place of the one shown, drawn in the order of `names` (back to front). */
    commit(slot, names) {
      if (slot === 1 && live[0].size) {
        const t = performance.now();
        for (const n of names) {
          const L = staged[1].get(n), was = live[1].get(n);
          if (!L) continue;
          if (was && was.from == null && within4(was.rect, L.rect) && was.at === L.at) continue;   // (inside the view before: at once, as before)
          L.from = t; L.k = 0;
          // (The view before kept under it until it is whole; one still fading gives its own place up.)
          if (was) { dropPrev(was); L.prev = was; live[1].delete(n); }
        }
      }
      free(live[slot]);
      for (const n of names) { const L = staged[slot].get(n); if (L) { live[slot].set(n, L); staged[slot].delete(n); } }
      free(staged[slot]);
      if (slot === 0 && !liveOrgans.size) setNames(names);
      ver++;
    },
    dropStaged(slot) { free(staged[slot]); },
    /** Whether organs can be painted live here. */
    get canLive() { return !!painter; },   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
    /**
     * The organs painted live, by layer name (each a list of { spec, m }), and the layers' live masks (name → { spec, m }), in
     * place of what was set before; null for none. Drawn at the next render.
     */
    // (setLiveAll, `full`: every layer is painted live, none from a picture: the stack shows the whole figure while its pictures are made, so the
    // page's SVG organs never show (2 Nov 2026, "no SVG fallback"). has(0) then holds as if the pictures were in.)
    setLive(organs, masks) { liveOrgans = organs || EMPTY_ORGANS; cuts = masks || EMPTY_ORGANS; liveVer++; freeCache(); watchLive(); },
    /** Every layer painted live (the whole set, no cuts): setLive, then has(0) holds while no picture is in. Any setLive after ends it. */
    setLiveAll(organs) { this.setLive(organs, null); full = liveOrgans.size > 0; },
    /** Whether the stack shows every layer live (setLive full). */
    get full() { return full; },   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
    /** A layer gathered under a cut (its `under`) now at dy world units down (drawn at its `at`), as of the next render. */
    shift(name, dy) {
      for (const c of cuts.values()) { const un = c.under; if (un) for (let i = 0; i < un.length; i++) { const u = un[i]; if (u.name === name && u.dy !== dy) { u.dy = dy; liveVer++; } } }
    },
    /** The names the stack lays, back to front (the layers' and the live organs'). */
    setOrder(names) { setNames(names); ver++; },
    /** A live group's shapes were written in place (a kept record, no element for the page's watch to see): the next render draws them. */
    touch() { pageVer++; },
    drop(slot) { if (live[slot].size) { free(live[slot]); ver++; } free(staged[slot]); },
    has: (slot) => live[slot].size > 0 || (slot === 0 && full),   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
    /** Whether a slot holds pictures of its own (not only the live layers that stand in for them). */
    pictured: (slot) => live[slot].size > 0,   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
    /** Whether the view's picture is still fading in (the stage keeps drawing frames until it is whole). */
    // (And while a moved frame waits to be painted exactly: the stage draws on until the camera has held still for MOVE_SETTLE_MS.)
    // (For no longer than a few settles whatever is drawn: a stack no longer laid (the plate faded out) is painted exactly at its next render.)
    get fading() { return fading() || (mvShown && performance.now() - mvAt < 4 * MOVE_SETTLE_MS + 500); },   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
    /** Whether a render at transform m and this size would draw something new (a pan, a zoom, a new set, a live group written). */
    // (Without the page watch, a render is always asked while groups are live: what they draw is read from the page there, and
    // nothing is drawn when it is as it was.)
    stale: (m, cw, ch) => !sameKey(keyOf(kNow, m, cw, ch), kDrawn) || (!watch && liveNow()) || (mvShown && performance.now() - mvAt >= MOVE_SETTLE_MS),   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
    /**
     * The stack drawn for transform m (world → device px) into its texture, the canvas's size. Returns what changed in it: true for
     * the whole (the view or the layers changed), a device box [x0, y0, x1, y1] when only live groups changed (their boxes, old and new),
     * or null when nothing on it changed.
     */
    render(m, cw, ch) {
      const key = keyOf(kNow, m, cw, ch), unchanged = sameKey(key, kDrawn);
      const settle = mvShown && performance.now() - mvAt >= MOVE_SETTLE_MS;
      if (unchanged && (watch || !liveNow()) && !settle) return null;
      const ck = contentKey(cw, ch);
      // (Landed back on the camera the move set off from, its content unchanged: the copy taken as the move began (mvS) is that exact
      // picture, so it is put back and nothing is painted from shapes. A view change that returns to the framing it left, Anatomy to
      // Circuit and back to its home framing, lands without repainting the organs: the next-view pre-render's kept plate.)
      if ((settle || !unchanged) && landsOnBase(m, ck, cw, ch)) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, mvS.fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fbo);
        gl.disable(gl.SCISSOR_TEST);
        gl.blitFramebuffer(0, 0, cw, ch, 0, 0, cw, ch, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        moveDrop(); mvShown = false;
        keepKey();
        setView(kAt, ver, m, cw, ch); kAt.ok = true;
        setExact(m, ck); moveStats.restored++;
        return true;
      }
      // (Only the camera moved: the last pictures moved on the GPU, nothing painted from shapes.)
      if (!unchanged && moveOk(ck, cw, ch)) {
        if (moveFrame(m, ck, cw, ch)) { keepKey(); return true; }
        base = null;
      }
      // (Painted exactly from here on. The camera held still, or no move to come: the moves' textures given back.)
      if (settle || !liveNow()) moveDrop();
      mvShown = false;
      keepKey();
      const same = sameView(kAt, ver, m, cw, ch) && !!painter;
      setView(kAt, ver, m, cw, ch); kAt.ok = true;
      // Every live group and cut described as it is now (its ops' strings and boxes); against the last drawing, the box that changed.
      dirtyOn = false;
      const whole = !same;
      descFlip ^= 1;
      const desc = descMaps[descFlip], slots = descSlots[descFlip], prev = drawnDesc;
      desc.clear();
      if (whole) freeCache();
      if (painter) {
        for (let oi = 0; oi < order.length; oi++) {
          const n = order[oi];
          const lv = liveOrgans.get(n), cut = cuts.get(n);
          if (lv) {
            const se = slots.get(n) || slotsFor(slots, n);
            for (let i = 0; i < lv.length; i++) {
              const o = lv[i], rec = se.pool[i] || (se.pool[i] = { sig: '', ops: [] });   // alloc-rare: a record for each live group, made the first time a layer has that many
              se.list[i] = painter.describe(o.spec, mulTo(MM, m, o.m), rec);
            }
            se.list.length = lv.length;
            desc.set(n, se.list);
          } else if (cut && live[0].get(n)) {
            const se = slots.get(n) || slotsFor(slots, n), rec = se.pool[0] || (se.pool[0] = { sig: '', ops: [] });   // alloc-rare: as above
            const d = painter.describe(cut.spec, mulTo(MM, m, cut.m), rec);
            d.sig = cutSig(cut, d.sig);
            se.list[0] = d; se.list.length = 1;
            desc.set(n, se.list);
          }
        }
        if (!whole) {
          for (const n of desc.keys()) diffName(drawnDesc.get(n), desc.get(n));
          for (const n of drawnDesc.keys()) if (!desc.has(n)) diffName(drawnDesc.get(n), undefined);
          // (A cut's box is its layer's: a change in it is drawn over that box, cut to the ops that changed.)
          if (dirtyOn) {
            DIRTY[0] = Math.max(0, Math.floor(DIRTY[0])); DIRTY[1] = Math.max(0, Math.floor(DIRTY[1])); DIRTY[2] = Math.min(cw, Math.ceil(DIRTY[2])); DIRTY[3] = Math.min(ch, Math.ceil(DIRTY[3]));
            if (!(DIRTY[2] > DIRTY[0] && DIRTY[3] > DIRTY[1])) dirtyOn = false;
          }
        }
      }
      drawnDesc = desc;
      // The view's pictures fading in: each a step further (smoothstep), drawn over their boxes and the boxes of the views before.
      const now = performance.now();
      ended.length = 0;
      for (const L of live[1].values()) {
        if (L.from == null) continue;
        L.k = easeMove((now - L.from) / VIEW_FADE_MS);
        if (L.k >= 1) ended.push(L);
        if (whole) continue;
        fadeBox(L.rect, m, cw, ch);
        if (L.prev) fadeBox(L.prev.rect, m, cw, ch);
      }
      if (!whole && !dirtyOn) { endFade(); painter?.endFrame(); setExact(m, ck); return null; }
      const within = whole ? null : DIRTY;
      if (w !== cw || h !== ch) {
        w = cw; h = ch;
        gl.bindTexture(gl.TEXTURE_2D, stackTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, stackTex, 0);
      }
      paintStack(m, within, fbo, cw, ch, desc, prev);
      setExact(m, ck); moveStats.exact++;
      endFade();
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return whole ? true : DIRTY;
    },
    /**
     * Next-view pre-render: the margin a move to view m would paint in its first frame, painted now (an idle moment while the stack is not
     * laid: the circuit, its plate faded out), so the change back to the anatomy starts from it with nothing painted from shapes in its tap
     * frame. Nothing is painted when that frame would not need it (inside the base, a margin already there) or could not use it.
     */
    prepMove(m, cw, ch) {
      pull();
      const ck = contentKey(cw, ch);
      if (!moveOk(ck, cw, ch) || !ensureBase(ck, cw, ch)) return false;
      const s = scaleOf(m);
      if (s > base.s * MOVE_ZOOM_IN || (s >= base.s * 0.5 && viewInside(base.m, m, cw, ch)) || margOk(ck, s, m, cw, ch)) return false;
      paintMargin(m, s, ck, cw, ch);
      gl.bindVertexArray(null); gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      moveStats.ahead++;
      return true;
    },
    get texture() { return stackTex; },   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
    /** The painter it paints with (or null), for a stack that shares it. */
    get painter() { return painter; },   // alloc-rare: built once when the stack is made (once per GL context), never in a frame
    /** Gives back the stack's canvas-sized texture while nothing is shown (the next render makes it again). */
    trim() {
      freeCache();
      moveDrop(); exactAt = null; mvShown = false;
      if (!w) return;
      w = h = 0; kDrawn.ok = false; kAt.ok = false; drawnDesc = EMPTY_DESC;
      if (!shared) painter?.trim();   // alloc-rare: painter.trim() is the painter's own method (a name the scan takes for String trim), run when nothing is shown
      gl.bindTexture(gl.TEXTURE_2D, stackTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    },
    dispose() {
      for (const s of [0, 1]) { free(live[s]); free(staged[s]); }   // alloc-rare: teardown (dispose)
      freeCache();
      moveDrop();
      if (moveP) gl.deleteProgram(moveP.p);
      if (!shared) painter?.dispose();
      watch?.disconnect();
      gl.deleteTexture(stackTex); gl.deleteFramebuffer(fbo); gl.deleteBuffer(quad); gl.deleteVertexArray(vao); gl.deleteProgram(layerP.p);
    },
  };
}
