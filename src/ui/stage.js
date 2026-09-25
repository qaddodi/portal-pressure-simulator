// Anatomical stage (blueprint §6): SVG anatomy + canvas flow layer + screen-space labels.

import { EDGES, NODES, PORTAL_TERRITORY, COLLATERAL_DMIN_RATIO } from '../engine/topology.js?v=0c370bc4ec';
import { VIEW, VB_ANAT, VB_CIRC, ATLAS_COLUMNS, HIDDEN_EDGES, HIDDEN_NODES, CONTEXT_EDGES, BACK_EDGES, NEEDS_C3, NODE_POS, EDGE_PATH, CIRCUIT_PATH, metroPath, ORGANS, BACKDROP, LIVER_MODULE, LIVER_INNER, LIVER_EDGES, MAIN_ROUTE, LANE_CAPTIONS, ABDOMEN_CLIP, ABDOMEN_FLOOR, SPLEEN_CENTER, SITES, ORGAN_LABELS, ATLAS_LABELS, EDGE_VESSEL, SHORT, CHIP_NODES, LIVER_SPLIT_X, CIRCUIT_ZONES, CIRCUIT_LABELS } from './anatomy.js?v=6aa967ed96';
import { pressureColor, deltaColor, dropColor, flowColor, velocityColor, heatColor } from './colormap.js?v=fa78a29bc0';
import { store, updateParams } from './store.js?v=384ec84b1e';
import { s, fmt, fp, clamp, lerp, toast } from './util.js?v=61d6f9c200';

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
  const canvas = wrap.querySelector('#particles');
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
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, b[0] - a[0], b[1] - a[1]];
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
    <pattern id="nodules" width="13" height="11.3" patternUnits="userSpaceOnUse">
      <g class="nodule"><circle cx="3.25" cy="2.8" r="3.1"/><circle cx="9.75" cy="2.8" r="3.1"/><circle cx="0" cy="8.5" r="3.1"/><circle cx="6.5" cy="8.5" r="3.1"/><circle cx="13" cy="8.5" r="3.1"/></g>
    </pattern>
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
  // Each organ: a filled body, a soft shade just inside its edge (so it reads as a solid form
  // rather than a flat blob), then a crisp outline. Tubes (colon, duodenum, diaphragm) are stroked.
  const TEXTURE = { liver: 'texLiver', spleen: 'texFine', stomach: 'texRugae', pancreas: 'texLobules', heart: 'texMuscle', 'kidney-l': 'texFine' };
  const organEls = {}, organG = {};
  for (const o of ORGANS) {
    const g = s('g', { class: 'organ organ-' + o.id });
    let el;
    if (o.circle) { const [cx, cy, r] = o.circle; el = s('circle', { cx, cy, r, class: o.cls }); g.append(el); }
    else if (o.band) {
      el = s('path', { d: o.d, class: o.cls + ' band-body' });
      g.append(s('path', { d: o.d, class: 'band-cast', transform: 'translate(4 6)' }), s('path', { d: o.d, class: o.cls + ' band-edge' }), el, s('path', { d: o.d, class: o.cls + ' band-sheen', transform: 'translate(-2 -3.5)' }));
      if (o.cls === 'org-colon') g.append(s('path', { d: haustra(o.d, 11.5), class: 'org-haustra' }));
    } else if (o.deco) { el = s('path', { d: o.d, class: o.cls }); if (o.id === 'heart-out') el.setAttribute('marker-end', 'url(#heartArrow)'); g.append(el); }
    else {
      // Cast shadow on the plane behind (soft light from the upper left), the body, a tissue
      // texture, the form shading (lit upper left, turning away lower right), the soft inner
      // rim, then the outline.
      el = s('path', { d: o.d, class: o.cls + ' org-fill' });
      defs.insertAdjacentHTML('beforeend', `<clipPath id="clip-${o.id}"><path d="${o.d}"/></clipPath>`);
      g.append(s('path', { d: o.d, class: 'org-cast', filter: 'url(#castShadow)', transform: 'translate(7 10)' }), el);
      if (TEXTURE[o.id]) g.append(s('path', { d: o.d, class: 'org-tex', fill: `url(#${TEXTURE[o.id]})` }));
      g.append(s('path', { d: o.d, class: 'org-form', fill: 'url(#orgForm)' }),
        s('path', { d: o.d, class: 'org-rim', 'clip-path': `url(#clip-${o.id})`, filter: 'url(#orgSoft)' }), s('path', { d: o.d, class: o.cls + ' org-line' }));
    }
    organEls[o.id] = el; organG[o.id] = g;
    gOrgans.append(g);
  }
  // Parenchyma tinted by sinusoidal pressure, right lobe → left lobe.
  defs.insertAdjacentHTML('beforeend', '<linearGradient id="gSinus" x1="340" y1="0" x2="780" y2="0" gradientUnits="userSpaceOnUse"><stop offset=".35"/><stop offset=".72"/></linearGradient>');
  const sinusStops = defs.querySelectorAll('#gSinus stop');
  const liverTint = s('path', { d: ORGANS.find((o) => o.id === 'liver').d, fill: 'url(#gSinus)', class: 'liver-tint' });
  const liverNodules = s('path', { d: ORGANS.find((o) => o.id === 'liver').d, fill: 'url(#nodules)', opacity: 0 });
  organG.liver.insertBefore(liverTint, organG.liver.querySelector('.org-rim'));
  organG.liver.insertBefore(liverNodules, organG.liver.querySelector('.org-rim'));
  const ascitesPath = s('path', { class: 'ascites-fill', d: '' });
  const ascitesLine = s('path', { class: 'ascites-line', d: '' });
  gAscites.append(ascitesPath, ascitesLine);

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
    if (isArt) { g.append(halo, sel, wall, sheen, hit); gArt.append(g); }
    else {
      if (spine) gc.append(spine);
      gs.append(shadow);
      gc.append(halo, sel, wall, wallP);
      g.append(lumen, lumenP, shade, sheen, hit);
      gShadowL.append(gs); gCaseL.append(gc); gEdges.append(g);
    }
    const heat = isArt ? null : s('path', { class: 'v-heat' });
    if (heat) gHeat.append(heat);
    E[e.id] = { e, g, gc, gs, groups: isArt ? [g] : [gs, gc, g], heat, grad, st0, st1, halo, sel, shadow, spine, wall, lumen, shade, sheen, wallP, lumenP, hit, isArt, vis: true, width: 4, wallPx: 1, shadeKey: '' };
  }
  // Draw order within each tier: the portal tree in front (it lies anterior to the IVC).
  for (const x of Object.values(E)) if (!x.isArt && (x.e.kind === 'vein' && PORTAL_TERRITORY.has(x.e.to) && PORTAL_TERRITORY.has(x.e.from || '') || ['PV_TRUNK', 'PVH_R', 'PVH_L', 'SMV_CONF', 'SV_CONF'].includes(x.e.id))) { gShadowL.append(x.gs); gCaseL.append(x.gc); gEdges.append(x.g); }
  for (const id of BACK_EDGES) if (E[id]) {
    const x = E[id];
    if (x.isArt) gBackL.append(x.g); else { gBackS.append(x.gs); gBackC.append(x.gc); gBackL.append(x.g); }
    x.back = true;
    x.g.id = 'vg-' + id;
    const u = s('use', { href: '#vg-' + id, class: 'ghost' });
    gGhost.append(u);
  }

  const cls = (x, c, on) => { for (const g of x.groups) g.classList.toggle(c, on); };
  const setStyle = (x, k, v) => { for (const g of x.groups) g.style[k] = v; };

  // Nodes (circuit view)
  const nodeEls = {};
  for (const n of NODES) {
    if (n.kind === 'wedge' || HIDDEN_NODES.has(n.id)) continue;
    const c = s('circle', { r: n.kind === 'heart' ? 7 : n.kind === 'bed' ? 5.5 : 4.5, class: 'node-dot circuit-only' });
    gNodes.append(c);
    nodeEls[n.id] = { c };
  }
  // Resistor glyphs on liver segments (circuit)
  const resistorEls = {};
  for (const id of ['PRE_R', 'PRE_L', 'SIN_RR', 'SIN_LL', 'POST_R_RHV', 'POST_L_LHV']) {
    const r = s('rect', { class: 'resistor circuit-only', rx: 2 });
    gNodes.append(r);
    resistorEls[id] = { r, txt: '' };
  }

  // Overlays
  const ov = {
    clamps: s('g'), thrombi: s('g'), stents: s('g'), plugs: s('g'), varices: s('g'), gvarices: s('g'), caput: s('g'),
    balloons: s('g'), catheter: s('g'), bands: s('g'),
  };
  Object.values(ov).forEach((g) => gOver.append(g));

  // ── View transform (pan / zoom) ───────────────────
  let vt = { k: 1, x: 0, y: 0 };
  let morph = store.get().view === 'circuit' ? 1 : 0, morphTarget = morph, lastMorph = -1;
  const applyVT = () => world.setAttribute('transform', `translate(${vt.x} ${vt.y}) scale(${vt.k})`);
  applyVT();
  let CTM = null, wrapRect = null;
  function refreshCTM() { CTM = world.getScreenCTM(); wrapRect = wrap.getBoundingClientRect(); }
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
    const [vx, vy] = clientToVB(cx, cy);
    const wx = (vx - vt.x) / vt.k, wy = (vy - vt.y) / vt.k;
    vt.k = clamp(vt.k * factor, 0.6, 6);
    vt.x = vx - wx * vt.k; vt.y = vy - wy * vt.k;
    applyVT(); CTM = null;
  }
  function zoomToBox(x0, y0, x1, y1) {
    const k = clamp(Math.min(VIEW.w / (x1 - x0), VIEW.h / (y1 - y0)) * 0.9, 1, 5);
    vt = { k, x: VIEW.w / 2 - ((x0 + x1) / 2) * k, y: VIEW.h / 2 - ((y0 + y1) / 2) * k };
    world.style.transition = 'transform .4s var(--ease)';
    applyVT(); CTM = null;
    setTimeout(() => { world.style.transition = ''; CTM = null; }, 420);
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
  const fit = () => { vt = defaultVT(morphTarget === 1); applyVT(); CTM = null; };

  // ── Particles ─────────────────────────────────────
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  function resizeCanvas() {
    const r = wrap.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
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
    if (NEEDS_C3.has(e.id)) return recruitFrac('C3', f) > 0.2;
    if (e.kind === 'collateral') {
      if (e.spontaneous && !p.spontaneous[e.id]) return false;
      return store.get().layers.collaterals || recruitFrac(e.id, f) > 0.12;
    }
    if (e.kind === 'shunt') {
      if (e.shunt === 'ap') return f.Q[EI[e.id]] > 0.3;
      return f.D[EI[e.id]] > 0;
    }
    return true;
  }
  function recruitFrac(id, f) {
    const e = EDGES[EI[id]];
    const dMin = e.dMax * COLLATERAL_DMIN_RATIO;
    return clamp((f.slow.d[id] - dMin) / (e.dMax - dMin), 0, 1);
  }

  function updateGeometry(force) {
    const t = easeInOut(morph);
    if (!force && t === lastMorph) return;
    lastMorph = t;
    for (const x of Object.values(E)) {
      const g = geo[x.e.id];
      let pts;
      if (t === 0) pts = g.A; else if (t === 1) pts = g.C; else pts = g.A.map((p, i) => [lerp(p[0], g.C[i][0], t), lerp(p[1], g.C[i][1], t)]);
      if (x.e.kind === 'collateral' && t < 1) pts = wiggle(pts, g.wig * (1 - t), x.e.id.length);
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
    for (const [id, r] of Object.entries(resistorEls)) {
      const [x, y] = pointAt(geo[id].cur, 0.5);
      r.r.setAttribute('x', x - 12); r.r.setAttribute('y', y - 5); r.r.setAttribute('width', 24); r.r.setAttribute('height', 10);
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
  function update(f) {
    F = f;
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
      const P1 = f.P[NI[e.from]], P2 = f.P[NI[e.to]];
      // Anatomy: width follows diameter (compressed). Circuit: a narrower, more uniform range,
      // as on a transit map, so the lines stay even and legible.
      const wA = e.kind === 'liver' ? (e.zone === 'sin' || e.zone === 'inter' ? 3.2 : 4.4) : vesselPx(D) * (e.id === 'IVC_IS' || e.id === 'IVCS_RA' || e.id === 'SVC_RA' ? 0.72 : 1);
      const wC = e.kind === 'liver' ? 5.5 : clamp(vesselPx(D) * 0.62, 4, 10);
      let w = lerp(wA, wC, t);
      // Flow layer: width follows flow volume (∝ √Q), like traffic volume on a city map.
      if (mode === 'flow' && !x.isArt) w = clamp(2.2 + 8.5 * Math.sqrt(Math.abs(f.Qf ? f.Qf[k] : f.Q[k]) * 0.06), 2.2, 22);
      if (x.isArt) w = lerp(Math.max(1.8, vesselPx(D) * 0.5), 3, t);
      x.width = w;
      if (x.isArt) { x.wall.setAttribute('stroke-width', w.toFixed(1)); continue; }
      x.pmid = (P1 + P2) / 2;
      const baseD = e.d || (e.dMax ? e.dMax * COLLATERAL_DMIN_RATIO : 3);
      const wallPx = e.kind === 'liver' ? 0.7 : clamp(0.9 * Math.sqrt(baseD / Math.max(0.3, D)), 0.8, 1.6);
      x.wallPx = wallPx;
      x.wall.setAttribute('stroke-width', (w + 2 * wallPx).toFixed(1));
      x.lumen.setAttribute('stroke-width', w.toFixed(1));
      if (x.spine) x.spine.setAttribute('stroke-width', (w + 16).toFixed(1));
      let c1, c2;
      if (mode === 'pressure') { c1 = pressureColor(P1); c2 = pressureColor(P2); }
      else if (mode === 'drop') { c1 = c2 = dropColor(P1 - P2); }
      else if (mode === 'direction') { const rev = isReversed(e, f); c1 = c2 = rev ? 'var(--flow-reversed)' : 'var(--flow-normal)'; }
      else if (mode === 'flow') { c1 = c2 = flowColor(Math.abs(f.Qf ? f.Qf[k] : f.Q[k]) * 0.06); }
      else if (mode === 'velocity') { c1 = c2 = e.kind === 'liver' ? 'rgb(150,152,162)' : velocityColor(edgeVel(f, k)); }
      else if (mode === 'heat') { c1 = heatColor(ref ? P1 - ref[NI[e.from]] : 0); c2 = heatColor(ref ? P2 - ref[NI[e.to]] : 0); }
      else if (mode === 'neutral') { c1 = c2 = PORTAL_TERRITORY.has(e.from) || PORTAL_TERRITORY.has(e.to) ? 'var(--vein-portal)' : 'var(--vein-systemic)'; }
      else { c1 = deltaColor(ref ? P1 - ref[NI[e.from]] : 0); c2 = deltaColor(ref ? P2 - ref[NI[e.to]] : 0); }
      x.st0.setAttribute('stop-color', c1); x.st1.setAttribute('stop-color', c2);
      // Flow marks are white on dark lumens and ink on pale ones.
      x.inkDark = mode === 'pressure' ? luminance(pressureColor((P1 + P2) / 2)) > 0.36 : luminance(c1) > 0.36;
      if (x.heat) { x.heat.setAttribute('stroke', c1); x.heat.setAttribute('stroke-width', (w + 22).toFixed(1)); x.heat.style.opacity = mode === 'heat' && ref ? clamp((x.pmid - (ref[NI[e.from]] + ref[NI[e.to]]) / 2) / 8, 0, 1).toFixed(2) : '0'; }
      if (e.kind === 'collateral') {
        const fr = recruitFrac(e.id, f);
        cls(x, 'coll-ghost', fr < 0.12);
        setStyle(x, 'opacity', p.occluded[e.id] ? '0.45' : String(0.3 + 0.7 * Math.min(1, fr * 2.5)));
      }
      x.rev = REVERSAL_WATCH.has(e.id) && isReversed(e, f);
      if (e.id === 'SIN_RL') setStyle(x, 'opacity', String(0.35 * t));
      const selOn = st.selection?.type === 'edge' && st.selection.id === e.id;
      x.sel.classList.toggle('on', selOn);
      cls(x, 'is-sel', selOn);
      if (selOn) x.sel.setAttribute('stroke-width', (w + 12).toFixed(1));
    }
    // Junction widths: where vessels meet, the largest narrows to the second largest and the
    // others widen toward it, so calibers change smoothly through every junction.
    const jw = {};
    for (const x of Object.values(E)) {
      if (!x.vis || x.isArt || x.g.classList.contains('coll-ghost') || x.e.id === 'SIN_RL') continue;
      (jw[x.e.from] ||= []).push(x.width); (jw[x.e.to] ||= []).push(x.width);
    }
    const J = {};
    for (const [n, ws] of Object.entries(jw)) { ws.sort((a, b) => b - a); J[n] = ws[1] ?? ws[0]; }
    for (const x of Object.values(E)) if (x.vis && !x.isArt) renderTube(x, p, t, J);
    // A selected vessel stays bright while the rest of the network recedes.
    wrap.classList.toggle('has-sel', st.selection?.type === 'edge' && !!E[st.selection.id]?.vis);
    liverModule.classList.toggle('open', liverExpanded());
    trackChanges(f, p);
    updateNodesCircuit(f);
    updateOverlays(f, p, gain, t);
    updateFocus();
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
    for (const x of Object.values(E)) {
      if (!x.reveal) continue;
      const r = x.reveal;
      const u = clamp((now - r.t0) / r.dur, 0, 1);
      const done = u >= 1 || quietFx();
      const off = (1 - easeInOut(u)) * r.dir;
      for (const part of REVEAL_PARTS) {
        const el = x[part];
        if (!el) continue;
        if (done) { el.removeAttribute('pathLength'); el.style.strokeDasharray = ''; el.style.strokeDashoffset = ''; continue; }
        el.setAttribute('pathLength', '1');
        el.style.strokeDasharray = '1 1';
        el.style.strokeDashoffset = off.toFixed(4);
      }
      if (done) x.reveal = null;
    }
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
    const imaging = isImaging();
    for (const n of NODES) {
      if (!nodeEls[n.id]) continue;
      nodeEls[n.id].c.style.display = nodeVisible(n.id) ? '' : 'none';
    }
    for (const [id, r] of Object.entries(resistorEls)) {
      const k = EI[id];
      const q = f.Q[k];
      const dp = f.P[NI[EDGES[k].from]] - f.P[NI[EDGES[k].to]];
      const R = Math.abs(q) > 1e-3 ? dp / (q * 0.06) : Infinity;
      r.R = R;
      r.txt = Number.isFinite(R) ? `${R.toFixed(1)} WU` : '∞ WU';
      r.r.setAttribute('stroke-width', clamp(1 + Math.log10(Math.max(1, Math.abs(R))) * 1.5, 1, 4));
    }
  }

  function updateOrgans(f, p, t) {
    liverNodules.setAttribute('opacity', (Math.min(1, p.cirrhosis) * 0.55 * (1 - t)).toFixed(2));
    sinusStops[0].setAttribute('stop-color', pressureColor(f.P[NI.SIN_R]));
    sinusStops[1].setAttribute('stop-color', pressureColor(f.P[NI.SIN_L]));
    // The parenchyma keeps its own color at normal pressure and takes on the pressure hue as
    // sinusoidal pressure rises (sinusoidal hypertension).
    const psin = Math.max(f.P[NI.SIN_R], f.P[NI.SIN_L]);
    liverTint.style.opacity = isImaging() ? 0 : clamp((psin - 8) / 16, 0, 0.32).toFixed(3);
    organG.umbilicus.style.display = recruitFrac('C3', f) > 0.25 ? '' : 'none';
    const sc = f.slow.spleen / 11;
    organG.spleen.setAttribute('transform', `translate(${SPLEEN_CENTER[0]} ${SPLEEN_CENTER[1]}) scale(${sc.toFixed(3)}) translate(${-SPLEEN_CENTER[0]} ${-SPLEEN_CENTER[1]})`);
    // ascites
    const V = f.slow.ascites;
    const hgt = clamp(V / 11000, 0, 1) * 300;
    if (hgt < 2) { ascitesPath.setAttribute('d', ''); ascitesLine.setAttribute('d', ''); }
    else {
      const y = ABDOMEN_FLOOR - hgt, ph = (performance.now() / 900) % (Math.PI * 2);
      let line = '';
      for (let x = 300; x <= 1100; x += 20) line += `${x === 300 ? 'M' : ' L'}${x} ${(y + Math.sin(x / 46 + ph) * 2.5).toFixed(1)}`;
      ascitesLine.setAttribute('d', line);
      ascitesPath.setAttribute('d', `${line} L 1100 ${ABDOMEN_FLOOR + 5} L 300 ${ABDOMEN_FLOOR + 5} Z`);
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
    ov.stents.append(s('path', { class: 'stent-strut', d: struts }), s('path', { class: 'stent-rail', d: rails }), s('path', { class: 'stent-mark', d: marks }));
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
  function updateOverlays(f, p, gain, t) {
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
    for (const [id, v] of Object.entries(p.thrombus)) {
      if (hideDx || !(v > 0) || !E[id] || !E[id].vis) continue;
      const pts = geo[id].cur.slice(Math.floor(N_SAMPLES * 0.3), Math.ceil(N_SAMPLES * 0.72));
      ov.thrombi.append(s('path', { class: 'thrombus', d: polyD(pts), 'stroke-width': (E[id].width * clamp(v, 0.3, 1)).toFixed(1) }));
    }
    for (const id of ['TIPS', 'S_PC', 'S_DSR', 'S_MC']) {
      if (!E[id].vis || E[id].reveal) continue;
      if (id === 'TIPS') stentMesh(id); else anastomoses(id);
    }
    for (const id of Object.keys(p.occluded)) {
      if (!p.occluded[id] || !E[id] || !E[id].vis) continue;
      const [x, y] = pointAt(geo[id].cur, 0.5);
      ov.plugs.append(s('circle', { cx: x, cy: y, r: 7, fill: 'var(--surface)', stroke: 'var(--danger)', 'stroke-width': 2 }),
        s('path', { d: `M${x - 4} ${y - 4} L ${x + 4} ${y + 4} M${x + 4} ${y - 4} L ${x - 4} ${y + 4}`, stroke: 'var(--danger)', 'stroke-width': 2 }));
    }
    const m = f.metrics;

    // Esophageal varices (beads)
    ov.varices.innerHTML = ''; ov.gvarices.innerHTML = ''; ov.caput.innerHTML = ''; ov.bands.innerHTML = '';
    if (anat) {
      const vr = m.varix;
      // Esophageal varices: three serpentine columns in the lower esophagus. Width follows
      // the varix radius, tortuosity grows with size, red wale marks mark high wall tension.
      const eso = (y) => 789 + (y - 24) * 0.066;
      if (vr.d >= 2.4) {
        const col = pressureColor(f.P[NI.VAR]);
        const grow = clamp((vr.d - 2.4) / 8, 0, 1);
        const wPx = clamp(1.4 + vr.r * 1.05, 1.6, 9);
        const alpha = clamp(0.45 + grow, 0.45, 1).toFixed(2);
        [-6.5, 0, 6.5].forEach((off, ci) => {
          const pts = [];
          for (let y = 176; y <= 286; y += 5) pts.push([eso(y) + off * (0.6 + 0.5 * grow) + Math.sin(y * 0.2 + ci * 2.1) * (0.6 + 3.2 * grow), y]);
          ov.varices.append(s('path', { d: polyD(pts), fill: 'none', stroke: 'var(--vessel-casing)', 'stroke-width': (wPx + 1.6).toFixed(1), 'stroke-linecap': 'round', opacity: alpha }));
          ov.varices.append(s('path', { d: polyD(pts), fill: 'none', stroke: col, 'stroke-width': wPx.toFixed(1), 'stroke-linecap': 'round', opacity: alpha }));
          if (vr.ratio > 0.7) for (let k = 3; k < pts.length - 2; k += 4) {
            const [x, y] = pts[k];
            ov.varices.append(s('path', { class: 'redwale', d: `M${(x - wPx * 0.3).toFixed(1)} ${(y - 1.5).toFixed(1)} l ${(wPx * 0.6).toFixed(1)} 3`, opacity: clamp((vr.ratio - 0.7) / 0.3, 0.3, 1).toFixed(2) }));
          }
        });
      }
      const nb = Math.round(f.bands || 0);
      for (let i = 0; i < nb; i++) { const y = 272 - i * 16; ov.bands.append(s('ellipse', { cx: eso(y), cy: y, rx: 11, ry: 3, class: 'band-ring' })); }
      const gv = m.gastricVarix;
      if (gv.d >= 2.4) {
        const col = pressureColor(f.P[NI.GV]);
        const r = clamp(gv.r * 1.4, 2, 12);
        for (const [dx, dy] of [[-10, -6], [4, -10], [12, 2], [0, 8], [-8, 8], [10, 12]]) {
          ov.gvarices.append(s('circle', { cx: SITES.fundus[0] + dx * (0.6 + r / 12), cy: SITES.fundus[1] - 4 + dy * (0.6 + r / 12), r: (r * 0.7).toFixed(1), fill: col, 'fill-opacity': clamp((gv.d - 2.4) / 2, 0.2, 0.95), class: 'varix-bead' }));
        }
      }
      const c3 = recruitFrac('C3', f);
      if (c3 > 0.25 && E.C3.vis) {
        const col = pressureColor(f.P[NI.EPI]);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + 0.3, L = 12 + 22 * c3;
          const pts = [];
          for (let j = 0; j <= 6; j++) {
            const rr = 7 + (L * j) / 6, wob = j === 0 ? 0 : Math.sin(j * 1.3 + i) * 2 * c3;
            pts.push([SITES.umbilicus[0] + Math.cos(a) * rr - Math.sin(a) * wob, SITES.umbilicus[1] + Math.sin(a) * rr + Math.cos(a) * wob]);
          }
          ov.caput.append(s('path', { d: polyD(pts), fill: 'none', stroke: 'var(--vessel-casing)', 'stroke-width': (2.4 + 1.8 * c3).toFixed(2), 'stroke-linecap': 'round' }), s('path', { d: polyD(pts), fill: 'none', stroke: col, 'stroke-width': (1.2 + 1.4 * c3).toFixed(2), 'stroke-linecap': 'round' }));
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
    if (w == null) { measure.font = `${weight} ${size}px ${FONT}`; w = measure.measureText(t).width + track * size * t.length; widths.set(k, w); }
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
    const g = s('g', { class: 'lb ' + cls });
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
    const sig = JSON.stringify([it.lines, it.align, it.swatch, it.bg, it.w, it.cls]);
    if (sig !== b.sig) {
      b.sig = sig;
      const kids = [];
      if (it.bg) kids.push(s('rect', { class: 'lb-bg', x: -it.padX, y: -it.padY, width: it.w + 2 * it.padX, height: it.h + 2 * it.padY, rx: 6 }));
      let y = 0;
      const tx = it.swatch ? (it.align === 'end' ? it.w - 7 : 7) : 0;
      for (const line of it.lines) {
        const lh = LINE_H(line);
        const t = s('text', { x: it.align === 'end' ? it.w - (it.swatch ? 7 : 0) : it.align === 'middle' ? it.w / 2 : tx, y: y + lh * 0.78, 'text-anchor': it.align === 'end' ? 'end' : it.align === 'middle' ? 'middle' : 'start' });
        line.forEach((r, i) => {
          const sp = s('tspan', { class: r.cls || '', 'font-size': r.size, 'font-weight': r.weight || 500 });
          if (i) sp.setAttribute('dx', r.gap ?? 3);
          if (r.track) sp.setAttribute('letter-spacing', `${r.track}em`);
          sp.textContent = r.t;
          t.append(sp);
        });
        kids.push(t);
        y += lh;
      }
      if (it.swatch) kids.unshift(s('rect', { class: 'lb-sw', x: it.align === 'end' ? it.w - 3 : 0, y: 1, width: 3, height: Math.max(8, it.h - 2), rx: 1.5 }));
      b.g.replaceChildren(...kids);
      b.sw = it.swatch ? b.g.querySelector('.lb-sw') : null;
      if (it.label) b.g.setAttribute('aria-label', it.label);
    }
    if (b.sw) b.sw.setAttribute('fill', it.swatch);
    b.g.classList.toggle('sel', !!it.sel);
    b.g.setAttribute('transform', `translate(${it.x.toFixed(1)} ${it.y.toFixed(1)})`);
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
    return st.mode === 'compare' && st.compareSnap ? st.compareSnap.P : st.healthy?.P;
  };
  const isImaging = () => !!store.get().imaging;
  // The active data layer (what vessel color encodes).
  function layerMode() {
    const st = store.get();
    return isImaging() ? 'neutral' : st.mode === 'compare' && st.compareSnap && st.compareView === 'D' ? 'delta' : st.colorMode;
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

  function pressureRuns(P, id, compact) {
    if (!store.get().layers.chips || isImaging()) return null;
    const [v, u] = fp(P);
    const runs = [{ t: v, size: compact ? 12.5 : 14, weight: 650, cls: 'lb-val' }, { t: u, size: compact ? 9.5 : 10, weight: 500, cls: 'lb-unit', gap: 2.5 }];
    const ref = REF()?.[NI[id]];
    if (ref != null && Math.abs(P - ref) >= 1) runs.push({ t: `${P > ref ? '▲' : '▼'} ${fmt(Math.abs(P - ref), 0)}`, size: compact ? 9.5 : 10.5, weight: 650, cls: 'lb-delta ' + (P > ref ? 'up' : 'down'), gap: 6 });
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
      if (refQ && store.get().mode !== 'compare') {
        const r = throughput(refQ, id);
        if (r > 0.02 && Math.abs(v - r) / r >= 0.1) runs.push({ t: `${v > r ? '▲' : '▼'} ${Math.round(Math.abs(v - r) / r * 100)}%`, size: compact ? 9.5 : 10.5, weight: 650, cls: 'lb-delta ' + (v > r ? 'up' : 'down'), gap: 6 });
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
    const lines = [[{ t: name, size: compact ? 10.5 : 11.5, weight: 500, cls: 'lb-name' }]];
    const lr = isImaging() ? null : layerRuns(f, id, compact);
    const pr = lr ? lr.runs : pressureRuns(P, id, compact);
    if (pr) lines.push(pr);
    const w = Math.max(...lines.map(lineW)) + (mode === 'atlas' ? 7 : 0);
    const hh = lines.reduce((a, l) => a + LINE_H(l), 0);
    const sel = st.selection?.type === 'node' && st.selection.id === id;
    return { key: 'n:' + id, node: id, cls: 'node ' + mode, lines, w, h: hh, sel, label: `${NODES[NI[id]].label}${lr ? `: ${lr.runs.map((r) => r.t).join(' ')}` : pr ? `: ${fmt(P, 1)} millimeters of mercury` : ''}`,
      swatch: mode === 'atlas' && pr ? (lr ? lr.color : layerMode() === 'heat' ? heatColor(P - (REF()?.[NI[id]] ?? P)) : pressureColor(P)) : null, bg: mode === 'inline', padX: mode === 'inline' ? 6 : 3, padY: mode === 'inline' ? 3 : 2 };
  }

  const ANAT_PRI = { CONF: 10, VAR: 9, SIN_R: 9, RHV: 8, RA: 8, SV: 7, SMV: 7, GV: 7, IVCS: 6, W_R: 12, W_M: 12, W_L: 12 };

  function updateLabels(f) {
    refreshCTM();
    frameNo++;
    const st = store.get();
    const t = easeInOut(morph);
    const circuit = t >= 0.5;
    const W = wrap.clientWidth, H = wrap.clientHeight;
    const B = { x0: 6, y0: 6, x1: W - 6, y1: H - 6 };
    const compact = W < 700;
    const wr = wrap.getBoundingClientRect();
    // Floating panels over the figure (notifications, hint cards, banners) are obstacles.
    const blockers = [...document.querySelectorAll('.stage-blocker:not([hidden])')].map((el) => {
      const r = el.getBoundingClientRect();
      return r.width ? { x0: r.left - wr.left - 4, y0: r.top - wr.top - 4, x1: r.right - wr.left + 4, y1: r.bottom - wr.top + 4 } : null;
    }).filter(Boolean);
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
    const CELL = 10, lines = new Map();
    const lineCost = (r) => {
      let c = 0;
      for (let gx = Math.floor(r.x0 / CELL); gx <= Math.floor(r.x1 / CELL); gx++) for (let gy = Math.floor(r.y0 / CELL); gy <= Math.floor(r.y1 / CELL); gy++) c += lines.get(gx * 4096 + gy) || 0;
      return c;
    };
    let useLines = false;
    const buildLines = () => {
      useLines = true;
      for (const x of Object.values(E)) {
        if (!x.vis) continue;
        const pts = geo[x.e.id].cur;
        for (let i = 0; i < pts.length; i += 2) {
          const [sx, sy] = worldToLocal(pts[i][0], pts[i][1]);
          const k = Math.floor(sx / CELL) * 4096 + Math.floor(sy / CELL);
          lines.set(k, (lines.get(k) || 0) + 1);
        }
      }
    };
    // Among the candidate positions that collide with nothing already placed, take the one that
    // covers the least vessel geometry (ties go to the earlier, preferred direction).
    const place = (it, dirs, gap, leader) => {
      let best = null;
      dirs.forEach((dir, i) => {
        const [dx, dy] = offset(dir, it, gap);
        const x = it.ax + dx, y = it.ay + dy;
        const r = rectOf({ ...it, x, y });
        if (!within(r, B) || placed.some((p) => hits(r, p))) return;
        const cost = (useLines ? lineCost(r) * 4 : 0) + i;
        if (!best || cost < best.cost) best = { cost, x, y, r, dir };
      });
      if (!best) return false;
      it.x = best.x; it.y = best.y; it.dir = best.dir; it.leader = leader;
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
        const par = (a, b) => { const ra = resistorEls[a].R, rb = resistorEls[b].R; return Number.isFinite(ra) && Number.isFinite(rb) ? (ra * rb) / (ra + rb) : Number.isFinite(ra) ? ra : rb; };
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
        if (!place(it, dirs, 7, false) && it.sel) place(it, dirs, 22, true);
      }
      // Collateral and shunt lanes, captioned along their run.
      for (const [id, cap] of Object.entries(LANE_CAPTIONS)) {
        const x = E[id];
        if (!x?.vis || x.g.classList.contains('coll-ghost')) continue;
        const [lx, ly] = pointAt(geo[id].cur, laneU[id]);
        const [ax, ay] = worldToLocal(lx, ly);
        const it = { key: 'lane:' + id, cls: 'lane', lines: [[{ t: cap, size: compact ? 9 : 10, weight: 550, cls: 'lb-lane' }]], align: 'middle', padX: 2, padY: 1, ax, ay };
        it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]);
        place(it, ['N', 'S'], 3 + (x.width || 4) / 2, false);
      }
      if (open && !isImaging() && st.layers.chips) {
        for (const [id, r] of Object.entries(resistorEls)) {
          const [x, y] = pointAt(geo[id].cur, 0.5);
          const [ax, ay] = worldToLocal(x, y);
          const it = { key: 'r:' + id, cls: 'res', lines: [[{ t: r.txt, size: compact ? 9 : 10, weight: 600, cls: 'lb-res' }]], align: 'middle', padX: 2, padY: 1, ax, ay: ay + 4 };
          it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]);
          place(it, ['S', 'N'], 6, false);
        }
      }
    }
    // Selected vessel: name it on the figure, next to the vessel.
    const selE = st.selection?.type === 'edge' ? st.selection.id : null;
    if (selE && E[selE]?.vis) {
      const [x, y] = pointAt(geo[selE].cur, 0.5);
      const [ax, ay] = worldToLocal(x, y);
      const it = { key: 'selE', cls: 'selE', lines: [[{ t: E[selE].e.label || selE, size: compact ? 11 : 12, weight: 650, cls: 'lb-selname' }]], align: 'start', bg: true, padX: 7, padY: 3, ax, ay };
      it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]);
      if (place(it, ['E', 'W', 'NE', 'SE', 'NW', 'SW', 'N', 'S'], 10 + (E[selE].width || 4) / 2, true) || place(it, ['E', 'W', 'NE', 'SE', 'NW', 'SW'], 34, true)) {
        const r = rectOf(it);
        leaders += `<path class="leader hl" d="M${ax.toFixed(1)} ${ay.toFixed(1)} L${clamp(ax, r.x0, r.x1).toFixed(1)} ${clamp(ay, r.y0, r.y1).toFixed(1)}"/>`;
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
  // Blood flow is drawn as evenly spaced chevrons inside each lumen, pointing and moving
  // downstream. Their speed follows mean velocity (log-compressed), so fast and slow vessels are
  // told apart at a glance; a vessel without flow carries none; reversed flow simply runs the
  // other way. Paused, or with reduced motion, the chevrons hold still and keep their direction.
  const phase = {};
  function flowState(x) {
    const e = x.e, k = EI[e.id];
    // Mean (filtered) flow, so beat-to-beat or respiratory to-and-fro doesn't flip the chevrons.
    const q = F.Qf ? F.Qf[k] : F.Q[k];
    const D = Math.max(0.5, F.D[k]) / 10;
    const vel = e.kind === 'liver' ? q * 0.6 : q / (Math.PI * D * D / 4);
    return { q, vel };
  }
  const markSpacing = (w) => (w >= 4.6 ? clamp(w * 2.7, 14, 34) : 44);
  // Chevron drift speed (world units/s). Capped well below one spacing per second's worth of
  // frames: a mark that moves close to its own spacing between frames reads as flicker (the
  // wagon-wheel effect) and its direction is lost. Fast vessels still read as faster, but
  // the difference saturates instead of strobing.
  function markSpeed(x, vel, simSpeed) {
    const v = (3 + 16 * Math.log1p(Math.abs(vel) / 1.5)) * simSpeed;
    return Math.min(v, markSpacing(x.width) * 1.1);
  }
  // Calls cb(x, ink, marks[]) per vessel; each mark is { cx, cy, ux, uy, h, len, lw, dash }.
  function eachVesselMarks(cb) {
    const st = store.get();
    if (!F || st.imaging || st.layers.flow === false) return;
    for (const x of Object.values(E)) {
      if (!x.vis || x.reveal || x.g.classList.contains('coll-ghost') || (x.e.id === 'SIN_RL' && morph < 0.5)) continue;
      const { q, vel } = flowState(x);
      // Near-stagnant flow fades out rather than popping in and out.
      const fade = clamp((Math.abs(vel) - 0.1) / 0.5, 0, 1);
      if (fade <= 0 || Math.abs(q) < 0.02) continue;
      const g = geo[x.e.id];
      const L = g.len;
      const w = x.width;
      const chevron = w >= 4.6;
      const sp = markSpacing(w);
      const m = Math.min(L * 0.12, w * 0.5 + 2);
      if (L - 2 * m < 4) continue;
      const sg = q >= 0 ? 1 : -1;
      const ph = ((((phase[x.e.id] || 0) % 1) + 1) % 1) * sp;
      const h = chevron ? w * 0.6 : 5.4, len = chevron ? w * 0.34 : 5.2;
      const lw = chevron ? clamp(w * 0.15, 1, 2.3) : 1.4;
      const marks = [];
      // Marks are spaced evenly in transit time, not distance: where the lumen narrows (a taper
      // or a stenosis) the same flow crosses a smaller area and speeds up (v ∝ 1/A), so the marks
      // spread out and shrink with the lumen.
      const r0 = w / 2, rOf = x.rOf && !x.g.classList.contains('stroked') ? x.rOf : () => r0;
      const n = N_SAMPLES - 1, tau = [0];
      for (let i = 1; i <= n; i++) tau.push(tau[i - 1] + (L / n) * Math.max(0.05, (rOf((i - 0.5) / n) / r0) ** 2));
      const T = tau[n];
      let j = 1;
      for (let tt = m + ph; tt < T - m; tt += sp) {
        while (j < n && tau[j] < tt) j++;
        const uu = (j - 1 + (tt - tau[j - 1]) / Math.max(1e-6, tau[j] - tau[j - 1])) / n;
        const [px, py, dx, dy] = pointAt(g.cur, uu);
        const nn = Math.hypot(dx, dy) || 1, k = clamp(rOf(uu) / r0, 0.3, 1.5);
        marks.push({ cx: px, cy: py, ux: (dx / nn) * sg, uy: (dy / nn) * sg, h: chevron ? h * k : h, len: chevron ? len * Math.max(0.5, k) : len, lw: chevron ? lw * Math.max(0.6, Math.min(1.2, k)) : lw, tri: !chevron });
      }
      if (marks.length) cb(x, marks[0].tri ? (x.rev ? 'triRev' : 'tri') : x.rev ? 'rev' : x.inkDark && !x.isArt ? 'dark' : 'light', marks, fade);
    }
  }
  // Reversed (hepatofugal) flow keeps its own steady ink, so it reads as a state, not an event.
  const INK = { light: 'rgba(255, 255, 255, 0.92)', dark: 'rgba(28, 30, 48, 0.62)', tri: 'rgba(34, 28, 46, 0.86)', rev: 'rgba(255, 170, 70, 1)', triRev: 'rgba(214, 102, 20, 1)' };
  const TRI_HALO = 'rgba(255, 255, 255, 0.9)';
  function markPath(k) {
    if (k.tri) {
      const bx = k.cx - k.ux * k.len / 2, by = k.cy - k.uy * k.len / 2;
      return [[k.cx + k.ux * k.len / 2, k.cy + k.uy * k.len / 2], [bx - k.uy * k.h / 2, by + k.ux * k.h / 2], [bx + k.uy * k.h / 2, by - k.ux * k.h / 2]];
    }
    const bx = k.cx - k.ux * k.len / 2, by = k.cy - k.uy * k.len / 2;
    return [[bx - k.uy * k.h / 2, by + k.ux * k.h / 2], [k.cx + k.ux * k.len / 2, k.cy + k.uy * k.len / 2], [bx + k.uy * k.h / 2, by - k.ux * k.h / 2]];
  }
  /** Static flow marks as SVG (world coordinates), for exported figures. */
  function flowSVG() {
    let out = '';
    eachVesselMarks((x, ink, marks, fade) => {
      const op = fade < 1 ? ` opacity="${fade.toFixed(2)}"` : '';
      const d = marks.map((k) => 'M' + markPath(k).map(([a, b]) => `${a.toFixed(1)} ${b.toFixed(1)}`).join(' L') + (k.tri ? ' Z' : '')).join(' ');
      out += ink === 'tri' || ink === 'triRev'
        ? `<path d="${d}" fill="${INK[ink]}" stroke="${TRI_HALO}" stroke-width="1.6" stroke-linejoin="round" paint-order="stroke"${op}/>`
        : `<path d="${d}" fill="none" stroke="${INK[ink]}" stroke-width="${marks[0].lw.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"${op}/>`;
    });
    return `<g>${out}</g>`;
  }

  // The chevron layer is redrawn at most ~30×/s (plenty for a slow drift, half the GPU work of
  // 60), and not at all while paused and nothing changed.
  let lastT = performance.now(), lastDrawKey = null, lastDrawF = null, lastDrawCTM = null;
  function animate(now) {
    if (now - lastT < 30) { requestAnimationFrame(animate); return; }
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
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
    lastDrawKey = key; lastDrawF = F; lastDrawCTM = CTM;
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  function drawFlow(dt, st) {
    if (!CTM) refreshCTM();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!F) return;
    const m = CTM;
    ctx.setTransform(dpr * m.a, dpr * m.b, dpr * m.c, dpr * m.d, dpr * (m.e - wrapRect.left), dpr * (m.f - wrapRect.top));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const moving = st.running && !reduceMotion.matches;
    const simSpeed = st.clock === 'hemo' ? clamp(Math.sqrt(st.speed), 0.5, 2) : 0.8;
    const hovering = wrap.classList.contains('hovering');
    const receding = wrap.classList.contains('has-sel') && !appEl?.classList.contains('figure-mode');
    for (const x of Object.values(E)) {
      if (!x.vis || !moving) continue;
      const { vel } = flowState(x);
      phase[x.e.id] = ((phase[x.e.id] || 0) + (markSpeed(x, vel, simSpeed) / markSpacing(x.width)) * Math.sign(flowState(x).q) * dt) % 1;
    }
    eachVesselMarks((x, ink, marks, fade) => {
      ctx.globalAlpha = fade * (hovering && !x.g.classList.contains('hl') ? 0.2 : receding && !x.g.classList.contains('is-sel') ? 0.4 * Number(x.g.style.opacity || 1) : Number(x.g.style.opacity || 1));
      ctx.beginPath();
      for (const k of marks) {
        const pts = markPath(k);
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        if (k.tri) ctx.closePath();
      }
      if (ink === 'tri' || ink === 'triRev') {
        ctx.strokeStyle = TRI_HALO; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.fillStyle = INK[ink]; ctx.fill();
      } else {
        ctx.strokeStyle = INK[ink]; ctx.lineWidth = marks[0].lw; ctx.stroke();
      }
    });
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

  // ── Interaction ───────────────────────────────────
  const pointers = new Map();
  let drag = null;

  function edgeFromEvent(ev) {
    // While the pointer is captured, events retarget to the <svg>: hit-test the real point instead.
    const t = ev.target === svg && ev.clientX != null ? document.elementFromPoint(ev.clientX, ev.clientY) : ev.target;
    const el = t?.closest?.('.v-hit');
    return el ? el.getAttribute('data-id') : null;
  }
  function nearestT(id, wx, wy) {
    const pts = geo[id].cur;
    let best = 0, bd = Infinity;
    pts.forEach((p, i) => { const d = (p[0] - wx) ** 2 + (p[1] - wy) ** 2; if (d < bd) { bd = d; best = i; } });
    return best / (pts.length - 1);
  }

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
    const tool = store.get().tool;
    if (id && (tool === 'select' || tool === 'probe')) {
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
    if (id && EI[id] != null && F) onHoverInfo({ id, x: ev.clientX - wrap.getBoundingClientRect().left, y: ev.clientY - wrap.getBoundingClientRect().top });
    else if (!drag) onHoverInfo(null);
  });

  svg.addEventListener('wheel', (ev) => { ev.preventDefault(); zoomAt(ev.clientX, ev.clientY, Math.exp(-ev.deltaY * 0.0015)); }, { passive: false });

  svg.addEventListener('pointerdown', (ev) => {
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; drag = { type: 'pinchzoom', d0: Math.hypot(a[0] - b[0], a[1] - b[1]), k0: vt.k }; return; }
    const tool = store.get().tool;
    const id = edgeFromEvent(ev);
    const [wx, wy] = clientToWorld(ev.clientX, ev.clientY);
    svg.setPointerCapture(ev.pointerId);
    if (ev.button === 1 || (!id && (tool === 'select' || tool === 'probe' || tool === 'doppler')) || spaceDown) {
      drag = { type: 'pan', x: ev.clientX, y: ev.clientY, vx: vt.x, vy: vt.y, moved: false, id };
      wrap.classList.add('panning');
      return;
    }
    handleToolDown(tool, id, wx, wy, ev);
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
      vt.x = drag.vx + (ev.clientX - drag.x) / s0; vt.y = drag.vy + (ev.clientY - drag.y) / s0;
      if (Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) > 4) drag.moved = true;
      applyVT(); CTM = null;
      return;
    }
    handleToolMove(ev);
  });
  const endPointer = (ev) => {
    pointers.delete(ev.pointerId);
    if (!drag) return;
    if (drag.type === 'pan') {
      wrap.classList.remove('panning');
      if (!drag.moved) {
        const tool = store.get().tool;
        if (drag.id) handleToolDown(tool, drag.id, 0, 0, ev, true);
        else onSelect(null);
      }
      drag = null;
      return;
    }
    handleToolUp(ev);
    drag = null;
  };
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

  let spaceDown = false;
  addEventListener('keydown', (e) => { if (e.code === 'Space' && e.target === document.body) spaceDown = true; });
  addEventListener('keyup', (e) => { if (e.code === 'Space') spaceDown = false; });

  // Keyboard navigation along the flow
  svg.addEventListener('keydown', (ev) => {
    const id = ev.target.getAttribute?.('data-id');
    if (!id) return;
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); handleToolDown(store.get().tool, id, 0, 0, ev, true); }
    if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && F && EI[id] != null) {
      ev.preventDefault();
      const e = EDGES[EI[id]];
      const q = F.Q[EI[id]];
      const node = (ev.key === 'ArrowRight') === (q >= 0) ? e.to : e.from;
      const next = EDGES.find((x) => x.id !== id && E[x.id]?.vis && (x.from === node || x.to === node) && x.kind !== 'wedge');
      if (next) { E[next.id].hit.focus(); onSelect({ type: 'edge', id: next.id }); }
    }
    if ((ev.key === '+' || ev.key === '-') && EI[id] != null) {
      const cur = store.get().params.stenosis[id] || 0;
      const v = clamp(cur + (ev.key === '+' ? 0.1 : -0.1), 0, 1);
      updateParams((p) => { if (v <= 0) delete p.stenosis[id]; else p.stenosis[id] = +v.toFixed(2); return p; }, { label: 'Stenosis' });
    }
  });
  svg.addEventListener('focusin', (ev) => {
    const id = ev.target.getAttribute?.('data-id');
    if (id && F && EI[id] != null) {
      const e = EDGES[EI[id]], q = F.Q[EI[id]];
      ev.target.setAttribute('aria-label', `${e.label}: ${fmt(F.P[NI[e.from]], 1)} to ${fmt(F.P[NI[e.to]], 1)} millimeters of mercury, flow ${fmt(q * 0.06, 2)} liters per minute${E[id].rev ? ', reversed' : ''}.`);
    }
  });

  // ── Tools ─────────────────────────────────────────
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

  function handleToolDown(tool, id, wx, wy, ev, isClick = false) {
    const st = store.get();
    const isEdge = id && EI[id] != null;
    switch (tool) {
      case 'select': case 'probe':
        if (id) onSelect({ type: 'edge', id });
        break;
      case 'pinch':
        if (!isEdge || E[id].isArt && !['A_SMA', 'A_SPL', 'A_HEP'].includes(id)) { toast('Pinch a vein or portal vessel to create a stenosis.'); break; }
        drag = { type: 'pinch', id, x0: ev.clientX, y0: ev.clientY, s0: st.params.stenosis[id] || 0, u: isClick ? stenosisAt[id] ?? 0.5 : clamp(nearestT(id, wx, wy), 0.12, 0.88) };
        stenosisAt[id] = drag.u;
        onSelect({ type: 'edge', id }, { quiet: true });
        break;
      case 'thrombus':
        if (!isEdge || E[id].isArt) { toast('Paint thrombus onto a vein.'); break; }
        drag = { type: 'thrombus', id, t0: performance.now(), s0: st.params.thrombus[id] || 0, sign: ev.shiftKey || ev.altKey ? -1 : 1, last: id };
        tickThrombus();
        break;
      case 'fibrosis': {
        if (morph > 0.5) { toast('Switch to the anatomic view to paint the liver (or use the Lobule panel).'); break; }
        const lobe = wx < LIVER_SPLIT_X ? 'R' : 'L';
        if (!insideLiver(wx, wy)) { toast('Paint on the liver. Choose the zone (portal / sinusoidal / central) in the tool options.'); break; }
        drag = { type: 'fibrosis', lobe, sign: ev.shiftKey || ev.altKey ? -1 : 1 };
        tickFibrosis();
        break;
      }
      case 'stent':
        if (!isEdge) { toast('Drag from a portal vessel to a systemic vein to create a shunt.'); break; }
        drag = { type: 'stent', id, wx: isClick ? pointAt(geo[id].cur, 0.5)[0] : wx, wy: isClick ? pointAt(geo[id].cur, 0.5)[1] : wy };
        break;
      case 'band':
        if (id === 'C1a' || id === 'C1b' || insideVarix(wx, wy)) { onAction({ kind: 'band' }); toast('Band placed on an esophageal varix column.'); }
        else toast('Tap the esophageal varices (lower esophagus) to band them.');
        break;
      case 'occlude':
        if (isEdge && EDGES[EI[id]].kind === 'collateral') {
          const on = !st.params.occluded[id];
          updateParams((p) => { if (on) p.occluded[id] = true; else delete p.occluded[id]; return p; }, { label: on ? 'Occlude collateral' : 'Reopen collateral' });
          toast(on ? `${EDGES[EI[id]].label} occluded${id === 'C5' ? ' (BRTO)' : ''}.` : 'Collateral reopened.');
        } else toast('Tap a collateral vessel (dotted when unrecruited) to occlude it.');
        break;
      case 'balloon':
        if (insideVarix(wx, wy) || id === 'C1b' || id === 'C1a') updateParams((p) => { p.balloonEso = !p.balloonEso; return p; }, { label: 'Esophageal balloon' });
        else if (Math.hypot(wx - SITES.fundus[0], wy - SITES.fundus[1]) < 40 || id === 'C2' || id === 'C2b') updateParams((p) => { p.balloonGas = !p.balloonGas; return p; }, { label: 'Gastric balloon' });
        else toast('Tap the lower esophagus or the gastric fundus to inflate a tamponade balloon.');
        break;
      case 'catheter': {
        const vein = { RHV_IVC: 'R', POST_R_RHV: 'R', MHV_IVC: 'M', POST_R_MHV: 'M', POST_L_MHV: 'M', LHV_IVC: 'L', POST_L_LHV: 'L' }[id];
        if (!vein) { toast('Steer the catheter into a hepatic vein (right, middle or left).'); break; }
        const c = st.params.catheter;
        if (c.vein === vein) updateParams({ catheter: { vein, wedged: !c.wedged } }, { label: c.wedged ? 'Deflate balloon' : 'Wedge catheter' });
        else updateParams({ catheter: { vein, wedged: false } }, { label: 'Catheter placed' });
        onOpenTab('hvpg');
        break;
      }
      case 'doppler':
        if (isEdge) { onAction({ kind: 'probe', id }); onOpenTab('doppler'); }
        break;
      case 'endoscope':
        onOpenTab('endoscopy');
        break;
      case 'needle':
        onOpenTab('abdomen');
        onAction({ kind: 'paracentesisPrompt' });
        break;
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
  function insideLiver(x, y) {
    const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
    return liverShape.isPointInFill ? liverShape.isPointInFill(pt) : (x > 340 && x < 860 && y > 245 && y < 540);
  }
  const insideVarix = (x, y) => x > 776 && x < 826 && y > 170 && y < 292;

  function handleToolMove(ev) {
    if (!drag) return;
    const [wx, wy] = clientToWorld(ev.clientX, ev.clientY);
    gGuides.innerHTML = '';
    if (drag.type === 'pinch') {
      const [x, y, dx, dy] = pointAt(geo[drag.id].cur, drag.u);
      const n = Math.hypot(dx, dy) || 1, nx = -dy / n, ny = dx / n;
      const dist = Math.abs((wx - x) * nx + (wy - y) * ny);
      const v = clamp(drag.s0 + dist / 70, 0, 1);
      drag.v = v;
      gGuides.append(s('path', { class: 'pinch-guide', d: `M${x - nx * 60} ${y - ny * 60} L ${x + nx * 60} ${y + ny * 60}` }));
      gGuides.append(s('text', { x: x + nx * 20 + 10, y: y + ny * 20, class: 'clamp-label' }, document.createTextNode(`${Math.round(v * 100)}% stenosis`)));
      updateParams((p) => { if (v <= 0.005) delete p.stenosis[drag.id]; else p.stenosis[drag.id] = +v.toFixed(2); return p; }, { history: !drag.recorded, label: 'Stenosis' });
      drag.recorded = true;
    } else if (drag.type === 'thrombus') {
      const id = edgeFromEvent(ev);
      if (id && EI[id] != null && !E[id].isArt) drag.last = id;
    } else if (drag.type === 'fibrosis') {
      drag.lobe = wx < LIVER_SPLIT_X ? 'R' : 'L';
    } else if (drag.type === 'stent') {
      const tgt = edgeFromEvent(ev);
      const rule = tgt && tgt !== drag.id ? stentRule(drag.id, tgt) : null;
      drag.tgt = tgt; drag.rule = rule;
      gGuides.append(s('path', { class: 'stent-guide' + (tgt && !rule ? ' invalid' : ''), d: `M${drag.wx} ${drag.wy} L ${wx} ${wy}` }));
      if (tgt && E[tgt]) gGuides.append(s('path', { class: 'target-glow', d: E[tgt].wall.getAttribute('d'), 'stroke-width': E[tgt].width + 16 }));
    }
  }
  function handleToolUp() {
    gGuides.innerHTML = '';
    if (!drag) return;
    if (drag.type === 'stent') {
      if (drag.rule) {
        const r = drag.rule;
        if (r.key === 'tips') updateParams({ tips: { on: true, d: store.get().params.tips.d || 10 } }, { label: 'TIPS' });
        else updateParams({ [r.key]: true }, { label: r.label });
        toast(`${r.label} created.${r.key === 'tips' ? ' Adjust its diameter in the inspector.' : ''}`);
        onSelect({ type: 'edge', id: r.key === 'tips' ? 'TIPS' : { portocaval: 'S_PC', dsrs: 'S_DSR', mesocaval: 'S_MC' }[r.key] });
      } else if (drag.tgt && drag.tgt !== drag.id) {
        toast('Not a valid shunt: connect a portal vessel (portal, splenic or mesenteric vein) to a systemic vein (hepatic vein, IVC or left renal vein).', 'bad');
      }
    }
  }

  // ── Public API ────────────────────────────────────
  return {
    update,
    setView(v) {
      const target = v === 'circuit' ? 1 : 0;
      if (target === morphTarget) return;
      morphTarget = target;
      const d = defaultVT(target === 1);
      if (d.k !== vt.k || d.x !== vt.x || d.y !== vt.y) { world.style.transition = 'transform .6s var(--ease)'; vt = d; applyVT(); CTM = null; setTimeout(() => { world.style.transition = ''; CTM = null; }, 620); }
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
    focusEdge(id) { E[id]?.hit.focus(); },
    edgeMid: (id) => (geo[id] ? pointAt(geo[id].cur, 0.5) : null),
    isVisible: (id) => E[id]?.vis,
  };
}
