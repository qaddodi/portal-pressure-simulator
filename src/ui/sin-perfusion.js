// The sinusoids' strands in the anatomy (STRANDS.SIN_RR / SIN_LL) peel off the sinusoid and gather back into it, and drawn
// as solid channels they read as a net bulging at each lobe tip. They are drawn faint and fine instead (review G15; no glow
// behind them: Mohammad, 16 Oct).
//   fade:  the strands' opacity, as a share of what they had (60 % fainter)
//   taper: the strand's caliber at mid-course, as a share of the sinusoid's own width; it narrows from its own caliber
//          where it leaves and rejoins the sinusoid
export const SIN_PERFUSION = { fade: 0.4, taper: 0.25 };

/**
 * A sinusoid strand's lumen radius at `u` (0–1 along the vessel). `rk`: its radius where it runs with the sinusoid;
 * `width`: the sinusoid's drawn width; `span`: [from, to], the stretch over which it leaves and rejoins the sinusoid.
 * Outside the stretch it is `rk`; across it, it narrows to `taper` of the sinusoid's width, narrowest where it bows
 * farthest out (the same profile as its bow), so it meets the sinusoid at its own caliber with no step.
 */
export function sinStrandRadius(rk, width, u, span) {
  const [a, b] = span || [0, 1], v = (u - a) / (b - a || 1);
  if (!(v > 0 && v < 1)) return rk;
  const rt = Math.min(rk, Math.max(0.4, (SIN_PERFUSION.taper * width) / 2));
  return rk + (rt - rk) * Math.sin(Math.PI * v) ** 1.4;
}
