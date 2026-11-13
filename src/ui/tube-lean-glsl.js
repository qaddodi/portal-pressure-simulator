// The Tube's short fragment shader and its depth shader (stage 2, brief S2-B; docs/recommendations/tube-renderer-stage2-3-plan.md).
//
// `tubeLeanFS(K)` is the Tube strip build's fragment shader (vesselFS(true, 1, 1)) for a vessel row seen alone: the same four outputs for the
// same pixel, but the pixel's distance, direction and radius come from the vertex shader's varyings (vD, vG, vRad) in place of segNear's
// search over the vessel's segments, and there is no join, no tier loop and no loop over vessels. It keeps from the shared text, unchanged:
// vesAttrs, glowAmt, the organ veil, the dotted and clip rules, celShade, packFlow, ditherOut, the tier and group alphas, the redraw rule.
// New in it: the open end. A row that ends on another vessel (vEnd) draws no outline inside that vessel's lumen, so a branch in a higher
// tier never draws a ring across the trunk it ends on (this replaces the patch's copy of a lower trunk).
//
// Only shape passes (and the lift) run it; a glow pass stays on the stage 1 program, so this shader discards in one.
//
// K: every constant the text needs, passed by veins-gl.js (thread D):
//   F_DIFFUSE, F_EDGE, F_SHADOW, F_SPEC, F_VEIL, F_WHOLE, F_SEL, F_DOTTED, F_NOCASE   the vessel flags
//   LIFT_EASE_MAX, LIFT_EASE_SHARE, LUMEN2, ROW2_BITS, VEIL_K                          shadeGLSL's
//   EDGE        the edge softness's GLSL (edge.js EDGE_GLSL)
//   ENT_W       the entries texture's width
//   N_SAMPLES   the samples a vessel has
//   MAX_TIERS   the tier arrays' length
//   S_OFF       the arc length's offset (packFlow)
//   ALONG_GLSL  the alongAt function (veins-gl.js)
import { shadeGLSL, MP } from './veins-mesh-glsl.js';
import { celGLSL, celShadeJS, CEL } from './tube-cel-glsl.js';
import { tubeJoinFS, joinRampGLSL, joinToneJS, JOIN_IN_GLSL, JOIN_F_NOFADE, END_BASE, END_SEGS, trunkGapJS } from './tube-join-glsl.js';
export { END_SEGS, trunkGapJS };

/** The depth prepass for plain rows: no outputs, no work; drawn with the colour masked off. */
export const TUBE_DEPTH_FS = `#version 300 es
precision highp float;
void main() {}
`;


/**
 * The depth prepass for a row that is exact only because it has a join end (tube-data.js kind 4: not dotted, not clipped): the empty shader's keep-everything plus the
 * join's drop, from the same joinEnd text as tubeLeanFS, so the prepass and the colour pass cannot disagree on which pixels are the other row's. No attributes, no
 * shading, no reads: it works out the pixel's world position as the lean shader does and calls joinEnd on the flat data.
 */
export const tubeJoinDepthFS = (N_SAMPLES) => `#version 300 es
precision highp float;
precision highp int;
in float vI;
in float vRad;
${JOIN_IN_GLSL}
uniform float px;
uniform vec4 invA;
uniform vec2 tOff;
uniform vec2 lOff;
uniform vec2 sizeF;
${tubeJoinFS(N_SAMPLES)}
void main() {
  vec2 q = vec2(gl_FragCoord.x, sizeF.y - gl_FragCoord.y) - lOff - tOff;
  vec2 p = vec2(invA.x * q.x + invA.z * q.y, invA.y * q.x + invA.w * q.y);
  if (joinEnd(vI, vJ0, vJ1, vJK, vC0, vC1, p, vRad, px).drop) discard;
}
`;

/**
 * The outline's opening at a branch's mouth (GLSL, needs PT, the `rad` texture, vMouthA and vMouthB, N_SAMPLES 64). A mouth code (tube-data.js mouthCode) names a branch row and which end
 * of it lies on this row's side. The branch's lumen runs from its end point E along d (toward its inside: the point 4 samples in) with the radius rb there: a pixel p of this row's
 * outline that lies within rb of that line, from a little behind E out to this row's radius plus 2.5 rb (the near wall, not the far one), has the branch over it, and keeps no wall
 * line. Returns 0 (keep) to 1 (open), soft over a device pixel at the branch's own wall so the two outlines meet.
 */
export const MOUTH_OPEN_GLSL = `float mouthOpen(vec2 p, float R, float px) {
  float m[8] = float[8](vMouthA.x, vMouthA.y, vMouthA.z, vMouthA.w, vMouthB.x, vMouthB.y, vMouthB.z, vMouthB.w);
  float open = 0.0;
  for (int k = 0; k < 8; k++) {
    if (m[k] < 1.5) continue;
    int ci = int(m[k] + 0.5) - 2, row = ci >> 1, s0 = (ci & 1) == 1 ? 63 : 0, s1 = (ci & 1) == 1 ? 59 : 4;
    vec2 E = PT(row, s0), d = PT(row, s1) - E;
    float dl = length(d);
    if (dl < 1e-4) continue;
    d /= dl;
    float rb = max(texelFetch(rad, ivec2(s1, row), 0).r, 0.3);
    vec2 v = p - E;
    float s = dot(v, d), perp = abs(v.x * d.y - v.y * d.x);
    float w = 1.0 - smoothstep(rb - px, rb + px, perp);
    float a = smoothstep(-0.35 * rb - px, -0.35 * rb + px, s) * (1.0 - smoothstep(R + 2.5 * rb, R + 3.5 * rb, s));
    open = max(open, w * a);
  }
  return open;
}`;

export const tubeLeanFS = (K) => {
  const { F_SEL, F_DOTTED, F_NOCASE, F_SHADOW, EDGE, ENT_W, N_SAMPLES, MAX_TIERS, S_OFF, ALONG_GLSL } = K;
  if (N_SAMPLES !== END_BASE) throw new Error('tube-lean-glsl: vEnd packs the trunk row as row * 64 + sample, so N_SAMPLES must be 64');
  const LAST = N_SAMPLES - 1;
  return `#version 300 es
precision highp float;
precision highp int;
in float vI;                           // the sample index along the vessel, interpolated (a segment plus its fraction)
flat in int vRow;                      // the vessel row
in float vD;                           // signed distance from the lumen's wall, world units: negative inside, positive in the outline's skirt
in vec2 vG;                            // direction from the centreline to this point (not unit; (0, 0) on the centreline)
in float vRad;                         // the lumen's radius here, world units
${JOIN_IN_GLSL}
flat in vec4 vMouthA;                  // the branches that end on this row's side (tube-data.js mouthCode): its outline is left open across them
flat in vec4 vMouthB;
uniform int mPass;                     // the pass (MP_*)
uniform int tierNow;                   // the tier it draws
uniform int isWeb;                     // 0 a strip; 1 a web: drawn in the higher of its two members' tiers, carrying its owner's row (often in the lower tier)
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
uniform int posBase;                   // the texel of the frame's points in ent: N_SAMPLES / 2 texels a vessel row, two points a texel
layout(location=0) out vec4 outColor;
layout(location=1) out uvec4 outFlow;  // the lumen in front: vessel row + 1, 16 × (arc length + S_OFF), across (0–65535), visibility
layout(location=2) out uvec4 outFlow2; // the second lumen (a strip has none: zero)
layout(location=3) out vec4 outDep;    // 1: some vessel's lumen colour reaches this pixel (its lumen, or a glow in its own colour); 0: it does not

const float LAST = ${LAST}.0;
const float S_OFF = ${S_OFF}.0;
vec4 T(int id, int k) { return texelFetch(tube, ivec2(k, id), 0); }
vec2 PT(int id, int i) { int t = posBase + id * ${N_SAMPLES / 2} + (i >> 1); vec4 v = texelFetch(ent, ivec2(t % ${ENT_W}, t / ${ENT_W}), 0); return (i & 1) == 0 ? v.xy : v.zw; }
${ALONG_GLSL}
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }

${shadeGLSL(K)}
${celGLSL(K)}

${tubeJoinFS(N_SAMPLES)}
${joinRampGLSL(K.VEIL_K)}
${MOUTH_OPEN_GLSL}
void main() {
  // (Only the shape and its lift: a glow pass stays on the stage 1 program.)
  if (mPass < ${MP.SHAPE_K} || mPass > ${MP.LIFT}) discard;
  // A colour-only redraw: a pixel no lumen colour reaches is left as drawn (its colour depends on none of them).
  if (tint == 1 && texelFetch(depL, ivec2(gl_FragCoord.xy), 0).r < 0.5) discard;
  // This pixel's world position, worked out from the pixel itself, as the vessel shader does.
  vec2 q = vec2(gl_FragCoord.x, sizeF.y - gl_FragCoord.y) - lOff - tOff;
  vec2 p = vec2(invA.x * q.x + invA.z * q.y, invA.y * q.x + invA.w * q.y);
  float reach = reachU + 2.0 * px;
  int id = vRow;
  vec4 t2 = T(id, 2), t5 = T(id, 5);
  float u = vI / LAST;                 // (how far along, 0–1: the nearest segment's index plus the fraction, over LAST)
  float R = vRad, D = vD;
  // The row's flags, clip range and dotted rule, as segNear applies them: the distance is to the vessel's drawn stretch (a round end where the
  // clip cuts it) and, for a closed potential collateral, to its dots (1.5 long every 6 units).
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
  // A row's end on another row (tube-join-glsl.js): a pixel inside the trunk the row ends on, or beyond a continuation's bisector plane, is the other row's.
  JoinEnd je = joinEnd(vI, vJ0, vJ1, vJK, vC0, vC1, p, R, px);
  // (A cut end's outline lying inside the trunk's wall is the trunk's: dropped, so it leaves no dotted hairline in the mouth, 13 Nov 2026.)
  if (D > 0.0 && je.gp < 0.0) je.drop = true;
  if (je.drop) {
    if (redraw == 1) { outColor = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u); outDep = vec4(0.0); return; }
    discard;
  }
  // Nothing to draw here: settled now, as the vessel shader settles it (no lit vessel's glow in reach, the outline far off).
  if (!(T(id, 10).a > 0.0 && D - T(id, 0).w < 15.7) && D > 8.01 + 2.0 * px) {
    if (redraw == 1) { outColor = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u); outDep = vec4(0.0); return; }
    discard;
  }
  // The vessel's attributes here (its tier, flags, wall, colour along it, hover, selection, own edge colour, alpha with the fades and the veil).
  float occl = useOrgan == 1 ? texture(organ, (p - organRect.xy) / organRect.zw).a * ${K.VEIL_K} * organK : 0.0;
  float aTier, aZ, aFlag, aWall, aOf, aHov, aSel, aA;
  vec3 aCol, aEdge;
  vesAttrs(id, u, u, p, occl, aTier, aZ, aFlag, aWall, aOf, aCol, aHov, aSel, aEdge, aA);
  aCol = mix(aCol, je.col, je.wc);   // (a cut end and a continuation take on the other row's colour near the join)
  // (A web is drawn in tierNow, whichever tier its owner's row is in: its colour and the row's own opacity are the owner's, its tier alpha and group the tier it is drawn in.)
  int ti = int(aTier + 0.5);
  if (ti != tierNow && isWeb == 0) discard;
  int tt = ti;   // (a web carries its owner's tier alpha and group too, as the lumen layer's shader gives it: a web beside a faded trunk is as faded as the trunk, 61523a4)
  int grp = tierGroup[tt];
  // Whether a lumen colour reaches this pixel: through a lumen drawn here (aL > 0) or a glow in its own colour.
  bool dep = false;
  vec4 gc, ge;
  float gv = glowAmt(id, D, aWall, u, aA, gc, ge);
  if (gc.a > 0.0 && gv > 0.0 && ge.z > 0.5) dep = true;
  if (D > 8.0 + 2.0 * px) discard;
  int flags = int(aFlag + 0.5);
  bool sel = (flags & ${F_SEL}) != 0;
  float cA = (flags & ${F_NOCASE}) != 0 ? 0.0 : (flags & ${F_DOTTED}) != 0 ? 0.35 : 1.0;
  // (Where a branch joins this row's side its wall line is left open across the branch's width: the line under the branch's faded end showed through it as a seam, tube-data.js mouthCode.)
  if (D > -2.0 * px && vMouthA.x + vMouthA.y + vMouthA.z + vMouthA.w + vMouthB.x + vMouthB.y + vMouthB.z + vMouthB.w > 1.5) cA *= 1.0 - mouthOpen(p, R, px);
  vec2 g = joinTone(length(vG) > 1e-5 ? normalize(vG) : vec2(0.0), je, clamp((R + D) / max(R, 1e-3), 0.0, 1.0));   // (one tone field over a join: tube-join-glsl.js)
  float aa = px * ${EDGE};
  float aL = clamp(0.5 - D / aa, 0.0, 1.0);
  if (aL > 0.0) dep = true;
  vec4 c = celShade(D, D, R, aWall, aCol, g, flags & ~${F_SHADOW}, sel, cA, grp, id, u, aHov, aEdge, 0.0, 0.0, aa, aL);
  c *= aA * tierAlpha[tt];
  float wsel = grp == 1 ? aSel : 0.0;   // (the network's vessels are faded as a group: the selected one's own share is laid on top)
  float gf = grp == 0 ? 1.0 - occl * aOf : grp == 1 ? mix(netAlpha, 1.0, wsel) : 1.0;
  float lumA = aL * aA * tierAlpha[tt] * gf;
  // (A continuation eases its opacity to its partner's tier's over the last JOIN_RAMP_R radii when the partner is the fainter, so the two tiers meet without a step.)
  float jr = (flags & ${JOIN_F_NOFADE}) != 0 ? 1.0 : joinRamp(je, aA * tierAlpha[tt] * gf, occl);   // (a continuation eases its opacity to its partner's: tube-join-glsl.js)
  lumA *= je.fl * jr;   // (a branch fading into its trunk: tube-join-glsl.js)
  bool lum = lumA > 0.02 && !dotted;
  // The stream shown here: this lumen, with its place along and across for the compositor's blood.
  uint gId = 0u;
  float gS = 0.0, gY = 0.0, gW = 0.0;
  // (A web carries no stream: its vertices hold one place along its owner, vI, so every pixel of it would show the owner's blood and heads at that one place, whatever its own: a head of the trunk passing a branch mouth drew its black core and light rim as slices across the corner fillet, 14 Nov 2026.)
  if (lum && isWeb == 0) {
    vec2 a = PT(id, clamp(int(vI), 0, ${N_SAMPLES - 2})), ba = PT(id, clamp(int(vI), 0, ${N_SAMPLES - 2}) + 1) - a;
    float across = (ba.x * (p - a).y - ba.y * (p - a).x) * inversesqrt(max(dot(ba, ba), 1e-8));
    gId = uint(id + 1); gS = u * t5.z; gY = clamp(across / max(R, 1e-3), -1.0, 1.0); gW = lumA * smoothstep(0.5, 0.9, je.fl);   // (a branch fading into its trunk hands its blood and heads over to the trunk's before it is half gone: no stray head on the ghost of its end)
  }
  if (grp == 0) c *= 1.0 - occl * aOf;
  c *= mix(je.fo, je.fl, aL) * jr;   // (the lumen's share fades with the branch, the outline's faster)
  // (The lift: the selected vessel's own share, laid over the network.)
  if (mPass == ${MP.LIFT}) {
    vec4 lc = c * wsel;
    if (lc.a < 0.002) discard;
    outColor = ditherOut(lc, q); outDep = vec4(0.0); outFlow = uvec4(0u); outFlow2 = uvec4(0u);
    return;
  }
  // (The shape: a pixel it leaves clear is left as it is; one it covers outside a lumen hides the stream under it.)
  if (!lum && c.a < 0.002) discard;
  outColor = ditherOut(c, q);
  outDep = vec4(dep ? 1.0 : 0.0);
  bool mfl = gId > 0u && gW > 0.01;
  outFlow = mfl ? packFlow(gId, 0u, gS, gY, gW, 0.0) : uvec4(0u);
  outFlow2 = uvec4(0u);
}
`;
};

// ---- the same arithmetic in JS, for one pixel ----

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const mix = (a, b, t) => a * (1 - t) + b * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** The distance past the wall after the row's clip and dotted rules (the GLSL's two blocks before the reach test). o: { D (vD), R (vRad), u (vI / LAST), clip [from, to, length], dotted }. */
export function leanDistanceJS(o) {
  const { R, u, clip = [0, 1, 1], dotted = false } = o;
  let D = o.D;
  if (clip[0] > 0 || clip[1] < 1) {
    const ext = Math.max(clip[0] - u, u - clip[1]) * clip[2];
    if (ext > 0) D = Math.hypot(D + R, ext) - R;
  }
  if (dotted) {
    const m = (((u * clip[2]) % 6) + 6) % 6, along = m < 3.75 ? Math.max(0, m - 1.5) : 6 - m;
    D = Math.hypot(D + R, along) - R;
  }
  return D;
}

/**
 * main's arithmetic for one pixel. o carries what the varyings and the row give, and the row's attributes as vesAttrs returns them:
 *   D (vD), R (vRad), g (vG, not unit), u (vI / LAST), clip [from, to, length], dotted, join { drop, fl, fo, wc, col } or null (a row's end on
 *   another row: tube-join-glsl.js joinEndJS), attrs { tier, flags, wall, col, alpha, hov, sel, edge, of }, tierNow, tierAlpha, grp, netAlpha,
 *   occl, and what celShadeJS takes (px, aa as px * EDGE, light, fx, casing, ring, rimInk, paperInk, F_DIFFUSE, F_EDGE, F_VEIL, F_SEL, F_DOTTED, F_NOCASE),
 *   redraw, reach, lift, isWeb (true for the web program: the row may be in another tier than tierNow; `grp` and `tierAlpha` are those of the row's own tier, the web's owner, as in the lumen layer).
 * Returns { kind: 'discard' | 'empty' | 'draw', colour [r, g, b, a] premultiplied, flow { id, s, y, w } or null, dep }.
 */
export function tubeLeanJS(o) {
  const { px, F_SEL, F_DOTTED, F_NOCASE, attrs: at } = o;
  const redraw = o.redraw ?? 0, reach = o.reach ?? 1e9, clip = o.clip ?? [0, 1, 1];
  const none = redraw === 1 ? { kind: 'empty', colour: [0, 0, 0, 0], flow: null, dep: 0 } : { kind: 'discard', colour: [0, 0, 0, 0], flow: null, dep: 0 };
  const D = leanDistanceJS({ D: o.D, R: o.R, u: o.u, clip, dotted: !!(at.flags & F_DOTTED) });
  if (D >= reach) return none;
  // (A row's end on another row: `join` is joinEndJS's { drop, fl, fo, wc, col }: the factors on the lumen and the outline of a branch fading into its trunk, and the share wc of the other row's colour col; a dropped pixel is the other row's.)
  const jn = o.join ?? null;
  if (jn && jn.drop) return none;
  if (!(o.lit && D - at.wall < 15.7) && D > 8.01 + 2 * px) return none;
  if (at.tier !== o.tierNow && !o.isWeb) return { kind: 'discard', colour: [0, 0, 0, 0], flow: null, dep: 0 };
  if (D > 8 + 2 * px) return { kind: 'discard', colour: [0, 0, 0, 0], flow: null, dep: 0 };
  const flags = at.flags, grp = o.grp ?? 1, dotted = (flags & F_DOTTED) !== 0;
  const cA = (flags & F_NOCASE) !== 0 ? 0 : dotted ? 0.35 : 1;
  const gl = Math.hypot(o.g[0], o.g[1]), g0 = gl > 1e-5 ? [o.g[0] / gl, o.g[1] / gl] : [0, 0], g = jn ? joinToneJS(g0, jn, clamp((o.R + D) / Math.max(o.R, 1e-3), 0, 1)) : g0;   // (one tone field over a join)
  const aa = o.aa;
  const aL = clamp(0.5 - D / aa, 0, 1);
  const dep = aL > 0 || !!o.glowOwn ? 1 : 0;
  const cel = celShadeJS({ ...o, D, g, R: o.R, col: jn && jn.wc > 0 ? at.col.map((v, i) => mix(v, jn.col[i], jn.wc)) : at.col, flags, sel: (flags & F_SEL) !== 0, cA, grp, vAt: o.u, hov: at.hov ?? 0, edge: at.edge ?? [0, 0, 0], kn: 0, kcas: 0, aa, aL });
  const tierA = o.tierAlpha ?? 1, scale = at.alpha * tierA;
  let c = cel.map((v) => v * scale);
  const wsel = grp === 1 ? (at.sel ?? 0) : 0;
  const netAlpha = o.netAlpha ?? 1, occl = o.occl ?? 0, of = at.of ?? 1;
  const gf = grp === 0 ? 1 - occl * of : grp === 1 ? mix(netAlpha, 1, wsel) : 1;
  let lumA = aL * at.alpha * tierA * gf;
  const fl = jn ? jn.fl : 1, fo = jn ? jn.fo : 1;
  const jr = jn && jn.pt >= 0 ? mix(1, Math.min(1, (o.partnerAlpha ?? tierA) / Math.max(tierA, 1e-3)), jn.rs) : 1;   // (o.partnerAlpha: the partner's tier alpha)
  lumA *= fl * jr;
  const lum = lumA > 0.02 && !dotted;
  if (grp === 0) c = c.map((v) => v * (1 - occl * of));
  c = c.map((v) => v * mix(fo, fl, aL) * jr);
  if (o.lift) {
    const lc = c.map((v) => v * wsel);
    return lc[3] < 0.002 ? { kind: 'discard', colour: [0, 0, 0, 0], flow: null, dep: 0 } : { kind: 'draw', colour: lc, flow: null, dep: 0 };
  }
  if (!lum && c[3] < 0.002) return { kind: 'discard', colour: [0, 0, 0, 0], flow: null, dep: 0 };
  let flow = null;
  if (lum && !o.isWeb && lumA * smooth(0.5, 0.9, fl) > 0.01) flow = { id: o.row ?? 0, s: o.u * clip[2], w: lumA * smooth(0.5, 0.9, fl) };
  return { kind: 'draw', colour: c, flow, dep };
}

/**
 * mouthOpen in JS, for one pixel. p [x, y] the pixel, R this row's radius there, px the world size of a device pixel; mouths [{ E [x, y], d [x, y] (unit, along the branch toward its inside), rb (its radius) }].
 * Returns 0 (the outline stays) to 1 (open).
 */
export function mouthOpenJS(p, R, px, mouths) {
  let open = 0;
  for (const m of mouths) {
    const vx = p[0] - m.E[0], vy = p[1] - m.E[1], s = vx * m.d[0] + vy * m.d[1], perp = Math.abs(vx * m.d[1] - vy * m.d[0]), rb = Math.max(m.rb, 0.3);
    const w = 1 - smooth(rb - px, rb + px, perp);
    const a = smooth(-0.35 * rb - px, -0.35 * rb + px, s) * (1 - smooth(R + 2.5 * rb, R + 3.5 * rb, s));
    open = Math.max(open, w * a);
  }
  return open;
}

export { CEL };
