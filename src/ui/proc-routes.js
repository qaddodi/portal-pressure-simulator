// The routes the treatment catheters travel (TIPS, BRTO, BATO), as the stage lays them (stage-cath.js procRoute builds them with radii and
// smoothing), and the length of a route as plain geometry (no radii, no smoothing, no DOM). The lengths set how long each catheter takes
// to travel (hvpg-clock.js legMs, ROUTE_LEN): tests/proc-timing.test.js reads them here from the figure's own outlines, so the table cannot
// drift from the anatomy.
//
// procSpecs(geo, radOf): geo, the vessels' drawn courses ({ [id]: { cur: [[x, y], …] } }); radOf(id, f), the lumen radius of a vessel at f.
//   Each spec: ids, start (how far along the lead-in the tip sits before it moves), tip (a leg's name and how far along it the tip stops),
//   focus (the legs the close-up frames), build(B) (lays the legs in the order the catheter travels).
// B: pts(list, id, f, name) loose points (a lead-in from outside the plate); vessel(id, { rev, a, b, until, near, name, r }) a vessel, whole or in
//   part, the way the catheter travels it.
import { lerp } from './num.js';
import { JUNCTION_PIECES } from '../engine/portal/topology.js';
import { expandPieces } from './part-names.js';

const TIPS_IDS = ['SVC_RA', 'IVCS_RA', 'IVC_IS', 'RHV_IVC', 'TIPS', 'PVH_R', 'PV_TRUNK'];
/** How far up the coronary vein the TIPS catheter goes to coil it, of the vein from where it joins the portal trunk (0..1 of its length). */
export const COIL_B = 0.17;
export function procSpecs(geo, radOf) {
  // The TIPS's way in, shared with the TIPS that coils: the neck, the SVC, the IVC and the right hepatic vein to where the tract leaves it, the tract (as wide
  // as the stent will be) through the liver, and the right portal vein.
  const tipsLegs = (B) => {
    const top = headOf(geo, 'SVC_RA'), ost = geo.RHV_IVC.cur[geo.RHV_IVC.cur.length - 1];
    B.pts([[top[0] - 6, top[1] - 150], [top[0] - 2, top[1] - 60], top], 'SVC_RA', 0);
    B.vessel('SVC_RA'); B.vessel('IVCS_RA', { rev: true });
    B.vessel('IVC_IS', { rev: true, until: (q) => q[1] >= ost[1] - 4 });
    // Out along the right hepatic vein to where the tract leaves it, then the needle's path through the liver (the tract,
    // as wide as the stent will be) into the right portal vein, and the wire on into the portal trunk.
    B.vessel('RHV_IVC', { rev: true, near: geo.TIPS.cur[geo.TIPS.cur.length - 1], name: 'hv' });
    B.vessel('TIPS', { rev: true, name: 'tract', r: radOf('PVH_R', 0.5) * 0.8 });
    B.vessel('PVH_R', { rev: true, from: geo.TIPS.cur[0], name: 'rpv' });   // (on from where the tract meets the portal vein, mid-run: not from the vein's far end)
  };
  const specs = {
    tips: { ids: TIPS_IDS, start: 0.55, tip: ['trunk', 0.45], focus: ['hv', 'trunk'],
      build(B) { tipsLegs(B); B.vessel('PV_TRUNK', { rev: true, b: 0.6, name: 'trunk' }); } },
    // TIPS with the coronary vein coiled (Baveno VIII 5.41: "TIPS ± variceal embolisation"): the same way in, the tract and the right portal vein,
    // then on along the trunk to where the coronary vein joins it (its drawn end, anatomy.js LGV_CONF) and up that vein against its course, as far
    // as COIL_B of it, where the coil is pushed out. The tip stops there; the catheter's stops for the tract and the portal vein are the TIPS's.
    tipscoil: { ids: [...TIPS_IDS, 'LGV_CONF'], start: 0.55, tip: ['coronary', 1], focus: ['hv', 'coronary'],
      build(B) {
        tipsLegs(B);
        B.vessel('PV_TRUNK', { rev: true, near: geo.LGV_CONF.cur[geo.LGV_CONF.cur.length - 1], name: 'trunk' });
        B.vessel('LGV_CONF', { rev: true, b: COIL_B, name: 'coronary' });
      } },
    // (BRTO's balloon sits near the renal end of the shunt, 0.2 of the way up it: at 0.3 the tip and balloon lay on the splenic vein,
    // which crosses the shunt from 0.30 to 0.34, and the catheter drew over it. Now the tip stops about 36 px below it.)
    brto: { ids: ['ILI_IVC', 'IVC_IS', 'LRV_IVC', 'C5'], start: 0.55, tip: ['shunt', 0.2], focus: ['lrv', 'shunt'],
      build(B) {
        const bot = headOf(geo, 'ILI_IVC'), lrv = geo.LRV_IVC.cur[geo.LRV_IVC.cur.length - 1];
        B.pts([[bot[0] + 4, bot[1] + 150], [bot[0] + 1, bot[1] + 60], bot], 'ILI_IVC', 0);
        B.vessel('ILI_IVC'); B.vessel('IVC_IS', { until: (q) => q[1] <= lrv[1] + 4 });
        B.vessel('LRV_IVC', { rev: true, name: 'lrv' }); B.vessel('C5', { rev: true, name: 'shunt' });
      } },
    // (The BRTO play with another target, Baveno VIII 6.12: the same way up to the left renal vein, then out along the renal venules to where the
    // spontaneous splenorenal shunt, C6, joins them (it leaves the renal vein beyond the gastrorenal shunt's mouth, stage-geo.js SIDE_HOSTS),
    // and up it against its drawn course as C5 is. proc-anim.js PLUGS.)
    brtoC6: { ids: ['ILI_IVC', 'IVC_IS', 'LRV_IVC', 'V_KID_L', 'C6'], start: 0.55, tip: ['shunt', 0.2], focus: ['lrv', 'shunt'],
      build(B) {
        const bot = headOf(geo, 'ILI_IVC'), lrv = geo.LRV_IVC.cur[geo.LRV_IVC.cur.length - 1], c6 = geo.C6.cur[geo.C6.cur.length - 1];
        B.pts([[bot[0] + 4, bot[1] + 150], [bot[0] + 1, bot[1] + 60], bot], 'ILI_IVC', 0);
        B.vessel('ILI_IVC'); B.vessel('IVC_IS', { until: (q) => q[1] <= lrv[1] + 4 });
        B.vessel('LRV_IVC', { rev: true, name: 'lrv' }); B.vessel('V_KID_L', { rev: true, near: c6, name: 'renal' }); B.vessel('C6', { rev: true, name: 'shunt' });
      } },
    // The PPG by interventional radiology, in its two parts (proc-anim.js MEASURES.irivc and irpv). The transjugular catheter that reads the IVC: the neck, the SVC, the right
    // atrium and the IVC down to the level where the right hepatic vein opens into it, the tip's reading place.
    ivcread: { ids: ['SVC_RA', 'IVCS_RA', 'IVC_IS', 'RHV_IVC'], start: 0.55, tip: ['ivc', 1], focus: ['ivc', 'ivc'],
      build(B) {
        const top = headOf(geo, 'SVC_RA'), ost = geo.RHV_IVC.cur[geo.RHV_IVC.cur.length - 1];
        B.pts([[top[0] - 6, top[1] - 150], [top[0] - 2, top[1] - 60], top], 'SVC_RA', 0);
        B.vessel('SVC_RA'); B.vessel('IVCS_RA', { rev: true });
        B.vessel('IVC_IS', { rev: true, until: (q) => q[1] >= ost[1] - 4, name: 'ivc' });
      } },
    // The direct portal reading, through the skin and the liver (percutaneous transhepatic, the way BATO reaches the portal vein): in from outside the plate through the liver into
    // the right portal vein and on to the middle of the portal trunk, where it reads.
    ppgperc: { ids: ['PVH_R', 'PV_TRUNK'], start: 0.1, tip: ['trunk', 0.45], focus: ['rpv', 'trunk'],
      build(B) {
        const rpv = tailOf(geo, 'PVH_R');
        B.pts([[rpv[0] - 215, rpv[1] + 34], [rpv[0] - 120, rpv[1] + 16], rpv], 'PVH_R', 1);
        B.vessel('PVH_R', { rev: true, name: 'rpv' }); B.vessel('PV_TRUNK', { rev: true, b: 0.6, name: 'trunk' });
      } },
    bato: { ids: ['PVH_R', 'PV_TRUNK', 'SV_CONF', 'C2'], start: 0.1, tip: ['feeder', 0.35], focus: ['splenic', 'feeder'],
      build(B) {
        const rpv = tailOf(geo, 'PVH_R');
        B.pts([[rpv[0] - 215, rpv[1] + 34], [rpv[0] - 120, rpv[1] + 16], rpv], 'PVH_R', 1);
        B.vessel('PVH_R', { rev: true }); B.vessel('PV_TRUNK', { rev: true });
        B.vessel('SV_CONF', { rev: true, name: 'splenic' }); B.vessel('C2', { name: 'feeder' });
      } },
  };
  // (the vessels a route touches: every piece of each vein it names, topology.js JUNCTIONS)
  for (const sp of Object.values(specs)) sp.ids = expandPieces(sp.ids);
  return specs;
}

/**
 * A vein split in pieces by a shunt joining it part-way (topology.js JUNCTIONS) as a catheter travels it: its pieces' drawn courses end to end.
 * { P: the points, ids: the pieces in order from the vein's own start, cuts: the share of the whole's length at which each piece ends }, or null for a vein that is whole.
 */
export function wholeOf(geo, id) {
  const ids = JUNCTION_PIECES[id];
  if (!ids || ids.length < 2) return null;
  const P = [], at = [];
  for (const pid of ids) {
    const c = geo[pid]?.cur;
    if (!c?.length) return null;
    for (let i = P.length ? 1 : 0; i < c.length; i++) P.push(c[i]);
    at.push(P.length - 1);
  }
  const cum = lenTo(P), n = cum[cum.length - 1] || 1, cuts = at.map((i) => cum[i] / n);
  // (A join on a straight run is no corner: the vein is the one line it was, with the points it had.)
  for (let k = at.length - 2; k >= 0; k--) {
    const j = at[k], a = P[j - 1], b = P[j], c = P[j + 1];
    if (a && c && Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) < 1e-6 && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) > 0) P.splice(j, 1);
  }
  return { P, ids, cuts };
}
/** The piece the share u (0 to 1, along the vein's own course) falls in, and the share of that piece. */
export function pieceAt(w, u) {
  let k = 0;
  while (k < w.ids.length - 1 && u > w.cuts[k]) k++;
  const lo = k ? w.cuts[k - 1] : 0, hi = w.cuts[k];
  return [w.ids[k], hi > lo ? Math.min(1, Math.max(0, (u - lo) / (hi - lo))) : 0];
}
/**
 * The parts of a leg along a split vein: the pieces it passes, each with its own span of the route (d0 to d1) and share of the piece (fa to fb),
 * for the leg that starts at the share a and ends at b of the way (rev: against the vein's own course), over route distances d0 to d1.
 */
export function legSubs(w, rev, a, b, d0, d1) {
  const out = [], span = b - a || 1;
  w.ids.forEach((id, k) => {
    const lo = k ? w.cuts[k - 1] : 0, hi = w.cuts[k], tl = rev ? 1 - hi : lo, th = rev ? 1 - lo : hi;
    const x0 = Math.max(a, tl), x1 = Math.min(b, th);
    if (!(x1 - x0 > 1e-6)) return;
    const own = (x) => { const u = rev ? 1 - x : x; return hi > lo ? (u - lo) / (hi - lo) : 0; };
    out.push({ id, name: id, fa: own(x0), fb: own(x1), d0: d0 + (d1 - d0) * (x0 - a) / span, d1: d0 + (d1 - d0) * (x1 - a) / span });
  });
  return out;
}
/** Where a vein starts and ends on the figure, the whole course of one a shunt splits (its own piece alone stops at the join). */
export const headOf = (geo, id) => (wholeOf(geo, id)?.P || geo[id].cur)[0];
const tailOf = (geo, id) => { const P = wholeOf(geo, id)?.P || geo[id].cur; return P[P.length - 1]; };
const lenTo = (pts) => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; };
/** The part of a polyline from length a to length b (cumulative lengths in cum). */
export function cutLen(pts, cum, a, b) {
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

/**
 * A spec's route as plain geometry (pure): { total, start, free, spans } in figure units, as stage-cath.js procRoute lays them but on the
 * vessels' own courses, unsmoothed. start: where the tip sits before it moves; free: where it stops; spans: each named leg's [from, to].
 * The tip's travel is free − start.
 */
export function rawRoute(spec, geo) {
  const pts = [], marks = [], parts = [];
  const B = {
    pts(list, id, f, name = 'lead') { marks.push(pts.length); parts.push({ name }); for (const q of list) pts.push(q); },
    vessel(id, { rev = false, a = 0, b = 1, until = null, near = null, from = null, name = id } = {}) {
      const base = wholeOf(geo, id)?.P || geo[id].cur, P0 = rev ? base.slice().reverse() : base, c = lenTo(P0), n = c[c.length - 1] || 1;
      if (near) { let best = Infinity; P0.forEach((q, i) => { const dd = Math.hypot(q[0] - near[0], q[1] - near[1]); if (dd < best) { best = dd; b = c[i] / n; } }); }
      if (from) { let best = Infinity; P0.forEach((q, i) => { const dd = Math.hypot(q[0] - from[0], q[1] - from[1]); if (dd < best) { best = dd; a = c[i] / n; } }); }
      if (until) { const i = P0.findIndex((q, k) => k > 0 && until(q)); if (i > 0) b = c[i - 1] / n; }
      const seg = cutLen(P0, c, a * n, b * n);
      marks.push(pts.length); parts.push({ name });
      for (let i = (a === 0 || from) && pts.length ? 1 : 0; i < seg.length; i++) pts.push(seg[i]);
    },
  };
  spec.build(B);
  const cum = lenTo(pts), total = cum[cum.length - 1], L = (i) => (i < marks.length ? cum[marks[i]] : total);
  parts.forEach((q, i) => { q.d0 = L(i); q.d1 = L(i + 1); });
  const tp = parts.find((q) => q.name === spec.tip[0]);
  return { total, start: parts[1].d0 * spec.start, free: tp.d0 + (tp.d1 - tp.d0) * spec.tip[1], spans: Object.fromEntries(parts.filter((q) => q.name !== 'lead').map((q) => [q.name, [q.d0, q.d1]])) };
}
