// The Tube's lumen shader (stage 3, brief S3-C; docs/recommendations/tube-renderer-stage2-3-plan.md, "Stage 3 in detail").
//
// `tubeLumenFS(K)` is a whole fragment shader that draws a lumen's blood where the compositor's lumen section did: the compositor reads a
// pixel's row, arc length and across from the vessel layer's flow target (`gbuf`) and then works `col` through the origin tint, the blood,
// the lymph dashes, the casts and the dye. Here the tube's own vertex shader has the same three numbers in its varyings, so this shader
// works them out for the pixel and runs THE SAME TEXT on `col` (comp-glsl.js, shared with COMP_FS: compLumenFns()), in the same order, with
// the same arguments. It writes the lumen's final colour premultiplied by its coverage and the vessel's opacity into the lumen layer
// (RGBA8); the compositor's Tube build mixes that layer in (brief S3-X), so nothing reads a flow target per pixel per frame any more.
//
// WHAT IS DIFFERENT FROM THE COMPOSITOR'S SECTION (on purpose, each said once):
//   * `vis` is 1: the lumen's edge coverage is in the output's alpha, not a factor on the blood (the compositor divides it by the vessel
//     pixel's alpha and uses it as the blood's strength; here the mix of the layer does that).
//   * no second lumen (b = 0, rel = 0, mn = 0: the Tube has none), no half-size streak pass, no arrowheads (their quads draw them).
//   * `col` is the vessel's own colour here (vesAttrs: along its course, a recoloured stretch), not the shaded pixel of the vessel layer.
//   * the clip range and the dotted rule are the lean shader's (a vessel drawing on has its round end; a dotted collateral has no lumen).
//
// WHERE THE THREE NUMBERS COME FROM (the twin is tubeLumenJS below):
//   row     vRow
//   arc s   vI / 63 * (the row's length, tube texel 5 z): packFlow's gS = u * length, with u the place along the course
//   across  the offset vG from the centreline point, taken against the segment's normal and signed as the vessel shader signs it
//           (bx = cross(ba, p - a) / |ba|, which is cross(ba, vG) / |ba| because p - a differs from vG by a multiple of ba), over the
//           row's radius here, clamped to -1..1: packFlow's gY. The radius is radAt(id, s, len), what the compositor hands bloodAt; for a
//           strip it is vRad (both are the rad texels' radius, floored at 0.3).
//
// A WEB (S2-J: a fan filling the concave corner of a join): the brief expected its pixels to lie beyond the member's wall in across, but a web's
// vG is not an offset from a centreline (it is the direction toward the fillet's centre, one unit long, tube-joint.js), so across / radius would
// come out small and put a streak in the corner. A web is told by its vRad, which the contract makes 4 x its larger member's radius (a strip's
// vRad is the radius radAt gives, to the float): vRad more than twice radAt's radius says "web", and its across is the wall (+1). bloodAt's wall
// term `1 - smoothstep(0.7, 1.0, |y|)` is then 0, the glow along the axis (`glowCore * wall`) is 0 with it, so its alpha is 0 and a web's pixel
// comes out the plain lumen colour, with the origin tint and the dye (which have no wall term) as the lumen beside it has.
//
// K: the constants tubeLeanFS takes (veins-gl.js passes the same object): the vessel flags, LIFT_EASE_MAX, LIFT_EASE_SHARE, LUMEN2,
// ROW2_BITS, VEIL_K, EDGE (the edge softness's GLSL), ENT_W, N_SAMPLES (64), MAX_TIERS; K.PLAIN 1 for a build with no dye or origin colours.
// Uniforms: those compLumenUniforms() declares (the compositor's names, so the Tube feeds them as it feeds the compositor), `blood`,
// `blendA` and `flowA` (the compositor's switches this section reads), and for the row's colour and opacity those tubeLeanFS declares
// (ent, organ, organRect, useOrgan, organK, invA, tOff, lOff, sizeF, netAlpha, tierAlpha, tierGroup, posBase). `tube` and `rad` come with
// compLumenUniforms. The world size of a device pixel is pxW (the compositor's), not lean's `px`: the feed is the same number.
import { shadeGLSL } from './veins-mesh-glsl.js';
import { TROUBLE_GLSL } from './blood-trouble.js';
import { compLumenUniforms, compLumenFns, N_SAMPLES as COMP_N, S_OFF } from './comp-glsl.js';
import { tubeJoinFS, joinRampGLSL, JOIN_IN_GLSL } from './tube-join-glsl.js';
import { celToneGLSL } from './tube-cel-glsl.js';

/** The text of one top-level function in `text`: from its signature to its closing brace. */
function fnText(text, head) {
  const at = text.indexOf(head);
  if (at < 0) throw new Error(`tube-lumen-glsl: ${head} is not in the shared shading text`);
  let i = text.indexOf('{', at), depth = 0;
  for (; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(at, i + 1);
  }
  throw new Error(`tube-lumen-glsl: ${head} has no closing brace`);
}

const f = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
/**
 * The lymph streaks' look (lobule). Mohammad, 10 Nov: with a tint close to the channel's and a glow along its axis the streaks were "barely there, just
 * yellow". So the streaks are chosen for VALUE contrast against the channel, not only hue: a dark ink on a light channel and a light ink on a dark one
 * (told by the channel's own luma), the blood's axis glow is taken out (a streak only, no wash), and the gaps between streaks keep the channel's own colour.
 * The ink runs from a cool, pale-protein tone at 0 % protein to albumin amber at 100 %.
 */
export const LYMPH_INK = {
  onLight: { low: [0.16, 0.30, 0.24], high: [0.52, 0.26, 0.0] },     // the ink on a light channel: deep blue-green at 0 %, dark amber-brown at 100 %
  onDark: { low: [0.82, 0.96, 0.96], high: [1.0, 0.84, 0.32] },      // the ink on a dark channel: pale cyan at 0 %, bright gold at 100 %
  luma: [0.45, 0.6],     // the channel's luma (of vc): under the first it is dark (light ink), over the second light (dark ink), eased between
  ramp: [0.1, 0.9],      // protein 0 … 1 (lyProt 0.42 … 0.84): the low ink below the first, the high above the second
  occ: [0.5, 0.75],      // the share of a lane the streaks fill, poor to rich: the gaps between them show the channel
  faint: 0.8,            // the streaks' strength at 0 % protein (1 at 100 %)
  gain: 3.4, cap: 0.97,  // bloodAt's streak alpha (its glow taken out) times this, at most cap
  glow: 0.22,            // bloodAt's glow along the axis (glowCore), taken out
  look: 36,              // the speed the streaks' LOOK (length, thickness) is worked at, the healthy trunk's: the lymph's own speed only moves them
};

/** A pixel is a web's when its vRad is more than this many times radAt's radius for its row (a web's is 4; a strip's is 1). */
export const WEB_RATIO = 2;

/** The lumen layer's own lower bound for a pixel to be drawn at all: lean's `lum` threshold (a lumen fainter than this wrote no stream). */
export const LUM_MIN = 0.02;

export const tubeLumenFS = (K) => {
  const { F_DOTTED, EDGE, ENT_W, N_SAMPLES, MAX_TIERS } = K;
  if (N_SAMPLES !== COMP_N) throw new Error('tube-lumen-glsl: the arc length is packed over 64 samples, so N_SAMPLES must be 64');
  const LAST = N_SAMPLES - 1;
  // (vesAttrs and ditherOut from the vessel shader's own text: imported, not copied; the rest of that text needs uniforms this shader does not read.)
  const shade = shadeGLSL(K);
  return `#version 300 es
precision highp float;
precision highp int;
#define PLAIN ${K.PLAIN ? 1 : 0}
in float vI;                           // the sample index along the vessel, interpolated (a segment plus its fraction)
flat in int vRow;                      // the vessel row
in float vD;                           // signed distance from the lumen's wall, world units: negative inside, positive in the outline's skirt
in vec2 vG;                            // offset from the centreline point to this point (world units; (0, 0) on the centreline)
in float vRad;                         // the lumen's radius here, world units (a web: 4 x its larger member's radius)
${JOIN_IN_GLSL}
${compLumenUniforms()}
uniform int fx;                        // 1: shading (off in the figure view): the cel tones below
uniform int blood;                     // 1: draw the blood
uniform vec3 blendA;                   // 0..1 each: the streaks, the chevrons and the origin colours fading in or out (switched on or off)
uniform float flowA;                   // 0..1: how visible the moving blood is (it fades in once the view is still)
uniform int still;                     // 1: reduced motion (blood-trouble.js freezes its swirl)
uniform highp sampler2D ent;
uniform sampler2D organ;               // organ covers (alpha), world space
uniform vec4 organRect;                // world x, y, w, h of the organ texture
uniform int useOrgan;
uniform float organK;                  // how much the organ covers fade the tiers behind them (none in the circuit)
uniform vec4 invA;                     // device pixels → world, without the translation (see draw)
uniform vec2 tOff;                     // the translation, whole device pixels
uniform vec2 lOff;                     // the layer's wrap: this pixel's place in the layer minus its place on screen
uniform vec2 sizeF;                    // the layer, device pixels
uniform float netAlpha;                // the network group's opacity (dimmed while a vessel is focused)
uniform float tierAlpha[${MAX_TIERS}];
uniform int tierGroup[${MAX_TIERS}];   // 0 behind the organs, 1 the network, 2 lifted
uniform int posBase;                   // the texel of the frame's points in ent: N_SAMPLES / 2 texels a vessel row, two points a texel
out vec4 outColor;                     // the lumen's colour × its coverage × the vessel's opacity (premultiplied)

const float LAST = ${LAST}.0;
vec4 T(int id, int k) { return texelFetch(tube, ivec2(k, id), 0); }
vec2 PT(int id, int i) { int t = posBase + id * ${N_SAMPLES / 2} + (i >> 1); vec4 v = texelFetch(ent, ivec2(t % ${ENT_W}, t / ${ENT_W}), 0); return (i & 1) == 0 ? v.xy : v.zw; }
// (alongAt, radAt, the noise styles, bloodAt, castAt, lymphAt, originAt, the dye: the compositor's own text, compLumenFns.)
${compLumenFns()}

${TROUBLE_GLSL}

${fnText(shade, 'void vesAttrs(')}

${fnText(shade, 'vec4 ditherOut(')}

// A vessel seen end-on (the lobule's portal venule, arteriole and central vein: a disc) has no across to lay streams side by side over, so its blood is
// a pie: wedges in originAt's order (SMV, IMV, splenic vein, hepatic artery, the rest) from twelve o'clock, clockwise, each as wide as its share. Such a row
// says so in flow texel 7: z = -2 (no blend is ever below 0) and xy = the disc's centre (world; lobule-zoom.js putOrigin). originAt is given the angle as its
// across (u = angle / 2 pi) and a radius that makes its edge as soft as a pixel at this pixel's distance from the centre; the seam at twelve o'clock mixes
// the last wedge into the first. (Tube only: the Classic and Mesh compositors keep their text, byte for byte.)
vec3 originHere(int id, float s, float y, float R, vec2 w) {
  if (texelFetch(flow, ivec2(7, id), 0).z > -1.5) return originAt(id, s, y, R);
  vec2 d = w - texelFetch(flow, ivec2(7, id), 0).xy;
  float u = fract(atan(d.x, -d.y) * 0.15915494 + 1.0);
  float e = clamp(0.6 * pxW / (max(length(d), 3.0 * pxW) * 6.2831853), 0.01, 0.08);
  float Re = 0.6 * pxW / e;
  vec3 c = originAt(id, s, u * 2.0 - 1.0, Re);
  vec3 other = originAt(id, s, (u < 0.5 ? 0.9999 : 0.0001) * 2.0 - 1.0, Re);
  return mix(c, other, 0.5 * (1.0 - smoothstep(0.0, e, u < 0.5 ? u : 1.0 - u)));
}

${tubeJoinFS(N_SAMPLES)}
${joinRampGLSL(K.VEIL_K)}

// (The cel tones of the vessel layer's fill, tube-cel-glsl.js: this layer's colour replaces the fill's, so the tones are laid on it, over the blood.)
${celToneGLSL()}

void main() {
  int id = vRow;
  vec4 t2 = T(id, 2), t5 = T(id, 5);
  int flags = int(t2.z + 0.5);
  // A closed potential collateral (dotted) shows no stream: the vessel shader writes none for it.
  if ((flags & ${F_DOTTED}) != 0) discard;
  float u = vI / LAST;                 // (how far along, 0–1)
  float R = vRad, D = vD;
  // The row's clip range, as segNear applies it (a vessel drawing on has a round end where the clip cuts it).
  if (t5.x > 0.0 || t5.y < 1.0) {
    float ext = max(t5.x - u, u - t5.y) * t5.z;
    if (ext > 0.0) D = length(vec2(D + R, ext)) - R;
  }
  // The lumen only, soft at its wall as the vessel layer's lumen is.
  float aa = pxW * ${EDGE};
  float aL = clamp(0.5 - D / aa, 0.0, 1.0);
  if (aL <= 0.0) discard;
  // This pixel's world position, worked out from the pixel itself, as the vessel shader does.
  vec2 q = vec2(gl_FragCoord.x, sizeF.y - gl_FragCoord.y) - lOff - tOff;
  vec2 p = vec2(invA.x * q.x + invA.z * q.y, invA.y * q.x + invA.w * q.y);
  // A row's end on another row (tube-join-glsl.js): the other row's pixels are dropped here as in tubeLeanFS, so this layer and the vessel layer agree.
  JoinEnd je = joinEnd(vI, vJ0, vJ1, vJK, vC0, vC1, p, R, pxW);
  if (je.drop) discard;
  // The vessel's colour and opacity here, as tubeLeanFS gets them (its tier, flags, colour along it, alpha with the fades and the veil).
  float occl = useOrgan == 1 ? texture(organ, (p - organRect.xy) / organRect.zw).a * ${K.VEIL_K} * organK : 0.0;
  float aTier, aZ, aFlag, aWall, aOf, aHov, aSel, aA;
  vec3 aCol, aEdge;
  vesAttrs(id, u, u, p, occl, aTier, aZ, aFlag, aWall, aOf, aCol, aHov, aSel, aEdge, aA);
  aCol = mix(aCol, je.col, je.wc);   // (as tubeLeanFS: the colour blends into the other row's near a join)
  int ti = int(aTier + 0.5);
  int grp = tierGroup[ti];
  float wsel = grp == 1 ? aSel : 0.0;   // (the network's vessels are faded as a group: the selected one's own share is laid on top)
  float gf = grp == 0 ? 1.0 - occl * aOf : grp == 1 ? mix(netAlpha, 1.0, wsel) : 1.0;
  float lumA = aL * aA * tierAlpha[ti] * gf;
  float jr = joinRamp(je, aA * tierAlpha[ti] * gf, occl);   // (a continuation eases its opacity to its partner's: tube-join-glsl.js)
  lumA *= je.fl * jr;   // (a branch fading into its trunk, as tubeLeanFS has it)
  if (lumA <= ${LUM_MIN}) discard;
  // The place in the stream, as packFlow would have stored it and the compositor unpacked it: the arc length and the across.
  int sg = clamp(int(vI), 0, ${N_SAMPLES - 2});
  vec2 sa = PT(id, sg), ba = PT(id, sg + 1) - sa;
  float across = (ba.x * vG.y - ba.y * vG.x) * inversesqrt(max(dot(ba, ba), 1e-8));
  float s1 = u * t5.z;
  float len1 = max(t5.z, 1.0);
  float R1 = radAt(id, s1, len1);
  bool web = vRad > ${WEB_RATIO}.0 * R1;   // (a web: its vRad is 4 x a radius; see the header)
  float y1 = web ? 1.0 : clamp(across / R1, -1.0, 1.0);
  int id1 = id;

  // ---- the compositor's lumen section from here (COMP_FS main), for one lumen pixel with no second lumen ----
  vec3 col = aCol;
  float vis = 1.0;
  if (origin == 1) {
    // The lumen is drawn a neutral grey; its light and dark lines are kept as a ratio of that grey.
    float shade = clamp(dot(col, vec3(0.299, 0.587, 0.114)) / ORIGIN_GREY, 0.55, 1.45);
    // A vessel that carries no blood (origin fractions marked −1, e.g. a lymphatic) keeps its own color.
    vec3 oc = texelFetch(flow, ivec2(2, id1), 0).x < -0.5 ? col : min(originHere(id1, s1, y1, max(texelFetch(rad, ivec2(N_LAST / 2, id1), 0).r, 0.3), p) * shade, vec3(1.0));
    col = mix(col, oc, vis * blendA.z);
  }
  // The front lumen's flow, length, caliber here and own colour.
  vec4 f0 = vec4(0.0), f1 = vec4(0.0);
  vec3 vc1 = vec3(0.0);
  if (blood == 1) {
    f0 = texelFetch(flow, ivec2(0, id1), 0); f1 = texelFetch(flow, ivec2(1, id1), 0);
    f0.x = flowD(id1, f0.x, f0.y);   // (the distance now: flowD)
    if (f1.z > 0.0) {
      vc1 = mix(texelFetch(tube, ivec2(0, id1), 0).rgb, texelFetch(tube, ivec2(1, id1), 0).rgb, alongAt(id1, clamp(s1 / len1, 0.0, 1.0)));
    }
  }
  bool isLy = f1.x < -0.5;   // (a lymph row: dashes, never blood streaks)
  if (blood == 1 && blendA.x > 0.0 && f1.z > 0.0 && !isLy) {
    // Blood that shows trouble (V7, blood-trouble.js; style P only): a shimmer where the flow reverses, a jet and eddies at a narrowing. The place
    // the streaks are drawn at is bent, their density (the flux) scaled; untroubled blood is (s1, y1, 1) and byte for byte as before.
    vec4 tr = vec4(s1, y1, 1.0, 0.0);
    if (bloodStyle == 3) { tr = troubleAt(id1, s1, y1, R1, len1, f0.y, f1.w > 0.5); f0.z *= tr.z; }
    vec4 A = bloodAt(id1, tr.x, tr.y, col, f0, f1, len1, R1, vc1);
    float a = A.a * (1.0 - castAt(id1, s1, len1));
    if (a > 0.0) col = mix(col, A.rgb, clamp(a * vis * flowA * blendA.x, 0.0, 1.0));
  }
  if (blood == 1 && isLy && f1.z > 0.0) {
    // Lymph. The lobule's lymph rows (lobule-zoom.js) carry the dashes' phase, pitch, protein and theme in flow texel 0, as before. A row that ALSO
    // carries a stream in texel 7 (x: the distance now, y: the signed speed, blood's D and vd; y = 0: none) is drawn as streaks, the same style
    // as the blood (bloodAt, so the Tube's style P / D4 mist), coloured by the protein: a cool ink at 0 %, albumin amber at 100 % (dark on a light channel, light on a dark one) (the protein f0.z is the lobule's lyProt scaled 0.42 … 0.84 to 0 … 1), fainter when poorer. A row with no stream keeps the dashes.
    float prot = clamp(f0.z, 0.0, 1.0);
    vec4 sd = texelFetch(flow, ivec2(7, id1), 0);
    float aLy = clamp(f1.z * vis * flowA, 0.0, 1.0);   // (not blendA.x: the streaks' switch, which the lymph does not follow)
    if (sd.y != 0.0) {
      float cl = dot(vc1, vec3(0.299, 0.587, 0.114));
      float onLight = smoothstep(${f(LYMPH_INK.luma[0])}, ${f(LYMPH_INK.luma[1])}, cl);   // 1: a light channel, dark ink; 0: a dark one, light ink
      float pk = smoothstep(${f(LYMPH_INK.ramp[0])}, ${f(LYMPH_INK.ramp[1])}, prot);
      vec3 inkL = mix(vec3(${LYMPH_INK.onLight.low.join(', ')}), vec3(${LYMPH_INK.onLight.high.join(', ')}), pk);
      vec3 inkD = mix(vec3(${LYMPH_INK.onDark.low.join(', ')}), vec3(${LYMPH_INK.onDark.high.join(', ')}), pk);
      vec3 ink = mix(inkD, inkL, onLight);
      // (blood's density divisor, so that the streaks fill occ of a lane whatever the zoom: bloodAt's p = flux * sx / (|vd| sumK) = occ.)
      float lcn = clamp(1.7 * R1 / zoomA.x, 1.0, 7.0) - 1.0;
      int lkn = min(int(lcn), 5);
      float sumK = mix(LANE_K[lkn], LANE_K[lkn + 1], lcn - float(lkn));
      float occ = mix(${f(LYMPH_INK.occ[0])}, ${f(LYMPH_INK.occ[1])}, prot);
      float lyV = (sd.y < 0.0 ? -1.0 : 1.0) * max(abs(sd.y), ${f(LYMPH_INK.look)});   // (the look at the trunk's speed; the distance sd.x still moves them at the lymph's own)
      vec4 ly0 = vec4(sd.x, lyV, occ * abs(lyV) * sumK / zoomB.z, 0.0);
      vec4 A = bloodAt(id1, s1, y1, col, ly0, vec4(1.0, 1.0, f1.z, 0.0), len1, R1, vc1);
      // bloodAt's alpha is the streaks plus a glow along the axis (glowCore, times the wall and the ends): the glow is taken out, so only a streak tints.
      float ayL = clamp(abs(y1), 0.0, 1.0);
      float glowL = ${f(LYMPH_INK.glow)} * (1.0 - ayL * ayL) * (1.0 - ayL * ayL) * (1.0 - smoothstep(0.7, 1.0, ayL)) * min(smoothstep(0.0, 1.5 * zoomB.z, s1), smoothstep(0.0, 1.5 * zoomB.z, len1 - s1)) * f1.z;
      float a = min(max(A.a - glowL, 0.0) * ${f(LYMPH_INK.gain)} * mix(${f(LYMPH_INK.faint)}, 1.0, prot), ${f(LYMPH_INK.cap)}) * (1.0 - castAt(id1, s1, len1));
      col = mix(col, ink, clamp(a * vis * flowA, 0.0, 1.0));
    } else {
      float lc, lk;
      lymphAt(s1, y1, f0, len1, R1, lc, lk);
      // The dash's ink: clearly deeper than the channel's own green (lighter in the dark theme); the core a visible but quiet albumin amber.
      vec3 ink = mix(vc1, f0.w > 0.5 ? vec3(0.78, 0.95, 0.70) : vec3(0.30, 0.56, 0.28), 0.62);
      vec3 amber = f0.w > 0.5 ? vec3(0.95, 0.71, 0.29) : vec3(0.89, 0.60, 0.12);
      col = mix(col, ink, lc * aLy);
      col = mix(col, amber, lk * aLy);
    }
  }
  if (dyeOn == 1) {
    float c = dyeAt(id1, s1, y1);
    // A rich, slightly glowing column: the dye tints the lumen and lifts it a little.
    float inLumen = 1.0 - smoothstep(0.6, 0.85, abs(y1));
    float dyeK = max(smoothstep(0.0, 0.2, vis), inLumen);
    col = mix(col, dyeCol, clamp(c, 0.0, 1.0) * 0.9 * dyeK);
    // The bolus's leading edge, a few pixels of the lumen's own deep shade where the dye thins out ahead of it.
    if (c > 0.02) {
      float de = dyeEdge(id1, s1, y1, c);
      col = mix(col, vc1 * 0.45, de * 0.55 * clamp(c, 0.0, 1.0) * dyeK);
    }
  }
  // The vessel layer's fill had the cel tones (a lift toward the top left, two darker steps away from it, a light line); this colour replaces it, so it gets them too.
  if (fx == 1 && (flags & ${K.F_DIFFUSE}) != 0) col = celTones(min(col, vec3(1.0)), D, R, length(vG) > 1e-5 ? normalize(vG) : vec2(0.0), aa);
  outColor = ditherOut(vec4(min(col, vec3(1.0)), 1.0) * lumA, q);
}
`;
};

// ---- the same arithmetic in JS, for one pixel ----

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const LAST = COMP_N - 1;

/**
 * The lumen shader's place and coverage arithmetic for one pixel (the GLSL's main up to the compositor's section).
 * o: { vI, vD, vG [x, y], vRad, ba [x, y] (the centreline segment at int(vI): the next point less this one), len (the row's length, tube texel 5 z),
 *      R (the radius radAt gives at s: default vRad), aa (pxW * EDGE), clip [from, to] (default [0, 1]), opacity (aA * tierAlpha * gf, default 1) }
 * Returns { u, s, across, y (+1 for a web's pixel), web, D (after the clip), coverage (aL), lumA, drawn } where drawn is the shader's discard test (false: the pixel is discarded).
 * Across is signed by the side of the centreline: positive where the offset lies to the left of the segment's direction (packFlow's gY, before packing).
 */
export function tubeLumenJS(o) {
  const clip = o.clip ?? [0, 1], opacity = o.opacity ?? 1;
  const u = o.vI / LAST, len = o.len;
  let D = o.vD;
  if (clip[0] > 0 || clip[1] < 1) {
    const ext = Math.max(clip[0] - u, u - clip[1]) * len;
    if (ext > 0) D = Math.hypot(D + o.vRad, ext) - o.vRad;
  }
  const coverage = clamp(0.5 - D / o.aa, 0, 1);
  const [bx, by] = o.ba;
  const across = (bx * o.vG[1] - by * o.vG[0]) / Math.sqrt(Math.max(bx * bx + by * by, 1e-8));
  const s = u * len;
  const R = Math.max(o.R ?? o.vRad, 0.3);
  const web = o.vRad > WEB_RATIO * R;
  const y = web ? 1 : clamp(across / R, -1, 1);
  const lumA = coverage * opacity;
  return { u, s, across, y, web, D, coverage, lumA, drawn: coverage > 0 && lumA > LUM_MIN };
}

/** The lymph streak's ink for a protein share (0 … 1) and the vessel's own colour vc: the GLSL's `ink`, the strength factor and the lane share. */
export function lymphInkJS(prot, vc) {
  const L = LYMPH_INK, p = clamp(prot, 0, 1);
  const cl = 0.299 * vc[0] + 0.587 * vc[1] + 0.114 * vc[2];
  const lu = clamp((cl - L.luma[0]) / (L.luma[1] - L.luma[0]), 0, 1), onLight = lu * lu * (3 - 2 * lu);
  const ru = clamp((p - L.ramp[0]) / (L.ramp[1] - L.ramp[0]), 0, 1), pk = ru * ru * (3 - 2 * ru);   // (smoothsteps in a luma and the protein, not in time)
  const ink = [0, 1, 2].map((i) => {
    const l = L.onLight.low[i] * (1 - pk) + L.onLight.high[i] * pk, d = L.onDark.low[i] * (1 - pk) + L.onDark.high[i] * pk;
    return d * (1 - onLight) + l * onLight;
  });
  return { ink, onLight, strength: L.faint * (1 - p) + p, occ: L.occ[0] * (1 - p) + L.occ[1] * p };
}

/** packFlow's arc and across, packed and unpacked in JS (the compositor's `float(g.y) / 16.0 - S_OFF` and `float(g.z) / 32767.5 - 1.0`). */
export function packedPlaceJS(s, y) {
  const gy = Math.floor(clamp((s + S_OFF) * 16, 0, 65535)), gz = Math.floor(clamp((y + 1) * 32767.5, 0, 65535));
  return { s: gy / 16 - S_OFF, y: gz / 32767.5 - 1 };
}
