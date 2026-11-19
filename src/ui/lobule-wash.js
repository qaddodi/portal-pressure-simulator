// The wedged column's wash in the lobule (HVPG and PPG, slide 5: the slide's camera is the lobule with its sinusoids lit, cam 'lobule:sinusoid').
// The balloon holds a still column of blood from the hepatic vein back through the central vein into the sinusoids, so once the lobule has landed the
// wedge's amber fills the central vein and spreads outward along every sinusoid, in a front that runs from the centre to the portal tracts. It rides the
// Tube's own recolour (veins-gl.js, a vessel's texels 8 and 9: colour, amount, the stretch along it, its soft edge), the way the HVPG catheter's column
// recolours the hepatic vein on the figure, so it costs only the rows of the vessels it reaches. Pure: it writes numbers into the attribute array it is given.
// The timing is sinusoid-wash.js (washProgress), shared with the sinusoid view.

/** The vessels the wash runs along: the three levels of sinusoid and the cross-links between them; the central vein ('cv') it fills whole. */
export const WASH_SINUS = new Set(['s0', 's1', 's2', 'an']);
const AMOUNT = 0.85;   // how much of the amber replaces the vessel's own colour
const FRAC = new WeakMap();   // a course's cumulative length share at each of its points (made once per course)

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function shares(pts) {
  let f = FRAC.get(pts);
  if (f) return f;
  f = new Float64Array(pts.length);   // alloc-rare: once per course, when the wash first reaches it
  let s = 0;
  for (let i = 1; i < pts.length; i++) { s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); f[i] = s; }
  if (s > 0) for (let i = 1; i < pts.length; i++) f[i] /= s;
  FRAC.set(pts, f);
  return f;
}

/** The part of a course the front has covered, from the end of it that lies nearer the lobule's centre: [from, to] as shares of its length (0 to 1), written into
 *  out; false when the front has not reached it. pts: its points; rho: each point's distance from the centre in lobule radii (the tube's own); front: the front's radius, in the same. */
export function washSpan(pts, rho, front, out) {
  const n = pts.length;
  if (n < 2 || rho.length !== n) return false;
  const f = shares(pts), fromStart = rho[0] <= rho[n - 1], step = fromStart ? 1 : -1;
  const last = fromStart ? n - 1 : 0;
  let i = fromStart ? 0 : n - 1, share;
  if (rho[i] > front) return false;
  while (i !== last) {
    const j = i + step;
    if (rho[j] > front) { share = f[i] + (f[j] - f[i]) * ((front - rho[i]) / (rho[j] - rho[i] || 1)); break; }
    i = j;
  }
  if (share === undefined) share = f[last];   // the whole course is covered
  if (fromStart) { out[0] = 0; out[1] = share; } else { out[0] = share; out[1] = 1; }
  return true;
}

const SPAN = [0, 0];
/** Write the wash at progress k (0 to 1) into the tube attribute array: each reached vessel's recolour texels (stride floats a vessel). rgb: the wedge's amber, 0 to 1 each.
 *  geo: { R, rcv0 } (the lobule's radius and its central vein's, world units). Vessels the front has not reached are left as the array has them (zero: no recolour). */
export function washInto(tubeData, tubes, k, geo, rgb, stride) {
  if (!(k > 0)) return;
  const amount = AMOUNT * smooth(0, 0.05, k), r0 = (geo.rcv0 / geo.R) * 0.8, front = r0 + (1.1 - r0) * k, soft = Math.max(2, geo.R * 0.035);
  for (let p = 0; p < tubes.length; p++) {
    const t = tubes[p], cv = t.kind === 'cv';
    if (!cv && !WASH_SINUS.has(t.kind)) continue;
    let lo = -1, hi = 2;
    if (!cv) {
      if (!washSpan(t.pts, t.rho, front, SPAN)) continue;
      lo = SPAN[0] <= 0.0005 ? -1 : SPAN[0]; hi = SPAN[1] >= 0.9995 ? 2 : SPAN[1];
    }
    const o = t.id * stride + 32;
    tubeData[o] = rgb[0]; tubeData[o + 1] = rgb[1]; tubeData[o + 2] = rgb[2]; tubeData[o + 3] = amount;
    tubeData[o + 4] = lo; tubeData[o + 5] = hi; tubeData[o + 6] = cv ? 1 : soft; tubeData[o + 7] = 0;
  }
}
