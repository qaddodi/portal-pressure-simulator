// The Tube's stage 2 (10 Nov 2026, brief S2-D; docs/tube-renderer.md "Stage 2"; docs/recommendations/tube-renderer-stage2-3-plan.md): what veins-gl.js and
// tube-pass.js need to draw the lean strips and the webs, in a file of its own so veins-gl.js stays under the build's chunk limit.
//   - the five programs (tubeLean, tubeDepth, tubeWeb, tubeWebDepth, tubeJoinDepth: the cheap prepass for a row that is exact only for a join end): started with the Tube's other programs, finished one by one, each optional;
//   - the choice of stage and of joins, a pure function of (the programs ready, the query);
//   - the data the stage draws from: J's row records (tube-data.js), the rows by tier with each tier's plain rows first, the webs by tier, and the
//     buffers and vertex arrays they are drawn from (the strip's vertices are the stage 1 strip's, the same buffers).
// Nothing here allocates in a frame: the arrays are made on the first frame or when a binning (a geometry upload) needs more, each marked alloc-rare.
import { tubeStripVS } from './tube-geo.js';
import { tubeWebVS, webIndex, WEB_FLOATS } from './tube-joint.js';
import { tubeLeanFS, tubeJoinDepthFS, TUBE_DEPTH_FS } from './tube-lean-glsl.js';
import { tubeLumenFS } from './tube-lumen-glsl.js';
import { tubeGlowFS } from './tube-glow-glsl.js';
import { tubeRows, tubeBuckets, webInstances, websByTier, TUBE_ROW_FLOATS } from './tube-data.js';
import { STRIP_VS_GLSL, MIN_RADIUS } from './veins-mesh.js';
import { rowBoxes, rowsInside } from './tube-cull.js';

/** The five programs, in the order stage2Start returns them and the gauge names them. */
export const STAGE2_PROGRAMS = ['tubeLean', 'tubeDepth', 'tubeWeb', 'tubeWebDepth', 'tubeJoinDepth'];

/** The page's query, read once here (the other debug flags are read the same way, where they are used). */
export const TUBE_QUERY = typeof location !== 'undefined' ? location.search || '' : '';

// (The three answers, kept: the choice is read each frame and makes nothing.)
const STAGE_1 = { stage: 1, joins: 'patch' }, STAGE_2_WEB = { stage: 2, joins: 'web' }, STAGE_3 = { stage: 3, joins: 'web' };

/**
 * The stage and the joins the Tube draws with, from which programs are finished. ready: the stage 2 programs are finished (a truthy value); ready3: the
 * stage 3 programs (the two lumen programs and the compositor's Tube builds) are finished too.
 * Stage 2 (webs) when the stage 2 programs are ready, else stage 1 (which draws patches); stage 3 when stage 2 is drawing and the stage 3 programs are ready too.
 * (No address can pick a stage or the joins any more: ?tube= and ?tubejoin= went with the Classic and Mesh renderers, 11 Nov 2026.)
 */
export function tubeStage(ready, ready3 = false) {
  if (!ready) return STAGE_1;
  return ready3 ? STAGE_3 : STAGE_2_WEB;
}

/**
 * Why the Tube is in stage 1, for the `?perf` gauge: '' in stage 2; the programs that failed ('tubeWeb failed'); or 'compiling'.
 * failed: the names stage2Finish gave (an empty array: none failed); compiling: the programs are not finished yet.
 */
export function stage1Why(ready, failed, compiling) {
  if (ready) return '';
  if (failed && failed.length) return `${failed.join(', ')} failed`;
  return compiling ? 'compiling' : 'not ready';
}

/**
 * The four programs' shader text, by name: { tubeLean, tubeDepth, tubeWeb, tubeWebDepth }, each { vs, fs } (the strip's and the web's vertex shaders over the lean
 * fragment shader and the depth one). K: the constants tubeLeanFS names (tube-lean-glsl.js header); zoomVS: veins-gl.js's ZOOM_VS. The compile check
 * (scripts/glsl-compile-list.mjs) builds the programs from this, as the app does.
 */
export function stage2Sources(K, zoomVS) {
  const sv = tubeStripVS(STRIP_VS_GLSL, K.F_SEL, zoomVS), wv = tubeWebVS(STRIP_VS_GLSL, K.F_SEL, zoomVS), lean = tubeLeanFS(K);
  return { tubeLean: { vs: sv, fs: lean }, tubeDepth: { vs: sv, fs: TUBE_DEPTH_FS }, tubeWeb: { vs: wv, fs: lean }, tubeWebDepth: { vs: wv, fs: TUBE_DEPTH_FS }, tubeJoinDepth: { vs: sv, fs: tubeJoinDepthFS(K.N_SAMPLES) } };
}

/**
 * Starts the programs of `src` ({ name: { vs, fs } }) with startProgram (veins-gl.js's), by name. makeShader(type, text), when given, makes the shader objects:
 * a text two programs share is compiled once and the object shared.
 */
function startAll(gl, startProgram, src, names, makeShader) {
  const have = new Map(), out = {};   // alloc-rare: program set-up, once
  const get = (type, text) => {
    if (!makeShader) return text;
    const k = `${type}:${text}`;
    if (!have.has(k)) have.set(k, makeShader(type, text));
    return have.get(k);
  };
  for (const n of names) out[n] = startProgram(gl, get(gl.VERTEX_SHADER, src[n].vs), get(gl.FRAGMENT_SHADER, src[n].fs));
  return out;
}

/** Starts the four programs (startProgram: veins-gl.js's), by their names (STAGE2_PROGRAMS); see stage2Sources for K and zoomVS; makeShader: see startAll. */
export function stage2Start(gl, startProgram, K, zoomVS, makeShader) {
  return startAll(gl, startProgram, stage2Sources(K, zoomVS), STAGE2_PROGRAMS, makeShader);
}

/**
 * Finishes the four started programs (finishProgram: veins-gl.js's; started: the four in STAGE2_PROGRAMS' order), each in its own try. Returns { P: { lean, depth, web, webDepth } or null (one
 * failed: the rest are given back, and the Tube keeps stage 1), failed: the names that failed }.
 */
export function stage2Finish(gl, finishProgram, started) {
  const done = [], failed = [];
  started.forEach((s, i) => {
    try { done[i] = finishProgram(gl, s); } catch (e) {
      console.warn(`Veins renderer: the Tube's ${STAGE2_PROGRAMS[i]} shader failed; the Tube keeps stage 1.`, e);
      gl.deleteProgram(s.p); failed.push(STAGE2_PROGRAMS[i]);
    }
  });
  if (failed.length) { for (const d of done) if (d) gl.deleteProgram(d.p); return { P: null, failed }; }
  return { P: { lean: done[0], depth: done[1], web: done[2], webDepth: done[3], joinDepth: done[4] }, failed };
}

/** The glow program (PD part 4): the strip's vertex shader over tubeGlowFS, optional on its own (a failure leaves the glow passes on the stage 1 strip program). */
export const GLOW_PROGRAMS = ['tubeGlow'];

/** The glow program's shader text: { tubeGlow: { vs, fs } }. K, zoomVS: as stage2Sources. */
export function glowSources(K, zoomVS) {
  return { tubeGlow: { vs: tubeStripVS(STRIP_VS_GLSL, K.F_SEL, zoomVS), fs: tubeGlowFS(K) } };
}

/** Starts the glow program (startProgram: veins-gl.js's); see startAll. */
export function glowStart(gl, startProgram, K, zoomVS, makeShader) {
  return startAll(gl, startProgram, glowSources(K, zoomVS), GLOW_PROGRAMS, makeShader);
}

/** Finishes the started glow program: { P: the program or null, failed: ['tubeGlow'] or [] }. A failure is warned and leaves the glow passes on tubeS. */
export function glowFinish(gl, finishProgram, started) {
  try { return { P: finishProgram(gl, started[0]), failed: [] }; } catch (e) {
    console.warn('Veins renderer: the Tube glow shader failed; the glow passes keep the strip program.', e);
    gl.deleteProgram(started[0].p); return { P: null, failed: ['tubeGlow'] };
  }
}

/** The stage 3 programs, in the order stage3Start returns them. */
export const STAGE3_PROGRAMS = ['tubeLumen', 'tubeWebLumen', 'compTube', 'compTubeCell', 'plainTube', 'plainTubeCell'];

/**
 * The stage 3 programs' shader text, by name, each { vs, fs }: the lumen shader over the strip's and the web's vertex shaders, and the compositor's Tube builds
 * (COMP_FS with tube = 1: full and plain, each over the whole-picture vertex shader and the cell one). K, zoomVS: as stage2Sources; comp: { COMP_FS, COMP_VS,
 * COMP_CELL_VS } from veins-gl.js (given, not imported: veins-gl.js imports this file).
 */
export function stage3Sources(K, zoomVS, comp) {
  const sv = tubeStripVS(STRIP_VS_GLSL, K.F_SEL, zoomVS), wv = tubeWebVS(STRIP_VS_GLSL, K.F_SEL, zoomVS), lum = tubeLumenFS(K);
  const full = comp.COMP_FS(false, false, false, 1), plain = comp.COMP_FS(true, false, false, 1);
  return { tubeLumen: { vs: sv, fs: lum }, tubeWebLumen: { vs: wv, fs: lum }, compTube: { vs: comp.COMP_VS, fs: full }, compTubeCell: { vs: comp.COMP_CELL_VS, fs: full },
    plainTube: { vs: comp.COMP_VS, fs: plain }, plainTubeCell: { vs: comp.COMP_CELL_VS, fs: plain } };
}

/** Starts the six stage 3 programs (startProgram: veins-gl.js's), by their names (STAGE3_PROGRAMS); see stage3Sources. */
export function stage3Start(gl, startProgram, K, zoomVS, comp, makeShader) {
  return startAll(gl, startProgram, stage3Sources(K, zoomVS, comp), STAGE3_PROGRAMS, makeShader);
}

/** Finishes the six started stage 3 programs, each in its own try: { P: { lumen, webLumen, comp, compCell, plain, plainCell } or null, failed: names }. */
export function stage3Finish(gl, finishProgram, started) {
  const done = [], failed = [];
  started.forEach((s, i) => {
    try { done[i] = finishProgram(gl, s); } catch (e) {
      console.warn(`Veins renderer: the Tube's ${STAGE3_PROGRAMS[i]} shader failed; the Tube keeps stage 2.`, e);
      gl.deleteProgram(s.p); failed.push(STAGE3_PROGRAMS[i]);
    }
  });
  if (failed.length) { for (const d of done) if (d) gl.deleteProgram(d.p); return { P: null, failed }; }
  return { P: { lumen: done[0], webLumen: done[1], comp: done[2], compCell: done[3], plain: done[4], plainCell: done[5] }, failed };
}

/**
 * Whether the lumen layer's depth (the keys the lumen pass drew its prepasses into) is still what the vessel layer shows. Events: stale() on any draw of the vessel layer (whole, a piece, a
 * strip, marked cells), a new or resized lumen target, a context loss; needs(m, wo, la, w, h) answers whether the depth must be drawn again (stale, or the view matrix, the layer's wrap,
 * window or size differ from those it was drawn with); drawn(...) records that it was. A fresh depth is kept between blood frames and never invalidated.
 */
export function createDepthStamp() {
  const S = new Float64Array(16);
  let fresh = false;
  // (box: the screen box the pass was scissored to, 4 numbers, or null for the whole target: a depth drawn in one box is no depth in another.)
  const put = (m, wo, la, w, h, box) => { for (let i = 0; i < 6; i++) S[i] = m[i]; S[6] = wo[0]; S[7] = wo[1]; S[8] = la[0]; S[9] = la[1]; S[10] = w; S[11] = h; for (let i = 0; i < 4; i++) S[12 + i] = box ? box[i] : -1e30; };
  return {
    stale() { fresh = false; },
    needs(m, wo, la, w, h, box = null) {
      if (!fresh) return true;
      for (let i = 0; i < 6; i++) if (S[i] !== m[i]) { fresh = false; return true; }
      if (S[6] !== wo[0] || S[7] !== wo[1] || S[8] !== la[0] || S[9] !== la[1] || S[10] !== w || S[11] !== h) { fresh = false; return true; }
      for (let i = 0; i < 4; i++) if (S[12 + i] !== (box ? box[i] : -1e30)) { fresh = false; return true; }
      return false;
    },
    drawn(m, wo, la, w, h, box = null) { put(m, wo, la, w, h, box); fresh = true; },
    get fresh() { return fresh; },
  };
}

// ---- The lumen layer's size (brief PL, 10 Nov 2026) ----
// The lumen pass shades every lumen pixel of its target with the blood shader, so its cost goes with the target's area. The target is a share of the vessel layer's size
// (`lumenScale`); the pass draws into it with the layer's own mapping scaled (the view's matrix, the wrap's shifts and the pieces' scissors times the scale: lumenPiece), and the
// compositor reads it filtered, masked by the vessel layer's own lumen at full size.
const SCALE_Q = /[?&]lumenscale=([0-9.]+)(?=[&#]|$)/, OFF_Q = /[?&]lumen=off(?=[&#]|$)/;
/** ?lumen=off: no lumen pass and no blood drawn by the Tube (a device A/B that proves or clears the lumen pass as the cap). */
export const lumenOff = (query = TUBE_QUERY) => OFF_Q.test(query);
/**
 * The share of the vessel layer's size the lumen layer is made at: ?lumenscale=<0.25..1> for every instance, else the lobule 0.5, the figure 1 (0.67 on a phone: a coarse pointer and a
 * device pixel ratio of 3 or more). phone: that answer, read once by the caller.
 */
export function lumenScale(who, phone, query = TUBE_QUERY) {
  const m = SCALE_Q.exec(query), q = m ? parseFloat(m[1]) : NaN;
  if (q >= 0.25 && q <= 1) return q;
  return who === 'lobule' ? 0.5 : phone ? 0.67 : 1;
}
/** The target's size for a layer of w x h at `scale`, into out [w, h]: ceil of each, at least 1; the full size at a scale of 1 or more. */
export function lumenSize(w, h, scale, out) {
  out[0] = scale >= 1 ? w : Math.max(1, Math.ceil(w * scale)); out[1] = scale >= 1 ? h : Math.max(1, Math.ceil(h * scale));
  return out;
}
/**
 * The view m (world -> layer pixels) in the target's pixels, into out (6): each row scaled by the target's share of the layer (sx across, sy down), the translation too. The lumen shaders
 * (written for the layer) then work in target pixels unchanged: the world matrix, the world size of a pixel and the translation they take are the target's.
 */
export function lumenView(m, sx, sy, out) {
  out[0] = m[0] * sx; out[1] = m[1] * sy; out[2] = m[2] * sx; out[3] = m[3] * sy; out[4] = m[4] * sx; out[5] = m[5] * sy;
  return out;
}
/**
 * A piece of the layer along one axis (start x, length w, layer pixels) in the target's pixels (the share s): [start, length], the edges rounded to the nearest target pixel, so a
 * target pixel belongs to the piece that holds its centre and is drawn through that piece's mapping; the pieces tile the target. A piece's shift (lOff) is just times s.
 */
export function lumenPiece(x, w, s, out) {
  const a = Math.round(x * s);
  out[0] = a; out[1] = Math.round((x + w) * s) - a;
  return out;
}

/**
 * The world box of what the lumen pass can draw, into out [x0, y0, x1, y1] (x0 > x1 when there is nothing): the boxes of the rows the cull keeps (C.mask, C.boxes) and, for each web one of whose
 * legs is such a row, the squares round its two legs' samples (pts, as meshGeo().pts.pts holds them) as far as a web reaches from a leg: WEB_FAR (4) radii of the larger leg and the join's reach, and a
 * radius more. W: the webs of the binning (tube-data.js webInstances: data, count). A web with neither leg a kept row is left out: its rows are not drawn, and it adds only a fillet at their ends.
 */
export function lumenBox(C, nRows, W, pts, out) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const b = C.boxes.boxes, mk = C.mask;
  for (let r = 0; r < nRows; r++) {
    if (!mk[r]) continue;
    const o = r * 4;
    if (b[o] < x0) x0 = b[o]; if (b[o + 1] < y0) y0 = b[o + 1]; if (b[o + 2] > x1) x1 = b[o + 2]; if (b[o + 3] > y1) y1 = b[o + 3];
  }
  const d = W && W.data;
  for (let p = 0, n = d ? W.count : 0; p < n; p++) {
    const q = p * WEB_FLOATS, ra = Math.floor(d[q] + 0.5), rb = Math.floor(d[q + 4] + 0.5);
    if (!(ra >= 0 && ra < nRows && rb >= 0 && rb < nRows) || !(mk[ra] || mk[rb])) continue;
    const e = 5 * Math.max(C.hr[ra], C.hr[rb]) + d[q + 9];
    for (let l = 0; l < 2; l++) {
      const row = l ? rb : ra, i = Math.floor(d[q + (l ? 5 : 1)] + 0.5), at = (row * 32 + (i >> 1)) * 4 + (i & 1) * 2, x = pts[at], y = pts[at + 1];
      if (x - e < x0) x0 = x - e; if (x + e > x1) x1 = x + e; if (y - e < y0) y0 = y - e; if (y + e > y1) y1 = y + e;
    }
  }
  out[0] = x0; out[1] = y0; out[2] = x1; out[3] = y1;
  return out;
}

/** A world box [x0, y0, x1, y1] as the box of device pixels it covers under the view m, one pixel out each way, into out (screen px, the layer's mapping before the piece shifts); false when the box is empty. */
export function lumenRect(m, box, out) {
  if (!(box[0] <= box[2] && box[1] <= box[3])) return false;
  let lx = Infinity, ly = Infinity, hx = -Infinity, hy = -Infinity;
  for (let i = 0; i < 4; i++) {
    const x = i & 1 ? box[2] : box[0], y = i & 2 ? box[3] : box[1], X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5];
    if (X < lx) lx = X; if (X > hx) hx = X; if (Y < ly) ly = Y; if (Y > hy) hy = Y;
  }
  out[0] = Math.floor(lx) - 1; out[1] = Math.floor(ly) - 1; out[2] = Math.ceil(hx) + 1; out[3] = Math.ceil(hy) + 1;
  return true;
}

/**
 * One axis of a piece cut to the box: the piece holds layer pixels [start, start + len) and shows the screen pixels that are `shift` less (layer = screen + shift); the box covers screen pixels
 * [lo, hi]. Into out [a, b): the layer pixels of the piece the box covers (floor and ceil, so none of it is left out); false when there are none.
 */
export function lumenCut(start, len, shift, lo, hi, out) {
  const a = Math.max(start, Math.floor(lo + shift)), b = Math.min(start + len, Math.ceil(hi + shift));
  out[0] = a; out[1] = b;
  return b > a;
}

/**
 * The lumen layer: an RGBA8 texture and a depth renderbuffer on a framebuffer of their own, the vessel layer's size (ensure(w, h) makes them again when it changes).
 * tex(): the texture the compositor reads (lumenL). The colour is cleared by the caller (clear()); the depth is cleared in each piece's scissor by the pass.
 */
export function createLumenTarget(gl) {
  const T = { w: 0, h: 0, fbo: null, rb: null, texture: null, made: 0 };
  T.tex = () => T.texture;
  T.ensure = (w, h) => {
    if (T.fbo && T.w === w && T.h === h) return T;
    if (!T.fbo) {   // alloc-rare: the first lumen pass only
      T.fbo = gl.createFramebuffer(); T.rb = gl.createRenderbuffer(); T.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, T.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);   // (filtered: read at a share of its size; a full-size read is a texelFetch)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    T.w = w; T.h = h; T.made++;
    gl.bindTexture(gl.TEXTURE_2D, T.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, T.rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, T.texture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, T.rb);
    gl.drawBuffers(DRAW0);
    return T;
  };
  T.dispose = () => {
    if (T.fbo) { gl.deleteFramebuffer(T.fbo); gl.deleteRenderbuffer(T.rb); gl.deleteTexture(T.texture); }
    T.fbo = T.rb = T.texture = null; T.w = T.h = 0;
  };
  return T;
}
const DRAW0 = [0x8CE0];   // COLOR_ATTACHMENT0

const NO_JOINS = new Float32Array(0), NO_END = 2.5;   // (the row record's kind + 2: above 2.5 is an exact row)

/**
 * The join entries of a binning with each join's place filled in, as tube-data.js asks for them: 8 floats an entry, copied from `ent` by the
 * entries' indices in `list` (n of them); between the views (joinBase 0 or more) an entry's x is the join's index, and its place is the frame's.
 * Into out (grown by the caller): returns the number of floats.
 */
export function joinEntriesInto(ent, list, n, joinBase, out) {
  for (let k = 0; k < n; k++) {
    const q = list[k] * 8, o = k * 8;
    for (let i = 0; i < 8; i++) out[o + i] = ent[q + i];
    if (joinBase >= 0) { out[o] = ent[(joinBase + ent[q]) * 4]; out[o + 1] = ent[(joinBase + ent[q]) * 4 + 1]; }
  }
  return n * 8;
}

/**
 * The geometry part of the stage's data for one geometry bundle B (veins-gl.js: the figure's own binning, or a morph set's; B.ent, B.jl, B.pts, B.gen): the rows' kinds and
 * ends and the join instances (the webs), made ONE record B.s2, once per binning of B. A bundle's record is kept with it, so a set change swaps references and bins nothing;
 * veins-gl.js calls this when it makes a morph set (a free moment) and createStage2Data.frame calls it for a bundle that has none. Whatever replaces the webs builds its
 * records here and nowhere else. joinBase: the morph set's join rows (-1 for the figure's own).
 */
export function stage2Prepare(B, tubeNow, nTubes, joinBase) {
  const st = B.s2 || (B.s2 = { gen: -1, entries: NO_JOINS, R: {}, W: {}, joinBase: -1, n: 0 });   // alloc-rare: once per bundle
  if (st.gen === B.gen && st.R.rows) return st;
  // (The entries a cell lists: the same entry is listed by every cell it reaches, so a swept set lists it tens of times; each once here, in first-listed order.)
  const list = B.jl.view, n0 = B.jl.n || 0;
  if (!st.seen || st.seen.length < B.ent.length / 8) st.seen = new Uint8Array(Math.ceil(B.ent.length / 8));   // alloc-rare: a new binning only
  else st.seen.fill(0);
  if (!st.uniq || st.uniq.length < n0) st.uniq = new Int32Array(n0);   // alloc-rare: grown with the joins
  let n = 0;
  for (let k = 0; k < n0; k++) { const e = list[k]; if (!st.seen[e]) { st.seen[e] = 1; st.uniq[n++] = e; } }
  st.entries = new Float32Array(n * 8);   // alloc-rare: a new binning only, sized by its joins
  joinEntriesInto(B.ent, st.uniq, n, joinBase, st.entries);
  webInstances(st.entries, tubeNow, B.pts.pts, st.W);
  tubeRows(tubeNow, nTubes, st.entries, st.R, B.noEnds ? null : B.pts.pts);
  st.gen = B.gen; st.joinBase = joinBase; st.n = n;
  return st;
}

/**
 * The world rectangle the vessel layer covers, into out.rect ([minX, minY, maxX, maxY]), for the view m (world → device pixels, [a, b, c, d, e, f]) and the layer's window
 * on the screen (x0, y0, w, h device pixels; the window of the wrap is the picture's, so a pan never moves it): the window's corners one pixel out, taken back through m.
 * out.ok is false when m has no inverse or the layer has no size (no culling then). out is kept by the caller (rect a Float64Array(4)); nothing is made.
 */
export function layerRect(m, x0, y0, w, h, out) {
  const det = m[0] * m[3] - m[1] * m[2], R = out.rect;
  out.ok = false;
  if (!(Math.abs(det) > 1e-12) || !(w > 0 && h > 0)) return out;
  let lx = Infinity, ly = Infinity, hx = -Infinity, hy = -Infinity;
  for (let i = 0; i < 4; i++) {
    const X = (i & 1 ? x0 + w + 1 : x0 - 1) - m[4], Y = (i & 2 ? y0 + h + 1 : y0 - 1) - m[5];
    const x = (m[3] * X - m[2] * Y) / det, y = (m[0] * Y - m[1] * X) / det;
    if (x < lx) lx = x; if (x > hx) hx = x; if (y < ly) ly = y; if (y > hy) hy = y;
  }
  R[0] = lx; R[1] = ly; R[2] = hx; R[3] = hy;
  out.ok = lx <= hx && ly <= hy;
  return out;
}

/**
 * Which rows lie inside the layer (tube-cull.js), kept with the geometry bundle B (B.cu), so a set change swaps references: the rows' boxes made again when B was binned again
 * (B.gen) or a row's widest lumen has grown past what its box was given (view.rmax, veins-gl.js's rowMaxR; a box is given a quarter more and MIN_RADIUS), the inside flags checked
 * against view.rect grown by view.pad (the widest thing any pass draws past a lumen). Returns B.cu: .mask (Uint8Array, 1 for a row with points that is inside: what tubeBuckets is
 * given in place of B.pts.on), .key (bumped whenever the mask changed), .total (rows with points). Makes nothing in a frame (the arrays are made with the bundle or when it has
 * more rows, alloc-rare).
 */
export function cullUpdate(B, nRows, view) {
  const C = B.cu || (B.cu = { gen: -1, n: 0, key: 0, total: 0, boxes: {}, inside: null, mask: null, hr: null });   // alloc-rare: once per bundle
  const rm = view.rmax, on = B.pts.on;
  let again = C.gen !== B.gen || C.n !== nRows || !C.hr;
  if (!again) for (let r = 0; r < nRows; r++) if ((rm[r] || 0) > C.hr[r]) { again = true; break; }
  if (again) {
    if (!C.hr || C.hr.length < nRows) { C.hr = new Float32Array(nRows); C.inside = new Uint8Array(nRows); C.mask = new Uint8Array(nRows); }   // alloc-rare: grown with the vessel rows
    for (let r = 0; r < nRows; r++) C.hr[r] = (rm[r] || 0) * 1.25 + MIN_RADIUS;
    rowBoxes(B.pts, null, C.hr, nRows, C.boxes);
    C.inside.fill(2, 0, nRows);   // (neither 0 nor 1: the check below finds every row changed)
    C.gen = B.gen; C.n = nRows; C.total = C.boxes.on;
  }
  if (rowsInside(C.boxes.boxes, nRows, view.rect, view.pad, C.inside) || again) {
    for (let r = 0; r < nRows; r++) C.mask[r] = on[r] && C.inside[r] ? 1 : 0;
    C.key++;
  }
  return C;
}

/**
 * The stage's GL objects for one renderer: MG is veins-gl.js's kept state (tubeVB, tubeIB: the strip's vertices; B = MG.B, the geometry bundle in use, or MG itself where
 * there is none).
 * frame(G, tubeNow, nTubes, joinBase) bins what a frame draws (the geometry's part only when the bundle has none yet, see stage2Prepare; a row that has become dotted or
 * clipped is read again) and uploads the frame's buckets (the rows and webs of each tier, in the order the live tiers give): returns this object, with tb (the rows by
 * tier, plain first), wb (the webs by tier) and the vertex arrays stripVAO, webVAO. A second call in a frame with nothing changed (MG.tv, the tube rows' stamp; the same
 * bundle and binning) bins, buckets and uploads nothing.
 */
export function createStage2Data(gl, MG) {
  const D = { tb: {}, wb: {}, stripVAO: null, webVAO: null, rowBuf: null, webBuf: null, webIndexN: 0, rowCap: 0, webCap: 0, binnings: 0, cull: { drawn: 0, total: 0, off: true }, lumBox: { b: new Float64Array(4), on: false } };
  const CHK = {}, extra = [];   // alloc-rare: made once; their arrays grow with the binning
  let lastB = null, lastGen = -1, lastTv = -1, lastJ = -2, lastC = null, lastCk = -1;
  function make() {
    const T = webIndex();
    D.webIndexN = T.nIndex;
    D.stripVAO = gl.createVertexArray(); D.webVAO = gl.createVertexArray();
    D.rowBuf = gl.createBuffer(); D.webBuf = gl.createBuffer();
    extra.push(gl.createBuffer(), gl.createBuffer());
    // (The strip: the stage 1 strip's vertices and index, the rows as vec4 per instance.)
    gl.bindVertexArray(D.stripVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, MG.tubeVB);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, MG.tubeIB);
    gl.bindBuffer(gl.ARRAY_BUFFER, D.rowBuf);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, TUBE_ROW_FLOATS * 4, 0); gl.vertexAttribDivisor(1, 1);
    // (The web: its 22 vertices and the index, the web records as three vec4 per instance.)
    gl.bindVertexArray(D.webVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, extra[0]); gl.bufferData(gl.ARRAY_BUFFER, T.attr, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, extra[1]); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, T.index, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, D.webBuf);
    for (let a = 1; a <= 3; a++) { gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 4, gl.FLOAT, false, WEB_FLOATS * 4, (a - 1) * 16); gl.vertexAttribDivisor(a, 1); }
    gl.bindVertexArray(null);
  }
  // True when a row has become dotted or clipped since the kinds were read (an exact row stays exact until the next binning: only slower).
  function stale(st, tubeNow, nTubes) {
    tubeRows(tubeNow, nTubes, NO_JOINS, CHK, null);
    const a = CHK.rows, b = st.R.rows;
    for (let r = 0; r < nTubes; r++) if (a[r * TUBE_ROW_FLOATS + 3] > NO_END && !(b[r * TUBE_ROW_FLOATS + 3] > NO_END)) return true;
    return false;
  }
  D.frame = (G, tubeNow, nTubes, joinBase, view) => {
    if (!D.stripVAO) make();
    const B = MG.B || MG, tv = MG.tv;
    // (The rows outside the layer are left out of the buckets: not while a stretch of the change between the views moves the points (joinBase >= 0), nor when the view is not given.)
    const C = view && view.ok && joinBase < 0 ? cullUpdate(B, nTubes, view) : null, ck = C ? C.key : -1;
    if (tv !== undefined && B === lastB && B.gen === lastGen && tv === lastTv && joinBase === lastJ && C === lastC && ck === lastCk && B.s2 && B.s2.gen === B.gen) return D;   // (nothing changed since the last call)
    let st = B.s2;
    if (!st || st.gen !== B.gen || !st.R.rows) { st = stage2Prepare(B, tubeNow, nTubes, joinBase); D.binnings++; }
    else if (stale(st, tubeNow, nTubes)) tubeRows(tubeNow, nTubes, st.entries, st.R, B.noEnds ? null : B.pts.pts);
    tubeBuckets(tubeNow, C ? C.mask : B.pts.on, nTubes, st.R.rows, D.tb);
    D.cull.off = !C; D.cull.drawn = D.tb.n; D.cull.total = C ? C.total : D.tb.n;
    D.lumBox.on = !!C;   // (the box the lumen pass is scissored to: only with the cull, which says which rows are drawn)
    if (C) lumenBox(C, nTubes, st.W, B.pts.pts, D.lumBox.b);
    websByTier(st.W.data, st.W.count, tubeNow, D.wb, B.pts.on, !B.noEnds);
    gl.bindBuffer(gl.ARRAY_BUFFER, D.rowBuf);
    if (D.rowCap < D.tb.rows.length) { D.rowCap = D.tb.rows.length; gl.bufferData(gl.ARRAY_BUFFER, D.rowCap * 4, gl.DYNAMIC_DRAW); }
    if (D.tb.n) gl.bufferSubData(gl.ARRAY_BUFFER, 0, D.tb.rows, 0, D.tb.n * TUBE_ROW_FLOATS);
    gl.bindBuffer(gl.ARRAY_BUFFER, D.webBuf);
    if (D.webCap < D.wb.data.length) { D.webCap = D.wb.data.length; gl.bufferData(gl.ARRAY_BUFFER, D.webCap * 4, gl.DYNAMIC_DRAW); }
    if (D.wb.n) gl.bufferSubData(gl.ARRAY_BUFFER, 0, D.wb.data, 0, D.wb.n * WEB_FLOATS);
    lastB = B; lastGen = B.gen; lastTv = tv; lastJ = joinBase; lastC = C; lastCk = ck;
    return D;
  };
  D.dispose = () => {
    for (const v of [D.stripVAO, D.webVAO]) if (v) gl.deleteVertexArray(v);
    for (const b of [D.rowBuf, D.webBuf, ...extra]) if (b) gl.deleteBuffer(b);
    D.stripVAO = D.webVAO = D.rowBuf = D.webBuf = null; extra.length = 0; D.rowCap = D.webCap = 0;
  };
  return D;
}
