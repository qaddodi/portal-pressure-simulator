// Semantic zoom, one level below the lobule: a stretch of one sinusoid, cut along its length, drawn on
// the GPU (sinusoid-gl.js) in the lobule's language: the pressure-coloured lumen with its shimmer and
// chevrons, the pale green lymph, the hepatocyte plates. Blood runs from the portal triad (left, or top
// on a portrait screen) to the central vein.
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
// The zoom from the lobule (lobule-zoom.js) hands this view its placement each frame, so the GPU draws
// the sinusoid exactly over the lobule's one at every step: first the vessel itself, then the tissue
// around it.

import { h, fmt, clamp, lerp } from './util.js?v=e803df99cd';
import { pressureColor } from './colormap.js?v=6d64a94345';
import { isPaused } from './clock.js?v=77fb9815e5';
import { sinusoidTargets } from './sinusoid-model.js?v=74f5d007ca';
import { createSinusoidGL, poreAt, cellAt, cellEdge, SLOT, SEED, UM } from './sinusoid-gl.js?v=8630385f70';

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rng(seed) { let q = seed >>> 0; return () => { q = (q * 1664525 + 1013904223) >>> 0; return q / 4294967296; }; }

let glSupport = null;
/** Whether this browser can draw the sinusoid view (WebGL2). */
export function sinusoidSupported() {
  if (glSupport == null) { try { glSupport = !!document.createElement('canvas').getContext('webgl2'); } catch { glSupport = false; } }
  return glSupport;
}

export function createSinusoidView({ host }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const phoneMQ = matchMedia('(max-width: 720px)');
  const canvas = h('canvas', { class: 'sv-canvas', role: 'img', 'aria-label': 'A sinusoid, cut along its length' });
  const labels = h('div', { class: 'lz-labels' });
  // Every part is named in place, as the anatomy names its organs: spaced small capitals on a halo, no chip or
  // leader, with its reading (if any) beneath in the lobule's number style. Captions in a narrow band (the lumen,
  // Disse) run along the vessel; those in the hepatocyte plates stay level.
  const regions = {};
  // One caption, built one way for every name in the view (the ends' venules are written exactly as the Sinusoid's own).
  function caption(key, cls, name, value) {
    let R = regions[key];
    if (!R) { R = regions[key] = { el: h('div', { class: cls }) }; labels.append(R.el); }
    const txt = name + '|' + value;
    if (R.text !== txt) {
      R.text = txt;
      const lines = value ? value.split(' · ') : [];
      R.el.replaceChildren(h('span', {}, name), ...lines.map((l) => { const [v, u] = l.split('~'); return h('span', { class: 'v' }, h('b', {}, v), u ? ` ${u}` : ''); }));
    }
    return R;
  }
  function region(key, name, value, x, y, { along = false, side = 0 } = {}) {
    const R = caption(key, `sv-region sv-region-${key}`, name, value);
    // side ±1: the caption sits wholly on that side of y (across the vessel), its near edge at y.
    const w = R.el.offsetWidth, hh = R.el.offsetHeight, ang = along && !geo.vert ? geo.ang : 0;   // (always level on a top-down sinusoid)
    const across = along ? hh : Math.abs(w * Math.sin(geo.ang)) + Math.abs(hh * Math.cos(geo.ang));
    const yc = y + side * (across / 2) / VW.k;
    let [cx, cy] = toScreen(x, yc);
    const cx0 = cx;
    if (!along) cx = clamp(cx, w / 2 + 4, geo.W - w / 2 - 4);   // a level caption stays on screen
    if (!geo.vert) {
      // Across the screen every caption is level: it steps clear of the ends' names and stays in the free space
      // (a narrow one, beside a presenter's words).
      for (const b of ENDBOX) if (b && cy + hh / 2 > b.y0 - 4 && cy - hh / 2 < b.y1 + 4) cx = b.u ? Math.min(cx, b.x0 - 14 - w / 2) : Math.max(cx, b.x1 + 14 + w / 2);
      cx = clamp(cx, Math.min(VW.f.l + w / 2 + 4, geo.W / 2), Math.max(VW.f.r - w / 2 - 4, geo.W / 2));
    }
    R.el.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px) translate(-50%, -50%)${ang ? ` rotate(${((ang * 180) / Math.PI).toFixed(2)}deg)` : ''}`;
    return { cx, cy, w, hh, x: x + (geo.vert ? 0 : (cx - cx0) / VW.k), half: (along ? w : Math.abs(w * Math.cos(geo.ang)) + Math.abs(hh * Math.sin(geo.ang))) / 2 / VW.k };
  }
  const legend = h('div', { class: 'sv-legend', 'aria-hidden': 'true' },
    h('span', {}, h('i', { class: 'alb' }), 'Protein'), h('span', {}, h('i', { class: 'wat' }), 'Plasma water'));
  // Thin leaders from a name in the plate to the part it names (a portrait screen's narrow bands and cells).
  const NS = 'http://www.w3.org/2000/svg', leaders = document.createElementNS(NS, 'svg');
  leaders.setAttribute('class', 'sv-leaders');
  const lead = {};
  function leader(key, R, x, y) {
    let L = lead[key];
    if (!L) { L = lead[key] = document.createElementNS(NS, 'g'); for (const t of ['line', 'circle']) L.append(document.createElementNS(NS, t)); leaders.append(L); }
    L.setAttribute('class', `sv-lead sv-lead-${key}`);
    const [tx, ty] = toScreen(x, y), sx = R.cx + Math.sign(tx - R.cx) * (R.w / 2 + 3), sy = clamp(ty, R.cy - R.hh / 2 + 4, R.cy + R.hh / 2 - 4);
    const [ln, dot] = L.children;
    const on = Math.abs(tx - sx) > 6 && Math.sign(tx - R.cx) === Math.sign(tx - sx);   // (none when the name already sits on it)
    L.style.opacity = on ? '' : '0';
    ln.setAttribute('x1', sx.toFixed(1)); ln.setAttribute('y1', sy.toFixed(1)); ln.setAttribute('x2', tx.toFixed(1)); ln.setAttribute('y2', ty.toFixed(1));
    dot.setAttribute('cx', tx.toFixed(1)); dot.setAttribute('cy', ty.toFixed(1)); dot.setAttribute('r', '1.8');
  }
  const el = h('div', { class: 'sv', 'aria-hidden': 'true' }, canvas, leaders, labels, legend);
  host.append(el);
  const gpu = createSinusoidGL(canvas);

  // The view is left only by the view switch (Lobule): the wheel and a pinch do nothing here.
  el.addEventListener('wheel', (ev) => ev.preventDefault(), { passive: false });

  // ── State ──
  let go = 1;   // 1 while the simulation runs, eased to 0 when paused: the flow, lymph, particles and proteins slow to a stop and resume without a jump
  let model = null, shown = 0, open = false, raf = 0, last = 0, dive = null, drewNow = false;
  const S = {};          // the drawing's state, easing toward sinusoidTargets(model)
  let geo = null, geoKey = '';

  // Where the sinusoid sits: centred in the space the floating pieces leave (a row kept for the legend).
  const appStyle = document.getElementById('app')?.style;
  const cssN = (k) => parseFloat(appStyle?.getPropertyValue(k)) || 0;
  function freeRect(W, H) {
    // The view has the stage to itself (the dock and the side panels are hidden in it), so their room is not kept.
    // (--pz-l, --pz-r, --pz-t, --pz-b: the room a presenter slide's text, data and bar take; the credit line, just above
    // the dock or the bar, is kept clear.)
    const t = cssN('--top-safe') + cssN('--cmp-h') + cssN('--pz-t') + 8 + (cssN('--pz-t') ? 0 : 40);
    const cr = document.querySelector('.stage-credit')?.getBoundingClientRect(), ht = host.getBoundingClientRect().top;
    const b = Math.min(H - cssN('--pz-b') - 34, cr?.height ? cr.top - ht - 8 : H - 34), l = 12 + cssN('--pz-l'), r = W - 12 - cssN('--pz-r');
    return { l, t, r: Math.max(l + 80, r), b: Math.max(t + 80, b) };
  }
  // The stretch is laid out once per stage size. It runs along the stage's longer side: across on a
  // landscape screen, down on a portrait one (where every label still reads level).
  function ensureGeo(W, H) {
    const key = W + '|' + H;
    if (key !== geoKey) {
      geoKey = key;
      const vert = W < H * 0.95, tall = vert, ang = vert ? Math.PI / 2 : 0;
      const X = Math.hypot(W, H) / 6 + 30;   // reach at the smallest scale (3 px/µm)
      // The fenestrae of both linings (the shader opens the same ones), for the traffic through them.
      const pores = [SEED.poreUp, SEED.poreDn].map((sd) => {
        const a = [];
        for (let j = Math.floor(-X / SLOT) - 1; j * SLOT < X + SLOT; j++) { const p = poreAt(j, sd); if (p) a.push(p); }
        return a;
      });
      // The stellate cell sits at a junction between two hepatocytes on the upper side, a little before the middle.
      let xs = cellEdge(0, SEED.plateUp);
      for (let j = -3; j <= 2; j++) { const b = cellEdge(j, SEED.plateUp); if (Math.abs(b + 10) < Math.abs(xs + 10)) xs = b; }
      geo = { W, H, ang, vert, tall, x0: -X, x1: X, xs, xk: vert ? 12 : 22, pores };   // (the Kupffer cell nearer the middle on a portrait screen, clear of the central venule's name)
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
  // Where it is drawn this frame: the view's own placement, carried by the zoom from the lobule while that runs.
  const CAM = { C: [0, 0], k: 1, ang: 0, ca: 1, sa: 0 };
  function stepView(dt) {
    const a = dt > 0.001 ? 1 - Math.exp(-dt / 0.22) : 0;
    const d = Math.abs(VW.tk - VW.k) * 40 + Math.abs(VW.tC[0] - VW.C[0]) + Math.abs(VW.tC[1] - VW.C[1]);
    if (d < 0.05 || dive) { VW.k = VW.tk; VW.C = [...VW.tC]; }   // (held at its mark while the zoom carries it)
    else { VW.k += (VW.tk - VW.k) * a; VW.C = VW.C.map((c, i) => c + (VW.tC[i] - c) * a); }
    // The zoom from the lobule (lobule-zoom.js): a turn and scale about the view's centre c, moved toward the lobule's sinusoid.
    let C = VW.C, k = VW.k, ang = geo.ang;
    if (dive) {
      // The zoom's similarity a fraction g of the way, about its fixed point q: the view's centre is where the lobule's sinusoid point p is now.
      // Its scale and angle are the ones it set out with, so nothing the layout does meanwhile moves it.
      const { g, p, q, rot, Z } = dive, zg = Z ** g, ct = Math.cos(rot * g), st = Math.sin(rot * g), dx = p[0] - q[0], dy = p[1] - q[1];
      C = [q[0] + zg * (dx * ct - dy * st), q[1] + zg * (dx * st + dy * ct)];
      k = dive.k * zg / Z; ang = dive.ang + rot * (g - 1);
    }
    Object.assign(CAM, { C, k, ang, ca: Math.cos(ang), sa: Math.sin(ang) });
    // The stretch of sinusoid on screen, and in the free space (µm along it).
    const g = geo, loc = ([X, Y]) => ((X - VW.C[0]) * Math.cos(g.ang) + (Y - VW.C[1]) * Math.sin(g.ang)) / VW.k;
    const span = (pts) => { const v = pts.map(loc); return [Math.min(...v), Math.max(...v)]; };
    const [a0, a1] = span([[0, 0], [g.W, 0], [0, g.H], [g.W, g.H]]);
    VW.vis = [Math.max(g.x0, a0 - 8), Math.min(g.x1, a1 + 8)];
    VW.fr = span([[VW.f.l, VW.f.t], [VW.f.r, VW.f.b]]);
    return d >= 0.05;
  }
  // Local (µm, along/across) → stage px, where the view rests (for the labels).
  const toScreen = (x, y) => { const ca = Math.cos(geo.ang), sa = Math.sin(geo.ang); return [VW.C[0] + VW.k * (x * ca - y * sa), VW.C[1] + VW.k * (x * sa + y * ca)]; };

  // The lumen's half width at x (the stellate cell's squeeze is a gentle waist around it), and Disse's width (as the shader's).
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

  // ── Colours, from the theme's tokens as the lobule takes them (0–1 rgb for the shader) ──
  const rgbCv = document.createElement('canvas').getContext('2d'), rgbMemo = new Map();
  function rgb(c) {
    let o = rgbMemo.get(c);
    if (o) return o;
    rgbCv.fillStyle = '#000'; rgbCv.fillStyle = c;
    const f = rgbCv.fillStyle;
    o = (f[0] === '#' ? [1, 3, 5].map((i) => parseInt(f.slice(i, i + 2), 16)) : f.match(/[\d.]+/g).slice(0, 3).map(Number)).map((x) => x / 255);
    rgbMemo.set(c, o);
    return o;
  }
  const mixv = (a, b, t) => a.map((x, i) => lerp(x, b[i], t));
  const v3 = (r, g, b) => [r / 255, g / 255, b / 255];
  function palette(dark, cs) {
    const v = (n, d) => cs.getPropertyValue(n).trim() || d;
    const bg = rgb(v('--stage-bg', v('--bg', dark ? '#0E1422' : '#FBFAF7')));
    // Pressure only: this view has no other lens.
    const m = model;
    const lumen = rgb(m.hide ? (dark ? '#58607A' : '#A0939C') : pressureColor(m.P2));
    // Lymph: clear and faintly green, deeper with more protein (as the lobule's lymphatics).
    const p = S.prot ?? 1, lo = dark ? [0.72, 0.76, 0.69] : [0.92, 0.94, 0.88], mid = dark ? [0.7, 0.77, 0.66] : [0.88, 0.92, 0.82], hi = dark ? [0.64, 0.75, 0.58] : [0.82, 0.89, 0.74];
    const ly = p < 0.45 ? mixv(lo, mid, p / 0.45) : mixv(mid, hi, (p - 0.45) / 0.55);
    const gap = rgb(v('--og-liver-2', dark ? '#5A3440' : '#C98E7E'));
    let cell = rgb(v('--og-liver-1', dark ? '#85514F' : '#E9C3B6'));
    if (dark) cell = mixv(gap, cell, 0.5);
    // The hepatocytes keep the lobule's colours; on a light page the clefts between them are drawn deeper, so each cell reads.
    const under = mixv(bg, gap, dark ? 0.55 : 0.5), cleft = dark ? under : mixv(bg, gap, 0.8);
    return {
      cBg: bg, cLumen: lumen, cLymph: dark ? mixv(bg, ly, 0.34) : ly,
      cCell: mixv(under, cell, dark ? 0.85 : 0.94), cUnder: cleft,
      cNuc: dark ? v3(40, 18, 34) : v3(132, 70, 100),
      cCol: dark ? v3(199, 186, 153) : v3(237, 222, 186), cBm: dark ? v3(204, 188, 142) : v3(150, 118, 70), aBm: dark ? 0.6 : 0.8,
      cBile: dark ? v3(150, 156, 80) : v3(122, 128, 61),
      cEndo: dark ? v3(122, 116, 156) : v3(184, 176, 204), cEndoN: dark ? v3(84, 74, 120) : v3(128, 114, 160),
      cHscQ: dark ? v3(176, 134, 102) : v3(224, 184, 150), cHscA: dark ? v3(160, 102, 74) : v3(190, 128, 94), cHscN: dark ? v3(96, 56, 42) : v3(146, 90, 66),
      cKup: dark ? v3(132, 106, 176) : v3(178, 150, 214), cKupN: dark ? v3(74, 54, 116) : v3(108, 80, 156), cKupE: dark ? v3(58, 42, 96) : v3(96, 70, 142),
      cRbc: dark ? v3(176, 62, 72) : v3(204, 74, 80),
      // The end arrows are inked as their labels: the text's colour inside the labels' halo.
      cEndF: rgb(v('--text', dark ? '#E9EDF6' : '#1F2128')), cEndE: rgb(v('--label-halo', dark ? '#0B1120' : '#FBFAF7')),
      cChev: [0.08, 0.08, 0.1], cRev: [1, 0.55, 0.16],   // (the app's chevron inks, as stage.js's chevInk: dark, orange where reversed)
      cAlb: dark ? v3(242, 182, 74) : v3(227, 154, 30), cAlbE: dark ? v3(110, 58, 0) : v3(140, 76, 0),
      cWat: dark ? v3(225, 238, 252) : v3(255, 255, 255), cWatE: dark ? v3(90, 110, 140) : v3(80, 110, 140),
      uShim: dark ? 0.3 : 0.5, uStreak: dark ? 0.3 : 0.85, uDark: dark ? 1 : 0,
    };
  }

  // ── What moves ──
  // The blood: the shader's shimmer and chevrons, at the flow. Albumin rides in it (amber dots), each at
  // its lane's speed (parabolic: fastest in the middle). Plasma crosses the wall into Disse: water (clear
  // specks) wherever it can, albumin only through open fenestrae; at a closed wall albumin is turned back.
  // In Disse the lymph runs back toward the portal triad, carrying what crossed.
  let flowX = 0, lymX = 0, spawnAcc = 0, bounceAcc = 0;
  const albs = [], movers = [];   // movers: { kind: 'w' water | 'a' albumin | 'b' albumin turned back, side, x, y (depth in Disse, 0…1), t, ph }
  const rnd = rng(17);
  { const R = rng(23); for (let i = 0; i < 150; i++) albs.push({ u: R(), y: R() * 1.9 - 0.95, ph: R() * Math.PI * 2 }); }
  const poreW = (p) => p.w * smooth(p.th - 0.14, p.th + 0.14, S.por);
  function pickPore(side, albumin) {
    const pores = geo.pores[side < 0 ? 0 : 1];
    let tot = 0;
    const wts = [];
    for (const p of pores) {
      const w = p.x > VW.vis[0] && p.x < VW.vis[1] ? poreW(p) : 0, k = albumin ? (w > 0.22 ? w * w : 0) : w > 0.02 ? w + 0.06 : 0;
      wts.push(k); tot += k;
    }
    if (tot <= 0) return null;
    let r = rnd() * tot;
    for (let i = 0; i < pores.length; i++) { r -= wts[i]; if (r <= 0 && wts[i] > 0) return pores[i]; }
    return null;
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
      movers.push({ kind: alb ? 'a' : 'w', side, x, t: 0, y: 0.15 + 0.7 * rnd(), ph: rnd() * Math.PI * 2 });
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
      if (q.kind === 'b') { q.x += vB * 0.6 * dt; if (q.t > BT) movers.splice(i, 1); continue; }
      // Through the wall (0.5 s, carried a little by the blood), then along Disse with the lymph.
      if (q.t < 0.5) q.x += vB * 0.25 * dt; else q.x += vL * (0.85 + 0.3 * Math.sin(q.ph)) * dt;
      if (q.x < VW.vis[0] - 4 || q.x > VW.vis[1] + 4) movers.splice(i, 1);
    }
  }
  // The sprites for this frame: (x, y, radius, alpha, kind) — 0 albumin, 1 water, 2 the flash at a sealed wall.
  const pts = new Float32Array(1400 * 5);
  const BT = 1.6;   // how long an albumin turned back at a sealed wall is shown (s)
  let albN = -1, spriteDt = 0;
  function sprites() {
    let n = 0;
    const put = (x, y, r, a, k) => { if (n >= 1400 || a <= 0.01) return; const o = n * 5; pts[o] = x; pts[o + 1] = y; pts[o + 2] = r; pts[o + 3] = a; pts[o + 4] = k; n++; };
    const [v0, v1] = VW.vis, span = v1 - v0 + 8;
    // How many ride in the stream follows the stretch shown; the count eases, so a dot fades in or out rather than popping.
    const nT = albs.length * clamp(span / 300, 0.15, 1);
    albN = albN < 0 ? nT : albN + (nT - albN) * Math.min(1, spriteDt / 0.8);
    const nA = Math.min(albs.length, Math.ceil(albN));
    for (let i = 0; i < nA; i++) {
      const a = albs[i], sp = 1.5 * (1 - a.y * a.y) + 0.08, x = v0 - 4 + ((((a.u * span + flowX * sp) % span) + span) % span);
      const y = clamp(a.y + 0.05 * Math.sin(flowX * 0.05 + a.ph), -0.96, 0.96) * (halfW(x) - 0.5);
      put(x, y, 0.36, clamp(albN - i, 0, 1), 0);
    }
    for (const q of movers) {
      if (q.kind === 'b') {
        // Up to the lining and back: an albumin dot with a small flash where it meets the sealed wall.
        // (It comes out of the stream and goes back into it, fading in and out there: never appearing or vanishing at once.)
        const u = Math.sin(Math.PI * clamp(q.t / BT, 0, 1)), y = q.side * lerp(halfW(q.x) - 2.6, halfW(q.x) - 0.45, u);
        const fa = smooth(0, 0.45, q.t) * smooth(BT, BT - 0.45, q.t);
        if (u > 0.8) put(q.x, y, 1.1, (u - 0.8) * 5 * fa, 2);   // (the glow under the dot)
        put(q.x, y, 0.38, fa, 0);
        continue;
      }
      const tIn = clamp(q.t / 0.5, 0, 1), e = tIn * tIn * (3 - 2 * tIn);
      const y = q.side * lerp(halfW(q.x) - 1.6, lerp(wallIn(q.x), hepIn(q.x), q.y), e) + q.side * 0.15 * Math.sin(q.t * 2 + q.ph);
      const al = smooth(-0.15, 0.45, q.t) * clamp((q.x - v0) / 6, 0, 1);   // (out of the stream, fading in: never appearing at once)
      if (q.kind === 'a') put(q.x, y, 0.38, al, 0); else put(q.x, y, 0.26, al, 1);
    }
    return n;
  }

  // ── Labels ──
  // The fenestrae's state in capitals with the share open (eased with S.por, so it counts rather than jumps).
  const fenTxt = () => `${S.por > 0.85 ? 'OPEN' : S.por > 0.15 ? 'CLOSING' : 'CLOSED'}~${Math.round(S.por * 100)}%`;
  function layoutTags() {
    const g = geo, m = model, hep = UM.hep, V = g.vert;
    const pick = (u) => lerp(VW.fr[0] + 8, VW.fr[1] - 8, u);
    const away = (x, from, d) => (Math.abs(x - from) < d ? from + (x < from ? -d : d) : x);
    const num = (v, d, u) => (m.hide ? '?' : `${fmt(v, d)}~${u}`);
    // In the lumen: the sinusoid (mid-view), the Kupffer cell beside itself, and the fenestrae along the far wall.
    if (g.tall) { layoutTall(); return; }
    for (const k in lead) if (k !== 'lymph') lead[k].style.opacity = '0';   // (across the screen only the lymph has a leader)
    const xc = away(pick(0.5), g.xk, 30);
    const rs = region('sin', 'Sinusoid', num(m.P2, 1, 'mmHg'), xc, 0, { along: true });
    LAB[0] = rs.x; LAB[1] = rs.half;
    kupName();
    const xf = away(away(pick(V ? 0.3 : 0.68), g.xs, 30), g.xk, 16);   // (clear of the stellate cell, and of the Kupffer cell's name)
    region('fen', 'Fenestrae', fenTxt(), xf, -(halfW(xf) - 0.6), { along: true, side: 1 });
    // In Disse: its name (on the stellate cell's side on a wide screen, clear of it), and the lymph it carries,
    // read in the plate just beyond it on the other side.
    const xq = V ? pick(0.24) : away(pick(0.86), g.xs, 40);
    region('disse', 'Space of Disse', '', xq, (V ? 1 : -1) * (wallIn(xq) + disseW(xq) * 0.5), { along: true });
    const xd = pick(V ? 0.55 : 0.32), lymph = (x) => region('lymph', 'Lymph', m.hide ? '?' : `${fmt(m.lymph, 1)}~mL/min · Protein ${Math.round(m.lyProt * 100)}%`, x, hepIn(x) + 1.2, { side: 1 });
    let ly = lymph(xd);
    // In the plates: the stellate cell named just beyond its body, and a hepatocyte on itself, clear of its nucleus.
    region('hsc', S.act > 0.5 ? 'Activated stellate cell' : 'Stellate cell', '', g.xs, -(hepIn(g.xs) + 1), { side: -1, along: V });
    const xh = pick(V ? 0.88 : 0.08), hc = cellAt(xh, SEED.plateDn), hep1 = (x) => region('hep', 'Hepatocyte', '', x, hepIn(x) + hep * (hc.nv < 0.5 ? 0.78 : 0.22));
    // The cell's name and the lymph's numbers share a plate: on a narrow view (a cell wider than its share of the
    // screen) the name slides back along its cell, then the numbers step on, until the two are clear.
    const gap = (a, b) => Math.abs(a.x - b.x) - a.half - b.half, pad = 16 / VW.k;   // (µm)
    let hl = hep1((hc.x0 + hc.x1) / 2);
    if (gap(hl, ly) < pad) {
      const d = hl.x < ly.x ? -1 : 1;   // (the side of the numbers the name is on)
      hl = hep1(clamp(ly.x + d * (ly.half + hl.half + pad), hc.x0 + hl.half, hc.x1 - hl.half));
      if (gap(hl, ly) < pad) ly = lymph(hl.x - d * (hl.half + ly.half + pad));
    }
    // The lymph's numbers are tied by a thin leader to the space of Disse that carries it.
    { const xt = ly.x + ly.half + 3; leader('lymph', ly, xt, wallIn(xt) + disseW(xt) * 0.5); }
  }
  // A portrait screen: the sinusoid runs top to bottom and every label reads level. The lumen keeps only its own
  // name; the narrow bands (fenestrae, Disse) and the cells are named in the plates beside them, the stellate cell's
  // side (right) and the Kupffer cell's side (left) each in its own column, spaced down the screen between the ends'
  // names, each tied to what it names by a thin leader.
  function layoutTall() {
    const g = geo, m = model, hep = UM.hep, k = VW.k;
    // The band between the ends' names (and below the legend), µm along the vessel.
    const u0 = Math.max(VW.fr[0], (BAND[0] - VW.C[1]) / k), u1 = Math.min(VW.fr[1], (BAND[1] - VW.C[1]) / k);
    const pick = (u) => lerp(u0, u1, u);
    const num = (v, d, u) => (m.hide ? '?' : `${fmt(v, d)}~${u}`);
    const mid = (x) => hepIn(x) + Math.min(hep * 0.5, (geo.W / 2 / k - hepIn(x)) * 0.5);   // the middle of the plate's part on screen
    const dis = (x) => wallIn(x) + disseW(x) * 0.5;
    LAB[0] = pick(0.42); LAB[1] = region('sin', 'Sinusoid', num(m.P2, 1, 'mmHg'), LAB[0], 0).half;
    // Right (y < 0): fenestrae, stellate cell, a hepatocyte.
    let x = pick(0.08);
    leader('fen', region('fen', 'Fenestrae', fenTxt(), x, -mid(x)), x, -(halfW(x) + UM.endo * 0.5));
    x = clamp(g.xs, pick(0.3), pick(0.62));
    leader('hsc', region('hsc', S.act > 0.5 ? 'Activated\nstellate cell' : 'Stellate\ncell', '', x, -mid(x)), g.xs, -(dis(g.xs) + 0.6));   // (stacked, to fit the plate)
    region('hep', 'Hepatocyte', '', pick(0.92), -mid(pick(0.92)));
    // Left (y > 0): the space of Disse, the lymph it carries, the Kupffer cell.
    x = pick(0.08);
    leader('disse', region('disse', 'Space of\nDisse', '', x, mid(x)), x, dis(x));
    x = pick(0.46);
    leader('lymph', region('lymph', 'Lymph', m.hide ? '?' : `${fmt(m.lymph, 1)}~mL/min · Protein ${Math.round(m.lyProt * 100)}%`, x, mid(x)), x + 2, dis(x + 2));
    kupName();
  }
  // The Kupffer cell is named inside itself, over its body above the nucleus (its name tinted as the cell).
  const kupName = () => region('kup', 'Kupffer\ncell', '', geo.xk - 0.3, halfW(geo.xk) - 3.3 * clamp(halfW(geo.xk) / 5.2, 0.6, 1), { along: true });
  const BAND = [0, 0];   // a portrait screen's band for the other names, between the ends' (px down the screen)
  const LAB = [0, 0];   // the lumen's name: x and half length (µm), for the shader to keep the arrowheads clear of it
  const END = [0, 0, 1];   // the end arrows: portal x, central x, size (µm)
  const ENDBOX = [null, null];   // the ends' names on a wide screen (px), for the captions to keep clear of
  function layoutEnds() {
    const g = geo, f = VW.f;
    // The ends: the portal venule the blood comes from and the central venule it goes to, with their pressures (as the lobule labels them).
    const m = model, val = (P) => (m.hide ? '?' : `${fmt(P, 1)}~mmHg`);
    for (const [key, name, value, u] of [['in', 'Portal venule', val(m.P1), 0], ['out', 'Central venule', val(m.P3), 1]]) {
      // (The Sinusoid's own caption, class and all: same capitals, size, ink, halo and reading.)
      const T = caption(key, 'sv-region sv-region-sin sv-end', name, value);
      const w = T.el.offsetWidth, hh = T.el.offsetHeight;
      let x, y;
      // Its arrow (drawn by the shader), outside the label, points toward the vessel off the view: the portal venule's
      // above it on a top-down sinusoid (left of it on a wide one), pointing up (left); the central venule's below it
      // (right of it), pointing down (right).
      const A = 22 + 10;   // (the arrow and its gaps, px)
      if (g.vert) { x = VW.C[0] - w / 2; y = u ? f.b - hh - A : f.t + A; }
      else { x = u ? f.r - w - 8 - A : f.l + 8 + A; y = VW.C[1] - hh / 2; }
      T.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      ENDBOX[u] = g.vert ? null : { u, x0: u ? x : x - A, x1: u ? x + w + A : x + w, y0: y, y1: y + hh };
      if (g.vert) BAND[u] = u ? y - 6 : y + hh + 6;
      const ax = g.vert ? VW.C[0] : u ? x + w + A / 2 : x - A / 2, ay = g.vert ? (u ? y + hh + A / 2 : y - A / 2) : VW.C[1];
      const ca = Math.cos(g.ang), sa = Math.sin(g.ang);
      END[u] = ((ax - VW.C[0]) * ca + (ay - VW.C[1]) * sa) / VW.k;
    }
    END[2] = Math.min(22 / VW.k, UM.lum * S.lum * 0.95);   // (a bold head, as wide as the names' capitals are tall, within the lumen)
    // (On a top-down sinusoid the other names keep below the legend too.)
    if (g.vert) BAND[0] = Math.max(BAND[0], cssN('--top-safe') + cssN('--cmp-h') + cssN('--pz-t') + 12 + legend.offsetHeight + 8);
    // The legend: at the top left, under the top bar.
    const lx = f.l + 2, ly = cssN('--top-safe') + cssN('--cmp-h') + cssN('--pz-t') + 12;
    // (On a top-down sinusoid it stays in the plate on the left, clear of the vessel and the portal venule's name.)
    const lr = g.vert ? toScreen(0, hepIn(0))[0] - 8 : geo.W - 12;
    legend.style.maxWidth = `${Math.max(90, lr - lx)}px`;
    legend.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px)`;
  }

  // ── The frame ──
  let lastKey = '', descKey = '';
  function draw(dt, run = true, paint = true) {
    const rect = host.getBoundingClientRect();
    const W = Math.max(1, Math.round(rect.width)), H = Math.max(1, Math.round(rect.height));
    ensureGeo(W, H);
    if (dt > 0 || S.lum == null) stepState(dt);
    stepView(dt);
    go += ((isPaused() ? 0 : 1) - go) * (dt > 0 ? 1 - Math.exp(-dt / 0.25) : 0);
    if (go < 0.002) go = 0;
    if (run && dt > 0 && go > 0) stepMovers(dt * go);
    if (!paint) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    // The names are laid out where the view will rest, during the zoom too (hidden until it lands), so the end arrows
    // the shader draws are in place from the first frame and nothing moves when the names fade in.
    const lk = [geoKey, VW.k.toFixed(3), VW.C.map((v) => v.toFixed(0)), S.lum.toFixed(3), S.act > 0.5, Math.round(S.por * 20), model.hide, model.P2.toFixed(1), model.lymph.toFixed(1), Math.round(model.lyProt * 100), model.P1.toFixed(1), model.P3.toFixed(1), phoneMQ.matches].join('|');
    if (lk !== lastKey) { lastKey = lk; layoutEnds(); layoutTags(); }
    if (gpu) {
      const u = palette(dark, getComputedStyle(host));
      // Device px ↔ local µm.
      const { C, k, ca, sa } = CAM, K = k * dpr;
      u.uI0 = [ca / K, sa / K, -(C[0] * ca + C[1] * sa) / k];
      u.uI1 = [-sa / K, ca / K, (C[0] * sa - C[1] * ca) / k];
      u.uF0 = [K * ca, -K * sa, dpr * C[0]]; u.uF1 = [K * sa, K * ca, dpr * C[1]];
      u.uPx = 1 / K; u.uK = K; u.uKs = Math.min(K, 12 * dpr);   // (the particles no larger than on a phone)
      Object.assign(u, {
        uLum: UM.lum * S.lum, uPinch: S.pinch, uXs: geo.xs, uXk: geo.xk, uKy: halfW(geo.xk), uHscA: wallIn(geo.xs) + disseW(geo.xs) * 0.5 + 0.8,
        uCol: S.col, uBm: S.bm, uMv: S.mv, uAct: S.act, uPor: S.por, uFlow: flowX, uLym: lymX, uDir: Math.sign(S.v || 1),
        uEnd: [END[0], END[1], END[2], 0.95], uLab: [LAB[0], LAB[1]],
      });
      // The zoom from the lobule: one camera move. The lobule (magnified by the compositor) carries it most of the way;
      // the view, already drawn where the lobule's own sinusoid is, comes in over all of it at once as the zoom lands
      // (no strip that appears and then lengthens), and its detail (fenestrae, microvilli, cells, traffic) resolves last.
      // Both follow the zoom's eased progress, so Back to Lobule plays the same frames in reverse.
      if (dive) {
        const g = dive.g;
        u.uRev = [0, 0, 0, 0];
        u.uAll = smooth(0.5, 0.88, g);
        u.uDet = [smooth(0.72, 1, g), 1e5];
        u.uFocus = smooth(0.82, 1, g);   // (the page shows around it only once it has landed, not as a band while it is small)
      } else { u.uRev = [1, -1e5, 1e5, 1e5]; u.uAll = 1; u.uDet = [1, 1e5]; u.uFocus = 1; }
      spriteDt = Math.max(0, dt) * go;
      gpu.draw(u, pts, sprites());
    }
    const dk = [Math.round(S.por * 4), S.col > 0.15, S.act > 0.4, model.hide, model.P2.toFixed(0), model.lymph.toFixed(1), Math.round(model.lyProt * 100)].join('|');
    if (dk !== descKey) { descKey = dk; canvas.setAttribute('aria-label', describe()); }
  }
  function describe() {
    const m = model;
    const parts = [`A sinusoid, cut along its length${m.hide ? '' : `, at ${fmt(m.P2, 1)} millimeters of mercury`}.`];
    parts.push(S.por > 0.75 ? 'Its lining is fenestrated: plasma and its proteins pass through the open pores into the space of Disse.'
      : S.por > 0.25 ? 'Many of its fenestrae have closed: less protein gets through.' : 'Its fenestrae have closed: the wall is sealed, and protein is turned back.');
    if (!m.hide) parts.push(`Hepatic lymph ${fmt(m.lymph, 1)} milliliters per minute, flowing back along the space of Disse toward the portal triad, with ${Math.round(m.lyProt * 100)} percent of plasma protein.`);
    if (S.col > 0.15) parts.push('Collagen fills the space of Disse and the hepatocytes have lost their microvilli.');
    parts.push(S.act > 0.4 ? 'The stellate cell is activated: no vitamin A droplets, contracted, laying down collagen.' : 'The stellate cell is quiescent, full of vitamin A droplets.');
    return parts.join(' ');
  }
  function loop(now) {
    raf = 0;
    if (shown <= 0 || !model) return;
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    // (While the zoom runs, place() has already drawn this frame in step with the lobule.)
    draw(dt, !reduce.matches, !drewNow);   // (the wall's traffic eases to a stop while the clock is paused, and picks up again on resume)
    drewNow = false;
    raf = requestAnimationFrame(loop);
  }

  return {
    el,
    /** The lobule's model (lobuleState), each time it changes. */
    setModel(m) { model = m; if (shown > 0 && !raf) raf = requestAnimationFrame(loop); },
    /**
     * Placement during the zoom from the lobule (lobule-zoom.js): opacity; the zoom's state, if it is
     * running (`dive`: g, its eased progress; p, the lobule's sinusoid point on screen at rest; q, the zoom's
     * fixed point; rot and Z, the full turn and scale; run, how far the vessel runs straight each way, in
     * lumen radii); whether it is fully open (takes input).
     */
    place({ opacity, dive: dv = null, isOpen = false }) {
      const was = shown;
      shown = opacity; dive = dv;
      el.style.opacity = opacity.toFixed(3);
      el.style.visibility = opacity > 0 ? 'visible' : 'hidden';
      open = isOpen;
      el.classList.toggle('on', isOpen);
      el.setAttribute('aria-hidden', String(!isOpen));
      if (opacity > 0 && was <= 0) {
        last = 0; lastKey = ''; VW.k = 0; movers.length = 0; spawnAcc = 0; bounceAcc = 0;
        if (model) {
          for (const k in S) delete S[k];
          // Arrive with the wall already at work: a few seconds of traffic run before the first frame.
          draw(0, false);
          for (let i = 0; i < 40; i++) stepMovers(0.1);
        }
      }
      // Drawn now, in step with the lobule's transform this frame (not a frame later).
      if (opacity > 0 && model) { draw(0, false); drewNow = true; }
      if (opacity > 0 && !raf && model) raf = requestAnimationFrame(loop);
    },
    /** Where the sinusoid's centre is drawn at rest (stage px), its direction (radians) and the lumen's width there (px). */
    frame() {
      const rect = host.getBoundingClientRect();
      ensureGeo(Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)));
      if (model && S.lum == null) stepState(0);
      return { x: VW.tC[0], y: VW.tC[1], ang: geo.ang, k: VW.tk, lumen: 2 * UM.lum * (S.lum ?? 1) * VW.tk };
    },
    isOpen: () => open,
    available: !!gpu,
  };
}
