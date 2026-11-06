// EUS-PPG on the anatomy (proc-anim.js MEASURES.eus plays it; stage-cath.js draws it): the linear echoendoscope's route down the
// esophagus into the stomach, its two stations in the proximal stomach, the two targets in the left lobe of the liver, and the scope,
// its ultrasound sector and the 25-gauge needle as the figure's GPU catheter draws them (veins-gl.js setCath: tubes, discs, a fan).
// Pure geometry and vertex building, no DOM.
//
// Where it goes (world units, the figure's own outlines, anatomy.js SEAM_D and EDGE_PATH): down the middle of the esophagus (a scope
// 12 units across in an esophagus about 20 across, as a 12.7 mm echoendoscope), through the cardia on one smooth curve, and down
// the proximal stomach a little in from the lesser curvature, where the left lobe of the liver lies over it. There its bending section
// turns the tip toward the lesser curvature and the transducer comes against the wall: the needle crosses the wall and the left lobe
// into the left portal vein near its end, the umbilical part. Drawn back to the cardia, the tip turned only a little and the needle
// raised by the elevator, it crosses the lobe into the left hepatic vein, about two centimetres from the IVC. A linear echoendoscope's
// needle leaves the scope beside the transducer, in the plane of its image, forward of the scope's axis, at an angle the elevator sets
// (EUS_STATIONS): so the tip turns until the needle's line from there meets the target. The bending section turns on one curvature,
// never tighter than EUS_RHO (about four scope widths), and the scope, bent or straight, stays inside the esophagus and the stomach
// (Mohammad, 6 Nov 2026: it "bends in super sharp angles" and popped "OUTSIDE the stomach"). Each needle's way runs through the
// stomach wall and the liver only, clear of the portal trunk, the hepatic artery and the IVC (tests/eus-ppg.test.js holds all of it).

/** The scope's radius in the figure (world units). */
export const EUS_SCOPE_R = 6;
/** The targets: a vessel and how far along its drawn course (0..1 by length). */
export const EUS_TARGETS = { pv: ['PVH_L', 0.9], hv: ['LHV_IVC', 0.6] };
const DEG = Math.PI / 180;
/** Each station: where the scope stops (a point on its route), the needle's angle forward of the scope's axis as the elevator sets it,
 *  and the side of the scope the transducer faces (+1: the needle turned clockwise from the axis on the figure, y down). */
export const EUS_STATIONS = { pv: { at: [826.0, 299.3], exit: 80 * DEG, hand: 1 }, hv: { at: [801.1, 240.6], exit: 90 * DEG, hand: 1 } };
// The way in: above the figure (the esophagus fades out at its top), the esophagus, and on one smooth curve through the cardia and
// down the proximal stomach to the portal vein's station (the route's end); the hepatic vein's is in the esophagus, at the cardia.
const LEAD = [[787, -175], [787, -105]];
const ESO = [[787, -40], [787, 0], [789, 60], [792, 120], [795, 170], [798, 210], [801.2, 241.5]];
const CARDIA = [[801.8, 247.5], [802.4, 253.5], [803.4, 259.4], [804.9, 265.2], [806.8, 270.9], [809.3, 276.3], [812.8, 281.1]];
const PROXIMAL = [[818.1, 288.4], [823.4, 295.6], [826.0, 299.3]];
// (The way laid as one smooth curve through those points: resampled a unit apart and eased by a Gaussian (sigma WAY_SIGMA, its window
// narrowing to nothing at the ends, so the way still ends on the portal vein's station), so it has no corners of its own for the scope
// to kink at. Each part keeps the points that came from it.)
const WAY_SIGMA = 9;
function smoothWay(parts) {
  const C = [], of = [];
  parts.forEach((part, k) => { for (const q of part) { C.push(q); of.push(k); } });
  const P = [], K = [];
  P.push(C[0]); K.push(0);
  for (let i = 1; i < C.length; i++) {
    const a = C[i - 1], b = C[i], m = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let j = 1; j <= m; j++) { P.push([a[0] + ((b[0] - a[0]) * j) / m, a[1] + ((b[1] - a[1]) * j) / m]); K.push(of[i]); }
  }
  const n = P.length, Q = P.map((q) => q.slice());
  for (let i = 1; i < n - 1; i++) {
    const w = Math.min(Math.ceil(WAY_SIGMA * 2.5), i, n - 1 - i);
    let sx = 0, sy = 0, sw = 0;
    for (let k = -w; k <= w; k++) { const g = Math.exp(-(k * k) / (2 * WAY_SIGMA * WAY_SIGMA)); sx += P[i + k][0] * g; sy += P[i + k][1] * g; sw += g; }
    Q[i] = [sx / sw, sy / sw];
  }
  const out = parts.map(() => []);
  for (let i = 0; i < n; i++) out[K[i]].push(Q[i]);
  return out;
}
/** The bending section's tightest curvature (its radius, world units) and shortest length; the rigid tip's length. */
export const EUS_RHO = 45, EUS_BEND_MIN = 14, EUS_RIGID = 11;
const WAY = smoothWay([ESO, CARDIA, PROXIMAL]);
const RIGID = EUS_RIGID, FAN_HALF = (30 * Math.PI) / 180;

/** The route for stage-cath.js PROC_ROUTES (its builder lays loose points at the scope's own radius). */
export const EUS_ROUTE = {
  ids: ['PVH_L', 'LHV_IVC'], start: 0.5, tip: ['sto', 1], focus: ['eso', 'sto'],
  build(B) {
    const R = '=' + EUS_SCOPE_R.toFixed(3), [eso, cardia, sto] = WAY;
    B.pts(LEAD, R, 0); B.pts(eso, R, 0, 'eso'); B.pts(cardia, R, 0, 'cardia'); B.pts(sto, R, 0, 'sto');
  },
  // (After the route is laid: the hepatic vein's station (the route's point nearest it), the targets, and the box the work's close-up frames.)
  after(r, geo) {
    const h = EUS_STATIONS.hv.at;
    let best = Infinity;
    for (let i = 0; i < r.pts.length; i++) { const d = Math.hypot(r.pts[i][0] - h[0], r.pts[i][1] - h[1]); if (d < best) { best = d; r.hvD = r.cum[i]; } }
    r.tg = { pv: pointOn(geo[EUS_TARGETS.pv[0]].cur, EUS_TARGETS.pv[1]), hv: pointOn(geo[EUS_TARGETS.hv[0]].cur, EUS_TARGETS.hv[1]) };
    const end = EUS_STATIONS.pv.at, xs = [r.tg.pv[0], r.tg.hv[0], end[0] + RIGID * 2], ys = [r.tg.pv[1], r.tg.hv[1], h[1] - RIGID, end[1] + RIGID * 2];
    r.box = [Math.min(...xs) - 16, Math.min(...ys) - 16, Math.max(...xs) + 16, Math.max(...ys) + 16];
    // (Each station's work, which its shot frames and the view follows: the scope's end there and its target, with room round them.)
    const work = (q, t) => [Math.min(q[0], t[0]) - RIGID * 2, Math.min(q[1], t[1]) - RIGID * 2, Math.max(q[0], t[0]) + RIGID * 2, Math.max(q[1], t[1]) + RIGID * 2];
    // (At the hepatic vein's, the portal vein's reading still shows: its target is framed too, so both readings stay in the free figure.)
    const hw = work(h, r.tg.hv), pw = work(r.tg.pv, r.tg.pv);
    r.work = { pv: work(end, r.tg.pv), hv: [Math.min(hw[0], pw[0]), Math.min(hw[1], pw[1]), Math.max(hw[2], pw[2]), Math.max(hw[3], pw[3])] };
  },
};

/** The point at f (0..1 by length) along a polyline. */
export function pointOn(P, f) {
  let L = 0;
  for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  let want = Math.min(1, Math.max(0, f)) * L;
  for (let i = 1; i < P.length; i++) {
    const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    if (want <= l || i === P.length - 1) { const u = l ? Math.min(1, want / l) : 0; return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * u, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * u]; }
    want -= l;
  }
  return P[0].slice();
}

const rot = (x, y, a, out) => { const c = Math.cos(a), s = Math.sin(a); out[0] = x * c - y * s; out[1] = x * s + y * c; return out; };
const unit = (v) => { const l = Math.hypot(v[0], v[1]) || 1; v[0] /= l; v[1] /= l; return v; };
const smooth01 = (x) => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); };

// The bending section: as an echoendoscope's deflection is (its link joints share the bend evenly), it turns by one curvature on top of
// the route's own, from a bend's length before the rigid tip to the rigid tip, which goes straight on. Straight (no turn), the whole scope
// lies along its route, its rigid tip ending at the station. (Mohammad, 6 Nov 2026: "the echoendoscope is bending in super sharp angles":
// it was a quadratic knee over 26 units, its inside radius under the scope's own, and its straight tip cut across the cardia's curve.)
const head = (q) => Math.atan2(q.t[1], q.t[0]);
const BEND_N = 16;
/** The bending section from d0 to dA along the route, turning by phi on top of the route's own heading; each of its BEND_N + 1 points
 *  (the first is the route's own at d0) handed to put(x, y). Returns the last point in out. */
function bendWalk(r, at, d0, dA, phi, out, put = null) {
  const q0 = at(r, d0), L = dA - d0, ds = L / BEND_N;
  let x = q0.p[0], y = q0.p[1];
  if (put) put(x, y);
  for (let i = 1; i <= BEND_N; i++) {
    const h = head(at(r, d0 + ds * (i - 0.5))) + (phi * (i - 0.5)) / BEND_N;
    x += Math.cos(h) * ds; y += Math.sin(h) * ds;
    if (put) put(x, y);
  }
  out[0] = x; out[1] = y;
  return out;
}

/**
 * The scope's pose at a station (pure): its rigid tip ending at D along the route r (at(r, d): its point and direction) when straight,
 * its bending section turned (phi, eased by aim from straight) until the needle's line from where it leaves meets the target T, at the
 * elevator's angle exitA forward of the axis, on the transducer's side (hand: +1 or -1; 0 picks the side that turns least). The bending
 * section is as long as its turn needs at the tightest curvature EUS_RHO, never shorter than EUS_BEND_MIN. Written into g: the bending
 * section's start (d0, p0) and length (bend), its turn (phi), its end (p2), the tip's axis (a1), the scope's end (end), the side the
 * transducer faces (side), where the needle leaves (exit), its direction (nd) and its length to the target (len).
 */
export function eusPose(r, D, at, T, aim, exitA, hand, g) {
  const c1 = g.c1, c2 = g.c2, a1 = g.a1, sd = g.side, ex = g.exit, nd = g.nd, p2 = g.p2, end = g.end;
  const dA = Math.max(0, D - RIGID), thA = head(at(r, dA));
  let phi = 0, bend = EUS_BEND_MIN, one = hand > 0;
  for (let k = 0; k < 10; k++) {
    const d0 = Math.max(0, dA - bend);
    bendWalk(r, at, d0, dA, phi, p2);
    a1[0] = Math.cos(thA + phi); a1[1] = Math.sin(thA + phi);
    end[0] = p2[0] + a1[0] * RIGID; end[1] = p2[1] + a1[1] * RIGID;
    rot(a1[0], a1[1], one ? Math.PI / 2 : -Math.PI / 2, sd);
    ex[0] = end[0] - a1[0] * RIGID * 0.62 + sd[0] * EUS_SCOPE_R * 0.92; ex[1] = end[1] - a1[1] * RIGID * 0.62 + sd[1] * EUS_SCOPE_R * 0.92;
    g.d0 = d0; g.bend = dA - d0; g.phi = phi;
    nd[0] = T[0] - ex[0]; nd[1] = T[1] - ex[1]; unit(nd);
    // (The axis the needle asks for: its line turned back by the exit angle, on the transducer's side.)
    rot(nd[0], nd[1], -exitA, c1); rot(nd[0], nd[1], exitA, c2);
    if (!hand && k === 0) one = c1[0] * a1[0] + c1[1] * a1[1] >= c2[0] * a1[0] + c2[1] * a1[1];
    const pick = one ? c1 : c2;
    let want = Math.atan2(pick[1], pick[0]) - thA;
    want = Math.atan2(Math.sin(want), Math.cos(want)) * aim;
    const nb = Math.max(EUS_BEND_MIN, EUS_RHO * Math.abs(want));
    if (Math.abs(want - phi) < 1e-4 && Math.abs(nb - bend) < 0.01) break;
    phi = want; bend = nb;
  }
  const q0 = at(r, g.d0); g.p0[0] = q0.p[0]; g.p0[1] = q0.p[1];
  nd[0] = T[0] - ex[0]; nd[1] = T[1] - ex[1]; g.len = Math.hypot(nd[0], nd[1]); unit(nd);
  return g;
}
export const newTip = () => ({ c1: [0, 0], c2: [0, 0], a1: [0, 0], side: [0, 0], exit: [0, 0], nd: [0, 0], p2: [0, 0], end: [0, 0], p0: [0, 0], len: 0, phi: 0, d0: 0, bend: 0 });

// The materials: the insertion tube's black polymer, its hairline, the rigid tip's grey, the transducer's pale face, the FNA needle's
// sheath and its steel; the ultrasound sector a pale grey-blue.
const BLACK = [0.17, 0.18, 0.2], INK = [0.04, 0.05, 0.07], TIP_GREY = [0.36, 0.37, 0.4], FACE = [0.78, 0.79, 0.8];
const SHEATH = [0.28, 0.5, 0.82], STEEL = [0.7, 0.72, 0.76], FAN = [0.8, 0.86, 0.93], PORT = [0.05, 0.05, 0.06];
const STEP = 2;   // (the shaft's samples, world units apart)

// Kept between frames and written in place: the scope's centreline, its samples' directions and lengths, the vertices and the draws.
let cx = new Float64Array(0), cy = new Float64Array(0), tx = new Float64Array(0), ty = new Float64Array(0), cl = new Float64Array(0);
const V = [], draws = [], TIP = newTip(), SPOT = [0, 0], TGT = [0, 0], FD = [0, 0];
let n = 0;
// (Grown keeping the samples already laid this frame: made anew empty, the scope's first part went to the figure's corner, 0, 0, for
// the frame it grew in, a streak from the top left of the figure that flickered on as the scope went in: Mohammad, 6 Nov 2026.)
function grow(m) {
  if (cx.length >= m) return;
  const k = Math.max(64, m * 2), keep = (a) => { const b = new Float64Array(k); b.set(a); return b; };   // alloc-rare: only when a longer scope than any before is drawn
  cx = keep(cx); cy = keep(cy); tx = keep(tx); ty = keep(ty); cl = keep(cl);
}
const push = (x, y) => { grow(n + 1); cx[n] = x; cy[n] = y; n++; };

/**
 * The scope, its sector and its needle for one frame. st: the catheter state (u, tgt, aim, needle, flash, ring, clock, fan, opacity);
 * r: the route (stage-cath.js procRoute, with EUS_ROUTE.after's hvD, tg, box); tipD: how far along it the scope's station now is;
 * at(r, d): the route's point and direction at length d; rgb(css): a colour as [r, g, b]. Returns { V, draws, tip, needle } (kept,
 * rewritten each call): the vertices (x, y, dir x, dir y, u, v), the draws, the scope's end and the needle's point.
 */
export function eusDraw(st, r, tipD, at, rgb) {
  V.length = 0; draws.length = 0; n = 0;
  const op = st.opacity ?? 1, R = EUS_SCOPE_R, tg = st.tgt || 0;
  TGT[0] = r.tg.pv[0] + (r.tg.hv[0] - r.tg.pv[0]) * tg; TGT[1] = r.tg.pv[1] + (r.tg.hv[1] - r.tg.pv[1]) * tg;
  // The shaft along the route to the start of the bend, then the bend (an arc of one curvature to the turned axis), then the rigid tip.
  // (The elevator's angle and the transducer's side go from one station's to the other's while the scope moves, its tip straight then.)
  const S = tg < 0.5 ? EUS_STATIONS.pv : EUS_STATIONS.hv, exitA = EUS_STATIONS.pv.exit + (EUS_STATIONS.hv.exit - EUS_STATIONS.pv.exit) * tg;
  const g = eusPose(r, tipD, at, TGT, st.aim || 0, exitA, S.hand, TIP), d0 = g.d0;
  for (let d = 0; d < d0 - STEP * 0.5; d += STEP) { const q = at(r, d); push(q.p[0], q.p[1]); }
  bendWalk(r, at, d0, d0 + g.bend, g.phi, SPOT, push);
  const iA = n - 1;   // (the bending section's end, where the rigid tip starts)
  for (let i = 1; i <= 4; i++) push(g.p2[0] + g.a1[0] * RIGID * (i / 4), g.p2[1] + g.a1[1] * RIGID * (i / 4));
  cl[0] = 0;
  for (let i = 0; i < n; i++) {
    const j0 = Math.max(0, i - 1), j1 = Math.min(n - 1, i + 1), dx = cx[j1] - cx[j0], dy = cy[j1] - cy[j0], l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l; ty[i] = dy / l;
    if (i) cl[i] = cl[i - 1] + Math.hypot(cx[i] - cx[i - 1], cy[i] - cy[i - 1]);
  }
  // (The rigid tip from its own first sample: from total − RIGID, that sample fell in or out by a rounding of the summed lengths, frame to
  // frame, so the grey tip grew and shrank by a quarter of its length, the flicker at the scope's tip: Mohammad, 6 Nov 2026.)
  const total = cl[n - 1], rigid0 = cl[iA];
  // The ultrasound sector first, under everything: from the transducer toward the target, a little past it.
  if ((st.fan || 0) > 0.01) {
    const ax = g.end[0] - g.a1[0] * RIGID * 0.45 + g.side[0] * R * 0.85, ay = g.end[1] - g.a1[1] * RIGID * 0.45 + g.side[1] * R * 0.85;
    FD[0] = TGT[0] - ax; FD[1] = TGT[1] - ay; const reach = Math.hypot(FD[0], FD[1]) * 1.12; unit(FD);
    const first = V.length / 6, N = 28;
    for (let i = 0; i < N; i++) {
      const a = -FAN_HALF + (2 * FAN_HALF * i) / N, b = -FAN_HALF + (2 * FAN_HALF * (i + 1)) / N;
      V.push(ax, ay, FD[0], FD[1], 0, 0);
      for (const e of [a, b]) { rot(FD[0], FD[1], e, SPOT); V.push(ax + SPOT[0] * reach, ay + SPOT[1] * reach, FD[0], FD[1], Math.cos(e), Math.sin(e)); }
    }
    draws.push({ mode: 9, tri: true, first, count: N * 3, col: FAN, alpha: 0.2 * st.fan * op, len: FAN_HALF });
  }
  // A tube along the centreline from length a to b, its half width w(d) (a function of the length, or a number).
  const tube = (a, b, w, mode, col, alpha, fade = null) => {
    const first = V.length / 6;
    let last = -1;
    const put = (x, y, nx, ny, d) => { const ww = typeof w === 'number' ? w : w(d); V.push(x - nx * ww, y - ny * ww, nx, ny, -1, d - a, x + nx * ww, y + ny * ww, nx, ny, 1, d - a); };
    for (let i = 0; i < n; i++) {
      if (cl[i] < a) continue;
      if (cl[i] > b) break;
      put(cx[i], cy[i], -ty[i], tx[i], cl[i]); last = i;
    }
    if (last < 0) return;
    draws.push({ mode, first, count: V.length / 6 - first, col, alpha: alpha * op, fade: fade || [0, 0], len: b - a });
  };
  const disc = (px, py, dx, dy, hx, hy, mode, col, alpha) => {
    const first = V.length / 6, nx = -dy, ny = dx;
    for (const [u, v] of CORNERS) V.push(px + dx * hx * u + nx * hy * v, py + dy * hx * u + ny * hy * v, dx, dy, u, v);
    draws.push({ mode, first, count: 4, col, alpha: alpha * op });
  };
  // Its soft contact shadow, its hairline edge, the black insertion tube (fading in where it enters the figure), the rigid tip.
  tube(0, total, R * 1.9, 0, INK, 0.2, [60, 0]);
  tube(0, total, R * 1.12, 7, INK, 0.7, [60, 0]);
  tube(0, total, R, 2, BLACK, 1, [60, 0]);
  tube(rigid0, total, R * 0.98, 2, TIP_GREY, 1);
  // Its rounded end, and the curved array of the transducer on the side that faces the liver.
  disc(g.end[0], g.end[1], g.a1[0], g.a1[1], R * 1.12, R * 1.12, 8, INK, 0.7);
  disc(g.end[0], g.end[1], g.a1[0], g.a1[1], R, R, 4, TIP_GREY, 1);
  const fx = g.end[0] - g.a1[0] * RIGID * 0.3 + g.side[0] * R * 0.52, fy = g.end[1] - g.a1[1] * RIGID * 0.3 + g.side[1] * R * 0.52;
  disc(fx, fy, g.a1[0], g.a1[1], RIGID * 0.62, R * 0.5, 8, INK, 0.55);
  disc(fx, fy, g.a1[0], g.a1[1], RIGID * 0.56, R * 0.42, 4, FACE, 1);
  // The working channel's port, where the needle leaves the scope.
  disc(g.exit[0], g.exit[1], g.a1[0], g.a1[1], R * 0.34, R * 0.34, 8, PORT, 0.9 * (st.aim || 0));
  // The needle: its sheath just out of the channel, then the steel on to its bevelled point; the hit's rings at the target, and the
  // manometer's reading as two ripples there while it reads.
  const nl = (st.needle || 0) * g.len;
  if (nl > 0.4) {
    const sx = g.exit[0], sy = g.exit[1], dx = g.nd[0], dy = g.nd[1];
    const line = (l0, l1, w, mode, col, alpha) => {
      const first = V.length / 6, nx = -dy, ny = dx, steps = Math.max(2, Math.ceil((l1 - l0) / 2));
      for (let i = 0; i <= steps; i++) {
        const l = l0 + ((l1 - l0) * i) / steps, x = sx + dx * l, y = sy + dy * l, ww = typeof w === 'number' ? w : w(l);
        V.push(x - nx * ww, y - ny * ww, nx, ny, -1, l - l0, x + nx * ww, y + ny * ww, nx, ny, 1, l - l0);
      }
      draws.push({ mode, first, count: V.length / 6 - first, col, alpha: alpha * op, fade: [0, 0], len: l1 - l0 });
    };
    const bev = 2.6, nw = (l) => 0.62 * (1 - 0.8 * smooth01((l - (nl - bev)) / bev));
    const sh = Math.min(nl, 5);
    line(0, sh, 1.45, 7, INK, 0.7); line(0, sh, 1.25, 2, SHEATH, 1);
    if (nl > sh) { line(sh - 0.2, nl, (l) => nw(l) + 0.16, 7, INK, 0.8); line(sh - 0.2, nl, nw, 3, STEEL, 1); }
  }
  const tcol = rgb(tg < 0.5 ? 'var(--tr-pv)' : 'var(--tr-hv)');
  if ((st.flash || 0) > 0) for (const k of [st.flash, (st.flash + 0.5) % 1]) disc(TGT[0], TGT[1], 1, 0, 1.4 + 6 * k, 1.4 + 6 * k, 6, tcol, (1 - k) * (1 - k) * 0.85);
  if (st.ring) {
    const ph = ((st.clock || 0) / 1300) % 1, rc = rgb(st.ring);
    for (const k of [ph, (ph + 0.5) % 1]) disc(TGT[0], TGT[1], 1, 0, 2 + 5 * k, 2 + 5 * k, 6, rc, (1 - k) * (1 - k) * 0.9);
  }
  OUT.line = LINE; LINE.n = n; LINE.x = cx; LINE.y = cy;
  OUT.tip = g.end; OUT.needle = nl > 0.4 ? [g.exit[0] + g.nd[0] * nl, g.exit[1] + g.nd[1] * nl] : g.end;   // alloc-rare: only while the needle is out (the readings' point)
  return OUT;
}
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
// (The scope's centreline as drawn, for the tests: its samples' count and coordinates, kept.)
const LINE = { n: 0, x: null, y: null };
const OUT = { V, draws, tip: null, needle: null, line: null };
