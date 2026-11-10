// Blood that shows trouble (brief V7, 10 Nov 2026; the speed plan's visual #7, docs/recommendations/tube-renderer-speed-plan.md).
//
// A lumen's blood is drawn at a place (s, y): the arc length along the vessel and the across, -1 … 1. troubleAt bends that place before the
// streaks are laid, so the streaks themselves show what the flow is doing:
//   * REVERSAL SHIMMER: where the flow runs backwards the streaks waver side to side as they travel (a wave across the lumen, fullest on the
//     axis and nothing at the wall), a little denser.
//   * A NARROWING: the vessel's caliber falls to under NARROW of what it was upstream. Inside it (the JET) the streaks are drawn closer to the
//     axis and denser, so they tighten into a jet. For STEPS steps downstream of it (EDDIES) the streaks swing across and back, and along,
//     on a slow wave, fading out over those steps.
// Nothing here moves a vessel or colours it: the function returns a new place for the streaks (xy), a gain on their density (z) and how much
// trouble there is (w, 0 … 1, for the tests and a tint later). Where there is none it returns (s, y, 1, 0) exactly, so untroubled blood is
// byte for byte what it was downstream of the call.
//
// The reads: the caliber at s (R, the caller has it) and at s - j d for j = 1 … 5 (d = DSTEP radii along the flow's upstream side): five
// reads of the rad texture. The narrowing at the pixel's own place is n0 = r0 / max(r1, r2); the narrowing at s - k d (k = 1 … 3) is
// n_k = r_k / max(r_(k+1), r_(k+2)), which are the same five samples again, so the eddies cost no read of their own beyond the first two.
// The max of two upstream readings makes a short narrowing count for its first 2 d of length, and a long throat only its entry.
//
// The shader text declares no uniform: it uses the lumen shader's own: radAt (comp-glsl.js ROWS_GLSL), pxW, the blood's clock bT and
// `still` (1: reduced motion; the lumen shader must declare it, as the vessel shader does). With `still` the time terms are frozen at 0: the
// bend stays, it does not move.
//
// The JS twin (troubleAtJS) is the same arithmetic, for the tests, with radAt passed in as a function.

/** Every tunable. */
export const TROUBLE = {
  MIN_PX: 6,         // under this many device pixels across the lumen nothing is bent (it fades in over the next MIN_PX * FADE_BAND)
  FADE_BAND: 0.5,
  YMAX: 0.999,       // |y'| never reaches 1 (the wall)
  // reversal shimmer
  A: 0.18,           // the wave's amplitude across (of the radius), fullest on the axis: A (1 - y^2)
  L: 3,              // its wavelength along the vessel, in radii
  F: 0.6,            // its frequency, Hz of the blood's clock
  REV_GAIN: 1.25,    // the streaks' density gain
  // narrowing
  // (The brief said 0.7. On the figure's real radii the rows that trip a 0.7 bar are the flares at a join (a vessel's first or last few samples
  // widen to meet its trunk: n 0.54 … 0.68, tests/blood-trouble.test.js prints them), and the real stenoses, a thrombosed or pinched segment, sit
  // at 0.40 … 0.52. 0.6 sits between: a flare gets under a fifth of the effect, a stenosis most of it.)
  NARROW: 0.6,       // n under this is a narrowing
  TIGHT: 0.4,        // n at or under this is as tight as the effects get (the jet and the eddies' strength rise from NARROW to TIGHT)
  DSTEP: 2,          // the look-back step d, in radii (of R)
  JET_Y: 0.6,        // inside the jet the across is scaled by this
  JET_GAIN: 1.5,     // and the density by up to this
  STEPS: 3,          // the eddies last this many steps downstream
  B: 0.22,           // eddy: across swing (of the radius), pushed outward from the axis (times sign(y))
  G: 0.8,            // eddy: frequency, Hz
  EL: 2,             // eddy: wavelength along the vessel, in radii
  C: 0.5,            // eddy: swing along the vessel, in radii
};

const f = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const T = TROUBLE;

/** The shader text: one function, troubleAt. Needs radAt(int, float, float), pxW, bT and `still` from the host. */
export const TROUBLE_GLSL = `
// The blood's place as trouble bends it: xy = (s, y) to draw the streaks at, z = a gain on the streaks' density (1 = none), w = how much trouble (0..1, for tests and a later tint)
vec4 troubleAt(int id, float s, float y, float R, float len, float vd, bool reversed) {
  // Under ${f(T.MIN_PX)} device pixels across, nothing (eased in over the next ${f(T.MIN_PX * T.FADE_BAND)}).
  float fade = smoothstep(${f(T.MIN_PX)}, ${f(T.MIN_PX * (1 + T.FADE_BAND))}, 2.0 * R / pxW);
  if (fade <= 0.0) return vec4(s, y, 1.0, 0.0);
  float dir = vd < 0.0 ? -1.0 : 1.0;
  float tt = still == 1 ? 0.0 : bT;
  float d = ${f(T.DSTEP)} * R;
  // The caliber upstream, at 1 … 5 steps (the flow's upstream side): five reads.
  float r1 = radAt(id, s - dir * d, len), r2 = radAt(id, s - dir * 2.0 * d, len), r3 = radAt(id, s - dir * 3.0 * d, len);
  float r4 = radAt(id, s - dir * 4.0 * d, len), r5 = radAt(id, s - dir * 5.0 * d, len);
  // The narrowing at this place (the jet) and at 1, 2 and 3 steps upstream (the eddies, falling from 1 to 0).
  float n0 = R / max(r1, r2);
  float jet = smoothstep(${f(T.NARROW)}, ${f(T.TIGHT)}, n0) * fade;
  float q1 = smoothstep(${f(T.NARROW)}, ${f(T.TIGHT)}, r1 / max(r2, r3));
  float q2 = smoothstep(${f(T.NARROW)}, ${f(T.TIGHT)}, r2 / max(r3, r4)) * ${f(1 - 1 / T.STEPS)};
  float q3 = smoothstep(${f(T.NARROW)}, ${f(T.TIGHT)}, r3 / max(r4, r5)) * ${f(1 - 2 / T.STEPS)};
  float eddy = max(q1, max(q2, q3)) * fade;
  float rev = reversed ? fade : 0.0;
  if (rev + jet + eddy <= 0.0) return vec4(s, y, 1.0, 0.0);
  float ys = y, ss = s, gain = 1.0;
  if (rev > 0.0) {
    ys += rev * ${f(T.A)} * (1.0 - y * y) * sin(6.2831853 * (s / (${f(T.L)} * R) - dir * fract(${f(T.F)} * tt)));
    gain *= mix(1.0, ${f(T.REV_GAIN)}, rev);
  }
  if (jet > 0.0) {
    ys = mix(ys, ys * ${f(T.JET_Y)}, jet);
    gain *= mix(1.0, ${f(T.JET_GAIN)}, jet);
  }
  if (eddy > 0.0) {
    float w = sin(6.2831853 * (s / (${f(T.EL)} * R) - dir * fract(${f(T.G)} * tt)));
    ys += ${f(T.B)} * eddy * w * (y < 0.0 ? -1.0 : 1.0);
    ss -= ${f(T.C)} * eddy * R * w;
  }
  return vec4(ss, clamp(ys, -${f(T.YMAX)}, ${f(T.YMAX)}), gain, max(rev, max(jet, eddy)));
}
`;

// ---- the same arithmetic in JS ----

const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const fract = (x) => x - Math.floor(x);
const TWO_PI = 6.2831853;

/**
 * troubleAt for one place. o: { id, s, y, R, len, vd, reversed, radAt (id, s, len) => caliber, t (the blood's clock, s), still (1: time frozen at 0), pxW (world units per device pixel) }.
 * Returns { s, y, gain, w, n0, jet, eddy, rev } (the first four are the GLSL's xyzw; the rest are for the tests).
 */
export function troubleAtJS(o) {
  const { id = 0, s, y, R, len, vd, reversed, radAt, pxW } = o;
  const fade = smooth(T.MIN_PX, T.MIN_PX * (1 + T.FADE_BAND), 2 * R / pxW);
  const none = { s, y, gain: 1, w: 0, n0: 1, jet: 0, eddy: 0, rev: 0 };
  if (fade <= 0) return none;
  const dir = vd < 0 ? -1 : 1;
  const tt = o.still === 1 ? 0 : (o.t ?? 0);
  const d = T.DSTEP * R;
  const r = [R];
  for (let j = 1; j <= 5; j++) r.push(radAt(id, s - dir * j * d, len));
  const n0 = R / Math.max(r[1], r[2]);
  const jet = smooth(T.NARROW, T.TIGHT, n0) * fade;
  const qk = (k) => smooth(T.NARROW, T.TIGHT, r[k] / Math.max(r[k + 1], r[k + 2])) * (1 - (k - 1) / T.STEPS);
  const eddy = Math.max(qk(1), qk(2), qk(3)) * fade;
  const rev = reversed ? fade : 0;
  if (rev + jet + eddy <= 0) return { ...none, n0 };
  let ys = y, ss = s, gain = 1;
  if (rev > 0) {
    ys += rev * T.A * (1 - y * y) * Math.sin(TWO_PI * (s / (T.L * R) - dir * fract(T.F * tt)));
    gain *= 1 + (T.REV_GAIN - 1) * rev;
  }
  if (jet > 0) {
    ys = ys + (ys * T.JET_Y - ys) * jet;
    gain *= 1 + (T.JET_GAIN - 1) * jet;
  }
  if (eddy > 0) {
    const w = Math.sin(TWO_PI * (s / (T.EL * R) - dir * fract(T.G * tt)));
    ys += T.B * eddy * w * (y < 0 ? -1 : 1);
    ss -= T.C * eddy * R * w;
  }
  return { s: ss, y: Math.min(Math.max(ys, -T.YMAX), T.YMAX), gain, w: Math.max(rev, jet, eddy), n0, jet, eddy, rev };
}

/** A row's narrowings by the shader's own rule, along its arc: [{ s, n0 }] for every s in `ss` where the jet is on (n0 < NARROW). For the survey. */
export function narrowingsJS(radAt, id, len, vd, ss, pxW = 0) {
  const out = [];
  for (const s of ss) {
    const R = radAt(id, s, len);
    if (pxW > 0 && 2 * R / pxW < T.MIN_PX) continue;
    const dir = vd < 0 ? -1 : 1, d = T.DSTEP * R;
    const n0 = R / Math.max(radAt(id, s - dir * d, len), radAt(id, s - dir * 2 * d, len));
    if (n0 < T.NARROW) out.push({ s, n0 });
  }
  return out;
}
