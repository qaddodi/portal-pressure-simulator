// Anatomical stage (blueprint §6): SVG anatomy + canvas particle layer + HTML overlay.

import { EDGES, NODES, PORTAL_TERRITORY, COLLATERAL_DMIN_RATIO } from '../engine/topology.js';
import { VIEW, VB_ANAT, VB_CIRC, ATLAS_COLUMNS, HIDDEN_EDGES, HIDDEN_NODES, CONTEXT_EDGES, BACK_EDGES, NEEDS_C3, NODE_POS, EDGE_PATH, CIRCUIT_PATH, metroPath, ORGANS, ABDOMEN_CLIP, ABDOMEN_FLOOR, SPLEEN_CENTER, SITES, ORGAN_LABELS, ATLAS_LABELS, EDGE_VESSEL, SHORT, CHIP_NODES, LIVER_SPLIT_X, CIRCUIT_ZONES, CIRCUIT_LABELS, ARROW_EDGES, LABEL_FLOW_EDGE } from './anatomy.js';
import { pressureColor, deltaColor, dropColor } from './colormap.js';
import { store, updateParams } from './store.js';
import { s, fmt, fp, clamp, lerp, toast } from './util.js';

const N_SAMPLES = 64;
// Displayed width grows sub-linearly with diameter so the cavae don't swamp the portal tree,
// while distension of small veins and collaterals stays visible.
const vesselPx = (D) => Math.max(1.8, 1.3 * Math.pow(Math.max(0.1, D), 0.78));
// Only the vessels that tell the portal story are drawn (see anatomy.js).
const ALL_EDGES = EDGES.filter((e) => e.kind !== 'wedge' && !HIDDEN_EDGES.has(e.id));
const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const REVERSAL_WATCH = new Set(['PV_TRUNK', 'SV_CONF', 'SMV_CONF', 'LGV_CONF', 'PVH_R', 'PVH_L', 'PRE_R', 'PRE_L', 'V_SPL', 'V_IMV', 'V_INT', 'RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'V_STO', 'IVC_IS']);
const ARROWS = new Set(ARROW_EDGES);

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function createStage({ wrap, onSelect, onAction, onOpenTab, onHoverInfo, onViewChange }) {
  const svg = wrap.querySelector('#stage');
  const canvas = wrap.querySelector('#particles');
  const overlay = wrap.querySelector('#overlay');
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
  const defaultPath = (a, b, circuit) => (circuit ? metroPath(a, b) : `M${a[0]} ${a[1]} L ${b[0]} ${b[1]}`);
  const geo = {};
  for (const e of ALL_EDGES) {
    const a = NODE_POS[e.from], b = NODE_POS[e.to];
    const dA = EDGE_PATH[e.id] || defaultPath(a[0], b[0], false);
    const dC = CIRCUIT_PATH[e.id] || defaultPath(a[1], b[1], true);
    geo[e.id] = { dA, dC, A: sample(dA), C: sample(dC), cur: null, len: 0, wig: 0 };
  }
  scratch.remove();

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
    const k = Math.max(1.5, Math.round(L / 64)) * Math.PI * 2 / L;
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
  const nodePos = (id, t) => { const [a, c] = NODE_POS[id]; return [lerp(a[0], c[0], t), lerp(a[1], c[1], t)]; };

  // ── SVG scaffolding ───────────────────────────────
  const defs = s('defs');
  const grad = (id, varName, a0, a1) => `<linearGradient id="${id}" x1="0" y1="0" x2=".55" y2="1"><stop offset="0" style="stop-color:var(${varName});stop-opacity:calc(var(--organ-a) * ${a0})"/><stop offset="1" style="stop-color:var(${varName});stop-opacity:calc(var(--organ-a) * ${a1})"/></linearGradient>`;
  defs.innerHTML = `
    ${grad('gLiver', '--organ-liver', 0.55, 1.15)}${grad('gStomach', '--organ-stomach', 0.5, 1.05)}${grad('gSpleen', '--organ-spleen', 0.6, 1.2)}
    ${grad('gKidney', '--organ-kidney', 0.5, 1.1)}${grad('gGut', '--organ-gut', 0.4, 0.9)}${grad('gHeart', '--organ-heart', 0.5, 1.1)}${grad('gPancreas', '--organ-pancreas', 0.55, 1)}
    <pattern id="nodules" width="14" height="14" patternUnits="userSpaceOnUse">
      <circle cx="3.5" cy="3.5" r="2.6" class="nodule" fill-opacity=".55"/><circle cx="10.5" cy="10" r="3.1" class="nodule" fill-opacity=".55"/><circle cx="11" cy="2.6" r="1.4" class="nodule" fill-opacity=".45"/>
    </pattern>
    <clipPath id="abdomenClip"><path d="${ABDOMEN_CLIP}"/></clipPath>`;
  svg.append(defs);
  const world = s('g', { id: 'world' });
  svg.append(world);
  const gGrid = s('g', { id: 'grid', class: 'circuit-only' });
  const gOrgans = s('g', { id: 'organs' });
  const gAscites = s('g', { id: 'ascites', 'clip-path': 'url(#abdomenClip)' });
  const gBack = s('g', { id: 'backEdges' });
  const gEdges = s('g', { id: 'edges' });
  const gOver = s('g', { id: 'overlays' });
  const gArrows = s('g', { id: 'arrows' });
  const gNodes = s('g', { id: 'nodes', class: 'circuit-only' });
  const gFocus = s('g', { id: 'focus' });
  const gGuides = s('g', { id: 'guides' });
  world.append(gGrid, gBack, gOrgans, gAscites, gFocus, gEdges, gOver, gArrows, gNodes, gGuides);

  // Circuit view: quiet bands for each pressure zone (captioned by the label layer).
  CIRCUIT_ZONES.forEach(([, x0, x1], i) => {
    gGrid.append(s('rect', { x: x0, y: 40, width: x1 - x0, height: 690, class: 'zone' + (i % 2 ? ' alt' : '') }));
  });

  const organEls = {};
  for (const o of ORGANS) {
    let el;
    if (o.ellipse) { const [cx, cy, rx, ry, rot] = o.ellipse; el = s('ellipse', { cx, cy, rx, ry, transform: `rotate(${rot} ${cx} ${cy})`, class: o.cls }); }
    else if (o.circle) { const [cx, cy, r] = o.circle; el = s('circle', { cx, cy, r, class: o.cls }); }
    else el = s('path', { d: o.d, class: o.cls });
    organEls[o.id] = el;
    gOrgans.append(el);
  }
  // Parenchyma tinted by sinusoidal pressure, right lobe → left lobe.
  defs.insertAdjacentHTML('beforeend', '<linearGradient id="gSinus" x1="340" y1="0" x2="780" y2="0" gradientUnits="userSpaceOnUse"><stop offset=".35"/><stop offset=".72"/></linearGradient>');
  const sinusStops = defs.querySelectorAll('#gSinus stop');
  const liverTint = s('path', { d: ORGANS.find((o) => o.id === 'liver').d, fill: 'url(#gSinus)', class: 'liver-tint' });
  gOrgans.insertBefore(liverTint, organEls.falciform);
  const liverNodules = s('path', { d: ORGANS.find((o) => o.id === 'liver').d, fill: 'url(#nodules)', opacity: 0 });
  gOrgans.insertBefore(liverNodules, organEls.falciform);
  const ascitesPath = s('path', { class: 'ascites-fill', d: '' });
  const ascitesLine = s('path', { class: 'ascites-line', d: '' });
  gAscites.append(ascitesPath, ascitesLine);

  // Edge groups
  const E = {};
  for (const e of ALL_EDGES) {
    const g = s('g', { class: 'vg' + (CONTEXT_EDGES.has(e.id) ? ' ctx' : ''), 'data-id': e.id });
    const grad = s('linearGradient', { id: 'gr-' + e.id, gradientUnits: 'userSpaceOnUse' });
    const st0 = s('stop', { offset: '0' }), st1 = s('stop', { offset: '1' });
    grad.append(st0, st1); defs.append(grad);
    const isArt = e.kind === 'arteriole' || e.kind === 'artery' || (e.kind === 'shunt' && e.shunt === 'ap');
    const halo = s('path', { class: 'v-halo' });
    const sel = s('path', { class: 'v-select' });
    const wall = s('path', { class: isArt ? 'v-artery' : 'v-wall' });
    const lumen = isArt ? null : s('path', { class: 'v-lumen' + (e.kind === 'liver' && (e.zone === 'sin' || e.zone === 'inter') ? ' liver-micro' : ''), stroke: `url(#gr-${e.id})` });
    const hit = s('path', { class: 'v-hit', tabindex: 0, role: 'button', 'aria-label': e.label || e.id, 'data-id': e.id });
    g.append(halo, sel, wall);
    if (lumen) g.append(lumen);
    g.append(hit);
    gEdges.append(g);
    if (e.kind === 'collateral') g.classList.add('coll');
    E[e.id] = { e, g, grad, st0, st1, halo, sel, wall, lumen, hit, isArt, vis: true, dv: 0, parts: [], width: 4 };
  }
  // draw order: arteries at the back, the portal tree in front (it lies anterior to the IVC)
  for (const x of Object.values(E)) if (x.isArt) gEdges.prepend(x.g);
  for (const x of Object.values(E)) if (x.e.kind === 'vein' && PORTAL_TERRITORY.has(x.e.to) && PORTAL_TERRITORY.has(x.e.from || '') || ['PV_TRUNK', 'PVH_R', 'PVH_L', 'SMV_CONF', 'SV_CONF'].includes(x.e.id)) gEdges.append(x.g);
  for (const id of BACK_EDGES) if (E[id]) { gBack.append(E[id].g); E[id].back = true; }

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
    balloons: s('g'), catheter: s('g'), bands: s('g'), stasis: s('g'),
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
  const velDisp = {};      // smoothed display velocity per edge (px/s)

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
      const d = t === 0 && !(x.e.kind === 'collateral' && g.wig > 0.3) ? g.dA : t === 1 ? g.dC : polyD(pts);
      x.halo.setAttribute('d', d); x.sel.setAttribute('d', d); x.wall.setAttribute('d', d); x.hit.setAttribute('d', d);
      if (x.lumen) x.lumen.setAttribute('d', d);
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
    gAscites.style.opacity = String(1 - t);
    svg.classList.toggle('circuit', t > 0.5);
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
    const mode = imaging ? 'neutral' : st.mode === 'compare' && st.compareSnap && st.compareView === 'D' ? 'delta' : st.colorMode;
    wrap.classList.toggle('imaging', imaging);

    // collateral tortuosity
    let geomDirty = false;
    for (const x of Object.values(E)) {
      if (x.e.kind !== 'collateral') continue;
      const w = recruitFrac(x.e.id, f) > 0.25 ? 2.5 + 6.5 * recruitFrac(x.e.id, f) : 0;
      if (Math.abs(w - geo[x.e.id].wig) > 0.6) { geo[x.e.id].wig = w; geomDirty = true; }
    }
    updateGeometry(geomDirty);

    for (const x of Object.values(E)) {
      const e = x.e;
      const vis = edgeVisible(x, f);
      if (vis !== x.vis) { x.g.style.display = vis ? '' : 'none'; x.vis = vis; }
      if (!vis) continue;
      const k = EI[e.id];
      const D = f.D[k];
      const P1 = f.P[NI[e.from]], P2 = f.P[NI[e.to]];
      let w = e.kind === 'liver' ? lerp(e.zone === 'sin' || e.zone === 'inter' ? 2 : 3, 4, t) : Math.max(1.8, vesselPx(D) * gain * (e.id === 'IVC_IS' || e.id === 'IVCS_RA' || e.id === 'SVC_RA' ? 0.72 : 1));
      if (x.isArt) w = Math.max(1.4, vesselPx(D) * gain * 0.62);
      x.width = w;
      if (x.isArt) { x.wall.setAttribute('stroke-width', w.toFixed(1)); continue; }
      x.pmid = (P1 + P2) / 2;
      const baseD = e.d || (e.dMax ? e.dMax * COLLATERAL_DMIN_RATIO : 3);
      const wallPx = e.kind === 'liver' ? 0.6 : clamp(1.3 * Math.sqrt(baseD / Math.max(0.3, D)), 0.55, 2.2);
      x.wall.setAttribute('stroke-width', (w + 2 * wallPx).toFixed(1));
      x.lumen.setAttribute('stroke-width', w.toFixed(1));
      let c1, c2;
      if (mode === 'pressure') { c1 = pressureColor(P1); c2 = pressureColor(P2); }
      else if (mode === 'drop') { c1 = c2 = dropColor(P1 - P2); }
      else if (mode === 'direction') { const rev = isReversed(e, f); c1 = c2 = rev ? 'var(--flow-reversed)' : 'var(--flow-normal)'; }
      else if (mode === 'neutral') { c1 = c2 = PORTAL_TERRITORY.has(e.from) || PORTAL_TERRITORY.has(e.to) ? 'var(--vein-portal)' : 'var(--vein-systemic)'; }
      else { c1 = deltaColor(ref ? P1 - ref[NI[e.from]] : 0); c2 = deltaColor(ref ? P2 - ref[NI[e.to]] : 0); }
      x.st0.setAttribute('stop-color', c1); x.st1.setAttribute('stop-color', c2);
      if (e.kind === 'collateral') {
        const fr = recruitFrac(e.id, f);
        x.g.classList.toggle('coll-ghost', fr < 0.12);
        x.g.style.opacity = p.occluded[e.id] ? '0.45' : String(0.3 + 0.7 * Math.min(1, fr * 2.5));
      }
      const rev = REVERSAL_WATCH.has(e.id) && isReversed(e, f);
      x.halo.classList.toggle('on', rev && !imaging);
      if (rev) x.halo.setAttribute('stroke-width', (w + 7).toFixed(1));
      x.rev = rev;
      const selOn = st.selection?.type === 'edge' && st.selection.id === e.id;
      x.sel.classList.toggle('on', selOn);
      if (selOn) x.sel.setAttribute('stroke-width', (w + 12).toFixed(1));
    }
    updateNodesCircuit(f);
    updateOverlays(f, p, gain, t);
    updateArrows(f, t, imaging);
    updateFocus();
    updateLabels(f);
    updateOrgans(f, p, t);
  }

  // Flow-direction arrowheads: a chevron on each major vessel, pointing downstream, so the
  // figure reads correctly when it is still (exported, printed, reduced motion).
  function updateArrows(f, t, imaging) {
    let d = '', dr = '';
    if (!imaging && store.get().layers.arrows !== false) {
      for (const id of ARROWS) {
        const x = E[id];
        if (!x || !x.vis) continue;
        const k = EI[id];
        const q = f.Qf ? f.Qf[k] : f.Q[k];
        const ref = Math.abs(store.get().healthy?.Q?.[k] ?? 1);
        if (Math.abs(q) < Math.max(0.25, 0.03 * ref)) continue;
        const g = geo[id];
        const us = g.len > 300 ? [0.3, 0.7] : [0.5];
        const sz = clamp(x.width * 0.75 + 4.5, 5.5, 11) * lerp(1, 1.15, t);
        for (const u of us) {
          const [px, py, dx, dy] = pointAt(g.cur, u);
          const n = Math.hypot(dx, dy) || 1, sg = q >= 0 ? 1 : -1;
          const ux = (dx / n) * sg, uy = (dy / n) * sg;
          const tipX = px + ux * sz * 0.45, tipY = py + uy * sz * 0.45;
          const bx = px - ux * sz * 0.45, by = py - uy * sz * 0.45;
          const seg = `M${(bx - uy * sz * 0.55).toFixed(1)} ${(by + ux * sz * 0.55).toFixed(1)} L${tipX.toFixed(1)} ${tipY.toFixed(1)} L${(bx + uy * sz * 0.55).toFixed(1)} ${(by - ux * sz * 0.55).toFixed(1)} `;
          if (x.rev) dr += seg; else d += seg;
        }
      }
    }
    if (gArrows._d !== d + '|' + dr) {
      gArrows._d = d + '|' + dr;
      gArrows.innerHTML = `<path class="arrow-halo" d="${d}${dr}"/><path class="arrow" d="${d}"/><path class="arrow rev" d="${dr}"/>`;
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
      nodeEls[n.id].c.setAttribute('fill', imaging ? (PORTAL_TERRITORY.has(n.id) ? 'var(--vein-portal)' : 'var(--vein-systemic)') : pressureColor(f.P[NI[n.id]]));
      nodeEls[n.id].c.style.display = nodeVisible(n.id) ? '' : 'none';
    }
    for (const [id, r] of Object.entries(resistorEls)) {
      const k = EI[id];
      const q = f.Q[k];
      const dp = f.P[NI[EDGES[k].from]] - f.P[NI[EDGES[k].to]];
      const R = Math.abs(q) > 1e-3 ? dp / (q * 0.06) : Infinity;
      r.txt = Number.isFinite(R) ? `${R.toFixed(1)} WU` : '∞ WU';
      r.r.setAttribute('stroke-width', clamp(1 + Math.log10(Math.max(1, Math.abs(R))) * 1.5, 1, 4));
    }
  }

  function updateOrgans(f, p, t) {
    liverNodules.setAttribute('opacity', (p.cirrhosis * 0.42 * (1 - t)).toFixed(2));
    sinusStops[0].setAttribute('stop-color', pressureColor(f.P[NI.SIN_R]));
    sinusStops[1].setAttribute('stop-color', pressureColor(f.P[NI.SIN_L]));
    const sc = f.slow.spleen / 11;
    organEls.spleen.setAttribute('transform', `translate(${SPLEEN_CENTER[0]} ${SPLEEN_CENTER[1]}) scale(${sc.toFixed(3)}) translate(${-SPLEEN_CENTER[0]} ${-SPLEEN_CENTER[1]})`);
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

  // Overlays (stenosis, thrombus, stents, varices, balloons, catheter…)
  function updateOverlays(f, p, gain, t) {
    const anat = t < 0.5;
    // stenosis clamps & thrombi
    ov.clamps.innerHTML = ''; ov.thrombi.innerHTML = ''; ov.stents.innerHTML = ''; ov.plugs.innerHTML = ''; ov.stasis.innerHTML = '';
    const hideDx = isImaging();
    for (const [id, v] of Object.entries(p.stenosis)) {
      if (hideDx || !(v > 0) || !E[id] || !E[id].vis) continue;
      const [x, y, dx, dy] = pointAt(geo[id].cur, 0.5);
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
      ov.thrombi.append(s('path', { class: 'thrombus', d: polyD(pts), 'stroke-width': (E[id].width * clamp(v, 0.25, 1) + 1).toFixed(1) }));
    }
    for (const id of ['TIPS', 'S_PC', 'S_DSR', 'S_MC']) {
      if (!E[id].vis) continue;
      ov.stents.append(s('path', { class: 'stent', d: polyD(geo[id].cur), 'stroke-width': (E[id].width + 5).toFixed(1) }));
    }
    for (const id of Object.keys(p.occluded)) {
      if (!p.occluded[id] || !E[id] || !E[id].vis) continue;
      const [x, y] = pointAt(geo[id].cur, 0.5);
      ov.plugs.append(s('circle', { cx: x, cy: y, r: 7, fill: 'var(--surface)', stroke: 'var(--danger)', 'stroke-width': 2 }),
        s('path', { d: `M${x - 4} ${y - 4} L ${x + 4} ${y + 4} M${x + 4} ${y - 4} L ${x - 4} ${y + 4}`, stroke: 'var(--danger)', 'stroke-width': 2 }));
    }
    // PV stasis hatch
    const m = f.metrics;
    if (!hideDx && Math.abs(m.pvVel) < 5 && (p.thrombus.PV_TRUNK || 0) < 0.99) {
      ov.stasis.append(s('path', { d: polyD(geo.PV_TRUNK.cur), stroke: 'var(--caution)', 'stroke-width': E.PV_TRUNK.width + 7, 'stroke-dasharray': '1.5 4', 'stroke-linecap': 'round', fill: 'none', opacity: 0.75 }));
    }

    // Esophageal varices (beads)
    ov.varices.innerHTML = ''; ov.gvarices.innerHTML = ''; ov.caput.innerHTML = ''; ov.bands.innerHTML = '';
    if (anat) {
      const vr = m.varix;
      // Esophageal varices: three serpentine columns in the lower esophagus. Width follows
      // the varix radius, tortuosity grows with size, red wale marks mark high wall tension.
      const eso = (y) => 794 + (y - 24) * 0.066;
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
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 + 0.3, L = 16 + 30 * c3;
          const pts = [];
          for (let j = 0; j <= 6; j++) {
            const rr = 8 + (L * j) / 6, wob = j === 0 ? 0 : Math.sin(j * 1.6 + i) * 3.5 * c3;
            pts.push([SITES.umbilicus[0] + Math.cos(a) * rr - Math.sin(a) * wob, SITES.umbilicus[1] + Math.sin(a) * rr + Math.cos(a) * wob]);
          }
          ov.caput.append(s('path', { d: polyD(pts), fill: 'none', stroke: col, 'stroke-width': (1.2 + 1.8 * c3).toFixed(2), 'stroke-linecap': 'round', opacity: 0.9 }));
        }
      }
    }
    // Balloons
    ov.balloons.innerHTML = '';
    if (anat && p.balloonEso) ov.balloons.append(s('rect', { x: 797, y: 190, width: 20, height: 84, rx: 10, class: 'balloon-shape' }));
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
  function blockEl(key, cls, interactiveNode) {
    let b = pool.get(key);
    if (b) return b;
    const g = s('g', { class: 'lb ' + cls });
    if (interactiveNode) {
      g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button');
      g.addEventListener('click', () => onSelect({ type: 'node', id: interactiveNode }));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect({ type: 'node', id: interactiveNode }); } });
    }
    gLabels.append(g);
    b = { g, sig: '', seen: 0 };
    pool.set(key, b);
    return b;
  }
  let frameNo = 0;
  function renderBlock(it) {
    const b = blockEl(it.key, it.cls, it.node);
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

  function pressureRuns(P, id, compact) {
    if (!store.get().layers.chips || isImaging()) return null;
    const [v, u] = fp(P);
    const runs = [{ t: v, size: compact ? 12.5 : 14, weight: 650, cls: 'lb-val' }, { t: u, size: compact ? 9.5 : 10, weight: 500, cls: 'lb-unit', gap: 2.5 }];
    const ref = REF()?.[NI[id]];
    if (ref != null && Math.abs(P - ref) >= 1) runs.push({ t: `${P > ref ? '▲' : '▼'} ${fmt(Math.abs(P - ref), 0)}`, size: compact ? 9.5 : 10.5, weight: 650, cls: 'lb-delta ' + (P > ref ? 'up' : 'down'), gap: 6 });
    return runs;
  }

  function nodeItem(id, f, mode, compact) {
    const st = store.get();
    const meta = ATLAS_LABELS[id];
    const P = (f.Pf || f.P)[NI[id]];
    const name = mode === 'atlas' ? (meta?.name || NODES[NI[id]].label) : (SHORT[id] || id);
    const lines = [[{ t: name, size: compact ? 10.5 : 11.5, weight: 500, cls: 'lb-name' }]];
    const pr = pressureRuns(P, id, compact);
    if (pr) lines.push(pr);
    const fe = LABEL_FLOW_EDGE[id];
    if (fe && E[fe]?.vis && E[fe].rev && !isImaging()) lines.push([{ t: '⟲ flow reversed', size: compact ? 9.5 : 10.5, weight: 650, cls: 'lb-rev' }]);
    const w = Math.max(...lines.map(lineW)) + (mode === 'atlas' ? 7 : 0);
    const hh = lines.reduce((a, l) => a + LINE_H(l), 0);
    const sel = st.selection?.type === 'node' && st.selection.id === id;
    return { key: 'n:' + id, node: id, cls: 'node ' + mode, lines, w, h: hh, sel, label: `${NODES[NI[id]].label}${pr ? `: ${fmt(P, 1)} millimeters of mercury` : ''}`,
      swatch: mode === 'atlas' && pr ? pressureColor(P) : null, bg: mode === 'inline', padX: mode === 'inline' ? 6 : 3, padY: mode === 'inline' ? 3 : 2 };
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
      const nodes = [];
      for (const n of NODES) {
        if (!nodeEls[n.id] || !CIRCUIT_LABELS[n.id]) continue;
        if (!nodeVisible(n.id)) continue;
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
      if (!isImaging() && st.layers.chips) {
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

  // ── Particle animation loop ───────────────────────
  let lastT = performance.now();
  function animate(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const st = store.get();
    if (morph !== morphTarget) {
      morph = clamp(morph + Math.sign(morphTarget - morph) * dt / 0.6, 0, 1);
      if (F) update(F); else updateGeometry(true);
    }
    drawParticles(dt, st);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  function drawParticles(dt, st) {
    if (!CTM) refreshCTM();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!F) return;
    const m = CTM;
    ctx.setTransform(dpr * m.a, dpr * m.b, dpr * m.c, dpr * m.d, dpr * (m.e - wrapRect.left), dpr * (m.f - wrapRect.top));
    ctx.lineCap = 'round';
    const running = st.running;
    const simSpeed = st.clock === 'hemo' ? clamp(Math.sqrt(st.speed), 0.4, 2) : 0.8;
    const still = reduceMotion.matches;
    const showParticles = st.layers.particles && !st.imaging;
    for (const x of Object.values(E)) {
      if (!showParticles) { x.parts.length = 0; continue; }
      if (!x.vis) { x.parts.length = 0; continue; }
      const e = x.e;
      const g = geo[e.id];
      let q, vel;
      {
        const k = EI[e.id];
        q = F.Q[k];
        const D = Math.max(0.5, F.D[k]) / 10;
        vel = q / (Math.PI * D * D / 4);
        if (e.kind === 'liver') vel = q * 0.6;
      }
      const target = Math.sign(q) * 26 * Math.log1p(Math.abs(vel) / 1.5) * simSpeed * (running ? 1 : 0);
      const cur = velDisp[e.id] ?? target;
      const nv = cur + (target - cur) * Math.min(1, dt / 0.35);
      velDisp[e.id] = nv;
      const aq = Math.abs(q);
      const isArt = x.isArt;
      let n = Math.round((g.len / (isArt ? 34 : 16)) * Math.sqrt(aq / 10));
      if (aq < 0.05) n = 0;
      n = clamp(n, 0, isArt ? 30 : 90);
      const parts = x.parts;
      while (parts.length < n) parts.push({ u: Math.random(), o: (Math.random() - 0.5) * 1.1, s: 0.75 + Math.random() * 0.5 });
      if (parts.length > n) parts.length = n;
      if (!parts.length) continue;
      const w = x.width;
      const du = (nv * dt) / Math.max(10, g.len);
      // Streak ink adapts to the lumen: dark cells on pale (low-pressure) lumens, light cells on dark ones.
      const ink = isArt ? 'rgba(255, 236, 240, .75)' : x.rev ? 'rgba(236, 116, 36, .95)' : (x.pmid ?? 0) < 8.5 ? 'rgba(88, 12, 36, .5)' : 'rgba(255, 244, 248, .62)';
      if (still) {
        // reduced motion: static chevrons in the flow direction
        ctx.strokeStyle = ink;
        ctx.lineWidth = Math.max(1, w * 0.18);
        const count = Math.min(6, Math.max(1, Math.round(g.len / 60)));
        for (let i = 0; i < count; i++) {
          const [px, py, dx, dy] = pointAt(g.cur, (i + 0.5) / count);
          const nn = Math.hypot(dx, dy) || 1, ux = (dx / nn) * Math.sign(q || 1), uy = (dy / nn) * Math.sign(q || 1);
          const a = Math.max(3, w * 0.45);
          ctx.beginPath(); ctx.moveTo(px - ux * a - uy * a, py - uy * a + ux * a); ctx.lineTo(px, py); ctx.lineTo(px - ux * a + uy * a, py - uy * a - ux * a); ctx.stroke();
        }
        continue;
      }
      ctx.strokeStyle = ink;
      ctx.lineWidth = isArt ? clamp(w * 0.34, 0.8, 1.8) : clamp(w * 0.2, 0.9, 2.2);
      const len = clamp(Math.abs(nv) * 0.035, 0.6, 3.2) + ctx.lineWidth * 0.5;
      const sg = nv >= 0 ? 1 : -1;
      ctx.beginPath();
      for (const pt of parts) {
        pt.u += du * pt.s;
        if (pt.u > 1) pt.u -= 1; else if (pt.u < 0) pt.u += 1;
        const [px, py, dx, dy] = pointAt(g.cur, pt.u);
        const nn = Math.hypot(dx, dy) || 1;
        const tx = dx / nn, ty = dy / nn;
        const ox = -ty * pt.o * (w - ctx.lineWidth) * 0.5, oy = tx * pt.o * (w - ctx.lineWidth) * 0.5;
        const jitter = Math.abs(nv) < 2 && aq > 0.05 ? (Math.random() - 0.5) * 1.2 : 0;
        const cx = px + ox + jitter, cy = py + oy;
        const l = len * pt.s;
        ctx.moveTo(cx - tx * l * sg, cy - ty * l * sg);
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
    // bleeding jet
    if (F.bleed?.active) {
      const site = F.bleed.site === 'GV' ? [SITES.fundus[0], SITES.fundus[1] - 6] : [SITES.varix[0] + 6, SITES.varix[1] + 10];
      ctx.fillStyle = 'rgba(170, 10, 30, .85)';
      const rate = F.metrics.bleeding?.rate || 50;
      const k = clamp(rate / 40, 1, 12);
      for (let i = 0; i < 18 * k; i++) {
        const a = Math.random() * Math.PI - Math.PI / 2 + (F.bleed.site === 'GV' ? Math.PI : 0);
        const rr = Math.random() * (18 + rate / 5);
        ctx.beginPath(); ctx.arc(site[0] + Math.cos(a) * rr * 0.5, site[1] - Math.abs(Math.sin(a)) * rr, 1.3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(139, 10, 26, .35)';
      const pool = clamp(Math.sqrt((F.bleed.total || 0) / 5), 4, 45);
      ctx.beginPath(); ctx.ellipse(SITES.stomachPool[0], SITES.stomachPool[1], pool * 1.4, pool * 0.6, 0, 0, Math.PI * 2); ctx.fill();
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
    if (hl) for (const e of hl) E[e]?.g.classList.remove('hl');
    hl = null;
    const tool = store.get().tool;
    if (id && (tool === 'select' || tool === 'probe')) {
      hl = computeHighlight(id);
      for (const e of hl) E[e]?.g.classList.add('hl');
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
        drag = { type: 'pinch', id, x0: ev.clientX, y0: ev.clientY, s0: st.params.stenosis[id] || 0, u: isClick ? 0.5 : nearestT(id, wx, wy) };
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
