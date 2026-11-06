// The HVPG catheter and the procedure routes: its route along the vessels, shaft, balloon and column, its pressure readings and their room, and its camera follow.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { glassCallout, withGlass } from './callout.js';
import { flipAt, flipFrom } from './cath-flip.js';
import { PILL_GAP, pillsClear, placePillsInto } from './cath-pill.js';
import { outlineBox, placeSummary } from './cath-place.js';
import { dropLabel } from './drop-label.js';
import { D_SMALL, EASE_IN } from './ease.js';
import { cancelFrame } from './frame.js';
import { glWords } from './gl-words.js';
import { balloonOutline, balloonRy, routeRadii } from './hvpg-balloon.js';
import { LIGHT } from './light.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { restPass } from './rest-pass.js';
import { clamp, lerp, s } from './util.js';
import { EUS_ROUTE, eusDraw } from './eus-scope.js';

import { stageScope } from './stage-scope.js';
export function createCath(st, live) {
  const { E, NO_LIST, animateVT, appEl, applyVT, blockersRead, cardSpace, cardSpaceRead, cath, clientToVB, clientToVBFast, drawFrame, easeFrame, easeInOut, geo, glWanted, late, nextFrame, polyD, readBlockersRead, readFrame, refreshCTM, safeInsets, stageBox, syncVeins, toRGB, worldToLocalInto, wrap, wrapCS } = st;
  const CATH_IDS = ['SVC_RA', 'IVCS_RA', 'RHV_IVC', 'POST_R_RHV'];   // (and down the IVC_IS to the hepatic vein)
  const lenTo = (pts) => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; };
  /** The part of a polyline from length a to length b (cumulative lengths in cum). */
  function cutLen(pts, cum, a, b) {
    const out = [];
    for (let i = 1; i < pts.length; i++) {
      const s0 = cum[i - 1], s1 = cum[i];
      if (s1 < a || s0 > b) continue;
      const at = (d) => { const u = s1 > s0 ? (d - s0) / (s1 - s0) : 0; return [lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)]; };
      if (!out.length) out.push(at(Math.max(a, s0)));
      out.push(s1 <= b ? pts[i] : at(b));
    }
    return out;
  }
  // The route, with the lengths where its parts start: neck, SVC, IVC, right hepatic vein, the branch,
  // and the lumen's radius at each point (as the GPU draws it), so the balloon and the still column fill
  // the vein exactly. The course is held for the procedure; the radii follow the vessels' drawn caliber
  // live (it eases with the pressure), see cathLive.
  const cathRadOf = (id, f) => {
    const R = E[id].glR;
    if (!R?.length) return Math.max(0.5, E[id].width / 2);
    const x = clamp(f, 0, 1) * (R.length - 1), i = Math.min(R.length - 2, Math.floor(x));
    return lerp(R[i], R[i + 1], x - i);
  };
  // The vessels' courses meet at corners (the IVC turns into the hepatic vein at its side): the
  // catheter bends through them as a wire does. Resampled evenly, then smoothed with a window as wide
  // as the vein there, so the curve stays inside the lumen. (marks: where each part starts, as indices into pts.)
  function smoothRoute(pts, rad, marks) {
    const c0 = lenTo(pts), H = 1.2, n = Math.max(2, Math.ceil(c0[c0.length - 1] / H) + 1);
    let P = [], j = 1;
    const Rr = [], map = [];   // (map: each resampled point's two source points and the mix between them)
    for (let i = 0; i < n; i++) {
      const d = (c0[c0.length - 1] * i) / (n - 1);
      while (j < c0.length - 1 && c0[j] < d) j++;
      const u = c0[j] > c0[j - 1] ? clamp((d - c0[j - 1]) / (c0[j] - c0[j - 1]), 0, 1) : 0;
      P.push([lerp(pts[j - 1][0], pts[j][0], u), lerp(pts[j - 1][1], pts[j][1], u)]); Rr.push(lerp(rad[j - 1], rad[j], u)); map.push(j, u);
    }
    const idx = marks.map((m) => Math.round((c0[Math.min(m, c0.length - 1)] / c0[c0.length - 1]) * (n - 1)));
    const raw = P;   // the vessels' own centrelines, where the walls are (the balloon is fitted between them)
    for (let pass = 0; pass < 2; pass++) {
      const Q = P.map((q) => q.slice());
      for (let i = 1; i < n - 1; i++) {
        const sg = clamp(Rr[i] * 0.55, 1, 8) / H, w = Math.min(Math.ceil(sg * 2), i, n - 1 - i);
        let sx = 0, sy = 0, sw = 0;
        for (let k = -w; k <= w; k++) { const g = Math.exp(-(k * k) / (2 * sg * sg)); sx += P[i + k][0] * g; sy += P[i + k][1] * g; sw += g; }
        Q[i] = [sx / sw, sy / sw];
      }
      P = Q;
    }
    return { P, raw, Rr, map, idx };
  }
  function cathRoute() {
    const kind = cath.st?.route || cath.kind || 'hvpg';
    if (kind !== 'hvpg') return procRoute(kind);
    if (live.morph > 0.01 || CATH_IDS.some((id) => !geo[id]?.cur?.length || !E[id])) return null;
    if (cath.route?.kind === 'hvpg') return cath.route;
    const radOf = cathRadOf;
    const svc = geo.SVC_RA.cur, top = svc[0], pts = [], rad = [], src = [], marks = [];
    const at = (id, f) => { src.push([id, f]); return radOf(id, f); };
    const add = (id, rev) => {
      const P = rev ? geo[id].cur.slice().reverse() : geo[id].cur, c = lenTo(P), n = c[c.length - 1] || 1;
      marks.push(pts.length);
      for (let i = 1; i < P.length; i++) { pts.push(P[i]); rad.push(at(id, rev ? 1 - c[i] / n : c[i] / n)); }
    };
    marks.push(0);
    for (const q of [[top[0] - 6, top[1] - 150], [top[0] - 2, top[1] - 60], top]) { pts.push(q); rad.push(at('SVC_RA', 0)); }
    add('SVC_RA', false); add('IVCS_RA', true);
    // On down the middle of the IVC to the level where the right hepatic vein opens into it.
    const ost = geo.RHV_IVC.cur[geo.RHV_IVC.cur.length - 1];
    if (geo.IVC_IS?.cur?.length && E.IVC_IS) {
      const P = geo.IVC_IS.cur.slice().reverse(), c = lenTo(P), n = c[c.length - 1] || 1;
      for (let i = 1; i < P.length && P[i][1] < ost[1] - 4; i++) { pts.push(P[i]); rad.push(at('IVC_IS', 1 - c[i] / n)); }
    }
    add('RHV_IVC', true); add('POST_R_RHV', true);
    const { P, raw, Rr, map, idx } = smoothRoute(pts, rad, marks);
    const cum = lenTo(P), L = (i) => cum[Math.min(idx[i], cum.length - 1)];
    // The tip reads in the trunk of the right hepatic vein, about two thirds of the way out from the IVC.
    const hv0 = L(3), hv1 = L(4);
    const r = { kind: 'hvpg', pts: P, raw, rad: Rr.slice(), src, map, refs: null, cum, total: cum[cum.length - 1], start: L(1) * 0.55, free: hv0 + (hv1 - hv0) * 0.62, hv0, hvEnd: hv1 };
    if (E.RHV_IVC.glR?.length) cath.route = r;
    return r;
  }
  // The treatment catheters (proc-anim.js plays them, from Tests › HVPG or a slide's procedure), each on the real vessels as
  // the HVPG catheter is: TIPS in from the neck to the right hepatic vein, a needle across the liver along the TIPS tract into
  // the right portal vein and on into the trunk; BRTO up from the femoral vein, the IVC and the left renal vein into the
  // gastrorenal shunt; BATO through the liver into the right portal vein, along the portal and splenic veins into the short
  // gastric feeder of the fundal varices. build lays the legs in the order the catheter travels (see procRoute); tip: where
  // the tip stops (a leg's name and how far along it); focus: the legs the close-up frames; start: how far along the lead-in
  // the tip sits before it moves.
  const PROC_ROUTES = {
    tips: { ids: ['SVC_RA', 'IVCS_RA', 'IVC_IS', 'RHV_IVC', 'TIPS', 'PVH_R', 'PV_TRUNK'], start: 0.55, tip: ['trunk', 0.45], focus: ['hv', 'trunk'],
      build(B) {
        const top = geo.SVC_RA.cur[0], ost = geo.RHV_IVC.cur[geo.RHV_IVC.cur.length - 1];
        B.pts([[top[0] - 6, top[1] - 150], [top[0] - 2, top[1] - 60], top], 'SVC_RA', 0);
        B.vessel('SVC_RA'); B.vessel('IVCS_RA', { rev: true });
        B.vessel('IVC_IS', { rev: true, until: (q) => q[1] >= ost[1] - 4 });
        // Out along the right hepatic vein to where the tract leaves it, then the needle's path through the liver (the tract,
        // as wide as the stent will be) into the right portal vein, and the wire on into the portal trunk.
        B.vessel('RHV_IVC', { rev: true, near: geo.TIPS.cur[geo.TIPS.cur.length - 1], name: 'hv' });
        B.vessel('TIPS', { rev: true, name: 'tract', r: cathRadOf('PVH_R', 0.5) * 0.8 });
        B.vessel('PVH_R', { rev: true, name: 'rpv' }); B.vessel('PV_TRUNK', { rev: true, b: 0.6, name: 'trunk' });
      } },
    // (BRTO's balloon sits near the renal end of the shunt, 0.2 of the way up it: at 0.3 the tip and balloon lay on the splenic vein,
    // which crosses the shunt from 0.30 to 0.34, and the catheter drew over it. Now the tip stops about 36 px below it.)
    brto: { ids: ['ILI_IVC', 'IVC_IS', 'LRV_IVC', 'C5'], start: 0.55, tip: ['shunt', 0.2], focus: ['lrv', 'shunt'],
      build(B) {
        const bot = geo.ILI_IVC.cur[0], lrv = geo.LRV_IVC.cur[geo.LRV_IVC.cur.length - 1];
        B.pts([[bot[0] + 4, bot[1] + 150], [bot[0] + 1, bot[1] + 60], bot], 'ILI_IVC', 0);
        B.vessel('ILI_IVC'); B.vessel('IVC_IS', { until: (q) => q[1] <= lrv[1] + 4 });
        B.vessel('LRV_IVC', { rev: true, name: 'lrv' }); B.vessel('C5', { rev: true, name: 'shunt' });
      } },
    bato: { ids: ['PVH_R', 'PV_TRUNK', 'SV_CONF', 'C2'], start: 0.1, tip: ['feeder', 0.35], focus: ['splenic', 'feeder'],
      build(B) {
        const rpv = geo.PVH_R.cur[geo.PVH_R.cur.length - 1];
        B.pts([[rpv[0] - 215, rpv[1] + 34], [rpv[0] - 120, rpv[1] + 16], rpv], 'PVH_R', 1);
        B.vessel('PVH_R', { rev: true }); B.vessel('PV_TRUNK', { rev: true });
        B.vessel('SV_CONF', { rev: true, name: 'splenic' }); B.vessel('C2', { name: 'feeder' });
      } },
    eus: EUS_ROUTE,   // (EUS-PPG's echoendoscope: down the esophagus to the lesser curve, eus-scope.js)
  };
  // A leg's lumen radius: a vessel's drawn caliber there, or a fixed one ('=r', a tract through the liver).
  const PROC_FIXED = new Map();   // ('=r' → r, each fixed radius a route was built with, set when the leg is laid)
  const procRadOf = (id, f) => (id[0] === '=' ? PROC_FIXED.get(id) ?? +id.slice(1) : cathRadOf(id, f));
  function procRoute(kind) {
    const spec = PROC_ROUTES[kind];
    if (!spec || live.morph > 0.01 || spec.ids.some((id) => !geo[id]?.cur?.length || !E[id])) return null;
    if (cath.route?.kind === kind) return cath.route;
    const pts = [], rad = [], src = [], marks = [], parts = [];
    const at = (id, f) => { src.push([id, f]); return procRadOf(id, f); };
    const B = {
      // Loose points (a lead-in from outside the plate), with the lumen radius of vessel id at f; the last one is where the next leg starts.
      pts(list, id, f, name = 'lead') { marks.push(pts.length); parts.push({ id: null, name }); for (const q of list) { pts.push(q); rad.push(at(id, f)); } },
      // A vessel, whole or in part, the way the catheter travels it (rev: against its drawn course): from a to b of the
      // way, or until a point meets until(q), or to the point nearest `near`. r: a fixed lumen radius instead of its caliber.
      vessel(id, { rev = false, a = 0, b = 1, until = null, near = null, name = id, r = 0 } = {}) {
        const P0 = rev ? geo[id].cur.slice().reverse() : geo[id].cur, c = lenTo(P0), n = c[c.length - 1] || 1;
        if (near) { let best = Infinity; P0.forEach((q, i) => { const dd = Math.hypot(q[0] - near[0], q[1] - near[1]); if (dd < best) { best = dd; b = c[i] / n; } }); }
        if (until) { const i = P0.findIndex((q, k) => k > 0 && until(q)); if (i > 0) b = c[i - 1] / n; }
        const seg = cutLen(P0, c, a * n, b * n), own = (f) => (rev ? 1 - f : f);
        marks.push(pts.length); parts.push({ id, name, fa: own(a), fb: own(b) });
        for (let i = a === 0 && pts.length ? 1 : 0, run = a * n; i < seg.length; i++) {
          if (i) run += Math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1]);
          if (r) { const rs = r.toFixed(3), fid = '=' + rs; PROC_FIXED.set(fid, +rs); pts.push(seg[i]); rad.push(at(fid, 0)); } else { pts.push(seg[i]); rad.push(at(id, own(run / n))); }
        }
      },
    };
    spec.build(B);
    const { P, raw, Rr, map, idx } = smoothRoute(pts, rad, marks);
    const cum = lenTo(P), total = cum[cum.length - 1], L = (i) => (i < idx.length ? cum[Math.min(idx[i], cum.length - 1)] : total);
    parts.forEach((q, i) => { q.d0 = L(i); q.d1 = L(i + 1); });
    const span = (name) => parts.find((q) => q.name === name);
    const tp = span(spec.tip[0]), free = tp.d0 + (tp.d1 - tp.d0) * spec.tip[1];
    const spans = Object.fromEntries(parts.filter((q) => q.name !== 'lead').map((q) => [q.name, [q.d0, q.d1]]));
    const r = { kind, pts: P, raw, rad: Rr.slice(), src, map, refs: null, radOf: procRadOf, cum, total, parts, spans,
      start: parts[1].d0 * spec.start, free, hv0: free, hvEnd: total, focus: [span(spec.focus[0]).d0, span(spec.focus[1]).d1] };
    spec.after?.(r, geo);
    if (E[spec.ids[spec.ids.length - 1]].glR?.length) cath.route = r;
    return r;
  }
  // The route's lumen radii from the vessels' drawn caliber now, so the balloon and the still column hug the
  // walls as the vein widens and narrows (re-read only when a vessel's radii were sent again).
  function cathLive(r) {
    // (Each vessel's radii buffer is kept and refilled, so a change is told by its version, glRv, not by a new array.)
    r.ids ||= [...new Set(r.src.map((q) => q[0]))];
    const ids = r.ids;
    let same = !!r.refs && r.refs.length === ids.length;
    if (same) for (let i = 0; i < ids.length; i++) { const e = E[ids[i]]; if (r.refs[i] !== (e?.glR ? e.glRv : -1)) { same = false; break; } }
    if (same) return;
    r.refs = ids.map((id) => (E[id]?.glR ? E[id].glRv : -1));
    routeRadii(r.src, r.map, r.radOf || cathRadOf, r.rad);
  }
  /** The point, direction, the vein's own centre (w) and lumen radius at length d along the route. */
  // walk: { i } kept between calls whose d only grows (a strip's samples): its segment is found walking on from the last one.
  function cathAt(r, d, walk = null) {
    d = clamp(d, 0, r.total);
    // (The first point at or past d, by halving: the shaft asks for hundreds of points a frame, each had walked the route from its start.)
    let i = 1, hi = r.cum.length - 1;
    if (walk) { i = Math.max(1, walk.i || 1); while (i < hi && r.cum[i] < d) i++; walk.i = i; }
    else while (i < hi) { const m = (i + hi) >> 1; if (r.cum[m] < d) i = m + 1; else hi = m; }
    const s0 = r.cum[i - 1], s1 = r.cum[i], u = s1 > s0 ? (d - s0) / (s1 - s0) : 0, a = r.pts[i - 1], b = r.pts[i];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const wa = r.raw[i - 1], wb = r.raw[i];
    return { p: [lerp(a[0], b[0], u), lerp(a[1], b[1], u)], t: [(b[0] - a[0]) / l, (b[1] - a[1]) / l], w: [lerp(wa[0], wb[0], u), lerp(wa[1], wb[1], u)], r: lerp(r.rad[i - 1], r.rad[i], u) };
  }
  function cathPaint() {
    const st = cath.st, r = st && cathRoute();
    const gpu = !!r && glWanted() && live.veins.canCath;
    cath.g.style.display = r && !gpu ? '' : 'none';
    cath.labels.hidden = !r;
    if (!gpu) cathLast = null;   // (its fade-out only redraws what the GPU last drew)
    if (!r) { if (live.veins?.canCath) live.veins.setCath(null); return; }
    cathLive(r);
    if (!live.CTM) refreshCTM();
    // A blocked hepatic vein: the tip only reaches the ostium and probes it (st.probe 0..1 nudges it in).
    const end = st.ostium ? r.hv0 - 2 : r.hvD ? lerp(r.free, r.hvD, st.tgt || 0) : r.free;   // (EUS-PPG: between its two stations)
    const Rf = cathAt(r, r.free).r;
    const tipD = r.start + (end - r.start) * clamp(st.u, 0, 1) + (st.probe || 0) * Rf * 1.6;
    // A 5 F catheter in the hepatic vein, held at one width in the world for the whole procedure (never
    // thinner than about 3 px at the start, nor so thick it crowds the vein), so it scales with the anatomy as the camera moves.
    // (A treatment's catheter is a real one in the narrowest vein it goes through: 0.4 of that vein's lumen, so it reads as a tube
    // with a tip and an edge, never a line: his ask, 29 Oct. The HVPG one is as wide for its vein: one catheter look, 1 Nov.)
    if (!cath.rc) cath.rc = r.parts ? procRc(r, Rf) : r.hvD ? Rf : clamp(1.6 / (live.CTM.sc || 1), Rf * 0.26, Rf * 0.34);
    const rc = cath.rc, ahead = cathAt(r, Math.min(r.total, tipD + Rf * 6.4));
    const tp = cathAt(r, tipD);
    cath.at = { tip: tp.p, ahead: ahead.p, nx: -tp.t[1], ny: tp.t[0] };
    // The wedged reading: the vein beyond the balloon, out toward the sinusoids, takes the wedged
    // pressure's color in the vessel's own rendering, filling outward as the column settles.
    let tint = null;
    const col = clamp(st.column || 0, 0, 1);
    if (gpu && col > 0.001 && r.parts) {
      // A treatment's sclerosant: from the tip on to the route's end, each vessel it reaches tinted over the part it covers
      // (an end where it runs on into the next vessel left open, so the joins show no edge).
      const a = tipD, reach = a + (r.total - a) * col;
      tint = { col: st.columnColor || 'var(--tr-wedge)', soft: Rf * 2.6 };
      for (const q of r.parts) {
        if (!q.id || q.d1 <= a || q.d0 >= reach) continue;
        const f = (d) => q.fa + (q.fb - q.fa) * clamp((d - q.d0) / (q.d1 - q.d0 || 1), 0, 1), open = (fe) => (fe === 0 ? -1 : fe === 1 ? 2 : fe);
        const lo = a < q.d0 - 0.5 ? open(q.fa) : f(a), hi = reach > q.d1 + 0.5 ? open(q.fb) : f(reach);
        tint[q.id] = [Math.min(lo, hi), Math.max(lo, hi)];
      }
    } else if (gpu && col > 0.001) {
      const a = tipD - rc * 4.2, reach = a + (r.total - a) * col, soft = Rf * 2.6;   // (a long fade where it meets moving blood)
      const hv = (d) => 1 - (d - r.hv0) / (r.hvEnd - r.hv0), br = (d) => 1 - (d - r.hvEnd) / (r.total - r.hvEnd);
      tint = { col: st.columnColor || 'var(--tr-wedge)', soft, RHV_IVC: [hv(Math.min(reach, r.hvEnd)), hv(a)] };
      if (reach >= r.hvEnd) tint.RHV_IVC[0] = -1;   // runs on into the branch: no edge at the join
      if (reach > r.hvEnd) tint.POST_R_RHV = [br(reach), 2];
    }
    const tk = !tint ? '' : r.parts ? Object.entries(tint).map(([k, v]) => (Array.isArray(v) ? `${k}:${v.map((x) => x.toFixed(3))}` : k === 'col' ? v : '')).join('|')
      : `${tint.col}|${tint.RHV_IVC.map((v) => v.toFixed(3))}|${tint.POST_R_RHV?.[0].toFixed(3) ?? ''}`;
    if (tk !== cath.tintKey) { cath.tintKey = tk; live.cathTint = tint; if (!live.inUpdate) syncVeins(easeInOut(live.morph)); }
    if (gpu) (r.hvD ? eusGL : cathGL)(st, r, tipD, rc);
    else cathSVG(st, r, tipD, rc * 2, Rf * 2);
    live.cathVer++; live.stageWake();
    // In order, once a frame: the catheter (above), the camera following it, its readings for both, then the one render pass
    // (animate, the frame's last callback).
    if (st.follow) cathFollow();
    cathLabelsSoon();
  }
  // The readings laid out after everything else of the frame has moved (the catheter, the camera), once; asked for outside a
  // frame, at the next. (Each lay out read the page's layout after the step before had written to it.)
  function cathLabelsSoon() { if (!cath.lblRaf) cath.lblRaf = drawFrame(cathLabelsNow); }
  // (The render pass runs a lay out still waiting first, so the frame goes catheter, camera, readings, render.)
  function cathLabelsNow() { if (!cath.lblRaf) return; cancelFrame(cath.lblRaf); cath.lblRaf = 0; if (cath.st) cathLabels(); }
  // A treatment catheter's radius: one caliber for all three, the TIPS one (his ask, 29 Oct: the BRTO catheter was hair thin), 0.4 of
  // the narrowest lumen on the TIPS way (the right hepatic vein, and the tract as wide as the stent), never wider than 0.7 of the
  // narrowest lumen on this route, so it fits inside its vessels with room for its edge (the one catheter look, 1 Nov).
  function procRc(r, Rf) {
    let m = Rf;
    for (let i = 0; i < r.pts.length; i++) if (r.cum[i] >= procIn(r) && r.cum[i] <= r.free) m = Math.min(m, r.rad[i]);
    let t = E.PVH_R ? cathRadOf('PVH_R', 0.5) * 0.8 : m * 2;
    if (E.RHV_IVC) for (let f = 0.2; f <= 1.001; f += 0.1) t = Math.min(t, cathRadOf('RHV_IVC', f));
    return Math.max(0.5, Math.min(t * 0.4, m * 0.7));
  }
  // On the GPU (veins-gl.js): the still column, the shaft and its shadow, the marker band and rounded tip,
  // the balloon behind the tip and the reading ripples, as tubes and discs in world units.
  function cathGL(st, r, tipD, rc) {
    const V = [], draws = [], op = st.opacity ?? 1, cs = wrapCS();
    const sh = cathShaft(r, rc), begin = () => sh.count + V.length / 6;
    const tube = (a, b, rOf, mode, col, alpha, fade, ox = 0, oy = 0) => {
      const first = begin(), step = Math.max(rc * 0.6, 0.35);
      const n = Math.max(2, Math.ceil((b - a) / step) + 1);
      for (let i = 0; i < n; i++) {
        const d = a + (b - a) * (i / (n - 1)), q = cathAt(r, d), nx = -q.t[1], ny = q.t[0], w = rOf(q, d);
        for (const side of [-1, 1]) V.push(q.p[0] + ox + nx * w * side, q.p[1] + oy + ny * w * side, nx, ny, side, d - a);
      }
      draws.push({ mode, first, count: begin() - first, col, alpha: alpha * op, fade, len: b - a });
    };
    const disc = (c, t, hx, hy, mode, col, alpha) => {
      const first = begin(), nx = -t[1], ny = t[0];
      for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) V.push(c[0] + t[0] * hx * u + nx * hy * v, c[1] + t[1] * hx * u + ny * hy * v, t[0], t[1], u, v);
      draws.push({ mode, first, count: 4, col, alpha: alpha * op });
    };
    // One catheter for every procedure (HVPG, TIPS, BRTO, BATO): a satin polymer shaft with a hairline edge and a soft contact
    // shadow, a tip that tapers to a rounded end, and a slim platinum marker band behind it.
    const shaft = CATH_POLY, edge = CATH_EDGE_INK, metal = CATH_METAL;
    const b = tipD - rc * 1.6, k = Math.min(sh.n, Math.ceil(b / sh.step));
    const shaftPart = (first, w, mode, col, alpha) => {
      if (k < 1) return;
      draws.push({ mode, first, count: k * 2, col, alpha: alpha * op, fade: [60, 0], len: b });
      const a = (k - 1) * sh.step;
      if (b > a) {
        const f = begin();
        for (const d of [a, b]) {
          const q = cathAt(r, d), nx = -q.t[1], ny = q.t[0];
          for (const side of [-1, 1]) V.push(q.p[0] + nx * w * side, q.p[1] + ny * w * side, nx, ny, side, d);
        }
        draws.push({ mode, first: f, count: 4, col, alpha: alpha * op, fade: [60, 0], len: b });
      }
    };
    // The taper: the last stretch narrows to two thirds, then a rounded end (its edge drawn first, round it).
    const taper = (q, d) => rc * lerp(1, 0.66, smoothstep01((d - b) / (rc * 1.6)));
    const tp = cathAt(r, tipD), tipR = rc * 0.66;
    shaftPart(0, rc * 2.2, 0, [0.04, 0.05, 0.08], 0.2);
    tube(b, tipD - rc * 0.3, (q, d) => taper(q, d) * 2.2, 0, [0.04, 0.05, 0.08], 0.12, [0, 0]);
    shaftPart(sh.n * 2, rc * CATH_EDGE, 7, edge, 0.62);
    tube(Math.max(0, b - rc * 0.2), tipD, (q, d) => taper(q, d) + (CATH_EDGE - 1) * rc, 7, edge, 0.62, [0, 0]);
    disc(tp.p, tp.t, tipR + (CATH_EDGE - 1) * rc, tipR + (CATH_EDGE - 1) * rc, 8, edge, 0.62);
    shaftPart(sh.n * 4, rc, 2, shaft, 1);
    tube(Math.max(0, b - rc * 0.2), tipD, taper, 2, shaft, 1, [0, 0]);
    disc(tp.p, tp.t, tipR, tipR, 4, shaft, 1);
    // A TIPS's needle and wire (proc-anim.js: their tips as u, 0 while not out), drawn only ahead of the catheter's tip, so the
    // catheter covers them as it slides over: the needle brushed steel with a hairline edge, narrowing to a bevelled point; the
    // wire a fine dark line on into the portal trunk. The portal hit: two rings at the needle's tip, the portal vein's colour.
    const toD = (u) => r.start + (r.free - r.start) * clamp(u, 0, 1);
    if (st.wire > 0) { const wD = toD(st.wire); if (wD > tipD + rc * 0.6) { tube(tipD + rc * 0.3, wD, () => rc * 0.3, 7, edge, 0.9, [0, 0]); tube(tipD + rc * 0.3, wD, () => rc * 0.14, 3, metal, 0.8, [0, 0]); } }
    if (st.needle > 0) {
      const nD = toD(st.needle), bev = rc * 1.4;
      if (nD > tipD + rc * 0.6) {
        const nr = (q, d) => rc * 0.42 * lerp(1, 0.18, smoothstep01((d - (nD - bev)) / bev));
        tube(tipD + rc * 0.3, nD, (q, d) => nr(q, d) + rc * 0.12, 7, edge, 0.75, [0, 0]);
        tube(tipD + rc * 0.3, nD, nr, 3, metal, 1, [0, 0]);
      }
      if (st.flash > 0) {
        const np = cathAt(r, nD), rgb = toRGB('var(--tr-pv)', cs);
        for (const k of [st.flash, (st.flash + 0.5) % 1]) disc(np.p, np.t, rc * (1.2 + 5 * k), rc * (1.2 + 5 * k), 6, rgb, (1 - k) * (1 - k) * 0.85);
      }
    }
    // The radiopaque marker: a slim platinum band just behind the taper.
    const band = (d0, d1, w = 1.04) => tube(Math.max(0, d0), d1, () => rc * w, 3, metal, 1, [0, 0]);
    band(tipD - rc * 3.1, tipD - rc * 2.4);
    // The balloon sits just behind the tip; inflated, it fills the vein and wedges, held inside its walls.
    const bl = clamp(st.balloon || 0, 0, 1);
    cath.balBox = null;
    if (bl > 0.001) {
      const gap = rc * 4.2, Rb = cathAt(r, tipD - gap - rFree(r) * 1.6).r, sp = r.spans?.[st.balloonSpan];
      // (A TIPS's angioplasty balloon lies along the tract it opens, its whole length; the others sit just behind the tip.)
      // (A treatment's occlusion balloon fills the vein from wall to wall and is longer, so it reads at a glance: his ask, 29 Oct.)
      const rx = sp ? (sp[1] - sp[0]) * 0.45 : r.parts ? lerp(rc * 3.4, Rb * 2.6, bl) : lerp(rc * 3.4, Rb * 1.6, bl), dC = sp ? (sp[0] + sp[1]) / 2 : tipD - gap - rx;
      const at = (d) => cathAt(r, d), ry0 = balloonRy(at, dC, rx, r.parts ? Math.max(rc * 1.35, Rb) : rc * 1.35, { floor: rc * 1.05 });
      // Bent with the vein: a strip whose sides are the outline, its local coords on the unit circle at the
      // sides so it shades and edges as the latex disc does.
      // (its two marker bands, at the shoulders, under the latex as the shaft is)
      band(dC - rx * 0.72 - rc * 0.35, dC - rx * 0.72 + rc * 0.35, 1.0); band(dC + rx * 0.72 - rc * 0.35, dC + rx * 0.72 + rc * 0.35, 1.0);
      const first = begin(), ol = balloonOutline(at, dC, rx, ry0, bl, { floor: rc * 1.05 });
      cath.balBox = outlineBox(ol);   // (the readings keep clear of it)
      for (const o of ol) {
        const nx = -o.t[1], ny = o.t[0], v = Math.sqrt(Math.max(0, 1 - o.s * o.s));
        for (const side of [-1, 1]) V.push(o.c[0] + nx * o.h * side, o.c[1] + ny * o.h * side, o.t[0], o.t[1], o.s, v * side);
      }
      draws.push({ mode: 5, first, count: begin() - first, col: CATH_LATEX, alpha: (0.7 + 0.3 * bl) * op });   // latex over dilute contrast
    }
    // The tip reading: two ripples running out from it.
    if (st.ring) {
      const rgb = toRGB(st.ring, cs), ph = ((st.clock || 0) / 1300) % 1;
      for (const k of [ph, (ph + 0.5) % 1]) disc(tp.p, tp.t, rc * (1.6 + 4.2 * k), rc * (1.6 + 4.2 * k), 6, rgb, (1 - k) * (1 - k) * 0.9);
    }
    if (cathV.length < V.length) cathV = new Float32Array(V.length * 2);
    cathV.set(V);
    live.veins.setCath(cathLast = { base: sh.verts, verts: cathV.subarray(0, V.length), draws, light: LIGHT });
  }
  let cathV = new Float32Array(0), cathLast = null;
  // EUS-PPG's echoendoscope, its sector and its needle (eus-scope.js), sent as the catheter is.
  function eusGL(st, r, tipD) {
    const o = eusDraw(st, r, tipD, cathAt, (c) => toRGB(c, wrapCS()));
    if (cathV.length < o.V.length) cathV = new Float32Array(o.V.length * 2);
    cathV.set(o.V); cath.balBox = null; cath.at.tip = o.needle; cath.at.ahead = o.tip;
    live.veins.setCath(cathLast = { base: null, verts: cathV.subarray(0, o.V.length), draws: o.draws, light: LIGHT });
  }
  // The catheter's materials: an ivory polymer, a deep neutral hairline at 1.16 of its radius, platinum markers, clear latex.
  const CATH_POLY = [0.94, 0.94, 0.93], CATH_EDGE = 1.16, CATH_EDGE_INK = [0.11, 0.13, 0.17], CATH_METAL = [0.66, 0.68, 0.72], CATH_LATEX = [0.9, 0.93, 0.97];
  const smoothstep01 = (x) => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); };
  // The shaft's tube and its shadow's along the whole route, at the shaft's one width (cath.rc), sampled every `step` from the
  // start: made once per route and width and sent to the GPU once (veins-gl.js setCath's base); a frame draws them in to the tip.
  // (It was every sample of both rebuilt and sent again each frame, the ripples alone changing as a reading showed.)
  function cathShaft(r, rc) {
    const key = `${r.kind}|${r.pts.length}|${r.total}|${r.pts[0]}|${r.pts.at(-1)}|${rc}`;
    if (cath.shaft?.key === key) return cath.shaft;
    const step = Math.max(rc * 0.6, 0.35), n = Math.floor(r.total / step) + 1, V = new Float32Array(n * 36);
    const tube = (o, w, ox, oy) => {
      const walk = { i: 1 };
      for (let i = 0; i < n; i++) {
        const d = i * step, q = cathAt(r, d, walk), nx = -q.t[1], ny = q.t[0];
        for (const side of [-1, 1]) { V.set([q.p[0] + ox + nx * w * side, q.p[1] + oy + ny * w * side, nx, ny, side, d], o); o += 6; }
      }
    };
    // the shadow; a treatment's is its dark rim, round the shaft, so the catheter stands out on any vein
    tube(0, rc * 2.2, 0, 0);                  // a soft contact shadow, straight under it
    tube(n * 12, rc * CATH_EDGE, 0, 0);       // its hairline edge
    tube(n * 24, rc, 0, 0);                   // the shaft
    return (cath.shaft = { key, step, n, count: n * 6, verts: V });
  }
  // When the procedure ends or is cancelled the catheter, its balloon and its labels fade out instead of vanishing in one frame
  // (MOTION_HEAT_REVIEW P21). A new catheter meanwhile ends the fade at once.
  // The catheter fades over a small step (240 ms). The readings leave as every reading does (cathLabels: cath-pre, cath-out): each label's own children
  // fade, so its glass, drawn on the GPU from the glass element's own opacity (glass-gl.js), fades with its words. A fade of the whole
  // layer was one that glass could not follow: the pills stayed solid after their words had gone.
  const CATH_OUT_MS = D_SMALL, READING_OUT_MS = D_SMALL + 100;
  function cathFadeOut() {
    const gs = live.veins?.canCath ? cathLast : null, anims = [];
    if (cath.made) for (const el of cath.made.values()) el.classList.add('cath-pre', 'cath-out');
    if (cath.g.style.display !== 'none' && cath.g.animate) anims.push(cath.g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CATH_OUT_MS, easing: EASE_IN, fill: 'forwards' }));
    const me = { raf: 0, done: null, cleared: false }, t0 = performance.now();
    // The catheter itself: gone once its fade has run.
    const catheterGone = () => {
      if (me.cleared) return;
      me.cleared = true;
      for (const a of anims) a.cancel();
      if (live.veins?.canCath) live.veins.setCath(null);
      live.cathVer++; live.stageWake();
      cath.g.style.display = 'none';
    };
    // Everything: the readings are removed once faded (or at once, when a new catheter ends the fade).
    me.done = () => {
      if (live.cathFade !== me) return;
      live.cathFade = null; cancelFrame(me.raf); stageScope.clear(me.timer);
      catheterGone();
      cath.labels.hidden = true;
      if (cath.made) for (const el of cath.made.values()) dropLabel(el);
      late('kids', cath.labels, NO_LIST); cath.made?.clear();
    };
    const step = (now) => {
      const el = Math.max(0, now - t0), k = Math.min(1, el / CATH_OUT_MS);   // (the frame's clock can be a few ms before t0: 0, not a negative k that would draw the catheter brighter than it was)
      if (el >= READING_OUT_MS) { me.done(); return; }
      if (k >= 1) catheterGone();
      else if (gs && live.veins?.canCath) { const a = (1 - k) * (1 - k); live.veins.setCath({ ...gs, draws: gs.draws.map((d) => ({ ...d, alpha: d.alpha * a })) }); live.cathVer++; live.stageWake(); }
      me.raf = easeFrame(step);
    };
    live.cathFade = me;
    me.raf = easeFrame(step);
    me.timer = stageScope.timer(me.done, READING_OUT_MS + 150);   // (frames stalled in a background tab: it still ends)
  }   // the catheter's vertices, reused frame to frame
  const rFree = (r) => cathAt(r, r.free).r;
  // Without WebGL: the same catheter in SVG (the ivory shaft on its hairline edge, a rounded end, clear latex).
  function cathSVG(st, r, tipD, cw, wHV) {
    const body = cutLen(r.pts, r.cum, 0, tipD), d = polyD(body), tp = body[body.length - 1];
    for (const el of [cath.shadow, cath.body]) el.setAttribute('d', d);
    cath.shadow.setAttribute('stroke-width', (cw * CATH_EDGE).toFixed(2)); cath.body.setAttribute('stroke-width', cw.toFixed(2));
    cath.tip.setAttribute('cx', tp[0].toFixed(2)); cath.tip.setAttribute('cy', tp[1].toFixed(2)); cath.tip.setAttribute('r', (cw * 0.5).toFixed(2));
    cath.ring.setAttribute('cx', tp[0].toFixed(2)); cath.ring.setAttribute('cy', tp[1].toFixed(2));
    cath.ring.setAttribute('r', (cw * (1.8 + 0.8 * (st.pulse || 0))).toFixed(2)); cath.ring.style.display = st.ring ? '' : 'none';
    cath.ring.style.stroke = st.ring || '';
    // The balloon: inflated, it lies along the vein and fills it wall to wall (see balloonOutline).
    const sp = r.spans?.[st.balloonSpan], bl = clamp(st.balloon || 0, 0, 1), at = (d) => cathAt(r, d);
    const rx = sp ? (sp[1] - sp[0]) * 0.45 : wHV * (0.45 + 0.35 * bl), dC = sp ? (sp[0] + sp[1]) / 2 : tipD - rx - cw * 1.5;
    const ry0 = balloonRy(at, dC, rx, cw * 0.65, { floor: cw * 0.55 }), ol = balloonOutline(at, dC, rx, ry0, bl, { floor: cw * 0.55 });
    const side = (k) => ol.map((o) => [o.c[0] - o.t[1] * o.h * k, o.c[1] + o.t[0] * o.h * k]);
    cath.balBox = bl > 0 ? outlineBox(ol) : null;   // (the readings keep clear of it)
    cath.balloon.style.display = bl > 0 ? '' : 'none';
    cath.balloon.setAttribute('d', bl > 0 ? `${polyD([...side(1), ...side(-1).reverse()])}Z` : '');
    const col = clamp(st.column || 0, 0, 1), reach = tipD + (r.total - tipD) * col;
    const a = cutLen(r.pts, r.cum, tipD, reach);
    cath.column.setAttribute('d', a.length > 1 ? polyD(a) : ''); cath.column.setAttribute('stroke-width', (wHV * 0.82).toFixed(2));
    cath.column2.setAttribute('d', '');
    cath.column.style.stroke = st.columnColor || '';
    cath.g.style.opacity = st.opacity ?? 1;
  }
  // A reading that has to move to a new spot (the cards or the slide changed the room it has) glides there, eased, never
  // jumps: its jump is kept as an offset that eases to nothing, while it still follows its point on the figure as the camera moves.
  // (x, y: where it should be now; ax, ay: its point. Returns where it shows. A glide still running asks for the next frame.)
  const CATH_GLIDE = 600;
  // (The glide's answer goes in one kept pair, which its two callers read at once; the glide's record is the label's own, written in place.)
  const GLIDE_XY = [0, 0], cathGlideTick = () => { cath.glideRaf = 0; cath.lblKey = ''; cathLabelsSoon(); };
  function cathGlide(el, x, y, ax, ay) {
    const now = performance.now();
    let g = el._gl, ox = 0, oy = 0;
    if (g) {
      const u = Math.min(1, (now - g.t0) / CATH_GLIDE), e = 1 - (1 - u) ** 3;
      ox = g.ox * (1 - e); oy = g.oy * (1 - e);
      const jx = x - g.x - (ax - g.ax), jy = y - g.y - (ay - g.ay);
      if (Math.hypot(jx, jy) > 4 && !reduceMotion.matches) { ox -= jx; oy -= jy; g.ox = ox; g.oy = oy; g.t0 = now; }
      g.x = x; g.y = y; g.ax = ax; g.ay = ay;
    } else g = el._gl = { x, y, ax, ay, ox: 0, oy: 0, t0: now };
    if (Math.min(1, (now - g.t0) / CATH_GLIDE) < 1 && !cath.glideRaf) cath.glideRaf = nextFrame(cathGlideTick);
    GLIDE_XY[0] = x + ox; GLIDE_XY[1] = y + oy;
    return GLIDE_XY;
  }
  const PILL_TPL = [0, 1].map((u) => { const e = document.createElement('div'); e.innerHTML = '<small></small><b></b>' + (u ? '<span></span>' : ''); return withGlass(e); });   // (its glass built in: callout.js withGlass)
  const SUM_TPL = (() => { const e = document.createElement('div'), box = document.createElement('div'), col = document.createElement('div'); e.className = 'cath-sum'; box.className = 'cath-sum-box'; col.className = 'cath-sum-col'; box.append(col, s('svg', { class: 'cath-brace', width: 22 }, s('path', {}))); e.append(s('svg', { class: 'cath-leads' }), box); return e; })();
  // (A reading's leader and dot, made between frames: cathLabels.)
  function cathLeadKids(svg) { svg._kAsk = 0; svg._k = Array.from({ length: svg._kN }, () => [s('path', {}), s('circle', { r: 4.5 })]).flat(); svg.replaceChildren(...svg._k); cathLabelsSoon(); }
  // (What cathLabels works in, kept between its calls: each is filled again at the start of a call and read within it; none is held after.)
  const cathMade = new Map(), cathLeave = new Map(), cathLeadQ = [], cathWantL = new Map(), cathLiveEl = [], cathLiveL = [], cathPillEl = [], cathPillL = [], cathCurEl = [], cathSideOut = [], cathPillRecs = [], cathPillQ = { W: 0, top: 0, lim: 0, blockers: NO_LIST, pills: [] };
  const cathPreQ = [], cathTravelQ = [], cathPt = [0, 0], cathSideDef = { above: true, dx: 0 }, cathFrom = { tip: null, ahead: null };
  const CATH_FROM_TIP = { left: 0, top: 0 }, CATH_FROM_AHEAD = { left: 0, top: 0 };
  const cathA = { tip: [0, 0], ahead: [0, 0] }, cathKeep = [], cathKeepRecs = [{ x0: 0, y0: 0, x1: 0, y1: 0 }, { x0: 0, y0: 0, x1: 0, y1: 0 }, { x0: 0, y0: 0, x1: 0, y1: 0 }];
  const cathPS = { A: cathA, bw: 0, bh: 0, W: 0, top: 0, lim: 0, gap: 0, blockers: NO_LIST, keep: cathKeep };
  // (The words and the size of a reading, made from a model: its glass and GPU words built in.)
  function cathPill(l, cls = '') {
    const el = PILL_TPL[l.unit ? 1 : 0].cloneNode(true);
    el.className = `cath-label ${l.cls || ''} ${cls || 'cath-js'}`; el.dataset.at = l.at || '';
    const [, k, b, u] = el.children;   // (the first is its glass)
    el._kW = glWords(k); el._bW = glWords(b); el._kW.set(l.kicker || ''); el._bW.set(l.text);
    if (u) (el._uW = glWords(u)).set(l.unit);
    el._glass = glassCallout(el);
    el._sideO = { above: true, dx: 0 };   // (the place it is given, written over by each placing)
    return el;
  }
  const cathFill = (el, l) => { el._kW.set(l.kicker || ''); el._bW.set(l.text); };
  function cathBuild(l) {
    if (l.at !== 'sum') return cathPill(l);
    // The two readings stacked (wedged above free, as on the tracing), a bracket joining them and
    // the difference beside it; thin leaders run from each reading to where it was taken.
    const el = SUM_TPL.cloneNode(true);
    const box = el.querySelector('.cath-sum-box'), col = box.firstChild;
    el._rows = l.rows.map((r) => cathPill(r, 'in-sum')); el._calc = cathPill(l.calc, 'in-sum calc');
    late('append', col, el._rows); late('append', box, [el._calc]);   // (in the page between frames; the frame keeps its own references)
    return el;
  }
  // (A reading's point on the stage, for the side it names, written into `out`.)
  const cathPtOf = (at, el, out) => { const p = el.dataset.at === 'ahead' ? at.ahead : at.tip; return worldToLocalInto(out, p[0], p[1]); };
  // (The readings that fade out are taken away after their fade; those that come in start from their hidden look and are shown from the next frame.)
  const cathLeadRun = () => { for (let i = 0; i < cathLeadQ.length; i++) cathLeadKids(cathLeadQ[i]); cathLeadQ.length = 0; };
  const cathGone = (el) => { dropLabel(el); el.remove(); cath.leaving.delete(el); };
  const cathPreRun = () => { for (let i = 0; i < cathPreQ.length; i++) cathPreQ[i].classList.remove('cath-pre'); cathPreQ.length = 0; };
  const cathTravelRun = () => { for (let i = 0; i < cathTravelQ.length; i++) cathTravelQ[i].classList.remove('cath-travel'); cathTravelQ.length = 0; };
  function cathLabels() {
    const st = cath.st, at = cath.at;
    if (!st || !at) { if (cath.made) for (const el of cath.made.values()) dropLabel(el); if (cath.leaving) for (const el of cath.leaving.keys()) dropLabel(el); late('kids', cath.labels, NO_LIST); cath.made?.clear(); cath.leaving?.clear(); cath.lblKey = ''; return; }
    // Laid out once per change of the camera or the catheter (a glide and the procedure's step both ask in one frame).
    if (cath.lblKey !== '' && live.viewVersion === cath.lblVV && live.cathVer === cath.lblCV) return;
    cath.lblKey = 'laid'; cath.lblVV = live.viewVersion; cath.lblCV = live.cathVer;
    // Each label keeps its element while its key is shown (numbers update in place). A new key fades in
    // (opacity and a small rise, eased); one that goes fades out before it is removed.
    const made = cath.made || (cath.made = cathMade);
    const want = cathWantL, labels = st.labels || NO_LIST;
    want.clear();
    for (let i = 0; i < labels.length; i++) want.set(labels[i].key, labels[i]);
    // When the summary arrives, the two readings travel from where they were into it (their old pills go at once).
    const leaving = cath.leaving || (cath.leaving = cathLeave);
    const travel = want.has('s') && !made.has('s') && !reduceMotion.matches;
    const from = cathFrom;
    from.tip = from.ahead = null;
    for (const [k, el] of made) if (!want.has(k)) {
      made.delete(k);
      // (Where it stood, from its own last placing (stage px), not read off the page.)
      if (travel && (k === 'f' || k === 'w')) { if (el._box) { const o = k === 'f' ? CATH_FROM_TIP : CATH_FROM_AHEAD; o.left = el._box.x0; o.top = el._box.y0; from[k === 'f' ? 'tip' : 'ahead'] = o; } dropLabel(el); el.remove(); continue; }
      // It fades out where it is on the figure (following the camera, never stuck on the screen), then goes.
      el.classList.add('cath-pre', 'cath-out'); leaving.set(el, el._l);
      stageScope.timer(cathGone, 450, el);
    }
    // (A reading is cloned from a model made ahead; its words are drawn by glWords, never written in a frame: gl-words.js.)
    for (const [k, l] of want) {
      if (made.has(k)) continue;
      const el = cathBuild(l); el.classList.add(l.at === 'sum' && travel ? 'cath-travel' : 'cath-pre'); late('cathadd', cath.labels, el); made.set(k, el);
      if (l.at === 'sum' && travel) el._from = from;
      el._l = l;
      // (The transition runs from the hidden state: this frame's own style pass sees it hidden, and it is shown from the next, with no
      // layout forced for that.)
      // (A reading of its own, cath-js, comes in only once it has its place, below: shown at a first guess, it came in on the card
      // and then glided off it.)
      if (el.classList.contains('cath-pre') && !el.classList.contains('cath-js')) { cathPreQ.push(el); nextFrame(cathPreRun); }
    }
    // Read, then write: every reading's new text first, then all the sizes (one layout), then the positions.
    // (The live labels: those shown, and those fading out, which follow the camera until they go.)
    for (const [k, l] of want) made.get(k)._l = l;
    cathLiveEl.length = 0; cathLiveL.length = 0; cathPillEl.length = 0; cathPillL.length = 0; cathCurEl.length = 0;
    for (const [k, l] of want) { const el = made.get(k); cathLiveEl.push(el); cathLiveL.push(l); if (l.at !== 'sum') cathCurEl.push(el); }
    for (const [el, l] of leaving) { cathLiveEl.push(el); cathLiveL.push(l); }
    for (let i = 0; i < cathLiveEl.length; i++) {   // (the pills: the live labels that are not the summary)
      const l = cathLiveL[i];
      if (l && l.at !== 'sum') { cathPillEl.push(cathLiveEl[i]); cathPillL.push(l); cathFill(cathLiveEl[i], l); }
    }
    // (The stage's size, the cards' room and the readings' own sizes are kept until they change: cathRoomNow, cathSize.)
    const room = cathRoomNow(), W = room.W, H = room.H;
    // The readings stay in the space the cards leave (a phone's Measure card sits over the bottom).
    const sp = room.sp, lim = H - sp.b;
    for (let i = 0; i < cathPillEl.length; i++) { const l = cathPillL[i]; cathPillEl[i]._szv = cathSize(cathPillEl[i], `${l.kicker}|${l.text}|${l.unit}`); }
    // Both readings are placed together (cath-pill.js): above or below their points and slid sideways, so neither sits on a card, the top
    // sheet, the stage's edges or the other (2 Nov 2026, his ask: the callouts sat on the cards). Each keeps its place while it stays clear,
    // and any move (a flip to the other side included) glides there (cathGlide), never jumps. Decided only once the cards' room and the
    // readings' sizes are known; before that a reading takes its usual side and no glide starts from that guess.
    const cur = cathCurEl;
    let ready = room.t > 0;
    for (let i = 0; ready && i < cur.length; i++) if (!(cur[i]._szv[0] > 0)) ready = false;
    // Calm (his ask, 2 Nov 2026, 3:12 AM ET: the readings "jumping around for no good reason"): a reading gets its place once, and is
    // placed again only when that place now covers a card, the band's edge or the other reading, and only at rest: never while the
    // camera glides or a reading is still gliding to a new place, so cards sliding through a slide change never send it to and fro.
    if (ready && cur.length) {
      const q = cathPillQ;
      q.W = W; q.top = Math.max(0, sp.t) + 6; q.lim = lim - 6; q.blockers = room.blk; q.pills.length = 0;
      let first = false;
      for (let i = 0; i < cur.length; i++) {
        const el = cur[i], sz = el._szv, p = cathPtOf(at, el, cathPt), r = cathPillRecs[i] || (cathPillRecs[i] = { x: 0, y: 0, w: 0, h: 0, prefer: true, was: null });
        r.x = p[0]; r.y = p[1]; r.w = sz[0]; r.h = sz[1]; r.prefer = el.dataset.at !== 'ahead'; r.was = el._side || null;
        q.pills.push(r);
        if (!el._side) first = true;
      }
      const calm = !live.vtGliding && !cath.glideRaf;
      if (first || (calm && !pillsClear(q))) {
        // (Each reading's own place object is written over, as placePills would hand a new one: those it reads (was) are all read before any is written.)
        cathSideOut.length = 0;
        for (let i = 0; i < cur.length; i++) cathSideOut.push(cur[i]._sideO);
        placePillsInto(q, cathSideOut);
        for (let i = 0; i < cur.length; i++) cur[i]._side = i < 2 ? cur[i]._sideO : undefined;
      }
      for (let i = 0; i < q.pills.length; i++) q.pills[i].was = null;   // (nothing of a reading is held in the kept records)
    }
    for (let i = 0; i < cathPillEl.length; i++) {
      const el = cathPillEl[i], sz = el._szv, w = sz[0], h = sz[1], pp = cathPtOf(at, el, cathPt), x = pp[0], y = pp[1];
      let side = el._side;
      if (!side) { side = cathSideDef; side.above = el.dataset.at !== 'ahead'; side.dx = 0; }
      const half = w / 2;
      // Kept inside the stage: the box moves in and its pointer stays on the point.
      const bx = clamp(x + side.dx, Math.min(half + 8, W / 2), Math.max(W - half - 8, W / 2)), by = side.above ? y - PILL_GAP - h : y + PILL_GAP;
      let cx = bx, cy = by;
      if (ready) { const q = cathGlide(el, bx, by, x, y); cx = q[0]; cy = q[1]; } else el._gl = null;
      // Placed: it comes in there, from the frame after (the fade and small rise of cath-pre, never a slide from a first guess).
      if (el._side && !el._shown && !el.classList.contains('cath-out')) { el._shown = true; cathPreQ.push(el); nextFrame(cathPreRun); }
      // The pointer is on the side facing its point: it turns as the gliding pill passes the point, not before.
      const above = cy + h / 2 < y;
      if (el.classList.contains('above') !== above) el.classList.toggle('above', above);
      el.style.setProperty('--ax', `${(x - cx).toFixed(1)}px`);
      el._glass(x - cx);
      el.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
      el._box = above ? { x0: cx - half, y0: cy, x1: cx + half, y1: Math.max(y, cy + h) } : { x0: cx - half, y0: Math.min(y, cy), x1: cx + half, y1: cy + h };
    }
    cathSumN = 0;
    for (let li = 0; li < cathLiveEl.length; li++) {
      const el = cathLiveEl[li], l = cathLiveL[li];
      if (!l || l.at !== 'sum') continue;
      const box = el.querySelector('.cath-sum-box'), rows = el._rows;
      for (let j = 0; j < rows.length; j++) cathFill(rows[j], l.rows[j]);
      cathFill(el._calc, l.calc);
      const A = cathA;
      worldToLocalInto(A.tip, at.tip[0], at.tip[1]); worldToLocalInto(A.ahead, at.ahead[0], at.ahead[1]);
      // (read before any write below; kept while the readings' texts and classes stay as they are)
      const sz = cathSize(box, cathSumKey(l), rows), bw = sz[0], bh = sz[1], R = sz[2];
      const top = Math.max(70, sp.t + 6), gap = lim < 440 ? 40 : 64;
      // Above the readings, centred between them; below them when there is no room above. Either way it sits in the
      // free figure, clear of the cards, the slide's panel and its controls, and never over what it names: the tip,
      // the wedged balloon and the point ahead (cath-place.js). Its leaders stay on the vein.
      cathKeep.length = 0;
      { const k0 = cathKeepRecs[0], k1 = cathKeepRecs[1]; k0.x0 = A.tip[0] - 8; k0.y0 = A.tip[1] - 8; k0.x1 = A.tip[0] + 8; k0.y1 = A.tip[1] + 8; k1.x0 = A.ahead[0] - 8; k1.y0 = A.ahead[1] - 8; k1.x1 = A.ahead[0] + 8; k1.y1 = A.ahead[1] + 8; cathKeep.push(k0, k1); }
      if (cath.balBox) {
        const b = cath.balBox, k2 = cathKeepRecs[2];
        let mx0 = Infinity, my0 = Infinity, mx1 = -Infinity, my1 = -Infinity;
        for (let c = 0; c < 4; c++) {   // (the box's four corners, to the stage)
          const cp = worldToLocalInto(cathPt, c & 1 ? b.x1 : b.x0, c & 2 ? b.y1 : b.y0);
          mx0 = Math.min(mx0, cp[0]); my0 = Math.min(my0, cp[1]); mx1 = Math.max(mx1, cp[0]); my1 = Math.max(my1, cp[1]);
        }
        k2.x0 = mx0; k2.y0 = my0; k2.x1 = mx1; k2.y1 = my1; cathKeep.push(k2);
      }
      const ps = cathPS;
      ps.bw = bw; ps.bh = bh; ps.W = W; ps.top = top; ps.lim = lim; ps.gap = gap; ps.blockers = room.blk;
      let { x, y } = placeSummary(ps);
      { const q = cathGlide(box, x, y, (A.tip[0] + A.ahead[0]) / 2, (A.tip[1] + A.ahead[1]) / 2); x = q[0]; y = q[1]; }
      // (Written only when the place moved; the same text is no change.)
      if (box._tx !== x || box._ty !== y) { box._tx = x; box._ty = y; box.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; }
      const sb = cathSumBoxes[cathSumN++ & 3];
      sb.x0 = x; sb.y0 = y; sb.x1 = x + bw; sb.y1 = y + bh; el._box = sb;
      // The bracket, from the middle of one reading to the middle of the other.
      const brace = box.querySelector('.cath-brace'), path = box.querySelector('.cath-brace path');
      const ys0 = R[0][1] + R[0][3] / 2, ys1 = R[1][1] + R[1][3] / 2;
      if (brace._h !== bh) { brace._h = bh; brace.setAttribute('height', bh); }   // (written only when its numbers moved)
      if (path._y0 !== ys0 || path._y1 !== ys1) { path._y0 = ys0; path._y1 = ys1; path.setAttribute('d', `M2 ${ys0} H9 V${ys1} H2 M9 ${(ys0 + ys1) / 2} H20`); }
      // Leaders: from each reading to its point on the vein. The reading nearer the points runs straight
      // from its edge; the other leaves from its outer side and runs down (or up) beside the stack.
      const svg = el.querySelector('.cath-leads');
      if (svg._w !== W) { svg._w = W; svg.setAttribute('width', W); }
      if (svg._hh !== H) { svg._hh = H; svg.setAttribute('height', H); }
      const below = (A.tip[1] + A.ahead[1]) / 2 > y + bh / 2, near = below ? rows.length - 1 : 0;
      const c0 = R[0], c1 = R[R.length - 1], colTop = y + c0[1], colBot = y + c1[1] + c1[3];
      // Updated in place (a path and a dot per reading), rebuilt only when the readings change.
      // (Made between frames, never in the frame that finds the readings changed (2 Nov 2026, "Move everything to GPU"): the leaders are
      // drawn from the next frame, which the build asks for.)
      if (svg._k?.length !== rows.length * 2) {
        svg._kN = rows.length;
        if (!svg._kAsk) { cathLeadQ.push(svg); svg._kAsk = restPass(cathLeadRun); }
      }
      if (svg._k?.length === rows.length * 2) for (let j = 0; j < rows.length; j++) {
        const pxy = A[l.rows[j].at], px = pxy[0], py = pxy[1];
        const rx0 = x + R[j][0], ry0 = y + R[j][1], rx1 = rx0 + R[j][2], ry1 = ry0 + R[j][3];
        let d;
        if (j === near) d = `M${clamp(px, rx0 + 12, rx1 - 12).toFixed(1)} ${(below ? ry1 : ry0).toFixed(1)} L${px.toFixed(1)} ${py.toFixed(1)}`;
        else { const ex = rx0 - 12, ey = below ? colBot + 14 : colTop - 14; d = `M${rx0.toFixed(1)} ${((ry0 + ry1) / 2).toFixed(1)} H${ex.toFixed(1)} V${ey.toFixed(1)} L${px.toFixed(1)} ${py.toFixed(1)}`; }
        const lead = svg._k[j * 2], dot = svg._k[j * 2 + 1], cls = l.rows[j].cls || '';
        if (lead._cls !== cls) { lead._cls = cls; lead.setAttribute('class', 'lead ' + cls); dot.setAttribute('class', 'lead-dot ' + cls); }
        lead.setAttribute('d', d);
        if (dot._px !== px || dot._py !== py) { dot._px = px; dot._py = py; dot.setAttribute('cx', px.toFixed(1)); dot.setAttribute('cy', py.toFixed(1)); }
      }
      if (el._from) {
        // FLIP: each reading starts where its pill was and eases into its row; the bracket, leaders and
        // HVPG wait (CSS delays) until they have landed.
        for (let j = 0; j < rows.length; j++) {
          const a = el._from[l.rows[j].at]; if (!a) continue;
          const r = rows[j];
          r._flip = flipFrom(a.left - (x + R[j][0]), a.top - (y + R[j][1]), performance.now());   // (its row's place, stage px, from the sizes kept)
        }
        el._from = null; cathTravelQ.push(el); nextFrame(cathTravelRun);
      }
      // (The travel is written by hand each frame, not a CSS transition, which the browser runs a frame ahead of the page: the
      // glass drawn under each reading follows the page, and trailed it. cath-flip.js.)
      let travelling = false;
      for (let j = 0; j < rows.length; j++) {
        const r = rows[j], f = r._flip; if (!f) continue;
        const q = flipAt(f, performance.now());
        r.style.transform = q.done ? '' : `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px)`;
        if (q.done) r._flip = null; else travelling = true;
      }
      if (travelling && !cath.glideRaf) cath.glideRaf = nextFrame(cathGlideTick);
    }
  }
  // What the readings' layout reads from the page, kept: the stage's size, the cards' room and the blockers (the cards, the
  // slide's glass), until a card moves (pps:occ), the window resizes, or 250 ms pass (a card still sliding in); and each
  // reading's size (cathSize) while its text, its classes and the label size stay as they are. Digits count as one (the
  // readings' numbers are tabular), so a value counting up does not measure it again each frame.
  let cathEpoch = 0;
  function cathRoom() { cath.room = null; cath.ins = null; cathEpoch++; }
  // (1 Nov 2026, "Move everything to GPU": both are read first in a frame (readFrame), when they may have changed, and the readings laid
  // out again then; never between a frame's writes. Until then the last ones serve; a reading not measured yet waits hidden (cath-pre).)
  let cathRoomAsk = 0, cathSizeAsk = 0;
  const cathWant = new Set(), cathRoomNone = { t: 0, W: 0, H: 0, sp: { t: 0, b: 0 }, blk: [] };
  const CS_ZERO2 = [0, 0], CS_ZERO3 = [];   // (a reading not measured yet: no size, and for the summary a zero row for each reading)
  for (let n = 0; n <= 8; n++) { const rs = []; for (let i = 0; i < n; i++) rs.push([0, 0, 0, 0]); CS_ZERO3.push([0, 0, rs]); }
  // (The summary's boxes it publishes as el._box, taken in turn; and its readings' words as one key, made again only when one changed.)
  const cathSumBoxes = [0, 1, 2, 3].map(() => ({ x0: 0, y0: 0, x1: 0, y1: 0 })), cathSumSrc = [], NO_BLK = [], cathRoomObj = { t: 0, W: 0, H: 0, sp: null, blk: NO_BLK };
  let cathSumN = 0, cathSumKeyStr = '';
  function cathSumKey(l) {
    const rs = l.rows, n = rs.length + 1;
    let same = cathSumSrc.length === n * 4;
    for (let i = 0; same && i < n; i++) { const q = i < n - 1 ? rs[i] : l.calc, o = i * 4; same = cathSumSrc[o] === q.kicker && cathSumSrc[o + 1] === q.text && cathSumSrc[o + 2] === q.unit && cathSumSrc[o + 3] === q.cls; }
    if (same) return cathSumKeyStr;
    cathSumSrc.length = 0; cathSumKeyStr = '';
    for (let i = 0; i < n; i++) { const q = i < n - 1 ? rs[i] : l.calc; cathSumSrc.push(q.kicker, q.text, q.unit, q.cls); cathSumKeyStr += (i ? '/' : '') + q.kicker + '|' + q.text + '|' + q.unit + '|' + q.cls; }
    return cathSumKeyStr;
  }
  const cathRectOf = (el) => el.getBoundingClientRect();
  function cathRoomNow() {
    const now = performance.now();
    if (!cath.room || now - cath.room.t > 250) cathRoomAsk ||= readFrame(cathRoomRead);
    if (!cath.room) { const b = stageBox(), r = cathRoomNone; r.W = b.width; r.H = b.height; return r; }   // (before the first read: the stage's size, no room taken; the one caller reads it at once)
    return cath.room;
  }
  function cathRoomRead() {
    cathRoomAsk = 0;
    const b = stageBox();
    // (The cards' boxes from the labels' own list, the browser's IntersectionObserver report: a stale list asks for a new one instead of
    // reading every card's box here, a forced layout of each a quarter second through a catheter slide's change. Without IntersectionObserver they are read here.)
    const io = live.BLOCK_IO;
    if (io && (!live.blockerBoxes || live.blockersStale) && !live.blockersAsk) { live.blockersAsk = 1; blockersRead(); }
    const room = cathRoomObj;   // (rewritten in place; the readings' layout holds it only within one run)
    room.t = performance.now(); room.W = b.width; room.H = b.height; room.sp = cardSpaceRead();
    room.blk = io ? live.blockerBoxes || NO_BLK : live.blockerBoxes && !live.blockersStale ? live.blockerBoxes : readBlockersRead(cathRectOf, b);   // (the labels' own list when it is current)
    cath.room = room;
    cath.lblKey = ''; nextFrame(cathLabelsSoon);
  }
  // Two texts are one key when they differ only in their digits (tabular, so a value counting up does not measure again).
  function sameShape(a, b) {
    if (a === b) return true;
    if (typeof a !== 'string' || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) { const x = a.charCodeAt(i), y = b.charCodeAt(i); if (x !== y && !(x >= 48 && x <= 57 && y >= 48 && y <= 57)) return false; }
    return true;
  }
  const NO_CLS = /(?:^|\s)cath-pre(?=\s|$)/;
  function cathSize(el, text, rows = null) {
    const rs = document.documentElement.style;   // (the label sizes, as set inline: read without a layout)
    const kk = rs.getPropertyValue('--label-k'), ks = rs.getPropertyValue('--label-scale'), pres = appEl?.classList.contains('presenting'), at = el.dataset.at || '', cn = el.className;
    // (The key is these parts, compared one by one; the class name without cath-pre is worked out only when the name changed.)
    let same = el._sz === 1 && el._szE === cathEpoch && el._szK === kk && el._szS === ks && el._szP === pres && el._szA === at && sameShape(el._szT, text);
    if (same && el._szC !== cn) same = el._szC.replace(NO_CLS, '') === cn.replace(NO_CLS, '');
    if (!same) {
      el._qE = cathEpoch; el._qK = kk; el._qS = ks; el._qP = pres; el._qA = at; el._qT = text; el._qC = cn;
      el._szRows = rows; cathWant.add(el); cathSizeAsk ||= readFrame(cathSizeRead);
    }
    return el._szm || (rows ? CS_ZERO3[Math.min(rows.length, 8)] : CS_ZERO2);
  }
  function cathSizeOne(el) {
    if (!el.isConnected) return;
    const rows = el._szRows;
    el._szE = el._qE; el._szK = el._qK; el._szS = el._qS; el._szP = el._qP; el._szA = el._qA; el._szT = el._qT; el._szC = el._qC; el._sz = 1;
    let v = el._szm;
    if (!v) v = el._szm = rows ? [0, 0, []] : [0, 0];
    v[0] = el.offsetWidth; v[1] = el.offsetHeight;
    if (rows) {
      const R = v[2];
      for (let i = 0; i < rows.length; i++) { const q = R[i] || (R[i] = [0, 0, 0, 0]), r = rows[i]; q[0] = r.offsetLeft; q[1] = r.offsetTop; q[2] = r.offsetWidth; q[3] = r.offsetHeight; }
      R.length = rows.length;
    }
  }
  function cathSizeRead() {
    cathSizeAsk = 0;
    cathWant.forEach(cathSizeOne);
    cathWant.clear();
    cath.lblKey = ''; nextFrame(cathLabelsSoon);
  }
  if (document.fonts) document.fonts.addEventListener?.('loadingdone', () => cathRoom());
  // The camera for the procedure: the route, the tip close up, then back where it was.
  // both: the close-up holds the tip and the vein ahead of it, where the wedged reading hangs, inside the free space.
  // near: the route's framing for a catheter the view will follow in (cathFollow): 25% closer, the route's top held where it
  // was, so the follow only pans (his pick, 26 Oct: zoom once, then pan; a zoom each frame redrew the whole vessel layer).
  const FOLLOW_ZOOM = 1.25;
  const PROC_K_MAX = 5;   // (a treatment's close-up: the catheter and its balloon must show; the old 7x work zoom is gone)
  const PROC_K_TIP = 12;   // (BRTO and BATO's balloon close-up; 8 before his ask, 6 Nov: "zoomed in more into the BRTO and BATO catheters")
  // (BRTO and BATO's way in, his ask, 6 Nov 2026: their whole route (the IVC, the renal vein and the shunt) was framed at once, about 1x on a
  // phone, the catheter a thread. Now the stretch of route the last WAY_BEHIND lumen radii before the tip's stop, up to PROC_K_WAY: the view
  // follows the tip in at that one scale (cathFollow, panning only), so the whole route need not fit.)
  const PROC_K_WAY = 6, WAY_BEHIND = 36, WAY_AHEAD = 6;
  // (Their sclerosant shot, the tip on to the varices: as close as that stretch fits, up to PROC_K_WORK (PROC_K_MAX, 5, before).)
  const PROC_K_WORK = 8;
  // (The TIPS close-up, his ask, 5 Nov: the tract itself with a short stretch of the hepatic vein before it and of the right portal
  // vein after it, about twice as close as the hepatic vein to the trunk was; the wire runs on out of the frame into the trunk.)
  const TIPS_K_MAX = 9, TIPS_BEFORE = 26, TIPS_AFTER = 22;
  // Where a treatment's route enters the plate (its lead-in from outside ends there): the view never follows the tip off the figure.
  const procIn = (r) => r.parts?.[1]?.d0 ?? r.start;
  // (steady: a refit to cards that moved, see animateVT.)
  function cathFocus(mode, ms = 700, { both = false, near = false, arc = false, steady = false } = {}) {
    const r = cathRoute();
    if (mode === 'home') { if (cath.saved) animateVT(cath.saved, ms, { arc }); cath.saved = null; return true; }
    if (!r) return false;
    if (!cath.saved) cath.saved = { ...(live.vtTarget && live.vtAnim ? live.vtTarget : live.vt) };
    const wr = wrap.getBoundingClientRect(), ins = safeInsets();
    const [fx0, fy0] = clientToVB(wr.left + ins.l, wr.top + ins.t), [fx1, fy1] = clientToVB(wr.left + ins.W - ins.r, wr.top + ins.H - ins.b);
    let cx, cy, k, cyScreen = (fy0 + fy1) / 2;
    if ((mode === 'tip' || mode === 'way' || mode === 'work') && r.focus) {
      // A treatment's two shots, at one scale, the stretch it works on (the hepatic vein, the tract and the portal vein; the renal
      // vein and the shunt; the splenic vein and the feeder) filling the space the cards leave, up to PROC_K_MAX: close enough to
      // see the catheter and its balloon (his ask, 29 Oct: zoomed too far out to follow it). 'tip' frames that stretch, held
      // still while the work's steps play; 'way' starts on the tip where it enters, and the view then follows the tip in
      // (cathFollow) at that scale, panning only, so it never zooms while the catheter moves.
      // BRTO and BATO frame their balloon steps closer (his ask, 29 Oct: "zoom into the balloon catheter tip"): 'tip', the tip and its
      // balloon alone, up to PROC_K_TIP; 'work', the tip on to the route's end, the varices the sclerosant fills included.
      // (EUS-PPG's scope, r.box: its work shots frame its two stations and both targets, and its way in the esophagus and stomach, r.focus.)
      const Rf = cathAt(r, r.free).r, close = r.kind !== 'tips' && !r.box && mode === 'tip', wayIn = r.kind !== 'tips' && !r.box && mode === 'way';
      // (The balloon close-up: the tip and its balloon with a short stretch of catheter behind, Rf × 11 back and 3 ahead (14 and 4 before).)
      const [d0, d1] = close ? [Math.max(procIn(r), r.free - Rf * 11), Math.min(r.total, r.free + Rf * 3)]
        : wayIn ? [Math.max(procIn(r), r.free - Rf * WAY_BEHIND), Math.min(r.total, r.free + Rf * WAY_AHEAD)]
        : mode === 'work' && r.kind !== 'tips' ? [Math.max(procIn(r), r.free - Rf * 4), r.total]
          : r.kind === 'tips' && r.spans?.tract && r.spans.rpv ? [Math.max(procIn(r), r.spans.tract[0] - TIPS_BEFORE), Math.min(r.total, r.spans.rpv[0] + TIPS_AFTER)] : r.focus;
      const tips = r.kind === 'tips';
      const seg = r.box && mode !== 'way' ? [r.box.slice(0, 2), r.box.slice(2)] : cutLen(r.pts, r.cum, d0, d1), pad = r.box ? 24 : close ? 8 : tips ? 14 : wayIn ? 12 : 16;
      const xs = seg.map((q) => q[0]), ys = seg.map((q) => q[1]), x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
      const fr = cathFree(wr, ins);
      // (How much of the free space the stretch fills: BRTO and BATO's close-up and the sclerosant's shot fill more of it than before (0.72),
      // the step's callout still beside it, kept inside the stage by its own placing.)
      k = clamp(Math.min((fr.x1 - fr.x0) / (x1 - x0), (fr.y1 - fr.y0) / (y1 - y0)) * (tips ? 0.86 : close ? 0.84 : 0.9), 1, close ? PROC_K_TIP : tips ? TIPS_K_MAX : wayIn ? PROC_K_WAY : mode === 'work' ? PROC_K_WORK : PROC_K_MAX);
      cath.followPx = fr.px;
      if (mode === 'way' && reduceMotion.matches) {
        // (Reduced motion: no following, so the way in is framed whole, still, as close as it fits.)
        const all = cutLen(r.pts, r.cum, procIn(r), r.free), ax = all.map((q) => q[0]), ay = all.map((q) => q[1]);
        const w = Math.max(...ax) - Math.min(...ax) + 60, hh = Math.max(...ay) - Math.min(...ay) + 60;
        k = clamp(Math.min((fr.x1 - fr.x0) / w, (fr.y1 - fr.y0) / hh) * 0.9, 1, PROC_K_MAX);
        cx = (Math.min(...ax) + Math.max(...ax)) / 2; cy = (Math.min(...ay) + Math.max(...ay)) / 2;
      } else if (mode === 'way') [cx, cy] = cathAt(r, Math.max(r.start + (r.free - r.start) * clamp(cath.st?.u || 0, 0, 1), procIn(r))).p;
      else { cx = (x0 + x1) / 2; cy = (y0 + y1) / 2; }
      animateVT({ k, x: (fr.x0 + fr.x1) / 2 - cx * k, y: (fr.y0 + fr.y1) / 2 - cy * k }, ms, { arc, steady });
      return true;
    } else if (mode === 'tip') {
      const tp = cutLen(r.pts, r.cum, 0, r.free).at(-1);
      cx = tp[0]; cy = tp[1]; k = 6.2;
      if (both) {
        const ah = cathAt(r, Math.min(r.total, r.free + cathAt(r, r.free).r * 6.4)).p;
        cx = (tp[0] + ah[0]) / 2; cy = (tp[1] + ah[1]) / 2;
        k = Math.min(k, (fx1 - fx0) * 0.5 / Math.max(1, Math.abs(ah[0] - tp[0])), (fy1 - fy0) * 0.5 / Math.max(1, Math.abs(ah[1] - tp[1])));
      }
      // A blocked vein: the tip waits at the ostium, so the view holds both it and the vein it cannot enter.
      if (cath.st?.ostium) { const o = cutLen(r.pts, r.cum, 0, r.hv0 - 2).at(-1); cx = (o[0] + tp[0]) / 2; cy = (o[1] + tp[1]) / 2; k = 4.8; }
      // With little room above a card (a phone), the view is a little wider and the tip sits low in the free space,
      // so the vein still shows and the readings fit above the tip.
      const sp = cardSpace(), freeH = ins.H - sp.t - sp.b;
      if (freeH < 440) {
        const [, top] = clientToVB(wr.left, wr.top + sp.t), [, bot] = clientToVB(wr.left, wr.top + ins.H - sp.b);
        k = 4.2; cyScreen = bot - (bot - top) * (74 / Math.max(freeH, 120));
      }
    } else {
      const seg = cutLen(r.pts, r.cum, r.start * 0.5, r.hvEnd);
      const xs = seg.map((q) => q[0]), ys = seg.map((q) => q[1]), x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 30, y0 = Math.min(...ys) - 30, y1 = Math.max(...ys) + 30;
      cx = (x0 + x1) / 2; cy = (y0 + y1) / 2; k = clamp(Math.min((fx1 - fx0) / (x1 - x0), (fy1 - fy0) / (y1 - y0)) * 0.9, 1, 2.6);
      if (near) { const k1 = k * FOLLOW_ZOOM; cy = y0 + (cy - y0) * (k / k1); k = k1; }
    }
    animateVT({ k, x: (fx0 + fx1) / 2 - cx * k, y: cyScreen - cy * k }, ms, { steady });
    return true;
  }
  // The free space for a treatment's close-up, in the figure's viewBox units: the stage less its insets and the cards over it
  // (the Tests card at the side, a slide's words, a phone's sheet), whichever side leaves the most room.
  function cathFree(wr, ins) {
    const [ax, ay] = clientToVB(wr.left + ins.l, wr.top + ins.t), [bx, by] = clientToVB(wr.left + ins.W - ins.r, wr.top + ins.H - ins.b);
    // (px: its middle in the stage's own pixels, where a treatment's tip is held while the view follows it: cathFollow.)
    let f = { x0: ax, y0: ay, x1: bx, y1: by, px: [(ins.l + ins.W - ins.r) / 2, (ins.t + ins.H - ins.b) / 2] };
    const sp = cardSpace(), L = ins.l, T = Math.max(ins.t, sp.t), R = ins.W - Math.max(ins.r, sp.r || 0), B = ins.H - Math.max(ins.b, sp.b);
    if (R - L > 160 && B - T > 160) {
      const [px, py] = clientToVB(wr.left + L, wr.top + T), [qx, qy] = clientToVB(wr.left + R, wr.top + B);
      f = { x0: px, y0: py, x1: qx, y1: qy, px: [(L + R) / 2, (T + B) / 2] };
    }
    return f;
  }
  // While the catheter travels, the view drifts after its tip (eased, never snapping) once the tip has
  // passed the middle of the route view, so the hepatic vein arrives centred before the close-up.
  let followT = 0;
  function cathFollow() {
    const r = cathRoute(), now = performance.now(), dt = Math.min(64, now - (followT || now)); followT = now;
    const st = cath.st;
    if (!r || !st || !cath.saved || live.vtGliding || reduceMotion.matches) return;
    const end = st.ostium ? r.hv0 - 2 : r.free, tipD = r.start + (end - r.start) * clamp(st.u, 0, 1);
    // (By arithmetic, from the kept stage box and the cards' room read at most four times a second: asking the page for its
    // boxes and the figure's matrix here, after the catheter's step had written to it, laid the page out again every frame.)
    const wr = stageBox(), ins = cathInsets(now);
    // A treatment: the tip held where its shot put it, in the middle of the space the cards leave, the view panning after it both
    // ways at the shot's one scale, eased (never a snap), from where the route enters the figure.
    if (r.parts) {
      const tq = cathAt(r, Math.max(tipD, procIn(r))).p, px = cath.followPx || [(ins.l + ins.W - ins.r) / 2, (ins.t + ins.H - ins.b) / 2];
      const [mx, my] = clientToVBFast(wr.left + px[0], wr.top + px[1]), e = 1 - Math.exp(-dt / 320), kk = live.vt.k;
      const nx = live.vt.x + (mx - tq[0] * kk - live.vt.x) * e, ny2 = live.vt.y + (my - tq[1] * kk - live.vt.y) * e;
      if (Math.hypot(nx - live.vt.x, ny2 - live.vt.y) < 0.05) return;
      live.vt = { k: kk, x: nx, y: ny2 }; applyVT(); live.CTM = null; refreshCTM();
      return;
    }
    const [, fy0] = clientToVBFast(wr.left + ins.l, wr.top + ins.t), [, fy1] = clientToVBFast(wr.left + ins.W - ins.r, wr.top + ins.H - ins.b);
    // Up and down only (no sideways pan), at the one scale the route's framing set (cathFocus near): a pan at a fixed scale lets
    // the vessel layer move its last picture and draw only the strip it uncovers.
    const tp = cathAt(r, tipD).p, a = 1 - Math.exp(-dt / 450);   // (the tip itself, without cutting the route to it each frame)
    const k = live.vt.k, ty = (fy0 + fy1) / 2 - tp[1] * k, ny = live.vt.y + Math.min(0, ty - live.vt.y) * a;
    if (Math.abs(ny - live.vt.y) < 0.05) return;
    live.vt = { k, x: live.vt.x, y: ny }; applyVT(); live.CTM = null; refreshCTM();   // (the readings and the vessel layer follow, later in the frame)
  }
  // The room the cards leave (safeInsets), kept for 250 ms and dropped when a card moves (pps:occ) or the window resizes.
  function cathInsets(now) {
    if (!cath.ins || now - cath.insT > 250) { cath.ins = safeInsets(); cath.insT = now; }
    return cath.ins;
  }
  return { NO_BLK, cathAt, cathFadeOut, cathFocus, cathFollow, cathLabelsNow, cathLabelsSoon, cathPaint, cathRadOf, cathRoom, cathRoute, procIn };
}
