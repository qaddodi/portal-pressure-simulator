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

import { EDGE_GLSL } from './edge.js?v=8321a8017f';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const NUM = /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

/**
 * An SVG path's `d` as its commands, every one absolute and in one of six forms: ['M', x, y], ['L', x, y], ['C', x1, y1, x2, y2,
 * x, y], ['Q', x1, y1, x, y], ['A', rx, ry, phi, large, sweep, x, y], ['Z'] (H and V as L, S and T as C and Q with their
 * reflected control point). A shape made by the app's own code (the liver's outline and nodules, stage.js) is handed to the
 * painter in this form as it is made, so its `d` is never parsed again there (organ-paint.js shapeSource).
 */
export function pathCmds(d) {
  const t = String(d || '').match(NUM) || [];
  const out = [];
  let cx = 0, cy = 0, sx = 0, sy = 0, cmd = '', i = 0, lc = null, lq = null;
  const num = () => +t[i++];
  while (i < t.length) {
    if (/[A-Za-z]/.test(t[i])) cmd = t[i++];
    else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? cx : 0, oy = rel ? cy : 0;
    let nc = null, nq = null;
    if (C === 'Z') { out.push(['Z']); cx = sx; cy = sy; lc = lq = null; cmd = ''; continue; }   // (numbers after a Z, never written: skipped)
    if (i >= t.length || /[A-Za-z]/.test(t[i])) { cmd = ''; continue; }
    if (C === 'M') { cx = ox + num(); cy = oy + num(); sx = cx; sy = cy; out.push(['M', cx, cy]); cmd = rel ? 'l' : 'L'; }
    else if (C === 'L') { const x = ox + num(), y = oy + num(); out.push(['L', x, y]); cx = x; cy = y; }
    else if (C === 'H') { const x = ox + num(); out.push(['L', x, cy]); cx = x; }
    else if (C === 'V') { const y = (rel ? cy : 0) + num(); out.push(['L', cx, y]); cy = y; }
    else if (C === 'C') { const a = [ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num()]; out.push(['C', ...a]); nc = [a[2], a[3]]; cx = a[4]; cy = a[5]; }
    else if (C === 'S') {
      const x1 = lc ? 2 * cx - lc[0] : cx, y1 = lc ? 2 * cy - lc[1] : cy, a = [ox + num(), oy + num(), ox + num(), oy + num()];
      out.push(['C', x1, y1, ...a]); nc = [a[0], a[1]]; cx = a[2]; cy = a[3];
    } else if (C === 'Q') { const a = [ox + num(), oy + num(), ox + num(), oy + num()]; out.push(['Q', ...a]); nq = [a[0], a[1]]; cx = a[2]; cy = a[3]; }
    else if (C === 'T') {
      const x1 = lq ? 2 * cx - lq[0] : cx, y1 = lq ? 2 * cy - lq[1] : cy, x = ox + num(), y = oy + num();
      out.push(['Q', x1, y1, x, y]); nq = [x1, y1]; cx = x; cy = y;
    } else if (C === 'A') {
      const rx = num(), ry = num(), ph = num(), la = num(), sw = num(), x = ox + num(), y = oy + num();
      out.push(['A', rx, ry, ph, la ? 1 : 0, sw ? 1 : 0, x, y]); cx = x; cy = y;
    } else { i++; continue; }
    lc = nc; lq = nq;
  }
  return out;
}

/**
 * An SVG path's `d` as polylines: [{ pts: Float32Array (x, y pairs), closed }]. Curves (cubic, quadratic, arcs) are cut
 * into chords no further than `tol` (path units) from the curve.
 */
export const flattenPath = (d, tol = 0.01) => flattenCmds(pathCmds(d), tol);

/** A path's commands (pathCmds) as polylines, as flattenPath gives its `d`. */
export function flattenCmds(cmds, tol = 0.01) {
  const out = [];
  let cur = null, cx = 0, cy = 0, sx = 0, sy = 0;
  const start = (x, y) => { if (cur && cur.length > 2) out.push({ pts: cur, closed: false }); cur = [x, y]; sx = x; sy = y; };
  const line = (x, y) => { if (!cur) cur = [cx, cy]; cur.push(x, y); };
  const cubic = (x1, y1, x2, y2, x, y) => {
    const dd = Math.max(Math.hypot(cx - 2 * x1 + x2, cy - 2 * y1 + y2), Math.hypot(x1 - 2 * x2 + x, y1 - 2 * y2 + y));
    const n = clamp(Math.ceil(Math.sqrt((0.75 * dd) / tol)), 1, 512);
    for (let k = 1; k <= n; k++) {
      const u = k / n, v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, e = u * u * u;
      line(a * cx + b * x1 + c * x2 + e * x, a * cy + b * y1 + c * y2 + e * y);
    }
  };
  const quad = (x1, y1, x, y) => {
    const dd = Math.hypot(cx - 2 * x1 + x, cy - 2 * y1 + y);
    const n = clamp(Math.ceil(Math.sqrt((0.25 * dd) / tol)), 1, 512);
    for (let k = 1; k <= n; k++) {
      const u = k / n, v = 1 - u;
      line(v * v * cx + 2 * v * u * x1 + u * u * x, v * v * cy + 2 * v * u * y1 + u * u * y);
    }
  };
  const arc = (rx, ry, phi, large, sweep, x, y) => {
    // (SVG's endpoint arc as its centre form, then cut like a curve: chord error r(1 - cos(dθ/2)) within tol.)
    if (!rx || !ry) { line(x, y); return; }
    rx = Math.abs(rx); ry = Math.abs(ry);
    const p = (phi * Math.PI) / 180, cp = Math.cos(p), sp = Math.sin(p);
    const dx = (cx - x) / 2, dy = (cy - y) / 2, x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
    const l = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (l > 1) { rx *= Math.sqrt(l); ry *= Math.sqrt(l); }
    const num2 = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num2 / (den || 1)));
    const ccx = k * ((rx * y1) / ry), ccy = k * (-(ry * x1) / rx);
    const mx = cp * ccx - sp * ccy + (cx + x) / 2, my = sp * ccx + cp * ccy + (cy + y) / 2;
    const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
    const t1 = ang(1, 0, (x1 - ccx) / rx, (y1 - ccy) / ry);
    let dt = ang((x1 - ccx) / rx, (y1 - ccy) / ry, (-x1 - ccx) / rx, (-y1 - ccy) / ry);
    if (!sweep && dt > 0) dt -= 2 * Math.PI; else if (sweep && dt < 0) dt += 2 * Math.PI;
    const r = Math.max(rx, ry), step = 2 * Math.acos(clamp(1 - tol / r, -1, 1)) || 0.1;
    const n = clamp(Math.ceil(Math.abs(dt) / step), 1, 512);
    for (let j = 1; j <= n; j++) {
      const a = t1 + (dt * j) / n, ex = rx * Math.cos(a), ey = ry * Math.sin(a);
      line(j === n ? x : cp * ex - sp * ey + mx, j === n ? y : sp * ex + cp * ey + my);
    }
  };
  for (const c of cmds) {
    switch (c[0]) {
      case 'Z': if (cur && cur.length > 2) out.push({ pts: cur, closed: true }); cur = null; cx = sx; cy = sy; break;
      case 'M': cx = c[1]; cy = c[2]; start(cx, cy); break;
      case 'L': line(c[1], c[2]); cx = c[1]; cy = c[2]; break;
      case 'C': cubic(c[1], c[2], c[3], c[4], c[5], c[6]); cx = c[5]; cy = c[6]; break;
      case 'Q': quad(c[1], c[2], c[3], c[4]); cx = c[3]; cy = c[4]; break;
      case 'A': arc(c[1], c[2], c[3], c[4], c[5], c[6], c[7]); cx = c[6]; cy = c[7]; break;
    }
  }
  if (cur && cur.length > 2) out.push({ pts: cur, closed: false });
  // (A closed run whose last point repeats its first: the repeat is dropped, the closing edge joins them.)
  return out.map(({ pts, closed }) => {
    let n = pts.length;
    if (closed && n >= 4 && Math.abs(pts[n - 2] - pts[0]) < 1e-9 && Math.abs(pts[n - 1] - pts[1]) < 1e-9) n -= 2;
    return { pts: Float32Array.from(pts.slice(0, n)), closed };
  });
}

/** An ellipse (cx, cy, rx, ry) as one closed polyline within `tol` of it. */
export function ellipsePoly(cx, cy, rx, ry, tol = 0.01) {
  const r = Math.max(rx, ry), step = 2 * Math.acos(clamp(1 - tol / Math.max(r, tol), -1, 1)) || 0.1;
  const n = clamp(Math.ceil((2 * Math.PI) / step), 12, 2048), pts = new Float32Array(n * 2);
  for (let k = 0; k < n; k++) { const a = (2 * Math.PI * k) / n; pts[2 * k] = cx + rx * Math.cos(a); pts[2 * k + 1] = cy + ry * Math.sin(a); }
  return [{ pts, closed: true }];
}

/** The bounding box [x0, y0, x1, y1] of polylines. */
export function polyBox(polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const { pts } of polys) for (let k = 0; k < pts.length; k += 2) {
    const x = pts[k], y = pts[k + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

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
export function polyMesh(polys, cap = 0, drop = null) {
  let nt = 0, ns = 0;
  const runs = polys.map(({ pts, closed }) => {
    const n = pts.length / 2;
    if (n >= 3) nt += n - 2;
    // (Its points without repeats, for the segments: a segment of no length has no direction to join by.)
    const q = [];
    for (let k = 0; k < n; k++) { const x = pts[2 * k], y = pts[2 * k + 1]; if (!q.length || x !== q[q.length - 2] || y !== q[q.length - 1]) q.push(x, y); }
    if (closed && q.length > 2 && q[0] === q[q.length - 2] && q[1] === q[q.length - 1]) q.length -= 2;
    const u = q.length > 2 ? q : Array.from(pts.slice(0, 4));
    const m = closed && u.length > 4 ? u.length / 2 : u.length / 2 - 1;
    ns += Math.max(m, 0);
    return { u, m, closed: closed && u.length > 4 };
  });
  const tri = new Float32Array(nt * 6), seg = new Float32Array(ns * SEG);
  let a = 0, b = 0;
  polys.forEach(({ pts }, r) => {
    const n = pts.length / 2;
    for (let k = 1; k < n - 1; k++) { tri[a++] = pts[0]; tri[a++] = pts[1]; tri[a++] = pts[2 * k]; tri[a++] = pts[2 * k + 1]; tri[a++] = pts[2 * k + 2]; tri[a++] = pts[2 * k + 3]; }
    const { u, m, closed } = runs[r], nu = u.length / 2;
    const dir = (k) => { k = (k + m) % m; const j = (k + 1) % nu; return [u[2 * j] - u[2 * k], u[2 * j + 1] - u[2 * k + 1]]; };
    for (let k = 0; k < m; k++) {
      const j = (k + 1) % nu, ax = u[2 * k], ay = u[2 * k + 1], bx = u[2 * j], by = u[2 * j + 1];
      if (drop && drop(ax, ay, bx, by)) continue;
      const first = !closed && k === 0, last = !closed && k === m - 1;
      const [px, py] = first ? [0, 0] : dir(k - 1), [qx, qy] = last ? [0, 0] : dir(k + 1);
      seg[b++] = ax; seg[b++] = ay; seg[b++] = bx; seg[b++] = by;
      seg[b++] = first ? cap : 1; seg[b++] = last ? cap : 1;
      seg[b++] = px; seg[b++] = py; seg[b++] = qx; seg[b++] = qy;
    }
  });
  return { tri, nTri: nt * 3, seg: b === seg.length ? seg : seg.slice(0, b), nSeg: b / SEG };
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
  const boxes = polys.map((p) => polyBox([p]));
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

function compile(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    gl.attachShader(p, sh); gl.deleteShader(sh);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let k = 0; k < n; k++) { const name = gl.getActiveUniform(p, k).name; u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}

/**
 * The coverage drawer on a WebGL2 context. The caller binds a framebuffer with a stencil attachment (cleared to 0 where it
 * draws) and sets the viewport; each call draws into the channels `ch` selects ([r, g, b, a] booleans) and leaves blending,
 * the stencil and the colour mask as it found them off.
 */
export function createShapeGL(gl) {
  const posP = compile(gl, POS_VS, POS_FS), segP = compile(gl, SEG_VS, SEG_FS);
  const corner = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, corner);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
  // Each mesh's arrays are uploaded once, into buffers of its own, and stay on the GPU for as long as the mesh is kept (release):
  // a shape drawn again, in the next frame or the next picture, sends nothing (they were sent again at every draw of another
  // shape). Its vertex arrays carry its buffers, so a draw only binds them.
  const own = new Set();
  function gpuOf(mesh) {
    let g = mesh.gpu;
    if (g) return g;
    g = mesh.gpu = { tri: null, seg: null, triVAO: null, segVAO: null };
    if (mesh.nTri) {
      g.tri = gl.createBuffer(); g.triVAO = gl.createVertexArray();
      gl.bindVertexArray(g.triVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.tri); gl.bufferData(gl.ARRAY_BUFFER, mesh.tri, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    }
    if (mesh.nSeg) {
      g.seg = gl.createBuffer(); g.segVAO = gl.createVertexArray();
      gl.bindVertexArray(g.segVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, corner);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, g.seg); gl.bufferData(gl.ARRAY_BUFFER, mesh.seg, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 4 * SEG, 0); gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 4 * SEG, 16); gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 4 * SEG, 24); gl.vertexAttribDivisor(3, 1);
    }
    gl.bindVertexArray(null);
    own.add(mesh);
    return g;
  }
  const useTri = (mesh) => gl.bindVertexArray(gpuOf(mesh).triVAO);
  const useSeg = (mesh) => gl.bindVertexArray(gpuOf(mesh).segVAO);
  function release(mesh) {
    const g = mesh?.gpu;
    if (!g) return;
    for (const b of [g.tri, g.seg]) if (b) gl.deleteBuffer(b);
    for (const v of [g.triVAO, g.segVAO]) if (v) gl.deleteVertexArray(v);
    mesh.gpu = null; own.delete(mesh);
  }
  const mat = new Float32Array(9);
  const setWorld = (U, m) => { mat.set([m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1]); gl.uniformMatrix3fv(U.world, false, mat); };
  const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  function segs(mesh, m, size, ch, mode, hw, ext) {
    if (!mesh.nSeg) return;
    gl.useProgram(segP.p);
    setWorld(segP.u, m);
    gl.uniform2f(segP.u.size, size[0], size[1]);
    gl.uniform1f(segP.u.hw, hw);
    gl.uniform1f(segP.u.ext, ext);
    gl.uniform1i(segP.u.mode, mode);
    gl.colorMask(...ch);
    useSeg(mesh);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, mesh.nSeg);
  }
  return {
    /** A stroke `w` wide (in the shape's own units, scaled by m), into channels ch. */
    stroke(mesh, m, size, ch, w) {
      const hw = (w / 2) * scaleOf(m);
      if (!(hw > 0)) return;
      gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
      segs(mesh, m, size, ch, 0, hw, Math.max(hw, 0.5) + 1.5);
      gl.blendEquation(gl.FUNC_ADD); gl.disable(gl.BLEND); gl.colorMask(true, true, true, true); gl.bindVertexArray(null);
    },
    /** A fill (non-zero winding) into channels ch, its edge smoothed unless `hard` (under a stroke that covers it). */
    fill(mesh, m, size, ch, hard = false) {
      if (!mesh.nTri) return;
      gl.useProgram(posP.p);
      setWorld(posP.u, m);
      gl.uniform2f(posP.u.size, size[0], size[1]);
      useTri(mesh);
      gl.enable(gl.STENCIL_TEST);
      gl.colorMask(false, false, false, false);
      gl.stencilFunc(gl.ALWAYS, 0, 0xff);
      gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
      gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.nTri);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      gl.stencilFunc(gl.NOTEQUAL, 0, 0xff);
      gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
      gl.colorMask(...ch);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.nTri);
      if (!hard) {
        gl.blendEquation(gl.MIN);
        segs(mesh, m, size, ch, 1, 0, 1.5);
        gl.stencilFunc(gl.EQUAL, 0, 0xff);
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
    count: () => own.size,
    /** (Kept for callers that forgot every mesh at once: each is now given back on its own, by release.) */
    forget() {},
    dispose() {
      for (const m of [...own]) release(m);
      gl.deleteBuffer(corner);
      gl.deleteProgram(posP.p); gl.deleteProgram(segP.p);
    },
  };
}
