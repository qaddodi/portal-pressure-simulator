// Anatomical stage (blueprint §6): the figure drawn on the GPU (plate, vessels, moving blood),
// over an SVG scene that holds the organ artwork, hit targets and overlays, and screen-space labels.

import { EDGES, NODES, PORTAL_TERRITORY, dMinOf, edgePresent, isOccluded, SHUNT_PORTAL, SHUNT_SYSTEMIC, customShuntId } from '../engine/topology.js?v=dc393aabea';
import { LABEL_VESSEL, TIP_FADE, TIP_CONNECT, VIEW, VB_ANAT, VB_CIRC, ATLAS_COLUMNS, HIDDEN_EDGES, HIDDEN_NODES, ANAT_HIDDEN, ANAT_HIDDEN_NODES, CONTEXT_EDGES, BACK_EDGES, IVC_EDGES, NEEDS_C3, NODE_POS, EDGE_PATH, CIRCUIT_PATH, metroPath, ORGANS, ORGAN_DETAIL, BACKDROP, LIVER_INNER, LIVER_EDGES, LANE_CAPTIONS, ABDOMEN_CLIP, ABDOMEN_FLOOR, SPLEEN_CENTER, SITES, ORGAN_LABELS, ATLAS_LABELS, SHORT, CHIP_NODES, LIVER_SPLIT_X, CIRCUIT_ZONES, CIRCUIT_LABELS, STRANDS, STRAND_FROM, FEEDERS, fanFeeders, CIRCUIT_TREES } from './anatomy.js?v=89191aa586';
import { pressureColor, deltaColor, dropColor, flowColor, velocityColor, heatColor } from './colormap.js?v=6d64a94345';
import { store, updateParams, varicesPresent, varixGrowth } from './store.js?v=1d7cd9b00f';
import { s, h, fmt, fmtFlow, fp, clamp, lerp, toast, systemEdge } from './util.js?v=86153645a3';
import { createLobuleZoom } from './lobule-zoom.js?v=92043ca5ef';
import { runFlick, FLICK } from './flick.js?v=2576a4bc70';
import { inlineStyles } from './svg-inline.js?v=8ad39ad551';
import { createVeinsGL, binVeins, TUBE_TEXELS, FLOW_TEXELS, MAX_TIERS, F_SEL, F_DIFFUSE, F_SHADOW, F_DOTTED, F_NOCASE, F_SPEC, F_VEIL, ORIGIN_GREY } from './veins-gl.js?v=a29435c7f0';
import { advanceStream, originFractions, ORIGIN_N, createBolus, DYE_BINS, KAPPA, STASIS_MIN_D, HIDDEN_SECONDS } from './blood.js?v=6c39f43ddf';

const N_SAMPLES = 64;
// Shorter circuit zone titles, tried in turn when the full one is wider than its zone.
const ZONE_SHORT = { 'Splanchnic beds': ['Gut & spleen'], 'Portal veins': ['Portal'], 'Hepatic veins · IVC': ['Hep. veins · IVC', 'IVC'] };
// Displayed width grows sub-linearly with diameter so the cavae don't swamp the portal tree,
// while distension of small veins and collaterals stays visible.
// Drawn caliber (px) for a vessel diameter. The 1.3 lifts the baseline so the veins read at a
// glance; the dilation of disease still scales on top of it.
const CALIBER = 1.3;
const vesselPx = (D) => CALIBER * Math.max(2.6, 2.0 * Math.pow(Math.max(0.1, D), 0.72));
// Only the vessels that tell the portal story are drawn (see anatomy.js).
const ALL_EDGES = EDGES.filter((e) => e.kind !== 'wedge' && !HIDDEN_EDGES.has(e.id));
const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const REVERSAL_WATCH = new Set(['PV_TRUNK', 'SV_CONF', 'SMV_CONF', 'LGV_CONF', 'PVH_R', 'PVH_L', 'PRE_R', 'PRE_L', 'V_SPL', 'V_IMV', 'V_INT', 'RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'V_STO', 'IVC_IS']);

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
// Relative luminance of an 'rgb(r,g,b)' string (non-rgb strings count as dark).
function luminance(c) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || '');
  if (!m) return 0;
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function createStage({ wrap, onSelect, onAction, onOpenTab, onHoverInfo, onViewChange }) {
  const svg = wrap.querySelector('#stage');
  const stageWrap = wrap.closest('.stage-wrap') || wrap;
  svg.setAttribute('viewBox', `0 0 ${VIEW.w} ${VIEW.h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // ── Geometry sampling ──────────────────────────────
  // A fresh element per course: Chromium can keep measuring a reused path's previous course after
  // its `d` changes (a straight segment after another), which drew the suprahepatic IVC over the
  // infrahepatic one and put the SVC out on the circuit's course.
  const scratchG = s('g');
  svg.append(scratchG);
  function sample(d) {
    const scratch = s('path', { d });
    scratchG.replaceChildren(scratch);
    const L = scratch.getTotalLength();
    const pts = [];
    for (let i = 0; i < N_SAMPLES; i++) {
      const p = scratch.getPointAtLength((L * i) / (N_SAMPLES - 1));
      pts.push([p.x, p.y]);
    }
    return pts;
  }
  // Real vessels are never ruler-straight: a gentle, low-frequency meander (a few units, fixed
  // per vessel) along each anatomic course, fading to zero at both ends so junctions stay put.
  function meander(pts, id) {
    let L = 0;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(L); }
    const amp = Math.min(4.5, L * 0.02);
    if (amp < 0.8) return pts;
    let hsh = 0;
    for (const c of id) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
    const ph = (hsh % 628) / 100, k = (Math.PI * 2 * (0.7 + (hsh % 5) * 0.12)) / L;
    return pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      const a = pts[i - 1], b = pts[i + 1];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      const u = cum[i] / L;
      const o = amp * Math.sin(Math.PI * u) * (0.72 * Math.sin(k * cum[i] + ph) + 0.28 * Math.sin(2.3 * k * cum[i] + 2 * ph));
      return [p[0] + nx * o, p[1] + ny * o];
    });
  }
  const CIRC_SPINE_Y = 345;   // the circuit's main line runs along this row
  const defaultPath = (a, b, circuit) => (circuit ? metroPath(a, b) : `M${a[0]} ${a[1]} L ${b[0]} ${b[1]}`);
  // A custom shunt in the circuit is a bypass: a gentle arc bowing away from the spine (the main
  // portal → liver → heart line), so it crosses the lanes it meets instead of running along one.
  const bypassPath = ([x1, y1], [x2, y2]) => {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, L = Math.hypot(x2 - x1, y2 - y1) || 1;
    let nx = -(y2 - y1) / L, ny = (x2 - x1) / L;
    const away = my < CIRC_SPINE_Y - 5 ? -1 : my > CIRC_SPINE_Y + 5 ? 1 : -1;
    if (Math.sign(ny || 1) !== away) { nx = -nx; ny = -ny; }
    const k = Math.max(0.28 * L, 40);
    return `M${x1} ${y1} Q ${(mx + nx * k).toFixed(1)} ${(my + ny * k).toFixed(1)} ${x2} ${y2}`;
  };
  const geo = {};
  for (const e of ALL_EDGES) {
    const a = NODE_POS[e.from], b = NODE_POS[e.to];
    const dA = EDGE_PATH[e.id] || defaultPath(a[0], b[0], false);
    const dC = CIRCUIT_PATH[e.id] || (e.shunt === 'custom' ? bypassPath(a[1], b[1]) : defaultPath(a[1], b[1], true));
    // A spontaneous shunt (gastrorenal, splenorenal) is one large vein, drawn like one.
    const A = (e.kind === 'collateral' && !e.spontaneous) || e.kind === 'shunt' ? sample(dA) : meander(sample(dA), e.id);
    geo[e.id] = { dA, dC, A, C: sample(dC), cur: null, len: 0, wig: 0 };
  }
  // Tributaries and feeders (anatomic only), sampled once, with a vein's gentle meander (a
  // feeder that is a collateral gets a serpentine instead).
  const feedGeo = {};
  // Veins that run on out of the plate fade out instead of ending: [y where the fade starts, y where
  // it is gone], downward for the rectal and epigastric veins and the infrarenal IVC, upward for the
  // SVC above the azygos arch (it leaves the top of the plate).
  // Veins that end on the faded IVC fade into it over their last stretch, so the join is seamless.
  const IVC_NODES = new Set(['IVCS', 'IVCI', 'RA']), IVC_JOIN_LEN = 60;
  // Solid to the wall, joined to the cava as a confluence: the hepatic and renal veins.
  const HEPATIC_VEINS = new Set(['RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'LRV_IVC', 'RRV_IVC']);
  const IVC_JOIN = {};
  for (const e of ALL_EDGES) {
    if (IVC_EDGES.has(e.id) || HEPATIC_VEINS.has(e.id) || !IVC_NODES.has(e.to) || !NODE_POS[e.to] || !NODE_POS[e.from]) continue;
    // To where the drawn course actually ends (on the cava's wall), not to the node.
    const end = EDGE_PATH[e.id]?.match(/(-?[\d.]+)[ ,]+(-?[\d.]+)\s*$/);
    const [bx, by] = end ? [+end[1], +end[2]] : NODE_POS[e.to][0], [ax, ay] = NODE_POS[e.from][0], d = Math.hypot(bx - ax, by - ay) || 1;
    const k = Math.min(IVC_JOIN_LEN, d) / d;
    IVC_JOIN[e.id] = [bx - (bx - ax) * k, by - (by - ay) * k, bx, by, 0, 1, 0.3, 1];
  }
  const FADE_DOWN_Y = { C4: [892, 928], EPI_ILI: [870, 925], ILI_IVC: [800, 870], V_UP: [38, 4] };
  // The azygos trunk fades out toward its lower end: [y where the fade starts, y where it is gone].
  // When the ascending lumbar collateral (C9) is open it runs on in the same lane behind the organs,
  // so the trunk still fades, into it, rather than ending in a hard step. (A feeder listed in
  // FEEDER_CONNECTOR is drawn solid to its end while that collateral is open.)
  const FEEDER_FADE_Y = { AZY_SVC: [110, 176] };
  const FEEDER_CONNECTOR = {};
  // The IVC narrows to the SVC's caliber at the right atrium on the GPU too, so its end never
  // shows as a rounded cap inside the narrower SVC.
  const GPU_EASE = { IVCS_RA: 'RA' };
  // The ascending lumbar–azygos channel runs in the azygos trunk's lane, so it stays straight.
  const STRAIGHT_COLL = new Set(['C9']);
  // Veins that fade into the vessel they sink into: a linear mask [x1, y1, x2, y2, offset], from
  // solid at the offset to 30 % at the end (the caudate vein into the IVC, C5 into the renal vein).
  const FADE_IN = { CAUD: [566, 326, 620, 350, 0.45], C5: [852, 520, 862, 618, 0.6] };
  for (const [id, fd] of Object.entries(FEEDERS)) {
    // A generated fan is a tortuous network (drawn like the variceal plexus); listed paths meander.
    const list = [...(fd.fan ? fanFeeders(fd.fan).map((x) => ({ ...x, fan: true, when: fd.fan.when, out: !!fd.fan.out })) : []), ...(fd.paths || []).map((d, i) => ({ d, k: 1, when: fd.when, src: fd.from?.[i] }))];
    feedGeo[id] = list.map(({ d, k, fan, when, src, out }, i) => { const pts = sample(d); const shaped = fan ? wiggle(pts, (2.2 + 1.2 * k) * (fd.fan.wig ?? 1), i * 2.3 + 1) : fd.wig ? wiggle(pts, fd.wig, i * 2.3 + 1) : fd.exact ? pts : meander(pts, id + i); return { k, fan, when, src, out, pts: out ? shaped.slice().reverse() : shaped }; });
  }
  // The liver's branches in the circuit (circuit only), sampled once.
  const treeGeo = {};
  for (const [id, list] of Object.entries(CIRCUIT_TREES)) treeGeo[id] = list.map(({ d, k }) => ({ pts: sample(d), k }));
  scratchG.remove();
  // Where to caption each circuit lane: the middle of its longest horizontal run.
  const laneU = {}, laneAlt = {};
  for (const id of Object.keys(LANE_CAPTIONS)) {
    const C = geo[id]?.C;
    if (!C) continue;
    // Every straight horizontal run, longest first: the caption goes on the first of them (or the
    // spot along it) that is free of other vessels.
    const runs = [];
    let st = 0;
    for (let i = 1; i <= C.length; i++) {
      if (i < C.length && Math.abs(C[i][1] - C[i - 1][1]) < 0.6) continue;
      if (i - 1 - st >= 3) runs.push([st, i - 1]);
      st = i;
    }
    runs.sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]));
    const last = C.length - 1;
    laneU[id] = runs.length ? (runs[0][0] + runs[0][1]) / 2 / last : 0.5;
    laneAlt[id] = runs.flatMap(([i0, i1]) => [0.5, 0.3, 0.7, 0.15, 0.85].map((f) => (i0 + (i1 - i0) * f) / last));
  }

  const polyD = (pts) => {
    // Catmull-Rom → cubic Bézier for a smooth morph
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  };
  const arcLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
  function pointAt(pts, u) {
    const f = clamp(u, 0, 1) * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(f)), t = f - i;
    const a = pts[i], b = pts[i + 1];
    // The tangent blends between the directions at the two samples (central differences), so a
    // mark gliding along a curve turns smoothly instead of snapping at each sample.
    const tan = (j) => { const p0 = pts[Math.max(0, j - 1)], p1 = pts[Math.min(pts.length - 1, j + 1)]; const dx = p1[0] - p0[0], dy = p1[1] - p0[1], n = Math.hypot(dx, dy) || 1; return [dx / n, dy / n]; };
    const ta = tan(i), tb = tan(i + 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, ta[0] + (tb[0] - ta[0]) * t, ta[1] + (tb[1] - ta[1]) * t];
  }
  // Tortuous collateral: a smooth serpentine (wavelength ≈ 64 units) along the centerline,
  // tapered to zero at both ends so the vessel still meets its nodes.
  function wiggle(pts, amp, seed) {
    if (amp < 0.3) return pts;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1] || 1;
    const k = Math.max(1.5, Math.round(L / 90)) * Math.PI * 2 / L;
    return pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      const a = pts[i - 1], b = pts[i + 1];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      const u = cum[i] / L;
      const env = Math.min(1, u * 6, (1 - u) * 6);
      const w = amp * env * Math.sin(cum[i] * k + seed);
      return [p[0] + nx * w, p[1] + ny * w];
    });
  }
  // Lateral offset of `off` units at mid-course, easing to zero at both ends (or, with `u0`, at
  // `u0` along the vessel and the far end: the strands leave a single trunk there).
  function braid(pts, off, u0 = 0) {
    if (Math.abs(off) < 0.3) return pts;
    return pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      const a = pts[i - 1], b = pts[i + 1];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      const o = off * Math.sin(Math.PI * clamp((i / (pts.length - 1) - u0) / (1 - u0), 0, 1));
      return [p[0] + nx * o, p[1] + ny * o];
    });
  }
  // `b` blended in over `a` past `u0` along the vessel (a short smooth ramp): before it, `a`.
  function blendFrom(a, b, u0) {
    const n = a.length - 1;
    return a.map((p, i) => { const e = clamp((i / n - u0) / 0.12, 0, 1), k = e * e * (3 - 2 * e); return [lerp(p[0], b[i][0], k), lerp(p[1], b[i][1], k)]; });
  }
  // Light comes from the top (slightly left). For each sample: the unit normal and how much it
  // faces the light (n·L), so a tube's sheen and shade slide smoothly around its curves.
  const LIGHT = (() => { const n = Math.hypot(-0.42, -0.91); return [-0.42 / n, -0.91 / n]; })();
  function litNormals(pts) {
    return pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      const dot = nx * LIGHT[0] + ny * LIGHT[1];
      return [nx, ny, dot];
    });
  }
  // A centerline shifted toward (k > 0) or away from (k < 0) the light by k·(n·L) world units.
  function litOffset(pts, lit, k, u0 = 0, u1 = 1) {
    const i0 = Math.round(u0 * (pts.length - 1)), i1 = Math.round(u1 * (pts.length - 1));
    const out = [];
    for (let i = i0; i <= i1; i++) { const [nx, ny, dot] = lit[i]; out.push([pts[i][0] + nx * dot * k, pts[i][1] + ny * dot * k]); }
    return out;
  }
  // Outline of a tube of radius r(u) along pts (with round ends), as a closed path. The end caps
  // are explicit half-circles bulging along the tangent, so they are always convex.
  function tubeOutline(pts, lit, rOf) {
    const n = pts.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const r = rOf(i / (n - 1));
      const [nx, ny] = lit[i];
      L.push([pts[i][0] + nx * r, pts[i][1] + ny * r]); R.push([pts[i][0] - nx * r, pts[i][1] - ny * r]);
    }
    const cap = (i, r, fwd) => {
      const [nx, ny] = lit[i];
      const tx = ny * fwd, ty = -nx * fwd; // tangent pointing out of the tube at this end
      const out = [];
      for (let k = 1; k < 8; k++) {
        const th = (k / 8) * Math.PI, c = Math.cos(th), sn = Math.sin(th);
        const sx = fwd > 0 ? nx * c : -nx * c, sy = fwd > 0 ? ny * c : -ny * c;
        out.push([pts[i][0] + (sx + tx * sn) * r, pts[i][1] + (sy + ty * sn) * r]);
      }
      return out;
    };
    // Along the left side, round the far end (left → right), back along the right side, round the
    // near end (right → left).
    const ring = [...L, ...cap(n - 1, rOf(1), 1), ...R.reverse(), ...cap(0, rOf(0), -1)];
    return 'M' + ring.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L') + ' Z';
  }
  // Where along each vessel a stenosis sits (0–1, view-only: the model treats a vessel as one
  // lumped segment, so this only places the drawing). Set where the learner pinched.
  const stenosisAt = {};
  // Lumen radius factor along a stenosed vessel: the diameter narrows by the stenosis fraction
  // (the model's resistance scales as 1/(1−s)⁴), with a smooth waist about 2.5 diameters long.
  function waist(id, v, len, w) {
    const u0 = stenosisAt[id] ?? 0.5;
    const sig = Math.max(9, w * 1.25) / Math.max(1, len);
    return (u) => 1 - v * Math.exp(-(((u - u0) / sig) ** 2));
  }

  // Polyline helpers for the catheter: the drawn centerline (geo[id].cur), cut at a length fraction.
  const headOf = (pts, f) => {
    const L = pts.reduce((n, q, i) => n + (i ? Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0), 0);
    let run = 0; const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (seg > 0 && run + seg >= f * L) { const u = (f * L - run) / seg; out.push([lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)]); return out; }
      run += seg; out.push(pts[i]);
    }
    return out;
  };
  // The wedge station sits inside the small peripheral hepatic vein branch, on its drawn centerline.
  const WEDGE_BRANCH = { W_R: 'POST_R_RHV', W_M: 'POST_R_MHV', W_L: 'POST_L_LHV' };
  const wedgeTip = (id) => { const c = geo[WEDGE_BRANCH[id]]?.cur; return c?.length > 1 ? headOf(c.slice().reverse(), 0.55).at(-1) : null; };
  const nodePos = (id, t) => { if (WEDGE_BRANCH[id]) { const w = wedgeTip(id); if (w) return w; } const [a, c] = NODE_POS[id]; return [lerp(a[0], c[0], t), lerp(a[1], c[1], t)]; };
  // The point half way along a drawn vessel, by length, and the direction it runs there.
  function arcMid(pts) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let run = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (run + seg >= total / 2 && seg > 0) {
        const u = (total / 2 - run) / seg, dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
        return [pts[i - 1][0] + dx * u, pts[i - 1][1] + dy * u, dx / seg, dy / seg];
      }
      run += seg;
    }
    return [pts[0][0], pts[0][1], 1, 0];
  }

  // ── SVG scaffolding ───────────────────────────────
  const defs = s('defs');
  // Organ fills: a light top-to-bottom falloff in the organ's own hue.
  const grad = (id, varName, a0, a1) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(${varName});stop-opacity:calc(var(--organ-a) * ${a0})"/><stop offset="1" style="stop-color:var(${varName});stop-opacity:calc(var(--organ-a) * ${a1})"/></linearGradient>`;
  defs.innerHTML = `
    ${grad('gLiver', '--organ-liver', 0.8, 1.05)}${grad('gStomach', '--organ-stomach', 0.75, 1)}${grad('gSpleen', '--organ-spleen', 0.8, 1.05)}
    ${grad('gKidney', '--organ-kidney', 0.75, 1)}${grad('gGut', '--organ-gut', 0.6, 0.85)}${grad('gHeart', '--organ-heart', 0.8, 1.05)}${grad('gPancreas', '--organ-pancreas', 0.8, 1)}
    <filter id="orgSoft" x="-8%" y="-8%" width="116%" height="116%"><feGaussianBlur stdDeviation="6"/></filter>
    <pattern id="nodules" width="34" height="30" patternUnits="userSpaceOnUse">
      <g class="nodule"><circle cx="5" cy="5" r="4.6"/><circle cx="15.5" cy="3.5" r="3.4"/><circle cx="25" cy="6.5" r="5.2"/><circle cx="10" cy="14.5" r="4"/><circle cx="21" cy="16" r="5.6"/><circle cx="31" cy="17" r="3.2"/>
        <circle cx="3" cy="24" r="3.6"/><circle cx="13" cy="25" r="4.8"/><circle cx="25.5" cy="26.5" r="3.9"/><circle cx="34" cy="5" r="4.6"/><circle cx="0" cy="14.5" r="3.2"/><circle cx="34" cy="30" r="3.4"/></g>
    </pattern>
    <pattern id="nutmeg" width="16" height="14" patternUnits="userSpaceOnUse"><g class="nutmeg"><circle cx="3" cy="3" r="1.9"/><circle cx="11" cy="5" r="2.4"/><circle cx="6" cy="10.5" r="2.1"/><circle cx="14" cy="12" r="1.6"/></g></pattern>
    <radialGradient id="congest" cx=".42" cy=".42" r=".7"><stop offset=".35" class="cg-in"/><stop offset="1" class="cg-out"/></radialGradient>
    <linearGradient id="fluid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="fl-top"/><stop offset="1" class="fl-bot"/></linearGradient>
    <radialGradient id="skin" cx=".5" cy=".5" r=".5"><stop offset="0" class="sk-in"/><stop offset=".8" class="sk-mid"/><stop offset="1" class="sk-out"/></radialGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="mt-a"/><stop offset=".5" class="mt-b"/><stop offset="1" class="mt-a"/></linearGradient>
    <linearGradient id="esoFadeG" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="-40"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="esoFade" maskUnits="userSpaceOnUse" x="0" y="-150" width="${VIEW.w}" height="${VIEW.h + 150}"><rect x="0" y="-150" width="${VIEW.w}" height="${VIEW.h + 150}" fill="url(#esoFadeG)"/></mask>
    <clipPath id="abdomenClip"><path d="${ABDOMEN_CLIP}"/></clipPath>
    <radialGradient id="orgForm" cx=".3" cy=".2" r=".95"><stop offset="0" class="lit-hi"/><stop offset=".48" class="lit-mid"/><stop offset="1" class="lit-lo"/></radialGradient>
    <radialGradient id="cavityShade" cx=".5" cy=".46" r=".5"><stop offset="0" class="cav-hi"/><stop offset=".72" class="cav-mid"/><stop offset="1" class="cav-lo"/></radialGradient>
    <filter id="castShadow" x="-10%" y="-10%" width="130%" height="130%"><feGaussianBlur stdDeviation="7"/></filter>
    <pattern id="texLiver" width="22" height="19" patternUnits="userSpaceOnUse"><path class="tex" d="M5.5 0l5.5 3.2v6.3l-5.5 3.2L0 9.5V3.2zM16.5 9.5l5.5 3.2V19M11 9.5l5.5-3.2"/></pattern>
    <pattern id="texFine" width="9" height="9" patternUnits="userSpaceOnUse"><circle class="tex-dot" cx="2" cy="2" r=".8"/><circle class="tex-dot" cx="6.5" cy="6.5" r=".6"/></pattern>
    <pattern id="texRugae" width="40" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)"><path class="tex" d="M0 6c7-4 13 4 20 0s13-4 20 0"/></pattern>
    <pattern id="texLobules" width="14" height="12" patternUnits="userSpaceOnUse"><path class="tex" d="M1 6a6 5 0 0 1 12 0M-6 12a6 5 0 0 1 12 0M8 12a6 5 0 0 1 12 0"/></pattern>
    <pattern id="texMuscle" width="30" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(24)"><path class="tex" d="M0 5c8-3 22 3 30 0"/></pattern>
    <filter id="heatBlur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="10"/></filter>
    <pattern id="mapGrid" width="20" height="20" patternUnits="userSpaceOnUse"><circle class="map-dot" cx="10" cy="10" r=".9"/></pattern>`;
  svg.append(defs);
  const world = s('g', { id: 'world' });
  svg.append(world);
  const gGrid = s('g', { id: 'grid', class: 'circuit-only' });
  // Background plane (anatomy): body cavity and diaphragm, behind everything else.
  const gBackdrop = s('g', { id: 'backdrop' });
  gBackdrop.innerHTML = `<path class="bd-cavity" d="${BACKDROP.cavity}" fill="url(#cavityShade)"/>`
    + `<path class="org-diaphragm band-edge" d="${BACKDROP.diaphragm}"/><path class="org-diaphragm band-body" d="${BACKDROP.diaphragm}"/>`;
  const gOrgans = s('g', { id: 'organs' });
  const gAscites = s('g', { id: 'ascites', 'clip-path': 'url(#abdomenClip)' });
  const gBack = s('g', { id: 'backEdges' });
  // Posterior veins (retrohepatic IVC, iliac, azygos…) pass behind opaque organs; a faint copy
  // drawn over the organs shows their course, as a hidden line does in an anatomical plate.
  const gGhost = s('g', { id: 'ghosts' });
  // The ghosts are faded together, as one layer, so where two meet they do not stack into a darker disc.
  const gGhostIn = s('g', { class: 'ghost-layer' });
  gGhost.append(gGhostIn);
  // Veins are drawn as one network, the way a map draws streets: every shadow, then every
  // casing, then every lumen, so where vessels join their lumens flow into each other instead of
  // one tube's wall cutting across another. Arteries lie beneath; retroperitoneal veins get the
  // same three tiers behind the organs.
  const gArt = s('g', { id: 'arteries' });
  const gShadowL = s('g', { id: 'vShadows' });
  // Heat layer: a soft glow of congestion around the network, like a density map.
  const gHeat = s('g', { id: 'heatGlow', filter: 'url(#heatBlur)' });
  const gCaseL = s('g', { id: 'vCasings' });
  const gEdges = s('g', { id: 'edges' });
  const gBackS = s('g'), gBackC = s('g'), gBackL = s('g'), gBackH = s('g');
  // Highlights (the lit sheen and the shaded side of each tube) are a tier of their own above the
  // lumens of the whole network, so a vessel's highlight never cuts across its neighbor.
  const gHiMid = s('g'), gHiFront = s('g');
  const gOver = s('g', { id: 'overlays' });
  const gNodes = s('g', { id: 'nodes', class: 'circuit-only' });
  const gFocus = s('g', { id: 'focus' });
  const gGuides = s('g', { id: 'guides' });
  // The venous network is one group, so that fading it (when a vessel is selected or hovered) fades
  // its union once: casings, lumens and overlaps together, not tier by tier. The focused vessel is
  // lifted out of it, into a layer above that stays bright.
  const gNet = s('g', { id: 'net' });
  gNet.append(gArt, gShadowL, gCaseL, gEdges);
  const gTop = s('g', { id: 'focusNet' });
  const gTopS = s('g'), gTopC = s('g'), gTopL = s('g'), gTopH = s('g');
  gTop.append(gTopS, gTopC, gTopL, gTopH);
  world.append(gBackdrop, gGrid, gBack, gOrgans, gGhost, gAscites, gFocus, gHeat, gNet, gTop, gOver, gNodes, gGuides);
  // The figure is drawn on the GPU (veins-gl.js): the plate, every vessel in both views and the
  // moving blood. The SVG below keeps the organ artwork (rasterized for the GPU), invisible hit
  // targets and focus for each vessel, and what is drawn above the vessels (lesions, stents,
  // halos, guides), which moves to a second SVG above the GPU layer, with the same view box.
  const GL_ROWS = ALL_EDGES.length + ALL_EDGES.reduce((n, e) => n + (STRANDS[e.id]?.length || 0) + (feedGeo[e.id]?.length || 0) + (treeGeo[e.id]?.length || 0), 0);
  let veins = null, svgOver = null, worldOver = null;
  const vCanvas = document.createElement('canvas');
  vCanvas.id = 'veins'; vCanvas.setAttribute('aria-hidden', 'true');
  svg.after(vCanvas);
  veins = createVeinsGL(vCanvas, { tubes: GL_ROWS, force: true });
  if (veins) {
    svgOver = s('svg', { id: 'stageOver', 'aria-hidden': 'true', viewBox: `0 0 ${VIEW.w} ${VIEW.h}`, preserveAspectRatio: 'xMidYMid meet' });
    worldOver = s('g');
    svgOver.append(worldOver);
    vCanvas.after(svgOver);
    worldOver.append(gFocus, gOver, gNodes, gGuides);
    wrap.classList.add('veins-gl');
  } else {
    // No WebGL2 at all (very old browsers): a short notice; the SVG tubes still show the figure.
    console.warn('WebGL2 is not available: the figure is drawn without moving blood.');
  }
  wrap.dataset.veins = veins ? 'webgl2' : 'none';
  gBack.append(gBackS, gBackC, gBackL, gBackH);

  // Circuit view: quiet bands for each pressure zone (captioned by the label layer).
  // The dots run on past the figure in every direction and fade out in steps: concentric frames of
  // the pattern at falling opacity (no mask, so nothing repaints on pan or zoom).
  const GRID_STEPS = [[0, 0.9], [200, 0.7], [450, 0.5], [750, 0.3], [1100, 0.15], [1500, 0.06]];
  const frame = (e) => `M${30 - e} ${30 - e}h${1340 + 2 * e}v${700 + 2 * e}h${-1340 - 2 * e}z`;
  GRID_STEPS.forEach(([e, op], i) => {
    gGrid.append(s('path', { d: i ? frame(e) + frame(GRID_STEPS[i - 1][0]) : frame(e), 'fill-rule': 'evenodd', fill: 'url(#mapGrid)', class: 'map-grid', style: `opacity:${op}` }));
  });
  CIRCUIT_ZONES.forEach(([, x0, x1], i) => {
    gGrid.append(s('rect', { x: x0, y: 40, width: x1 - x0, height: 690, class: 'zone' + (i % 2 ? ' alt' : '') }));
  });

  // Colon folds: short arcs across the tube at regular intervals.
  function haustra(d, r) {
    const p = s('path', { d });
    svg.append(p);
    const L = p.getTotalLength();
    let out = '';
    for (let l = 14; l < L - 10; l += 24) {
      const a = p.getPointAtLength(l), b = p.getPointAtLength(l + 1);
      let tx = b.x - a.x, ty = b.y - a.y; const n = Math.hypot(tx, ty) || 1; tx /= n; ty /= n;
      out += `M${(a.x - ty * r).toFixed(1)} ${(a.y + tx * r).toFixed(1)} Q${(a.x + tx * 4).toFixed(1)} ${(a.y + ty * 4).toFixed(1)} ${(a.x + ty * r).toFixed(1)} ${(a.y - tx * r).toFixed(1)} `;
    }
    p.remove();
    return out;
  }
  // Each organ is drawn as a medical plate draws it, lit from the upper left:
  //   ambient occlusion where it meets the body wall (a soft dark edge outside it),
  //   its tissue tone (a light face turning to a shaded face, per tissue),
  //   the volume of a curved surface (a broad highlight and a darker turn at the rim),
  //   its surface anatomy (fissures, rugae, hilum, lobulation; clipped inside),
  //   an inner shade along the lower-right edge and a rim light along the upper-left edge,
  //   and a crisp outline in the tissue's own darker tone.
  // Everything is gradients and clips (no blur filters), so it costs nothing per frame.
  const TONES = ['liver', 'stomach', 'eso', 'spleen', 'panc', 'kidney', 'gb', 'gut', 'heart', 'ra'];
  defs.insertAdjacentHTML('beforeend', TONES.map((t) => `<linearGradient id="og-${t}" x1=".15" y1="0" x2=".85" y2="1"><stop offset="0" style="stop-color:var(--og-${t}-1)"/><stop offset="1" style="stop-color:var(--og-${t}-2)"/></linearGradient>`).join('')
    + '<radialGradient id="ogVol" cx=".34" cy=".26" r=".92"><stop offset="0" style="stop-color:#fff;stop-opacity:.22"/><stop offset=".5" style="stop-color:#fff;stop-opacity:0"/><stop offset=".8" style="stop-color:#2a1410;stop-opacity:0"/><stop offset="1" style="stop-color:#2a1410;stop-opacity:.1"/></radialGradient>');
  const organEls = {}, organG = {};
  const detailFor = (o) => {
    const list = ORGAN_DETAIL[o.id];
    if (!list) return null;
    const dg = s('g', { class: 'org-detail', 'clip-path': `url(#clip-${o.id})` });
    for (const [kind, d] of list) {
      if (kind === 'lobules') dg.append(s('path', { d: o.d, class: 'org-lobules', fill: 'url(#texLobules)' }));
      else dg.append(s('path', { d, class: 'od-' + kind }));
    }
    return dg;
  };
  for (const o of ORGANS) {
    const g = s('g', { class: 'organ organ-' + o.id + (o.tone ? ' tone-' + o.tone : '') });
    let el;
    if (o.circle) { const [cx, cy, r] = o.circle; el = s('circle', { cx, cy, r, class: o.cls }); g.append(el); }
    else if (o.band) {
      // Tubes (colon, small bowel, duodenum): a soft contact edge, the wall, the lumen in the
      // tissue tone, a shaded underside and a light top, then the colon's haustra.
      el = s('path', { d: o.d, class: o.cls + ' band-body' });
      g.append(s('path', { d: o.d, class: o.cls + ' band-ao' }), s('path', { d: o.d, class: o.cls + ' band-edge' }), el,
        s('path', { d: o.d, class: o.cls + ' band-under', transform: 'translate(1.5 3)' }),
        s('path', { d: o.d, class: o.cls + ' band-sheen', transform: 'translate(-2 -3.5)' }));
      if (o.cls === 'org-colon') g.append(s('path', { d: haustra(o.d, 11.5), class: 'org-haustra' }));
    } else if (o.id === 'heart-out') {
      // Blood leaving for the right ventricle: three notched darts, no shaft.
      const n = o.d.match(/-?\d+(?:\.\d+)?/g).map(Number), L = [0, 2, 4, 6].map((i) => [n[i], n[i + 1]]);
      const bez = (u) => [0, 1].map((j) => (1 - u) ** 3 * L[0][j] + 3 * (1 - u) ** 2 * u * L[1][j] + 3 * (1 - u) * u * u * L[2][j] + u ** 3 * L[3][j]);
      const d = [0.3, 0.62, 0.94].map((u) => {
        const [cx, cy] = bez(u), [ax, ay] = bez(u - 0.02), [bx, by] = bez(Math.min(1, u + 0.02));
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const ux = (bx - ax) / len, uy = (by - ay) / len, dart = [[0.55, 0], [-0.45, 0.45], [-0.2, 0], [-0.45, -0.45]];
        return 'M' + dart.map(([a, c]) => `${(cx + (ux * a - uy * c) * 9).toFixed(1)} ${(cy + (uy * a + ux * c) * 9).toFixed(1)}`).join(' L') + ' Z';
      }).join(' ');
      el = s('path', { d, class: o.cls });
      g.append(el);
    } else if (o.deco) { el = s('path', { d: o.d, class: o.cls }); g.append(el); }
    else {
      el = s('path', { d: o.d, class: o.cls + ' org-fill', fill: o.tone ? `url(#og-${o.tone})` : null });
      defs.insertAdjacentHTML('beforeend', `<clipPath id="clip-${o.id}"><path d="${o.d}"/></clipPath>`);
      const clip = `url(#clip-${o.id})`;
      g.append(s('path', { d: o.d, class: 'org-ao' }), el, s('path', { d: o.d, class: 'org-form', fill: 'url(#ogVol)' }));
      const dg = detailFor(o);
      if (dg) g.append(dg);
      // The inner shade is a soft ramp (three widening, fading strokes), never a hard band.
      for (const k of [1, 2, 3]) g.append(s('path', { d: o.d, class: 'org-shade s' + k, 'clip-path': clip, transform: 'translate(-3.5 -5)' }));
      g.append(
        s('path', { d: o.d, class: 'org-rimlight', 'clip-path': clip, transform: 'translate(2 3)' }),
        s('path', { d: o.d, class: o.cls + ' org-line' }));
    }
    organEls[o.id] = el; organG[o.id] = g;
    if (o.id === 'esophagus') g.setAttribute('mask', 'url(#esoFade)');   // it runs up out of the plate: fade, don't cut
    gOrgans.append(g);
  }
  // The liver shows its disease as texture, never as a pressure hue (hue is kept for data):
  // a congested vignette as sinusoidal pressure rises, nutmeg mottling when the outflow backs up,
  // a nodular surface with cirrhosis, and a slightly shrunken, blunter organ.
  const liverD = ORGANS.find((o) => o.id === 'liver').d;
  const liverTint = s('path', { d: liverD, fill: 'url(#congest)', class: 'liver-tint' });
  const liverNutmeg = s('path', { d: liverD, fill: 'url(#nutmeg)', opacity: 0 });
  const liverNodules = s('path', { d: liverD, fill: 'url(#nodules)', opacity: 0 });
  for (const el of [liverTint, liverNutmeg, liverNodules]) organG.liver.insertBefore(el, organG.liver.querySelector('.org-shade'));
  // Cirrhosis reshapes the outline itself. The healthy outline is resampled evenly and every
  // point is displaced, so the shape blends continuously with the slider: the right lobe
  // atrophies toward the hilum, the lateral left lobe hypertrophies, the inferior edge draws up
  // and blunts, and the contour dimples between regenerative nodules.
  const liverPaths = [...organG.liver.querySelectorAll('path')].filter((el) => el.getAttribute('d') === liverD);
  const liverClip = defs.querySelector('#clip-liver path');
  if (liverClip) liverPaths.push(liverClip);
  let baseLiver = null, liverKey = '';
  function sampleLiver() {
    const tmp = s('path', { d: liverD }); svg.append(tmp);
    const L = tmp.getTotalLength(), n = 360, pts = [];
    for (let i = 0; i < n; i++) { const q = tmp.getPointAtLength((L * i) / n); pts.push([q.x, q.y]); }
    tmp.remove();
    let area = 0;
    for (let i = 0; i < n; i++) { const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n]; area += ax * by - bx * ay; }
    const sg = area > 0 ? 1 : -1; // outward normal for either winding
    const nm = pts.map((_, i) => {
      const [ax, ay] = pts[(i + n - 1) % n], [bx, by] = pts[(i + 1) % n];
      const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
      return [(sg * dy) / l, (-sg * dx) / l];
    });
    // Nodules: irregular lengths along the edge, fixed per point.
    let r = 7, start = 0;
    const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    let lam = 18 + 10 * rnd();
    const step = L / n, nod = [];
    for (let i = 0; i < n; i++) {
      const acc = i * step;
      if (acc - start > lam) { start = acc; lam = 16 + 12 * rnd(); }
      nod.push([(acc - start) / lam, 0.7 + 0.6 * rnd()]);
    }
    return { pts, nm, nod };
  }
  const smooth01 = (v) => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };
  function morphLiver(cirr) {
    const c = Math.round(clamp(cirr, 0, 1) * 40) / 40;
    const key = String(c);
    if (key === liverKey) return;
    if (!baseLiver) { try { baseLiver = sampleLiver(); } catch { return; } if (!baseLiver.pts.length) { baseLiver = null; return; } }
    liverKey = key;
    let d = liverD;
    if (c > 0) {
      const { pts, nm, nod } = baseLiver;
      d = 'M' + pts.map((p0, i) => {
        let [x, y] = p0;
        // Right lobe atrophy (toward the hilum) and lateral left lobe hypertrophy (outward).
        const wr = smooth01((600 - p0[0]) / 260), wl = smooth01((p0[0] - 720) / 120);
        x += (600 - x) * 0.1 * c * wr; y += (360 - y) * 0.08 * c * wr;
        x += (x - 720) * 0.1 * c * wl; y += (y - 280) * 0.12 * c * wl;
        const [nx, ny] = nm[i];
        // Blunted inferior edge: the downward-facing margin draws up and rounds off.
        const inf = clamp(ny, 0, 1);
        x -= nx * 8 * c * inf; y -= ny * 8 * c * inf;
        // Nodular contour: indentations between regenerative nodules.
        const [u, a] = nod[i];
        const dip = Math.pow(1 - Math.sin(Math.PI * u), 2) * 5 * a * c;
        x -= nx * dip; y -= ny * dip;
        return `${x.toFixed(1)} ${y.toFixed(1)}`;
      }).join(' L') + ' Z';
    }
    for (const el of liverPaths) el.setAttribute('d', d);
  }
  // Abdominal wall (anterior): a soft skin tint that appears only with caput medusae, under its veins.
  const abdWall = s('ellipse', { cx: SITES.umbilicus[0], cy: SITES.umbilicus[1], rx: 120, ry: 96, fill: 'url(#skin)', class: 'abd-wall', opacity: 0 });
  // Flanks: the outline of the abdominal wall, which bulges as ascites accumulates.
  const flank = s('path', { class: 'flank', d: '' });
  gOver.before(abdWall);
  const ascitesPath = s('path', { class: 'ascites-fill', d: '', fill: 'url(#fluid)' });
  const ascitesLine = s('path', { class: 'ascites-line', d: '' });
  const ascitesGlint = s('path', { class: 'ascites-glint', d: '' });
  gAscites.append(ascitesPath, ascitesLine, ascitesGlint);
  let fluidSurf = null;   // the ascites surface y(x) while there is fluid; a tap below it opens the Ascites view
  gBackdrop.append(flank);

  // Edge groups
  const E = {};
  for (const e of ALL_EDGES) {
    const vcls = 'vg' + (CONTEXT_EDGES.has(e.id) ? ' ctx' : '') + (e.kind === 'collateral' ? ' coll' : '');
    const g = s('g', { class: vcls, 'data-id': e.id });
    const gc = s('g', { class: vcls }), gs = s('g', { class: vcls }), gh = s('g', { class: vcls });
    const grad = s('linearGradient', { id: 'gr-' + e.id, gradientUnits: 'userSpaceOnUse' });
    const st0 = s('stop', { offset: '0' }), st1 = s('stop', { offset: '1' });
    grad.append(st0, st1); defs.append(grad);
    const isArt = e.kind === 'arteriole' || e.kind === 'artery' || (e.kind === 'shunt' && e.shunt === 'ap');
    const halo = s('path', { class: 'v-halo' });
    const sel = s('path', { class: 'v-select' });
    // Anatomy: a soft contact shadow under the tube (so a vessel in front visibly passes over
    // the one behind it), the casing, the pressure-colored lumen, then the tube's shading: a
    // darker band on the side turned away from the light and a narrow sheen on the lit side.
    const shadow = s('path', { class: 'v-shadow' });
    const wall = s('path', { class: isArt ? 'v-artery' : 'v-wall' });
    const lumen = isArt ? null : s('path', { class: 'v-lumen' + (e.kind === 'liver' && (e.zone === 'sin' || e.zone === 'inter') ? ' liver-micro' : ''), stroke: `url(#gr-${e.id})` });
    const shade = isArt ? null : s('path', { class: 'v-shade' });
    const sheen = s('path', { class: 'v-sheen' });
    // A stenosed vessel is drawn as a filled outline whose width narrows at the lesion.
    const wallP = isArt ? null : s('path', { class: 'v-wallP' });
    const lumenP = isArt ? null : s('path', { class: 'v-lumenP', fill: `url(#gr-${e.id})` });
    const hit = s('path', { class: 'v-hit', tabindex: 0, role: 'button', 'aria-label': e.label || e.id, 'data-id': e.id });
    // Extra channels of a braided collateral (cavernoma): plain strokes under the main tube.
    const strands = !isArt && STRANDS[e.id] ? STRANDS[e.id].map(([off, ph, k]) => ({ off, ph, k, wall: s('path', { class: 'v-strand-wall' }), lumen: s('path', { class: 'v-strand', stroke: `url(#gr-${e.id})` }) })) : null;
    const feeders = !isArt && feedGeo[e.id] ? feedGeo[e.id].map(({ pts: cur, k: fk, fan, when, src, out }, i) => ({ cur, fk, fan, when, src, out, len: arcLen(cur), ph: i * 0.37, wall: s('path', { class: 'v-strand-wall' }), lumen: s('path', { class: 'v-strand', stroke: `url(#gr-${e.id})` }) })) : null;
    // A feeder that leaves a named vein is colored from that vein's pressure to the vessel's.
    if (feeders) feeders.forEach((fd, i) => {
      if (!fd.src) return;
      const a = fd.cur[0], b = fd.cur[fd.cur.length - 1];
      fd.st0 = s('stop', { offset: '0' }); fd.st1 = s('stop', { offset: '1' });
      const gr = s('linearGradient', { id: `gf-${e.id}-${i}`, gradientUnits: 'userSpaceOnUse', x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
      gr.append(fd.st0, fd.st1); defs.append(gr);
      fd.lumen.setAttribute('stroke', `url(#gf-${e.id}-${i})`);
    });
    if (feeders && FEEDERS[e.id].fan) {
      // Tributaries fade out toward the bowel they drain, so they stay background.
      const { at, len, levels, fade = [0.7, 0.4] } = FEEDERS[e.id].fan;
      defs.insertAdjacentHTML('beforeend', `<radialGradient id="fg-${e.id}" gradientUnits="userSpaceOnUse" cx="${at[0]}" cy="${at[1]}" r="${len * (levels ? 2.7 : 1.35)}"><stop offset="0" stop-color="#fff" stop-opacity="${fade[0]}"/><stop offset=".45" stop-color="#fff" stop-opacity="${fade[1]}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="fm-${e.id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEW.w}" height="${VIEW.h}"><rect x="0" y="0" width="${VIEW.w}" height="${VIEW.h}" fill="url(#fg-${e.id})"/></mask>`);
      for (const fd of feeders) if (fd.fan) { fd.wall.setAttribute('mask', `url(#fm-${e.id})`); fd.lumen.setAttribute('mask', `url(#fm-${e.id})`); fd.faded = true; }
    }
    // Veins that sink into a retroperitoneal vein fade into it instead of ending on it: the
    // caudate vein into the IVC, the gastrorenal shunt into the left renal vein.
    if (feeders && FEEDER_FADE_Y[e.id]) {
      const [y0, y1] = FEEDER_FADE_Y[e.id];
      defs.insertAdjacentHTML('beforeend', `<linearGradient id="ffg-${e.id}" gradientUnits="userSpaceOnUse" x1="0" y1="${y0}" x2="0" y2="${y1}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="ffm-${e.id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEW.w}" height="${VIEW.h}"><rect x="0" y="0" width="${VIEW.w}" height="${VIEW.h}" fill="url(#ffg-${e.id})"/></mask>`);
      for (const fd of feeders) { fd.fadeMask = `url(#ffm-${e.id})`; fd.wall.setAttribute('mask', fd.fadeMask); fd.lumen.setAttribute('mask', fd.fadeMask); }
    }
    const FADE_DOWN = FADE_DOWN_Y;
    if (FADE_IN[e.id]) {
      const [x1, y1, x2, y2, o] = FADE_IN[e.id];
      defs.insertAdjacentHTML('beforeend', `<linearGradient id="cg-${e.id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="${o}" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity=".3"/></linearGradient><mask id="cm-${e.id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEW.w}" height="${VIEW.h}"><rect x="0" y="0" width="${VIEW.w}" height="${VIEW.h}" fill="url(#cg-${e.id})"/></mask>`);
    }
    if (isArt) { g.append(halo, sel, wall, sheen, hit); gArt.append(g); }
    else {
      gs.append(shadow);
      gc.append(halo, sel, wall, wallP);
      g.append(lumen, lumenP, hit);
      gh.append(shade, sheen);
      if (strands) { gc.prepend(...strands.map((sd) => sd.wall)); g.prepend(...strands.map((sd) => sd.lumen)); }
      if (feeders) {
        for (const fd of feeders) { const d = polyD(fd.cur); fd.wall.setAttribute('d', d); fd.lumen.setAttribute('d', d); }
        gc.prepend(...feeders.map((fd) => fd.wall)); g.prepend(...feeders.map((fd) => fd.lumen));
        // A drawn trunk (the azygos) is part of its vessel: it takes hover and clicks, not only the short arch path.
        for (const fd of feeders) if (!fd.fan) { const fh = s('path', { class: 'v-hit', 'data-id': e.id, d: polyD(fd.cur), 'aria-hidden': 'true' }); fh.style.strokeWidth = 12; g.append(fh); }
      }
      gShadowL.append(gs); gCaseL.append(gc); gEdges.append(g); gHiMid.append(gh);
    }
    const heat = isArt ? null : s('path', { class: 'v-heat' });
    if (heat) gHeat.append(heat);
    if (FADE_IN[e.id]) for (const el of [shadow, wall, lumen, shade, sheen, wallP, lumenP]) el?.setAttribute('mask', `url(#cm-${e.id})`);
    // Veins that run on out of the plate toward the pelvis (the rectal veins and their anorectal
    // varices, the inferior epigastric) fade out downward instead of ending: [y where the fade
    // starts, y where it is gone]. Only the anatomy is that low; the circuit is unaffected.
    const fadeY = FADE_DOWN[e.id];
    if (fadeY) {
      defs.insertAdjacentHTML('beforeend', `<linearGradient id="dg-${e.id}" gradientUnits="userSpaceOnUse" x1="0" y1="${fadeY[0]}" x2="0" y2="${fadeY[1]}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="dm-${e.id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEW.w}" height="${VIEW.h}"><rect x="0" y="0" width="${VIEW.w}" height="${VIEW.h}" fill="url(#dg-${e.id})"/></mask>`);
      for (const el of [shadow, wall, lumen, shade, sheen, wallP, lumenP, halo, sel, ...(strands || []).flatMap((sd) => [sd.wall, sd.lumen])]) el?.setAttribute('mask', `url(#dm-${e.id})`);
    }
    // A vein that ends in the organ it drains fades out over its first stretch (TIP_FADE): a mask
    // whose gradient follows the vessel's course, kept clear in the circuit (see updateGeometry).
    let tipFade = null;
    if (TIP_FADE[e.id] && !isArt) {
      const tg = s('linearGradient', { id: `tg-${e.id}`, gradientUnits: 'userSpaceOnUse' });
      const s0 = s('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '0' }), s1 = s('stop', { offset: '1', 'stop-color': '#fff' });
      tg.append(s0, s1);
      const tm = s('mask', { id: `tm-${e.id}`, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: VIEW.w, height: VIEW.h });
      tm.append(s('rect', { x: 0, y: 0, width: VIEW.w, height: VIEW.h, fill: `url(#tg-${e.id})` }));
      defs.append(tg, tm);
      for (const el of [shadow, wall, lumen, shade, sheen, wallP, lumenP, halo, sel]) el?.setAttribute('mask', `url(#tm-${e.id})`);
      tipFade = { tg, s0, frac: TIP_FADE[e.id], line: [0, 0, 1, 0], joined: false };
    }
    E[e.id] = { e, g, gc, gs, gh, tipFade, groups: isArt ? [g] : [gs, gc, g, gh], heat, grad, st0, st1, halo, sel, shadow, wall, lumen, shade, sheen, wallP, lumenP, hit, strands, feeders, isArt, vis: true, width: 4, wallPx: 1, shadeKey: '' };
  }
  ALL_EDGES.forEach((e, i) => { E[e.id].row = i; });
  // Draw order within each tier: the portal tree in front (it lies anterior to the IVC).
  for (const x of Object.values(E)) if (!x.isArt && (x.e.kind === 'vein' && PORTAL_TERRITORY.has(x.e.to) && PORTAL_TERRITORY.has(x.e.from || '') || ['PV_TRUNK', 'PVH_R', 'PVH_L', 'SMV_CONF', 'SV_CONF'].includes(x.e.id))) { gShadowL.append(x.gs); gCaseL.append(x.gc); gEdges.append(x.g); gHiFront.append(x.gh); x.front = true; x.g.dataset.front = '1'; }
  // Highlights of the middle tier sit above its lumens and below the front tier's; the front tier's above all.
  gEdges.insertBefore(gHiMid, gEdges.querySelector('[data-front]'));
  gEdges.append(gHiFront);
  for (const id of BACK_EDGES) if (E[id]) {
    const x = E[id];
    if (x.isArt) gBackL.append(x.g); else { gBackS.append(x.gs); gBackC.append(x.gc); gBackL.append(x.g); gBackH.append(x.gh); }
    x.back = true;
    x.g.id = 'vg-' + id;
    // The ghost is also how the hidden stretch is picked: it carries the vessel's id.
    const u = s('use', { href: '#vg-' + id, class: 'ghost ghost-hit', 'data-id': id });
    gGhostIn.append(u);
  }

  // Translucent vessels (the context veins, collaterals) are drawn in stacks, one per opacity level,
  // beneath the opaque network. A stack is faded once, as a whole, so where two of its vessels meet
  // their overlap is composited as a union instead of each fading on its own and the overlap of
  // their round ends showing as a darker, ringed disc; the opaque vessels above cover the ends
  // that run in under them.
  const LEVELS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  const nearestLevel = (o) => (o >= 0.95 ? 1 : LEVELS.reduce((b, l) => (Math.abs(l - o) < Math.abs(b - o) ? l : b)));
  // Each stack is one group holding a level's shadows, casings, lumens and highlights, so the
  // fade applies to the vessel as drawn (its border does not show through its own body).
  const mkStacks = () => Object.fromEntries(LEVELS.map((l) => {
    const P = s('g'); P.style.opacity = String(l);
    const parts = { s: s('g', { class: 'tier-shadow' }), c: s('g', { class: 'tier-casing' }), l: s('g'), h: s('g') };
    P.append(parts.s, parts.c, parts.l, parts.h);
    return [l, { P, ...parts }];
  }));
  const midStacks = mkStacks(), backStacks = mkStacks();
  const gStackMid = s('g'), gStackBack = s('g');
  gStackMid.append(...LEVELS.map((l) => midStacks[l].P));
  gStackBack.append(...LEVELS.map((l) => backStacks[l].P));
  gShadowL.before(gStackMid);   // beneath the opaque network
  gBackS.before(gStackBack);    // beneath the opaque part of the retroperitoneal veins
  gShadowL.classList.add('tier-shadow'); gCaseL.classList.add('tier-casing');
  gBackS.classList.add('tier-shadow'); gBackC.classList.add('tier-casing');
  gTopS.classList.add('tier-shadow'); gTopC.classList.add('tier-casing');
  // Where a vessel's parts (shadow, casing, lumen, highlights) go: on top when it is the focus
  // (selected or hovered), in the stack of its opacity level when translucent, else in the opaque
  // network. A vessel behind the organs is never lifted (it would jump in front of them).
  function place(x) {
    if (x.isArt) { (x.lifted ? gTopL : gArt).append(x.g); return; }
    if (x.lifted && !x.back) { gTopS.append(x.gs); gTopC.append(x.gc); gTopL.append(x.g); gTopH.append(x.gh); return; }
    const st = (x.level ?? 1) < 1 && (x.back ? backStacks : midStacks)[x.level];
    if (st) { st.s.append(x.gs); st.c.append(x.gc); st.l.append(x.g); st.h.append(x.gh); }
    else if (x.back) { gBackS.append(x.gs); gBackC.append(x.gc); gBackL.append(x.g); gBackH.append(x.gh); }
    else if (x.front) { gShadowL.append(x.gs); gCaseL.append(x.gc); gEdges.insertBefore(x.g, gHiFront); gHiFront.append(x.gh); }
    else { gShadowL.append(x.gs); gCaseL.append(x.gc); gEdges.insertBefore(x.g, gHiMid); gHiMid.append(x.gh); }
  }
  function setLevel(x, l) { if ((x.level ?? 1) === l) return; x.level = l; place(x); }
  function syncLift() {
    for (const x of Object.values(E)) {
      const on = x.g.classList.contains('is-sel') || x.g.classList.contains('hl');
      if (on !== !!x.lifted) { x.lifted = on; place(x); }
    }
    // Within the focus tier the portal tree stays in front (as in the resting order), so a
    // lifted collateral (paraumbilical) never draws over a lifted portal vein.
    for (const x of Object.values(E)) if (x.lifted && x.front && !x.isArt && !x.back) { gTopS.append(x.gs); gTopC.append(x.gc); gTopL.append(x.g); gTopH.append(x.gh); }
  }
  const cls = (x, c, on) => { for (const g of x.groups) g.classList.toggle(c, on); };
  const setStyle = (x, k, v) => { if (x['_s' + k] === v) return; x['_s' + k] = v; for (const g of x.groups) g.style[k] = v; };
  // Context veins are always translucent; collaterals start faint until the model says otherwise.
  for (const x of Object.values(E)) if (!x.isArt) { if (CONTEXT_EDGES.has(x.e.id) && !IVC_EDGES.has(x.e.id)) setLevel(x, 0.6); else if (x.e.kind === 'collateral') setLevel(x, 0.3); }
  // Performance: every model frame (≈10 a second) would otherwise rewrite hundreds of SVG
  // attributes with values that differ only in the third decimal, and each write makes the
  // browser restyle and repaint the figure. Writes go through a per-element cache, pressures
  // used for color are rounded to 0.25 mmHg and widths to 0.25 px (well below what shows).
  const setA = (el, k, v) => { const c = el._a || (el._a = {}); if (c[k] === v) return; c[k] = v; el.setAttribute(k, v); };
  // Colors follow the beat-filtered mean pressure (the scale shows mean venous pressure) in
  // 0.5 mmHg steps, so a vessel's gradient is not rewritten on every heartbeat; widths move in
  // 0.5 px steps once settled (below, with hysteresis), so tubes are not rebuilt either.
  const qP = (v) => Math.round(v * 2) / 2;
  const qW = (v) => Math.round(v * 4) / 4;

  // Nodes (circuit view)
  const nodeEls = {};
  for (const n of NODES) {
    if (n.kind === 'wedge' || HIDDEN_NODES.has(n.id)) continue;
    const c = s('circle', { r: n.kind === 'heart' ? 7 : n.kind === 'bed' ? 5.5 : 4.5, class: 'node-dot circuit-only' });
    gNodes.append(c);
    nodeEls[n.id] = { c };
  }
  // Resistance of each liver compartment, per lobe (read out in the circuit's liver header).
  const liverR = {};
  for (const id of ['PRE_R', 'PRE_L', 'SIN_RR', 'SIN_LL', 'POST_R_RHV', 'POST_L_LHV']) liverR[id] = { R: Infinity };

  // Overlays
  const ov = {
    clamps: s('g'), thrombi: s('g'), stents: s('g'), plugs: s('g'), varices: s('g'), gvarices: s('g'),
    balloons: s('g'), bands: s('g'),
  };
  Object.values(ov).forEach((g) => gOver.append(g));
  // The Doppler's vessel: a steady green glow and a thin green edge around it while the Doppler
  // instrument is open. The vessel's middle is masked out, so its pressure colour shows through
  // (the GPU draws the vessels under this layer).
  const dop = (() => {
    const g = s('g', { class: 'dop-mark', 'aria-hidden': 'true' });
    const BIG = { x: -4000, y: -4000, width: 12000, height: 12000 };
    // The mask: a wide band along the vessel that fades in from each end (open ends, no caps), with
    // the vessel itself cut out so its pressure colour shows through.
    const fade = s('linearGradient', { id: 'dop-fade', gradientUnits: 'userSpaceOnUse' });
    for (const [o, a] of [[0, 0], [0.18, 1], [0.82, 1], [1, 0]]) fade.append(s('stop', { offset: o, 'stop-color': '#fff', 'stop-opacity': a }));
    const band = s('path', { fill: 'none', stroke: 'url(#dop-fade)', 'stroke-linecap': 'butt', 'stroke-linejoin': 'round' });
    const knock = s('path', { fill: 'none', stroke: '#000', 'stroke-linecap': 'butt', 'stroke-linejoin': 'round' });
    const mask = s('mask', { id: 'dop-knock', maskUnits: 'userSpaceOnUse', ...BIG });
    mask.append(band, knock);
    // The blur works in user space: a straight vessel's own box has no height, which would clip it.
    const blur = s('filter', { id: 'dop-blur', filterUnits: 'userSpaceOnUse', ...BIG });
    blur.append(s('feGaussianBlur', { stdDeviation: 5 }));
    const defs = s('defs');
    defs.append(fade, mask, blur);
    const glow = s('path', { class: 'dop-glow', filter: 'url(#dop-blur)' });
    const glowG = s('g', { mask: 'url(#dop-knock)' });
    const edge = s('path', { class: 'dop-edge' });
    glowG.append(glow, edge);
    g.append(defs, glowG);
    g.style.display = 'none';
    gOver.prepend(g);
    return {
      id: null, g,
      paint(d, w) {
        for (const el of [band, knock, glow, edge]) el.setAttribute('d', d);
        const n = d.match(/-?\d*\.?\d+(?:e-?\d+)?/g);
        if (n && n.length >= 4) {
          fade.setAttribute('x1', n[0]); fade.setAttribute('y1', n[1]);
          fade.setAttribute('x2', n[n.length - 2]); fade.setAttribute('y2', n[n.length - 1]);
        }
        band.setAttribute('stroke-width', (w + 60).toFixed(1));
        knock.setAttribute('stroke-width', (w + 0.5).toFixed(1));
        edge.setAttribute('stroke-width', (w + 5).toFixed(1));
        glow.setAttribute('stroke-width', (w + 18).toFixed(1));
      },
    };
  })();

  // ── View transform (pan / zoom) ───────────────────
  let vt = { k: 1, x: 0, y: 0 };
  let morph = store.get().view === 'circuit' ? 1 : 0, morphTarget = morph, lastMorph = -1;
  // The circuit can be turned a quarter turn counter-clockwise, so its flow runs bottom to top and
  // the map is tall instead of wide: it fills a phone held upright. rotU is the (animated) turn,
  // 0 to 1; the anatomy is never turned. The turn is part of the world transform and of the view
  // box (which swaps its width and height with it), so pan, zoom and every screen-space layer
  // keep working in the frame they already use.
  // With no saved choice, a phone held upright opens the circuit upright (the wide map would be a strip).
  const portraitPhone = () => innerWidth < 700 && innerHeight > innerWidth * 1.15;
  let rotTarget = (() => { try { const v = localStorage.getItem('pps.circuitRot'); return v == null ? (portraitPhone() ? 1 : 0) : v === '1' ? 1 : 0; } catch { return portraitPhone() ? 1 : 0; } })();
  let rotU = rotTarget;
  const rotEase = (u) => u * u * (3 - 2 * u);
  const CIRC_C = [VB_CIRC[0] + VB_CIRC[2] / 2, VB_CIRC[1] + VB_CIRC[3] / 2];
  const VB_CIRC_R = [CIRC_C[0] - VB_CIRC[3] / 2, CIRC_C[1] - VB_CIRC[2] / 2, VB_CIRC[3], VB_CIRC[2]];
  // Degrees the world is turned by right now (blended in with the view morph).
  const rotDeg = () => -90 * rotEase(rotU) * Math.max(0, lastMorph);
  let lz = null;   // the lobule view's layer
  let geometryVersion = 0;
  let netBox = null, netBoxFor = -1;
  // Everything drawn in screen space (labels, leaders, organ names, the flow marks, the action
  // card) follows the artwork on the very next frame of a pan or zoom, not on the next model
  // update: a view change schedules one coalesced sync per animation frame.
  let viewRaf = 0, viewVersion = 0, CTM = null, wrapRect = null;
  // Zoomed far in, the vessels fill the screen and the vessel shader runs on most of its pixels: the picture is
  // drawn at a lower resolution there (in steps, so the canvas is not resized on every wheel notch).
  let drawOnce = false;   // draw the vessels once through the dive's freeze: the camera moved while hidden
  let zoomRes = 1, dynRes = 1, resizeReady = false, forceDraw = false;   // forceDraw: the vessel canvas was just resized (and so cleared): the next frame draws it at once
  const applyVT = () => {
    const zr = vt.k > 4 ? 0.65 : vt.k > 2.5 ? 0.8 : 1;
    if (zr !== zoomRes) { zoomRes = zr; if (resizeReady) resizeCanvas(); }
    const deg = rotDeg();
    world.setAttribute('transform', `translate(${vt.x} ${vt.y}) scale(${vt.k})${deg ? ` rotate(${deg.toFixed(3)} ${CIRC_C[0]} ${CIRC_C[1]})` : ''}`);
    worldOver?.setAttribute('transform', world.getAttribute('transform'));
    syncSemantic();
    CTM = null; viewVersion++;
    if (!viewRaf) viewRaf = requestAnimationFrame(syncView);
  };
  function syncView() {
    viewRaf = 0;
    if (!F || lz?.isOpen()) return;
    refreshCTM();
    updateLabels(F);
    if (cath.st) cathLabels();
    onViewChange?.();
  }
  applyVT();
  // The figure's screen transform, computed from the viewBox, the zoom state and the stage box.
  // Asking the browser (getScreenCTM / getBoundingClientRect) right after the SVG has been
  // updated forces a synchronous style + layout pass over thousands of elements, every frame;
  // the arithmetic is exact and free. The stage box is cached and kept current by observers.
  let box = null;
  const measureBox = () => {
    // Measured without the lobule dive's zoom (a CSS scale on the svg), or the vessels would be drawn zoomed twice.
    const tf = svg.style.transform; if (tf) svg.style.transform = '';
    const r = wrap.getBoundingClientRect(), q = svg.getBoundingClientRect();
    if (tf) svg.style.transform = tf; box = { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom, sx: q.left - r.left, sy: q.top - r.top, sw: q.width, sh: q.height }; };
  const stageBox = () => { if (!box) measureBox(); return box; };
  new ResizeObserver(() => { box = null; CTM = null; }).observe(wrap);
  addEventListener('resize', () => { box = null; CTM = null; });
  addEventListener('scroll', () => { box = null; CTM = null; }, true);
  function refreshCTM() {
    const b = stageBox(), vb = svg.viewBox.baseVal;
    const s = Math.min(b.sw / vb.width, b.sh / vb.height);
    const ox = b.left + b.sx + (b.sw - vb.width * s) / 2 - vb.x * s, oy = b.top + b.sy + (b.sh - vb.height * s) / 2 - vb.y * s;
    // world → view box: translate(vt) · scale(k) · rotate(θ about the circuit's centre); then the view box → screen.
    const th = (rotDeg() * Math.PI) / 180, co = Math.cos(th), si = Math.sin(th), sk = s * vt.k;
    CTM = { a: sk * co, b: sk * si, c: -sk * si, d: sk * co, e: ox + s * vt.x + sk * (CIRC_C[0] - co * CIRC_C[0] + si * CIRC_C[1]), f: oy + s * vt.y + sk * (CIRC_C[1] - si * CIRC_C[0] - co * CIRC_C[1]), sc: sk };
    wrapRect = b;
  }
  function worldToLocal(x, y) {
    if (!CTM) refreshCTM();
    return [CTM.a * x + CTM.c * y + CTM.e - wrapRect.left, CTM.b * x + CTM.d * y + CTM.f - wrapRect.top];
  }
  function clientToWorld(cx, cy) {
    const m = world.getScreenCTM().inverse();
    return [m.a * cx + m.c * cy + m.e, m.b * cx + m.d * cy + m.f];
  }
  function clientToVB(cx, cy) {
    const m = svg.getScreenCTM().inverse();
    return [m.a * cx + m.c * cy + m.e, m.b * cx + m.d * cy + m.f];
  }
  function freeCentre() { const ins = safeInsets(), b = stageBox(); return [b.left + (ins.l + ins.W - ins.r) / 2, b.top + (ins.t + ins.H - ins.b) / 2]; }
  // A zoom step by the buttons glides there instead of jumping.
  function animZoomAt(cx, cy, factor) {
    if (lobuleOn) return;
    if (scrubS > 0 || canScrub(factor)) { scrubGlide(factor); return; }
    const [vx, vy] = clientToVB(cx, cy), base = vtTarget && vtAnim ? vtTarget : vt;
    const k = clamp(base.k * factor, 0.6, 6), wx = (vx - vt.x) / vt.k, wy = (vy - vt.y) / vt.k;
    animateVT({ k, x: vx - wx * k, y: vy - wy * k }, 260);
  }
  // A trackpad pinch may stretch a little past the limits (it springs back when it ends).
  function zoomAt(cx, cy, factor, stretch = false) {
    if (lobuleOn) return;   // the lobule view has its own zoom
    if (scrubBy(factor)) return;
    const [vx, vy] = clientToVB(cx, cy);
    const wx = (vx - vt.x) / vt.k, wy = (vy - vt.y) / vt.k;
    vt.k = stretch ? clamp(vt.k * factor, 0.5, 7.2) : clamp(vt.k * factor, 0.6, 6);
    vt.x = vx - wx * vt.k; vt.y = vy - wy * vt.k;
    applyVT(); CTM = null;
  }
  // Default framing. The circuit is a wide map (≈ 1.9 : 1); in a squarish or tall viewport,
  // fitting its width would shrink every station to a dot, so it opens zoomed to fill the height,
  // centered on the portal vein and liver, and the learner pans sideways to the beds or heart.
  // The esophagus and the great veins run on above the plate and fade out; Fit stops where they fade.
  const FIT_TOP = -40;
  // The figure fills the window and the rest of the interface floats over it. Each floating piece
  // says which edge it holds (data-safe="top|bottom|left|right"); the default framing keeps the
  // figure in the space they leave. Side cards count only on a wide screen (on a phone they are
  // sheets over the figure), and the figure never shrinks to a sliver for them.
  function safeInsets() {
    const wr = wrap.getBoundingClientRect(), W = wr.width, H = wr.height;
    const ins = { t: 0, b: 0, l: 0, r: 0, W, H }, cards = [];
    if (!W || !H) return ins;
    for (const el of document.querySelectorAll('[data-safe]')) {
      if (el.hidden || el.closest('[hidden]')) continue;
      if (el.checkVisibility ? !el.checkVisibility({ visibilityProperty: true }) : getComputedStyle(el).visibility === 'hidden') continue;
      const q = el.getBoundingClientRect();
      if (!q.width || !q.height) continue;
      // The vitals dock folded to one line on a phone (main.js) still counts at its full height, so the
      // framing does not jump each time it folds and opens.
      const y0 = (el.classList.contains('mini') && +el.dataset.fullH ? q.bottom - +el.dataset.fullH : q.top) - wr.top;
      const x0 = q.left - wr.left, x1 = q.right - wr.left, y1 = q.bottom - wr.top;
      if (x1 <= 0 || y1 <= 0 || x0 >= W || y0 >= H) continue;
      let edge = el.dataset.safe;
      if (edge === 'right' && W < 768) edge = 'bottom';   // a phone's cards are sheets over the bottom
      else if (edge === 'bottom' && el.classList.contains('side')) edge = 'right';   // the instruments docked at the side
      if (edge === 'top') ins.t = Math.max(ins.t, y1);
      else if (edge === 'bottom') ins.b = Math.max(ins.b, H - y0);
      else if (W >= 768 && edge === 'right') { ins.r = Math.max(ins.r, W - x0); cards.push([y0, y1]); }
      else if (W >= 768 && edge === 'left') ins.l = Math.max(ins.l, x1);
    }
    // Where the side cards would leave under 60% of the width (a tablet held upright), a short card is cleared
    // above (or below) instead, so the figure keeps the full width rather than shrinking into a strip.
    if (ins.r && W - ins.l - ins.r < W * 0.6) {
      const top = Math.min(...cards.map((c) => c[0])), bot = Math.max(...cards.map((c) => c[1]));
      if (top > H * 0.45) { ins.b = Math.max(ins.b, H - top + 8); ins.r = 0; }
      else if (bot <= H * 0.62) { ins.t = Math.max(ins.t, bot + 8); ins.r = 0; }
    }
    if (W - ins.l - ins.r < Math.min(W * 0.5, 360)) ins.l = ins.r = 0;
    if (H - ins.t - ins.b < H * 0.35) { const k = (H * 0.65) / (ins.t + ins.b); ins.t *= k; ins.b *= k; }
    return ins;
  }
  // A framing computed for the whole stage, moved and scaled into the free space.
  function insetVT(v, vbArr) {
    const ins = safeInsets(), { W, H } = ins;
    if (!W || !H) return v;
    const [vx, vy, vw, vh] = vbArr, s0 = Math.min(W / vw, H / vh);
    const f = Math.min((W - ins.l - ins.r) / W, (H - ins.t - ins.b) / H);
    const cx = vx + vw / 2, cy = vy + vh / 2, ox = (ins.l - ins.r) / 2 / s0, oy = (ins.t - ins.b) / 2 / s0;
    return { k: v.k * f, x: cx + ox + f * (v.x - cx), y: cy + oy + f * (v.y - cy) };
  }
  const circVB = () => (rotTarget ? VB_CIRC_R : VB_CIRC);
  function defaultVT(circuit) {
    if (!circuit) {
      // Fit frames everything the plate draws: the heart and the veins above it, the organs, the
      // flanks, and with ascites the fluid pooled in the pelvic floor below the default frame. The
      // box is measured, so it follows an enlarged spleen or a growing ascites.
      // (The layout size: the svg's drawn rectangle is scaled while the lobule zoom plays, and a fit read from it lands somewhere else.)
      const r = { width: svg.clientWidth, height: svg.clientHeight };
      if (!r.width || !r.height) return { k: 1, x: 0, y: 0 };
      let x0 = VB_ANAT[0], y0 = VB_ANAT[1], x1 = VB_ANAT[0] + VB_ANAT[2], y1 = VB_ANAT[1] + VB_ANAT[3];
      // Only what holds still is measured: the abdomen, the organs and the ascites. The vessels morph (to and from
      // the circuit, and as the first frames lay them out), and measuring them made the framing land in one place
      // and then glide to another a second later.
      for (const g of [gBackdrop, gOrgans, gAscites]) {
        let b; try { b = g.getBBox(); } catch { continue; }
        if (!b.width || !b.height) continue;
        x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
      }
      y0 = Math.max(y0, FIT_TOP) - 8; y1 += 8;
      // The svg shows its viewBox scaled to fit (meet), and the spare room on the other axis is
      // visible too: fit the box into that whole visible area, less what the floating pieces cover.
      const ins = safeInsets();
      const s0 = Math.min(r.width / VB_ANAT[2], r.height / VB_ANAT[3]);
      const fw = Math.max(40, r.width - ins.l - ins.r), fh = Math.max(40, r.height - ins.t - ins.b);
      const k = Math.min(1.15, fw / s0 / (x1 - x0), fh / s0 / (y1 - y0));
      const cx = VB_ANAT[0] + VB_ANAT[2] / 2 + (ins.l - ins.r) / 2 / s0, cy = VB_ANAT[1] + VB_ANAT[3] / 2 + (ins.t - ins.b) / 2 / s0;
      return { k, x: cx - k * ((x0 + x1) / 2), y: cy - k * ((y0 + y1) / 2) };
    }
    // Turned upright, the map is tall and fills the height of the stage as it is.
    if (rotTarget) return insetVT({ k: 1, x: 0, y: 0 }, circVB());
    const ins = safeInsets();
    const W = ins.W - ins.l - ins.r, H = ins.H - ins.t - ins.b;
    const s0 = Math.min(W / VB_CIRC[2], H / VB_CIRC[3]);
    // (With a card at the side the whole map is shown: the close-up is for a narrow screen with nothing over it.)
    if (ins.l || ins.r || VB_CIRC[3] * s0 > 0.62 * H) return insetVT({ k: 1, x: 0, y: 0 }, VB_CIRC);
    const k = clamp((0.94 * H) / (VB_CIRC[3] * s0), 1, 3);
    const cx = VB_CIRC[0] + VB_CIRC[2] / 2, cy = VB_CIRC[1] + VB_CIRC[3] / 2;
    const fx = 640, fy = cy;
    return insetVT({ k, x: cx - k * fx, y: cy - k * fy }, VB_CIRC);
  }
  // Fit shows the whole figure. On a narrow screen the circuit opens as a close-up of the portal vein
  // and liver (see defaultVT), which is not a fit: there Fit shows the entire map, and tapping it
  // again returns to the close-up, so the button always does something visible.
  const fit = () => {
    // In the lobule view, Fit shows the whole lobule again (it never leaves the view).
    if (lobuleOn) { lz.fitView(); return; }
    const circuit = morphTarget === 1, focus = defaultVT(circuit), whole = circuit ? insetVT({ k: 1, x: 0, y: 0 }, circVB()) : { k: 1, x: 0, y: 0 };
    const near = (a, b) => Math.abs(a.k - b.k) < 0.02 && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
    // Judged from where a glide in progress is going, so a second tap toggles as expected.
    const at = vtGliding ? vtTarget : vt;
    const to = circuit && !near(focus, whole) ? (near(at, whole) ? focus : whole) : focus;
    if (!circuit) homeAt = to;
    // It glides there, as the zoom buttons do (reduced motion: at once).
    animateVT(to, 420);
  };

  // A card or sheet opened or closed: glide to the framing for the space that is now free (not in the lobule, which refits itself).
  function refit() {
    if (lobuleOn) return;
    const to = defaultVT(morphTarget === 1);
    if (morphTarget !== 1) homeAt = to;
    if (!sameView(to, vtGliding ? vtTarget : vt)) animateVT(to, 420);
  }

  // Turn the circuit upright (flow bottom to top) or back to wide. Shown whole, it stays whole (fitted
  // to the new shape); zoomed in, it keeps the zoom and turns about the point at the middle of the
  // free space, which stays where it is on screen.
  let rotHold = null;
  function holdView(hd) {
    const b = stageBox(), vb = svg.viewBox.baseVal, s0 = Math.min(b.sw / vb.width, b.sh / vb.height);
    const ox = b.left + b.sx + (b.sw - vb.width * s0) / 2 - vb.x * s0, oy = b.top + b.sy + (b.sh - vb.height * s0) / 2 - vb.y * s0;
    const k = hd.sc / s0, th = (rotDeg() * Math.PI) / 180, co = Math.cos(th), si = Math.sin(th);
    const dx = hd.w[0] - CIRC_C[0], dy = hd.w[1] - CIRC_C[1];
    const rx = CIRC_C[0] + co * dx - si * dy, ry = CIRC_C[1] + si * dx + co * dy;
    vt = { k, x: (hd.sx - ox) / s0 - k * rx, y: (hd.sy - oy) / s0 - k * ry };
    applyVT(); CTM = null;
  }
  function setCircuitRotated(on) {
    on = on ? 1 : 0;
    try { localStorage.setItem('pps.circuitRot', String(on)); } catch { /* storage unavailable */ }
    if (on === rotTarget) return;
    // Mid-glide (Fit, a zoom button), the turn starts from where the glide was going.
    if (vtGliding) { cancelAnimationFrame(vtAnim); vtGliding = false; vt = { ...vtTarget }; applyVT(); CTM = null; }
    const whole = morphTarget !== 1 || vt.k <= 1.001 || sameView(vt, insetVT({ k: 1, x: 0, y: 0 }, circVB()));
    rotHold = null;
    if (!whole) {
      const ins = safeInsets(), b = stageBox();
      const sx = b.left + (ins.l + ins.W - ins.r) / 2, sy = b.top + (ins.t + ins.H - ins.b) / 2;
      refreshCTM();
      rotHold = { w: clientToWorld(sx, sy), sx, sy, sc: CTM.sc };
    }
    rotTarget = on;
    cancelAnimationFrame(vtAnim);
    if (whole) vt = morphTarget === 1 ? insetVT({ k: 1, x: 0, y: 0 }, circVB()) : { k: 1, x: 0, y: 0 };
    if (morphTarget !== 1 || reduceMotion.matches) { rotU = on; setViewBox(easeInOut(morph)); if (rotHold) { holdView(rotHold); rotHold = null; } }
  }

  // A bottom sheet (the action card on a phone) covers the lower part of the figure. reveal() pans the figure,
  // no more than needed, so the selected structure stays in the part that is left; unreveal() puts the view back
  // when the sheet closes, unless the learner has moved the figure since.
  let revealFrom = null, revealTo = null;
  const sameView = (a, b) => a && b && Math.abs(a.k - b.k) < 0.001 && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
  function reveal(sel, insetBottom) {
    if (!sel || lobuleOn || lz?.isOpen()) return;
    const a = anchorFor(sel);
    if (!a) return;
    const ins = safeInsets();
    const W = wrap.clientWidth, H = wrap.clientHeight, top = Math.max(44, ins.t + 12), bottom = H - Math.max(insetBottom, ins.b) - 18, side = 18;
    if (bottom - top < 80) return;
    const inside = a.y >= top && a.y <= bottom && a.x >= side && a.x <= W - side;
    if (inside) return;
    const s = vbScale();
    const dx = a.x < side || a.x > W - side ? W / 2 - a.x : 0;
    const dy = a.y < top || a.y > bottom ? (top + bottom) / 2 - a.y : 0;
    if (revealTo && !sameView(vt, revealTo)) revealFrom = null;   // the learner moved the figure: keep it where it is
    if (!revealFrom) revealFrom = { ...vt };
    revealTo = { k: vt.k, x: vt.x + dx / s, y: vt.y + dy / s };
    animateVT(revealTo, 320);
  }
  function unreveal() {
    if (revealFrom && sameView(vt, revealTo)) animateVT(revealFrom, 320);
    revealFrom = revealTo = null;
  }

  // ── Semantic zoom: abdomen → liver → lobule ───────
  // Zooming (wheel, pinch, buttons) only moves the camera: past ×1.9 over the liver its inner
  // trees open (see liverExpanded) and a trail in the corner names the level. The lobule is
  // never entered by zooming alone; it opens only when asked for (the trail's Lobule step, the
  // liver's card, the palette, a presenter step) and cross-fades over the plate.
  let liverBB = null;
  let lobuleOn = false, lobU = 0, lobAnim = 0;
  // Into the lobule, a dive (1.6 s): one continuous zoom from a spot in the liver, gentle at both ends.
  // The anatomy is magnified as it stands (a compositor transform: nothing is redrawn); a field of
  // lobules, many and small, blooms out from that spot over it; the zoom goes on through them and
  // settles onto one, where the lobule's tissue fades in, in place, and then its labels and card.
  // Out, the same in reverse, quicker.
  // The anatomy's own framing is never touched. diveT is the dive's clock, 0 (anatomy) to 1 (lobule).
  let diveAt = null, diveLand = null, diveT = 0, diveOut = false;
  const DIVE_MS = 1600, RISE_MS = 1000;
  const RH = 11;   // a lobule's size on screen (px) as the liver's surface gives way to the field
  const LC = Math.log(5);   // the anatomy's share of the zoom (×5), the field's the rest
  const diveEls = () => [svg, wrap.querySelector('#stageOver'), wrap.querySelector('#labels'), vCanvas].filter(Boolean);
  function diveTarget() {
    const lb = liverBox();
    if (!lb) return null;
    return [lb.x + lb.w * 0.42, lb.y + lb.h * 0.5];
  }
  const smoothT = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // The elements' offsets are read once per dive, before any write: read between writes, each would
  // make the browser lay the page out again, every frame.
  let diveOrig = null;
  function setDiveScale(k) {
    if (k <= 1.0001) {
      // The transform goes first and the layer hint a frame later: dropping both at once can leave the
      // browser showing the last zoomed picture while clicks already land on the unzoomed figure.
      if (diveOrig) { const els = diveOrig.map(([el]) => el); for (const el of els) { el.style.transform = 'none'; el.style.transformOrigin = ''; } requestAnimationFrame(() => { if (!diveOrig) for (const el of els) { el.style.willChange = ''; el.style.transform = ''; } }); }
      // The stage's measured box (and so the drawing transform) may have been taken while the dive's zoom
      // was on, which would keep the canvas drawn zoomed in after it ends: measure again.
      if (diveOrig) { box = null; CTM = null; }
      diveOrig = null; return;
    }
    if (!diveOrig) {
      const [ox, oy] = diveAt;
      // From the boxes, not offsetLeft/Top: an SVG has none, and its origin would fall back to its own
      // centre, so the overlays (stents, the Doppler's glow) drifted from the anatomy as it zoomed.
      const w0 = wrap.getBoundingClientRect();
      diveOrig = diveEls().map((el) => { const r = el.getBoundingClientRect(); return [el, `${(ox - (r.left - w0.left)).toFixed(1)}px ${(oy - (r.top - w0.top)).toFixed(1)}px`]; });
      for (const [el, o] of diveOrig) { el.style.willChange = 'transform'; el.style.transformOrigin = o; }
    }
    const tf = `scale(${k.toFixed(4)})`;
    for (const [el] of diveOrig) el.style.transform = tf;
  }
  function diveFrame(t) {
    if (diveAt && diveLand) {
      // The whole zoom in one log scale. The lobule's place is read live, so the field settles exactly
      // where the view frames it.
      if (lz.isShown()) diveLand = lz.current();
      else if (lobuleOn) lz.warm();
      const lt = LC + Math.log(Math.max(RH * 2, diveLand.r) / RH);
      // Eased in and out (smootherstep); the anatomy's part takes the first two fifths of the way.
      const u = clamp(t / 0.84, 0, 1), p = u * u * u * (u * (u * 6 - 15) + 10), P = 0.4;
      const z = p < P ? LC * p / P : LC + (lt - LC) * (p - P) / (1 - P);
      setDiveScale(t >= 1 ? 1 : Math.exp(Math.min(z, LC + 0.4)));
      // The anatomy's labels leave as the zoom starts.
      const lab = wrap.querySelector('#labels');
      // (Going out they come back over the last half of the zoom, in place, rather than at the very end.)
      if (lab) lab.style.opacity = t <= 0 ? '' : (1 - smoothT(0, diveOut ? 0.55 : 0.12, t)).toFixed(3);
      // The detailed lobule comes in while the zoom is still settling, zooming with the field.
      const r = RH * Math.exp(z - LC);
      const [ox, oy] = diveAt;
      const g = smoothT(LC - 0.5, lt, z);   // the zoom's centre drifts from the dive point to the lobule's place
      const px = lerp(ox, diveLand.x, g), py = lerp(oy, diveLand.y, g);
      // The detailed lobule rides on the field's own lobule at that centre, so it grows out of it.
      lz.setDiveZoom(t >= 1 ? 1 : clamp(r / diveLand.r, 0.05, 1), diveLand.x, diveLand.y, px, py);
      lz.setDive(t <= 0 || t >= 1 ? null : {
        a: smoothT(LC * 0.45, LC + 0.3, z), x: px, y: py,
        r, ox, oy, quiet: smoothT(0.45, 0.8, t),
      });
    }
    lobU = easeInOut(clamp((t - 0.48) / 0.4, 0, 1));
    syncSemantic();
  }
  function setLobule(on) {
    if (on && morphTarget !== 0) return;
    scrubS = 0; cancelAnimationFrame(scrubAnim); diveOut = !on;
    if (lobuleOn === on && diveT === (on ? 1 : 0)) return;
    lobuleOn = on;
    cancelAnimationFrame(lobAnim);
    if (on && diveT === 0) {
      const w = diveTarget();
      if (w) {
        refreshCTM();
        const [x, y] = worldToLocal(w[0], w[1]);
        diveAt = [clamp(x, 0, wrap.clientWidth), clamp(y, 0, wrap.clientHeight)];
      } else diveAt = [wrap.clientWidth / 2, wrap.clientHeight / 2];
      diveLand = lz.landing();
      lz.prewarm(diveLand.r);
    } else if (!on && diveT >= 1) {
      diveLand = lz.current();
      // The anatomy is covered by the lobule at this point: take it to its fit framing now, unseen, so the way out is one
      // continuous zoom from the lobule's fit to the anatomy's fit, with no correction after it lands.
      if (morphTarget === 0 && liverBox()) {
        cancelAnimationFrame(vtAnim); vtGliding = false;
        const d = defaultVT(false); vt = { ...d }; homeAt = d; applyVT(); CTM = null; refreshCTM();
        // The plate stopped updating under the lobule, so it still holds the old zoom's culling and detail: bring it up to date for the fit now, not when the zoom lands.
        if (F && !inUpdate) { catchUp = true; try { update(F); } finally { catchUp = false; } }
        const w = diveTarget(); if (w) { const [x, y] = worldToLocal(w[0], w[1]); diveAt = [clamp(x, 0, wrap.clientWidth), clamp(y, 0, wrap.clientHeight)]; }
        diveOrig = null; drawOnce = forceDraw = true;   // the vessel canvas is frozen for the zoom: redraw it now at the fit, not the old camera
        if (F) updateLabels(F);   // the labels are laid out for the final framing now, so they come in where they will stay
      }
    }
    const ms = reduceMotion.matches ? 0 : on ? DIVE_MS : RISE_MS, from = diveT, to = on ? 1 : 0, t0 = performance.now();
    const step = (now) => {
      const e = ms ? clamp((now - t0) / (ms * Math.abs(to - from) || 1), 0, 1) : 1;
      diveT = from + (to - from) * e;
      // A frame that throws must not leave the anatomy stuck mid-zoom: the glide always goes on to its end.
      try { diveFrame(diveT); } catch (err) { if (e < 1) console.error(err); }
      if (e < 1) lobAnim = requestAnimationFrame(step);
      else if (!on) {
        setDiveScale(1); lz.setDiveZoom(1, 0, 0); diveLand = null;
        // Out of the lobule the anatomy always ends on its full fit, not where the dive began (often the liver close-up).
        // (Already taken to its fit when the way out began; measuring it again here read the floating pieces mid-change and sent the view down, then back.)
        if (morphTarget === 0) { if (liverBox() && sameView(vt, homeAt || vt)) homeAt = { ...vt }; else { const d = defaultVT(false); homeAt = d; if (!sameView(vt, d)) animateVT(d, 450); } }
      }
    };
    step(t0);
    // Backstop: if the frames stop (a throttled or dropped frame loop), land on the end state anyway.
    clearTimeout(lobEnd);
    lobEnd = setTimeout(() => { if (lobuleOn === on && diveT !== to) { cancelAnimationFrame(lobAnim); step(t0 + ms * 2 + 1); } }, ms * Math.abs(to - from) + 250);
  }
  let lobEnd = 0;
  function liverBox() {
    if (!liverBB && organEls.liver) { try { const b = organEls.liver.getBBox(); if (b.width) liverBB = { x: b.x, y: b.y, w: b.width, h: b.height }; } catch { /* not rendered yet */ } }
    return liverBB;
  }
  function vbCenter() { const b = svg.viewBox.baseVal; return [b.x + b.width / 2, b.y + b.height / 2]; }
  function syncSemantic() {
    if (!lz) return;
    // Turning to the circuit closes the lobule view.
    if ((lobuleOn || scrubS > 0) && morphTarget !== 0) { scrubS = 0; lobuleOn = false; lobU = 0; diveT = 0; diveLand = null; lz.setDive(null); lz.setDiveZoom(1, 0, 0); if (diveAt) setDiveScale(1); { const lab = wrap.querySelector('#labels'); if (lab) lab.style.opacity = ''; } cancelAnimationFrame(lobAnim); if (store.get().lobule) store.set({ lobule: false }); }
    const u = morphTarget === 0 ? lobU : 0;
    const wasOpen = lz.isOpen();
    lz.setFade(u);
    if (wasOpen && !lz.isOpen() && F && !inUpdate) update(F);
    wrap.classList.toggle('in-lobule', u > 0.98);
  }
  let vtAnim = 0, vtGliding = false;
  let vtTarget = null;   // where the last animated move was headed
  function animateVT(to, ms = 700) {
    cancelAnimationFrame(vtAnim);
    vtTarget = to;
    const from = { ...vt }, t0 = performance.now();
    if (reduceMotion.matches) { vtGliding = false; vt = to; applyVT(); CTM = null; return; }
    vtGliding = true;
    const step = (now) => {
      const u = easeInOut(clamp((now - t0) / ms, 0, 1));
      vt = lerpVT(from, to, u);
      applyVT(); CTM = null;
      // With the catheter in, the vessels, the catheter and its labels follow the camera in this very frame.
      if (cath.st) { refreshCTM(); cathLabels(); if (drawVeins()) drawnView = viewVersion; }
      if (u < 1) vtAnim = requestAnimationFrame(step); else vtGliding = false;
    };
    vtAnim = requestAnimationFrame(step);
  }
  // Interpolate the zoom geometrically so the approach feels even at every scale.
  function lerpVT(from, to, u) {
    const k = from.k * Math.pow(to.k / from.k, u), a = to.k === from.k ? u : (k - from.k) / (to.k - from.k);
    return { k, x: from.x + (to.x - from.x) * a, y: from.y + (to.y - from.y) * a };
  }
  function zoomToBox(x0, y0, x1, y1) {
    const k = clamp(Math.min(VIEW.w / (x1 - x0), VIEW.h / (y1 - y0)) * 0.9, 1, 5);
    animateVT({ k, x: VIEW.w / 2 - ((x0 + x1) / 2) * k, y: VIEW.h / 2 - ((y0 + y1) / 2) * k }, 400);
  }
  function vtFor(wx, wy, k) { const [cx, cy] = vbCenter(); return { k, x: cx - wx * k, y: cy - wy * k }; }
  function zoomLiver() {
    if (store.get().lobule) store.set({ lobule: false });
    const lb = liverBox(); if (!lb) return;
    const b = svg.viewBox.baseVal;
    animateVT(vtFor(lb.x + lb.w / 2, lb.y + lb.h / 2, clamp(Math.min(b.width / lb.w, b.height / lb.h) * 0.92, 2, 3)));
  }
  // The lobule is a view of its own (Anatomy · Circuit · Lobule): it opens over the figure and closes
  // only from the view switch, never by zooming out. The anatomy underneath keeps its framing.
  function openLobule(tries = 0) {
    if (morphTarget !== 0) store.set({ view: 'anatomic' });
    // Right after loading the liver may not be laid out yet: try again shortly.
    // From the circuit, ease into the anatomy first, then dive.
    if (!liverBox() || morphTarget !== 0 || morph > 0.02) { if (tries < 40) setTimeout(() => { if (store.get().lobule) openLobule(tries + 1); }, 120); return; }
    // The anatomy's card (the liver's, usually) would sit over the lobule: the lobule's parts have their own.
    if (store.get().selection && store.get().selection.type !== 'lobule') store.set({ selection: null });
    setLobule(true);
  }
  function closeLobule() { setLobule(false); }
  // Zoom-driven dive: normal zoom carries on into the liver; past SCRUB_K over the liver the camera and pan
  // lock and each further zoom step scrubs the dive (scrubS 0..1, the same frames the timed dive plays).
  // Zooming back out reverses it, down to the liver again. Taps and the Lobule step still play it timed.
  const SCRUB_ON = false;   // the lobule opens and closes only from the view buttons: manual zoom never dives into it
  const SCRUB_K = 5.8,   // the anatomy zoom is free up to its 6× maximum; the pan locks and the dive begins only at it
     SCRUB_SPAN = Math.log(7), SCRUB_DONE = 0.88;   // the dive has fully landed by 0.88, so the view switches there
  let scrubS = 0, quietLobule = false, scrubAnim = 0;
  function canScrub(factor) {
    if (!SCRUB_ON) return false;
    if (lobuleOn || factor <= 1 || morphTarget !== 0 || morph > 0.02 || vt.k < SCRUB_K || reduceMotion.matches) return false;
    const w = diveTarget(); if (!w) return false;
    refreshCTM();
    const [x, y] = worldToLocal(w[0], w[1]);
    return x > 0 && y > 0 && x < wrap.clientWidth && y < wrap.clientHeight;   // the liver is in view
  }
  function startScrub() {
    const w = diveTarget();
    refreshCTM();
    const [x, y] = w ? worldToLocal(w[0], w[1]) : [wrap.clientWidth / 2, wrap.clientHeight / 2];
    diveAt = [clamp(x, 0, wrap.clientWidth), clamp(y, 0, wrap.clientHeight)];
    diveLand = lz.landing();
    lz.prewarm(diveLand.r);
    cancelAnimationFrame(vtAnim); vtGliding = false;
    if (store.get().selection && store.get().selection.type !== 'lobule') store.set({ selection: null });
  }
  function scrubBy(factor) {
    if (factor === 1 || morphTarget !== 0) return false;
    if (scrubS === 0 && !lobuleOn && !canScrub(factor)) return false;
    if (scrubS === 0 && !lobuleOn) startScrub();
    diveOut = factor < 1;
    scrubS = clamp(scrubS + Math.log(factor) / SCRUB_SPAN, 0, 1);
    diveT = scrubS;
    if (scrubS >= SCRUB_DONE) {
      scrubS = 0; diveT = 1; lobuleOn = true;
      diveFrame(1);
      quietLobule = true; store.set({ lobule: true }); quietLobule = false;
      return true;
    }
    if (scrubS === 0) { diveFrame(0); setDiveScale(1); lz.setDiveZoom(1, 0, 0); diveLand = null; return factor < 1 ? true : false; }
    lz.warm();
    diveFrame(diveT);
    return true;
  }
  // A button step: the same scrub, spread over a short glide.
  function scrubGlide(factor) {
    cancelAnimationFrame(scrubAnim);
    const t0 = performance.now(), ms = 320; let done = 0;
    const step = (now) => {
      const u = easeInOut(clamp((now - t0) / ms, 0, 1));
      const f = Math.pow(factor, u - done); done = u;
      scrubBy(f);
      if (u < 1 && (scrubS > 0 || canScrub(f))) scrubAnim = requestAnimationFrame(step);
    };
    scrubAnim = requestAnimationFrame(step);
  }
  store.on('lobule', (on) => { if (!quietLobule) (on ? openLobule() : closeLobule()); });
  const zoomLobule = () => store.set({ lobule: true });
  lz = createLobuleZoom({ host: wrap });
  // Out of the lobule view by zooming out: the view hands the dive back to the scrub, which carries on reversing it.

  // ── Detail ────────────────────────────────────────
  // Adaptive detail: when the device cannot keep up (frames arriving slower than ~22 a second
  // while the model runs), the moving blood steps down (fewer frames, fewer pixels) and steps
  // back up once there is headroom. The level a device settles on is remembered.
  // The last step is only for a software renderer (WebGL drawn on the CPU), where it starts: there
  // every frame costs CPU the rest of the page needs.
  const QUALITY = [{ fps: 30, res: 1 }, { fps: 24, res: 0.8 }, { fps: 15, res: 0.6 }, { fps: 8, res: 0.5 }];
  const SOFTWARE = !!veins?.software;
  const Q_MAX = SOFTWARE ? 3 : 2;
  let quality = SOFTWARE ? 3 : (() => { try { return clamp(parseInt(localStorage.getItem('pps.quality'), 10) || 0, 0, 2); } catch { return 0; } })();
  vCanvas.addEventListener('webglcontextrestored', () => {
    veins = createVeinsGL(vCanvas, { tubes: GL_ROWS, force: true });
    vBinKey = ''; glOrgans = false; plateKey = '';
    for (const x of Object.values(E)) for (const o of [x, ...(x.strands || []), ...(x.feeders || [])]) o.glRadKey = null;
    if (F) update(F);
  });
  wrap.dataset.quality = String(quality);
  let vdpr = 1;
  function resizeCanvas() {
    const r = wrap.getBoundingClientRect();
    vdpr = Math.min(2, devicePixelRatio || 1) * QUALITY[quality].res * zoomRes * dynRes;
    vCanvas.width = Math.max(1, Math.round(r.width * vdpr)); vCanvas.height = Math.max(1, Math.round(r.height * vdpr));
    wrap.classList.toggle('compact', r.height < 600);
    CTM = null; forceDraw = true;
  }
  new ResizeObserver(resizeCanvas).observe(wrap);
  resizeCanvas(); resizeReady = true;

  // ── Frame state ───────────────────────────────────
  let F = null;            // latest frame
  let hoverId = null;
  let hl = null;           // highlighted edge ids

  function edgeVisible(x, f) {
    const e = x.e, p = f.viewParams || store.get().params;
    if (ANAT_HIDDEN.has(e.id) && morph < 0.5) return false;
    if (NEEDS_C3.has(e.id)) return recruitFrac('C3', f) > 0.15;
    if (e.kind === 'collateral') {
      if (!edgePresent(e, p)) return false;
      return store.get().layers.collaterals || collOpen(e.id, f);
    }
    if (e.kind === 'shunt') {
      if (e.shunt === 'ap') return f.Q[EI[e.id]] > 0.3;
      return f.D[EI[e.id]] > 0;
    }
    return true;
  }
  // A collateral is drawn as open once it has grown noticeably or carries meaningful flow
  // (≥ 0.3 mL/s), so a channel the model is using is never hidden.
  function collOpen(id, f) {
    const k = EI[id];
    return shownFrac(id, f) > 0.12 || Math.abs(f.Qf ? f.Qf[k] : f.Q[k]) > 0.3;
  }
  // The channels that feed and drain the varices (coronary vein → esophageal varices → azygos; short gastric
  // veins → fundal varices) are drawn open whenever the varices exist (see varicesPresent), whatever their own
  // recruitment, so the figure and circuit show the same varices as the endoscopy pane.
  const VARIX_CHANNELS = { C1a: 'VAR', C1b: 'VAR', C2: 'GV' };
  function shownFrac(id, f) {
    const site = VARIX_CHANNELS[id];
    return site ? Math.max(recruitFrac(id, f), varixGrowth(f, site)) : recruitFrac(id, f);
  }
  function recruitFrac(id, f) {
    const e = EDGES[EI[id]];
    const dMin = dMinOf(e);
    return clamp(((f.slow.dEff?.[id] ?? f.slow.d[id]) - dMin) / (e.dMax - dMin), 0, 1);
  }

  // The view box morphs from the anatomy's to the circuit's, wide or (turned) tall.
  function setViewBox(t) {
    const rr = rotEase(rotU), vb = VB_ANAT.map((a, i) => lerp(a, lerp(VB_CIRC[i], VB_CIRC_R[i], rr), t));
    svg.setAttribute('viewBox', vb.map((v) => v.toFixed(1)).join(' '));
    svgOver?.setAttribute('viewBox', svg.getAttribute('viewBox'));
    applyVT();
  }

  function updateGeometry(force) {
    const t = easeInOut(morph);
    if (!force && t === lastMorph) return;
    geometryVersion++;
    lastMorph = t;
    for (const x of Object.values(E)) {
      const g = geo[x.e.id];
      let pts;
      if (t === 0) pts = g.A; else if (t === 1) pts = g.C; else pts = g.A.map((p, i) => [lerp(p[0], g.C[i][0], t), lerp(p[1], g.C[i][1], t)]);
      const base = pts;
      const u0 = STRAND_FROM[x.e.id] || 0;
      if (x.e.kind === 'collateral' && !x.e.spontaneous && t < 1) { const wz = wiggle(pts, g.wig * (1 - t), x.e.id.length); pts = u0 ? blendFrom(base, wz, u0) : wz; }
      // Strands fan out from the shared ends (or from where the trunk breaks up) and fold back
      // onto the lane in the circuit.
      if (x.strands) for (const sd of x.strands) {
        let sp = wiggle(braid(base, sd.off * (1 - t), u0), (0.8 * g.wig + 3) * (1 - t), sd.ph);
        if (u0) sp = blendFrom(pts, sp, u0);
        sd.u0 = u0;
        const d = polyD(sp);
        sd.wall.setAttribute('d', d); sd.lumen.setAttribute('d', d);
        if (!sd.hit) { sd.hit = s('path', { class: 'v-hit', 'data-id': x.e.id, 'aria-hidden': 'true' }); sd.hit.style.strokeWidth = 12; x.g.append(sd.hit); }   // each strand of a varix is part of its vessel
        sd.hit.setAttribute('d', d); sd.hit.style.display = (sd.live ?? 1) >= 0.5 && morph < 0.5 ? '' : 'none';
        sd.cur = sp; sd.len = arcLen(sp);
      }
      g.cur = pts;
      g.len = arcLen(pts);
      const d = t === 1 ? g.dC : polyD(pts);
      x.halo.setAttribute('d', d); x.sel.setAttribute('d', d); x.wall.setAttribute('d', d); x.hit.setAttribute('d', d);
      if (dop.id === x.e.id) dop.paint(d, x.dopW || 8);
      x.shadow.setAttribute('d', d);
      if (x.heat) x.heat.setAttribute('d', d);
      if (x.lumen) x.lumen.setAttribute('d', d);
      g.lit = litNormals(pts);
      x.shadeKey = '';
      const a = pts[0], b = pts[pts.length - 1];
      x.grad.setAttribute('x1', a[0]); x.grad.setAttribute('y1', a[1]);
      x.grad.setAttribute('x2', b[0] === a[0] && b[1] === a[1] ? a[0] + 1 : b[0]); x.grad.setAttribute('y2', b[1]);
      if (x.tipFade) {
        // From the tip (nothing) to `frac` of the way along (solid); in the circuit there is no fade.
        const q = pointAt(pts, x.tipFade.frac);
        x.tipFade.line = [a[0], a[1], q[0], q[1]];
        x.tipFade.tg.setAttribute('x1', a[0]); x.tipFade.tg.setAttribute('y1', a[1]);
        x.tipFade.tg.setAttribute('x2', q[0]); x.tipFade.tg.setAttribute('y2', q[1]);
        x.tipFade.s0.setAttribute('stop-opacity', (x.tipFade.joined ? 1 : t).toFixed(2));
      }
    }
    for (const n of NODES) {
      if (!nodeEls[n.id]) continue;
      const [x, y] = nodePos(n.id, t);
      nodeEls[n.id].c.setAttribute('cx', x); nodeEls[n.id].c.setAttribute('cy', y);
    }
    setViewBox(t);
    gOrgans.style.opacity = String(1 - t);
    gBackdrop.style.opacity = String(1 - t);
    gGhost.style.opacity = String(1 - t);
    gAscites.style.opacity = String(1 - t);
    svg.classList.toggle('circuit', t > 0.5);
    svgOver?.classList.toggle('circuit', t > 0.5);
    // The circuit is a dark hemodynamic map; the anatomy an atlas plate on paper.
    stageWrap.classList.toggle('cmap', t > 0.5);
    gGrid.style.opacity = String(t);
    gNodes.style.opacity = String(t);
    CTM = null;
  }
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  // ── Update from frame ─────────────────────────────
  let inUpdate = false;
  // The anatomy opens fitted to everything it draws, once the first frame has drawn it; a view the
  // learner has already zoomed or panned is left alone.
  // Every zoom out of the anatomy (the first frame, Fit, back from the circuit) goes to the same home
  // framing, measured from what is drawn. While the view is still at home it follows what is drawn:
  // when ascites fills the pelvis or the spleen grows, home grows with it and the view follows.
  let firstFit = false, homeAt = null, homeCheck = 0, userMoved = false;
  // A patient has arrived and none is on its way (opening one from Home, the first frames are still the last one's).
  const patientArrived = () => ((store.get().historyTick || 0) > 0 || !!store.get().booted) && !store.get().presetLoading;
  let patientReady = patientArrived();
  store.on('historyTick', () => { patientReady = patientArrived(); });
  store.on('presetLoading', () => { patientReady = patientArrived(); });
  store.on('booted', () => { patientReady = patientArrived(); firstFrame(); });
  wrap.classList.add('unframed');
  // The loading screen (index.html) waits for this: the figure framed, faded in and on screen.
  let figureShown = false;
  const showFigure = () => {
    wrap.classList.remove('unframed');
    if (figureShown) return;
    figureShown = true;
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => { window.ppsFigureReady = true; dispatchEvent(new Event('pps:figure-ready')); }, 260)));
  };
  setTimeout(showFigure, 4000);   // never left hidden
  function firstFrame() {
    if (firstFit || !F || !(morphTarget === 1 || patientReady)) return;
    firstFit = true;
    requestAnimationFrame(() => {
      if (morphTarget === 0 && !userMoved) { vt = homeAt = vtTarget = defaultVT(false); applyVT(); CTM = null; }
      showFigure();
    });
  }
  let catchUp = false;
  function update(f) {
    inUpdate = true;
    try { updateInner(f); } finally { inUpdate = false; }
    // The first framing waits for the patient (the first frames are drawn before it has loaded, without its
    // ascites or spleen), and the figure stays hidden until it is framed, so it appears once, in place.
    firstFrame();
    const now = performance.now();
    // (Not while a move away from home is under way: its first frames still sit at home.)
    if (homeAt && morphTarget === 0 && !lobuleOn && diveT === 0 && now - homeCheck > 500 && sameView(vt, homeAt) && (!vtTarget || sameView(vtTarget, homeAt))) {
      homeCheck = now;
      const d = defaultVT(false);
      if (!sameView(d, homeAt)) { homeAt = d; animateVT(d, 400); }
    }
  }
  function updateInner(f) {
    blockerBoxes = readBlockers();
    F = f;
    lz?.update(f);
    if (lz?.isOpen() && !catchUp) return;   // the plate is hidden under the lobule; it catches up on the way out
    const st = store.get();
    const p = f.viewParams || st.params;
    const t = easeInOut(morph);
    const gain = lerp(1, 0.8, t);
    const ref = REF();
    // The circuit shown small (a phone, the whole map): every lane grows by the same factor, so the
    // widest stays about 10 px on screen; capped so neighbouring lanes stay apart.
    if (!CTM) refreshCTM();
    const circBoost = clamp(10 / (15 * (CTM?.sc || 1)), 1, 1.75);
    const imaging = isImaging();
    const mode = layerMode();
    wrap.classList.toggle('imaging', imaging);
    // Data layers other than pressure quiet the anatomy so the network carries the reading.
    wrap.classList.toggle('data-layer', !['pressure', 'neutral'].includes(mode));
    wrap.dataset.layer = mode;

    // collateral tortuosity
    let geomDirty = false;
    for (const x of Object.values(E)) {
      if (x.e.kind !== 'collateral' || x.e.spontaneous || STRAIGHT_COLL.has(x.e.id)) continue;
      const w = shownFrac(x.e.id, f) > 0.25 ? 1.5 + 3.5 * shownFrac(x.e.id, f) : 0;
      if (Math.abs(w - geo[x.e.id].wig) > 0.6) { geo[x.e.id].wig = w; geomDirty = true; }
    }
    updateGeometry(geomDirty);

    for (const x of Object.values(E)) {
      const e = x.e;
      let vis = edgeVisible(x, f);
      const wasDrawn = !!x.drawn;   // on screen in the previous frame (not merely flagged visible)
      // A vessel that leaves (a collateral that closes, a shunt that is removed) retracts along its
      // flow, the way it drew on, and is hidden when it is done; it is held visible until then.
      if (x.reveal?.out) vis = true;
      else if (!vis && x.vis && wasDrawn && canFade(x) && !x.reveal && !x.g.classList.contains('coll-ghost') && !quietFx()) { startExit(x, f); vis = true; }
      if (vis !== x.vis) { setStyle(x, 'display', vis ? '' : 'none'); if (x.heat) x.heat.style.display = vis ? '' : 'none'; x.vis = vis; }
      if (!vis) { x.drawn = false; continue; }
      if (x.tipFade && TIP_CONNECT[e.id]) {
        // Drawn solid to its end while something attaches there; otherwise it fades.
        const joined = TIP_CONNECT[e.id].some((c) => E[c]?.vis && collOpen(c, f));
        if (joined !== x.tipFade.joined) { x.tipFade.joined = joined; x.tipFade.s0.setAttribute('stop-opacity', (joined ? 1 : easeInOut(morph)).toFixed(2)); }
      }
      x.drawn = true;   // it has been on screen, so leaving it is worth animating
      const k = EI[e.id];
      const D = f.D[k];
      const PM = f.Pf || f.P;
      const P1 = PM[NI[e.from]], P2 = PM[NI[e.to]];
      // Anatomy: width follows diameter (compressed). Circuit: a narrower, more uniform range,
      // as on a transit map, so the lines stay even and legible.
      const wA = e.kind === 'liver' ? (e.zone === 'sin' || e.zone === 'inter' || e.zone === 'post' ? 3.6 : 5.2) : vesselPx(IVC_EDGES.has(e.id) ? f.D[EI.IVC_IS] : D) * (IVC_EDGES.has(e.id) || e.id === 'SVC_RA' ? 0.72 : 1);   // the IVC is one tube: one caliber end to end
      const wC = (e.kind === 'liver' ? 8 : clamp(vesselPx(D) * 0.95, 6, 15)) * circBoost;
      let w = lerp(wA, wC, t);
      // Flow layer: width follows flow volume (∝ √Q), like traffic volume on a city map.
      if (mode === 'flow' && !x.isArt) w = clamp(2.2 + 8.5 * Math.sqrt(Math.abs(f.Qf ? f.Qf[k] : f.Q[k]) * 0.06), 2.2, 22);
      if (x.isArt) w = lerp(Math.max(1.8, vesselPx(D) * 0.5), 3, t);
      // Band ligation strangles the esophageal varices: each band thromboses a channel and the
      // rest shrink (the model raises the route's resistance by the same count).
      if (e.code === 'C1' && f.bands > 0 && t < 1) w *= 1 - 0.14 * Math.min(4, f.bands);
      // The caudate vein hypertrophies when it becomes the liver's outflow (Budd–Chiari).
      if (e.id === 'CAUD' && t < 1) { const ref = store.get().healthy?.Q?.[k]; if (ref) w *= 0.8 * clamp(Math.sqrt(Math.abs(f.Qf ? f.Qf[k] : f.Q[k]) / Math.abs(ref)), 1, 1.8); }
      w = qW(w);
      if (x.reveal?.out && x.width != null) w = x.width;
      // Settled (not morphing, same lens): ignore sub-half-pixel wobble from the pulse and breath.
      const settled = (t === 0 || t === 1) && x.wMode === mode;
      if (!settled || x.width == null || Math.abs(w - x.width) >= 0.5) x.width = w;
      w = x.width;
      x.wMode = mode;
      // The hit stroke is never thinner than the drawn tube (the IVC is wide, behind the liver) and never under ~10 px on screen.
      { const narrow = CONTEXT_EDGES.has(e.id) || BACK_EDGES.has(e.id), hw = Math.round(Math.max(narrow ? 8 : 20, w + 6, 10 / ((CTM && CTM.sc) || 1))); if (x.hitW !== hw) { x.hitW = hw; x.hit.style.strokeWidth = hw; } }
      // The liver's own small vessels (portal venules, sinusoids, central veins) are the liver to the pointer in the anatomy:
      // no hover, no tap on them; it falls through to the organ.
      cls(x, 'no-hit', LIVER_EDGES.has(e.id) && t < 0.5);
      if (x.isArt) { setA(x.wall, 'stroke-width', w.toFixed(1)); continue; }
      x.pmid = (P1 + P2) / 2;
      const baseD = IVC_EDGES.has(e.id) ? E.IVC_IS.e.d : e.d || (e.dMax ? dMinOf(e) : 3);   // one wall thickness along the whole cava
      // The circuit is a map: a slightly wider border (drawn by the GPU, as one shape with filleted
      // joins) gives its lines their weight.
      const wallT = (e.kind === 'liver' ? 0.7 : clamp(0.9 * Math.sqrt(baseD / Math.max(0.3, D)), 0.8, 1.6)) * (1 + 0.45 * t);
      if (x.wallPx == null || Math.abs(wallT - x.wallPx) >= 0.1) x.wallPx = Math.round(wallT * 20) / 20;
      const wallPx = x.wallPx;
      setA(x.wall, 'stroke-width', (w + 2 * wallPx).toFixed(1));
      setA(x.lumen, 'stroke-width', w.toFixed(1));
      if (x.cbr) for (const cb of x.cbr) cb.w = Math.max(1.2, w * cb.k);
      if (x.strands) x.strands.forEach((sd, i) => {
        setA(sd.lumen, 'stroke-width', Math.max(1.6, w * sd.k).toFixed(1)); setA(sd.wall, 'stroke-width', (Math.max(1.6, w * sd.k) + 2 * wallPx).toFixed(1));
        sd.live = e.code === 'C1' ? clamp(i + 1 - (f.bands || 0), 0, 1) : 1;
        const vis = sd.live > 0.02 ? '' : 'none', op = sd.live < 1 ? sd.live.toFixed(2) : '';
        for (const el of [sd.lumen, sd.wall]) { if (el.style.display !== vis) el.style.display = vis; if (el.style.opacity !== op) el.style.opacity = op; }
      });
      if (x.feeders) {
        const cfg = FEEDERS[e.id];
        let live = 1;
        if (cfg.when === 'caudate') {
          const ref = store.get().healthy?.Q?.[k], q = Math.abs(f.Qf ? f.Qf[k] : f.Q[k]);
          live = ref ? clamp((q / Math.abs(ref) - 2) / 2, 0, 1) : 0;
        } else if (cfg.when === 'caput') {
          // Caput medusae: the epigastric network fills in as the paraumbilical route opens.
          live = clamp((recruitFrac('C3', f) - 0.15) / 0.3, 0, 1);
        }
        // A trunk that a collateral carries on (the azygos, with the ascending lumbar veins) is
        // connected: it is drawn to its end; otherwise it fades out.
        const conn = FEEDER_CONNECTOR[e.id], joined = !!conn && collOpen(conn, f);
        x.feedJoined = joined;
        for (const fd of x.feeders) {
          if (fd.fadeMask) for (const el of [fd.wall, fd.lumen]) { if (joined) el.removeAttribute('mask'); else if (!el.hasAttribute('mask')) el.setAttribute('mask', fd.fadeMask); }
          const lv = fd.when ? live : 1;   // only the conditional feeders come and go
          const fw = Math.max(1.2, w * cfg.k * fd.fk * (fd.when ? 0.5 + 0.5 * lv : 1));
          fd.live = lv; fd.w = fw;
          setA(fd.lumen, 'stroke-width', fw.toFixed(1)); setA(fd.wall, 'stroke-width', (fw + 2 * wallPx).toFixed(1));
          const vis = lv > 0.02 ? '' : 'none', op = lv < 1 ? lv.toFixed(2) : '';
          for (const el of [fd.lumen, fd.wall]) { if (el.style.display !== vis) el.style.display = vis; if (el.style.opacity !== op) el.style.opacity = op; }
        }
      }
      let c1, c2;
      if (mode === 'pressure') { c1 = pressureColor(qP(P1)); c2 = pressureColor(qP(P2)); }
      else if (mode === 'drop') { c1 = c2 = dropColor(P1 - P2); }
      else if (mode === 'direction') { const rev = isReversed(e, f); c1 = c2 = rev ? 'var(--flow-reversed)' : 'var(--flow-normal)'; }
      else if (mode === 'flow') { c1 = c2 = flowColor(Math.abs(f.Qf ? f.Qf[k] : f.Q[k]) * 0.06); }
      else if (mode === 'velocity') { c1 = c2 = e.kind === 'liver' ? 'rgb(150,152,162)' : velocityColor(edgeVel(f, k)); }
      else if (mode === 'heat') { c1 = heatColor(ref ? qP(P1 - ref[NI[e.from]]) : 0); c2 = heatColor(ref ? qP(P2 - ref[NI[e.to]]) : 0); }
      else if (mode === 'neutral') { c1 = c2 = PORTAL_TERRITORY.has(e.from) || PORTAL_TERRITORY.has(e.to) ? 'var(--vein-portal)' : 'var(--vein-systemic)'; }
      else { c1 = deltaColor(ref ? qP(P1 - ref[NI[e.from]]) : 0); c2 = deltaColor(ref ? qP(P2 - ref[NI[e.to]]) : 0); }
      setA(x.st0, 'stop-color', c1); setA(x.st1, 'stop-color', c2);
      x.col = [c1, c2];
      if (x.feeders) for (const fd of x.feeders) {
        if (fd.src) { fd.col = [mode === 'pressure' ? pressureColor(qP(PM[NI[fd.src]])) : c1, c1]; setA(fd.st0, 'stop-color', fd.col[0]); setA(fd.st1, 'stop-color', c1); }
        else if (FEEDERS[e.id].tone === 'end') { fd.col = [c2, c2]; setA(fd.lumen, 'stroke', c2); }   // a network that leaves the vessel's end takes that end's color
      }
      // Flow marks are white on dark lumens and ink on pale ones.
      x.inkDark = mode === 'pressure' ? luminance(pressureColor((P1 + P2) / 2)) > 0.36 : luminance(c1) > 0.36;
      if (x.heat && mode === 'heat') { setA(x.heat, 'stroke', c1); setA(x.heat, 'stroke-width', (w + 22).toFixed(1)); const ho = mode === 'heat' && ref ? clamp((x.pmid - (ref[NI[e.from]] + ref[NI[e.to]]) / 2) / 8, 0, 1).toFixed(2) : '0'; if (x.heat._op !== ho) { x.heat._op = ho; x.heat.style.opacity = ho; } }
      x.heatA = x.heat && mode === 'heat' && ref ? clamp((x.pmid - (ref[NI[e.from]] + ref[NI[e.to]]) / 2) / 8, 0, 1) : 0; x.heatCol = c1;
      if (e.kind === 'collateral') {
        const fr = shownFrac(e.id, f);
        const qa = Math.abs(f.Qf ? f.Qf[k] : f.Q[k]);
        const openNow = collOpen(e.id, f);
        if (!openNow && wasDrawn && !x.g.classList.contains('coll-ghost') && !x.reveal && !quietFx()) startExit(x, f);
        cls(x, 'coll-ghost', !openNow && !x.reveal?.out);
        x.opa = isOccluded(p, e.id) ? 0.45 : 0.3 + 0.7 * Math.min(1, Math.max(fr * 2.5, qa / 1.5));
        setLevel(x, nearestLevel(x.opa));
      }
      x.rev = REVERSAL_WATCH.has(e.id) && isReversed(e, f);
      const selOn = st.selection?.type === 'edge' && st.selection.id === e.id;
      x.sel.classList.toggle('on', selOn);
      cls(x, 'is-sel', selOn);
      if (selOn) setA(x.sel, 'stroke-width', (w + 12).toFixed(1));
      x.dopW = w;
      if (dop.id === e.id) { const d = x.wall.getAttribute('d'); if (d) dop.paint(d, w); dop.g.style.display = x.vis ? '' : 'none'; }
    }
    // Junction widths: where vessels meet, the largest narrows to the second largest and the
    // others widen toward it, so calibers change smoothly through every junction.
    const jw = {};
    for (const x of Object.values(E)) {
      if (!x.vis || x.isArt || x.g.classList.contains('coll-ghost')) continue;
      (jw[x.e.from] ||= []).push(x.width); (jw[x.e.to] ||= []).push(x.width);
    }
    const J = {};
    for (const [n, ws] of Object.entries(jw)) { ws.sort((a, b) => b - a); J[n] = ws[1] ?? ws[0]; }
    // Detect newly opened collaterals before the tubes are built: a revealing vessel is drawn as a
    // dashed stroke from its first frame (never first as a full tube that then vanishes).
    trackChanges(f, p);
    stepReveals(performance.now());
    for (const x of Object.values(E)) if (x.vis && !x.isArt) renderTube(x, p, t, J);
    if (glWanted(t)) clearJoins(); else updateJoins(t);
    // A selected vessel stays bright while the rest of the network recedes.
    wrap.classList.toggle('has-sel', st.selection?.type === 'edge' && !!E[st.selection.id]?.vis);
    syncLift();
    syncVeins(t);
    updateOrganSel(st.selection, t);
    updateNodesCircuit(f);
    updateOverlays(f, p, gain, t);
    updateFocus();
    updateBridges(t);
    updateLabels(f);
    updateOrgans(f, p, t);
  }

  // Each vein is a filled tube whose radius eases from the junction width at either end to its
  // own caliber (and narrows at a stenosis), with the shading of a lit cylinder. The circuit,
  // closed collaterals and vessels being drawn on use plain strokes. Recomputed only when a
  // width, a lesion or the geometry changes.
  const smooth = (u) => u * u * (3 - 2 * u);
  function renderTube(x, p, t, J) {
    const g = geo[x.e.id], id = x.e.id, w = x.width, wallPx = x.wallPx;
    const v = isImaging() ? 0 : p.stenosis[id] || 0;
    const sten = v > 0.01;
    const stroked = x.g.classList.contains('coll-ghost') || !!x.reveal || (t >= 0.5 && !sten);
    cls(x, 'sten', sten); cls(x, 'stroked', stroked);
    const lim = x.e.kind === 'collateral' ? 1.3 : 1.7;
    // A large shunt tapers into the smaller vein it drains into instead of butting onto it.
    const lo = x.e.spontaneous ? 0.4 : 0.5;
    // On the GPU each vessel keeps its own caliber to its ends: the fillet rounds a fork, and where one
    // vessel runs on into the next both ends ease to meet (see smoothRunOn), so no tube swells or pinches
    // beside a join. The SVG tubes ease their ends to the junction width instead.
    const gpu = glWanted(t);
    const endW = (n) => (J[n] && !stroked && (!gpu || GPU_EASE[id] === n) ? clamp(J[n], w * lo, w * lim) : w);
    const a = endW(x.e.from), b = endW(x.e.to);
    const key = `${w.toFixed(1)},${a.toFixed(1)},${b.toFixed(1)}|${wallPx.toFixed(2)}|${sten ? v.toFixed(3) + '@' + (stenosisAt[id] ?? 0.5) : ''}|${lastMorph}|${stroked}|${gpu}`;
    if (key === x.shadeKey) return;
    x.shadeKey = key;
    const f = sten ? waist(id, v, g.len, w) : null;
    x.rOf = (u) => {
      const r = u < 0.3 ? lerp(a, w, smooth(u / 0.3)) : u > 0.7 ? lerp(w, b, smooth((u - 0.7) / 0.3)) : w;
      return Math.max(0.35, (r / 2) * (f ? f(u) : 1));
    };
    // The GPU draws the tube from rOf; the SVG outlines are built only when the SVG shows them.
    if (gpu) return;
    const pts = g.cur, lit = g.lit;
    if (!stroked) {
      const casing = tubeOutline(pts, lit, (u) => x.rOf(u) + wallPx);
      x.wallP.setAttribute('d', casing);
      x.shadow.setAttribute('d', casing);
      x.lumenP.setAttribute('d', tubeOutline(pts, lit, x.rOf));
    }
    if (stroked || w < 3.4 || t >= 0.999 || sten) { x.sheen.removeAttribute('d'); x.shade.removeAttribute('d'); return; }
    // Highlights are filled ribbons that taper to nothing at both ends, so they dissolve into the
    // junction instead of stopping short of it and starting again on the next vessel.
    const wm = Math.min(w, a, b);
    const taper = (u) => smooth(clamp(u / 0.22, 0, 1)) * smooth(clamp((1 - u) / 0.22, 0, 1));
    x.sheen.setAttribute('d', tubeOutline(litOffset(pts, lit, wm * 0.2), lit, (u) => wm * 0.12 * taper(u)));
    x.shade.setAttribute('d', tubeOutline(litOffset(pts, lit, -wm * 0.24), lit, (u) => wm * 0.19 * taper(u)));
  }

  // Joins across layers: within a layer the casings lie under all the lumens, so vessels that meet
  // merge. Where a vein ends on vessels drawn in a lower layer (a translucent context vein, one
  // behind the organs), its round end and casing would sit on top of them as a ringed disc. That
  // end instead dissolves into the vessel beneath over the length of its cap, unless it runs on
  // into a vessel of its own layer. Found from the drawn courses, which need not end at the nodes.
  const joinRank = (x) => (x.back ? 0 : 10) + (x.level ?? 1);
  const shown = (y) => y.vis && !y.isArt && !y.g.classList.contains('coll-ghost');
  // Distance from q to a drawn course; `body`: only to its length, not beyond either end.
  function distTo(pts, q, body) {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], dx = pts[i][0] - ax, dy = pts[i][1] - ay;
      const v = ((q[0] - ax) * dx + (q[1] - ay) * dy) / (dx * dx + dy * dy || 1);
      if (body && ((i === 1 && v < 0) || (i === pts.length - 1 && v > 1))) continue;
      const u = clamp(v, 0, 1);
      best = Math.min(best, Math.hypot(ax + dx * u - q[0], ay + dy * u - q[1]));
    }
    return best;
  }
  // For each vein end, the other veins whose course passes within reach of it, with the distance.
  // Built from the anatomy's courses (joins are drawn only there).
  let near = null, nearVersion = -1;
  function buildNear() {
    const xs = Object.values(E).filter((x) => !x.isArt && geo[x.e.id].cur);
    const box = new Map(xs.map((x) => {
      const P = geo[x.e.id].cur;
      return [x, [Math.min(...P.map((q) => q[0])) - 14, Math.min(...P.map((q) => q[1])) - 14, Math.max(...P.map((q) => q[0])) + 14, Math.max(...P.map((q) => q[1])) + 14]];
    }));
    near = new Map();
    for (const x of xs) {
      const P = geo[x.e.id].cur;
      near.set(x, [P[0], P[P.length - 1]].map((q) => {
        const out = [];
        for (const y of xs) {
          const b = box.get(y);
          if (y === x || q[0] < b[0] || q[0] > b[2] || q[1] < b[1] || q[1] > b[3]) continue;
          const d = distTo(geo[y.e.id].cur, q);
          if (d < 14) out.push([y, d]);
        }
        return out;
      }));
    }
  }
  // A vein's end: the end point, the direction out of the vessel there, and its outer radius.
  function endFrame(x, i) {
    const pts = geo[x.e.id].cur;
    const R = (x.rOf ? x.rOf(i) : x.width / 2) + x.wallPx + 1;
    const end = i ? pts[pts.length - 1] : pts[0];
    let k = i ? pts.length - 2 : 1;
    while (k > 0 && k < pts.length - 1 && Math.hypot(pts[k][0] - end[0], pts[k][1] - end[1]) < R) k += i ? -1 : 1;
    const l = Math.hypot(end[0] - pts[k][0], end[1] - pts[k][1]) || 1;
    return { end, R, tx: (end[0] - pts[k][0]) / l, ty: (end[1] - pts[k][1]) / l };
  }
  const JOIN_FADE = 1.1;   // outer radii over which an end fades, short of the junction
  // Which ends of a vein (0, 1) fade into a vessel beneath that runs on past them.
  function joinEnds(x, t) {
    if (t >= 0.5 || !near?.has(x) || !shown(x) || x.reveal) return [];
    const r = joinRank(x), ends = [];
    near.get(x).forEach((list, i) => {
      const cand = list.filter(([y, d]) => shown(y) && d < y.width / 2 + 1.5).map(([y]) => y);
      const lower = cand.filter((y) => joinRank(y) < r);
      if (!lower.length) return;
      const { end, R, tx, ty } = endFrame(x, i);
      // Its own tributaries are drawn with it (the azygos trunk into the arch) and would fade too.
      if (x.feeders?.some((fd) => [fd.cur[0], fd.cur[fd.cur.length - 1]].some((c) => Math.hypot(c[0] - end[0], c[1] - end[1]) < 2 * R))) return;
      const at = (k) => [end[0] + tx * k * R, end[1] + ty * k * R];
      const covers = (ys, q) => ys.some((y) => distTo(geo[y.e.id].cur, q, true) < y.width / 2);
      // Just past the end: a vessel of its own layer (or nearer) that runs on there merges with
      // it (a small one, such as a collateral, does not cover the end); nothing beneath running on means a blind end, which keeps its round end.
      const ahead = at(0.15);
      if (covers(cand.filter((y) => joinRank(y) >= r && y.width >= 0.6 * x.width), ahead) || !covers(lower, ahead)) return;
      ends.push(i);
    });
    return ends;
  }
  function updateJoins(t) {
    if (t === 0 && nearVersion !== geometryVersion) { buildNear(); nearVersion = geometryVersion; }
    for (const x of Object.values(E)) {
      const ends = joinEnds(x, t);
      const pts = geo[x.e.id].cur;
      const key = ends.length && pts ? ends.join() + '|' + Math.round(x.width) + '|' + geometryVersion : '';
      if (key === (x.joinKey || '')) continue;
      x.joinKey = key;
      if (!key) { for (const g of x.groups) g.removeAttribute('mask'); continue; }
      if (!x.join) {
        const id = x.e.id;
        const m = s('mask', { id: `jm-${id}`, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: VIEW.w, height: VIEW.h });
        m.append(s('rect', { x: 0, y: 0, width: VIEW.w, height: VIEW.h, fill: '#fff' }));
        x.join = [0, 1].map((i) => {
          const gr = s('linearGradient', { id: `jg-${id}-${i}`, gradientUnits: 'userSpaceOnUse' });
          gr.append(s('stop', { offset: '0', 'stop-color': '#fff' }), s('stop', { offset: '1', 'stop-color': '#000' }));
          const box = s('path', { fill: `url(#jg-${id}-${i})` });
          defs.append(gr); m.append(box);
          return { gr, box };
        });
        defs.append(m);
      }
      for (const i of [0, 1]) {
        const { gr, box } = x.join[i];
        if (!ends.includes(i)) { box.removeAttribute('d'); continue; }
        const { end, R, tx, ty } = endFrame(x, i);
        // From solid a little short of the junction to gone just past it, so no part of the round
        // end or its outline is left: the vein turns into the vessel that carries on beneath.
        const s0 = -JOIN_FADE * R, s1 = 0.3 * R, w = R + 2;
        const at = (a, b) => [end[0] + tx * a - ty * b, end[1] + ty * a + tx * b];
        gr.setAttribute('x1', at(s0, 0)[0].toFixed(1)); gr.setAttribute('y1', at(s0, 0)[1].toFixed(1));
        gr.setAttribute('x2', at(s1, 0)[0].toFixed(1)); gr.setAttribute('y2', at(s1, 0)[1].toFixed(1));
        const c = [at(s0 - 1, -w), at(R + 4, -w), at(R + 4, w), at(s0 - 1, w)];
        box.setAttribute('d', 'M' + c.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L') + ' Z');
      }
      for (const g of x.groups) g.setAttribute('mask', `url(#jm-${x.e.id})`);
    }
  }

  // ── Vessels on the GPU (veins-gl.js) ─────────────────
  // In the anatomy every vessel (veins in every tier, arteries, cavernoma strands, tributaries,
  // closed collaterals, vessels drawing on, the congestion glow), in the anatomy and in the
  // circuit, is drawn by veins-gl.js; the SVG keeps only the hit strokes, and builds its tubes
  // only for an exported SVG figure (or where WebGL2 is missing altogether).
  // Tiers, back to front: the retroperitoneal stacks and opaque layer (behind the organs), the
  // arteries, the translucent stacks, the opaque network, the portal tree in front, the focus.
  const TIER_BACK0 = 0, TIER_BACK = 7, TIER_ART = 8, TIER_MID0 = 9, TIER_NET = 16, TIER_FRONT = 17, TIER_LIFT = 18, TIER_LIFT_FRONT = 19;
  const TIER_GROUP = Array.from({ length: MAX_TIERS }, (_, i) => (i <= TIER_BACK ? 0 : i < TIER_LIFT ? 1 : 2));
  const TIER_ALPHA = Array.from({ length: MAX_TIERS }, (_, i) => (i < TIER_BACK ? LEVELS[i] : i >= TIER_MID0 && i < TIER_NET ? LEVELS[i - TIER_MID0] : 1));
  const levelTier = (x) => {
    const l = x.level ?? 1;
    if (l >= 1) return x.back ? TIER_BACK : x.front ? TIER_FRONT : TIER_NET;
    return (x.back ? TIER_BACK0 : TIER_MID0) + Math.max(0, LEVELS.indexOf(l));
  };
  // Rows of the per-vessel textures: the model's vessels, then every strand, tributary and liver branch.
  {
    for (const [id, list] of Object.entries(treeGeo)) if (E[id]) E[id].cbr = list.map(({ pts, k }) => ({ cur: pts, k, w: 0 }));
    let row = ALL_EDGES.length;
    for (const e of ALL_EDGES) {
      const x = E[e.id];
      for (const sd of x.strands || []) sd.row = row++;
      for (const fd of x.feeders || []) fd.row = row++;
      for (const cb of x.cbr || []) cb.row = row++;
    }
  }
  const tubeData = veins ? new Float32Array(GL_ROWS * TUBE_TEXELS * 4) : null;
  let cathTint = null;   // the HVPG's wedged vein, recolored (see cathPaint)
  const ORIGIN_LUMEN = [ORIGIN_GREY, ORIGIN_GREY, ORIGIN_GREY];   // the lumen while the blood is colored by origin (the GPU paints the streams on it)
  let vBinKey = '', vBinReach = new Map(), veinsDirty = true, veinsDrawKey = '', vLook = null, glOrgans = false;
  const colorCtx = veins ? document.createElement('canvas').getContext('2d') : null;
  const rgbCache = new Map();
  // Any CSS color (rgb(), #hex, a named var) as [r, g, b] in 0–1.
  function toRGB(c, cs) {
    const m = /^var\((--[\w-]+)\)$/.exec(c || '');
    const v = m ? cs.getPropertyValue(m[1]).trim() : c;
    let out = rgbCache.get(v);
    if (out) return out;
    colorCtx.fillStyle = '#000'; colorCtx.fillStyle = v || '#000';
    const f = colorCtx.fillStyle;
    if (f[0] === '#') out = [1, 3, 5].map((i) => parseInt(f.slice(i, i + 2), 16) / 255);
    else { const k = f.match(/[\d.]+/g).map(Number); out = [k[0] / 255, k[1] / 255, k[2] / 255]; }
    rgbCache.set(v, out);
    return out;
  }
  const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const cssNum = (cs, name, dflt) => { const v = parseFloat(cs.getPropertyValue(name)); return Number.isFinite(v) ? v : dflt; };
  const cssTriplet = (cs, name) => { const k = cs.getPropertyValue(name).trim().split(/[\s,/]+/).map(Number); return k.length >= 3 && k.every(Number.isFinite) ? k.slice(0, 3).map((v) => v / 255) : [0, 0, 0]; };
  /** Whether the GPU draws the vessels (always, except while an SVG export is built). */
  const glWanted = () => !!veins && !veins.lost;

  // What the GPU draws this frame: each vessel on screen, its strands and its tributaries. Strands
  // and tributaries lie where the anatomy has them, so the circuit leaves them out (as the SVG did).
  function glItems() {
    const items = [];
    const anat = morph < 0.5;
    for (const x of Object.values(E)) {
      const pts = geo[x.e.id].cur;
      if (!x.vis || !pts || (!x.isArt && !x.rOf)) continue;
      items.push({ x, obj: x, row: x.row, pts, kind: 'v' });
      // The liver's branches lie where the circuit has them, so the anatomy leaves them out.
      if (!anat && x.cbr) for (const cb of x.cbr) if (cb.w) items.push({ x, obj: cb, row: cb.row, pts: cb.cur, kind: 'c' });
      if (!anat || x.isArt || x.g.classList.contains('coll-ghost')) continue;
      for (const sd of x.strands || []) if (sd.cur && (sd.live ?? 1) > 0.02) items.push({ x, obj: sd, row: sd.row, pts: sd.cur, kind: 's' });
      for (const fd of x.feeders || []) if ((fd.live ?? 1) > 0.02 && fd.w) items.push({ x, obj: fd, row: fd.row, pts: fd.cur, kind: 'f' });
    }
    return items;
  }
  // Lumen radius along an item, and the key it changes with.
  function itemRadii(it) {
    const { x, kind } = it;
    if (kind === 'v' && !x.isArt) return [x.shadeKey, (i) => x.rOf(i / (N_SAMPLES - 1))];
    const r = kind === 'v' ? Math.max(0.5, x.width / 2) : kind === 's' ? Math.max(1.6, x.width * it.obj.k) / 2 : it.obj.w / 2;
    return [r.toFixed(2), () => r];
  }
  // Vessels that run on into each other (from veinJoins): their calibers are eased to meet at the join.
  let glStraight = [], glRadDirty = true;
  // Where one vessel runs on into the next, the two courses meet at a slight corner: the last few
  // samples either side are redrawn as one smooth curve (a cubic through the join, following each
  // course's own direction), so the tube bends through the join instead of kinking.
  function smoothRunOn(items) {
    const out = new Map(), byRow = new Map(items.map((it) => [it.row, it])), E = 10;
    const pt = (P, i, end) => (end ? P[P.length - 1 - i] : P[i]);   // i samples in from that end
    for (const { a, ia, b, ib } of glStraight) {
      const A = byRow.get(a), B = byRow.get(b);
      if (!A || !B) continue;
      const PA = out.get(a) || A.pts.map((q) => q.slice()), PB = out.get(b) || B.pts.map((q) => q.slice());
      if (PA.length < 2 * E + 2 || PB.length < 2 * E + 2) continue;
      // From E samples into A, through the join, to E samples into B.
      const p0 = pt(PA, E, ia), p0b = pt(PA, E + 1, ia), p3 = pt(PB, E, ib), p3b = pt(PB, E + 1, ib);
      const L = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) / 3;
      const ta = [p0[0] - p0b[0], p0[1] - p0b[1]], tb = [p3[0] - p3b[0], p3[1] - p3b[1]];
      const na = Math.hypot(...ta) || 1, nb = Math.hypot(...tb) || 1;
      const p1 = [p0[0] + (ta[0] / na) * L, p0[1] + (ta[1] / na) * L], p2 = [p3[0] + (tb[0] / nb) * L, p3[1] + (tb[1] / nb) * L];
      const bez = (t) => { const u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; };
      // A's samples E … 0 (toward its end) take t 0 … 0.5, B's 0 … E take 0.5 … 1.
      for (let i = 0; i <= E; i++) {
        const qa = bez(0.5 * (1 - i / E)), qb = bez(0.5 + 0.5 * (i / E));
        const ja = ia ? PA.length - 1 - i : i, jb = ib ? PB.length - 1 - i : i;
        PA[ja] = qa; PB[jb] = qb;
      }
      out.set(a, PA); out.set(b, PB);
    }
    return out;
  }
  // Junctions: ends that meet at a model node (clustered by where the drawn courses actually
  // end), and ends that lie on another vessel's course (a tributary on its trunk, a vein drawn
  // onto the side of another). Arteries join only arteries.
  function veinJoins(items) {
    const joins = [], pairs = new Set();
    glStraight = []; glRadDirty = true;
    const pairKey = (a, b) => Math.min(a.row, b.row) + ':' + Math.max(a.row, b.row);
    const endOf = (it, i) => (i ? it.pts[it.pts.length - 1] : it.pts[0]);
    const rEnd = (it, i) => it.obj.glR[i ? N_SAMPLES - 1 : 0];
    const add = (ends, c) => {
      const uniq = [...new Map(ends.map((e) => [e[0].row, e])).values()];
      if (uniq.length < 2) return;
      let spread = 0, rMin = Infinity, rMax = 0;
      for (const [it, i] of uniq) {
        const q = i == null ? c : endOf(it, i), r = i == null ? it.obj.glMaxR : rEnd(it, i);
        spread = Math.max(spread, Math.hypot(q[0] - c[0], q[1] - c[1]));
        rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
      }
      const k = clamp(1.2 * rMin + 1.2, 1.5, 11);
      let fil = 1;
      // One vessel running on into the next (two ends meeting nearly head on) needs no fillet: the
      // smooth union of two overlapping ends swells the tube there, a bump at every join.
      if (uniq.length === 2 && uniq.every(([, i]) => i != null)) {
        const dir = ([it, i]) => { const P = it.pts, n = P.length, a = i ? P[n - 1] : P[0], b = i ? P[Math.max(0, n - 4)] : P[Math.min(n - 1, 3)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
        const [u, v] = uniq.map(dir), dot = u[0] * v[0] + u[1] * v[1];
        fil = clamp((dot + 0.9) / 0.5, 0, 1);
        if (fil < 1) glStraight.push({ a: uniq[0][0].row, ia: uniq[0][1], b: uniq[1][0].row, ib: uniq[1][1] });
      }
      const reach = spread + 2 * rMax + k + 6;
      const rows = uniq.map(([it]) => it);
      for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) pairs.add(pairKey(rows[a], rows[b]));
      const groups = rows.length <= 4 ? [rows] : rows.flatMap((r, a) => rows.slice(a + 1).map((q) => [r, q]));
      for (const g of groups) joins.push({ x: c[0], y: c[1], reach, k, fillet: fil, members: g.map((it) => it.row) });
    };
    const byNode = new Map();
    for (const it of items) {
      if (it.kind === 'f') continue;
      const pre = it.x.isArt ? 'a:' : '';
      for (const i of [0, 1]) { const n = pre + (i ? it.x.e.to : it.x.e.from); if (!byNode.has(n)) byNode.set(n, []); byNode.get(n).push([it, i]); }
    }
    for (let ends of byNode.values()) {
      while (ends.length) {
        const q0 = endOf(...ends[0]);
        const near = ends.filter(([it, i]) => { const q = endOf(it, i); return Math.hypot(q[0] - q0[0], q[1] - q0[1]) < 20; });
        ends = ends.filter((e) => !near.includes(e));
        if (near.length < 2) continue;
        const c = near.reduce((a, [it, i]) => { const q = endOf(it, i); return [a[0] + q[0] / near.length, a[1] + q[1] / near.length]; }, [0, 0]);
        add(near, c);
      }
    }
    const box = new Map(items.map((it) => {
      const P = it.pts, m = it.obj.glMaxR + 4;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of P) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
      return [it, [x0 - m, y0 - m, x1 + m, y1 + m]];
    }));
    for (const it of items) for (const i of [0, 1]) {
      const q = endOf(it, i), rq = rEnd(it, i);
      for (const y of items) {
        const b = box.get(y);
        if (y === it || !!y.x.isArt !== !!it.x.isArt || q[0] < b[0] || q[0] > b[2] || q[1] < b[1] || q[1] > b[3]) continue;
        if (pairs.has(pairKey(it, y))) continue;
        if (distTo(y.pts, q) < y.obj.glMaxR + 0.5 * rq + 2) add([[it, i], [y, null]], q);
      }
    }
    return joins;
  }
  function syncVeins(t) {
    if (!veins || veins.lost) return;
    const on = glWanted(t);
    wrap.classList.toggle('gl-on', on);
    wrap.classList.toggle('gl-plate', on && veins.hasPlate(0));
    if (!on) { if (vLook) { veins.clear(); vLook = null; vBinKey = ''; } return; }
    if (!glOrgans) {
      // The organ covers, rasterized once in world space (1.5 px per unit): tiers behind them fade.
      const k = 1.5, c = document.createElement('canvas');
      c.width = VIEW.w * k; c.height = VIEW.h * k;
      const mc = c.getContext('2d');
      mc.setTransform(k, 0, 0, k, 0, 0);
      mc.lineCap = 'round'; mc.lineJoin = 'round';
      mc.fillStyle = mc.strokeStyle = '#000';
      const solid = new Path2D();
      for (const { p, w } of getOrganCovers()) { if (w) { mc.lineWidth = w; mc.stroke(p); } else solid.addPath(p); }
      mc.fill(solid);
      veins.setOrgans(c, [0, 0, VIEW.w, VIEW.h]);
      glOrgans = true;
    }
    const items = glItems();
    const cs = getComputedStyle(wrap);
    const mode = layerMode(), heat = mode === 'heat';
    // Radii: re-sent only when a tube changed.
    for (const it of items) {
      const [key, rOf] = itemRadii(it), o = it.obj;
      if (o.glRadKey === key && o.glR0) continue;
      o.glRadKey = key; glRadDirty = true;
      o.glR0 = Array.from({ length: N_SAMPLES }, (_, i) => rOf(i));
    }
    // Where one vessel runs on into the next, both ends ease to the same caliber, so the tube is one
    // smooth course (no step and no swelling at the join).
    const eased = new Map();
    if (glRadDirty && glStraight.length) {
      const byRow = new Map(items.map((it) => [it.row, it.obj]));
      for (const { a, ia, b, ib } of glStraight) {
        const A = byRow.get(a), B = byRow.get(b);
        if (!A?.glR0 || !B?.glR0) continue;
        const ra = A.glR0[ia ? N_SAMPLES - 1 : 0], rb = B.glR0[ib ? N_SAMPLES - 1 : 0];
        // One smoothstep from A's caliber (half A's course back) to B's (half B's course on), so the
        // taper runs steadily through the join: no plateau there, which read as a crease.
        const E = N_SAMPLES >> 1, S = (u) => u * u * (3 - 2 * u);
        for (const [O, i, side] of [[A, ia, 0], [B, ib, 1]]) {
          const R = eased.get(O) || O.glR0.slice();
          for (let s = 0; s < E; s++) {
            const u = side ? 0.5 + 0.5 * (s / E) : 0.5 - 0.5 * (s / E), j = i ? N_SAMPLES - 1 - s : s;
            R[j] += side ? (ra - rb) * (1 - S(u)) : (rb - ra) * S(u);
          }
          eased.set(O, R);
        }
      }
    }
    if (glRadDirty) for (const it of items) {
      const o = it.obj, R = eased.get(o) || o.glR0, k = R.join(',');
      if (o.glRSent === k) continue;
      o.glRSent = k; o.glR = R; o.glMaxR = Math.max(...R);
      veins.setRadii(it.row, R);
    }
    glRadDirty = false;
    // Geometry: re-binned when the layout, the set of vessels or a vessel's reach grows.
    const reachOf = (it) => Math.ceil((it.obj.glMaxR + (it.x.wallPx || 1) + 9 + (heat ? 30 : 0)) / 2) * 2;
    const key = `${geometryVersion}|${heat}|` + items.map((it) => it.row).join(',');
    if (key !== vBinKey || items.some((it) => reachOf(it) > (vBinReach.get(it.row) || 0))) {
      vBinKey = key;
      vBinReach = new Map(items.map((it) => [it.row, reachOf(it)]));
      const J = veinJoins(items), smooth = smoothRunOn(items);
      veins.setGeometry(binVeins(items.map((it) => ({ id: it.row, pts: smooth.get(it.row) || it.pts, reach: vBinReach.get(it.row) })), J));
    }
    // Attributes, every frame.
    const T0 = easeInOut(morph), now = performance.now();
    const hovering = wrap.classList.contains('hovering'), hasSel = wrap.classList.contains('has-sel');
    const artery = toRGB('var(--artery)', cs);
    const originMode = originOn();
    tubeData.fill(0);
    // Hovering or selecting any part of the IVC shows it whole: no veil, and no fades on it or on the tributaries joining it.
    let ivcOn = false, ivcSel = false;
    for (const id of IVC_EDGES) { const g = E[id]?.g; if (g && (g.classList.contains('is-sel') || g.classList.contains('hl'))) ivcOn = true; if (g?.classList.contains('is-sel')) ivcSel = true; }
    for (const it of items) {
      const { x, kind, obj } = it, id = x.e.id, o = it.row * TUBE_TEXELS * 4;
      const ghost = x.g.classList.contains('coll-ghost');
      // The IVC is one vessel to the eye: hovering or selecting any stretch lights and rings all of it.
      const whole = ivcOn && IVC_EDGES.has(id);
      const sel = x.g.classList.contains('is-sel') || (whole && ivcSel), hl = x.g.classList.contains('hl') || whole;
      let c0, c1;
      if (x.isArt) c0 = c1 = artery;
      else {
        const [a, b] = (x.col || ['#888', '#888']).map((c) => toRGB(c, cs));
        if (kind === 'f' || kind === 'c') {
          if (obj.col) [c0, c1] = obj.col.map((c) => toRGB(c, cs));
          else {
            // A tributary takes its trunk's gradient where it lies along the trunk's chord.
            const P = geo[id].cur, A = P[0], B = P[P.length - 1], dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1;
            const at = (q) => clamp(((q[0] - A[0]) * dx + (q[1] - A[1]) * dy) / L2, 0, 1);
            c0 = mix3(a, b, at(it.pts[0])); c1 = mix3(a, b, at(it.pts[it.pts.length - 1]));
          }
        } else { c0 = a; c1 = b; }
        // Coloring the blood by origin: the lumen steps back to a quiet grey so the parcels' colors read.
        if (originMode) c0 = c1 = ORIGIN_LUMEN;
      }
      let alpha = x.isArt ? 0.85 : kind === 'c' ? clamp(2 * T0 - 1, 0, 1) : kind === 's' || kind === 'f' ? (obj.live ?? 1) * clamp(1 - 2 * T0, 0, 1) : 1;
      if (x.back) {
        if (hovering && !hl) alpha *= CONTEXT_EDGES.has(id) ? 0.12 : 0.22;
        if (hasSel && !sel && !hl) alpha *= 0.42;
      }
      const tier = ivcOn && IVC_EDGES.has(id) ? TIER_LIFT : x.lifted && !x.back ? (x.front ? TIER_LIFT_FRONT : TIER_LIFT) : x.isArt ? TIER_ART : levelTier(x);
      const shade = !x.isArt && !ghost;
      const veil = IVC_EDGES.has(id) && !ivcOn;
      const spec = shade && !veil && kind !== 'f' && kind !== 'c' && !CONTEXT_EDGES.has(id) && !x.back && x.width >= 3.4;
      const flags = (sel && kind === 'v' ? F_SEL : 0) | (shade ? F_DIFFUSE : 0) | (spec ? F_SPEC : 0) | (!x.back && !x.isArt && !ghost && !veil ? F_SHADOW : 0) | (ghost ? F_DOTTED : 0) | (x.isArt ? F_NOCASE : 0) | (veil ? F_VEIL : 0);
      const z = (kind === 'v' ? x.row + 0.5 : x.row) / GL_ROWS;
      // No congestion halo on the IVC itself: its wide halo would spill onto the bowel beside it.
      const heatA = kind === 'v' && heat && !IVC_EDGES.has(id) ? (x.heatA || 0) : 0;
      tubeData.set([...c0, x.isArt ? 0 : x.wallPx, ...c1, alpha, tier, z, flags, heatA], o);
      // Fades, as the SVG masks: into an organ (TIP_FADE), out of the plate, into a deeper vein,
      // tributaries toward the bowel they drain.
      let fade = null;
      if (kind === 'f') {
        const cfg = FEEDERS[id];
        if (obj.fadeMask && !x.feedJoined) { const [y0, y1] = FEEDER_FADE_Y[id]; fade = [0, y0, 0, y1, 0, 1, 0, 1]; }
        else if (obj.fan && cfg.fan) { const { at, len, levels, fade: fr = [0.7, 0.4] } = cfg.fan; fade = [at[0], at[1], len * (levels ? 2.7 : 1.35), 0, 0, fr[0], fr[1], 2]; }
      } else if (x.tipFade) { const L = x.tipFade.line; fade = [L[0], L[1], L[2], L[3], 0, x.tipFade.joined ? 1 : T0, 1, 1]; }
      else if (kind === 'v' && IVC_JOIN[id]) { if (!ivcOn) fade = [...IVC_JOIN[id]]; }
      else if (FADE_DOWN_Y[id] && !(ivcOn && IVC_EDGES.has(id))) { const [y0, y1] = FADE_DOWN_Y[id]; fade = [0, y0, 0, y1, 0, 1, 0, 1]; }
      else if (FADE_IN[id] && kind === 'v') { const [x1, y1, x2, y2, of] = FADE_IN[id]; fade = [x1, y1, x2, y2, of, 1, 0.3, 1]; }
      // The fades are drawn in the anatomy's coordinates: they let go as the circuit takes over.
      // (The tip fade already does: it is cleared in the circuit.)
      if (fade && T0 > 0 && !(kind !== 'f' && x.tipFade)) { fade[5] += (1 - fade[5]) * T0; fade[6] += (1 - fade[6]) * T0; }
      if (fade) tubeData.set(fade, o + 12);
      // The drawn stretch: a vessel drawing on (or retracting) grows along its flow.
      let lo = 0, hi = 1;
      if (x.reveal && kind !== 'f' && kind !== 'c') {
        const r = x.reveal, u = clamp((now - r.t0) / r.dur, 0, 1), off = r.out ? easeInOut(u) : 1 - easeInOut(u);
        if (r.dir > 0) hi = 1 - off; else lo = off;
      }
      tubeData.set([lo, hi, kind === 's' ? obj.len : geo[id].len || 1, 0, ...(heatA ? toRGB(x.heatCol, cs) : [0, 0, 0]), 0], o + 20);
      const tint = kind === 'v' && cathTint?.[id];
      if (tint) tubeData.set([...toRGB(cathTint.col, cs), 1, tint[0], tint[1], cathTint.soft, 0], o + 32);
    }
    veins.setTubes(tubeData);
    vLook = {
      shOff: [1.4, 2.8], light: LIGHT, reach: heat ? 40 : 11, heat, organs: 1 - T0,
      casing: [...cssTriplet(cs, '--casing-rgb'), cssNum(cs, '--casing-a', 0.56)],
      shadow: [...cssTriplet(cs, '--shadow-rgb'), cssNum(cs, '--shadow-a', 0.15)],
      sheen: [...toRGB('var(--light-ink)', cs), cssNum(cs, '--tube-sheen', 0.42)],
      shade: [...toRGB('var(--tube-shade-ink)', cs), cssNum(cs, '--tube-shade', 0.2)],
      ring: [...toRGB('var(--accent)', cs), 0.34],
      netAlpha: hovering ? 0.22 : hasSel ? 0.42 : 1,
      fx: true,
      tierAlpha: TIER_ALPHA, tierGroup: TIER_GROUP,
    };
    syncPlateLook();
    veinsDirty = true;
  }
  /** Redraws the vessel layer (and the picture) if anything in it changed; true when it did. */
  function drawVeins() {
    if (!veins || veins.lost || !vLook || !F) return false;
    if (!CTM) refreshCTM();
    const m = CTM;
    const T = [vdpr * m.a, vdpr * m.b, vdpr * m.c, vdpr * m.d, vdpr * (m.e - wrapRect.left), vdpr * (m.f - wrapRect.top)];
    const key = T.map((v) => v.toFixed(3)).join(',') + `|${vCanvas.width}x${vCanvas.height}`;
    if (!veinsDirty && key === veinsDrawKey) return false;
    if (key !== veinsDrawKey && plateOn()) schedulePlateView();
    veinsDirty = false; veinsDrawKey = key;
    veins.draw(T, vLook, bloodLook());
    return true;
  }
  function clearJoins() {
    for (const x of Object.values(E)) if (x.joinKey) { x.joinKey = ''; for (const g of x.groups) g.removeAttribute('mask'); }
  }

  // ── The plate on the GPU ─────────────────────────────
  // The backdrop, organs and ascites are rasterized from the live SVG (styles inlined) into
  // textures the vessel layer draws first: one of the whole plate, and, once a pan or zoom has
  // settled, a sharper one of the view. The SVG is rasterized again only when what it shows
  // changes (cirrhosis, spleen size, ascites, congestion tint, theme, a selected organ); dimming
  // for a selection or a data layer is applied on the GPU. The SVG groups stay, hidden, for
  // picking organs and for exports.
  const PLATE_RECT = [200, -200, 1020, 1320];
  const PLATE_BASE = 1.2;          // px per world unit of the whole-plate raster
  let plateKey = '', plateSeq = 0, plateBusy = false, plateAgain = false, plateLast = 0, plateTimer = 0, plateView = null, plateViewKey = '', plateSettle = 0;
  const plateOn = () => wrap.classList.contains('gl-plate');
  function plateMarkup(rect, W, H) {
    const was = plateOn();
    wrap.classList.remove('gl-plate');
    const ser = new XMLSerializer();
    let out;
    try {
      const dc = defs.cloneNode(true); inlineStyles(defs, dc);
      out = ser.serializeToString(dc);
      for (const g of [gBackdrop, gOrgans, gAscites]) {
        const c = g.cloneNode(true);
        if (inlineStyles(g, c) === false) continue;
        c.removeAttribute('opacity');   // the plate fades with the morph on the GPU
        out += ser.serializeToString(c);
      }
    } finally { if (was) wrap.classList.add('gl-plate'); }
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="${rect.join(' ')}" preserveAspectRatio="none">${out}</svg>`;
  }
  async function rasterPlate(slot, rect, scale) {
    const W = Math.max(1, Math.round(rect[2] * scale)), H = Math.max(1, Math.round(rect[3] * scale));
    const seq = plateSeq;
    const url = URL.createObjectURL(new Blob([plateMarkup(rect, W, H)], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      if (seq !== plateSeq || !veins || veins.lost) return false;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      c.getContext('2d').drawImage(img, 0, 0, W, H);
      veins.setPlate(slot, c, rect);
      c.width = c.height = 0;
      return true;
    } finally { URL.revokeObjectURL(url); }
  }
  // What the plate shows, in coarse steps: re-rasterize when it changes.
  function plateStateKey() {
    const cs = getComputedStyle(wrap);
    return [liverKey, organG.liver.getAttribute('transform'), organG.spleen.getAttribute('transform')?.replace(/(\d\.\d\d)\d*/g, '$1'),
      Math.round((parseFloat(liverTint.style.opacity) || 0) * 40), liverNutmeg.getAttribute('opacity'), liverNodules.getAttribute('opacity'),
      organG.bowel.getAttribute('transform'), (ascitesPath.getAttribute('d') || '').slice(0, 48), (flank.getAttribute('d') || '').slice(0, 24), selOKey,
      cs.getPropertyValue('--stage-bg'), cs.getPropertyValue('--organ-liver'), wrap.classList.contains('imaging')].join('|');
  }
  function platePoke() {
    if (!veins || veins.lost || !glWanted(easeInOut(morph))) return;
    const key = plateStateKey();
    if (key === plateKey && veins.hasPlate(0)) return;
    if (plateBusy) { plateAgain = true; return; }
    const wait = Math.max(0, 500 - (performance.now() - plateLast));
    clearTimeout(plateTimer);
    plateTimer = setTimeout(async () => {
      plateBusy = true; plateLast = performance.now();
      const k = plateStateKey();
      plateSeq++;
      try {
        if (await rasterPlate(0, PLATE_RECT, PLATE_BASE)) {
          plateKey = k;
          veins.dropPlate(1); plateView = null; plateViewKey = '';
          if (!plateOn() && glWanted(easeInOut(morph))) wrap.classList.add('gl-plate');
          veinsDirty = true; syncPlateLook(); schedulePlateView();
        }
      } catch (e) { console.warn('Plate raster failed; the SVG plate stays.', e); }
      plateBusy = false;
      // The liver tint eases in over .6s; a raster taken mid-fade would keep the half-faded colour until the next click.
      const mid = Math.abs((parseFloat(getComputedStyle(liverTint).opacity) || 0) - (parseFloat(liverTint.style.opacity) || 0)) > 0.01;
      if (mid) { plateAgain = false; plateKey = ''; clearTimeout(plateTimer); plateTimer = 0; setTimeout(platePoke, 700); }
      else if (plateAgain) { plateAgain = false; platePoke(); }
    }, wait);
  }
  // After a pan or zoom settles, a raster of the view at the screen's resolution (when the
  // whole-plate raster would look soft there).
  function schedulePlateView() {
    clearTimeout(plateSettle);
    plateSettle = setTimeout(async () => {
      if (!veins || !plateOn() || !CTM) return;
      const need = vdpr * CTM.sc;
      if (need <= PLATE_BASE * 1.2) { if (veins.hasPlate(1)) { veins.dropPlate(1); veinsDirty = true; } return; }
      // The view in world units (the anatomy is never turned), with a margin, within the plate.
      const r = stageBox(), [ax, ay] = clientToWorldFast(r.left, r.top), [bx, by] = clientToWorldFast(r.right, r.bottom);
      const mx = (bx - ax) * 0.15, my = (by - ay) * 0.15;
      const x0 = Math.max(PLATE_RECT[0], ax - mx), y0 = Math.max(PLATE_RECT[1], ay - my);
      const x1 = Math.min(PLATE_RECT[0] + PLATE_RECT[2], bx + mx), y1 = Math.min(PLATE_RECT[1] + PLATE_RECT[3], by + my);
      if (x1 <= x0 || y1 <= y0) return;
      const scale = Math.min(need, 4096 / (x1 - x0), 4096 / (y1 - y0), Math.sqrt(4.2e6 / ((x1 - x0) * (y1 - y0))));
      const key = `${plateKey}|${x0.toFixed(0)},${y0.toFixed(0)},${x1.toFixed(0)},${y1.toFixed(0)}|${scale.toFixed(2)}`;
      if (key === plateViewKey) return;
      if (plateView && x0 >= plateView[0] && y0 >= plateView[1] && x1 <= plateView[2] && y1 <= plateView[3] && scale <= plateView[4] * 1.05) return;
      plateViewKey = key;
      try { if (await rasterPlate(1, [x0, y0, x1 - x0, y1 - y0], scale)) { plateView = [x0, y0, x1, y1, scale]; veinsDirty = true; } } catch { /* the whole-plate raster stays */ }
    }, 280);
  }
  function clientToWorldFast(cx, cy) {
    if (!CTM) refreshCTM();
    const { a, b, c, d, e, f } = CTM, det = a * d - b * c || 1, x = cx - e, y = cy - f;
    return [(d * x - c * y) / det, (-b * x + a * y) / det];
  }
  function syncPlateLook() {
    if (!vLook) return;
    const t = easeInOut(morph), dataLayer = wrap.classList.contains('data-layer');
    const dim = (wrap.classList.contains('has-sel') ? 0.72 : 1) * (dataLayer ? 0.72 : 1);
    vLook.plate = plateOn() ? { alpha: (1 - t) * dim, sat: dataLayer ? 0.12 : 1 } : null;
  }

  // Circuit liver module: collapsed unless asked for, selected into, or zoomed in on.
  function liverExpanded() {
    const sel = store.get().selection;
    return vt.k >= 1.9 || (sel?.type === 'edge' && LIVER_EDGES.has(sel.id)) || (sel?.type === 'node' && LIVER_INNER.has(sel.id));
  }

  // ── Model-driven transitions ──────────────────────
  // Nothing flashes or sweeps across the anatomy. Pressure change shows as the vessel's own color
  // easing; reversed flow is a steady state (its tracers run the other way);
  // the one animation is a collateral or shunt that opens, drawn on in the direction of its
  // flow, and, when it closes or is removed, retracted back the way it came. Nothing runs under
  // reduced motion or in the figure view.
  const track = {};
  const appEl = document.getElementById('app');
  const quietFx = () => reduceMotion.matches || isImaging();
  function trackChanges(f) {
    const now = performance.now();
    const quiet = quietFx();
    for (const x of Object.values(E)) {
      const e = x.e;
      const q = f.Qf ? f.Qf[EI[e.id]] : f.Q[EI[e.id]];
      const open = x.vis && !x.g.classList.contains('coll-ghost') && !x.reveal?.out;
      const was = track[e.id];
      track[e.id] = open;
      if (was === false && open && canFade(x) && !quiet) x.reveal = { t0: now, dur: e.kind === 'shunt' ? 900 : 1500, dir: q >= 0 ? 1 : -1 };
    }
  }
  // The vessels that come and go with the disease (collaterals, shunts, the epigastric veins that
  // open with the paraumbilical route) draw on when they appear and retract when they leave.
  const canFade = (x) => !x.isArt && (x.e.kind === 'collateral' || x.e.kind === 'shunt' || NEEDS_C3.has(x.e.id));
  function startExit(x, f) {
    const q = f.Qf ? f.Qf[EI[x.e.id]] : f.Q[EI[x.e.id]];
    x.reveal = { t0: performance.now(), dur: x.e.kind === 'shunt' ? 700 : 1100, dir: q >= 0 ? 1 : -1, out: true };
  }
  // When the retraction ends: hide the vessel, or leave the dotted outline of a closed collateral.
  function finishExit(x) {
    if (!F) return;
    if (!edgeVisible(x, F)) { setStyle(x, 'display', 'none'); if (x.heat) x.heat.style.display = 'none'; x.vis = false; }
    else if (x.e.kind === 'collateral' && !collOpen(x.e.id, F)) cls(x, 'coll-ghost', true);
  }
  const REVEAL_PARTS = ['shadow', 'wall', 'lumen', 'shade', 'sheen'];
  function stepReveals(now) {
    let finished = false;
    for (const x of Object.values(E)) {
      if (!x.reveal) continue;
      const r = x.reveal;
      const u = clamp((now - r.t0) / r.dur, 0, 1);
      const done = u >= 1 || quietFx();
      const off = (r.out ? easeInOut(u) : 1 - easeInOut(u)) * r.dir;
      for (const el of REVEAL_PARTS.map((part) => x[part]).concat(x.strands ? x.strands.flatMap((sd) => [sd.wall, sd.lumen]) : [])) {
        if (!el) continue;
        if (done) { el.removeAttribute('pathLength'); el.style.strokeDasharray = ''; el.style.strokeDashoffset = ''; continue; }
        el.setAttribute('pathLength', '1');
        el.style.strokeDasharray = '1 1';
        el.style.strokeDashoffset = off.toFixed(4);
      }
      if (done) { x.reveal = null; finished = true; if (r.out) finishExit(x); }
    }
    // Rebuild at once so the vessel turns from the drawn-on stroke into its shaded tube on the
    // same frame, rather than holding the stroke until the next model update.
    if (finished && F && !inUpdate) update(F);
    else if (veins && !inUpdate && Object.values(E).some((x) => x.reveal)) syncVeins(easeInOut(morph));
  }
  // Δ halos: after a change, the three places whose pressure moved most get a brief ring and
  // their change in mmHg, once the model has had a moment to respond. Answers "what did that do?"
  // without a sweep across the whole figure.
  const gHalo = s('g', { id: 'halos', 'aria-hidden': 'true' });
  gOver.after(gHalo);
  const gGlow = s('g', { id: 'deltaGlow', 'aria-hidden': 'true' });
  gFocus.after(gGlow);
  let haloBase = null, haloTimer = 0;
  // Opening or resuming the app restores parameters and the model settles; that is not a change to explain.
  let resumedAt = 0;
  document.addEventListener('visibilitychange', () => { resumedAt = performance.now(); });
  addEventListener('pageshow', () => { resumedAt = performance.now(); });
  store.on('params', () => {
    if (!F || quietFx() || performance.now() < 5000 || performance.now() - resumedAt < 4000) return;
    if (!haloBase) haloBase = { P: Float64Array.from(F.P), t: performance.now() };
    clearTimeout(haloBase.timer);
    haloBase.timer = setTimeout(() => { if (F && haloBase) { haloBase.t = 0; stepHalos(F, easeInOut(morph)); } }, 1200);
  });
  // Loading a patient (or going back to one) is not a change to explain: no halos, and none left
  // over in a view they no longer mark.
  function dropHalos() {
    if (haloBase) clearTimeout(haloBase.timer);
    haloBase = null;
    clearTimeout(haloTimer);
    gHalo.replaceChildren(); gGlow.replaceChildren();
  }
  store.on('presetId', dropHalos);
  store.on('view', dropHalos);
  function stepHalos(f, t) {
    if (!haloBase || performance.now() - haloBase.t < 1100) return;
    const base = haloBase.P; haloBase = null;
    if (quietFx() || !f.P) return;
    const cand = [];
    for (const n of NODES) {
      if (n.kind === 'wedge' || HIDDEN_NODES.has(n.id) || !NODE_POS[n.id]) continue;
      const d = f.P[NI[n.id]] - base[NI[n.id]];
      if (Math.abs(d) >= 1) cand.push([n.id, d]);
    }
    cand.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    clearTimeout(haloTimer);
    // The vessels whose pressure moved by 2 mmHg or more glow briefly (warm: up, cool: down), so the
    // reach of a change shows along the network, not only at the three rings.
    const glows = [];
    for (const e of EDGES) {
      const x = E[e.id];
      if (!x?.vis || x.isArt || e.kind === 'wedge' || x.g.classList.contains('coll-ghost')) continue;
      const d = (f.P[NI[e.from]] + f.P[NI[e.to]] - base[NI[e.from]] - base[NI[e.to]]) / 2;
      if (Math.abs(d) >= 2) glows.push([x, d]);
    }
    glows.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    gGlow.replaceChildren(...glows.slice(0, 16).map(([x, d]) => s('path', { class: 'delta-glow ' + (d > 0 ? 'up' : 'down'), d: x.wall.getAttribute('d'), 'stroke-width': ((x.width || 6) + 14).toFixed(1) })));
    gHalo.replaceChildren(...cand.slice(0, 3).map(([id, d]) => {
      const [x, y] = nodePos(id, t);
      return s('g', { class: 'halo ' + (d > 0 ? 'up' : 'down'), transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` },
        s('circle', { r: 16 }), s('text', { y: -24, 'text-anchor': 'middle' }, `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(Math.abs(d) < 10 ? 1 : 0)}`));
    }));
    haloTimer = setTimeout(() => { gHalo.replaceChildren(); gGlow.replaceChildren(); }, 1700);
  }

  // A selected organ keeps a quiet outline; a selected site (varices, fundus, abdomen) a ring.
  const gSelO = s('g', { id: 'organSel' });
  gOver.after(gSelO);
  let selOKey = '', selLine = null, selFluid = null;
  function syncSelFluid() {
    if (!selFluid) return;
    selFluid.fill.setAttribute('d', ascitesPath.getAttribute('d') || '');
    selFluid.line.setAttribute('d', ascitesLine.getAttribute('d') || '');
  }
  function syncSelLine() {
    if (!selLine) return;
    const d = organEls[selLine.id].getAttribute('d'), tr = organG[selLine.id].getAttribute('transform');
    if (selLine.el.getAttribute('d') !== d) selLine.el.setAttribute('d', d);
    if (tr) selLine.el.setAttribute('transform', tr); else selLine.el.removeAttribute('transform');
  }
  function updateOrganSel(sel, t) {
    const o = sel?.type === 'organ' && t < 0.5 ? sel.id : null;
    const key = o ? o + (sel.lobe || '') : '';
    if (key === selOKey) return;
    selOKey = key;
    for (const g of Object.values(organG)) g.classList.remove('org-sel');
    gSelO.replaceChildren(); selLine = null; selFluid = null;
    if (!o) return;
    const byOrgan = { liver: ['liver'], heart: ['heart'], spleen: ['spleen'] }[o];
    if (byOrgan) {
      for (const id of byOrgan) organG[id]?.classList.add('org-sel');
      // The outline follows the organ as drawn now (a cirrhotic liver's reshaped contour, an
      // enlarged spleen), not its healthy outline.
      if (organEls[byOrgan[0]]?.getAttribute('d')) { selLine = { id: byOrgan[0], el: s('path', { class: 'org-sel-line' }) }; syncSelLine(); gSelO.append(selLine.el); }
      return;
    }
    if (o === 'abdomen') {   // the fluid as drawn; it follows the volume (see syncSelFluid)
      const cg = s('g', { 'clip-path': 'url(#abdomenClip)' });
      selFluid = { fill: s('path', { class: 'org-sel-fluid' }), line: s('path', { class: 'org-sel-line' }) };
      cg.append(selFluid.fill, selFluid.line); gSelO.append(cg); syncSelFluid();
      return;
    }
    
  }

  // Circuit bridges: where two lines cross without meeting, the one drawn later hops over the
  // other, as on a transit map, so a crossing never reads as a junction.
  const gBridges = s('g', { id: 'bridges', 'aria-hidden': 'true' });
  gEdges.after(gBridges);
  let bridgeKey = '';
  function segX(a, b, c, d) {
    const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]];
    const den = r[0] * q[1] - r[1] * q[0];
    if (Math.abs(den) < 1e-9) return null;
    const u = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den, v = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    // Half-open, so a crossing that falls exactly on a sample vertex is counted once, not missed.
    return u >= 0 && u < 1 && v >= 0 && v < 1 ? [a[0] + r[0] * u, a[1] + r[1] * u, r[0], r[1]] : null;
  }
  function updateBridges(t) {
    // The GPU draws crossings itself (each tier passes over the one below with its own border).
    if (wrap.classList.contains('gl-on')) { if (bridgeKey) { bridgeKey = ''; gBridges.replaceChildren(); } return; }
    const vis = t === 1 ? Object.values(E).filter((x) => x.vis && !x.isArt && !x.g.classList.contains('coll-ghost') && x.g.style.display !== 'none') : [];
    const key = vis.map((x) => x.e.id + ':' + x.width.toFixed(0)).join(',');
    if (key === bridgeKey) return;
    bridgeKey = key;
    gBridges.replaceChildren();
    if (!vis.length) return;
    const order = new Map([...gNet.querySelectorAll('.vg[data-id]'), ...gTopL.querySelectorAll('.vg[data-id]')].map((g, i) => [g, i]));
    const box = (pts) => pts.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
    const boxes = vis.map((x) => box(geo[x.e.id].cur));
    const out = [];
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      const A = vis[i], B = vis[j], a = boxes[i], b = boxes[j];
      if (a[0] > b[2] || b[0] > a[2] || a[1] > b[3] || b[1] > a[3]) continue;
      // Lines that share a station meet there: where they leave it along a common stretch and
      // then fork, their sampled courses graze each other, which is a fork, not a crossing.
      if (A.e.from === B.e.from || A.e.from === B.e.to || A.e.to === B.e.from || A.e.to === B.e.to) continue;
      const pa = geo[A.e.id].cur, pb = geo[B.e.id].cur;
      const ends = [pa[0], pa[pa.length - 1], pb[0], pb[pb.length - 1]];
      for (let m = 1; m < pa.length; m++) for (let n = 1; n < pb.length; n++) {
        const hit = segX(pa[m - 1], pa[m], pb[n - 1], pb[n]);
        if (!hit || ends.some((q) => Math.hypot(q[0] - hit[0], q[1] - hit[1]) < 10)) continue;
        // A real crossing is at a clear angle; near-parallel courses only brush past each other.
        const bx = pb[n][0] - pb[n - 1][0], by = pb[n][1] - pb[n - 1][1];
        const sin = Math.abs(hit[2] * by - hit[3] * bx) / ((Math.hypot(hit[2], hit[3]) * Math.hypot(bx, by)) || 1);
        if (sin < 0.35) continue;
        const [up, lo] = (order.get(A.g) ?? 0) > (order.get(B.g) ?? 0) ? [A, B] : [B, A];
        const dir = up === A ? [hit[2], hit[3]] : [pb[n][0] - pb[n - 1][0], pb[n][1] - pb[n - 1][1]];
        const L = Math.hypot(dir[0], dir[1]) || 1, half = (lo.width + 2 * lo.wallPx) / 2 + 10;
        const ux = (dir[0] / L) * half, uy = (dir[1] / L) * half;
        const d = `M${(hit[0] - ux).toFixed(1)} ${(hit[1] - uy).toFixed(1)} L${(hit[0] + ux).toFixed(1)} ${(hit[1] + uy).toFixed(1)}`;
        const W = up.width + 2 * up.wallPx;
        out.push(s('path', { class: 'bridge-gap', d, 'stroke-width': (W + 10).toFixed(1) }),
          s('path', { class: 'v-wall bridge-wall', d, 'stroke-width': W.toFixed(1) }),
          s('path', { class: 'v-lumen bridge-lumen', d, stroke: `url(#gr-${up.e.id})`, 'stroke-width': up.width.toFixed(1) }));
      }
    }
    gBridges.append(...out);
  }

  // Where a lesson step or case asks the learner to act.
  function updateFocus() {
    const foc = store.get().focus;
    const ids = (foc?.edges || []).filter((id) => E[id]?.vis);
    const key = ids.join(',') + '|' + ids.map((id) => E[id].width.toFixed(0)).join(',') + '|' + lastMorph;
    if (gFocus._k === key) return;
    gFocus._k = key;
    gFocus.replaceChildren(...ids.map((id) => s('path', { class: 'focus-ring', d: E[id].wall.getAttribute('d'), 'stroke-width': (E[id].width + 16).toFixed(1) })));
  }

  function isReversed(e, f) {
    const q = f.Qf[EI[e.id]];
    const ref = st0Ref(e.id);
    return q < -Math.max(0.12, 0.02 * Math.abs(ref));
  }
  const st0Ref = (id) => store.get().healthy?.Q?.[EI[id]] ?? 1;

  function updateNodesCircuit(f) {
    if (morph < 0.02) return;
    for (const n of NODES) {
      if (!nodeEls[n.id]) continue;
      nodeEls[n.id].c.style.display = nodeVisible(n.id) ? '' : 'none';
    }
    for (const [id, r] of Object.entries(liverR)) {
      const k = EI[id];
      const q = f.Q[k];
      const dp = f.P[NI[EDGES[k].from]] - f.P[NI[EDGES[k].to]];
      r.R = Math.abs(q) > 1e-3 ? dp / (q * 0.06) : Infinity;
    }
  }

  function updateOrgans(f, p, t) {
    const k = 1 - t;
    const imaging = isImaging();
    liverNodules.setAttribute('opacity', (Math.min(1, p.cirrhosis) * 0.75 * k).toFixed(2));
    morphLiver(p.cirrhosis);
    const psin = Math.max(f.P[NI.SIN_R], f.P[NI.SIN_L]);
    liverTint.style.opacity = imaging ? 0 : (clamp((psin - 8) / 16, 0, 1) * 0.5 * k).toFixed(3);
    const hp = store.get().healthy?.P;
    const cvUp = hp ? Math.max(f.P[NI.CV_R] - hp[NI.CV_R], f.P[NI.CV_L] - hp[NI.CV_L]) : 0;
    liverNutmeg.setAttribute('opacity', imaging ? 0 : (clamp((cvUp - 4) / 10, 0, 1) * 0.6 * k).toFixed(2));
    // A cirrhotic liver shrinks a little; a congested one does not.
    const shrink = 1 - 0.035 * Math.min(1, p.cirrhosis);
    organG.liver.setAttribute('transform', `translate(560 350) scale(${shrink.toFixed(4)}) translate(-560 -350)`);
    const c3 = recruitFrac('C3', f);
    abdWall.setAttribute('opacity', (clamp((c3 - 0.1) / 0.4, 0, 1) * 0.9 * k).toFixed(2));
    const sc = f.slow.spleen / 11;
    organG.spleen.setAttribute('transform', `translate(${SPLEEN_CENTER[0]} ${SPLEEN_CENTER[1]}) scale(${sc.toFixed(3)}) translate(${-SPLEEN_CENTER[0]} ${-SPLEEN_CENTER[1]})`);
    organG.spleen.style.opacity = p.splenicRx === 2 ? '0.14' : '';
    syncSelLine();
    // Ascites collects in the flanks and the pelvis first (supine patient, frontal view), so its
    // surface is a meniscus: highest at the sides, lowest in the middle. The abdominal wall bulges
    // and the bowel floats up on it. A slow ripple runs along the surface.
    const V = f.slow.ascites;
    const u = clamp(V / 11000, 0, 1);
    const bulge = u * 34;
    flank.setAttribute('d', u < 0.04 ? '' : `M336 470 C ${324 - bulge} 610 ${330 - bulge} 780 ${372 - bulge * 0.4} 954 M1088 470 C ${1100 + bulge} 610 ${1094 + bulge} 780 ${1052 + bulge * 0.4} 954 M${372 - bulge * 0.4} 954 C 470 1012 970 1012 ${1052 + bulge * 0.4} 954`);
    organG.bowel.setAttribute('transform', `translate(0 ${(-u * 26).toFixed(1)})`);
    // The fluid level rises on a compressed scale (u^0.6), so a grade 1–2 effusion is a visible pool, not a sliver.
    const uv = Math.pow(u, 0.6);
    const hgt = plateOn() ? Math.round(uv * 110) * 3 : uv * 330;
    fluidSurf = null;
    if (hgt < 3) { ascitesPath.setAttribute('d', ''); ascitesLine.setAttribute('d', ''); ascitesGlint.setAttribute('d', ''); }
    else {
      // On the GPU the plate is a raster: the surface holds still (no ripple) and rises in steps.
      const floor = ABDOMEN_FLOOR + 5, ph = reduceMotion.matches || plateOn() ? 0 : (performance.now() / 1100) % (Math.PI * 2);
      const surf = (x) => { const c = (x - 712) / 400; return floor - hgt * (0.55 + 0.45 * c * c) + Math.sin(x / 38 + ph) * 1.6 * Math.min(1, uv * 4); };
      fluidSurf = surf;
      let line = '';
      for (let x = 296; x <= 1128; x += 16) line += `${x === 296 ? 'M' : ' L'}${x} ${surf(x).toFixed(1)}`;
      ascitesLine.setAttribute('d', line);
      ascitesPath.setAttribute('d', `${line} L 1128 ${floor + 70} L 296 ${floor + 70} Z`);   // down past the rounded pelvic floor; the clip shapes it
      let glint = '';
      for (let x = 470; x <= 950; x += 16) glint += `${x === 470 ? 'M' : ' L'}${x} ${(surf(x) + 5).toFixed(1)}`;
      ascitesGlint.setAttribute('d', glint);
    }
    syncSelFluid();
    platePoke();
  }

  // Point, unit normal and unit tangent at arc length `d` along a vessel's current centerline.
  function frameAt(id, d) {
    const g = geo[id];
    const [x, y, dx, dy] = pointAt(g.cur, clamp(d / (g.len || 1), 0, 1));
    const n = Math.hypot(dx, dy) || 1;
    return { x, y, tx: dx / n, ty: dy / n, nx: -dy / n, ny: dx / n };
  }
  // TIPS: a self-expanding metal stent over the lumen (two rails, a diamond lattice of struts,
  // radiopaque markers at both ends), so the shunt reads as a device, not a vessel.
  function stentMesh(id) {
    const x = E[id], L = geo[id].len;
    const R = x.width / 2 + (x.wallPx || 1) + 1.2;
    const f = (d, side) => { const q = frameAt(id, d); return [q.x + q.nx * R * side, q.y + q.ny * R * side]; };
    const P = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    const d0 = 2, d1 = L - 2, cell = Math.max(6, R * 1.7);
    let rails = '', struts = '';
    for (const side of [1, -1]) {
      rails += 'M' + P(f(d0, side));
      for (let d = d0 + 3; d < d1; d += 3) rails += ' L' + P(f(d, side));
      rails += ' L' + P(f(d1, side)) + ' ';
    }
    for (const start of [1, -1]) {
      let side = start;
      struts += 'M' + P(f(d0, side));
      for (let d = d0 + cell / 2; d <= d1 + 0.01; d += cell / 2) { side = -side; struts += ' L' + P(f(Math.min(d, d1), side)); }
      struts += ' ';
    }
    let marks = '';
    for (const d of [d0, d1]) { const a = f(d, 1), b = f(d, -1); marks += `M${P(a)} L${P(b)} `; }
    ov.stents.append(s('path', { class: 'stent-strut', d: struts }), s('path', { class: 'stent-rail', d: rails }), s('path', { class: 'stent-rail-glint', d: rails }), s('path', { class: 'stent-mark', d: marks }));
  }
  // Surgical shunts: a row of sutures across each anastomosis.
  function anastomoses(id) {
    const x = E[id], L = geo[id].len;
    const R = x.width / 2 + (x.wallPx || 1) + 2;
    let d = '';
    for (const c of [Math.min(10, L * 0.1), Math.max(L - 10, L * 0.9)]) for (const o of [-3.5, 0, 3.5]) {
      const q = frameAt(id, c + o);
      d += `M${(q.x + q.nx * R).toFixed(1)} ${(q.y + q.ny * R).toFixed(1)} L${(q.x - q.nx * R).toFixed(1)} ${(q.y - q.ny * R).toFixed(1)} `;
    }
    ov.stents.append(s('path', { class: 'suture', d }));
  }

  // ── The HVPG catheter (Measure › HVPG) ─────────────
  // A balloon catheter drawn along the real vessels: in from the neck, down the SVC, through the right
  // atrium into the IVC and out into the right hepatic vein, where its tip reads the pressure. In
  // front of the inflated balloon the still column fills with the wedged (sinusoidal) pressure. The
  // readings are labels at the tip, in screen pixels. hvpg-proc.js drives it frame by frame.
  const cath = (() => {
    const g = s('g', { class: 'cath', 'aria-hidden': 'true' });
    const column = s('path', { class: 'cath-column' }), column2 = s('path', { class: 'cath-column' });
    const shadow = s('path', { class: 'cath-shadow' }), body = s('path', { class: 'cath-body' });
    const balloon = s('ellipse', { class: 'cath-balloon' }), ring = s('circle', { class: 'cath-ring' }), tip = s('circle', { class: 'cath-tip' });
    g.append(column, column2, shadow, body, balloon, ring, tip);
    g.style.display = 'none';
    gOver.append(g);
    const labels = document.createElement('div');
    labels.className = 'cath-labels'; labels.setAttribute('aria-hidden', 'true');
    wrap.append(labels);
    return { g, column, column2, shadow, body, balloon, ring, tip, labels, st: null, at: null, saved: null };
  })();
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
  // the vein exactly. Held for the procedure: a vessel's drawn caliber pulses with its pressure.
  function cathRoute() {
    if (morph > 0.01 || CATH_IDS.some((id) => !geo[id]?.cur?.length || !E[id])) return null;
    if (cath.route) return cath.route;
    const radOf = (id, f) => {
      const R = E[id].glR;
      if (!R?.length) return Math.max(0.5, E[id].width / 2);
      const x = clamp(f, 0, 1) * (R.length - 1), i = Math.min(R.length - 2, Math.floor(x));
      return lerp(R[i], R[i + 1], x - i);
    };
    const svc = geo.SVC_RA.cur, top = svc[0], pts = [], rad = [], marks = [];
    const add = (id, rev) => {
      const P = rev ? geo[id].cur.slice().reverse() : geo[id].cur, c = lenTo(P), n = c[c.length - 1] || 1;
      marks.push(pts.length);
      for (let i = 1; i < P.length; i++) { pts.push(P[i]); rad.push(radOf(id, rev ? 1 - c[i] / n : c[i] / n)); }
    };
    marks.push(0);
    for (const q of [[top[0] - 6, top[1] - 150], [top[0] - 2, top[1] - 60], top]) { pts.push(q); rad.push(radOf('SVC_RA', 0)); }
    add('SVC_RA', false); add('IVCS_RA', true);
    // On down the middle of the IVC to the level where the right hepatic vein opens into it.
    const ost = geo.RHV_IVC.cur[geo.RHV_IVC.cur.length - 1];
    if (geo.IVC_IS?.cur?.length && E.IVC_IS) {
      const P = geo.IVC_IS.cur.slice().reverse(), c = lenTo(P), n = c[c.length - 1] || 1;
      for (let i = 1; i < P.length && P[i][1] < ost[1] - 4; i++) { pts.push(P[i]); rad.push(radOf('IVC_IS', 1 - c[i] / n)); }
    }
    add('RHV_IVC', true); add('POST_R_RHV', true);
    // The vessels' courses meet at corners (the IVC turns into the hepatic vein at its side): the
    // catheter bends through them as a wire does. Resampled evenly, then smoothed with a window as wide
    // as the vein there, so the curve stays inside the lumen.
    const c0 = lenTo(pts), H = 1.2, n = Math.max(2, Math.ceil(c0[c0.length - 1] / H) + 1);
    let P = [], Rr = [], j = 1;
    for (let i = 0; i < n; i++) {
      const d = (c0[c0.length - 1] * i) / (n - 1);
      while (j < c0.length - 1 && c0[j] < d) j++;
      const u = c0[j] > c0[j - 1] ? clamp((d - c0[j - 1]) / (c0[j] - c0[j - 1]), 0, 1) : 0;
      P.push([lerp(pts[j - 1][0], pts[j][0], u), lerp(pts[j - 1][1], pts[j][1], u)]); Rr.push(lerp(rad[j - 1], rad[j], u));
    }
    const idx = marks.map((m) => Math.round((c0[Math.min(m, c0.length - 1)] / c0[c0.length - 1]) * (n - 1)));
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
    const cum = lenTo(P), L = (i) => cum[Math.min(idx[i], cum.length - 1)];
    // The tip reads in the trunk of the right hepatic vein, about two thirds of the way out from the IVC.
    const hv0 = L(3), hv1 = L(4);
    const r = { pts: P, rad: Rr, cum, total: cum[cum.length - 1], start: L(1) * 0.55, free: hv0 + (hv1 - hv0) * 0.62, hv0, hvEnd: hv1 };
    if (E.RHV_IVC.glR?.length) cath.route = r;
    return r;
  }
  /** The point, direction and lumen radius at length d along the route. */
  function cathAt(r, d) {
    d = clamp(d, 0, r.total);
    let i = 1;
    while (i < r.cum.length - 1 && r.cum[i] < d) i++;
    const s0 = r.cum[i - 1], s1 = r.cum[i], u = s1 > s0 ? (d - s0) / (s1 - s0) : 0, a = r.pts[i - 1], b = r.pts[i];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { p: [lerp(a[0], b[0], u), lerp(a[1], b[1], u)], t: [(b[0] - a[0]) / l, (b[1] - a[1]) / l], r: lerp(r.rad[i - 1], r.rad[i], u) };
  }
  function cathPaint() {
    const st = cath.st, r = st && cathRoute();
    const gpu = !!r && glWanted() && veins.canCath;
    cath.g.style.display = r && !gpu ? '' : 'none';
    cath.labels.hidden = !r;
    if (!r) { if (veins?.canCath) veins.setCath(null); return; }
    if (!CTM) refreshCTM();
    const tipD = r.start + (r.free - r.start) * clamp(st.u, 0, 1);
    const Rf = cathAt(r, r.free).r;
    // A 5 F catheter in the hepatic vein, held at one width in the world for the whole procedure (never
    // thinner than about 3 px at the start, nor so thick it crowds the vein), so it scales with the anatomy as the camera moves.
    if (!cath.rc) cath.rc = clamp(1.5 / (CTM.sc || 1), Rf * 0.17, Rf * 0.28);
    const rc = cath.rc, ahead = cathAt(r, Math.min(r.total, tipD + Rf * 6.4));
    const tp = cathAt(r, tipD);
    cath.at = { tip: tp.p, ahead: ahead.p, nx: -tp.t[1], ny: tp.t[0] };
    // The wedged reading: the vein beyond the balloon, out toward the sinusoids, takes the wedged
    // pressure's color in the vessel's own rendering, filling outward as the column settles.
    let tint = null;
    const col = clamp(st.column || 0, 0, 1);
    if (gpu && col > 0.001) {
      const a = tipD - rc * 4.2, reach = a + (r.total - a) * col, soft = Rf * 1.2;
      const hv = (d) => 1 - (d - r.hv0) / (r.hvEnd - r.hv0), br = (d) => 1 - (d - r.hvEnd) / (r.total - r.hvEnd);
      tint = { col: st.columnColor || '#a33', soft, RHV_IVC: [hv(Math.min(reach, r.hvEnd)), hv(a)] };
      if (reach >= r.hvEnd) tint.RHV_IVC[0] = -1;   // runs on into the branch: no edge at the join
      if (reach > r.hvEnd) tint.POST_R_RHV = [br(reach), 2];
    }
    const tk = tint ? `${tint.col}|${tint.RHV_IVC.map((v) => v.toFixed(3))}|${tint.POST_R_RHV?.[0].toFixed(3) ?? ''}` : '';
    if (tk !== cath.tintKey) { cath.tintKey = tk; cathTint = tint; if (!inUpdate) syncVeins(easeInOut(morph)); }
    if (gpu) cathGL(st, r, tipD, rc);
    else cathSVG(st, r, tipD, rc * 2, Rf * 2);
    cathVer++;
    cathLabels();
  }
  let cathVer = 0;
  // On the GPU (veins-gl.js): the still column, the shaft and its shadow, the marker band and rounded tip,
  // the balloon behind the tip and the reading ripples, as tubes and discs in world units.
  function cathGL(st, r, tipD, rc) {
    const V = [], draws = [], op = st.opacity ?? 1, cs = getComputedStyle(wrap);
    const begin = () => V.length / 6;
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
    const shaft = [0.93, 0.95, 0.98];
    tube(0, tipD - rc * 0.4, () => rc * 2.1, 0, [0.03, 0.05, 0.12], 0.34, [60, 0], rc * 0.7, rc * 1.1);
    tube(0, tipD - rc * 0.4, () => rc, 2, shaft, 1, [60, 0]);
    // The pressure-reading tip: a dark marker band, then the rounded end.
    tube(Math.max(0, tipD - rc * 3.2), tipD - rc * 1.6, () => rc * 1.06, 3, [0.2, 0.23, 0.29], 1, [0, 0]);
    const tp = cathAt(r, tipD);
    disc(tp.p, tp.t, rc, rc, 4, shaft, 1);
    // The balloon sits just behind the tip; inflated, it fills the vein and wedges.
    const bl = clamp(st.balloon || 0, 0, 1);
    if (bl > 0.001) {
      const gap = rc * 4.2, Rb = cathAt(r, tipD - gap - rFree(r) * 1.6).r;
      const rx = lerp(rc * 3.4, Rb * 1.6, bl), ry = lerp(rc * 1.35, Rb * 1.12, bl), bc = cathAt(r, tipD - gap - rx);
      disc(bc.p, bc.t, rx, ry, 5, [0.99, 0.9, 0.7], 0.55 + 0.45 * bl);   // latex
    }
    // The tip reading: two ripples running out from it.
    if (st.ring) {
      const rgb = toRGB(st.ring, cs), ph = ((st.clock || 0) / 1300) % 1;
      for (const k of [ph, (ph + 0.5) % 1]) disc(tp.p, tp.t, rc * (1.6 + 4.2 * k), rc * (1.6 + 4.2 * k), 6, rgb, (1 - k) * (1 - k) * 0.9);
    }
    veins.setCath({ verts: new Float32Array(V), draws, light: LIGHT });
  }
  const rFree = (r) => cathAt(r, r.free).r;
  // Without WebGL: the same catheter in SVG.
  function cathSVG(st, r, tipD, cw, wHV) {
    const body = cutLen(r.pts, r.cum, 0, tipD), d = polyD(body), tp = body[body.length - 1], pre = body[Math.max(0, body.length - 3)];
    for (const el of [cath.shadow, cath.body]) el.setAttribute('d', d);
    cath.shadow.setAttribute('stroke-width', (cw * 1.6).toFixed(2)); cath.body.setAttribute('stroke-width', cw.toFixed(2));
    const ang = Math.atan2(tp[1] - pre[1], tp[0] - pre[0]), ux = Math.cos(ang), uy = Math.sin(ang);
    cath.tip.setAttribute('cx', tp[0].toFixed(2)); cath.tip.setAttribute('cy', tp[1].toFixed(2)); cath.tip.setAttribute('r', (cw * 0.85).toFixed(2));
    cath.ring.setAttribute('cx', tp[0].toFixed(2)); cath.ring.setAttribute('cy', tp[1].toFixed(2));
    cath.ring.setAttribute('r', (cw * (1.8 + 0.8 * (st.pulse || 0))).toFixed(2)); cath.ring.style.display = st.ring ? '' : 'none';
    cath.ring.style.stroke = st.ring || '';
    const bl = clamp(st.balloon || 0, 0, 1), rx = wHV * (0.45 + 0.35 * bl), bcx = tp[0] - ux * (rx + cw * 1.5), bcy = tp[1] - uy * (rx + cw * 1.5);
    cath.balloon.style.display = bl > 0 ? '' : 'none';
    cath.balloon.setAttribute('cx', bcx.toFixed(2)); cath.balloon.setAttribute('cy', bcy.toFixed(2));
    cath.balloon.setAttribute('rx', rx.toFixed(2)); cath.balloon.setAttribute('ry', (cw * 0.65 + (wHV * 0.47 - cw * 0.65) * bl).toFixed(2));
    cath.balloon.setAttribute('transform', `rotate(${(ang * 180 / Math.PI).toFixed(1)} ${bcx.toFixed(2)} ${bcy.toFixed(2)})`);
    const col = clamp(st.column || 0, 0, 1), reach = tipD + (r.total - tipD) * col;
    const a = cutLen(r.pts, r.cum, tipD, reach);
    cath.column.setAttribute('d', a.length > 1 ? polyD(a) : ''); cath.column.setAttribute('stroke-width', (wHV * 0.82).toFixed(2));
    cath.column2.setAttribute('d', '');
    cath.column.style.stroke = st.columnColor || '';
    cath.g.style.opacity = st.opacity ?? 1;
  }
  function cathLabels() {
    const st = cath.st, at = cath.at;
    if (!st || !at) { cath.labels.replaceChildren(); return; }
    // Rebuilt only when which labels show changes (each pops in once); their numbers update in place.
    const want = (st.labels || []).map((l) => l.key + '|' + (l.cls || '')).join('/');
    if (cath.labels.dataset.k !== want) {
      cath.labels.dataset.k = want;
      cath.labels.replaceChildren(...(st.labels || []).map((l) => {
        const el = document.createElement('div');
        el.className = 'cath-label ' + (l.cls || ''); el.dataset.at = l.at;
        if (l.kicker) { const k = document.createElement('small'); k.textContent = l.kicker; el.append(k); }
        const b = document.createElement('b'); b.textContent = l.text; el.append(b);
        if (l.unit) { const u = document.createElement('span'); u.textContent = l.unit; el.append(u); }
        return el;
      }));
    }
    [...cath.labels.children].forEach((el, i) => {
      const l = st.labels[i];
      if (el.firstChild.textContent !== l.kicker && l.kicker) el.firstChild.textContent = l.kicker;
      const b = el.querySelector('b'); if (b.textContent !== l.text) b.textContent = l.text;
      const p = el.dataset.at === 'ahead' ? at.ahead : at.tip;
      const [x, y] = worldToLocal(p[0], p[1]);
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    });
  }
  // The camera for the procedure: the route, the tip close up, then back where it was.
  function cathFocus(mode, ms = 700) {
    const r = cathRoute();
    if (mode === 'home') { if (cath.saved) animateVT(cath.saved, ms); cath.saved = null; return true; }
    if (!r) return false;
    if (!cath.saved) cath.saved = { ...(vtTarget && vtAnim ? vtTarget : vt) };
    const wr = wrap.getBoundingClientRect(), ins = safeInsets();
    const [fx0, fy0] = clientToVB(wr.left + ins.l, wr.top + ins.t), [fx1, fy1] = clientToVB(wr.left + ins.W - ins.r, wr.top + ins.H - ins.b);
    let cx, cy, k;
    if (mode === 'tip') {
      const tp = cutLen(r.pts, r.cum, 0, r.free).at(-1);
      cx = tp[0]; cy = tp[1]; k = 5;
    } else {
      const seg = cutLen(r.pts, r.cum, r.start * 0.5, r.hvEnd);
      const xs = seg.map((q) => q[0]), ys = seg.map((q) => q[1]), x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 30, y0 = Math.min(...ys) - 30, y1 = Math.max(...ys) + 30;
      cx = (x0 + x1) / 2; cy = (y0 + y1) / 2; k = clamp(Math.min((fx1 - fx0) / (x1 - x0), (fy1 - fy0) / (y1 - y0)) * 0.9, 1, 2.6);
    }
    animateVT({ k, x: (fx0 + fx1) / 2 - cx * k, y: (fy0 + fy1) / 2 - cy * k }, ms);
    return true;
  }

  // Overlays (stenosis, thrombus, stents, varices, balloons, catheter…)
  // The overlays (clamps, clots, stents, varices, caput medusae, balloons, catheter) are rebuilt
  // only when something they draw has visibly changed: the key holds every input, rounded.
  let overlayKey = '';
  // A quantized value that only moves once the input has clearly left its step (so a varix whose
  // diameter pulses across a rounding boundary is not rebuilt on every beat).
  const held = {};
  const hold = (k, v, step) => { const h0 = held[k]; if (h0 == null || Math.abs(v - h0) > step * 0.75) held[k] = Math.round(v / step) * step; return held[k]; };
  function overlayInputs(f, p, t) {
    const m = f.metrics;
    const lesions = [...Object.keys(p.stenosis), ...Object.keys(p.thrombus), ...Object.keys(p.occluded), 'TIPS', 'DIPS', 'S_PC', 'S_DSR', 'S_MC', ...Object.keys(p.customShunts || {}), 'C3'];
    return JSON.stringify([t.toFixed(3), isImaging(), p.stenosis, p.thrombus, p.occluded, p.splenicRx | 0, p.tips, p.dips, p.customShunts, p.balloonEso, p.balloonGas,
      lesions.map((id) => (E[id] ? [E[id].vis, E[id].width, !!E[id].reveal] : 0)),
      // Varix geometry follows the grade, not the pulse: red wales appear above 70 % of the
      // rupture threshold, in coarse steps.
      hold('vd', m.varix.d, 0.5), hold('vr', m.varix.r, 0.5), m.varix.ratio > 0.7 ? hold('vt', m.varix.ratio, 0.2) : 0, Math.round(f.bands || 0),
      hold('gd', m.gastricVarix.d, 0.5), hold('c3', recruitFrac('C3', f), 0.1), lastMorph]);
  }
  const setVar = (el, k, v) => { const c = el._v || (el._v = {}); if (c[k] === v) return; c[k] = v; el.style.setProperty(k, v); };
  function updateOverlays(f, p, gain, t) {
    // Colors follow pressure continuously through CSS variables; geometry rebuilds only on change.
    const PM = f.Pf || f.P;
    setVar(ov.varices, '--vx', pressureColor(qP(PM[NI.VAR])));
    setVar(ov.gvarices, '--vx', pressureColor(qP(PM[NI.GV])));
    const key = overlayInputs(f, p, t);
    if (key === overlayKey) return;
    overlayKey = key;
    const anat = t < 0.5;
    // stenosis clamps & thrombi
    ov.clamps.innerHTML = ''; ov.thrombi.innerHTML = ''; ov.stents.innerHTML = ''; ov.plugs.innerHTML = '';
    const hideDx = isImaging();
    for (const [id, v] of Object.entries(p.stenosis)) {
      if (hideDx || !(v > 0) || !E[id] || !E[id].vis) continue;
      const [x, y, dx, dy] = pointAt(geo[id].cur, stenosisAt[id] ?? 0.5);
      const n = Math.hypot(dx, dy) || 1, nx = -dy / n, ny = dx / n;
      const off = (E[id].width / 2) * (1 - v) + 3;
      for (const sgn of [1, -1]) {
        const bx = x + nx * sgn * (off + 8), by = y + ny * sgn * (off + 8);
        const tx = x + nx * sgn * off, ty = y + ny * sgn * off;
        const ux = dx / n * 4.5, uy = dy / n * 4.5;
        ov.clamps.append(s('path', { class: 'clamp', d: `M${tx} ${ty} L ${bx + ux} ${by + uy} L ${bx - ux} ${by - uy} Z` }));
      }
      ov.clamps.append(s('text', { x: x + nx * (off + 16) + 4, y: y + ny * (off + 16) + 4, class: 'clamp-label' }, document.createTextNode(`${Math.round(v * 100)} %`)));
    }
    // Thrombus: a dark clot inside the lumen, its length and bulk following the occlusion, with
    // laminations (lines of Zahn) and, below full occlusion, the channel blood still finds.
    for (const [id, v] of Object.entries(p.thrombus)) {
      if (hideDx || !(v > 0) || !E[id] || !E[id].vis) continue;
      const g = geo[id], lit = g.lit, x = E[id];
      const u0 = 0.5 - 0.1 - 0.22 * v, u1 = 0.5 + 0.1 + 0.22 * v;
      const R = (x.width / 2) * clamp(0.55 + 0.45 * v, 0.55, 1);
      const rOf = (u) => { const uu = u0 + u * (u1 - u0); const e = Math.sin(Math.PI * clamp((uu - u0) / (u1 - u0), 0, 1)); return R * (0.35 + 0.65 * Math.sqrt(e)); };
      const i0 = Math.round(u0 * (N_SAMPLES - 1)), i1 = Math.round(u1 * (N_SAMPLES - 1));
      const pts = g.cur.slice(i0, i1 + 1), ln = lit.slice(i0, i1 + 1);
      if (pts.length < 3) continue;
      ov.thrombi.append(s('path', { class: 'thrombus', d: tubeOutline(pts, ln, rOf) }));
      for (const k of [-0.45, 0, 0.45]) ov.thrombi.append(s('path', { class: 'thrombus-lam', d: polyD(litOffset(g.cur, lit, R * k * 0.6, u0 + 0.06, u1 - 0.06)) }));
      if (v < 0.97) ov.thrombi.append(s('path', { class: 'thrombus-channel', d: polyD(litOffset(g.cur, lit, R * 0.62, u0, u1)), 'stroke-width': (R * 0.5 * (1 - v)).toFixed(2) }));
    }
    for (const id of ['TIPS', 'DIPS', 'S_PC', 'S_DSR', 'S_MC', ...Object.keys(p.customShunts || {})]) {
      if (!E[id].vis || E[id].reveal) continue;
      if (id === 'TIPS' || id === 'DIPS' || id.startsWith('X_')) stentMesh(id); else anastomoses(id);
    }
    for (const id of new Set([...Object.keys(p.occluded), ...(p.occluded.C5 ? ['C2'] : [])])) {
      if (!isOccluded(p, id) || !E[id] || !E[id].vis) continue;
      const [x, y] = pointAt(geo[id].cur, 0.5);
      ov.plugs.append(s('circle', { cx: x, cy: y, r: 7, fill: 'var(--surface)', stroke: 'var(--danger)', 'stroke-width': 2 }),
        s('path', { d: `M${x - 4} ${y - 4} L ${x + 4} ${y + 4} M${x + 4} ${y - 4} L ${x - 4} ${y + 4}`, stroke: 'var(--danger)', 'stroke-width': 2 }));
    }

    // Spleen: embolization leaves pale infarcted patches in the organ; after a splenectomy the organ
    // fades (see the opacity set with its size) and a cross is drawn on it.
    const rx = p.splenicRx | 0;
    if (anat && rx) {
      const [cx, cy] = SPLEEN_CENTER, sc = f.slow.spleen / 11;
      if (rx === 1) {
        for (const [dx, dy, rx_, ry_] of [[6, -38, 17, 22], [14, 4, 15, 20], [2, 44, 14, 17]]) {
          ov.plugs.append(s('ellipse', { cx: cx + dx * sc, cy: cy + dy * sc, rx: rx_ * sc, ry: ry_ * sc, fill: 'var(--surface)', 'fill-opacity': 0.55, stroke: 'var(--danger)', 'stroke-width': 1.5, 'stroke-opacity': 0.7 }));
        }
      } else {
        const x = cx + 12, y = cy + 6;
        ov.plugs.append(s('circle', { cx: x, cy: y, r: 18, fill: 'var(--surface)', stroke: 'var(--danger)', 'stroke-width': 2.5 }),
          s('path', { d: `M${x - 8} ${y - 8} L ${x + 8} ${y + 8} M${x + 8} ${y - 8} L ${x - 8} ${y + 8}`, stroke: 'var(--danger)', 'stroke-width': 3, 'stroke-linecap': 'round' }));
      }
    }
    // The varices themselves are shown by the plexus of channels feeding and draining them (see
    // STRANDS in anatomy.js), which swell as they are recruited; here only the bands, fitted at
    // ligation, are drawn over the lower esophagus.
    ov.varices.innerHTML = ''; ov.gvarices.innerHTML = ''; ov.bands.innerHTML = '';
    if (anat) {
      const eso = (y) => 789 + (y - 24) * 0.066;
      const nb = Math.round(f.bands || 0);
      for (let i = 0; i < nb; i++) { const y = 272 - i * 16; ov.bands.append(s('ellipse', { cx: eso(y), cy: y, rx: 11, ry: 3, class: 'band-ring' })); }
    }
    // Balloons
    ov.balloons.innerHTML = '';
    if (anat && p.balloonEso) ov.balloons.append(s('rect', { x: 792, y: 190, width: 20, height: 84, rx: 10, class: 'balloon-shape' }));
    if (anat && p.balloonGas) ov.balloons.append(s('circle', { cx: SITES.fundus[0], cy: SITES.fundus[1], r: 24, class: 'balloon-shape' }));
  }

  // ── Labels: a screen-space layer (SVG) laid out every frame ──
  // Text keeps a constant on-screen size whatever the zoom. Every label is a block with a
  // priority and a list of candidate positions; blocks are placed greedily, most important
  // first, and a block that cannot be placed without a collision is dropped. Anatomy on a wide
  // stage uses atlas columns in the margins with leader lines; everything else is placed
  // around its anchor. The same layer is serialized into exported figures.
  const labelSvg = wrap.querySelector('#labels');
  // Frosted pane behind the liver card: a backdrop blur needs an HTML element, and the labels are SVG.
  const glass = h('div', { class: 'lb-glass', 'aria-hidden': 'true', hidden: true });
  labelSvg.before(glass);
  const gLeaders = s('g', { class: 'lb-leaders' });
  const gLabels = s('g', { class: 'lb-blocks' });
  labelSvg.append(gLeaders, gLabels);
  const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const measure = document.createElement('canvas').getContext('2d');
  const widths = new Map();
  function textW(t, size, weight = 500, track = 0) {
    const k = `${weight}|${size}|${track}|${t}`;
    let w = widths.get(k);
    // Labels draw tabular digits (every digit as wide as a zero), so measure them that way too:
    // a value ticking from 6.0 to 6.1 then keeps its width and its label stays put.
    if (w == null) { measure.font = `${weight} ${size}px ${FONT}`; w = measure.measureText(t.replace(/\d/g, '0')).width + track * size * t.length; widths.set(k, w); }
    return w;
  }
  document.fonts?.ready?.then(() => { widths.clear(); if (F) updateLabels(F); });

  // Label text size: the reader's choice (Menu › Text size), and a larger baseline in the circuit,
  // whose labels are the map's only text. Every run's size and spacing is scaled by labelK.
  const CIRCUIT_LABEL_K = 1.22;
  const LABEL_MIN = 0.5, LABEL_MAX = 2;
  // Where a map direction lands on the screen once the circuit is turned a quarter turn counter-clockwise.
  const TURN_DIR = { N: 'W', W: 'S', S: 'E', E: 'N', NE: 'NW', NW: 'SW', SW: 'SE', SE: 'NE', C: 'C' };
  let labelScale = (() => { try { return clamp(parseFloat(localStorage.getItem('pps.labelScale')) || 1, LABEL_MIN, LABEL_MAX); } catch { return 1; } })();
  // Every label on a figure (the lobule's too) reads the same scale.
  document.documentElement.style.setProperty('--label-k', String(labelScale));
  let labelK = labelScale;
  // Projection ramp: presenting sets the atlas labels at projector sizes (values 28 px, names 23 px),
  // readable from the back of a room.
  let projecting = false;
  const labelBase = () => (projecting ? 2 : labelScale);
  // A line is a list of runs { t, size, weight, cls, track }. Returns [width, height].
  const LINE_H = (line) => Math.max(...line.map((r) => r.size)) * labelK * 1.24;
  const lineW = (line) => line.reduce((w, r, i) => w + textW(r.t, r.size * labelK, r.weight, r.track || 0) + (i ? (r.gap ?? 3) * labelK : 0), 0);

  const pool = new Map(); // key → { g, sig, … }
  function blockEl(key, cls, interactiveNode, onClick) {
    let b = pool.get(key);
    if (b) return b;
    const g = s('g', { class: 'lb ' + cls, 'data-key': key });
    const act = onClick || (interactiveNode ? () => onSelect({ type: 'node', id: interactiveNode }) : null);
    if (act) {
      g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button');
      g.addEventListener('click', act);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
    }
    gLabels.append(g);
    b = { g, sig: '', seen: 0 };
    pool.set(key, b);
    return b;
  }
  let frameNo = 0;
  function renderBlock(it) {
    const b = blockEl(it.key, it.cls, it.node, it.onClick);
    b.seen = frameNo;
    // Text and pressure colors change far more often than label structure.
    // Retain the text nodes (and keyboard focus) across numeric updates.
    const sig = JSON.stringify([it.lines.map((line) => line.map(({ t, ...style }) => style)), it.align, !!it.swatch, it.bg, !!it.hit, it.cls, labelK]);
    if (sig !== b.sig) {
      b.sig = sig;
      const kids = [];
      b.spans = [];
      b.textLines = [];
      if (it.bg) kids.push(s('rect', { class: 'lb-bg', x: -it.padX, y: -it.padY, width: it.w + 2 * it.padX, height: it.h + 2 * it.padY, rx: 6 }));
      // A clickable caption is a larger target than its small letters.
      if (it.hit) kids.push(s('rect', { class: 'lb-hit', x: -10, y: -8, width: it.w + 20, height: it.h + 16, rx: 8 }));
      let y = 0;
      const tx = it.swatch ? (it.align === 'end' ? it.w - 7 : 7) : 0;
      for (const line of it.lines) {
        const lh = LINE_H(line);
        const t = s('text', { x: it.align === 'end' ? it.w - (it.swatch ? 7 : 0) : it.align === 'middle' ? it.w / 2 : tx, y: y + lh * 0.78, 'text-anchor': it.align === 'end' ? 'end' : it.align === 'middle' ? 'middle' : 'start' });
        b.textLines.push(t);
        line.forEach((r, i) => {
          const sp = s('tspan', { class: r.cls || '', 'font-size': +(r.size * labelK).toFixed(2), 'font-weight': r.weight || 500 });
          if (i) sp.setAttribute('dx', +((r.gap ?? 3) * labelK).toFixed(2));
          if (r.track) sp.setAttribute('letter-spacing', `${r.track}em`);
          sp.textContent = r.t;
          b.spans.push(sp);
          t.append(sp);
        });
        kids.push(t);
        y += lh;
      }
      if (it.swatch) kids.unshift(s('rect', { class: 'lb-sw', x: it.align === 'end' ? it.w - 3 : 0, y: 1, width: 3, height: Math.max(8, it.h - 2), rx: 1.5 }));
      b.g.replaceChildren(...kids);
      b.sw = it.swatch ? b.g.querySelector('.lb-sw') : null;
      b.bg = b.g.querySelector('.lb-bg');
    }
    let i = 0;
    for (const line of it.lines) for (const r of line) {
      const sp = b.spans[i++];
      if (sp.textContent !== r.t) sp.textContent = r.t;
    }
    for (const text of b.textLines) setA(text, 'x', it.align === 'end' ? it.w - (it.swatch ? 7 : 0) : it.align === 'middle' ? it.w / 2 : it.swatch ? 7 : 0);
    if (b.bg) { setA(b.bg, 'width', it.w + 2 * it.padX); setA(b.bg, 'height', it.h + 2 * it.padY); }
    if (it.label) setA(b.g, 'aria-label', it.label);
    if (b.sw) { setA(b.sw, 'fill', it.swatch); setA(b.sw, 'x', it.align === 'end' ? it.w - 3 : 0); }
    b.g.classList.toggle('sel', !!it.sel);
    b.g.classList.toggle('lb-off', !!it.hide);
    if (it.key === 'liver') {
      glass.style.transform = `translate(${(it.x - it.padX).toFixed(1)}px, ${(it.y - it.padY).toFixed(1)}px)`;
      glass.style.width = `${(it.w + 2 * it.padX).toFixed(1)}px`; glass.style.height = `${(it.h + 2 * it.padY).toFixed(1)}px`;
    }
    // A turned caption reads bottom to top: its box's top-left is (x, y), and its text runs up from the bottom.
    setA(b.g, 'transform', it.rot ? `translate(${it.x.toFixed(1)} ${(it.y + it.w).toFixed(1)}) rotate(-90)` : `translate(${it.x.toFixed(1)} ${it.y.toFixed(1)})`);
    b.g.style.display = '';
  }

  const rectOf = (it) => ({ x0: it.x - it.padX, y0: it.y - it.padY, x1: it.x + it.w + it.padX, y1: it.y + it.h + it.padY });
  const hits = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const within = (r, B) => r.x0 >= B.x0 && r.y0 >= B.y0 && r.x1 <= B.x1 && r.y1 <= B.y1;
  // Candidate offset of a block around its anchor.
  function offset(dir, it, gap) {
    const { w, h: hh } = it;
    const d = gap * 0.72;
    switch (dir) {
      case 'N': return [-w / 2, -gap - hh];
      case 'S': return [-w / 2, gap];
      case 'E': return [gap, -hh / 2];
      case 'W': return [-gap - w, -hh / 2];
      case 'NE': return [d, -d - hh];
      case 'NW': return [-d - w, -d - hh];
      case 'SE': return [d, d];
      case 'SW': return [-d - w, d];
      default: return [-w / 2, -hh / 2]; // 'C': centered on the anchor
    }
  }

  const REF = () => {
    const st = store.get();
    return st.compareSnap ? st.compareSnap.P : st.healthy?.P;
  };
  const isImaging = () => !!store.get().imaging;
  // The active data layer (what vessel color encodes).
  function layerMode() {
    const st = store.get();
    return isImaging() ? 'neutral' : st.compareSnap && st.compareView === 'D' ? 'delta' : st.colorMode;
  }
  // Mean velocity in a vessel, cm/s (flow mL/s over lumen area).
  function edgeVel(f, k) {
    const q = f.Qf ? f.Qf[k] : f.Q[k];
    const D = Math.max(0.5, f.D[k]) / 10;
    return q / ((Math.PI * D * D) / 4);
  }
  // Blood entering a node per minute (L/min), from every model vessel.
  function throughput(Q, id) {
    let sum = 0;
    for (let k = 0; k < EDGES.length; k++) {
      const e = EDGES[k];
      if (e.kind === 'wedge') continue;
      if (e.to === id && Q[k] > 0) sum += Q[k];
      else if (e.from === id && Q[k] < 0) sum -= Q[k];
    }
    return sum * 0.06;
  }

  // A change badge (▲ 3) appears at `on` and goes only below `off`: a value hovering at the
  // threshold would otherwise add and drop the badge every beat, and its label would jump.
  const badges = new Map();
  const DELTA_MIN = 5;
  function badge(key, v, on, off) {
    const shown = v >= on || (badges.get(key) && v >= off);
    badges.set(key, shown);
    return shown;
  }
  function pressureRuns(P, id, compact) {
    if (!store.get().layers.chips || isImaging()) return null;
    const [v, u] = fp(P);
    const runs = [{ t: v, size: compact ? 12.5 : 14, weight: 650, cls: 'lb-val' }, { t: u, size: compact ? 9.5 : 10, weight: 500, cls: 'lb-unit', gap: 2.5 }];
    // A change from healthy is shown only once it matters clinically (5 mmHg, the upper limit
    // of a normal HVPG); while comparing, every change from the pinned moment is shown. Deltas
    // are neutral ink: red is kept for crossed thresholds.
    const ref = REF()?.[NI[id]], cmp = !!store.get().compareSnap;
    if (ref != null && badge((cmp ? 'pc:' : 'p:') + id, Math.abs(P - ref), cmp ? 1 : DELTA_MIN, cmp ? 0.7 : DELTA_MIN - 1)) runs.push({ t: `${P > ref ? '▲' : '▼'} ${fmt(Math.abs(P - ref), 0)}`, size: compact ? 9.5 : 10.5, weight: 650, cls: 'lb-delta ' + (P > ref ? 'up' : 'down'), gap: 6 });
    return runs;
  }

  // Flow layer: blood entering the station (L/min) and its change; velocity layer: the fastest
  // mean velocity in a vessel at the station (cm/s). Other layers read pressure.
  function layerRuns(f, id, compact) {
    const lm = layerMode();
    if (lm !== 'flow' && lm !== 'velocity') return null;
    if (!store.get().layers.chips) return null;
    const big = { size: compact ? 12.5 : 14, weight: 650, cls: 'lb-val' }, unit = { size: compact ? 9.5 : 10, weight: 500, cls: 'lb-unit', gap: 2.5 };
    if (lm === 'flow') {
      const v = throughput(f.Qf || f.Q, id);
      const runs = [{ ...big, t: fmtFlow(v) }, { ...unit, t: 'L/min' }];
      const refQ = store.get().healthy?.Q;
      if (refQ && !store.get().compareSnap) {
        const r = throughput(refQ, id);
        if (r > 0.02 && badge('q:' + id, Math.abs(v - r) / r, 0.3, 0.25)) runs.push({ t: `${v > r ? '▲' : '▼'} ${Math.round(Math.abs(v - r) / r * 100)}%`, size: compact ? 9.5 : 10.5, weight: 650, cls: 'lb-delta ' + (v > r ? 'up' : 'down'), gap: 6 });
      }
      return { runs, color: flowColor(v) };
    }
    let best = 0, tubes = 0, bed = false;
    for (const x of Object.values(E)) {
      if (!x.vis || x.isArt || (x.e.from !== id && x.e.to !== id)) continue;
      if (x.e.kind === 'liver') { bed = true; continue; }
      if (x.g.classList.contains('coll-ghost') || x.e.id === 'TIPS' || x.e.id === 'DIPS') continue;   // the TIPS and DIPS shunts have their own velocity label
      tubes++;
      const v = Math.abs(edgeVel(f, EI[x.e.id]));
      if (v > best) best = v;
    }
    // A microvascular bed has no single velocity; a station whose only vessels are closed
    // collaterals carries no flow at all (not stasis in an open vessel).
    if (!tubes) return { runs: [{ ...unit, t: bed ? 'microcirculation' : 'collaterals closed', gap: 0 }], color: 'rgb(150,152,162)' };
    const runs = [{ ...big, t: fmt(best, 0) }, { ...unit, t: 'cm/s' }];
    if (best < 5) runs.push({ t: 'stasis', size: compact ? 9.5 : 10.5, weight: 650, cls: 'lb-alert', gap: 6 });
    return { runs, color: velocityColor(best) };
  }

  // Where a label has no room with its value, it keeps the name alone (see placeMulti and the overlap pass).
  function shortenItem(it) {
    if (it.short || (it.lines.length < 2 && it.lines[0].length < 2)) return false;
    it.lines = [[it.lines[0][0]]]; it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]); it.short = true;
    return true;
  }
  function nodeItem(id, f, mode, compact) {
    const st = store.get();
    const meta = ATLAS_LABELS[id];
    const P = (f.Pf || f.P)[NI[id]];
    const name = mode === 'atlas' ? (meta?.name || NODES[NI[id]].label) : (SHORT[id] || id);
    // On a small screen an inline label is one quiet line (name, value) on a text halo, not a
    // two-line card: it covers as little of the anatomy as it can.
    const one = mode === 'inline';   // one line, no box, on every screen (as on a phone)
    const lines = [[{ t: name, size: compact ? 10.5 : 11.5, weight: one ? 600 : 500, cls: 'lb-name' }]];
    const lr = isImaging() ? null : layerRuns(f, id, compact);
    const pr = lr ? lr.runs : pressureRuns(P, id, compact);
    if (pr && one) lines[0].push(...pr.map((r, i) => (i ? r : { ...r, gap: 4 })));
    else if (pr) lines.push(pr);
    const w = Math.max(...lines.map(lineW)) + (mode === 'atlas' ? 7 : 0);
    const hh = lines.reduce((a, l) => a + LINE_H(l), 0);
    const sel = st.selection?.type === 'node' && st.selection.id === id;
    return { key: 'n:' + id, node: id, cls: 'node ' + mode + (one ? ' bare' : ''), lines, w, h: hh, sel, canShort: !!pr && mode !== 'atlas', label: `${NODES[NI[id]].label}${lr ? `: ${lr.runs.map((r) => r.t).join(' ')}` : pr ? `: ${fmt(P, 1)} millimeters of mercury` : ''}`,
      swatch: mode === 'atlas' && pr ? (lr ? lr.color : layerMode() === 'heat' ? heatColor(P - (REF()?.[NI[id]] ?? P)) : pressureColor(P)) : null, bg: mode === 'inline' && !one, padX: mode === 'inline' && !one ? 6 : 3, padY: mode === 'inline' && !one ? 3 : 2 };
  }

  const ANAT_PRI = { CONF: 10, VAR: 9, SIN_R: 9, RHV: 8, RA: 8, SV: 7, SMV: 7, GV: 7, IVCS: 6, MHV: 5, LHV: 5, RPV: 5, LPV: 5, SIN_L: 5, IMV: 4, LGV: 4, W_R: 12, W_M: 12, W_L: 12 };
  // Stations labelled only when zoomed in enough to give them room, in this order (see updateLabels).
  const ANAT_EXTRA = ['MHV', 'LHV', 'RPV', 'LPV', 'SIN_L', 'IMV', 'LGV'];

  let blockerBoxes = null;
  function readBlockers() {
    const wr = stageBox();
    return [...document.querySelectorAll('.stage-blocker:not([hidden])')].map((el) => {
      // A closed card can stay in place, invisible (the patient chart does): it hides nothing.
      if (getComputedStyle(el).visibility === 'hidden') return null;
      const r = el.getBoundingClientRect();
      // A closed card can keep its box while invisible (it waits in place to slide in): not an obstacle.
      if (r.width && getComputedStyle(el).visibility === 'hidden') return null;
      return r.width ? { x0: r.left - wr.left - 4, y0: r.top - wr.top - 4, x1: r.right - wr.left + 4, y1: r.bottom - wr.top + 4 } : null;
    }).filter(Boolean);
  }
  // Where a station's callout attaches: the middle of the vessel it names when that vessel is drawn
  // (see LABEL_VESSEL), else the station itself. `tan` is the vessel's direction there, on screen.
  function labelAnchor(id, t) {
    const eid = LABEL_VESSEL[id], x = eid && E[eid];
    if (x && x.vis && !x.g.classList.contains('coll-ghost') && geo[eid]?.cur?.length > 1) {
      const [wx, wy, tx, ty] = arcMid(geo[eid].cur);
      const [ax, ay] = worldToLocal(wx, wy), [bx, by] = worldToLocal(wx + tx, wy + ty);
      const n = Math.hypot(bx - ax, by - ay) || 1;
      return { ax, ay, mid: true, tan: [(bx - ax) / n, (by - ay) / n], w: x.width || 4 };
    }
    const [ax, ay] = worldToLocal(...nodePos(id, t));
    return { ax, ay, mid: false, tan: null, w: 0 };
  }
  // Whether the esophageal (VAR) or gastric (GV) varices exist yet (the app's "none" cut-off, 2.5 mm),
  // or the learner has selected that station.
  function hasVarices(id, f) {
    const sel = store.get().selection;
    if (id === 'GV' && f.metrics.gastricVarix.d <= 0) return false;   // no gastrorenal shunt: no fundal varices
    if (sel?.type === 'node' && sel.id === id) return true;
    return varicesPresent(f, id);
  }
  // Where a leader stops: it aims at the middle of the label, as if it ran behind the text, and is
  // cut off abruptly (no fade) at a small padding around the label's box.
  function leaderEnd(r, ax, ay, pad = 6) {
    const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    const hw = (r.x1 - r.x0) / 2 + pad, hh = (r.y1 - r.y0) / 2 + pad;
    const dx = ax - cx, dy = ay - cy;
    const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
    return t >= 1 ? { x: ax, y: ay } : { x: cx + dx * t, y: cy + dy * t };
  }
  // ── Label placement ──
  // A label's slot is solved in figure terms and then carried rigidly: it is stored as the figure
  // point it names (its anchor, in world coordinates) plus a fixed pixel offset to its box. A pan
  // therefore only translates every label, and a zoom moves each with its anchor. Nothing is
  // searched again until the layout or the zoom genuinely changes (see labelSig). When it is, the
  // solve is sticky: a label keeps its slot unless that slot now collides. Screen-fixed things
  // (panels, cards, the stage edge) never move a label: a label under one is hidden until it clears.
  let labelSol = new Map();   // key → solved slot { wx, wy, dx, dy, dir, pi, w, h, leader, lead } or { drop }
  let solvedFor = null;       // { sig, sc, th } the slots were solved for
  const labelVis = new Map(); // key → shown last frame (hysteresis against blockers)
  let labelTurned = false;   // labels remember their side; turning the circuit changes which side is right
  // Levels of detail (Blood menu › Labels). Key: at the home framing only the portal vein, the HVPG pair
  // (wedged sinusoids and the free hepatic vein) and the stations the model flags; zoomed in, every
  // station in view. All: every station at every zoom. None: only a selected station.
  const KEY_NODES = ['CONF', 'SIN_R', 'RHV'];
  const zoomedIn = () => vt.k > (homeAt?.k || 1) * 1.3;
  function flagged(f) {
    const st = store.get(), out = [];
    if (hasVarices('VAR', f)) out.push('VAR');
    if (hasVarices('GV', f)) out.push('GV');
    if (f.metrics?.ra > 10) out.push('RA');   // the Findings cut-off for a raised right atrial pressure
    // A narrowed vessel: the stations either side of it.
    for (const [id, v] of Object.entries((f.viewParams || st.params).stenosis || {})) {
      const e = v > 0 && EDGES[EI[id]];
      if (!e) continue;
      for (const n of [e.from, e.to]) if (CHIP_NODES.includes(n) && !out.includes(n)) out.push(n);
    }
    return out;
  }
  const SOLVE_ZOOM = 0.05, SOLVE_TURN = 0.03;   // re-solve after a 5 % zoom change or ~2 degrees of turn
  function labelSig(f) {
    const st = store.get(), t = easeInOut(morph);
    const edges = Object.values(E).filter((x) => x.vis).map((x) => `${x.e.id}${Math.round(x.width || 0)}${x.g.classList.contains('coll-ghost') ? 'g' : ''}`).join(',');
    return [geometryVersion, t >= 0.5, rotU > 0.5, labelBase(), stageBox().width < 700, st.selection?.type + ':' + st.selection?.id, JSON.stringify((f.viewParams || st.params).stenosis),
      isImaging(), st.layers.labels, st.layers.chips, layerMode(), st.focus?.label, st.focus?.edges?.[0], vt.k > 1.35, st.labelLevel, zoomedIn(), flagged(f).join(','), edges].join('|');
  }
  function updateLabels(f) {
    refreshCTM();
    const sc = CTM.sc, th = Math.atan2(CTM.b, CTM.a), sig = labelSig(f);
    const solve = !solvedFor || solvedFor.sig !== sig || Math.abs(Math.log(sc / solvedFor.sc)) > SOLVE_ZOOM || Math.abs(th - solvedFor.th) > SOLVE_TURN;
    if (solve || layoutLabels(f, false) === false) { layoutLabels(f, true); solvedFor = { sig, sc, th }; }
  }
  // Figure point under a local (stage) pixel.
  function localToWorld(x, y) {
    const X = x + wrapRect.left - CTM.e, Y = y + wrapRect.top - CTM.f, det = CTM.a * CTM.d - CTM.b * CTM.c;
    return [(CTM.d * X - CTM.c * Y) / det, (CTM.a * Y - CTM.b * X) / det];
  }
  // Vessel geometry as capsules in screen space, bucketed, so a label can ask exactly which vessels it touches.
  const SEG_CELL = 64;
  let segs = [], segGrid = new Map(), segStamp = 0;
  function buildSegs() {
    segs = []; segGrid = new Map();
    for (const x of Object.values(E)) {
      if (!x.vis) continue;
      const pts = geo[x.e.id].cur, hw = ((x.width || 4) * CTM.sc) / 2;
      let prev = worldToLocal(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        const cur = worldToLocal(pts[i][0], pts[i][1]);
        const sg = { x0: prev[0], y0: prev[1], x1: cur[0], y1: cur[1], hw, stamp: 0 };
        segs.push(sg);
        for (let gx = Math.floor((Math.min(sg.x0, sg.x1) - hw) / SEG_CELL); gx <= Math.floor((Math.max(sg.x0, sg.x1) + hw) / SEG_CELL); gx++) {
          for (let gy = Math.floor((Math.min(sg.y0, sg.y1) - hw) / SEG_CELL); gy <= Math.floor((Math.max(sg.y0, sg.y1) + hw) / SEG_CELL); gy++) {
            const k = gx * 4096 + gy;
            (segGrid.get(k) || segGrid.set(k, []).get(k)).push(sg);
          }
        }
        prev = cur;
      }
    }
  }
  // Does the segment cross the box (grown by `m`)? Liang-Barsky.
  function segHitsBox(sg, r, m) {
    const x0 = r.x0 - m, y0 = r.y0 - m, x1 = r.x1 + m, y1 = r.y1 + m;
    let t0 = 0, t1 = 1;
    const dx = sg.x1 - sg.x0, dy = sg.y1 - sg.y0;
    for (const [p, q] of [[-dx, sg.x0 - x0], [dx, x1 - sg.x0], [-dy, sg.y0 - y0], [dy, y1 - sg.y0]]) {
      if (p === 0) { if (q < 0) return false; } else { const u = q / p; if (p < 0) { if (u > t1) return false; if (u > t0) t0 = u; } else { if (u < t0) return false; if (u < t1) t1 = u; } }
    }
    return true;
  }
  // How many vessel segments the box touches, a vessel's own width and `margin` px of air included.
  function lineHits(r, margin) {
    let n = 0;
    const stamp = ++segStamp;
    for (let gx = Math.floor((r.x0 - margin) / SEG_CELL); gx <= Math.floor((r.x1 + margin) / SEG_CELL); gx++) {
      for (let gy = Math.floor((r.y0 - margin) / SEG_CELL); gy <= Math.floor((r.y1 + margin) / SEG_CELL); gy++) {
        const cell = segGrid.get(gx * 4096 + gy);
        if (!cell) continue;
        for (const sg of cell) {
          if (sg.stamp === stamp) continue;
          sg.stamp = stamp;
          if (segHitsBox(sg, r, sg.hw + margin)) n++;
        }
      }
    }
    return n;
  }
  // `solve`: search (stickily) and record the slots; otherwise carry the recorded slots. Returns false
  // when a label turned up that has no slot or no longer fits its slot: the caller then solves.
  function layoutLabels(f, solve) {
    frameNo++;
    const st = store.get();
    const t = easeInOut(morph);
    const circuit = t >= 0.5;
    if ((circuit && rotU > 0.5) !== labelTurned) { labelTurned = !labelTurned; labelSol = new Map(); if (!solve) return false; }
    // Zoomed far out (the whole map on a phone), the map's own scale is tiny, so its labels shrink with it
    // (down to 70 %) instead of burying it; from 0.6 px per unit up they are full size.
    labelK = labelBase() * (circuit ? CIRCUIT_LABEL_K * clamp(CTM.sc / 0.6, 0.7, 1) : 1);
    const wr = stageBox();
    const W = wr.width, H = wr.height;
    // A solve prefers slots that sit inside the stage as it is now, but never depends on the panels, and a pan
    // alone never searches again. A label a pan later pushes past the edge is pulled back in (see below).
    const view = { x0: 6, y0: 6, x1: W - 6, y1: H - 6 };
    const compact = W < 700;
    // Floating panels over the figure (notifications, hint cards, banners): a label under one is hidden.
    // Their boxes are read before this frame's SVG changes (see updateInner), while layout is clean.
    const blockers = blockerBoxes || readBlockers();
    const obstacles = [...blockers];   // what can hide a label this frame
    const placed = [];
    let stale = false;
    const prevSol = labelSol, nextSol = solve ? new Map() : labelSol;
    // Stenosis clamps and their percentages are drawn on the figure; keep labels off them.
    if (solve && !isImaging()) for (const [id, v] of Object.entries((f.viewParams || st.params).stenosis)) {
      if (!(v > 0) || !E[id]?.vis) continue;
      const [sx, sy] = worldToLocal(...pointAt(geo[id].cur, stenosisAt[id] ?? 0.5));
      placed.push({ x0: sx - 26, y0: sy - 22, x1: sx + 60, y1: sy + 22 });
    }
    const out = [];
    let leaders = '';
    let useLines = false;
    const buildLines = () => { if (solve && !useLines) { useLines = true; buildSegs(); } };
    // Slots are searched over every (pass, direction) pair at once: an earlier pass always beats a
    // later one (nearer, no leader, clear of vessels), then the direction order decides. The slot a
    // label held before wins as long as it still collides with nothing: no label, no dot, and (in a
    // clear pass) no vessel. A fresh slot must keep 3 px of air from vessels, the held one needs none.
    // The width a label reserves only grows (a value ticking from 9.9 to 10.0, or a change gaining a
    // digit, would otherwise tip it to another side of its station and back).
    const place = (it, dirs, gap, leader, clear) => placeMulti(it, dirs, (Array.isArray(gap) ? gap : [gap]).map((g, gi) => ({ gap: g, leader, clear, bias: gi * 6 })));
    const placeMulti = (it, dirs, passes) => {
      const prev = prevSol.get(it.key);
      if (!solve) {
        // Carry: the label goes where it was put, relative to the figure point it names.
        if (!prev) { stale = true; return false; }
        if (prev.drop) return false;
        if (prev.short && it.canShort) shortenItem(it);
        if (it.w > prev.w + 0.5 || it.h > prev.h + 0.5) { stale = true; return false; }
        const [ax, ay] = worldToLocal(prev.wx, prev.wy);
        it.ax = ax; it.ay = ay; it.dir = prev.dir; it.leader = prev.leader;
        const slack = it.rot ? 0 : prev.w - it.w;
        it.x = ax + prev.dx + (prev.dir.includes('W') ? slack : prev.dir.includes('E') ? 0 : slack / 2);
        it.y = ay + prev.dy;
        placed.push(rectOf(it)); out.push(it);
        return true;
      }
      const wRes = prev && !prev.drop && it.w <= prev.w && it.w > prev.w - 28 ? prev.w : it.w;
      // A turned caption (see renderBlock) takes up a box as wide as its text is tall.
      const probe = it.rot ? { ...it, w: it.h, h: it.w } : { ...it, w: wRes };
      let best = null;
      passes.forEach((ps, pi) => dirs.forEach((dir, i) => {
        const [dx, dy] = offset(dir, probe, ps.gap);
        const r = rectOf({ ...probe, x: it.ax + dx, y: it.ay + dy });
        if (placed.some((p) => hits(r, p))) return;
        const inside = within(r, view), held = !!prev && !prev.drop && prev.dir === dir && prev.pi === pi && (inside || !within({ x0: it.ax, y0: it.ay, x1: it.ax, y1: it.ay }, view));
        let onLine = 0;
        if (useLines) {
          onLine = lineHits(r, 0);
          if (ps.clear && (held ? onLine : lineHits(r, 3))) return;
        }
        const cost = pi * 1e4 + (inside ? 0 : 2e3) + (ps.clear ? 0 : onLine * 12) + i + (ps.bias || 0) - (held ? (ps.clear ? 1e5 : 4) : 0);
        if (!best || cost < best.cost) best = { cost, dx, dy, r, dir, pi, leader: ps.leader };
      }));
      if (!best) {
        // No room with the value: try the name alone before giving the label up.
        if (it.canShort && shortenItem(it)) return placeMulti(it, dirs, passes);
        nextSol.set(it.key, { drop: true }); return false;
      }
      // The text hugs the station side of its reserved box.
      const slack = it.rot ? 0 : wRes - it.w, dir = best.dir;
      it.x = it.ax + best.dx + (dir.includes('W') ? slack : dir.includes('E') ? 0 : slack / 2);
      it.y = it.ay + best.dy; it.dir = dir;
      // A leader line shows only when the label sits clearly away from its station: it appears past
      // 18 px and goes only below 10 px, so it cannot flicker as the view moves.
      const rr = best.r, gapPx = Math.hypot(Math.max(rr.x0 - it.ax, 0, it.ax - rr.x1), Math.max(rr.y0 - it.ay, 0, it.ay - rr.y1));
      const lead = gapPx > 18 || (!!prev?.lead && gapPx >= 10);
      it.leader = !!best.leader || lead;
      const [wx, wy] = localToWorld(it.ax, it.ay);
      nextSol.set(it.key, { wx, wy, dx: best.dx, dy: best.dy, dir, pi: best.pi, w: wRes, h: it.h, leader: it.leader, lead, short: !!it.short });
      placed.push(best.r); out.push(it);
      return true;
    };

    if (!circuit) {
      // ── Anatomy ──
      const lvl = st.labelLevel || 'key', zoomed = zoomedIn();
      const show = new Set(lvl === 'none' ? [] : lvl === 'key' && !zoomed ? [...KEY_NODES, ...flagged(f)] : CHIP_NODES);
      // No varices, no varices callout: in a healthy patient the node's pressure is just the balance
      // between the coronary vein and the azygos, and a "varices" label on it would mislead.
      if (!hasVarices('VAR', f)) show.delete('VAR');
      if (lvl !== 'none' && hasVarices('GV', f)) show.add('GV');
      // Key, at the home framing on a wide screen: the other major stations too, but only where one fits
      // beside its vessel without a leader (see `minor` below); a phone keeps to the key ones.
      const minor = new Set(lvl === 'key' && !zoomed && !compact ? CHIP_NODES.filter((id) => !show.has(id) && id !== 'VAR') : []);
      for (const id of minor) show.add(id);
      if (st.selection?.type === 'node') { show.add(st.selection.id); minor.delete(st.selection.id); }
      const [lx] = worldToLocal(ATLAS_COLUMNS[0], 500), [rx] = worldToLocal(ATLAS_COLUMNS[1], 500);
      const colW = 150;
      // Pressures sit beside their vessels at every size (no margin columns with long leaders).
      const atlas = false;
      const items = [];
      for (const id of show) {
        if (!NODE_POS[id]) continue;
        const { ax, ay, mid, w: vw } = labelAnchor(id, t);
        const it = nodeItem(id, f, atlas ? 'atlas' : 'inline', compact);
        it.ax = ax; it.ay = ay; it.vw = mid ? vw * CTM.sc : 0; it.pri = it.sel ? 100 : minor.has(id) ? 1 : ANAT_PRI[id] || 5;
        it.minor = minor.has(id);
        if (it.minor) it.canShort = false;   // an optional label shows whole or not at all
        it.side = ATLAS_LABELS[id]?.side || (NODE_POS[id][0][0] < 700 ? 'L' : 'R');
        items.push(it);
      }
      // A TIPS or DIPS shunt gets its own callout: the velocity through it (cm/s).
      for (const sid of ['TIPS', 'DIPS']) {
        if (E[sid]?.vis && EI[sid] >= 0) {
          const { ax, ay, mid, w: vw } = labelAnchor(sid, t);
          {
            const it = nodeItem('RPV', f, atlas ? 'atlas' : 'inline', compact);
            const vel = Math.abs(edgeVel(f, EI[sid]));
            const unit = { size: compact ? 9.5 : 10, weight: 500, cls: 'lb-unit', gap: 2.5 };
            it.lines[0][0].t = sid;
            it.lines.length = 1; it.lines[0].length = 1;
            const vr = [{ t: fmt(vel, 0), size: compact ? 12.5 : 14, weight: 650, cls: 'lb-val', gap: atlas ? 0 : 4 }, { ...unit, t: 'cm/s' }];
            if (atlas) it.lines.push(vr); else it.lines[0].push(...vr);
            it.key = `n:${sid}`; it.node = undefined; it.sel = false; it.swatch = null;
            it.w = Math.max(...it.lines.map(lineW)) + (atlas ? 7 : 0); it.h = it.lines.reduce((a, l) => a + LINE_H(l), 0);
            it.label = `${sid}: ${fmt(vel, 0)} centimeters per second`;
            it.ax = ax; it.ay = ay; it.vw = mid ? vw * CTM.sc : 0; it.pri = 9; it.side = 'R';
            items.push(it);
          }
        }
      }
      // Zoomed in, the other stations in view get their pressure too (hepatic veins, portal branches,
      // the left sinusoids...), each only where it stands clear of the labels already there, so they
      // appear as the zoom makes room and the overview stays uncluttered.
      if (!atlas && lvl !== 'none' && (vt.k > 1.35 || zoomed || lvl === 'all')) {
        const room = compact ? 64 : 80;
        for (const id of ANAT_EXTRA) {
          if (show.has(id) || !NODE_POS[id] || !(NI[id] >= 0)) continue;
          const { ax, ay, mid, w: vw } = labelAnchor(id, t);
          if (items.some((o) => Math.hypot(o.ax - ax, o.ay - ay) < room)) continue;
          const it = nodeItem(id, f, 'inline', compact);
          it.ax = ax; it.ay = ay; it.vw = mid ? vw * CTM.sc : 0; it.pri = ANAT_PRI[id] || 4;
          it.side = ATLAS_LABELS[id]?.side || (NODE_POS[id][0][0] < 700 ? 'L' : 'R');
          items.push(it);
        }
      }
      if (atlas) {
        for (const side of ['L', 'R']) {
          const col = items.filter((it) => it.side === side).sort((a, b) => a.ay - b.ay);
          const cx0 = side === 'L' ? lx - colW : rx, cx1 = side === 'L' ? lx : rx + colW;
          let top = 10, bottom = H - 10;
          for (const b of blockers) {
            if (b.x1 < cx0 || b.x0 > cx1) continue;
            if (b.y0 < H / 2) top = Math.max(top, b.y1 + 8); else bottom = Math.min(bottom, b.y0 - 8);
          }
          const gap = 8;
          const need = col.reduce((sum, it) => sum + it.h + gap, 0);
          if (bottom - top < need) { top = 10; bottom = Math.max(top + need, H - 10); }
          for (let i = 0; i < col.length; i++) col[i].y = Math.max(col[i].ay - col[i].h / 2, i ? col[i - 1].y + col[i - 1].h + gap : top);
          for (let i = col.length - 1; i >= 0; i--) col[i].y = Math.min(col[i].y, i < col.length - 1 ? col[i + 1].y - col[i].h - gap : bottom - col[i].h);
          const elbow = side === 'L' ? lx + 12 : rx - 12;
          for (const it of col) {
            it.x = side === 'L' ? lx - 8 - it.w : rx + 8;
            // A floating card over the column hides the labels it covers rather than sitting on them.
            if (blockers.some((b) => hits(rectOf(it), b))) continue;
            it.align = side === 'L' ? 'end' : 'start';
            // Left column: the line starts at the label's left edge, under the text, so it never ends at the right.
            const ly = side === 'L' ? it.y + it.h : it.y + Math.min(it.h / 2, 16);
            const x0 = side === 'L' ? it.x : rx + 4;
            leaders += `<path class="leader${it.sel ? ' hl' : ''}" d="M${x0.toFixed(1)} ${ly.toFixed(1)} L${elbow.toFixed(1)} ${ly.toFixed(1)} L${it.ax.toFixed(1)} ${it.ay.toFixed(1)}"/><circle class="leader-dot" cx="${it.ax.toFixed(1)}" cy="${it.ay.toFixed(1)}" r="2.4"/>`;
            placed.push(rectOf(it));
            out.push(it);
          }
        }
      } else {
        // Inline: dots on the anatomy, labels nearby with short leaders, most important first.
        buildLines();
        for (const it of items) placed.push({ x0: it.ax - 4, y0: it.ay - 4, x1: it.ax + 4, y1: it.ay + 4 });
        for (const it of items.sort((a, b) => b.pri - a.pri)) {
          it.align = 'start';
          const dirs = it.side === 'L' ? ['NW', 'W', 'SW', 'N', 'S', 'NE', 'E', 'SE'] : ['NE', 'E', 'SE', 'N', 'S', 'NW', 'W', 'SW'];
          // Prefer a spot touching no vessel at all, near first; only then accept one that crosses a vessel.
          const near = 8 + it.vw / 2, far = 24 + it.vw / 2;
          if (it.minor) { placeMulti(it, dirs, [{ gap: near, leader: false, clear: true }]); continue; }
          if (placeMulti(it, dirs, [{ gap: near, leader: false, clear: true }, { gap: far, leader: true, clear: true }, { gap: near, leader: false }, { gap: far, leader: true }])) continue;
          if (it.sel) { place(it, ['C'], 0, false) || (out.push(Object.assign(it, { x: it.ax + 8, y: it.ay - it.h / 2 })), true); }
        }
      }
      // Organ names: fixed inside their organ, dropped where a label needs the room.
      if (st.layers.labels && t < 0.3) {
        for (const [txt, x, y] of ORGAN_LABELS) {
          const [ax, ay] = worldToLocal(x, y);
          const up = txt.toUpperCase();
          const it = { key: 'o:' + txt, cls: 'organ', lines: [[{ t: up, size: compact ? 8.5 : 9.5, weight: 600, cls: 'lb-organ', track: 0.1 }]], align: 'middle', padX: 2, padY: 1, ax, ay };
          it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]);
          place(it, ['C'], 0, false);
        }
      }
    } else {
      // ── Circuit: zone titles, then stations by priority, then resistances ──
      // Turned upright, a direction given on the map (N, E, ...) points somewhere else on the screen.
      const turned = rotU > 0.5, dirOf = (d) => (turned ? TURN_DIR[d] : d);
      for (const [txt, x0, x1] of CIRCUIT_ZONES) {
        const [a, ay0] = worldToLocal(x0, 60), [b, by] = worldToLocal(x1, 60);
        // The liver's and the heart's titles open their cards (there is no organ to click in the circuit).
        const organ = { Liver: 'liver', Heart: 'heart' }[txt];
        const it = { key: 'z:' + txt, cls: organ ? 'zonecap link' : 'zonecap', lines: [[{ t: txt.toUpperCase(), size: compact ? 8.5 : 9.5, weight: 650, cls: 'lb-zone', track: 0.1 }]], align: 'middle', padX: 2, padY: 2 };
        if (organ) {
          it.onClick = () => onSelect({ type: 'organ', id: organ });
          it.label = `${txt}: open its card`; it.hit = true;
          it.sel = st.selection?.type === 'organ' && st.selection.id === organ;
        }
        it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]);
        // Zone titles are screen furniture (they keep to the map's top or left edge as it pans), so they are
        // set out every frame rather than solved. Figure labels were placed round their natural spot, and
        // one that a pan brings under a title is hidden.
        const zoneAt = (x, y) => { it.live = true; it.ax = x; it.ay = y; const bx = it.rot ? it.h : it.w, by2 = it.rot ? it.w : it.h; it.x = x - bx / 2; it.y = y - by2 / 2; return rectOf({ ...it, x: it.x, y: it.y, w: bx, h: by2 }); };
        if (turned) {
          // Upright, a zone is a horizontal band: its title runs up the map's left edge (text turned to read
          // bottom to top), centred on the band.
          it.rot = true;
          if (solve) placed.push(zoneAt((a + b) / 2, (ay0 + by) / 2));
          const zr = zoneAt(Math.max(it.h / 2 + 8, (a + b) / 2), (ay0 + by) / 2);
          if (within(zr, { x0: 6, y0: 6, x1: W - 6, y1: H - 6 }) && !blockers.some((o) => hits(zr, o))) { out.push(it); obstacles.push(zr); }
          continue;
        }
        // A narrow zone (a zoomed-out circuit) takes a shorter title rather than none.
        for (const alt of ZONE_SHORT[txt] || []) {
          if (b - a > it.w + 6) break;
          it.lines = [[{ ...it.lines[0][0], t: alt.toUpperCase() }]]; it.w = lineW(it.lines[0]);
        }
        if (b - a > it.w + 6) {
          if (solve) placed.push(zoneAt((a + b) / 2, by));
          const zr = zoneAt((a + b) / 2, Math.max(14, by));
          if (within(zr, { x0: 6, y0: 6, x1: W - 6, y1: H - 6 }) && !blockers.some((o) => hits(zr, o))) { out.push(it); obstacles.push(zr); }
        }
      }
      buildLines();
      // The liver's stations show when zoomed in on it or when one is selected (there is no box to open them).
      const open = liverExpanded();
      const nodes = [], flagC = flagged(f);
      for (const n of NODES) {
        if (!nodeEls[n.id] || !CIRCUIT_LABELS[n.id]) continue;
        if (!nodeVisible(n.id)) continue;
        if ((n.id === 'VAR' || n.id === 'GV') && !hasVarices(n.id, f)) continue;
        if (!open && LIVER_INNER.has(n.id) && !(st.selection?.type === 'node' && st.selection.id === n.id)) continue;
        // Levels of detail: none shows only a selected station; key, zoomed out, the major ones (and the flagged).
        const isSel = st.selection?.type === 'node' && st.selection.id === n.id, lvlC = st.labelLevel || 'key';
        if (!isSel && (lvlC === 'none' || (lvlC === 'key' && !zoomedIn() && CIRCUIT_LABELS[n.id].pri < (compact ? 8 : 5) && !flagC.includes(n.id)))) continue;
        const { ax, ay, mid, tan, w: vw } = labelAnchor(n.id, t);
        // The station dot stays where it is; a callout on a vessel also keeps clear of its own marker.
        const [sx, sy] = worldToLocal(...nodePos(n.id, t));
        placed.push({ x0: sx - 5, y0: sy - 5, x1: sx + 5, y1: sy + 5 });
        if (mid) placed.push({ x0: ax - 4, y0: ay - 4, x1: ax + 4, y1: ay + 4 });
        const it = nodeItem(n.id, f, 'station', compact);
        it.align = 'middle'; it.ax = ax; it.ay = ay; it.mid = mid; it.tan = tan; it.vw = vw * CTM.sc; it.pri = it.sel ? 100 : CIRCUIT_LABELS[n.id].pri;
        nodes.push(it);
      }
      for (const it of nodes.sort((a, b) => b.pri - a.pri)) {
        // On a vessel, the label goes beside it: above or below a horizontal run, left or right of a vertical one.
        const pref = it.mid ? (Math.abs(it.tan[0]) >= Math.abs(it.tan[1]) ? ['N', 'S'] : ['E', 'W']) : CIRCUIT_LABELS[it.node].dirs.map(dirOf);
        const dirs = [...pref, ...['N', 'S', 'E', 'W', 'NE', 'SE', 'NW', 'SW'].filter((d) => !pref.includes(d))];
        const half = it.vw / 2;
        // A minor station gives way rather than sit on a vessel or crowd its neighbours.
        if (!place(it, dirs, [7 + half, 18 + half, 30 + half], false, it.pri <= 4 && !it.sel) && it.sel) place(it, dirs, 40 + half, true);
      }
      // Collateral and shunt lanes, captioned along their run.
      for (const [id, cap] of Object.entries(LANE_CAPTIONS)) {
        const x = E[id];
        if (!x?.vis || x.g.classList.contains('coll-ghost')) continue;
        const it = { key: 'lane:' + id, cls: 'lane', lines: [[{ t: cap, size: compact ? 9 : 10, weight: 550, cls: 'lb-lane' }]], align: 'middle', padX: 2, padY: 1, ax: 0, ay: 0 };
        it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]);
        // Turned upright, a lane that runs up the screen is captioned along it (text turned to read bottom to top), beside it.
        const at = (u) => { const [lx, ly] = pointAt(geo[id].cur, u); [it.ax, it.ay] = worldToLocal(lx, ly); };
        let vertical = false;
        if (turned) {
          at(laneU[id]);
          const [bx, by] = worldToLocal(...pointAt(geo[id].cur, Math.min(1, laneU[id] + 0.03)));
          vertical = Math.abs(by - it.ay) > Math.abs(bx - it.ax) * 1.2;
        }
        if (vertical) it.rot = true;
        const dirs = vertical ? ['E', 'W'] : [dirOf('N'), dirOf('S')], gaps = [3 + (x.width || 4) / 2, 12 + (x.width || 4) / 2];
        // Try the spots along the lane that no other vessel touches, then settle for the first.
        const spots = [laneU[id], ...(laneAlt[id] || [])];
        if (!spots.some((u) => { at(u); return place(it, dirs, gaps, false, true); })) { at(laneU[id]); place(it, dirs, gaps, false); }
      }
    }
    // Lesson / case focus callout
    const foc = st.focus;
    if (foc?.edges?.length && E[foc.edges[0]]?.vis) {
      const [x, y] = pointAt(geo[foc.edges[0]].cur, 0.5);
      const [ax, ay] = worldToLocal(x, y);
      const it = { key: 'focus', cls: 'focus', lines: [[{ t: foc.label || 'Here', size: 11.5, weight: 650, cls: 'lb-focus' }]], align: 'start', bg: true, padX: 8, padY: 4, ax, ay };
      it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]);
      if (place(it, ['E', 'W', 'NE', 'SE', 'N', 'S'], 18 + (E[foc.edges[0]].width || 4), true)) it.focusLeader = true;
    }
    if (stale) return false;
    if (solve) labelSol = nextSol;

    // Which labels show this frame. A slot never moves for a screen-fixed obstacle: a label whose box a
    // panel, card or title covers (or that has panned off the stage) is hidden, and shown again once it is
    // clear of the obstacle by a margin, so it cannot flicker at the edge. A selected label always shows.
    const stage = { x0: 0, y0: 0, x1: W, y1: H };
    for (const it of out) {
      if (it.live) { it.hide = false; continue; }
      // A label a pan has pushed over the stage edge is pulled back inside (with a leader to its station)
      // so it is never cut off; once its station has left the stage the label goes too.
      const edge = rectOf(it);
      const cx = Math.max(view.x0 - edge.x0, Math.min(0, view.x1 - edge.x1)), cy = Math.max(view.y0 - edge.y0, Math.min(0, view.y1 - edge.y1));
      if (cx || cy) { it.x += cx; it.y += cy; if (Math.hypot(cx, cy) > 2) it.leader = true; }
      if (!it.sel && (it.ax < -8 || it.ax > W + 8 || it.ay < -8 || it.ay > H + 8)) { it.hide = true; labelVis.set(it.key, false); continue; }
      if (it.sel) { it.hide = false; continue; }
      const r = rectOf(it), was = labelVis.get(it.key) !== false, m = was ? 0 : 10;
      it.hide = !hits(r, stage) || obstacles.some((o) => hits(r, { x0: o.x0 - m, y0: o.y0 - m, x1: o.x1 + m, y1: o.y1 + m }));
      labelVis.set(it.key, !it.hide);
    }
    // Last pass: no two labels showing may overlap. A pan can pull a label in from the stage edge onto
    // another, and carried slots are not searched again. The more important label keeps its place; the
    // other drops its value and, if that is not enough, hides until there is room.
    const rank = (it) => (it.sel ? 1e3 : it.key === 'focus' ? 900 : it.cls === 'organ' ? 0 : it.cls === 'lane' ? 1 : (it.pri ?? 2) + 2);
    const kept = [];
    for (const it of out.filter((o) => !o.hide && !o.live && !o.rot).sort((a, b) => rank(b) - rank(a))) {
      let r = rectOf(it);
      if (kept.some((k) => hits(r, k))) {
        const w0 = it.w, h0 = it.h, d = it.dir || '';
        if (it.canShort && shortenItem(it)) {
          it.x += d.includes('W') ? w0 - it.w : d.includes('E') ? 0 : (w0 - it.w) / 2;
          it.y += d.includes('N') ? h0 - it.h : d.includes('S') ? 0 : (h0 - it.h) / 2;
          r = rectOf(it);
        }
        if (!it.sel && kept.some((k) => hits(r, k))) { it.hide = true; continue; }
      }
      kept.push(r);
    }
    // Leader lines and anchor dots, for the labels showing.
    for (const it of out) {
      if (it.hide || it.live || it.cls === 'organ' || it.cls === 'lane') continue;
      const r = rectOf(it), le = leaderEnd(r, it.ax, it.ay);
      const far = Math.hypot(le.x - it.ax, le.y - it.ay) > 5;
      if (it.focusLeader) leaders += `<path class="leader focus" d="M${it.ax.toFixed(1)} ${it.ay.toFixed(1)} L${le.x.toFixed(1)} ${le.y.toFixed(1)}"/>`;
      else if (it.leader && (circuit || far)) leaders += `<path class="leader${it.sel ? ' hl' : ''}" d="M${it.ax.toFixed(1)} ${it.ay.toFixed(1)} L${le.x.toFixed(1)} ${le.y.toFixed(1)}"/>`;
      if (it.focusLeader) continue;
      if (!circuit || it.mid) leaders += `<circle class="leader-dot" cx="${it.ax.toFixed(1)}" cy="${it.ay.toFixed(1)}" r="2.4"/>`;
    }
    for (const it of out) renderBlock(it);
    for (const [, b] of pool) if (b.seen !== frameNo) b.g.style.display = 'none';
    glass.hidden = !out.some((it) => it.key === 'liver' && !it.hide);
    if (gLeaders._last !== leaders) { gLeaders.innerHTML = leaders; gLeaders._last = leaders; }
    return true;
  }
  const nodeVisible = (id) => !(ANAT_HIDDEN_NODES.has(id) && morph < 0.5) && ALL_EDGES.some((e) => (e.from === id || e.to === id) && E[e.id]?.vis);

  // ── Moving blood ──────────────────────────────────
  // What is kept true, and what is exaggerated, is set out in blood.js. Every model vessel has a
  // stream (hidden ones too: a dye bolus passes through them); each drawn vessel, strand and
  // tributary row gets FLOW_TEXELS texels for the GPU:
  //   0: stream distance (world, modulo PERIOD), display speed (signed, from → to), parcels a
  //      second, stasis (0–1)
  //   1: free at the from end, free at the to end (parcels fade there), strength, reversed (0–1, eased)
  //   2: fraction of its blood from the SMV, the IMV, the splenic vein and the hepatic artery (rest: systemic)
  const flowData = new Float32Array(GL_ROWS * FLOW_TEXELS * 4);
  const dyeData = new Float32Array(GL_ROWS * DYE_BINS), dyeRow = new Float32Array(DYE_BINS);
  const streams = EDGES.map((e, k) => ({ seed: k + 1 }));
  const LARGE = EDGES.map((e) => (e.kind === 'vein' || e.kind === 'diode') && (e.d || 0) >= STASIS_MIN_D);
  const bolus = createBolus(EDGES, NODES);
  const net = { Q: new Float32Array(EDGES.length), vd: new Float32Array(EDGES.length), len: new Float32Array(EDGES.length) };
  let origins = null, originsF = null, bloodClock = 0, dyeShown = false, endsKey = '';
  const bloodOn = () => !!F && !store.get().imaging && store.get().layers.flow !== false;
  const chevOn = () => !!F && !store.get().imaging && !!store.get().blood?.chevrons;
  // The Blood origin lens colors each lumen by where its blood comes from (streams side by side).
  const originOn = () => !!F && layerMode() === 'origin';
  // Mean velocity (cm/s) for a flow (mL/s): flow over lumen area; the liver beds are not one tube.
  function velOf(k, q) {
    const D = Math.max(0.5, F.D[k]) / 10;
    return EDGES[k].kind === 'liver' ? q * 0.6 : q / (Math.PI * D * D / 4);
  }
  // A drawn end is free when no other drawn vessel ends there: parcels fade in or out at it.
  function syncEnds() {
    const list = Object.values(E).filter((x) => x.vis && !x.isArt && !x.g.classList.contains('coll-ghost'));
    const key = geometryVersion + '|' + morph.toFixed(2) + '|' + list.map((x) => x.e.id).join(',');
    if (key === endsKey) return;
    endsKey = key;
    const ends = new Map();
    for (const x of list) {
      const P = geo[x.e.id].cur;
      for (const [node, point] of [[x.e.from, P[0]], [x.e.to, P[P.length - 1]]]) {
        if (!ends.has(node)) ends.set(node, []);
        ends.get(node).push({ x, point });
      }
    }
    const joined = (x, node, point) => ends.get(node).some((o) => o.x !== x && Math.hypot(o.point[0] - point[0], o.point[1] - point[1]) < 20);
    for (const x of list) {
      const P = geo[x.e.id].cur;
      x.freeFrom = !joined(x, x.e.from, P[0]) && !x.feeders?.length;
      x.freeTo = !joined(x, x.e.to, P[P.length - 1]);
    }
  }
  function stepBlood(dt) {
    const st = store.get(), b = st.blood || {};
    const moving = st.running && !reduceMotion.matches;
    const speed = st.clock === 'hemo' ? clamp(Math.sqrt(st.speed), 0.5, 2) : 0.8;
    const Qf = F.Qf || F.Q;
    if (moving) bloodClock = (bloodClock + dt) % 10000;
    // Reversed flow (against the healthy direction, as the Direction lens has it) eases in and out.
    const ease = -Math.expm1(-dt / 0.5), RF = { Qf };
    for (let k = 0; k < EDGES.length; k++) {
      const sm = advanceStream(streams[k], velOf(k, Qf[k]), velOf(k, F.Q[k]), moving ? dt : 0, { phasic: !!b.phasic, speed, large: LARGE[k] });
      const rt = isReversed(EDGES[k], RF) ? 1 : 0;
      sm.rev = sm.rev == null ? rt : sm.rev + (rt - sm.rev) * ease;
    }
    if (!veins) return;
    const on = bloodOn() || chevOn() || originOn();
    if (originOn() && originsF !== F) { origins = originFractions(EDGES, NODES, Qf, F.Pf || F.P); originsF = F; }
    syncEnds();
    flowData.fill(0);
    const put = (row, k, q, f0, f1, strength) => {
      const o = row * FLOW_TEXELS * 4, sm = streams[k];
      flowData[o] = sm.D; flowData[o + 1] = sm.vd; flowData[o + 2] = KAPPA * Math.abs(q); flowData[o + 3] = sm.stasis;
      flowData[o + 4] = f0 ? 1 : 0; flowData[o + 5] = f1 ? 1 : 0; flowData[o + 6] = strength; flowData[o + 7] = sm.rev;
      if (origins) for (let c = 0; c < ORIGIN_N; c++) flowData[o + 8 + c] = origins[k * ORIGIN_N + c];
    };
    if (on) for (const x of Object.values(E)) {
      if (!x.vis || x.isArt || x.reveal || x.g.classList.contains('coll-ghost')) continue;
      const k = EI[x.e.id], q = Qf[k];
      // A braided collateral's channels share its flow by cross-section.
      const strands = morph < 0.5 ? (x.strands || []).filter((sd) => (sd.live ?? 1) >= 0.5) : [];
      const area = 1 + strands.reduce((a, sd) => a + sd.k * sd.k, 0);
      put(x.row, k, q / area, x.freeFrom, x.freeTo, 1);
      for (const sd of strands) put(sd.row, k, q * sd.k * sd.k / area, true, true, 1);
      // Tributaries drawn into a trunk: a share of its flow by caliber.
      if (morph < 0.5) for (const fd of x.feeders || []) if ((fd.live ?? 1) >= 0.5 && fd.w) put(fd.row, k, q * 0.5 * (fd.w / Math.max(1, x.width)) ** 2, true, false, 1);
      // The liver's branches in the circuit: a share of the vessel's flow by caliber.
      if (morph >= 0.5) for (const cb of x.cbr || []) if (cb.w) put(cb.row, k, q * 0.5 * (cb.w / Math.max(1, x.width)) ** 2, true, true, 1);
    }
    veins.setFlow(flowData);
    // The dye bolus, through every vessel (hidden ones take a second each).
    if (bolus.active) {
      for (let k = 0; k < EDGES.length; k++) {
        const x = E[EDGES[k].id];
        net.Q[k] = Qf[k];
        net.vd[k] = Math.max(3, Math.abs(streams[k].vd)) * speed;
        net.len[k] = x?.vis && geo[x.e.id]?.len ? geo[x.e.id].len : Math.max(20, net.vd[k] * HIDDEN_SECONDS);
      }
      if (moving) bolus.step(dt, net);
      dyeData.fill(0);
      for (const x of Object.values(E)) {
        if (!x.vis || x.isArt) continue;
        if (!bolus.field(EI[x.e.id], net, dyeRow)) continue;
        dyeData.set(dyeRow, x.row * DYE_BINS);
        for (const sd of x.strands || []) dyeData.set(dyeRow, sd.row * DYE_BINS);
      }
      veins.setDye(dyeData); dyeShown = true;
    } else if (dyeShown) { veins.setDye(null); dyeShown = false; }
  }
  /**
   * Starts a dye injection: into vessel `id` (default: the gut's veins, as in mesenteric
   * portography). `hold`: it goes on until releaseDye().
   */
  function injectDye(id, { hold = false } = {}) {
    const e = EDGES[EI[id]] ? id : 'V_INT';
    bolus.inject(EI[e], id && EDGES[EI[id]] ? 0.15 : 0, { hold });
    if (!store.get().running) store.set({ running: true });
  }
  // Colors for the blood (theme independent: they sit on the lumen, not on the page).
  const BLOOD_COLORS = {
    // SMV (amber), IMV (teal), splenic vein (violet), hepatic artery (crimson), systemic (slate blue): main.js keys them.
    originCol: [[0.9, 0.6, 0.16], [0.09, 0.62, 0.55], [0.49, 0.36, 0.86], [0.84, 0.2, 0.28], [0.44, 0.56, 0.75]],
    dyeCol: [0.78, 0.96, 0.2], inkLight: [1, 1, 1], inkDark: [0.07, 0.08, 0.15],
    revCol: [1, 0.55, 0.16],
    chevInk: [0.08, 0.08, 0.1],   // flow chevrons (orange, revCol, where reversed)   // reversed flow: the moving blood glows orange (as --flow-reversed)
  };
  // Active variceal bleeding: a small spray at the rupture site and blood pooling in the stomach.
  function bleedSpray(moving) {
    if (!F?.bleed?.active || morph >= 0.5) return [];
    const gv = F.bleed.site === 'GV';
    const site = gv ? [SITES.fundus[0], SITES.fundus[1] - 4] : [SITES.varix[0] + 8, SITES.varix[1] + 12];
    const k = clamp((F.metrics.bleeding?.rate || 50) / 90, 0.7, 1.8);
    const tt = moving ? performance.now() / 1000 : 0;
    const out = [];
    for (let i = 0; i < 9; i++) {
      const a = (gv ? Math.PI / 2 : -Math.PI / 2) + (i - 4) * 0.22;
      const ph = (tt * 0.8 + i * 0.37) % 1;
      const rr = (5 + 20 * ph) * k, r = (1.9 - ph) * k;
      out.push([site[0] + Math.cos(a) * rr * 0.55, site[1] + Math.sin(a) * rr, r, r, 0.9 * (1 - ph)]);
    }
    const pool = clamp(Math.sqrt((F.bleed.total || 0) / 5), 4, 40);
    out.unshift([SITES.stomachPool[0], SITES.stomachPool[1], pool * 1.4, pool * 0.6, 0.28]);
    return out;
  }
  function bloodLook() {
    const st = store.get(), b = st.blood || {};
    return { on: bloodOn(), chev: chevOn() && !cath.st, look: b.look, origin: originOn(), clock: bloodClock, dye: !st.imaging, bleed: bleedSpray(st.running && !reduceMotion.matches), ...BLOOD_COLORS };
  }

  let lastT = performance.now(), lastDrawKey = null, lastDrawF = null, lastDrawCTM = null;
  let lastRaf = 0, gapEMA = 16, qCheck = 0, qGood = 0, drawnView = -1;
  function governQuality(now) {
    const gap = lastRaf ? now - lastRaf : 16;
    lastRaf = now;
    if (SOFTWARE || !store.get().running || gap > 500) return;   // software: stays at its step; idle or just resumed: nothing to learn
    gapEMA += (Math.min(gap, 250) - gapEMA) * 0.05;
    if (now - qCheck < 2000) return;
    qCheck = now;
    let next = quality;
    if (gapEMA > 45 && quality < Q_MAX) { next = quality + 1; qGood = 0; }
    else if (gapEMA < 22 && quality > 0) { if (++qGood >= 3) { next = quality - 1; qGood = 0; } }
    else qGood = 0;
    if (next === quality) return;
    quality = next;
    wrap.dataset.quality = String(quality);
    try { localStorage.setItem('pps.quality', String(quality)); } catch { /* storage unavailable */ }
    resizeCanvas();
  }
  // The vessel canvas follows the frame time: when frames that redraw it arrive late (over 21 ms) it is drawn at a
  // smaller size, a step at a time and not more than twice a second; it grows back once frames fit in 15.5 ms.
  let resGap = 16.7, resCheck = 0, slowMs = 0, fastMs = 0, resPrev = 0;
  function governRes(now, drawing) {
    const gap = resPrev ? now - resPrev : 16.7;
    resPrev = drawing ? now : 0;
    if (SOFTWARE || !drawing || gap > 100 || now < 4000) return;   // not while the page is still starting up
    resGap += (gap - resGap) * 0.1;
    // Hysteresis: a sustained trend (a second to shrink, two and a half to grow back), and a change at most once a second.
    slowMs = resGap > 21 ? slowMs + gap : 0; fastMs = resGap < 14.5 ? fastMs + gap : 0;
    if (now - resCheck < 1000) return;
    let n = dynRes;
    if (slowMs > 1000 && dynRes > 0.6) n = Math.max(0.6, dynRes - 0.1);
    else if (fastMs > 2500 && dynRes < 1) n = Math.min(1, dynRes + 0.1);
    if (Math.abs(n - dynRes) > 0.01) { pendingRes = n; resCheck = now; slowMs = fastMs = 0; }   // applied at the start of the next frame, which then redraws
  }
  let pendingRes = 0;
  let flowGate = lastT;
  function animate(now) {
    // High-refresh screens need not redraw the blood at their refresh rate. Elapsed time is kept
    // intact so speeds and transitions stay correct.
    if (document.hidden || appEl?.classList.contains('home-open')) { lastT = flowGate = now; lastRaf = 0; requestAnimationFrame(animate); return; }
    governQuality(now);
    if (pendingRes) { dynRes = pendingRes; pendingRes = 0; resizeCanvas(); }
    // The dive magnifies the figure as it stands (a compositor scale): nothing under it is redrawn until it lands.
    if (diveT > 0 && diveT < 1 && !drawOnce && !forceDraw) { lastT = flowGate = now; requestAnimationFrame(animate); return; }
    const interval = 1000 / QUALITY[quality].fps;
    // A pan or zoom redraws at once (the picture must stay under the pointer); only the model's
    // own motion is paced.
    const viewMoved = viewVersion !== drawnView;
    if (!viewMoved && !forceDraw && now - flowGate < interval) { requestAnimationFrame(animate); return; }
    flowGate = now - ((now - flowGate) % interval);
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    // Fully inside the lobule, the plate is covered (a pending redraw waits for the frame it can show in).
    if (lz?.isOpen() || lz?.covers()) { requestAnimationFrame(animate); return; }
    forceDraw = false; drawOnce = false;
    const st = store.get();
    const still = (!st.running || reduceMotion.matches) && !bolus.active;
    const key = still ? `${cathVer}|${morph}|${rotU}|${wrap.className}|${st.layers.flow}|${JSON.stringify(st.blood)}|${vCanvas.width}x${vCanvas.height}` : null;
    // A plate raster that lands while the figure is still (paused, or reduced motion) marks the vessel layer dirty: draw it.
    if (still && !veinsDirty && morph === morphTarget && rotU === rotTarget && key === lastDrawKey && F === lastDrawF && CTM === lastDrawCTM && !Object.values(E).some((x) => x.reveal)) { requestAnimationFrame(animate); return; }
    if (morph !== morphTarget) {
      morph = clamp(morph + Math.sign(morphTarget - morph) * dt / 0.6, 0, 1);
      if (F) update(F); else updateGeometry(true);
    }
    if (rotU !== rotTarget) {
      rotU = clamp(rotU + Math.sign(rotTarget - rotU) * dt / 0.5, 0, 1);
      setViewBox(easeInOut(morph));
      if (rotHold) { holdView(rotHold); if (rotU === rotTarget) rotHold = null; }
      else if (rotU === rotTarget && morphTarget === 1) { vt = insetVT({ k: 1, x: 0, y: 0 }, circVB()); applyVT(); CTM = null; }
    }
    stepReveals(now);
    if (F) stepBlood(dt);
    // The vessel layer is redrawn only when something in it changed; the blood every frame.
    if (!drawVeins() && veins && !veins.lost && vLook && F) veins.composite(vLook, bloodLook());
    drawnView = viewVersion;
    governRes(now, viewMoved || st.running);
    lastDrawKey = key; lastDrawF = F; lastDrawCTM = CTM;
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  // Opaque organ shapes (anatomy), as canvas paths; built once, band widths read from the CSS.
  let organCovers = null;
  function getOrganCovers() {
    if (organCovers) return organCovers;
    organCovers = [];
    for (const o of ORGANS) {
      if (o.deco || o.noCover || !organEls[o.id]) continue;
      if (o.circle) { const p = new Path2D(); p.arc(o.circle[0], o.circle[1], o.circle[2], 0, Math.PI * 2); organCovers.push({ p, w: 0 }); continue; }
      const w = o.band ? parseFloat(getComputedStyle(organEls[o.id]).strokeWidth) || 0 : 0;
      if (o.band && w < 4) continue; // the diaphragm is a hairline, not a cover
      organCovers.push({ p: new Path2D(o.d), w });
    }
    return organCovers;
  }

  // ── Interaction ───────────────────────────────────
  // A click picks a structure (a vessel, else the organ under the pointer, else nothing); a drag
  // pans. The only gestures that stay "armed" are the shunt (from its source to a drop target)
  // and the two paint brushes in the Draw menu, and each shows how to finish or cancel it.
  const pointers = new Map();
  let drag = null;
  let shunt = null; // { src, wx, wy, targets: Map(id → rule), hover }

  function edgeFromEvent(ev) {
    // While the pointer is captured, events retarget to the <svg>: hit-test the real point instead.
    const t = ev.target === svg && ev.clientX != null ? document.elementFromPoint(ev.clientX, ev.clientY) : ev.target;
    const el = t?.closest?.('.v-hit, .ghost-hit');
    return el ? el.getAttribute('data-id') : geomEdge(ev);
  }
  // Safari does not always report a transparent-stroke vessel as the element under the pointer (it works in Chrome),
  // so when the browser's own hit test finds no vessel, test the pointer against each vessel's hit stroke ourselves.
  function geomEdge(ev) {
    if (ev.clientX == null || ev.pointerType === 'touch' || lobuleOn) return null;
    let best = null;
    for (const id of Object.keys(E)) {
      const h = E[id]?.hit;
      if (!h || !h.isConnected || h.getAttribute('aria-hidden') === 'true' || !h.hasAttribute('d') || h.parentNode?.classList?.contains('no-hit')) continue;
      if (best && !(best.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;   // only a vessel drawn above the best so far can beat it
      try {
        const m = h.getScreenCTM();
        if (!m) continue;
        const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
        if (h.isPointInStroke(pt) && getComputedStyle(h.parentNode).display !== 'none' && getComputedStyle(h).pointerEvents !== 'none') best = h;
      } catch { /* not rendered */ }
    }
    if (best) return best.getAttribute('data-id');
    return null;
  }

  // Organs under a point (anatomy only). The varices and fundus are small sites. The abdomen is
  // only the visible fluid itself, so the bowel and its vessels never open the ascites view by accident.
  const ORGAN_OF = { liver: 'liver', heart: 'heart', spleen: 'spleen', stomach: null, esophagus: null, bowel: null, colon: null, appendix: null, duodenum: null, 'kidney-l': null };
  const ptIn = (el, x, y, stroke) => {
    if (!el) return false;
    const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
    try { return stroke ? el.isPointInStroke(pt) : el.isPointInFill(pt); } catch { return false; }
  };
  function organAt(wx, wy) {
    if (morph > 0.5) return null;
    for (const o of [...ORGANS].reverse()) {
      if (o.deco || !ORGAN_OF[o.id]) continue;
      const el = organEls[o.id];
      if (o.band ? ptIn(el, wx, wy, true) : ptIn(el, wx, wy)) return ORGAN_OF[o.id];
    }
    if (fluidSurf && ptIn(abdomenEl, wx, wy) && wy > fluidSurf(wx)) return 'abdomen';
    return null;
  }
  const abdomenEl = s('path', { d: ABDOMEN_CLIP, fill: 'none', stroke: 'none' });
  defs.append(abdomenEl);

  function computeHighlight(id) {
    if (!F) return new Set([id]);
    const set = new Set([id]);
    const out = {}, inn = {};
    for (const e of EDGES) {
      if (!E[e.id]?.vis || e.kind === 'wedge') continue;
      const q = F.Q[EI[e.id]];
      if (Math.abs(q) < 0.02) continue;
      const [a, b] = q > 0 ? [e.from, e.to] : [e.to, e.from];
      (out[a] ||= []).push([e.id, b]); (inn[b] ||= []).push([e.id, a]);
    }
    const e0 = EDGES[EI[id]];
    if (!e0) return set;
    const q0 = F.Q[EI[id]];
    const [s0, t0] = q0 >= 0 ? [e0.from, e0.to] : [e0.to, e0.from];
    const walk = (start, map) => {
      const seen = new Set([start]); let frontier = [start];
      for (let d = 0; d < 14 && frontier.length; d++) {
        const nxt = [];
        for (const n of frontier) for (const [eid, m] of map[n] || []) { set.add(eid); if (!seen.has(m)) { seen.add(m); nxt.push(m); } }
        frontier = nxt;
      }
    };
    walk(t0, out); walk(s0, inn);
    return set;
  }
  function setHover(id) {
    if (id === hoverId) return;
    hoverId = id;
    if (hl) for (const e of hl) if (E[e]) cls(E[e], 'hl', false);
    hl = null;
    if (id && store.get().tool === 'select' && !shunt) {
      hl = computeHighlight(id);
      // The flow path runs on into the IVC, but hovering anything else must not light it.
      if (!IVC_EDGES.has(id)) for (const e of IVC_EDGES) hl.delete(e);
      for (const e of hl) if (E[e]) cls(E[e], 'hl', true);
      wrap.classList.add('hovering');
    } else wrap.classList.remove('hovering');
    syncLift();
    syncVeins(easeInOut(morph));
  }

  // Organ and site hover: a soft version of the selection outline, never kept once the pointer is away.
  const gHovO = s('g', { id: 'organHover', 'aria-hidden': 'true' });
  gSelO.after(gHovO);
  let hovO = '';
  function setOrganHover(o, lobe) {
    const key = o ? o + (lobe || '') : '';
    if (key === hovO) return;
    hovO = key;
    gHovO.replaceChildren();
    if (!o) return;
    const byOrgan = { liver: 'liver', heart: 'heart', spleen: 'spleen' }[o];
    if (byOrgan) {
      const d = organEls[byOrgan]?.getAttribute('d');
      if (!d) return;
      const el = s('path', { class: 'org-hov-line', d }), tr = organG[byOrgan].getAttribute('transform');
      if (tr) el.setAttribute('transform', tr);
      gHovO.append(el);
      return;
    }
    if (o === 'abdomen') {   // the fluid itself, clipped as it is drawn, so it grows with the ascites
      const fd = ascitesPath.getAttribute('d');
      if (!fd) return;
      const cg = s('g', { 'clip-path': 'url(#abdomenClip)' });
      cg.append(s('path', { class: 'org-hov-fluid', d: fd }), s('path', { class: 'org-hov-line', d: ascitesLine.getAttribute('d') || '' }));
      gHovO.append(cg);
      return;
    }
    
  }
  // Nothing stays lit once the pointer is gone, cancelled or lifted (a finger has no hover).
  function clearHover() { setHover(null); setOrganHover(null); onHoverInfo(null); }
  svg.addEventListener('pointerover', (ev) => {
    if (ev.pointerType === 'touch') return;
    const id = edgeFromEvent(ev);
    if (id && EI[id] != null) {
      setHover(id);
      // The element under a still pointer can change (the figure redraws): show the readings then too, not only on a move.
      if (F && !shunt) { const r = wrap.getBoundingClientRect(); onHoverInfo({ id, x: ev.clientX - r.left, y: ev.clientY - r.top }); }
    }
  });
  svg.addEventListener('pointerout', (ev) => { if (edgeFromEvent(ev)) { setHover(null); onHoverInfo(null); } });
  svg.addEventListener('pointerleave', clearHover);
  svg.addEventListener('pointercancel', clearHover);
  svg.addEventListener('pointerup', (ev) => { if (ev.pointerType === 'touch') clearHover(); });
  svg.addEventListener('touchend', clearHover, { passive: true });
  svg.addEventListener('touchcancel', clearHover, { passive: true });
  document.documentElement.addEventListener('mouseleave', clearHover);
  window.addEventListener('blur', clearHover);
  svg.addEventListener('pointermove', (ev) => {
    if (shunt) shuntMove(ev);
    if (ev.pointerType === 'touch') return;   // a finger has no hover (a long press peeks instead)
    const id = edgeFromEvent(ev);
    if (id && EI[id] != null && F && !shunt) {
      onHoverInfo({ id, x: ev.clientX - wrap.getBoundingClientRect().left, y: ev.clientY - wrap.getBoundingClientRect().top });
      setHover(id); setOrganHover(null);
      return;
    }
    if (hoverId) setHover(null);   // the pointer is over no vessel any more (also after a captured drag)
    if (!drag) onHoverInfo(null);
    if (!shunt && !drag && !lobuleOn && store.get().tool === 'select') {
      const [wx, wy] = clientToWorld(ev.clientX, ev.clientY), o = organAt(wx, wy);
      const sel = store.get().selection;
      const near = o ? nearbyEdge(ev) : null;   // a click here would pick this vessel, so the organ must not light
      if (near && EI[near] != null && F) { setHover(near); setOrganHover(null); return; }
      if (o && !(sel?.type === 'organ' && sel.id === o)) setOrganHover(o, o === 'liver' ? (wx < LIVER_SPLIT_X ? 'R' : 'L') : '');
      else setOrganHover(null);
    } else setOrganHover(null);
  });

  // ── Gestures: wheel, trackpad, mouse and touch ──
  // A mouse wheel zooms about the pointer. A trackpad's two-finger scroll pans and its pinch (a
  // wheel event with ctrlKey) zooms, as in maps and drawing apps; Ctrl/⌘ + wheel always zooms.
  // Trackpad scrolls are told from wheel notches once per gesture: Chrome and Safari report a
  // trackpad's legacy wheelDelta as exactly three times its delta, Firefox reports notches in lines.
  let wheelKind = null, wheelAt = 0, settleT = 0;
  const wheelPx = (ev, d) => d * (ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? stageBox().height : 1);
  const settleSoon = (ms = 220) => { clearTimeout(settleT); settleT = setTimeout(springBack, ms); };
  const onWheel = (ev) => {
    ev.preventDefault();
    stopGlide(); userMoved = true;
    const dx = wheelPx(ev, ev.deltaX), dy = wheelPx(ev, ev.deltaY), now = performance.now();
    if (ev.ctrlKey || ev.metaKey) { zoomAt(ev.clientX, ev.clientY, Math.exp(-clamp(dy, -50, 50) * 0.01), true); settleSoon(); return; }
    if (now - wheelAt > 250) {
      const pad = ev.deltaMode === 0 && (dx !== 0 || ev.wheelDeltaY == null || Math.abs(Math.abs(ev.wheelDeltaY) - Math.abs(ev.deltaY) * 3) < 1);
      wheelKind = pad ? 'pad' : 'wheel';
    }
    wheelAt = now;
    if (wheelKind === 'wheel' || lobuleOn) { zoomAt(ev.clientX, ev.clientY, Math.exp(-clamp(dy, -120, 120) * 0.0015)); return; }
    if (scrubS > 0) return;   // panning is locked onto the lobule while the dive is under the fingers
    const s = vbScale();
    const u0 = unsoftPan(vt);
    vt = softPan({ k: vt.k, x: u0.x - dx / s, y: u0.y - dy / s });
    applyVT(); CTM = null; settleSoon();
  };
  svg.addEventListener('wheel', onWheel, { passive: false });
  labelSvg.addEventListener('wheel', onWheel, { passive: false });

  // The figure never gets lost: past the zoom limits, or panned until its middle leaves the
  // view, it springs back once the gesture ends. During a pinch the limits stretch a little.
  const K_MIN = 0.6, K_MAX = 6;
  const softK = (k) => (k > K_MAX ? K_MAX * Math.pow(k / K_MAX, 0.3) : k < K_MIN ? K_MIN * Math.pow(k / K_MIN, 0.3) : k);
  function visibleVB() {
    const b = stageBox(), vb = svg.viewBox.baseVal, s = Math.min(b.sw / vb.width, b.sh / vb.height);
    return { x: vb.x - (b.sw - vb.width * s) / 2 / s, y: vb.y - (b.sh - vb.height * s) / 2 / s, w: b.sw / s, h: b.sh / s };
  }
  // Panning past the figure meets rising resistance, the lobule view's rubber band: a tanh band easing toward
  // 40% of the view, measured from where the middle of the view meets the figure's edge (at the fit zoom, from the fit framing).
  // hardPan is the nearest resting place; softPan puts a raw pan on the band, unsoftPan takes a banded pan back to raw.
  function hardPan(v) {
    const d = defaultVT(morphTarget === 1);
    if (v.k <= d.k * 1.001) return { k: v.k, x: d.x, y: d.y };   // at the fit zoom the bounds are the fit position itself, as the lobule at its framing
    const c = morphTarget === 1 ? circVB() : VB_ANAT, vis = visibleVB();
    const x0 = c[0] * v.k + v.x, x1 = (c[0] + c[2]) * v.k + v.x, y0 = c[1] * v.k + v.y, y1 = (c[1] + c[3]) * v.k + v.y;
    const vx = vis.x + vis.w / 2, vy = vis.y + vis.h / 2;
    return { k: v.k, x: v.x + (vx < x0 ? vx - x0 : vx > x1 ? vx - x1 : 0), y: v.y + (vy < y0 ? vy - y0 : vy > y1 ? vy - y1 : 0) };
  }
  function bandPan(v, inv) {
    const h = hardPan(v), vis = visibleVB(), Lx = 0.4 * vis.w, Ly = 0.4 * vis.h;
    const f = (o, L) => (inv ? Math.atanh(clamp(o / L, -0.999, 0.999)) * L : L * Math.tanh(o / L));
    return { k: v.k, x: h.x + f(v.x - h.x, Lx), y: h.y + f(v.y - h.y, Ly) };
  }
  const softPan = (v) => bandPan(v, false), unsoftPan = (v) => bandPan(v, true);
  function springBack() {
    if (lobuleOn || vtGliding || drag || glide) return;
    let to = { ...vt };
    const k = clamp(vt.k, K_MIN, K_MAX);
    // At or past the fit zoom (zoomed out, or panned about at the fit), the view springs back to the fit framing, as in the lobule view.
    { const d = defaultVT(morphTarget === 1); if (vt.k <= d.k * 1.001) { if (!sameView(d, vt)) animateVT(d, 420); return; } }
    if (k !== vt.k) {
      const [cx, cy] = freeCentre(), [vx, vy] = clientToVB(cx, cy);
      to = { k, x: vx - ((vx - vt.x) / vt.k) * k, y: vy - ((vy - vt.y) / vt.k) * k };
    }
    // Lost means the middle of the view has left the figure: only then is it pulled back, and only as far as the
    // figure's edge. Zoomed in on any part (the spleen, a collateral), the view stays exactly where it was put.
    const c = morphTarget === 1 ? circVB() : VB_ANAT, vis = visibleVB();
    const x0 = c[0] * to.k + to.x, x1 = (c[0] + c[2]) * to.k + to.x, y0 = c[1] * to.k + to.y, y1 = (c[1] + c[3]) * to.k + to.y;
    const vx = vis.x + vis.w / 2, vy = vis.y + vis.h / 2;
    to.x += vx < x0 ? vx - x0 : vx > x1 ? vx - x1 : 0;
    to.y += vy < y0 ? vy - y0 : vy > y1 ? vy - y1 : 0;
    if (!sameView(to, vt)) animateVT(to, 380);
  }
  // A flick keeps the figure moving and slows it down, as a map does.
  let glide = 0;
  function stopGlide() { cancelFlick?.(); cancelFlick = null; glide = 0; }
  let cancelFlick = null;
  function fling(vx, vy) {
    if (reduceMotion.matches || Math.hypot(vx, vy) < FLICK.minSpeed) { springBack(); return; }
    const s0 = vbScale(), k = vt.k, h0 = hardPan(vt);
    // Let go past the bounds (always so at the fit zoom, where the drag rides the wide band): nothing to carry, so it eases home from
    // exactly where it is, as the lobule does at its framing. A flick would restart the stretch from a narrower band and jump.
    if (Math.abs(vt.x - h0.x) * s0 > 0.5 || Math.abs(vt.y - h0.y) * s0 > 0.5) { springBack(); return; }
    glide = 1;
    cancelFlick = runFlick({   // the lobule's flick, in screen pixels, bounded by the figure
      x: vt.x * s0, y: vt.y * s0, vx: vx, vy: vy,
      hard: (x, y) => { const h = hardPan({ k, x: x / s0, y: y / s0 }); return [h.x * s0, h.y * s0]; },
      apply: (x, y) => { vt = { k, x: x / s0, y: y / s0 }; applyVT(); CTM = null; },
      done: () => { glide = 0; cancelFlick = null; springBack(); },
    });
  }

  // Touch: every finger is captured by the figure, so a finger that lifts over a label or the
  // card still ends here (an uncaptured finger used to linger in `pointers` and turn the next
  // single touch into a pinch that jumped). Two fingers zoom and pan together: the point of the
  // figure under their midpoint stays under it. Lifting one finger hands over to a pan.
  // A double click zooms in about the point, Shift zooms out; a long press on a vessel shows its readings
  // without opening its card.
  const vbScale = () => { const b = stageBox(), vb = svg.viewBox.baseVal; return Math.min(b.sw / vb.width, b.sh / vb.height); };
  function clientToVBFast(cx, cy) {
    const b = stageBox(), vb = svg.viewBox.baseVal, s = Math.min(b.sw / vb.width, b.sh / vb.height);
    return [(cx - b.left - b.sx - (b.sw - vb.width * s) / 2) / s + vb.x, (cy - b.top - b.sy - (b.sh - vb.height * s) / 2) / s + vb.y];
  }
  const startPan = (x, y, id, moved = false) => ({ type: 'pan', x, y, vx: vt.x, vy: vt.y, s0: vbScale(), moved, id, trail: [[performance.now(), x, y]] });
  function startPinch() {
    const [a, b] = [...pointers.values()];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, [vx, vy] = clientToVBFast(mx, my);
    return { type: 'pinchzoom', d0: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])), k0: vt.k, wx: (vx - vt.x) / vt.k, wy: (vy - vt.y) / vt.k, mx, my, t0: performance.now(), moved: false };
  }
  let pressT = 0, lastTap = null;
  const clearPress = () => { clearTimeout(pressT); pressT = 0; };
  // A finger (or the mouse) that lands on a label starts the same gesture as one on the figure: the labels cover
  // much of a phone's figure, and a pinch that began on one used to go unnoticed. A tap on a label still opens it.
  labelSvg.addEventListener('pointerdown', (ev) => { const lb = ev.target.closest?.('.lb'); if (lb) onDown(ev, lb); });
  svg.addEventListener('pointerdown', (ev) => onDown(ev, null));
  function onDown(ev, label) {
    if (systemEdge(ev)) return;
    // The first finger of a new gesture: nothing else can still be down.
    if (ev.isPrimary) pointers.clear();
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    userMoved = true;
    cancelAnimationFrame(vtAnim); vtGliding = false; stopGlide(); clearTimeout(settleT);
    try { svg.setPointerCapture(ev.pointerId); } catch { /* pointer already gone */ }
    clearPress();
    if (pointers.size >= 2) {
      if (drag?.type === 'pan') wrap.classList.remove('panning');
      if (drag?.peeked) onHoverInfo(null);
      if (drag && drag.type !== 'pan' && drag.type !== 'pinchzoom') gGuides.innerHTML = '';
      drag = pointers.size === 2 ? startPinch() : drag;
      return;
    }
    if (ev.button === 2) return;   // the context menu opens the card instead
    drag = startPan(ev.clientX, ev.clientY, label ? null : edgeFromEvent(ev));
    drag.label = label;
    wrap.classList.add('panning');
    if (ev.pointerType === 'touch' && !shunt && !label) {
      const d = drag, x = ev.clientX, y = ev.clientY;
      pressT = setTimeout(() => {
        if (drag !== d || d.moved || pointers.size !== 1) return;
        const id = d.id && EI[d.id] != null ? d.id : nearbyEdge({ clientX: x, clientY: y, pointerType: 'touch' });
        if (!id) return;
        d.peeked = true;
        const r = wrap.getBoundingClientRect();
        onHoverInfo({ id, x: x - r.left, y: y - r.top, peek: true });
        navigator.vibrate?.(8);
      }, 480);
    }
  }
  svg.addEventListener('pointermove', (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (!drag || drag.type === 'ignore') return;
    if (drag.type === 'pinchzoom') {
      if (pointers.size !== 2) return;
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (Math.abs(d - drag.d0) > 10 || Math.hypot(mx - drag.mx, my - drag.my) > 10) drag.moved = true;
      if (lobuleOn) return;
      const dl = drag.dl || d; drag.dl = d;
      if (d !== dl && scrubBy(d / dl)) {   // past the liver zoom the pinch scrubs the dive; the camera is rebased for when it ends
        drag.d0 = d; drag.k0 = vt.k; const [sx, sy] = clientToVBFast(mx, my); drag.wx = (sx - vt.x) / vt.k; drag.wy = (sy - vt.y) / vt.k;
        return;
      }
      const k = softK(drag.k0 * d / drag.d0);
      const [vx, vy] = clientToVBFast(mx, my);
      vt = { k, x: vx - drag.wx * k, y: vy - drag.wy * k };
      applyVT(); CTM = null;
      return;
    }
    if (drag.type === 'pan') {
      if (Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) > (ev.pointerType === 'touch' ? 8 : 4)) { drag.moved = true; clearPress(); }
      if (drag.peeked) {   // a long press then drag: the popup follows whichever vessel is under the finger
        const r = wrap.getBoundingClientRect();
        const id = edgeFromEvent(ev) || nearbyEdge(ev);
        if (id && EI[id] != null) onHoverInfo({ id, x: ev.clientX - r.left, y: ev.clientY - r.top, peek: true });
        else onHoverInfo(null);
        return;
      }
      if (drag.moved && scrubS === 0) {
        vt = softPan({ k: vt.k, x: drag.vx + (ev.clientX - drag.x) / drag.s0, y: drag.vy + (ev.clientY - drag.y) / drag.s0 });
        applyVT(); CTM = null;
        const now = performance.now();
        drag.trail.push([now, ev.clientX, ev.clientY]);
        while (drag.trail.length > 2 && now - drag.trail[0][0] > 90) drag.trail.shift();
      }
      return;
    }
  });
  const endPointer = (ev) => {
    if (!pointers.delete(ev.pointerId)) return;
    clearPress();
    if (!drag) return;
    if (drag.type === 'ignore') { if (!pointers.size) { drag = null; springBack(); } return; }
    if (drag.type === 'pinchzoom') {
      // One finger stays down: it carries on as a pan (never as a click, never thrown on release).
      const rest = [...pointers.values()][0];
      drag = rest && pointers.size === 1 ? Object.assign(startPan(rest[0], rest[1], null, true), { noFling: true }) : pointers.size >= 2 ? startPinch() : null;
      if (!drag) springBack();
      return;
    }
    if (drag.type === 'pan') {
      wrap.classList.remove('panning');
      const d = drag;
      drag = null;
      if (d.peeked) { onHoverInfo(null); return; }
      if (!d.moved) {
        if (ev.type !== 'pointerup') return;
        if (shunt) { shuntDrop(ev); return; }
        const now = performance.now();
        // The second tap of a double tap zooms (and puts back whatever the first tap selected).
        // (Not by touch: there the first tap opens a card, whose sheet moves the figure, and the two moves fought.)
        if (ev.pointerType !== 'touch' && lastTap && now - lastTap.t < 320 && Math.hypot(ev.clientX - lastTap.x, ev.clientY - lastTap.y) < 30 && !lobuleOn) {
          const prev = lastTap.sel;
          lastTap = null;
          animZoomAt(ev.clientX, ev.clientY, ev.shiftKey ? 1 / 2 : 2);
          if (store.get().selection !== prev) onSelect(prev, { quiet: true });
          return;
        }
        lastTap = { t: now, x: ev.clientX, y: ev.clientY, sel: store.get().selection };
        if (d.label) { d.label.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
        pick(d.id, ev);
        return;
      }
      // A real flick only: enough of a trail to measure, still moving at release, and capped, so a lift that
      // jitters never throws the figure.
      const tr = d.trail, a = tr[0], b = tr[tr.length - 1], dt = b[0] - a[0];
      if (!d.noFling && tr.length >= 3 && dt >= 30 && performance.now() - b[0] < 50) {
        const vx = (b[1] - a[1]) / dt, vy = (b[2] - a[2]) / dt, sp = Math.hypot(vx, vy), cap = Math.min(1, 2 / (sp || 1));
        fling(vx * cap, vy * cap);
      } else springBack();
      return;
    }
    drag = null;
    gGuides.innerHTML = '';
  };
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('lostpointercapture', endPointer);
  // Right-click opens the card of what is under the pointer.
  svg.addEventListener('contextmenu', (ev) => {
    if (shunt || lobuleOn) return;
    ev.preventDefault();
    pick(edgeFromEvent(ev), ev);
  });

  // A tap that just misses a thin vessel still picks it: look around the point (out to ~14 px,
  // more on touch) for a vessel before falling back to the organ or the abdomen under it.
  function nearbyEdge(ev) {
    if (ev.clientX == null) return null;
    const R = ev.pointerType === 'touch' ? 18 : 12;
    for (const r of [R / 3, (2 * R) / 3, R]) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const el = document.elementFromPoint(ev.clientX + Math.cos(a) * r, ev.clientY + Math.sin(a) * r)?.closest?.('.v-hit, .ghost-hit');
        const id = el?.getAttribute('data-id');
        if (id && EI[id] != null) return id;
      }
    }
    return null;
  }
  function pick(id, ev) {
    if (!(id && EI[id] != null)) id = nearbyEdge(ev);
    if (id && EI[id] != null) { onSelect({ type: 'edge', id }); return; }
    const [wx, wy] = clientToWorld(ev.clientX, ev.clientY);
    const o = organAt(wx, wy);
    onSelect(o ? { type: 'organ', id: o, at: [wx, wy], lobe: o === 'liver' ? (wx < LIVER_SPLIT_X ? 'R' : 'L') : undefined } : null);
  }


  // Keyboard: Tab reaches each vessel, Enter opens its card, arrows walk along the flow.
  svg.addEventListener('keydown', (ev) => {
    const id = ev.target.getAttribute?.('data-id');
    if (!id) return;
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (shunt) { shuntDropOn(id); return; } onSelect({ type: 'edge', id }, { keyboard: true }); }
    if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && F && EI[id] != null) {
      ev.preventDefault();
      const e = EDGES[EI[id]];
      const q = F.Q[EI[id]];
      const node = (ev.key === 'ArrowRight') === (q >= 0) ? e.to : e.from;
      const next = EDGES.find((x) => x.id !== id && E[x.id]?.vis && (x.from === node || x.to === node) && x.kind !== 'wedge');
      if (next) { E[next.id].hit.focus(); onSelect({ type: 'edge', id: next.id }, { quiet: true }); }
    }
  });
  svg.addEventListener('focusin', (ev) => {
    const id = ev.target.getAttribute?.('data-id');
    if (id && F && EI[id] != null) {
      const e = EDGES[EI[id]], q = F.Q[EI[id]];
      ev.target.setAttribute('aria-label', `${e.label}: ${fmt(F.P[NI[e.from]], 1)} to ${fmt(F.P[NI[e.to]], 1)} millimeters of mercury, flow ${fmt(q * 0.06, 2)} liters per minute${E[id].rev ? ', reversed' : ''}. Press Enter for actions.`);
    }
  });

  // ── Shunts: from a source vessel to a drop target ──
  // Any portal vein to any systemic vein. The shunt joins each vessel at its end nearer the
  // other; when that pair is exactly a named procedure's (TIPS is right portal →
  // right hepatic vein), it is that procedure, otherwise a custom shunt between those two veins.
  const NAMED_RULES = {
    'RPV>RHV': { key: 'tips', label: 'TIPS' },
    'PVH>IVCI': { key: 'dips', label: 'DIPS' },
    'RPV>IVCS': { key: 'dips', label: 'DIPS' },
    'CONF>IVCI': { key: 'portocaval', label: 'Portocaval shunt' },
    'SV>LRV': { key: 'dsrs', label: 'Distal splenorenal shunt' },
    'SMV>IVCI': { key: 'mesocaval', label: 'Mesocaval shunt' },
  };
  function shuntRule(a, b, ax, ay, bx, by) {
    const t = easeInOut(morph);
    const ends = (id, set, x, y) => [E[id].e.from, E[id].e.to].filter((n) => set.includes(n))
      .sort((m, n) => Math.hypot(nodePos(m, t)[0] - x, nodePos(m, t)[1] - y) - Math.hypot(nodePos(n, t)[0] - x, nodePos(n, t)[1] - y))[0];
    for (const [pe, px, py, se, sx, sy] of [[a, ax, ay, b, bx, by], [b, bx, by, a, ax, ay]]) {
      // Each vessel is joined at its end nearer the other vessel.
      const pn = ends(pe, SHUNT_PORTAL, sx, sy), sn = ends(se, SHUNT_SYSTEMIC, px, py);
      if (!pn || !sn) continue;
      if (NAMED_RULES[`${pn}>${sn}`]) return NAMED_RULES[`${pn}>${sn}`];
      const id = customShuntId(pn, sn);
      if (EI[id] != null) return { key: 'custom', id, label: EDGES[EI[id]].label };
    }
    return null;
  }
  function startShunt(src, { only } = {}) {
    if (!E[src]?.vis) return false;
    cancelShunt(true);
    const [wx, wy] = pointAt(geo[src].cur, 0.5);
    const targets = new Map();
    for (const x of Object.values(E)) {
      if (!x.vis || x.isArt || x.e.id === src || x.e.kind === 'shunt' || x.e.kind === 'liver') continue;
      const [tx, ty] = pointAt(geo[x.e.id].cur, 0.5);
      const r = shuntRule(src, x.e.id, wx, wy, tx, ty);
      if (r && (!only || r.key === only)) { targets.set(x.e.id, r); cls(x, 'shunt-target', true); }
    }
    if (!targets.size) { toast('No vessel on the other side of the circulation to connect this one to.'); return false; }
    shunt = { src, wx, wy, targets, hover: null };
    cls(E[src], 'shunt-src', true);
    wrap.classList.add('shunting');
    setHover(null);
    store.set({ shunting: { src, only: only || null } });
    return true;
  }
  function cancelShunt(silent) {
    if (!shunt) return;
    for (const id of shunt.targets.keys()) if (E[id]) cls(E[id], 'shunt-target', false);
    if (E[shunt.src]) cls(E[shunt.src], 'shunt-src', false);
    shunt = null;
    gGuides.innerHTML = '';
    wrap.classList.remove('shunting');
    if (!silent) store.set({ shunting: null });
  }
  function shuntMove(ev) {
    const [wx, wy] = clientToWorld(ev.clientX, ev.clientY);
    const tgt = edgeFromEvent(ev);
    const ok = tgt && shunt.targets.has(tgt);
    shunt.hover = ok ? tgt : null;
    gGuides.innerHTML = '';
    gGuides.append(s('path', { class: 'stent-guide' + (tgt && !ok && tgt !== shunt.src ? ' invalid' : ''), d: `M${shunt.wx} ${shunt.wy} L ${wx} ${wy}` }));
    if (ok) {
      gGuides.append(s('path', { class: 'target-glow', d: E[tgt].wall.getAttribute('d'), 'stroke-width': E[tgt].width + 16 }));
      const r = shunt.targets.get(tgt);
      gGuides.append(s('text', { x: wx + 14, y: wy - 10, class: 'guide-label' }, document.createTextNode(r.label)));
    }
  }
  function shuntDrop(ev) {
    const tgt = edgeFromEvent(ev);
    if (tgt && shunt.targets.has(tgt)) { shuntDropOn(tgt); return; }
    if (!tgt) { cancelShunt(); toast('Shunt cancelled.'); }
  }
  function shuntDropOn(tgt) {
    const r = shunt?.targets.get(tgt);
    if (!r) return;
    cancelShunt();
    if (r.key === 'tips') updateParams({ tips: { on: true, d: store.get().params.tips.d || 8 } }, { label: 'TIPS' });
    else if (r.key === 'dips') updateParams({ dips: { on: true, d: store.get().params.dips.d || 8 } }, { label: 'DIPS' });
    else if (r.key === 'custom') updateParams((p) => { p.customShunts = { ...(p.customShunts || {}), [r.id]: 10 }; return p; }, { label: r.label });
    else updateParams({ [r.key]: true }, { label: r.label });
    toast(`${r.label} created.`);
    onSelect({ type: 'edge', id: r.key === 'tips' ? 'TIPS' : r.key === 'dips' ? 'DIPS' : r.key === 'custom' ? r.id : { portocaval: 'S_PC', dsrs: 'S_DSR', mesocaval: 'S_MC' }[r.key] });
  }

  // ── Anchors for the action card ───────────────────
  const ORGAN_ANCHOR = { liver: [470, 360], heart: [650, 118], spleen: [1052, 362], varices: SITES.varix, gastric: SITES.fundus, abdomen: [720, 770] };
  function anchorFor(sel) {
    if (!sel) return null;
    if (sel.type === 'lobule') return lz?.anchorFor(sel) || null;
    refreshCTM();
    if (sel.type === 'edge' && geo[sel.id] && E[sel.id]?.vis) {
      const pts = geo[sel.id].cur;
      const [x, y] = worldToLocal(...pointAt(pts, 0.5));
      const path = [];
      for (let i = 0; i < pts.length; i += 3) path.push(worldToLocal(pts[i][0], pts[i][1]));
      return { x, y, path };
    }
    if (sel.type === 'organ') {
      const w = sel.at || ORGAN_ANCHOR[sel.id];
      if (!w) return null;
      const [x, y] = worldToLocal(w[0], w[1]);
      const org = { liver: 'liver', heart: 'heart', spleen: 'spleen' }[sel.id];
      const path = [[x, y]];
      if (org && organEls[org]?.getBBox) {
        const b = organEls[org].getBBox();
        for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) path.push(worldToLocal(b.x + (b.width * i) / 4, b.y + (b.height * j) / 4));
      }
      return { x, y, path };
    }
    return null;
  }

  // ── Public API ────────────────────────────────────
  return {
    update,
    setView(v) {
      const target = v === 'circuit' ? 1 : 0;
      if (target === morphTarget) return;
      // (The dive into the lobule never moves the anatomy's own framing.)
      const fromLobule = lobuleOn || lobU > 0, at = vt;
      morphTarget = target;
      syncSemantic();
      // Zoomed out (or fitted) in the anatomy, the circuit opens zoomed out too: the whole map, not
      // the close-up it opens with on a phone. From a zoomed-in view it takes its usual framing.
      const wasOut = target === 1 && (fromLobule || at.k <= 1.001 || (homeAt && sameView(at, homeAt)));   // the whole plate (or less) is showing
      const d = wasOut ? insetVT({ k: 1, x: 0, y: 0 }, circVB()) : defaultVT(target === 1);
      if (target === 0) homeAt = d;   // back to the anatomy: always its home framing
      if (d.k !== vt.k || d.x !== vt.x || d.y !== vt.y) animateVT(d, 600);
    },
    relayout() { refreshCTM(); if (F) updateLabels(F); },
    // The label slots as solved (key → side and pixel offset from the figure point it names), for tests.
    labelSlots: () => Object.fromEntries([...labelSol].filter(([, r]) => !r.drop).map(([k, r]) => [k, `${r.dir}/${r.pi}/${Math.round(r.dx)},${Math.round(r.dy)}`])),
    labelScale: () => labelScale,
    /** The HVPG catheter: null removes it; else { u (0..1 of the way in), balloon, column (0..1), columnColor, ring, pulse,
     *  opacity, labels: [{ key, at: 'tip' | 'ahead', kicker, text, unit, cls }] }. */
    setCatheter(st) { cath.st = st; wrap.classList.toggle('cath-on', !!st); if (!st) { cath.rc = 0; cath.route = null; if (veins?.canCath) veins.setCath(null); cathVer++; if (cathTint) { cathTint = null; cath.tintKey = ''; syncVeins(easeInOut(morph)); } cath.g.style.display = 'none'; cath.labels.hidden = true; cath.labels.replaceChildren(); cath.labels.dataset.k = ''; cath.at = null; return; } cathPaint(); },
    /** Frame the catheter's route ('route'), its tip close up ('tip'), or go back to the view before ('home'). */
    cathFocus,
    /** The vessel the Doppler is reading, glowing green while the Doppler instrument is open (null: none). */
    setDoppler(id) {
      if (id && !E[id]) id = null;
      if (id === dop.id) return;
      dop.id = id;
      dop.g.style.display = id ? '' : 'none';
      if (id) { const x = E[id], d = x.wall.getAttribute('d'); if (d) dop.paint(d, x.dopW || 8); }
    },
    setLabelScale(v) {
      labelScale = clamp(Math.round(v * 100) / 100, LABEL_MIN, LABEL_MAX);
      try { localStorage.setItem('pps.labelScale', String(labelScale)); } catch { /* storage unavailable */ }
      document.documentElement.style.setProperty('--label-k', String(labelScale));
      dispatchEvent(new Event('pps:labelscale'));
      if (F) updateLabels(F);
    },
    setProjection(on) { projecting = !!on; if (F) updateLabels(F); },
    labelLayer: () => labelSvg,
    /** The layer the GPU's picture lies under (lesions, stents, halos), when the GPU draws. */
    overLayer: () => (veins && wrap.classList.contains('gl-on') ? svgOver : null),
    /** A vessel's stream (for tests): flow, display speed, stream distance, stasis. */
    flowDir(id) {
      const k = EI[id], sm = streams[k];
      if (k == null || !F || sm.vd == null) return null;
      return { q: (F.Qf || F.Q)[k], vd: sm.vd, D: sm.D, stasis: sm.stasis, dir: Math.sign(sm.vd) };
    },
    injectDye,
    releaseDye: () => bolus.release(),
    clearDye: () => bolus.clear(),
    dyeActive: () => bolus.active,
    dyeInjecting: () => bolus.injecting,
    svg,
    worldToLocal: (x, y) => { refreshCTM(); return worldToLocal(x, y); },
    anchorPos(anchor) {
      const t = easeInOut(morph);
      if (NODE_POS[anchor]) return nodePos(anchor, t);
      if (geo[anchor]) return pointAt(geo[anchor].cur, 0.5);
      return null;
    },
    // The zoom buttons zoom about the middle of the free space; in the lobule they drive its own view.
    zoomIn: () => { if (lobuleOn) { lz.zoomBy(1.4); return; } const c = freeCentre(); animZoomAt(c[0], c[1], 1.4); },
    zoomOut: () => { if (lobuleOn) { lz.zoomBy(1 / 1.4); return; } const c = freeCentre(); animZoomAt(c[0], c[1], 1 / 1.4); },
    fit, refit,
    reveal, unreveal,
    /** Changes whenever what is drawn where changes (a pan, a zoom, the morph): a cheap key for "did anything move". */
    layoutKey: () => `${viewVersion}|${geometryVersion}` + (lz?.isOpen() ? '|' + lz.viewKey() : ''),
    setCircuitRotated,
    circuitRotated: () => rotTarget === 1,
    zoomToBox,
    cameraKey: () => `${vt.k.toFixed(3)}|${vt.x.toFixed(1)}|${vt.y.toFixed(1)}`,
    zoomLobule, zoomLiver, lobuleOpen: () => !!lz?.isOpen(), lobuleViewKey: () => lz?.viewKey(),
    /** On-screen scale, px per world unit (for the tests: turning the circuit keeps it). */
    zoomLevel: () => { refreshCTM(); return CTM.sc; },
    focusEdge(id) { E[id]?.hit.focus(); },
    startShunt, cancelShunt, isShunting: () => !!shunt, anchorFor, organAt,
    /** Briefly glow the given vessels (where a readout is measured). */
    flash(ids) {
      const g = s('g', { class: 'flash' });
      for (const id of ids) if (E[id]?.vis) g.append(s('path', { class: 'flash-ring', d: E[id].wall.getAttribute('d'), 'stroke-width': (E[id].width + 18).toFixed(1) }));
      gFocus.after(g);
      setTimeout(() => g.remove(), 1700);
    },
    edgeMid: (id) => (geo[id] ? pointAt(geo[id].cur, 0.5) : null),
    /** The drawn network's box on screen (px, in the figure), for placing cards beside it. */
    contentRect() {
      if (netBoxFor !== geometryVersion) { try { netBox = gNet.getBBox(); } catch { netBox = null; } netBoxFor = geometryVersion; }
      if (!netBox?.width) return null;
      refreshCTM();
      const c = [[netBox.x, netBox.y], [netBox.x + netBox.width, netBox.y], [netBox.x, netBox.y + netBox.height], [netBox.x + netBox.width, netBox.y + netBox.height]].map(([x, y]) => worldToLocal(x, y));
      const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
      return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    },
    isVisible: (id) => E[id]?.vis,
  };
}
