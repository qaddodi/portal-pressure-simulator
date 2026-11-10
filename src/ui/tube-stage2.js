// The Tube's stage 2 (10 Nov 2026, brief S2-D; docs/tube-renderer.md "Stage 2"; docs/recommendations/tube-renderer-stage2-3-plan.md): what veins-gl.js and
// tube-pass.js need to draw the lean strips and the webs, in a file of its own so veins-gl.js stays under the build's chunk limit.
//   - the four programs (tubeLean, tubeDepth, tubeWeb, tubeWebDepth): started with the Tube's other programs, finished one by one, each optional;
//   - the choice of stage and of joins, a pure function of (the programs ready, the query);
//   - the data the stage draws from: J's row records (tube-data.js), the rows by tier with each tier's plain rows first, the webs by tier, and the
//     buffers and vertex arrays they are drawn from (the strip's vertices are the stage 1 strip's, the same buffers).
// Nothing here allocates in a frame: the arrays are made on the first frame or when a binning (a geometry upload) needs more, each marked alloc-rare.
import { tubeStripVS } from './tube-geo.js';
import { tubeWebVS, webIndex, WEB_FLOATS } from './tube-joint.js';
import { tubeLeanFS, TUBE_DEPTH_FS } from './tube-lean-glsl.js';
import { tubeLumenFS } from './tube-lumen-glsl.js';
import { tubeRows, tubeBuckets, webInstances, websByTier, TUBE_ROW_FLOATS } from './tube-data.js';
import { STRIP_VS_GLSL } from './veins-mesh.js';

/** The four programs, in the order stage2Start returns them and the gauge names them. */
export const STAGE2_PROGRAMS = ['tubeLean', 'tubeDepth', 'tubeWeb', 'tubeWebDepth'];

/** The page's query, read once here (the other debug flags are read the same way, where they are used). */
export const TUBE_QUERY = typeof location !== 'undefined' ? location.search || '' : '';
const ONE_Q = /[?&]tube=1(?=[&#]|$)/, PATCH_Q = /[?&]tubejoin=patch(?=[&#]|$)/;

// (The four answers, kept: the choice is read each frame and makes nothing.)
const STAGE_1 = { stage: 1, joins: 'patch' }, STAGE_2_WEB = { stage: 2, joins: 'web' }, STAGE_2_PATCH = { stage: 2, joins: 'patch' }, STAGE_3 = { stage: 3, joins: 'web' };
const TWO_Q = /[?&]tube=2(?=[&#]|$)/;

/**
 * The stage and the joins the Tube draws with. ready: the four stage 2 programs are finished (a truthy value); query: the page's query string; ready3: the
 * stage 3 programs (the two lumen programs and the compositor's Tube builds) are finished too.
 * Stage 2 when the four are ready and `?tube=1` is not set, else stage 1 (which draws patches). Joins are 'web' in stage 2 unless `?tubejoin=patch`.
 * Stage 3 when stage 2 is drawing webs, the stage 3 programs are ready and neither `?tube=1` nor `?tube=2` is set.
 */
export function tubeStage(ready, query = TUBE_QUERY, ready3 = false) {
  if (!ready || ONE_Q.test(query)) return STAGE_1;
  if (PATCH_Q.test(query)) return STAGE_2_PATCH;
  return ready3 && !TWO_Q.test(query) ? STAGE_3 : STAGE_2_WEB;
}

/**
 * Why the Tube is in stage 1, for the `?perf` gauge: '' in stage 2; 'set by ?tube=1'; the programs that failed ('tubeWeb failed'); or 'compiling'.
 * failed: the names stage2Finish gave (an empty array: none failed); compiling: the programs are not finished yet.
 */
export function stage1Why(ready, failed, compiling, query = TUBE_QUERY) {
  if (ready && !ONE_Q.test(query)) return '';
  if (ONE_Q.test(query)) return 'set by ?tube=1';
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
  return { tubeLean: { vs: sv, fs: lean }, tubeDepth: { vs: sv, fs: TUBE_DEPTH_FS }, tubeWeb: { vs: wv, fs: lean }, tubeWebDepth: { vs: wv, fs: TUBE_DEPTH_FS } };
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
  return { P: { lean: done[0], depth: done[1], web: done[2], webDepth: done[3] }, failed };
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
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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
 * The stage's data and GL objects for one renderer: MG is veins-gl.js's kept state (tubeVB, tubeIB: the strip's vertices; gen: counts its binnings).
 * frame(G, tubeNow, nTubes, joinBase) bins what a frame draws (the geometry's part only when MG.gen changed or a row has become dotted or clipped)
 * and uploads it: returns this object, with tb (the rows by tier, plain first), wb (the webs by tier) and the vertex arrays stripVAO, webVAO.
 */
export function createStage2Data(gl, MG) {
  const D = { tb: {}, wb: {}, stripVAO: null, webVAO: null, rowBuf: null, webBuf: null, webIndexN: 0, rowCap: 0, webCap: 0, binnings: 0 };
  let gen = -1, entries = NO_JOINS;
  const R = {}, CHK = {}, W = {}, extra = [];   // alloc-rare: made once; their arrays grow with the binning
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
  // A binning's part: the rows' kinds and ends, the webs.
  function bin(G, tubeNow, nTubes, joinBase) {
    const n = MG.jl.n || 0;
    entries = new Float32Array(n * 8);   // alloc-rare: a new binning only (a geometry upload), sized by its joins
    joinEntriesInto(MG.ent, MG.jl.view, n, joinBase, entries);
    webInstances(entries, tubeNow, G.pts.pts, W);
    tubeRows(tubeNow, nTubes, entries, R, G.pts.pts);
    D.binnings++;
  }
  // True when a row has become dotted or clipped since the kinds were read (an exact row stays exact until the next binning: only slower).
  function stale(tubeNow, nTubes) {
    tubeRows(tubeNow, nTubes, NO_JOINS, CHK, null);
    const a = CHK.rows, b = R.rows;
    for (let r = 0; r < nTubes; r++) if (a[r * TUBE_ROW_FLOATS + 3] > NO_END && !(b[r * TUBE_ROW_FLOATS + 3] > NO_END)) return true;
    return false;
  }
  D.frame = (G, tubeNow, nTubes, joinBase) => {
    if (!D.stripVAO) make();
    if (gen !== MG.gen || !R.rows) { gen = MG.gen; bin(G, tubeNow, nTubes, joinBase); }
    else if (stale(tubeNow, nTubes)) tubeRows(tubeNow, nTubes, entries, R, G.pts.pts);
    tubeBuckets(tubeNow, G.pts.on, nTubes, R.rows, D.tb);
    websByTier(W.data, W.count, tubeNow, D.wb, G.pts.on);
    gl.bindBuffer(gl.ARRAY_BUFFER, D.rowBuf);
    if (D.rowCap < D.tb.rows.length) { D.rowCap = D.tb.rows.length; gl.bufferData(gl.ARRAY_BUFFER, D.rowCap * 4, gl.DYNAMIC_DRAW); }
    if (D.tb.n) gl.bufferSubData(gl.ARRAY_BUFFER, 0, D.tb.rows, 0, D.tb.n * TUBE_ROW_FLOATS);
    gl.bindBuffer(gl.ARRAY_BUFFER, D.webBuf);
    if (D.webCap < D.wb.data.length) { D.webCap = D.wb.data.length; gl.bufferData(gl.ARRAY_BUFFER, D.webCap * 4, gl.DYNAMIC_DRAW); }
    if (D.wb.n) gl.bufferSubData(gl.ARRAY_BUFFER, 0, D.wb.data, 0, D.wb.n * WEB_FLOATS);
    return D;
  };
  D.dispose = () => {
    for (const v of [D.stripVAO, D.webVAO]) if (v) gl.deleteVertexArray(v);
    for (const b of [D.rowBuf, D.webBuf, ...extra]) if (b) gl.deleteBuffer(b);
    D.stripVAO = D.webVAO = D.rowBuf = D.webBuf = null; extra.length = 0; D.rowCap = D.webCap = 0;
  };
  return D;
}
