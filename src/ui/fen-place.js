// Where the Fenestrae callout and the Space of Disse's name sit on a wide sinusoid view (µm along the vessel, upper plate).
// Three names share that side: the stellate cell's, beside its cell (fixed); the Fenestrae pill, with a thin leader down to an
// open pore of the lining; and the Space of Disse's, on its band under them. None may touch another name, nor the leader (which
// crosses the band), and all stay inside the free stretch [lo, hi]. The pill takes the pore that stays open longest (low closing
// threshold, so it is still an open pore in a cirrhotic wall) from those the nuclei's swells leave showing, by place only, so
// the choice never moves as the pores open and close.

import { underNucleus } from './sinusoid-gl.js?v=8399d8205e';

// The stretches of [lo, hi] the intervals in `avoid` leave, each at least w wide.
function room(lo, hi, avoid, w) {
  const out = [];
  let from = lo;
  for (const [a, b] of [...avoid].sort((p, q) => p[0] - q[0])) {
    if (Math.min(a, hi) - from >= w) out.push([from, Math.min(a, hi)]);
    from = Math.max(from, b);
  }
  if (hi - from >= w) out.push([from, hi]);
  return out;
}

/** The Space of Disse's name: its centre, in the stretch `avoid` leaves that is nearest to where it has always sat (40 µm from the
 *  stellate cell at xs, on its right by preference; a name half dh wide), or null when no stretch is wide enough. */
export function disseSpot(lo, hi, avoid, dh, xs) {
  let best = null;
  for (const [a, b] of room(lo, hi, avoid, 2 * dh)) {
    for (const right of [true, false]) {
      const want = xs + (right ? 40 : -40), c = Math.min(b - dh, Math.max(a + dh, want)), s = Math.abs(c - want) + (right ? 0 : 6);
      if (!best || s < best.s) best = { s, c, right: c >= xs };
    }
  }
  return best;
}

/** The Fenestrae pill and the Space of Disse's name, clear of each other and of the stellate cell's name.
 *  pores, nsd: the upper lining's pores (poreAt's) and its nuclei's seed; lo, hi: the free stretch; hs: [left, right] of the stellate
 *  cell's name; fh, dh: half the widths of the pill and of the Disse name; fp: the gap a leader's end keeps (16 px); xs: the stellate cell.
 *  The pill sits beside its pore (its near edge 0.8 fp from it), a gap of 2 fp or more from the stellate name.
 *  Returns { xp, xc, xq }: the pore, the pill's centre and the Disse name's (null when the three do not fit side by side, the pill
 *  alone being placed), or null when not even the pill fits. */
export function placeFenDisse({ pores, nsd, lo, hi, hs, fh, dh, fp, xs }) {
  const off = fh + 0.8 * fp, hl = hs[0] - 2 * fp, hr = hs[1] + 2 * fp, mid = (hs[0] + hs[1]) / 2;
  let joint = null, alone = null;
  for (const p of pores) {
    if (p.x < lo || p.x > hi || underNucleus(p.x, nsd)) continue;
    for (const sg of [-1, 1]) {
      const c = p.x + sg * off, a = c - fh, b = c + fh;
      if (a < lo || b > hi || (b > hl && a < hr)) continue;
      // (Near the stellate name rather than far from it, on whichever side it is; the pore that stays open longest first.)
      const s = p.th + 0.02 * Math.abs(c - (c < mid ? hl - fh : hr + fh));
      const d = disseSpot(lo, hi, [[Math.min(a, p.x) - fp, Math.max(b, p.x) + fp], [hs[0] - fp, hs[1] + fp]], dh, xs);
      const t = s + (d && !d.right ? 0.1 : 0);
      if (d && (!joint || t < joint.t)) joint = { t, xp: p.x, xc: c, xq: d.c };
      if (!alone || s < alone.t) alone = { t: s, xp: p.x, xc: c, xq: null };
    }
  }
  const r = joint || alone;
  return r && { xp: r.xp, xc: r.xc, xq: r.xq };
}
