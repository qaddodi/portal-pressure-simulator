// The Tube renderer's cel shading (docs/recommendations/tube-renderer-plan.md, thread B): a flat fill in the vessel's own colour in
// exactly three tones lit from the top left (lit, base and shadow: a faint lift on the side facing the light, the plain fill, one darker step toward the far wall,
// each edge about one pixel soft), and a fine opaque outline (a deep tone of the vessel's own colour on the light looks, the look's own line colour on the dark ones), the way a cartoon or an anatomy book draws a vessel.
// `celShade` is `tubeShade` (veins-mesh-glsl.js) with the same parameters in the same order, the same premultiplied result and the same host
// declarations (the samplers and T(), over(), and the uniforms px, fx, casing, ring, rimInk, paperInk, light), so the Tube's strips and
// patches call it where Mesh calls tubeShade. Only these lines differ from tubeShade: no contact shadow, the outline's width and colour,
// and the flat fill (three tones) in place of tubeShade's light line, dark line, rounding and wall band. `celShadeJS` is the same arithmetic for one
// pixel, for the tests. Nothing draws with this file until thread D wires it.

import { F_RING } from './veins-mesh-glsl.js';   // (ringOpen, the mouth mask's reader, is in that file's shade text, which comes before this text wherever celShade is used)

/** The look's numbers: K the old outline width as a multiple of the casing width (no longer read by the shading; the uniform stays for the host),
 *  LINE_MIN / LINE_MAX / LINE_R the outline's width in device px (R * LINE_R, held between the two), INK the near-black the light looks' deep tone is eased toward,
 *  DIR the unit direction toward the light in screen space (x right, y down): the top left, fixed (the same for every look).
 *  The three tones are two steps of s = rho * dot(g, DIR) (rho 0 the middle .. 1 the wall; s runs -0.7 .. +0.7 across a vessel that is vertical or horizontal, -1 .. +1 across one
 *  at 45 degrees): below SHADE_AT the fill is darkened by SHADE (the shadow), above LIT_AT it is lifted LIT of the way to white (the lit side); between them it is the fill (the base). */
export const CEL = { K: 1.6, INK: [0.07, 0.06, 0.06], DIR: [-0.70710678, -0.70710678], SHADE_AT: -0.16, LIT_AT: 0.24, SHADE: 0.17, LIT: 0.15, LINE_MIN: 1.5, LINE_MAX: 3.0, LINE_R: 0.14 };

const lit = (n) => (Number.isInteger(n) ? `${n}.0` : String(n));

/** GLSL (no #version, no main, no uniforms) that defines `celTones`: the fill's tones and light line (the constants and the function). */
export const celToneGLSL = () => `
const vec2 CEL_DIR = vec2(${CEL.DIR.map(lit).join(', ')});
const float CEL_SHADE_AT = ${lit(CEL.SHADE_AT)};
const float CEL_LIT_AT = ${lit(CEL.LIT_AT)};
const float CEL_SHADE = ${lit(CEL.SHADE)};
const float CEL_LIT = ${lit(CEL.LIT)};

// The flat fill's three tones: lit (a faint lift toward white on the side facing the light, the top left), base (the fill as it is), shadow (one darker step toward the
// far wall). lum the fill (the vessel's own colour, or the lumen layer's blood colour), D the distance from the wall (negative inside), R the radius,
// g the unit direction across the vessel toward the wall, aa one device pixel's edge softness. Each edge is about one pixel soft, each tone a multiple of the colour
// it is given (any lens, either theme), and left out on hairlines. Shared by celShade (the vessel layer) and the lumen layer's shader (tube-lumen-glsl.js), which paints over it.
vec3 celTones(vec3 lum, float D, float R, vec2 g, float aa) {
  float rho = clamp((R + D) / max(R, 1e-3), 0.0, 1.0);
  float s = rho * dot(g, CEL_DIR);
  float et = 0.5 * aa / max(R, 1e-3);   // half width of an edge in s: about one device pixel across a vessel facing the light
  float hw = smoothstep(1.5, 3.5, R / aa);
  float shadow = 1.0 - smoothstep(CEL_SHADE_AT - et, CEL_SHADE_AT + et, s);
  float lit = smoothstep(CEL_LIT_AT - et, CEL_LIT_AT + et, s);
  lum *= 1.0 - hw * CEL_SHADE * shadow;
  return mix(lum, vec3(1.0), CEL_LIT * hw * lit);
}

// A vessel cut across (a disc: the lobule's portal venule, central vein, arteriole and bile ductule, flag F_RING): the long vessels' pale band, a ring just
// inside the wall (about 1.2 to 2.4 device px wide, a lift toward white by 0.144, less on a pale fill), the same width and strength as tubeShade's wall band and
// all round, so a disc has no lit side. Left out on hairlines. Shared by celShade and the lumen layer's shader, which paints over it.
vec3 celRing(vec3 lum, float D, float R, float aa) {
  float lumY = dot(lum, vec3(0.299, 0.587, 0.114));
  float ringW = clamp(0.1 * R, 1.2 * aa, 2.4 * aa);
  float ringBand = smoothstep(-ringW - aa, -ringW, D) * smoothstep(1.5, 3.5, R / aa);
  return mix(lum, vec3(1.0), 0.144 * ringBand * (1.0 - 0.6 * smoothstep(0.72, 0.9, lumY)));
}

// A disc cut across, outlined (flag F_RING; Mohammad, 10 Nov 2026: "outline it, where it's not connecting to a vessel"): inside the wall, an ink line wl wide (the
// vessel's own outline ink, ink) and, inside that, the pale band; both all round, and none where a vessel joins (open 1: ringOpen) so the vessel flows in.
// The lumen layer lays this again over the blood (it replaces this layer's fill), so both shaders call it.
vec3 celDisc(vec3 lum, vec3 ink, float D, float R, float wl, float aa, float open) {
  float closed = 1.0 - open;
  lum = mix(lum, celRing(lum, D + wl, R, aa), closed);
  return mix(lum, ink, clamp(0.5 + (D + wl) / aa, 0.0, 1.0) * closed * smoothstep(1.5, 3.5, R / aa));
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
  if (fx == 1 && (flags & ${F_RING}) != 0 && aL > 0.0) lum = celDisc(lum, T(id, 4).rgb, D, R, 0.8 * wl, aa, ringOpen(T(id, 3).xyz, g));
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
  const sv = rho * dot2(g, CEL.DIR), et = 0.5 * aa / Math.max(R, 1e-3);
  const hw = smoothstep(1.5, 3.5, R / aa);
  const shadow = 1 - smoothstep(CEL.SHADE_AT - et, CEL.SHADE_AT + et, sv), litT = smoothstep(CEL.LIT_AT - et, CEL.LIT_AT + et, sv);
  const out = lum.map((v) => v * (1 - hw * CEL.SHADE * shadow));
  return mix3(out, [1, 1, 1], CEL.LIT * hw * litT);
}

/** `celRing` for one pixel: lum [r, g, b] the fill, D the distance from the wall, R the radius, aa one pixel's softness. */
export function celRingJS(lum, D, R, aa) {
  const lumY = lum[0] * 0.299 + lum[1] * 0.587 + lum[2] * 0.114;
  const ringW = clamp(0.1 * R, 1.2 * aa, 2.4 * aa);
  const band = smoothstep(-ringW - aa, -ringW, D) * smoothstep(1.5, 3.5, R / aa);
  return mix3(lum, [1, 1, 1], 0.144 * band * (1 - 0.6 * smoothstep(0.72, 0.9, lumY)));
}

/** `celDisc` for one pixel: lum [r, g, b] the fill, ink [r, g, b] the line, D, R, wl (the line's width), aa, open 0 .. 1 (ringOpenJS). */
export function celDiscJS(lum, ink, D, R, wl, aa, open) {
  const closed = 1 - open;
  const shifted = celRingJS(lum, D + wl, R, aa);
  const l2 = mix3(lum, shifted, closed);
  return mix3(l2, ink, clamp(0.5 + (D + wl) / aa, 0, 1) * closed * smoothstep(1.5, 3.5, R / aa));
}

/** `ringOpen` for one direction: m the three mouth words [a, b, c], g [x, y] the unit direction across (see veins-mesh-glsl.js ringOpen). */
export function ringOpenJS(m, g) {
  if (g[0] * g[0] + g[1] * g[1] < 1e-8) return 0;
  const a = (Math.atan2(g[1], g[0]) * 0.15915494 + 0.5) * 72 - 0.5, fl = Math.floor(a), w = a - fl;
  const b0 = (((fl + 72) % 72) + 72) % 72, b1 = b0 === 71 ? 0 : b0 + 1;
  const bit = (b) => (Math.round(m[Math.floor(b / 24)]) >> (b % 24)) & 1;
  return bit(b0) * (1 - w * w * (3 - 2 * w)) + bit(b1) * (w * w * (3 - 2 * w));
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
  if (fx === 1 && (flags & F_RING) !== 0 && aL > 0) lum = celDiscJS(lum, o.rowInk ?? ink, D, R, 0.8 * wl, aa, ringOpenJS(o.mask ?? [0, 0, 0], g));
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
