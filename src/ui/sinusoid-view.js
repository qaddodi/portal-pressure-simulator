// Semantic zoom, one level below the lobule: a stretch of one sinusoid, cut along its length, drawn in
// the lobule's own language (a flat pressure-coloured lumen in a dark casing with chevrons and a
// shimmer, the pale green lymph, the hepatocyte plates). Blood runs from the portal triad (left, or
// top on a portrait screen) to the central vein.
//
// What it is for: the wall, and what crosses it. Plasma filters out of the lumen through the
// fenestrae into the space of Disse; albumin (amber) goes with it while the pores are open and is
// turned back once they close; the lymph so made runs back along Disse toward the portal triad. The
// rates are the engine's: filtration from the hepatic lymph flow, the albumin that gets through from
// the lymph's protein, the pores from the sinusoidal reflection coefficient (engine.js starling()).
// So a healthy liver and right heart failure show an open wall with protein-rich lymph (fast in
// heart failure), and cirrhosis a sealed, capillarized wall with thin, protein-poor lymph.
//
// Also from the lobule's model (lobule-model.js): collagen and a basement membrane in Disse and
// flattened microvilli with sinusoidal fibrosis, the stellate cell's activation, the lumen's width.
// Every one of these eases to its new value, so nothing jumps.
//
// Two canvases: the tissue, redrawn only when its state changes, and the moving marks over it.

import { store } from './store.js?v=06e2d6e179';
import { h, s, fmt, clamp, lerp } from './util.js?v=86153645a3';
import { pressureColor, deltaColor, heatColor } from './colormap.js?v=6d64a94345';
import { sinusoidTargets } from './sinusoid-model.js?v=74f5d007ca';

const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rng(seed) { let q = seed >>> 0; return () => { q = (q * 1664525 + 1013904223) >>> 0; return q / 4294967296; }; }
// Sizes in micrometres. The lumen and the cells are to scale; the space of Disse, the endothelium and
// its fenestrae are drawn several times larger than life, or the traffic across them would not show.
const UM = { lum: 5, endo: 0.8, disse: 3.4, hep: 20, cell: 24 };

export function createSinusoidView({ host, onBack }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const phoneMQ = matchMedia('(max-width: 720px)');
  const tissue = h('canvas', { class: 'sv-canvas', role: 'img', 'aria-label': 'A sinusoid, cut along its length' });
  const fx = h('canvas', { class: 'sv-canvas', 'aria-hidden': 'true' });
  const leaders = s('svg', { class: 'lz-leaders', 'aria-hidden': 'true' });
  const labels = h('div', { class: 'lz-labels' });
  const legend = h('div', { class: 'sv-legend', 'aria-hidden': 'true' },
    h('span', {}, h('i', { class: 'alb' }), 'Albumin'), h('span', {}, h('i', { class: 'wat' }), 'Plasma water'), h('span', {}, h('i', { class: 'lym' }), 'Lymph, back to the portal triad'));
  const back = h('button', { class: 'sv-back', type: 'button', 'aria-label': 'Back to the lobule' }, h('span', { 'aria-hidden': 'true' }, '‹'), ' Lobule');
  back.addEventListener('click', () => onBack?.());
  const el = h('div', { class: 'sv', 'aria-hidden': 'true' }, tissue, fx, leaders, labels, legend, back);
  host.append(el);

  // ── Leaving by zooming out: the wheel, a pinch or the zoom buttons (lobule-zoom.js) ──
  let wheelOut = 0, wheelT = 0;
  el.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    if (!open) return;
    const now = performance.now();
    if (now - wheelT > 300) wheelOut = 0;
    wheelT = now;
    wheelOut = Math.max(0, wheelOut + ev.deltaY * (ev.ctrlKey ? 3 : 1));
    if (wheelOut > 120) { wheelOut = 0; onBack?.(); }
  }, { passive: false });
  const touches = new Map();
  let pinch0 = 0;
  const spread = () => { const p = [...touches.values()]; return p.length < 2 ? 0 : Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); };
  el.addEventListener('pointerdown', (ev) => { if (!open) return; touches.set(ev.pointerId, [ev.clientX, ev.clientY]); if (touches.size === 2) pinch0 = spread(); });
  el.addEventListener('pointermove', (ev) => {
    if (!touches.has(ev.pointerId)) return;
    touches.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (touches.size === 2 && pinch0 > 0 && spread() < pinch0 * 0.72) { pinch0 = 0; onBack?.(); }
  });
  for (const t of ['pointerup', 'pointercancel']) el.addEventListener(t, (ev) => { touches.delete(ev.pointerId); if (touches.size < 2) pinch0 = 0; });

  // ── State ──
  let model = null, shown = 0, open = false, raf = 0, last = 0;
  const S = {};          // the drawing's state, easing toward sinusoidTargets(model)
  let geo = null, geoKey = '', tissueKey = '';

  // Where the sinusoid sits: centred in the space the floating pieces leave (a row kept for the legend).
  const appStyle = document.getElementById('app')?.style;
  const cssN = (k) => parseFloat(appStyle?.getPropertyValue(k)) || 0;
  function freeRect(W, H) {
    const t = cssN('--top-safe') + cssN('--cmp-h') + 8 + 40, b = H - (cssN('--bot-occ') || 100) - 8, l = 12, r = W - cssN('--right-occ') - 12;
    return { l, t, r: Math.max(l + 80, r), b: Math.max(t + 80, b) };
  }
  // The tissue is laid out once per stage size, from the middle outward (so a larger stage only adds cells
  // at the edges). It runs along the stage's longer side: across on a landscape screen, down on a portrait one.
  function ensureGeo(W, H) {
    const key = W + '|' + H;
    if (key !== geoKey) {
      geoKey = key; tissueKey = '';
      const vert = W < H * 0.95, ang = vert ? Math.PI / 2 : 0;
      const X = Math.hypot(W, H) / 6 + 30, x0 = -X, x1 = X;   // reach at the smallest scale (3 px/µm)
      // Hepatocytes: plates on both sides, each a row of cells of uneven length, with the next plate beyond.
      const plates = [];
      for (const side of [-1, 1]) for (let n = 0; n < 2; n++) {
        const row = [], seed = side > 0 ? 71 + n * 13 : 29 + n * 17;
        const cell = (R, xa, xb) => ({ x0: xa, x1: xb, nu: 0.3 + 0.4 * R(), nv: 0.4 + 0.2 * R(), nr: 2.6 + 0.5 * R(), bi: R() < 0.12, tone: R() });
        const R0 = rng(seed), first = -UM.cell * (0.3 + 0.4 * R0());
        for (let x = first, R = rng(seed + 1); x < x1;) { const l = UM.cell * (0.8 + 0.4 * R()); row.push(cell(R, x, x + l)); x += l; }
        for (let x = first, R = rng(seed + 2); x > x0;) { const l = UM.cell * (0.8 + 0.4 * R()); row.unshift(cell(R, x - l, x)); x -= l; }
        plates.push({ side, n, row });
      }
      // The stellate cell sits at a junction between two hepatocytes on the upper side, a little before the middle.
      const top = plates[0].row;
      const xs = top.reduce((b, c) => (Math.abs(c.x1 + 10) < Math.abs(b + 10) ? c.x1 : b), top[0].x1);
      // Fenestrae, gathered in sieve plates along both linings; each closes at its own threshold.
      const pores = [[], []];
      for (const i of [0, 1]) for (const dir of [1, -1]) {
        const R = rng(3 + 2 * i + (dir > 0 ? 0 : 11));
        for (let x = dir > 0 ? 0 : -1.5; Math.abs(x) < X;) {
          x += dir * (3.5 + 5 * R());
          const nP = 3 + Math.floor(R() * 3);
          for (let j = 0; j < nP; j++) { pores[i].push({ x, w: 0.55 + 0.3 * R(), th: R() }); x += dir * (1.3 + 0.5 * R()); }
        }
      }
      for (const ps of pores) ps.sort((a, b) => a.x - b.x);
      // Endothelial nuclei bulging into the lumen; the Kupffer cell on the lower lining after the middle.
      const nuclei = [[], []];
      for (const i of [0, 1]) { const R = rng(41 + i); for (let x = -X + 10 * R(); x < X; x += 38 + 22 * R()) nuclei[i].push(x); }
      // Collagen fibres in Disse: each appears at its own level of fibrosis.
      const fibres = [[], []];
      for (const i of [0, 1]) { const R = rng(91 + i); for (let j = 0; j < 9; j++) fibres[i].push({ v: 0.15 + 0.7 * R(), th: j / 9 * 0.85, ph: R() * TAU, f: 0.12 + 0.12 * R() }); }
      geo = { W, H, ang, ca: Math.cos(ang), sa: Math.sin(ang), vert, x0, x1, plates, xs, xk: 22, pores, nuclei, fibres };
    }
    // Where it is drawn: centred in the free space, the plates filling its short side. When that space
    // changes (the dock grows, a card opens) the view glides there (stepView), it does not jump.
    const f = freeRect(W, H), fw = f.r - f.l, fh = f.b - f.t;
    // How much is shown across: both plates whole on a large screen; on a phone, closer in (the plates cut by the
    // edges), so the wall and its traffic stay large enough to follow.
    const short = geo.vert ? fw : fh, across = lerp(40, 54, smooth(380, 720, short));
    VW.f = f; VW.tk = clamp(short / across, 3, 14); VW.tC = [(f.l + f.r) / 2, (f.t + f.b) / 2];
    if (!VW.k) { VW.k = VW.tk; VW.C = [...VW.tC]; }
    return geo;
  }
  const VW = { k: 0, C: [0, 0], tk: 0, tC: [0, 0], f: null, vis: [0, 0], fr: [0, 0] };
  function stepView(dt) {
    const a = dt > 0.001 ? 1 - Math.exp(-dt / 0.22) : 0;
    const d = Math.abs(VW.tk - VW.k) * 40 + Math.abs(VW.tC[0] - VW.C[0]) + Math.abs(VW.tC[1] - VW.C[1]);
    if (d < 0.05) { VW.k = VW.tk; VW.C = [...VW.tC]; }
    else { VW.k += (VW.tk - VW.k) * a; VW.C = VW.C.map((c, i) => c + (VW.tC[i] - c) * a); }
    // The stretch of sinusoid on screen, and in the free space (µm along it).
    const g = geo, loc = ([X, Y]) => ((X - VW.C[0]) * g.ca + (Y - VW.C[1]) * g.sa) / VW.k;
    const span = (pts) => { const v = pts.map(loc); return [Math.min(...v), Math.max(...v)]; };
    const [a0, a1] = span([[0, 0], [g.W, 0], [0, g.H], [g.W, g.H]]);
    VW.vis = [Math.max(g.x0, a0 - 8), Math.min(g.x1, a1 + 8)];
    VW.fr = span([[VW.f.l, VW.f.t], [VW.f.r, VW.f.b]]);
    return d >= 0.05;
  }
  // Local (µm, along/across) → stage px.
  const toScreen = (x, y) => { const g = geo; return [VW.C[0] + VW.k * (x * g.ca - y * g.sa), VW.C[1] + VW.k * (x * g.sa + y * g.ca)]; };

  // The lumen's half width at x (the stellate cell's squeeze is a gentle waist around it), and Disse's width.
  const halfW = (x) => UM.lum * S.lum * (1 - S.pinch * Math.exp(-(((x - geo.xs) / 11) ** 2))) + 0.15 * Math.sin(x * 0.11 + 1.3);
  const disseW = (x) => UM.disse * (1 + 0.25 * S.col) + 0.2 * Math.sin(x * 0.07);
  const wallIn = (x) => halfW(x) + UM.endo;            // Disse's lumen side (under the endothelium)
  const hepIn = (x) => wallIn(x) + disseW(x);          // the hepatocytes' face on Disse

  function stepState(dt) {
    if (!model) return false;
    const T = sinusoidTargets(model);
    let moving = false;
    const a = dt > 0 ? 1 - Math.exp(-dt / 0.32) : 1;
    for (const k in T) {
      if (S[k] == null) { S[k] = T[k]; continue; }
      const d = T[k] - S[k];
      if (Math.abs(d) > 1e-4) { S[k] += d * a; moving = true; } else S[k] = T[k];
    }
    return moving;
  }

  // ── Colours, from the theme's tokens as the lobule takes them ──
  function palette(dark, cs) {
    const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    const trip = (n, d) => { const k = v(n, d).split(/[\s,/]+/).map(Number); return k.length >= 3 && k.every(Number.isFinite) ? k.slice(0, 3) : d.split(' ').map(Number); };
    const casing = trip('--casing-rgb', dark ? '214 222 246' : '30 24 40'), casA = parseFloat(v('--casing-a', dark ? '.34' : '.56')) || 0.5;
    const bg = v('--stage-bg', v('--bg', dark ? '#0E1422' : '#FBFAF7'));
    const m = model, M = m.mode;
    const lumen = m.hide ? (dark ? '#58607A' : '#A0939C') : M === 'delta' ? deltaColor(m.dP[1]) : M === 'heat' ? heatColor(m.dP[1]) : pressureColor(m.P2);
    // Lymph: clear and faintly green, deeper with more protein (as the lobule's lymphatics).
    const p = S.prot ?? 1, lo = dark ? [0.72, 0.76, 0.69] : [0.92, 0.94, 0.88], mid = dark ? [0.7, 0.77, 0.66] : [0.88, 0.92, 0.82], hi = dark ? [0.64, 0.75, 0.58] : [0.82, 0.89, 0.74];
    const ly = (p < 0.45 ? lo.map((x, i) => lerp(x, mid[i], p / 0.45)) : mid.map((x, i) => lerp(x, hi[i], (p - 0.45) / 0.55))).map((x) => Math.round(x * 255));
    return {
      bg, lumen, casing, casA,
      cas: `rgba(${casing.join(',')}, ${casA})`,
      lymph: dark ? `rgba(${ly.join(',')}, .3)` : `rgb(${ly.join(',')})`, lymphEdge: dark ? 'rgba(150, 200, 140, .35)' : 'rgba(96, 140, 80, .32)',
      cell: v('--og-liver-1', dark ? '#85514F' : '#E9C3B6'), gap: v('--og-liver-2', dark ? '#5A3440' : '#C98E7E'),
      nuc: dark ? 'rgba(30, 14, 28, .26)' : 'rgba(110, 60, 84, .22)',
      col: dark ? [199, 186, 153] : [237, 222, 186], bm: dark ? 'rgba(236, 220, 170, .75)' : 'rgba(150, 118, 70, .8)',
      bile: dark ? 'rgb(150, 156, 80)' : 'rgb(122, 128, 61)',
      kup: dark ? '#7C6A9C' : '#A795C3', kupNuc: dark ? 'rgba(30, 16, 50, .5)' : 'rgba(70, 40, 100, .42)',
      chev: dark ? 'rgba(10, 12, 20, .5)' : 'rgba(20, 20, 26, .5)',
      alb: dark ? '#F2B64A' : '#E39A1E', albEdge: dark ? 'rgba(60, 30, 0, .6)' : 'rgba(120, 64, 0, .6)', water: dark ? 'rgba(235, 245, 255, .9)' : 'rgba(255, 255, 255, .95)', waterEdge: dark ? 'rgba(0, 0, 0, .35)' : 'rgba(60, 90, 120, .45)',
    };
  }
  const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return `rgb(${A.map((x, i) => Math.round(lerp(x, B[i], t))).join(',')})`; };
  const rgbCv = document.createElement('canvas').getContext('2d'), rgbMemo = new Map();
  function rgb(c) {
    let o = rgbMemo.get(c);
    if (o) return o;
    rgbCv.fillStyle = '#000'; rgbCv.fillStyle = c;
    const f = rgbCv.fillStyle;
    o = f[0] === '#' ? [1, 3, 5].map((i) => parseInt(f.slice(i, i + 2), 16)) : f.match(/[\d.]+/g).slice(0, 3).map(Number);
    rgbMemo.set(c, o);
    return o;
  }

  // ── The tissue (cached) ──
  const xsOf = () => { const a = []; for (let i = 0; i <= 140; i++) a.push(lerp(VW.vis[0], VW.vis[1], i / 140)); return a; };
  function band(c, xs, f0, f1, fill) {
    c.fillStyle = fill; c.beginPath();
    xs.forEach((x, i) => (i ? c.lineTo(x, f0(x)) : c.moveTo(x, f0(x))));
    for (let i = xs.length - 1; i >= 0; i--) c.lineTo(xs[i], f1(xs[i]));
    c.closePath(); c.fill();
  }
  const line = (c, xs, f) => { c.beginPath(); xs.forEach((x, i) => (i ? c.lineTo(x, f(x)) : c.moveTo(x, f(x)))); c.stroke(); };
  function paintTissue(c, P, dark) {
    const g = geo, xs = xsOf();
    c.fillStyle = P.bg; c.fillRect(VW.vis[0] - 10, -300, VW.vis[1] - VW.vis[0] + 20, 600);
    const per = UM.hep + 2 * UM.disse + 2 * UM.endo + 2 * UM.lum;   // one plate and one sinusoid
    for (const side of [-1, 1]) {
      const yIn = (x) => side * hepIn(x);
      for (const pl of g.plates.filter((p) => p.side === side)) {
        const off = pl.n * per, a0 = (x) => yIn(x) + side * off, a1 = (x) => yIn(x) + side * (off + UM.hep);
        // The plate: the cells' borders as ground, the cells over it (as the lobule draws its plates).
        c.globalAlpha = dark ? 0.55 : 0.5; band(c, xs, a0, a1, P.gap); c.globalAlpha = 1;
        for (const k of pl.row) if (k.x1 > VW.vis[0] && k.x0 < VW.vis[1]) paintCell(c, P, k, a0, a1, side, dark);
        // The next sinusoid beyond the plate: its Disse, lining and lumen, quietly.
        if (pl.n === 0) {
          const b0 = (x) => a1(x) + side * UM.disse, b1 = (x) => b0(x) + side * UM.endo, b2 = (x) => b1(x) + side * 2 * UM.lum, b3 = (x) => b2(x) + side * UM.endo;
          band(c, xs, a1, b0, P.lymph);
          band(c, xs, b1, b2, P.lumen);
          band(c, xs, b0, b1, P.cas); band(c, xs, b2, b3, P.cas);
          band(c, xs, b3, (x) => b3(x) + side * UM.disse, P.lymph);
        }
      }
      // Space of Disse: lymph, then collagen as fibrosis comes, the microvilli reaching into it.
      const e1 = (x) => side * wallIn(x);
      band(c, xs, e1, yIn, P.lymph);
      c.strokeStyle = P.lymphEdge; c.lineWidth = 0.18; line(c, xs, yIn);
      paintCollagen(c, P, side, xs, e1, yIn);
      paintMicrovilli(c, P, side, e1, yIn, dark);
    }
    paintStellate(c, P, dark);
    // The lumen, flat as the lobule's: a thin light line along its upper side, a thin dark one along the lower.
    band(c, xs, (x) => -halfW(x), (x) => halfW(x), P.lumen);
    c.lineWidth = 0.35;
    c.strokeStyle = 'rgba(255, 255, 255, .32)'; line(c, xs, (x) => -halfW(x) + 0.55);
    c.strokeStyle = 'rgba(0, 0, 0, .1)'; line(c, xs, (x) => halfW(x) - 0.55);
    for (const side of [-1, 1]) paintEndothelium(c, P, side);
    // Focus: beyond this sinusoid's own plates the tissue fades into the page.
    const bq = rgb(P.bg);
    for (const side of [-1, 1]) {
      const y0 = side * (UM.lum * S.lum + UM.endo + disseW(0) + UM.hep * 0.85), y1 = y0 + side * 18;
      const gr = c.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, `rgba(${bq.join(',')}, 0)`); gr.addColorStop(1, `rgba(${bq.join(',')}, ${dark ? 0.75 : 0.7})`);
      c.fillStyle = gr; c.fillRect(VW.vis[0] - 10, Math.min(y0, side * 300), VW.vis[1] - VW.vis[0] + 20, Math.abs(side * 300 - y0));
    }
  }
  function paintCell(c, P, k, a0, a1, side, dark) {
    const gp = 0.45, r = 2.2, x0 = k.x0 + gp + r, x1 = k.x1 - gp - r;
    if (x1 <= x0) return;
    const n = 8, pts = [];
    for (let i = 0; i <= n; i++) { const x = lerp(x0, x1, i / n); pts.push([x, a0(x) + side * (gp + r)]); }
    for (let i = n; i >= 0; i--) { const x = lerp(x0, x1, i / n); pts.push([x, a1(x) - side * (gp + r)]); }
    const base = rgb(P.cell), gap = rgb(P.gap), t = 0.88 + 0.12 * k.tone;
    const col = (dark ? base.map((x, i) => lerp(gap[i], x, 0.28)) : base).map((x) => Math.round(x * t + (1 - t) * (dark ? 0.15 : 1) * 0.3 * 255));
    const bgc = rgb(P.bg), under = gap.map((x, i) => lerp(bgc[i], x, dark ? 0.55 : 0.5)), al = dark ? 0.8 : 0.92;
    c.fillStyle = `rgb(${col.map((x, i) => Math.round(lerp(under[i], x, al))).join(',')})`;   // opaque: the rounding stroke overlaps the fill
    c.strokeStyle = c.fillStyle; c.lineWidth = 2 * r; c.lineJoin = 'round';
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); c.stroke();
    // Nucleus (two in some hepatocytes): a flat, faint disc, as on the lobule.
    const at = (u, v) => { const x = lerp(k.x0 + 2, k.x1 - 2, u); return [x, lerp(a0(x) + side * 2, a1(x) - side * 2, v)]; };
    c.fillStyle = P.nuc;
    for (const [u, v] of k.bi ? [[k.nu - 0.15, k.nv], [k.nu + 0.15, k.nv + 0.04]] : [[k.nu, k.nv]]) {
      const [x, y] = at(u, v); c.beginPath(); c.arc(x, y, k.bi ? k.nr * 0.82 : k.nr, 0, TAU); c.fill();
    }
    // A bile canaliculus between this cell and the next, mid-plate: dull olive, as the lobule's bile.
    const xb = k.x1, yb = lerp(a0(xb), a1(xb), 0.5);
    c.fillStyle = P.bile; c.beginPath(); c.ellipse(xb, yb, 0.7, 0.55, 0, 0, TAU); c.fill();
  }
  function paintCollagen(c, P, side, xs, e1, yIn) {
    const g = geo, col = S.col;
    const near = (x) => (side < 0 ? Math.exp(-(((x - g.xs) / 26) ** 2)) * S.act : 0);   // denser by the stellate cell that makes it
    if (col > 0.02) {
      // A pale fill first, as the collagen takes the space the lymph had.
      c.globalAlpha = 0.55 * smooth(0.1, 0.9, col); band(c, xs, e1, yIn, `rgb(${P.col.join(',')})`); c.globalAlpha = 1;
      c.lineCap = 'round';
      for (const fb of g.fibres[side < 0 ? 0 : 1]) {
        const a = smooth(fb.th, fb.th + 0.18, col);
        if (a <= 0.01) continue;
        c.strokeStyle = `rgba(${P.col.map((x) => Math.round(x * 0.82)).join(',')}, ${(0.85 * a).toFixed(3)})`; c.lineWidth = 0.28 + 0.2 * a;
        line(c, xs, (x) => lerp(e1(x), yIn(x), clamp(fb.v + 0.12 * Math.sin(x * fb.f + fb.ph) + 0.08 * near(x), 0.05, 0.95)));
      }
    }
    // Basement membrane: a continuous line just under the endothelium, as the sinusoid becomes a capillary.
    if (S.bm > 0.02) { c.strokeStyle = P.bm; c.globalAlpha = S.bm; c.lineWidth = 0.3 + 0.2 * S.bm; line(c, xs, (x) => e1(x) + side * 0.3); c.globalAlpha = 1; }
  }
  function paintMicrovilli(c, P, side, e1, yIn, dark) {
    const L = S.mv;
    c.strokeStyle = mix(P.cell, dark ? '#000' : P.gap, dark ? 0.08 : 0.2); c.lineWidth = 0.26; c.lineCap = 'round';
    c.beginPath();
    for (let i = Math.floor(VW.vis[0] / 0.9); i * 0.9 < VW.vis[1]; i++) {
      const x = i * 0.9, y0 = yIn(x), l = Math.abs(yIn(x) - e1(x)) * 0.5 * L * (0.55 + 0.45 * Math.abs(Math.sin(i * 2.17)));
      c.moveTo(x, y0); c.lineTo(x + 0.12 * Math.sin(i), y0 - side * l);
    }
    c.stroke();
  }
  // Open width of a pore (µm): each closes smoothly at its own threshold as the wall seals.
  const poreW = (p) => p.w * smooth(p.th - 0.14, p.th + 0.14, S.por);
  // The endothelium: the vessel's casing, with the fenestrae as gaps through it.
  function paintEndothelium(c, P, side) {
    const g = geo, pores = g.pores[side < 0 ? 0 : 1];
    const y0 = (x) => side * halfW(x), y1 = (x) => side * wallIn(x);
    const segs = [];
    let from = VW.vis[0];
    for (const p of pores) {
      if (p.x < VW.vis[0] || p.x > VW.vis[1]) continue;
      const w = poreW(p);
      if (w < 0.05) continue;
      segs.push([from, p.x - w / 2]); from = p.x + w / 2;
    }
    segs.push([from, VW.vis[1]]);
    c.fillStyle = P.cas;
    c.beginPath();
    for (const [a, b] of segs) {
      if (b <= a) continue;
      const n = Math.max(2, Math.ceil((b - a) / 2));
      for (let i = 0; i <= n; i++) { const x = lerp(a, b, i / n); i ? c.lineTo(x, y0(x)) : c.moveTo(x, y0(x)); }
      for (let i = n; i >= 0; i--) { const x = lerp(a, b, i / n); c.lineTo(x, y1(x)); }
      c.closePath();
    }
    c.fill();
    // Endothelial nuclei: flat lenses of the same casing, bulging into the lumen.
    for (const x of g.nuclei[side < 0 ? 0 : 1]) {
      if ((side > 0 && Math.abs(x - g.xk) < 12) || x < VW.vis[0] - 5 || x > VW.vis[1] + 5) continue;
      c.beginPath(); c.ellipse(x, y0(x), 3.6, 0.95, 0, side < 0 ? 0 : Math.PI, side < 0 ? Math.PI : TAU); c.fill();
    }
  }
  // The stellate cell, in Disse at a junction of two hepatocytes, as the lobule draws it: quiescent, a
  // rounded body full of vitamin A droplets with thin processes along the lining; activated (a
  // myofibroblast), the droplets go and the body lengthens, darkens and pulls on the sinusoid.
  function paintStellate(c, P, dark) {
    const g = geo, a = S.act, x = g.xs, yb = -(wallIn(x) + disseW(x) * 0.5) - 0.8;
    const L = 4 + 2.6 * a, Wd = 2.3 - 0.6 * a;
    c.fillStyle = `rgba(${dark ? '196, 140, 100' : '170, 112, 74'}, ${(0.5 + 0.35 * a).toFixed(3)})`;
    for (const sg of [-1, 1]) {
      const len = 15 + 8 * a, w0 = 0.6 + 0.4 * a, n = 14, up = [], dn = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n, xx = x + sg * (L * 0.7 + len * u), yy = -wallIn(xx) - 0.5 - 0.25 * Math.sin(u * 3), w = w0 * (1 - u) ** 1.2 + 0.06;
        up.push([xx, yy - w / 2]); dn.push([xx, yy + w / 2]);
      }
      c.beginPath(); c.moveTo(x + sg * L * 0.5, yb - 0.6);
      up.forEach(([xx, yy]) => c.lineTo(xx, yy)); dn.reverse().forEach(([xx, yy]) => c.lineTo(xx, yy));
      c.lineTo(x + sg * L * 0.5, yb + 0.9); c.closePath(); c.fill();
    }
    c.beginPath(); c.ellipse(x, yb, L, Wd, 0, 0, TAU); c.fill();
    c.fillStyle = `rgba(${dark ? '40, 18, 10' : '96, 54, 40'}, ${(0.35 + 0.25 * a).toFixed(3)})`;
    c.beginPath(); c.ellipse(x - L * 0.2, yb + 0.2, 1.4 + 0.5 * a, 0.85 - 0.1 * a, 0, 0, TAU); c.fill();
    const dr = (1 - a) ** 0.8;   // vitamin A droplets shrink and fade as it activates
    if (dr > 0.03) for (const [u, v, r] of [[0.25, -0.3, 0.85], [0.55, 0.25, 0.7], [0.05, 0.42, 0.55], [-0.55, -0.35, 0.62], [0.78, -0.25, 0.5]]) {
      c.fillStyle = `rgba(246, 214, 96, ${(0.9 * Math.min(1, dr * 1.4)).toFixed(3)})`; c.beginPath(); c.arc(x + u * L * 0.8, yb + v * Wd * 0.9, r * dr, 0, TAU); c.fill();
    }
  }
  // The Kupffer cell: a macrophage on the lower lining, reaching into the lumen (drawn over the moving blood).
  function paintKupffer(c, P) {
    const g = geo, x = g.xk, y0 = halfW(x), r = Math.min(2.8, y0 * 0.5), n = 28;
    c.fillStyle = P.kup; c.strokeStyle = P.cas; c.lineWidth = 0.3;
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = Math.PI + (i / n) * Math.PI, lobe = 1 + 0.22 * Math.sin(t * 5 + 0.6) + 0.12 * Math.sin(t * 9);
      const px = x + Math.cos(t) * 6.2 * lobe, py = y0 + Math.sin(t) * r * lobe;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = P.kupNuc; c.beginPath(); c.ellipse(x + 0.6, y0 - r * 0.42, 1.9, r * 0.3, 0, 0, TAU); c.fill();
  }

  // ── What moves ──
  // The blood: the lobule's moving marks, a shimmer of light streaks and dark chevrons along the lumen.
  // Albumin rides in it (amber dots). Plasma crosses the wall into Disse: water (white specks) wherever
  // it can, albumin only through open fenestrae; at a closed wall albumin is turned back. In Disse the
  // lymph runs back toward the portal triad, carrying what crossed.
  let flowX = 0, lymX = 0, spawnAcc = 0, bounceAcc = 0;
  const albs = [], movers = [];   // movers: { kind: 'w' water | 'a' albumin | 'b' albumin turned back, side, x, y (depth in Disse, 0…1), t, ph }
  const rnd = rng(17);
  { const R = rng(23); for (let i = 0; i < 150; i++) albs.push({ u: R(), y: R() * 2 - 1, sp: 0.8 + 0.4 * R(), ph: R() * TAU }); }
  function pickPore(side, albumin) {
    const pores = geo.pores[side < 0 ? 0 : 1].filter((p) => p.x > VW.vis[0] && p.x < VW.vis[1]);
    let tot = 0;
    const wts = pores.map((p) => { const w = poreW(p); const k = albumin ? (w > 0.3 ? w * w : 0) : w + 0.06; tot += k; return k; });
    if (tot <= 0) return null;
    let r = rnd() * tot;
    for (let i = 0; i < pores.length; i++) { r -= wts[i]; if (r <= 0) return pores[i]; }
    return pores[pores.length - 1];
  }
  function stepMovers(dt) {
    const span = VW.vis[1] - VW.vis[0], vB = S.v * 24, vL = -(3 + 5 * Math.sqrt(S.filt));   // µm/s: blood, and lymph (back toward the portal triad)
    flowX += vB * dt; lymX += vL * dt;
    // Filtration: crossings per second over this stretch of both walls, rising with the lymph; the share of albumin among
    // them is the lymph's protein (what the dots in Disse show is its concentration, not its amount).
    const rate = 0.07 * span * Math.sqrt(S.filt), pA = 0.5 * clamp((model.lyProt - 0.3) / 0.62, 0, 1) ** 2;
    spawnAcc += rate * dt;
    while (spawnAcc >= 1) {
      spawnAcc -= 1;
      if (movers.length > 900) continue;
      const side = rnd() < 0.5 ? -1 : 1, alb = rnd() < pA, p = pickPore(side, alb);
      if (alb && !p) { bounceAcc += 1; continue; }   // nowhere for it to go: it is turned back
      const x = p ? p.x : lerp(VW.vis[0], VW.vis[1], rnd());
      movers.push({ kind: alb ? 'a' : 'w', side, x, t: 0, y: 0.15 + 0.7 * rnd(), ph: rnd() * TAU });
    }
    // Albumin turned back at a sealed wall: it comes up to the lining and goes back into the stream.
    bounceAcc += 0.1 * span * (1 - S.por) * dt;
    while (bounceAcc >= 1) {
      bounceAcc -= 1;
      if (movers.length > 900) continue;
      movers.push({ kind: 'b', side: rnd() < 0.5 ? -1 : 1, x: lerp(VW.vis[0] + 4, VW.vis[1] - 4, rnd()), t: 0, y: 0, ph: 0 });
    }
    for (let i = movers.length - 1; i >= 0; i--) {
      const q = movers[i];
      q.t += dt;
      if (q.kind === 'b') { q.x += vB * 0.6 * dt; if (q.t > 1.1) movers.splice(i, 1); continue; }
      // Through the wall (0.5 s, carried a little by the blood), then along Disse with the lymph.
      if (q.t < 0.5) q.x += vB * 0.25 * dt; else q.x += vL * (0.85 + 0.3 * Math.sin(q.ph)) * dt;
      if (q.x < VW.vis[0] - 4 || q.x > VW.vis[1] + 4) movers.splice(i, 1);
    }
  }
  const dot = (c, x, y, r) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); };
  function paintMoving(c, P, dark) {
    const [v0, v1] = VW.vis;
    // Lumen: clipped to it, the shimmer, the chevrons and the albumin.
    c.save(); c.beginPath();
    for (let i = 0; i <= 120; i++) { const x = lerp(v0, v1, i / 120); i ? c.lineTo(x, -halfW(x)) : c.moveTo(x, -halfW(x)); }
    for (let i = 120; i >= 0; i--) { const x = lerp(v0, v1, i / 120); c.lineTo(x, halfW(x)); }
    c.clip();
    const dir = Math.sign(S.v || 1);
    c.lineCap = 'round';
    c.strokeStyle = dark ? 'rgba(255, 255, 255, .16)' : 'rgba(255, 255, 255, .26)'; c.lineWidth = 0.45;
    c.beginPath();
    for (let j = 0; j < 7; j++) {
      const lane = -0.75 + j * 0.25, sp = 18 + 7 * ((j * 5) % 3), L = 5 + 2 * (j % 3), o = flowX * (0.85 + 0.05 * j) + (j * 7.3) % sp;
      for (let x = Math.floor((v0 - o) / sp) * sp + o; x < v1 + sp; x += sp) { const y = lane * halfW(x); c.moveTo(x, y); c.lineTo(x + L * dir, y); }
    }
    c.stroke();
    // Chevrons down the middle, as on the lobule's vessels.
    c.fillStyle = P.chev;
    const sp = 16, cw = Math.min(1.1, halfW(0) * 0.28);
    for (let x = Math.floor((v0 - flowX) / sp) * sp + flowX; x < v1 + sp; x += sp) {
      c.beginPath(); c.moveTo(x + dir * cw, 0); c.lineTo(x - dir * cw * 0.6, -cw); c.lineTo(x - dir * cw * 0.15, 0); c.lineTo(x - dir * cw * 0.6, cw); c.closePath(); c.fill();
    }
    // Albumin in the plasma.
    const span = v1 - v0 + 8, nA = Math.round(albs.length * clamp(span / 300, 0.15, 1));
    c.fillStyle = P.alb; c.strokeStyle = P.albEdge; c.lineWidth = 0.12;
    c.beginPath();
    for (let i = 0; i < nA; i++) {
      const a = albs[i], x = v0 - 4 + ((((a.u * span + flowX * a.sp) % span) + span) % span), w = halfW(x) - 0.6;
      dot(c, x, clamp(a.y + 0.08 * Math.sin(flowX * 0.05 + a.ph), -1, 1) * w, 0.38);
    }
    c.fill(); c.stroke();
    c.restore();
    // Disse: light streaks of lymph running back toward the portal triad.
    for (const side of [-1, 1]) {
      c.save(); c.beginPath();
      for (let i = 0; i <= 80; i++) { const x = lerp(v0, v1, i / 80); i ? c.lineTo(x, side * wallIn(x)) : c.moveTo(x, side * wallIn(x)); }
      for (let i = 80; i >= 0; i--) { const x = lerp(v0, v1, i / 80); c.lineTo(x, side * hepIn(x)); }
      c.clip();
      c.strokeStyle = dark ? 'rgba(255, 255, 255, .22)' : 'rgba(255, 255, 255, .85)'; c.lineWidth = 0.35;
      c.beginPath();
      for (let j = 0; j < 2; j++) {
        const sp2 = 9 + 3 * j, o = lymX + (j * 4.1) % sp2;
        for (let x = Math.floor((v0 - o) / sp2) * sp2 + o; x < v1 + sp2; x += sp2) { const y = side * lerp(wallIn(x), hepIn(x), 0.32 + 0.36 * j); c.moveTo(x, y); c.lineTo(x - 2.6, y); }
      }
      c.stroke();
      c.restore();
    }
    // What crosses the wall.
    for (const q of movers) {
      if (q.kind === 'b') {
        // Up to the lining and back: an albumin dot with a small flash where it meets the sealed wall.
        const u = Math.sin(Math.PI * clamp(q.t / 1.1, 0, 1)), y = q.side * lerp(halfW(q.x) - 2.2, halfW(q.x) - 0.45, u);
        c.fillStyle = P.alb; c.strokeStyle = P.albEdge; c.lineWidth = 0.12;
        c.beginPath(); dot(c, q.x, y, 0.42); c.fill(); c.stroke();
        if (u > 0.85) { c.strokeStyle = `rgba(255, 255, 255, ${((u - 0.85) * 5).toFixed(2)})`; c.lineWidth = 0.18; c.beginPath(); c.arc(q.x, y, 0.95, 0, TAU); c.stroke(); }
        continue;
      }
      const tIn = clamp(q.t / 0.5, 0, 1), e = tIn * tIn * (3 - 2 * tIn);
      const y = q.side * lerp(halfW(q.x) - 1.1, lerp(wallIn(q.x), hepIn(q.x), q.y), e) + q.side * 0.15 * Math.sin(q.t * 2 + q.ph);
      c.globalAlpha = Math.min(1, q.t * 4) * clamp((q.x - v0) / 6, 0, 1);
      c.beginPath();
      if (q.kind === 'a') { c.fillStyle = P.alb; c.strokeStyle = P.albEdge; c.lineWidth = 0.12; dot(c, q.x, y, 0.42); }
      else { c.fillStyle = P.water; c.strokeStyle = P.waterEdge; c.lineWidth = 0.08; dot(c, q.x, y, 0.24); }
      c.fill(); c.stroke();
    }
    c.globalAlpha = 1;
  }

  // ── Labels: the station and its readings, as the lobule's ──
  const tags = {};
  const placed = [];
  function tag(key, names, value, ax, ay, lx, ly) {
    const name = Array.isArray(names) ? names[phoneMQ.matches ? 1 : 0] : names;
    let T = tags[key];
    if (!T) {
      T = tags[key] = { el: h('div', { class: 'lz-lab sv-tag' }), line: s('line', { class: 'leader' }), dot: s('circle', { class: 'leader-dot', r: 2.5 }) };
      labels.append(T.el); leaders.append(T.line, T.dot);
    }
    const txt = name + '|' + value;
    if (T.text !== txt) {
      T.text = txt;
      const [v, u] = value ? value.split('~') : [];
      T.el.replaceChildren(h('span', { class: 'n' }, name), value ? h('span', { class: 'v' }, h('b', {}, v), u ? h('small', {}, u) : null) : '');
    }
    const [x, y] = toScreen(ax, ay), [X, Y] = toScreen(lx, ly);
    const w = T.el.offsetWidth, hh = T.el.offsetHeight, left = X < x;   // (not the bounding box: the view may still be scaled by its zoom)
    // Kept on screen, and clear of the labels already placed (moved down past them).
    const bx = clamp(left ? X - w : X, 4, geo.W - 4 - w);
    let by = Y - hh / 2;
    for (let i = 0; i < 6; i++) {
      const o = placed.find((q) => bx < q[2] && bx + w > q[0] && by < q[3] && by + hh > q[1]);
      if (!o) break;
      by = o[3] + 3;
    }
    const f = VW.f, inside = by > f.t - 40 && by + hh < f.b + 20;
    if (inside) placed.push([bx, by, bx + w, by + hh]);
    T.el.hidden = !inside; T.line.style.display = T.dot.style.display = inside ? '' : 'none';
    if (!inside) return;
    T.el.classList.toggle('left', left);
    T.el.style.transform = `translate(${bx.toFixed(1)}px, ${by.toFixed(1)}px)`;
    const ey = clamp(Y, by + 2, by + hh - 2), ex = left ? bx + w : bx;
    for (const [a, b] of [['x1', x], ['y1', y], ['x2', ex], ['y2', ey]]) T.line.setAttribute(a, b.toFixed(1));
    T.dot.setAttribute('cx', x.toFixed(1)); T.dot.setAttribute('cy', y.toFixed(1));
  }
  function layoutTags() {
    placed.length = 0;
    const g = geo, m = model, hep = UM.hep;
    const pick = (u) => lerp(VW.fr[0] + 8, VW.fr[1] - 8, u);
    const xp = pick(g.vert ? 0.3 : 0.16), xd = pick(g.vert ? 0.55 : 0.36), xf = pick(g.vert ? 0.82 : 0.62), xh = pick(0.86);
    tag('sin', 'Sinusoid', m.hide ? '?' : `${fmt(m.P2, 1)}~mmHg`, xp, 0, xp, -(hepIn(xp) + hep * 0.45));
    tag('lymph', ['Lymph in the space of Disse', 'Lymph in Disse'], m.hide ? '?' : `${fmt(m.lymph, 1)}~mL/min · protein ${Math.round(m.lyProt * 100)}%`, xd, hepIn(xd) - disseW(xd) * 0.5, xd, hepIn(xd) + hep * 0.4);
    tag('fen', 'Fenestrae', S.por > 0.85 ? 'open' : S.por > 0.15 ? `${Math.round(S.por * 100)}%~open` : 'sealed', xf, -wallIn(xf) + UM.endo * 0.5, xf, -(hepIn(xf) + hep * 0.3));
    tag('hsc', S.act > 0.5 ? ['Activated stellate cell', 'Stellate cell (active)'] : 'Stellate cell', '', g.xs, -(wallIn(g.xs) + 2.4), g.xs - 10, -(hepIn(g.xs) + hep * 0.7));
    tag('kup', 'Kupffer cell', '', g.xk, halfW(g.xk) - 1.4, g.xk + 9, hepIn(g.xk) + hep * 0.62);
    const hc = g.plates[2].row.find((k) => k.x0 <= xh && k.x1 > xh), hx = hc ? lerp(hc.x0 + 2, hc.x1 - 2, hc.nu) : xh, hy = lerp(hepIn(hx) + 2, hepIn(hx) + hep - 2, hc ? hc.nv : 0.5);
    tag('hep', 'Hepatocyte', '', hx, hy, hx - 7, hy + 5);
  }
  function layoutEnds() {
    const g = geo, f = VW.f;
    for (const [key, txt, u] of [['in', g.vert ? '↓ from the portal triad' : '← portal triad', 0], ['out', g.vert ? 'to the central vein ↓' : 'central vein →', 1]]) {
      let T = tags[key];
      if (!T) { T = tags[key] = { el: h('div', { class: 'sv-end' }) }; labels.append(T.el); }
      if (T.text !== txt) { T.text = txt; T.el.textContent = txt; }
      const w = T.el.offsetWidth, hh = T.el.offsetHeight;
      let x, y;
      if (g.vert) { x = VW.C[0] - w / 2; y = u ? f.b - hh - 24 : f.t + 4; }   // (clear of the credit line at the bottom)
      else { x = u ? f.r - w - 6 : f.l + 6; y = VW.C[1] - hh / 2; }
      T.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
    // The legend: beside the back button.
    const bx = back.offsetLeft + back.offsetWidth + 12, byy = back.offsetTop + (back.offsetHeight - legend.offsetHeight) / 2;
    legend.style.maxWidth = `${Math.max(120, geo.W - bx - 12)}px`;
    legend.style.transform = `translate(${bx.toFixed(1)}px, ${Math.max(back.offsetTop, byy).toFixed(1)}px)`;
  }

  // ── The frame ──
  let lastKey = '';
  function draw(dt, run = true) {
    const rect = host.getBoundingClientRect();
    const W = Math.max(1, Math.round(rect.width)), H = Math.max(1, Math.round(rect.height));
    ensureGeo(W, H);
    stepState(dt); stepView(dt);
    const dpr = Math.min(2, devicePixelRatio || 1);
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    const cs = getComputedStyle(host), P = palette(dark, cs);
    for (const cv of [tissue, fx]) if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; tissueKey = ''; }
    const g = geo, K = VW.k, M = [dpr * K * g.ca, dpr * K * g.sa, -dpr * K * g.sa, dpr * K * g.ca, dpr * VW.C[0], dpr * VW.C[1]];
    const key = [geoKey, K.toFixed(4), VW.C.map((v) => v.toFixed(1)), dpr, dark, P.bg, P.lumen, P.casA, ['por', 'col', 'bm', 'mv', 'act', 'lum', 'pinch', 'prot'].map((k) => S[k].toFixed(3)).join(',')].join('|');
    if (key !== tissueKey) {
      tissueKey = key;
      const c = tissue.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = P.bg; c.fillRect(0, 0, tissue.width, tissue.height);
      c.setTransform(...M);
      paintTissue(c, P, dark);
      tissue.setAttribute('aria-label', describe());
    }
    if (run && dt > 0) stepMovers(dt);
    const c = fx.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, fx.width, fx.height);
    c.setTransform(...M);
    paintMoving(c, P, dark);
    paintKupffer(c, P);
    const lk = [geoKey, K.toFixed(3), VW.C.map((v) => v.toFixed(0)), S.lum.toFixed(3), S.act > 0.5, Math.round(S.por * 20), model.hide, model.P2.toFixed(1), model.lymph.toFixed(1), Math.round(model.lyProt * 100), phoneMQ.matches].join('|');
    if (lk !== lastKey) { lastKey = lk; layoutTags(); layoutEnds(); }
  }
  function describe() {
    const m = model;
    const parts = [`A sinusoid, cut along its length${m.hide ? '' : `, at ${fmt(m.P2, 1)} millimeters of mercury`}.`];
    parts.push(S.por > 0.75 ? 'Its lining is fenestrated: plasma and albumin pass through the open pores into the space of Disse.'
      : S.por > 0.25 ? 'Many of its fenestrae have closed: less albumin gets through.' : 'Its fenestrae have closed: the wall is sealed, and albumin is turned back.');
    if (!m.hide) parts.push(`Hepatic lymph ${fmt(m.lymph, 1)} milliliters per minute, flowing back along the space of Disse toward the portal triad, with ${Math.round(m.lyProt * 100)} percent of plasma protein.`);
    if (S.col > 0.15) parts.push('Collagen fills the space of Disse and the hepatocytes have lost their microvilli.');
    parts.push(S.act > 0.4 ? 'The stellate cell is activated: no vitamin A droplets, contracted, laying down collagen.' : 'The stellate cell is quiescent, full of vitamin A droplets.');
    return parts.join(' ');
  }
  function loop(now) {
    raf = 0;
    if (shown <= 0 || !model) return;
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    draw(dt, store.get().running && !reduce.matches);
    raf = requestAnimationFrame(loop);
  }

  return {
    el,
    /** The lobule's model (lobuleState), each time it changes. */
    setModel(m) { model = m; if (shown > 0 && !raf) raf = requestAnimationFrame(loop); },
    /**
     * Placement during the zoom from the lobule (lobule-zoom.js): opacity, a CSS transform about the
     * sinusoid's centre, a soft mask at its edges, and whether it is fully open (takes input).
     */
    place({ opacity, transform = '', origin = '', mask = '', isOpen = false }) {
      const was = shown;
      shown = opacity;
      el.style.opacity = opacity.toFixed(3);
      el.style.visibility = opacity > 0 ? 'visible' : 'hidden';
      el.style.transform = transform; el.style.transformOrigin = origin;
      el.style.maskImage = mask; el.style.webkitMaskImage = mask;
      open = isOpen;
      el.classList.toggle('on', isOpen);
      el.setAttribute('aria-hidden', String(!isOpen));
      if (opacity > 0 && was <= 0) {
        last = 0; lastKey = ''; tissueKey = ''; VW.k = 0; movers.length = 0; spawnAcc = 0; bounceAcc = 0;
        if (model) {
          for (const k in S) delete S[k];
          // Arrive with the wall already at work: a few seconds of traffic run before the first frame.
          draw(0, false);
          for (let i = 0; i < 40; i++) stepMovers(0.1);
          draw(0, false);
        }
      }
      if (opacity > 0 && !raf && model) raf = requestAnimationFrame(loop);
    },
    /** Where the sinusoid's centre is drawn (stage px), its direction (radians) and the lumen's width there (px). */
    frame() {
      const rect = host.getBoundingClientRect();
      ensureGeo(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)));
      if (model && S.lum == null) stepState(0);
      return { x: VW.tC[0], y: VW.tC[1], ang: geo.ang, lumen: 2 * UM.lum * (S.lum ?? 1) * VW.tk };
    },
    isOpen: () => open,
  };
}
