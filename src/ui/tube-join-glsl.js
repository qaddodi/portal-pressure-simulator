// The Tube's seamless joins at a row's end (10 Nov 2026, Mohammad's device shots of 138d637): GLSL shared by the lean shader (tube-lean-glsl.js) and the lumen
// layer's shader (tube-lumen-glsl.js), with its JS twin for the tests. Pure strings and numbers, no GL calls.
//
// What went wrong without it: a branch's round end (its lumen, not only its outline) lay inside the trunk it ends on, and where the two differ in opacity (a
// faded vena cava, opaque hepatic veins: the tier alphas and the organ veil) that end showed through the trunk as a capsule; two rows meeting end to end drew
// a round cap each over the other, a ring where their opacities differ. A row's end is now one of
//   open end on a trunk        vEnd >= 0: trunk row * 64 + the trunk's sample there. The row draws nothing (lumen or outline) inside the trunk's lumen, and within
//                              JOIN_W radii of its wall takes the trunk's colour and opacity, more and more, so the branch fades into the trunk's own look.
//   continuation of a row      vEnd <= -2: -(2 + partner row * 64 + the partner's end sample). Both rows end at the bisector plane of the break (the plane through
//                              the shared end point whose normal is own outward direction less the partner's): a pixel beyond it is the partner's and is
//                              dropped, so the two are one surface, with no cap and no end outline. Within JOIN_W radii of the plane each takes half of the
//                              partner's look, so both meet at the same colour and opacity on it.
//   -1                         none.
// A pixel only looks at an end when its sample position vI lies within JOIN_WIN samples of that end (vEnd.x at the start, vEnd.y at the end).
export const END_BASE = 64;                  // vEnd's packing of a sample (the plan's contract: N_SAMPLES)
export const END_SEGS = 2;                   // the trunk's centreline is read over this many segments each side of the sample the branch ends at
export const JOIN_WIN = 8;                   // samples from an end within which a pixel looks at it
export const JOIN_W = 1.5;                   // radii over which a row takes on the other's look
export const JOIN_CUT = 0.25;                // device pixels: how far past the bisector plane a continuation still draws (so the two leave no hairline)
export const JOIN_NONE = -1;

/** vEnd's value for an open end on a trunk row at sample `sample`. */
export const endTrunk = (row, sample) => row * END_BASE + sample;
/** vEnd's value for the continuation of `row` at its end sample `sample`. */
export const endContinues = (row, sample) => -(2 + row * END_BASE + sample);
/** Which kind a vEnd value is: 'none', 'trunk' or 'continues'. */
export const endKind = (v) => (v > -0.5 ? 'trunk' : v < -1.5 ? 'continues' : 'none');

/**
 * The GLSL: trunkGap, the struct JoinEnd, joinEnd (the geometry, early: whether the pixel is the other row's, and how much of its look it takes), the struct
 * JoinLook and joinOther (the other row's colour and opacity at the pixel, late: the caller has vesAttrs, tierAlpha, tierGroup and netAlpha in scope). N_SAMPLES: 64.
 * Needs in scope: PT(id, i), the `rad` texture, vesAttrs.
 */
export const tubeJoinGLSL = (N_SAMPLES) => {
  if (N_SAMPLES !== END_BASE) throw new Error('tube-join-glsl: vEnd packs a row as row * 64 + sample, so N_SAMPLES must be 64');
  const LAST = N_SAMPLES - 1;
  return `// ---- a row's end on another row (tube-join-glsl.js) ----
uniform int joinCut;   // 0: none of this runs (the lobule: a row's ends carry no trunk; 1 the figure)
// How far p lies inside (negative) or outside the trunk's lumen the row ends on: the distance to its centreline over the ${END_SEGS * 2} segments about its sample,
// less its radius there. e: trunk row * ${END_BASE} + sample.
float trunkGap(vec2 p, int e) {
  int tr = e / ${END_BASE}, sm = e % ${END_BASE};
  float best = 1e9;
  for (int k = -${END_SEGS}; k < ${END_SEGS}; k++) {
    int j = clamp(sm + k, 0, ${N_SAMPLES - 2});
    vec2 a = PT(tr, j), ba = PT(tr, j + 1) - a;
    vec2 rr = texelFetch(rad, ivec2(j, tr), 0).rg;
    float h = clamp(dot(p - a, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    best = min(best, length(p - a - ba * h) - mix(rr.x, rr.y, h));
  }
  return best;
}
struct JoinEnd { bool drop; float w; int row; float u; };   // drop: the pixel is the other row's; w: the share of the other's look it takes (0..1); row, u: the other row and the place on it
JoinEnd joinEnd(int id, float vI, vec2 vEnd, vec2 p, float R, float px) {
  JoinEnd j;
  j.drop = false; j.w = 0.0; j.row = 0; j.u = 0.0;
  if (joinCut == 0) return j;
  float e = vI < ${JOIN_WIN}.0 ? vEnd.x : vI > ${LAST - JOIN_WIN}.0 ? vEnd.y : -1.0;
  if (e > -0.5) {
    int ei = int(e + 0.5);
    float gap = trunkGap(p, ei);
    if (gap < -0.5 * px) { j.drop = true; return j; }
    j.w = 1.0 - smoothstep(0.0, ${JOIN_W} * R, gap);
    j.row = ei / ${END_BASE};
    j.u = float(ei % ${END_BASE}) / ${LAST}.0;
  } else if (e < -1.5) {
    int k = int(-e + 0.5) - 2;
    int pr = k / ${END_BASE}, ps = k % ${END_BASE};
    bool atStart = vI < ${JOIN_WIN}.0;
    vec2 E = PT(id, atStart ? 0 : ${LAST});
    vec2 dO = E - PT(id, atStart ? 2 : ${LAST - 2});
    vec2 dP = PT(pr, ps) - PT(pr, ps == 0 ? 2 : ${LAST - 2});
    float lo = length(dO), lp = length(dP);
    if (lo > 1e-6 && lp > 1e-6) {
      vec2 m = dO / lo - dP / lp;
      float lm = length(m);
      if (lm > 1e-4) {
        float s = dot(p - E, m / lm);
        if (s > ${JOIN_CUT} * px) { j.drop = true; return j; }
        j.w = 0.5 * (1.0 - smoothstep(0.0, ${JOIN_W} * R, -s));
        j.row = pr;
        j.u = float(ps) / ${LAST}.0;
      }
    }
  }
  return j;
}
struct JoinLook { vec3 col; float aC; float aL; };   // the other row's colour, the opacity its colour carries (aC) and its lumen's opacity (aL), as the shader computes its own
JoinLook joinOther(JoinEnd e, vec2 p, float occl) {
  float aTier, aZ, aFlag, aWall, aOf, aHov, aSel, aA;
  vec3 aCol, aEdge;
  vesAttrs(e.row, e.u, e.u, p, occl, aTier, aZ, aFlag, aWall, aOf, aCol, aHov, aSel, aEdge, aA);
  int ti = int(aTier + 0.5);
  int grp = tierGroup[ti];
  float wsel = grp == 1 ? aSel : 0.0;
  JoinLook l;
  l.col = aCol;
  l.aC = aA * tierAlpha[ti] * (grp == 0 ? 1.0 - occl * aOf : 1.0);
  l.aL = aA * tierAlpha[ti] * (grp == 0 ? 1.0 - occl * aOf : grp == 1 ? mix(netAlpha, 1.0, wsel) : 1.0);
  return l;
}
`;
};

// ---- the same decisions in JS, for the tests ----

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (a) => Math.hypot(a[0], a[1]);

/** trunkGap in JS: p [x, y]; pts the trunk's points [[x, y], ...]; rad the radii [[r0, r1] per segment]; sample the sample the branch ends at. Negative: inside the trunk's lumen. */
export function trunkGapJS(p, pts, rad, sample) {
  let best = 1e9;
  const last = pts.length - 2;
  for (let k = -END_SEGS; k < END_SEGS; k++) {
    const j = clamp(sample + k, 0, last), a = pts[j], b = pts[j + 1];
    const bx = b[0] - a[0], by = b[1] - a[1], px = p[0] - a[0], py = p[1] - a[1];
    const h = clamp((px * bx + py * by) / Math.max(bx * bx + by * by, 1e-8), 0, 1);
    const r = rad[j][0] * (1 - h) + rad[j][1] * h;
    best = Math.min(best, Math.hypot(px - bx * h, py - by * h) - r);
  }
  return best;
}

/**
 * joinEnd in JS. o: { vI, vEnd [x, y], p, R (vRad), px (world per device pixel), own: { pts: [[x, y] x 64] } (this row's points), rows: (row) => { pts, rad } (any row's) }.
 * Returns { drop, w, row, u }: the same four numbers as the GLSL's JoinEnd.
 */
export function joinEndJS(o) {
  const { vI, vEnd, p, R, px } = o, last = END_BASE - 1;
  const j = { drop: false, w: 0, row: 0, u: 0 };
  const e = vI < JOIN_WIN ? vEnd[0] : vI > last - JOIN_WIN ? vEnd[1] : -1;
  if (e > -0.5) {
    const ei = Math.floor(e + 0.5), tr = Math.floor(ei / END_BASE), sm = ei % END_BASE, T = o.rows(tr);
    const gap = trunkGapJS(p, T.pts, T.rad, sm);
    if (gap < -0.5 * px) { j.drop = true; return j; }
    j.w = 1 - smooth(0, JOIN_W * R, gap);
    j.row = tr; j.u = sm / last;
  } else if (e < -1.5) {
    const k = Math.floor(-e + 0.5) - 2, pr = Math.floor(k / END_BASE), ps = k % END_BASE, atStart = vI < JOIN_WIN;
    const P = o.own.pts, Q = o.rows(pr).pts;
    const E = P[atStart ? 0 : last], dO = sub(E, P[atStart ? 2 : last - 2]), dP = sub(Q[ps], Q[ps === 0 ? 2 : last - 2]);
    const lo = len(dO), lp = len(dP);
    if (lo > 1e-6 && lp > 1e-6) {
      const m = [dO[0] / lo - dP[0] / lp, dO[1] / lo - dP[1] / lp], lm = len(m);
      if (lm > 1e-4) {
        const s = ((p[0] - E[0]) * m[0] + (p[1] - E[1]) * m[1]) / lm;
        if (s > JOIN_CUT * px) { j.drop = true; return j; }
        j.w = 0.5 * (1 - smooth(0, JOIN_W * R, -s));
        j.row = pr; j.u = ps / last;
      }
    }
  }
  return j;
}

/** The opacity a pixel takes given its own (own) and the other's (other) and the share w the join gives the other: what the shaders multiply into colour and lumen. */
export const joinMix = (own, other, w) => own + (other - own) * w;
/** The factor the shaders multiply a pixel's colour (or lumen) opacity by: joinMix over the pixel's own, with the same floor. */
export const joinRatio = (own, other, w) => joinMix(own, other, w) / Math.max(own, 1e-3);
