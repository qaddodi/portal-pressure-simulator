// EUS-PPG on the anatomy (proc-anim.js MEASURES.eus plays it; stage-cath.js draws it): the linear echoendoscope's route down the
// esophagus into the stomach, its two stations in the proximal stomach, the two targets in the left lobe of the liver, and the scope,
// its ultrasound sector and the 25-gauge needle as the figure's GPU catheter draws them (veins-gl.js setCath: tubes, discs, a fan).
// Pure geometry and vertex building, no DOM.
//
// Where it goes (world units, the figure's own outlines, anatomy.js SEAM_D and EDGE_PATH): down the middle of the esophagus (a scope
// 12 units across in an esophagus about 20 across, as a 12.7 mm echoendoscope), through the cardia into the proximal stomach, where
// the left lobe of the liver lies over it. From there, its tip turned toward the liver, the needle crosses the stomach wall
// and the left lobe into the left portal vein near its end, the umbilical part. Drawn back a little and turned up, the needle crosses
// the lobe into the left hepatic vein, a little over a centimetre from the IVC. A linear echoendoscope's needle leaves the scope beside the
// transducer, in the plane of its image, about 40 degrees forward of the scope's axis: so the tip is turned until the needle's line
// from there meets the target, and the transducer lies against the wall. Each needle's way runs through the stomach and the liver
// only, clear of the portal trunk, the hepatic artery and the IVC (tests/eus-ppg.test.js holds it to that).

/** The scope's radius in the figure (world units). */
export const EUS_SCOPE_R = 6;
/** The targets: a vessel and how far along its drawn course (0..1 by length). */
export const EUS_TARGETS = { pv: ['PVH_L', 0.9], hv: ['LHV_IVC', 0.7] };
// The way in: above the figure (the esophagus fades out at its top), the esophagus, through the cardia on a line 50 degrees down
// to the hepatic vein's station, and on 12 units to the portal vein's (the route's end).
const LEAD = [[787, -175], [787, -105]];
const ESO = [[787, -40], [787, 0], [789, 60], [792, 120], [795, 170], [798, 210], [801, 240]];
const CARDIA = [[811.9, 253], [822.9, 266], [833.8, 279.1]];
const PROXIMAL = [[837.6, 283.7], [841.5, 288.3]];
export const EUS_BEND = 26, EUS_RIGID = 11, EUS_EXIT = (40 * Math.PI) / 180;
const BEND = EUS_BEND, RIGID = EUS_RIGID, EXIT = EUS_EXIT, FAN_HALF = (30 * Math.PI) / 180;

/** The route for stage-cath.js PROC_ROUTES (its builder lays loose points at the scope's own radius). */
export const EUS_ROUTE = {
  ids: ['PVH_L', 'LHV_IVC'], start: 0.5, tip: ['sto', 1], focus: ['eso', 'sto'],
  build(B) {
    const R = '=' + EUS_SCOPE_R.toFixed(3);
    B.pts(LEAD, R, 0); B.pts(ESO, R, 0, 'eso'); B.pts(CARDIA, R, 0, 'cardia'); B.pts(PROXIMAL, R, 0, 'sto');
  },
  // (After the route is laid: the hepatic vein's station, the targets, and the box the work's close-up frames.)
  after(r, geo) {
    r.hvD = r.spans.cardia[1];
    r.tg = { pv: pointOn(geo[EUS_TARGETS.pv[0]].cur, EUS_TARGETS.pv[1]), hv: pointOn(geo[EUS_TARGETS.hv[0]].cur, EUS_TARGETS.hv[1]) };
    const end = PROXIMAL[PROXIMAL.length - 1], xs = [r.tg.pv[0], r.tg.hv[0], end[0] + RIGID], ys = [r.tg.pv[1], r.tg.hv[1], CARDIA[0][1] - RIGID, end[1] + RIGID];
    r.box = [Math.min(...xs) - 16, Math.min(...ys) - 16, Math.max(...xs) + 16, Math.max(...ys) + 16];
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

/**
 * The scope's tip for a station and a target (pure): the route's point BEND before the station (p0, its direction t0), the tip's axis
 * once turned (a1, aim of the way from t0 to the turn the needle asks for), the end of its bend (p2), its end (end), where the needle
 * leaves it (exit), the side the transducer faces (side, a unit normal) and the needle's direction (nd). Written into g.
 */
export function eusTip(p0, t0, T, aim, g, exitA = EXIT) {
  const c1 = g.c1, c2 = g.c2, a1 = g.a1, sd = g.side, ex = g.exit, nd = g.nd, p2 = g.p2, end = g.end;
  ex[0] = p0[0] + t0[0] * (BEND + RIGID * 0.5); ex[1] = p0[1] + t0[1] * (BEND + RIGID * 0.5);
  for (let k = 0; k < 3; k++) {
    nd[0] = T[0] - ex[0]; nd[1] = T[1] - ex[1]; unit(nd);
    // (The axis the needle asks for: its line turned 40 degrees back, toward whichever side the scope comes from.)
    rot(nd[0], nd[1], -exitA, c1); rot(nd[0], nd[1], exitA, c2);
    const one = c1[0] * t0[0] + c1[1] * t0[1] >= c2[0] * t0[0] + c2[1] * t0[1], pick = one ? c1 : c2;
    a1[0] = t0[0] + (pick[0] - t0[0]) * aim; a1[1] = t0[1] + (pick[1] - t0[1]) * aim; unit(a1);
    rot(a1[0], a1[1], one ? Math.PI / 2 : -Math.PI / 2, sd);
    p2[0] = p0[0] + t0[0] * BEND * 0.5 + a1[0] * BEND * 0.5; p2[1] = p0[1] + t0[1] * BEND * 0.5 + a1[1] * BEND * 0.5;
    end[0] = p2[0] + a1[0] * RIGID; end[1] = p2[1] + a1[1] * RIGID;
    ex[0] = end[0] - a1[0] * RIGID * 0.62 + sd[0] * EUS_SCOPE_R * 0.92; ex[1] = end[1] - a1[1] * RIGID * 0.62 + sd[1] * EUS_SCOPE_R * 0.92;
  }
  nd[0] = T[0] - ex[0]; nd[1] = T[1] - ex[1]; g.len = Math.hypot(nd[0], nd[1]); unit(nd);
  return g;
}
const newTip = () => ({ c1: [0, 0], c2: [0, 0], a1: [0, 0], side: [0, 0], exit: [0, 0], nd: [0, 0], p2: [0, 0], end: [0, 0], len: 0 });

// The materials: the insertion tube's black polymer, its hairline, the rigid tip's grey, the transducer's pale face, the FNA needle's
// sheath and its steel; the ultrasound sector a pale grey-blue.
const BLACK = [0.17, 0.18, 0.2], INK = [0.04, 0.05, 0.07], TIP_GREY = [0.36, 0.37, 0.4], FACE = [0.78, 0.79, 0.8];
const SHEATH = [0.28, 0.5, 0.82], STEEL = [0.7, 0.72, 0.76], FAN = [0.8, 0.86, 0.93], PORT = [0.05, 0.05, 0.06];
const STEP = 2;   // (the shaft's samples, world units apart)

// Kept between frames and written in place: the scope's centreline, its samples' directions and lengths, the vertices and the draws.
let cx = new Float64Array(0), cy = new Float64Array(0), tx = new Float64Array(0), ty = new Float64Array(0), cl = new Float64Array(0);
const V = [], draws = [], TIP = newTip(), SPOT = [0, 0], TGT = [0, 0], FD = [0, 0];
let n = 0;
function grow(m) {
  if (cx.length >= m) return;
  const k = m * 2;   // alloc-rare: only when a longer scope than any before is drawn
  cx = new Float64Array(k); cy = new Float64Array(k); tx = new Float64Array(k); ty = new Float64Array(k); cl = new Float64Array(k);
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
  // The shaft along the route to the start of the bend, then the bend (a quadratic curve to the turned axis), then the rigid tip.
  const d0 = Math.max(0, tipD - BEND), q0 = at(r, d0), p0 = q0.p, t0 = q0.t;
  const g = eusTip(p0, t0, TGT, st.aim || 0, TIP);
  for (let d = 0; d < d0; d += STEP) { const q = at(r, d); push(q.p[0], q.p[1]); }
  const m1x = p0[0] + t0[0] * BEND * 0.5, m1y = p0[1] + t0[1] * BEND * 0.5;
  for (let i = 0; i <= 12; i++) {
    const u = i / 12, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    push(a * p0[0] + b * m1x + c * g.p2[0], a * p0[1] + b * m1y + c * g.p2[1]);
  }
  for (let i = 1; i <= 4; i++) push(g.p2[0] + g.a1[0] * RIGID * (i / 4), g.p2[1] + g.a1[1] * RIGID * (i / 4));
  cl[0] = 0;
  for (let i = 0; i < n; i++) {
    const j0 = Math.max(0, i - 1), j1 = Math.min(n - 1, i + 1), dx = cx[j1] - cx[j0], dy = cy[j1] - cy[j0], l = Math.hypot(dx, dy) || 1;
    tx[i] = dx / l; ty[i] = dy / l;
    if (i) cl[i] = cl[i - 1] + Math.hypot(cx[i] - cx[i - 1], cy[i] - cy[i - 1]);
  }
  const total = cl[n - 1], rigid0 = total - RIGID;
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
  OUT.tip = g.end; OUT.needle = nl > 0.4 ? [g.exit[0] + g.nd[0] * nl, g.exit[1] + g.nd[1] * nl] : g.end;   // alloc-rare: only while the needle is out (the readings' point)
  return OUT;
}
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const OUT = { V, draws, tip: null, needle: null };
