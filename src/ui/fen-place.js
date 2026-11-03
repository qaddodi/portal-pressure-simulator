// Where the Fenestrae callout and the Space of Disse's name sit on a wide sinusoid view (µm along the vessel, upper plate).
// Three names share that side: the stellate cell's, beside its cell (fixed); the Fenestrae pill, with a thin leader down to an
// open pore of the lining straight under it; and the Space of Disse's, on its band under them. None may touch another name, nor the leader (which
// crosses the band), and all stay inside the free stretch [lo, hi]. The pill takes the pore that stays open longest (low closing
// threshold, so it is still an open pore in a cirrhotic wall) from those the nuclei's swells leave showing, by place only, so
// the choice never moves as the pores open and close.

import { underNucleus, poreOpenness } from './sinusoid-gl.js';

// What the layout works in, kept and written in place (the sinusoid view lays its names out every frame it draws): the intervals to avoid
// (flat, start and end), the Disse name's spot, the best placements tryGap finds and the answer. The spot and the answer are kept records,
// valid until the next call; every caller reads them at once.
const AV = [0, 0, 0, 0];
const SPOT = { s: 0, c: 0, right: false };
let spotHas = false;
const JOINT = { ok: false, t: 0, xp: 0, xc: 0, xq: 0 }, ALONE = { ok: false, t: 0, xp: 0, xc: 0, xq: null };
const OUT = { xp: 0, xc: 0, xq: null };
const SLIDES = [0, -0.5, 0.5, -1, 1];

// The Disse name's centre in the stretch [a, b] on one side of the stellate cell (right: on its right), when it beats the best so far.
function offer(a, b, dh, xs, right) {
  const want = xs + (right ? 40 : -40), c = Math.min(b - dh, Math.max(a + dh, want)), s = Math.abs(c - want) + (right ? 0 : 6);
  if (!spotHas || s < SPOT.s) { spotHas = true; SPOT.s = s; SPOT.c = c; SPOT.right = c >= xs; }
}
// The Space of Disse's spot among the n intervals of AV (start, end pairs): the stretches of [lo, hi] they leave, each at least 2 dh wide,
// taken in order from the left. Sorts AV by start (stable) first.
function spotAmong(lo, hi, n, dh, xs) {
  for (let i = 1; i < n; i++) {
    const a = AV[2 * i], b = AV[2 * i + 1];
    let j = i - 1;
    while (j >= 0 && AV[2 * j] - a > 0) { AV[2 * j + 2] = AV[2 * j]; AV[2 * j + 3] = AV[2 * j + 1]; j--; }
    AV[2 * j + 2] = a; AV[2 * j + 3] = b;
  }
  spotHas = false;
  const w = 2 * dh;
  let from = lo;
  for (let i = 0; i < n; i++) {
    const e = Math.min(AV[2 * i], hi);
    if (e - from >= w) { offer(from, e, dh, xs, true); offer(from, e, dh, xs, false); }
    from = Math.max(from, AV[2 * i + 1]);
  }
  if (hi - from >= w) { offer(from, hi, dh, xs, true); offer(from, hi, dh, xs, false); }
  return spotHas ? SPOT : null;
}

/** The Space of Disse's name: its centre, in the stretch `avoid` leaves that is nearest to where it has always sat (40 µm from the
 *  stellate cell at xs, on its right by preference; a name half dh wide), or null when no stretch is wide enough. The record
 *  { s, c, right } is kept and written again by the next call. */
export function disseSpot(lo, hi, avoid, dh, xs) {
  const n = avoid.length;
  for (let i = 0; i < n; i++) { AV[2 * i] = avoid[i][0]; AV[2 * i + 1] = avoid[i][1]; }
  return spotAmong(lo, hi, n, dh, xs);
}

// One try at a gap: the best placement with the Disse name beside it (JOINT) and the best without (ALONE); the better of the two that exists.
function tryGap(gap, strict, pores, nsd, lo, hi, hs, fh, dh, fp, xs) {
  const hl = hs[0] - gap, hr = hs[1] + gap, mid = (hs[0] + hs[1]) / 2;
  JOINT.ok = false; ALONE.ok = false;
  for (let i = 0; i < pores.length; i++) {
    const p = pores[i];
    if (p.x < lo || p.x > hi || (strict && !(p.th < 0.3 && poreOpenness(p.th, 0.15) > 0.3)) || underNucleus(p.x, nsd)) continue;
    // (Right over it; or slid along, still over it, so its leader still drops straight down, where the edge of the view or the
    // stellate name leaves no room centred.)
    for (let k = 0; k < SLIDES.length; k++) {
      const o = SLIDES[k], c = p.x + o * Math.max(0, fh - 0.5 * fp), a = c - fh, b = c + fh;
      if (a < lo || b > hi || (b > hl && a < hr)) continue;
      // (The nearest spot the gap allows, on whichever side of the stellate name, by the pore's place alone (a wider reading never
      // moves the pick); one that stays open longest first; centred over it first.)
      const s = 3 * p.th + 0.02 * Math.abs(p.x - (p.x < mid ? hl : hr)) + 0.05 * Math.abs(o);
      AV[0] = a - fp; AV[1] = b + fp; AV[2] = hs[0] - fp; AV[3] = hs[1] + fp;
      const d = spotAmong(lo, hi, 2, dh, xs);
      const t = s + (d && !d.right ? 0.1 : 0);
      if (d && (!JOINT.ok || t < JOINT.t)) { JOINT.ok = true; JOINT.t = t; JOINT.xp = p.x; JOINT.xc = c; JOINT.xq = d.c; }
      if (!ALONE.ok || s < ALONE.t) { ALONE.ok = true; ALONE.t = s; ALONE.xp = p.x; ALONE.xc = c; ALONE.xq = null; }
    }
  }
  return JOINT.ok ? JOINT : ALONE.ok ? ALONE : null;
}

/** The Fenestrae pill and the Space of Disse's name, clear of each other and of the stellate cell's name.
 *  pores, nsd: the upper lining's pores (poreAt's) and its nuclei's seed; lo, hi: the free stretch; hs: [left, right] of the stellate
 *  cell's name; fh, dh: half the widths of the pill and of the Disse name; fp: the gap a leader's end keeps (16 px); xs: the stellate cell.
 *  The pill stands right over its pore, its leader running straight down to it, and keeps `far` or more from the stellate name (120 px:
 *  the two read one at a time, never as a crowd; Mohammad, 2 Nov 2026, label mocks). Where no pore leaves that much room, 2 fp is kept.
 *  Returns { xp, xc, xq }: the pore, the pill's centre and the Disse name's (null when the three do not fit side by side, the pill
 *  alone being placed), or null when not even the pill fits. The record is kept and written again by the next call. */
export function placeFenDisse({ pores, nsd, lo, hi, hs, fh, dh, fp, xs, far = 2 * fp }) {
  // (A plate's middle pore, which stays partly open even in a cirrhotic wall (15 % open), first; the full gap first.)
  const r = tryGap(Math.max(far, 2 * fp), true, pores, nsd, lo, hi, hs, fh, dh, fp, xs) || tryGap(2 * fp, true, pores, nsd, lo, hi, hs, fh, dh, fp, xs)
    || tryGap(Math.max(far, 2 * fp), false, pores, nsd, lo, hi, hs, fh, dh, fp, xs) || tryGap(2 * fp, false, pores, nsd, lo, hi, hs, fh, dh, fp, xs);
  if (!r) return null;
  OUT.xp = r.xp; OUT.xc = r.xc; OUT.xq = r.xq;
  return OUT;
}
