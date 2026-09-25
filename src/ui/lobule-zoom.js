// Semantic zoom, last step: the liver lobule. Zooming far into the liver on the anatomy (or
// "Zoom into the lobule" on the liver's card) cross-fades the plate into a honeycomb of hepatic
// lobules drawn from the live model: portal triads at the corners, sinusoids running to the
// central vein with red cells moving at the model's sinusoidal flow, hepatocyte plates, stellate
// cells that activate with fibrosis, collagen where the model puts resistance (portal tract,
// sinusoids, central vein, bridging septa in cirrhosis), and zone-3 congestion when the outflow
// pressure rises. Zooming back out returns to the liver. It replaces the old Lobule instrument.

import { store, updateParams } from './store.js?v=e9304c5ee2';
import { h, fmt, clamp, cssVar } from './util.js?v=13768f12bf';
import { pressureColor } from './colormap.js?v=fa78a29bc0';
import { NODES, EDGES } from '../engine/topology.js?v=44e0aca402';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const TAU = Math.PI * 2;
const COLLAGEN = 'rgba(236, 222, 186, A)';
const col = (a) => COLLAGEN.replace('A', a.toFixed(3));

// Deterministic jitter so the tissue does not shimmer between frames.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function createLobuleZoom({ host, onWheel, onBack }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const cv = h('canvas', { class: 'lz-canvas', role: 'img', 'aria-label': 'Liver lobule microcirculation' });
  let lobe = 'R';
  const lobeSeg = h('div', { class: 'seg' }, [['R', 'Right lobe'], ['L', 'Left lobe']].map(([v, l]) => {
    const b = h('button', { 'aria-pressed': String(v === lobe) }, l);
    b.addEventListener('click', () => { lobe = v; lobeSeg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); if (F) update(F); });
    return b;
  }));
  const fibBtns = h('div', { class: 'lz-fib' }, h('span', { class: 'lz-k' }, 'Add fibrosis'), [['pre', 'Portal tract'], ['sin', 'Sinusoids'], ['post', 'Central vein']].map(([z, l]) =>
    h('button', { class: 'btn sm', onclick: () => updateParams((p) => { p.fibrosis[lobe][z] = +Math.min(80, p.fibrosis[lobe][z] * 1.5).toFixed(2); return p; }, { label: `Fibrosis · ${l.toLowerCase()}` }) }, '+ ' + l)),
  h('button', { class: 'btn sm ghost', onclick: () => updateParams((p) => { p.fibrosis[lobe] = { pre: 1, sin: 1, post: 1 }; return p; }, { label: 'Clear lobule fibrosis' }) }, 'Clear'));
  const stats = h('dl', { class: 'lz-stats' });
  const legend = h('div', { class: 'lz-legend', 'aria-hidden': 'true' },
    [['lg-pv', 'Portal venule'], ['lg-ha', 'Hepatic arteriole'], ['lg-bd', 'Bile ductule'], ['lg-hsc', 'Stellate cell'], ['lg-col', 'Collagen']].map(([c, t]) => h('span', {}, h('i', { class: c }), t)));
  const back = h('button', { class: 'btn sm', onclick: () => onBack?.() }, '← Back to the liver');
  const el = h('div', { class: 'lz', 'aria-hidden': 'true' },
    cv,
    h('div', { class: 'lz-top' }, back, lobeSeg),
    h('div', { class: 'lz-side' }, h('div', { class: 'lz-title' }, 'Hepatic lobule'), stats, fibBtns, legend));
  host.append(el);
  el.addEventListener('wheel', (ev) => { ev.preventDefault(); onWheel?.(ev); }, { passive: false });

  let F = null, fade = 0, raf = 0, last = 0;
  const pc = (p) => (model?.hide ? '#A0939C' : pressureColor(p));
  let geo = null, geoKey = '';
  const tissue = document.createElement('canvas');
  let tissueKey = '', ink = { bg: '#fff', text: '#222' };
  const parts = [];          // red cells: [lobuleIndex, sinusoidIndex, u]
  let model = null;

  function build(w, hh) {
    const R = Math.min(w * 0.36, hh * 0.40);
    const cx = w * (w > 900 ? 0.44 : 0.5), cy = hh * 0.53;
    const lobules = [[cx, cy, 1]];
    for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3, d = Math.sqrt(3) * R; lobules.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0]); }
    const r = rng(7);
    const L = lobules.map(([x, y, main], li) => {
      const corners = Array.from({ length: 6 }, (_, i) => [x + Math.cos((i * Math.PI) / 3) * R, y + Math.sin((i * Math.PI) / 3) * R]);
      const sins = [];
      const perEdge = main ? 6 : 4;
      for (let i = 0; i < 6; i++) {
        const [ax, ay] = corners[i], [bx, by] = corners[(i + 1) % 6];
        for (let k = 1; k <= perEdge; k++) {
          const t = k / (perEdge + 1) + (r() - 0.5) * 0.05, sx = ax + (bx - ax) * t, sy = ay + (by - ay) * t;
          const n = 14, ph = r() * TAU, amp = R * (0.012 + r() * 0.012), pts = [];
          const dx = x - sx, dy = y - sy, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
          for (let j = 0; j <= n; j++) {
            const u = j / n, wig = Math.sin(u * 7 + ph) * amp * Math.sin(u * Math.PI);
            const uu = u * 0.89;   // stop at the central vein wall
            pts.push([sx + dx * uu + nx * wig, sy + dy * uu + ny * wig]);
          }
          sins.push(pts);
        }
      }
      const nuclei = [];
      for (let i = 0; i < (main ? 150 : 40); i++) { const a = r() * TAU, d = Math.sqrt(r()) * R * 0.82; nuclei.push([x + Math.cos(a) * d, y + Math.sin(a) * d, 0.6 + r() * 0.5]); }
      const hsc = [];
      for (let i = 0; i < (main ? 16 : 5); i++) { const s = sins[Math.floor(r() * sins.length)], j = 3 + Math.floor(r() * 8); hsc.push([s[j][0] + (r() - 0.5) * 6, s[j][1] + (r() - 0.5) * 6, r() * TAU]); }
      return { x, y, main, corners, sins, nuclei, hsc };
    });
    parts.length = 0;
    L.forEach((l, li) => l.sins.forEach((_, si) => { for (let k = 0; k < (l.main ? 3 : 1); k++) parts.push([li, si, (k / 3 + si * 0.137) % 1]); }));
    return { R, L, w, hh };
  }
  const at = (pts, u) => { const f = u * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), t = f - i; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]; };

  function update(f) {
    F = f;
    if (fade <= 0) return;
    const p = f.params || store.get().params;
    const S = lobe === 'R' ? { pv: 'RPV', sin: 'SIN_R', cv: 'CV_R', q: 'SIN_RR', a: 'A_HR' } : { pv: 'LPV', sin: 'SIN_L', cv: 'CV_L', q: 'SIN_LL', a: 'A_HL' };
    const H = store.get().healthy;
    const P1 = f.P[NI[S.pv]], P2 = f.P[NI[S.sin]], P3 = f.P[NI[S.cv]];
    const Q = (f.Qf || f.Q)[EI[S.q]], Q0 = H?.Q?.[EI[S.q]] || Q || 1;
    const fib = p.fibrosis[lobe], s = p.cirrhosis;
    const zone = { pre: (1 + 2 * s) * fib.pre, sin: (1 + 20 * s ** 2.5) * fib.sin, post: (1 + 2 * s) * fib.post };
    const cong = Math.max(0, P3 - (H?.P?.[NI[S.cv]] ?? P3));
    legend.querySelector('.lg-pv').style.background = pc(P1);
    model = { P1, P2, P3, flow: clamp(Q / Q0, 0, 3), zone, s, cong };
    // In a case where pressures are unmeasured, the lobule shows anatomy only.
    const hide = !!store.get().imaging;
    model.hide = hide;
    const mm = (v) => (hide ? '?' : `${fmt(v, 1)} mmHg`);
    stats.replaceChildren(
      h('dt', {}, 'Portal venule'), h('dd', {}, mm(P1)),
      h('dt', {}, 'Sinusoids'), h('dd', {}, mm(P2)),
      h('dt', {}, 'Central vein'), h('dd', {}, mm(P3)),
      h('dt', {}, 'Sinusoidal flow'), h('dd', {}, `${Math.round((Q / Q0) * 100)} % of normal`),
      h('dt', {}, 'Resistance'), h('dd', {}, `pre ×${fmt(zone.pre, 1)} · sin ×${fmt(zone.sin, 1)} · post ×${fmt(zone.post, 1)}`),
      h('dt', {}, 'Hepatic lymph'), h('dd', {}, `${fmt(f.metrics.ascites.hepLymph, 1)} mL/min`));
    cv.setAttribute('aria-label', `Liver lobule, ${lobe === 'R' ? 'right' : 'left'} lobe: portal venule ${fmt(P1, 1)}, sinusoids ${fmt(P2, 1)}, central vein ${fmt(P3, 1)} millimeters of mercury; sinusoidal flow ${Math.round((Q / Q0) * 100)} percent of normal.`);
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function loop(now) {
    raf = 0;
    if (fade <= 0 || !model) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    draw(reduce.matches ? 0 : dt);
    raf = requestAnimationFrame(loop);
  }

  function draw(dt) {
    const r = host.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = Math.max(1, Math.round(r.width)), HH = Math.max(1, Math.round(r.height));
    if (cv.width !== W * dpr || cv.height !== HH * dpr) { cv.width = W * dpr; cv.height = HH * dpr; }
    const key = W + 'x' + HH;
    if (key !== geoKey) { geo = build(W, HH); geoKey = key; }
    const { P1, P2, P3, flow, zone, s, cong } = model;
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    const { R, L } = geo;
    const sinW = Math.max(1.1, R * 0.014 / Math.max(1, zone.sin) ** 0.18);
    // The tissue only changes with the model, so it is painted once into an offscreen layer and
    // each frame just moves the red cells over it.
    const q = (v) => Math.round(v * 2) / 2;   // half-mmHg steps: finer changes are invisible in color
    const tkey = [key, dpr, dark, q(P1), q(P2), q(P3), zone.pre.toFixed(2), zone.sin.toFixed(2), zone.post.toFixed(2), s.toFixed(2), q(cong), !!model.hide].join('|');
    if (tkey !== tissueKey) { tissueKey = tkey; paintTissue(W, HH, dpr, dark, sinW); }
    const c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(tissue, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Red cells moving triad → central vein at the model's sinusoidal flow.
    const speed = 0.12 * flow;
    c.fillStyle = dark ? 'rgba(255, 120, 140, .95)' : 'rgba(150, 18, 40, .85)';
    // One path per tier (central lobule, neighbours): a single fill each, not one per cell.
    for (const main of [true, false]) {
      c.globalAlpha = main ? 1 : 0.4;
      c.beginPath();
      for (const pt of parts) {
        const l = L[pt[0]];
        if (!!l.main !== main) continue;
        pt[2] = (pt[2] + dt * speed * (0.85 + (pt[1] % 5) * 0.06)) % 1;
        const [x, y] = at(l.sins[pt[1]], pt[2]);
        c.moveTo(x + sinW * 0.55 + 0.6, y);
        c.ellipse(x, y, sinW * 0.55 + 0.6, sinW * 0.4 + 0.5, 0, 0, TAU);
      }
      c.fill();
    }
    c.globalAlpha = 1;
    // Station labels on the central lobule.
    const lab = (t, x, y, align = 'center') => {
      c.font = `600 12px Inter, system-ui, sans-serif`; c.textAlign = align; c.textBaseline = 'middle';
      c.lineWidth = 4; c.strokeStyle = ink.bg; c.strokeText(t, x, y);
      c.fillStyle = ink.text; c.fillText(t, x, y);
    };
    const m = L[0], cr = m.corners;
    const mm = (v, u = ' mmHg') => (model.hide ? '' : ` · ${fmt(v, 1)}${u}`);
    lab(`Central vein${mm(P3)}`, m.x, m.y + R * 0.2);
    lab(`Portal triad${mm(P1)}`, cr[5][0], cr[5][1] - R * 0.2);
    const sm = at(m.sins[Math.floor(m.sins.length * 0.08)], 0.5);
    lab(`Sinusoids${mm(P2, '')}`, sm[0] + 10, sm[1] - 14, 'left');
    if (s > 0.2) lab(`Capillarization: fenestrae closing`, m.x, cr[1][1] + R * 0.14);
  }

  function paintTissue(W, HH, dpr, dark, sinW) {
    if (tissue.width !== W * dpr || tissue.height !== HH * dpr) { tissue.width = W * dpr; tissue.height = HH * dpr; }
    const c = tissue.getContext('2d');
    ink = { bg: cssVar('--bg') || '#fff', text: cssVar('--text') || '#222' };
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { P1, P2, P3, zone, s, cong } = model;
    c.fillStyle = cssVar('--bg') || (dark ? '#0B1120' : '#FBFAF7');
    c.fillRect(0, 0, W, HH);
    const { R, L } = geo;
    const fibSin = clamp(Math.log(zone.sin) / 3.2, 0, 1), fibPre = clamp(Math.log(zone.pre) / 2.4, 0, 1), fibPost = clamp(Math.log(zone.post) / 2.4, 0, 1);
    const congU = clamp(cong / 12, 0, 1);
    const plate = dark ? [168, 132, 118] : [214, 170, 150];

    for (const l of L) {
      c.save();
      c.globalAlpha = l.main ? 1 : 0.42;
      // Hepatocyte plates: the lobule's own tissue, paler toward the central vein when congested.
      c.beginPath(); l.corners.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
      const g = c.createRadialGradient(l.x, l.y, R * 0.08, l.x, l.y, R);
      g.addColorStop(0, `rgba(${plate.map((v) => Math.round(v * (1 - 0.25 * congU))).join(',')},${0.85 - 0.3 * congU})`);
      g.addColorStop(1, `rgba(${plate.join(',')},.9)`);
      c.fillStyle = g; c.fill();
      c.save(); c.clip();
      // Nuclei in the plates.
      c.fillStyle = dark ? 'rgba(70,40,60,.55)' : 'rgba(95,55,80,.35)';
      for (const [x, y, k] of l.nuclei) { c.beginPath(); c.arc(x, y, R * 0.009 * k + 0.8, 0, TAU); c.fill(); }
      // Sinusoids: blood channels from the triads to the central vein, colored by pressure.
      for (const pts of l.sins) {
        const gr = c.createLinearGradient(pts[0][0], pts[0][1], pts[pts.length - 1][0], pts[pts.length - 1][1]);
        gr.addColorStop(0, pc(P2)); gr.addColorStop(1, pc(P3));
        c.strokeStyle = gr; c.lineCap = 'round'; c.lineJoin = 'round';
        c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.lineWidth = sinW; c.stroke();
        if (congU > 0.05) { // zone-3 dilation: the last third of each sinusoid widens and darkens
          c.strokeStyle = `rgba(120, 20, 40, ${0.55 * congU})`; c.lineWidth = sinW * (1 + 1.6 * congU); c.lineCap = 'butt';
          c.beginPath(); pts.slice(Math.floor(pts.length * 0.62)).forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
        }
        if (fibSin > 0.05) { // perisinusoidal collagen (capillarization): a pale sleeve in the space of Disse
          c.strokeStyle = col(0.75 * fibSin); c.lineWidth = 1; c.setLineDash([3, 2.5]);
          c.beginPath(); pts.slice(2, -2).forEach(([x, y], i) => (i ? c.lineTo(x + sinW * 0.9, y) : c.moveTo(x + sinW * 0.9, y))); c.stroke(); c.setLineDash([]);
        }
      }
      // Stellate (Ito) cells: quiescent with lipid droplets; activated they turn into
      // myofibroblasts, larger and star-shaped.
      const act = clamp(Math.max(fibSin, s * 0.9), 0, 1);
      for (const [x, y, a] of l.hsc) {
        const n = 5, rr = R * (0.012 + 0.018 * act);
        c.strokeStyle = act > 0.25 ? `rgba(176, 104, 48, ${0.5 + 0.4 * act})` : 'rgba(150, 128, 70, .6)'; c.lineWidth = 1.1;
        c.beginPath(); for (let i = 0; i < n; i++) { const b = a + (i * TAU) / n; c.moveTo(x, y); c.lineTo(x + Math.cos(b) * rr * 2.1, y + Math.sin(b) * rr * 2.1); } c.stroke();
        c.fillStyle = act > 0.25 ? `rgba(176, 104, 48, ${0.6 + 0.3 * act})` : 'rgba(226, 196, 90, .85)';
        c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill();
      }
      c.restore();
      // Bridging septa in cirrhosis: collagen along the lobule borders and from triad to vein.
      if (s > 0.35) {
        const u = clamp((s - 0.35) / 0.5, 0, 1);
        c.strokeStyle = col(0.35 + 0.5 * u); c.lineWidth = R * (0.02 + 0.06 * u); c.lineJoin = 'round';
        c.beginPath(); l.corners.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.stroke();
        if (u > 0.4) { c.lineWidth = R * 0.025 * u; c.beginPath(); for (const i of [0, 3]) { c.moveTo(l.corners[i][0], l.corners[i][1]); c.lineTo(l.x, l.y); } c.stroke(); }
      } else {
        c.strokeStyle = dark ? 'rgba(255,255,255,.08)' : 'rgba(80,50,50,.12)'; c.lineWidth = 1;
        c.beginPath(); l.corners.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.stroke();
      }
      // Central vein.
      const rcv = R * (0.075 + 0.05 * congU);
      if (fibPost > 0.05) { c.fillStyle = col(0.3 + 0.55 * fibPost); c.beginPath(); c.arc(l.x, l.y, rcv * (1.5 + fibPost), 0, TAU); c.fill(); }
      c.fillStyle = pc(P3); c.beginPath(); c.arc(l.x, l.y, rcv, 0, TAU); c.fill();
      c.strokeStyle = dark ? 'rgba(255,255,255,.5)' : 'rgba(40,30,40,.45)'; c.lineWidth = 1.2; c.stroke();
      c.restore();
    }
    // Portal triads at the corners (shared between lobules): venule, arteriole, bile ductule.
    const seen = new Set();
    for (const l of L) for (const [x, y] of l.corners) {
      const k = Math.round(x) + ',' + Math.round(y);
      if (seen.has(k)) continue; seen.add(k);
      const near = Math.hypot(x - L[0].x, y - L[0].y) < R * 1.05;
      c.save(); c.globalAlpha = near ? 1 : 0.45;
      const rt = R * 0.1;
      c.fillStyle = col(0.45 + 0.5 * fibPre); c.beginPath(); c.arc(x, y, rt * (1 + 0.9 * fibPre), 0, TAU); c.fill();
      c.fillStyle = pc(P1); c.beginPath(); c.ellipse(x - rt * 0.25, y + rt * 0.05, rt * 0.5, rt * 0.38, 0.3, 0, TAU); c.fill();
      c.fillStyle = cssVar('--artery') || '#C0392B'; c.beginPath(); c.arc(x + rt * 0.42, y - rt * 0.28, rt * 0.17, 0, TAU); c.fill();
      c.strokeStyle = '#6E9B4E'; c.lineWidth = 1.6; c.beginPath(); c.arc(x + rt * 0.38, y + rt * 0.36, rt * 0.14, 0, TAU); c.stroke();
      c.restore();
    }
  }

  return {
    el,
    update,
    /** 0 = hidden, 1 = fully in the lobule. */
    setFade(u) {
      const was = fade;
      fade = clamp(u, 0, 1);
      el.style.opacity = fade.toFixed(3);
      el.classList.toggle('on', fade > 0.98);
      el.setAttribute('aria-hidden', String(fade < 0.98));
      if (fade > 0 && was === 0 && F) update(F);
      if (fade === 0) { cancelAnimationFrame(raf); raf = 0; last = 0; }
    },
    isOpen: () => fade > 0.98,
    setLobe(l) { if (l === 'R' || l === 'L') { lobe = l; lobeSeg.querySelectorAll('button').forEach((x, i) => x.setAttribute('aria-pressed', String((i === 0) === (l === 'R')))); } },
  };
}
