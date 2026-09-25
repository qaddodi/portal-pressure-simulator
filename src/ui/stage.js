// Anatomical stage (blueprint §6): SVG anatomy + canvas particle layer + HTML overlay.

import { EDGES, NODES, PORTAL_TERRITORY, COLLATERAL_DMIN_RATIO } from '../engine/topology.js';
import { VIEW, NODE_POS, EDGE_PATH, CIRCUIT_PATH, ORGANS, EDGE_VESSEL, SHORT, CHIP_NODES, LIVER_SPLIT_X } from './anatomy.js';
import { pressureColor, deltaColor, dropColor } from './colormap.js';
import { store, updateParams } from './store.js';
import { s, h, fmt, clamp, lerp, toast } from './util.js';

const N_SAMPLES = 48;
const VB_ANAT = [300, 8, 820, 990];
const CHIP_OFFSET = { VAR: [-78, 12], RA: [-40, 0], IVCS: [48, 18], RHV: [-30, 0], SIN_R: [-10, 0] };
const VB_CIRC = [20, 70, 1360, 920];
const RENDER_ONLY = [
  { id: 'PUMP', from: 'RA', to: 'AO', kind: 'pump', label: 'Heart → aorta' },
  { id: 'AORTA', from: 'AO', to: 'AO', kind: 'aorta', label: 'Descending aorta' },
];
const ALL_EDGES = [...EDGES, ...RENDER_ONLY];
const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const REVERSAL_WATCH = new Set(['PV_TRUNK', 'SV_CONF', 'SMV_CONF', 'LGV_CONF', 'PVH_R', 'PVH_L', 'PRE_R', 'PRE_L', 'V_SPL', 'V_IMV', 'V_INT', 'RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'V_STO', 'IVC_IS']);
const BADGE_EDGES = new Set(['PV_TRUNK', 'SV_CONF', 'SMV_CONF', 'PVH_L', 'PVH_R', 'LGV_CONF', 'RHV_IVC']);

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function createStage({ wrap, onSelect, onAction, onOpenTab, onHoverInfo }) {
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
  const defaultPath = (a, b, circuit) => {
    const [x1, y1] = a, [x2, y2] = b;
    if (!circuit) return `M${x1} ${y1} L ${x2} ${y2}`;
    const dx = (x2 - x1) / 2;
    return `M${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };
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
  function wiggle(pts, amp, seed) {
    if (amp < 0.3) return pts;
    return pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      const env = Math.sin((Math.PI * i) / (pts.length - 1));
      const w = amp * env * Math.sin(i * 1.3 + seed);
      return [p[0] + nx * w, p[1] + ny * w];
    });
  }
  const nodePos = (id, t) => { const [a, c] = NODE_POS[id]; return [lerp(a[0], c[0], t), lerp(a[1], c[1], t)]; };

  // ── SVG scaffolding ───────────────────────────────
  const defs = s('defs');
  defs.innerHTML = `
    <pattern id="nodules" width="16" height="16" patternUnits="userSpaceOnUse">
      <circle cx="4" cy="4" r="3.2" class="nodule" fill-opacity=".9"/><circle cx="12" cy="11" r="3.8" class="nodule" fill-opacity=".9"/><circle cx="13" cy="3" r="1.8" class="nodule"/>
    </pattern>
    <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" stroke-width="2"/></pattern>
    <clipPath id="torsoClip"><path d="${ORGANS.find((o) => o.id === 'torso').d}"/></clipPath>
    <radialGradient id="bleedPool"><stop offset="0" stop-color="#8B0A1A" stop-opacity=".85"/><stop offset="1" stop-color="#8B0A1A" stop-opacity="0"/></radialGradient>`;
  svg.append(defs);
  const world = s('g', { id: 'world' });
  svg.append(world);
  const gGrid = s('g', { id: 'grid', class: 'circuit-only' });
  const gOrgans = s('g', { id: 'organs' });
  const gAscites = s('g', { id: 'ascites', 'clip-path': 'url(#torsoClip)' });
  const gOrganLabels = s('g', { id: 'organLabels' });
  const gEdges = s('g', { id: 'edges' });
  const gOver = s('g', { id: 'overlays' });
  const gNodes = s('g', { id: 'nodes', class: 'circuit-only' });
  const gGuides = s('g', { id: 'guides' });
  world.append(gGrid, gOrgans, gAscites, gOrganLabels, gEdges, gOver, gNodes, gGuides);

  for (let x = 0; x <= VIEW.w; x += 50) gGrid.append(s('line', { x1: x, y1: 0, x2: x, y2: VIEW.h, stroke: 'var(--grid-line)' }));
  for (let y = 0; y <= VIEW.h; y += 50) gGrid.append(s('line', { x1: 0, y1: y, x2: VIEW.w, y2: y, stroke: 'var(--grid-line)' }));
  gGrid.append(s('text', { x: 90, y: 40, class: 'organ-label' }, document.createTextNode('Circuit view · pressure falls left → right')));

  const organEls = {};
  for (const o of ORGANS) {
    let el;
    if (o.ellipse) { const [cx, cy, rx, ry, rot] = o.ellipse; el = s('ellipse', { cx, cy, rx, ry, transform: `rotate(${rot} ${cx} ${cy})`, class: o.cls }); }
    else if (o.circle) { const [cx, cy, r] = o.circle; el = s('circle', { cx, cy, r, class: o.cls }); }
    else el = s('path', { d: o.d, class: o.cls });
    organEls[o.id] = el;
    gOrgans.append(el);
  }
  const liverNodules = s('path', { d: ORGANS.find((o) => o.id === 'liver').d, fill: 'url(#nodules)', opacity: 0 });
  gOrgans.append(liverNodules);
  const ascitesPath = s('path', { class: 'ascites-fill', d: '' });
  gAscites.append(ascitesPath);
  for (const [txt, x, y] of [['Liver', 395, 290], ['Stomach', 880, 430], ['Spleen', 985, 240], ['Heart', 700, 145], ['Small bowel', 670, 870], ['Kidney', 470, 720], ['Kidney', 885, 720], ['Pancreas', 890, 560], ['Esophagus', 730, 60]]) {
    gOrganLabels.append(s('text', { x, y, class: 'organ-label' }, document.createTextNode(txt)));
  }

  // Edge groups
  const E = {};
  for (const e of ALL_EDGES) {
    if (e.kind === 'wedge') continue;
    const g = s('g', { class: 'vg', 'data-id': e.id });
    const grad = s('linearGradient', { id: 'gr-' + e.id, gradientUnits: 'userSpaceOnUse' });
    const st0 = s('stop', { offset: '0' }), st1 = s('stop', { offset: '1' });
    grad.append(st0, st1); defs.append(grad);
    const isArt = e.kind === 'arteriole' || e.kind === 'artery' || e.kind === 'pump' || e.kind === 'aorta' || (e.kind === 'shunt' && e.shunt === 'ap');
    const halo = s('path', { class: 'v-halo' });
    const sel = s('path', { class: 'v-select' });
    const wall = s('path', { class: isArt ? 'v-artery' : 'v-wall' });
    const lumen = isArt ? null : s('path', { class: 'v-lumen' + (e.kind === 'liver' ? ' liver-micro' : ''), stroke: `url(#gr-${e.id})` });
    const hit = s('path', { class: 'v-hit', tabindex: e.kind === 'pump' || e.kind === 'aorta' ? null : 0, role: 'button', 'aria-label': e.label || e.id, 'data-id': e.id });
    g.append(halo, sel, wall);
    if (lumen) g.append(lumen);
    g.append(hit);
    gEdges.append(g);
    if (e.kind === 'collateral') g.classList.add('coll');
    E[e.id] = { e, g, grad, st0, st1, halo, sel, wall, lumen, hit, isArt, vis: true, dv: 0, parts: [], width: 4 };
  }
  // draw order: arteries first
  for (const x of Object.values(E)) if (x.isArt) gEdges.prepend(x.g);

  // Nodes (circuit view)
  const nodeEls = {};
  for (const n of NODES) {
    if (n.kind === 'wedge') continue;
    const c = s('circle', { r: n.kind === 'heart' ? 9 : 5, class: 'node-dot' });
    const t = s('text', { class: 'resistor-label', 'text-anchor': 'middle' }, document.createTextNode(SHORT[n.id] || n.id));
    gNodes.append(c, t);
    nodeEls[n.id] = { c, t };
  }
  // Resistor glyphs on liver segments (circuit)
  const resistorEls = {};
  for (const id of ['PRE_R', 'PRE_L', 'SIN_RR', 'SIN_LL', 'POST_R_RHV', 'POST_L_LHV', 'PV_TRUNK', 'IVCS_RA']) {
    const r = s('rect', { class: 'resistor circuit-only', rx: 2 });
    const t = s('text', { class: 'resistor-label circuit-only', 'text-anchor': 'middle' });
    gNodes.append(r, t);
    resistorEls[id] = { r, t };
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
  const fit = () => { vt = { k: 1, x: 0, y: 0 }; applyVT(); CTM = null; };

  // ── Particles ─────────────────────────────────────
  const ctx = canvas.getContext('2d');
  let dpr = 1;
  function resizeCanvas() {
    const r = wrap.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
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
    const e = x.e, p = f.params ?? store.get().params;
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
      nodeEls[n.id].t.setAttribute('x', x); nodeEls[n.id].t.setAttribute('y', y - 11);
    }
    for (const [id, r] of Object.entries(resistorEls)) {
      const [x, y] = pointAt(geo[id].cur, 0.5);
      r.r.setAttribute('x', x - 13); r.r.setAttribute('y', y - 6); r.r.setAttribute('width', 26); r.r.setAttribute('height', 12);
      r.t.setAttribute('x', x); r.t.setAttribute('y', y + 20);
    }
    const vb = VB_ANAT.map((a, i) => lerp(a, VB_CIRC[i], t));
    svg.setAttribute('viewBox', vb.map((v) => v.toFixed(1)).join(' '));
    gOrgans.style.opacity = String(1 - t);
    gOrganLabels.style.opacity = String((1 - t) * (store.get().layers.labels ? 1 : 0));
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
    const p = st.params;
    const t = easeInOut(morph);
    const gain = lerp(1.05, 0.75, t);
    const healthy = st.healthy;
    const mode = st.colorMode;

    // collateral tortuosity
    let geomDirty = false;
    for (const x of Object.values(E)) {
      if (x.e.kind !== 'collateral') continue;
      const w = recruitFrac(x.e.id, f) > 0.25 ? 3 + 9 * recruitFrac(x.e.id, f) : 0;
      if (Math.abs(w - geo[x.e.id].wig) > 0.6) { geo[x.e.id].wig = w; geomDirty = true; }
    }
    updateGeometry(geomDirty);

    for (const x of Object.values(E)) {
      const e = x.e;
      const vis = edgeVisible(x, f);
      if (vis !== x.vis) { x.g.style.display = vis ? '' : 'none'; x.vis = vis; }
      if (!vis) continue;
      if (e.kind === 'pump' || e.kind === 'aorta') {
        x.wall.setAttribute('stroke-width', e.kind === 'pump' ? 16 * gain : 18 * gain);
        x.width = 16 * gain;
        continue;
      }
      const k = EI[e.id];
      const D = f.D[k];
      const P1 = f.P[NI[e.from]], P2 = f.P[NI[e.to]];
      let w = Math.max(e.kind === 'liver' ? 5 : 2.2, D * gain);
      if (x.isArt) w = Math.max(1.8, D * gain * 0.85);
      x.width = w;
      if (x.isArt) { x.wall.setAttribute('stroke-width', w.toFixed(1)); continue; }
      const baseD = e.d || (e.dMax ? e.dMax * COLLATERAL_DMIN_RATIO : 3);
      const wallPx = e.kind === 'liver' ? 1.5 : clamp(2.6 * Math.sqrt(baseD / Math.max(0.3, D)), 0.8, 3.2);
      x.wall.setAttribute('stroke-width', (w + 2 * wallPx).toFixed(1));
      x.lumen.setAttribute('stroke-width', w.toFixed(1));
      let c1, c2;
      if (mode === 'pressure') { c1 = pressureColor(P1); c2 = pressureColor(P2); }
      else if (mode === 'drop') { c1 = c2 = dropColor(P1 - P2); }
      else if (mode === 'direction') { const rev = isReversed(e, f); c1 = c2 = rev ? 'var(--flow-reversed)' : 'var(--flow-normal)'; }
      else { const h0 = healthy?.P; c1 = deltaColor(h0 ? P1 - h0[NI[e.from]] : 0); c2 = deltaColor(h0 ? P2 - h0[NI[e.to]] : 0); }
      x.st0.setAttribute('stop-color', c1); x.st1.setAttribute('stop-color', c2);
      if (e.kind === 'collateral') {
        const fr = recruitFrac(e.id, f);
        x.g.classList.toggle('coll-ghost', fr < 0.12);
        x.g.style.opacity = p.occluded[e.id] ? '0.45' : String(0.25 + 0.75 * Math.min(1, fr * 2.5));
      }
      const rev = REVERSAL_WATCH.has(e.id) && isReversed(e, f);
      x.halo.classList.toggle('on', rev);
      if (rev) x.halo.setAttribute('stroke-width', (w + 10).toFixed(1));
      x.rev = rev;
      const selOn = st.selection?.type === 'edge' && st.selection.id === e.id;
      x.sel.classList.toggle('on', selOn);
      if (selOn) x.sel.setAttribute('stroke-width', (w + 14).toFixed(1));
    }
    updateNodesCircuit(f);
    updateOverlays(f, p, gain, t);
    updateChips(f);
    updateOrgans(f, p, t);
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
      nodeEls[n.id].c.setAttribute('fill', pressureColor(f.P[NI[n.id]]));
    }
    for (const [id, r] of Object.entries(resistorEls)) {
      const k = EI[id];
      const q = f.Q[k];
      const dp = f.P[NI[EDGES[k].from]] - f.P[NI[EDGES[k].to]];
      const R = Math.abs(q) > 1e-3 ? dp / (q * 0.06) : Infinity;
      r.t.textContent = Number.isFinite(R) ? `${R.toFixed(1)} WU` : '∞';
      r.r.setAttribute('stroke-width', clamp(1 + Math.log10(Math.max(1, Math.abs(R))) * 1.5, 1, 4));
    }
  }

  function updateOrgans(f, p, t) {
    liverNodules.setAttribute('opacity', (p.cirrhosis * 0.55 * (1 - t)).toFixed(2));
    const L = f.slow.spleen;
    const sc = L / 11;
    organEls.spleen.setAttribute('transform', `rotate(18 1010 345) translate(1010 345) scale(${sc.toFixed(3)}) translate(-1010 -345)`);
    // ascites
    const V = f.slow.ascites;
    const hgt = clamp(V / 11000, 0, 1) * 330;
    if (hgt < 2) ascitesPath.setAttribute('d', '');
    else {
      const y = 995 - hgt, ph = (performance.now() / 900) % (Math.PI * 2);
      let d = `M300 1000 L 300 ${y}`;
      for (let x = 300; x <= 1100; x += 25) d += ` L ${x} ${(y + Math.sin(x / 40 + ph) * 3).toFixed(1)}`;
      d += ' L 1100 1000 Z';
      ascitesPath.setAttribute('d', d);
    }
  }

  // Overlays (stenosis, thrombus, stents, varices, balloons, catheter…)
  function updateOverlays(f, p, gain, t) {
    const anat = t < 0.5;
    // stenosis clamps & thrombi
    ov.clamps.innerHTML = ''; ov.thrombi.innerHTML = ''; ov.stents.innerHTML = ''; ov.plugs.innerHTML = ''; ov.stasis.innerHTML = '';
    for (const [id, v] of Object.entries(p.stenosis)) {
      if (!(v > 0) || !E[id] || !E[id].vis) continue;
      const [x, y, dx, dy] = pointAt(geo[id].cur, 0.5);
      const n = Math.hypot(dx, dy) || 1, nx = -dy / n, ny = dx / n;
      const off = (E[id].width / 2) * (1 - v) + 3;
      for (const sgn of [1, -1]) {
        const bx = x + nx * sgn * (off + 7), by = y + ny * sgn * (off + 7);
        const tx = x + nx * sgn * off, ty = y + ny * sgn * off;
        const ux = dx / n * 5, uy = dy / n * 5;
        ov.clamps.append(s('path', { class: 'clamp', d: `M${tx} ${ty} L ${bx + ux} ${by + uy} L ${bx - ux} ${by - uy} Z` }));
      }
      ov.clamps.append(s('text', { x: x + nx * (off + 14) + 4, y: y + ny * (off + 14), class: 'clamp-label' }, document.createTextNode(`${Math.round(v * 100)}%`)));
    }
    for (const [id, v] of Object.entries(p.thrombus)) {
      if (!(v > 0) || !E[id] || !E[id].vis) continue;
      const pts = geo[id].cur.slice(Math.floor(N_SAMPLES * 0.3), Math.ceil(N_SAMPLES * 0.72));
      ov.thrombi.append(s('path', { class: 'thrombus', d: polyD(pts), 'stroke-width': (E[id].width * clamp(v, 0.25, 1) + 1).toFixed(1) }));
    }
    for (const id of ['TIPS', 'S_PC', 'S_DSR', 'S_MC']) {
      if (!E[id].vis) continue;
      ov.stents.append(s('path', { class: 'stent', d: polyD(geo[id].cur), 'stroke-width': (E[id].width + 4).toFixed(1) }));
    }
    for (const id of Object.keys(p.occluded)) {
      if (!p.occluded[id] || !E[id] || !E[id].vis) continue;
      const [x, y] = pointAt(geo[id].cur, 0.5);
      ov.plugs.append(s('circle', { cx: x, cy: y, r: 7, fill: 'var(--surface)', stroke: 'var(--danger)', 'stroke-width': 2 }),
        s('path', { d: `M${x - 4} ${y - 4} L ${x + 4} ${y + 4} M${x + 4} ${y - 4} L ${x - 4} ${y + 4}`, stroke: 'var(--danger)', 'stroke-width': 2 }));
    }
    // PV stasis hatch
    const m = f.metrics;
    if (Math.abs(m.pvVel) < 5 && (p.thrombus.PV_TRUNK || 0) < 0.99) {
      ov.stasis.append(s('path', { d: polyD(geo.PV_TRUNK.cur), stroke: 'var(--caution)', 'stroke-width': E.PV_TRUNK.width + 6, 'stroke-dasharray': '2 4', fill: 'none', opacity: 0.8 }));
    }

    // Esophageal varices (beads)
    ov.varices.innerHTML = ''; ov.gvarices.innerHTML = ''; ov.caput.innerHTML = ''; ov.bands.innerHTML = '';
    if (anat) {
      const vr = m.varix;
      const rPx = clamp(vr.r * 1.25, 0, 10);
      if (vr.d >= 2.4) {
        const col = pressureColor(f.P[NI.VAR]);
        const alpha = clamp((vr.d - 2.4) / 2, 0.2, 1);
        const cols = [-9, -3, 3, 9];
        cols.forEach((cx, ci) => {
          for (let i = 0; i < 6; i++) {
            const y = 202 + i * 10 + (ci % 2) * 4;
            const x = 711 + (y - 200) * 0.08 + cx + Math.sin(i * 1.7 + ci) * rPx * 0.25;
            const rr = rPx * (0.7 + 0.3 * Math.sin(i * 2.1 + ci * 1.3) ** 2);
            ov.varices.append(s('ellipse', { cx: x, cy: y, rx: (rr * 0.8).toFixed(1), ry: (rr * 1.05).toFixed(1), fill: col, 'fill-opacity': alpha, class: 'varix-bead', 'stroke-width': clamp(vr.w * 1.6, 0.3, 1.6) }));
            if (vr.ratio > 0.7 && i % 2 === 0) ov.varices.append(s('path', { class: 'redwale', d: `M${x - rr * 0.4} ${y - 1} l ${rr * 0.8} 2`, opacity: clamp((vr.ratio - 0.7) / 0.3, 0.2, 1) }));
          }
        });
      }
      const nb = Math.round(f.bands || 0);
      for (let i = 0; i < nb; i++) ov.bands.append(s('ellipse', { cx: 702 + i * 6, cy: 246 - i * 9, rx: 5, ry: 3, class: 'band-ring' }));
      const gv = m.gastricVarix;
      if (gv.d >= 2.4) {
        const col = pressureColor(f.P[NI.GV]);
        const r = clamp(gv.r * 1.4, 2, 12);
        for (const [dx, dy] of [[-10, -6], [4, -10], [12, 2], [0, 8], [-8, 8], [10, 12]]) {
          ov.gvarices.append(s('circle', { cx: 868 + dx * (0.6 + r / 12), cy: 296 + dy * (0.6 + r / 12), r: (r * 0.7).toFixed(1), fill: col, 'fill-opacity': clamp((gv.d - 2.4) / 2, 0.2, 0.95), class: 'varix-bead' }));
        }
      }
      const c3 = recruitFrac('C3', f);
      if (c3 > 0.25 && E.C3.vis) {
        const col = pressureColor(f.P[NI.EPI]);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 + 0.3, L = 18 + 30 * c3;
          let d = `M${600 + Math.cos(a) * 9} ${748 + Math.sin(a) * 9}`;
          for (let j = 1; j <= 6; j++) {
            const rr = 9 + (L * j) / 6, wob = Math.sin(j * 1.9 + i) * 4;
            d += ` L ${(600 + Math.cos(a) * rr - Math.sin(a) * wob).toFixed(1)} ${(748 + Math.sin(a) * rr + Math.cos(a) * wob).toFixed(1)}`;
          }
          ov.caput.append(s('path', { d, fill: 'none', stroke: col, 'stroke-width': 1.5 + 2 * c3, 'stroke-linecap': 'round', opacity: 0.85 }));
        }
      }
    }
    // Balloons
    ov.balloons.innerHTML = '';
    if (anat && p.balloonEso) ov.balloons.append(s('rect', { x: 703, y: 190, width: 17, height: 70, rx: 8, class: 'balloon-shape' }));
    if (anat && p.balloonGas) ov.balloons.append(s('circle', { cx: 880, cy: 305, r: 22, class: 'balloon-shape' }));
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

  // ── Chips (HTML) ──────────────────────────────────
  const chipEls = {};
  function updateChips(f) {
    refreshCTM();
    const st = store.get();
    const t = easeInOut(morph);
    const show = new Set(st.layers.chips ? CHIP_NODES : []);
    if (st.selection?.type === 'node') show.add(st.selection.id);
    if (t > 0.5 && st.layers.chips && wrap.clientWidth > 900) for (const n of NODES) if (n.kind !== 'wedge' && ['portal', 'liver', 'hepvein', 'heart', 'varix'].includes(n.kind)) show.add(n.id);
    if (f.params?.catheter?.vein || st.params.catheter.vein) show.add('W_' + st.params.catheter.vein);
    for (const id of Object.keys(chipEls)) if (!id.startsWith('rev-') && !show.has(id)) { chipEls[id].remove(); delete chipEls[id]; }
    const placed = [];
    const order = [...show].sort((a, b) => (NODE_POS[a]?.[0][1] ?? 0) - (NODE_POS[b]?.[0][1] ?? 0));
    for (const id of order) {
      if (!NODE_POS[id]) continue;
      let el = chipEls[id];
      if (!el) {
        el = h('div', { class: 'chip', role: 'button', tabindex: 0, 'aria-label': NODES[NI[id]].label },
          h('span', { class: 'sw' }), h('span', { class: 'lbl' }, SHORT[id] || id), h('span', { class: 'val' }), h('span', { class: 'delta' }));
        el.addEventListener('click', () => onSelect({ type: 'node', id }));
        overlay.append(el);
        chipEls[id] = el;
      }
      let [x, y] = worldToLocal(...nodePos(id, t));
      if (t < 0.5 && CHIP_OFFSET[id]) { x += CHIP_OFFSET[id][0]; y += CHIP_OFFSET[id][1]; }
      // greedy de-overlap against chips already placed this frame
      const cw = el.offsetWidth || 90, ch = 22;
      for (let k = 0; k < 6; k++) {
        const hit = placed.find((r) => Math.abs(r.x - x) < (r.w + cw) / 2 + 2 && Math.abs(r.y - y) < ch);
        if (!hit) break;
        y = hit.y + (y >= hit.y ? ch : -ch);
      }
      placed.push({ x, y, w: cw });
      el.style.left = x + 'px'; el.style.top = y + 'px';
      const P = (f.Pf || f.P)[NI[id]];
      el.children[0].style.background = pressureColor(P);
      el.children[2].textContent = fmt(P, 1);
      const h0 = st.healthy?.P?.[NI[id]];
      if (h0 != null && Math.abs(P - h0) >= 1) {
        el.children[3].textContent = (P > h0 ? '▲' : '▼') + fmt(Math.abs(P - h0), 0);
        el.children[3].className = 'delta ' + (P > h0 ? 'up' : 'down');
      } else el.children[3].textContent = '';
    }
    // reversal badges
    for (const id of BADGE_EDGES) {
      const x = E[id];
      const key = 'rev-' + id;
      if (x.rev && x.vis) {
        let b = chipEls[key];
        if (!b) { b = h('div', { class: 'badge-rev' }, '⟲ reversed'); overlay.append(b); chipEls[key] = b; }
        const [px, py] = pointAt(geo[id].cur, 0.5);
        const [lx, ly] = worldToLocal(px, py);
        b.style.left = (lx + 36) + 'px'; b.style.top = (ly + 14) + 'px';
      } else if (chipEls[key]) { chipEls[key].remove(); delete chipEls[key]; }
    }
  }

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
    if (!F || !st.layers.particles) return;
    const m = CTM;
    ctx.setTransform(dpr * m.a, dpr * m.b, dpr * m.c, dpr * m.d, dpr * (m.e - wrapRect.left), dpr * (m.f - wrapRect.top));
    const running = st.running;
    const simSpeed = st.clock === 'hemo' ? clamp(Math.sqrt(st.speed), 0.4, 2) : 0.8;
    const still = reduceMotion.matches;
    for (const x of Object.values(E)) {
      if (!x.vis) { x.parts.length = 0; continue; }
      const e = x.e;
      const g = geo[e.id];
      let q, vel;
      if (e.kind === 'pump') { q = F.metrics.co / 0.06; vel = 40; }
      else if (e.kind === 'aorta') { q = F.metrics.co / 0.06 * 0.5; vel = 30; }
      else {
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
      let n = Math.round((g.len / (isArt ? 46 : 26)) * Math.sqrt(aq / 10));
      if (aq < 0.05) n = 0;
      n = clamp(n, 0, isArt ? 22 : 60);
      const parts = x.parts;
      while (parts.length < n) parts.push({ u: Math.random(), o: (Math.random() - 0.5) * 0.7, s: 0.7 + Math.random() * 0.5 });
      if (parts.length > n) parts.length = n;
      if (!parts.length) continue;
      const w = x.width;
      const du = (nv * dt) / Math.max(10, g.len);
      if (still) {
        // reduced motion: static chevrons in the flow direction
        ctx.strokeStyle = x.rev ? '#F0782B' : 'rgba(255,255,255,.85)';
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
      ctx.fillStyle = isArt ? 'rgba(232, 72, 82, .95)' : x.rev ? 'rgba(255, 150, 70, .95)' : 'rgba(150, 18, 40, .88)';
      const r = isArt ? Math.max(1, w * 0.28) : clamp(w * 0.2, 1.1, 3.6);
      ctx.beginPath();
      for (const pt of parts) {
        pt.u += du * pt.s;
        if (pt.u > 1) pt.u -= 1; else if (pt.u < 0) pt.u += 1;
        const [px, py, dx, dy] = pointAt(g.cur, pt.u);
        const nn = Math.hypot(dx, dy) || 1;
        const ox = (-dy / nn) * pt.o * w * 0.5, oy = (dx / nn) * pt.o * w * 0.5;
        const jitter = Math.abs(nv) < 2 && aq > 0.05 ? (Math.random() - 0.5) * 1.2 : 0;
        ctx.moveTo(px + ox + jitter + r, py + oy);
        ctx.arc(px + ox + jitter, py + oy, r * pt.s, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    // bleeding jet
    if (F.bleed?.active) {
      const site = F.bleed.site === 'GV' ? [868, 292] : [712, 238];
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
      ctx.beginPath(); ctx.ellipse(890, 440, pool * 1.4, pool * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Interaction ───────────────────────────────────
  const pointers = new Map();
  let drag = null;

  function edgeFromEvent(ev) {
    const el = ev.target.closest?.('.v-hit');
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
        else if (Math.hypot(wx - 880, wy - 305) < 40 || id === 'C2' || id === 'C2b') updateParams((p) => { p.balloonGas = !p.balloonGas; return p; }, { label: 'Gastric balloon' });
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
  const insideVarix = (x, y) => x > 690 && x < 740 && y > 180 && y < 275;

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
    setView(v) { morphTarget = v === 'circuit' ? 1 : 0; },
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
