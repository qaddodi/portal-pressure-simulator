// The lobule's tissue drawn live by the GPU (performance review A5b, 31 Oct): the same picture lobule-paint.js paintLobule lays into
// the bitmap, worked out per pixel by tissue-gl.js from the lobule's shapes, so it is sharp at every zoom and its colours ease every
// frame. This file holds what has no page in it: the shapes packed for the shader (the hepatocytes in a grid of bins, so a pixel
// reads only the few cells near it), when the shader can draw the lobule's state, and its share against the bitmap.
//
// Built in pushes. This one: the lobule's fill, the hepatocytes (membrane, nucleus, dead cells of congestion, the plates'
// disorder), the nutmeg, the zones, and the limiting plate's hairline. A state with anything else in it (the collagen of fibrosis, the
// stellate cells, septa, tracts, the central vein's cuff) is drawn from the bitmap, as before, until the shader draws that too.

export const BIN = 16;          // a bin's side, world units
export const CELLS_PER_ROW = 512;   // the cell texture: three texels a cell, so 1536 wide
export const IDX_ROW = 1024;

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Whether the shader draws everything this tissue state shows (paintLobule): none of the collagen, the stellate cells, the septa. */
export const liveEligible = (m) => !(m.septU > 0) && !(m.fibSin > 0.05) && !(m.act > 0.08) && !(m.fibPre > 0.03) && !(m.fibPost > 0.05);

/** How much of the picture is the shader's, by how large a cell is on screen (device px per world unit s, the lobule's radius R):
 *  below about 3.5 px a cell the bitmap's mipmaps average the detail where a shader would shimmer, so the bitmap shows; whole
 *  from 6 px. (The lobule's cells are 0.052 R long.) */
export const liveZoomShare = (s, R) => smooth(3.5, 6, s * R * 0.052);

/** A colour token's value as [r, g, b, a], r g b in 0–1 ('#rgb', '#rrggbb', 'rgb()' or 'rgba()'). */
export function parseRGBA(c) {
  c = (c || '').trim();
  if (c[0] === '#') {
    const x = c.length < 6 ? [...c.slice(1, 4)].map((d) => d + d).join('') : c.slice(1, 7);
    return [0, 2, 4].map((k) => parseInt(x.slice(k, k + 2), 16) / 255).concat(1);
  }
  const n = c.match(/[\d.]+/g) || [];
  return [(+n[0] || 0) / 255, (+n[1] || 0) / 255, (+n[2] || 0) / 255, n.length > 3 ? +n[3] : 1];
}

/** The colours the shader needs, from the painting's own colours (worldInput's rgb: bg, gap, cell) and the tokens it reads (tok: a
 *  token's name → its value). The same arithmetic paintLobule does with them. */
export function liveColours(rgb, dark, tok) {
  const { bg, gap, cell } = rgb;
  const t3 = (n) => parseRGBA(tok(n)).slice(0, 3);
  return {
    gap, gap55: gap.map((x, i) => lerp(bg[i], x, 0.55)),
    base: dark ? cell.map((x, i) => lerp(gap[i], x, 0.28)) : cell,
    plate: parseRGBA(tok('--lz-plate-line')), ink: parseRGBA(tok('--lz-nodule-ink')), zl: parseRGBA(tok('--lz-zone-line')),
    nut: t3('--lz-nutmeg'), z1: t3('--lz-zone-1'), z2: t3('--lz-zone-2'), z3: t3('--lz-zone-3'),
  };
}

/** The lobule's shapes packed for the shader (shape: lobule-zoom.js worldShape). Done once per shape.
 *  cells: three RGBA32F texels a cell, CELLS_PER_ROW cells to a row: (x, y, angle, length) (width, tone, nucleus, q) (drop, jx, jy, ja).
 *  bins: RG32F, one texel per bin of the box (1.3 R each way about the centre): where its cells start in idx, and how many. A bin lists
 *  every cell that can reach it in any state (the cells grow and wander with the plates' disorder), in the order they are drawn.
 *  idx: R32F, IDX_ROW wide. edges: the lobule's six sides, each (outward normal x, y, distance from the centre). */
export function buildLive(shape) {
  const { R, cx, cy, lobules, cells } = shape, l = lobules[0], B = 1.3 * R, bx = cx - B, by = cy - B, side = 2 * B;
  const nb = Math.ceil(side / BIN);
  const edges = new Float32Array(18);
  for (let i = 0; i < 6; i++) {
    const [x0, y0] = l.corners[i], [x1, y1] = l.corners[(i + 1) % 6], ex = x1 - x0, ey = y1 - y0, L = Math.hypot(ex, ey) || 1;
    let nx = ey / L, ny = -ex / L;
    if (nx * (x0 - l.x) + ny * (y0 - l.y) < 0) { nx = -nx; ny = -ny; }
    edges.set([nx, ny, nx * (x0 - l.x) + ny * (y0 - l.y)], i * 3);
  }
  const rows = Math.max(1, Math.ceil(cells.length / CELLS_PER_ROW)), cellData = new Float32Array(CELLS_PER_ROW * 3 * rows * 4);
  const lists = Array.from({ length: nb * nb }, () => []);
  cells.forEach((k, i) => {
    const o = ((Math.floor(i / CELLS_PER_ROW) * CELLS_PER_ROW * 3) + (i % CELLS_PER_ROW) * 3) * 4;
    cellData.set([k.x, k.y, k.a, k.l, k.w, k.tone, k.nu, k.q, k.drop, k.jx, k.jy, k.ja], o);
    const reach = cellReach(k);
    const i0 = Math.max(0, Math.floor((k.x - reach - bx) / BIN)), i1 = Math.min(nb - 1, Math.floor((k.x + reach - bx) / BIN));
    const j0 = Math.max(0, Math.floor((k.y - reach - by) / BIN)), j1 = Math.min(nb - 1, Math.floor((k.y + reach - by) / BIN));
    for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) lists[j * nb + ii].push(i);
  });
  const total = lists.reduce((s, a) => s + a.length, 0), irows = Math.max(1, Math.ceil(total / IDX_ROW));
  const bins = new Float32Array(nb * nb * 2), idx = new Float32Array(IDX_ROW * irows);
  let at = 0;
  lists.forEach((a, b) => { bins[b * 2] = at; bins[b * 2 + 1] = a.length; for (const c of a) idx[at++] = c; });
  return { nb, box: [bx, by, side], edges, ctr: [l.x, l.y], cellData, cellRows: rows, bins, idx, idxRows: irows };
}

/** How far from its centre a cell can reach in any state, world units: the corners of its largest box (the plates thicken with
 *  disorder: length ×1.12, width ×1.3), the farthest it wanders, the membrane's half width (at most about 1.2 in the sizes the
 *  shader is used at) and the antialiasing's edge. */
export const cellReach = (k) => 0.5 * Math.hypot(k.l * 1.12, k.w * 1.3) + Math.min(k.l, k.w) * 0.45 * Math.hypot(k.jx, k.jy) + 3;

// The shader's part of tissue-gl.js: liveTissue(w) is the lobule's bitmap as premultiplied RGBA at the box coordinate w (0–1 across
// the bitmap's box), in the order paintLobule lays it: the fill, the hexagon's gap colour, then (clipped to the hexagon) the cells,
// the nutmeg and the zones, then the hairline. Antialiased by distance: a shape covers a pixel by how far its edge lies from the
// pixel's centre in pixels (lvCov), a line thinner than a pixel by its width (lvLine).
export const LIVE_FS = `
precision highp int;
uniform highp sampler2D uLC, uLB, uLI;   // the cells, the bins, the bins' cell lists
uniform vec3 uLBox;                // the bitmap's box in world units: x, y, side
uniform vec2 uLN;                  // bins a side, a bin's side
uniform vec3 uLEdge[6];            // the lobule's sides: outward normal, distance from its centre
uniform vec2 uLCtr;                // its centre
uniform vec4 uLCen;                // the central vein's centre, the lobule's radius R, dark (1)
uniform vec4 uLSt;                 // congestion (congU), the plates' disorder (septU), zones on (1)
uniform vec3 uLGap, uLGap55, uLBase, uLNut, uLZ1, uLZ2, uLZ3;
uniform vec4 uLPlate, uLInk, uLZl; // the membrane's, the nucleus's and the zones' lines' colours, with their alphas
uniform float uLive;               // the shader's share of the lobule (the rest is the bitmap)
float lvCov(float d, float px) { return clamp(0.5 - d / px, 0.0, 1.0); }
float lvLine(float d, float hw, float px) { float h = max(hw, 0.5 * px); return clamp(0.5 - (abs(d) - h) / px, 0.0, 1.0) * min(1.0, hw / h); }
float lvHex(vec2 p, float k) { float m = -1e9; for (int i = 0; i < 6; i++) m = max(m, dot(uLEdge[i].xy, p - uLCtr) - k * uLEdge[i].z); return m; }
vec4 lvOver(vec4 s, vec4 d) { return s + d * (1.0 - s.a); }
vec3 lvTone(vec3 c, float q, bool dark) { float k = (dark ? 0.12 : 0.16) * (1.0 - smoothstep(0.3, 0.75, q)); return c * vec3(1.0 - 0.35 * k, 1.0 - 0.8 * k, 1.0 - k); }
vec4 lvTint(vec3 rgb, float a) { return vec4(rgb * a, a); }
vec4 liveTissue(vec2 w) {
  vec2 wp = uLBox.xy + w * uLBox.z;
  float px = uLBox.z / uRect.z, R = uLCen.z, cu = uLSt.x, sj = uLSt.y;
  bool dark = uLCen.w > 0.5;
  float h1 = lvHex(wp, 1.015);
  if (h1 > 2.0 + 2.0 * px) return vec4(0.0);
  float c1 = lvCov(h1, px);
  vec4 acc = lvTint(uLGap55, 1.0) * c1;
  float hm = lvHex(wp, 1.0), clipC = lvCov(hm, px), ag = dark ? 0.55 : 0.5;
  acc = lvOver(lvTint(uLGap, ag) * clipC, acc);
  if (clipC > 0.0) {
    ivec2 ib = ivec2(floor((wp - uLBox.xy) / uLN.y));
    int nb = int(uLN.x);
    float lw0 = max(0.6, 0.6 * px);
    if (ib.x >= 0 && ib.y >= 0 && ib.x < nb && ib.y < nb) {
      vec2 hd = texelFetch(uLB, ib, 0).rg;
      int st = int(hd.x), cnt = int(hd.y);
      for (int n = 0; n < cnt; n++) {
        int j = st + n;
        int ci = int(texelFetch(uLI, ivec2(j & 1023, j >> 10), 0).r);
        int tx = 3 * (ci & 511), ty = ci >> 9;
        vec4 t0 = texelFetch(uLC, ivec2(tx, ty), 0), t1 = texelFetch(uLC, ivec2(tx + 1, ty), 0), t2 = texelFetch(uLC, ivec2(tx + 2, ty), 0);
        float q = t1.w;
        // (Dead cells of congestion: the bitmap switches a cell at its threshold, and crossfades whole pictures; here the cell's share
        // of "dead" eases in over a small step of congU about each threshold, so cells fade out one by one as it rises, never pop. Away from the
        // thresholds it is 0 or 1, as the bitmap's.)
        float dd = q < 0.4 ? smoothstep(0.105, 0.135, cu) * smoothstep(-0.015, 0.015, cu * (1.25 - q * 1.6) - t2.x) : 0.0;
        float dz = sj * min(t0.w, t1.x) * 0.45;
        float ang = t0.z + t2.w * sj * 0.9;
        float lw = mix(t0.w, t0.w * 0.7, dd) * (1.0 + 0.12 * sj), ww = mix(t1.x, t1.x * 0.7, dd) * (1.0 + 0.3 * sj);
        vec2 d = wp - (t0.xy + t2.yz * dz);
        float ca = cos(ang), sa = sin(ang);
        vec2 lp = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
        float r = min(lw, ww) * 0.38;
        vec2 qd = abs(lp) - 0.5 * vec2(lw, ww) + r;
        float sd = length(max(qd, vec2(0.0))) + min(max(qd.x, qd.y), 0.0) - r;
        if (sd > 0.5 * lw0 + px) continue;
        float tt = 0.88 + 0.12 * t1.y;
        vec3 fill = mix(lvTone(uLBase * tt + (1.0 - tt) * (dark ? 0.15 : 1.0) * 0.3, q, dark), dark ? vec3(0.42, 0.33, 0.3) : vec3(0.93, 0.86, 0.72), dd);
        float af = mix(dark ? 0.8 : 0.92, 0.6, dd), live = 1.0 - dd;
        acc = lvOver(lvTint(fill, af) * (lvCov(sd, px) * clipC), acc);
        if (live > 0.0) {
          acc = lvOver(lvTint(uLPlate.rgb, uLPlate.a) * (lvLine(sd, 0.5 * lw0, px) * clipC * live), acc);
          float dn = length(lp - vec2(t1.z * lw, 0.0)) - max(0.9, ww * 0.16);
          acc = lvOver(lvTint(uLInk.rgb, uLInk.a) * (lvCov(dn, px) * clipC * live), acc);
        }
      }
    }
    // Zone 3 congestion: blood pooling round the central vein (the radial gradient from 0.05 R to 0.55 R).
    if (cu > 0.04) {
      float u = clamp((length(wp - uLCen.xy) - 0.05 * R) / (0.5 * R), 0.0, 1.0);
      float a = u < 0.6 ? mix(0.5 * cu, 0.22 * cu, u / 0.6) : mix(0.22 * cu, 0.0, (u - 0.6) / 0.4);
      acc = lvOver(lvTint(uLNut, a) * clipC, acc);
    }
    if (uLSt.z > 0.5) {
      float za = dark ? 0.2 : 0.17;
      acc = lvOver(lvTint(uLZ1, za) * (lvCov(lvHex(wp, 1.0), px) * clipC), acc);
      acc = lvOver(lvTint(uLZ2, za) * (lvCov(lvHex(wp, 0.66), px) * clipC), acc);
      acc = lvOver(lvTint(uLZ3, za) * (lvCov(lvHex(wp, 0.36), px) * clipC), acc);
      acc = lvOver(lvTint(uLZl.rgb, uLZl.a) * (lvLine(lvHex(wp, 0.66), 0.5, px) * clipC), acc);
      acc = lvOver(lvTint(uLZl.rgb, uLZl.a) * (lvLine(lvHex(wp, 0.36), 0.5, px) * clipC), acc);
    }
  }
  // Healthy: just the limiting plate, a hairline (not clipped).
  if (sj <= 0.0) acc = lvOver(lvTint(uLPlate.rgb, uLPlate.a) * lvLine(hm, 0.5, px), acc);
  return acc;
}
`;
