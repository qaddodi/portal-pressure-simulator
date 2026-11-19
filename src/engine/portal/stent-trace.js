// The pressure, the energy lost and the velocity along a stent and the veins either side of it (17 Nov 2026; the reviewer's longitudinal view,
// /mnt/project-files/tips-geometry-mocks/tips-geometry-two-designs.html part 1, on the engine's own numbers). Pure: no DOM, no state, nothing made per call
// when the caller brings its record.
//
// The solver is lumped: it knows what each part of the stent takes (stent-geom.js stentParts: tract, wall, entry, jet, inlet, in mmHg at the flow it
// solved) and the drop from the portal vein to the IVC (the PPG), not where along the stent each is taken. This puts each where it happens, so the
// totals are the engine's and the picture of them is a model (the cards label it "schematic"):
//   wall friction   along the lumen, in proportion to (d / D(x))⁴ (Poiseuille), so a narrow stretch takes more of it per cm, summing to the stent's own wall term
//   entry and exit  the entrance and exit loss and the tract, half at each end of the stent (the tract is the stent's fixed series term)
//   the jet         where the lumen widens again (Borda–Carnot): a step where it widens abruptly, spread over the cone where it widens gently
//   the inlet       where the lumen narrows (K_C, 0 for now)
//   outside         the PPG's remainder (portal vein and hepatic vein to the IVC), half on each side, spread along each vein
// Cumulative loss only ever rises along forward flow. The total head H(x) = P(x) + ½ρv² falls by exactly that loss (Bernoulli with losses), so the static
// pressure P(x) = H(x) − ½ρv(x)² dips where the lumen narrows (the velocity head) and recovers part of it past the waist; what it does not recover is the jet.
//
// Units: mmHg, mL/s, mm, cm. Pressures are above the IVC (P = 0 at the hepatic end), so the portal end reads the PPG.

import { clamp } from '../core/physiology.js';

/** ½ρ per (m/s)² in mmHg: 1060 kg/m³ over 2, over 133.322 Pa per mmHg (a flow of 1 mL/s through 1 mm² is 1 m/s). */
export const HEAD = 3.9753;
/** The veins either side of the stent (diameter, mm): the velocity outside it, and so the velocity head the pressure starts and ends with. */
export const VEIN_MM = 12;
/** The samples along the span (one more than this: both ends). The same count whatever the stent, so a picture drawn from them glides. */
export const TRACE_N = 160;

/** The velocity head (mmHg) of a mean velocity v (cm/s). */
export const headOf = (vCms) => HEAD * (vCms / 100) * (vCms / 100);

/**
 * stentTrace(inp, out): inp = { len (cm), q (mL/s, the stent's flow), d (mm, the open stent), prof(u) (the lumen as a share of d at fraction u of the stent), xa, xb (cm, the span:
 * the stent runs 0 to len, the veins the rest), tract, wall, entry, jet, inlet (mmHg, the stent's parts), ppg, dp (mmHg: the PPG, and the drop across the stent) }.
 * Writes into out (a makeTrace() record the caller keeps: nothing is made here) the arrays x, D (mm), v (cm/s), loss, head, P (mmHg, TRACE_N + 1 each) and returns it, with each part's cumulative share cOut, cTract, cWall, cEnds, cJet (they add up to loss) and out.sites: the five pressure sampling
 * sites' x (cm): the portal vein, the stent's inlet, its narrowest place, its outlet, the IVC; out.i: their sample indices.
 */
export function stentTrace(inp, o) {
  const N = TRACE_N;
  const { len, q, d, prof, xa, xb } = inp, qa = Math.abs(q), dx = (xb - xa) / N;
  const outside = Math.max(0, (inp.ppg ?? 0) - (inp.dp ?? 0)), half = outside / 2;
  // the lumen and the velocity at each sample
  for (let i = 0; i <= N; i++) {
    const x = xa + i * dx, inside = x >= 0 && x <= len;
    const D = inside ? d * clamp(prof(len > 0 ? x / len : 0), 0.02, 1.5) : VEIN_MM;
    o.x[i] = x; o.D[i] = D; o.in[i] = inside ? 1 : 0;
    o.v[i] = (100 * qa) / (Math.PI * (D / 2) * (D / 2));
  }
  // what each sample takes: weights for the friction (wall), and for where the lumen widens (the jet) and narrows (the inlet), inside the stent only
  const wf = o.w1, wj = o.w2, wi = o.w3;
  let sf = 0, sj = 0, si = 0;
  for (let i = 0; i <= N; i++) {
    const k = d / o.D[i], both = i > 0 && o.in[i] && o.in[i - 1], dD = both ? o.D[i] - o.D[i - 1] : 0;
    wf[i] = o.in[i] ? k * k * k * k : 0; sf += wf[i];
    wj[i] = dD > 1e-9 ? dD : 0; sj += wj[i];
    wi[i] = dD < -1e-9 ? -dD : 0; si += wi[i];
  }
  // the parts as they are taken, scaled so they add up to the drop across the stent (the card's own bar does the same: its length is the printed drop)
  const sum = (inp.tract || 0) + inp.wall + (inp.entry || 0) + inp.jet + (inp.inlet || 0), k = sum > 1e-9 && inp.dp > 0 ? inp.dp / sum : 1;
  // a part with nowhere to happen (no widening for the jet, no narrowing for the inlet) is taken at the ends, so the total still adds up
  const tract = (inp.tract || 0) * k, wall = sf > 0 ? inp.wall * k : 0, jet = sj > 0 ? inp.jet * k : 0, inlet = si > 0 ? (inp.inlet || 0) * k : 0;
  // (a stent with no flow has no parts but holds its gradient: the whole drop is taken across the stent, at its ends)
  const entry = (sum > 1e-9 ? sum * k : Math.max(0, inp.dp || 0)) - tract - wall - jet - inlet;
  const iA = firstAtLeast(o.x, 0), iB = firstAtLeast(o.x, len + 1e-9);
  let cf = 0, cj = 0, ci = 0;
  for (let i = 0; i <= N; i++) {
    cf += wf[i]; cj += wj[i]; ci += wi[i];
    // (each part's cumulative share by place: the outside, the tract and the entry and exit at the two ends, the friction along the lumen, the jet where it widens)
    o.cOut[i] = half * clamp((o.x[i] - xa) / Math.max(1e-9, -xa), 0, 1) + half * clamp((o.x[i] - len) / Math.max(1e-9, xb - len), 0, 1);
    o.cTract[i] = (i >= iA ? tract / 2 : 0) + (i >= iB ? tract / 2 : 0);
    o.cWall[i] = sf > 0 ? (wall * cf) / sf : 0;
    o.cEnds[i] = (i >= iA ? entry / 2 : 0) + (i >= iB ? entry / 2 : 0);
    o.cJet[i] = (sj > 0 ? (jet * cj) / sj : 0) + (si > 0 ? (inlet * ci) / si : 0);
    o.loss[i] = o.cOut[i] + o.cTract[i] + o.cWall[i] + o.cEnds[i] + o.cJet[i];
  }
  // the total head falls by it; the static pressure is what is left after the velocity head. The portal end starts at the PPG plus its own velocity head.
  const H0 = (inp.ppg ?? 0) + headOf(o.v[0]);
  for (let i = 0; i <= N; i++) { o.head[i] = H0 - o.loss[i]; o.P[i] = o.head[i] - headOf(o.v[i]); }
  // the five sites: the portal vein (the middle of its stretch), the stent's inlet, its narrowest place, its outlet, the IVC (the middle of the hepatic vein's)
  // (the narrowest place is the middle of the narrowest run: a uniform stent has its middle, not its first sample)
  let dMin = Infinity, iF = iA, iL = iA;
  for (let i = iA; i < iB; i++) {
    if (o.D[i] < dMin - 1e-9) { dMin = o.D[i]; iF = i; iL = i; } else if (o.D[i] <= dMin + 1e-9) iL = i;
  }
  const iN = Math.round((iF + iL) / 2);
  o.i[0] = Math.round(((xa + (0 - xa) / 2) - xa) / dx); o.i[1] = iA; o.i[2] = iN; o.i[3] = Math.max(iA, iB - 1); o.i[4] = Math.round(((len + (xb - len) / 2) - xa) / dx);
  for (let k = 0; k < 5; k++) { o.i[k] = clamp(o.i[k], 0, N); o.sites[k] = o.x[o.i[k]]; }
  return o;
}

const firstAtLeast = (xs, v) => { for (let i = 0; i < xs.length; i++) if (xs[i] >= v) return i; return xs.length - 1; };

/** A record for stentTrace to write into. */
export function makeTrace() {
  const n = TRACE_N + 1, f = () => new Float64Array(n);
  return { x: f(), in: new Uint8Array(n), D: f(), v: f(), loss: f(), head: f(), P: f(), w1: f(), w2: f(), w3: f(), cOut: f(), cTract: f(), cWall: f(), cEnds: f(), cJet: f(), sites: new Float64Array(5), i: new Int32Array(5) };
}
