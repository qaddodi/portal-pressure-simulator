// The Tube's seamless joins at a row's end (10 Nov 2026, Mohammad's device shots of 138d637 and 61523a4): GLSL shared by the vertex shaders (the strip's and the web's
// outputs), the lean shader (tube-lean-glsl.js) and the lumen layer's shader (tube-lumen-glsl.js), with its JS twin for the tests. Pure strings and numbers, no GL calls.
//
// What went wrong without it: a branch's round end (its lumen, not only its outline) lay inside the trunk it ends on, and where the two differ in opacity (a
// faded vena cava, opaque hepatic veins: the tier alphas and the organ veil) that end showed through the trunk as a capsule; two rows meeting end to end drew
// a round cap each over the other, a ring where their opacities differ. A row's end (the instance's aRow.yz, vEnd) is now one of
//   open end on a trunk        vEnd >= 0: trunk row * 64 + the trunk's sample there.
//        branch in a higher tier than the trunk (mode 1, "fade"):  the branch is laid over the trunk in a later band of depth, so it fades OUT into it: its
//                              lumen and colour go from whole to nothing between 0.6 radii outside the trunk's wall and a radius inside it, its outline from the wall to
//                              0.35 radii inside it, so the trunk's own picture shows through and there is no edge to see. (The branch is not cut at the wall: a cut leaves a
//                              hard, flat edge where the two looks differ, 61523a4.)
//        otherwise (mode 0, "cut"): what lies inside the trunk's lumen is the trunk's and is dropped, so the trunk's pixel wins the depth test
//                              (a branch in the same tier, or a lower one, which the trunk is drawn over).
//   continuation of a row      vEnd <= -2: -(2 + partner row * 64 + the partner's end sample). Both rows end at the bisector plane of the break (the plane through
//                              the shared end point whose normal is own outward direction less the partner's): a pixel beyond it is the partner's and is
//                              dropped, so the two are one surface, with no cap and no end outline.
//   -1                         none.
// A pixel only looks at an end when its sample position vI lies within JOIN_WIN samples of that end (vEnd.x at the start, vEnd.y at the end).
//
// All the work is the vertex shader's, once a vertex, and flat to the fragment (10 Nov 2026, the planner: the first version read the trunk's points and radii from textures
// for every fragment near an end and a second row's attributes where it blended, and cost the figure and the lobule most of their frame rate):
//   vJ0, vJ1  (vec4, the start's and the end's)  an open end: the trunk's two arms from the sample, a to b (each at least JOIN_REACH radii of the trunk's own samples; the
//                              knee, the sample's point, is in vC .yz), so the cut follows a bend of the trunk; a continuation: the end point and the plane's unit normal.
//   vJK       (vec4: start's (r, mode), end's (r, mode))  r the trunk's radius there; mode 0 cut, 1 fade, 2 a continuation (valid), -1 none.
//   vC0, vC1  (vec4: x the other row's colour at its end packed as 8 bits a channel (the trunk's at the sample, the partner's at its end sample), yz an open end's knee, w the flag)
// so a fragment does one point-to-segment distance (or one dot product) and a smoothstep or two, and reads nothing. A cut end and a continuation also blend their COLOUR
// into the other row's over JOIN_COLOUR_R radii (at least JOIN_COLOUR_MIN world units) from the wall or the plane (a continuation takes half of it at the plane, so the two
// rows meet at the mean): where a lens colours two rows differently there is no step at the join (Mohammad, 10 Nov). A fading branch needs none: the trunk's own
// picture shows through it. Opacity steps are left.
export const END_BASE = 64;                  // vEnd's packing of a sample (the plan's contract: N_SAMPLES)
export const END_SEGS = 2;                   // (the multi-segment reference trunkGapJS reads this many segments each side of the sample, for the tests)
export const JOIN_WIN = 24;                  // samples from an end within which a pixel looks at it (8 left the arch crossing the SVC and the hepatic veins crossing the cava uncut for 12-19 samples: the pale wedge and the angled cuts, 10 Nov)
export const JOIN_REACH = 2;                 // radii: the trunk's chord reaches at least this far each way from the sample
export const JOIN_COLOUR_R = 3;              // radii over which a row's colour blends into the other's at a cut end or a continuation (at least JOIN_COLOUR_MIN world units)
export const JOIN_COLOUR_MIN = 8;
export const JOIN_RAMP_R = 3;                // radii before a continuation's plane over which the more opaque row eases to the other's opacity (no step in the look where the tiers differ)
export const JOIN_F_NOFADE = 2048;          // (a row whose end keeps its own opacity at a join: no ease to the trunk's, joinRamp skipped; the surgical shunts, 13 Nov 2026: the portocaval shunt's last stretch went grey toward the faint cava, a shading line along it)
export const JOIN_F_VEIL = 128, JOIN_F_WHOLE = 256;   // veins-gl.js's flag bits (not imported: veins-gl.js imports this module's callers)
export const JOIN_TONE_R = 4;                // radii (at least JOIN_TONE_MIN world units) over which the cel tones' light direction turns from a row's own to the mean at a continuation's plane, and a cut branch's tones ease in from the trunk's wall
export const JOIN_TONE_MIN = 16;
export const JOIN_MOUTH_R = 3;              // radii (of the narrower; at least JOIN_MOUTH_MIN world units) from the trunk's wall over which a cut branch's cel tones go from the trunk's own tone field to its own.
export const JOIN_MOUTH_MIN = 8;             // (13 Nov 2026: they were eased FLAT over 1.2 radii, and a flat block met the trunk's bands in a square step at the SMV top and a pale slab at the Rex mouth; the trunk's field, carried
                                             // straight on past a trunk's flat end, is continuous with the trunk's own pixels, and a field blended into another bends its bands, no edge)
export const JOIN_CUT = 0.25;                // device pixels: how far past the bisector plane a continuation still draws (so the two leave no hairline)
export const JOIN_CUT_IN = 4;                // device pixels: how far inside its trunk's wall a same-tier branch still draws. The cut follows the trunk's samples in two straight arms, the wall is curved, so a cut at the wall itself leaves a one-pixel crack where the arms run short of it, and the trunk's dark outline shows through it as a hairline across the mouth (the TIPS ends, 11 Nov 2026); the branch's pixels there are the trunk's own colour (wc)
export const JOIN_FADE_N = 14;               // samples (of the row's 64, 22%): over the last this many of a branch that ends on a fainter trunk, the branch's opacity eases to the trunk's, so it does not stop at the wall as a brighter vessel against a faded one (Mohammad, 12 Nov 2026: "the end of the vein should fade smoothly to become as faded as the vein it connects to, apply everywhere")
export const JOIN_NONE = -1;
export const JOIN_MODE = { CUT: 0, SOFT: 1, PLANE: 2 };   // (SOFT: a cut at the wall one device pixel soft: a branch in a higher tier than its trunk, drawn over it, 10 Nov)

/** vEnd's value for an open end on a trunk row at sample `sample`. */
export const endTrunk = (row, sample) => row * END_BASE + sample;
/** The fractions an open end's value carries when the trunk row runs on into another row at its start (END_THRU_START) or its end (END_THRU_END; both added: both): the trunk's chord then reaches on past that end, as one vessel. */
export const END_THRU_START = 0.25, END_THRU_END = 0.5;
/** vEnd's value for the continuation of `row` at its end sample `sample`. */
export const endContinues = (row, sample) => -(2 + row * END_BASE + sample);
/** Which kind a vEnd value is: 'none', 'trunk' or 'continues'. */
export const endKind = (v) => (v > -0.5 ? 'trunk' : v < -1.5 ? 'continues' : 'none');

const f = (x) => (Number.isInteger(x) ? `${x}.0` : String(x));
// (comp-glsl.js ALONG_GLSL's alongAt under a name of its own: the vertex shader reads the `rad` texture's colour-along channels the same way; a test holds the two equal)
export const JOIN_ALONG_GLSL = `float joinAlong(int id, float u) {
  float ui = u * ${END_BASE - 1}.0;
  int i0 = min(int(ui), ${END_BASE - 2});
  vec2 a = texelFetch(rad, ivec2(i0, id), 0).ba;
  return a.x < 0.0 ? u : mix(a.x, a.y, ui - float(i0));
}`;

/**
 * The vertex shaders' part: the uniform joinCut, the three flat outputs, joinOne (one end's data) and joinOut (main's line). Needs in scope: PT(id, i), the `rad` and
 * `tube` samplers, MIN_RADIUS.
 */
export const tubeJoinVS = (N_SAMPLES) => {
  if (N_SAMPLES !== END_BASE) throw new Error('tube-join-glsl: vEnd packs a row as row * 64 + sample, so N_SAMPLES must be 64');
  const LAST = N_SAMPLES - 1;
  return `// ---- a row's end on another row, worked out once a vertex (tube-join-glsl.js) ----
uniform int joinCut;                   // 0: no row has an end (vEnd is -1) and none of the join work runs; 1: the figure
flat out vec4 vJ0;                     // the start's end data: an open end: the trunk's chord a, b; a continuation: the end point and the plane's unit normal
flat out vec4 vJ1;                     // the end's
flat out vec4 vJK;                     // the start's (trunk radius, mode), the end's (radius, mode): mode 0 cut, 1 fade, 2 plane, -1 none
flat out vec4 vC0;                     // the other row's colour at the start's end (rgb), and a continuation's partner's tier (w; -1 otherwise)
flat out vec4 vC1;                     // and at the end's
${JOIN_ALONG_GLSL}
// The row's colour at u as vesAttrs gives it, the recoloured stretch included (texels 8 and 9: the HVPG's wedged vein, a sclerosant column, a cast, the wale). Without the
// stretch a row tinted up to its seam blended toward the partner's UNtinted colour there (13 Nov 2026, Mohammad: the WHVP colour "interrupted at the joint": a pale blue band
// across the right hepatic vein where the tinted rows meet, each row mixing in the other's plain blue over 3 radii).
vec3 joinColour(int row, float u) {
  vec3 col = mix(texelFetch(tube, ivec2(0, row), 0).rgb, texelFetch(tube, ivec2(1, row), 0).rgb, joinAlong(row, u));
  vec4 tc = texelFetch(tube, ivec2(8, row), 0);
  if (tc.w > 0.0) {
    vec4 tr = texelFetch(tube, ivec2(9, row), 0);
    float Lv = max(texelFetch(tube, ivec2(5, row), 0).z, 1.0), uu = u * Lv;
    float k = smoothstep(tr.x * Lv - tr.z, tr.x * Lv + tr.z, uu) * (1.0 - smoothstep(tr.y * Lv - tr.z, tr.y * Lv + tr.z, uu));
    col = mix(col, tc.rgb, k * min(tc.w, 1.0));
  }
  return col;
}
// A row's own fade at p (veins-mesh-glsl.js vesAttrs: a dip, a radial or a linear fade along it, texels 3 and 4): the alpha the partner shows at the seam, not its flat row alpha (the SVC fades to 0.3 as it enters the atrium: the cava's ramp ended on a step, 10 Nov).
float joinFade(int row, vec2 p) {
  vec4 t3 = texelFetch(tube, ivec2(3, row), 0), t4 = texelFetch(tube, ivec2(4, row), 0);
  if (t4.w > 2.5) {
    vec2 dd = t3.zw - t3.xy;
    float v = clamp(dot(p - t3.xy, dd) / max(dot(dd, dd), 1e-6), 0.0, 1.0);
    return v < t4.x ? mix(t4.y, t4.z, smoothstep(0.0, t4.x, v)) : mix(t4.z, 1.0, smoothstep(t4.x, 1.0, v));
  }
  if (t4.w > 1.5) {
    float v = length(p - t3.xy) / max(t3.z, 1e-3);
    return v < 0.45 ? mix(t4.y, t4.z, v / 0.45) : mix(t4.z, 0.0, clamp((v - 0.45) / 0.55, 0.0, 1.0));
  }
  if (t4.w > 0.5) {
    vec2 dd = t3.zw - t3.xy;
    float v = dot(p - t3.xy, dd) / max(dot(dd, dd), 1e-6);
    return mix(t4.y, t4.z, clamp((v - t4.x) / max(1.0 - t4.x, 1e-4), 0.0, 1.0));
  }
  return 1.0;
}
// The partner row's tier, veil and whole flags and alpha (with its fade at the seam point at), packed in one float (tier + 32 veil + 64 whole + 128 alpha8): what the fragment needs to find its opacity there.
float joinPack(int row, vec2 at) {
  vec4 t1 = texelFetch(tube, ivec2(1, row), 0), t2 = texelFetch(tube, ivec2(2, row), 0);
  int fl = int(t2.z + 0.5);
  return float(int(t2.x + 0.5) + ((fl & ${JOIN_F_VEIL}) != 0 ? 32 : 0) + ((fl & ${JOIN_F_WHOLE}) != 0 ? 64 : 0) + 128 * int(clamp(t1.w * joinFade(row, at), 0.0, 1.0) * 255.0 + 0.5));
}
float joinPackColour(vec3 c) { return dot(floor(clamp(c, 0.0, 1.0) * 255.0 + 0.5), vec3(65536.0, 256.0, 1.0)); }
// A trunk's arm from its sample sm: len along its own samples (spacing sp) in direction dir, no further than its end unless the trunk runs on straight there (thru: then on
// along the next row's own samples, pq = that row * 2 + (1 if it meets the seam with its end) + 1; with none, on in a line). (13 Nov 2026: the straight line left the SMV where
// it bends past the seam of its two rows, 1.26 units at the arm's end, and the mesocaval and Rex mouths dropped a band outside the real wall: the SMV's outline showed as a sliver.)
vec2 joinArm(int tr, int sm, int dir, float sp, float len, bool thru, int pq) {
  int lim = dir > 0 ? ${LAST} - sm : sm;
  float have = float(lim) * sp;
  float t = min(len, have) / sp;
  int k = min(int(t), max(lim - 1, 0));
  vec2 q = mix(PT(tr, sm + dir * k), PT(tr, sm + dir * min(k + 1, lim)), t - float(k));
  if (thru && len > have) {
    int en = sm + dir * lim;
    vec2 e0 = PT(tr, en);
    if (pq > 0) {
      int pr = (pq - 1) / 2, ps = (pq - 1) % 2 == 0 ? 0 : ${LAST}, pd = ps == 0 ? 1 : -1;
      float s2 = max(length(PT(pr, ps + pd) - PT(pr, ps)), 1e-4), t2 = min((len - have) / s2, ${f(LAST)});
      int k2 = min(int(t2), ${LAST - 1});
      return e0 - PT(pr, ps) + mix(PT(pr, ps + pd * k2), PT(pr, ps + pd * (k2 + 1)), t2 - float(k2));
    }
    vec2 o = e0 - PT(tr, clamp(en - dir * 2, 0, ${LAST}));
    float lo = length(o);
    q = e0 + (lo > 1e-6 ? o / lo : vec2(0.0)) * (len - have);
  }
  return q;
}
// Which arm of an open end the next row's samples are for (joinArm's pq): the one that runs on past the trunk's end; both: the nearer end's. -1, 1 or 0 (none).
int joinThruSide(bool tb, bool tf, int sm) { return tb && tf ? (sm >= ${END_BASE / 2} ? 1 : -1) : tf ? 1 : tb ? -1 : 0; }
vec4 joinOne(int id, float e, bool atStart, int pq, out vec2 K, out vec4 C) {   // (pq: joinArm's next row, for the arm joinThruSide names)
  K = vec2(-1.0, -1.0);
  C = vec4(0.0, 0.0, 0.0, -1.0);   // (w: a continuation's partner's tier, for the opacity ramp; x the colour, packed; yz an open end's knee)
  if (e > -0.5) {
    int ei = int(e + 0.1), tr = ei / ${END_BASE}, sm = ei % ${END_BASE};
    float fe = e - float(ei);   // (.25: the trunk runs on into another row at its start, .5: at its end, .75: both: its chord reaches on there)
    bool tb = (fe > 0.2 && fe < 0.3) || fe > 0.7, tf = fe > 0.45;
    vec2 c = PT(tr, sm);
    int s0 = max(sm - 1, 0), s1 = min(sm + 1, ${LAST});
    float sp = max(length(PT(tr, s1) - PT(tr, s0)) / float(max(s1 - s0, 1)), 1e-4);
    float r = max(texelFetch(rad, ivec2(sm, tr), 0).r, MIN_RADIUS);
    float hl = max(sp, ${f(JOIN_REACH)} * r);
    // (The arms reach no further than the trunk does: past the trunk's own end nothing of it is drawn, and a branch cut there leaves a black wedge, 10 Nov, the portal fork. They follow its samples, so a trunk that bends within the reach, as the Circuit's cava does, is cut where it is, not along its tangent.)
    K = vec2(r, texelFetch(tube, ivec2(2, id), 0).x > texelFetch(tube, ivec2(2, tr), 0).x + 0.5 ? 1.0 : 0.0);
    float fk = sm == ${LAST} && !tf ? 2.0 : sm == 0 && !tb ? 3.0 : 1.0;
    C = vec4(joinPackColour(joinColour(tr, float(sm) / ${LAST}.0)), c, -(fk + 4.0 * (joinPack(tr, c) + 1.0)));   // (w: minus the flag (1: none, 2: the trunk's own end, 3: its start) plus four times (the trunk's pack + 1): the trunk's opacity, for the branch's fade into a fainter trunk)   // (w: the trunk's own end: with its cap gone the arms end flat there, so the branch is drawn beyond it)
    int ts = joinThruSide(tb, tf, sm);
    return vec4(joinArm(tr, sm, -1, sp, hl, tb, ts < 0 ? pq : 0), joinArm(tr, sm, 1, sp, hl, tf, ts > 0 ? pq : 0));
  }
  if (e < -1.5) {
    int k = int(-e + 0.5) - 2, pr = k / ${END_BASE}, ps = k % ${END_BASE};
    vec2 E = PT(id, atStart ? 0 : ${LAST});
    vec2 dO = E - PT(id, atStart ? 2 : ${LAST - 2});
    if (pr == id) {   // a trunk's own end that branches leave from, with no row carrying on: it ends flat, its round cap gone (the branches' own caps and the web make the fork)
      float l0 = length(dO);
      if (l0 > 1e-6) { K = vec2(0.0, 2.0); C = vec4(joinPackColour(joinColour(id, float(ps) / ${LAST}.0)), 0.0, 0.0, joinPack(id, E)); return vec4(E, dO / l0); }
      return vec4(0.0);
    }
    vec2 dP = PT(pr, ps) - PT(pr, ps == 0 ? 2 : ${LAST - 2});
    float lo = length(dO), lp = length(dP);
    if (lo > 1e-6 && lp > 1e-6) {
      vec2 m = dO / lo - dP / lp;
      float lm = length(m);
      if (lm > 1e-4) {
        vec2 f = -dP / lp, o = dO / lo;
        K = vec2(atan(o.x * f.y - o.y * f.x, dot(o, f)) + 0.0, 2.0);   // (K.x: the turn from this row's way out to the next row's way on, which the cel tones' light direction follows across the join)
        C = vec4(joinPackColour(joinColour(pr, float(ps) / ${LAST}.0)), 0.0, 0.0, joinPack(pr, E));
        return vec4(E, m / lm);
      }
    }
  }
  return vec4(0.0);
}
// thru: the instance's aRow.w: over 4.5, 5 + the start's next row (joinArm's pq) + 4096 * the end's (tube-data.js tubeBuckets); otherwise the row's kind.
void joinOut(int id, vec2 ends, float thru) {
  vJ0 = vec4(0.0); vJ1 = vec4(0.0); vJK = vec4(-1.0); vC0 = vec4(0.0); vC1 = vec4(0.0);
  if (ends.x != -1.0 || ends.y != -1.0) {
    vec2 k0, k1;
    vec4 c0, c1;
    int tq = thru > 4.5 ? int(thru + 0.5) - 5 : 0;
    vJ0 = joinOne(id, ends.x, true, tq % 4096, k0, c0);
    vJ1 = joinOne(id, ends.y, false, tq / 4096, k1, c1);
    vJK = vec4(k0, k1);
    vC0 = c0; vC1 = c1;
  }
}
`;
};

/** What the web's vertex shader declares and writes in place of joinOut: the same outputs, no ends. */
export const JOIN_WEB_OUT_GLSL = `uniform int joinCut;
flat out vec4 vJ0;
flat out vec4 vJ1;
flat out vec4 vJK;
flat out vec4 vC0;
flat out vec4 vC1;`;
export const JOIN_WEB_SET_GLSL = 'vJ0 = vec4(0.0); vJ1 = vec4(0.0); vJK = vec4(-1.0); vC0 = vec4(0.0); vC1 = vec4(0.0);';

/** The same declarations as the fragment shaders take them in (the varyings the vertex shaders write). */
export const JOIN_IN_GLSL = `flat in vec2 vEnd;                     // (the row's ends, which the vertex shaders hand on; the decisions are in vJ0, vJ1, vJK)
flat in vec4 vJ0;                      // the start's end data (tube-join-glsl.js)
flat in vec4 vJ1;                      // the end's
flat in vec4 vJK;                      // the start's (trunk radius, mode) and the end's
flat in vec4 vC0;                      // the other row's colour at the start's end
flat in vec4 vC1;                      // and the end's`;

/**
 * The fragment shaders' part: joinEnd. drop: the pixel is the other row's (it is not drawn; in the depth prepass it writes no depth); fl: the factor on its lumen and
 * its colour (1 unless a branch is fading into its trunk); fo: the factor on its outline.
 */
export const tubeJoinFS = (N_SAMPLES) => {
  if (N_SAMPLES !== END_BASE) throw new Error('tube-join-glsl: vEnd packs a row as row * 64 + sample, so N_SAMPLES must be 64');
  const LAST = N_SAMPLES - 1;
  return `// ---- a row's end on another row (tube-join-glsl.js): the decisions, from the vertex shader's flat data; no reads ----
struct JoinEnd { bool drop; float fl; float fo; float wc; vec3 col; float pt; float rs; float rot; vec2 tg; float tw; float gp; };   // gp: a cut end's signed gap to its trunk's wall (negative inside it), 1000 for none: the outline's pixels inside the wall are the trunk's (lean shader)   // tg: the trunk's tone vector here (offset from its axis / its radius), tw its share   // wc: the share of the other row's colour col this pixel takes
vec3 joinUnpackColour(float v) {
  float r = floor(v / 65536.0), g = floor((v - r * 65536.0) / 256.0);
  return vec3(r, g, v - r * 65536.0 - g * 256.0) / 255.0;
}
float joinSeg(vec2 p, vec2 a, vec2 b) {
  vec2 ba = b - a;
  return length(p - a - ba * clamp(dot(p - a, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0));
}
vec2 joinNear(vec2 p, vec2 a, vec2 b, bool line) {   // (the point of the segment a b nearest p; line: of its whole line)
  vec2 ba = b - a;
  float h = dot(p - a, ba) / max(dot(ba, ba), 1e-8);
  return a + ba * (line ? h : clamp(h, 0.0, 1.0));
}
JoinEnd joinEnd(float vI, vec4 vJ0, vec4 vJ1, vec4 vJK, vec4 vC0, vec4 vC1, vec2 p, float R, float px) {
  JoinEnd j;
  j.drop = false; j.fl = 1.0; j.fo = 1.0; j.wc = 0.0; j.col = vec3(0.0); j.pt = -1.0; j.rs = 0.0; j.rot = 0.0; j.tg = vec2(0.0); j.tw = 0.0; j.gp = 1000.0;
  bool atStart = vI < ${JOIN_WIN}.0;
  if (!atStart && !(vI > ${LAST - JOIN_WIN}.0)) return j;
  vec4 J = atStart ? vJ0 : vJ1;
  vec2 K = atStart ? vJK.xy : vJK.zw;
  if (K.y < -0.5) return j;
  float cw = max(${f(JOIN_COLOUR_R)} * R, ${f(JOIN_COLOUR_MIN)});
  vec4 CC = atStart ? vC0 : vC1;
  j.col = joinUnpackColour(CC.x);
  if (K.y > 1.5) {
    j.pt = CC.w;
    float s = dot(p - J.xy, J.zw);
    if (s > ${f(JOIN_CUT)} * px) {
      // The outer corner of a bend is not the other row's: between this row's end line (across its way out) and the next row's start line (across its way on) lies a wedge
      // neither lumen covers, which the two end caps, one circle, round off. The bisector m is this row's way out turned by half the bend; undo that turn for the two ways.
      float ha = 0.5 * K.x, ch = cos(ha), sh = sin(ha);
      vec2 qe = p - J.xy, wo = vec2(ch * J.z + sh * J.w, -sh * J.z + ch * J.w), wf = vec2(ch * J.z - sh * J.w, sh * J.z + ch * J.w);
      if (!(dot(qe, wo) > 0.0 && dot(qe, wf) < 0.0)) { j.drop = true; return j; }
    }
    j.wc = 0.5 * (1.0 - smoothstep(0.0, cw, -s));
    j.rs = smoothstep(-${f(JOIN_RAMP_R)} * R, 0.0, s);
    j.rot = K.x * 0.5 * (1.0 - smoothstep(0.0, max(${f(JOIN_TONE_R)} * R, ${f(JOIN_TONE_MIN)}), -s));
    return j;
  }
  vec2 ba = J.zw - J.xy;
  float gap = min(joinSeg(p, J.xy, CC.yz), joinSeg(p, CC.yz, J.zw)) - K.x;   // (the trunk about the sample: its two arms from the knee)
  // (A trunk's own end, its cap gone: past it the pixel is the branch's, whatever the arms' round end says.)
  float wq = -CC.w, pk = floor(wq / 4.0) - 1.0, fw = -(wq - 4.0 * floor(wq / 4.0));   // (the flag, and the trunk's pack: see joinOne)
  bool beyond = false;
  if (fw < -1.5) {
    vec2 dn = ba / max(length(ba), 1e-6);
    beyond = fw < -2.5 ? dot(p - J.xy, dn) < 0.0 : dot(p - J.zw, dn) > 0.0;
  }
  // (K.y 1: a branch in a higher tier than its trunk is cut at the wall as any other, but its edge is one device pixel soft, and the trunk shows through that pixel: it lies in its own tier's pass.)
  bool soft = K.y > 0.5;
  j.gp = beyond ? 1000.0 : gap;   // (past a trunk's own end the pixel is the branch's, outline too)
  if (gap < (soft ? -px : -${f(JOIN_CUT_IN)} * px) && !beyond) { j.drop = true; return j; }
  // (A trunk much narrower than the branch — a small tributary the join happens to mark as its trunk — does not recolour or flatten the wide branch: the share rk, and the reach by the narrower of the two.)
  float rk = smoothstep(0.3, 0.9, K.x / max(R, 1e-3)), rn = min(R, K.x);
  j.wc = (1.0 - smoothstep(0.0, max(${f(JOIN_COLOUR_R)} * rn, ${f(JOIN_COLOUR_MIN / 2)}), gap)) * rk;
  // (The cel tones near the mouth are the trunk's: its axis point nearest the pixel (past a trunk's flat end, on its last arm's line, so its bands run straight on), the offset over its radius;
  // its share falls from the wall, or from the end's plane, to none JOIN_MOUTH_R radii out.)
  vec2 nA = joinNear(p, J.xy, CC.yz, beyond && fw > -2.5), nB = joinNear(p, CC.yz, J.zw, beyond && fw < -2.5);
  bool onA = beyond ? fw > -2.5 : length(p - nA) < length(p - nB);
  vec2 nt = onA ? nA : nB;
  j.tg = (p - nt) / max(K.x, 1e-3);
  float tgap = beyond ? max(length(p - nt) - K.x, fw < -2.5 ? -dot(p - J.xy, normalize(ba)) : dot(p - J.zw, normalize(ba))) : gap;
  j.tw = (1.0 - smoothstep(0.0, max(${f(JOIN_MOUTH_R)} * rn, ${f(JOIN_MOUTH_MIN)}), tgap)) * rk;
  if (soft && !beyond) { j.fl = smoothstep(-px, 0.0, gap); j.fo = j.fl; }
  // (A branch on a fainter trunk eases its opacity to the trunk's over its last JOIN_FADE_N samples: joinRamp, in the lean and the lumen shaders, takes j.pt and j.rs.)
  j.pt = pk;
  j.rs = 1.0 - smoothstep(0.0, ${f(JOIN_FADE_N)}, atStart ? vI : ${LAST}.0 - vI);
  return j;
}
// The cel tones' direction across the vessel, turned toward the next row's across a continuation and handed to the trunk's own field at a cut branch's mouth: one tone field over
// the join. rho: the pixel's depth across its own vessel (celTones's), which celTones multiplies back in, so rho * the result is mix(rho * own, the trunk's tg, tw).
vec2 joinTone(vec2 g, JoinEnd j, float rho) {
  float c = cos(j.rot), s = sin(j.rot);
  return mix(vec2(c * g.x - s * g.y, s * g.x + c * g.y), j.tg / max(rho, 1e-4), j.tw);
}
`;
};

// ---- the same decisions in JS, for the tests ----

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a * (1 - t) + b * t;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (a) => Math.hypot(a[0], a[1]);
const segNear = (p, a, b, line) => { const bx = b[0] - a[0], by = b[1] - a[1], h0 = ((p[0] - a[0]) * bx + (p[1] - a[1]) * by) / Math.max(bx * bx + by * by, 1e-8), h = line ? h0 : clamp(h0, 0, 1); return [a[0] + bx * h, a[1] + by * h]; };
const segDist = (p, a, b) => { const bx = b[0] - a[0], by = b[1] - a[1], h = clamp(((p[0] - a[0]) * bx + (p[1] - a[1]) * by) / Math.max(bx * bx + by * by, 1e-8), 0, 1); return Math.hypot(p[0] - a[0] - bx * h, p[1] - a[1] - by * h); };

/** joinPack in JS: tier, flags (the vessel flag bits), alpha 0..1 -> the packed float. */
export const joinPackJS = (tier, flags, alpha) => tier + ((flags & JOIN_F_VEIL) !== 0 ? 32 : 0) + ((flags & JOIN_F_WHOLE) !== 0 ? 64 : 0) + 128 * Math.floor(clamp(alpha, 0, 1) * 255 + 0.5);

/** The lean and the lumen shaders' ramp: joinRamp(je, own effective alpha, occl) is the factor on this row's opacity (1 unless a continuation whose partner is the fainter). Needs useOrgan, organK, tierAlpha, tierGroup in scope. */
export const joinRampGLSL = (VEIL_K) => `float joinRamp(JoinEnd j, float ownEff, float occl) {
  if (j.pt < 0.0) return 1.0;
  int n = int(j.pt + 0.5);
  int tp = n & 31;
  float pa = float(n >> 7) / 255.0;
  if (((n >> 5) & 1) != 0 && useOrgan == 1) {
    float v = 1.0 - ${f(VEIL_K)} * organK;
    pa *= tierGroup[tp] == 0 ? min(1.0, v / max(1.0 - occl, 1e-3)) : v;
  }
  float pe = pa * tierAlpha[tp] * (tierGroup[tp] == 0 ? 1.0 - occl * (((n >> 6) & 1) != 0 ? 0.0 : 1.0) : 1.0);
  return mix(1.0, min(1.0, pe / max(ownEff, 1e-3)), j.rs);
}
`;

/**
 * trunkGap in JS, the multi-segment reference the first version read in every fragment (END_SEGS segments each side of the sample): p [x, y]; pts the trunk's points
 * [[x, y], ...]; rad the radii [[r0, r1] per segment]; sample the sample the branch ends at; segs how many segments each side count (END_SEGS; more for the whole trunk). Negative: inside the trunk's lumen. The tests hold the one chord to it.
 */
export function trunkGapJS(p, pts, rad, sample, segs = END_SEGS) {
  let best = 1e9;
  const last = pts.length - 2;
  for (let k = -segs; k < segs; k++) {
    const j = clamp(sample + k, 0, last), a = pts[j], b = pts[j + 1];
    const bx = b[0] - a[0], by = b[1] - a[1], px = p[0] - a[0], py = p[1] - a[1];
    const h = clamp((px * bx + py * by) / Math.max(bx * bx + by * by, 1e-8), 0, 1);
    const r = rad[j][0] * (1 - h) + rad[j][1] * h;
    best = Math.min(best, Math.hypot(px - bx * h, py - by * h) - r);
  }
  return best;
}

/** joinArm in JS: the trunk's arm from sample sm, reach along its own samples (spacing sp) in direction dir; past the end only if the trunk runs on straight there (thru): along next.pts (the next row's points, next.atEnd: it meets the seam with its end) when given, else in a line. */
export function joinArmJS(pts, sm, dir, sp, reach, thru, next = null) {
  const last = END_BASE - 1, lim = dir > 0 ? last - sm : sm, have = lim * sp, t = Math.min(reach, have) / sp;
  const k = Math.min(Math.floor(t), Math.max(lim - 1, 0)), A = pts[sm + dir * k], B = pts[sm + dir * Math.min(k + 1, lim)], f = t - k;
  let q = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
  if (thru && reach > have && next) {
    const en = sm + dir * lim, e0 = pts[en], Q = next.pts, ps = next.atEnd ? last : 0, pd = ps === 0 ? 1 : -1;
    const s2 = Math.max(len(sub(Q[ps + pd], Q[ps])), 1e-4), t2 = Math.min((reach - have) / s2, last), k2 = Math.min(Math.floor(t2), last - 1), A2 = Q[ps + pd * k2], B2 = Q[ps + pd * (k2 + 1)], f2 = t2 - k2;
    return [e0[0] - Q[ps][0] + A2[0] + (B2[0] - A2[0]) * f2, e0[1] - Q[ps][1] + A2[1] + (B2[1] - A2[1]) * f2];
  }
  if (thru && reach > have) {
    const en = sm + dir * lim, e0 = pts[en], o = sub(e0, pts[clamp(en - dir * 2, 0, last)]), lo = len(o);
    q = [e0[0] + (lo > 1e-6 ? o[0] / lo : 0) * (reach - have), e0[1] + (lo > 1e-6 ? o[1] / lo : 0) * (reach - have)];
  }
  return q;
}

/** joinThruSide in JS. */
export const joinThruSideJS = (tb, tf, sm) => (tb && tf ? (sm >= END_BASE / 2 ? 1 : -1) : tf ? 1 : tb ? -1 : 0);
/** joinArm's pq for a next row: row * 2 + (1 if it meets the seam with its end sample) + 1. */
export const joinNextCode = (row, sample) => row * 2 + (sample === 0 ? 0 : 1) + 1;

/**
 * joinOne in JS: one end's data (o.pq: joinArm's next row, as joinOut hands it). o: { e (the vEnd value), atStart, own: { pts: [[x, y] x 64], tier }, rows: (row) => { pts, rad (a number a sample), tier, alpha, flags, fadeAt (point -> the row's own fade there, default 1) } }.
 * Returns { J: [x0, y0, x1, y1] (an open end: the trunk's arms a, b; Q the knee), K: [r, mode], C: [r, g, b] } (K [-1, -1] for none). rows(row).colour(u), when given, is the row's colour along it.
 */
export function joinOneJS(o) {
  const { e, atStart } = o, last = END_BASE - 1, colOf = (row, u) => (o.rows(row).colour ? o.rows(row).colour(u) : [0, 0, 0]);
  if (e > -0.5) {
    const ei = Math.floor(e + 0.1), tr = Math.floor(ei / END_BASE), sm = ei % END_BASE, T = o.rows(tr), fe = e - ei;
    const tb = (fe > 0.2 && fe < 0.3) || fe > 0.7, tf = fe > 0.45;
    const c = T.pts[sm], s0 = Math.max(sm - 1, 0), s1 = Math.min(sm + 1, last);
    const sp = Math.max(len(sub(T.pts[s1], T.pts[s0])) / Math.max(s1 - s0, 1), 1e-4);
    const r = T.rad[sm], hl = Math.max(sp, JOIN_REACH * r);
    const pq = o.pq ?? 0, ts = joinThruSideJS(tb, tf, sm), nx = pq > 0 ? { pts: o.rows(Math.floor((pq - 1) / 2)).pts, atEnd: (pq - 1) % 2 === 1 } : null;
    const a = joinArmJS(T.pts, sm, -1, sp, hl, tb, ts < 0 ? nx : null), b = joinArmJS(T.pts, sm, 1, sp, hl, tf, ts > 0 ? nx : null);
    return { J: [a[0], a[1], b[0], b[1]], Q: [c[0], c[1]], K: [r, (o.own.tier ?? 0) > (T.tier ?? 0) + 0.5 ? JOIN_MODE.SOFT : JOIN_MODE.CUT], C: colOf(tr, sm / last), PT: sm === last && !tf ? -2 : sm === 0 && !tb ? -3 : -1, PK: joinPackJS(T.tier ?? 0, T.flags ?? 0, (T.alpha ?? 1) * (T.fadeAt ? T.fadeAt(c) : 1)) };
  }
  if (e < -1.5) {
    const k = Math.floor(-e + 0.5) - 2, pr = Math.floor(k / END_BASE), ps = k % END_BASE;
    if (o.id !== undefined && pr === o.id) {
      const P = o.own.pts, E = P[atStart ? 0 : last], dO = sub(E, P[atStart ? 2 : last - 2]), l0 = len(dO);
      return l0 > 1e-6 ? { J: [E[0], E[1], dO[0] / l0, dO[1] / l0], K: [0, JOIN_MODE.PLANE], C: colOf(pr, ps / last), PT: joinPackJS(o.own.tier ?? 0, o.own.flags ?? 0, (o.own.alpha ?? 1) * (o.own.fadeAt ? o.own.fadeAt(E) : 1)) } : { J: [0, 0, 0, 0], K: [-1, -1], C: [0, 0, 0], PT: -1 };
    }
    const P = o.own.pts, Q = o.rows(pr).pts;
    const E = P[atStart ? 0 : last], dO = sub(E, P[atStart ? 2 : last - 2]), dP = sub(Q[ps], Q[ps === 0 ? 2 : last - 2]);
    const lo = len(dO), lp = len(dP);
    if (lo > 1e-6 && lp > 1e-6) {
      const m = [dO[0] / lo - dP[0] / lp, dO[1] / lo - dP[1] / lp], lm = len(m);
      if (lm > 1e-4) return { J: [E[0], E[1], m[0] / lm, m[1] / lm], K: [Math.atan2((dO[0] / lo) * (-dP[1] / lp) - (dO[1] / lo) * (-dP[0] / lp), (dO[0] / lo) * (-dP[0] / lp) + (dO[1] / lo) * (-dP[1] / lp)) + 0, JOIN_MODE.PLANE], C: colOf(pr, ps / last), PT: joinPackJS(o.rows(pr).tier ?? 0, o.rows(pr).flags ?? 0, (o.rows(pr).alpha ?? 1) * (o.rows(pr).fadeAt ? o.rows(pr).fadeAt(E) : 1)) };
    }
  }
  return { J: [0, 0, 0, 0], K: [-1, -1], C: [0, 0, 0], PT: -1 };
}

/**
 * joinEnd in JS. o: { vI, J0, J1 (the vec4 as arrays), Q0, Q1 (an open end's knee), PT0, PT1 (the flag / partner pack), PK0, PK1 (an open end's trunk pack), K [r0, mode0, r1, mode1], C0, C1 (the other rows' colours at the two ends), p, R (vRad), px (world per device pixel) }. Returns { drop, fl, fo, wc, col }: the GLSL's JoinEnd.
 */
export function joinEndJS(o) {
  const { vI, p, R, px } = o, last = END_BASE - 1;
  const j = { drop: false, fl: 1, fo: 1, wc: 0, col: [0, 0, 0], pt: -1, rs: 0, rot: 0, tg: [0, 0], tw: 0 };
  const atStart = vI < JOIN_WIN;
  if (!atStart && !(vI > last - JOIN_WIN)) return j;
  const J = atStart ? o.J0 : o.J1, K = atStart ? [o.K[0], o.K[1]] : [o.K[2], o.K[3]];
  if (K[1] < -0.5) return j;
  const cw = Math.max(JOIN_COLOUR_R * R, JOIN_COLOUR_MIN);
  j.col = (atStart ? o.C0 : o.C1) ?? [0, 0, 0];
  if (K[1] > 1.5) {
    j.pt = (atStart ? o.PT0 : o.PT1) ?? -1;
    const s = (p[0] - J[0]) * J[2] + (p[1] - J[1]) * J[3];
    if (s > JOIN_CUT * px) {
      const ha = 0.5 * K[0], ch = Math.cos(ha), sh = Math.sin(ha), qx = p[0] - J[0], qy = p[1] - J[1];
      const wo = [ch * J[2] + sh * J[3], -sh * J[2] + ch * J[3]], wf = [ch * J[2] - sh * J[3], sh * J[2] + ch * J[3]];
      if (!(qx * wo[0] + qy * wo[1] > 0 && qx * wf[0] + qy * wf[1] < 0)) { j.drop = true; return j; }
    }
    j.wc = 0.5 * (1 - smooth(0, cw, -s));
    j.rs = smooth(-JOIN_RAMP_R * R, 0, s);
    j.rot = K[0] * 0.5 * (1 - smooth(0, Math.max(JOIN_TONE_R * R, JOIN_TONE_MIN), -s));
    return j;
  }
  const bx = J[2] - J[0], by = J[3] - J[1], qx = p[0] - J[0], qy = p[1] - J[1];
  const fw = (atStart ? o.PT0 : o.PT1) ?? -1, bl = Math.max(Math.hypot(bx, by), 1e-6);
  const beyond = fw < -1.5 && (fw < -2.5 ? qx * bx / bl + qy * by / bl < 0 : (p[0] - J[2]) * bx / bl + (p[1] - J[3]) * by / bl > 0);
  const Q = (atStart ? o.Q0 : o.Q1) ?? [(J[0] + J[2]) / 2, (J[1] + J[3]) / 2];   // (the knee; without one the arms are one straight chord)
  const gap = Math.min(segDist(p, [J[0], J[1]], Q), segDist(p, Q, [J[2], J[3]])) - K[0];
  const soft = K[1] > 0.5;
  if (gap < (soft ? -px : -JOIN_CUT_IN * px) && !beyond) { j.drop = true; return j; }
  const rk = smooth(0.3, 0.9, K[0] / Math.max(R, 1e-3)), rn = Math.min(R, K[0]);
  j.wc = (1 - smooth(0, Math.max(JOIN_COLOUR_R * rn, JOIN_COLOUR_MIN / 2), gap)) * rk;
  const nA = segNear(p, [J[0], J[1]], Q, beyond && fw > -2.5), nB = segNear(p, Q, [J[2], J[3]], beyond && fw < -2.5);
  const onA = beyond ? fw > -2.5 : Math.hypot(p[0] - nA[0], p[1] - nA[1]) < Math.hypot(p[0] - nB[0], p[1] - nB[1]), nt = onA ? nA : nB;
  j.tg = [(p[0] - nt[0]) / Math.max(K[0], 1e-3), (p[1] - nt[1]) / Math.max(K[0], 1e-3)];
  const tgap = beyond ? Math.max(Math.hypot(p[0] - nt[0], p[1] - nt[1]) - K[0], fw < -2.5 ? -(qx * bx + qy * by) / bl : ((p[0] - J[2]) * bx + (p[1] - J[3]) * by) / bl) : gap;
  j.tw = (1 - smooth(0, Math.max(JOIN_MOUTH_R * rn, JOIN_MOUTH_MIN), tgap)) * rk;
  if (soft && !beyond) { j.fl = smooth(-px, 0, gap); j.fo = j.fl; }
  j.pt = (atStart ? o.PK0 : o.PK1) ?? -1;
  j.rs = 1 - smooth(0, JOIN_FADE_N, atStart ? vI : last - vI);
  return j;
}

/** joinTone in JS: g [x, y] the unit direction across, j a joinEndJS result, rho the pixel's depth across its own vessel. */
export function joinToneJS(g, j, rho = 1) {
  const rot = j.rot ?? 0, tw = j.tw ?? 0, tg = j.tg ?? [0, 0], c = Math.cos(rot), s = Math.sin(rot), k = 1 / Math.max(rho, 1e-4);
  return [mix(c * g[0] - s * g[1], tg[0] * k, tw), mix(s * g[0] + c * g[1], tg[1] * k, tw)];
}
