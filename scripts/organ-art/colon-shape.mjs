// The colon as anatomy atlases draw it, computed once from its centre lines (no DOM, so it ports to src/ui/ as is and
// can be unit-tested). stage.js samples each centre line evenly (getPointAtLength, as haustra() does today) and draws
// the paths this returns, limb by limb, back to front; the routes are data, kept beside the other organs in anatomy.js.
//
// The look follows the textbook frontal colon (Servier, Netter, Gray's): a chain of round, bulging pouches (haustra) in
// two rows, parted by a smooth pale band (the taenia) that runs along the outer side of the frame, so the row on the
// inner side is the wide one; deep creases between pouches; a round cecum with the appendix; a smooth sigmoid; and the
// rectum widening into its ampulla and narrowing to the anal canal. Flat cel shading only: each pouch is a shaded shape
// with a lit shape inside it, set toward the light (upper left, as on every organ).
//
// The flexures fold over toward the viewer, as the atlas draws them. The colon is three limbs, and at each flexure the
// limbs meet in one rounded corner (a joint): each limb runs on into the corner and is cut by its outline, so the
// outside of the bend is a single smooth curve. The transverse colon is drawn in front: its wide inner row lies over
// the end of the limb behind, hiding that limb's taenia, and its own taenia runs out over the outline of the corner.
// The limb behind takes a soft flat shade along the edge of the transverse colon (cel style, not a cast shadow).

// Centre lines in the plate's coordinates. The ascending colon from the cecum, low on the viewer's left where the ileum
// enters (the bowel ends at 424 874), straight up the right flank to the hepatic flexure under the liver. The transverse
// colon from that corner, setting off down and across, in a shallow sag in front of the duodenum's lower part, then
// steeply up to the splenic flexure against the spleen, the highest point. The descending colon from there, straight
// down the left flank, the sigmoid's sweep in to the midline, and the rectum down the midline (the rectal veins meet it
// at 786 928). z is the drawing order (higher in front); start and end say how each end is drawn: the cecum, a joint
// (the corner named in COLON_JOINTS), or the tail (sigmoid and rectum).
export const COLON_LIMBS = [
  { id: 'ascending', z: 1, start: 'cecum', end: 'hepatic', route: [
    [425, 880], [421, 850], [418, 808], [417, 760], [417, 712], [418, 664], [420, 630], [421, 600]] },
  { id: 'transverse', z: 2, start: 'hepatic', end: 'splenic', route: [
    [421, 600], [444, 619], [472, 635], [506, 645], [548, 651], [600, 655], [660, 659], [720, 661], [776, 658], [830, 647],
    [880, 627], [922, 602], [958, 574], [988, 544], [1014, 512], [1036, 482]] },
  { id: 'descending', z: 0, start: 'splenic', end: 'tail', route: [
    [1056, 494], [1056, 530], [1054, 566], [1052, 612], [1048, 662], [1042, 716], [1030, 768], [1010, 808], [980, 838],
    [942, 858], [900, 868], [860, 872], [826, 876], [802, 890], [790, 914], [786, 942], [786, 970], [786, 994]] },
];
// Each flexure's rounded corner: the outline round the ends of the limbs that meet there, the hull of a circle (centre,
// radius as a fraction of r) at each limb's end. The hepatic corner is one circle (the transverse colon starts where
// the ascending colon ends); at the splenic corner the two ends sit side by side, so it is one wide dome.
export const COLON_JOINTS = {
  hepatic: [[421, 600, 1]],
  splenic: [[1036, 482, 1], [1056, 494, 0.97]],
};
// The same colon in the atlas figure's proportions: a thicker tube (about 1.35 times), so the frame holds fewer,
// bigger pouches, and a transverse colon that hangs in a deep sag between the flexures, the splenic flexure higher
// than the hepatic, as Servier and Netter draw it.
export const COLON_LIMBS_FIG = [
  // Round 2 of the bowel page (his ask): the hepatic flexure raised to just under the liver and the transverse colon
  // lifted (sag 652 instead of 718), so the small bowel has more room in the middle.
  { id: 'ascending', z: 1, start: 'cecum', end: 'hepatic', route: [
    [425, 872], [422, 840], [420, 800], [419, 756], [420, 712], [421, 666], [423, 620], [425, 580], [428, 548]] },
  { id: 'transverse', z: 2, start: 'hepatic', end: 'splenic', route: [
    [428, 548], [452, 580], [484, 608], [526, 630], [580, 644], [640, 650], [702, 648], [758, 638], [810, 620], [858, 596],
    [900, 568], [938, 544], [970, 524], [998, 508], [1022, 496]] },
  { id: 'descending', z: 0, start: 'splenic', end: 'tail', route: [
    [1046, 508], [1050, 556], [1050, 606], [1048, 658], [1044, 712], [1034, 764], [1014, 808], [982, 840], [942, 860],
    [900, 870], [860, 874], [826, 878], [802, 892], [790, 916], [786, 944], [786, 972], [786, 1000]] },
];
export const COLON_JOINTS_FIG = {
  hepatic: [[428, 548, 1]],
  splenic: [[1022, 496, 1], [1046, 508, 0.97]],
};
// The same colon with each flexure a clean rounded elbow: the centre line turns round a 42 unit radius (a little more than the tube's half width), so the bowel
// bends smoothly with no limb lying across another, its pouches and taenia running on round the bend; the transverse
// colon leaves the hepatic flexure almost level and climbs to the splenic flexure.
export const COLON_LIMBS_ELBOW = [
  { id: 'ascending', z: 1, start: 'cecum', end: 'hepatic', route: [[425, 872], [422, 840], [420, 800], [419, 756], [420, 712], [422, 680], [424, 652], [425.2, 642.2], [428.6, 632.9], [434.1, 624.7], [441.3, 618]] },
  { id: 'transverse', z: 2, start: 'hepatic', end: 'splenic', route: [[441.3, 618], [449.9, 613.2], [459.4, 610.5], [469.3, 610.1], [479, 612.1], [505.6, 620.8], [540, 646], [590, 660], [644, 668], [700, 668], [752, 661], [800, 647], [846, 626], [886, 602], [910.1, 557.7], [936.9, 535.2], [959.9, 515.9], [979, 499.8], [988.6, 493.8], [999.4, 490.5], [1010.8, 490.3], [1021.7, 493.1]] },
  { id: 'descending', z: 0, start: 'splenic', end: 'tail', route: [[1021.7, 493.1], [1031.6, 498.7], [1039.5, 506.7], [1045.1, 516.6], [1047.8, 527.6], [1049, 580], [1048, 630], [1045, 684], [1038, 740], [1024, 790], [1000, 826], [966, 850], [926, 864], [884, 870], [846, 874], [818, 882], [800, 898], [790, 920], [786, 948], [786, 976], [786, 1000]] },
];
// Each elbow is split across the middle of its bend (the limbs meet there pouch to pouch).
export const COLON_JOINTS_ELBOW = {
  hepatic: [[441.3, 618.0, 1]],
  splenic: [[1021.7, 493.1, 1]],
};
// Landmarks on the descending limb for the width and the haustra: where the sigmoid starts (the haustra end there)
// and where the rectum starts.
const SIGMOID = [1010, 808], RECTUM = [802, 890];

const f1 = (v) => (Math.round(v * 10) / 10).toString();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const polyD = (pts, close = true) => 'M' + pts.map((p) => `${f1(p[0])} ${f1(p[1])}`).join('L') + (close ? 'Z' : '');
const area = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };

// A smooth curve through one limb's route points (chord-scaled Catmull-Rom as cubic Béziers).
export function routeD(P) {
  const n = P.length, get = (i) => P[clamp(i, 0, n - 1)];
  const tan = (i) => { const a = get(i - 1), b = get(i + 1), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  let d = `M${P[0][0]} ${P[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const p = P[i], q = P[i + 1], L = Math.hypot(q[0] - p[0], q[1] - p[1]) / 3, t0 = tan(i), t1 = tan(i + 1);
    d += ` C ${f1(p[0] + t0[0] * L)} ${f1(p[1] + t0[1] * L)} ${f1(q[0] - t1[0] * L)} ${f1(q[1] - t1[1] * L)} ${q[0]} ${q[1]}`;
  }
  return d;
}
// The organ's `d` (hit tests, highlight rings, the organ cover): the three limbs as one path of three pieces.
export const colonD = (limbs = COLON_LIMBS) => limbs.map((l) => routeD(l.route)).join(' ');

// One limb's centre line sampled evenly: arc lengths, smoothed tangents and normals, and a point at arc length si,
// v units across (positive: the normal's side, the inside of the frame), running on straight past either end.
function frame(pts) {
  const n = pts.length, s = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = s[n - 1], W = 5;
  const tg = pts.map((_, i) => {
    const a = pts[Math.max(0, i - W)], b = pts[Math.min(n - 1, i + W)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  });
  const nm = tg.map(([x, y]) => [-y, x]);
  // How far the wall may reach on the inside of a bend: a little less than the bend's radius, so the inner wall of the
  // sigmoid's sweep stays a smooth curve instead of folding through itself.
  const reach = tg.map((_, i) => {
    const a = Math.max(0, i - W), b = Math.min(n - 1, i + W), ds = (s[b] - s[a]) || 1;
    const kx = (tg[b][0] - tg[a][0]) / ds, ky = (tg[b][1] - tg[a][1]) / ds, k = Math.hypot(kx, ky);
    return { side: Math.sign(kx * nm[i][0] + ky * nm[i][1]), lim: k > 1e-4 ? 0.85 / k : Infinity };
  });
  const at = (si, v) => {
    if (si <= 0) { const t = tg[0]; return [pts[0][0] + t[0] * si + nm[0][0] * v, pts[0][1] + t[1] * si + nm[0][1] * v]; }
    if (si >= L) { const t = tg[n - 1]; return [pts[n - 1][0] + t[0] * (si - L) + nm[n - 1][0] * v, pts[n - 1][1] + t[1] * (si - L) + nm[n - 1][1] * v]; }
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] < si) lo = m; else hi = m; }
    const t = clamp((si - s[lo]) / ((s[hi] - s[lo]) || 1), 0, 1);
    const x = pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, y = pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t;
    const nx = nm[lo][0] + (nm[hi][0] - nm[lo][0]) * t, ny = nm[lo][1] + (nm[hi][1] - nm[lo][1]) * t, l = Math.hypot(nx, ny) || 1;
    const R = reach[t < 0.5 ? lo : hi];
    if (Math.sign(v) === R.side && Math.abs(v) > R.lim) v = R.side * R.lim;
    return [x + (nx / l) * v, y + (ny / l) * v];
  };
  const near = (p) => { let bi = 0, bd = Infinity; pts.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; bi = i; } }); return s[bi]; };
  return { pts, n, s, L, nm, at, near };
}

// The lit part of a shape: smaller, set toward the upper left. Its shade shows as a crescent on the lower right.
const lift = (P, k = 0.74, dx = -0.22, dy = -0.32) => {
  let cx = 0, cy = 0;
  for (const p of P) { cx += p[0]; cy += p[1]; }
  cx /= P.length; cy /= P.length;
  let ext = 0;
  for (const p of P) ext = Math.max(ext, Math.hypot(p[0] - cx, p[1] - cy));
  const ox = dx * ext * (1 - k) * 2.2, oy = dy * ext * (1 - k) * 2.2;
  return P.map(([x, y]) => [cx + (x - cx) * k + ox, cy + (y - cy) * k + oy]);
};

// The colon from each limb's centre line sampled evenly (about every 1.5 units): limbs as COLON_LIMBS with pts added.
// Options (plate units): r the tube's half width; lam one haustrum's length; band the taenia's width as a fraction of
// r; tags: fat tags (appendices epiploicae) every so many haustra, 0 for none. Returns { parts: [{ id, z, ...layers }] },
// each layer one path for the whole limb:
//   wall      the tube under the pouches (shows in the creases), round at the cecum, cut by the corner at a joint
//   pouch     every pouch (and the cecum), filled in the shade tone and outlined
//   lit       the lit part of every pouch, set toward the light
//   shine     short highlights on each pouch's shoulder
//   tail, tailWalls, tailLit   the smooth sigmoid and rectum: fill, its two walls (no line across its start), lit part
//   valves    the rectum's transverse folds, short creases from alternate walls
//   band      the taenia (filled)
//   tags      fat tags along the wall (filled), with tagsLit
export function colonAtlas(limbs, { r = 31, lam = 30, band = 0.34, tags = 0, joints = COLON_JOINTS, elbow = false, sigmoid = SIGMOID, rectum = RECTUM } = {}) {
  const F = limbs.map((l) => frame(l.pts));
  const g0 = [0];
  for (let i = 1; i < F.length; i++) g0.push(g0[i - 1] + F[i - 1].L);
  const last = F[F.length - 1], gl = g0[F.length - 1];
  const sSpl = gl, sSig = gl + last.near(sigmoid), sRec = gl + last.near(rectum), lr = gl + last.L - sRec;
  // Width along the whole colon (g: arc length from the cecum): the cecum widest, the descending colon a little
  // narrower, the sigmoid narrower still, the rectum widening into its ampulla and narrowing to the anal canal.
  const width = (g) => r * (1 + 0.1 * (1 - smooth(g / 110)) - 0.05 * smooth((g - sSpl) / 80) - 0.17 * smooth((g - sSig) / 60)
    + 0.3 * smooth((g - sRec) / 30) - 0.75 * smooth((g - sRec - lr * 0.55) / (lr * 0.45)));
  const bandH = band * r / 2;
  const sTail = sSig + 20;                        // the haustra end a little into the sigmoid
  // Inside a joint's corner: within the hull of its circles.
  const inJoint = (J, [x, y]) => {
    for (let q = 0; q <= 20; q++) {
      const t = J.length > 1 ? q / 20 : 0, a = J[0], b = J[J.length - 1];
      const cx = lerp(a[0], b[0], t), cy = lerp(a[1], b[1], t), cr = lerp(a[2], b[2], t) * r;
      if (Math.hypot(x - cx, y - cy) <= cr) return true;
    }
    return false;
  };
  const E = r * 2.6;                              // how far a limb runs on into a corner before the outline cuts it

  // Each limb's direction into the corners it meets (for an elbow, where its taenia meets the next limb's).
  const into = {};
  limbs.forEach((limb, li) => {
    const P = F[li].pts, n = P.length, k = Math.min(6, n - 1), dir = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    if (joints[limb.end]) (into[limb.end] ||= []).push({ li, a: dir(P[n - 1 - k], P[n - 1]) });
    if (joints[limb.start]) (into[limb.start] ||= []).push({ li, a: dir(P[k], P[0]) });
  });
  // On a limb's own side of the line that halves the corner between it and the other limb.
  const ownSide = (name, li) => {
    const m = into[name], me = m.find((q) => q.li === li), other = m.find((q) => q.li !== li), C = joints[name][0];
    if (!other) return () => true;
    const nx = me.a[0] - other.a[0], ny = me.a[1] - other.a[1];
    return ([x, y]) => (x - C[0]) * nx + (y - C[1]) * ny <= 0;
  };
  const parts = limbs.map((limb, li) => {
    const { s, n, L, nm, at: at0, pts } = F[li], G0 = g0[li], wd = (si) => width(G0 + Math.max(0, Math.min(L, si)));
    const JA = joints[limb.start], JB = joints[limb.end];
    // A point of the limb: past a joint end it runs on into the corner, and anything outside the corner's outline is
    // pulled back along the limb onto it.
    const pull = (J, end, si, v, keep = (P) => inJoint(J, P)) => {
      const dir = Math.sign(si - end);
      let lo, hi = end;
      while (Math.abs(hi - end) < Math.abs(si - end) && keep(at0(hi + dir * 2, v))) hi += dir * 2;
      if (Math.abs(hi - end) >= Math.abs(si - end)) return at0(si, v);
      lo = hi; hi = Math.abs(lo + dir * 2 - end) > Math.abs(si - end) ? si : lo + dir * 2;
      for (let q = 0; q < 10; q++) { const m = (lo + hi) / 2; if (keep(at0(m, v))) lo = m; else hi = m; }
      return at0(lo, v);
    };
    // At an elbow neither limb lies over the other: each runs into the corner only as far as the line halving it,
    // where it meets the next limb, pouch to pouch and taenia to taenia.
    const sideA = JA && elbow ? ownSide(limb.start, li) : () => true, sideB = JB && elbow ? ownSide(limb.end, li) : () => true;
    const at = (si, v) => (si > L && JB ? pull(JB, L, si, v, (P) => inJoint(JB, P) && sideB(P))
      : si < 0 && JA ? pull(JA, 0, si, v, (P) => inJoint(JA, P) && sideA(P)) : at0(si, v));
    const atBand = at;
    const p = { id: limb.id, z: limb.z, wall: '', pouch: '', lit: '', shine: '', tail: '', tailWalls: '', tailLit: '', valves: '', band: '', tags: '', tagsLit: '' };
    // Where the taenia runs across the tube (negative: the outer side): a little outside the middle on the ascending
    // colon, in the outer third on the transverse colon, outside the middle again on the descending colon.
    // At elbows it keeps one place on all three, so it runs on unbroken round each corner.
    const off = (elbow ? -0.25 : { ascending: -0.1, transverse: -0.32, descending: -0.25 }[limb.id]) * r;
    // The pouched stretch: from the cecum, or from inside a corner, to the sigmoid or into a corner (at an elbow, from
    // and to the middle of the bend, where the limbs meet at a crease).
    const uA = limb.start === 'cecum' ? lam * 1.5 : JA && !elbow ? -E : 0, uB = limb.end === 'tail' ? sTail - G0 : JB && !elbow ? L + E : L;
    const count = Math.max(1, Math.round((uB - uA) / lam)), step = (uB - uA) / count;
    // The cecum: one big round pouch, laid first so the haustra next to it cover its edge; fuller than the rest (the
    // appendix hangs from its lower inner side).
    if (limb.start === 'cecum') {
      const rc = wd(0) * 1.12, C = [], s0 = -rc * 0.8, s1 = uA + lam * 0.25;
      for (let q = 0; q < 44; q++) {
        const th = (q / 44) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
        C.push(at((s0 + s1) / 2 + (s1 - s0) / 2 * Math.sign(c) * Math.abs(c) ** (2 / 2.3), rc * Math.sign(sn) * Math.abs(sn) ** (2 / 2.3)));
      }
      p.pouch += polyD(C); p.lit += polyD(lift(C, 0.78));
    }
    // The haustra, two rows parted by the taenia: round, bulging pouches with deep creases between them, sharing their
    // creases so the wall reads as one scalloped tube; before the sigmoid they grow shallower. In a corner the outline
    // cuts them, and a pouch the outline leaves too small is dropped.
    let lastMid = uB;
    for (let k = 0; k < count; k++) {
      const a = uA + k * step, b = a + step, mid = (a + b) / 2;
      lastMid = mid;
      const fade = limb.end === 'tail' ? 1 - smooth((mid - (uB - step * 3)) / (step * 3.5)) : 1, dip = 0.24 * fade + 0.05;
      for (const side of [1, -1]) {
        const inner = off + side * bandH * 0.6, P = [];
        for (let q = 0; q <= 6; q++) { const t = q / 6, v = lerp(inner, side * wd(a) * (1 - dip), t); P.push(at(a + Math.sin(Math.PI * t) * step * 0.07, v)); }
        for (let q = 1; q < 16; q++) { const t = q / 16, si = a + step * t; P.push(at(si, side * wd(si) * (1 - dip + dip * Math.sin(Math.PI * t) ** 0.5))); }
        for (let q = 0; q <= 6; q++) { const t = 1 - q / 6, v = lerp(inner, side * wd(b) * (1 - dip), t); P.push(at(b - Math.sin(Math.PI * t) * step * 0.07, v)); }
        for (let q = 1; q < 6; q++) P.push(at(b - step * q / 6, inner));
        if (area(P) < step * wd(mid) * 0.12) continue;
        p.pouch += polyD(P); p.lit += polyD(lift(P));
        // A short highlight on the pouch's shoulder, inside its own row (the narrow outer row gets a smaller one).
        const R = wd(mid), room = R - side * off - bandH, v0 = off + side * (bandH + room * 0.18), v1 = off + side * (bandH + room * 0.5), sh = [];
        for (let q = 0; q < 12; q++) {
          const th = (q / 12) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
          sh.push(at(mid + step * 0.2 * Math.sign(c) * Math.abs(c), (v0 + v1) / 2 + (v1 - v0) / 2 * Math.sign(sn) * Math.abs(sn)));
        }
        if (area(sh) > 12) p.shine += polyD(sh);
      }
      if (tags && k % tags === 1 && mid > 0 && mid < L) {
        // A fat tag hangs from the wall: a small teardrop, pointing away from the tube, on alternate sides.
        const side = k % (tags * 2) === 1 ? 1 : -1, R = wd(mid), tear = [];
        for (let q = 0; q < 20; q++) {
          const th = (q / 20) * Math.PI * 2, rr = 0.22 * R * (1 + 0.3 * Math.cos(th));
          tear.push(at0(mid + Math.sin(th) * rr * 0.9, side * (R * 0.9 + 0.22 * R + Math.cos(th) * rr * 1.1)));
        }
        p.tags += polyD(tear); p.tagsLit += polyD(lift(tear, 0.62));
      }
    }
    // The wall under the pouches: round at the cecum, running on into a corner and cut by its outline.
    {
      const left = [], right = [], start = [], a = JA ? -E : 0, b = JB ? L + E : L;
      for (let si = a; si <= b + 1e-6; si += 1.5) { const R = wd(si) * (G0 + si < sTail ? 0.9 : 1); left.push(at(si, R)); right.push(at(si, -R)); }
      if (limb.start === 'cecum') for (let q = 1; q < 12; q++) { const ph = -Math.PI / 2 + (q / 12) * Math.PI, R = wd(0) * 0.9; start.push(at0(-Math.cos(ph) * R, Math.sin(ph) * R)); }
      p.wall = polyD([...left, ...right.reverse(), ...start]);
    }
    // The smooth sigmoid and rectum, drawn over the last pouch from its middle on, with no line across its start, so the
    // haustra run out into the smooth sigmoid without a cut; lit toward the upper left.
    if (limb.end === 'tail') {
      const iT = s.findIndex((v) => v >= lastMid), tl = [], tr = [], ll = [], lrr = [];
      for (let i = iT; i < n; i++) {
        const R = wd(s[i]), q = pts[i], [nx, ny] = nm[i], shift = 0.2 * R * ((nx * -0.55 + ny * -0.83) > 0 ? 1 : -1);
        tl.push(at(s[i], R)); tr.push(at(s[i], -R));
        ll.push([q[0] + nx * (0.72 * R + shift), q[1] + ny * (0.72 * R + shift)]);
        lrr.push([q[0] - nx * (0.72 * R - shift), q[1] - ny * (0.72 * R - shift)]);
      }
      const endCap = [];
      for (let q = 1; q < 12; q++) { const th = Math.PI / 2 - (q / 12) * Math.PI, R = wd(L); endCap.push(at0(L + Math.cos(th) * R, Math.sin(th) * R)); }
      p.tail = polyD([...tl, ...endCap, ...tr.reverse()]);
      p.tailWalls = polyD([...tl, ...endCap, ...tr], false);
      p.tailLit = polyD([...ll, ...lrr.reverse()]);
      // The rectum's three transverse folds (Houston's valves), from alternate walls, a little over a third across.
      [[0.3, 1], [0.48, -1], [0.66, 1]].forEach(([u, side]) => {
        const si = sRec - G0 + lr * u, R = wd(si);
        p.valves += polyD([at(si - 2, side * R * 0.98), at(si + 3, side * R * 0.6), at(si + 7, side * R * 0.3)], false);
      });
    }
    // The taenia: a smooth band along the limb. It starts with a rounded end; on the transverse colon it runs on into
    // each corner and out over its outline; the ascending colon's ends under the transverse colon, and the descending
    // colon's starts just below the splenic corner. At elbows it runs round each corner unbroken instead.
    {
      const into0 = limb.id === 'transverse' || (elbow && JA), into1 = limb.id === 'transverse' || (elbow && JB);
      const b0 = limb.start === 'cecum' ? lam * 0.9 : into0 ? -E : lam * 0.3, b1 = limb.end === 'tail' ? uB : into1 ? L + E : L;
      const bl = [], br = [];
      for (let si = b0; si <= b1 + 1e-6; si += 1.5) {
        const t0 = into0 ? 1 : Math.sqrt(clamp((si - b0) / 8, 0, 1)), h = bandH * Math.min(t0, limb.end === 'tail' ? smooth((b1 - si) / 24) : 1);
        bl.push(atBand(si, off + h)); br.push(atBand(si, off - h));
      }
      if (bl.length > 2) p.band = polyD([...bl, ...br.reverse()]);
    }
    return p;
  });
  return { parts };
}
