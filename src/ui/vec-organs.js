// The organs under the vector renderer (docs/recommendations/vector-renderer-plan.md section 6, workstream F): the organ painter's op
// lists (organ-paint.js readGroup: shapes filled or stroked with a colour or gradient, clipped, masked, grouped) kept as retained
// geometry, drawn straight into the figure's one pass with the camera as a uniform. This file is the CPU side (what is prepared, kept
// and in what order) and the GL calls; the shaders are vec-organs-glsl.js.
//
// Read order: 1. geometry kernels (a fill's triangles and boundary ring, a stroke's segments, a clip's triangles); 2. the organs' ops
// (setOrgans, refresh, the detail levels); 3. the draw (batches, stencil clips, masks); 4. covers and the liver's morph.
//
// What it does differently from the organ stack (organs-gl.js) and the painter (organ-paint.js), which stay as they are for Classic and
// Mesh:
//   · no coverage target and no layer: a fill is drawn as its triangles and a ring strip of boundary coverage, a stroke as instanced
//     capsules, each straight into the picture, an op once per pixel (the depth test of vec-organs-glsl.js);
//   · every detail level from the fit view to the deepest zoom is prepared ahead (prepare), in bounded steps, and kept; a frame picks
//     one by the camera's scale and flattens, triangulates and uploads nothing (a pinch is a uniform);
//   · a group's opacity is folded into its shapes' (the decision card of 9 Nov, option 1: one pass, no layer), a mask is a texture of
//     its luminance redrawn only when its shape changes (update), a clip is its triangles marked in the stencil in the same pass;
//   · the liver (and the spleen) deform on the GPU: two outlines of the same point count blend by a uniform, anything else is prepared
//     as a second shape and crossfaded (setMorph, morphAt).
import { flattenCmds, flattenPath, ellipsePoly, polyBoxInto, polyMeshInto, innerEdges, SEG } from './shape-gl.js';
import { dashPolys, geomSourceTo, newLive, liveInto, specOpacity, mulTo, invTo } from './organ-paint.js';
import { strHash } from './liver-geo.js';
import { linkProgram } from './gl-compile.js';
import { setPlate } from './vec-overlays.js';
import {
  OP_TEXELS, OP_DEPTHS, EXT_PX, T_M, T_E, T_COL, T_GP, T_GM0, T_GM1, T_SO, T_SC, T_W,
  fillVS, FILL_FS, strokeVS, STROKE_FS, CLIP_VS, CLIP_FS,
} from './vec-organs-glsl.js';

// ── The camera's reach for organs ──
/** The most a wheel or pinch zooms (stage-gestures.js K_MAX; the rubber band past it is a ×6·(k/6)^0.3 overshoot of a few percent). */
export const CAMERA_K_MAX = 6;
/** The deepest zoom the organs are drawn at: the dive into the liver (stage-dive.js) goes ×16 and the lobule field is whole at ×16·e^0.35,
 *  where the anatomy under it is hidden. */
export const DIVE_K_MAX = 16 * Math.exp(0.35);
/** A detail level j holds shapes cut at tolerance 2^j device px (organ-paint.js detailTol: a fifth of a pixel or finer); the coarsest is −1 (0.5). */
export const LEVEL_COARSE = -1;
/** Device px per world unit at which level j is the one a frame uses (the top of its bucket: shapes are at least this fine). */
export const levelScale = (j) => 0.2 * 2 ** -j;
/** The level whose bucket holds a device scale (the one detailTol picks). */
export const levelOf = (sc) => Math.min(LEVEL_COARSE, Math.floor(Math.log2(0.2 / Math.max(sc, 1e-9))));
/** The scale of a frame (device px per world unit) of the matrix m = [a b c d e f]. */
export const scaleOfMat = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
/** The most detail levels kept: a guard against an absurd maxZoom (level −1 is 0.5, level −14 is 0.00006 of a unit). */
export const LEVEL_MIN = -14;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. Geometry kernels (pure: no GL, no DOM; the tests run them on the real organ outlines)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// ── Triangulation: earcut (Mapbox, ISC), ported without its typed-array API. Outline + holes → triangles (indices into the data). ──
function eNode(i, x, y) { return { i, x, y, prev: null, next: null, z: 0, prevZ: null, nextZ: null, steiner: false }; }
function eInsert(i, x, y, last) {
  const p = eNode(i, x, y);
  if (!last) { p.prev = p; p.next = p; } else { p.next = last.next; p.prev = last; last.next.prev = p; last.next = p; }
  return p;
}
function eRemove(p) {
  p.next.prev = p.prev; p.prev.next = p.next;
  if (p.prevZ) p.prevZ.nextZ = p.nextZ;
  if (p.nextZ) p.nextZ.prevZ = p.prevZ;
}
const eArea = (p, q, r) => (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
const eEquals = (a, b) => a.x === b.x && a.y === b.y;
const eSign = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
function eSignedArea(data, start, end) {
  let sum = 0;
  for (let i = start, j = end - 2; i < end; i += 2) { sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]); j = i; }
  return sum;
}
function eList(data, start, end, clockwise) {
  let last;
  if (clockwise === eSignedArea(data, start, end) > 0) for (let i = start; i < end; i += 2) last = eInsert(i / 2 | 0, data[i], data[i + 1], last);
  else for (let i = end - 2; i >= start; i -= 2) last = eInsert(i / 2 | 0, data[i], data[i + 1], last);
  if (last && eEquals(last, last.next)) { eRemove(last); last = last.next; }
  return last;
}
function eFilter(start, end) {
  if (!start) return start;
  if (!end) end = start;
  let p = start, again;
  do {
    again = false;
    if (!p.steiner && (eEquals(p, p.next) || eArea(p.prev, p, p.next) === 0)) {
      eRemove(p);
      p = end = p.prev;
      if (p === p.next) break;
      again = true;
    } else p = p.next;
  } while (again || p !== end);
  return end;
}
function ePointIn(ax, ay, bx, by, cx, cy, px, py) {
  return (cx - px) * (ay - py) >= (ax - px) * (cy - py) && (ax - px) * (by - py) >= (bx - px) * (ay - py) && (bx - px) * (cy - py) >= (cx - px) * (by - py);
}
const ePointInExceptFirst = (ax, ay, bx, by, cx, cy, px, py) => !(ax === px && ay === py) && ePointIn(ax, ay, bx, by, cx, cy, px, py);
function eOnSegment(p, q, r) { return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y); }
function eIntersects(p1, q1, p2, q2) {
  const o1 = eSign(eArea(p1, q1, p2)), o2 = eSign(eArea(p1, q1, q2)), o3 = eSign(eArea(p2, q2, p1)), o4 = eSign(eArea(p2, q2, q1));
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && eOnSegment(p1, p2, q1)) return true;
  if (o2 === 0 && eOnSegment(p1, q2, q1)) return true;
  if (o3 === 0 && eOnSegment(p2, p1, q2)) return true;
  if (o4 === 0 && eOnSegment(p2, q1, q2)) return true;
  return false;
}
function eLocallyInside(a, b) {
  return eArea(a.prev, a, a.next) < 0 ? eArea(a, b, a.next) >= 0 && eArea(a, a.prev, b) >= 0 : eArea(a, b, a.prev) < 0 || eArea(a, a.next, b) < 0;
}
function eMiddleInside(a, b) {
  let p = a, inside = false;
  const px = (a.x + b.x) / 2, py = (a.y + b.y) / 2;
  do {
    if (p.y > py !== p.next.y > py && p.next.y !== p.y && px < ((p.next.x - p.x) * (py - p.y)) / (p.next.y - p.y) + p.x) inside = !inside;
    p = p.next;
  } while (p !== a);
  return inside;
}
function eIntersectsPolygon(a, b) {
  let p = a;
  do {
    if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i && eIntersects(p, p.next, a, b)) return true;
    p = p.next;
  } while (p !== a);
  return false;
}
function eValidDiagonal(a, b) {
  return a.next.i !== b.i && a.prev.i !== b.i && !eIntersectsPolygon(a, b)
    && ((eLocallyInside(a, b) && eLocallyInside(b, a) && eMiddleInside(a, b) && (eArea(a.prev, a, b.prev) || eArea(a, b.prev, b)))
      || (eEquals(a, b) && eArea(a.prev, a, a.next) > 0 && eArea(b.prev, b, b.next) > 0));
}
function eSplit(a, b) {
  const a2 = eNode(a.i, a.x, a.y), b2 = eNode(b.i, b.x, b.y), an = a.next, bp = b.prev;
  a.next = b; b.prev = a;
  a2.next = an; an.prev = a2;
  b2.next = a2; a2.prev = b2;
  bp.next = b2; b2.prev = bp;
  return b2;
}
function eCure(start, tris) {
  let p = start;
  do {
    const a = p.prev, b = p.next.next;
    if (!eEquals(a, b) && eIntersects(a, p, p.next, b) && eLocallyInside(a, b) && eLocallyInside(b, a)) {
      tris.push(a.i, p.i, b.i);
      eRemove(p); eRemove(p.next);
      p = start = b;
    }
    p = p.next;
  } while (p !== start);
  return eFilter(p);
}
function eZ(x, y, minX, minY, invSize) {
  x = (x - minX) * invSize | 0; y = (y - minY) * invSize | 0;
  x = (x | (x << 8)) & 0x00FF00FF; x = (x | (x << 4)) & 0x0F0F0F0F; x = (x | (x << 2)) & 0x33333333; x = (x | (x << 1)) & 0x55555555;
  y = (y | (y << 8)) & 0x00FF00FF; y = (y | (y << 4)) & 0x0F0F0F0F; y = (y | (y << 2)) & 0x33333333; y = (y | (y << 1)) & 0x55555555;
  return x | (y << 1);
}
function eSortZ(list) {
  let inSize = 1, numMerges;
  do {
    let p = list, tail = null;
    list = null; numMerges = 0;
    while (p) {
      numMerges++;
      let q = p, pSize = 0;
      for (let i = 0; i < inSize; i++) { pSize++; q = q.nextZ; if (!q) break; }
      let qSize = inSize;
      while (pSize > 0 || (qSize > 0 && q)) {
        let e;
        if (pSize !== 0 && (qSize === 0 || !q || p.z <= q.z)) { e = p; p = p.nextZ; pSize--; } else { e = q; q = q.nextZ; qSize--; }
        if (tail) tail.nextZ = e; else list = e;
        e.prevZ = tail; tail = e;
      }
      p = q;
    }
    tail.nextZ = null;
    inSize *= 2;
  } while (numMerges > 1);
  return list;
}
function eIndex(start, minX, minY, invSize) {
  let p = start;
  do { if (p.z === 0) p.z = eZ(p.x, p.y, minX, minY, invSize); p.prevZ = p.prev; p.nextZ = p.next; p = p.next; } while (p !== start);
  p.prevZ.nextZ = null; p.prevZ = null;
  eSortZ(p);
}
function eIsEar(ear) {
  const a = ear.prev, b = ear, c = ear.next;
  if (eArea(a, b, c) >= 0) return false;
  const ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;
  const x0 = Math.min(ax, bx, cx), y0 = Math.min(ay, by, cy), x1 = Math.max(ax, bx, cx), y1 = Math.max(ay, by, cy);
  let p = c.next;
  while (p !== a) {
    if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && ePointInExceptFirst(ax, ay, bx, by, cx, cy, p.x, p.y) && eArea(p.prev, p, p.next) >= 0) return false;
    p = p.next;
  }
  return true;
}
function eIsEarHashed(ear, minX, minY, invSize) {
  const a = ear.prev, b = ear, c = ear.next;
  if (eArea(a, b, c) >= 0) return false;
  const ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;
  const x0 = Math.min(ax, bx, cx), y0 = Math.min(ay, by, cy), x1 = Math.max(ax, bx, cx), y1 = Math.max(ay, by, cy);
  const minZ = eZ(x0, y0, minX, minY, invSize), maxZ = eZ(x1, y1, minX, minY, invSize);
  let p = ear.prevZ, n = ear.nextZ;
  const hit = (q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1 && q !== a && q !== c && ePointInExceptFirst(ax, ay, bx, by, cx, cy, q.x, q.y) && eArea(q.prev, q, q.next) >= 0;
  while (p && p.z >= minZ && n && n.z <= maxZ) {
    if (hit(p)) return false;
    p = p.prevZ;
    if (hit(n)) return false;
    n = n.nextZ;
  }
  while (p && p.z >= minZ) { if (hit(p)) return false; p = p.prevZ; }
  while (n && n.z <= maxZ) { if (hit(n)) return false; n = n.nextZ; }
  return true;
}
function eLinked(ear, tris, minX, minY, invSize, pass) {
  if (!ear) return;
  if (!pass && invSize) eIndex(ear, minX, minY, invSize);
  let stop = ear;
  while (ear.prev !== ear.next) {
    const prev = ear.prev, next = ear.next;
    if (invSize ? eIsEarHashed(ear, minX, minY, invSize) : eIsEar(ear)) {
      tris.push(prev.i, ear.i, next.i);
      eRemove(ear);
      ear = next.next; stop = next.next;
      continue;
    }
    ear = next;
    if (ear === stop) {
      if (!pass) eLinked(eFilter(ear), tris, minX, minY, invSize, 1);
      else if (pass === 1) { ear = eCure(eFilter(ear), tris); eLinked(ear, tris, minX, minY, invSize, 2); }
      else if (pass === 2) eSplitEar(ear, tris, minX, minY, invSize);
      break;
    }
  }
}
function eSplitEar(start, tris, minX, minY, invSize) {
  let a = start;
  do {
    let b = a.next.next;
    while (b !== a.prev) {
      if (a.i !== b.i && eValidDiagonal(a, b)) {
        let c = eSplit(a, b);
        a = eFilter(a, a.next); c = eFilter(c, c.next);
        eLinked(a, tris, minX, minY, invSize, 0);
        eLinked(c, tris, minX, minY, invSize, 0);
        return;
      }
      b = b.next;
    }
    a = a.next;
  } while (a !== start);
}
function eLeftmost(start) {
  let p = start, m = start;
  do { if (p.x < m.x || (p.x === m.x && p.y < m.y)) m = p; p = p.next; } while (p !== start);
  return m;
}
const eSectorContains = (m, p) => eArea(m.prev, m, p.prev) < 0 && eArea(p.next, m, m.next) < 0;
function eBridge(hole, outer) {
  let p = outer, qx = -Infinity, m;
  const hx = hole.x, hy = hole.y;
  if (eEquals(hole, p)) return p;
  do {
    if (eEquals(hole, p.next)) return p.next;
    if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
      const x = p.x + ((hy - p.y) * (p.next.x - p.x)) / (p.next.y - p.y);
      if (x <= hx && x > qx) {
        qx = x; m = p.x < p.next.x ? p : p.next;
        if (x === hx) return m;
      }
    }
    p = p.next;
  } while (p !== outer);
  if (!m) return null;
  const stop = m, mx = m.x, my = m.y;
  let tanMin = Infinity;
  p = m;
  do {
    if (hx >= p.x && p.x >= mx && hx !== p.x && ePointIn(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
      const tan = Math.abs(hy - p.y) / (hx - p.x);
      if (eLocallyInside(p, hole) && (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && eSectorContains(m, p)))))) { m = p; tanMin = tan; }
    }
    p = p.next;
  } while (p !== stop);
  return m;
}
function eHoles(data, holeStarts, outer) {
  const queue = [];
  for (let i = 0; i < holeStarts.length; i++) {
    const start = holeStarts[i] * 2, end = i < holeStarts.length - 1 ? holeStarts[i + 1] * 2 : data.length;
    const list = eList(data, start, end, false);
    if (list === list.next) list.steiner = true;
    queue.push(eLeftmost(list));
  }
  queue.sort((a, b) => {
    let r = a.x - b.x;
    if (r === 0) {
      r = a.y - b.y;
      if (r === 0) r = (a.next.y - a.y) / (a.next.x - a.x) - (b.next.y - b.y) / (b.next.x - b.x);
    }
    return r;
  });
  for (let i = 0; i < queue.length; i++) {
    const hole = queue[i], bridge = eBridge(hole, outer);
    if (!bridge) continue;
    const rev = eSplit(bridge, hole);
    eFilter(rev, rev.next);
    outer = eFilter(bridge, bridge.next);
  }
  return outer;
}
/**
 * Triangles of an outline and its holes. `data`: x, y pairs, the outline first then each hole; `holeStarts`: the index (in points) at
 * which each hole starts. Returns point indices, three to a triangle.
 */
export function earcut(data, holeStarts = null) {
  const hasHoles = holeStarts && holeStarts.length;
  const outerLen = hasHoles ? holeStarts[0] * 2 : data.length;
  let outer = eList(data, 0, outerLen, true);
  const tris = [];
  if (!outer || outer.next === outer.prev) return tris;
  if (hasHoles) outer = eHoles(data, holeStarts, outer);
  let minX = 0, minY = 0, invSize = 0;
  if (data.length > 80 * 2) {
    minX = Infinity; minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < outerLen; i += 2) {
      const x = data[i], y = data[i + 1];
      if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
    invSize = Math.max(maxX - minX, maxY - minY);
    invSize = invSize !== 0 ? 32767 / invSize : 0;
  }
  eLinked(outer, tris, minX, minY, invSize, 0);
  return tris;
}

// ── Runs: a fill's closed outlines, their nesting and what the fill rule makes of them ──
/** A closed run's points without repeats (and without the closing repeat of its first point), as a Float64Array of x, y pairs. */
function cleanRun(pts) {
  const out = [];
  const n = pts.length / 2;
  for (let k = 0; k < n; k++) {
    const x = pts[2 * k], y = pts[2 * k + 1], L = out.length;
    if (!L || x !== out[L - 2] || y !== out[L - 1]) out.push(x, y);
  }
  while (out.length > 4 && out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) out.length -= 2;
  return out;
}
/** The signed area of a run (x, y pairs): positive when the interior lies to the left of its direction (n = (−dy, dx)). */
export function runArea(r) {
  let a = 0;
  for (let i = 0, n = r.length / 2, j = n - 1; i < n; j = i++) a += r[2 * j] * r[2 * i + 1] - r[2 * i] * r[2 * j + 1];
  return a / 2;
}
function runBox(r) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k < r.length; k += 2) { if (r[k] < x0) x0 = r[k]; if (r[k] > x1) x1 = r[k]; if (r[k + 1] < y0) y0 = r[k + 1]; if (r[k + 1] > y1) y1 = r[k + 1]; }
  return [x0, y0, x1, y1];
}
/** Whether (x, y) is inside the run (even-odd, which is non-zero for a simple run); `eps`: a point this near an edge counts as on it (null result). */
export function inRun(r, x, y) {
  let c = false;
  for (let i = 0, n = r.length / 2, j = n - 1; i < n; j = i++) {
    const xi = r[2 * i], yi = r[2 * i + 1], xj = r[2 * j], yj = r[2 * j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function segCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx), d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
/** Whether two runs' edges cross each other (touching at a point does not count). */
export function runsCross(a, ba, b, bb) {
  if (ba[0] > bb[2] || bb[0] > ba[2] || ba[1] > bb[3] || bb[1] > ba[3]) return false;
  const na = a.length / 2, nb = b.length / 2;
  for (let i = 0; i < na; i++) {
    const j = (i + 1) % na, ax = a[2 * i], ay = a[2 * i + 1], bx = a[2 * j], by = a[2 * j + 1];
    const sx0 = Math.min(ax, bx), sx1 = Math.max(ax, bx), sy0 = Math.min(ay, by), sy1 = Math.max(ay, by);
    if (sx0 > bb[2] || sx1 < bb[0] || sy0 > bb[3] || sy1 < bb[1]) continue;
    for (let k = 0; k < nb; k++) {
      const l = (k + 1) % nb, cx = b[2 * k], cy = b[2 * k + 1], dx = b[2 * l], dy = b[2 * l + 1];
      if (Math.max(cx, dx) < sx0 || Math.min(cx, dx) > sx1 || Math.max(cy, dy) < sy0 || Math.min(cy, dy) > sy1) continue;
      if (segCross(ax, ay, bx, by, cx, cy, dx, dy)) return true;
    }
  }
  return false;
}
/** The point where edges (a→b) and (c→d), which cross, meet. */
function crossAt(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax), s = d1 / (d1 - d2);
  return [cx + (dx - cx) * s, cy + (dy - cy) * s];
}
/**
 * A run that crosses itself, cut at its crossing into runs that do not (a figure of eight is two loops of opposite turn): a fill's rule then
 * reads each loop on its own, as the winding of the whole decides. Runs without a crossing come back as they are.
 */
export function splitLoops(run, out = [], depth = 0) {
  const n = run.length / 2;
  if (depth < 32) {
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n, ax = run[2 * i], ay = run[2 * i + 1], bx = run[2 * i2], by = run[2 * i2 + 1];
      const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const j2 = (j + 1) % n, cx = run[2 * j], cy = run[2 * j + 1], dx = run[2 * j2], dy = run[2 * j2 + 1];
        if (Math.max(cx, dx) < x0 || Math.min(cx, dx) > x1 || Math.max(cy, dy) < y0 || Math.min(cy, dy) > y1) continue;
        if (!segCross(ax, ay, bx, by, cx, cy, dx, dy)) continue;
        const [X, Y] = crossAt(ax, ay, bx, by, cx, cy, dx, dy), A = [X, Y], B = [];
        for (let k = i + 1; k <= j; k++) A.push(run[2 * k], run[2 * k + 1]);
        for (let k = 0; k <= i; k++) B.push(run[2 * k], run[2 * k + 1]);
        B.push(X, Y);
        for (let k = j + 1; k < n; k++) B.push(run[2 * k], run[2 * k + 1]);
        splitLoops(A, out, depth + 1); splitLoops(B, out, depth + 1);
        return out;
      }
    }
  }
  out.push(run);
  return out;
}
/**
 * What a fill's runs make: `parts` (each an outline and the holes cut out of it, as run indices), `edges` (the boundary runs with the
 * side the fill lies on: +1 the left of the run's direction, −1 the right), and `crossing` when two runs cross each other (the fill is then
 * each run on its own: a union the geometry cannot take apart, listed as a limit). `eo`: the even-odd rule, else non-zero. Open runs close.
 */
export function analyseFill(polys, eo = false) {
  const runs = [];
  for (const p of polys) {
    const r = cleanRun(p.pts);
    if (r.length < 6) continue;
    for (const q of splitLoops(r)) if (q.length >= 6 && Math.abs(runArea(q)) > 0) runs.push(q);
  }
  const R = runs.length, boxes = runs.map(runBox), area = runs.map(runArea);
  let crossing = false;
  for (let i = 0; i < R && !crossing; i++) for (let j = i + 1; j < R && !crossing; j++) if (runsCross(runs[i], boxes[i], runs[j], boxes[j])) crossing = true;
  if (crossing) {
    const parts = runs.map((r, i) => ({ outer: i, holes: [] })), edges = runs.map((r, i) => ({ run: i, side: area[i] > 0 ? 1 : -1 }));
    return { runs, parts, edges, crossing: true };
  }
  // Nesting: a run's parent is the smallest run that holds one of its points.
  const parent = new Int32Array(R).fill(-1);
  for (let i = 0; i < R; i++) {
    let best = -1;
    for (let j = 0; j < R; j++) {
      if (j === i || Math.abs(area[j]) <= Math.abs(area[i])) continue;
      if (boxes[j][0] > boxes[i][0] || boxes[j][1] > boxes[i][1] || boxes[j][2] < boxes[i][2] || boxes[j][3] < boxes[i][3]) continue;
      const r = runs[i];
      let inside = false;
      for (let k = 0; k < Math.min(3, r.length / 2) && !inside; k++) inside = inRun(runs[j], r[2 * k], r[2 * k + 1]);
      if (inside && (best < 0 || Math.abs(area[j]) < Math.abs(area[best]))) best = j;
    }
    parent[i] = best;
  }
  const kids = Array.from({ length: R }, () => []);
  const roots = [];
  for (let i = 0; i < R; i++) (parent[i] < 0 ? roots : kids[parent[i]]).push(i);
  const filledIn = new Array(R), filledOut = new Array(R), wind = new Int32Array(R), depth = new Int32Array(R);
  const order = [...roots];
  for (let q = 0; q < order.length; q++) {
    const i = order[q], p = parent[i];
    wind[i] = (p < 0 ? 0 : wind[p]) + (area[i] > 0 ? 1 : -1);
    depth[i] = p < 0 ? 1 : depth[p] + 1;
    filledIn[i] = eo ? depth[i] % 2 === 1 : wind[i] !== 0;
    filledOut[i] = p < 0 ? false : filledIn[p];
    for (const c of kids[i]) order.push(c);
  }
  const boundary = (i) => filledIn[i] !== filledOut[i];
  const parts = [], edges = [];
  for (let i = 0; i < R; i++) if (boundary(i)) edges.push({ run: i, side: filledIn[i] ? (area[i] > 0 ? 1 : -1) : area[i] > 0 ? -1 : 1 });
  const walk = (node, owner) => {
    for (const c of kids[node]) {
      if (boundary(c)) {
        if (filledIn[c]) { const part = { outer: c, holes: [] }; parts.push(part); walk(c, part); } else { if (owner) owner.holes.push(c); walk(c, null); }
      } else walk(c, owner);
    }
  };
  for (const r of roots) {
    if (boundary(r) && filledIn[r]) { const part = { outer: r, holes: [] }; parts.push(part); walk(r, part); } else walk(r, null);
  }
  return { runs, parts, edges, crossing: false };
}
/** The triangles (x, y per vertex, three to a triangle) of an analysed fill: each part's outline and holes, by earcut. */
export function fillTriangles(an) {
  const out = [];
  for (const part of an.parts) {
    const data = [], starts = [];
    for (let k = 0; k < an.runs[part.outer].length; k++) data.push(an.runs[part.outer][k]);
    for (const h of part.holes) { starts.push(data.length / 2); for (let k = 0; k < an.runs[h].length; k++) data.push(an.runs[h][k]); }
    const idx = earcut(data, starts);
    for (let k = 0; k < idx.length; k++) out.push(data[2 * idx[k]], data[2 * idx[k] + 1]);
  }
  return new Float32Array(out);
}

// ── The boundary ring ──
/** Floats a fill vertex takes: x, y, dir x, dir y, off, n x, n y, op. */
export const FILL_V = 8;
/** The longest a ring's miter reaches, in the offset's own lengths (a sharper corner is cut flat, as a stroke's miter limit). */
const MITER_MAX = 2;
/**
 * The boundary ring of a run as triangles (six vertices a segment, FILL_V floats each, op 0): the strip between the inside and the outside
 * edge of the ramp, vertices at the run's points offset along the miter direction. `side`: +1 the fill lies left of the run's direction.
 */
export function ringTriangles(run, side, out = [], drop = null) {
  const n = run.length / 2;
  const nx = new Float64Array(n), ny = new Float64Array(n);   // the outward unit normal of segment k (k → k+1)
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n, dx = run[2 * j] - run[2 * k], dy = run[2 * j + 1] - run[2 * k + 1], L = Math.hypot(dx, dy) || 1;
    // left of the direction is (−dy, dx); the fill is on the left when side = 1, so out is the other way
    nx[k] = (dy / L) * side; ny[k] = (-dx / L) * side;
  }
  const mx = new Float64Array(n), my = new Float64Array(n);   // the outward miter at point k (between segments k−1 and k)
  for (let k = 0; k < n; k++) {
    const p = (k + n - 1) % n;
    let ax = nx[p] + nx[k], ay = ny[p] + ny[k];
    const dot = nx[p] * nx[k] + ny[p] * ny[k], den = 1 + dot;
    if (den > 1e-6) { ax /= den; ay /= den; } else { ax = nx[k]; ay = ny[k]; }
    const L = Math.hypot(ax, ay);
    if (L > MITER_MAX) { ax *= MITER_MAX / L; ay *= MITER_MAX / L; }
    mx[k] = ax; my[k] = ay;
  }
  const v = (x, y, dx, dy, off, sx, sy) => { out.push(x, y, dx, dy, off, sx, sy, 0); };
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n, ax = run[2 * k], ay = run[2 * k + 1], bx = run[2 * j], by = run[2 * j + 1];
    if (drop && drop(ax, ay, bx, by)) continue;
    // A inside, A outside, B outside; A inside, B outside, B inside.
    v(ax, ay, mx[k], my[k], -1, nx[k], ny[k]); v(ax, ay, mx[k], my[k], 1, nx[k], ny[k]); v(bx, by, mx[j], my[j], 1, nx[k], ny[k]);
    v(ax, ay, mx[k], my[k], -1, nx[k], ny[k]); v(bx, by, mx[j], my[j], 1, nx[k], ny[k]); v(bx, by, mx[j], my[j], -1, nx[k], ny[k]);
  }
  return out;
}
/**
 * A fill's whole vertex list at one detail level: the boundary ring first (so it claims its pixels' depth), then the interior triangles
 * (dir, off and n zero). Float32Array of FILL_V floats a vertex, op 0 (the level's assembly writes the op in). `an`: analyseFill's result.
 */
export function fillVertices(an, drop = null) {
  const v = [];
  for (const e of an.edges) ringTriangles(an.runs[e.run], e.side, v, drop);
  const tris = fillTriangles(an);
  for (let k = 0; k < tris.length; k += 2) v.push(tris[k], tris[k + 1], 0, 0, 0, 0, 0, 0);
  return new Float32Array(v);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. Products: what a shape becomes at one detail (pure; the tests spy on `deps` to see nothing is cut in a frame)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Floats a fill vertex takes with its morph target (aPosB, aDirB, aNB), and a stroke instance without and with one. */
export const FILL_VM = 14, STROKE_V = 11, STROKE_VM = 19;

/** The fill's ring, leaving out the segments `drop` names (a union's inner edges). */
function ringInto(an, out, drop) {
  for (const e of an.edges) ringTriangles(an.runs[e.run], e.side, out, drop);
  return out;
}
/** The shape's products at one tolerance. `polys`: its flattened outlines. */
export function fillProduct(polys, eo) {
  const an = analyseFill(polys, eo);
  const v = [];
  ringInto(an, v, an.crossing ? innerEdges(polys) : null);
  const tris = fillTriangles(an);
  for (let k = 0; k < tris.length; k += 2) v.push(tris[k], tris[k + 1], 0, 0, 0, 0, 0, 0);
  const b = polyBoxInto(polys, [0, 0, 0, 0]);
  return { an, v: new Float32Array(v), n: v.length / FILL_V, box: [b[0], b[1], b[2] - b[0], b[3] - b[1]], crossing: an.crossing };
}
export function strokeProduct(polys, cap, mesh) {
  const rec = { tri: null, seg: null, nTri: 0, nSeg: 0 };
  mesh(polys, cap, null, rec);
  const n = rec.nSeg, out = new Float32Array(n * STROKE_V), s = rec.seg;
  for (let k = 0; k < n; k++) for (let c = 0; c < SEG; c++) out[k * STROKE_V + c] = s[k * SEG + c];
  const b = polyBoxInto(polys, [0, 0, 0, 0]);
  return { v: out, n, box: [b[0], b[1], b[2] - b[0], b[3] - b[1]] };
}
export function clipProduct(polys) {
  const an = analyseFill(polys, false), t = fillTriangles(an);
  return { v: t, n: t.length / 2 };
}
/** Whether two analysed fills have the same structure (the same runs, point for point, in the same parts): one can then ease into the other by vertex. */
export function morphable(a, b) {
  if (!a || !b || a.crossing || b.crossing || a.runs.length !== b.runs.length || a.parts.length !== b.parts.length || a.edges.length !== b.edges.length) return false;
  for (let i = 0; i < a.runs.length; i++) if (a.runs[i].length !== b.runs[i].length) return false;
  for (let i = 0; i < a.parts.length; i++) {
    const p = a.parts[i], q = b.parts[i];
    if (p.outer !== q.outer || p.holes.length !== q.holes.length) return false;
    for (let k = 0; k < p.holes.length; k++) if (p.holes[k] !== q.holes[k]) return false;
  }
  for (let i = 0; i < a.edges.length; i++) if (a.edges[i].run !== b.edges[i].run || a.edges[i].side !== b.edges[i].side) return false;
  return true;
}
/** A fill's vertices that carry the outline it eases to (FILL_VM floats each): the triangulation of `a` indexes both, so the pair keeps one topology. null when they differ. */
export function fillMorphProduct(a, b) {
  if (!morphable(a, b)) return null;
  const va = [], vb = [];
  ringInto(a, va, null); ringInto(b, vb, null);
  const out = [];
  for (let k = 0; k < va.length; k += FILL_V) out.push(va[k], va[k + 1], va[k + 2], va[k + 3], va[k + 4], va[k + 5], va[k + 6], 0, vb[k], vb[k + 1], vb[k + 2], vb[k + 3], vb[k + 5], vb[k + 6]);
  for (const part of a.parts) {
    const da = [], db = [], starts = [];
    const cat = (an, into, r) => { for (let k = 0; k < an.runs[r].length; k++) into.push(an.runs[r][k]); };
    cat(a, da, part.outer); cat(b, db, part.outer);
    for (const h of part.holes) { starts.push(da.length / 2); cat(a, da, h); cat(b, db, h); }
    const idx = earcut(da, starts);
    for (let k = 0; k < idx.length; k++) { const i = idx[k]; out.push(da[2 * i], da[2 * i + 1], 0, 0, 0, 0, 0, 0, db[2 * i], db[2 * i + 1], 0, 0, 0, 0); }
  }
  return { v: new Float32Array(out), n: out.length / FILL_VM };
}
/** A stroke's instances that carry the outline they ease to (STROKE_VM floats each), or null when the two have not the same segments. */
export function strokeMorphProduct(a, b) {
  if (!a || !b || a.n !== b.n) return null;
  const out = new Float32Array(a.n * STROKE_VM);
  for (let k = 0; k < a.n; k++) {
    const i = k * STROKE_V, o = k * STROKE_VM;
    for (let c = 0; c < STROKE_V; c++) out[o + c] = a.v[i + c];
    out[o + 11] = b.v[i]; out[o + 12] = b.v[i + 1]; out[o + 13] = b.v[i + 2]; out[o + 14] = b.v[i + 3];
    out[o + 15] = b.v[i + 6]; out[o + 16] = b.v[i + 7]; out[o + 17] = b.v[i + 8]; out[o + 18] = b.v[i + 9];
  }
  return { v: out, n: a.n };
}
/** Joins products into one stream: item.p.v written at its offset with the op's index in slot `opAt` of every vertex (or instance). Returns { buf, ofs, cnt } (ofs, cnt: by item index). */
export function assemble(items, stride, opAt) {
  let total = 0;
  for (const it of items) total += it.p ? it.p.n : 0;
  const buf = new Float32Array(total * stride), ofs = new Int32Array(items.length), cnt = new Int32Array(items.length);
  let at = 0;
  for (let i = 0; i < items.length; i++) {
    const p = items[i].p;
    ofs[i] = at;
    if (!p) continue;
    buf.set(p.v, at * stride);
    if (opAt >= 0) for (let k = 0; k < p.n; k++) buf[(at + k) * stride + opAt] = items[i].op;
    cnt[i] = p.n; at += p.n;
  }
  return { buf, ofs, cnt, n: total };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. The organs: ops, levels, the draw
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const MASK_PX = 1024;           // the most a mask's texture takes on a side
const COVER_SIDE = 4096;        // the most the covers' texture takes on a side
const DEFAULT_BUDGET = 96 * 1024 * 1024;   // bytes of prepared geometry kept (trim() drops the finest levels past it)
const STENCIL_A = 0x20, STENCIL_B = 0x10;   // (bit 0x80 is the overlays' (vec-overlays.js UNDER))
const HASH = new WeakMap();
let polySeq = 0;
/** A shape's name: its source's id, its text's length and hash, or a fixed shape's own number. */
const DK = new WeakMap();
function keyOf(g, el) {
  if (g.src) return `n${g.src.id}`;
  if (g.d != null) {
    let r = el && DK.get(el);
    if (r && r.d === g.d) return r.key;
    const key = `d${g.d.length}:${strHash(g.d)}`;
    if (el) { if (!r) DK.set(el, (r = { d: '', key: '' })); r.d = g.d; r.key = key; }
    return key;
  }
  let r = HASH.get(g.poly);
  if (!r) HASH.set(g.poly, (r = `p${++polySeq}`));
  return r;
}
const fillKey = (k, tol, eo) => `f${tol}|${eo ? 1 : 0}|${k}`;
const lineKey = (k, tol, cap, dash) => `s${tol}|${cap}|${dash ? `${dash.a.join(',')}@${dash.off}` : ''}|${k}`;
const clipKeyOf = (k, tol) => `c${tol}|${k}`;
const copy6 = (o, a) => { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; o[3] = a[3]; o[4] = a[4]; o[5] = a[5]; return o; };
const frameScale = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
/** world → device (SVG [a b c d e f]) as a column-major mat3. */
function mat3Into(o, m) { o[0] = m[0]; o[1] = m[1]; o[2] = 0; o[3] = m[2]; o[4] = m[3]; o[5] = 0; o[6] = m[4]; o[7] = m[5]; o[8] = 1; return o; }

/**
 * The organs of the vector renderer. `gl`: the figure's WebGL2 context. `deps`: what cuts shapes (tests give spies): flattenCmds,
 * flattenPath, polyMeshInto, dashPolys, now. See the file's head for the design.
 *
 *   setOrgans(layers, order, opt?)  the stack's input (Map layer → [{ spec, m }]) and the layers' order; returns true when something changed.
 *   prepare(maxZoom, scale)         wants every detail level from the coarsest to the one a camera at `scale` · maxZoom takes (kept)
 *   step(deadline)                  prepares more within `deadline` (performance.now); true when all that is wanted is ready
 *   update()                        the frame's changes written (the ops' frames, opacities, paints; masks and covers rebuilt); outside the pass
 *   draw(pass, m, only?)            into the open pass, m the camera (world → device px); `only`: a layer name, or a list of them
 *   covers()                        { tex, rect } the vessels' organ cover texture and its world rectangle (setCovers)
 *   setMorph(from, to) / morphAt(t) the liver's easing by vertex
 */
export function createVecOrgans(gl, deps = {}) {
  const D = {
    flattenCmds: deps.flattenCmds || flattenCmds, flattenPath: deps.flattenPath || flattenPath, polyMeshInto: deps.polyMeshInto || polyMeshInto,
    dashPolys: deps.dashPolys || dashPolys, now: deps.now || (() => performance.now()),
  };
  const programs = {};
  const prog = (name, vs, fs) => {
    if (programs[name]) return programs[name];
    const p = linkProgram(gl, vs, fs), u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let k = 0; k < n; k++) { const nm = gl.getActiveUniform(p, k).name.replace(/\[0\]$/, ''); u[nm] = gl.getUniformLocation(p, nm); }
    return (programs[name] = { p, u });
  };
  const fillP = (morph) => prog(morph ? 'fillM' : 'fill', fillVS(morph), FILL_FS);
  const strokeP = (morph) => prog(morph ? 'strokeM' : 'stroke', strokeVS(morph), STROKE_FS);
  const clipP = () => prog('clip', CLIP_VS, CLIP_FS);

  // ── State ──
  let layers = null, order = [], ops = [], masks = new Map(), clips = new Map(), entries = [];
  let structVer = 0, dynVer = 0, covVer = 0, cssPx = 1, maskScale = 1, lookNow = null;
  const levels = new Map(), want = [];
  let wantTop = LEVEL_COARSE, budget = DEFAULT_BUDGET, bytes = 0;
  const stats = { flatten: 0, mesh: 0, levelsBuilt: 0, dynBuilt: 0, maskRebuilds: 0, coverRebuilds: 0, drawCalls: 0, batches: 0, level: 0, usedLevel: 0, fallbacks: 0, morphPrepared: 0, morphVertex: 0, ops: 0, bytes: 0 };
  const limits = new Map();
  const noteLimit = (layer, why) => { const k = `${layer}: ${why}`; limits.set(k, (limits.get(k) || 0) + 1); };
  const live = newLive(), M1 = [1, 0, 0, 1, 0, 0], M2 = [1, 0, 0, 1, 0, 0], M3 = [1, 0, 0, 1, 0, 0];
  const SRCV = { src: null, d: null, poly: null };
  // ── The ops texture ──
  let opsTex = null, opsCap = 0, opsData = new Float32Array(0), dirtyLo = 1e9, dirtyHi = -1;
  const row = new Float32Array(OP_TEXELS * 4);
  function ensureRows(n) {
    if (n <= opsCap && opsTex) return;
    const cap = Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(n, 1))));
    const nd = new Float32Array(cap * OP_TEXELS * 4);
    nd.set(opsData);
    opsData = nd; opsCap = cap;
    if (!opsTex) { opsTex = gl.createTexture(); }
    gl.bindTexture(gl.TEXTURE_2D, opsTex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, OP_TEXELS, cap, 0, gl.RGBA, gl.FLOAT, opsData);
    dirtyLo = 1e9; dirtyHi = -1;
  }
  function writeRow(i) {
    const o = i * OP_TEXELS * 4;
    for (let k = 0; k < row.length; k++) if (opsData[o + k] !== row[k]) { for (let c = k; c < row.length; c++) opsData[o + c] = row[c]; if (i < dirtyLo) dirtyLo = i; if (i > dirtyHi) dirtyHi = i; return true; }
    return false;
  }
  function flushRows() {
    if (dirtyHi < 0 || !opsTex) return;
    gl.bindTexture(gl.TEXTURE_2D, opsTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, dirtyLo, OP_TEXELS, dirtyHi - dirtyLo + 1, gl.RGBA, gl.FLOAT, opsData.subarray(dirtyLo * OP_TEXELS * 4, (dirtyHi + 1) * OP_TEXELS * 4));
    dirtyLo = 1e9; dirtyHi = -1;
  }

  // ── Ingestion ──
  // A leaf op: one fill or stroke of a painter op, with what the stack above it holds (its layer, its entry, the nested groups it is in, its mask).
  const OPS = new WeakMap();   // painter op → its record, kept while the op is the same one
  function newLeaf(p, layer, entry, spec, groups, mask, maskOwner) {
    let o = OPS.get(p);
    if (!o) OPS.set(p, (o = { p, key: '', srcId: 0, dynamic: false, scale: 1, box: null, gm: null, row: 0 }));
    o.layer = layer; o.entry = entry; o.spec = spec; o.groups = groups; o.mask = mask; o.maskOwner = maskOwner;
    o.kind = p.kind; o.clipRec = null; o.clip2Rec = null;
    return o;
  }
  function maskOf(spec) {
    let m = masks.get(spec);
    if (!m) masks.set(spec, (m = { spec, ops: [], rect: [0, 0, 1, 1], res: [1, 1], tex: null, fbo: null, rb: null, dirty: true, built: false, ver: 0, sig: new Float64Array(0), n: 0, items: null }));
    return m;
  }
  function clipRecOf(c) {
    let r = clips.get(c.geom);
    if (!r) clips.set(c.geom, (r = { id: clips.size, geom: c.geom, key: '', srcId: 0, dynamic: false, scale: 1 }));
    return r;
  }
  function ingest(list, layer, entry, spec, groups, mask, maskOwner, out) {
    for (const p of list) {
      if (p.kind === 'group') {
        // A group of its own (opacity under 1, or a mask): its opacity is carried to its shapes' (the design's option 0) and its mask kept as a texture.
        const gm = p.mask ? maskOf(p.mask) : null;
        if (gm && mask) noteLimit(layer, 'a masked group inside a masked group (the inner mask only)');
        noteLimit(layer, p.mask ? 'a see-through, masked group (opacity carried to its shapes, mask kept)' : 'a see-through group (opacity carried to its shapes)');
        const g = { p, entry, parent: groups };
        ingest(p.ops, layer, entry, spec, groups ? [...groups, g] : [g], gm || mask, gm ? g : maskOwner, out);   // alloc-rare: the op list is built when the organs are set, never in a frame
        if (gm) { gm.owner = g; if (!gm.built) ingestMask(gm, layer, entry); }
        continue;
      }
      const o = newLeaf(p, layer, entry, spec, groups, mask, maskOwner);
      if (p.clip) { o.clipRec = clipRecOf(p.clip); if (p.clip.outer) o.clip2Rec = clipRecOf(p.clip.outer); }
      out.push(o);
    }
  }
  function ingestMask(m, layer, entry) {
    m.ops.length = 0;
    const tmp = [];
    for (const p of m.spec.ops) {
      if (p.kind === 'group') { noteLimit(layer, 'a group inside a mask (flattened)'); for (const q of p.ops) { if (q.kind !== 'group') { const o = newLeaf(q, layer, entry, m.spec, null, null, null); o.inMask = m; tmp.push(o); } } continue; }
      const o = newLeaf(p, layer, entry, m.spec, null, null, null);
      o.inMask = m;
      if (p.clip) { o.clipRec = clipRecOf(p.clip); if (p.clip.outer) o.clip2Rec = clipRecOf(p.clip.outer); }
      tmp.push(o);
    }
    for (const o of tmp) m.ops.push(o);
    m.dirty = true; m.built = true;
  }
  function setOrgans(layerMap, orderNames) {
    if (layerMap === layers && orderNames === order) return false;
    layers = layerMap; order = orderNames || [...(layerMap?.keys() || [])];
    const list = [];
    masks = new Map();   // alloc-rare: the masks are made when the organs are set (again only when the set is), never in a frame
    clips = new Map();
    entries = [];
    limits.clear();
    if (layerMap) for (const name of order) {
      const lv = layerMap.get(name);
      if (!lv) continue;
      for (const e of lv) {
        const entry = { layer: name, e, cur: [1, 0, 0, 1, 0, 0] };
        entries.push(entry);
        const spec = e.spec;
        if (spec.mask) { const mk = maskOf(spec.mask); mk.owner = { entry, p: null, root: true }; if (!mk.built) ingestMask(mk, name, entry); }
        ingest(spec.ops, name, entry, spec, null, spec.mask ? maskOf(spec.mask) : null, spec.mask ? { entry, root: true } : null, list);
      }
    }
    ops = list;
    ops.forEach((o, i) => { o.row = i; o.mainIndex = i; o.opAlpha = 1; });
    let r = ops.length;
    for (const m of masks.values()) for (const o of m.ops) { o.row = r++; }
    covRow0 = r; r += covOps.length;
    if (ops.length > OP_DEPTHS) noteLimit('all', 'more ops than depth steps (the last ones may not hide what lies under them)');
    ensureRows(r);
    for (const o of ops) { o.dynamic = !!(srcOfGeom(o.p.geom)); o.key = ''; o.wasDyn = false; }
    for (const rec of clips.values()) { rec.key = ''; }
    runs = buildRuns();
    structVer++; dynVer++; if (covShapes) covDirty = true;
    for (const lv of levels.values()) { lv.ver = -1; lv.dynVer = -1; }
    stats.ops = ops.length;
    update(true);
    return true;
  }
  const srcOfGeom = (g) => { if (!g.d) return null; geomSourceTo(SRCV, g); return SRCV.src; };
  let runs = [], covRow0 = 0;
  const covOps = [];

  // ── Batches: the main ops in order, split where what a draw needs changes ──
    function buildRuns() {
    const out = [];
    let cur = null;
    for (const o of ops) {
      if (cur && cur.kind === o.kind && cur.dynamic === o.dynamic && cur.mask === o.mask && cur.maskOwner === o.maskOwner && cur.clip === o.clipRec && cur.clip2 === o.clip2Rec && cur.layer === o.layer) { cur.i1 = o.mainIndex; continue; }
      cur = { kind: o.kind, dynamic: o.dynamic, mask: o.mask, maskOwner: o.maskOwner, clip: o.clipRec, clip2: o.clip2Rec, layer: o.layer, i0: o.mainIndex, i1: o.mainIndex, inv: new Float32Array(9), frame: [1, 0, 0, 1, 0, 0] };
      out.push(cur);
    }
    stats.batches = out.length;
    return out;
  }

  // ── What a frame writes: the ops' rows ──
  function opFrame(o, w) {
    // The painter op's frame now: entry frame ∘ its own.
    liveInto(live, o.p);
    mulTo(w, o.entry.cur, live.m);
    return live;
  }
  function boxOfOp(o) { return o.box || [0, 0, 1, 1]; }
  function writeOpRow(o, localFrame) {
    const lv = live, w = M1;
    if (localFrame) copy6(w, lv.m); else mulTo(w, o.entry.cur, lv.m);
    let a = lv.alpha;
    if (!o.inMask) {
      a *= specOpacity(o.spec);
      if (o.groups) for (const g of o.groups) { liveInto(gl_live, g.p); a *= gl_live.alpha; }
    }
    row.fill(0);
    const e0 = T_M * 4, e1 = T_E * 4, c0 = T_COL * 4, p0 = T_GP * 4, g0 = T_GM0 * 4, g1 = T_GM1 * 4;
    row[e0] = w[0]; row[e0 + 1] = w[1]; row[e0 + 2] = w[2]; row[e0 + 3] = w[3];
    row[e1] = w[4]; row[e1 + 1] = w[5]; row[e1 + 2] = a;
    o.world = o.world || [1, 0, 0, 1, 0, 0]; copy6(o.world, w);
    const paint = o.p.paint;
    if (paint.solid) { row[e1 + 3] = 0; row[c0] = paint.solid[0]; row[c0 + 1] = paint.solid[1]; row[c0 + 2] = paint.solid[2]; row[c0 + 3] = paint.solid[3]; }
    else {
      const g = paint.grad, n = g.stops.length;
      row[e1 + 3] = g.kind;
      row[p0] = g.p[0]; row[p0 + 1] = g.p[1]; row[p0 + 2] = g.p[2]; row[p0 + 3] = g.p[3] ?? 0;
      // shape units → the gradient's space: its box (objectBoundingBox), then its transform undone.
      const b = boxOfOp(o);
      M2[0] = g.box ? 1 / (b[2] || 1) : 1; M2[1] = 0; M2[2] = 0; M2[3] = g.box ? 1 / (b[3] || 1) : 1; M2[4] = g.box ? -b[0] / (b[2] || 1) : 0; M2[5] = g.box ? -b[1] / (b[3] || 1) : 0;
      mulTo(M2, invTo(M3, g.gt), M2);
      row[g0] = M2[0]; row[g0 + 1] = M2[1]; row[g0 + 2] = M2[2]; row[g0 + 3] = M2[3]; row[g1] = M2[4]; row[g1 + 1] = M2[5]; row[g1 + 2] = n;
      for (let i = 0; i < n; i++) {
        const s = g.stops[i];
        row[T_SO * 4 + i] = s[0];
        row[(T_SC + i) * 4] = s[1]; row[(T_SC + i) * 4 + 1] = s[2]; row[(T_SC + i) * 4 + 2] = s[3]; row[(T_SC + i) * 4 + 3] = s[4];
      }
    }
    if (o.kind === 'stroke') { row[T_W * 4] = o.p.w / 2; row[T_W * 4 + 1] = o.p.nss ? (o.p.w * cssPx) / 2 : 0; }
    return writeRow(o.row);
  }
  const gl_live = newLive();
  function geomOf(o) { return geomSourceTo(SRCV, o.p.geom); }
  /** Refreshes what a frame can have changed. `force`: the first time. Returns the number of rows written. */
  function update(force = false) {
    let changed = 0;
    for (const e of entries) copy6(e.cur, e.e.m);
    if (opsCap) for (const o of ops) {
      opFrame(o, M1);
      const s = frameScale(M1);
      if (force || o.key === '' || Math.abs(s - o.scale) > 1e-6) { o.scale = s; }
      const g = geomOf(o), k = keyOf(g, o.p.geom.el);
      if (k !== o.key) {
        if (o.key !== '') { o.dynamic = true; dynVer++; if (!o.wasDyn) { o.wasDyn = true; runs = buildRuns(); structVer++; } }
        o.key = k;
        o.box = null;
      }
      if (writeOpRow(o, false)) changed++;
    }
    for (const m of masks.values()) {
      for (const o of m.ops) {
        liveInto(live, o.p);
        const g = geomOf(o), k = keyOf(g, o.p.geom.el);
        if (k !== o.key) { o.key = k; m.dirty = true; }
        if (writeOpRow(o, true)) m.dirty = true, changed++;
      }
    }
    if (opsCap) flushRows();
    for (const m of masks.values()) if (m.dirty) rebuildMask(m);
    if (covDirty) rebuildCovers();
    return changed;
  }

  // ── Products at a level: kept by shape and tolerance ──
  const products = new Map();
  const tolOf = (j, o) => 2 ** j / Math.max(o.scale, 1e-6);
  function polysOf(g, tol, dash) {
    stats.flatten++;
    let polys;
    if (g.src) polys = D.flattenCmds(g.src.cmds, tol);
    else if (g.d != null) polys = D.flattenPath(g.d, tol);
    else polys = g.poly;
    return dash ? D.dashPolys(polys, dash) : polys;
  }
  function productOf(o, j) {
    const g = geomOf(o), p = o.p, tol = tolOf(j, o), k = keyOf(g, p.geom.el);
    if (o.kind === 'fill') {
      const key = fillKey(k, tol, p.eo);
      let r = products.get(key);
      if (!r) { stats.mesh++; r = fillProduct(polysOf(g, tol, null), !!p.eo); products.set(key, r); if (r.crossing) noteLimit(o.layer, 'overlapping runs of one fill (a union: inner edges left out)'); }
      if (!o.box) o.box = r.box;
      return r;
    }
    const key = lineKey(k, tol, p.cap, p.dash);
    let r = products.get(key);
    if (!r) { stats.mesh++; r = strokeProduct(polysOf(g, tol, p.dash || null), p.cap, D.polyMeshInto); products.set(key, r); }
    if (!o.box) o.box = r.box;
    return r;
  }
  function clipProductOf(rec, o, j, which) {
    const c = which === 2 ? o.p.clip.outer : o.p.clip;
    SRCV.src = null; geomSourceTo(SRCV, c.geom);
    const k = keyOf(SRCV, c.geom.el), tol = 2 ** j / Math.max(o.scale, 1e-6), key = clipKeyOf(k, tol);
    let r = products.get(key);
    if (!r) { stats.mesh++; r = clipProduct(polysOf(SRCV, tol, null)); products.set(key, r); }
    return r;
  }

  // ── Levels ──
    function uploadVao(stream, kind, morph) {
    const b = gl.createBuffer(), vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, stream.buf, gl.STATIC_DRAW);
    const F = 4;
    if (kind === 'fill') {
      const S = (morph ? FILL_VM : FILL_V) * F;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, S, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, S, 2 * F);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, S, 4 * F);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, S, 5 * F);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, S, 7 * F);
      if (morph) { gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 2, gl.FLOAT, false, S, 8 * F); gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 2, gl.FLOAT, false, S, 10 * F); gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 2, gl.FLOAT, false, S, 12 * F); }
    } else {
      const S = (morph ? STROKE_VM : STROKE_V) * F;
      gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf());
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      const at = (loc, n, off) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, S, off * F); gl.vertexAttribDivisor(loc, 1); };
      at(1, 4, 0); at(2, 2, 4); at(3, 4, 6); at(4, 1, 10);
      if (morph) { at(5, 4, 11); at(6, 4, 15); }
    }
    gl.bindVertexArray(null);
    return { buf: b, vao, n: stream.n, bytes: stream.buf.byteLength };
  }
  let corner = null;
  const cornerBuf = () => {
    if (corner) return corner;
    corner = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corner);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    return corner;
  };
  function uploadClip(stream) {
    const b = gl.createBuffer(), vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, stream.buf, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return { buf: b, vao, n: stream.n, bytes: stream.buf.byteLength };
  }
  const freeStream = (s) => { if (!s) return; gl.deleteBuffer(s.buf); gl.deleteVertexArray(s.vao); bytes -= s.bytes; };
  function freeLevel(lv) { for (const k of ['sFill', 'sStroke', 'sClip', 'dFill', 'dStroke', 'dClip', 'dFillM', 'dStrokeM']) { freeStream(lv[k]); lv[k] = null; } }
  /** The static ops of a level, as its stream: one op's product after another, in the ops' order. Returns the level (replacing the one kept). */
  function buildStatic(j) {
    const fi = [], si = [], cOf = new Map(), clipItems = [];
    const lvl = { j, ver: structVer, dynVer: -1, fOfs: new Int32Array(ops.length), fCnt: new Int32Array(ops.length), sOfs: new Int32Array(ops.length), sCnt: new Int32Array(ops.length), cFirst: new Int32Array(clips.size), cCount: new Int32Array(clips.size),
      sFill: null, sStroke: null, sClip: null, dFill: null, dStroke: null, dClip: null, dFillM: null, dStrokeM: null, dfOfs: null, dfCnt: null, dsOfs: null, dsCnt: null, dcFirst: null, dcCount: null, morph: false, bytes: 0 };
    for (const o of ops) {
      if (o.dynamic) continue;
      const p = productOf(o, j);
      (o.kind === 'fill' ? fi : si).push({ i: o.mainIndex, op: o.row, p });
      for (const [rec, which] of [[o.clipRec, 1], [o.clip2Rec, 2]]) if (rec && !cOf.has(rec)) { cOf.set(rec, true); clipItems.push({ rec, op: 0, p: clipProductOf(rec, o, j, which) }); }
    }
    return { lvl, fi, si, clipItems };
  }
  function finishStatic(b) {
    const { lvl, fi, si, clipItems } = b;
    const F = assemble(fi, FILL_V, 7), S = assemble(si, STROKE_V, 10), C = assemble(clipItems, 2, -1);
    for (let k = 0; k < fi.length; k++) { lvl.fOfs[fi[k].i] = F.ofs[k]; lvl.fCnt[fi[k].i] = F.cnt[k]; }
    for (let k = 0; k < si.length; k++) { lvl.sOfs[si[k].i] = S.ofs[k]; lvl.sCnt[si[k].i] = S.cnt[k]; }
    for (let k = 0; k < clipItems.length; k++) { lvl.cFirst[clipItems[k].rec.id] = C.ofs[k]; lvl.cCount[clipItems[k].rec.id] = C.cnt[k]; }
    if (F.n) { lvl.sFill = uploadVao(F, 'fill', false); bytes += lvl.sFill.bytes; }
    if (S.n) { lvl.sStroke = uploadVao(S, 'stroke', false); bytes += lvl.sStroke.bytes; }
    if (C.n) { lvl.sClip = uploadClip(C); bytes += lvl.sClip.bytes; }
    return lvl;
  }
  /** The deforming ops of a level, as a stream of their own (rebuilt when their shapes change, for each level when asked). `to`: the outlines they ease to (setMorph). */
  function buildDynamic(lvl) {
    const j = lvl.j, fi = [], si = [], clipItems = [], cOf = new Map();
    let morphed = false;
    for (const o of ops) {
      if (!o.dynamic) continue;
      let p = productOf(o, j), isM = false;
      const to = morphFor(o);
      if (to) {
        const pb = morphProduct(to, o, j), mp = pb ? (o.kind === 'fill' ? fillMorphProduct(p.an, pb.an) : strokeMorphProduct(p, pb)) : null;
        if (mp) { p = mp; isM = true; morphed = true; stats.morphVertex++; } else stats.morphPrepared++;
      }
      (o.kind === 'fill' ? fi : si).push({ i: o.mainIndex, op: o.row, p, morph: isM });
      for (const [rec, which] of [[o.clipRec, 1], [o.clip2Rec, 2]]) if (rec && !cOf.has(rec)) { cOf.set(rec, true); clipItems.push({ rec, op: 0, p: clipProductOf(rec, o, j, which) }); }
    }
    freeStream(lvl.dFill); freeStream(lvl.dStroke); freeStream(lvl.dClip); freeStream(lvl.dFillM); freeStream(lvl.dStrokeM);
    lvl.dFill = lvl.dStroke = lvl.dClip = lvl.dFillM = lvl.dStrokeM = null;
    lvl.dOfs = new Int32Array(ops.length); lvl.dCnt = new Int32Array(ops.length); lvl.dMorph = new Uint8Array(ops.length);
    lvl.dcFirst = new Int32Array(clips.size); lvl.dcCount = new Int32Array(clips.size);
    const split = (items, kindMorph) => items.filter((it) => !!it.morph === kindMorph);
    const stream = (items, stride, opAt, morph, kind, slot) => {
      if (!items.length) return;
      const A = assemble(items, stride, opAt);
      for (let k = 0; k < items.length; k++) { lvl.dOfs[items[k].i] = A.ofs[k]; lvl.dCnt[items[k].i] = A.cnt[k]; lvl.dMorph[items[k].i] = morph ? 1 : 0; }
      if (A.n) { lvl[slot] = uploadVao(A, kind, morph); bytes += lvl[slot].bytes; }
    };
    stream(split(fi, false), FILL_V, 7, false, 'fill', 'dFill');
    stream(split(fi, true), FILL_VM, 7, true, 'fill', 'dFillM');
    stream(split(si, false), STROKE_V, 10, false, 'stroke', 'dStroke');
    stream(split(si, true), STROKE_VM, 10, true, 'stroke', 'dStrokeM');
    if (clipItems.length) {
      const C = assemble(clipItems, 2, -1);
      for (let k = 0; k < clipItems.length; k++) { lvl.dcFirst[clipItems[k].rec.id] = C.ofs[k]; lvl.dcCount[clipItems[k].rec.id] = C.cnt[k]; }
      if (C.n) { lvl.dClip = uploadClip(C); bytes += lvl.dClip.bytes; }
    }
    lvl.dynVer = dynVer; lvl.morph = morphed; stats.dynBuilt++;
  }

  // ── Morph: the liver eases between two outlines ──
  let morphFrom = null, morphTo = null, morphT = 0;
  const morphFor = (o) => {
    if (!morphFrom || !morphTo) return null;
    const g = geomOf(o);
    return g.src === morphFrom ? morphTo : null;
  };
  function morphProduct(to, o, j) {
    const tol = tolOf(j, o), k = `n${to.id}`;
    if (o.kind === 'fill') {
      const key = fillKey(k, tol, o.p.eo);
      let r = products.get(key);
      if (!r) { stats.mesh++; stats.flatten++; r = fillProduct(D.flattenCmds(to.cmds, tol), !!o.p.eo); products.set(key, r); }
      return r;
    }
    const key = lineKey(k, tol, o.p.cap, o.p.dash);
    let r = products.get(key);
    if (!r) { stats.mesh++; stats.flatten++; const polys = D.flattenCmds(to.cmds, tol); r = strokeProduct(o.p.dash ? D.dashPolys(polys, o.p.dash) : polys, o.p.cap, D.polyMeshInto); products.set(key, r); }
    return r;
  }
  /** The outline `from` (a shapeSource the elements draw now) eases to `to`: each shape of it that matches point for point is blended by vertex under morphAt(t), the rest are prepared. */
  function setMorph(from, to) {
    if (morphFrom === from && morphTo === to) return;
    morphFrom = from; morphTo = to; dynVer++;
    for (const lv of levels.values()) lv.dynVer = -1;
  }
  const morphAt = (t) => { morphT = t < 0 ? 0 : t > 1 ? 1 : t; };

  // ── The job: every level wanted, a few ms at a time ──
  /** Wants every level from the coarsest to the one a camera at `scale` · `maxZoom` uses. Order: the level for `scale` first, then finer ones, then coarser. */
  function prepare(maxZoom = DIVE_K_MAX, scale = 1) {
    wantTop = Math.max(LEVEL_MIN, levelOf(scale * maxZoom));
    const j0 = levelOf(scale);
    want.length = 0;
    for (let j = j0; j >= wantTop; j--) want.push(j);
    for (let j = j0 + 1; j <= LEVEL_COARSE; j++) want.push(j);
    return want.length;
  }
  /** Builds the next level within `until` (performance.now); true when every level wanted (and its deforming shapes) is whole. */
  function step(until = Infinity) {
    let worked = false;
    for (const j of want) {
      let lv = levels.get(j);
      if (!lv || lv.ver !== structVer) {
        if (worked && D.now() > until) return false;
        const old = lv;
        const nl = finishStatic(buildStatic(j));
        if (old) {
          for (const k of ['sFill', 'sStroke', 'sClip']) freeStream(old[k]);
          for (const k of ['dFill', 'dStroke', 'dClip', 'dFillM', 'dStrokeM', 'dOfs', 'dCnt', 'dMorph', 'dcFirst', 'dcCount', 'morph', 'dynVer']) nl[k] = old[k];
        }
        levels.set(j, nl); lv = nl; stats.levelsBuilt++; worked = true;
      }
      if (lv.dynVer !== dynVer) {
        if (worked && D.now() > until) return false;
        buildDynamic(lv); worked = true;
      }
    }
    stats.bytes = bytes;
    return true;
  }
  /** Prepares everything wanted at once (the tests', and a first paint's). */
  const prepareAll = () => { while (!step(Infinity)) { /* until whole */ } return true; };
  /** Whether a frame at device scale `sc` (or every level wanted, with none) can be drawn from its own level, whole and current. */
  const ready = (sc) => {
    if (sc != null) { const lv = levels.get(levelOf(sc)); return !!lv && lv.ver === structVer && lv.dynVer === dynVer; }
    for (const j of want) { const lv = levels.get(j); if (!lv || lv.ver !== structVer || lv.dynVer !== dynVer) return false; }
    return want.length > 0;
  };

  /** The level a frame at device scale `sc` draws: its own when prepared, else the nearest finer one, else the nearest coarser (stats.fallbacks counts those). */
  function pick(sc) {
    const j = levelOf(sc);
    stats.level = j;
    let lv = levels.get(j);
    if (lv && lv.ver >= 0) { stats.usedLevel = j; return lv; }
    stats.fallbacks++;
    for (let k = j - 1; k >= LEVEL_MIN; k--) { lv = levels.get(k); if (lv && lv.ver >= 0) { stats.usedLevel = k; return lv; } }
    for (let k = j + 1; k <= LEVEL_COARSE; k++) { lv = levels.get(k); if (lv && lv.ver >= 0) { stats.usedLevel = k; return lv; } }
    return null;
  }
  /** Levels past the budget are given up, the finest first (the one in use stays). */
  function trim() {
    const js = [...levels.keys()].sort((a, b) => a - b);
    for (const j of js) {
      if (bytes <= budget || j === stats.usedLevel || j === LEVEL_COARSE) continue;
      freeLevel(levels.get(j)); levels.delete(j);
      const at = want.indexOf(j); if (at >= 0) want.splice(at, 1);
    }
    stats.bytes = bytes;
  }

  // ── Masks: a group's luminance, kept as a texture of its own frame ──
  function rebuildMask(m) {
    m.dirty = false;
    stats.maskRebuilds++;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const items = [];
    for (const o of m.ops) {
      const g = geomOf(o), polys = polysOf(g, 0.25, null);
      const b = polyBoxInto(polys, [0, 0, 0, 0]), w = o.world;
      const pad = o.kind === 'stroke' ? o.p.w : 0;
      for (let c = 0; c < 4; c++) {
        const x = c & 1 ? b[2] : b[0], y = c & 2 ? b[3] : b[1];
        const u = w[0] * x + w[2] * y + w[4], v = w[1] * x + w[3] * y + w[5];
        x0 = Math.min(x0, u - pad); y0 = Math.min(y0, v - pad); x1 = Math.max(x1, u + pad); y1 = Math.max(y1, v + pad);
      }
      items.push({ o, polys });
    }
    if (!(x1 > x0 && y1 > y0)) { x0 = y0 = 0; x1 = y1 = 1; }
    const k = Math.min(maskScale, MASK_PX / Math.max(x1 - x0, y1 - y0, 1e-6));
    const W = Math.max(1, Math.ceil((x1 - x0) * k)), H = Math.max(1, Math.ceil((y1 - y0) * k));
    m.rect[0] = x0; m.rect[1] = y0; m.rect[2] = W / k; m.rect[3] = H / k; m.res[0] = W; m.res[1] = H;
    if (!m.tex) { m.tex = gl.createTexture(); m.fbo = gl.createFramebuffer(); m.rb = gl.createRenderbuffer(); }
    gl.bindTexture(gl.TEXTURE_2D, m.tex);
    for (const [pn, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, pn, v);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, W, H, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, m.rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, m.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, m.tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, m.rb);
    // Its shapes at the texture's own scale, drawn once into it (mode 2: the luminance of what they paint).
    const own = { fills: [], strokes: [] };
    items.forEach((it, i) => {
      const tol = 0.2 / k / Math.max(it.o.scale, 1e-6);
      const polys = polysOf(geomOf(it.o), tol, it.o.p.dash || null);
      if (it.o.kind === 'fill') { const p = fillProduct(polys, !!it.o.p.eo); own.fills.push({ op: it.o.row, p }); it.o.box = p.box; } else own.strokes.push({ op: it.o.row, p: strokeProduct(polys, it.o.p.cap, D.polyMeshInto) });
    });
    // (the gradient boxes just set are in the rows: written again before the draw)
    for (const it of items) { liveInto(live, it.o.p); writeOpRow(it.o, true); }
    flushRows();
    const camera = [k, 0, 0, k, -x0 * k, -y0 * k];
    const sf = assemble(own.fills.map((f, i) => ({ i, op: f.op, p: f.p })), FILL_V, 7), ss = assemble(own.strokes.map((f, i) => ({ i, op: f.op, p: f.p })), STROKE_V, 10);
    drawInto(m.fbo, W, H, -1, camera, sf, ss, 2);
    m.sf = null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  /** Draws the fills and strokes of two assembled streams into `fbo` (cleared first) under `camera`, mode 1 (alpha) or 2 (luminance): masks and covers. Restores nothing but the framebuffer binding to null: callers run outside the pass. */
  function drawInto(fbo, W, H, flip, camera, sf, ss, mode) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.CULL_FACE);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    gl.clearBufferfi(gl.DEPTH_STENCIL, 0, 1, 0);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, opsTex);
    for (const [s, kind] of [[sf, 'fill'], [ss, 'stroke']]) {
      if (!s || !s.n) continue;
      const stream = uploadVao(s, kind, false), P = kind === 'fill' ? fillP(false) : strokeP(false);
      gl.useProgram(P.p);
      setCommon(P, camera, W, H, flip, mode);
      gl.bindVertexArray(stream.vao);
      if (kind === 'fill') gl.drawArrays(gl.TRIANGLES, 0, stream.n); else gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, stream.n);
      gl.bindVertexArray(null);
      gl.deleteBuffer(stream.buf); gl.deleteVertexArray(stream.vao);
    }
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  }
  const camM = new Float32Array(9), invM = new Float32Array(9);
  function setCommon(P, cam, W, H, flip, mode) {
    const u = P.u;
    gl.uniformMatrix3fv(u.uCam, false, mat3Into(camM, cam));
    gl.uniform1f(u.uExt, EXT_PX);
    gl.uniform2f(u.uSize, W, H);
    gl.uniform1f(u.uFlip, flip);
    gl.uniform1i(u.uOps, 0);
    gl.uniform1i(u.uMode, mode);
    gl.uniform1i(u.uMaskOn, 0);
    gl.uniform1i(u.uMask, 1);
    if (u.uT) gl.uniform1f(u.uT, morphT);
    if (mode === 0) setPlate(gl, u, lookNow);
  }

  // ── Covers: the organs' silhouettes the vessels read, one alpha texture over a world rectangle ──
  let covDirty = false, covTex = null, covFbo = null, covRb = null, covRect = [0, 0, 1, 1], covShapes = null, covK = 1, covKeys = '';
  /** The cover shapes (stage-vessels getOrganCovers: [{ d | circle, w }]) over `rect` at `k` texels a world unit. Rebuilt (once) when they or the rectangle change. */
  function setCovers(shapes, rect, k) {
    let key = `${rect.join(',')}|${k}`;
    for (const s of shapes) key += `|${s.circle ? s.circle.join(',') : s.d.length + ':' + strHash(s.d)}:${s.w || 0}`;
    if (key === covKeys) return false;
    covKeys = key; covShapes = shapes; covRect = rect; covK = k; covDirty = true; covVer++;
    return true;
  }
  function rebuildCovers() {
    covDirty = false;
    if (!covShapes) return;
    stats.coverRebuilds++;
    const W = Math.max(1, Math.min(COVER_SIDE, Math.round(covRect[2] * covK))), H = Math.max(1, Math.min(COVER_SIDE, Math.round(covRect[3] * covK)));
    if (!covTex) { covTex = gl.createTexture(); covFbo = gl.createFramebuffer(); covRb = gl.createRenderbuffer(); }
    gl.bindTexture(gl.TEXTURE_2D, covTex);
    for (const [pn, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, pn, v);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, covRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, covFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, covTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, covRb);
    // Each cover is an op row of its own (white, opaque, the identity frame), after the organs' and the masks'.
    const tol = Math.min(0.5, 0.2 / covK), fills = [], strokes = [];
    ensureRows(covRow0 + covShapes.length);
    covShapes.forEach((s, i) => {
      const polys = s.circle ? ellipsePolyOf(s.circle) : D.flattenPath(s.d, tol), r = covRow0 + i;
      row.fill(0); row[0] = 1; row[3] = 1; row[6] = 1; row[7] = 0; row[8] = row[9] = row[10] = row[11] = 1;
      if (s.w) row[T_W * 4] = s.w / 2;
      const o = r * OP_TEXELS * 4;
      for (let c = 0; c < row.length; c++) opsData[o + c] = row[c];
      if (r < dirtyLo) dirtyLo = r; if (r > dirtyHi) dirtyHi = r;
      if (s.w) strokes.push({ i, op: r, p: strokeProduct(polys, 1, D.polyMeshInto) }); else fills.push({ i, op: r, p: fillProduct(polys, false) });
    });
    flushRows();
    // (World → the texture's rows as the sampler reads them: the rectangle's top at row 0.)
    drawInto(covFbo, W, H, -1, [covK, 0, 0, covK, -covRect[0] * covK, -covRect[1] * covK], assemble(fills, FILL_V, 7), assemble(strokes, STROKE_V, 10), 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  const ellipsePolyOf = (c) => ellipsePoly(c[0], c[1], c[2], c[2], 0.01);
  const covers = () => ({ tex: covTex, rect: covRect, ver: covVer });

  // ── The draw ──
  let clipMarked = null;
  const clipM = new Float32Array(9), tmpW = [1, 0, 0, 1, 0, 0], tmpC = [1, 0, 0, 1, 0, 0];
  function markClip(rec, o, lvl, dyn, ref, cam, W, H, flip) {
    const first = (dyn ? lvl.dcFirst : lvl.cFirst)[rec.id], count = (dyn ? lvl.dcCount : lvl.cCount)[rec.id];
    const s = dyn ? lvl.dClip : lvl.sClip;
    if (!s || !count) return false;
    // The clip's frame: its own (clip units → the group's frame), under the entry's, under the camera.
    liveInto(live, o.p);
    const cm = rec === o.clipRec ? live.cm : live.cm2;
    mulTo(tmpC, o.entry.cur, cm); mulTo(tmpW, cam, tmpC);
    const P = clipP();
    gl.useProgram(P.p);
    gl.uniformMatrix3fv(P.u.uClip, false, mat3Into(clipM, tmpW));
    gl.uniform2f(P.u.uSize, W, H);
    gl.uniform1f(P.u.uFlip, flip);
    gl.stencilFunc(gl.ALWAYS, ref, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    gl.stencilMask(ref);
    gl.bindVertexArray(s.vao);
    gl.drawArrays(gl.TRIANGLES, first, count);
    stats.drawCalls++;
    return true;
  }
  /**
   * Draws the organs into the open pass: `pass` { w, h } (the picture's size, device px, rows down), `m` the camera (world → device px, [a b c d e f]).
   * `only`: one layer name or a list of them (the figure's front layer over the vessels is its own call). Depth and stencil are the pass's and
   * are cleared at the end; blending is the premultiplied over of the pass.
   */
  function draw(pass, m, only = null) {
    if (!ops.length || !opsTex) return;
    const sc = scaleOfMat(m), lvl = pick(sc);
    if (!lvl) return;
    if (pass.look) lookNow = pass.look;
    const W = pass.w, H = pass.h, flip = 1;
    const on = only == null ? null : Array.isArray(only) ? only : [only];
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, opsTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0xff); gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    clipMarked = null;
    for (const r of runs) {
      if (on && !on.includes(r.layer)) continue;
      const dyn = r.dynamic, o = ops[r.i0];
      const ofs = dyn ? lvl.dOfs : (r.kind === 'fill' ? lvl.fOfs : lvl.sOfs), cnt = dyn ? lvl.dCnt : (r.kind === 'fill' ? lvl.fCnt : lvl.sCnt);
      if (!ofs) continue;
      // The clip: marked in the stencil when the batch's differs from the one marked.
      const ckey = r.clip ? (r.clip2 ? `${r.clip.id}+${r.clip2.id}` : `${r.clip.id}`) : '';
      if (ckey !== clipMarked) {
        gl.disable(gl.DEPTH_TEST);
        gl.colorMask(false, false, false, false); gl.depthMask(false);
        gl.stencilMask(0xff); gl.clear(gl.STENCIL_BUFFER_BIT);
        let ref = 0;
        if (r.clip && markClip(r.clip, o, lvl, dyn, STENCIL_A, m, W, H, flip)) ref |= STENCIL_A;
        if (r.clip2 && markClip(r.clip2, o, lvl, dyn, STENCIL_B, m, W, H, flip)) ref |= STENCIL_B;
        gl.colorMask(true, true, true, true); gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
        clipMarked = ckey;
        r.ref = ref;
      }
      const ref = r.clip || r.clip2 ? (r.ref || 0) : 0;
      gl.stencilFunc(ref ? gl.EQUAL : gl.ALWAYS, ref, ref || 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP); gl.stencilMask(0);
      // (A deforming run is cut where one op eases by vertex and the next does not: their streams differ.)
      for (let a = r.i0; a <= r.i1;) {
        const mm = dyn && lvl.dMorph ? lvl.dMorph[a] : 0;
        let b = a;
        while (b < r.i1 && (dyn && lvl.dMorph ? lvl.dMorph[b + 1] : 0) === mm) b++;
        const stream = r.kind === 'fill' ? (dyn ? (mm ? lvl.dFillM : lvl.dFill) : lvl.sFill) : (dyn ? (mm ? lvl.dStrokeM : lvl.dStroke) : lvl.sStroke);
        const first = ofs[a], count = ofs[b] + cnt[b] - first;
        a = b + 1;
        if (!stream || count <= 0) continue;
        const P = r.kind === 'fill' ? fillP(!!mm) : strokeP(!!mm);
        gl.useProgram(P.p);
        setCommon(P, m, W, H, flip, 0);
        if (r.mask && r.mask.tex) {
          const mk = r.mask, ow = r.maskOwner;
          // The mask's frame in the world: its owner's (the entry's, with a nested group's own frame in it).
          if (ow && ow.root) copy6(r.frame, ow.entry.cur);
          else if (ow) { liveInto(gl_live, ow.p); mulTo(r.frame, ow.entry.cur, gl_live.m); }
          invTo(tmpW, r.frame);
          mat3Into(invM, tmpW);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, mk.tex); gl.activeTexture(gl.TEXTURE0);
          gl.uniform1i(P.u.uMaskOn, 1);
          gl.uniform4f(P.u.uMaskRect, mk.rect[0], mk.rect[1], mk.rect[2], mk.rect[3]);
          gl.uniformMatrix3fv(P.u.uMaskInv, false, invM);
        }
        gl.bindVertexArray(stream.vao);
        if (r.kind === 'fill') gl.drawArrays(gl.TRIANGLES, first, count); else gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
        stats.drawCalls++;
      }
    }
    gl.bindVertexArray(null);
    gl.stencilMask(0xff); gl.clear(gl.STENCIL_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.STENCIL_TEST); gl.disable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE0);
  }

  function dispose() {
    for (const lv of levels.values()) freeLevel(lv);
    levels.clear();
    for (const mk of masks.values()) { if (mk.tex) { gl.deleteTexture(mk.tex); gl.deleteFramebuffer(mk.fbo); gl.deleteRenderbuffer(mk.rb); } }
    if (covTex) { gl.deleteTexture(covTex); gl.deleteFramebuffer(covFbo); gl.deleteRenderbuffer(covRb); }
    if (opsTex) gl.deleteTexture(opsTex);
    if (corner) gl.deleteBuffer(corner);
    for (const p of Object.values(programs)) gl.deleteProgram(p.p);
    products.clear(); masks.clear(); ops = []; runs = []; bytes = 0;
  }
  const setCssPx = (v) => { cssPx = v; };
  /** The look the plate's grey-down reads (look.plate: alpha, sat); the pass may carry it as pass.look. */
  const setLook = (l) => { lookNow = l; };
  const setBudget = (b) => { budget = b; };
  const setMaskScale = (s) => { maskScale = s; };

  return {
    setOrgans, prepare, step, prepareAll, ready, update, draw, covers, setCovers, setMorph, morphAt, trim, dispose, setCssPx, setLook, setBudget, setMaskScale,
    pick, stats: () => stats, limits: () => [...limits].map(([k, n]) => ({ what: k, n })), levelsHeld: () => [...levels.keys()].sort((a, b) => a - b),
    get opCount() { return ops.length; },
  };
}
