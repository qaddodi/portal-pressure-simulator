// A cavernoma strand that runs only part of the way and ends under the coronary vein, just short of the trunk (where it joins it), instead of passing the
// coronary vein's root on the far side of it (13 Nov 2026, Mohammad: the coronary vein's root crossed the fine channel on the hepatic artery's side).
// The strand's lateral offset from the main channel's chord, over the chord share v: its own offset (`fan`, risen from the open stump over `pa`) eased
// into `rel` (the offset of its end, under the coronary vein) over `bw` before it ends at the root. Two such strands, one each side of the root, make the one fine
// channel of that side meet the coronary vein in a T from each side, no crossing; `tie` = [from, to, rel, bw] (shares of the chord).
import { smooth01 } from './num.js';

/** The strand's points: `base` is the main channel's sampled chord, `fan` its offset (already eased for the view), `rel` the end's offset (the same). */
export function tiedStrand(base, fan, rel, pa, [v0, v1, , bw]) {
  const n = base.length - 1, A = base[0], B = base[n], cl = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, nx = -(B[1] - A[1]) / cl, ny = (B[0] - A[0]) / cl;
  const out = [];   // alloc-rare: as the plateau strands' own list, made when the course changes
  for (let j = 0; j <= n; j++) {
    const v = v0 + ((v1 - v0) * j) / n, f = v * n, i = Math.min(n - 1, Math.floor(f)), k = f - i;
    const px = base[i][0] + (base[i + 1][0] - base[i][0]) * k, py = base[i][1] + (base[i + 1][1] - base[i][1]) * k;
    const h = v1 < 1 ? smooth01((v - (v1 - bw)) / bw) : smooth01((v0 + bw - v) / bw);
    const o = fan * smooth01(v / pa) * smooth01((1 - v) / pa) * (1 - h) + rel * h;
    out.push([px + nx * o, py + ny * o]);
  }
  return out;
}
