// The dive's field
// (moved out of lobule-zoom.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { deltaColor, dropColor, flowColor, heatColor, oxygenColor, pressureColor, velocityColor } from './colormap.js';
import { D_SURFACE, easeMove } from './ease.js';
import { createFieldGL } from './field-gl.js';
import { easeNow } from './frame.js';
import { FX_GPU } from './fx-gl.js';
import { LIGHT } from './light.js';
import { flareAt, twigRadius, sinK } from './lobule-mouths.js';
import { FADE_MID, FIELD_RS, NEIGHBOUR_FLAT, SIN_NARROW, dullSinusoidInto, fadeOuter, fieldBlend, fieldDof, greyStep, neighbourBlur, surroundGrade } from './lobule-look.js';
import { disseJ, lensModeOf, lobuleStateInto, lymphRate } from './lobule-model.js';
import { fibrousBand, fibrousCuff, fibrousTract, scarGrowth } from './lobule-paint.js';
import { lerp } from './num.js';
import { isGreyLens } from './organ-dim.js';
import { gpuPicture, recordPaint } from './paint-gl.js';
import { store } from './store.js';
import { tileCopy } from './tile-gl.js';
import { clamp, cssRGB01 } from './util.js';
import { MAX_TIERS, ORIGIN_GREY, binVeins } from './veins-gl.js';
import { WIDE_GL } from './wide-gl.js';

export function createLobuleField(st, live) {
  const { MAXT, N, TAU, V, binAway, binCache, buildWide, css, draw, dropWide, ensureGL, field, fieldG, figureTop, free, fsBuf, fxGLOn, glRows, host, hostSize, isDark, lzDensity, lzLoop, modelBuf, padBox, paintWorld, reduce, release, resetView, rgb01, sX, sY, smooth, snapState, styles, tissueGLOn, tk, tubeData, unseen, wideGLOn, worldCap } = st;
  // ── The dive's field ──
  // A flat-topped hexagonal tiling with the lobule view's own spacing (so the lobule it settles on, and
  // its six neighbours, land where the view draws them), as a repeating pattern. The tile is drawn once
  // per theme at sizes a factor of 2 apart, and the one at or just above the size on screen is used,
  // so the zoom stays sharp and never shimmers.
  const tileSets = new Map();   // field state → its tiles (a few kept, so a value hovering at a step does not redraw them)
  // The field mirrors the lobule's own state (rounded, so the tiles are redrawn only when it changes
  // visibly): septa and portal tracts thicken with fibrosis, bridging septa turn the lobules into
  // nodules in cirrhosis, the sinusoids pale as they capillarize, and congestion darkens zone 3.
  // (With some hysteresis: a value wavering on a step boundary must not flip between two sets of tiles, redrawing them mid-dive.)
  const fsLast = {};
  const fsQ = (k, x) => { const v = x || 0, o = fsLast[k]; return o !== undefined && Math.abs(v - o) < 0.09 ? o : (fsLast[k] = Math.round(v * 8) / 8); };
  // (Closed, the lobule's model is its last visit's, not this patient's: the field follows the latest frame instead.)
  let fsM = null, fsF, fsP, fsH, fsI;
  const closedModel = () => {
    const st = store.get(), p = st.params, hl = st.healthy, im = st.imaging;
    if (live.F !== fsF || p !== fsP || hl !== fsH || im !== fsI) { fsF = live.F; fsP = p; fsH = hl; fsI = im; fsM = lobuleStateInto(fsBuf, live.F, st, undefined, live.F.Pf || live.F.P); }   // alloc-rare: only when the frame or the patient's inputs changed
    return fsM;
  };
  // (One kept record, written in place: read at once by whoever asks, never held.)
  const fsOut = { su: 0, pre: 0, post: 0, sin: 0, cong: 0 };
  const fieldState = () => {
    const m = !unseen() && live.model ? live.model : live.F ? closedModel() : live.model;
    if (m) { fsOut.su = fsQ('su', m.septU); fsOut.pre = fsQ('pre', m.fibPre); fsOut.post = fsQ('post', m.fibPost); fsOut.sin = fsQ('sin', m.fibSin); fsOut.cong = fsQ('cong', m.congU); }
    else { fsOut.su = 0; fsOut.pre = 0; fsOut.post = 0; fsOut.sin = 0; fsOut.cong = 0; }
    return fsOut;
  };
  // The surround's grey. A lens other than Pressure greys the anatomy's organs (stage.js plateTargets); the neighbouring lobules, the dive's
  // field and the tissue round the open lobule take the same grey, so they match the liver they are zoomed into or out of (the lobule in
  // focus keeps its lens's colours). grey.k: 0 (the tiles as drawn) … 1 (the lens's grey liver), eased over the lens crossfade; it is
  // there at once while nothing of the surround is seen (a dive not yet begun, the lobule staged ahead). It grades the finished picture
  // (surroundGrade, in the shaders and the 2D passes), so a lens switch needs no new tiles.
  const grey = { k: 0, from: 0, to: 0, t0: 0 };
  const surroundSeen = () => !unseen() || live.fieldOp > 0.002;
  const greyNow = (now = performance.now()) => greyStep(grey, isGreyLens(lensModeOf(store.get())) ? 1 : 0, easeNow(), LENS_FADE, !surroundSeen() || reduce.matches);
  const greyMoving = () => { greyNow(); return grey.k !== grey.to; };
  // The tiles for a new look made in a timer task of their own (never in the frame that found them missing), then drawn.
  function tileLaterRun() {
    live.tileLater = null;
    if (live.fade <= 0) return;
    const t = live.fieldTile(getComputedStyle(host), isDark(), live.tileLaterRd);
    quietCopy(t, stageBg(getComputedStyle(host), isDark()));
    live.tissueKey = ''; live.drawVersion++; lzLoop.want();
  }
  // (A tile is a picture recorded for the GPU (paint-gl.js), painted into a texture by each context that draws it: there is no canvas the
  // browser can leave blank. A copy the GPU could not make is retried after TILE_RETRY ms, as before.)
  const TILE_RETRY = 250;
  const tileDue = (q) => !!q && !!q.blank && performance.now() >= q.blankAt + TILE_RETRY;
  // A tile's toned copies given back (quietG, liverG: tile-gl.js descriptions, whose textures each GPU context gives back at its next sweep).
  const freeCopies = (q) => { if (q.quietG) { free(q.quietG.cv); q.quietG = null; } if (q.liverG) { free(q.liverG.cv); q.liverG = null; } };
  // The copies the GPU draws from, made on the GPU itself (tile-gl.js): the neighbours' quiet copy (blurred, wrapping round the repeat,
  // drained and flattened toward the page) and the dive's liver-toned one, each a description each GPU context draws into its own
  // texture from the tile, once, with no blur in script and no canvas held for them. Remade when the tile was drawn again or the tone
  // changed. (The 2D copies and ?tilegpu=0 are gone, 1 Nov: nothing off the GPU.)
  function gpuCopy(t, slot, k, look) {
    const q = t[slot];
    if (q && q.k === k && q.cv.src === t.cv && q.cv.width) return q;
    if (q) { free(q.cv); live.fieldGL?.sweep(); live.tissueGL?.sweep(); }
    const blank = !t.cv || !t.cv.width || t.blank;
    return (t[slot] = { k, R: t.R, tw: t.tw, th: t.th, TW: t.TW, TH: t.TH, cv: tileCopy(t.cv, t.tw, t.th, look, blank), blank, blankAt: 0, bg: null });   // alloc-rare: only when the tile was drawn again or the surround's tone changed
  }
  // (The quiet copy stands while its tile and tone do: the tone compared as numbers, the text that names it made only when it is remade.)
  const quietCopy = (t, bg) => {
    const q = t.quietG;
    if (q && q.bg && q.bg.length === bg.length && q.cv.src === t.cv && q.cv.width) {
      let same = true;
      for (let i = 0; i < bg.length; i++) if (q.bg[i] !== bg[i]) { same = false; break; }
      if (same) return q;
    }
    const r = gpuCopy(t, 'quietG', bg.join(','), { blur: neighbourBlur(t.R), sat: 0.45, tone: bg, toneA: 0.42, flat: NEIGHBOUR_FLAT });   // alloc-rare: only when the tile was drawn again or the surround's tone changed
    r.bg = bg.slice();   // alloc-rare: only when the tile was drawn again or the surround's tone changed
    return r;
  };
  const liverCopy = (t, cs, dark, bg) => {
    const tone = liverTone(cs, bg);
    return gpuCopy(t, 'liverG', tone.map((x) => x.toFixed(2)).join(','), { blur: 0, sat: 0.45, tone, toneA: 0.42, flat: 0 });
  };
  // The tile look's inputs as last read (the four colours' text as the page gave it, the field state, the theme) and what they make: the colours
  // trimmed, and the key naming the tile set. Read from the page each time, compared in place, and made again only when one changed.
  const fcLook = { dark: null, raw: ['', '', '', ''], fs: [NaN, NaN, NaN, NaN, NaN], key: '', cell: undefined, gap: undefined, cvc: undefined, pvc: undefined };
  const FC_NAMES = ['--og-liver-1', '--og-liver-2', '--vein-systemic', '--vein-portal'];
  const cssTrim = (cs, n) => cs.getPropertyValue(n).trim() || undefined;   // alloc-rare: only when a tile is drawn, or its look changed (the trimmed text is a new string)
  function fieldLook(cs, dark, fs) {
    const L = fcLook, raw = L.raw, f = L.fs;
    let same = L.key !== '' && L.dark === dark && f[0] === fs.su && f[1] === fs.pre && f[2] === fs.post && f[3] === fs.sin && f[4] === fs.cong;
    for (let i = 0; i < 4; i++) { const r = cs.getPropertyValue(FC_NAMES[i]); if (r !== raw[i]) { raw[i] = r; same = false; } }
    if (!same) {
      L.dark = dark; f[0] = fs.su; f[1] = fs.pre; f[2] = fs.post; f[3] = fs.sin; f[4] = fs.cong;
      L.cell = raw[0].trim() || undefined; L.gap = raw[1].trim() || undefined; L.cvc = raw[2].trim() || undefined; L.pvc = raw[3].trim() || undefined;   // alloc-rare: only when the tile's look (a colour, the theme or the field state) changed
      L.key = [dark, L.cell, L.gap, L.cvc, L.pvc, Object.values(fs).join(',')].join('|');   // alloc-rare: only when the tile's look (a colour, the theme or the field state) changed
    }
    return L;
  }
  // The tile at or just above the size asked for (the largest when none is), and the nearest drawn one for a look that is still being drawn.
  const tileAt = (ts, rd) => { for (let i = 0; i < ts.length; i++) if (ts[i].R >= rd) return ts[i]; return ts[ts.length - 1]; };
  const tileDrawn = (ts, rd) => {
    for (let i = 0; i < ts.length; i++) if (ts[i].R >= rd && ts[i].cv) return ts[i];
    for (let i = ts.length - 1; i >= 0; i--) if (ts[i].cv) return ts[i];
    return undefined;
  };
  // Tissue, not a diagram: the repeat is two lobules wide and two high, and every corner of the
  // lattice is nudged by a hash of where it is (the same for the lobules that share it, and the
  // same across the repeat), so the outlines wander a little. Each lobule is filled warmer toward
  // its central vein, its septa are soft bands, its sinusoids gently curved, and a triad (venule,
  // arteriole, ductule) sits at each corner.
  function drawTile(t, { cell, gap, cvc, pvc, art, duct, dark, fs }) {
    const S3 = Math.sqrt(3), R = t.R;
    const hash = (i, j) => { let q = (i * 374761393 + j * 668265263) >>> 0; q = ((q ^ (q >>> 13)) * 1274126177) >>> 0; return (q >>> 8) / 16777216; };   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
    const COLa = cssRGB01('--lz-septum'), edges = new Set();   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
    const TW = 6 * R, TH = 2 * S3 * R, tw = Math.round(TW), th = Math.round(TH);
    // (Recorded as shapes and painted by the GPU, paint-gl.js: no 2D canvas.)
    const rec = recordPaint(tw, th, (c) => {   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
    c.scale(tw / TW, th / TH);
    c.fillStyle = gap; c.fillRect(0, 0, TW, TH);
    // The corners of the lobule at the pattern's origin (where the lobule view draws its own lobule) stay
    // on the regular lattice, and their triads are the view's own, so none is drawn twice.
    const HOME = new Set(['2,0', '1,1', '11,1', '10,0', '11,3', '1,3']);   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
    const home = (ix, iy) => HOME.has(`${((ix % 12) + 12) % 12},${((iy % 4) + 4) % 4}`);   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
    // A lattice point, nudged (ix, iy in half-R and half-height steps, wrapped to the repeat).
    const corner = (x, y) => {   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
      const ix = Math.round(x / (R / 2)), iy = Math.round(y / (S3 * R / 2));
      if (home(ix, iy)) return [x, y];
      const u = hash(((ix % 12) + 12) % 12, ((iy % 4) + 4) % 4), w = hash(((ix % 12) + 12) % 12 + 31, ((iy % 4) + 4) % 4 + 17);
      const a = u * TAU, m = 0.11 * R * (0.4 + 0.6 * w);
      return [x + Math.cos(a) * m, y + Math.sin(a) * m];
    };
    const lat = (q) => (((Math.round(q[0] / (R / 2)) % 12) + 12) % 12) * 4 + (((Math.round(q[1] / (S3 * R / 2)) % 4) + 4) % 4);   // wrapped lattice index   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
    const centres = [];   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
    for (let i = -1; i <= 4; i++) for (let j = -1; j <= 2; j++) centres.push([1.5 * R * i, S3 * R * (j + (i & 1 ? 0.5 : 0))]);
    const lw = Math.max(0.6, R * 0.05), round = 1 + 0.6 * fs.su;   // nodules: rounder plates
    const Ps = centres.map(([x, y]) => Array.from({ length: 6 }, (_, i) => corner(x + Math.cos((i * Math.PI) / 3) * R, y + Math.sin((i * Math.PI) / 3) * R)));   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
    // In three passes, so the septa lie over every plate and the triads and veins over the septa.
    for (const [ci, [x, y]] of centres.entries()) {
      const P = Ps[ci];
      // The plate: rounded corners (the path runs through the edges' midpoints), warmer inside.
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const A = P[i], B = P[(i + 1) % 6], C = P[(i + 2) % 6];
        const m1 = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], m2 = [(B[0] + C[0]) / 2, (B[1] + C[1]) / 2];
        const k = Math.min(1, round - 1), bx = B[0] + (x - B[0]) * 0.12 * k, by = B[1] + (y - B[1]) * 0.12 * k;
        if (!i) c.moveTo(m1[0], m1[1]);
        c.quadraticCurveTo(bx, by, m2[0], m2[1]);
      }
      c.closePath();
      const g = c.createRadialGradient(x, y, R * 0.05, x, y, R);
      g.addColorStop(0, gap); g.addColorStop(0.35, cell); g.addColorStop(1, cell);
      c.globalAlpha = 1; c.fillStyle = g; c.fill();
      c.save(); c.clip();
      // Congestion: zone 3 pooled with blood (nutmeg).
      if (fs.cong > 0) {
        const n = c.createRadialGradient(x, y, R * 0.08, x, y, R * (0.35 + 0.25 * fs.cong));
        n.addColorStop(0, tk('--lz-congestion', (0.55 * fs.cong).toFixed(3))); n.addColorStop(1, tk('--lz-congestion', 0));
        c.fillStyle = n; c.fillRect(x - R, y - R, 2 * R, 2 * R);
      }
      // Sinusoids: from each edge's portal side toward the central vein, each with a slight bend;
      // capillarized, they turn pale (in dark mode dark instead, so the lobules around the one in focus recede).
      c.strokeStyle = fs.sin > 0.2 ? tk('--lz-field-sin-pale') : gap; c.lineCap = 'round'; c.lineWidth = Math.max(0.5, R * (0.022 + 0.01 * fs.sin));
      for (let i = 0; i < 18; i++) {
        const k = Math.floor(i / 3), f = (i % 3 + 0.5) / 3, A = P[k], B = P[(k + 1) % 6];
        const sx = A[0] + (B[0] - A[0]) * f, sy = A[1] + (B[1] - A[1]) * f;
        const bend = (hash(i + 7, Math.round(x + y)) - 0.5) * 0.35 * R;
        const mx = (sx + x) / 2 + (y - sy) / R * bend * 0.6, my = (sy + y) / 2 + (sx - x) / R * bend * 0.6;
        c.globalAlpha = (dark ? 0.4 : 0.28) * (0.6 + 0.4 * hash(i, 3)) * (1 + 0.6 * fs.sin);
        c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(mx, my, x, y); c.stroke();
      }
      c.restore();
      // Septa: soft bands along the borders; in cirrhosis, broad pale bands of collagen.
      c.lineJoin = 'round';
      c.globalAlpha = dark ? 0.5 : 0.38; c.strokeStyle = gap; c.lineWidth = lw * 1.6;
      c.beginPath(); P.forEach((q, i) => c[i ? 'lineTo' : 'moveTo'](q[0], q[1])); c.closePath(); c.stroke();
    }
    c.globalAlpha = 1;
    if (fs.su > 0) for (const [ci, [x, y]] of centres.entries()) {
      const P = Ps[ci];
      {
        // Each border is shared by two lobules: drawn once, the same from either side.
        const bw = R * (0.045 + 0.075 * fs.su), reach = Math.min(1, 0.3 + 2.4 * fs.su), det = R < 40 ? 0 : R < 120 ? 0.5 : 1;
        for (let k = 0; k < 6; k++) {
          let A = P[k], B = P[(k + 1) % 6], ka = lat(A), kb = lat(B);
          const key = Math.round(A[0] + B[0]) + ',' + Math.round(A[1] + B[1]);
          if (edges.has(key)) continue; edges.add(key);
          // Seeded and oriented by the wrapped lattice, so a band crossing the repeat matches its copy.
          if (ka > kb) { [A, B] = [B, A]; [ka, kb] = [kb, ka]; }
          const sd = ka * 48 + kb, o = { w: bw, rgb: COLa, a: 0.5 + 0.4 * fs.su, amp: R * 0.025, seed: sd, detail: det };
          if (reach >= 1) fibrousBand(c, A, B, o);
          else { const M = (t, U, Q) => [lerp(U[0], Q[0], t), lerp(U[1], Q[1], t)]; fibrousBand(c, A, M(reach / 2, A, B), { ...o, e1: 0.2 }); fibrousBand(c, B, M(reach / 2, B, A), { ...o, e1: 0.2, seed: sd + 1 }); }   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
        }
        // Portal-central bridges, late in cirrhosis.
        if (fs.su > 0.18) { const g = Math.min(1, (fs.su - 0.18) / 0.4);
          for (const k of [0, 2, 4]) fibrousBand(c, P[k], [lerp(P[k][0], x, 0.82), lerp(P[k][1], y, 0.82)], { w: bw * (0.6 + 0.3 * g), rgb: COLa, a: 0.4 + 0.45 * g, e1: 0.35, amp: R * 0.04, seed: 5000 + k * 97 + lat([x, y]), detail: det }); }
      }
    }
    for (const [ci, [x, y]] of centres.entries()) {
      const P = Ps[ci];
      // Central vein, with a soft rim (a collagen cuff with central fibrosis).
      if (fs.post > 0) {
        const growth = scarGrowth(fs.post), inner = R * 0.075 * (1 + 0.4 * fs.cong);
        c.globalAlpha = 1;
        fibrousCuff(c, x, y, inner, inner + R * 0.07 * (0.1 + 0.85 * growth), COLa, growth);
      }
      c.globalAlpha = 0.35; c.fillStyle = cvc; c.beginPath(); c.arc(x, y, R * 0.12, 0, TAU); c.fill();
      c.globalAlpha = 0.85; c.beginPath(); c.arc(x, y, R * 0.075 * (1 + 0.4 * fs.cong), 0, TAU); c.fill();
      // Triads, in a collagen tract that grows with portal fibrosis.
      for (const [px, py] of P) {
        if (home(Math.round(px / (R / 2)), Math.round(py / (S3 * R / 2)))) continue;
        if (fs.pre > 0) {
          c.globalAlpha = 1;
          fibrousTract(c, px, py, R * 0.09 * (0.8 + 0.18 * scarGrowth(fs.pre)), Math.atan2(py - y, px - x), COLa, scarGrowth(fs.pre), 700 + lat([px, py]), 0.35);
        }
        c.globalAlpha = 0.85; c.fillStyle = pvc; c.beginPath(); c.ellipse(px, py, R * 0.055, R * 0.04, 0.6, 0, TAU); c.fill();
        c.fillStyle = art; c.beginPath(); c.arc(px + R * 0.06, py - R * 0.035, R * 0.022, 0, TAU); c.fill();
        c.fillStyle = duct; c.beginPath(); c.arc(px - R * 0.05, py + R * 0.045, R * 0.018, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
    }
    });
    Object.assign(t, { tw, th, TW, TH, cv: gpuPicture(rec, ++live.texVer), blank: false, blankAt: 0 });   // alloc-rare: only when a tile is drawn (a new look or size), never a frame that already has its tile
  }
  // The surround fading into the page with distance from the lobule (q: 0..1, how far it has faded).
  // The surround fades into the page (light in light mode, dark in dark mode).
  const shadeOf = (bg) => bg;
  // d: { a: opacity 0..1, x, y: where the settling lobule's centre is (stage px), r: its radius on
  // screen, ox, oy: the point it emerges from, quiet: 0..1, the surround drained as the lobule view's is,
  // focus: 0..1, the lobules away from it faded into the page }. null hides it.
  // What a dive's frames share (the stage's size, its styles), read once per dive: reading them each
  // frame, after the stage's own writes, would make the browser lay out the page again every frame.
  // (cs: the styles' values remembered as first read, so a frame never reads a live style after the stage's writes, which makes the
  // browser recompute the page's styles in the middle of the frame.)
  let diveCtx = null;
  const styleSnap = (cs) => { const m = new Map(); return { getPropertyValue: (n) => { let v = m.get(n); if (v === undefined) m.set(n, (v = cs.getPropertyValue(n))); return v; } }; };
  const fieldHide = (cv) => { if (cv.width) { cv.width = 0; cv.height = 0; } cv.style.opacity = '0'; };
  function paintField(d) {
    if (!d) diveCtx = null;
    if (!d || d.a <= 0.002) { fieldHide(field); fieldHide(fieldG); live.fieldOp = 0; if (live.shareTop && live.fieldWas > 0) live.shareTop.present(); live.fieldWas = 0; return; }
    if (!diveCtx) {
      const rect = host.getBoundingClientRect(), cs = getComputedStyle(host), dark = isDark();
      diveCtx = { W: Math.max(1, Math.round(rect.width)), H: Math.max(1, Math.round(rect.height)), cs: styleSnap(cs), dark, bg: stageBg(cs, dark) };
    }
    const { W, H, cs, dark, bg } = diveCtx;
    const dpr = Math.min(1, devicePixelRatio || 1) * 0.8;   // in motion and behind the lobule: a modest resolution is plenty
    // On the GPU (the same picture, its tile sizes blended). (No 2D field since 1 Nov: nothing off the GPU.)
    const g = fieldGLOn();
    const drew = g ? paintFieldGL(g, d, W, H, dpr, cs, dark, bg) : false;
    fieldHide(field);
    live.fieldOp = Math.min(1, d.a * 1.25);
    // (The GPU could not draw this frame (a tile's texture not taken yet; field-gl.js keeps the last frame where one shows, 'held', and
    // tries the send again shortly): its canvas keeps its last frame, at this frame's opacity, or, with none yet, the field waits for its
    // first GPU frame: the tiles go to the GPU ahead of the dive (fieldUp), so this is a frame or two at most. With no GPU for it at all
    // (no WebGL2, or the context lost), no field is drawn.)
    if (drew || fieldG.width) fieldG.style.opacity = live.fieldOp.toFixed(3);
    if (live.shareTop && (drew || live.fieldWas > 0)) live.shareTop.present();   // (hosted: the field is laid by the stage's present)
    live.fieldWas = live.fieldOp;
  }
  // The field's GPU drawing (field-gl.js): made the first time it is asked for (ahead of the first dive, by the idle preparation);
  // null where WebGL2 is missing, and set aside if its context is lost (no field is drawn until it is made again).
  function fieldGLOn() {
    if (live.fieldGL === undefined) { const ft = figureTop(); live.fieldGL = ft ? createFieldGL(fieldG, { host: ft }) : null; if (!live.fieldGL) fieldG.remove(); }
    return live.fieldGL && !live.fieldGL.lost ? live.fieldGL : null;
  }
  // A tile's liver-toned and quieted copies sent to the GPU ahead of the dive (no frame of it uploads a texture).
  // (Made on the GPU from the tile, tile-gl.js: the tile kept there for them is let go of once both are made.)
  const fieldUp = (t) => { const g = fieldGLOn(); if (!g) return; g.upload(t.liverG?.cv); g.upload(t.quietG?.cv); g.dropRaw(); };
  // A tile's two copies for the dive, ahead of it, made on the GPU.
  const fieldCopies = (t, cs, dark, bg) => { if (!fieldGLOn()) return; liverCopy(t, cs, dark, bg); quietCopy(t, shadeOf(bg, dark)); fieldUp(t); };
  // One frame of the field on the GPU, the same picture the 2D passes made (the same tiles, quieting, fade and emerging mask, with the
  // same numbers), except that the two tile sizes nearest the lobules' size on screen are blended (fieldBlend), so the detail of the
  // larger one comes in gradually as the lobules grow instead of in a step.
  function paintFieldGL(g, d, W, H, dpr, cs, dark, bg) {
    const fw = Math.round(W * dpr), fh = Math.round(H * dpr), rd = d.r * dpr;
    const { a, b, mix } = fieldBlend(rd * 0.55);   // (half the tile's resolution, as at rest)
    const ta = live.fieldTile(cs, dark, FIELD_RS[a]), tb = b !== a && mix > 0 ? live.fieldTile(cs, dark, FIELD_RS[b]) : null;
    const f = clamp(d.focus ?? d.quiet, 0, 1), fq = Math.max(f, d.quiet), fx0 = d.x * dpr, fy0 = d.y * dpr;
    const r0 = f > 0 ? Math.exp(lerp(Math.log(Math.hypot(W, H) * dpr * 0.45), Math.log(Math.min(Math.hypot(W, H) * dpr * 0.45, rd * 1.1)), f)) : 0;
    const r1 = fadeOuter(r0, Math.max(...[[0, 0], [fw, 0], [0, fh], [fw, fh]].map(([x, y]) => Math.hypot(x - fx0, y - fy0))));
    const q = d.quiet >= 1 ? 1 : Math.max(0, d.quiet || 0), tone = shadeOf(bg, dark);
    const rho = Math.hypot(W, H) * dpr * (0.2 + 1.1 * d.a + 2 * smooth(0.7, 1, d.a)), gk = greyNow();
    return g.draw({
      W: fw, H: fh, a: liverCopy(ta, cs, dark, bg).cv, b: tb ? liverCopy(tb, cs, dark, bg).cv : null,
      qa: q > 0 ? quietCopy(ta, tone).cv : null, qb: q > 0 && tb ? quietCopy(tb, tone).cv : null, mix: tb ? mix : 0, quiet: q,
      ox: fx0, oy: fy0, rd, fade: f > 0 ? [r0, r1, fq] : null, mid: FADE_MID, bg: tone, mask: d.a < 1 ? [d.ox * dpr, d.oy * dpr, rho] : null,
      dof: fieldDof(d, rd, Math.hypot(fw, fh)), grey: gk > 0 ? surroundGrade(gk) : null, hold: fieldG.style.opacity !== '0',
    });
  }
  // The liver's tone the dive starts from: the page's colour 60% of the way to the liver's.
  function liverTone(cs, bg) { const lv = rgb01(cs.getPropertyValue('--og-liver-2').trim()); return bg.map((x, i) => lerp(x, lv[i], 0.6)); }
  const stageBg = (cs, dark) => rgb01(cs.getPropertyValue('--stage-bg').trim() || cs.getPropertyValue('--bg').trim());
  function preparePieces() {
    if (live.fade > 0 || !live.F) return [];
    const rect = host.getBoundingClientRect(), W = Math.round(rect.width), H = Math.round(rect.height);
    if (W < 2 || H < 2) return [];
    const dark = isDark(), key = [W, H, dark, devicePixelRatio, live.zonesOn, live.lymphOn, live.bileOn, Object.values(fieldState()).join(',')].join('|');
    if (key === live.prepKey) return [];
    let cs, land, bg;
    const q = [
      () => { cs = styles(); bg = stageBg(cs, dark); land = live.api.landing(); },   // (the stage's kept copy of its styles: no live read)
      () => ensureGL(),
      () => fieldGLOn(),   // (the field's GPU context, made here once, so the first dive does not compile its shader)
      () => tissueGLOn(),   // (and the tissue's)
      () => { if (FX_GPU) fxGLOn(); },   // (and the ductules' and lymph overlay's: its two programs compiled here, not in the dive's first frame)
      () => { if (WIDE_GL) wideGLOn(); },   // (and the wide copy's, for a station dive or a rise)
    ];
    // The dive's field: every tile it steps through on the way to the landing size (see paintField).
    const fdpr = Math.min(1, devicePixelRatio || 1) * 0.8;
    q.push(() => {
      const top = land.r * fdpr * 0.55;
      // (Each with its quieted copy too: the dive lays it over the field from midway, and building one there, a tile at a time,
      // snagged the zoom's last stretch.)
      // (One size past the landing's: the GPU field blends it in over the last stretch, fieldBlend.)
      for (let rd = 6; ; rd *= 2) { const r = rd; q.splice(q.indexOf(null), 0, () => { fieldCopies(live.fieldTile(cs, dark, r), cs, dark, bg); }); if (r >= top * 2) break; }
    }, null);
    q.push(() => {   // the landed lobule: its state, then the tissue, then one full frame
      const st = store.get();
      snapState();
      live.model = lobuleStateInto(modelBuf, live.F, st, undefined, live.F.Pf || live.F.P);
      const cv = (n, d) => cs.getPropertyValue(n).trim() || d;
      live.model.inks = { normal: cv('--flow-normal'), reversed: cv('--flow-reversed'), portal: cv('--vein-portal'), systemic: cv('--vein-systemic') };
      const dpr = Math.min(2, devicePixelRatio || 1);
      quietCopy(live.fieldTile(cs, dark, live.geo.R * V.k * dpr * 0.55), bg);
    }, () => {
      const dpr = Math.min(2, devicePixelRatio || 1), tg = live.gl && !live.gl.lost ? tissueGLOn() : null;
      if (tg) live.paintTissue(W, H, dpr, dark, cs, false, tg);
    }, () => prebin());
    // (The first frame waits, a piece at a time, for the binning the piece before sent to the worker.)
    const first = () => { if (binning) { q.unshift(first); return; } if (live.fade <= 0) { draw(0); release(); live.prepKey = key; } };
    q.push(first);
    return q;
  }
  // The landed lobule's vessels binned ahead of its first full frame, exactly as that frame's pass would bin them (drawGL), in the
  // stage's binning worker (sweep-worker.js) when there is one: their radii, reach and bins kept where it looks for them (radNow,
  // binReach, binCache), so it finds them made. (Start-up profile, 2 Nov 2026: that first frame, binning included, was the
  // preparation's longest task, about half a second headless; the binning alone a quarter of a second.) A binning that fails in the
  // worker is left to the frame, as before.
  let binning = null;
  function prebin() {
    if (live.fade > 0 || !live.model || !live.gl || live.gl.lost) return;
    const [W, H] = hostSize();
    live.ensureGeo(W, H);
    const G = live.geo, tubeSet = live.lymphOn ? (live.bileOn ? G.tubes : G.lymphTubes) : live.bileOn ? G.bileTubes : G.bloodTubes, bk = live.lymphOn ? (live.bileOn ? 'all' : 'lymph') : live.bileOn ? 'bile' : 'blood';
    if (binCache.has(bk)) return;
    calibersChanged(rzOf(), G);
    for (const t of tubeSet) {
      t.maxR = maxOf(radiiNow(t));
      live.binReach[t.id] = Math.max(live.binReach[t.id] || 0, Math.ceil((t.maxR * 1.6 + (WALL[t.kind] || 0) + 10) / 2) * 2);
    }
    const ids = new Set(tubeSet.map((t) => t.id)), tubes = tubeSet.map((t) => ({ id: t.id, pts: t.pts, reach: live.binReach[t.id] })), joins = G.joins.filter((j) => j.members.every((id) => ids.has(id)));
    if (!binAway) { binCache.set(bk, binVeins(tubes, joins)); return; }
    const was = live.geo, job = binning = Promise.resolve().then(() => binAway(tubes, joins)).then((b) => { if (live.geo === was && b && !binCache.has(bk)) binCache.set(bk, b); }, () => {}).finally(() => { if (binning === job) binning = null; });
  }
  // Runs the pieces in order; a null is a placeholder that a piece fills in.
  function prepareRun(q) { while (q.length) { const f = q.shift(); if (f) { f(); return q.length > 0; } } return false; }
  // Before a dive: the work its frames would otherwise stall on, done a piece per frame while the
  // anatomy is still only being magnified (the vessels' WebGL, then the field's tiles up to the size
  // the dive ends at). warm() does the next piece; true while any is left.
  let warmQ = [];
  function prewarm(rEnd) {
    const cs = getComputedStyle(host), dark = isDark(), bg = stageBg(cs, dark), top = rEnd * Math.min(1, devicePixelRatio || 1) * 0.8 * 0.55;
    warmQ = [() => ensureGL(), () => fieldGLOn(), () => { if (FX_GPU) fxGLOn(); }, () => { if (WIDE_GL) wideGLOn(); }];   // (the field's GPU context too, if the idle preparation has not made it)
    // The tiles paintField steps through (each a no-op when the idle preparation already drew it).
    for (let rd = 6; ; rd *= 2) { const r = rd; warmQ.push(() => { fieldCopies(live.fieldTile(cs, dark, r), cs, dark, bg); }); if (r >= top * 2) break; }
  }
  // Right before a zoom into the lobule starts: the lobule is drawn, whole and unseen, for the framing it will land on (flow marks
  // faded), so the zoom only magnifies and fades in what is already drawn. Its canvases (about 16 MB on a phone) are given back
  // when the zoom returns to the anatomy (setDiveZoom), and drawn again before the next one.
  function stage() {
    while (warm());   // the dive's field tiles (built ahead while idle, so usually nothing left), the vessels' WebGL
    if (live.fade > 0 || !live.F) return;
    live.flowA = 0; live.flowT = 0; resetView(); live.staging = true; snapState();
    try { live.update(live.F); } finally { live.staging = false; }
    if (!live.model) return;
    dropWide();
    // (Aimed at a station: the whole lobule's copy for the zoom, built first; the layers are then drawn for the screen.)
    // (Reduced motion: the dive fades, nothing is magnified, so no copy: it was built and freed in the same moment.)
    const [W, H] = hostSize(), box = reduce.matches ? null : padBox(W, H), wd = box ? buildWide(W, H, box) : null;
    // (The tissue drawn on the GPU now, unseen, with the rim the dive will scale it down with (setDiveZoom, about the landing), so the
    // zoom's first frame has nothing to draw. Landed, it is drawn once more without the rim.)
    if (!wd && !reduce.matches && live.geo) live.diveRim = live.rimOf(sX(live.geo.cx), sY(live.geo.cy), live.geo.R * V.k);
    live.idleDrawn = ''; draw(0); live.diveDrawn = true; live.staged = live.api.viewKey(); live.relLater = true; live.wide = wd;
    live.labelsAhead();   // (the names measured, placed and read for the landing now, so they fade in with the lobule instead of arriving 1 to 2 s after it)
    // (The landing frame sends the bitmap to the GPU itself (tissueOnGPU), not this staging: a send here showed the lobule's tissue
    // black on a Mac while zooming into it, until a pan, 1 Nov 2026.)
  }
  function warm() { const f = warmQ.shift(); if (f) f(); return warmQ.length > 0; }
  // Before a dive (stage.js setLobule): a new patient's tissue picture, which stage() would otherwise record in the frame the zoom
  // starts, is recorded here first (paint-gl.js: its shapes only; the GPU paints it when it is first drawn), for the view and the
  // model stage() then sets the same way. Null when there is nothing to wait for (recorded already, no GPU, the lobule showing); else
  // a promise that resolves once it is in. Never rejects. Nothing is seen meanwhile: the lobule is not showing.
  function paintAhead() {
    if (live.fade > 0 || !live.F || !live.geo || !tissueGLOn()) return null;
    const [W, H] = hostSize();
    live.ensureGeo(W, H);
    resetView(); live.staging = true; snapState();
    try { live.update(live.F); } finally { live.staging = false; }
    const G = live.geo, m = live.model;
    if (!G || !m) return null;
    const dark = isDark(), cs = styles(), dpr = lzDensity(...hostSize());   // (draw's own)
    const sc = Math.min(2 ** (Math.ceil(Math.log2(Math.max(0.05, dpr * V.k)) * 2) / 2), worldCap(G, dpr)), ws = live.worldStateOf(m, G, dark, cs), wk = live.wkOf(sc, ws);
    if (wk === live.worldKey) return null;
    return new Promise((done) => setTimeout(() => {
      // (In a task of its own, not a frame: as paintTissue would, with the last state's picture given back, nothing showing to fade.)
      if (live.fade <= 0 && live.geo === G && live.worldKey !== wk) {
        free(live.worldCv); free(live.worldOld); live.xfT0 = 0;
        live.worldKey = wk; live.worldState = ws; live.worldSc = sc; live.worldGeo = G; live.worldDraws++;
        live.worldCv = paintWorld(sc, m, G, dark, cs);
        live.tissueGL?.sweep();
      }
      done();
    }, 0));
  }
  // (The model's values now, written in place into the target record each frame; the eased ones are a record of their own.)
  const rzTg = { sin: 0, congU: 0, fibPre: 0, fibPost: 0, art: 0, lr: 0, p1: 0, p3: 0, iap: 0, alb: 0, sg: 0 };
  const rzFill = (o, m) => { o.sin = m.zone.sin; o.congU = m.congU; o.fibPre = m.fibPre; o.fibPost = m.fibPost; o.art = m.art; o.lr = lymphRate(m); o.p1 = m.P1; o.p3 = m.P3; o.iap = m.iap ?? 5; o.alb = m.alb ?? 4; o.sg = m.sigma ?? 0.15; return o; };
  const rzOf = () => live.rz || (live.rz = rzFill({ sin: 0, congU: 0, fibPre: 0, fibPost: 0, art: 0, lr: 0, p1: 0, p3: 0, iap: 0, alb: 0, sg: 0 }, live.model));   // alloc-once: the eased values are made with the first reading, and again after a reset
  function easeRadii(dt) {
    const tg = rzFill(rzTg, live.model);
    if (!live.rz) { rzOf(); return false; }
    const k = -Math.expm1(-dt / 0.3);
    let mv = false;
    for (const key in tg) {
      const d = tg[key] - live.rz[key];
      if (Math.abs(d) > 2e-4 * (1 + Math.abs(tg[key]))) { live.rz[key] += d * k; mv = true; } else live.rz[key] = tg[key];
    }
    return mv;
  }
  // The sinusoids widen toward the central vein, 1 at the portal end to 1.3 by the vein, as one smooth curve of the distance from the centre (the old 1, 1.15, 1.3 by generation
  // gave every merge a wider parent and narrower kids: with swollen sinusoids, a visible step in the wall; lobule-mouths.js sinK). A merge is at one place, so all its legs share one width.
  function radiusAt(t, i) {   // (the bile's radii are fixed, set where it is built: lobule-bile.js)
    if (t.bile) return t.radius[i]; const m = rzOf(), g = live.geo, R = g.R;
    const z3 = 1 - smooth(0.24, 0.56, t.rho[i]);
    const rs = g.rs0 * SIN_NARROW / m.sin ** 0.12 * (1 + 1.5 * m.congU * z3);
    switch (t.kind) {
      case 's0': case 's1': return rs * sinK(t.rho[i]);   // (one width along the lobule, not one a generation: a wider parent met its narrower kids at a step in the wall, and the larger the sinusoids the larger the step)
      case 's2': return rs * sinK(t.rho[i]) * flareAt(t.rho[i] * R - R * (0.07 + 0.05 * m.congU) * (1 - 0.3 * m.fibPost), rs * 1.3);   // (opens like a trumpet into the central vein: lobule-mouths.js flareAt)
      case 'an': return rs * 0.68;
      case 'in': { const r = lerp(R * 0.015, R * 0.009, i / (N - 1)) / (1 + 0.45 * m.fibPre); return r * flareAt(Math.hypot(t.pts[i][0] - t.pts[0][0], t.pts[i][1] - t.pts[0][1]) - R * 0.042 / (1 + 0.35 * m.fibPre), r); }   // (and from the portal venule's side: the same flare)
      case 'pv': return R * 0.042 / (1 + 0.35 * m.fibPre);
      case 'cv': return R * (0.07 + 0.05 * m.congU) * (1 - 0.3 * m.fibPost);
      case 'ha': return Math.max(1.6, R * 0.0115 * clamp(m.art, 0.6, 2.2) ** 0.3);   // (the triad's smallest vessel: 0.014 read as a big red bulb, 6 Nov)
      case 'bd': return Math.max(1.6, R * 0.0145);
      // The arteriole's twig into zone 1 is a fine, faint thread (6 Nov: at 0.0055 it read as a thick red bar; see TW_ALPHA).
      case 'tw': { const b = Math.max(0.8, R * 0.0026 * clamp(m.art, 0.6, 2.2) ** 0.3); return twigRadius(b, 0.62 * Math.max(1.6, R * 0.0115 * clamp(m.art, 0.6, 2.2) ** 0.3), 0.55 * rs * 1.0, i / (N - 1)); }   // (leaves the arteriole wide, tapers to its thread, opens into the sinusoid: lobule-mouths.js twigPath)
      // Lymphatics widen as drainage rises (capped, so the tract lymphatic never swamps the triad).
      // Wet Disse (Mohammad, 16 Nov 2026): the space of Disse is a sleeve round its sinusoid, drawn under it, as wide as the fluid filtered
      // at that point (lobule-model.js disseJ: the engine's hepatic lymph spread along the sinusoid by its pressure). A healthy liver's is a hairline.
      case 'ly': { const j = disseJ(m, t.rho[i]); return rs * sinK(t.rho[i]) + g.rs0 * (0.12 + 0.42 * Math.sqrt(j)) * (0.55 + 0.45 * smooth(0.07, 0.24, t.rho[i])); }
      case 'lt': return Math.max(1.5, R * 0.0075 * lyWr(m.lr, 0.4));
      case 'lv': return R * 0.016 * lyWr(m.lr, 0.4);
      default: return rs;
    }
  }
  // Lymphatic caliber against the healthy flow: 1 at a normal rate, up to 1 + k at four times it.
  const lyWr = (lr, k) => 1 + k * smooth(1, 4, lr) - 0.12 * (1 - smooth(0.3, 1, lr));
  // Lymph as the sinusoids filter it: f, how hard (0 at the healthy rate, 1 at four times it); over, how far
  // past what the lymphatics can carry (the rest weeps off the liver: ascites); and its protein, rich
  // where the fenestrae stay open (congestion behind the sinusoids), thin where collagen lines the
  // space of Disse (capillarized sinusoids in cirrhosis). Protein, from the engine's sieving (lymph about
  // 88 % of plasma in a normal liver, about 50 % once capillarized), shows as the green's depth, the
  // albumin beads in each drop and, once capillarized, a collagen line along the sinusoids.
  const lyF = (m) => smooth(1, 4, lymphRate(m));
  const lyProt = (m) => clamp((m.lyProt - 0.42) / 0.42, 0, 1);
  // (The lymph's colour at three depths of protein, light and dark; written into the caller's own triple.)
  const LY_LIGHT = { lo: [0.8, 0.91, 0.92], mid: [0.76, 0.9, 0.91], hi: [0.72, 0.88, 0.9] }, LY_DARK = { lo: [0.13, 0.33, 0.37], mid: [0.14, 0.36, 0.4], hi: [0.15, 0.39, 0.43] };   // (the lymph's teal, the hue of the app's --tr-ivc)
  function lyInkInto(out, m, dark) {
    const p = lyProt(m), c = dark ? LY_DARK : LY_LIGHT;
    if (p < 0.45) { const u = p / 0.45; for (let i = 0; i < 3; i++) out[i] = lerp(c.lo[i], c.mid[i], u); }
    else { const u = (p - 0.45) / 0.55; for (let i = 0; i < 3; i++) out[i] = lerp(c.mid[i], c.hi[i], u); }
    return out;
  }
  const LY_TMP = [0, 0, 0];   // (the lymph's colour, written in place for each drawGL pass to read at once)
  // The triad's outlines: dark blue, red and green (the venule, arteriole and ductule), against the common casing.
  const EDGE = { pv: [0.12, 0.27, 0.58], in: [0.12, 0.27, 0.58], ha: [0.55, 0.1, 0.16], bd: [0.27, 0.29, 0.12] }, BD_FILL = [0.48, 0.5, 0.24];   // bile: a dark, dull olive
  const TW_ALPHA = 0.45;   // the arteriole's twig, faint: zone 1's arterial inflow is a hint beside the portal inflow, not a second vessel
  const WALL = { bs: 0.3, bh: 0.6, s0: 0.8, s1: 0.85, s2: 0.9, an: 0.7, in: 1.5, pv: 2, cv: 1.6, sh: 1.1, ha: 1.7, bd: 1.8, tw: 0.5, ly: 0.2, lt: 0.8, lv: 1.1 };
  // Weight of the inlet's value at a radius along the sinusoids (1 at the lobule's edge, 0 at the central vein).
  const sinW = (rho) => clamp((rho - 0.075) / (0.92 - 0.075), 0, 1) ** 0.8;
  const qP = (v) => Math.round(v * 2) / 2;
  /**
   * A lumen's color in the active lens, as the anatomy colors the vessel it stands for. `seg`: pv,
   * in (inlet venule), sin (sinusoids and anastomoses) or cv; `w`: along an inlet 0 → 1, along the
   * sinusoids the inlet's weight (sinW).
   */
  function ink(seg, w = 0) {
    const k = lensK();
    if (k >= 1) return inkOf(live.model.mode, seg, w);
    return css(inkRGBInto(INK_TMP, seg, w, k));
  }
  const INK_TMP = [0, 0, 0], NEUTRAL_TMP = [0, 0, 0], VEL_RANGE = [1 / 1.5, 1.5], OXY_FULL = [1, 1, 1];
  // The same as [r, g, b] 0–1 in the caller's own triple; mid-switch, the old lens's color eased into the new one's (k: 0 … 1).
  function inkRGBInto(out, seg, w = 0, k = lensK()) {
    const M = live.model.mode, to = M === 'origin' || M === 'firstpass' ? ORIGIN_RGB : rgb01(inkOf(M, seg, w));
    if (k >= 1) { out[0] = to[0]; out[1] = to[1]; out[2] = to[2]; return out; }
    return inkMix(out, to, seg, w, k);
  }
  function inkMix(out, to, seg, w, k) {
    const from = live.lensFrom === 'origin' || live.lensFrom === 'firstpass' ? ORIGIN_RGB : rgb01(inkOf(live.lensFrom, seg, w));
    for (let i = 0; i < 3; i++) out[i] = from[i] + (to[i] - from[i]) * k;
    return out;
  }
  function inkOf(M, seg, w) {
    const m = live.model;
    // ('since': a slide's Change colours, the same scale as 'delta', counted from the slide's own reference: lobule-model.js m.dP.)
    if (M === 'pressure' || M === 'delta' || M === 'since' || M === 'heat') {
      const V = M === 'pressure' ? null : m.dP, v0 = V ? V[0] : qP(m.P1), v1 = V ? V[1] : qP(m.P2), v2 = V ? V[2] : qP(m.P3);
      const v = seg === 'pv' ? v0 : seg === 'in' ? lerp(v0, v1, 0.6 * w) : seg === 'cv' ? v2 : v2 + (v1 - v2) * w;
      return M === 'pressure' ? pressureColor(qP(v)) : M === 'heat' ? heatColor(qP(v)) : deltaColor(qP(v));
    }
    if (M === 'oxygen') {
      const [a, b, c] = m.oxy || OXY_FULL;
      return oxygenColor(seg === 'pv' ? a : seg === 'in' ? lerp(a, b, w) : seg === 'cv' ? c : c + (b - c) * w);
    }
    const e = seg === 'sin' ? 'sin' : seg === 'cv' ? 'post' : 'pre';
    switch (M) {
      case 'drop': return dropColor(e === 'pre' ? m.P1 - m.P2 : e === 'sin' ? m.P2 - m.P3 : m.P3 - m.P4);
      case 'direction': return m.rev[e] ? m.inks.reversed : m.inks.normal;
      case 'flow': return flowColor(Math.abs(m.Qs[e]) * 0.06);
      // Velocity against the healthy liver's own beds (no Doppler range covers them): normal from two-thirds to one and
      // a half times the healthy flow, as the anatomy colors its veins without a published range (velNormal.js).
      case 'velocity': return velocityColor(Math.abs(m.Qs[e]) / Math.max(1e-6, Math.abs(m.Q0[e] ?? m.Qs[e])), VEL_RANGE);
      case 'neutral': {
        const a = rgb01(m.inks.portal), b = rgb01(m.inks.systemic), k = seg === 'cv' ? 1 : seg === 'sin' ? 1 - w : 0;
        for (let i = 0; i < 3; i++) NEUTRAL_TMP[i] = lerp(a[i], b[i], k);
        return css(NEUTRAL_TMP);
      }
      default: return pressureColor(seg === 'pv' || seg === 'in' ? m.P1 : seg === 'cv' ? m.P3 : m.P3 + (m.P2 - m.P3) * w);
    }
  }
  const segOf = (t) => (t.kind === 'pv' || t.kind === 'in' || t.kind === 'cv' ? t.kind : 'sin');
  const tubeW = (t, end) => { const sg = segOf(t); return sg === 'sin' ? sinW(t.rho[end ? N - 1 : 0]) : end ? 1 : 0; };
  // Capillarized sinusoids are drawn duller as fibSin rises (G21): drained toward the lobule's shade, never brighter.
  // (From the eased sinusoidal resistance, so a new patient's sinusoids dull gradually, as their calibers change.)
  const sinFib = () => clamp(Math.log(rzOf().sin) / 3.2, 0, 1);
  const sinDull = (rgb) => { const f = sinFib(); return f > 0 ? dullSinusoidInto(rgb, rgb, cssRGB01('--lz-shade'), f) : rgb; };   // (the kept triple dulled in place)
  const TUBE_TMP = [0, 0, 0];   // (a vessel end's colour, written in place and read at once by drawGL)
  const tubeRGB = (t, end, k) => { const c = inkRGBInto(TUBE_TMP, segOf(t), tubeW(t, end), k); return segOf(t) === 'sin' ? sinDull(c) : c; };
  // A "Colored by" switch crossfades the lobule's vessels over a surface step (420 ms), on the quintic, as the anatomy's do (stage.js LENS_FADE).
  // lensFrom: the lens they are leaving, null when no switch is under way.
  const LENS_FADE = D_SURFACE, ORIGIN_RGB = [ORIGIN_GREY, ORIGIN_GREY, ORIGIN_GREY];
  function noteLens(M) {
    if (live.lensMode !== null && M !== live.lensMode && live.fade > 0.98 && !reduce.matches) {
      // (A switch mid-fade starts from the colour now shown: near the end it is the new lens, otherwise the one it left.)
      if (!live.lensFrom || lensK() >= 0.5) live.lensFrom = live.lensMode;
      live.lensT0 = easeNow();   // (the wall clock, frame.js easeNow, as the tissue's crossfades)
    } else if (live.fade <= 0.98) live.lensFrom = null;
    live.lensMode = M;
  }
  function lensK() {
    if (!live.lensFrom) return 1;
    const u = (easeNow() - live.lensT0) / LENS_FADE;
    if (u >= 1 || live.lensFrom === live.model.mode) { live.lensFrom = null; return 1; }
    return easeMove(u);
  }
  // What drawGL keeps between frames, so a frame allocates none of it:
  // the figure's transform, two arrays in turn (veins-gl keeps the last matrix given to draw() as its baseM and compares the next with
  // it, so the one it holds is never written again: tLast is the one handed to draw() last, the next frame writes the other);
  // the transform and size the picture was last drawn at, as whole hundredths (drawKey is '' for none, 'v' once drawn);
  // what the last surface pass was made for (sVer: NaN for none); the calibers and size the radii were last worked out for.
  const DRAW_T = [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]], dT = [0, 0, 0, 0, 0, 0], rowsBuf = [];
  const calV = [];
  const radNow = [], radNowAt = [], radKeep = [];   // (per tube id: its radii at the samples, the stamp of the calibers they were worked out for, the radii as last sent)
  const inkNow = new Float64Array(MAXT * 6);   // (each vessel's two end colours this pass, in live order, 3 numbers each)
  const bloodArg = { alpha: 0, on: false, chev: false, origin: false, clock: 0, dye: false, bleed: [], vdpr: 1, originCol: null, dyeCol: null, inkLight: null, inkDark: null, revCol: null, chevInk: null, chevLight: null };
  const selWas = [];   // (the ids of the selection the attributes were last made for)
  const LYD = [0, 0, 0], DISSE_DEEP = [0.5, 0.78, 0.82], DISSE_DEEP_DARK = [0.17, 0.48, 0.54];
  const NO_BLOOD = Object.freeze({});
  const Z_OF = { bh: 0.035, bs: 0.065, s0: 0.1, s1: 0.11, s2: 0.12, ly: 0.05, an: 0.09, lt: 0.25, in: 0.3, pv: 0.4, cv: 0.4, lv: 0.8, sh: 0.5, bd: 0.55, tw: 0.08, ha: 0.7 };   // (the twig runs under the inlet venule and under the sinusoid it joins, so it slips in beneath the sinusoid wall instead of ending in a round cap over its lumen: 16 Nov 2026)
  // The picture is drawn again when its size or transform moved a hundredth of a pixel (the same comparison as the string it replaces).
  const drawSame = (cw, ch, T) => {
    if (live.drawKey === '' || cw !== live.dW || ch !== live.dH) return false;
    for (let i = 0; i < 6; i++) if (Math.round(T[i] * 100) !== dT[i]) return false;
    return true;
  };
  // True when the calibers (the eased values rz), the lobule's size or the layer differ from the last time asked; kept as numbers to 4 decimals.
  function calibersChanged(rz, G) {
    let same = live.radCal !== '' && live.calW === G.W && live.calH === G.H && live.calLy === (live.lymphOn ? 1 : 0) + (live.bileOn ? 2 : 0), i = 0;
    for (const key in rz) { const q = Math.round(rz[key] * 1e4); if (!Object.is(calV[i], q)) { same = false; calV[i] = q; } i++; }
    if (live.calN !== i) { same = false; live.calN = i; }
    live.calW = G.W; live.calH = G.H; live.calLy = (live.lymphOn ? 1 : 0) + (live.bileOn ? 2 : 0);
    if (same) return false;
    live.radCal = 'y'; live.radStamp++;
    return true;
  }
  // The selection's ids against those the attributes were last made for (in the set's order, as the string it replaces joined them).
  function selMoved(ids) {
    let same = selWas.length === ids.size, i = 0;
    for (const id of ids) { if (selWas[i] !== id) { same = false; selWas[i] = id; } i++; }
    selWas.length = i;
    return !same;
  }
  // The vessels changed since the layer was drawn, as a kept array (veins-gl reads it within the call).
  const rowsOf = () => { rowsBuf.length = 0; for (const r of glRows) rowsBuf.push(r); return rowsBuf; };
  const noteDrawn = (cw, ch, T) => { live.dW = cw; live.dH = ch; for (let i = 0; i < 6; i++) dT[i] = Math.round(T[i] * 100); live.drawKey = 'v'; };
  // A vessel's radii at its samples for the calibers now (kept per vessel; worked out again only after calibersChanged said so).
  function radiiNow(t) {
    let r = radNow[t.id];
    if (!r) r = radNow[t.id] = new Float64Array(N);   // alloc-once: a vessel's first pass; the arrays are kept for the renderer's life
    if (radNowAt[t.id] !== live.radStamp) { for (let i = 0; i < N; i++) r[i] = radiusAt(t, i); radNowAt[t.id] = live.radStamp; }
    return r;
  }
  const maxOf = (r) => { let mx = -Infinity; for (let i = 0; i < r.length; i++) mx = Math.max(mx, r[i]); return mx; };
  const put3 = (o, c, so = 0) => { tubeData[o] = c[so]; tubeData[o + 1] = c[so + 1]; tubeData[o + 2] = c[so + 2]; };
  const num = (cs, n, d) => { const v = parseFloat(cs.getPropertyValue(n)); return Number.isFinite(v) ? v : d; };
  const lookOf = (cs) => ({   // alloc-rare: lookOf runs only for a new copy of the stage's styles (drawGL's lookCs guard)
    shOff: [1.2, 2.2], light: LIGHT, reach: 11, organs: 0,   // alloc-rare: lookOf runs only for a new copy of the stage's styles (drawGL's lookCs guard)
    casing: [...triplet(cs, '--casing-rgb'), num(cs, '--casing-a', 0.56) * 0.8],   // alloc-rare: lookOf, a new copy of the styles only
    shadow: [...triplet(cs, '--shadow-rgb'), num(cs, '--shadow-a', 0.15)],   // alloc-rare: lookOf, a new copy of the styles only
    sheen: [...rgb01(cs.getPropertyValue('--light-ink').trim()), num(cs, '--tube-sheen', 0.42)],   // alloc-rare: lookOf, a new copy of the styles only
    shade: [...rgb01(cs.getPropertyValue('--tube-shade-ink').trim()), num(cs, '--tube-shade', 0.2)],   // alloc-rare: lookOf, a new copy of the styles only
    ring: [...rgb01(cs.getPropertyValue('--accent').trim()), 0.4],   // alloc-rare: lookOf, a new copy of the styles only
    netAlpha: 1, fx: true, tierAlpha: Array(MAX_TIERS).fill(1), tierGroup: Array(MAX_TIERS).fill(1),   // alloc-rare: lookOf, a new copy of the styles only
  });
  const triplet = (cs, n) => { const k = cs.getPropertyValue(n).trim().split(/[\s,/]+/).map(Number); return k.length >= 3 && k.every(Number.isFinite) ? k.slice(0, 3).map((v) => v / 255) : [0, 0, 0]; };
  return { BD_FILL, DISSE_DEEP, DISSE_DEEP_DARK, DRAW_T, EDGE, LENS_FADE, LYD, LY_TMP, NO_BLOOD, ORIGIN_RGB, TW_ALPHA, WALL, Z_OF, bloodArg, calibersChanged, cssTrim, drawSame, drawTile, easeRadii, fieldLook, fieldState, freeCopies, grey, greyMoving, greyNow, ink, inkNow, lensK, lookOf, lyF, lyInkInto, lyProt, maxOf, noteDrawn, noteLens, paintAhead, paintField, preparePieces, prepareRun, prewarm, put3, qP, quietCopy, radKeep, radiiNow, radiusAt, rowsOf, rzOf, selMoved, shadeOf, stage, stageBg, tileAt, tileDrawn, tileDue, tileLaterRun, tileSets, tubeRGB, warm };
}
