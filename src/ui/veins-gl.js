// Veins on the GPU (WebGL2): the anatomy's venous network drawn from signed distances instead
// of SVG tubes, so vessels that meet merge into one smooth, filleted shape.
//
// Each vein is its sampled centerline as a chain of round-capped segments (capsules) whose
// radius follows the vein's drawn caliber (junction easing, stenosis waist). The world is cut
// into square cells, and each cell lists the segments (grouped by vein) and junctions that can
// reach it; one instanced quad per non-empty cell runs the fragment shader, which loops over
// only that cell's list: per vein the exact distance to its nearest segment, then a smooth
// minimum between veins that share a junction (a fillet), a plain minimum otherwise.
//
// The picture is composited in depth tiers, back to front, each tier as one shape: a soft
// contact shadow, the casing band just outside the lumen, the pressure-colored lumen and the
// shading of a lit cylinder (sheen on the lit side, a darker band on the other) taken from the
// across-tube coordinate. Veins in different tiers pass over or under each other with their
// own casings; where a vein ends on one in a lower tier, the lower vein is copied into the
// upper tier near the junction and fades out with distance, so the join is filleted too.
//
// Geometry (the entries) is uploaded when the layout changes; radii when a vein's width
// changes; colors, tiers and flags on every model frame (a few kilobytes).
//
// createVeinsGL(canvas) returns null when WebGL2 is unavailable; stage.js keeps the SVG tubes.

export const N_SAMPLES = 64;
export const TUBE_TEXELS = 5;          // texels of per-vein attributes (see TUBE_FS below)
export const MAX_TIERS = 16;
const CELL = 16;                       // cell size, world units
const ENT_W = 2048;                    // texels per row of the entry texture
const QUAD = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

const VS = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec2 org;        // cell origin (world)
layout(location=2) in vec4 range;      // first segment entry, count, first junction entry, count
uniform mat3 world;                    // world → device pixels
uniform vec2 size;
uniform float cell;
out vec2 vW;
flat out ivec4 vR;
void main() {
  vec2 w = org + corner * cell;
  vec3 d = world * vec3(w, 1.0);
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
  vW = w; vR = ivec4(range + 0.5);
}`;

// Tube attributes, TUBE_TEXELS texels per vein (row = vein index):
//   0: color at the start (rgb), casing width (world)
//   1: color at the end (rgb), alpha
//   2: tier, z (draw order within a tier), flags (1 selected, 2 shading, 4 shadow), -
//   3: fade ramp from (x, y) to (x, y), world space, as an SVG linear gradient mask
//   4: fade: offset, alpha at the start, alpha at the end, on
const FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 vW;
flat in ivec4 vR;
uniform highp sampler2D ent;
uniform highp sampler2D rad;
uniform highp sampler2D tube;
uniform float px;                      // world units per device pixel
uniform vec2 shOff;                    // contact shadow offset (world)
uniform vec4 casing;                   // rgb, alpha
uniform vec4 shadow;                   // rgb, alpha
uniform vec4 sheenInk;                 // rgb, alpha
uniform vec4 shadeInk;                 // rgb, alpha
uniform vec4 ring;                     // selection ring: rgb, alpha
uniform vec2 light;                    // unit direction toward the light (world)
uniform float netAlpha;                // the network group's opacity (dimmed while a vessel is focused)
uniform int fx;                        // 1: shading and shadows (off in the figure view)
uniform float tierAlpha[${MAX_TIERS}];
uniform int tierGroup[${MAX_TIERS}];   // 0 behind the organs, 1 the network, 2 lifted
out vec4 outColor;

#define MAXS 8
#define MAXJ 6
#define ENT_W ${ENT_W}
const float REACH = 11.0;
const float LAST = ${N_SAMPLES - 1}.0;

vec4 E(int e, int k) { int t = e * 2 + k; return texelFetch(ent, ivec2(t % ENT_W, t / ENT_W), 0); }
vec4 T(int id, int k) { return texelFetch(tube, ivec2(k, id), 0); }
float smin(float a, float b, float k) {
  if (k <= 0.0) return min(a, b);
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }

void main() {
  vec2 p = vW, ps = vW - shOff;
  float reach = REACH + 2.0 * px;

  // ── Nearest point of each vein in this cell ──
  int n = 0;
  int sid[MAXS];
  float sd[MAXS], sh[MAXS], sr[MAXS], su[MAXS];
  vec2 sg[MAXS];
  int cur = -1;
  float bd = 1e9, bs = 1e9, br = 0.0, bu = 0.0;
  vec2 bg = vec2(0.0);
  int cnt = min(vR.y, 1024);
  for (int k = 0; k <= cnt; k++) {
    int id = -2;
    vec4 A = vec4(0.0), B = vec4(0.0);
    if (k < cnt) { A = E(vR.x + k, 0); B = E(vR.x + k, 1); id = int(B.x + 0.5); }
    if (id != cur) {
      if (cur >= 0 && min(bd, bs) < reach) {
        int slot = n;
        if (n == MAXS) {
          slot = 0;
          for (int s = 1; s < MAXS; s++) if (sd[s] > sd[slot]) slot = s;
          if (bd >= sd[slot]) slot = -1;
        } else n++;
        if (slot >= 0) { sid[slot] = cur; sd[slot] = bd; sh[slot] = bs; sr[slot] = br; su[slot] = bu; sg[slot] = bg; }
      }
      cur = id; bd = 1e9; bs = 1e9;
    }
    if (k == cnt) break;
    vec2 a = A.xy, ba = A.zw - A.xy;
    float L2 = max(dot(ba, ba), 1e-8);
    vec2 rr = texelFetch(rad, ivec2(int(B.y + 0.5), id), 0).rg;
    float h = clamp(dot(p - a, ba) / L2, 0.0, 1.0);
    vec2 q = p - a - ba * h;
    float dist = length(q), r = mix(rr.x, rr.y, h);
    float d = dist - r;
    if (d < bd) { bd = d; bg = dist > 1e-5 ? q / dist : vec2(0.0); br = r; bu = (B.y + h) / LAST; }
    float hs = clamp(dot(ps - a, ba) / L2, 0.0, 1.0);
    bs = min(bs, length(ps - a - ba * hs) - mix(rr.x, rr.y, hs));
  }
  if (n == 0) discard;

  // ── Junctions: which of these veins are joined here, and how widely ──
  int jn = 0;
  int jm[MAXJ];
  float jk[MAXJ], jf[MAXJ];
  for (int k = 0; k < min(vR.w, 64); k++) {
    if (jn == MAXJ) break;
    vec4 A = E(vR.z + k, 0), B = E(vR.z + k, 1);
    float dc = length(p - A.xy);
    if (dc > A.z) continue;
    int mask = 0, c = 0;
    for (int m = 0; m < 4; m++) {
      int id = int(B[m] + 0.5);
      if (B[m] < -0.5) continue;
      for (int s = 0; s < MAXS; s++) if (s < n && sid[s] == id && (mask & (1 << s)) == 0) { mask |= 1 << s; c++; }
    }
    if (c < 2) continue;
    float f = 1.0 - smoothstep(0.55 * A.z, A.z, dc);
    jm[jn] = mask; jk[jn] = A.w * f; jf[jn] = f; jn++;
  }

  // ── Per-vein attributes ──
  float stier[MAXS], sz[MAXS], sflag[MAXS], sa[MAXS], swall[MAXS];
  vec3 scol[MAXS];
  for (int s = 0; s < MAXS; s++) {
    if (s >= n) break;
    vec4 t0 = T(sid[s], 0), t1 = T(sid[s], 1), t2 = T(sid[s], 2), t3 = T(sid[s], 3), t4 = T(sid[s], 4);
    stier[s] = t2.x; sz[s] = t2.y; sflag[s] = t2.z; swall[s] = t0.w;
    scol[s] = mix(t0.rgb, t1.rgb, clamp(su[s], 0.0, 1.0));
    float a = t1.w;
    if (t4.w > 0.5) {
      vec2 dd = t3.zw - t3.xy;
      float v = dot(p - t3.xy, dd) / max(dot(dd, dd), 1e-6);
      a *= mix(t4.y, t4.z, clamp((v - t4.x) / max(1.0 - t4.x, 1e-4), 0.0, 1.0));
    }
    sa[s] = a;
  }

  // ── Tiers, back to front ──
  vec4 accB = vec4(0.0), accN = vec4(0.0), accT = vec4(0.0);
  float last = -1.0;
  for (int it = 0; it < MAXS; it++) {
    float tt = 1e9;
    for (int s = 0; s < MAXS; s++) if (s < n && stier[s] > last && stier[s] < tt) tt = stier[s];
    if (tt > 1e8) break;
    last = tt;
    int ti = int(tt + 0.5);
    int grp = tierGroup[ti];
    // Members: this tier's veins, and (except in the lifted tier) veins of lower tiers that
    // share a junction with one of them, faded out with distance from that junction.
    float pres[MAXS];
    int mem = 0;
    for (int s = 0; s < MAXS; s++) { pres[s] = 0.0; if (s < n && stier[s] == tt) { mem |= 1 << s; pres[s] = 1.0; } }
    if (grp != 2) for (int j = 0; j < MAXJ; j++) {
      if (j >= jn || (jm[j] & mem) == 0 || jf[j] <= 0.0) continue;
      for (int s = 0; s < MAXS; s++) if (s < n && (jm[j] & (1 << s)) != 0 && stier[s] < tt && tierGroup[int(stier[s] + 0.5)] != 2) { mem |= 1 << s; pres[s] = max(pres[s], jf[j]); }
    }
    // The tier's shape: plain union, filleted between veins that share a junction.
    float D = 1e9, Ds = 1e9;
    for (int s = 0; s < MAXS; s++) if ((mem & (1 << s)) != 0) { D = min(D, sd[s]); Ds = min(Ds, sh[s]); }
    for (int j = 0; j < MAXJ; j++) {
      if (j >= jn || jk[j] <= 0.0) continue;
      int jj = jm[j] & mem;
      for (int a = 0; a < MAXS; a++) {
        if ((jj & (1 << a)) == 0) continue;
        for (int b = a + 1; b < MAXS; b++) {
          if ((jj & (1 << b)) == 0) continue;
          D = min(D, smin(sd[a], sd[b], jk[j]));
          Ds = min(Ds, smin(sh[a], sh[b], jk[j]));
        }
      }
    }
    // Which vein owns this pixel: the nearest, unless it lies inside the lumen of an unjoined
    // vein drawn above it in the tier (a crossing).
    int ow = -1;
    for (int s = 0; s < MAXS; s++) if ((mem & (1 << s)) != 0 && (ow < 0 || sd[s] < sd[ow])) ow = s;
    int conn = 0;
    float kc = 0.0;
    for (int j = 0; j < MAXJ; j++) if (j < jn && jk[j] > 0.0 && (jm[j] & (1 << ow)) != 0) { conn |= jm[j]; kc = max(kc, jk[j]); }
    for (int s = 0; s < MAXS; s++) {
      if ((mem & (1 << s)) == 0 || s == ow || sd[s] >= 0.0 || (conn & (1 << s)) != 0 || sz[s] <= sz[ow]) continue;
      ow = s; conn = 0; kc = 0.0;
      for (int j = 0; j < MAXJ; j++) if (j < jn && jk[j] > 0.0 && (jm[j] & (1 << ow)) != 0) { conn |= jm[j]; kc = max(kc, jk[j]); }
    }
    conn = (conn | (1 << ow)) & mem;
    // Attributes blended across the join by the same distances (soft weights), so color,
    // caliber and shading run on through the fillet.
    float m = 1e9;
    for (int s = 0; s < MAXS; s++) if ((conn & (1 << s)) != 0) m = min(m, sd[s]);
    float tau = 0.3 * kc + 1e-3, W = 0.0, R = 0.0, wall = 0.0, alpha = 0.0;
    vec3 col = vec3(0.0);
    vec2 g = vec2(0.0);
    for (int s = 0; s < MAXS; s++) {
      if ((conn & (1 << s)) == 0) continue;
      float w = s == ow && kc <= 0.0 ? 1.0 : exp(-(sd[s] - m) / tau);
      W += w; R += w * sr[s]; wall += w * swall[s]; alpha += w * sa[s] * pres[s]; col += w * scol[s]; g += w * sg[s];
    }
    R /= W; wall /= W; alpha /= W; col /= W;
    g = length(g) > 1e-5 ? normalize(g) : vec2(0.0);
    int flags = int(sflag[ow] + 0.5);
    bool sel = (flags & 1) != 0;

    float aa = px;
    float aL = clamp(0.5 - D / aa, 0.0, 1.0);
    float aC = clamp(0.5 - (D - wall) / aa, 0.0, 1.0);
    vec4 c = vec4(0.0);
    if (fx == 1 && (flags & 4) != 0) {
      float blur = sel ? 2.4 : 1.2;
      float as = shadow.a * (1.0 - smoothstep(-blur, blur + aa, Ds - wall));
      c = vec4(shadow.rgb * as, as);
    }
    if (sel) { float ar = ring.a * clamp(0.5 - (D - wall - 4.0) / aa, 0.0, 1.0); c = over(vec4(ring.rgb * ar, ar), c); }
    c = over(vec4(casing.rgb, 1.0) * (casing.a * aC), c);
    vec3 lum = col;
    if (fx == 1 && (flags & 2) != 0 && aL > 0.0) {
      // Across-tube coordinate: 0 on the centerline, 1 at the lumen's edge; the lit side is
      // where the outward direction faces the light. Sheen and shade are soft ribbons offset
      // toward and away from the light, as on the SVG tubes.
      float rho = clamp((R + D) / max(R, 1e-3), 0.0, 1.0), gl = dot(g, light);
      float soft = 0.08 + aa / max(R, 1e-3);
      float aSh = 1.0 - smoothstep(0.38 - soft, 0.38 + soft, abs(rho + 0.48 * gl));
      float aSn = 1.0 - smoothstep(0.24 - soft, 0.24 + soft, abs(rho - 0.4 * gl));
      lum = mix(lum, shadeInk.rgb, aSh * shadeInk.a);
      lum = mix(lum, sheenInk.rgb, aSn * sheenInk.a);
    }
    if (sel && grp == 2) lum = min(lum * 1.12, vec3(1.0));
    c = over(vec4(lum, 1.0) * aL, c);
    c *= alpha * tierAlpha[ti];
    if (grp == 0) accB = over(c, accB); else if (grp == 1) accN = over(c, accN); else accT = over(c, accT);
  }
  vec4 o = over(accT, over(accN * netAlpha, accB));
  if (o.a < 0.002) discard;
  outColor = o;
}`;

function compile(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    gl.attachShader(p, sh);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}

function dataTex(gl) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

// Distance from point (px, py) to segment a→b.
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
  const h = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
  return Math.hypot(ax + dx * h - px, ay + dy * h - py);
}

/**
 * Bins veins into cells. `tubes`: [{ id (row), pts: [[x, y]] × N_SAMPLES, reach }] where reach is
 * how far from the centerline the vein can draw (radius, casing, shadow, fillet); `joins`:
 * [{ x, y, reach, k, members: [row, …] (≤ 4) }]. Returns the entry texels and the cell instances.
 */
export function binVeins(tubes, joins) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of tubes) for (const [x, y] of t.pts) { x0 = Math.min(x0, x - t.reach); y0 = Math.min(y0, y - t.reach); x1 = Math.max(x1, x + t.reach); y1 = Math.max(y1, y + t.reach); }
  if (!tubes.length) return { ent: new Float32Array(0), cells: new Float32Array(0), nCells: 0, nEnt: 0 };
  x0 = Math.floor(x0 / CELL) * CELL; y0 = Math.floor(y0 / CELL) * CELL;
  const nx = Math.max(1, Math.ceil((x1 - x0) / CELL)), ny = Math.max(1, Math.ceil((y1 - y0) / CELL));
  const HALF = CELL * Math.SQRT1_2;
  // Pass 1: (cell, tube, sample) triples in vein-major order, so a cell's list stays grouped by vein.
  let cap = 1 << 16, nSeg = 0, cellOf = new Int32Array(cap), tubeOf = new Int32Array(cap), segOf = new Int32Array(cap);
  const push = (c, t, i) => {
    if (nSeg === cap) {
      cap *= 2;
      const grow = (a) => { const b = new Int32Array(cap); b.set(a); return b; };
      cellOf = grow(cellOf); tubeOf = grow(tubeOf); segOf = grow(segOf);
    }
    cellOf[nSeg] = c; tubeOf[nSeg] = t; segOf[nSeg] = i; nSeg++;
  };
  for (let ti = 0; ti < tubes.length; ti++) {
    const { pts, reach } = tubes[ti];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const cx0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - x0) / CELL)), cx1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx) + reach - x0) / CELL));
      const cy0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - y0) / CELL)), cy1 = Math.min(ny - 1, Math.floor((Math.max(ay, by) + reach - y0) / CELL));
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        if (segDist(x0 + (cx + 0.5) * CELL, y0 + (cy + 0.5) * CELL, ax, ay, bx, by) > reach + HALF) continue;
        push(cy * nx + cx, ti, i);
      }
    }
  }
  const jCell = [];
  joins.forEach((j, ji) => {
    const cx0 = Math.max(0, Math.floor((j.x - j.reach - x0) / CELL)), cx1 = Math.min(nx - 1, Math.floor((j.x + j.reach - x0) / CELL));
    const cy0 = Math.max(0, Math.floor((j.y - j.reach - y0) / CELL)), cy1 = Math.min(ny - 1, Math.floor((j.y + j.reach - y0) / CELL));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (Math.hypot(x0 + (cx + 0.5) * CELL - j.x, y0 + (cy + 0.5) * CELL - j.y) > j.reach + HALF) continue;
      jCell.push(cy * nx + cx, ji);
    }
  });
  // Pass 2: counting sort by cell (stable).
  const NC = nx * ny, segCount = new Int32Array(NC), jCount = new Int32Array(NC);
  for (let k = 0; k < nSeg; k++) segCount[cellOf[k]]++;
  for (let k = 0; k < jCell.length; k += 2) jCount[jCell[k]]++;
  const segStart = new Int32Array(NC), jStart = new Int32Array(NC);
  let o = 0, nCells = 0;
  for (let c = 0; c < NC; c++) { segStart[c] = o; o += segCount[c]; if (segCount[c]) nCells++; }
  const nSegEnt = o;
  for (let c = 0; c < NC; c++) { jStart[c] = o; o += segCount[c] ? jCount[c] : 0; }
  const nEnt = o;
  const rows = Math.max(1, Math.ceil((nEnt * 2) / ENT_W));
  const ent = new Float32Array(rows * ENT_W * 4);
  const fillS = segStart.slice(), fillJ = jStart.slice();
  for (let k = 0; k < nSeg; k++) {
    const e = fillS[cellOf[k]]++, t = tubes[tubeOf[k]], i = segOf[k], a = t.pts[i], b = t.pts[i + 1], q = e * 8;
    ent[q] = a[0]; ent[q + 1] = a[1]; ent[q + 2] = b[0]; ent[q + 3] = b[1];
    ent[q + 4] = t.id; ent[q + 5] = i;
  }
  for (let k = 0; k < jCell.length; k += 2) {
    const c = jCell[k];
    if (!segCount[c]) continue;
    const e = fillJ[c]++, j = joins[jCell[k + 1]], q = e * 8;
    ent[q] = j.x; ent[q + 1] = j.y; ent[q + 2] = j.reach; ent[q + 3] = j.k;
    for (let m = 0; m < 4; m++) ent[q + 4 + m] = j.members[m] ?? -1;
  }
  const cells = new Float32Array(nCells * 6);
  let ci = 0;
  for (let c = 0; c < NC; c++) {
    if (!segCount[c]) continue;
    cells[ci] = x0 + (c % nx) * CELL; cells[ci + 1] = y0 + Math.floor(c / nx) * CELL;
    cells[ci + 2] = segStart[c]; cells[ci + 3] = segCount[c]; cells[ci + 4] = jStart[c]; cells[ci + 5] = jCount[c];
    ci += 6;
  }
  return { ent, rows, cells, nCells, nEnt, nSegEnt };
}

export function createVeinsGL(canvas, { tubes: nTubes }) {
  let gl = null;
  try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false }); } catch { gl = null; }
  if (!gl) return null;
  let prog;
  try { prog = compile(gl, VS, FS); } catch (e) { console.warn('Veins renderer: WebGL2 shaders failed, keeping the SVG tubes.', e); return null; }
  const { p, u } = prog;

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
  const vao = gl.createVertexArray();
  const cellBuf = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, cellBuf);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 24, 8); gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);

  const entTex = dataTex(gl), radTex = dataTex(gl), tubeTex = dataTex(gl);
  gl.bindTexture(gl.TEXTURE_2D, radTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, N_SAMPLES, nTubes, 0, gl.RG, gl.FLOAT, null);
  gl.bindTexture(gl.TEXTURE_2D, tubeTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TUBE_TEXELS, nTubes, 0, gl.RGBA, gl.FLOAT, null);
  const radRow = new Float32Array(N_SAMPLES * 2);

  let nCells = 0, lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });

  return {
    get lost() { return lost; },
    /** Uploads the binned geometry (from binVeins). */
    setGeometry(bins) {
      gl.bindTexture(gl.TEXTURE_2D, entTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, ENT_W, bins.rows || 1, 0, gl.RGBA, gl.FLOAT, bins.ent.length ? bins.ent : new Float32Array(ENT_W * 4));
      gl.bindBuffer(gl.ARRAY_BUFFER, cellBuf);
      gl.bufferData(gl.ARRAY_BUFFER, bins.cells, gl.STATIC_DRAW);
      nCells = bins.nCells;
    },
    /** A vein's lumen radius at each of its N_SAMPLES samples. */
    setRadii(row, r) {
      for (let i = 0; i < N_SAMPLES; i++) { radRow[i * 2] = r[i]; radRow[i * 2 + 1] = r[Math.min(N_SAMPLES - 1, i + 1)]; }
      gl.bindTexture(gl.TEXTURE_2D, radTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, row, N_SAMPLES, 1, gl.RG, gl.FLOAT, radRow);
    },
    /** Every vein's attributes: nTubes × TUBE_TEXELS × 4 floats. */
    setTubes(data) {
      gl.bindTexture(gl.TEXTURE_2D, tubeTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TUBE_TEXELS, nTubes, gl.RGBA, gl.FLOAT, data);
    },
    /**
     * Clears and draws. `m`: world → device-pixel transform [a, b, c, d, e, f]; `look`: the
     * theme's inks and the per-tier opacity and group.
     */
    draw(m, look) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!nCells) return;
      gl.disable(gl.BLEND);
      gl.useProgram(p);
      gl.uniformMatrix3fv(u.world, false, new Float32Array([m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1]));
      gl.uniform2f(u.size, canvas.width, canvas.height);
      gl.uniform1f(u.cell, CELL);
      gl.uniform1f(u.px, 1 / Math.max(1e-6, Math.hypot(m[0], m[1])));
      gl.uniform2f(u.shOff, ...look.shOff);
      gl.uniform4f(u.casing, ...look.casing);
      gl.uniform4f(u.shadow, ...look.shadow);
      gl.uniform4f(u.sheenInk, ...look.sheen);
      gl.uniform4f(u.shadeInk, ...look.shade);
      gl.uniform4f(u.ring, ...look.ring);
      gl.uniform2f(u.light, ...look.light);
      gl.uniform1f(u.netAlpha, look.netAlpha);
      gl.uniform1i(u.fx, look.fx ? 1 : 0);
      gl.uniform1fv(u.tierAlpha, look.tierAlpha);
      gl.uniform1iv(u.tierGroup, look.tierGroup);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, entTex); gl.uniform1i(u.ent, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, radTex); gl.uniform1i(u.rad, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tubeTex); gl.uniform1i(u.tube, 2);
      gl.bindVertexArray(vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nCells);
      gl.bindVertexArray(null);
    },
    clear() { gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); nCells = 0; },
  };
}
