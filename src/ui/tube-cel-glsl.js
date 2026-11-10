// The Tube renderer's cel shading (docs/recommendations/tube-renderer-plan.md, thread B): a flat fill in the vessel's own colour in three
// subtle tones lit from the top left (a faint lift on the side facing the light, the plain fill between, two darker steps toward the far wall,
// each edge about one pixel soft), one crisp light line on the lit side, and a fine opaque outline (a deep tone of the vessel's own colour on the light looks, the look's own line colour on the dark ones), the way a cartoon or an anatomy book draws a vessel.
// `celShade` is `tubeShade` (veins-mesh-glsl.js) with the same parameters in the same order, the same premultiplied result and the same host
// declarations (the samplers and T(), over(), and the uniforms px, fx, casing, ring, rimInk, paperInk, light), so the Tube's strips and
// patches call it where Mesh calls tubeShade. Only these lines differ from tubeShade: no contact shadow, the outline's width and colour,
// and the flat fill (one darker tone, one light line) in place of tubeShade's light line, dark line, rounding and wall band. `celShadeJS` is the same arithmetic for one
// pixel, for the tests. Nothing draws with this file until thread D wires it.

/** The look's numbers: K the old outline width as a multiple of the casing width (no longer read by the shading; the uniform stays for the host),
 *  LINE_MIN / LINE_MAX / LINE_R the outline's width in device px (R * LINE_R, held between the two), INK the near-black the light looks' deep tone is eased toward,
 *  LIGHT the light line's mix toward white. DIR the unit direction toward the light in screen space (x right, y down): the top left, fixed (the same for every look).
 *  The tones are steps of s = rho * dot(g, DIR) (rho 0 the middle .. 1 the wall; s runs -0.7 .. +0.7 across a vessel that is vertical or horizontal, -1 .. +1 across one
 *  at 45 degrees): below S1 the fill is darkened by D1, below S2 by D2 more (both of the fill's own colour), above S3 it is lifted LIT of the way to white. */
export const CEL = { K: 1.6, INK: [0.07, 0.06, 0.06], DIR: [-0.70710678, -0.70710678], S1: -0.12, S2: -0.36, S3: 0.2, D1: 0.1, D2: 0.1, LIT: 0.16, LINE_MIN: 1.5, LINE_MAX: 3.0, LINE_R: 0.14, LIGHT: 0.30 };

const lit = (n) => (Number.isInteger(n) ? `${n}.0` : String(n));

/** GLSL (no #version, no main, no uniforms) that defines `celTones`: the fill's tones and light line (the constants and the function). */
export const celToneGLSL = () => `
const vec2 CEL_DIR = vec2(${CEL.DIR.map(lit).join(', ')});
const float CEL_S1 = ${lit(CEL.S1)};
const float CEL_S2 = ${lit(CEL.S2)};
const float CEL_S3 = ${lit(CEL.S3)};
const float CEL_D1 = ${lit(CEL.D1)};
const float CEL_D2 = ${lit(CEL.D2)};
const float CEL_LIT = ${lit(CEL.LIT)};

// The flat fill's tones: a faint lift on the side facing the light (the top left), the plain fill, two darker steps toward the far wall, and one crisp light
// line on the lit side. lum the fill (the vessel's own colour, or the lumen layer's blood colour), D the distance from the wall (negative inside), R the radius,
// g the unit direction across the vessel toward the wall, aa one device pixel's edge softness. Each step is about one pixel soft, a multiple of the colour it is given
// (any lens, either theme), and left out on hairlines. Shared by celShade (the vessel layer) and the lumen layer's shader (tube-lumen-glsl.js), which paints over it.
vec3 celTones(vec3 lum, float D, float R, vec2 g, float aa) {
  float rho = clamp((R + D) / max(R, 1e-3), 0.0, 1.0);
  float k = dot(g, CEL_DIR);
  float e = aa / max(R, 1e-3);
  float s = rho * k;
  float et = 0.5 * e;                  // half width of a tone step in s: about one device pixel across a vessel facing the light
  float hw = smoothstep(1.5, 3.5, R / aa);
  float t1 = 1.0 - smoothstep(CEL_S1 - et, CEL_S1 + et, s);
  float t2 = 1.0 - smoothstep(CEL_S2 - et, CEL_S2 + et, s);
  float t3 = smoothstep(CEL_S3 - et, CEL_S3 + et, s);
  lum *= 1.0 - hw * (CEL_D1 * t1 + CEL_D2 * t2);
  lum = mix(lum, vec3(1.0), CEL_LIT * hw * t3);
  // One crisp light line on the lit side (a cartoon highlight, flat, no gradient); none on hairlines.
  float side = rho * sign(k);
  float lineA = (1.0 - smoothstep(0.045, 0.045 + e, abs(side - 0.52))) * smoothstep(0.15, 0.45, abs(k)) * smoothstep(2.5, 4.5, R / aa);
  return mix(lum, vec3(1.0), ${lit(CEL.LIGHT)} * lineA);
}
`;

/** GLSL (no #version, no main) that declares `uniform float celK;` and defines `celTones` and `celShade`. */
export const celGLSL = ({ F_DIFFUSE, F_EDGE, F_VEIL }) => `
uniform float celK;                    // (declared for the host's sake; the outline's width is now in device pixels by caliber)
${celToneGLSL()}const vec3 CEL_INK = vec3(${CEL.INK.map(lit).join(', ')});

// The tier's shape drawn at a pixel, cel shaded: selection ring, outline, the flat lumen in three subtle tones lit from the top left, dark
// lumen's rim, lift, hover and the knock-out ring, premultiplied, before the tier's alpha. Ds is unused (a cel shaded vessel has no contact
// shadow); D, R, wall, col, g, aL as in tubeShade.
vec4 celShade(float D, float Ds, float R, float wall, vec3 col, vec2 g, int flags, bool sel, float cA, int grp, int id, float vAt, float hov,
              vec3 edge, float kn, float kcas, float aa, float aL) {
  float wl = clamp(${lit(CEL.LINE_R)} * R, ${lit(CEL.LINE_MIN)} * px, ${lit(CEL.LINE_MAX)} * px);
  float aC = clamp(0.5 - (D - wl) / aa, 0.0, 1.0);
  vec4 c = vec4(0.0);
  if (sel) { float ar = ring.a * clamp(0.5 - (D - wl - 4.0) / aa, 0.0, 1.0); c = over(vec4(ring.rgb * ar, ar), c); }
  // (A veiled vessel keeps half its outline: behind an organ the wall's line is the first thing to go.)
  if ((flags & ${F_VEIL}) != 0) cA *= 0.5;
  float lumY = dot(col, vec3(0.299, 0.587, 0.114));
  float cY = dot(casing.rgb, vec3(0.299, 0.587, 0.114));
  vec3 deep = mix(col * 0.34, CEL_INK, 0.25);
  vec3 ink = mix(deep, casing.rgb, smoothstep(0.25, 0.45, cY));   // a dark casing (the light looks): a deep tone of the vessel's own colour; a light casing (the dark looks): the look's own line colour
  c = (flags & ${F_EDGE}) != 0 ? over(vec4(edge, 1.0) * (0.92 * aC), c) : over(vec4(ink, 1.0) * (cA * aC), c);
  vec3 lum = col;
  if (fx == 1 && (flags & ${F_DIFFUSE}) != 0 && aL > 0.0) lum = celTones(lum, D, R, g, aa);
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

/** `celTones` for one pixel: lum [r, g, b] the fill, D the distance from the wall, R the radius, g the unit direction across toward the wall, aa one pixel's softness. */
export function celTonesJS(lum, D, R, g, aa) {
  const rho = clamp((R + D) / Math.max(R, 1e-3), 0, 1);
  const k = dot2(g, CEL.DIR);
  const e = aa / Math.max(R, 1e-3), s = rho * k, et = 0.5 * e;
  const hw = smoothstep(1.5, 3.5, R / aa);
  const t1 = 1 - smoothstep(CEL.S1 - et, CEL.S1 + et, s), t2 = 1 - smoothstep(CEL.S2 - et, CEL.S2 + et, s), t3 = smoothstep(CEL.S3 - et, CEL.S3 + et, s);
  let out = lum.map((v) => v * (1 - hw * (CEL.D1 * t1 + CEL.D2 * t2)));
  out = mix3(out, [1, 1, 1], CEL.LIT * hw * t3);
  const side = rho * Math.sign(k);
  const lineA = (1 - smoothstep(0.045, 0.045 + e, Math.abs(side - 0.52))) * smoothstep(0.15, 0.45, Math.abs(k)) * smoothstep(2.5, 4.5, R / aa);
  return mix3(out, [1, 1, 1], CEL.LIGHT * lineA);
}

/** `celShade` for one pixel. o: { D, R, wall, col, g, flags, sel, cA, grp, vAt, hov, edge, kn, kcas, aa, aL } and the host's values
 *  { px, fx, light, casing, ring, rimInk, paperInk } (colours [r, g, b, a] or [r, g, b]), the flag bits { F_DIFFUSE, F_EDGE, F_VEIL },
 *  and for a hovered vessel T(id, 11) as `he` [x, y] and T(id, 5).z as `Lh`. Returns the premultiplied [r, g, b, a]. */
export function celShadeJS(o) {
  const { D, R, col, g, flags, sel, grp = 0, vAt = 0, hov = 0, edge = [0, 0, 0], kn = 0, kcas = 0, aa, aL, px,
    F_DIFFUSE, F_EDGE, F_VEIL } = o;
  const fx = o.fx ?? 1, he = o.he ?? [0, 0], Lh0 = o.Lh ?? 1;
  const casing = o.casing ?? [0, 0, 0, 0], ring = o.ring ?? [0, 0, 0, 0], rimInk = o.rimInk ?? [0, 0, 0, 0], paperInk = o.paperInk ?? [1, 1, 1, 1];
  let cA = o.cA;
  const wl = clamp(CEL.LINE_R * R, CEL.LINE_MIN * px, CEL.LINE_MAX * px);
  const aC = clamp(0.5 - (D - wl) / aa, 0, 1);
  let c = [0, 0, 0, 0];
  if (sel) { const ar = ring[3] * clamp(0.5 - (D - wl - 4) / aa, 0, 1); c = over([ring[0] * ar, ring[1] * ar, ring[2] * ar, ar], c); }
  if ((flags & F_VEIL) !== 0) cA *= 0.5;
  const lumY = col[0] * 0.299 + col[1] * 0.587 + col[2] * 0.114;
  const cY = casing[0] * 0.299 + casing[1] * 0.587 + casing[2] * 0.114;
  const deep = mix3(col.map((v) => v * 0.34), CEL.INK, 0.25);
  const ink = mix3(deep, casing.slice(0, 3), smoothstep(0.25, 0.45, cY));
  c = (flags & F_EDGE) !== 0 ? over([...edge.map((v) => v * (0.92 * aC)), 0.92 * aC], c) : over([...ink.map((v) => v * (cA * aC)), cA * aC], c);
  let lum = col.slice();
  if (fx === 1 && (flags & F_DIFFUSE) !== 0 && aL > 0) lum = celTonesJS(lum, D, R, g, aa);
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
