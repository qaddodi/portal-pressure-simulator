// What the sinusoid view (sinusoid-view.js) draws, read from the lobule's model: how open the wall is,
// what fills the space of Disse, the stellate cell, the lumen, and the traffic across the wall.
// No DOM here, so the tests can read it.

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Targets for the sinusoid view's drawing, from a lobule model (lobuleState). */
export function sinusoidTargets(m) {
  const sigma = m.sigma ?? 0.15;
  // Porosity: 1 at the healthy reflection coefficient (0.15), 0 at its cirrhotic ceiling (0.6).
  const por = clamp(1 - (sigma - 0.15) / 0.45, 0, 1);
  const cap = clamp(Math.max(m.fibSin, 1 - por), 0, 1);
  const lymph = (m.lymph ?? 0.6) / (m.lymph0 || 0.6);
  return {
    por,
    col: m.fibSin,                                    // collagen in Disse
    bm: smooth(0.12, 0.7, cap),                       // basement membrane under the endothelium
    mv: 1 - 0.75 * smooth(0.1, 0.85, cap),            // microvilli
    act: m.act,                                       // stellate cell activation
    lum: m.zone.sin ** -0.12 * (1 + 0.5 * m.congU),   // lumen width (as the lobule's sinusoids)
    pinch: 0.22 * m.act,                              // the activated stellate cell's squeeze
    v: (m.rev?.sin ? -1 : 1) * clamp(Math.abs(m.flow) / Math.max(0.35, m.zone.sin ** -0.24), 0.08, 3),   // blood speed (flow / area)
    filt: clamp(lymph, 0, 6),                         // plasma filtered into Disse, × healthy
    prot: clamp((m.lyProt - 0.42) / 0.42, 0, 1),      // the lymph's protein, 0 (cirrhotic) … 1 (as plasma), as the lobule shades it
  };
}
