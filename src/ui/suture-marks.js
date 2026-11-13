// The stitches of a surgical join and the wound tie on a divided vein (Mohammad, 13 Nov 2026: "S1 is perfect", from the suture mocks,
// /mnt/project-files/suture-mocks/). Pure geometry, no DOM: stage-transitions.js turns the paths into marks, which the marks' painter
// (stage-marks.js) draws on the GPU like every other mark.
//
// A join is drawn in the shunt's own coordinates: `sl` the distance in from its end, `a` the place across it (-1 to 1 of its radius).
// The seam is the curve where the host vein's wall crosses the shunt (found by walking in from the end), so it is a slanted curve that
// follows the wall, not a line square to the shunt. The running stitch is one thread going round the seam: each pass is a short slanting
// stroke across it, `N_STITCH` of them round the whole circumference. The near half is drawn at full strength and the far half faintly, as
// if seen through the vessel wall (the thin, soft wires of the TIPS stent).

export const N_STITCH = 13;
// The tie on a divided vein sits a little in from its cut end; the stump narrows there (the waist of S1: 20 % at the tie, over about 5 units each way).
export const PINCH_K = 0.2, PINCH_W = 5.5;
export const stumpCentre = (cut, len) => Math.min(cut + 5, len * 0.6) + 4;
/** The caliber factor at arc length s on a stump whose tie is at c (0 for no stump). */
export const stumpPinch = (s, c) => { const q = (s - c) / PINCH_W; return 1 - PINCH_K * Math.exp(-q * q); };
const NS = 21;   // (seam samples across the shunt)
const TAU = Math.PI * 2;
const f1 = (v) => v.toFixed(1);

/** Distance from (x, y) to a polyline cur = [[x, y], ...]. */
export function distToLine(cur, x, y) {
  let best = Infinity;
  for (let i = 1; i < cur.length; i++) {
    const ax = cur[i - 1][0], ay = cur[i - 1][1], dx = cur[i][0] - ax, dy = cur[i][1] - ay, l2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)), px = ax + dx * t - x, py = ay + dy * t - y;
    const d = px * px + py * py;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * Where the host's wall meets the shunt, for 21 places across it, as distance in from the shunt's end. `pt(sl, a)` is the world point,
 * `du(x, y)` how far inside the host's wall a point is (positive inside). null when the end is not inside a host.
 */
export function seamTable(pt, du, maxSl) {
  const tab = new Float64Array(NS);
  for (let i = 0; i < NS; i++) {
    const a = -1 + (2 * i) / (NS - 1);
    let found = -1;
    for (let sl = 0; sl <= maxSl; sl += 0.75) { const p = pt(sl, a); if (du(p[0], p[1]) < -0.3) { found = sl; break; } }
    if (found < 0) return null;
    tab[i] = found;
  }
  for (let k = 0; k < 3; k++) { const c = Float64Array.from(tab); for (let i = 1; i < NS - 1; i++) tab[i] = (c[i - 1] + 2 * c[i] + c[i + 1]) / 4; }
  return tab[NS >> 1] > 1.5 ? tab : null;
}
export const seamAt = (tab, a) => { const f = (Math.max(-1, Math.min(1, a)) + 1) / 2 * (NS - 1), i = Math.min(NS - 2, Math.floor(f)); return tab[i] + (tab[i + 1] - tab[i]) * (f - i); };

/**
 * The paths of one join: { seam, ridge, back, front } as path data. `h` is half the stitch's length along the shunt.
 */
export function runningStitch(pt, tab, h) {
  const poly = (sl, a0, a1, k) => { let d = ''; for (let i = 0; i <= k; i++) { const a = a0 + ((a1 - a0) * i) / k, p = pt(sl(a), a); d += `${i ? 'L' : 'M'}${f1(p[0])} ${f1(p[1])} `; } return d; };
  const out = { seam: poly((a) => seamAt(tab, a), -0.96, 0.96, 16), ridge: poly((a) => seamAt(tab, a) + h * 0.32, -0.9, 0.9, 16), back: '', front: '' };
  const dl = TAU / N_STITCH;
  for (let i = 0; i < N_STITCH; i++) {
    const p = -Math.PI + (i + 0.5) * dl, sn = Math.sin(p);
    if (Math.abs(sn) > 0.95) continue;
    const s0 = seamAt(tab, sn), q0 = pt(s0 + h, Math.sin(p - dl * 0.55)), q1 = pt(Math.max(0, s0 - h), Math.sin(p + dl * 0.55));
    out[Math.cos(p) > 0 ? 'front' : 'back'] += `M${f1(q0[0])} ${f1(q0[1])} L${f1(q1[0])} ${f1(q1[1])} `;
  }
  return out;
}

/**
 * The wound tie: `turns` rings of thread round a vein (each seen as an ellipse, near arc and far arc), a knot and two short tails.
 * `fr(d)` is the vein's frame { x, y, nx, ny } at arc length d, `d0` the middle of the binding, `R` the vein's radius, `step` the gap between turns.
 */
export function woundTie(fr, d0, R, step, turns = 5, pinch = 0) {
  const out = { back: '', front: '', knot: null, tails: '' };
  const b = step * 0.62, at = (d, lat) => { const q = fr(d); return [q.x + q.nx * lat, q.y + q.ny * lat]; };
  const Rr = (d) => R * 0.97 * (pinch ? stumpPinch(d, d0) : 1);   // (a stump's waist: the turns lie on the narrowed wall)
  for (let j = 0; j < turns; j++) {
    const dj = d0 + (j - (turns - 1) / 2) * step;
    let nearD = '', farD = '';
    for (let m = 0; m <= 14; m++) {
      const p = -Math.PI / 2 + (m * Math.PI) / 14, q = at(dj - b * Math.cos(p) + 0.5 * Math.sin(p), Rr(dj) * Math.sin(p));
      nearD += `${m ? 'L' : 'M'}${f1(q[0])} ${f1(q[1])} `;
      const p2 = Math.PI / 2 + (m * Math.PI) / 14, q2 = at(dj + b * Math.abs(Math.cos(p2)) + 0.5 * Math.sin(p2), Rr(dj) * Math.sin(p2));
      farD += `${m ? 'L' : 'M'}${f1(q2[0])} ${f1(q2[1])} `;
    }
    out.front += nearD; out.back += farD;
  }
  const kd = d0 - (turns / 2 + 0.15) * step, kp = at(kd, Rr(kd) * Math.sin(0.95));
  out.knot = { x: kp[0], y: kp[1], r: step * 0.72 };
  for (const sg of [-1, 1]) { const t = at(kd - step * 2.4, Rr(kd) * Math.sin(0.95) + sg * step * 1.2); out.tails += `M${f1(kp[0])} ${f1(kp[1])} L${f1(t[0])} ${f1(t[1])} `; }
  return out;
}
