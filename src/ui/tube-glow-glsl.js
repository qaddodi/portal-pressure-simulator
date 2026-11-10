// The Tube's short fragment shader for glows (brief P6; docs/recommendations/tube-renderer-speed-plan.md).
//
// `tubeGlowFS(K)` replaces the stage 1 strip build (vesselFS(true, 1, 1)) for the two glow passes only, MP.GLOW (the plain glow) and MP.UP (the glow asked to
// lie on top: the Doppler's), for a vessel row seen alone. It gives the same four outputs for the same pixel, but the pixel's distance comes from the
// vertex shader's varying vD (with the row's clip and dotted rules, as tubeLeanFS applies them) in place of segNear's search over the vessel's
// segments, and there is no join, no tier loop, no loop over vessels and no shape. It keeps from the shared text, unchanged: vesAttrs, glowAmt
// (the same arguments), packFlow's neighbour ditherOut, the tier and group alphas, the redraw rule, the tint rule.
// Its discards are the strip build's: no glow colour (the vessel is not lit), the wrong one of the two passes (a vessel whose glow lies on top is
// drawn only in MP.UP, the others only in MP.GLOW), no amount outside the wall; any other pass: discard. The depth prepass (tubeKey 1) keeps the
// pixel inside a lit vessel's own wall (no colour, its depth) so no other glow shows inside it; the colour pass draws nothing there.
//
// What it leaves out (it sees one vessel): the cut of a lit vessel's glow inside another lit vessel's lumen (the strip build's `gv *= smoothstep(...)`
// over the other vessels near the pixel), and the open end the lean shader gives a shape. The sloped glow skirt (4b1069b) is the vertex shader's.
//
// K: the constants of tubeLeanFS (tube-lean-glsl.js), the same names, passed by veins-gl.js (thread D):
//   F_DIFFUSE, F_EDGE, F_SHADOW, F_SPEC, F_VEIL, F_WHOLE, F_SEL, F_DOTTED, F_NOCASE   the vessel flags
//   LIFT_EASE_MAX, LIFT_EASE_SHARE, LUMEN2, ROW2_BITS, VEIL_K                          shadeGLSL's
//   EDGE        the edge softness's GLSL (edge.js EDGE_GLSL)
//   ENT_W       the entries texture's width
//   N_SAMPLES   the samples a vessel has
//   MAX_TIERS   the tier arrays' length
//   S_OFF       the arc length's offset (packFlow)
//   ALONG_GLSL  the alongAt function (veins-gl.js)
import { shadeGLSL, MP } from './veins-mesh-glsl.js';

export const tubeGlowFS = (K) => {
  const { F_DOTTED, EDGE, ENT_W, N_SAMPLES, MAX_TIERS, S_OFF, ALONG_GLSL } = K;
  const LAST = N_SAMPLES - 1;
  return `#version 300 es
precision highp float;
precision highp int;
in float vI;                           // the sample index along the vessel, interpolated (a segment plus its fraction)
flat in int vRow;                      // the vessel row
in float vD;                           // signed distance from the lumen's wall, world units: negative inside, positive in the glow's skirt
in float vRad;                         // the lumen's radius here, world units
uniform int mPass;                     // the pass (MP_*)
uniform int tierNow;                   // the tier it draws
uniform int tubeKey;                   // 1 in a glow's depth prepass: a lit vessel's own wall keeps its depth there, so no other glow shows inside it
uniform highp sampler2D ent;
uniform highp sampler2D rad;
uniform highp sampler2D tube;
uniform sampler2D organ;               // organ covers (alpha), world space
uniform vec4 organRect;                // world x, y, w, h of the organ texture
uniform int useOrgan;
uniform float organK;                  // how much the organ covers fade the tiers behind them (none in the circuit)
uniform float px;                      // world units per device pixel
uniform vec4 invA;                     // device pixels → world, without the translation (see draw)
uniform vec2 tOff;                     // the translation, whole device pixels
uniform vec2 lOff;                     // the layer's wrap: this pixel's place in the layer minus its place on screen
uniform vec2 sizeF;                    // the layer, device pixels
uniform float reachU;                  // how far from a lumen anything is drawn (world)
uniform vec4 casing;                   // rgb, alpha
uniform vec4 shadow;                   // rgb, alpha
uniform vec4 sheenInk;                 // rgb, alpha
uniform vec4 shadeInk;                 // rgb, alpha
uniform vec4 rimInk;                   // a dark lumen's light rim: rgb, alpha (0 on the light looks)
uniform vec4 paperInk;                 // the figure's ground: rgb, alpha
uniform vec4 ring;                     // selection ring: rgb, alpha
uniform vec2 light;                    // unit direction toward the light (world)
uniform float netAlpha;                // the network group's opacity (dimmed while a vessel is focused)
uniform int fx;                        // 1: shading and shadows (off in the figure view)
uniform float tierAlpha[${MAX_TIERS}];
uniform int tierGroup[${MAX_TIERS}];   // 0 behind the organs, 1 the network, 2 lifted
uniform int redraw;                    // 1: some cells drawn again over the last picture, not cleared first: a pixel left empty is written empty
uniform int tint;                      // 1: a colour-only redraw: only the pixels a lumen colour reaches (depL) are drawn
uniform sampler2D depL;                // the last whole draw's outDep (tint 1 only)
uniform int posBase;                   // the texel of the frame's points in ent
layout(location=0) out vec4 outColor;
layout(location=1) out uvec4 outFlow;  // (a glow has no lumen: zero)
layout(location=2) out uvec4 outFlow2; // (zero)
layout(location=3) out vec4 outDep;    // 1: some vessel's lumen colour reaches this pixel (its lumen, or a glow in its own colour); 0: it does not

const float LAST = ${LAST}.0;
const float S_OFF = ${S_OFF}.0;
vec4 T(int id, int k) { return texelFetch(tube, ivec2(k, id), 0); }
vec2 PT(int id, int i) { int t = posBase + id * ${N_SAMPLES / 2} + (i >> 1); vec4 v = texelFetch(ent, ivec2(t % ${ENT_W}, t / ${ENT_W}), 0); return (i & 1) == 0 ? v.xy : v.zw; }
${ALONG_GLSL}
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }

${shadeGLSL(K)}

void main() {
  // (Only the two glow passes: the shapes and the lift are the lean shader's.)
  if (mPass != ${MP.GLOW} && mPass != ${MP.UP}) discard;
  // A colour-only redraw: a pixel no lumen colour reaches is left as drawn (its colour depends on none of them).
  if (tint == 1 && texelFetch(depL, ivec2(gl_FragCoord.xy), 0).r < 0.5) discard;
  // This pixel's world position, worked out from the pixel itself, as the vessel shader does.
  vec2 q = vec2(gl_FragCoord.x, sizeF.y - gl_FragCoord.y) - lOff - tOff;
  vec2 p = vec2(invA.x * q.x + invA.z * q.y, invA.y * q.x + invA.w * q.y);
  float reach = reachU + 2.0 * px;
  int id = vRow;
  vec4 t2 = T(id, 2), t5 = T(id, 5);
  float u = vI / LAST;
  float R = vRad, D = vD;
  // The row's clip range and dotted rule, as segNear applies them (and tubeLeanFS): a round end where the clip cuts the vessel, the dots of a closed collateral.
  bool dotted = (int(t2.z + 0.5) & ${F_DOTTED}) != 0;
  if (t5.x > 0.0 || t5.y < 1.0) {
    float ext = max(t5.x - u, u - t5.y) * t5.z;
    if (ext > 0.0) D = length(vec2(D + R, ext)) - R;
  }
  if (dotted) {
    float m = mod(u * t5.z, 6.0);
    float along = m < 3.75 ? max(0.0, m - 1.5) : 6.0 - m;
    D = length(vec2(D + R, along)) - R;
  }
  // No vessel in reach of this pixel: it is left empty, written so when the cells are drawn again over the last picture.
  if (D >= reach) {
    if (redraw == 1) { outColor = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u); outDep = vec4(0.0); return; }
    discard;
  }
  float occl = useOrgan == 1 ? texture(organ, (p - organRect.xy) / organRect.zw).a * ${K.VEIL_K} * organK : 0.0;
  float aTier, aZ, aFlag, aWall, aOf, aHov, aSel, aA;
  vec3 aCol, aEdge;
  vesAttrs(id, u, u, p, occl, aTier, aZ, aFlag, aWall, aOf, aCol, aHov, aSel, aEdge, aA);
  // The glow here. No glow colour (the vessel is not lit), or the other pass's vessel (the glow asked to lie on top is drawn in the up pass only), or no amount: nothing.
  vec4 gc, ge;
  float gv = glowAmt(id, D, aWall, u, aA, gc, ge);
  if (gc.a <= 0.0 || (ge.w > 5.0) != (mPass == ${MP.UP})) discard;
  bool inside = D - aWall < 0.0;   // (inside its own wall a lit vessel keeps the pixel and draws no glow there)
  if (!inside && gv <= 0.0) discard;
  // The vessel's tier draws it: another tier's glow is not this pass's.
  vec4 lgm = vec4(0.0);
  bool dep = false;
  if (int(aTier + 0.5) == tierNow && gv > 0.0) {
    lgm = vec4((ge.z > 0.5 ? aCol : gc.rgb) * gv, gv);
    if (ge.z > 0.5) dep = true;
  }
  // (A lumen drawn here has its colour reach the pixel too.)
  if (clamp(0.5 - D / (px * ${EDGE}), 0.0, 1.0) > 0.0) dep = true;
  if (lgm.a <= 0.0 && tubeKey == 1 && inside) { outFlow = uvec4(0u); outFlow2 = uvec4(0u); outColor = vec4(0.0); outDep = vec4(0.0); return; }   // (the depth prepass: inside the lit vessel's own wall the nearest surface, with no colour)
  if (lgm.a <= 0.0) discard;
  if (tierGroup[tierNow] == 1) lgm *= min(1.0 / max(netAlpha, 1e-3), 1.0 / lgm.a);   // (laid with the network, which is faded as a whole)
  outColor = ditherOut(lgm, q); outDep = vec4(dep ? 1.0 : 0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u);
}
`;
};

// ---- the same arithmetic in JS, for one pixel ----
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** glowAmt's arithmetic (veins-mesh-glsl.js), for one pixel. gc, ge: the row's texels 10 and 11 ([r, g, b, a], [x, y, z, w]); d the distance (from the lumen), wall, vAt the soft along (0–1),
 *  Lh the row's length (texel 5 z), aIn the vessel's alpha here. Returns the amount (0 when the vessel is not lit). */
export function glowAmtJS({ d, wall, vAt, Lh = 1, aIn = 1, gc, ge }) {
  if (!(gc[3] > 0)) return 0;
  const e = d - wall, L = Math.max(Lh, 1);
  let ends = (ge[0] > 0 ? smoothstep(0, ge[0], vAt * L) : 1) * (ge[1] > 0 ? smoothstep(0, ge[1], (1 - vAt) * L) : 1);
  if (ge[0] < 0) {
    const x = vAt * L, a = (-ge[0] - 1) * L, b = (-ge[1] - 1) * L, w = Math.min(6, 0.08 * L);
    ends = (a > 0.5 ? smoothstep(a - w, a + w, x) : 1) * (b < L - 0.5 ? 1 - smoothstep(b - w, b + w, x) : 1);
  }
  const up = ge[3] > 5;
  const fall = 1 - smoothstep(0, 12 * clamp(up ? ge[3] - 10 : ge[3], 0.5, 1.3), e);
  return Math.min(0.9, 0.6 * gc[3]) * aIn * smoothstep(-0.6, 0.6, e) * fall * ends;
}

/**
 * main's arithmetic for one pixel. o: { mPass (MP.GLOW | MP.UP), tubeKey (0 | 1), tierNow, D (vD, after the clip and dotted rules), reach, redraw,
 *   attrs { tier, wall, col, alpha }, gc, ge (texels 10 and 11), u (the along, 0–1), Lh, tierGroup (of tierNow), netAlpha, lumen (true when a lumen is drawn at the pixel) }.
 * Returns { kind: 'discard' | 'empty' | 'depth' | 'draw', colour [r, g, b, a] premultiplied (before the dither), dep }.
 *   'depth': the prepass keeps the pixel with no colour (inside a lit vessel's own wall); 'empty': written empty (redraw 1).
 */
export function tubeGlowJS(o) {
  const none = { kind: 'discard', colour: [0, 0, 0, 0], dep: 0 };
  if (o.mPass !== MP.GLOW && o.mPass !== MP.UP) return none;
  const { D, attrs: at, gc, ge } = o;
  if (D >= (o.reach ?? 1e9)) return (o.redraw ?? 0) === 1 ? { kind: 'empty', colour: [0, 0, 0, 0], dep: 0 } : none;
  const gv = glowAmtJS({ d: D, wall: at.wall, vAt: o.u ?? 0, Lh: o.Lh ?? 1, aIn: at.alpha ?? 1, gc, ge });
  if (!(gc[3] > 0) || (ge[3] > 5) !== (o.mPass === MP.UP)) return none;
  const inside = D - at.wall < 0;
  if (!inside && gv <= 0) return none;
  let lgm = [0, 0, 0, 0], dep = 0;
  if (at.tier === o.tierNow && gv > 0) {
    const c = ge[2] > 0.5 ? at.col : gc.slice(0, 3);
    lgm = [c[0] * gv, c[1] * gv, c[2] * gv, gv];
    if (ge[2] > 0.5) dep = 1;
  }
  if (o.lumen) dep = 1;
  if (lgm[3] <= 0 && (o.tubeKey ?? 0) === 1 && inside) return { kind: 'depth', colour: [0, 0, 0, 0], dep: 0 };
  if (lgm[3] <= 0) return none;
  if ((o.tierGroup ?? 0) === 1) {
    const s = Math.min(1 / Math.max(o.netAlpha ?? 1, 1e-3), 1 / lgm[3]);
    lgm = lgm.map((v) => v * s);
  }
  return { kind: 'draw', colour: lgm, dep };
}
