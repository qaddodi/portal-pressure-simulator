// The lobule's look (G21): pure helpers the lobule view draws with, kept here so they can be tested without a canvas.

/** The sinusoids' lumen against the hepatocyte cords: a quarter narrower than it was, so the cords read as cords. */
export const SIN_NARROW = 0.75;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * A hepatocyte's colour by its zone: rgb 0–1, q its place across the lobule (0 at the central vein, 1 at the portal edge).
 * Zone 3, around the central vein, is deeper and warmer (blue drops most, red least); zone 1 keeps the cell's own tone.
 */
export function cordTone(rgb, q, dark = false) {
  const k = (dark ? 0.12 : 0.16) * (1 - smooth(0.3, 0.75, q));
  return [rgb[0] * (1 - 0.35 * k), rgb[1] * (1 - 0.8 * k), rgb[2] * (1 - k)];
}

/**
 * A sinusoid's colour as it capillarizes (fibSin 0–1): drained toward a grey of its own lightness, tinted with the lobule's
 * shade (--lz-shade), so choked sinusoids look duller, never brighter. Healthy (fibSin 0) it is unchanged.
 */
export function dullSinusoid(rgb, shade, fibSin) {
  const f = 0.4 * Math.min(1, Math.max(0, fibSin || 0));
  if (!(f > 0)) return rgb;
  const l = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return rgb.map((x, i) => x + (l + (shade[i] - l) * 0.35 - x) * f);
}

/** The neighbouring lobules' contrast, cut by this much (an overlay of the page's own colour) in the lobule view (G22). */
export const NEIGHBOUR_FLAT = 0.3;

/** The surround's fade into the page round the lobule in focus: clear inside r0, FADE_MID of the page's colour halfway out,
 *  all of it at the outer edge, which sits FADE_SPAN × r0 out (the lobule view's 1.1 R to 3.2 R). */
export const FADE_SPAN = 3.2 / 1.1, FADE_MID = 0.72;
/** The most of the page's colour the fade may lay anywhere on screen, so the neighbouring lobules always reach every edge
 *  (Mohammad, 19 Oct: zooming in, they were cut off at the top and bottom). */
export const EDGE_FADE = 0.5;
/** How much of the page's colour the fade lays at distance d from the lobule (q = 1). */
export function fadeAt(d, r0, r1) {
  const s = Math.min(1, Math.max(0, (d - r0) / Math.max(1e-6, r1 - r0)));
  return s < 0.5 ? FADE_MID * s * 2 : FADE_MID + (1 - FADE_MID) * (s - 0.5) * 2;
}
/** The fade's outer edge for a clear circle r0, pushed out (never in) so the farthest screen corner, reach away, is at most
 *  EDGE_FADE faded: the neighbours cover the whole screen at every moment of the zoom and at rest, on every screen. */
export function fadeOuter(r0, reach) {
  const s = EDGE_FADE / (2 * FADE_MID);   // (where the first half of the ramp reaches EDGE_FADE)
  return Math.max(r0 * FADE_SPAN, r0 + Math.max(0, reach - r0) / s);
}

/** Their blur, in px of a field tile whose lobules are R px across: none on the smallest tiles, about 4 px on a 192 px one. */
export const neighbourBlur = (R) => (R < 24 ? 0 : R * 0.02);

// Box widths whose three passes approximate a Gaussian of this sigma (each pass a box of radius r).
function boxRadii(sigma, n = 3) {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
  const wu = wl + 2, m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  return Array.from({ length: n }, (_, i) => ((i < m ? wl : wu) - 1) / 2);
}
// One box pass of radius r along rows (step 1 pixel) or columns (step one row), wrapping round the tile's edges (it
// repeats), on RGBA floats: a running sum per channel, so each pixel costs the same whatever the radius.
function boxPass(src, dst, w, h, r, rows) {
  const n = rows ? w : h, lines = rows ? h : w, step = rows ? 4 : w * 4, k = 1 / (2 * r + 1);
  const idx = new Int32Array(n + 2 * r + 1);   // idx[j]: the offset of pixel j - r along the line, wrapped
  for (let j = 0; j < idx.length; j++) idx[j] = ((((j - r) % n) + n) % n) * step;
  for (let line = 0; line < lines; line++) {
    const base = rows ? line * w * 4 : line * 4;
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
    for (let j = 0; j <= 2 * r; j++) { const o = base + idx[j]; s0 += src[o]; s1 += src[o + 1]; s2 += src[o + 2]; s3 += src[o + 3]; }
    for (let i = 0; i < n; i++) {
      const o = base + i * step;
      dst[o] = s0 * k; dst[o + 1] = s1 * k; dst[o + 2] = s2 * k; dst[o + 3] = s3 * k;
      const add = base + idx[i + 2 * r + 1 < idx.length ? i + 2 * r + 1 : 0], sub = base + idx[i];
      s0 += src[add] - src[sub]; s1 += src[add + 1] - src[sub + 1]; s2 += src[add + 2] - src[sub + 2]; s3 += src[add + 3] - src[sub + 3];
    }
  }
}
/**
 * A repeating tile's pixels (RGBA, w × h) blurred by a Gaussian of `sigma` px, wrapping round its edges so the
 * pattern shows no seam (G22). Smooth on every browser: the tile is first averaged down (every source pixel counted, so
 * nothing aliases) to a size where the blur is 2 px, blurred there by three box passes each way, then brought back to full
 * size with a wrapped bilinear step, which the blur hides. (The old fallback scaled down and up with the canvas, unfiltered,
 * and showed as steps on the Mac.) Returns a new Uint8ClampedArray.
 */
export function blurWrapped(px, w, h, sigma) {
  if (!(sigma > 0.5)) return Uint8ClampedArray.from(px);
  const k = Math.min(1, 2 / sigma), W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k));
  let a = W === w && H === h ? Float32Array.from(px) : areaDown(px, w, h, W, H);
  let b = new Float32Array(a.length);
  for (const r of boxRadii(sigma * W / w)) { boxPass(a, b, W, H, r, true); boxPass(b, a, W, H, r, false); }
  if (W === w && H === h) return Uint8ClampedArray.from(a);
  const out = new Uint8ClampedArray(w * h * 4), sx = W / w, sy = H / h;
  // Source columns and weights per output column (the same for every row).
  const xa = new Int32Array(w), xb = new Int32Array(w), tx = new Float32Array(w);
  for (let x = 0; x < w; x++) { const fx = (x + 0.5) * sx - 0.5, x0 = Math.floor(fx); tx[x] = fx - x0; xa[x] = (((x0 % W) + W) % W) * 4; xb[x] = ((((x0 + 1) % W) + W) % W) * 4; }
  for (let y = 0; y < h; y++) {
    const fy = (y + 0.5) * sy - 0.5, y0 = Math.floor(fy), ty = fy - y0, ra = (((y0 % H) + H) % H) * W * 4, rb = ((((y0 + 1) % H) + H) % H) * W * 4;
    for (let x = 0, o = y * w * 4; x < w; x++, o += 4) {
      const u = tx[x], a00 = ra + xa[x], a01 = ra + xb[x], a10 = rb + xa[x], a11 = rb + xb[x];
      const w00 = (1 - u) * (1 - ty), w01 = u * (1 - ty), w10 = (1 - u) * ty, w11 = u * ty;
      out[o] = a[a00] * w00 + a[a01] * w01 + a[a10] * w10 + a[a11] * w11;
      out[o + 1] = a[a00 + 1] * w00 + a[a01 + 1] * w01 + a[a10 + 1] * w10 + a[a11 + 1] * w11;
      out[o + 2] = a[a00 + 2] * w00 + a[a01 + 2] * w01 + a[a10 + 2] * w10 + a[a11 + 2] * w11;
      out[o + 3] = a[a00 + 3] * w00 + a[a01 + 3] * w01 + a[a10 + 3] * w10 + a[a11 + 3] * w11;
    }
  }
  return out;
}
// The tile averaged down to W × H: each small pixel the mean of the source pixels it covers (rows, then columns).
function areaDown(px, w, h, W, H) {
  const mid = new Float32Array(W * h * 4), out = new Float32Array(W * H * 4);
  const X0 = new Int32Array(W + 1);
  for (let X = 0; X <= W; X++) X0[X] = Math.floor((X * w) / W);
  for (let y = 0; y < h; y++) {
    for (let X = 0; X < W; X++) {
      const x0 = X0[X], x1 = Math.max(x0 + 1, X0[X + 1]), n = x1 - x0;
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
      for (let x = x0, o = (y * w + x0) * 4; x < x1; x++, o += 4) { s0 += px[o]; s1 += px[o + 1]; s2 += px[o + 2]; s3 += px[o + 3]; }
      const o = (y * W + X) * 4; mid[o] = s0 / n; mid[o + 1] = s1 / n; mid[o + 2] = s2 / n; mid[o + 3] = s3 / n;
    }
  }
  for (let Y = 0; Y < H; Y++) {
    const y0 = Math.floor((Y * h) / H), y1 = Math.max(y0 + 1, Math.floor(((Y + 1) * h) / H)), n = y1 - y0;
    for (let X = 0; X < W; X++) {
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
      for (let y = y0; y < y1; y++) { const o = (y * W + X) * 4; s0 += mid[o]; s1 += mid[o + 1]; s2 += mid[o + 2]; s3 += mid[o + 3]; }
      const o = (Y * W + X) * 4; out[o] = s0 / n; out[o + 1] = s1 / n; out[o + 2] = s2 / n; out[o + 3] = s3 / n;
    }
  }
  return out;
}

/**
 * A fibrous band's outline on context c: P its centre line, N the unit normals, Wd its width at each point, k the pass's
 * width factor. Both ends are rounded (a half circle as wide as the band there), so where bands meet at a portal tract
 * they merge into one soft collar instead of ending in flat, clipped-looking cuts. kEnd (≤ k): the width factor the pass
 * narrows to over the last quarter at each end, so a wide faint pass tucks into the next one there instead of
 * spreading a halo round the tract.
 */
export function bandOutline(c, P, N, Wd, k, kEnd = k) {
  const n = P.length - 1, ang = (i) => Math.atan2(N[i][1], N[i][0]);
  const h = (i) => { const t = Math.min(1, Math.min(i, n - i) / n * 4), e = t * t * (3 - 2 * t); return Wd[i] * (kEnd + (k - kEnd) * e) / 2; };
  c.beginPath();
  for (let i = 0; i <= n; i++) c[i ? 'lineTo' : 'moveTo'](P[i][0] + N[i][0] * h(i), P[i][1] + N[i][1] * h(i));
  // (From +N round to −N through the tangent's direction: the cap bulges past the end, never back over the band.)
  c.arc(P[n][0], P[n][1], h(n), ang(n), ang(n) - Math.PI, true);
  for (let i = n; i >= 0; i--) c.lineTo(P[i][0] - N[i][0] * h(i), P[i][1] - N[i][1] * h(i));
  c.arc(P[0][0], P[0][1], h(0), ang(0) + Math.PI, ang(0), true);
  c.closePath();
}

// A dive aimed at a station draws the lobule's layers over its whole box (lobule-zoom.js, padBox): the box around the lobule's
// centre (x, y) out to r, past the screen W × H wherever it reaches beyond it, or null when the lobule is on screen already.
export function padRect(x, y, r, W, H) {
  const l = Math.max(0, Math.ceil(r - x)), t = Math.max(0, Math.ceil(r - y)), rr = Math.max(0, Math.ceil(x + r - W)), b = Math.max(0, Math.ceil(y + r - H));
  if (!(l || t || rr || b)) return null;
  return { l, t, w: W + l + rr, h: H + t + b };
}
// The wide copy's pixel ratio (lobule-zoom.js, buildWide): always the screen's own, unless the whole box would pass the budget for
// it: WIDE_PX_TOUCH on an iPhone or iPad, where WebKit refuses 2D canvases past about 384 MB in all (26 M px is 104 MB, and
// with the layers, the lobule's bitmap and the field the dive stays near 250 MB at most); WIDE_PX on a computer. Every phone and
// iPad keeps full detail, the widest iPad dive measured (13", landscape, no slide text) needing 25.3 M px.
export const WIDE_PX_TOUCH = 26e6, WIDE_PX = 64e6, WIDE_TILE = 11.5e6;
export function wideDpr(dpr, W, H, touch) {
  const px = W * H * dpr * dpr, cap = touch ? WIDE_PX_TOUCH : WIDE_PX;
  return px <= cap ? dpr : dpr * Math.sqrt(cap / px);
}
// The copy's tiles, at most WIDE_TILE device pixels each (under the 16.7 M px one canvas may hold; one tile on every phone and on
// an iPad with a slide's text, where the copy needs no seam at all), cut on whole device pixels: { x, y, w, h } in CSS px.
export function wideTiles(W, H, dpr) {
  const DW = Math.round(W * dpr), DH = Math.round(H * dpr), n = Math.max(1, Math.ceil((DW * DH) / WIDE_TILE));
  const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt((n * DW) / DH)))), rows = Math.ceil(n / cols);
  const tw = Math.ceil(DW / cols), th = Math.ceil(DH / rows), out = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x0 = i * tw, y0 = j * th, x1 = Math.min(DW, x0 + tw), y1 = Math.min(DH, y0 + th);
    if (x1 > x0 && y1 > y0) out.push({ x: x0 / dpr, y: y0 / dpr, w: (x1 - x0) / dpr, h: (y1 - y0) / dpr });
  }
  return out;
}
