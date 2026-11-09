// The hierarchy's tables on the GPU, and the instance lists the draws read (docs/recommendations/vector-renderer-plan-r1.md 2.5 and 3; workstream E).
//
// createHierGpu(gl, shared) holds one hierarchy's textures: K's cells, nodes, leaves and run/join reference lists, A's run and join tables. sync(H)
// uploads what the hierarchy marked (texSubImage2D on the dirty rows; a table that grew or was made again is sent whole into a new texture) and nothing else:
// it never looks at the camera, so a pan, pinch or rotation uploads nothing. The instance lists are the leaves bucketed by class (K's box table holds the
// class; the instance carries x0, y0, size and the leaf index) plus the vessel rows that own an L_SINGLE leaf (the strips' instances); they are made again
// only when the leaf set changed (H.leafVer).
import { GRID_W, NODE_W, LIST_W, RUNS_PER_ROW, RUN_TEXELS, L_SINGLE, L_MORPH } from './vec-contract.js';
import { LEAF_ROW, LEAF_TEXELS } from './vec-leaves-pack.js';
import { HIER_UNIFORMS } from './vec-hier-glsl.js';
import { clearDirty, tableSize } from './vec-leaves-pack.js';

/** The tables the shaders sample: name -> { uniform, format, row width in texels, floats or ints a texel, where the data lives }. */
const SPEC = [
  { name: 'cells', uni: 'uVecCells', ifmt: 'RGBA16UI', fmt: 'RGBA_INTEGER', type: 'UNSIGNED_SHORT', per: 4, w: GRID_W },
  { name: 'nodes', uni: 'uVecNodes', ifmt: 'RGBA32UI', fmt: 'RGBA_INTEGER', type: 'UNSIGNED_INT', per: 4, w: NODE_W },
  { name: 'leaves', uni: 'uVecLeaves', ifmt: 'RGBA32UI', fmt: 'RGBA_INTEGER', type: 'UNSIGNED_INT', per: 4, w: LEAF_ROW * LEAF_TEXELS },
  { name: 'runRefs', uni: 'uVecRunRefs', ifmt: 'R32UI', fmt: 'RED_INTEGER', type: 'UNSIGNED_INT', per: 1, w: LIST_W },
];
/** Leaf classes the instance lists keep (the strips' L_SINGLE has rows, not boxes). */
export const CLASS_FIRST = L_SINGLE + 1, CLASS_LAST = L_MORPH;

export function createHierGpu(gl, shared) {
  const have = new Set(HIER_UNIFORMS);
  const tex = new Map();   // uniform name -> { t, w, h }
  const stats = { uploads: 0, texels: 0, made: 0 };
  let leafVer = -1, nStrip = 0;
  const counts = new Int32Array(CLASS_LAST + 1);
  const inst = [];                           // per class: Float32Array (x0, y0, size, leaf) per leaf
  let stripRows = new Float32Array(64), seen = new Uint8Array(0);
  const posBuf = new Int32Array(CLASS_LAST + 1);
  const stripBuf = gl.createBuffer(), vaoStrip = gl.createVertexArray();
  const bufs = [], vaos = [];
  for (let c = 0; c <= CLASS_LAST; c++) { inst.push(new Float32Array(0)); bufs.push(c >= CLASS_FIRST ? gl.createBuffer() : null); vaos.push(c >= CLASS_FIRST ? gl.createVertexArray() : null); }
  for (let c = CLASS_FIRST; c <= CLASS_LAST; c++) {
    gl.bindVertexArray(vaos[c]);
    gl.bindBuffer(gl.ARRAY_BUFFER, shared.quadBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs[c]);
    gl.bufferData(gl.ARRAY_BUFFER, 16, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
  }
  gl.bindVertexArray(vaoStrip);
  gl.bindBuffer(gl.ARRAY_BUFFER, shared.stripAttr);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, stripBuf);
  gl.bufferData(gl.ARRAY_BUFFER, 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shared.stripIndex);
  gl.bindVertexArray(null);

  function make(uni, ifmt, w, h) {
    const old = tex.get(uni);
    if (old) gl.deleteTexture(old.t);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl[ifmt], w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const rec = { t, w, h };
    tex.set(uni, rec); stats.made++;
    return rec;
  }
  // Rows r0..r1 of a table whose rows are w texels of `per` values, from `data` (which may end inside the last row: that row is sent as far as it goes).
  function put(rec, spec, data, r0, r1) {
    const rowLen = spec.w * spec.per, full = Math.floor(data.length / rowLen);
    gl.bindTexture(gl.TEXTURE_2D, rec.t);
    const fullEnd = Math.min(r1, full - 1);
    if (fullEnd >= r0) { gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, r0, spec.w, fullEnd - r0 + 1, gl[spec.fmt], gl[spec.type], data, r0 * rowLen); stats.texels += (fullEnd - r0 + 1) * spec.w; }
    if (r1 > fullEnd) {
      const row = Math.max(r0, full), texels = Math.floor((data.length - row * rowLen) / spec.per);
      if (texels > 0 && row <= r1) { gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, row, texels, 1, gl[spec.fmt], gl[spec.type], data, row * rowLen); stats.texels += texels; }
    }
    stats.uploads++;
  }
  function syncTable(T, spec) {
    const d = T.dirty[spec.name];
    if (!have.has(spec.uni) || !d) return;
    if (d.lo < 0 && !T.resized[spec.name] && tex.has(spec.uni)) return;   // (nothing written since the last sync: nothing is looked at, nothing made)
    const data = T[spec.name], rowLen = spec.w * spec.per;
    const used = tableSize(T, spec.name).h;
    const cap = spec.name === 'cells' ? used : Math.max(used, Math.ceil(data.length / rowLen));
    let rec = tex.get(spec.uni);
    const fresh = !rec || T.resized[spec.name] || cap > rec.h || (spec.name === 'cells' && rec.h !== cap);
    if (fresh) {
      rec = make(spec.uni, spec.ifmt, spec.w, cap);
      put(rec, spec, data, 0, used - 1);
    } else if (d.lo >= 0) put(rec, spec, data, d.lo, Math.min(d.hi, rec.h - 1));
  }
  // A's runs and joins, one float table (K's combineRunJoin: a row a vessel row, the joins' rows below): in part by row.
  const RUN_SPEC = { w: RUNS_PER_ROW * RUN_TEXELS, per: 4, fmt: 'RGBA', type: 'FLOAT' };
  function syncRuns(H) {
    const P = H.runTable, rows = Math.max(1, P.height);
    if (!P.data || !have.has('uVecRuns')) return;
    let rec = tex.get('uVecRuns');
    if (!rec || rec.h < rows || H.runsWhole) {
      if (!rec || rec.h !== rows) rec = make('uVecRuns', 'RGBA32F', RUN_SPEC.w, rows);
      put(rec, RUN_SPEC, P.data, 0, rows - 1);
    } else if (H.runsHi >= H.runsLo) put(rec, RUN_SPEC, P.data, H.runsLo, Math.min(H.runsHi, rec.h - 1));
    H.runsWhole = false; H.runsLo = 1e9; H.runsHi = -1;
  }
  function growInst(c, n) { if (inst[c].length < n * 4) inst[c] = new Float32Array(Math.max(n * 4, inst[c].length * 2, 64)); }   // alloc-rare: with the leaf count
  function lists(H) {
    const T = H.set.tables, nl = T.n.leaves, boxes = T.boxes, lv = T.leaves;
    counts.fill(0);
    for (let l = 0; l < nl; l++) { const c = boxes[l * 4 + 3] | 0; if (c >= L_SINGLE && c <= CLASS_LAST && boxes[l * 4 + 2] > 0) counts[c]++; }
    for (let c = CLASS_FIRST; c <= CLASS_LAST; c++) growInst(c, counts[c]);
    const pos = posBuf;
    pos.fill(0);
    const nRows = H.graph.nRows;
    if (seen.length < nRows) seen = new Uint8Array(nRows);   // alloc-rare: with the vessel rows
    seen.fill(0, 0, nRows);
    let ns = 0;
    if (stripRows.length < nRows) stripRows = new Float32Array(nRows * 2);   // alloc-rare: with the vessel rows
    for (let l = 0; l < nl; l++) {
      const c = boxes[l * 4 + 3] | 0;
      if (c < L_SINGLE || c > CLASS_LAST || !(boxes[l * 4 + 2] > 0)) continue;
      if (c === L_SINGLE) {
        const owner = lv[l * LEAF_TEXELS * 4 + 7];
        if (owner < nRows && !seen[owner]) { seen[owner] = 1; stripRows[ns++] = owner; }
        continue;
      }
      const a = inst[c], o = pos[c]++ * 4;
      a[o] = boxes[l * 4]; a[o + 1] = boxes[l * 4 + 1]; a[o + 2] = boxes[l * 4 + 2]; a[o + 3] = l;
    }
    nStrip = ns;
    gl.bindBuffer(gl.ARRAY_BUFFER, stripBuf);
    gl.bufferData(gl.ARRAY_BUFFER, stripRows, gl.DYNAMIC_DRAW, 0, ns);
    for (let c = CLASS_FIRST; c <= CLASS_LAST; c++) {
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs[c]);
      gl.bufferData(gl.ARRAY_BUFFER, inst[c], gl.DYNAMIC_DRAW, 0, counts[c] * 4);
    }
  }
  const api = {
    stats, counts,
    /** Uploads what the hierarchy marked since the last call. Returns the number of table uploads made (0: nothing was sent). */
    sync(H) {
      if (!H.built) return 0;
      const before = stats.uploads + stats.made;
      const T = H.set.tables;
      for (const spec of SPEC) syncTable(T, spec);
      syncRuns(H);
      clearDirty(T);
      if (leafVer !== H.leafVer) { leafVer = H.leafVer; lists(H); }
      return stats.uploads + stats.made - before;
    },
    /** The texture a hierarchy uniform samples (null before the first sync). */
    texOf(uni) { return tex.get(uni)?.t || null; },
    get nStrip() { return nStrip; },
    vaoStrip, vaoClass: (c) => vaos[c],
    dispose() {
      for (const r of tex.values()) gl.deleteTexture(r.t);
      tex.clear();
      for (const b of [stripBuf, ...bufs]) if (b) gl.deleteBuffer(b);
      for (const v of [vaoStrip, ...vaos]) if (v) gl.deleteVertexArray(v);
    },
  };
  return api;
}
