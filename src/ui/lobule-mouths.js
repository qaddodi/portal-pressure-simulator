// Where the vessels that join a disc seen end-on (the lobule's central vein, portal venule, arteriole, bile ductule) open its rim.
//
// The Tube draws such a disc's wall as an ink line all round, and none where a vessel joins it, so the vessel flows in (tube-cel-glsl.js celDisc, ringOpen reads the mask
// below). The mask is 72 bins of 5 degrees from -180, bin b is bit b % 24 of word b / 24 (a float holds 24 bits exactly), written to the disc's tube row (texel 3, xyz).
//
// 15 Nov 2026 (Mohammad: the central vein's boundary looked chipped, black ticks where each sinusoid's wall met it): the mask was made once, with the geometry, from the
// joining vessels' HEALTHY radii against the disc's healthy radius, and 2 degrees wider than the lumen. With the calibers moving (congestion widens the sinusoids two and a
// half times and the vein by two thirds) it opened the wall where no vessel came and closed it across the lumen where one did, and a 2 degree margin on a 5 degree bin left a
// stub of ink beside every mouth. It is now worked out from the radii the vessels are drawn with, each time they change (mouthWords), and its edge is the lumen's own edge.
//
// A site is { cx, cy, rim (the disc's healthy radius), list: [{ ang, oid }] }: where the disc is and, for each vessel that joins it, which way it arrives and which row it is.
import { N_SAMPLES } from './veins-mesh.js';

export const MOUTH_BINS = 72;
const TAU = Math.PI * 2;

/** The disc's sites, from the lobule's geometry. t: the disc's tube; tubes, joins: the lobule's; rim: the disc's healthy radius (world units). null when nothing joins it. */
export function mouthSite(t, tubes, joins, rim) {
  const a0 = t.pts[0], a1 = t.pts[t.pts.length - 1], cx = (a0[0] + a1[0]) / 2, cy = (a0[1] + a1[1]) / 2, list = [];
  for (const j of joins) {
    if (!j.members.includes(t.id)) continue;
    for (const oid of j.members) {
      if (oid === t.id) continue;
      let best = null, bd = Infinity;
      for (const p of tubes[oid].pts) { const d = Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - rim * 1.5); if (d < bd) { bd = d; best = p; } }
      list.push({ ang: Math.atan2(best[1] - cy, best[0] - cx), oid });
    }
  }
  return list.length ? { cx, cy, rim, list } : null;
}

/** The sample of a joining vessel that lies at the disc's rim (the one whose distance from the disc's centre is nearest `rD`). */
export function rimSample(pts, cx, cy, rD) {
  let k = 0, bd = Infinity;
  for (let i = 0; i < pts.length; i++) { const d = Math.abs(Math.hypot(pts[i][0] - cx, pts[i][1] - cy) - rD); if (d < bd) { bd = d; k = i; } }
  return Math.min(k, N_SAMPLES - 1);
}

/**
 * The mask words and the joining vessels' mean radius for a disc as drawn now. site: mouthSite's; rD: the disc's radius now; tubes: the lobule's; radiiOf(tube): that vessel's radii at its samples now.
 * words: [a, b, c], written in place (zeroed first). Each mouth is the arc the vessel's lumen takes across the rim: asin(r / rD) either side of its direction, no margin
 * (the vessel's own outline then ends where the disc's wall begins, and the two are one line). Returns the mean radius `jr` of the joining vessels at the rim.
 */
export function mouthWords(site, rD, tubes, radiiOf, words) {
  words[0] = words[1] = words[2] = 0;
  let sum = 0;
  for (const m of site.list) {
    const o = tubes[m.oid], r = radiiOf(o)[rimSample(o.pts, site.cx, site.cy, rD)];
    sum += r;
    const half = Math.asin(Math.min(0.94, r / Math.max(rD, 1e-3)));
    for (let b = 0; b < MOUTH_BINS; b++) {
      const th = ((b + 0.5) / MOUTH_BINS - 0.5) * TAU;
      if (Math.abs(Math.atan2(Math.sin(th - m.ang), Math.cos(th - m.ang))) <= half) words[Math.floor(b / 24)] |= 1 << (b % 24);
    }
  }
  return sum / site.list.length;
}

/** Bin b of a mask (0 or 1). */
export const binOpen = (words, b) => (words[Math.floor(b / 24)] >> (b % 24)) & 1;

/**
 * How far a sinusoid widens as it opens into the central vein (a share of its own radius): the lumen flares like a trumpet, so its wall runs into the vein's wall at a shallow
 * angle (a fillet), not a corner. d: the distance of the sample from the vein's wall, world units (negative inside the disc: the full flare); r: the vessel's unflared radius.
 * 1 + FLARE at the wall, 1 a few radii out (FLARE_LEN of them), eased so the walls stay smooth (a quadratic in the smoothstep: no kink where it starts).
 */
export const FLARE = 0.4, FLARE_LEN = 5;
export function flareAt(d, r) {
  const u = Math.min(1, Math.max(0, d / (FLARE_LEN * Math.max(r, 1e-3))));
  const s = 1 - u * u * (3 - 2 * u);
  return 1 + FLARE * s * s;
}

/**
 * The arteriole's twig: from the arteriole (A, seen end-on in the portal tract) into the first stretch of a periportal sinusoid at q, as a cubic that leaves A toward the lobule and
 * arrives running with the sinusoid's own flow (tq, the unit direction the sinusoid runs at q, portal to central) at MERGE_ANGLE to it from A's side, so it merges like a Y,
 * not a stick meeting a side wall (16 Nov 2026, Mohammad: "should be more elegant"). c: the lobule's centre. Returns u in 0..1 to [x, y].
 */
export const MERGE_ANGLE = 0.85;
export function twigPath(A, q0, tq, c, off = 0) {
  const unit = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  const side = Math.sign(-tq[1] * (A[0] - q0[0]) + tq[0] * (A[1] - q0[1])) || 1, n = [-tq[1] * side, tq[0] * side];   // n: from the sinusoid toward A
  const q = [q0[0] + n[0] * off, q0[1] + n[1] * off];   // (the twig ends `off` toward A from the sinusoid's centre: at its wall, where its own fade into the sinusoid begins)
  const dir = unit(q[0] - A[0], q[1] - A[1]), inw = unit(c[0] - A[0], c[1] - A[1]), L = Math.hypot(q[0] - A[0], q[1] - A[1]);
  const t0 = unit(dir[0] * 0.6 + inw[0] * 0.4, dir[1] * 0.6 + inw[1] * 0.4);
  const t1 = [tq[0] * Math.cos(MERGE_ANGLE) - n[0] * Math.sin(MERGE_ANGLE), tq[1] * Math.cos(MERGE_ANGLE) - n[1] * Math.sin(MERGE_ANGLE)];
  const p1 = [A[0] + t0[0] * L * 0.4, A[1] + t0[1] * L * 0.4], p2 = [q[0] - t1[0] * L * 0.3, q[1] - t1[1] * L * 0.3];
  return (u) => {
    const v = 1 - u, a = v * v * v, b = 3 * v * v * u, d = 3 * v * u * u, e = u * u * u;
    return [a * A[0] + b * p1[0] + d * p2[0] + e * q[0], a * A[1] + b * p1[1] + d * p2[1] + e * q[1]];
  };
}

/** The twig's radius along it (u 0..1): it leaves the arteriole at `r0` (a share of the disc's own) and tapers to its thread `base`, then opens to `rEnd` where it merges into the sinusoid. */
export function twigRadius(base, r0, rEnd, u) {
  const e = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  return base + (Math.max(r0, base) - base) * (1 - e(0, 0.5, u)) + (Math.max(rEnd, base) - base) * e(0.7, 1, u);
}
