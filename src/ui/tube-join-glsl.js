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
//   vJ0, vJ1  (vec4, the start's and the end's)  an open end: the chord of the trunk about the sample, a to b, lengthened to at least JOIN_REACH radii each way;
//                              a continuation: the end point and the plane's unit normal.
//   vJK       (vec4: start's (r, mode), end's (r, mode))  r the trunk's radius there; mode 0 cut, 1 fade, 2 a continuation (valid), -1 none.
//   vC0, vC1  (vec4, rgb: the other row's colour at its end: the trunk's at the sample, the partner's at its end sample)
// so a fragment does one point-to-segment distance (or one dot product) and a smoothstep or two, and reads nothing. A cut end and a continuation also blend their COLOUR
// into the other row's over JOIN_COLOUR_R radii (at least JOIN_COLOUR_MIN world units) from the wall or the plane (a continuation takes half of it at the plane, so the two
// rows meet at the mean): where a lens colours two rows differently there is no step at the join (Mohammad, 10 Nov). A fading branch needs none: the trunk's own
// picture shows through it. Opacity steps are left.
export const END_BASE = 64;                  // vEnd's packing of a sample (the plan's contract: N_SAMPLES)
export const END_SEGS = 2;                   // (the multi-segment reference trunkGapJS reads this many segments each side of the sample, for the tests)
export const JOIN_WIN = 8;                   // samples from an end within which a pixel looks at it
export const JOIN_REACH = 2;                 // radii: the trunk's chord reaches at least this far each way from the sample
export const JOIN_FADE_IN = 1.8;             // radii inside the trunk's wall at which a fading branch's lumen is gone
export const JOIN_FADE_OUT = 1.0;            // radii outside the wall at which it starts to go
export const JOIN_FADE_LINE = 0.7;          // radii inside the wall at which its outline is gone
export const JOIN_COLOUR_R = 3;              // radii over which a row's colour blends into the other's at a cut end or a continuation (at least JOIN_COLOUR_MIN world units)
export const JOIN_COLOUR_MIN = 8;
export const JOIN_RAMP_R = 3;                // radii before a continuation's plane over which the more opaque row eases to the other's opacity (no step in the look where the tiers differ)
export const JOIN_F_VEIL = 128, JOIN_F_WHOLE = 256;   // veins-gl.js's flag bits (not imported: veins-gl.js imports this module's callers)
export const JOIN_TONE_R = 4;                // radii (at least JOIN_TONE_MIN world units) over which the cel tones' light direction turns from a row's own to the mean at a continuation's plane, and a cut branch's tones ease in from the trunk's wall
export const JOIN_TONE_MIN = 16;
export const JOIN_TAPER_R = 1.2;             // radii: a fading branch's lumen rises from nothing at its own end point over this far, so its round end cap leaves no ghost inside the trunk
export const JOIN_CUT = 0.25;                // device pixels: how far past the bisector plane a continuation still draws (so the two leave no hairline)
export const JOIN_NONE = -1;
export const JOIN_MODE = { CUT: 0, FADE: 1, PLANE: 2 };

/** vEnd's value for an open end on a trunk row at sample `sample`. */
export const endTrunk = (row, sample) => row * END_BASE + sample;
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
uniform int joinCut;                   // 0: no row has an end (vEnd is -1) and none of the join work runs; 1: the figure unless ?tubejoin=off
flat out vec4 vJ0;                     // the start's end data: an open end: the trunk's chord a, b; a continuation: the end point and the plane's unit normal
flat out vec4 vJ1;                     // the end's
flat out vec4 vJK;                     // the start's (trunk radius, mode), the end's (radius, mode): mode 0 cut, 1 fade, 2 plane, -1 none
flat out vec4 vC0;                     // the other row's colour at the start's end (rgb), and a continuation's partner's tier (w; -1 otherwise)
flat out vec4 vC1;                     // and at the end's
${JOIN_ALONG_GLSL}
vec3 joinColour(int row, float u) {
  return mix(texelFetch(tube, ivec2(0, row), 0).rgb, texelFetch(tube, ivec2(1, row), 0).rgb, joinAlong(row, u));
}
// The partner row's tier, veil and whole flags and alpha, packed in one float (tier + 32 veil + 64 whole + 128 alpha8): what the fragment needs to find its opacity there.
float joinPack(int row) {
  vec4 t1 = texelFetch(tube, ivec2(1, row), 0), t2 = texelFetch(tube, ivec2(2, row), 0);
  int fl = int(t2.z + 0.5);
  return float(int(t2.x + 0.5) + ((fl & ${JOIN_F_VEIL}) != 0 ? 32 : 0) + ((fl & ${JOIN_F_WHOLE}) != 0 ? 64 : 0) + 128 * int(clamp(t1.w, 0.0, 1.0) * 255.0 + 0.5));
}
vec4 joinOne(int id, float e, bool atStart, out vec2 K, out vec4 C) {
  K = vec2(-1.0, -1.0);
  C = vec4(0.0, 0.0, 0.0, -1.0);   // (w: a continuation's partner's tier, for the opacity ramp)
  if (e > -0.5) {
    int ei = int(e + 0.5), tr = ei / ${END_BASE}, sm = ei % ${END_BASE};
    vec2 c = PT(tr, sm);
    vec2 d = PT(tr, min(sm + 1, ${LAST})) - PT(tr, max(sm - 1, 0));
    float ld = length(d);
    float r = max(texelFetch(rad, ivec2(sm, tr), 0).r, MIN_RADIUS);
    d = ld > 1e-6 ? d / ld : vec2(1.0, 0.0);
    float hl = max(0.5 * ld, ${f(JOIN_REACH)} * r);
    // (The chord reaches no further than the trunk does: past the trunk's own end nothing of it is drawn, and a branch cut there leaves a black wedge, 10 Nov, the portal fork.)
    float hb = min(hl, length(c - PT(tr, 0))), hf = min(hl, length(PT(tr, ${LAST}) - c));
    K = vec2(r, texelFetch(tube, ivec2(2, id), 0).x > texelFetch(tube, ivec2(2, tr), 0).x + 0.5 ? 1.0 : 0.0);
    C.rgb = joinColour(tr, float(sm) / ${LAST}.0);
    C.w = sm == ${LAST} ? -2.0 : sm == 0 ? -3.0 : -1.0;   // (the trunk's own end: with its cap gone the chord ends flat there, so the branch is drawn beyond it)
    return vec4(c - d * hb, c + d * hf);
  }
  if (e < -1.5) {
    int k = int(-e + 0.5) - 2, pr = k / ${END_BASE}, ps = k % ${END_BASE};
    vec2 E = PT(id, atStart ? 0 : ${LAST});
    vec2 dO = E - PT(id, atStart ? 2 : ${LAST - 2});
    if (pr == id) {   // a trunk's own end that branches leave from, with no row carrying on: it ends flat, its round cap gone (the branches' own caps and the web make the fork)
      float l0 = length(dO);
      if (l0 > 1e-6) { K = vec2(0.0, 2.0); C = vec4(joinColour(id, float(ps) / ${LAST}.0), joinPack(id)); return vec4(E, dO / l0); }
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
        C = vec4(joinColour(pr, float(ps) / ${LAST}.0), joinPack(pr));
        return vec4(E, m / lm);
      }
    }
  }
  return vec4(0.0);
}
void joinOut(int id, vec2 ends) {
  vJ0 = vec4(0.0); vJ1 = vec4(0.0); vJK = vec4(-1.0); vC0 = vec4(0.0); vC1 = vec4(0.0);
  if (ends.x != -1.0 || ends.y != -1.0) {
    vec2 k0, k1;
    vec4 c0, c1;
    vJ0 = joinOne(id, ends.x, true, k0, c0);
    vJ1 = joinOne(id, ends.y, false, k1, c1);
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
struct JoinEnd { bool drop; float fl; float fo; float wc; vec3 col; float pt; float rs; float rot; float tk; float tp; };   // wc: the share of the other row's colour col this pixel takes
JoinEnd joinEnd(float vI, vec4 vJ0, vec4 vJ1, vec4 vJK, vec4 vC0, vec4 vC1, vec2 p, float R, float px) {
  JoinEnd j;
  j.drop = false; j.fl = 1.0; j.fo = 1.0; j.wc = 0.0; j.col = vec3(0.0); j.pt = -1.0; j.rs = 0.0; j.rot = 0.0; j.tk = 1.0; j.tp = 0.0;
  bool atStart = vI < ${JOIN_WIN}.0;
  if (!atStart && !(vI > ${LAST - JOIN_WIN}.0)) return j;
  vec4 J = atStart ? vJ0 : vJ1;
  vec2 K = atStart ? vJK.xy : vJK.zw;
  if (K.y < -0.5) return j;
  float cw = max(${f(JOIN_COLOUR_R)} * R, ${f(JOIN_COLOUR_MIN)});
  j.col = (atStart ? vC0 : vC1).rgb;
  if (K.y > 1.5) {
    j.pt = (atStart ? vC0 : vC1).w;
    float s = dot(p - J.xy, J.zw);
    if (s > ${f(JOIN_CUT)} * px) { j.drop = true; return j; }
    j.wc = 0.5 * (1.0 - smoothstep(0.0, cw, -s));
    j.rs = smoothstep(-${f(JOIN_RAMP_R)} * R, 0.0, s);
    j.rot = K.x * 0.5 * (1.0 - smoothstep(0.0, max(${f(JOIN_TONE_R)} * R, ${f(JOIN_TONE_MIN)}), -s));
    return j;
  }
  vec2 ba = J.zw - J.xy;
  float h = clamp(dot(p - J.xy, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  float gap = length(p - J.xy - ba * h) - K.x;
  // (A trunk's own end, its cap gone: past it the pixel is the branch's, whatever the chord's round end says.)
  float fw = (atStart ? vC0 : vC1).w;
  bool beyond = false;
  if (fw < -1.5) {
    vec2 dn = ba / max(length(ba), 1e-6);
    beyond = fw < -2.5 ? dot(p - J.xy, dn) < 0.0 : dot(p - J.zw, dn) > 0.0;
  }
  if (K.y < 0.5) {
    if (gap < -0.5 * px && !beyond) { j.drop = true; return j; }
    // (A trunk much narrower than the branch — a small tributary the join happens to mark as its trunk — does not recolour or flatten the wide branch: the share rk, and the reach by the narrower of the two.)
    float rk = smoothstep(0.3, 0.9, K.x / max(R, 1e-3)), rn = min(R, K.x);
    j.wc = (1.0 - smoothstep(0.0, max(${f(JOIN_COLOUR_R)} * rn, ${f(JOIN_COLOUR_MIN / 2)}), gap)) * rk;
    j.tk = mix(1.0, smoothstep(0.0, max(${f(JOIN_TONE_R)} * rn, ${f(JOIN_TONE_MIN / 2)}), gap), rk);
  } else if (beyond) {
    return j;
  } else {
    j.tp = atStart ? 2.0 : 1.0;
    j.fl = smoothstep(-${f(JOIN_FADE_IN)} * R, ${f(JOIN_FADE_OUT)} * R, gap);
    j.fo = smoothstep(-${f(JOIN_FADE_LINE)} * R, 0.0, gap);
    if (gap < -${f(JOIN_FADE_IN)} * R) j.drop = true;
  }
  return j;
}
// The cel tones' direction across the vessel, turned toward the next row's across a continuation and eased flat toward a trunk's wall at a cut branch's mouth: one tone field over the join.
vec2 joinTone(vec2 g, JoinEnd j) {
  float c = cos(j.rot), s = sin(j.rot);
  return vec2(c * g.x - s * g.y, s * g.x + c * g.y) * j.tk;
}
// A fading branch's lumen from nothing at its own end point (u 0-1 along it, L its length, R its radius here).
float joinTaper(JoinEnd j, float u, float L, float R) {
  return j.tp < 0.5 ? 1.0 : smoothstep(0.0, ${f(JOIN_TAPER_R)} * R, (j.tp > 1.5 ? u : 1.0 - u) * L);
}
`;
};

// ---- the same decisions in JS, for the tests ----

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a * (1 - t) + b * t;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (a) => Math.hypot(a[0], a[1]);

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

/**
 * joinOne in JS: one end's data. o: { e (the vEnd value), atStart, own: { pts: [[x, y] x 64], tier }, rows: (row) => { pts, rad (a number a sample), tier } }.
 * Returns { J: [x0, y0, x1, y1], K: [r, mode], C: [r, g, b] } (K [-1, -1] for none). rows(row).colour(u), when given, is the row's colour along it.
 */
export function joinOneJS(o) {
  const { e, atStart } = o, last = END_BASE - 1, colOf = (row, u) => (o.rows(row).colour ? o.rows(row).colour(u) : [0, 0, 0]);
  if (e > -0.5) {
    const ei = Math.floor(e + 0.5), tr = Math.floor(ei / END_BASE), sm = ei % END_BASE, T = o.rows(tr);
    const c = T.pts[sm], d0 = sub(T.pts[Math.min(sm + 1, last)], T.pts[Math.max(sm - 1, 0)]), ld = len(d0);
    const r = T.rad[sm];
    const d = ld > 1e-6 ? [d0[0] / ld, d0[1] / ld] : [1, 0], hl = Math.max(0.5 * ld, JOIN_REACH * r);
    const hb = Math.min(hl, len(sub(c, T.pts[0]))), hf = Math.min(hl, len(sub(T.pts[last], c)));
    return { J: [c[0] - d[0] * hb, c[1] - d[1] * hb, c[0] + d[0] * hf, c[1] + d[1] * hf], K: [r, (o.own.tier ?? 0) > (T.tier ?? 0) + 0.5 ? JOIN_MODE.FADE : JOIN_MODE.CUT], C: colOf(tr, sm / last), PT: sm === last ? -2 : sm === 0 ? -3 : -1 };
  }
  if (e < -1.5) {
    const k = Math.floor(-e + 0.5) - 2, pr = Math.floor(k / END_BASE), ps = k % END_BASE;
    if (o.id !== undefined && pr === o.id) {
      const P = o.own.pts, E = P[atStart ? 0 : last], dO = sub(E, P[atStart ? 2 : last - 2]), l0 = len(dO);
      return l0 > 1e-6 ? { J: [E[0], E[1], dO[0] / l0, dO[1] / l0], K: [0, JOIN_MODE.PLANE], C: colOf(pr, ps / last), PT: joinPackJS(o.own.tier ?? 0, o.own.flags ?? 0, o.own.alpha ?? 1) } : { J: [0, 0, 0, 0], K: [-1, -1], C: [0, 0, 0], PT: -1 };
    }
    const P = o.own.pts, Q = o.rows(pr).pts;
    const E = P[atStart ? 0 : last], dO = sub(E, P[atStart ? 2 : last - 2]), dP = sub(Q[ps], Q[ps === 0 ? 2 : last - 2]);
    const lo = len(dO), lp = len(dP);
    if (lo > 1e-6 && lp > 1e-6) {
      const m = [dO[0] / lo - dP[0] / lp, dO[1] / lo - dP[1] / lp], lm = len(m);
      if (lm > 1e-4) return { J: [E[0], E[1], m[0] / lm, m[1] / lm], K: [Math.atan2((dO[0] / lo) * (-dP[1] / lp) - (dO[1] / lo) * (-dP[0] / lp), (dO[0] / lo) * (-dP[0] / lp) + (dO[1] / lo) * (-dP[1] / lp)) + 0, JOIN_MODE.PLANE], C: colOf(pr, ps / last), PT: joinPackJS(o.rows(pr).tier ?? 0, o.rows(pr).flags ?? 0, o.rows(pr).alpha ?? 1) };
    }
  }
  return { J: [0, 0, 0, 0], K: [-1, -1], C: [0, 0, 0], PT: -1 };
}

/**
 * joinEnd in JS. o: { vI, J0, J1 (the vec4 as arrays), K [r0, mode0, r1, mode1], C0, C1 (the other rows' colours at the two ends), p, R (vRad), px (world per device pixel) }. Returns { drop, fl, fo, wc, col }: the GLSL's JoinEnd.
 */
export function joinEndJS(o) {
  const { vI, p, R, px } = o, last = END_BASE - 1;
  const j = { drop: false, fl: 1, fo: 1, wc: 0, col: [0, 0, 0], pt: -1, rs: 0, rot: 0, tk: 1, tp: 0 };
  const atStart = vI < JOIN_WIN;
  if (!atStart && !(vI > last - JOIN_WIN)) return j;
  const J = atStart ? o.J0 : o.J1, K = atStart ? [o.K[0], o.K[1]] : [o.K[2], o.K[3]];
  if (K[1] < -0.5) return j;
  const cw = Math.max(JOIN_COLOUR_R * R, JOIN_COLOUR_MIN);
  j.col = (atStart ? o.C0 : o.C1) ?? [0, 0, 0];
  if (K[1] > 1.5) {
    j.pt = (atStart ? o.PT0 : o.PT1) ?? -1;
    const s = (p[0] - J[0]) * J[2] + (p[1] - J[1]) * J[3];
    if (s > JOIN_CUT * px) { j.drop = true; return j; }
    j.wc = 0.5 * (1 - smooth(0, cw, -s));
    j.rs = smooth(-JOIN_RAMP_R * R, 0, s);
    j.rot = K[0] * 0.5 * (1 - smooth(0, Math.max(JOIN_TONE_R * R, JOIN_TONE_MIN), -s));
    return j;
  }
  const bx = J[2] - J[0], by = J[3] - J[1], qx = p[0] - J[0], qy = p[1] - J[1];
  const fw = (atStart ? o.PT0 : o.PT1) ?? -1, bl = Math.max(Math.hypot(bx, by), 1e-6);
  const beyond = fw < -1.5 && (fw < -2.5 ? qx * bx / bl + qy * by / bl < 0 : (p[0] - J[2]) * bx / bl + (p[1] - J[3]) * by / bl > 0);
  const h = clamp((qx * bx + qy * by) / Math.max(bx * bx + by * by, 1e-8), 0, 1);
  const gap = Math.hypot(qx - bx * h, qy - by * h) - K[0];
  if (K[1] < 0.5) {
    if (gap < -0.5 * px && !beyond) { j.drop = true; return j; }
    const rk = smooth(0.3, 0.9, K[0] / Math.max(R, 1e-3)), rn = Math.min(R, K[0]);
    j.wc = (1 - smooth(0, Math.max(JOIN_COLOUR_R * rn, JOIN_COLOUR_MIN / 2), gap)) * rk;
    j.tk = mix(1, smooth(0, Math.max(JOIN_TONE_R * rn, JOIN_TONE_MIN / 2), gap), rk);
  } else if (beyond) {
    return j;
  } else {
    j.tp = atStart ? 2 : 1;
    j.fl = smooth(-JOIN_FADE_IN * R, JOIN_FADE_OUT * R, gap);
    j.fo = smooth(-JOIN_FADE_LINE * R, 0, gap);
    if (gap < -JOIN_FADE_IN * R) j.drop = true;
  }
  return j;
}

/** joinTone in JS: g [x, y] the unit direction across, j a joinEndJS result. */
export function joinToneJS(g, j) {
  const rot = j.rot ?? 0, tk = j.tk ?? 1, c = Math.cos(rot), s = Math.sin(rot);
  return [(c * g[0] - s * g[1]) * tk, (s * g[0] + c * g[1]) * tk];
}
/** joinTaper in JS: u 0-1 along the row, L its length, R its radius here. */
export function joinTaperJS(j, u, L, R) {
  const tp = j.tp ?? 0;
  return tp < 0.5 ? 1 : smooth(0, JOIN_TAPER_R * R, (tp > 1.5 ? u : 1 - u) * L);
}
