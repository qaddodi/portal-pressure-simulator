// Semantic zoom, one level below the lobule: a stretch of one sinusoid, cut along its length, as in
// the textbook figure. Blood runs from the portal side (left, or top on a portrait screen) to the
// central vein. Out from the lumen: the fenestrated endothelium, the space of Disse with the
// hepatocytes' microvilli, a stellate (Ito) cell tucked between two hepatocytes, a Kupffer cell on
// the lining, then the hepatocyte plates (one cell thick) and, faintly, the next sinusoids.
//
// Everything is read from the lobule's model (lobule-model.js), so it moves with the same numbers
// as the lobule above it:
//   · the fenestrae close as the sinusoidal reflection coefficient rises (the engine's albumin
//     sieving, which is what lowers the protein in hepatic lymph in cirrhosis),
//   · collagen and a basement membrane fill the space of Disse and the microvilli flatten with
//     sinusoidal fibrosis (capillarization),
//   · the stellate cell activates (loses its vitamin A droplets, darkens, contracts),
//   · the lumen narrows with sinusoidal resistance (as the lobule's sinusoids do) and widens with
//     outflow congestion; red cells squeeze through a narrow one.
// Each of these eases to its new value over about half a second, so nothing jumps.
//
// Drawn on two canvases: the tissue, redrawn only when its state changes, and the moving red cells.

import { store } from './store.js?v=06e2d6e179';
import { h, s, fmt, clamp, lerp } from './util.js?v=86153645a3';
import { pressureColor } from './colormap.js?v=6d64a94345';

const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rng(seed) { let q = seed >>> 0; return () => { q = (q * 1664525 + 1013904223) >>> 0; return q / 4294967296; }; }
// Sizes in micrometres. The lumen and the cells are to scale; the space of Disse, the endothelium
// and the fenestrae are drawn several times thicker than life, or they would be invisible.
const UM = { lum: 5, endo: 0.7, disse: 2.4, hep: 21, cell: 24, across: 70 };

/** Targets for the drawing, from a lobule model (lobuleState). Exported for the tests. */
export function sinusoidTargets(m) {
  const sigma = m.sigma ?? 0.15;
  // Porosity: 1 with the healthy reflection coefficient (0.15), 0 at its cirrhotic ceiling (0.6).
  const por = clamp(1 - (sigma - 0.15) / 0.45, 0, 1);
  const cap = clamp(Math.max(m.fibSin, 1 - por), 0, 1);
  return {
    por,
    col: m.fibSin,                                    // collagen in Disse
    bm: smooth(0.12, 0.7, cap),                       // basement membrane under the endothelium
    mv: 1 - 0.75 * smooth(0.1, 0.85, cap),            // microvilli
    act: m.act,                                       // stellate cell activation
    lum: m.zone.sin ** -0.12 * (1 + 0.5 * m.congU),   // lumen width (as the lobule's sinusoids)
    pinch: 0.22 * m.act,                              // the activated stellate cell's squeeze
    v: (m.rev?.sin ? -1 : 1) * clamp(Math.abs(m.flow) / Math.max(0.35, m.zone.sin ** -0.24), 0.08, 3),   // red cell speed (flow / area)
    pack: m.congU,                                    // congestion packs the lumen with red cells
  };
}

export function createSinusoidView({ host, onBack }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const phoneMQ = matchMedia('(max-width: 720px)');
  const tissue = h('canvas', { class: 'sv-canvas', role: 'img', 'aria-label': 'A sinusoid, cut along its length' });
  const fx = h('canvas', { class: 'sv-canvas', 'aria-hidden': 'true' });
  const leaders = s('svg', { class: 'lz-leaders', 'aria-hidden': 'true' });
  const labels = h('div', { class: 'lz-labels' });
  const back = h('button', { class: 'sv-back', type: 'button', 'aria-label': 'Back to the lobule' }, h('span', { 'aria-hidden': 'true' }, '‹'), ' Lobule');
  back.addEventListener('click', () => onBack?.());
  const el = h('div', { class: 'sv', 'aria-hidden': 'true' }, tissue, fx, leaders, labels, back);
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
  const cells = [];      // red cells: { x, y, ph, r }

  // Where the sinusoid sits: centred in the space the floating pieces leave, along the longer side.
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
        const cell = (R, xa, xb) => ({ x0: xa, x1: xb, nu: 0.3 + 0.4 * R(), nv: 0.38 + 0.24 * R(), nr: 3.1 + 0.6 * R(), bi: R() < 0.12, tone: R(),
          dots: Array.from({ length: 22 }, () => [R(), R(), 0.18 + 0.3 * R()]) });
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
        const R = rng(3 + 2 * i + (dir > 0 ? 0 : 11)), out = [];
        for (let x = dir > 0 ? 0 : -1.5; Math.abs(x) < X;) {
          x += dir * (3 + 5 * R());
          const nP = 3 + Math.floor(R() * 4);
          for (let j = 0; j < nP; j++) { out.push({ x, w: 0.42 + 0.3 * R(), th: R() }); x += dir * (0.9 + 0.5 * R()); }
        }
        pores[i].push(...out);
      }
      for (const ps of pores) ps.sort((a, b) => a.x - b.x);
      // Endothelial nuclei bulging into the lumen; the Kupffer cell on the lower lining after the middle.
      const nuclei = [[], []];
      for (const i of [0, 1]) { const R = rng(41 + i); for (let x = -X + 10 * R(); x < X; x += 34 + 22 * R()) nuclei[i].push(x); }
      // Collagen fibres in Disse: each appears at its own level of fibrosis.
      const fibres = [[], []];
      for (const i of [0, 1]) { const R = rng(91 + i); for (let j = 0; j < 9; j++) fibres[i].push({ v: 0.15 + 0.7 * R(), th: j / 9 * 0.85, ph: R() * TAU, f: 0.12 + 0.12 * R() }); }
      geo = { W, H, ang, ca: Math.cos(ang), sa: Math.sin(ang), vert, x0, x1, plates, xs, xk: 22, pores, nuclei, fibres };
      seedCells();
    }
    // Where it is drawn: centred in the free space, the plates filling its short side. When that space
    // changes (the dock grows, a card opens) the view glides there (stepView), it does not jump.
    const f = freeRect(W, H), fw = f.r - f.l, fh = f.b - f.t;
    VW.f = f; VW.tk = clamp((geo.vert ? fw : fh) / UM.across, 3, 14); VW.tC = [(f.l + f.r) / 2, (f.t + f.b) / 2];
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
  const toScreen = (x, y) => { const g = geo; return [VW.C[0] + VW.k * (x * g.ca - y * g.sa), VW.C[1] + VW.k * (x * g.sa + y * g.ca)]; };

  function seedCells() {
    const g = geo, R = rng(7);
    cells.length = 0;
    for (let x = g.x0; x < g.x1; x += 8 + 6 * R()) cells.push({ x, y: R() * 2 - 1, ph: R() * TAU, r: 0.92 + 0.16 * R(), sp: 0.85 + 0.3 * R(), extra: R() });
  }

  // The lumen's half width at x (the stellate cell's squeeze is a gentle waist around it).
  const halfW = (x) => UM.lum * S.lum * (1 - S.pinch * Math.exp(-(((x - geo.xs) / 11) ** 2))) + 0.18 * Math.sin(x * 0.11 + 1.3);
  const disseW = (x) => UM.disse * (1 + 0.35 * S.col) + 0.25 * Math.sin(x * 0.07);

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

  // ── Colours (light and dark), from the theme's tokens where the lobule takes them ──
  function palette(dark, cs) {
    const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    return {
      bg: v('--stage-bg', v('--bg', dark ? '#0E1422' : '#FBFAF7')),
      cell: v('--og-liver-1', dark ? '#85514F' : '#E9C3B6'),
      gap: v('--og-liver-2', dark ? '#5A3440' : '#C98E7E'),
      disse: dark ? 'rgba(214, 196, 150, .16)' : 'rgba(250, 236, 196, .9)',
      nuc: dark ? 'rgba(28, 12, 30, .42)' : 'rgba(112, 58, 86, .30)',
      nucleolus: dark ? 'rgba(20, 8, 24, .55)' : 'rgba(96, 40, 70, .5)',
      endo: dark ? '#8E7DB0' : '#B9A6D3', endoEdge: dark ? 'rgba(210, 196, 240, .5)' : 'rgba(96, 72, 140, .55)',
      col: dark ? [200, 186, 152] : [236, 220, 184], colEdge: dark ? 'rgba(255, 240, 200, .35)' : 'rgba(150, 120, 80, .45)',
      bm: dark ? 'rgba(236, 220, 170, .7)' : 'rgba(150, 118, 70, .75)',
      canal: dark ? 'rgba(170, 196, 90, .8)' : 'rgba(120, 150, 40, .75)',
      rbc: dark ? '#C9424F' : '#C23743', rbcPale: dark ? '#E0727C' : '#E3858C', rbcEdge: dark ? 'rgba(60, 0, 10, .5)' : 'rgba(110, 10, 24, .45)',
      kup: dark ? '#7C6A9C' : '#A08DBE', kupNuc: dark ? 'rgba(30, 16, 50, .55)' : 'rgba(70, 40, 100, .5)',
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

  // ── The tissue ──
  function paintTissue(c, P, dark) {
    const g = geo, m = model;
    c.fillStyle = P.bg; c.fillRect(-500, -500, 1000, 1000);
    const X = (n) => lerp(VW.vis[0], VW.vis[1], n);
    const xs = []; for (let i = 0; i <= 120; i++) xs.push(X(i / 120));
    // Lumen plasma, tinted by the sinusoid's pressure as every lumen in the app is.
    const tint = m.hide ? (dark ? '#2A2F3E' : '#ECE6EA') : mix(P.bg, pressureColor(m.P2), dark ? 0.32 : 0.2);
    // One side at a time: s = -1 above the lumen, +1 below.
    for (const side of [-1, 1]) {
      const yIn = (x) => side * (halfW(x) + UM.endo + disseW(x));   // hepatocytes' face on Disse
      // The plates: first the membrane colour as ground, then the cells over it, leaving their borders.
      for (const pl of g.plates.filter((p) => p.side === side)) {
        const off = pl.n * (UM.hep + 2 * UM.disse + 2 * UM.endo + 2 * UM.lum);
        const a0 = (x) => yIn(x) + side * off, a1 = (x) => yIn(x) + side * (off + UM.hep);
        const fade = pl.n ? 0.55 : 1;
        c.globalAlpha = fade;
        c.fillStyle = P.gap; c.beginPath();
        xs.forEach((x, i) => (i ? c.lineTo(x, a0(x)) : c.moveTo(x, a0(x)))); for (let i = xs.length - 1; i >= 0; i--) c.lineTo(xs[i], a1(xs[i])); c.fill();
        for (const k of pl.row) paintCell(c, P, k, a0, a1, side, dark);
        // The next sinusoid beyond the plate, quiet: its Disse, lining and lumen.
        if (pl.n === 0) {
          const b0 = (x) => a1(x) + side * UM.disse, b1 = (x) => b0(x) + side * UM.endo, b2 = (x) => b1(x) + side * 2 * UM.lum * 0.95;
          band(c, xs, a1, b0, P.disse);
          band(c, xs, b0, b1, P.endo);
          band(c, xs, b1, b2, tint);
          c.globalAlpha = 0.55;
          band(c, xs, (x) => b2(x), (x) => b2(x) + side * UM.endo, P.endo);
          band(c, xs, (x) => b2(x) + side * UM.endo, (x) => b2(x) + side * (UM.endo + UM.disse), P.disse);
        }
        c.globalAlpha = 1;
      }
      // Space of Disse: plasma, collagen as it comes, the microvilli reaching into it.
      const e1 = (x) => side * (halfW(x) + UM.endo);
      band(c, xs, e1, yIn, P.disse);
      paintCollagen(c, P, side, xs, e1, yIn);
      paintMicrovilli(c, P, side, e1, yIn, dark);
    }
    paintStellate(c, P, dark);
    // The lumen and its lining.
    band(c, xs, (x) => -halfW(x), (x) => halfW(x), tint);
    for (const side of [-1, 1]) paintEndothelium(c, P, side);
    // Focus: beyond this sinusoid's own plates the tissue fades into the page.
    const bq = rgb(P.bg);
    for (const side of [-1, 1]) {
      const y0 = side * (UM.lum * S.lum + UM.endo + disseW(0) + UM.hep), y1 = y0 + side * 16;
      const gr = c.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, `rgba(${bq.join(',')}, 0)`); gr.addColorStop(1, `rgba(${bq.join(',')}, ${dark ? 0.72 : 0.66})`);
      c.fillStyle = gr; c.fillRect(VW.vis[0], Math.min(y0, side * 200), VW.vis[1] - VW.vis[0], Math.abs(side * 200 - y0));
    }
  }
  function band(c, xs, f0, f1, fill) {
    c.fillStyle = fill; c.beginPath();
    xs.forEach((x, i) => (i ? c.lineTo(x, f0(x)) : c.moveTo(x, f0(x))));
    for (let i = xs.length - 1; i >= 0; i--) c.lineTo(xs[i], f1(xs[i]));
    c.closePath(); c.fill();
  }
  function paintCell(c, P, k, a0, a1, side, dark) {
    const gp = 0.35, r = 1.6, x0 = k.x0 + gp + r, x1 = k.x1 - gp - r;
    if (x1 <= x0) return;
    const n = 8, pts = [];
    for (let i = 0; i <= n; i++) { const x = lerp(x0, x1, i / n); pts.push([x, a0(x) + side * (gp + r)]); }
    for (let i = n; i >= 0; i--) { const x = lerp(x0, x1, i / n); pts.push([x, a1(x) - side * (gp + r)]); }
    const base = rgb(P.cell), t = 0.9 + 0.1 * k.tone;
    c.fillStyle = `rgb(${base.map((v) => Math.round(v * t + (dark ? 0 : 255 * (1 - t) * 0.4))).join(',')})`;
    c.strokeStyle = c.fillStyle; c.lineWidth = 2 * r; c.lineJoin = 'round';
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); c.stroke();
    // Cytoplasm: glycogen and mitochondria as a faint grain.
    const at = (u, v) => { const x = lerp(k.x0 + 2, k.x1 - 2, u); return [x, lerp(a0(x) + side * 2, a1(x) - side * 2, v)]; };
    c.fillStyle = dark ? 'rgba(255, 220, 220, .07)' : 'rgba(150, 80, 70, .1)';
    for (const [u, v, rr] of k.dots) { const [x, y] = at(u, v); c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill(); }
    // Nucleus (two in some hepatocytes), with its nucleolus.
    const nucs = k.bi ? [[k.nu - 0.14, k.nv], [k.nu + 0.16, k.nv + 0.05]] : [[k.nu, k.nv]];
    for (const [u, v] of nucs) {
      const [x, y] = at(u, v), rr = k.bi ? k.nr * 0.82 : k.nr;
      c.fillStyle = P.nuc; c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill();
      c.fillStyle = P.nucleolus; c.beginPath(); c.arc(x + rr * 0.25, y - rr * 0.2, rr * 0.24, 0, TAU); c.fill();
    }
    // A bile canaliculus at the border with the next cell, mid-plate.
    const xb = k.x1, yb = lerp(a0(xb), a1(xb), 0.5);
    c.fillStyle = P.canal; c.beginPath(); c.ellipse(xb, yb, 0.75, 0.6, 0, 0, TAU); c.fill();
  }
  function paintCollagen(c, P, side, xs, e1, yIn) {
    const g = geo, col = S.col;
    if (col < 0.02 && S.bm < 0.02) return;
    // A denser mesh close to the activated stellate cell, which makes it.
    const near = (x) => (side < 0 ? Math.exp(-(((x - g.xs) / 26) ** 2)) * S.act : 0);
    c.lineCap = 'round';
    for (const fb of g.fibres[side < 0 ? 0 : 1]) {
      const a = smooth(fb.th, fb.th + 0.18, col);
      if (a <= 0.01) continue;
      c.strokeStyle = `rgba(${P.col.join(',')}, ${(0.95 * a).toFixed(3)})`; c.lineWidth = 0.32 + 0.22 * a;
      c.beginPath();
      xs.forEach((x, i) => {
        const v = clamp(fb.v + 0.12 * Math.sin(x * fb.f + fb.ph) + 0.08 * near(x), 0.05, 0.95), y = lerp(e1(x), yIn(x), v);
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      });
      c.stroke();
    }
    // Basement membrane: a continuous line just under the endothelium, as the sinusoid becomes a capillary.
    if (S.bm > 0.02) {
      c.strokeStyle = P.bm; c.globalAlpha = S.bm; c.lineWidth = 0.28 + 0.2 * S.bm;
      c.beginPath(); xs.forEach((x, i) => { const y = e1(x) + side * 0.3; if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke();
      c.globalAlpha = 1;
    }
  }
  function paintMicrovilli(c, P, side, e1, yIn, dark) {
    const L = S.mv;
    c.strokeStyle = mix(P.cell, dark ? '#000' : P.gap, dark ? 0.15 : 0.35); c.lineWidth = 0.32; c.lineCap = 'round';
    c.beginPath();
    for (let i = Math.floor(VW.vis[0] / 0.85); i * 0.85 < VW.vis[1]; i++) {
      const x = i * 0.85;
      const y0 = yIn(x), room = Math.abs(yIn(x) - e1(x)), l = room * 0.7 * L * (0.55 + 0.45 * Math.abs(Math.sin(i * 2.17)));
      c.moveTo(x, y0); c.lineTo(x + 0.15 * Math.sin(i), y0 - side * l);
    }
    c.stroke();
  }
  function paintEndothelium(c, P, side) {
    const g = geo, por = S.por, pores = g.pores[side < 0 ? 0 : 1];
    const y0 = (x) => side * halfW(x), y1 = (x) => side * (halfW(x) + UM.endo);
    // Segments of lining between open fenestrae. A closing pore narrows smoothly to nothing.
    const segs = [];
    let from = VW.vis[0];
    for (const p of pores) {
      if (p.x < VW.vis[0] || p.x > VW.vis[1]) continue;
      const o = smooth(p.th - 0.14, p.th + 0.14, por), w = p.w * o;
      if (w < 0.04) continue;
      segs.push([from, p.x - w / 2]); from = p.x + w / 2;
    }
    segs.push([from, VW.vis[1]]);
    c.fillStyle = P.endo;
    c.beginPath();
    for (const [a, b] of segs) {
      if (b <= a) continue;
      const n = Math.max(2, Math.ceil((b - a) / 2));
      for (let i = 0; i <= n; i++) { const x = lerp(a, b, i / n); i ? c.lineTo(x, y0(x)) : c.moveTo(x, y0(x)); }
      for (let i = n; i >= 0; i--) { const x = lerp(a, b, i / n); c.lineTo(x, y1(x)); }
      c.closePath();
    }
    c.fill();
    c.strokeStyle = P.endoEdge; c.lineWidth = 0.14;
    c.stroke();
    // Endothelial nuclei: flat bulges into the lumen.
    c.fillStyle = P.endo;
    for (const x of g.nuclei[side < 0 ? 0 : 1]) {
      if (side > 0 && Math.abs(x - g.xk) < 12) continue;   // the Kupffer cell sits there
      c.beginPath(); c.ellipse(x, y0(x) - side * 0.15, 4.2, 1.15, 0, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = P.endoEdge; c.beginPath(); c.ellipse(x, y0(x) - side * 0.25, 2.8, 0.55, 0, 0, TAU); c.fill(); c.fillStyle = P.endo;
    }
  }
  // The stellate cell, in the space of Disse at a junction of two hepatocytes. Quiescent: a rounded
  // body filled with vitamin A droplets and thin processes along the lining. Activated (a
  // myofibroblast): the droplets go, the body lengthens and darkens and its processes thicken and pull.
  function paintStellate(c, P, dark) {
    const g = geo, a = S.act, x = g.xs, yE = -(halfW(x) + UM.endo), yb = yE - UM.disse * (1 + 0.35 * S.col) * 0.55 - 1.4 - 0.4 * a;
    const L = 4.2 + 2.6 * a, Wd = 2.6 - 0.8 * a;
    const q = dark ? [196, 150, 104] : [222, 186, 138], act = dark ? [160, 96, 64] : [176, 112, 76];
    const colB = q.map((v, i) => Math.round(lerp(v, act[i], a)));
    c.fillStyle = `rgb(${colB.join(',')})`;
    // Processes: tapered strands hugging the endothelium both ways.
    for (const sg of [-1, 1]) {
      const len = 16 + 8 * a, w0 = 0.55 + 0.45 * a;
      c.beginPath();
      const n = 14, up = [], dn = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n, xx = x + sg * (L * 0.7 + len * u), yy = -(halfW(xx) + UM.endo) - 0.55 - 0.3 * Math.sin(u * 3), w = w0 * (1 - u) ** 1.2 + 0.06;
        up.push([xx, yy - w / 2]); dn.push([xx, yy + w / 2]);
      }
      c.moveTo(x + sg * L * 0.5, yb - 0.6);
      up.forEach(([xx, yy]) => c.lineTo(xx, yy)); dn.reverse().forEach(([xx, yy]) => c.lineTo(xx, yy));
      c.lineTo(x + sg * L * 0.5, yb + 0.9); c.closePath(); c.fill();
    }
    c.beginPath(); c.ellipse(x, yb, L, Wd, 0, 0, TAU); c.fill();
    c.strokeStyle = dark ? 'rgba(255, 230, 200, .3)' : 'rgba(110, 70, 40, .35)'; c.lineWidth = 0.15; c.stroke();
    // Nucleus, indented by the droplets while they last.
    c.fillStyle = dark ? 'rgba(40, 18, 10, .5)' : 'rgba(96, 54, 34, .45)';
    c.beginPath(); c.ellipse(x - L * 0.18, yb + 0.2, 1.5 + 0.5 * a, 0.95 - 0.15 * a, 0, 0, TAU); c.fill();
    // Vitamin A droplets: shrink and fade as the cell activates.
    const dr = (1 - a) ** 0.8;
    if (dr > 0.03) {
      for (const [u, v, r] of [[0.25, -0.35, 0.95], [0.55, 0.25, 0.8], [0.05, 0.45, 0.6], [-0.55, -0.4, 0.7], [0.75, -0.3, 0.55]]) {
        const rr = r * dr, cx = x + u * L * 0.8, cy = yb + v * Wd * 0.9;
        c.fillStyle = `rgba(250, 222, 110, ${(0.92 * Math.min(1, dr * 1.4)).toFixed(3)})`; c.beginPath(); c.arc(cx, cy, rr, 0, TAU); c.fill();
        c.fillStyle = `rgba(255, 255, 240, ${(0.7 * dr).toFixed(3)})`; c.beginPath(); c.arc(cx - rr * 0.3, cy - rr * 0.3, rr * 0.3, 0, TAU); c.fill();
      }
    }
  }
  // The Kupffer cell: a macrophage on the lower lining, its body and pseudopods reaching into the lumen.
  function paintKupffer(c, P) {
    const g = geo, x = g.xk, y0 = halfW(x), r = Math.min(3, y0 * 0.55);
    c.fillStyle = P.kup;
    c.beginPath();
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const t = Math.PI + (i / n) * Math.PI, lobe = 1 + 0.22 * Math.sin(t * 5 + 0.6) + 0.12 * Math.sin(t * 9);
      const px = x + Math.cos(t) * 6.5 * lobe, py = y0 + Math.sin(t) * r * lobe;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.closePath(); c.fill();
    c.fillStyle = P.kupNuc; c.beginPath(); c.ellipse(x + 0.6, y0 - r * 0.42, 2, r * 0.32, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(80, 50, 40, .35)';
    for (const [u, v] of [[-3.4, 0.35], [-1.8, 0.62], [3.2, 0.4]]) { c.beginPath(); c.arc(x + u, y0 - r * v, 0.55, 0, TAU); c.fill(); }
  }

  // ── Red cells: discs seen edge-on or turning, squeezed by a narrow lumen ──
  function paintCells(c, P, dt) {
    const g = geo, span = g.x1 - g.x0, v = S.v * 26;   // µm per second at normal flow
    // Congestion packs the lumen: more cells shown, from a fixed pool (the rest are hidden).
    const show = 0.62 + 0.38 * S.pack;
    for (const k of cells) {
      if (dt) { k.x += v * k.sp * dt; k.ph += dt * 0.6 * k.sp * Math.sign(v || 1); }
      if (k.x > g.x1) k.x -= span; else if (k.x < g.x0) k.x += span;
      if (k.extra > show || k.x < VW.vis[0] - 6 || k.x > VW.vis[1] + 6) continue;
      const w = halfW(k.x), turn = Math.abs(Math.cos(k.ph));   // 0 edge-on, 1 face-on
      // A disc wider than the lumen is pressed long (it keeps its area, roughly).
      const ry0 = lerp(1.15, 3.7, turn) * k.r, ry = Math.min(ry0, w * 0.82), rx = 3.75 * k.r * (1 + 0.45 * (ry0 - ry) / 3.7);
      const y = k.y * Math.max(0, w - ry - 0.25);
      c.fillStyle = P.rbc; c.strokeStyle = P.rbcEdge; c.lineWidth = 0.14;
      c.beginPath(); c.ellipse(k.x, y, rx, ry, 0, 0, TAU); c.fill(); c.stroke();
      // The pallor: a pale centre face-on, a waist edge-on.
      c.fillStyle = P.rbcPale;
      c.beginPath(); c.ellipse(k.x, y, rx * (0.35 + 0.2 * turn), ry * (0.2 + 0.32 * turn), 0, 0, TAU); c.fill();
    }
  }

  // ── Labels (names only for now) ──
  const tags = {};
  function tag(key, text, ax, ay, lx, ly) {
    let T = tags[key];
    if (!T) {
      T = tags[key] = { el: h('div', { class: 'lz-lab sv-tag' }), line: s('line', { class: 'leader' }), dot: s('circle', { class: 'leader-dot', r: 2.5 }) };
      labels.append(T.el); leaders.append(T.line, T.dot);
    }
    if (T.text !== text) { T.text = text; T.el.replaceChildren(...text.split('|').map((t, i) => (i ? h('span', { class: 'v' }, h('b', {}, t)) : h('span', { class: 'n' }, t)))); }
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
    const f = VW.f, inside = by > f.t - 40 && by + hh < f.b;
    if (inside) placed.push([bx, by, bx + w, by + hh]);
    T.el.hidden = !inside; T.line.style.display = T.dot.style.display = inside ? '' : 'none';
    if (!inside) return;
    T.el.classList.toggle('left', left);
    T.el.style.transform = `translate(${bx.toFixed(1)}px, ${by.toFixed(1)}px)`;
    const ey = clamp(Y, by + 2, by + hh - 2), ex = left ? bx + w : bx;
    for (const [a, b] of [['x1', x], ['y1', y], ['x2', ex], ['y2', ey]]) T.line.setAttribute(a, b.toFixed(1));
    T.dot.setAttribute('cx', x.toFixed(1)); T.dot.setAttribute('cy', y.toFixed(1));
  }
  const placed = [];
  function layoutTags() {
    placed.length = 0;
    const g = geo, m = model;
    const yIn = (x) => halfW(x) + UM.endo + disseW(x), hep = UM.hep;
    const pick = (u) => lerp(VW.fr[0] + 8, VW.fr[1] - 8, u);
    const xh = pick(0.78), xd = pick(0.3), xf = g.xs + 30;
    const xp = pick(g.vert ? 0.34 : 0.18);
    tag('sin', m.hide ? 'Sinusoid|?' : `Sinusoid|${fmt(m.P2, 1)} mmHg`, xp, 0, xp, -(yIn(xp) + hep * 0.5));
    // The hepatocyte's label points at a nucleus.
    const hc = g.plates[0].row.find((k) => k.x0 <= xh && k.x1 > xh), hx = hc ? lerp(hc.x0 + 2, hc.x1 - 2, hc.nu) : xh, hy = -lerp(yIn(hx) + 2, yIn(hx) + hep - 2, hc ? hc.nv : 0.5);
    tag('hep', 'Hepatocyte', hx, hy, hx + 7, hy - 5);
    tag('hsc', S.act > 0.5 ? 'Activated stellate cell' : 'Stellate cell', g.xs, -(halfW(g.xs) + UM.endo + 2.6), g.xs - 12, -(yIn(g.xs) + hep * 0.7));
    tag('fen', S.por > 0.15 ? 'Fenestrae' : 'Fenestrae (closed)', xf, -(halfW(xf) + UM.endo * 0.5), xf + 8, -(yIn(xf) + hep * 0.3));
    tag('disse', 'Space of Disse', xd, halfW(xd) + UM.endo + disseW(xd) * 0.5, xd - 6, yIn(xd) + hep * 0.4);
    tag('kup', 'Kupffer cell', g.xk, halfW(g.xk) - 1.5, g.xk + 9, yIn(g.xk) + hep * 0.62);
  }
  function layoutEnds() {
    const g = geo, f = VW.f;
    // The two ends: where the blood comes from and where it goes.
    for (const [key, txt, u] of [['in', g.vert ? '↓ from the portal triad' : '← from the portal triad', 0], ['out', g.vert ? 'to the central vein ↓' : 'to the central vein →', 1]]) {
      let T = tags[key];
      if (!T) { T = tags[key] = { el: h('div', { class: 'sv-end' }) }; labels.append(T.el); }
      if (T.text !== txt) { T.text = txt; T.el.textContent = txt; }
      const r = { width: T.el.offsetWidth, height: T.el.offsetHeight };
      // At the free space's end of the lumen.
      let x, y;
      if (g.vert) { x = VW.C[0] - r.width / 2; y = u ? f.b - r.height - 26 : f.t + 4; }
      else { x = u ? f.r - r.width - 6 : f.l + 6; y = VW.C[1] - r.height / 2; }
      T.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  // ── The frame ──
  let lastKey = '';
  function draw(dt, run = true) {
    const rect = host.getBoundingClientRect();
    const W = Math.max(1, Math.round(rect.width)), H = Math.max(1, Math.round(rect.height));
    ensureGeo(W, H);
    const moving = stepState(dt) | stepView(dt);
    const dpr = Math.min(2, devicePixelRatio || 1);
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    const cs = getComputedStyle(host), P = palette(dark, cs);
    for (const cv of [tissue, fx]) if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; tissueKey = ''; }
    const g = geo, K = VW.k, M = [dpr * K * g.ca, dpr * K * g.sa, -dpr * K * g.sa, dpr * K * g.ca, dpr * VW.C[0], dpr * VW.C[1]];
    const key = [geoKey, VW.k.toFixed(4), VW.C.map((v) => v.toFixed(1)), dpr, dark, P.bg, Object.values(S).map((v) => v.toFixed(3)).join(','), model.hide, Math.round(model.P2 * 2)].join('|');
    if (key !== tissueKey) {
      tissueKey = key;
      const c = tissue.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = P.bg; c.fillRect(0, 0, tissue.width, tissue.height);
      c.setTransform(...M);
      paintTissue(c, P, dark);
      tissue.setAttribute('aria-label', describe());
    }
    const c = fx.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, fx.width, fx.height);
    c.setTransform(...M);
    // The red cells stay inside the lumen; the Kupffer cell is drawn over them.
    c.save(); c.beginPath();
    for (let i = 0; i <= 120; i++) { const x = lerp(VW.vis[0], VW.vis[1], i / 120); i ? c.lineTo(x, -halfW(x)) : c.moveTo(x, -halfW(x)); }
    for (let i = 120; i >= 0; i--) { const x = lerp(VW.vis[0], VW.vis[1], i / 120); c.lineTo(x, halfW(x)); }
    c.clip();
    paintCells(c, P, run ? dt : 0);
    c.restore();
    paintKupffer(c, P);
    const lk = [geoKey, VW.k.toFixed(4), VW.C.map((v) => v.toFixed(1)), S.lum.toFixed(3), S.act.toFixed(2), S.por.toFixed(2), model.hide, model.P2.toFixed(1), phoneMQ.matches].join('|');
    if (lk !== lastKey) { lastKey = lk; layoutTags(); layoutEnds(); }
    return moving;
  }
  function describe() {
    const m = model;
    const parts = [`A sinusoid, cut along its length${m.hide ? '' : `, at ${fmt(m.P2, 1)} millimeters of mercury`}.`];
    parts.push(S.por > 0.75 ? 'Its lining is fenestrated: open pores let plasma and protein into the space of Disse.' : S.por > 0.25 ? 'Many of its fenestrae have closed.' : 'Its fenestrae have closed: the sinusoid has become a capillary.');
    if (S.col > 0.15) parts.push('Collagen fills the space of Disse and the hepatocytes have lost their microvilli.');
    parts.push(S.act > 0.4 ? 'The stellate cell is activated: no vitamin A droplets, contracted, laying down collagen.' : 'The stellate cell is quiescent, full of vitamin A droplets.');
    return parts.join(' ');
  }
  function loop(now) {
    raf = 0;
    if (shown <= 0 || !model) return;
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    const run = store.get().running && !reduce.matches;
    draw(dt, run);
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
      if (opacity > 0 && was <= 0) { last = 0; lastKey = ''; tissueKey = ''; VW.k = 0; if (model) { for (const k in S) delete S[k]; draw(0); } }
      if (opacity > 0 && !raf && model) raf = requestAnimationFrame(loop);
    },
    /** Where the sinusoid's centre is drawn (stage px), its direction (radians) and the lumen's width there (px). */
    frame() {
      const rect = host.getBoundingClientRect();
      ensureGeo(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)));
      if (model && S.lum == null) stepState(0);
      if (!VW.f) stepView(0);
      return { x: VW.tC[0], y: VW.tC[1], ang: geo.ang, lumen: 2 * UM.lum * (S.lum ?? 1) * VW.tk };
    },
    isOpen: () => open,
  };
}
