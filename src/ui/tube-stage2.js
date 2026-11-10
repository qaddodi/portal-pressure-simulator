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
import { tubeRows, tubeBuckets, webInstances, websByTier, TUBE_ROW_FLOATS } from './tube-data.js';
import { STRIP_VS_GLSL } from './veins-mesh.js';

/** The four programs, in the order stage2Start returns them and the gauge names them. */
export const STAGE2_PROGRAMS = ['tubeLean', 'tubeDepth', 'tubeWeb', 'tubeWebDepth'];

/** The page's query, read once here (the other debug flags are read the same way, where they are used). */
export const TUBE_QUERY = typeof location !== 'undefined' ? location.search || '' : '';
const ONE_Q = /[?&]tube=1(?=[&#]|$)/, PATCH_Q = /[?&]tubejoin=patch(?=[&#]|$)/;

// (The three answers, kept: the choice is read each frame and makes nothing.)
const STAGE_1 = { stage: 1, joins: 'patch' }, STAGE_2_WEB = { stage: 2, joins: 'web' }, STAGE_2_PATCH = { stage: 2, joins: 'patch' };

/**
 * The stage and the joins the Tube draws with. ready: the four programs are finished (a truthy value) ; query: the page's query string.
 * Stage 2 when the four are ready and `?tube=1` is not set, else stage 1 (which draws patches). Joins are 'web' in stage 2 unless `?tubejoin=patch`.
 */
export function tubeStage(ready, query = TUBE_QUERY) {
  if (!ready || ONE_Q.test(query)) return STAGE_1;
  return PATCH_Q.test(query) ? STAGE_2_PATCH : STAGE_2_WEB;
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

/** Starts the four programs (startProgram: veins-gl.js's), by their names (STAGE2_PROGRAMS); see stage2Sources for K and zoomVS. */
export function stage2Start(gl, startProgram, K, zoomVS) {
  const src = stage2Sources(K, zoomVS), out = {};
  for (const n of STAGE2_PROGRAMS) out[n] = startProgram(gl, src[n].vs, src[n].fs);
  return out;
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
