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
// so a fragment does one point-to-segment distance (or one dot product) and a smoothstep or two, and reads nothing. Both ends' colours are no longer blended with the
// other row's (that took a second row's attributes in the fragment shader): an opacity step at a continuation is left, and a fading branch shows the trunk's own picture.
export const END_BASE = 64;                  // vEnd's packing of a sample (the plan's contract: N_SAMPLES)
export const END_SEGS = 2;                   // (the multi-segment reference trunkGapJS reads this many segments each side of the sample, for the tests)
export const JOIN_WIN = 8;                   // samples from an end within which a pixel looks at it
export const JOIN_REACH = 2;                 // radii: the trunk's chord reaches at least this far each way from the sample
export const JOIN_FADE_IN = 1.0;             // radii inside the trunk's wall at which a fading branch's lumen is gone
export const JOIN_FADE_OUT = 0.6;            // radii outside the wall at which it starts to go
export const JOIN_FADE_LINE = 0.35;          // radii inside the wall at which its outline is gone
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
vec4 joinOne(int id, float e, bool atStart, out vec2 K) {
  K = vec2(-1.0, -1.0);
  if (e > -0.5) {
    int ei = int(e + 0.5), tr = ei / ${END_BASE}, sm = ei % ${END_BASE};
    vec2 c = PT(tr, sm);
    vec2 d = PT(tr, min(sm + 1, ${LAST})) - PT(tr, max(sm - 1, 0));
    float ld = length(d);
    float r = max(texelFetch(rad, ivec2(sm, tr), 0).r, MIN_RADIUS);
    d = ld > 1e-6 ? d / ld : vec2(1.0, 0.0);
    float hl = max(0.5 * ld, ${f(JOIN_REACH)} * r);
    K = vec2(r, texelFetch(tube, ivec2(2, id), 0).x > texelFetch(tube, ivec2(2, tr), 0).x + 0.5 ? 1.0 : 0.0);
    return vec4(c - d * hl, c + d * hl);
  }
  if (e < -1.5) {
    int k = int(-e + 0.5) - 2, pr = k / ${END_BASE}, ps = k % ${END_BASE};
    vec2 E = PT(id, atStart ? 0 : ${LAST});
    vec2 dO = E - PT(id, atStart ? 2 : ${LAST - 2});
    vec2 dP = PT(pr, ps) - PT(pr, ps == 0 ? 2 : ${LAST - 2});
    float lo = length(dO), lp = length(dP);
    if (lo > 1e-6 && lp > 1e-6) {
      vec2 m = dO / lo - dP / lp;
      float lm = length(m);
      if (lm > 1e-4) { K = vec2(0.0, 2.0); return vec4(E, m / lm); }
    }
  }
  return vec4(0.0);
}
void joinOut(int id, vec2 ends) {
  vJ0 = vec4(0.0); vJ1 = vec4(0.0); vJK = vec4(-1.0);
  if (ends.x != -1.0 || ends.y != -1.0) {
    vec2 k0, k1;
    vJ0 = joinOne(id, ends.x, true, k0);
    vJ1 = joinOne(id, ends.y, false, k1);
    vJK = vec4(k0, k1);
  }
}
`;
};

/** What the web's vertex shader declares and writes in place of joinOut: the same outputs, no ends. */
export const JOIN_WEB_OUT_GLSL = `uniform int joinCut;
flat out vec4 vJ0;
flat out vec4 vJ1;
flat out vec4 vJK;`;
export const JOIN_WEB_SET_GLSL = 'vJ0 = vec4(0.0); vJ1 = vec4(0.0); vJK = vec4(-1.0);';

/** The same declarations as the fragment shaders take them in (the varyings the vertex shaders write). */
export const JOIN_IN_GLSL = `flat in vec2 vEnd;                     // (the row's ends, which the vertex shaders hand on; the decisions are in vJ0, vJ1, vJK)
flat in vec4 vJ0;                      // the start's end data (tube-join-glsl.js)
flat in vec4 vJ1;                      // the end's
flat in vec4 vJK;                      // the start's (trunk radius, mode) and the end's`;

/**
 * The fragment shaders' part: joinEnd. drop: the pixel is the other row's (it is not drawn; in the depth prepass it writes no depth); fl: the factor on its lumen and
 * its colour (1 unless a branch is fading into its trunk); fo: the factor on its outline.
 */
export const tubeJoinFS = (N_SAMPLES) => {
  if (N_SAMPLES !== END_BASE) throw new Error('tube-join-glsl: vEnd packs a row as row * 64 + sample, so N_SAMPLES must be 64');
  const LAST = N_SAMPLES - 1;
  return `// ---- a row's end on another row (tube-join-glsl.js): the decisions, from the vertex shader's flat data; no reads ----
struct JoinEnd { bool drop; float fl; float fo; };
JoinEnd joinEnd(float vI, vec4 vJ0, vec4 vJ1, vec4 vJK, vec2 p, float R, float px) {
  JoinEnd j;
  j.drop = false; j.fl = 1.0; j.fo = 1.0;
  bool atStart = vI < ${JOIN_WIN}.0;
  if (!atStart && !(vI > ${LAST - JOIN_WIN}.0)) return j;
  vec4 J = atStart ? vJ0 : vJ1;
  vec2 K = atStart ? vJK.xy : vJK.zw;
  if (K.y < -0.5) return j;
  if (K.y > 1.5) {
    float s = dot(p - J.xy, J.zw);
    if (s > ${f(JOIN_CUT)} * px) j.drop = true;
    return j;
  }
  vec2 ba = J.zw - J.xy;
  float h = clamp(dot(p - J.xy, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  float gap = length(p - J.xy - ba * h) - K.x;
  if (K.y < 0.5) {
    if (gap < -0.5 * px) j.drop = true;
  } else {
    j.fl = smoothstep(-${f(JOIN_FADE_IN)} * R, ${f(JOIN_FADE_OUT)} * R, gap);
    j.fo = smoothstep(-${f(JOIN_FADE_LINE)} * R, 0.0, gap);
    if (gap < -${f(JOIN_FADE_IN)} * R) j.drop = true;
  }
  return j;
}
`;
};

// ---- the same decisions in JS, for the tests ----

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (a) => Math.hypot(a[0], a[1]);

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
 * Returns { J: [x0, y0, x1, y1], K: [r, mode] } (K [-1, -1] for none).
 */
export function joinOneJS(o) {
  const { e, atStart } = o, last = END_BASE - 1;
  if (e > -0.5) {
    const ei = Math.floor(e + 0.5), tr = Math.floor(ei / END_BASE), sm = ei % END_BASE, T = o.rows(tr);
    const c = T.pts[sm], d0 = sub(T.pts[Math.min(sm + 1, last)], T.pts[Math.max(sm - 1, 0)]), ld = len(d0);
    const r = T.rad[sm];
    const d = ld > 1e-6 ? [d0[0] / ld, d0[1] / ld] : [1, 0], hl = Math.max(0.5 * ld, JOIN_REACH * r);
    return { J: [c[0] - d[0] * hl, c[1] - d[1] * hl, c[0] + d[0] * hl, c[1] + d[1] * hl], K: [r, (o.own.tier ?? 0) > (T.tier ?? 0) + 0.5 ? JOIN_MODE.FADE : JOIN_MODE.CUT] };
  }
  if (e < -1.5) {
    const k = Math.floor(-e + 0.5) - 2, pr = Math.floor(k / END_BASE), ps = k % END_BASE;
    const P = o.own.pts, Q = o.rows(pr).pts;
    const E = P[atStart ? 0 : last], dO = sub(E, P[atStart ? 2 : last - 2]), dP = sub(Q[ps], Q[ps === 0 ? 2 : last - 2]);
    const lo = len(dO), lp = len(dP);
    if (lo > 1e-6 && lp > 1e-6) {
      const m = [dO[0] / lo - dP[0] / lp, dO[1] / lo - dP[1] / lp], lm = len(m);
      if (lm > 1e-4) return { J: [E[0], E[1], m[0] / lm, m[1] / lm], K: [0, JOIN_MODE.PLANE] };
    }
  }
  return { J: [0, 0, 0, 0], K: [-1, -1] };
}

/**
 * joinEnd in JS. o: { vI, J0, J1 (the vec4 as arrays), K [r0, mode0, r1, mode1], p, R (vRad), px (world per device pixel) }. Returns { drop, fl, fo }: the GLSL's JoinEnd.
 */
export function joinEndJS(o) {
  const { vI, p, R, px } = o, last = END_BASE - 1;
  const j = { drop: false, fl: 1, fo: 1 };
  const atStart = vI < JOIN_WIN;
  if (!atStart && !(vI > last - JOIN_WIN)) return j;
  const J = atStart ? o.J0 : o.J1, K = atStart ? [o.K[0], o.K[1]] : [o.K[2], o.K[3]];
  if (K[1] < -0.5) return j;
  if (K[1] > 1.5) {
    const s = (p[0] - J[0]) * J[2] + (p[1] - J[1]) * J[3];
    if (s > JOIN_CUT * px) j.drop = true;
    return j;
  }
  const bx = J[2] - J[0], by = J[3] - J[1], qx = p[0] - J[0], qy = p[1] - J[1];
  const h = clamp((qx * bx + qy * by) / Math.max(bx * bx + by * by, 1e-8), 0, 1);
  const gap = Math.hypot(qx - bx * h, qy - by * h) - K[0];
  if (K[1] < 0.5) {
    if (gap < -0.5 * px) j.drop = true;
  } else {
    j.fl = smooth(-JOIN_FADE_IN * R, JOIN_FADE_OUT * R, gap);
    j.fo = smooth(-JOIN_FADE_LINE * R, 0, gap);
    if (gap < -JOIN_FADE_IN * R) j.drop = true;
  }
  return j;
}
