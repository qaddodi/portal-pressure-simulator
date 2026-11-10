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

import { smooth01 } from './motion.js';
/** The scope's radius in the figure (world units). */
export const EUS_SCOPE_R = 6;
/** The targets: a vessel and how far along its drawn course (0..1 by length). */
export const EUS_TARGETS = { pv: ['PVH_L', 0.9], hv: ['LHV_IVC', 0.6] };
const DEG = Math.PI / 180;
/** Each station: where the scope stops (a point on its route), the needle's angle forward of the scope's axis as the elevator sets it,
 *  and the side of the scope the transducer faces (+1: the needle turned clockwise from the axis on the figure, y down). */
export const EUS_STATIONS = { pv: { at: [826.0, 299.3], exit: 80 * DEG, hand: 1 }, hv: { at: [801.6, 246.0], exit: 90 * DEG, hand: 1 } };
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
// (Where the working channel opens, along the tip from its end in rigid lengths and across from the axis in scope radii; its port's radius
// in scope radii: side + port well inside the outline.)
export const EUS_EXIT_BACK = 0.95, EUS_EXIT_SIDE = 0.6, EUS_PORT_R = 0.26;
const EXIT_BACK = EUS_EXIT_BACK, EXIT_SIDE = EUS_EXIT_SIDE, PORT_R = EUS_PORT_R;

// EUS-guided coils and glue for a fundal varix (proc-anim.js ENDO.eusglue; Baveno VIII 5.40): the same echoendoscope, down the esophagus,
// through the cardia on one wide turn (radius 40, over three scope widths: never a sharp knee, his ask, 7 Nov 2026) and on under the dome
// of the fundus, above the arch where the short gastric feeder (C2) meets the gastrorenal shunt, to a station over the varix. Straight
// there (no turn of its bending section), its transducer faces down onto the varix and the elevator raises the needle square to the scope,
// so the needle runs straight down into the varix, clear of the shunt (C5) and of the arch where the two meet.
/** Where on the figure the varix is punctured: a vessel and how far along its drawn course; the glue's X sits there too (stage-clamps). */
export const EUS_GLUE_TARGET = ['C2', 0.8];
/** The glue's station: the scope's end, the needle's angle forward of the axis (square to it) and the transducer's side (+1: below). */
export const EUS_GLUE_STATION = { at: [927.6, 280.9], exit: 90 * DEG, hand: 1 };
const GLUE_TURN = Array.from({ length: 9 }, (_, i) => { const a = ((5 + i * 10.6) * Math.PI) / 180; return [842 - 40 * Math.cos(a), 244 + 40 * Math.sin(a)]; });
const FUNDUS = [[854, 283.7], [866, 283.2], [878, 282.6], [891, 282], [904, 281.5], [915, 281.2], [927.6, 280.9]];
const GLUE_WAY = smoothWay([ESO, GLUE_TURN, FUNDUS]);
// (The box a station's work fills on screen: the scope's end and its target, with room round them.)
const workBox = (q, t, m) => [Math.min(q[0], t[0]) - m, Math.min(q[1], t[1]) - m, Math.max(q[0], t[0]) + m, Math.max(q[1], t[1]) + m];

/** The route for stage-cath.js PROC_ROUTES (its builder lays loose points at the scope's own radius). */
export const EUS_ROUTE = {
  ids: ['PVH_L', 'LHV_IVC'], start: 0.5, tip: ['sto', 1], focus: ['eso', 'sto'],
  build(B) {
    const R = '=' + EUS_SCOPE_R.toFixed(3), [eso, cardia, sto] = WAY;
    B.pts(LEAD, R, 0); B.pts(eso, R, 0, 'eso'); B.pts(cardia, R, 0, 'cardia'); B.pts(sto, R, 0, 'sto');
  },
  // (After the route is laid: the hepatic vein's station (the route's point nearest it), the targets, and the box the work's close-up frames.)
  after(r, geo) {
    r.scope = true;
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

/** The coils-and-glue route (stage-cath.js PROC_ROUTES.eusglue): one station, one target, the varix. */
export const EUS_GLUE_ROUTE = {
  ids: [EUS_GLUE_TARGET[0]], start: 0.5, tip: ['fundus', 1], focus: ['eso', 'fundus'],
  build(B) {
    const R = '=' + EUS_SCOPE_R.toFixed(3), [eso, turn, fundus] = GLUE_WAY;
    B.pts(LEAD, R, 0); B.pts(eso, R, 0, 'eso'); B.pts(turn, R, 0, 'cardia'); B.pts(fundus, R, 0, 'fundus');
  },
  // (The one station, at the route's end, for both of the scope's targets; the varix's point; the glue's vessel and where on it (the
  // tint it fills, stage-cath cathPaint); the box the needle's close-up frames, and the result's: the whole varix and the scope over it.)
  after(r, geo) {
    const [id, f] = EUS_GLUE_TARGET, T = pointOn(geo[id].cur, f), end = EUS_GLUE_STATION.at;
    r.scope = true; r.stations = { pv: EUS_GLUE_STATION, hv: EUS_GLUE_STATION };
    r.tg = { pv: T, hv: T }; r.glue = { id, f, rad: 0, path: lumenPath(geo[id].cur, f, GLUE_PATH_HALF), castLo: 0, castHi: 0, castOn: 0, flowFn: null };   // (castLo/castHi/castOn: the cast along the varix now, world units from the needle's point, and flowFn: the varix's display speed now, both written by stage-cath.js for the fan's color Doppler)
    r.work = { glue: workBox(end, T, RIGID * 2.2) };
    const C = geo[id].cur, xs = [end[0] - RIGID * 3, end[0] + RIGID, ...C.map((q) => q[0])], ys = [end[1] - RIGID * 1.5, ...C.map((q) => q[1])];
    r.result = [Math.min(...xs) - 14, Math.min(...ys) - 14, Math.max(...xs) + 14, Math.max(...ys) + 14];
  },
};

// (The varix's centreline round the needle's point, GLUE_PATH_HALF world units each way, resampled every GLUE_PATH_STEP with its unit
// tangent: the coil is laid along it, so it follows the vessel's own course and never cuts across a bend.)
const GLUE_PATH_HALF = 16, GLUE_PATH_STEP = 0.5;
/** The stretch of polyline P from a length GLUE_PATH_HALF before the point at f to as far after it: { x, y, tx, ty, n, at } (at: the
 *  index of the point at f). Made once, as the route is laid. */
export function lumenPath(P, f, half) {
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const L = cum.at(-1), d0 = Math.max(0, f * L - half), d1 = Math.min(L, f * L + half), n = Math.max(2, Math.round((d1 - d0) / GLUE_PATH_STEP) + 1);
  const x = new Float64Array(n), y = new Float64Array(n), tx = new Float64Array(n), ty = new Float64Array(n);
  let j = 1;
  for (let i = 0; i < n; i++) {
    const d = d0 + ((d1 - d0) * i) / (n - 1);
    while (j < P.length - 1 && cum[j] < d) j++;
    const l = cum[j] - cum[j - 1] || 1, u = Math.min(1, Math.max(0, (d - cum[j - 1]) / l));
    x[i] = P[j - 1][0] + (P[j][0] - P[j - 1][0]) * u; y[i] = P[j - 1][1] + (P[j][1] - P[j - 1][1]) * u;
  }
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2), dx = x[b] - x[a], dy = y[b] - y[a], l = Math.hypot(dx, dy) || 1; tx[i] = dx / l; ty[i] = dy / l; }
  return { x, y, tx, ty, n, at: Math.round(((f * L - d0) / (d1 - d0 || 1)) * (n - 1)), step: (d1 - d0) / (n - 1), len: L };   // (len: the whole course's length, for the glue's share of it)
}

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
    // (The working channel's opening: on the transducer's side, just behind the curved array, and inside the scope's own outline, so
    // only the needle comes out of it (his ask, 8 Nov 2026: "the openning of the needle should not be beyond the scope").)
    ex[0] = end[0] - a1[0] * RIGID * EXIT_BACK + sd[0] * EUS_SCOPE_R * EXIT_SIDE; ex[1] = end[1] - a1[1] * RIGID * EXIT_BACK + sd[1] * EUS_SCOPE_R * EXIT_SIDE;
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

// The materials are the device table's (theme-tokens.js, --dev-*, per look; visual-style D1): the insertion tube's black polymer and its
// hairline (light on the dark looks), the rigid tip's grey, the transducer's pale face, the port, the needle's steel, the catheter's dark
// edge (the coil's), the coil's platinum and its pale fibres; the ultrasound sector is drawn in the Doppler's glow (--dop-glow), as its wedge is.
// Read through rgb() once a call, written in place into MAT.
const MAT = { soft: [0, 0, 0], tow: null, away: null, scope: null, edge: null, tip: null, face: null, port: null, steel: null, ink: null, platinum: null, fibre: null, fan: null };
function materials(rgb) {
  MAT.scope = rgb('var(--dev-scope)'); MAT.edge = rgb('var(--dev-scope-edge)'); MAT.tip = rgb('var(--dev-scope-tip)'); MAT.face = rgb('var(--dev-scope-face)');
  MAT.port = rgb('var(--dev-port)'); MAT.steel = rgb('var(--dev-steel)'); MAT.ink = rgb('var(--dev-poly-edge)'); MAT.platinum = rgb('var(--dev-platinum)');
  MAT.fibre = rgb('var(--dev-ptfe)'); MAT.fan = rgb('var(--dop-glow)'); MAT.tow = rgb('var(--dop-toward)'); MAT.away = rgb('var(--dop-away)');
  // (The scope's hairline: its edge colour moved halfway to the body's own, so it reads as the scope's shading, not a drawn outline.)
  for (let i = 0; i < 3; i++) MAT.soft[i] = MAT.edge[i] + (MAT.scope[i] - MAT.edge[i]) * EDGE_MIX;
  return MAT;
}
const EDGE_A = 0.26, EDGE_MIX = 0.55;   // (the scope's hairline: its strength, and how far its colour moves to the body's)
const STEP = 2;   // (the shaft's samples, world units apart)

// Kept between frames and written in place: the scope's centreline, its samples' directions and lengths, the vertices and the draws.
let cx = new Float64Array(0), cy = new Float64Array(0), tx = new Float64Array(0), ty = new Float64Array(0), cl = new Float64Array(0);
let UNDER = false;   // (the draws laid now lie under the vessels: veins-gl.js's catheter pass lets the vessel layer's cover hide them)
const V = [], draws = [], TIP = newTip(), SPOT = [0, 0], TGT = [0, 0], FD = [0, 0];
// The color Doppler in the glue slide's fan (his ask, 10 Nov 2026, recs item 4), all of it on the GPU (veins-gl.js CATH_FS mode 9): the varix's lumen
// as a polyline in the fan's own frame (DOP_N points, in units of the fan's reach, five vec4 of two points each) with its radius, where the cast lies
// along it, and a reader for the varix's flow now (the shader gets the speed and direction each frame, so the colors stop as the model's flow does).
// ECHO is the fan itself (apex, axis, half angle, reach, strength), which the needle and the coil are drawn bright inside (draw.echo).
// TAPER is the insertion tube's fade with distance from its end: full within dist, down to floor beyond dist + ramp (draw.taper).
const DOP_N = 10;
const DOP = { p: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], q: [0, 0, 0, 0], cast: [0, 0, 0, 0], flowFn: null, tow: null, away: null };
const ECHO = { a: [0, 0, 0, 0], b: [0, 0], k: 0 };
const TAPER = [0, 1, 1];
const TAPER_FULL = 3, TAPER_RAMP = 2, TAPER_FLOOR = 0.35;   // (in rigid-tip lengths: the tube is whole for the last three, falls over the next two to 35 %)
let n = 0;
// (Grown keeping the samples already laid this frame: made anew empty, the scope's first part went to the figure's corner, 0, 0, for
// the frame it grew in, a streak from the top left of the figure that flickered on as the scope went in: Mohammad, 6 Nov 2026.)
function grow(m) {
  if (cx.length >= m) return;
  const k = Math.max(64, m * 2), keep = (a) => { const b = new Float64Array(k); b.set(a); return b; };   // alloc-rare: only when a longer scope than any before is drawn
  cx = keep(cx); cy = keep(cy); tx = keep(tx); ty = keep(ty); cl = keep(cl);
}
const push = (x, y) => { grow(n + 1); cx[n] = x; cy[n] = y; n++; };

// The varix's lumen in the fan's frame for the color Doppler (CATH_FS mode 9): DOP_N points of the path laid at equal steps along it, each as
// (along the fan's axis, across it) in units of the fan's reach, its radius in the same unit, the path's length to the first point and between
// two (world units, from the needle's point), where the cast lies along it (the stage's tint, relative to the point) and the strength k
// (the fan's own: 0 off the fan). Written in place.
function dopLumen(g, ax, ay, fd, reach, M, k) {
  const pa = g.path, n = pa.n, step = pa.step, inv = 1 / reach;
  for (let i = 0; i < DOP_N; i++) {
    const idx = ((n - 1) * i) / (DOP_N - 1), i0 = Math.min(n - 2, Math.floor(idx)), f = idx - i0;
    const x = pa.x[i0] + (pa.x[i0 + 1] - pa.x[i0]) * f - ax, y = pa.y[i0] + (pa.y[i0 + 1] - pa.y[i0]) * f - ay, o = DOP.p[i >> 1], h = (i & 1) * 2;
    o[h] = (x * fd[0] + y * fd[1]) * inv; o[h + 1] = (-x * fd[1] + y * fd[0]) * inv;
  }
  DOP.q[0] = k; DOP.q[1] = g.rad * inv; DOP.q[2] = -pa.at * step; DOP.q[3] = ((n - 1) * step) / (DOP_N - 1);
  DOP.cast[0] = g.castLo || 0; DOP.cast[1] = g.castHi || 0; DOP.cast[2] = Math.max(2, g.rad * 0.7); DOP.cast[3] = g.castOn || 0;
  DOP.flowFn = g.flowFn || null; DOP.tow = M.tow; DOP.away = M.away;
}
/**
 * The scope, its sector and its needle for one frame. st: the catheter state (u, tgt, aim, needle, flash, ring, clock, fan, opacity);
 * r: the route (stage-cath.js procRoute, with EUS_ROUTE.after's hvD, tg, box); tipD: how far along it the scope's station now is;
 * at(r, d): the route's point and direction at length d; rgb(css): a colour as [r, g, b]. Returns { V, draws, tip, needle } (kept,
 * rewritten each call): the vertices (x, y, dir x, dir y, u, v), the draws, the scope's end and the needle's point.
 * px: world units per device pixel (0: no floor), for the pixel floors of the finest parts (the needle 2 px, the coil's wire 1.5 px; visual-style D3).
 */
export function eusDraw(st, r, tipD, at, rgb, px = 0) {
  V.length = 0; draws.length = 0; n = 0;
  const M = materials(rgb);
  const op = st.opacity ?? 1, R = EUS_SCOPE_R, tg = st.tgt || 0;
  TGT[0] = r.tg.pv[0] + (r.tg.hv[0] - r.tg.pv[0]) * tg; TGT[1] = r.tg.pv[1] + (r.tg.hv[1] - r.tg.pv[1]) * tg;
  // The shaft along the route to the start of the bend, then the bend (an arc of one curvature to the turned axis), then the rigid tip.
  // (The elevator's angle and the transducer's side go from one station's to the other's while the scope moves, its tip straight then.)
  const ST = r.stations || EUS_STATIONS, S = tg < 0.5 ? ST.pv : ST.hv, exitA = ST.pv.exit + (ST.hv.exit - ST.pv.exit) * tg;
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
    const fan = { mode: 9, tri: true, first, count: N * 3, col: M.fan, alpha: 0.2 * st.fan * op, len: FAN_HALF };
    if (r.glue?.path) {
      // (The glue slide's color Doppler: the varix's lumen in the fan's frame, and the fan as the needle and coil are lit by it.)
      dopLumen(r.glue, ax, ay, FD, reach, M, st.fan * op);
      fan.dop = DOP;
      ECHO.a[0] = ax; ECHO.a[1] = ay; ECHO.a[2] = FD[0]; ECHO.a[3] = FD[1]; ECHO.b[0] = FAN_HALF; ECHO.b[1] = reach; ECHO.k = st.fan * op;
    } else ECHO.k = 0;
    draws.push(fan);
  } else ECHO.k = 0;
  // A tube along the centreline from length a to b, its half width w(d) (a function of the length, or a number).
  const tube = (a, b, w, mode, col, alpha, fade = null, taper = null) => {
    const first = V.length / 6;
    let last = -1;
    const put = (x, y, nx, ny, d) => { const ww = typeof w === 'number' ? w : w(d); V.push(x - nx * ww, y - ny * ww, nx, ny, -1, d - a, x + nx * ww, y + ny * ww, nx, ny, 1, d - a); };
    for (let i = 0; i < n; i++) {
      if (cl[i] < a) continue;
      if (cl[i] > b) break;
      put(cx[i], cy[i], -ty[i], tx[i], cl[i]); last = i;
    }
    if (last < 0) return;
    draws.push({ mode, first, count: V.length / 6 - first, col, alpha: alpha * op, fade: fade || [0, 0], len: b - a, under: UNDER, taper });
  };
  const disc = (px, py, dx, dy, hx, hy, mode, col, alpha) => {
    const first = V.length / 6, nx = -dy, ny = dx;
    for (const [u, v] of CORNERS) V.push(px + dx * hx * u + nx * hy * v, py + dy * hx * u + ny * hy * v, dx, dy, u, v);
    draws.push({ mode, first, count: 4, col, alpha: alpha * op, under: UNDER });
  };
  // Its soft contact shadow, its hairline edge, the black insertion tube (fading in where it enters the figure), the rigid tip.
  // (The scope lies under the vessels, not on them: its body, tip, transducer and port are drawn with the vessel layer's cover taken off
  // their alpha (veins-gl.js, draw.under), in Classic, Mesh and Tube alike. Its outline is a faint, scope-coloured hairline: Mohammad,
  // 10 Nov 2026: "the EUS scope should be under the blood vessels not on top; also i hate the prominent outline".)
  const ER = Math.max(R * 1.12, R + px);   // (its hairline is at least a device pixel wide)
  const soft = M.soft;
  // (Once the scope is parked, from the needle step on (st.aim), the insertion tube beyond three rigid-tip lengths from its end falls to 35 %, over two
  // more, so a long dark bar does not cross the figure: the glue slide only, EUS-PPG's tube stays whole. The floor moves with st.aim's own ease, so
  // there is no pop; the shaft's three layers share it, so the hairline never outstays the body. His ask, 10 Nov 2026, recs item 9.)
  let taper = null;
  if (r.glue) {
    const park = smooth01(st.aim || 0);
    if (park > 0.001) { TAPER[0] = RIGID * TAPER_FULL; TAPER[1] = RIGID * TAPER_RAMP; TAPER[2] = 1 - (1 - TAPER_FLOOR) * park; taper = TAPER; }
  }
  UNDER = true;
  tube(0, total, R * 1.9, 0, M.ink, 0.2, [60, 0], taper);
  tube(0, total, ER, 7, soft, EDGE_A, [60, 0], taper);
  tube(0, total, R, 2, M.scope, 1, [60, 0], taper);
  tube(rigid0, total, R * 0.98, 2, M.tip, 1);
  // Its rounded end, and the curved array of the transducer on the side that faces the liver.
  disc(g.end[0], g.end[1], g.a1[0], g.a1[1], ER, ER, 8, soft, EDGE_A);
  disc(g.end[0], g.end[1], g.a1[0], g.a1[1], R, R, 4, M.tip, 1);
  const fx = g.end[0] - g.a1[0] * RIGID * 0.3 + g.side[0] * R * 0.52, fy = g.end[1] - g.a1[1] * RIGID * 0.3 + g.side[1] * R * 0.52;
  disc(fx, fy, g.a1[0], g.a1[1], RIGID * 0.62, R * 0.5, 8, soft, EDGE_A * 0.8);
  disc(fx, fy, g.a1[0], g.a1[1], RIGID * 0.56, R * 0.42, 4, M.face, 1);
  // The working channel's port, where the needle leaves the scope.
  disc(g.exit[0], g.exit[1], g.a1[0], g.a1[1], R * PORT_R, R * PORT_R, 8, M.port, 0.9 * (st.aim || 0));
  UNDER = false;
  // The needle: its steel from the port on to its bevelled point; the hit's rings at the target, and the
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
      draws.push({ mode, first, count: V.length / 6 - first, col, alpha: alpha * op, fade: [0, 0], len: l1 - l0, echo: r.glue && ECHO.k > 0.01 ? ECHO : null });   // (echo: lit by the fan it is in)
    };
    const bev = 2.6, nw0 = Math.max(0.62, px * NEEDLE_PX / 2), nw = (l) => nw0 * (1 - 0.8 * smooth01((l - (nl - bev)) / bev));   // (never under 2 px wide)
    // (Only the steel leaves the port: its sheath stays in the working channel.)
    line(0, nl, (l) => nw(l) + Math.max(0.16, px * 0.5), 7, M.ink, 0.8); line(0, nl, nw, 3, M.steel, 1);
  }
  // The coils (EUS-guided coils and glue): a fine steel coil pushed out of the needle's point into the varix (his ask, 8 Nov 2026: "the
  // coils should emerge from the needle"). Its first loop starts at the needle's point, on the varix's centreline, and as more is pushed out
  // (st.coil 0..1) it curls on along the vessel, the part already out keeping its place: drawn from the point out to the length pushed so far.
  // It is laid along the varix's own centreline (r.glue.path) as a helix seen from the side, each sample on the centreline's normal at its
  // own point, no further from it than the lumen's radius (r.glue.rad, the vessel's drawn caliber now) less the wire's width, so the coil is
  // inside the vessel's walls whatever the varix's size and the zoom (his ask, 7 Nov 2026: "should deploy and be within the varix vessel
  // walls not outside"). It stays in the varix once the needle is back.
  const dn = draws.length;
  OUT.coil = layCoil(st, r.glue, rgb, px, op, V, draws);
  if (r.glue && ECHO.k > 0.01) for (let i = dn; i < draws.length; i++) draws[i].echo = ECHO;   // (the coil shows bright where the fan lies on it)
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
/**
 * The coil, laid into V and draws (the caller's own: the scope's in eusDraw, the TIPS catheter's in stage-cath.js; base: how many vertices the caller's
 * base buffer holds before V, so the draws' first indices count them). gl: the vessel it lies in, { path, rad, dir? } (lumenPath; coilReach). It starts at
 * the path's point and curls on along the vessel inside its walls. Returns the index of its first vertex, or -1 when none is drawn (not out yet, or the
 * lumen too narrow for the wire).
 */
export function layCoil(st, gl, rgb, px, op, V, draws, base = 0) {
  if (!((st.coil || 0) > 0.01 && gl?.path && gl.rad > COIL_EDGE + COIL_GAP)) return -1;
  const M = materials(rgb);
  const k = Math.min(1, st.coil), m = Math.max(3, Math.ceil(COIL_N * k)), pa = gl.path;
  // (It runs on toward the side of the needle's point with more of the varix laid; the loops' radius across the vessel is the lumen less
  // the wire's dark edge and a hair, so the wire's outer edge stays inside, and they open out over the first few samples from the point;
  // their length along it, a few lumen widths, inside the stretch laid: coilReach.)
  const { dir, rho, span } = coilReach(gl, COIL_OUT);
  for (let i = 0; i <= m; i++) {
    const u = (k * i) / m, th = COIL_TURNS * 2 * Math.PI * u, rr = rho * (1 - 0.25 * u) * Math.min(1, u / COIL_OPEN);
    const along = dir * (u * span + rr * COIL_SWAY * (1 - Math.cos(th)));
    const q = Math.min(pa.n - 1, Math.max(0, pa.at + along / pa.step)), i0 = Math.min(pa.n - 2, Math.floor(q)), f = q - i0;
    const cx0 = pa.x[i0] + (pa.x[i0 + 1] - pa.x[i0]) * f, cy0 = pa.y[i0] + (pa.y[i0 + 1] - pa.y[i0]) * f;
    let tx0 = pa.tx[i0] + (pa.tx[i0 + 1] - pa.tx[i0]) * f, ty0 = pa.ty[i0] + (pa.ty[i0 + 1] - pa.ty[i0]) * f;
    const tl = Math.hypot(tx0, ty0) || 1; tx0 /= tl; ty0 /= tl;
    CP[i * 2] = cx0 - ty0 * rr * Math.sin(th); CP[i * 2 + 1] = cy0 + tx0 * rr * Math.sin(th);
  }
  OUT.coilTip = CP[m * 2]; OUT.coilTipY = CP[m * 2 + 1];
  let qx = 0, qy = 0;
  const first0 = base + V.length / 6;
  // (Its platinum wire never under 1.5 px wide, its dark edge a little more than that: visual-style D3.)
  const wirePt = Math.max(COIL_WIRE, px * COIL_PX / 2);
  const wire = (w, mode, col, alpha) => {
    const first = base + V.length / 6;
    let run = 0;
    for (let i = 0; i <= m; i++) {
      const j0 = Math.max(0, i - 1), j1 = Math.min(m, i + 1), dx = CP[j1 * 2] - CP[j0 * 2], dy = CP[j1 * 2 + 1] - CP[j0 * 2 + 1], l = Math.hypot(dx, dy) || 1;
      const x = CP[i * 2], y = CP[i * 2 + 1], nx = -dy / l, ny = dx / l;
      if (i) run += Math.hypot(x - qx, y - qy);
      qx = x; qy = y;
      V.push(x - nx * w, y - ny * w, nx, ny, -1, run, x + nx * w, y + ny * w, nx, ny, 1, run);
    }
    draws.push({ mode, first, count: base + V.length / 6 - first, col, alpha: alpha * op, fade: [0, 0], len: run + 1 });
  };
  wire(Math.max(COIL_EDGE, wirePt + COIL_EDGE - COIL_WIRE), 7, M.ink, 0.75);
  wire(wirePt, 3, M.platinum, 1);
  // Its fibre tufts (an embolisation coil's Dacron: what holds the glue): two short pale strokes across the wire at every half turn,
  // leaning forward and back, none longer than the lumen has room for. One triangle draw of the satin polymer.
  const tuftHalf = Math.max(TUFT_W, px * 0.5), first = base + V.length / 6;
  for (let j = 1; j <= Math.floor(COIL_TURNS * 2 * k); j++) {
    const u = j / (COIL_TURNS * 2), fi = (u / k) * m, i0 = Math.min(m - 1, Math.floor(fi)), f = fi - i0;
    const x = CP[i0 * 2] + (CP[i0 * 2 + 2] - CP[i0 * 2]) * f, y = CP[i0 * 2 + 1] + (CP[i0 * 2 + 3] - CP[i0 * 2 + 1]) * f;
    const dx = CP[i0 * 2 + 2] - CP[i0 * 2], dy = CP[i0 * 2 + 3] - CP[i0 * 2 + 1], dl = Math.hypot(dx, dy) || 1, wx = dx / dl, wy = dy / dl;
    // (How far this point is from the varix's centreline, across it: the loop's own offset, rr sin(th), at most the lumen's radius less the wire.)
    const lat = rho * Math.abs(Math.sin(COIL_TURNS * 2 * Math.PI * u)), room = gl.rad - COIL_GAP - lat - wirePt;
    const len = Math.min(TUFT_L, room);
    if (!(len > TUFT_W * 2)) continue;
    for (let sd = -1; sd <= 1; sd += 2) {
      // (The stroke leaves the wire across it, leaning back along it by TUFT_LEAN: direction d, and its across-unit u, the vertices' direction.)
      const dx2 = sd * -wy * Math.cos(TUFT_LEAN) - wx * Math.sin(TUFT_LEAN), dy2 = sd * wx * Math.cos(TUFT_LEAN) - wy * Math.sin(TUFT_LEAN);
      const ux = -dy2, uy = dx2, hx = ux * tuftHalf, hy = uy * tuftHalf, ex = x + dx2 * len, ey = y + dy2 * len;
      V.push(x - hx, y - hy, ux, uy, -1, 0.01, x + hx, y + hy, ux, uy, 1, 0.01, ex - hx, ey - hy, ux, uy, -1, len,
        x + hx, y + hy, ux, uy, 1, 0.01, ex + hx, ey + hy, ux, uy, 1, len, ex - hx, ey - hy, ux, uy, -1, len);
    }
  }
  if (base + V.length / 6 > first) draws.push({ mode: 2, tri: true, first, count: base + V.length / 6 - first, col: M.fibre, alpha: 0.9 * op, fade: [0, 0], len: 1e3 });
  return first0;
}
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
// (The coil: its samples, its turns, its loops' radius and how far it runs along the vessel, world units; drawn as the needle's steel on
// its dark edge.)
// (COIL_R: the loops' largest radius; COIL_SPAN_K: their length along the vessel in lumen radii; COIL_EDGE: the wire's dark edge's half width,
// the widest layer; COIL_GAP: what is left between it and the wall.)
const COIL_N = 72, COIL_TURNS = 3.2, COIL_R = 4, COIL_SPAN_K = 3.2, COIL_EDGE = 0.78, COIL_GAP = 0.3, COIL_SWAY = 0.9, COIL_OPEN = 0.06, CP = new Float64Array((COIL_N + 1) * 2);
// (The pixel floors, in device pixels across: the needle 2, the coil's wire 1.5; the platinum wire's half width at 1x; the fibre tufts' half width,
// length and lean back from across the wire, world units and radians.)
const NEEDLE_PX = 2, COIL_PX = 1.5, COIL_WIRE = 0.56, TUFT_W = 0.14, TUFT_L = 1.7, TUFT_LEAN = 0.5;
const COIL_OUT = { dir: 1, rho: 0, span: 0 };
/**
 * Where the coil lies along the varix (glue = the route's r.glue: path, rad): dir (+1 or -1, the side of the needle's point with more of the
 * varix laid), rho (its loops' largest radius across the vessel, the lumen less the wire's edge and a gap) and span (its length along the
 * vessel from the point, world units). Written into out (kept) and returned; eusDraw lays the coil by it, and the stage fills the glue as far (stage-cath.js).
 */
export function coilReach(glue, out = {}) {
  const pa = glue.path, rad = glue.rad;
  out.dir = glue.dir || (pa.n - 1 - pa.at >= pa.at ? 1 : -1);   // (dir: the TIPS catheter's coil runs on up the vein, the way it came)
  const room = (out.dir > 0 ? pa.n - 1 - pa.at : pa.at) * pa.step;
  out.rho = Math.max(0, Math.min(COIL_R, rad - COIL_EDGE - COIL_GAP));
  out.span = Math.max(0, Math.min(COIL_SPAN_K * rad, room - 2 * out.rho * COIL_SWAY - 1));
  return out;
}
/** The coil's widest layer's half width (its dark edge) and what it keeps from the wall: a lumen narrower than both has no coil drawn. */
export const EUS_COIL_EDGE = COIL_EDGE + COIL_GAP;
// (The scope's centreline as drawn, for the tests: its samples' count and coordinates, kept.)
const LINE = { n: 0, x: null, y: null };
const OUT = { V, draws, tip: null, needle: null, line: null, coil: -1, coilTip: 0, coilTipY: 0 };
