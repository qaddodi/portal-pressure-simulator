// Anatomical stage (blueprint §6): SVG anatomy + canvas flow layer + screen-space labels.

import { EDGES, NODES, PORTAL_TERRITORY, COLLATERAL_DMIN_RATIO, dMinOf, edgePresent, SHUNT_PORTAL, SHUNT_SYSTEMIC, customShuntId } from '../engine/topology.js?v=6d79260961';
import { VIEW, VB_ANAT, VB_CIRC, ATLAS_COLUMNS, HIDDEN_EDGES, HIDDEN_NODES, ANAT_HIDDEN, CONTEXT_EDGES, BACK_EDGES, NEEDS_C3, NODE_POS, EDGE_PATH, CIRCUIT_PATH, metroPath, ORGANS, ORGAN_DETAIL, BACKDROP, LIVER_MODULE, LIVER_INNER, LIVER_EDGES, MAIN_ROUTE, LANE_CAPTIONS, ABDOMEN_CLIP, ABDOMEN_FLOOR, SPLEEN_CENTER, SITES, ORGAN_LABELS, ATLAS_LABELS, EDGE_VESSEL, SHORT, CHIP_NODES, LIVER_SPLIT_X, CIRCUIT_ZONES, CIRCUIT_LABELS, STRANDS } from './anatomy.js?v=9a27037e31';
import { pressureColor, deltaColor, dropColor, flowColor, velocityColor, heatColor } from './colormap.js?v=fa78a29bc0';
import { store, updateParams } from './store.js?v=4bf5a96a9d';
import { s, h, fmt, fp, clamp, lerp, toast, cssVar } from './util.js?v=13768f12bf';
import { createLobuleZoom } from './lobule-zoom.js?v=07bdce5cd7';
import { createFlowGL, rgba, MARK_FLOATS, SEG_FLOATS } from './flow-gl.js?v=0db0a6d947';

const N_SAMPLES = 64;
// Displayed width grows sub-linearly with diameter so the cavae don't swamp the portal tree,
// while distension of small veins and collaterals stays visible.
const vesselPx = (D) => Math.max(2.6, 2.0 * Math.pow(Math.max(0.1, D), 0.72));
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
  let canvas = wrap.querySelector('#particles');
  const overlay = wrap.querySelector('#overlay');
  const stageWrap = wrap.closest('.stage-wrap') || wrap;
  svg.setAttribute('viewBox', `0 0 ${VIEW.w} ${VIEW.h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // ── Geometry sampling ──────────────────────────────
  const scratch = s('path');
  svg.append(scratch);
  function sample(d) {
    scratch.setAttribute('d', d);
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
  const defaultPath = (a, b, circuit) => (circuit ? metroPath(a, b) : `M${a[0]} ${a[1]} L ${b[0]} ${b[1]}`);
  const geo = {};
  for (const e of ALL_EDGES) {
    const a = NODE_POS[e.from], b = NODE_POS[e.to];
    const dA = EDGE_PATH[e.id] || defaultPath(a[0], b[0], false);
    const dC = CIRCUIT_PATH[e.id] || defaultPath(a[1], b[1], true);
    const A = e.kind === 'collateral' || e.kind === 'shunt' ? sample(dA) : meander(sample(dA), e.id);
    geo[e.id] = { dA, dC, A, C: sample(dC), cur: null, len: 0, wig: 0 };
  }
  scratch.remove();
  // Where to caption each circuit lane: the middle of its longest horizontal run.
  const laneU = {};
  for (const id of Object.keys(LANE_CAPTIONS)) {
    const C = geo[id]?.C;
    if (!C) continue;
    let best = [0, 0], run = 0;
    for (let i = 1; i < C.length; i++) {
      if (Math.abs(C[i][1] - C[i - 1][1]) < 0.6) { run++; if (run > best[1]) best = [i - run / 2, run]; } else run = 0;
    }
    laneU[id] = best[1] ? best[0] / (C.length - 1) : 0.5;
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
  // Lateral offset of `off` units at mid-course, easing to zero at both ends.
  function braid(pts, off) {
    if (Math.abs(off) < 0.3) return pts;
    return pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      const a = pts[i - 1], b = pts[i + 1];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      const o = off * Math.sin((Math.PI * i) / (pts.length - 1));
      return [p[0] + nx * o, p[1] + ny * o];
    });
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

  const nodePos = (id, t) => { const [a, c] = NODE_POS[id]; return [lerp(a[0], c[0], t), lerp(a[1], c[1], t)]; };

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
    <clipPath id="abdomenClip"><path d="${ABDOMEN_CLIP}"/></clipPath>
    <radialGradient id="orgForm" cx=".3" cy=".2" r=".95"><stop offset="0" class="lit-hi"/><stop offset=".48" class="lit-mid"/><stop offset="1" class="lit-lo"/></radialGradient>
    <radialGradient id="cavityShade" cx=".5" cy=".46" r=".5"><stop offset="0" class="cav-hi"/><stop offset=".72" class="cav-mid"/><stop offset="1" class="cav-lo"/></radialGradient>
    <filter id="castShadow" x="-10%" y="-10%" width="130%" height="130%"><feGaussianBlur stdDeviation="7"/></filter>
    <pattern id="texLiver" width="22" height="19" patternUnits="userSpaceOnUse"><path class="tex" d="M5.5 0l5.5 3.2v6.3l-5.5 3.2L0 9.5V3.2zM16.5 9.5l5.5 3.2V19M11 9.5l5.5-3.2"/></pattern>
    <pattern id="texFine" width="9" height="9" patternUnits="userSpaceOnUse"><circle class="tex-dot" cx="2" cy="2" r=".8"/><circle class="tex-dot" cx="6.5" cy="6.5" r=".6"/></pattern>
    <pattern id="texRugae" width="40" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)"><path class="tex" d="M0 6c7-4 13 4 20 0s13-4 20 0"/></pattern>
    <pattern id="texLobules" width="14" height="12" patternUnits="userSpaceOnUse"><path class="tex" d="M1 6a6 5 0 0 1 12 0M-6 12a6 5 0 0 1 12 0M8 12a6 5 0 0 1 12 0"/></pattern>
    <pattern id="texMuscle" width="30" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(24)"><path class="tex" d="M0 5c8-3 22 3 30 0"/></pattern>
    <marker id="heartArrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9 Z" fill="#8a3a44" fill-opacity=".7"/></marker>
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
  const gBackS = s('g'), gBackC = s('g'), gBackL = s('g');
  const gOver = s('g', { id: 'overlays' });
  const gNodes = s('g', { id: 'nodes', class: 'circuit-only' });
  const gFocus = s('g', { id: 'focus' });
  const gGuides = s('g', { id: 'guides' });
  world.append(gBackdrop, gGrid, gBack, gOrgans, gGhost, gAscites, gFocus, gHeat, gArt, gShadowL, gCaseL, gEdges, gOver, gNodes, gGuides);
  gBack.append(gBackS, gBackC, gBackL);

  // Circuit view: quiet bands for each pressure zone (captioned by the label layer).
  gGrid.append(s('rect', { x: 30, y: 30, width: 1340, height: 700, fill: 'url(#mapGrid)', class: 'map-grid' }));
  CIRCUIT_ZONES.forEach(([, x0, x1], i) => {
    gGrid.append(s('rect', { x: x0, y: 40, width: x1 - x0, height: 690, class: 'zone' + (i % 2 ? ' alt' : '') }));
  });
  const liverModule = s('rect', { class: 'liver-module', x: LIVER_MODULE.x0, y: LIVER_MODULE.y0, width: LIVER_MODULE.x1 - LIVER_MODULE.x0, height: LIVER_MODULE.y1 - LIVER_MODULE.y0, rx: 16 });
  gGrid.append(liverModule);

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
    } else if (o.deco) { el = s('path', { d: o.d, class: o.cls }); if (o.id === 'heart-out') el.setAttribute('marker-end', 'url(#heartArrow)'); g.append(el); }
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
  // Abdominal wall (anterior): appears only with caput medusae, under the radiating veins.
  const abdWall = s('ellipse', { cx: SITES.umbilicus[0], cy: SITES.umbilicus[1], rx: 120, ry: 96, fill: 'url(#skin)', class: 'abd-wall', opacity: 0 });
  // Flanks: the outline of the abdominal wall, which bulges as ascites accumulates.
  const flank = s('path', { class: 'flank', d: '' });
  gOver.before(abdWall);
  const ascitesPath = s('path', { class: 'ascites-fill', d: '', fill: 'url(#fluid)' });
  const ascitesLine = s('path', { class: 'ascites-line', d: '' });
  const ascitesGlint = s('path', { class: 'ascites-glint', d: '' });
  gAscites.append(ascitesPath, ascitesLine, ascitesGlint);
  gBackdrop.append(flank);

  // Edge groups
  const E = {};
  for (const e of ALL_EDGES) {
    const vcls = 'vg' + (CONTEXT_EDGES.has(e.id) ? ' ctx' : '') + (e.kind === 'collateral' ? ' coll' : '');
    const g = s('g', { class: vcls, 'data-id': e.id });
    const gc = s('g', { class: vcls }), gs = s('g', { class: vcls });
    const grad = s('linearGradient', { id: 'gr-' + e.id, gradientUnits: 'userSpaceOnUse' });
    const st0 = s('stop', { offset: '0' }), st1 = s('stop', { offset: '1' });
    grad.append(st0, st1); defs.append(grad);
    const isArt = e.kind === 'arteriole' || e.kind === 'artery' || (e.kind === 'shunt' && e.shunt === 'ap');
    const halo = s('path', { class: 'v-halo' });
    const sel = s('path', { class: 'v-select' });
    // Anatomy: a soft contact shadow under the tube (so a vessel in front visibly passes over
    // the one behind it), the casing, the pressure-colored lumen, then the tube's shading: a
    // darker band on the side turned away from the light and a narrow sheen on the lit side.
    // Circuit: the main route carries a quiet spine band underneath.
    const shadow = s('path', { class: 'v-shadow' });
    const spine = MAIN_ROUTE.has(e.id) ? s('path', { class: 'v-spine' }) : null;
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
    if (isArt) { g.append(halo, sel, wall, sheen, hit); gArt.append(g); }
    else {
      if (spine) gc.append(spine);
      gs.append(shadow);
      gc.append(halo, sel, wall, wallP);
      g.append(lumen, lumenP, shade, sheen, hit);
      if (strands) { gc.prepend(...strands.map((sd) => sd.wall)); g.prepend(...strands.map((sd) => sd.lumen)); }
      gShadowL.append(gs); gCaseL.append(gc); gEdges.append(g);
    }
    const heat = isArt ? null : s('path', { class: 'v-heat' });
    if (heat) gHeat.append(heat);
    E[e.id] = { e, g, gc, gs, groups: isArt ? [g] : [gs, gc, g], heat, grad, st0, st1, halo, sel, shadow, spine, wall, lumen, shade, sheen, wallP, lumenP, hit, strands, isArt, vis: true, width: 4, wallPx: 1, shadeKey: '' };
  }
  // Draw order within each tier: the portal tree in front (it lies anterior to the IVC).
  for (const x of Object.values(E)) if (!x.isArt && (x.e.kind === 'vein' && PORTAL_TERRITORY.has(x.e.to) && PORTAL_TERRITORY.has(x.e.from || '') || ['PV_TRUNK', 'PVH_R', 'PVH_L', 'SMV_CONF', 'SV_CONF'].includes(x.e.id))) { gShadowL.append(x.gs); gCaseL.append(x.gc); gEdges.append(x.g); x.front = true; x.g.dataset.front = '1'; }
  for (const id of BACK_EDGES) if (E[id]) {
    const x = E[id];
    if (x.isArt) gBackL.append(x.g); else { gBackS.append(x.gs); gBackC.append(x.gc); gBackL.append(x.g); }
    x.back = true;
    x.g.id = 'vg-' + id;
    // The ghost is also how the hidden stretch is picked: it carries the vessel's id.
    const u = s('use', { href: '#vg-' + id, class: 'ghost ghost-hit', 'data-id': id });
    gGhost.append(u);
  }

  const cls = (x, c, on) => { for (const g of x.groups) g.classList.toggle(c, on); };
  const setStyle = (x, k, v) => { if (x['_s' + k] === v) return; x['_s' + k] = v; for (const g of x.groups) g.style[k] = v; };
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
    clamps: s('g'), thrombi: s('g'), stents: s('g'), plugs: s('g'), varices: s('g'), gvarices: s('g'), caput: s('g'),
    balloons: s('g'), catheter: s('g'), bands: s('g'),
  };
  Object.values(ov).forEach((g) => gOver.append(g));

  // ── View transform (pan / zoom) ───────────────────
  let vt = { k: 1, x: 0, y: 0 };
  let morph = store.get().view === 'circuit' ? 1 : 0, morphTarget = morph, lastMorph = -1;
  let lz = null, crumbsEl = null;   // semantic zoom: lobule layer and the Abdomen › Liver › Lobule trail
  let geometryVersion = 0;
  // Everything drawn in screen space (labels, leaders, organ names, the flow marks, the action
  // card) follows the artwork on the very next frame of a pan or zoom, not on the next model
  // update: a view change schedules one coalesced sync per animation frame.
  let viewRaf = 0, viewVersion = 0, CTM = null, wrapRect = null;
  const applyVT = () => {
    world.setAttribute('transform', `translate(${vt.x} ${vt.y}) scale(${vt.k})`);
    syncSemantic();
    CTM = null; viewVersion++;
    if (!viewRaf) viewRaf = requestAnimationFrame(syncView);
  };
  function syncView() {
    viewRaf = 0;
    if (!F || lz?.isOpen()) return;
    refreshCTM();
    updateLabels(F);
    onViewChange?.();
  }
  applyVT();
  // The figure's screen transform, computed from the viewBox, the zoom state and the stage box.
  // Asking the browser (getScreenCTM / getBoundingClientRect) right after the SVG has been
  // updated forces a synchronous style + layout pass over thousands of elements, every frame;
  // the arithmetic is exact and free. The stage box is cached and kept current by observers.
  let box = null;
  const measureBox = () => { const r = wrap.getBoundingClientRect(), q = svg.getBoundingClientRect(); box = { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom, sx: q.left - r.left, sy: q.top - r.top, sw: q.width, sh: q.height }; };
  const stageBox = () => { if (!box) measureBox(); return box; };
  new ResizeObserver(() => { box = null; CTM = null; }).observe(wrap);
  addEventListener('resize', () => { box = null; CTM = null; });
  addEventListener('scroll', () => { box = null; CTM = null; }, true);
  function refreshCTM() {
    const b = stageBox(), vb = svg.viewBox.baseVal;
    const s = Math.min(b.sw / vb.width, b.sh / vb.height);
    const ox = b.left + b.sx + (b.sw - vb.width * s) / 2 - vb.x * s, oy = b.top + b.sy + (b.sh - vb.height * s) / 2 - vb.y * s;
    CTM = { a: s * vt.k, b: 0, c: 0, d: s * vt.k, e: ox + s * vt.x, f: oy + s * vt.y };
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
  function zoomAt(cx, cy, factor) {
    // Inside the lobule the plate is covered: zooming out steps back to the liver, zooming in
    // has nowhere further to go.
    if (lobuleOn) { if (factor < 1) zoomLiver(); return; }
    const [vx, vy] = clientToVB(cx, cy);
    const wx = (vx - vt.x) / vt.k, wy = (vy - vt.y) / vt.k;
    vt.k = clamp(vt.k * factor, 0.6, 6);
    vt.x = vx - wx * vt.k; vt.y = vy - wy * vt.k;
    applyVT(); CTM = null;
  }
  // Default framing. The circuit is a wide map (≈ 1.9 : 1); in a squarish or tall viewport,
  // fitting its width would shrink every station to a dot, so it opens zoomed to fill the height,
  // centered on the portal vein and liver, and the learner pans sideways to the beds or heart.
  function defaultVT(circuit) {
    if (!circuit) return { k: 1, x: 0, y: 0 };
    const W = wrap.clientWidth, H = wrap.clientHeight;
    const s0 = Math.min(W / VB_CIRC[2], H / VB_CIRC[3]);
    if (VB_CIRC[3] * s0 > 0.62 * H) return { k: 1, x: 0, y: 0 };
    const k = clamp((0.94 * H) / (VB_CIRC[3] * s0), 1, 3);
    const cx = VB_CIRC[0] + VB_CIRC[2] / 2, cy = VB_CIRC[1] + VB_CIRC[3] / 2;
    const fx = 640, fy = cy;
    return { k, x: cx - k * fx, y: cy - k * fy };
  }
  const fit = () => { setLobule(false); vt = defaultVT(morphTarget === 1); applyVT(); CTM = null; };

  // ── Semantic zoom: abdomen → liver → lobule ───────
  // Zooming (wheel, pinch, buttons) only moves the camera: past ×1.9 over the liver its inner
  // trees open (see liverExpanded) and a trail in the corner names the level. The lobule is
  // never entered by zooming alone; it opens only when asked for (the trail's Lobule step, the
  // liver's card, the palette, a presenter step) and cross-fades over the plate.
  let liverBB = null;
  let lobuleOn = false, lobU = 0, lobAnim = 0, lobTimer = 0;
  function setLobule(on) {
    if (on && morphTarget !== 0) return;
    if (lobuleOn === on && (lobU === (on ? 1 : 0))) return;
    lobuleOn = on;
    cancelAnimationFrame(lobAnim);
    const from = lobU, to = on ? 1 : 0, t0 = performance.now(), ms = reduceMotion.matches ? 0 : 420;
    const step = (now) => {
      const u = ms ? clamp((now - t0) / ms, 0, 1) : 1;
      lobU = from + (to - from) * easeInOut(u);
      syncSemantic();
      if (u < 1) lobAnim = requestAnimationFrame(step);
    };
    step(performance.now());
  }
  function liverBox() {
    if (!liverBB && organEls.liver) { try { const b = organEls.liver.getBBox(); if (b.width) liverBB = { x: b.x, y: b.y, w: b.width, h: b.height }; } catch { /* not rendered yet */ } }
    return liverBB;
  }
  function vbCenter() { const b = svg.viewBox.baseVal; return [b.x + b.width / 2, b.y + b.height / 2]; }
  function semanticLevel() {
    const lb = liverBox();
    if (morphTarget !== 0 || !lb) return { lvl: 0, u: 0 };
    if (lobuleOn) return { lvl: 2, u: lobU };
    const [cx, cy] = vbCenter(), wx = (cx - vt.x) / vt.k, wy = (cy - vt.y) / vt.k;
    const inside = wx > lb.x && wx < lb.x + lb.w && wy > lb.y && wy < lb.y + lb.h;
    return { lvl: inside && vt.k >= 1.9 ? 1 : 0, u: lobU };
  }
  function syncSemantic() {
    if (!lz) return;
    if (lobuleOn && morphTarget !== 0) { lobuleOn = false; lobU = 0; cancelAnimationFrame(lobAnim); }
    const { lvl, u } = semanticLevel();
    const wasOpen = lz.isOpen();
    lz.setFade(u);
    if (wasOpen && !lz.isOpen() && F && !inUpdate) update(F);
    wrap.classList.toggle('in-lobule', u > 0.98);
    if (crumbsEl && crumbsEl._lvl !== lvl) {
      crumbsEl._lvl = lvl;
      crumbsEl.hidden = lvl === 0;
      crumbsEl.querySelectorAll('button').forEach((b, i) => { b.classList.toggle('cur', i === lvl); b.setAttribute('aria-current', i === lvl ? 'true' : 'false'); });
    }
  }
  let vtAnim = 0;
  function animateVT(to, ms = 700) {
    cancelAnimationFrame(vtAnim);
    const from = { ...vt }, t0 = performance.now();
    if (reduceMotion.matches) { vt = to; applyVT(); CTM = null; return; }
    const step = (now) => {
      const u = easeInOut(clamp((now - t0) / ms, 0, 1));
      // Interpolate the zoom geometrically so the approach feels even at every scale.
      const k = from.k * Math.pow(to.k / from.k, u);
      const a = (k - from.k) / ((to.k - from.k) || 1);
      vt = { k, x: from.x + (to.x - from.x) * (to.k === from.k ? u : a), y: from.y + (to.y - from.y) * (to.k === from.k ? u : a) };
      applyVT(); CTM = null;
      if (u < 1) vtAnim = requestAnimationFrame(step);
    };
    vtAnim = requestAnimationFrame(step);
  }
  function zoomToBox(x0, y0, x1, y1) {
    const k = clamp(Math.min(VIEW.w / (x1 - x0), VIEW.h / (y1 - y0)) * 0.9, 1, 5);
    animateVT({ k, x: VIEW.w / 2 - ((x0 + x1) / 2) * k, y: VIEW.h / 2 - ((y0 + y1) / 2) * k }, 400);
  }
  function vtFor(wx, wy, k) { const [cx, cy] = vbCenter(); return { k, x: cx - wx * k, y: cy - wy * k }; }
  function zoomLiver() {
    setLobule(false);
    const lb = liverBox(); if (!lb) return;
    const b = svg.viewBox.baseVal;
    animateVT(vtFor(lb.x + lb.w / 2, lb.y + lb.h / 2, clamp(Math.min(b.width / lb.w, b.height / lb.h) * 0.92, 2, 3)));
  }
  function zoomLobule(lobe = 'R') {
    if (morphTarget !== 0) { store.set({ view: 'anatomic' }); setTimeout(() => zoomLobule(lobe), 650); return; }
    const lb = liverBox(); if (!lb) return;
    lz.setLobe(lobe);
    if (lobuleOn) return;
    const ms = reduceMotion.matches ? 0 : 900;
    animateVT(vtFor(lb.x + lb.w * (lobe === 'L' ? 0.74 : 0.34), lb.y + lb.h * (lobe === 'L' ? 0.36 : 0.5), 4.8), ms);
    // The lobule fades in over the last part of the approach.
    clearTimeout(lobTimer);
    lobTimer = setTimeout(() => setLobule(true), Math.max(0, ms - 380));
  }
  lz = createLobuleZoom({ host: wrap, onWheel: (ev) => zoomAt(ev.clientX, ev.clientY, Math.exp(-ev.deltaY * 0.0015)), onBack: zoomLiver });
  crumbsEl = h('nav', { class: 'zoom-crumbs', 'aria-label': 'Zoom level', hidden: true },
    [['Abdomen', () => { setLobule(false); animateVT(defaultVT(false)); }], ['Liver', zoomLiver], ['Lobule', () => zoomLobule()]].map(([t, fn], i) => h('button', { onclick: fn, 'data-i': i }, t)));
  wrap.append(crumbsEl);

  // ── Particles ─────────────────────────────────────
  // Adaptive detail: when the device cannot keep up (frames arriving slower than ~22 a second
  // while the model runs), the flow layer steps down (fewer redraws, fewer pixels, no trails) and
  // steps back up once there is headroom. The level a device settles on is remembered.
  const QUALITY = [{ fps: 30, res: 1, trails: true }, { fps: 24, res: 0.8, trails: true }, { fps: 15, res: 0.6, trails: false }];
  let quality = (() => { try { return clamp(parseInt(localStorage.getItem('pps.quality'), 10) || 0, 0, 2); } catch { return 0; } })();
  // The flow marks are drawn on the GPU (flow-gl.js) where WebGL2 is available, else with
  // Canvas2D. A canvas keeps the first kind of context it is asked for, so a failed WebGL start
  // gets a fresh canvas for the fallback.
  let flowGL = window.PPS_FLOW_2D ? null : createFlowGL(canvas, { force: !!window.PPS_FLOW_GL });
  if (!flowGL && !canvas.getContext('2d')) { const fresh = canvas.cloneNode(); canvas.replaceWith(fresh); canvas = fresh; }
  const ctx = flowGL ? null : canvas.getContext('2d');
  canvas.addEventListener('webglcontextrestored', () => { flowGL = createFlowGL(canvas, { force: true }); organBitmap = false; maskSig = ''; });
  wrap.dataset.flow = flowGL ? 'webgl2' : 'canvas2d';
  wrap.dataset.quality = String(quality);
  let dpr = 1;
  function resizeCanvas() {
    const r = wrap.getBoundingClientRect();
    // Canvas2D: the flow marks are small, soft-edged arrows; at 1.5× they stay crisp on a Retina
    // screen for a little over half the pixels of 2×. On the GPU every pixel is cheap: up to 2×.
    dpr = Math.min(window.PPS_FLOW_DPR || (flowGL ? 2 : 1.5), devicePixelRatio || 1) * QUALITY[quality].res;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    wrap.classList.toggle('compact', r.height < 600);
    CTM = null;
  }
  new ResizeObserver(resizeCanvas).observe(wrap);
  resizeCanvas();

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
    return recruitFrac(id, f) > 0.12 || Math.abs(f.Qf ? f.Qf[k] : f.Q[k]) > 0.3;
  }
  function recruitFrac(id, f) {
    const e = EDGES[EI[id]];
    const dMin = dMinOf(e);
    return clamp(((f.slow.dEff?.[id] ?? f.slow.d[id]) - dMin) / (e.dMax - dMin), 0, 1);
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
      if (x.e.kind === 'collateral' && t < 1) pts = wiggle(pts, g.wig * (1 - t), x.e.id.length);
      // Strands fan out from the shared ends and fold back onto the lane in the circuit.
      if (x.strands) for (const sd of x.strands) {
        const sp = wiggle(braid(base, sd.off * (1 - t)), (0.8 * g.wig + 3) * (1 - t), sd.ph);
        const d = polyD(sp);
        sd.wall.setAttribute('d', d); sd.lumen.setAttribute('d', d);
        sd.cur = sp; sd.len = arcLen(sp);
      }
      g.cur = pts;
      g.len = arcLen(pts);
      const d = t === 1 ? g.dC : polyD(pts);
      x.halo.setAttribute('d', d); x.sel.setAttribute('d', d); x.wall.setAttribute('d', d); x.hit.setAttribute('d', d);
      x.shadow.setAttribute('d', d);
      if (x.spine) x.spine.setAttribute('d', d);
      if (x.heat) x.heat.setAttribute('d', d);
      if (x.lumen) x.lumen.setAttribute('d', d);
      g.lit = litNormals(pts);
      x.shadeKey = '';
      const a = pts[0], b = pts[pts.length - 1];
      x.grad.setAttribute('x1', a[0]); x.grad.setAttribute('y1', a[1]);
      x.grad.setAttribute('x2', b[0] === a[0] && b[1] === a[1] ? a[0] + 1 : b[0]); x.grad.setAttribute('y2', b[1]);
    }
    for (const n of NODES) {
      if (!nodeEls[n.id]) continue;
      const [x, y] = nodePos(n.id, t);
      nodeEls[n.id].c.setAttribute('cx', x); nodeEls[n.id].c.setAttribute('cy', y);
    }
    const vb = VB_ANAT.map((a, i) => lerp(a, VB_CIRC[i], t));
    svg.setAttribute('viewBox', vb.map((v) => v.toFixed(1)).join(' '));
    gOrgans.style.opacity = String(1 - t);
    gBackdrop.style.opacity = String(1 - t);
    gGhost.style.opacity = String(1 - t);
    gAscites.style.opacity = String(1 - t);
    svg.classList.toggle('circuit', t > 0.5);
    // The circuit is a dark hemodynamic map; the anatomy an atlas plate on paper.
    stageWrap.classList.toggle('cmap', t > 0.5);
    gGrid.style.opacity = String(t);
    gNodes.style.opacity = String(t);
    CTM = null;
  }
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  // ── Update from frame ─────────────────────────────
  let inUpdate = false;
  function update(f) {
    inUpdate = true;
    try { updateInner(f); } finally { inUpdate = false; }
  }
  function updateInner(f) {
    blockerBoxes = readBlockers();
    F = f;
    lz?.update(f);
    if (lz?.isOpen()) return;   // the plate is hidden under the lobule; it catches up on the way out
    const st = store.get();
    const p = f.viewParams || st.params;
    const t = easeInOut(morph);
    const gain = lerp(1, 0.8, t);
    const ref = REF();
    const imaging = isImaging();
    const mode = layerMode();
    wrap.classList.toggle('imaging', imaging);
    // Data layers other than pressure quiet the anatomy so the network carries the reading.
    wrap.classList.toggle('data-layer', !['pressure', 'neutral'].includes(mode));
    wrap.dataset.layer = mode;

    // collateral tortuosity
    let geomDirty = false;
    for (const x of Object.values(E)) {
      if (x.e.kind !== 'collateral') continue;
      const w = recruitFrac(x.e.id, f) > 0.25 ? 1.5 + 3.5 * recruitFrac(x.e.id, f) : 0;
      if (Math.abs(w - geo[x.e.id].wig) > 0.6) { geo[x.e.id].wig = w; geomDirty = true; }
    }
    updateGeometry(geomDirty);

    for (const x of Object.values(E)) {
      const e = x.e;
      const vis = edgeVisible(x, f);
      if (vis !== x.vis) { setStyle(x, 'display', vis ? '' : 'none'); if (x.heat) x.heat.style.display = vis ? '' : 'none'; x.vis = vis; }
      if (!vis) continue;
      const k = EI[e.id];
      const D = f.D[k];
      const PM = f.Pf || f.P;
      const P1 = PM[NI[e.from]], P2 = PM[NI[e.to]];
      // Anatomy: width follows diameter (compressed). Circuit: a narrower, more uniform range,
      // as on a transit map, so the lines stay even and legible.
      const wA = e.kind === 'liver' ? (e.zone === 'sin' || e.zone === 'inter' ? 3.2 : 4.4) : vesselPx(D) * (e.id === 'IVC_IS' || e.id === 'IVCS_RA' || e.id === 'SVC_RA' ? 0.72 : 1);
      const wC = e.kind === 'liver' ? 5.5 : clamp(vesselPx(D) * 0.62, 4, 10);
      let w = lerp(wA, wC, t);
      // Flow layer: width follows flow volume (∝ √Q), like traffic volume on a city map.
      if (mode === 'flow' && !x.isArt) w = clamp(2.2 + 8.5 * Math.sqrt(Math.abs(f.Qf ? f.Qf[k] : f.Q[k]) * 0.06), 2.2, 22);
      if (x.isArt) w = lerp(Math.max(1.8, vesselPx(D) * 0.5), 3, t);
      w = qW(w);
      // Settled (not morphing, same lens): ignore sub-half-pixel wobble from the pulse and breath.
      const settled = (t === 0 || t === 1) && x.wMode === mode;
      if (!settled || x.width == null || Math.abs(w - x.width) >= 0.5) x.width = w;
      w = x.width;
      x.wMode = mode;
      if (x.isArt) { setA(x.wall, 'stroke-width', w.toFixed(1)); continue; }
      x.pmid = (P1 + P2) / 2;
      const baseD = e.d || (e.dMax ? dMinOf(e) : 3);
      const wallT = e.kind === 'liver' ? 0.7 : clamp(0.9 * Math.sqrt(baseD / Math.max(0.3, D)), 0.8, 1.6);
      if (x.wallPx == null || Math.abs(wallT - x.wallPx) >= 0.1) x.wallPx = Math.round(wallT * 20) / 20;
      const wallPx = x.wallPx;
      setA(x.wall, 'stroke-width', (w + 2 * wallPx).toFixed(1));
      setA(x.lumen, 'stroke-width', w.toFixed(1));
      if (x.strands) for (const sd of x.strands) { setA(sd.lumen, 'stroke-width', Math.max(1.6, w * sd.k).toFixed(1)); setA(sd.wall, 'stroke-width', (Math.max(1.6, w * sd.k) + 2 * wallPx).toFixed(1)); }
      if (x.spine) setA(x.spine, 'stroke-width', (w + 16).toFixed(1));
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
      // Flow marks are white on dark lumens and ink on pale ones.
      x.inkDark = mode === 'pressure' ? luminance(pressureColor((P1 + P2) / 2)) > 0.36 : luminance(c1) > 0.36;
      if (x.heat && mode === 'heat') { setA(x.heat, 'stroke', c1); setA(x.heat, 'stroke-width', (w + 22).toFixed(1)); const ho = mode === 'heat' && ref ? clamp((x.pmid - (ref[NI[e.from]] + ref[NI[e.to]]) / 2) / 8, 0, 1).toFixed(2) : '0'; if (x.heat._op !== ho) { x.heat._op = ho; x.heat.style.opacity = ho; } }
      if (e.kind === 'collateral') {
        const fr = recruitFrac(e.id, f);
        const qa = Math.abs(f.Qf ? f.Qf[k] : f.Q[k]);
        cls(x, 'coll-ghost', !collOpen(e.id, f));
        setStyle(x, 'opacity', p.occluded[e.id] ? '0.45' : (0.3 + 0.7 * Math.min(1, Math.max(fr * 2.5, qa / 1.5))).toFixed(2));
      }
      x.rev = REVERSAL_WATCH.has(e.id) && isReversed(e, f);
      const selOn = st.selection?.type === 'edge' && st.selection.id === e.id;
      x.sel.classList.toggle('on', selOn);
      cls(x, 'is-sel', selOn);
      if (selOn) setA(x.sel, 'stroke-width', (w + 12).toFixed(1));
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
    // A selected vessel stays bright while the rest of the network recedes.
    wrap.classList.toggle('has-sel', st.selection?.type === 'edge' && !!E[st.selection.id]?.vis);
    updateOrganSel(st.selection, t);
    liverModule.classList.toggle('open', liverExpanded());
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
    const endW = (n) => (J[n] && !stroked ? clamp(J[n], w * 0.7, w * lim) : w);
    const a = endW(x.e.from), b = endW(x.e.to);
    const key = `${w.toFixed(1)},${a.toFixed(1)},${b.toFixed(1)}|${wallPx.toFixed(2)}|${sten ? v.toFixed(3) + '@' + (stenosisAt[id] ?? 0.5) : ''}|${lastMorph}|${stroked}`;
    if (key === x.shadeKey) return;
    x.shadeKey = key;
    const f = sten ? waist(id, v, g.len, w) : null;
    x.rOf = (u) => {
      const r = u < 0.3 ? lerp(a, w, smooth(u / 0.3)) : u > 0.7 ? lerp(w, b, smooth((u - 0.7) / 0.3)) : w;
      return Math.max(0.35, (r / 2) * (f ? f(u) : 1));
    };
    const pts = g.cur, lit = g.lit;
    if (!stroked) {
      const casing = tubeOutline(pts, lit, (u) => x.rOf(u) + wallPx);
      x.wallP.setAttribute('d', casing);
      x.shadow.setAttribute('d', casing);
      x.lumenP.setAttribute('d', tubeOutline(pts, lit, x.rOf));
    }
    if (w < 3.4 || t >= 0.999 || sten) { x.sheen.removeAttribute('d'); x.shade.removeAttribute('d'); return; }
    const wm = Math.min(w, a, b);
    x.sheen.setAttribute('d', polyD(litOffset(pts, lit, wm * 0.2, 0.04, 0.96)));
    x.sheen.setAttribute('stroke-width', (wm * 0.24).toFixed(2));
    x.shade.setAttribute('d', polyD(litOffset(pts, lit, -wm * 0.24, 0.02, 0.98)));
    x.shade.setAttribute('stroke-width', (wm * 0.38).toFixed(2));
  }

  // Circuit liver module: collapsed unless asked for, selected into, or zoomed in on.
  let liverOpen = false;
  function liverExpanded() {
    const sel = store.get().selection;
    return liverOpen || vt.k >= 1.9 || (sel?.type === 'edge' && LIVER_EDGES.has(sel.id)) || (sel?.type === 'node' && LIVER_INNER.has(sel.id));
  }

  // ── Model-driven transitions ──────────────────────
  // Nothing flashes or sweeps across the anatomy. Pressure change shows as the vessel's own color
  // easing; reversed flow is a steady state (its chevrons turn orange and run the other way);
  // the one animation is a collateral or shunt that opens, drawn on in the direction of its
  // flow. Nothing runs under reduced motion or in the figure view.
  const track = {};
  const appEl = document.getElementById('app');
  const quietFx = () => reduceMotion.matches || !!appEl?.classList.contains('figure-mode') || isImaging();
  function trackChanges(f) {
    const now = performance.now();
    const quiet = quietFx();
    for (const x of Object.values(E)) {
      const e = x.e;
      const q = f.Qf ? f.Qf[EI[e.id]] : f.Q[EI[e.id]];
      const open = x.vis && !x.g.classList.contains('coll-ghost');
      const was = track[e.id];
      track[e.id] = open;
      if (was === false && open && (e.kind === 'collateral' || e.kind === 'shunt') && !quiet) x.reveal = { t0: now, dur: e.kind === 'shunt' ? 900 : 1500, dir: q >= 0 ? 1 : -1 };
    }
  }
  const REVEAL_PARTS = ['shadow', 'wall', 'lumen', 'shade', 'sheen'];
  function stepReveals(now) {
    let finished = false;
    for (const x of Object.values(E)) {
      if (!x.reveal) continue;
      const r = x.reveal;
      const u = clamp((now - r.t0) / r.dur, 0, 1);
      const done = u >= 1 || quietFx();
      const off = (1 - easeInOut(u)) * r.dir;
      for (const el of REVEAL_PARTS.map((part) => x[part]).concat(x.strands ? x.strands.flatMap((sd) => [sd.wall, sd.lumen]) : [])) {
        if (!el) continue;
        if (done) { el.removeAttribute('pathLength'); el.style.strokeDasharray = ''; el.style.strokeDashoffset = ''; continue; }
        el.setAttribute('pathLength', '1');
        el.style.strokeDasharray = '1 1';
        el.style.strokeDashoffset = off.toFixed(4);
      }
      if (done) { x.reveal = null; finished = true; }
    }
    // Rebuild at once so the vessel turns from the drawn-on stroke into its shaded tube on the
    // same frame, rather than holding the stroke until the next model update.
    if (finished && F && !inUpdate) update(F);
  }
  // Δ halos: after a change, the three places whose pressure moved most get a brief ring and
  // their change in mmHg, once the model has had a moment to respond. Answers "what did that do?"
  // without a sweep across the whole figure.
  const gHalo = s('g', { id: 'halos', 'aria-hidden': 'true' });
  gOver.after(gHalo);
  let haloBase = null, haloTimer = 0;
  store.on('params', () => {
    if (!F || quietFx()) return;
    if (!haloBase) haloBase = { P: Float64Array.from(F.P), t: performance.now() };
    clearTimeout(haloBase.timer);
    haloBase.timer = setTimeout(() => { if (F && haloBase) { haloBase.t = 0; stepHalos(F, easeInOut(morph)); } }, 1200);
  });
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
    gHalo.replaceChildren(...cand.slice(0, 3).map(([id, d]) => {
      const [x, y] = nodePos(id, t);
      return s('g', { class: 'halo ' + (d > 0 ? 'up' : 'down'), transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` },
        s('circle', { r: 16 }), s('text', { y: -24, 'text-anchor': 'middle' }, `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(Math.abs(d) < 10 ? 1 : 0)}`));
    }));
    haloTimer = setTimeout(() => gHalo.replaceChildren(), 1500);
  }

  // A selected organ keeps a quiet outline; a selected site (varices, fundus, abdomen) a ring.
  const gSelO = s('g', { id: 'organSel' });
  gOver.after(gSelO);
  let selOKey = '';
  function updateOrganSel(sel, t) {
    const o = sel?.type === 'organ' && t < 0.5 ? sel.id : null;
    const key = o ? o + (sel.lobe || '') : '';
    if (key === selOKey) return;
    selOKey = key;
    for (const g of Object.values(organG)) g.classList.remove('org-sel');
    gSelO.replaceChildren();
    if (!o) return;
    const byOrgan = { liver: ['liver'], heart: ['heart'], spleen: ['spleen'] }[o];
    if (byOrgan) { for (const id of byOrgan) organG[id]?.classList.add('org-sel'); const d = ORGANS.find((x) => x.id === byOrgan[0])?.d; if (d) gSelO.append(s('path', { d, class: 'org-sel-line' })); return; }
    const at = { varices: [SITES.varix[0], SITES.varix[1] + 20, 26, 62], gastric: [SITES.fundus[0], SITES.fundus[1], 34, 30], abdomen: [720, 790, 230, 110] }[o];
    if (at) gSelO.append(s('ellipse', { cx: at[0], cy: at[1], rx: at[2], ry: at[3], class: 'org-sel-ring' }));
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
    const vis = t === 1 ? Object.values(E).filter((x) => x.vis && !x.isArt && !x.g.classList.contains('coll-ghost') && x.g.style.display !== 'none') : [];
    const key = vis.map((x) => x.e.id + ':' + x.width.toFixed(0)).join(',');
    if (key === bridgeKey) return;
    bridgeKey = key;
    gBridges.replaceChildren();
    if (!vis.length) return;
    const order = new Map([...gEdges.children].map((g, i) => [g, i]));
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
    // Ascites collects in the flanks and the pelvis first (supine patient, frontal view), so its
    // surface is a meniscus: highest at the sides, lowest in the middle. The abdominal wall bulges
    // and the bowel floats up on it. A slow ripple runs along the surface.
    const V = f.slow.ascites;
    const u = clamp(V / 11000, 0, 1);
    const bulge = u * 34;
    flank.setAttribute('d', u < 0.04 ? '' : `M336 470 C ${324 - bulge} 610 ${330 - bulge} 780 ${372 - bulge * 0.4} 904 M1088 470 C ${1100 + bulge} 610 ${1094 + bulge} 780 ${1052 + bulge * 0.4} 904`);
    organG.bowel.setAttribute('transform', `translate(0 ${(-u * 26).toFixed(1)})`);
    const hgt = u * 330;
    if (hgt < 3) { ascitesPath.setAttribute('d', ''); ascitesLine.setAttribute('d', ''); ascitesGlint.setAttribute('d', ''); }
    else {
      const floor = ABDOMEN_FLOOR + 5, ph = reduceMotion.matches ? 0 : (performance.now() / 1100) % (Math.PI * 2);
      const surf = (x) => { const c = (x - 712) / 400; return floor - hgt * (0.55 + 0.45 * c * c) + Math.sin(x / 38 + ph) * 1.6 * Math.min(1, u * 4); };
      let line = '';
      for (let x = 296; x <= 1128; x += 16) line += `${x === 296 ? 'M' : ' L'}${x} ${surf(x).toFixed(1)}`;
      ascitesLine.setAttribute('d', line);
      ascitesPath.setAttribute('d', `${line} L 1128 ${floor} L 296 ${floor} Z`);
      let glint = '';
      for (let x = 470; x <= 950; x += 16) glint += `${x === 470 ? 'M' : ' L'}${x} ${(surf(x) + 5).toFixed(1)}`;
      ascitesGlint.setAttribute('d', glint);
    }
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

  // Overlays (stenosis, thrombus, stents, varices, balloons, catheter…)
  // The overlays (clamps, clots, stents, varices, caput medusae, balloons, catheter) are rebuilt
  // only when something they draw has visibly changed: the key holds every input, rounded.
  let overlayKey = '';
  // A quantized value that only moves once the input has clearly left its step (so a varix whose
  // diameter pulses across a rounding boundary is not rebuilt on every beat).
  const held = {};
  const hold = (k, v, step) => { const h0 = held[k]; if (h0 == null || Math.abs(v - h0) > step * 0.75) held[k] = Math.round(v / step) * step; return held[k]; };
  function overlayInputs(f, p, t) {
    const m = f.metrics, q1 = (v) => Math.round(v * 10) / 10;
    const lesions = [...Object.keys(p.stenosis), ...Object.keys(p.thrombus), ...Object.keys(p.occluded), 'TIPS', 'S_PC', 'S_DSR', 'S_MC', ...Object.keys(p.customShunts || {}), 'C3'];
    return JSON.stringify([t.toFixed(3), isImaging(), p.stenosis, p.thrombus, p.occluded, p.tips, p.customShunts, p.balloonEso, p.balloonGas, p.catheter,
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
    setVar(ov.caput, '--vx', pressureColor(qP(PM[NI.EPI])));
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
    for (const id of ['TIPS', 'S_PC', 'S_DSR', 'S_MC', ...Object.keys(p.customShunts || {})]) {
      if (!E[id].vis || E[id].reveal) continue;
      if (id === 'TIPS' || id.startsWith('X_')) stentMesh(id); else anastomoses(id);
    }
    for (const id of Object.keys(p.occluded)) {
      if (!p.occluded[id] || !E[id] || !E[id].vis) continue;
      const [x, y] = pointAt(geo[id].cur, 0.5);
      ov.plugs.append(s('circle', { cx: x, cy: y, r: 7, fill: 'var(--surface)', stroke: 'var(--danger)', 'stroke-width': 2 }),
        s('path', { d: `M${x - 4} ${y - 4} L ${x + 4} ${y + 4} M${x + 4} ${y - 4} L ${x - 4} ${y + 4}`, stroke: 'var(--danger)', 'stroke-width': 2 }));
    }

    // The varices themselves are shown by the plexus of channels feeding and draining them (see
    // STRANDS in anatomy.js), which swell as they are recruited; here only the bands, fitted at
    // ligation, are drawn over the lower esophagus.
    ov.varices.innerHTML = ''; ov.gvarices.innerHTML = ''; ov.caput.innerHTML = ''; ov.bands.innerHTML = '';
    if (anat) {
      const eso = (y) => 789 + (y - 24) * 0.066;
      const nb = Math.round(f.bands || 0);
      for (let i = 0; i < nb; i++) { const y = 272 - i * 16; ov.bands.append(s('ellipse', { cx: eso(y), cy: y, rx: 11, ry: 3, class: 'band-ring' })); }
      // Caput medusae: tortuous, slightly raised veins radiating from the umbilicus over a
      // semi-transparent abdominal wall, only when the paraumbilical route carries real flow.
      const c3 = recruitFrac('C3', f);
      if (c3 > 0.15 && E.C3.vis) {
        const n = 11;
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2 + 0.25, L = 24 + 62 * c3 * (0.7 + 0.3 * Math.sin(i * 2.3));
          const pts = [];
          for (let j = 0; j <= 10; j++) {
            const rr = 7 + (L * j) / 10, wob = j === 0 ? 0 : Math.sin(j * 1.6 + i * 1.3) * (1.5 + 3.5 * c3) * Math.min(1, j / 3);
            const a = a0 + Math.sin(j * 0.5 + i) * 0.12;
            pts.push([SITES.umbilicus[0] + Math.cos(a) * rr - Math.sin(a) * wob, SITES.umbilicus[1] + Math.sin(a) * rr * 0.86 + Math.cos(a) * wob]);
          }
          const w = 1.6 + 2.6 * c3;
          ov.caput.append(s('path', { d: polyD(pts), class: 'caput-case', 'stroke-width': (w + 1.8).toFixed(2) }), s('path', { d: polyD(pts), class: 'caput-vein', style: 'stroke: var(--vx)', 'stroke-width': w.toFixed(2) }));
        }
      }
    }
    // Balloons
    ov.balloons.innerHTML = '';
    if (anat && p.balloonEso) ov.balloons.append(s('rect', { x: 792, y: 190, width: 20, height: 84, rx: 10, class: 'balloon-shape' }));
    if (anat && p.balloonGas) ov.balloons.append(s('circle', { cx: SITES.fundus[0], cy: SITES.fundus[1], r: 24, class: 'balloon-shape' }));
    // Catheter
    ov.catheter.innerHTML = '';
    if (p.catheter.vein) {
      const hv = { R: 'RHV', M: 'MHV', L: 'LHV' }[p.catheter.vein];
      const tip = nodePos('W_' + p.catheter.vein, t);
      const [hx, hy] = nodePos(hv, t);
      const [ix, iy] = nodePos('IVCS', t);
      const [rx, ry] = nodePos('RA', t);
      const [sx, sy] = nodePos('SVC', t);
      const d = `M${sx} ${sy - 90} L ${sx} ${sy} L ${rx} ${ry} L ${ix} ${iy} L ${hx} ${hy} L ${tip[0]} ${tip[1]}`;
      ov.catheter.append(s('path', { d, class: 'catheter' }));
      ov.catheter.append(s('circle', { cx: tip[0], cy: tip[1], r: p.catheter.wedged ? 7 : 3, class: 'balloon-shape' }));
    }
  }

  // ── Labels: a screen-space layer (SVG) laid out every frame ──
  // Text keeps a constant on-screen size whatever the zoom. Every label is a block with a
  // priority and a list of candidate positions; blocks are placed greedily, most important
  // first, and a block that cannot be placed without a collision is dropped. Anatomy on a wide
  // stage uses atlas columns in the margins with leader lines; everything else is placed
  // around its anchor. The same layer is serialized into exported figures.
  const labelSvg = wrap.querySelector('#labels');
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

  // A line is a list of runs { t, size, weight, cls, track }. Returns [width, height].
  const LINE_H = (line) => Math.max(...line.map((r) => r.size)) * 1.24;
  const lineW = (line) => line.reduce((w, r, i) => w + textW(r.t, r.size, r.weight, r.track || 0) + (i ? (r.gap ?? 3) : 0), 0);

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
    const sig = JSON.stringify([it.lines.map((line) => line.map(({ t, ...style }) => style)), it.align, !!it.swatch, it.bg, it.cls]);
    if (sig !== b.sig) {
      b.sig = sig;
      const kids = [];
      b.spans = [];
      b.textLines = [];
      if (it.bg) kids.push(s('rect', { class: 'lb-bg', x: -it.padX, y: -it.padY, width: it.w + 2 * it.padX, height: it.h + 2 * it.padY, rx: 6 }));
      let y = 0;
      const tx = it.swatch ? (it.align === 'end' ? it.w - 7 : 7) : 0;
      for (const line of it.lines) {
        const lh = LINE_H(line);
        const t = s('text', { x: it.align === 'end' ? it.w - (it.swatch ? 7 : 0) : it.align === 'middle' ? it.w / 2 : tx, y: y + lh * 0.78, 'text-anchor': it.align === 'end' ? 'end' : it.align === 'middle' ? 'middle' : 'start' });
        b.textLines.push(t);
        line.forEach((r, i) => {
          const sp = s('tspan', { class: r.cls || '', 'font-size': r.size, 'font-weight': r.weight || 500 });
          if (i) sp.setAttribute('dx', r.gap ?? 3);
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
    setA(b.g, 'transform', `translate(${it.x.toFixed(1)} ${it.y.toFixed(1)})`);
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
  function badge(key, v, on, off) {
    const shown = v >= on || (badges.get(key) && v >= off);
    badges.set(key, shown);
    return shown;
  }
  function pressureRuns(P, id, compact) {
    if (!store.get().layers.chips || isImaging()) return null;
    const [v, u] = fp(P);
    const runs = [{ t: v, size: compact ? 12.5 : 14, weight: 650, cls: 'lb-val' }, { t: u, size: compact ? 9.5 : 10, weight: 500, cls: 'lb-unit', gap: 2.5 }];
    const ref = REF()?.[NI[id]];
    if (ref != null && badge('p:' + id, Math.abs(P - ref), 1, 0.7)) runs.push({ t: `${P > ref ? '▲' : '▼'} ${fmt(Math.abs(P - ref), 0)}`, size: compact ? 9.5 : 10.5, weight: 650, cls: 'lb-delta ' + (P > ref ? 'up' : 'down'), gap: 6 });
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
      const runs = [{ ...big, t: fmt(v, v < 0.1 ? 3 : 2) }, { ...unit, t: 'L/min' }];
      const refQ = store.get().healthy?.Q;
      if (refQ && !store.get().compareSnap) {
        const r = throughput(refQ, id);
        if (r > 0.02 && badge('q:' + id, Math.abs(v - r) / r, 0.1, 0.07)) runs.push({ t: `${v > r ? '▲' : '▼'} ${Math.round(Math.abs(v - r) / r * 100)}%`, size: compact ? 9.5 : 10.5, weight: 650, cls: 'lb-delta ' + (v > r ? 'up' : 'down'), gap: 6 });
      }
      return { runs, color: flowColor(v) };
    }
    let best = 0, tubes = 0, bed = false;
    for (const x of Object.values(E)) {
      if (!x.vis || x.isArt || (x.e.from !== id && x.e.to !== id)) continue;
      if (x.e.kind === 'liver') { bed = true; continue; }
      if (x.g.classList.contains('coll-ghost')) continue;
      tubes++;
      const v = Math.abs(edgeVel(f, EI[x.e.id]));
      if (v > best) best = v;
    }
    // A microvascular bed has no single velocity; a station whose only vessels are closed
    // collaterals carries no flow at all (not stasis in an open vessel).
    if (!tubes) return { runs: [{ ...unit, t: bed ? 'microcirculation' : 'collaterals closed', gap: 0 }], color: 'rgb(150,152,162)' };
    const runs = [{ ...big, t: fmt(best, 0) }, { ...unit, t: 'cm/s' }];
    if (best < 5) runs.push({ t: 'stasis', size: compact ? 9.5 : 10.5, weight: 650, cls: 'lb-delta up', gap: 6 });
    return { runs, color: velocityColor(best) };
  }

  function nodeItem(id, f, mode, compact) {
    const st = store.get();
    const meta = ATLAS_LABELS[id];
    const P = (f.Pf || f.P)[NI[id]];
    const name = mode === 'atlas' ? (meta?.name || NODES[NI[id]].label) : (SHORT[id] || id);
    // On a small screen an inline label is one quiet line (name, value) on a text halo, not a
    // two-line card: it covers as little of the anatomy as it can.
    const one = mode === 'inline' && compact;
    const lines = [[{ t: name, size: compact ? 10.5 : 11.5, weight: one ? 600 : 500, cls: 'lb-name' }]];
    const lr = isImaging() ? null : layerRuns(f, id, compact);
    const pr = lr ? lr.runs : pressureRuns(P, id, compact);
    // (The unit is in the legend right above the figure.)
    if (pr && one) lines[0].push(...pr.filter((r) => r.cls !== 'lb-unit').map((r, i) => (i ? r : { ...r, gap: 4 })));
    else if (pr) lines.push(pr);
    const w = Math.max(...lines.map(lineW)) + (mode === 'atlas' ? 7 : 0);
    const hh = lines.reduce((a, l) => a + LINE_H(l), 0);
    const sel = st.selection?.type === 'node' && st.selection.id === id;
    return { key: 'n:' + id, node: id, cls: 'node ' + mode + (one ? ' bare' : ''), lines, w, h: hh, sel, label: `${NODES[NI[id]].label}${lr ? `: ${lr.runs.map((r) => r.t).join(' ')}` : pr ? `: ${fmt(P, 1)} millimeters of mercury` : ''}`,
      swatch: mode === 'atlas' && pr ? (lr ? lr.color : layerMode() === 'heat' ? heatColor(P - (REF()?.[NI[id]] ?? P)) : pressureColor(P)) : null, bg: mode === 'inline' && !one, padX: mode === 'inline' && !one ? 6 : 3, padY: mode === 'inline' && !one ? 3 : 2 };
  }

  const ANAT_PRI = { CONF: 10, VAR: 9, SIN_R: 9, RHV: 8, RA: 8, SV: 7, SMV: 7, GV: 7, IVCS: 6, W_R: 12, W_M: 12, W_L: 12 };

  let blockerBoxes = null;
  function readBlockers() {
    const wr = stageBox();
    return [...document.querySelectorAll('.stage-blocker:not([hidden])')].map((el) => {
      const r = el.getBoundingClientRect();
      return r.width ? { x0: r.left - wr.left - 4, y0: r.top - wr.top - 4, x1: r.right - wr.left + 4, y1: r.bottom - wr.top + 4 } : null;
    }).filter(Boolean);
  }
  let labelGridKey = '', labelGrid = new Map();
  const labelMem = new Map();
  function updateLabels(f) {
    refreshCTM();
    frameNo++;
    const st = store.get();
    const t = easeInOut(morph);
    const circuit = t >= 0.5;
    const wr = stageBox();
    const W = wr.width, H = wr.height;
    const B = { x0: 6, y0: 6, x1: W - 6, y1: H - 6 };
    const compact = W < 700;
    // Floating panels over the figure (notifications, hint cards, banners) are obstacles. Their
    // boxes are read before this frame's SVG changes (see updateInner), while layout is clean.
    const blockers = blockerBoxes || readBlockers();
    const placed = [...blockers];
    // Stenosis clamps and their percentages are drawn on the figure; keep labels off them.
    if (!isImaging()) for (const [id, v] of Object.entries((f.viewParams || st.params).stenosis)) {
      if (!(v > 0) || !E[id]?.vis) continue;
      const [sx, sy] = worldToLocal(...pointAt(geo[id].cur, stenosisAt[id] ?? 0.5));
      placed.push({ x0: sx - 26, y0: sy - 22, x1: sx + 60, y1: sy + 22 });
    }
    const out = [];
    let leaders = '';
    // Vessel geometry as a coarse density grid, so labels prefer positions that cover no lines.
    const CELL = 10;
    let lines = labelGrid;
    const lineCost = (r) => {
      let c = 0;
      for (let gx = Math.floor(r.x0 / CELL); gx <= Math.floor(r.x1 / CELL); gx++) for (let gy = Math.floor(r.y0 / CELL); gy <= Math.floor(r.y1 / CELL); gy++) c += lines.get(gx * 4096 + gy) || 0;
      return c;
    };
    let useLines = false;
    const buildLines = () => {
      useLines = true;
      const key = `${geometryVersion}|${CTM.a}|${CTM.e - wr.left}|${CTM.f - wr.top}|${Object.values(E).filter((x) => x.vis).map((x) => x.e.id).join(',')}`;
      if (key === labelGridKey) return;
      labelGridKey = key;
      lines = labelGrid = new Map();
      for (const x of Object.values(E)) {
        if (!x.vis) continue;
        // Walk every segment in half-cell steps: straight circuit runs have few vertices, and
        // a label must see the whole line, not just its corners.
        const pts = geo[x.e.id].cur, seen = new Set();
        let prev = worldToLocal(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          const cur = worldToLocal(pts[i][0], pts[i][1]);
          const n = Math.max(1, Math.ceil(Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) / (CELL / 2)));
          for (let j = 0; j <= n; j++) {
            const sx = prev[0] + ((cur[0] - prev[0]) * j) / n, sy = prev[1] + ((cur[1] - prev[1]) * j) / n;
            const k = Math.floor(sx / CELL) * 4096 + Math.floor(sy / CELL);
            if (seen.has(k)) continue;
            seen.add(k);
            lines.set(k, (lines.get(k) || 0) + 1);
          }
          prev = cur;
        }
      }
    };
    // Among the candidate positions that collide with nothing already placed, take the one that
    // covers the least vessel geometry (ties go to the earlier, preferred direction).
    // `gap` may be a list: nearer rings are preferred, but a label moves further out rather than
    // sit on a vessel line.
    // Labels are steady: each keeps the slot it had while that slot stays free, and reserves a
    // width that only grows (a value ticking from 9.9 to 10.0, or a change gaining a digit, would
    // otherwise tip it to another side of its station and back, frame after frame).
    const place = (it, dirs, gap, leader) => {
      let best = null;
      const mem = labelMem.get(it.key);
      const wRes = mem && it.w <= mem.w && it.w > mem.w - 28 ? mem.w : it.w;
      const probe = { ...it, w: wRes };
      (Array.isArray(gap) ? gap : [gap]).forEach((gp, gi) => dirs.forEach((dir, i) => {
        const [dx, dy] = offset(dir, probe, gp);
        const x = it.ax + dx, y = it.ay + dy;
        const r = rectOf({ ...probe, x, y });
        if (!within(r, B) || placed.some((p) => hits(r, p))) return;
        const cost = (useLines ? lineCost(r) * 12 : 0) + i + gi * 6 - (mem && mem.dir === dir && mem.gi === gi ? 1e4 : 0);
        if (!best || cost < best.cost) best = { cost, x, y, r, dir, gi, far: gi > 0 };
      }));
      if (!best) return false;
      // The text hugs the station side of its reserved box.
      const slack = wRes - it.w, dir = best.dir;
      it.x = best.x + (dir.includes('W') ? slack : dir.includes('E') ? 0 : slack / 2);
      it.y = best.y; it.dir = dir; it.leader = leader || best.far;
      labelMem.set(it.key, { dir, gi: best.gi, w: wRes });
      placed.push(best.r); out.push(it);
      return true;
    };

    if (!circuit) {
      // ── Anatomy ──
      const show = new Set(CHIP_NODES);
      if (f.metrics.gastricVarix.d >= 2.4) show.add('GV');
      if (st.selection?.type === 'node') show.add(st.selection.id);
      const cath = (f.viewParams || st.params).catheter;
      if (cath.vein && cath.wedged) show.add('W_' + cath.vein);
      const [lx] = worldToLocal(ATLAS_COLUMNS[0], 500), [rx] = worldToLocal(ATLAS_COLUMNS[1], 500);
      const colW = 150;
      const atlas = lx - 8 > colW && W - rx - 8 > colW;
      const items = [];
      for (const id of show) {
        if (!NODE_POS[id]) continue;
        const [ax, ay] = worldToLocal(...nodePos(id, t));
        if (ax < -20 || ax > W + 20 || ay < -20 || ay > H + 20) continue;
        const it = nodeItem(id, f, atlas ? 'atlas' : 'inline', compact);
        it.ax = ax; it.ay = ay; it.pri = it.sel ? 100 : ANAT_PRI[id] || 5;
        it.side = ATLAS_LABELS[id]?.side || (NODE_POS[id][0][0] < 700 ? 'L' : 'R');
        items.push(it);
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
            const ly = it.y + Math.min(it.h / 2, 16);
            const x0 = side === 'L' ? lx - 4 : rx + 4;
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
          if (place(it, dirs, 12, true) || place(it, dirs, 30, true)) continue;
          if (it.sel) { place(it, ['C'], 0, false) || (out.push(Object.assign(it, { x: it.ax + 8, y: it.ay - it.h / 2 })), true); }
        }
        for (const it of out) {
          if (!it.leader) continue;
          const r = rectOf(it);
          const px = clamp(it.ax, r.x0, r.x1), py = clamp(it.ay, r.y0, r.y1);
          if (Math.hypot(px - it.ax, py - it.ay) > 5) leaders += `<path class="leader${it.sel ? ' hl' : ''}" d="M${it.ax.toFixed(1)} ${it.ay.toFixed(1)} L${px.toFixed(1)} ${py.toFixed(1)}"/>`;
          leaders += `<circle class="leader-dot" cx="${it.ax.toFixed(1)}" cy="${it.ay.toFixed(1)}" r="2.4"/>`;
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
      for (const [txt, x0, x1] of CIRCUIT_ZONES) {
        const [a] = worldToLocal(x0, 60), [b, by] = worldToLocal(x1, 60);
        const it = { key: 'z:' + txt, cls: 'zonecap', lines: [[{ t: txt.toUpperCase(), size: compact ? 8.5 : 9.5, weight: 650, cls: 'lb-zone', track: 0.1 }]], align: 'middle', padX: 2, padY: 2 };
        it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]);
        it.ax = (a + b) / 2; it.ay = Math.max(14, by);
        if (b - a > it.w + 6) place(it, ['C'], 0, false);
      }
      buildLines();
      // The liver module header: its sinusoidal pressure and the resistance of each compartment
      // (both lobes in parallel). Click to show or hide the stations inside.
      const open = liverExpanded();
      const showVals = !isImaging() && st.layers.chips;
      {
        const par = (a, b) => { const ra = liverR[a].R, rb = liverR[b].R; return Number.isFinite(ra) && Number.isFinite(rb) ? (ra * rb) / (ra + rb) : Number.isFinite(ra) ? ra : rb; };
        const R = [['pre', par('PRE_R', 'PRE_L')], ['sinusoidal', par('SIN_RR', 'SIN_LL')], ['post', par('POST_R_RHV', 'POST_L_LHV')]];
        const sz = compact ? 9.5 : 10.5;
        const lines = [[{ t: 'INSIDE THE LIVER', size: compact ? 9 : 9.5, weight: 700, cls: 'lb-zone', track: 0.1 }, { t: open ? '▾ hide stations' : '▸ show stations', size: compact ? 9 : 9.5, weight: 600, cls: 'lb-mod-act', gap: 8 }]];
        if (showVals) {
          const pr = pressureRuns((f.Pf || f.P)[NI.SIN_R], 'SIN_R', compact);
          if (pr) lines.push([{ t: 'Sinusoids', size: compact ? 10.5 : 11.5, weight: 500, cls: 'lb-name', gap: 0 }, ...pr.map((r, i) => (i ? r : { ...r, gap: 6 }))]);
          lines.push([{ t: 'Resistance', size: sz, weight: 500, cls: 'lb-name' }, ...R.flatMap(([k, v], i) => [{ t: (i ? '· ' : '') + k, size: sz, weight: 500, cls: 'lb-unit', gap: i ? 5 : 6 }, { t: Number.isFinite(v) ? fmt(v, 1) : '∞', size: sz, weight: 650, cls: 'lb-val', gap: 3 }]), { t: 'WU', size: sz, weight: 500, cls: 'lb-unit', gap: 3 }]);
        }
        const [ax, ay] = worldToLocal((LIVER_MODULE.x0 + LIVER_MODULE.x1) / 2, LIVER_MODULE.y0);
        const it = { key: 'liver', cls: 'module' + (open ? ' open' : ''), lines, align: 'middle', bg: true, padX: 8, padY: 4, ax, ay, label: open ? 'Hide liver stations' : 'Show liver stations',
          onClick: () => { liverOpen = !liverExpanded(); if (!liverOpen && vt.k >= 1.9) toast('Zoomed in: the liver stays expanded. Zoom out to collapse it.'); if (F) update(F); } };
        it.w = Math.max(...lines.map(lineW)); it.h = lines.reduce((a, l) => a + LINE_H(l), 0);
        place(it, ['N', 'C'], 4, false);
      }
      const nodes = [];
      for (const n of NODES) {
        if (!nodeEls[n.id] || !CIRCUIT_LABELS[n.id]) continue;
        if (!nodeVisible(n.id)) continue;
        if (!open && LIVER_INNER.has(n.id) && !(st.selection?.type === 'node' && st.selection.id === n.id)) continue;
        const [ax, ay] = worldToLocal(...nodePos(n.id, t));
        if (ax < -10 || ax > W + 10 || ay < -10 || ay > H + 10) continue;
        placed.push({ x0: ax - 5, y0: ay - 5, x1: ax + 5, y1: ay + 5 });
        const it = nodeItem(n.id, f, 'station', compact);
        it.align = 'middle'; it.ax = ax; it.ay = ay; it.pri = it.sel ? 100 : CIRCUIT_LABELS[n.id].pri;
        nodes.push(it);
      }
      for (const it of nodes.sort((a, b) => b.pri - a.pri)) {
        const pref = CIRCUIT_LABELS[it.node].dirs;
        const dirs = [...pref, ...['N', 'S', 'E', 'W', 'NE', 'SE', 'NW', 'SW'].filter((d) => !pref.includes(d))];
        if (!place(it, dirs, [7, 18, 30], false) && it.sel) place(it, dirs, 40, true);
      }
      for (const it of nodes) {
        if (!it.leader || !out.includes(it)) continue;
        const r = rectOf(it);
        leaders += `<path class="leader" d="M${it.ax.toFixed(1)} ${it.ay.toFixed(1)} L${clamp(it.ax, r.x0, r.x1).toFixed(1)} ${clamp(it.ay, r.y0, r.y1).toFixed(1)}"/>`;
      }
      // Collateral and shunt lanes, captioned along their run.
      for (const [id, cap] of Object.entries(LANE_CAPTIONS)) {
        const x = E[id];
        if (!x?.vis || x.g.classList.contains('coll-ghost')) continue;
        const [lx, ly] = pointAt(geo[id].cur, laneU[id]);
        const [ax, ay] = worldToLocal(lx, ly);
        const it = { key: 'lane:' + id, cls: 'lane', lines: [[{ t: cap, size: compact ? 9 : 10, weight: 550, cls: 'lb-lane' }]], align: 'middle', padX: 2, padY: 1, ax, ay };
        it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]);
        place(it, ['N', 'S'], [3 + (x.width || 4) / 2, 12 + (x.width || 4) / 2], false);
      }
    }
    // Lesson / case focus callout
    const foc = st.focus;
    if (foc?.edges?.length && E[foc.edges[0]]?.vis) {
      const [x, y] = pointAt(geo[foc.edges[0]].cur, 0.5);
      const [ax, ay] = worldToLocal(x, y);
      const it = { key: 'focus', cls: 'focus', lines: [[{ t: foc.label || 'Here', size: 11.5, weight: 650, cls: 'lb-focus' }]], align: 'start', bg: true, padX: 8, padY: 4, ax, ay };
      it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]);
      if (place(it, ['E', 'W', 'NE', 'SE', 'N', 'S'], 18 + (E[foc.edges[0]].width || 4), true)) {
        const r = rectOf(it);
        leaders += `<path class="leader focus" d="M${ax.toFixed(1)} ${ay.toFixed(1)} L${clamp(ax, r.x0, r.x1).toFixed(1)} ${clamp(ay, r.y0, r.y1).toFixed(1)}"/>`;
      }
    }

    for (const it of out) renderBlock(it);
    for (const [k, b] of pool) if (b.seen !== frameNo) b.g.style.display = 'none';
    if (gLeaders._last !== leaders) { gLeaders.innerHTML = leaders; gLeaders._last = leaders; }
  }
  const nodeVisible = (id) => ALL_EDGES.some((e) => (e.from === id || e.to === id) && E[e.id]?.vis);

  // ── Flow marks ────────────────────────────────────
  // Blood flow is drawn as evenly spaced arrowheads inside each lumen, pointing and moving
  // downstream. Their speed follows mean velocity (log-compressed), so fast and slow vessels are
  // told apart at a glance; a vessel without flow carries none; reversed flow simply runs the
  // other way. Paused, or with reduced motion, the arrows hold still and keep their direction.
  const phase = {};
  function flowState(x) {
    const e = x.e, k = EI[e.id];
    // Mean (filtered) flow, so beat-to-beat or respiratory to-and-fro doesn't flip the chevrons.
    const q = F.Qf ? F.Qf[k] : F.Q[k];
    const D = Math.max(0.5, F.D[k]) / 10;
    const vel = e.kind === 'liver' ? q * 0.6 : q / (Math.PI * D * D / 4);
    return { q, vel };
  }
  // One mark everywhere: a filled arrowhead (a dart with a shallow notch), sized to the lumen,
  // white on dark vessels and ink on light ones, orange where flow is reversed. A faint outline
  // in the opposite tone keeps it legible where it overhangs a thin vessel. Direction mode, whose
  // whole subject is the arrows, draws them larger.
  const markSize = (w) => clamp(w * 0.85, 5.5, 12) * (colorModeIs('direction') ? 1.3 : 1);
  const markSpacing = (w) => clamp(markSize(w) * 3, 18, 38);
  // Drift speed (world units/s). Capped below ~1 spacing per second: a mark that moves close to
  // its own spacing between frames reads as flicker (the wagon-wheel effect).
  function markSpeed(x, vel, simSpeed) {
    const v = (3 + 16 * Math.log1p(Math.abs(vel) / 1.5)) * simSpeed;
    return Math.min(v, (x.sp || markSpacing(x.width)) * 1.1);
  }
  function colorModeIs(m) { return (store.get().colorMode || 'pressure') === m; }

  // Depth, as drawn: vessels behind the organs (retrohepatic IVC, renal, iliac) at the back,
  // the portal tree in front, other veins between. Marks on a deeper vessel slide under whatever
  // is drawn over it (see drawFlow), exactly as the vessel itself does.
  const depth = (x) => (morph > 0.5 ? 1 : x.back ? 0 : x.front ? 2 : 1);
  // Where two vessels at the same depth share a drawn course (circuit routes that run together, a
  // trunk where a branch joins), only one draws marks there: the smaller, static vessel keeps
  // them. The mask is soft (marks shrink away over a few samples) and depends only on layout,
  // so marks never blink.
  let cover = {}, coverKey = '';
  function updateCover() {
    const list = [];
    for (const x of Object.values(E)) {
      if (!x.vis || x.g.classList.contains('coll-ghost')) continue;
      if (x.w0 == null) x.w0 = x.width;
      list.push(x);
    }
    const key = morph.toFixed(2) + '|' + list.map((x) => x.e.id).join(',');
    if (key === coverKey) return;
    coverKey = key;
    const owns = (y, x) => y.w0 < x.w0 || (y.w0 === x.w0 && y.e.id < x.e.id);
    const CELL = 16, grid = new Map();
    for (const x of list) {
      const c = geo[x.e.id].cur;
      for (let i = 1; i < c.length; i++) {
        const gx0 = Math.floor(Math.min(c[i - 1][0], c[i][0]) / CELL), gx1 = Math.floor(Math.max(c[i - 1][0], c[i][0]) / CELL);
        const gy0 = Math.floor(Math.min(c[i - 1][1], c[i][1]) / CELL), gy1 = Math.floor(Math.max(c[i - 1][1], c[i][1]) / CELL);
        for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
          const k = gx * 4096 + gy;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push([x, c[i - 1], c[i]]);
        }
      }
    }
    const next = {};
    for (const x of list) {
      const c = geo[x.e.id].cur, hard = new Uint8Array(c.length);
      for (let i = 0; i < c.length; i++) {
        const [px, py] = c[i];
        for (const [y, a0, a1] of grid.get(Math.floor(px / CELL) * 4096 + Math.floor(py / CELL)) || []) {
          if (y === x || depth(y) !== depth(x) || !owns(y, x)) continue;
          const ddx = a1[0] - a0[0], ddy = a1[1] - a0[1], L2 = ddx * ddx + ddy * ddy || 1;
          const t = clamp(((px - a0[0]) * ddx + (py - a0[1]) * ddy) / L2, 0, 1);
          if (Math.hypot(px - a0[0] - t * ddx, py - a0[1] - t * ddy) < Math.max(1.5, Math.min(x.w0, y.w0) * 0.4)) { hard[i] = 1; break; }
        }
      }
      // Soft edge: 1 away from any masked sample, easing to 0 over three samples.
      const soft = new Float32Array(c.length).fill(1);
      for (let i = 0; i < c.length; i++) if (hard[i]) for (let j = Math.max(0, i - 3); j <= Math.min(c.length - 1, i + 3); j++) soft[j] = Math.min(soft[j], Math.abs(i - j) / 3);
      next[x.e.id] = soft;
    }
    cover = next;
  }

  // Calls cb(x, ink, marks[], fade) per vessel; each mark is { cx, cy, ux, uy, s }.
  function eachVesselMarks(cb) {
    const st = store.get();
    if (!F || st.imaging || st.layers.flow === false) return;
    updateCover();
    for (const x of Object.values(E)) {
      if (!x.vis || x.reveal || x.g.classList.contains('coll-ghost')) continue;
      const { q, vel } = flowState(x);
      // Near-stagnant flow fades out rather than popping in and out.
      const fade = clamp((Math.abs(vel) - 0.1) / 0.5, 0, 1);
      if (fade <= 0 || Math.abs(q) < 0.02) continue;
      const g = geo[x.e.id];
      const L = g.len;
      const w = x.width;
      // Spacing is fixed per vessel (set once, revised only if the vessel's caliber changes a lot),
      // and marks are spaced by distance along the centerline: nothing about a mark's position
      // depends on the model's frame-to-frame values except its steady drift.
      const spT = markSpacing(w);
      if (!x.sp || Math.abs(spT - x.sp) / x.sp > 0.35) x.spGoal = spT;
      if (x.spGoal) { x.sp = x.sp ? x.sp + (x.spGoal - x.sp) * 0.03 : x.spGoal; if (Math.abs(x.sp - x.spGoal) < 0.05) { x.sp = x.spGoal; x.spGoal = 0; } }
      x.ms = x.ms ? x.ms + (markSize(w) - x.ms) * 0.01 : markSize(w);
      const sp = x.sp;
      const m = Math.min(L * 0.12, sp * 0.35 + 2);
      if (L - 2 * m < 6) continue;
      // Point the way the marks are actually moving (their speed eases through a reversal).
      const sg = (x.spd != null && x.spd !== 0 ? x.spd : q) >= 0 ? 1 : -1;
      const ph = ((((phase[x.e.id] || 0) % 1) + 1) % 1) * sp;
      const mask = cover[x.e.id];
      const marks = [];
      const r0 = w / 2, rOf = x.rOf && !x.g.classList.contains('stroked') ? x.rOf : () => r0;
      const n = N_SAMPLES - 1;
      for (let tt = m + ph; tt < L - m; tt += sp) {
        const uu = tt / L;
        const cov = mask ? mask[Math.floor(uu * n)] + (mask[Math.min(n, Math.floor(uu * n) + 1)] - mask[Math.floor(uu * n)]) * (uu * n % 1) : 1;
        if (cov < 0.08) continue;
        const [px, py, dx, dy] = pointAt(g.cur, uu);
        // Marks grow in at the upstream end and shrink away downstream instead of popping.
        const ends = clamp(Math.min(tt - m, L - m - tt) / (sp * 0.8), 0, 1);
        if (ends < 0.08) continue;
        const nn = Math.hypot(dx, dy) || 1;
        marks.push({ cx: px, cy: py, ux: (dx / nn) * sg, uy: (dy / nn) * sg, s: x.ms * clamp(rOf(uu) / r0, 0.6, 1.3) * ends * cov });
      }
      // A braided collateral's other channels carry the same flow: the same marks, spaced and
      // sized for each channel's own caliber, drifting in step with the main channel.
      if (x.strands && morph < 0.5) for (const sd of x.strands) {
        const sw = Math.max(1.6, w * sd.k), ssp = markSpacing(sw), sms = markSize(sw);
        const sm = Math.min(sd.len * 0.12, ssp * 0.35 + 2);
        for (let tt = sm + (ph / sp) * ssp; tt < sd.len - sm; tt += ssp) {
          const ends = clamp(Math.min(tt - sm, sd.len - sm - tt) / (ssp * 0.8), 0, 1);
          if (ends < 0.08) continue;
          const [px, py, dx, dy] = pointAt(sd.cur, tt / sd.len);
          const nn = Math.hypot(dx, dy) || 1;
          marks.push({ cx: px, cy: py, ux: (dx / nn) * sg, uy: (dy / nn) * sg, s: sms * ends });
        }
      }
      const ink = x.rev && !colorModeIs('direction') ? 'rev' : x.inkDark && !x.isArt ? 'dark' : 'light';
      if (marks.length) cb(x, ink, marks, fade);
    }
  }
  // Reversed (hepatofugal) flow keeps its own steady ink, so it reads as a state, not an event.
  const INK = { light: 'rgba(255, 255, 255, 0.95)', dark: 'rgba(24, 26, 40, 0.78)', rev: 'rgba(255, 150, 50, 1)' };
  const HALO = { light: 'rgba(20, 22, 36, 0.35)', dark: 'rgba(255, 255, 255, 0.45)', rev: 'rgba(60, 24, 0, 0.55)' };
  function markPath(k) {
    const { cx, cy, ux, uy, s } = k, nx = -uy, ny = ux;
    const tip = [cx + ux * s * 0.55, cy + uy * s * 0.55];
    const bx = cx - ux * s * 0.45, by = cy - uy * s * 0.45;
    const notch = [cx - ux * s * 0.2, cy - uy * s * 0.2];
    return [tip, [bx + nx * s * 0.45, by + ny * s * 0.45], notch, [bx - nx * s * 0.45, by - ny * s * 0.45]];
  }
  /** Static flow marks as SVG (world coordinates), for exported figures. */
  /** Static flow marks as SVG (world coordinates) by depth: [behind organs, middle, front]. */
  function flowSVG() {
    const out = ['', '', ''];
    eachVesselMarks((x, ink, marks, fade) => {
      const op = fade < 1 ? ` opacity="${fade.toFixed(2)}"` : '';
      const d = marks.map((k) => 'M' + markPath(k).map(([a, b]) => `${a.toFixed(1)} ${b.toFixed(1)}`).join(' L') + ' Z').join(' ');
      out[depth(x)] += `<path d="${d}" fill="${INK[ink]}" stroke="${HALO[ink]}" stroke-width="0.8" stroke-linejoin="round" paint-order="stroke"${op}/>`;
    });
    return out.map((o) => `<g>${o}</g>`);
  }

  let lastT = performance.now(), lastDrawKey = null, lastDrawF = null, lastDrawCTM = null;
  let lastRaf = 0, gapEMA = 16, qCheck = 0, qGood = 0, drawnView = -1;
  function governQuality(now) {
    const gap = lastRaf ? now - lastRaf : 16;
    lastRaf = now;
    if (!store.get().running || gap > 500) return;   // idle or just resumed: nothing to learn
    gapEMA += (Math.min(gap, 250) - gapEMA) * 0.05;
    if (now - qCheck < 2000) return;
    qCheck = now;
    let next = quality;
    if (gapEMA > 45 && quality < 2) { next = quality + 1; qGood = 0; }
    else if (gapEMA < 22 && quality > 0) { if (++qGood >= 3) { next = quality - 1; qGood = 0; } }
    else qGood = 0;
    if (next === quality) return;
    quality = next;
    wrap.dataset.quality = String(quality);
    try { localStorage.setItem('pps.quality', String(quality)); } catch { /* storage unavailable */ }
    resizeCanvas(); maskSig = '';
  }
  let flowGate = lastT;
  function animate(now) {
    // High-refresh screens need not run the full flow renderer at their refresh
    // rate. Keep elapsed time intact so arrow speed and transitions stay correct.
    if (document.hidden || appEl?.classList.contains('home-open')) { lastT = flowGate = now; lastRaf = 0; requestAnimationFrame(animate); return; }
    governQuality(now);
    const interval = 1000 / QUALITY[quality].fps;
    // A pan or zoom redraws at once (the marks must stay on their vessels); only the model's
    // own motion is paced.
    const viewMoved = viewVersion !== drawnView;
    if (!viewMoved && now - flowGate < interval) { requestAnimationFrame(animate); return; }
    flowGate = now - ((now - flowGate) % interval);
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    // Fully inside the lobule, the plate is covered: skip its flow marks.
    if (lz?.isOpen()) { requestAnimationFrame(animate); return; }
    const st = store.get();
    const still = !st.running || reduceMotion.matches;
    const key = still ? `${morph}|${wrap.className}|${st.layers.flow}|${dpr}|${canvas.width}x${canvas.height}` : null;
    if (still && morph === morphTarget && key === lastDrawKey && F === lastDrawF && CTM === lastDrawCTM && !Object.values(E).some((x) => x.reveal)) { requestAnimationFrame(animate); return; }
    if (morph !== morphTarget) {
      morph = clamp(morph + Math.sign(morphTarget - morph) * dt / 0.6, 0, 1);
      if (F) update(F); else updateGeometry(true);
    }
    stepReveals(now);
    drawFlow(dt, st);
    drawnView = viewVersion;
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
  // Erase from the canvas whatever the SVG draws in front of depth `dpt` - 1 (organs lie in
  // front of depth 0 only; vessels of depth ≥ dpt in front of everything shallower).
  // What the SVG draws in front of each depth of flow marks (organs over the posterior veins,
  // nearer vessels over deeper ones) is erased from the canvas. The masks only change when the
  // view moves or a vessel changes width, so each depth's mask is painted into a bitmap once
  // and stamped out with a single image draw per frame, instead of stroking every vessel and
  // filling every organ outline 60 times a second.
  const masks = {};
  function eraseCovers(dpt) {
    const m = ctx.getTransform();
    const organs = dpt === 1 && morph < 0.5;
    let sig = [m.a, m.e, m.f].map((v) => v.toFixed(2)).join(',') + `|${canvas.width}x${canvas.height}|${morph.toFixed(3)}|${organs}`;
    const list = [];
    for (const x of Object.values(E)) {
      if (!x.vis || x.isArt || depth(x) < dpt || x.g.classList.contains('coll-ghost')) continue;
      list.push(x); sig += `|${x.e.id}:${Math.round(x.width)}`;
    }
    const mk = masks[dpt] || (masks[dpt] = { c: document.createElement('canvas'), key: '' });
    if (mk.key !== sig) {
      mk.key = sig;
      mk.c.width = canvas.width; mk.c.height = canvas.height;
      const mc = mk.c.getContext('2d');
      mc.setTransform(m);
      mc.lineCap = 'round'; mc.lineJoin = 'round';
      // Organs don't hide deeper marks completely: the SVG shows posterior veins through them as
      // a faint ghost (opacity .34), so their marks stay at the same faint strength. Solid organs
      // are merged into one path so overlapping organs don't fade the marks twice.
      if (organs) {
        mc.fillStyle = mc.strokeStyle = 'rgba(0,0,0,.66)';
        const solid = new Path2D();
        for (const { p, w } of getOrganCovers()) { if (w) { mc.lineWidth = w; mc.stroke(p); } else solid.addPath(p); }
        mc.fill(solid);
      }
      mc.strokeStyle = '#000';
      for (const x of list) {
        const c = geo[x.e.id].cur;
        mc.lineWidth = x.width + 2 * (x.wallPx || 1);
        mc.beginPath(); mc.moveTo(c[0][0], c[0][1]);
        for (let i = 1; i < c.length; i++) mc.lineTo(c[i][0], c[i][1]);
        mc.stroke();
      }
    }
    // Only tiles holding marks from the shallower depths have anything to erase; the rest of
    // the canvas is empty. Stamping just those tiles (one image draw per run of adjacent dirty
    // tiles in a row) gives the same pixels as stamping the whole mask, for a fraction of the
    // fill: the flow canvas no longer does several full-screen blends every frame.
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const { cols, rows, dirty } = tiles;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!dirty[r * cols + c]) continue;
        const c0 = c;
        while (c + 1 < cols && dirty[r * cols + c + 1]) c++;
        const x = c0 * TILE, y = r * TILE;
        const w = Math.min(canvas.width, (c + 1) * TILE) - x, h = Math.min(canvas.height, y + TILE) - y;
        if (w > 0 && h > 0) ctx.drawImage(mk.c, x, y, w, h, x, y, w, h);
      }
    }
    ctx.restore();
  }
  // Device-pixel tiles touched by the marks drawn so far this frame (see eraseCovers).
  const TILE = 32;
  const tiles = { cols: 0, rows: 0, dirty: new Uint8Array(0) };
  function resetTiles() {
    const cols = Math.ceil(canvas.width / TILE), rows = Math.ceil(canvas.height / TILE);
    if (cols !== tiles.cols || rows !== tiles.rows) Object.assign(tiles, { cols, rows, dirty: new Uint8Array(cols * rows) });
    else tiles.dirty.fill(0);
  }
  // Marks a device-space square of half-size `r` around world point (x, y).
  function markTiles(m, x, y, r) {
    const X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f;
    const { cols, rows, dirty } = tiles;
    const c0 = Math.max(0, Math.floor((X - r) / TILE)), c1 = Math.min(cols - 1, Math.floor((X + r) / TILE));
    const r0 = Math.max(0, Math.floor((Y - r) / TILE)), r1 = Math.min(rows - 1, Math.floor((Y + r) / TILE));
    for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) dirty[j * cols + i] = 1;
  }

  function drawFlow(dt, st) {
    if (!CTM) refreshCTM();
    if (!flowGL) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); }
    if (!F) { flowGL?.clear(); return; }
    const m = CTM;
    const T = [dpr * m.a, dpr * m.b, dpr * m.c, dpr * m.d, dpr * (m.e - wrapRect.left), dpr * (m.f - wrapRect.top)];
    const moving = st.running && !reduceMotion.matches;
    const simSpeed = st.clock === 'hemo' ? clamp(Math.sqrt(st.speed), 0.5, 2) : 0.8;
    const hovering = wrap.classList.contains('hovering');
    const receding = wrap.classList.contains('has-sel') && !appEl?.classList.contains('figure-mode');
    for (const x of Object.values(E)) {
      if (!x.vis || !moving) continue;
      const { vel } = flowState(x);
      // Signed speed in spacings/s. Eased over ~2 s: slow enough that breathing (the IVC's flow
      // swings ±20 % over each 4 s breath) and the stepped model updates don't make the marks
      // surge and stall, quick enough to follow a real change.
      const target = (markSpeed(x, vel, simSpeed) / (x.sp || markSpacing(x.width))) * Math.sign(flowState(x).q);
      x.spd = x.spd == null ? target : x.spd + (target - x.spd) * Math.min(1, dt * 0.5);
      phase[x.e.id] = ((phase[x.e.id] || 0) + x.spd * dt) % 1;
    }
    // Marks are drawn back to front, one depth at a time; after each depth, everything the SVG
    // draws in front of the next is erased from the canvas (organs over the retroperitoneal veins,
    // nearer vessels over deeper ones), so a mark slides under a crossing vessel or a bowel loop
    // just as its own vessel does, instead of being drawn over it or switched off.
    const layers = [[], [], []];
    eachVesselMarks((x, ink, marks, fade) => layers[depth(x)].push([x, ink, marks, fade]));
    const lwHalo = 0.8 / Math.max(0.2, Math.abs(CTM.a));
    const alphaOf = (x, fade) => fade * (hovering && !x.g.classList.contains('hl') ? 0.2 : receding && !x.g.classList.contains('is-sel') ? 0.4 * Number(x.g.style.opacity || 1) : Number(x.g.style.opacity || 1));
    if (flowGL) { drawFlowGL(layers, T, moving, alphaOf, lwHalo); return; }
    ctx.setTransform(...T);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    resetTiles();
    const dm = ctx.getTransform(), dScale = Math.hypot(dm.a, dm.b);
    for (let dpt = 0; dpt < 3; dpt++) {
      if (dpt > 0 && layers.slice(0, dpt).some((l) => l.length)) eraseCovers(dpt);
      for (const [x, ink, marks, fade] of layers[dpt]) {
        ctx.globalAlpha = alphaOf(x, fade);
        // Fast flow (a TIPS, a jet through a narrowing, a big shunt) leaves a soft trail behind
        // each mark, so speed reads even in a still frame.
        const fast = moving && marks.length && QUALITY[quality].trails ? clamp((Math.abs(flowState(x).vel) - 25) / 45, 0, 1) : 0;
        if (fast > 0) {
          const a0 = ctx.globalAlpha;
          ctx.strokeStyle = INK[ink]; ctx.lineWidth = marks[0].s * 0.3;
          for (const [from, to, al] of [[0.25, 0.9, 0.45], [0.9, 1.9, 0.2]]) {
            ctx.globalAlpha = a0 * al * fast;
            ctx.beginPath();
            for (const k of marks) { const L = 1 + fast; ctx.moveTo(k.cx - k.ux * k.s * from * L, k.cy - k.uy * k.s * from * L); ctx.lineTo(k.cx - k.ux * k.s * to * L, k.cy - k.uy * k.s * to * L); }
            ctx.stroke();
          }
          ctx.globalAlpha = a0;
        }
        ctx.beginPath();
        for (const k of marks) {
          const pts = markPath(k);
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.closePath();
        }
        ctx.strokeStyle = HALO[ink]; ctx.lineWidth = lwHalo; ctx.stroke();
        ctx.fillStyle = INK[ink]; ctx.fill();
        // The deepest layer is never erased, so its tiles need no bookkeeping. The reach covers
        // the chevron, its halo and the fast-flow trail, plus a pixel or two of antialiasing.
        if (dpt < 2) for (const k of marks) markTiles(dm, k.cx, k.cy, (k.s * (fast > 0 ? 1.9 * (1 + fast) + 0.2 : 0.7) + lwHalo) * dScale + 3);
      }
    }
    ctx.globalAlpha = 1;
    // Active variceal bleeding: a small spray at the rupture site and blood pooling in the stomach.
    if (F.bleed?.active && morph < 0.5) {
      const gv = F.bleed.site === 'GV';
      const site = gv ? [SITES.fundus[0], SITES.fundus[1] - 4] : [SITES.varix[0] + 8, SITES.varix[1] + 12];
      const k = clamp((F.metrics.bleeding?.rate || 50) / 90, 0.7, 1.8);
      const tt = moving ? performance.now() / 1000 : 0;
      ctx.fillStyle = 'rgb(150, 14, 34)';
      for (let i = 0; i < 9; i++) {
        const a = (gv ? Math.PI / 2 : -Math.PI / 2) + (i - 4) * 0.22;
        const ph = (tt * 0.8 + i * 0.37) % 1;
        const rr = (5 + 20 * ph) * k;
        ctx.globalAlpha = 0.9 * (1 - ph);
        ctx.beginPath(); ctx.arc(site[0] + Math.cos(a) * rr * 0.55, site[1] + Math.sin(a) * rr, (1.9 - ph) * k, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 0.28;
      const pool = clamp(Math.sqrt((F.bleed.total || 0) / 5), 4, 40);
      ctx.beginPath(); ctx.ellipse(SITES.stomachPool[0], SITES.stomachPool[1], pool * 1.4, pool * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // The same frame on the GPU: occlusion mask (rebuilt only when the layout changes), then every
  // mark, trail and bleed droplet in one instanced draw.
  let organBitmap = false, maskSig = '';
  function drawFlowGL(layers, T, moving, alphaOf, lwHalo) {
    flowGL.setTransform(T);
    const organs = morph < 0.5;
    if (organs && !organBitmap) {
      // The organ covers, rasterized once in world space (1.5 px per unit).
      const k = 1.5, c = document.createElement('canvas');
      c.width = VIEW.w * k; c.height = VIEW.h * k;
      const mc = c.getContext('2d');
      mc.setTransform(k, 0, 0, k, 0, 0);
      mc.lineCap = 'round'; mc.lineJoin = 'round';
      mc.fillStyle = mc.strokeStyle = 'rgba(0,0,0,.66)';
      const solid = new Path2D();
      for (const { p, w } of getOrganCovers()) { if (w) { mc.lineWidth = w; mc.stroke(p); } else solid.addPath(p); }
      mc.fill(solid);
      flowGL.setOrgans(c, [0, 0, VIEW.w, VIEW.h]);
      organBitmap = true;
    }
    if (morph <= 0.5 && (layers[0].length || layers[1].length)) {
      let sig = `${T.map((v) => v.toFixed(2)).join(',')}|${canvas.width}x${canvas.height}|${morph.toFixed(3)}|${organs}`;
      let n = 0;
      const list = [];
      for (const x of Object.values(E)) {
        if (!x.vis || x.isArt || depth(x) < 1 || x.g.classList.contains('coll-ghost')) continue;
        list.push(x); n += geo[x.e.id].cur.length - 1; sig += `|${x.e.id}:${Math.round(x.width)}`;
      }
      if (sig !== maskSig) {
        maskSig = sig;
        const buf = flowGL.ensureSegs(n);
        let o = 0;
        for (const x of list) {
          const c = geo[x.e.id].cur, r = (x.width + 2 * (x.wallPx || 1)) / 2, front = depth(x) >= 2 ? 1 : 0;
          for (let i = 1; i < c.length; i++, o += SEG_FLOATS) {
            buf[o] = c[i - 1][0]; buf[o + 1] = c[i - 1][1]; buf[o + 2] = c[i][0]; buf[o + 3] = c[i][1];
            buf[o + 4] = r; buf[o + 5] = 1; buf[o + 6] = front; buf[o + 7] = 0;
          }
        }
        flowGL.buildMask(n, organs);
      }
    } else if (maskSig) { maskSig = ''; flowGL.clearMask(); }
    let count = 0;
    for (const L of layers) for (const [, , marks] of L) count += marks.length * 3;
    const bleed = F.bleed?.active && morph < 0.5;
    const buf = flowGL.ensureMarks(count + (bleed ? 10 : 0));
    let o = 0;
    const put = (cx, cy, ux, uy, size, kind, p1, p2, fill, halo, hw, dpt, a) => {
      buf[o] = cx; buf[o + 1] = cy; buf[o + 2] = ux; buf[o + 3] = uy;
      buf[o + 4] = size; buf[o + 5] = kind; buf[o + 6] = p1; buf[o + 7] = p2;
      buf[o + 8] = fill[0]; buf[o + 9] = fill[1]; buf[o + 10] = fill[2]; buf[o + 11] = fill[3];
      buf[o + 12] = halo[0]; buf[o + 13] = halo[1]; buf[o + 14] = halo[2]; buf[o + 15] = halo[3];
      buf[o + 16] = hw; buf[o + 17] = dpt; buf[o + 18] = a; buf[o + 19] = 0;
      o += MARK_FLOATS;
    };
    for (let dpt = 0; dpt < 3; dpt++) {
      for (const [x, ink, marks, fade] of layers[dpt]) {
        const a0 = alphaOf(x, fade), fill = rgba(INK[ink]), halo = rgba(HALO[ink]);
        const fast = moving && marks.length && QUALITY[quality].trails ? clamp((Math.abs(flowState(x).vel) - 25) / 45, 0, 1) : 0;
        if (fast > 0) {
          const L = 1 + fast;
          for (const [from, to, al] of [[0.25, 0.9, 0.45], [0.9, 1.9, 0.2]]) {
            for (const k of marks) put(k.cx, k.cy, k.ux, k.uy, k.s, 1, k.s * from * L, k.s * to * L, fill, halo, 0, dpt, a0 * al * fast);
          }
        }
        for (const k of marks) put(k.cx, k.cy, k.ux, k.uy, k.s, 0, 0, 0, fill, halo, lwHalo, dpt, a0);
      }
    }
    if (bleed) {
      const gv = F.bleed.site === 'GV';
      const site = gv ? [SITES.fundus[0], SITES.fundus[1] - 4] : [SITES.varix[0] + 8, SITES.varix[1] + 12];
      const k = clamp((F.metrics.bleeding?.rate || 50) / 90, 0.7, 1.8);
      const tt = moving ? performance.now() / 1000 : 0;
      const red = [150 / 255, 14 / 255, 34 / 255, 1], none = [0, 0, 0, 0];
      for (let i = 0; i < 9; i++) {
        const a = (gv ? Math.PI / 2 : -Math.PI / 2) + (i - 4) * 0.22;
        const ph = (tt * 0.8 + i * 0.37) % 1;
        const rr = (5 + 20 * ph) * k, r = (1.9 - ph) * k;
        put(site[0] + Math.cos(a) * rr * 0.55, site[1] + Math.sin(a) * rr, 1, 0, 0, 2, r, r, red, none, 0, 2, 0.9 * (1 - ph));
      }
      const pool = clamp(Math.sqrt((F.bleed.total || 0) / 5), 4, 40);
      put(SITES.stomachPool[0], SITES.stomachPool[1], 1, 0, 0, 2, pool * 1.4, pool * 0.6, red, none, 0, 2, 0.28);
    }
    flowGL.draw(o / MARK_FLOATS);
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
    return el ? el.getAttribute('data-id') : null;
  }

  // Organs under a point (anatomy only). The varices and fundus are small sites; the abdomen is
  // whatever lies inside the peritoneal cavity below the stomach.
  const ORGAN_OF = { liver: 'liver', gallbladder: 'liver', heart: 'heart', spleen: 'spleen', stomach: 'gastric', esophagus: 'varices', bowel: 'abdomen', colon: 'abdomen', appendix: 'abdomen', duodenum: 'abdomen', 'kidney-l': null, 'kidney-r': null };
  const ptIn = (el, x, y, stroke) => {
    if (!el) return false;
    const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
    try { return stroke ? el.isPointInStroke(pt) : el.isPointInFill(pt); } catch { return false; }
  };
  function organAt(wx, wy) {
    if (morph > 0.5) return null;
    if (insideVarix(wx, wy)) return 'varices';
    if (Math.hypot(wx - SITES.fundus[0], wy - SITES.fundus[1]) < 34) return 'gastric';
    for (const o of [...ORGANS].reverse()) {
      if (o.deco || !(o.id in ORGAN_OF)) continue;
      const el = organEls[o.id];
      if (o.band ? ptIn(el, wx, wy, true) : ptIn(el, wx, wy)) return ORGAN_OF[o.id];
    }
    if (ptIn(abdomenEl, wx, wy) && wy > 560) return 'abdomen';
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
      for (const e of hl) if (E[e]) cls(E[e], 'hl', true);
      wrap.classList.add('hovering');
    } else wrap.classList.remove('hovering');
  }

  svg.addEventListener('pointerover', (ev) => {
    const id = edgeFromEvent(ev);
    if (id && EI[id] != null) setHover(id);
  });
  svg.addEventListener('pointerout', (ev) => { if (edgeFromEvent(ev)) { setHover(null); onHoverInfo(null); } });
  svg.addEventListener('pointermove', (ev) => {
    const id = edgeFromEvent(ev);
    if (id && EI[id] != null && F && !shunt) onHoverInfo({ id, x: ev.clientX - wrap.getBoundingClientRect().left, y: ev.clientY - wrap.getBoundingClientRect().top });
    else if (!drag) onHoverInfo(null);
    if (shunt) shuntMove(ev);
  });

  svg.addEventListener('wheel', (ev) => { ev.preventDefault(); zoomAt(ev.clientX, ev.clientY, Math.exp(-ev.deltaY * 0.0015)); }, { passive: false });

  svg.addEventListener('pointerdown', (ev) => {
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; drag = { type: 'pinchzoom', d0: Math.hypot(a[0] - b[0], a[1] - b[1]), k0: vt.k }; return; }
    const tool = store.get().tool;
    const id = edgeFromEvent(ev);
    const [wx, wy] = clientToWorld(ev.clientX, ev.clientY);
    svg.setPointerCapture(ev.pointerId);
    const paint = !shunt && ((tool === 'fibrosis' && insideLiver(wx, wy)) || (tool === 'thrombus' && id && EI[id] != null && !E[id].isArt));
    if (ev.button === 1 || !paint || spaceDown) {
      drag = { type: 'pan', x: ev.clientX, y: ev.clientY, vx: vt.x, vy: vt.y, moved: false, id };
      wrap.classList.add('panning');
      return;
    }
    handlePaintDown(tool, id, wx, wy, ev);
  });
  svg.addEventListener('pointermove', (ev) => {
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (!drag) return;
    if (drag.type === 'pinchzoom' && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (drag.k0 * d / drag.d0) / vt.k);
      return;
    }
    if (drag.type === 'pan') {
      const s0 = svg.getScreenCTM().a;
      if (Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) > 4) drag.moved = true;
      if (drag.moved) { vt.x = drag.vx + (ev.clientX - drag.x) / s0; vt.y = drag.vy + (ev.clientY - drag.y) / s0; applyVT(); CTM = null; }
      return;
    }
    handlePaintMove(ev);
  });
  const endPointer = (ev) => {
    pointers.delete(ev.pointerId);
    if (!drag) return;
    if (drag.type === 'pan') {
      wrap.classList.remove('panning');
      if (!drag.moved) {
        if (shunt) shuntDrop(ev);
        else pick(drag.id, ev);
      }
      drag = null;
      return;
    }
    drag = null;
    gGuides.innerHTML = '';
  };
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

  function pick(id, ev) {
    if (id && EI[id] != null) { onSelect({ type: 'edge', id }); return; }
    const [wx, wy] = clientToWorld(ev.clientX, ev.clientY);
    const o = organAt(wx, wy);
    onSelect(o ? { type: 'organ', id: o, at: [wx, wy], lobe: o === 'liver' ? (wx < LIVER_SPLIT_X ? 'R' : 'L') : undefined } : null);
  }

  let spaceDown = false;
  addEventListener('keydown', (e) => { if (e.code === 'Space' && e.target === document.body) spaceDown = true; });
  addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });

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
  const STENT_RULES = [
    { a: ['RPV', 'LPV', 'PV'], b: ['RHV', 'MHV', 'LHV', 'IVC'], key: 'tips', label: 'TIPS' },
    { a: ['PV'], b: ['IVC'], key: 'portocaval', label: 'Portocaval shunt' },
    { a: ['SV'], b: ['LRV'], key: 'dsrs', label: 'Distal splenorenal shunt' },
    { a: ['SMV'], b: ['IVC'], key: 'mesocaval', label: 'Mesocaval shunt' },
  ];
  const vesselOf = (id) => EDGE_VESSEL[id] || null;
  function stentRule(a, b) {
    const va = vesselOf(a), vb = vesselOf(b);
    for (const r of STENT_RULES) {
      if ((r.a.includes(va) && r.b.includes(vb)) || (r.a.includes(vb) && r.b.includes(va))) {
        if (r.key === 'portocaval' && (va === 'PV' || vb === 'PV') && (va === 'IVC' || vb === 'IVC')) return r;
        if (r.key === 'tips' && ((va === 'PV' || vb === 'PV') && (va === 'IVC' || vb === 'IVC'))) continue;
        return r;
      }
    }
    return null;
  }
  // Any portal vessel to any systemic vein: when no named shunt fits, connect the nearest portal
  // endpoint of one vessel to the nearest systemic endpoint of the other.
  function customRule(a, b, ax, ay, bx, by) {
    const t = easeInOut(morph);
    const ends = (id, set, x, y) => [E[id].e.from, E[id].e.to].filter((n) => set.includes(n))
      .sort((m, n) => Math.hypot(nodePos(m, t)[0] - x, nodePos(m, t)[1] - y) - Math.hypot(nodePos(n, t)[0] - x, nodePos(n, t)[1] - y))[0];
    for (const [pe, px, py, se, sx, sy] of [[a, ax, ay, b, bx, by], [b, bx, by, a, ax, ay]]) {
      const pn = ends(pe, SHUNT_PORTAL, px, py), sn = ends(se, SHUNT_SYSTEMIC, sx, sy);
      if (!pn || !sn) continue;
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
      const r = stentRule(src, x.e.id) || customRule(src, x.e.id, wx, wy, tx, ty);
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
    if (r.key === 'tips') updateParams({ tips: { on: true, d: store.get().params.tips.d || 10 } }, { label: 'TIPS' });
    else if (r.key === 'custom') updateParams((p) => { p.customShunts = { ...(p.customShunts || {}), [r.id]: 10 }; return p; }, { label: r.label });
    else updateParams({ [r.key]: true }, { label: r.label });
    toast(`${r.label} created.`);
    onSelect({ type: 'edge', id: r.key === 'tips' ? 'TIPS' : r.key === 'custom' ? r.id : { portocaval: 'S_PC', dsrs: 'S_DSR', mesocaval: 'S_MC' }[r.key] });
  }

  // ── Paint brushes (Draw menu) ─────────────────────
  function handlePaintDown(tool, id, wx, wy, ev) {
    const st = store.get();
    if (tool === 'thrombus') {
      drag = { type: 'thrombus', id, t0: performance.now(), s0: st.params.thrombus[id] || 0, sign: ev.shiftKey || ev.altKey ? -1 : 1, last: id };
      tickThrombus();
    } else if (tool === 'fibrosis') {
      drag = { type: 'fibrosis', lobe: wx < LIVER_SPLIT_X ? 'R' : 'L', sign: ev.shiftKey || ev.altKey ? -1 : 1 };
      tickFibrosis();
    }
  }
  function tickThrombus() {
    if (!drag || drag.type !== 'thrombus') return;
    const id = drag.last;
    updateParams((p) => {
      const v = clamp((p.thrombus[id] || 0) + drag.sign * 0.05, 0, 1);
      if (v <= 0) delete p.thrombus[id]; else p.thrombus[id] = +v.toFixed(2);
      return p;
    }, { history: !drag.recorded, label: 'Thrombus' });
    drag.recorded = true;
    setTimeout(tickThrombus, 110);
  }
  function tickFibrosis() {
    if (!drag || drag.type !== 'fibrosis') return;
    const zone = store.get().fibrosisZone, lobe = drag.lobe;
    updateParams((p) => {
      const cur = p.fibrosis[lobe][zone] || 1;
      p.fibrosis[lobe][zone] = +clamp(cur * (drag.sign > 0 ? 1.12 : 1 / 1.12), 1, 80).toFixed(2);
      return p;
    }, { history: !drag.recorded, label: 'Fibrosis' });
    drag.recorded = true;
    setTimeout(tickFibrosis, 120);
  }
  const liverShape = organEls.liver;
  function insideLiver(x, y) { return ptIn(liverShape, x, y); }
  const insideVarix = (x, y) => x > 776 && x < 826 && y > 170 && y < 292;
  function handlePaintMove(ev) {
    if (!drag) return;
    const [wx] = clientToWorld(ev.clientX, ev.clientY);
    if (drag.type === 'thrombus') {
      const id = edgeFromEvent(ev);
      if (id && EI[id] != null && !E[id].isArt) drag.last = id;
    } else if (drag.type === 'fibrosis') drag.lobe = wx < LIVER_SPLIT_X ? 'R' : 'L';
  }

  // ── Anchors for the action card ───────────────────
  const ORGAN_ANCHOR = { liver: [470, 360], heart: [660, 118], spleen: [1052, 362], varices: SITES.varix, gastric: SITES.fundus, abdomen: [720, 770] };
  function anchorFor(sel) {
    if (!sel) return null;
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
      morphTarget = target;
      syncSemantic();
      const d = defaultVT(target === 1);
      if (d.k !== vt.k || d.x !== vt.x || d.y !== vt.y) animateVT(d, 600);
    },
    relayout() { refreshCTM(); if (F) updateLabels(F); },
    labelLayer: () => labelSvg,
    flowSVG,
    /** Direction of the first flow mark on a vessel (for tests): unit vector and flow sign. */
    flowDir(id) {
      let r = null;
      eachVesselMarks((x, ink, marks) => { if (x.e.id === id && !r) r = { ux: marks[0].ux, uy: marks[0].uy, q: flowState(x).q }; });
      return r;
    },
    svg,
    worldToLocal: (x, y) => { refreshCTM(); return worldToLocal(x, y); },
    anchorPos(anchor) {
      const t = easeInOut(morph);
      if (NODE_POS[anchor]) return nodePos(anchor, t);
      if (geo[anchor]) return pointAt(geo[anchor].cur, 0.5);
      return null;
    },
    zoomIn: () => { const r = wrap.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25); },
    zoomOut: () => { const r = wrap.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 0.8); },
    fit,
    zoomToBox,
    zoomLobule, zoomLiver, lobuleOpen: () => !!lz?.isOpen(),
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
    isVisible: (id) => E[id]?.vis,
  };
}
