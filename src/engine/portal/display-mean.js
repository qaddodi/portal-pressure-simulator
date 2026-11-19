// The readings as the screen shows them: the model's pressures, flows and outside pressures averaged over exactly one breath, then over
// exactly one beat, so a reading at rest holds still (full app review 15 Nov 2026, ENG-2 and the steady-readings item).
//
// Why two boxcars and not a filter: the breath is a 4 s sine (engine computeExt) and the beat a periodic wave at 60 / hr s. A boxcar
// over exactly one period of a periodic signal leaves its mean and nothing else, whatever the wave's shape; a one-pole filter (the 2.5 s
// one the readings had) lets a 4 s wave through at about a third of its size, so HVPG swung by 0.3 to 0.6 mmHg at rest and SOS, resting
// at 9.9, crossed the red line with every breath. The two boxcars commute (both are linear and time-invariant), so the breath's comes
// first, on short bins, and the beat's runs over the breath means, whose beat ripple is already small.
//
// The model steps 4, 8 or 20 ms at the bedside, so a bin of 40 ms holds a whole number of steps; any other step still works, a bin then
// holds a little over 40 ms and the window's oldest bin is counted by the share of it inside the window.
//
// The readings then pass a dead band at their printed precision (holdAt, engine holdShown, metrics.js): a mean that sits on a rounding
// boundary, 9.95 mmHg, does not flick 9.9, 10.0, 9.9 with the last thousandth of ripple.

export const BREATH_S = 4;   // (engine computeExt: sin(2πt / 4))
const BIN_S = 0.04;
const RING1 = 112;   // (bins kept for the breath's window: 4 s of 40 ms bins, and spare)
const RING2 = 48;    // (breath means kept for the beat's window: 1.9 s, longer than a beat at the slowest rate the heart runs, 38 a minute)

export class DisplayMean {
  constructor(n) {
    this.n = n;
    this.acc = new Float64Array(n); this.accT = 0;
    this.r1 = new Float64Array(RING1 * n); this.d1 = new Float64Array(RING1); this.h1 = 0; this.c1 = 0;
    this.s1 = new Float64Array(n); this.t1 = 0;   // (sum of mean × duration over the bins counted, and their duration)
    this.r2 = new Float64Array(RING2 * n); this.d2 = new Float64Array(RING2); this.h2 = 0; this.c2 = 0;
    this.box = new Float64Array(n);
    this.out = new Float64Array(n);
    this.closes = 0;
    this.seeded = false;
    this.holdS = 0; this.heldV = new Float64Array(n);   // (the seed an arrival holds the output at while its windows fill with real bins, seed)
  }

  /** Start over at a steady value: every bin of both windows holds `v`, so the output is `v` until the model moves.
   *  `holdS` > 0 is a model that arrives AT REST (a slide's state: a settled patient, its means converged): the windows are filled with `v`, not with
   *  the swing of a breath and a beat, so the first seconds' partial windows would read the swing's share, 0.3 to 0.5 mmHg, up and back (the means of a
   *  settled patient carry no news, the seed is already their mean). The output stays at `v` for `holdS` seconds, until the real bins have replaced the
   *  seed in both windows, and goes to the real means then, which at rest are the seed's own to a few thousandths. A change of any kind in the first
   *  seconds writes the shown values and seeds again without it, so it shows at once as it always did. */
  seed(v, holdS = 0) {
    const n = this.n;
    this.acc.fill(0); this.accT = 0;
    const k1 = Math.ceil(BREATH_S / BIN_S);
    for (let b = 0; b < k1; b++) { this.r1.set(v, b * n); this.d1[b] = BIN_S; }
    this.h1 = k1 % RING1; this.c1 = k1;
    for (let i = 0; i < n; i++) this.s1[i] = v[i] * k1 * BIN_S;
    this.t1 = k1 * BIN_S;
    for (let b = 0; b < RING2; b++) { this.r2.set(v, b * n); this.d2[b] = BIN_S; }
    this.h2 = 0; this.c2 = RING2;
    this.box.set(v); this.out.set(v);
    this.holdS = holdS > 0 ? holdS : 0; if (this.holdS) this.heldV.set(v);
    this.seeded = true;
  }

  /** Add `dt` seconds at the values `v`; `beatS` is the beat's period now. True when a bin closed and `out` moved. */
  add(v, dt, beatS) {
    const n = this.n, acc = this.acc;
    for (let i = 0; i < n; i++) acc[i] += v[i] * dt;
    this.accT += dt;
    if (this.accT < BIN_S - 1e-9) return false;
    this.close(beatS);
    return true;
  }

  close(beatS) {
    const n = this.n, T = this.accT, acc = this.acc, s1 = this.s1;
    // The breath's window: the new bin in, the oldest bins out while the rest still cover the breath.
    if (this.c1 === RING1) this.drop1();
    const at = this.h1 * n;
    for (let i = 0; i < n; i++) { const m = acc[i] / T; this.r1[at + i] = m; s1[i] += acc[i]; acc[i] = 0; }
    this.d1[this.h1] = T; this.t1 += T; this.accT = 0;
    this.h1 = (this.h1 + 1) % RING1; this.c1++;
    while (this.c1 > 1 && this.t1 - this.d1[this.tail1()] >= BREATH_S - 1e-9) this.drop1();
    // (Sums kept by adding and taking away drift by a rounding error each bin: counted again from the bins every so often.)
    if (++this.closes % 512 === 0) this.recount1();
    // The window's oldest bin is counted by its share inside the window.
    const old = this.tail1() * n, over = this.t1 - BREATH_S, box = this.box;
    for (let i = 0; i < n; i++) box[i] = (s1[i] - (over > 0 ? over * this.r1[old + i] : 0)) / Math.min(this.t1, BREATH_S);
    // The beat's window, over the breath means: walked from the newest back until it covers one beat.
    const at2 = this.h2 * n;
    this.r2.set(box, at2); this.d2[this.h2] = T;
    this.h2 = (this.h2 + 1) % RING2; if (this.c2 < RING2) this.c2++;
    const want = Math.min(Math.max(beatS, T), RING2 * BIN_S), out = this.out;
    out.fill(0);
    let got = 0;
    for (let j = 1; j <= this.c2 && got < want - 1e-9; j++) {
      const b = (this.h2 - j + RING2) % RING2, w = Math.min(this.d2[b], want - got), o = b * n;
      for (let i = 0; i < n; i++) out[i] += this.r2[o + i] * w;
      got += w;
    }
    for (let i = 0; i < n; i++) out[i] /= got;
    if (this.holdS > 0) { this.holdS -= T; if (this.holdS > 0) out.set(this.heldV); }
  }

  tail1() { return (this.h1 - this.c1 + RING1) % RING1; }
  drop1() {
    const b = this.tail1(), o = b * this.n, d = this.d1[b];
    for (let i = 0; i < this.n; i++) this.s1[i] -= this.r1[o + i] * d;
    this.t1 -= d; this.c1--;
  }
  recount1() {
    const n = this.n;
    this.s1.fill(0); this.t1 = 0;
    for (let j = 0; j < this.c1; j++) {
      const b = (this.tail1() + j) % RING1, o = b * n, d = this.d1[b];
      for (let i = 0; i < n; i++) this.s1[i] += this.r1[o + i] * d;
      this.t1 += d;
    }
  }
}

// The dead band at a reading's printed precision `step` (0.1 for one decimal, 1 for none): `held` is what the screen shows now, `v` the new
// mean. Inside the same printed value, or two steps or more away, the mean passes as it is. In the next value by less than `band`, the
// reading stays in its own value, at its edge: it moves on only once the mean is clearly past the rounding boundary. (Math.round(v / step),
// as tenthGap and the tiles round.) The band is 0.3 of a step: the means at rest move by a few thousandths of a mmHg.
export const HOLD_SHARE = 0.3;
export function holdAt(held, v, step = 0.1, band = HOLD_SHARE * step) {
  if (!Number.isFinite(held) || !Number.isFinite(v)) return v;
  const kh = Math.round(held / step), kv = Math.round(v / step);
  if (kh === kv || Math.abs(kv - kh) > 1) return v;
  const edge = (Math.min(kh, kv) + 0.5) * step, eps = 1e-5 * step;
  if (Math.abs(v - edge) >= band) return v;
  return kv > kh ? edge - eps : edge + eps;
}
