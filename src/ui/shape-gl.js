// Shapes on the GPU (WebGL2): an SVG path's fill and stroke drawn as coverage, the share of each device pixel the shape
// covers, into one channel of a coverage texture, for the organ stack (organs-gl.js) to paint with the organ's own colours.
//
// A path is flattened into polylines (curves cut until the chord is within a hundredth of a world unit of the curve).
// A stroke is a run of capsules, one per segment: each pixel's coverage comes from its distance to the nearest segment
// (a round join at every vertex, round or butt ends), and overlapping capsules take the larger, so a stroke's coverage is
// that of the whole line, never doubled at a joint. A fill marks its inside in the stencil (non-zero winding), covers it,
// then smooths its edge from the same distance: inside pixels near the edge keep 0.5 plus their distance in pixels, outside
// ones 0.5 less theirs, the share of a pixel a straight edge leaves, as the browser's own edges are drawn. A shape is sharp at
// any zoom: it is drawn again from its outline at the screen's resolution.

import { ucOf } from './uniform-cache.js';
import { EDGE_GLSL } from './edge.js';
import { prestart, linkProgram } from './gl-compile.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// The path text is read with a character scanner over module state, not a regular expression's match array: a path parsed on a cache
// miss (a shape the frame has not seen) makes only its result, none of the strings, token arrays, closures and spreads the first
// reading made (2 Nov 2026, scripts/frame-alloc.mjs). A number is its digits read as an integer and scaled by one power of ten, which is
// the correctly rounded value Number() gives for up to 15 digits and ten to the 22nd, as every path number is; any other form falls back to Number().
const POW10 = [1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15, 1e16, 1e17, 1e18, 1e19, 1e20, 1e21, 1e22];
let PS = '', PI = 0, PN = 0, SP = -1;   // (the text, the read position, its length, the position last scanned from)
let TK = 0, TC = 0, TV = 0, TE = 0;     // (the token scanned: 0 none, 1 a command letter (its code), 2 a number (its value); where it ends)
const isCmd = (c) => c === 77 || c === 109 || c === 76 || c === 108 || c === 72 || c === 104 || c === 86 || c === 118 || c === 67 || c === 99 || c === 83 || c === 115 ||
  c === 81 || c === 113 || c === 84 || c === 116 || c === 65 || c === 97 || c === 90 || c === 122;
/** Scans the next token from PI (without moving PI): a command letter, a number as the regular expression read it (sign, digits with an optional point or a leading point, an exponent), or none. */
function scan() {
  if (SP === PI) return;
  SP = PI;
  let p = PI;
  while (p < PN) {
    const c = PS.charCodeAt(p);
    if (isCmd(c)) { TK = 1; TC = c; TE = p + 1; PI = p; SP = p; return; }
    if (c === 45 || c === 43 || c === 46 || (c >= 48 && c <= 57)) {
      const s = p;
      let q = p, neg = false;
      if (c === 45 || c === 43) { neg = c === 45; q++; }
      let m = 0, nd = 0, fd = 0, ok = false, ch = q < PN ? PS.charCodeAt(q) : 0;
      if (ch >= 48 && ch <= 57) {
        ok = true;
        while (q < PN && (ch = PS.charCodeAt(q)) >= 48 && ch <= 57) { m = m * 10 + (ch - 48); nd++; q++; }
        if (q < PN && PS.charCodeAt(q) === 46) { q++; while (q < PN && (ch = PS.charCodeAt(q)) >= 48 && ch <= 57) { m = m * 10 + (ch - 48); nd++; fd++; q++; } }
      } else if (ch === 46 && q + 1 < PN && (ch = PS.charCodeAt(q + 1)) >= 48 && ch <= 57) {
        ok = true; q++;
        while (q < PN && (ch = PS.charCodeAt(q)) >= 48 && ch <= 57) { m = m * 10 + (ch - 48); nd++; fd++; q++; }
      }
      if (ok) {
        let ex = 0, wide = nd > 15;
        if (q < PN && (PS.charCodeAt(q) | 32) === 101) {
          let r = q + 1, en = false;
          if (r < PN && (PS.charCodeAt(r) === 45 || PS.charCodeAt(r) === 43)) { en = PS.charCodeAt(r) === 45; r++; }
          if (r < PN && (ch = PS.charCodeAt(r)) >= 48 && ch <= 57) {
            while (r < PN && (ch = PS.charCodeAt(r)) >= 48 && ch <= 57) { ex = ex * 10 + (ch - 48); r++; }
            if (en) ex = -ex;
            q = r;
          }
        }
        const k = ex - fd;
        let v;
        if (!wide && k >= -22 && k <= 22) v = k < 0 ? m / POW10[-k] : m * POW10[k];
        // alloc-rare: only a number of more than 15 digits or with an exponent past 22 is read by Number() (no path of the app has one)
        else v = Number(PS.substring(neg || c === 43 ? s + 1 : s, q));
        TK = 2; TV = neg ? -v : v; TE = q; PI = s; SP = s;
        return;
      }
    }
    p++;
  }
  TK = 0; TE = PN; PI = PN; SP = PN;
}
/** The next number, taken (NaN when the next token is not one, as the first reading's +letter was). */
function pnum() { scan(); if (TK !== 2) return NaN; PI = TE; return TV; }

/**
 * A path's commands as numbers in two typed arrays, written in place: `op` the commands (Z 0, M 1, L 2, C 3, Q 4, A 5) and `v` the numbers
 * they take, in order (M and L two, Q four, C six, A seven, Z none), `n` the commands and `nv` the numbers written. A buffer is made once
 * (newCmds) and written again for each shape of its slot (cmdsReset, then cmdM ...); it grows when a shape is longer than any before, never
 * shrinks, and nothing else is made per shape (the arrays of arrays this replaced made one per command).
 */
// alloc-rare: a buffer is made once for each slot that holds a shape's commands (the slot's owner keeps it)
export const newCmds = () => ({ op: new Uint8Array(32), v: new Float64Array(128), n: 0, nv: 0 });
const grown = (a, need) => { const g = new a.constructor(Math.max(need, a.length * 2)); g.set(a); return g; };
function room(c, nv) {
  if (c.n >= c.op.length) c.op = grown(c.op, c.n + 1);
  if (c.nv + nv > c.v.length) c.v = grown(c.v, c.nv + nv);
}
/** Empties a buffer for the next shape. Returns it. */
export const cmdsReset = (c) => { c.n = 0; c.nv = 0; return c; };
export function cmdZ(c) { room(c, 0); c.op[c.n++] = 0; return c; }
export function cmdM(c, x, y) { room(c, 2); c.op[c.n++] = 1; c.v[c.nv++] = x; c.v[c.nv++] = y; return c; }
export function cmdL(c, x, y) { room(c, 2); c.op[c.n++] = 2; c.v[c.nv++] = x; c.v[c.nv++] = y; return c; }
export function cmdC(c, x1, y1, x2, y2, x, y) { room(c, 6); c.op[c.n++] = 3; const v = c.v; let k = c.nv; v[k++] = x1; v[k++] = y1; v[k++] = x2; v[k++] = y2; v[k++] = x; v[k++] = y; c.nv = k; return c; }
export function cmdQ(c, x1, y1, x, y) { room(c, 4); c.op[c.n++] = 4; const v = c.v; let k = c.nv; v[k++] = x1; v[k++] = y1; v[k++] = x; v[k++] = y; c.nv = k; return c; }
export function cmdA(c, rx, ry, ph, la, sw, x, y) { room(c, 7); c.op[c.n++] = 5; const v = c.v; let k = c.nv; v[k++] = rx; v[k++] = ry; v[k++] = ph; v[k++] = la; v[k++] = sw; v[k++] = x; v[k++] = y; c.nv = k; return c; }
/** The commands as arrays, ['M', x, y] ... (tests and the console: made here, never in a frame). */
export function cmdsToArrays(c) {
  const out = [], names = 'ZMLCQA', len = [0, 2, 2, 6, 4, 7];
  for (let i = 0, k = 0; i < c.n; i++) { out.push([names[c.op[i]], ...c.v.subarray(k, k + len[c.op[i]])]); k += len[c.op[i]]; }
  return out;
}
/**
 * An SVG path's `d` as its commands (a buffer, above), every one absolute and in one of six forms: M x y, L x y, C x1 y1 x2 y2 x y, Q x1 y1
 * x y, A rx ry phi large sweep x y, Z (H and V as L, S and T as C and Q with their reflected control point). `into`: a buffer of the
 * caller's, written again (else one is made). A shape made by the app's own code (the liver's outline and nodules, stage.js) is handed to the
 * painter in this form as it is made, so its `d` is never parsed again there (organ-paint.js shapeSource).
 */
export function pathCmds(d, into = null) {
  // alloc-rare: String() runs only for a `d` that is not already text (the app hands text)
  PS = d ? (typeof d === 'string' ? d : String(d)) : ''; PI = 0; PN = PS.length; SP = -1;
  const out = into ? cmdsReset(into) : newCmds();
  let cx = 0, cy = 0, sx = 0, sy = 0, cmd = 0, hasC = false, lcx = 0, lcy = 0, hasQ = false, lqx = 0, lqy = 0;
  for (;;) {
    scan();
    if (TK === 0) break;
    if (TK === 1) { cmd = TC; PI = TE; } else if (!cmd) { PI = TE; continue; }
    const C = cmd & 0xDF, rel = cmd >= 97, ox = rel ? cx : 0, oy = rel ? cy : 0;
    let nc = false, nq = false;
    if (C === 90) { cmdZ(out); cx = sx; cy = sy; hasC = hasQ = false; cmd = 0; continue; }   // (numbers after a Z, never written: skipped)
    scan();
    if (TK !== 2) { cmd = 0; continue; }
    if (C === 77) { cx = ox + pnum(); cy = oy + pnum(); sx = cx; sy = cy; cmdM(out, cx, cy); cmd = rel ? 108 : 76; }
    else if (C === 76) { const x = ox + pnum(), y = oy + pnum(); cmdL(out, x, y); cx = x; cy = y; }
    else if (C === 72) { const x = ox + pnum(); cmdL(out, x, cy); cx = x; }
    else if (C === 86) { const y = (rel ? cy : 0) + pnum(); cmdL(out, cx, y); cy = y; }
    else if (C === 67) {
      const a0 = ox + pnum(), a1 = oy + pnum(), a2 = ox + pnum(), a3 = oy + pnum(), a4 = ox + pnum(), a5 = oy + pnum();
      cmdC(out, a0, a1, a2, a3, a4, a5); nc = true; lcx = a2; lcy = a3; cx = a4; cy = a5;
    } else if (C === 83) {
      const x1 = hasC ? 2 * cx - lcx : cx, y1 = hasC ? 2 * cy - lcy : cy, a0 = ox + pnum(), a1 = oy + pnum(), a2 = ox + pnum(), a3 = oy + pnum();
      cmdC(out, x1, y1, a0, a1, a2, a3); nc = true; lcx = a0; lcy = a1; cx = a2; cy = a3;
    } else if (C === 81) {
      const a0 = ox + pnum(), a1 = oy + pnum(), a2 = ox + pnum(), a3 = oy + pnum();
      cmdQ(out, a0, a1, a2, a3); nq = true; lqx = a0; lqy = a1; cx = a2; cy = a3;
    } else if (C === 84) {
      const x1 = hasQ ? 2 * cx - lqx : cx, y1 = hasQ ? 2 * cy - lqy : cy, x = ox + pnum(), y = oy + pnum();
      cmdQ(out, x1, y1, x, y); nq = true; lqx = x1; lqy = y1; cx = x; cy = y;
    } else if (C === 65) {
      const rx = pnum(), ry = pnum(), ph = pnum(), la = pnum(), sw = pnum(), x = ox + pnum(), y = oy + pnum();
      cmdA(out, rx, ry, ph, la ? 1 : 0, sw ? 1 : 0, x, y); cx = x; cy = y;
    } else { PI = TE; continue; }
    hasC = nc; hasQ = nq;
  }
  return out;
}

/**
 * An SVG path's `d` as polylines: [{ pts: Float32Array (x, y pairs), closed }]. Curves (cubic, quadratic, arcs) are cut
 * into chords no further than `tol` (path units) from the curve.
 */
let PATH_BUF = null;   // (the buffer flattenPath reads a path into: one for every call, the polylines made from it at once)
export const flattenPath = (d, tol = 0.01) => flattenCmds(pathCmds(d, PATH_BUF || (PATH_BUF = newCmds())), tol);
/** The same into a store of the caller's (newFlat): nothing is made once the store has held a shape as long. */
export const flattenPathInto = (d, tol, store) => flattenCmdsInto(pathCmds(d, PATH_BUF || (PATH_BUF = newCmds())), tol, store);   // alloc-rare: the shared buffer is made at the first call

// A path is cut with one scratch run of points (doubles, grown when a run is longer than any before) and module state, so the
// cutting makes only its result: each run's Float32Array and its record, none of the plain arrays, closures and slices it made before.
let FB = new Float64Array(4096), FN = 0, FHAS = false, FOUT = null, fcx = 0, fcy = 0, fsx = 0, fsy = 0, FTOL = 0.01;
function fpush(x, y) {
  // alloc-rare: the run of points grows only when a run is longer than any before
  if (FN + 2 > FB.length) { const g = new Float64Array(FB.length * 2); g.set(FB); FB = g; }
  FB[FN++] = x; FB[FN++] = y;
}
// (A run of at least two points is a result; a closed run whose last point repeats its first drops the repeat, the closing edge joins them.)
function fflush(closed) {
  if (FHAS && FN > 2) {
    let n = FN;
    if (closed && n >= 4 && Math.abs(FB[n - 2] - FB[0]) < 1e-9 && Math.abs(FB[n - 1] - FB[1]) < 1e-9) n -= 2;
    const i = FOUT.n++;
    let rec = FOUT.recs[i];
    // alloc-rare: a run's record is made the first time a store holds that many runs; its points are made again only when the run's length differs from the last time
    if (!rec) rec = FOUT.recs[i] = { pts: new Float32Array(n), closed };
    // alloc-rare: only when the run's length differs from the last time
    else if (rec.pts.length !== n) rec.pts = new Float32Array(n);
    const pts = rec.pts;
    for (let k = 0; k < n; k++) pts[k] = FB[k];
    rec.closed = closed;
    FOUT.list[i] = rec;
  }
}
function fstart(x, y) { fflush(false); FHAS = true; FN = 0; fpush(x, y); fsx = x; fsy = y; }
function fline(x, y) { if (!FHAS) { FHAS = true; FN = 0; fpush(fcx, fcy); } fpush(x, y); }
function fcubic(x1, y1, x2, y2, x, y) {
  const dd = Math.max(Math.hypot(fcx - 2 * x1 + x2, fcy - 2 * y1 + y2), Math.hypot(x1 - 2 * x2 + x, y1 - 2 * y2 + y));
  const n = clamp(Math.ceil(Math.sqrt((0.75 * dd) / FTOL)), 1, 512);
  for (let k = 1; k <= n; k++) {
    const u = k / n, v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, e = u * u * u;
    fline(a * fcx + b * x1 + c * x2 + e * x, a * fcy + b * y1 + c * y2 + e * y);
  }
}
function fquad(x1, y1, x, y) {
  const dd = Math.hypot(fcx - 2 * x1 + x, fcy - 2 * y1 + y);
  const n = clamp(Math.ceil(Math.sqrt((0.25 * dd) / FTOL)), 1, 512);
  for (let k = 1; k <= n; k++) {
    const u = k / n, v = 1 - u;
    fline(v * v * fcx + 2 * v * u * x1 + u * u * x, v * v * fcy + 2 * v * u * y1 + u * u * y);
  }
}
const fang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
function farc(rx, ry, phi, large, sweep, x, y) {
  // (SVG's endpoint arc as its centre form, then cut like a curve: chord error r(1 - cos(dθ/2)) within tol.)
  if (!rx || !ry) { fline(x, y); return; }
  rx = Math.abs(rx); ry = Math.abs(ry);
  const p = (phi * Math.PI) / 180, cp = Math.cos(p), sp = Math.sin(p);
  const dx = (fcx - x) / 2, dy = (fcy - y) / 2, x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
  const l = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (l > 1) { rx *= Math.sqrt(l); ry *= Math.sqrt(l); }
  const num2 = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num2 / (den || 1)));
  const ccx = k * ((rx * y1) / ry), ccy = k * (-(ry * x1) / rx);
  const mx = cp * ccx - sp * ccy + (fcx + x) / 2, my = sp * ccx + cp * ccy + (fcy + y) / 2;
  const t1 = fang(1, 0, (x1 - ccx) / rx, (y1 - ccy) / ry);
  let dt = fang((x1 - ccx) / rx, (y1 - ccy) / ry, (-x1 - ccx) / rx, (-y1 - ccy) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
  const r = Math.max(rx, ry), step = 2 * Math.acos(clamp(1 - FTOL / r, -1, 1)) || 0.1;
  const n = clamp(Math.ceil(Math.abs(dt) / step), 1, 512);
  for (let j = 1; j <= n; j++) {
    const a = t1 + (dt * j) / n, ex = rx * Math.cos(a), ey = ry * Math.sin(a);
    fline(j === n ? x : cp * ex - sp * ey + mx, j === n ? y : sp * ex + cp * ey + my);
  }
}

/** A store for the polylines of a shape cut again and again (flattenCmdsInto, flattenPathInto): its list and the runs' records are kept and written again. */
export const newFlat = () => ({ list: [], recs: [], n: 0 });   // alloc-rare: made once for each place that cuts a shape over and over
/** A path's commands (pathCmds, a buffer) as polylines, as flattenPath gives its `d`. */
export function flattenCmds(cmds, tol = 0.01) { return flattenCmdsInto(cmds, tol, newFlat()); }
/** The same, written into `store` (newFlat): the list returned is the store's own, good until the store is written again. */
export function flattenCmdsInto(cmds, tol, store) {
  const out = store;
  out.n = 0;
  FOUT = out; FTOL = tol; FN = 0; FHAS = false; fcx = fcy = fsx = fsy = 0;
  const op = cmds.op, v = cmds.v;
  for (let i = 0, k = 0; i < cmds.n; i++) {
    switch (op[i]) {
      case 0: fflush(true); FHAS = false; fcx = fsx; fcy = fsy; break;
      case 1: fcx = v[k]; fcy = v[k + 1]; fstart(fcx, fcy); k += 2; break;
      case 2: fline(v[k], v[k + 1]); fcx = v[k]; fcy = v[k + 1]; k += 2; break;
      case 3: fcubic(v[k], v[k + 1], v[k + 2], v[k + 3], v[k + 4], v[k + 5]); fcx = v[k + 4]; fcy = v[k + 5]; k += 6; break;
      case 4: fquad(v[k], v[k + 1], v[k + 2], v[k + 3]); fcx = v[k + 2]; fcy = v[k + 3]; k += 4; break;
      case 5: farc(v[k], v[k + 1], v[k + 2], v[k + 3], v[k + 4], v[k + 5], v[k + 6]); fcx = v[k + 5]; fcy = v[k + 6]; k += 7; break;
    }
  }
  fflush(false);
  FOUT = null;
  out.list.length = out.n;
  return out.list;
}

/**
 * An ellipse (cx, cy, rx, ry) as one closed polyline within `tol` of it. The last 32 distinct ellipses asked for are kept and given
 * again (the same object: callers only read it), so a shape asked for at every rebuild is made once, not once per rebuild.
 */
const ELL_N = 32;
const ELL_KEY = new Float64Array(ELL_N * 5), ELL_VAL = [];
let ellNext = 0;
export function ellipsePoly(cx, cy, rx, ry, tol = 0.01) {
  for (let i = 0; i < ELL_VAL.length; i++) {
    const o = i * 5;
    if (ELL_KEY[o] === cx && ELL_KEY[o + 1] === cy && ELL_KEY[o + 2] === rx && ELL_KEY[o + 3] === ry && ELL_KEY[o + 4] === tol) return ELL_VAL[i];
  }
  const r = Math.max(rx, ry), step = 2 * Math.acos(clamp(1 - tol / Math.max(r, tol), -1, 1)) || 0.1;
  const n = clamp(Math.ceil((2 * Math.PI) / step), 12, 2048), pts = new Float32Array(n * 2);   // alloc-rare: made once for each distinct ellipse, then kept in ELL_VAL
  for (let k = 0; k < n; k++) { const a = (2 * Math.PI * k) / n; pts[2 * k] = cx + rx * Math.cos(a); pts[2 * k + 1] = cy + ry * Math.sin(a); }
  const polys = [{ pts, closed: true }];   // alloc-rare: made once for each distinct ellipse, then kept in ELL_VAL
  const slot = ELL_VAL.length < ELL_N ? ELL_VAL.length : (ellNext++ % ELL_N), o = slot * 5;
  ELL_KEY[o] = cx; ELL_KEY[o + 1] = cy; ELL_KEY[o + 2] = rx; ELL_KEY[o + 3] = ry; ELL_KEY[o + 4] = tol;
  ELL_VAL[slot] = polys;
  return polys;
}

/** The bounding box [x0, y0, x1, y1] of polylines. */
export function polyBoxInto(polys, out) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < polys.length; i++) {
    const pts = polys[i].pts;
    for (let k = 0; k < pts.length; k += 2) {
      const x = pts[k], y = pts[k + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  out[0] = x0; out[1] = y0; out[2] = x1; out[3] = y1;
  return out;
}
/** The same into a new list, for a caller that keeps the box (one that reads it at once gives polyBoxInto a list of its own). */
export const polyBox = (polys) => polyBoxInto(polys, [0, 0, 0, 0]);

/**
 * The GPU's form of polylines: a fan of triangles per run (for the stencil's winding), and its segments, SEG floats each: its
 * two ends, their caps (0 butt, 1 round, 2 square: an open run's two ends take the line's cap, every joint is round), and the
 * directions of the segments before and after it (0, 0 at an open run's end). A round joint is the browser's: a wedge on the
 * outside of the turn, between the two segments' ends, not a whole disc, which reached past a butt end whose last segment is
 * shorter than the line's half width (every loop of the small bowel: its ends showed round, the loop under it covered).
 * Repeated points are skipped. `drop(ax, ay, bx, by)`: segments to leave out of the edge (a fill's edges that lie inside another
 * of its runs).
 */
export const SEG = 10;
let U = new Float64Array(512);   // the run being worked on, without its repeated points
/** The run's points without repeats, into U; the number of floats. (A run of one point keeps its first two points as they are.) */
function dedupInto(pts, closed) {
  if (pts.length > U.length) U = new Float64Array(pts.length * 2);   // alloc-rare: grows only when an outline longer than any before comes
  const n = pts.length / 2;
  let len = 0;
  for (let k = 0; k < n; k++) { const x = pts[2 * k], y = pts[2 * k + 1]; if (!len || x !== U[len - 2] || y !== U[len - 1]) { U[len++] = x; U[len++] = y; } }
  if (closed && len > 2 && U[0] === U[len - 2] && U[1] === U[len - 1]) len -= 2;
  if (len <= 2) { len = Math.min(4, pts.length); for (let i = 0; i < len; i++) U[i] = pts[i]; }
  return len;
}
/**
 * polyMesh into `out`, a mesh record ({ tri, seg, nTri, nSeg } and the drawer's own `gpu`) kept by the caller: its arrays are written
 * over and grown only when a bigger mesh than any before comes, so a mesh built again makes none. They may be longer than the
 * mesh (draw only nTri vertices and nSeg segments; the drawer uploads just those). A caller that reuses `out` gives the drawer's
 * release(out) between meshes.
 */
export function polyMeshInto(polys, cap, drop, out) {
  let nt = 0, ns = 0;
  for (let r = 0; r < polys.length; r++) {
    const { pts, closed } = polys[r];
    const n = pts.length / 2;
    if (n >= 3) nt += n - 2;
    // (Its points without repeats, for the segments: a segment of no length has no direction to join by.)
    const len = dedupInto(pts, closed);
    const m = closed && len > 4 ? len / 2 : len / 2 - 1;
    ns += Math.max(m, 0);
  }
  if (!out.tri || out.tri.length < nt * 6) out.tri = new Float32Array(nt * 6);
  if (!out.seg || out.seg.length < ns * SEG) out.seg = new Float32Array(ns * SEG);
  const tri = out.tri, seg = out.seg;
  let a = 0, b = 0;
  for (let r = 0; r < polys.length; r++) {
    const { pts, closed: cl } = polys[r];
    const n = pts.length / 2;
    for (let k = 1; k < n - 1; k++) { tri[a++] = pts[0]; tri[a++] = pts[1]; tri[a++] = pts[2 * k]; tri[a++] = pts[2 * k + 1]; tri[a++] = pts[2 * k + 2]; tri[a++] = pts[2 * k + 3]; }
    const ulen = dedupInto(pts, cl), nu = ulen / 2, closed = cl && ulen > 4, m = closed ? nu : nu - 1;
    for (let k = 0; k < m; k++) {
      const j = (k + 1) % nu, ax = U[2 * k], ay = U[2 * k + 1], bx = U[2 * j], by = U[2 * j + 1];
      if (drop && drop(ax, ay, bx, by)) continue;
      const first = !closed && k === 0, last = !closed && k === m - 1;
      // (The directions of the segments before and after, as numbers: no pair made for each segment of each outline.)
      const kp = (k - 1 + m) % m, kn = (k + 1) % m, jp = (kp + 1) % nu, jn = (kn + 1) % nu;
      const px = first ? 0 : U[2 * jp] - U[2 * kp], py = first ? 0 : U[2 * jp + 1] - U[2 * kp + 1];
      const qx = last ? 0 : U[2 * jn] - U[2 * kn], qy = last ? 0 : U[2 * jn + 1] - U[2 * kn + 1];
      seg[b++] = ax; seg[b++] = ay; seg[b++] = bx; seg[b++] = by;
      seg[b++] = first ? cap : 1; seg[b++] = last ? cap : 1;
      seg[b++] = px; seg[b++] = py; seg[b++] = qx; seg[b++] = qy;
    }
  }
  out.nTri = nt * 3; out.nSeg = b / SEG;
  return out;
}
/** A mesh of its own, for a caller that keeps it (a kept shape's, and the tests'). */
export function polyMesh(polys, cap = 0, drop = null) {
  return polyMeshInto(polys, cap, drop, { tri: null, seg: null, nTri: 0, nSeg: 0 });
}

/** Whether (x, y) is inside a closed polyline (even-odd, which is non-zero for a simple outline). */
export function insidePoly(pts, x, y) {
  let c = false;
  for (let i = 0, n = pts.length / 2, j = n - 1; i < n; j = i++) {
    const xi = pts[2 * i], yi = pts[2 * i + 1], xj = pts[2 * j], yj = pts[2 * j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * For a fill made of runs that may overlap (the nutmeg's islands): the edge segments that lie inside another run, which
 * are no edge of the union and must not be smoothed (their inner side would thin a pixel inside the shape).
 */
export function innerEdges(polys) {
  const boxes = polys.map((p) => polyBox([p]));   // alloc-rare: made once for each fill with overlapping runs, when its mesh is built
  return (ax, ay, bx, by) => {
    const x = (ax + bx) / 2, y = (ay + by) / 2;
    for (let i = 0; i < polys.length; i++) {
      const [x0, y0, x1, y1] = boxes[i];
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const p = polys[i].pts;
      // (Its own run: the segment's midpoint lies on it, never strictly inside.)
      if (insidePoly(p, x, y) && !onPoly(p, x, y)) return true;
    }
    return false;
  };
}
function onPoly(pts, x, y) {
  for (let i = 0, n = pts.length / 2, j = n - 1; i < n; j = i++) {
    const ax = pts[2 * j], ay = pts[2 * j + 1], bx = pts[2 * i], by = pts[2 * i + 1];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, u = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
    if (Math.hypot(ax + u * dx - x, ay + u * dy - y) < 1e-4) return true;
  }
  return false;
}

// ── GL ──
const POS_VS = `#version 300 es
layout(location=0) in vec2 pos;
uniform mat3 world;   // the shape's own units → device pixels (y down)
uniform vec2 size;
void main() {
  vec2 d = (world * vec3(pos, 1.0)).xy;
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
}`;
const POS_FS = `#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(1.0); }`;
// One instanced quad per segment, reaching `ext` device pixels past it all round; the fragment's coverage from its distance.
const SEG_VS = `#version 300 es
layout(location=0) in vec2 corner;   // (0 or 1 along, -1 or 1 across)
layout(location=1) in vec4 seg;      // a, b (the shape's own units)
layout(location=2) in vec2 caps;     // a's and b's: 0 butt, 1 round, 2 square
layout(location=3) in vec4 nbr;      // the directions of the segments before a and after b (0, 0: none)
uniform mat3 world;
uniform vec2 size;
uniform float ext;
out vec2 vP;
flat out vec4 vSeg;
flat out vec2 vCaps;
flat out vec4 vNbr;
void main() {
  vec2 a = (world * vec3(seg.xy, 1.0)).xy, b = (world * vec3(seg.zw, 1.0)).xy;
  vec2 d = b - a;
  float L = length(d);
  vec2 t = L > 1e-6 ? d / L : vec2(1.0, 0.0), n = vec2(-t.y, t.x);
  vec2 p = mix(a - t * ext, b + t * ext, corner.x) + n * ext * corner.y;
  mat2 lin = mat2(world);
  vec2 pa = lin * nbr.xy, nb = lin * nbr.zw;
  vNbr = vec4(length(pa) > 1e-9 ? normalize(pa) : vec2(0.0), length(nb) > 1e-9 ? normalize(nb) : vec2(0.0));
  vP = p; vSeg = vec4(a, b); vCaps = caps;
  gl_Position = vec4(p.x / size.x * 2.0 - 1.0, 1.0 - p.y / size.y * 2.0, 0.0, 1.0);
}`;
// A pixel's share of a straight edge's inside: the area of the unit square about the pixel's centre on the inside of a line
// at signed distance d from that centre (d > 0: the centre is inside), with unit normal n. Exact for a straight edge at any
// angle: half at d = 0, a linear ramp while the line crosses two opposite sides, a quadratic one near a corner.
const COVER_GLSL = `
float cover(float d0, vec2 n) {
  float d = d0 / ${EDGE_GLSL};   // (the figure's one edge softness, device px: edge.js, shared with the vessels)
  vec2 q = abs(n);
  float a = max(q.x, q.y), b = min(q.x, q.y), s1 = 0.5 * (a - b), s2 = 0.5 * (a + b);
  if (d >= s2) return 1.0;
  if (d <= -s2) return 0.0;
  if (abs(d) <= s1) return 0.5 + d / a;
  float e = s2 - abs(d), v = e * e / (2.0 * a * b);
  return d > 0.0 ? 1.0 - v : v;
}
// A band of half width w about a line through the point at distance t, with normal n: its share of the pixel.
float band(float w, float t, vec2 n) { return clamp(cover(w - t, n) + cover(w + t, n) - 1.0, 0.0, 1.0); }`;
const SEG_FS = `#version 300 es
precision highp float;
in vec2 vP;
flat in vec4 vSeg;
flat in vec2 vCaps;
flat in vec4 vNbr;
uniform float hw;     // a stroke's half width (device pixels)
uniform int mode;     // 0 stroke, 1 a fill's edge inside, 2 outside
out vec4 o;
${COVER_GLSL}
void main() {
  vec2 a = vSeg.xy, ba = vSeg.zw - vSeg.xy, pa = vP - a;
  float L2 = dot(ba, ba), L = sqrt(L2);
  float h = L2 > 1e-12 ? dot(pa, ba) / L2 : 0.0;
  vec2 foot = ba * clamp(h, 0.0, 1.0), r = pa - foot;
  float d = length(r);
  vec2 t = L > 1e-6 ? ba / L : vec2(1.0, 0.0), nrm = vec2(-t.y, t.x);
  // Beside the segment the edge runs along it; past an end (a round joint or cap) it runs round the end, across the line to it.
  vec2 n = (h >= 0.0 && h <= 1.0) || d < 1e-6 ? nrm : r / d;
  float c;
  if (mode == 0) {
    // Past a butt or square end, the line stops there: its share across, times its share before the end.
    float past = h < 0.0 ? -h * L : h > 1.0 ? (h - 1.0) * L : 0.0, cap = h < 0.0 ? vCaps.x : h > 1.0 ? vCaps.y : 1.0;
    if (past > 0.0 && cap != 1.0) {
      float across = L > 1e-6 ? abs(pa.x * ba.y - pa.y * ba.x) / L : d;
      c = band(hw, across, nrm) * cover((cap == 2.0 ? hw : 0.0) - past, t);
    } else c = band(hw, d, n);
    // Past a joint, only the wedge outside the turn: what lies on the far side of the neighbour's own end is the neighbour's
    // (its band, or its joint's wedge), so the joint never reaches past it.
    if (past > 0.0 && cap == 1.0) {
      vec2 nb = h < 0.0 ? vNbr.xy : vNbr.zw;
      if (dot(nb, nb) > 0.5 && (h < 0.0 ? dot(vP - vSeg.xy, nb) < 0.0 : dot(vP - vSeg.zw, nb) > 0.0)) c = 0.0;
    }
  } else if (mode == 1) c = cover(d, n);
  else c = cover(-d, n);
  o = vec4(c);
}`;

// (Linked through gl-compile.js: the programs the figure's renderer started at its setup (prestartShapes), else compiled here.)
function compile(gl, vs, fs) {
  const p = linkProgram(gl, vs, fs);
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);   // alloc-rare: a program's uniform table is made once, when the program is linked
  for (let k = 0; k < n; k++) { const name = gl.getActiveUniform(p, k).name; u[name] = gl.getUniformLocation(p, name); }
  return { p, u };   // alloc-rare: a program's uniform table is made once, when the program is linked
}

/** Starts the drawer's two programs on gl, nothing read (gl-compile.js prestart): createShapeGL takes them up. */
export function prestartShapes(gl) { prestart(gl, POS_VS, POS_FS); prestart(gl, SEG_VS, SEG_FS); }

/**
 * The coverage drawer on a WebGL2 context. The caller binds a framebuffer with a stencil attachment (cleared to 0 where it
 * draws) and sets the viewport; each call draws into the channels `ch` selects ([r, g, b, a] booleans) and leaves blending,
 * the stencil and the colour mask as it found them off.
 */
export function createShapeGL(gl) {
  const posP = compile(gl, POS_VS, POS_FS), segP = compile(gl, SEG_VS, SEG_FS);
  const corner = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, corner);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);   // alloc-rare: the drawer's quad is uploaded once per context
  // Each mesh's arrays are uploaded once, into buffers of its own, and stay on the GPU for as long as the mesh is kept (release):
  // a shape drawn again, in the next frame or the next picture, sends nothing (they were sent again at every draw of another
  // shape). Its vertex arrays carry its buffers, so a draw only binds them.
  const own = new Set();   // alloc-rare: made once with the drawer
  function gpuOf(mesh) {
    let g = mesh.gpu;
    if (g) return g;
    g = mesh.gpu = { tri: null, seg: null, triVAO: null, segVAO: null };
    if (mesh.nTri) {
      g.tri = gl.createBuffer(); g.triVAO = gl.createVertexArray();
      gl.bindVertexArray(g.triVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.tri); gl.bufferData(gl.ARRAY_BUFFER, mesh.tri, gl.STATIC_DRAW, 0, mesh.nTri * 2);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    }
    if (mesh.nSeg) {
      g.seg = gl.createBuffer(); g.segVAO = gl.createVertexArray();
      gl.bindVertexArray(g.segVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, corner);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.seg); gl.bufferData(gl.ARRAY_BUFFER, mesh.seg, gl.STATIC_DRAW, 0, mesh.nSeg * SEG);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 4 * SEG, 0); gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 4 * SEG, 16); gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 4 * SEG, 24); gl.vertexAttribDivisor(3, 1);
    }
    gl.bindVertexArray(null);
    own.add(mesh);
    return g;
  }
  const useTri = (mesh) => gl.bindVertexArray(gpuOf(mesh).triVAO);   // alloc-rare: made once with the drawer
  const useSeg = (mesh) => gl.bindVertexArray(gpuOf(mesh).segVAO);   // alloc-rare: made once with the drawer
  function release(mesh) {
    const g = mesh?.gpu;
    if (!g) return;
    if (g.tri) gl.deleteBuffer(g.tri);
    if (g.seg) gl.deleteBuffer(g.seg);
    if (g.triVAO) gl.deleteVertexArray(g.triVAO);
    if (g.segVAO) gl.deleteVertexArray(g.segVAO);
    mesh.gpu = null; own.delete(mesh);
  }
  const mat = new Float32Array(9);   // alloc-rare: made once with the drawer
  const setWorld = (U, m) => { mat[0] = m[0]; mat[1] = m[1]; mat[2] = 0; mat[3] = m[2]; mat[4] = m[3]; mat[5] = 0; mat[6] = m[4]; mat[7] = m[5]; mat[8] = 1; ucOf(gl).m3(U.world, mat); };   // alloc-rare: made once with the drawer
  const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));   // alloc-rare: made once with the drawer
  function segs(mesh, m, size, ch, mode, hw, ext) {
    if (!mesh.nSeg) return;
    gl.useProgram(segP.p);
    setWorld(segP.u, m);
    ucOf(gl).f2(segP.u.size, size[0], size[1]);
    ucOf(gl).f1(segP.u.hw, hw);
    ucOf(gl).f1(segP.u.ext, ext);
    ucOf(gl).i1(segP.u.mode, mode);
    gl.colorMask(ch[0], ch[1], ch[2], ch[3]);
    useSeg(mesh);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, mesh.nSeg);
  }
  return {   // alloc-rare: made once with the drawer
    /** A stroke `w` wide (in the shape's own units, scaled by m), into channels ch. */
    stroke(mesh, m, size, ch, w) {
      const hw = (w / 2) * scaleOf(m);
      if (!(hw > 0)) return;
      gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
      segs(mesh, m, size, ch, 0, hw, Math.max(hw, 0.5) + 1.5);
      gl.blendEquation(gl.FUNC_ADD); gl.disable(gl.BLEND); gl.colorMask(true, true, true, true); gl.bindVertexArray(null);
    },
    /** A fill (non-zero winding, or even-odd with `evenodd`) into channels ch, its edge smoothed unless `hard` (under a stroke that covers it). */
    fill(mesh, m, size, ch, hard = false, evenodd = false) {
      if (!mesh.nTri) return;
      gl.useProgram(posP.p);
      setWorld(posP.u, m);
      ucOf(gl).f2(posP.u.size, size[0], size[1]);
      useTri(mesh);
      gl.enable(gl.STENCIL_TEST);
      gl.colorMask(false, false, false, false);
      gl.stencilFunc(gl.ALWAYS, 0, 0xff);
      // (Even-odd: each triangle over a pixel flips its count, and only the count's lowest bit is tested, its parity.)
      const sm = evenodd ? 0x01 : 0xff;
      if (evenodd) gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
      else {
        gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
        gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
      }
      gl.drawArrays(gl.TRIANGLES, 0, mesh.nTri);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      gl.stencilFunc(gl.NOTEQUAL, 0, sm);
      gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
      gl.colorMask(ch[0], ch[1], ch[2], ch[3]);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.nTri);
      if (!hard) {
        gl.blendEquation(gl.MIN);
        segs(mesh, m, size, ch, 1, 0, 1.5);
        gl.stencilFunc(gl.EQUAL, 0, sm);
        gl.blendEquation(gl.MAX);
        segs(mesh, m, size, ch, 2, 0, 1.5);
      }
      // (The stencil back to 0 under the shape: its own triangles again, zeroing what they touch.)
      gl.colorMask(false, false, false, false);
      gl.disable(gl.BLEND);
      gl.useProgram(posP.p);
      useTri(mesh);
      gl.stencilFunc(gl.ALWAYS, 0, 0xff);
      gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.nTri);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      gl.disable(gl.STENCIL_TEST);
      gl.blendEquation(gl.FUNC_ADD);
      gl.colorMask(true, true, true, true);
      gl.bindVertexArray(null);
    },
    /** Gives back a mesh's arrays on the GPU (it is no longer kept: drawn again, it is sent again). */
    release,
    /** How many meshes hold arrays on the GPU now. */
    count: () => own.size,   // alloc-rare: made once with the drawer
    /** (Kept for callers that forgot every mesh at once: each is now given back on its own, by release.) */
    forget() {},
    dispose() {
      for (const m of own) release(m);   // (the set is walked as it shrinks: a deleted member is not visited again)
      gl.deleteBuffer(corner);
      gl.deleteProgram(posP.p); gl.deleteProgram(segP.p);
    },
  };
}

/**
 * A path measured in script, as the browser's getTotalLength and getPointAtLength measure it, with no element and no layout (2 Nov 2026:
 * those reads, in a frame of the liver's or the diaphragm's ease, laid the page out). { L, at(u) → [x, y] }: the length of every
 * subpath's pieces (a move adds none, a close adds its edge), and the point u along them, from curves flattened to within `tol`.
 */
export function measurePath(d, tol = 0.002) {
  const runs = flattenCmds(pathCmds(d), tol);
  const xs = [], ys = [], cum = [];   // alloc-rare: a path is measured once when it first appears (its callers keep the result by its d)
  let L = 0;
  for (const { pts, closed } of runs) {
    const n = pts.length / 2;
    if (!n) continue;
    const first = xs.length;
    for (let k = 0; k <= (closed ? n : n - 1); k++) {
      const j = (k % n) * 2, x = pts[j], y = pts[j + 1];
      if (xs.length > first) L += Math.hypot(x - xs[xs.length - 1], y - ys[ys.length - 1]);
      xs.push(x); ys.push(y); cum.push(L);
    }
  }
  const at = (u) => {   // alloc-rare: a path is measured once when it first appears
    if (!xs.length) return [0, 0];   // alloc-rare: each point is kept by the caller as data; a path is sampled once when its outline first appears or changes (outlineCache, LIVER_GEO)
    const t = Math.max(0, Math.min(L, u));
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < t) lo = m + 1; else hi = m; }
    if (lo === 0) return [xs[0], ys[0]];   // alloc-rare: each point is kept by the caller as data; a path is sampled once when its outline first appears or changes (outlineCache, LIVER_GEO)
    const a = cum[lo - 1], b = cum[lo], f = b > a ? (t - a) / (b - a) : 0;
    return [xs[lo - 1] + (xs[lo] - xs[lo - 1]) * f, ys[lo - 1] + (ys[lo] - ys[lo - 1]) * f];   // alloc-rare: each point is kept by the caller as data; a path is sampled once when its outline first appears or changes (outlineCache, LIVER_GEO)
  };
  return { L, at };   // alloc-rare: a path is measured once when it first appears
}

/**
 * An SVG element's box in its own user space, the way getBBox() gives it (fill geometry, no stroke), worked out from its
 * attributes in script, so nothing asks the browser to lay the page out (2 Nov 2026). A group is the union of its children,
 * each through its own transform; hidden ones (display none, by attribute or inline style, or `hidden`) are left out, as the
 * browser leaves them out. Text is measured by `textOf(el)` (its box, or null), when given. Returns null for an element with nothing
 * to measure (an empty group). Paths are cached by d.
 */
const BOX_D = new Map(), BOX_D_MAX = 4096;
// Each path's own last box, by its element: a path whose `d` has not changed is never looked up or parsed again, while one that
// eases (the liver's outline as it settles after a load) parses only itself. (Start-up profile, 2 Nov 2026: with the shared table
// cleared whole once it held 512 shapes, the home framing's boxes (defaultVT) parsed every organ path again, 25 to 50 ms a look,
// twice a second through the first 15 s.)
const BOX_EL = new WeakMap();
/**
 * The frame from an element's own units to `top`'s (the element's transform attribute, then each parent's up to and not including
 * `top`), as getCTM() of the element undone by top's gives it, worked out from the attributes in script ({a..f}; plan "Holding
 * 120 Hz" §3.5: the organs leave the page's layout, so nothing may ask the browser for their frames). CSS transforms are not
 * taken: the organs carry none.
 */
export function chainMat(el, top) {
  let a = 1, b = 0, c = 0, d = 1, e = 0, f = 0;
  for (let n = el; n && n !== top && n.transform; n = n.parentNode) {
    const l = n.transform.baseVal;
    if (!l?.numberOfItems) continue;
    const m = l.consolidate()?.matrix;
    if (!m) continue;
    // (m · current: the parent's transform outside the child's)
    const A = m.a * a + m.c * b, B = m.b * a + m.d * b, C = m.a * c + m.c * d, D = m.b * c + m.d * d;
    const E = m.a * e + m.c * f + m.e, F = m.b * e + m.d * f + m.f;
    a = A; b = B; c = C; d = D; e = E; f = F;
  }
  return { a, b, c, d, e, f };
}
/** An element's box as { x, y, width, height } written into `out` (a record of the caller's, read at once), or null for none. */
export function elBoxInto(el, out, textOf = null) {
  const b = elBox4(el, textOf);
  if (!b) return null;
  out.x = b[0]; out.y = b[1]; out.width = b[2] - b[0]; out.height = b[3] - b[1];
  return out;
}
/** The same in a new record, for a caller that keeps the box. */
export function elBox(el, textOf = null) {
  return elBoxInto(el, { x: 0, y: 0, width: 0, height: 0 }, textOf);
}
function hiddenEl(el) {
  return el.hasAttribute?.('hidden') || el.getAttribute?.('display') === 'none' || el.style?.display === 'none';
}
function num(el, k) { const v = parseFloat(el.getAttribute(k)); return Number.isFinite(v) ? v : 0; }
// (elBox4's answer for a shape with no cache of its own is written here and read at once by its caller, whether elBox or the group
// above it: a nested call returns before the next is made, so one array serves them all.)
const BOX4 = [0, 0, 0, 0];
const box4 = (a, b, c, d) => { BOX4[0] = a; BOX4[1] = b; BOX4[2] = c; BOX4[3] = d; return BOX4; };
/** elBox as four numbers [x0, y0, x1, y1] (or null): the array may be the one the next call writes, so read it at once. */
export function elBox4(el, textOf) {
  if (!el || hiddenEl(el)) return null;
  switch (el.localName) {
    case 'text': { const t = textOf?.(el); return t ? box4(t.x, t.y, t.x + t.width, t.y + t.height) : null; }
    case 'path': {
      const d = el.getAttribute('d');
      if (!d) return null;
      const kept = BOX_EL.get(el);
      if (kept && kept.d === d) return kept.b;
      let b = BOX_D.get(d);
      if (b === undefined) {
        const polys = flattenCmds(pathCmds(d), 0.002);
        b = polys.some((p) => p.pts.length) ? polyBoxInto(polys, [0, 0, 0, 0]) : null;   // alloc-rare: a path's box is worked out once for each new d (BOX_EL and BOX_D keep it)
        if (BOX_D.size >= BOX_D_MAX) BOX_D.delete(BOX_D.keys().next().value);   // (the oldest out, never the whole table)
        BOX_D.set(d, b);
      }
      if (kept) { kept.d = d; kept.b = b; } else BOX_EL.set(el, { d, b });   // alloc-rare: a path's box is worked out once for each new d
      return b;
    }
    case 'rect': { const x = num(el, 'x'), y = num(el, 'y'); return box4(x, y, x + num(el, 'width'), y + num(el, 'height')); }
    case 'circle': { const cx = num(el, 'cx'), cy = num(el, 'cy'), r = num(el, 'r'); return box4(cx - r, cy - r, cx + r, cy + r); }
    case 'ellipse': { const cx = num(el, 'cx'), cy = num(el, 'cy'), rx = num(el, 'rx'), ry = num(el, 'ry'); return box4(cx - rx, cy - ry, cx + rx, cy + ry); }
    case 'line': { const a = num(el, 'x1'), b = num(el, 'y1'), c = num(el, 'x2'), d = num(el, 'y2'); return box4(Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)); }
    case 'polygon': case 'polyline': {
      // (The points read by the path scanner, numbers only, as pairs: no split, map or filter arrays.)
      PS = el.getAttribute('points') || ''; PI = 0; PN = PS.length; SP = -1;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0, px = 0;
      for (;;) {
        scan();
        if (TK === 0) break;
        PI = TE;
        if (TK !== 2 || !Number.isFinite(TV)) continue;
        if (n++ & 1) { if (px < x0) x0 = px; if (px > x1) x1 = px; if (TV < y0) y0 = TV; if (TV > y1) y1 = TV; } else px = TV;
      }
      return n >= 2 && x1 >= x0 ? box4(x0, y0, x1, y1) : null;
    }
    case 'g': case 'a': case 'svg': {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const kids = el.children;
      for (let i = 0; i < kids.length; i++) {
        const c = kids[i], b = elBox4(c, textOf);
        if (!b) continue;
        const m = c.transform?.baseVal?.numberOfItems ? c.transform.baseVal.consolidate()?.matrix : null;
        // (The box's corners, each through the child's transform when it has one, folded in as they come: no list of corners made.)
        const nc = m ? 4 : 2;
        for (let k = 0; k < nc; k++) {
          let x = m ? (k & 1 ? b[2] : b[0]) : (k ? b[2] : b[0]), y = m ? (k & 2 ? b[3] : b[1]) : (k ? b[3] : b[1]);
          if (m) { const tx = m.a * x + m.c * y + m.e; y = m.b * x + m.d * y + m.f; x = tx; }
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      return x1 >= x0 ? box4(x0, y0, x1, y1) : null;
    }
    default: return null;
  }
}
