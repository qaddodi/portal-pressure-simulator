// The Tube renderer's cel shading (docs/recommendations/tube-renderer-plan.md, thread B): a flat fill in the vessel's own colour, one
// hard-edged darker tone on the side away from the light, and an opaque outline (near-black on the light looks, the look's own line colour on the dark ones), the way a cartoon or an anatomy book draws a vessel.
// `celShade` is `tubeShade` (veins-mesh-glsl.js) with the same parameters in the same order, the same premultiplied result and the same host
// declarations (the samplers and T(), over(), and the uniforms px, fx, casing, ring, rimInk, paperInk, light), so the Tube's strips and
// patches call it where Mesh calls tubeShade. Only these lines differ from tubeShade: no contact shadow, the outline's width and colour,
// and the flat fill in place of the light line, the dark line, the rounding and the wall band. `celShadeJS` is the same arithmetic for one
// pixel, for the tests. Nothing draws with this file until thread D wires it.

/** The look's numbers: K the outline's width as a multiple of the row's casing width, INK its colour on a dark casing, BAND where the darker tone starts
 *  across the lumen (0 the middle, 1 the wall), TONE the fill's multiplier there. */
export const CEL = { K: 1.6, INK: [0.07, 0.06, 0.06], BAND: 0.62, TONE: 0.80 };

const lit = (n) => (Number.isInteger(n) ? `${n}.0` : String(n));

/** GLSL (no #version, no main) that declares `uniform float celK;` and defines `celShade`. */
export const celGLSL = ({ F_DIFFUSE, F_EDGE, F_VEIL }) => `
uniform float celK;                    // the outline's width as a multiple of the row's casing width (CEL.K)
const vec3 CEL_INK = vec3(${CEL.INK.map(lit).join(', ')});
const float CEL_BAND = ${lit(CEL.BAND)};
const float CEL_TONE = ${lit(CEL.TONE)};

// The tier's shape drawn at a pixel, cel shaded: selection ring, outline, the flat lumen with one darker tone away from the light, dark
// lumen's rim, lift, hover and the knock-out ring, premultiplied, before the tier's alpha. Ds is unused (a cel shaded vessel has no contact
// shadow); D, R, wall, col, g, aL as in tubeShade.
vec4 celShade(float D, float Ds, float R, float wall, vec3 col, vec2 g, int flags, bool sel, float cA, int grp, int id, float vAt, float hov,
              vec3 edge, float kn, float kcas, float aa, float aL) {
  float wl = max(wall * celK, 1.25 * px);
  float aC = clamp(0.5 - (D - wl) / aa, 0.0, 1.0);
  vec4 c = vec4(0.0);
  if (sel) { float ar = ring.a * clamp(0.5 - (D - wl - 4.0) / aa, 0.0, 1.0); c = over(vec4(ring.rgb * ar, ar), c); }
  // (A veiled vessel keeps half its outline: behind an organ the wall's line is the first thing to go.)
  if ((flags & ${F_VEIL}) != 0) cA *= 0.5;
  float lumY = dot(col, vec3(0.299, 0.587, 0.114));
  float cY = dot(casing.rgb, vec3(0.299, 0.587, 0.114));
  vec3 ink = mix(CEL_INK, casing.rgb, smoothstep(0.25, 0.45, cY));   // a dark casing (the light looks): near-black; a light casing (the dark looks): the look's own line colour
  c = (flags & ${F_EDGE}) != 0 ? over(vec4(edge, 1.0) * (0.92 * aC), c) : over(vec4(ink, 1.0) * (cA * aC), c);
  vec3 lum = col;
  float rho = clamp((R + D) / max(R, 1e-3), 0.0, 1.0);
  if (fx == 1 && (flags & ${F_DIFFUSE}) != 0 && aL > 0.0) {
    // One darker tone of the vessel's own colour, with a hard (one pixel) edge, on the side away from the light; none on hairlines.
    float k = dot(g, light);
    float rho = clamp((R + D) / max(R, 1e-3), 0.0, 1.0);
    float e = aa / max(R, 1e-3);
    float band = smoothstep(CEL_BAND - e, CEL_BAND + e, rho) * smoothstep(0.0, 0.25, -k) * smoothstep(1.5, 3.5, R / aa);
    lum = mix(lum, lum * CEL_TONE, band);
  }
  // A dark lumen (the sickest vessels, on the dark looks, where the outline is no darker than the ground) gets a light edge 1 device px wide just
  // inside its wall, by its own lightness, the way the label halo follows its ink (rimInk.a is 0 on the light looks; hairlines are left out).
  lum = mix(lum, rimInk.rgb, rimInk.a * (1.0 - smoothstep(0.2, 0.4, lumY)) * smoothstep(-px - aa, -px, D) * smoothstep(1.5, 3.5, R / aa));
  if (sel && grp == 2) lum = min(lum * 1.12, vec3(1.0));
  if (hov > 0.0) {
    // The hovered vessel, a little brighter in its own hue, easing out toward each end that meets a vessel not lit with it
    // (over a third of its length, at most 60), so the brighter lumen never stops in a hard line at the join.
    vec4 he = T(id, 11);
    float Lh = max(T(id, 5).z, 1.0), fl = min(0.35 * Lh, 60.0);
    float hs = (he.x > 0.0 ? smoothstep(0.0, max(he.x, fl), vAt * Lh) : 1.0) * (he.y > 0.0 ? smoothstep(0.0, max(he.y, fl), (1.0 - vAt) * Lh) : 1.0);
    lum = mix(lum, min(lum * 1.18 + 0.04, vec3(1.0)), hov * hs);
  }
  lum = mix(mix(lum, paperInk.rgb, kn), casing.rgb, casing.a * kcas * kn);
  c = over(vec4(lum, 1.0) * aL, c);
  return c;
}
`;

// ---- the same arithmetic in JS, for one pixel ----
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const mix = (a, b, t) => a * (1 - t) + b * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => a.map((v, i) => mix(v, b[i], t));
const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
/** Premultiplied `over` of two [r, g, b, a] (GLSL: top + under * (1 - top.a)). */
const over = (top, under) => top.map((v, i) => v + under[i] * (1 - top[3]));

/** `celShade` for one pixel. o: { D, R, wall, col, g, flags, sel, cA, grp, vAt, hov, edge, kn, kcas, aa, aL } and the host's values
 *  { px, fx, light, casing, ring, rimInk, paperInk } (colours [r, g, b, a] or [r, g, b]), the flag bits { F_DIFFUSE, F_EDGE, F_VEIL },
 *  and for a hovered vessel T(id, 11) as `he` [x, y] and T(id, 5).z as `Lh`. Returns the premultiplied [r, g, b, a]. */
export function celShadeJS(o) {
  const { D, R, wall, col, g, flags, sel, grp = 0, vAt = 0, hov = 0, edge = [0, 0, 0], kn = 0, kcas = 0, aa, aL, px, light,
    F_DIFFUSE, F_EDGE, F_VEIL } = o;
  const fx = o.fx ?? 1, he = o.he ?? [0, 0], Lh0 = o.Lh ?? 1;
  const casing = o.casing ?? [0, 0, 0, 0], ring = o.ring ?? [0, 0, 0, 0], rimInk = o.rimInk ?? [0, 0, 0, 0], paperInk = o.paperInk ?? [1, 1, 1, 1];
  let cA = o.cA;
  const wl = Math.max(wall * CEL.K, 1.25 * px);
  const aC = clamp(0.5 - (D - wl) / aa, 0, 1);
  let c = [0, 0, 0, 0];
  if (sel) { const ar = ring[3] * clamp(0.5 - (D - wl - 4) / aa, 0, 1); c = over([ring[0] * ar, ring[1] * ar, ring[2] * ar, ar], c); }
  if ((flags & F_VEIL) !== 0) cA *= 0.5;
  const lumY = col[0] * 0.299 + col[1] * 0.587 + col[2] * 0.114;
  const cY = casing[0] * 0.299 + casing[1] * 0.587 + casing[2] * 0.114;
  const ink = mix3(CEL.INK, casing.slice(0, 3), smoothstep(0.25, 0.45, cY));
  c = (flags & F_EDGE) !== 0 ? over([...edge.map((v) => v * (0.92 * aC)), 0.92 * aC], c) : over([...ink.map((v) => v * (cA * aC)), cA * aC], c);
  let lum = col.slice();
  if (fx === 1 && (flags & F_DIFFUSE) !== 0 && aL > 0) {
    const k = dot2(g, light);
    const rho = clamp((R + D) / Math.max(R, 1e-3), 0, 1);
    const e = aa / Math.max(R, 1e-3);
    const band = smoothstep(CEL.BAND - e, CEL.BAND + e, rho) * smoothstep(0, 0.25, -k) * smoothstep(1.5, 3.5, R / aa);
    lum = mix3(lum, lum.map((v) => v * CEL.TONE), band);
  }
  lum = mix3(lum, rimInk.slice(0, 3), rimInk[3] * (1 - smoothstep(0.2, 0.4, lumY)) * smoothstep(-px - aa, -px, D) * smoothstep(1.5, 3.5, R / aa));
  if (sel && grp === 2) lum = lum.map((v) => Math.min(v * 1.12, 1));
  if (hov > 0) {
    const Lh = Math.max(Lh0, 1), fl = Math.min(0.35 * Lh, 60);
    const hs = (he[0] > 0 ? smoothstep(0, Math.max(he[0], fl), vAt * Lh) : 1) * (he[1] > 0 ? smoothstep(0, Math.max(he[1], fl), (1 - vAt) * Lh) : 1);
    lum = mix3(lum, lum.map((v) => Math.min(v * 1.18 + 0.04, 1)), hov * hs);
  }
  lum = mix3(mix3(lum, paperInk.slice(0, 3), kn), casing.slice(0, 3), casing[3] * kcas * kn);
  return over([lum[0] * aL, lum[1] * aL, lum[2] * aL, aL], c);
}
