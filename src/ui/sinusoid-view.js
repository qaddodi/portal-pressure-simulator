// Semantic zoom, one level below the lobule: a stretch of one sinusoid, cut along its length, drawn on
// the GPU (sinusoid-gl.js) in the lobule's language: the pressure-coloured lumen with its shimmer,
// the pale green lymph, the hepatocyte plates. Blood runs from the portal triad (left, or top
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

import { h, fmt, clamp, lerp } from './util.js';
import { createCaptionGL, lookOf, ringOf, shadowOf, rgbaOf } from './caption-gl.js';
import { measure } from './glyph-measure.js';
import { readStyle } from './layout-snap.js';
import { pressureColor } from './colormap.js';
import { createSvgGL, svgModel, setGeo, geoOf } from './svg-gl.js';
import { isPaused } from './clock.js';
import { store } from './store.js';
import { STEP_MAX } from './glide-clock.js';
import { sinusoidTargets } from './sinusoid-model.js';
import { createSinusoidGL, poreAt, poreOpenness, calloutPore, cellAtInto, cellEdge, SLOT, SEED, UM } from './sinusoid-gl.js';
import { placeFenDisse } from './fen-place.js';
import { frameFor, noteDraw, saver, paceMs, renderScale, onRenderScale, easeNow } from './frame.js';
import { softwareGL, softwareYield } from './sw-yield.js';
import { noteSinusoidSupport, sinusoidSupported } from './gl-support.js';
import { FADE_MS, fadeAlpha } from './res-fade.js';
import { cssColor8 } from './css-color.js';
import { surface } from './gpu-surfaces.js';
import { restPass, restClass, restAttr } from './rest-pass.js';
import { hitLabel } from './label-explain.js';
import { readBox as boxOf } from './layout-snap.js';
const HEP_CELL = { j: 0, x0: 0, x1: 0, nu: 0, nv: 0, nr: 0, bi: false };   // alloc-rare: made once (the hepatocyte's cell, written in place by each layout)
const nextFrame = frameFor('sinusoid-view');

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rng(seed) { let q = seed >>> 0; return () => { q = (q * 1664525 + 1013904223) >>> 0; return q / 4294967296; }; }

export { sinusoidSupported } from './gl-support.js';

/** `before`: a node of `host` to sit ahead of (the lobule layer, built late, takes the place it would have had). */
export function createSinusoidView({ host, before = null, share = null }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const phoneMQ = matchMedia('(max-width: 720px)');
  const canvas = h('canvas', { class: 'sv-canvas', role: 'img', 'aria-label': 'A sinusoid, cut along its length' });
  const labels = h('div', { class: 'lz-labels' });
  // Every part is named in place, as the anatomy names its organs: spaced small capitals on a halo, no chip or
  // leader, with its reading (if any) beneath in the lobule's number style. Captions in a narrow band (the lumen,
  // Disse) run along the vessel; those in the hepatocyte plates stay level.
  const regions = {};
  // The names are drawn by the GPU (caption-gl.js: their words, halo, lit terms' colour and leaders, and the legend), laid out here in script and
  // placed in the frame that moves the view; the page's own names are a quiet model (screen readers, data-target, what reads their boxes
  // at rest), made clear by .cap-gl-on and placed between frames (domPlace). Their sizes are set from the GPU's own type (their looks are
  // read between frames, readLooks), so no layout is read for them. A name made new is drawn once its look is read, fading in.
  const cap = createCaptionGL(labels);
  let sizedNew = false, onSized = null;
  const ZERO2 = [0, 0], NO_LINES = [];
  const szOf = (R) => (R ? cap.measure(R.key, R.lines || NO_LINES) : ZERO2);
  // Tap a name to explain it (N4, label-explain.js): the tapped name takes one more line, what the part is. The page's lit term is set by the lobule view (lobule-zoom.js explainSet).
  let exKey = null;
  const SV_NOTE = { fen: 'pores: plasma passes to the space of Disse', disse: 'where plasma meets the liver cells', lymph: 'carries filtered fluid and protein away',
    hep: 'liver cells: take up and process what plasma brings', hsc: 'stores vitamin A; lays down scar when activated', kup: 'resident macrophage of the sinusoid', sin: 'blood from the portal tract and the hepatic artery mixes here',
    in: 'blood arrives from the portal venule', out: 'blood leaves to the central vein' };
  const SV_TARGET = { fen: 'fenestrae', hsc: 'stellate', kup: 'kupffer', hep: 'hepatocyte', sin: 'lumen', in: 'in', out: 'out' };
  // Page writes asked for inside a frame (a caption made, its words, the fenestrae's share) land between frames (rest-pass.js), in the
  // order asked, so a frame does no DOM work (2 Nov 2026, "Move everything to GPU"); its look is read after it is in.
  const mountQ = [], capQ = new Map();
  let pageT = 0, fenWant = null;
  const pageSoon = () => { if (!pageT) pageT = restPass(pageRun); };
  function pageRun() {
    pageT = 0;
    for (const R of mountQ.splice(0)) {   // (each made once, as it is first named)
      const el = document.createElement('div');
      el.setAttribute('class', R.cls); el.setAttribute('data-target', `sinusoid:${SV_TARGET[R.key] || R.key}`);
      R.el = el; labels.append(el);
    }
    for (const [R, [name, lines]] of capQ) R.el?.replaceChildren(h('span', {}, name), ...lines.map((l) => { const [v, u] = l.split('~'); return h('span', { class: 'v' }, h('b', {}, v), u ? ` ${u}` : ''); }));
    const fresh = capQ.size > 0;
    capQ.clear();
    if (fenWant != null) { const b = regions.fen?.el?.querySelector('.v b'); if (b && b.textContent !== fenWant) b.textContent = fenWant; fenWant = null; }
    if (fresh) readLooks();
  }
  // A caption's lines as the GPU sets them: its name's lines (capitals), then each reading, its figure and its unit.
  const linesOf = (name, vals) => [...name.split('\n').map((t) => [[t, 'name']]), ...vals.map((l) => { const [v, u] = l.split('~'); return [[v, 'fig'], [u ? ` ${u}` : '', 'unit']]; })]; // alloc-rare: words in a caption are built when they change (a number moved, a name set), never on a steady frame
  // One caption, built one way for every name in the view (the ends' venules are written exactly as the Sinusoid's own).
  function caption(key, cls, name, value) {
    // (What a presenter slide's terms call each part: presentLit, see presenter.js TARGETS.)
    let R = regions[key];
    // (Its page model is made between frames, pageRun.)
    if (!R) { R = regions[key] = { key, cls: cls || `sv-region sv-region-${key}`, el: null, n: 0, name: null, value: null, text: null, off: null }; mountQ.push(R); pageSoon(); }   // alloc-rare: a caption is made once, the first time it is named
    const ex = exKey === key ? SV_NOTE[key] || '' : '';   // (the tapped name's own line: label-explain.js)
    if (R.name !== name || R.value !== value || (R.ex ?? '') !== ex) {
      // (Its words changed: a number moved, or a name was set. The strings are built then, never on a frame where they are the same.)
      const same = R.text && R.name === name && R.n === 1 + (value ? value.split(' · ').length : 0);   // alloc-rare: only when a caption's words changed
      R.name = name; R.value = value;
      R.text = name + '|' + value; R.ex = ex;   // alloc-rare: only when a caption's words changed
      const lines = value ? value.split(' · ') : [];   // alloc-rare: only when a caption's words changed
      R.lines = linesOf(name, key === 'fen' && same ? [fenTxt()] : lines);   // alloc-rare: only when a caption's words changed (the GPU's words change in this frame)
      if (ex) R.lines = [...R.lines, [[ex, 'unit']]];   // alloc-rare: only while a name is explained
      if (same && key === 'fen') return R;   // (its value is kept by fenTick, which eases it: the page's caption is not rebuilt)
      capQ.set(R, [name, lines]);   // alloc-rare: only when a caption's words changed
      R.n = 1 + lines.length; pageSoon();   // (put in between frames, pageRun)
    }
    return R;
  }
  // (The looks, read between frames: each caption's type, ink and halo as the stylesheet gives them (its class, the theme, the
  // label size, a slide's lit terms), and the legend's. A change lays the names out again.)
  let lookAsk = 0;
  const askLooks = () => { if (!lookAsk) lookAsk = restPass(readLooks); };
  function readLooks() {
    lookAsk = 0;
    let ch = false;
    for (const R of Object.values(regions)) {
      const el = R.el;
      if (!el?.isConnected || !el.firstElementChild) continue;
      const v = el.querySelector('.v'), b = v?.querySelector('b');
      const lk = lookOf(readStyle(el), { name: readStyle(el.firstElementChild), fig: b && readStyle(b), unit: v && readStyle(v) });
      const sig = JSON.stringify(lk);
      if (sig !== R.lookSig) { R.lookSig = sig; cap.look(R.key, lk); ch = true; }
    }
    if (legend.isConnected) {
      const cs = readStyle(legend), dot = legend.querySelector('i'), ds = dot && readStyle(dot), sp = legend.querySelector('span'), ss = sp && readStyle(sp);
      const px = (q) => parseFloat(q) || 0;
      const L = {
        size: px(cs.fontSize) || 12, weight: parseFloat(cs.fontWeight) || 500, ink: cs.color, lh: px(cs.lineHeight) || 1.3 * (px(cs.fontSize) || 12),
        px: px(cs.paddingLeft), py: px(cs.paddingTop), bg: cs.backgroundColor, gap: px(ss?.columnGap) || 5,
        dot: ds ? { d: px(ds.width) || 8, fill: ds.backgroundColor, ring: ringOf(ds.boxShadow) } : null, sh: shadowOf(cs.boxShadow),
      };
      const sig = JSON.stringify(L);
      if (sig !== legLook.sig) {
        Object.assign(legLook, L, { sig }); ch = true;
        cap.look('legend', { lh: L.lh / L.size, gap: 0, halo: 0, haloC: '', runs: { name: { size: L.size, weight: L.weight, ls: 0, fill: rgbaOf(L.ink), op: 1, upper: false, mr: 0 } } });   // (the legend is a name like any other: label-gl draws it)
      }
    }
    if (ch) { sizedNew = true; onSized?.(); }
  }
  const legLook = { sig: '' };
  // (The legend's font, made again only when its weight or size changes.)
  let legFontW = null, legFontS = 0, legFontStr = '';
  function legFont(L) {
    if (L.weight !== legFontW || L.size !== legFontS) { legFontW = L.weight; legFontS = L.size; legFontStr = `${L.weight} ${L.size}px Inter`; }   // alloc-rare: when the legend's weight or size changes
    return legFontStr;
  }
  const NO_OPT = { along: false, side: 0, slide: false };
  function region(key, name, value, x, y, opt = NO_OPT) {
    const along = opt.along, side = opt.side, slide = opt.slide;
    const R = caption(key, null, name, value);
    if (slide) { R.tx = x; x += R.sd || 0; }   // (a place the layout moved at once starts where the name stood: see noteJumps)
    const at = R.at || (R.at = [0, 0]);   // alloc-rare: a caption's place, made the first time it is named
    at[0] = x; at[1] = y;   // (what it names, µm)
    // side ±1: the caption sits wholly on that side of y (across the vessel), its near edge at y.
    const wh = szOf(R), w = wh[0], hh = wh[1], ang = along && !geo.vert ? geo.ang : 0;   // (always level on a top-down sinusoid)
    const across = along ? hh : Math.abs(w * Math.sin(geo.ang)) + Math.abs(hh * Math.cos(geo.ang));
    const yc = y + side * (across / 2) / VW.k;
    const sc = toScreen(x, yc);
    let cx = sc[0];
    const cy = sc[1], cx0 = cx;
    if (!along) cx = clamp(cx, w / 2 + 4, geo.W - w / 2 - 4);   // a level caption stays on screen
    if (!geo.vert) {
      // Across the screen every caption is level: it steps clear of the ends' names and stays in the free space
      // (a narrow one, beside a presenter's words).
      for (const b of ENDBOX) if (b && cy + hh / 2 > b.y0 - 4 && cy - hh / 2 < b.y1 + 4) cx = b.u ? Math.min(cx, b.x0 - 14 - w / 2) : Math.max(cx, b.x1 + 14 + w / 2);
      cx = clamp(cx, Math.min(VW.fe.l + w / 2 + 4, geo.W / 2), Math.max(VW.fe.r - w / 2 - 4, geo.W / 2));
    }
    { const c = Math.abs(Math.cos(ang)), sn = Math.abs(Math.sin(ang)), bw = (w * c + hh * sn) / 2, bh = (w * sn + hh * c) / 2; const bx = R.box || (R.box = { l: 0, r: 0, t: 0, b: 0 }); bx.l = cx - bw; bx.r = cx + bw; bx.t = cy - bh; bx.b = cy + bh; }   // alloc-rare: a caption's box, made the first time it is placed
    R.cx = cx; R.cy = cy; R.end = false;   // (its box's centre: drawn there by the GPU, and the page's model placed there between frames)
    // (a ring of kept results: a layout holds a few at once, never sixteen)
    const o = REG_OUT[regOut = (regOut + 1) & 15];
    o.cx = cx; o.cy = cy; o.w = w; o.hh = hh; o.x = x + (geo.vert ? 0 : (cx - cx0) / VW.k); o.half = (along ? w : Math.abs(w * Math.cos(geo.ang)) + Math.abs(hh * Math.sin(geo.ang))) / 2 / VW.k;
    return o;
  }
  const REG_OUT = [];
  for (let i = 0; i < 16; i++) REG_OUT.push({ cx: 0, cy: 0, w: 0, hh: 0, x: 0, half: 0 });
  let regOut = 0;
  const legend = h('div', { class: 'sv-legend', 'aria-hidden': 'true' },
    h('span', {}, h('i', { class: 'alb' }), 'Protein'));
  // Thin leaders from a name in the plate to the part it names (a portrait screen's narrow bands and cells): drawn by the GPU with the
  // names (caption-gl.js), in the colour of what they name. A lit term, a theme or a class on the app reads the names' looks again.
  { const app = document.querySelector('.app') || document.getElementById('app'); if (app && typeof MutationObserver === 'function') new MutationObserver(() => askLooks()).observe(app, { attributes: true, attributeFilter: ['data-lit', 'class'] }); }
  const tok = (n) => { let x = cssVals.get(n); if (x == null) { cssVals.set(n, null); cssMiss = true; x = ''; } return x; };
  const lead = {};
  function leader(key, R, x, y) {
    const L = lead[key] ||= { key };   // alloc-rare: a leader is made once, the first time it is needed
    // (The fenestrae's callout ends on a pore picked by where its name stands, so the pick can pass to another pore: the end slides
    // along the lining to that one, on the lining's own line, and never hops.)
    if (key === 'fen') { L.tx = x; const sd = L.sd || 0; y += halfW(x) - halfW(x + sd); x += sd; }
    const ts = toScreen(x, y), tx = ts[0], ty = ts[1];
    // (A target above or below the name, within its width: the leader runs straight up or down from the name's edge to it, short;
    // else from the side of the name facing it.)
    const vert = Math.abs(tx - R.cx) < R.w / 2 - 2 && Math.abs(ty - R.cy) > R.hh / 2 + 6;
    const sx = vert ? tx : R.cx + Math.sign(tx - R.cx) * (R.w / 2 + 3), sy = vert ? R.cy + Math.sign(ty - R.cy) * (R.hh / 2 + 3) : clamp(ty, R.cy - R.hh / 2 + 4, R.cy + R.hh / 2 - 4);
    const on = vert ? Math.abs(ty - sy) > 6 : Math.abs(tx - sx) > 6 && Math.sign(tx - R.cx) === Math.sign(tx - sx);   // (none when the name already sits on it)
    L.x1 = sx; L.y1 = sy; L.x2 = tx; L.y2 = ty; L.show = on ? 1 : 0; L.follow = false; L.sg = Math.sign(tx - R.cx); L.w = R.w;
  }
  const el = h('div', { class: 'sv', 'aria-hidden': 'true' }, canvas, labels, legend);
  // (The page's own names made clear while the GPU's picture of them is on the screen: app.css .cap-gl-on, caption-gl.js presented.)
  // (Written in the task that handed the picture over: a rest pass could come long after it, with both showing.)
  cap.onPresented = () => el.classList.add('cap-gl-on');
  cap.onLost = () => el.classList.remove('cap-gl-on');
  host.insertBefore(el, before);
  // The WebGL2 context is made when the view is about to show (setModel at the start of the dive in, place), not with the lobule: a page
  // holds only so many contexts (iOS Safari about 16, dropping the oldest, which is the figure's), and the lobule opens far more often
  // than the sinusoid. Its programs start compiling at once, through the dive, and are published when the driver is done.
  // Until then `available` answers from gl-support's one probe (given back at once).
  let gpu = null, svYield = null, svSoft = false;
  function ensureGpu() {
    if (gpu || gpuTried) return;
    gpuTried = true;
    // (share: { top(), order }: the figure's renderer when the lobule is drawn in it (lobule-zoom.js); the view is then a pass of its present, drawn into a texture of that
    // context, hidden and not drawn until the zoom brings it in, its texture back to a texel when it goes (place). Else the view's own canvas and context.)
    const ft = share?.top?.() || null;
    gpu = createSinusoidGL(canvas, { warm: true, onReady: () => { gpuKey = ''; wake(); }, host: ft });
    if (gpu && ft) { shareTop = ft; shareOff = ft.add({ order: share.order, solo: true, draw: laySin }); }   // (published after a draw found it compiling: drawn now) // alloc-rare: the GPU view is made once, the first time it is needed
    noteSinusoidSupport(!!gpu);
    // (A software renderer only: a frame of the view waits for the last to finish on the GPU and gives the page as long again,
    // as the anatomy's vessels do; see sw-yield.js. On a GPU there is no yield.)
    const swGL = gpu ? (shareTop ? gpu.gl : canvas.getContext('webgl2')) : null;
    svSoft = !!(swGL && softwareGL(swGL));   // (for the ?perf surfaces list below)
    svYield = svSoft ? softwareYield(true, swGL) : null;
  }
  let gpuTried = false, shareTop = null, shareOff = null;
  // The view's texture laid over the lobule in the stage's present (under the glass), weighed by the view's opacity.
  function laySin() {
    if (!shareTop || !(shown > 0) || !gpu || gpu.lost) return;
    const tg = gpu.target;
    if (!tg) return;
    // (A card's zoom carries the picture by its camera: a point p is at k p + (e, f) in CSS px from the stage's corner.)
    if (zk !== 1 || ze || zf) { const r = zr || (shareTop.canvas.width || 1) / ((hostWH && hostWH[0]) || shareTop.canvas.clientWidth || shareTop.canvas.width || 1); shareTop.lay(tg.tex, zk, 0, 0, zk, ze * r, zf * r, Math.min(1, shown)); }
    else shareTop.lay(tg.tex, 1, 0, 0, 1, 0, 0, Math.min(1, shown));
  }
  let zk = 1, ze = 0, zf = 0, zr = 0, zres = 1;
  // (The ?perf surfaces list, gpu-surfaces.js: read by the readout only.)
  surface('sinusoid', () => (!open ? null : gpu && !gpu.lost ? { on: svSoft ? 'fallback' : 'gpu', via: svSoft ? 'WebGL2 on the CPU' : 'WebGL2', why: svSoft ? 'software renderer' : '' } : { on: 'fallback', via: 'nothing drawn', why: gpu ? 'context lost (drawn again when it is given back)' : 'no WebGL2' }));   // (answered by this view's own context: sinusoidSupported need not make a throwaway one) // alloc-rare: read only by the ?perf readout, twice a second while it is open (gpu-surfaces.js), never in a frame

  // The view is left only by the view switch (Lobule): the wheel and a pinch do nothing here.
  el.addEventListener('wheel', (ev) => ev.preventDefault(), { passive: false });
  // A caption's entrance, once played, is let go: kept (fill both), it and its caption stay in the page's animation list for good.
  labels.addEventListener('animationend', (ev) => { if (ev.animationName === 'sv-fade-in') for (const a of ev.target.getAnimations()) if (a.animationName === 'sv-fade-in') a.cancel(); });

  // ── State ──
  let go = 1;   // 1 while the simulation runs, eased to 0 when paused: the flow, lymph, particles and proteins slow to a stop and resume without a jump
  let model = null, shown = 0, open = false, raf = 0, last = 0, dive = null, drewNow = false;
  // Figure resolution: taken up as the sinusoid opens and at once while it is hidden. A change made while it shows (30 Oct, Mohammad:
  // "the lobule and sinusoid are not obeying resolutions") waits (svWant) for it to be open and still (not mid-zoom), then eases in:
  // svSwap.
  let svK = renderScale(), svWant = null;
  const svScale = () => svK;
  onRenderScale(() => {
    const k = renderScale();
    if (!(shown > 0)) { svK = k; svWant = null; return; }
    svWant = k === svK ? null : k;
    if (svWant != null) wake();
  });
  // The change, mixed on the GPU (sinusoid-gl keep/mix): the picture as it stands is drawn once more in this frame and kept in a texture
  // inside the GPU, then laid over each new draw of the canvas itself as old × a + new × (1 − a), so the canvas stays shown and nothing
  // is copied back from the GPU or drawn in 2D. The zoom back to the lobule starting meanwhile ends it. (The 2D mix and its off switch are gone,
  // 1 Nov, "Move everything to GPU": where the texture cannot be kept, the new resolution is taken at once.)
  let svFade = null;   // { t0 }
  function svSwap() {
    const k = svWant;
    svWant = null;
    if (k === svK) return;
    gpuKey = '';
    draw(0, false);   // (the picture as it stands, drawn again in this frame so it can be kept; a fade still running: its mix, remade)
    if (gpu.keep?.()) svFade = { t0: performance.now() }; // alloc-rare: a resolution swap starts once, when the figure's render scale changes
    else svFadeEnd();
    svK = k;
  }
  // (Called right after the canvas was drawn, in the same frame.)
  function svFadeStep() {
    const u = (performance.now() - svFade.t0) / FADE_MS;
    if (u >= 1 || dive) { svFadeEnd(); return; }
    gpu.mix(fadeAlpha(u));
  }
  function svFadeEnd() {
    if (!svFade) return;
    svFade = null;
    gpu.drop?.();
  }
  const S = {};          // the drawing's state, easing toward sinusoidTargets(model)
  let geo = null, geoKey = 0, geoW = -1, geoH = -1, geoPres = false;   // geoKey: counts the times the geometry was made again
  // The share of the way the view's own glide (stepView) takes each frame, and whether a name is still catching up (see noteJumps).
  let easeA = 0, layoutBusy = false, svMoving = false;

  // Where the sinusoid sits: centred in the space the floating pieces leave (a row kept for the legend).
  const appStyle = document.getElementById('app')?.style;
  const cssN = (k) => parseFloat(appStyle?.getPropertyValue(k)) || 0;
  // The stage's size, kept from its ResizeObserver (read where the layout is already clean), not read on every frame: a
  // read just after the lobule's transform is written laid the page out again, once a frame through the zoom.
  let gapPx = 12;
  function readGap() { const app = document.getElementById('app'); if (app) gapPx = parseFloat(getComputedStyle(app).getPropertyValue('--gap')) || 12; }
  // (Read as the view is made and as the stage is resized (its observer, outside any frame); a frame only takes it.)
  let hostWH = null;
  const readHost = () => { const r = host.getBoundingClientRect(); hostWH = [Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height))]; };
  readHost(); readGap();
  const hostSize = () => hostWH;
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { readHost(); readGap(); if (shown > 0 && !raf && model) raf = nextFrame(loop); }).observe(host);
  addEventListener('resize', () => { readHost(); readGap(); askLooks(); });   // (the names' type follows the screen's size: --t-lab)
  // The page's look (the theme, a setting's class): a change counts up, and the colours read from the style sheet are
  // read again; otherwise they are kept (thirty property reads a frame before).
  const darkMQ = matchMedia('(prefers-color-scheme: dark)');
  // (The look's values are read between frames, a rest pass (rest-pass.js), as the look changes; the frames use them as read.)
  let cssStale = true;
  // (2 Nov 2026: the gap is read in that rest pass too, not in the observer's microtask straight after the page's writes, where the
  // read laid the page out: 30 ms on a phone's slide change.)
  let gapStale = false;
  const lookChanged = () => { cssStale = true; gapStale = true; askRest(); askLooks(); };
  darkMQ.addEventListener?.('change', lookChanged);
  if (typeof MutationObserver === 'function') {
    // (Not the inline style: the presenter writes its room there as cards move; the colours never come from it.)
    const mo = new MutationObserver((rs) => { if (rs.some((r) => r.attributeName !== 'style')) lookChanged(); });
    for (const n of [document.documentElement, document.body, document.getElementById('app'), host]) if (n) mo.observe(n, { attributes: true });
  }
  function freeRect(W, H) {
    // The side panels are hidden in the view, so their room is not kept; the dock, its timeline and readouts, and the view pill above
    // it stay (2 Nov, Mohammad), so their room is, as the lobule keeps it (--bot-occ).
    // (--pz-l, --pz-r, --pz-t, --pz-b: the room a presenter slide's text, data and bar take; the credit line, just above
    // the dock or the bar, is kept clear.)
    const t = cssN('--top-safe') + cssN('--cmp-h') + cssN('--pz-t') + 8 + (cssN('--pz-t') ? 0 : 40);
    // (A fixed strip, not the credit's current spot: the credit keeps clear of this view's labels, so a view sized to wherever
    // the credit sat moved the labels, which moved the credit, which resized the view, about once a second for good.)
    // (Outside a presentation the dock and the view pill above it take --bot-occ: the vein's end, its arrow and its reading stay
    // 8 px above the pill.)
    const app = document.getElementById('app'), pres = !app || app.classList.contains('presenting');
    const pill = pres ? 0 : (cssN('--bot-occ') || gapPx + 8 + 42) + 8;
    const b = H - cssN('--pz-b') - Math.max(34, pill), l = 12 + cssN('--pz-l'), r = W - 12 - cssN('--pz-r');
    FREE.l = Math.round(l); FREE.t = Math.round(t); FREE.r = Math.round(Math.max(l + 80, r)); FREE.b = Math.round(Math.max(t + 80, b));
    return FREE;
  }
  // The stretch is laid out once per stage size. It runs along the stage's longer side: across on a
  // landscape screen, down on a portrait one (where every label still reads level).
  const FREE = { l: 0, t: 0, r: 0, b: 0 }, INS_T = [0, 0, 0], TC_T = [0, 0];   // (the free space and the target's insets and centre, kept and written in place)
  function ensureGeo(W, H) {
    const pres = !!document.getElementById('app')?.classList.contains('presenting');
    if (W !== geoW || H !== geoH || pres !== geoPres) {
      geoW = W; geoH = H; geoPres = pres; geoKey++;
      const vert = W < H * 0.95, tall = vert, ang = vert ? Math.PI / 2 : 0;
      const X = Math.hypot(W, H) / 6 + 30;   // reach at the smallest scale (3 px/µm)
      // The fenestrae of both linings (the shader opens the same ones), for the traffic through them.
      const pores = [SEED.poreUp, SEED.poreDn].map((sd) => {   // alloc-rare: the geometry is made again only when the stage's size or the presenting mode changes
        const a = []; // alloc-rare: the geometry is made again only when the stage's size or the presenting mode changes
        for (let j = Math.floor(-X / SLOT) - 1; j * SLOT < X + SLOT; j++) { const p = poreAt(j, sd); if (p) a.push(p); }
        return a;
      });
      // The stellate cell sits at a junction between two hepatocytes on the upper side, a little before the middle.
      let xs = cellEdge(0, SEED.plateUp);
      for (let j = -3; j <= 2; j++) { const b = cellEdge(j, SEED.plateUp); if (Math.abs(b + 10) < Math.abs(xs + 10)) xs = b; }
      geo = { W, H, ang, vert, tall, x0: -X, x1: X, xs, xk: vert ? 12 : 22, pores };   // (the Kupffer cell nearer the middle on a portrait screen, clear of the central vein's name) // alloc-rare: the geometry is made again only when the stage's size or the presenting mode changes
    }
    // Where it is drawn: centred in the free space, the plates filling its short side. When that space
    // changes (the dock grows, a card opens) the view glides there (stepView), it does not jump.
    const f = freeRect(W, H), fw = f.r - f.l, fh = f.b - f.t;
    // How much is shown across: both plates whole on a large screen; on a phone, closer in (the plates cut by the
    // edges), so the wall and its traffic stay large enough to follow.
    const short = geo.vert ? fw : fh, across = lerp(40, 54, smooth(380, 720, short));
    VW.f = f; VW.tk = clamp(short / across, 3, 14);
    // (And what the names keep clear of, as the space the cards leave: under the top bar and a card, and the stage's span for the names to stay in.)
    INS_T[0] = cssN('--top-safe') + cssN('--cmp-h') + cssN('--pz-t'); INS_T[1] = cssN('--top-safe') + cssN('--pz-t') + 2; INS_T[2] = H - cssN('--pz-b') - 2;
    VW.insT = INS_T;
    // Its names are the lobule's size on every device (only the app's label-size setting scales them).
    TC_T[0] = (f.l + f.r) / 2; TC_T[1] = (f.t + f.b) / 2;
    VW.tC = TC_T;
    if (!VW.k || !VW.fe) { VW.k = VW.tk; VW.C = [TC_T[0], TC_T[1]]; VW.fe = { l: f.l, t: f.t, r: f.r, b: f.b }; VW.ins = [INS_T[0], INS_T[1], INS_T[2]]; VW.vel = null; }   // alloc-rare: the view's first placement, and again each time it opens
    return geo;
  }
  // The lobule's own label size (--label-k: the label setting, the desktop's baseline, a presentation's projector size),
  // a touch smaller since these capitals are bolder and spaced.
  const labelK = () => (parseFloat(document.documentElement.style.getPropertyValue('--label-k')) || 1) * 0.9;
  // Its names are the lobule's size on every device (only the app's label-size setting scales them): the page's --label-k (times .9) is copied onto the
  // view when the size changes (pps:labelscale, an event) and once as it is made, never in a frame (the .sv rule would give the scale instead).
  const copyLabelK = () => { const lk = String(labelK()); if (el.style.getPropertyValue('--label-k') !== lk) el.style.setProperty('--label-k', lk); };
  copyLabelK(); addEventListener('pps:labelscale', () => { copyLabelK(); askLooks(); });
  // f: the free space where it rests (tk, tC: the scale and centre that fit it); fe, ins: the same space and insets as the view has
  // glided to so far, which every name, arrow and the legend is laid against, so they go with the view and never ahead of it.
  // vel: how fast each of those is moving (viewVec's order), so a glide begins from rest and a new target carries it on.
  const VW = { k: 0, C: [0, 0], tk: 0, tC: [0, 0], f: null, fe: null, insT: null, ins: null, vel: null, vis: [0, 0], fr: [0, 0] };
  // Where it is drawn this frame: the view's own placement, carried by the zoom from the lobule while that runs.
  const CAM = { C: [0, 0], k: 1, ang: 0, ca: 1, sa: 0 };
  const LOC = new Float64Array(4);
  function locAlong(X, Y, cx, cy, ga, gs, kk) { return ((X - cx) * ga + (Y - cy) * gs) / kk; }   // (a screen point, µm along the sinusoid from the view's centre)
  // The view's placement as numbers: its scale, centre, the free space it lays names against, and its insets (the target's, or as it is).
  // (Into kept lists: TO the target's, CUR where it is, VEL how fast each is moving. Ten numbers: the scale, the centre, the free space, three insets.)
  const VEC_N = 10, TO = new Float64Array(VEC_N), CUR = new Float64Array(VEC_N), VEL = new Float64Array(VEC_N);
  const viewTo = () => { TO[0] = VW.tk; TO[1] = VW.tC[0]; TO[2] = VW.tC[1]; TO[3] = VW.f.l; TO[4] = VW.f.t; TO[5] = VW.f.r; TO[6] = VW.f.b; for (let i = 0; i < 3; i++) TO[7 + i] = VW.insT[i]; return TO; };
  const viewVec = () => { CUR[0] = VW.k; CUR[1] = VW.C[0]; CUR[2] = VW.C[1]; CUR[3] = VW.fe.l; CUR[4] = VW.fe.t; CUR[5] = VW.fe.r; CUR[6] = VW.fe.b; for (let i = 0; i < 3; i++) CUR[7 + i] = VW.ins[i]; return CUR; };
  const viewPut = (v) => { VW.k = v[0]; VW.C[0] = v[1]; VW.C[1] = v[2]; VW.fe.l = v[3]; VW.fe.t = v[4]; VW.fe.r = v[5]; VW.fe.b = v[6]; for (let i = 0; i < VW.ins.length; i++) VW.ins[i] = v[7 + i]; };
  // (The scale counts forty times: its steps are small beside a centre's pixels.)
  const viewGap = (a, b) => { let sum = 0; for (let i = 0; i < VEC_N; i++) sum += Math.abs(a[i] - b[i]) * (i === 0 ? 40 : 1); return sum; };
  const calm = (vel) => { for (let i = 0; i < VEC_N; i++) if (Math.abs(vel[i]) * (i === 0 ? 40 : 1) >= 0.5) return false; return true; };
  // The glide to the room the cards leave runs as a critically damped spring: it sets out from rest, so there is no kick as a card starts to
  // move, it reaches 60% of the way in 0.2 s and 95% in 0.47 s, and a target that moves on (the second layout pass after a tuck) carries it on
  // with no stop. A frame is counted at most STEP_MAX long (glide-clock.js): after a slow one, the layout the change set off, the view has not
  // jumped a third of the way, it goes on from where it was.
  const SPRING = 10;
  function stepView(dt) {
    const to = viewTo(), cur = viewVec();
    if (!VW.vel) { VW.vel = VEL; VEL.fill(0); }
    const vel = VW.vel, gap0 = viewGap(cur, to), still = calm(vel);
    easeA = 0;
    let moving = false;
    if (dive || (gap0 < 0.05 && still)) { viewPut(to); vel.fill(0); }   // (held at its mark while the zoom carries it)
    else {
      moving = true;
      // (The free space glides with the centre and scale it fits: the names and arrows are laid out against it each frame, so they
      // ride the glide. Laid against where it comes to rest, they stood there at once while the vessel was still on its way.)
      const s = Math.min(Math.max(dt, 0), STEP_MAX / 1000), e = Math.exp(-SPRING * s);
      for (let i = 0; i < cur.length; i++) {
        const dx = cur[i] - to[i], t = vel[i] + SPRING * dx;
        cur[i] = to[i] + (dx + t * s) * e; vel[i] = (vel[i] - SPRING * t * s) * e;
      }
      const gap1 = viewGap(cur, to);
      easeA = gap0 > 1e-6 ? Math.min(1, Math.max(0, 1 - gap1 / gap0)) : 0;   // (the share of the way left that this frame went: what the names' lags decay by)
      if (gap1 < 0.05 && calm(vel)) { viewPut(to); vel.fill(0); } else viewPut(cur);
    }
    // The zoom from the lobule (lobule-zoom.js): a turn and scale about the view's centre c, moved toward the lobule's sinusoid.
    const C = CAM.C;
    let k = VW.k, ang = geo.ang;
    C[0] = VW.C[0]; C[1] = VW.C[1];
    if (dive) {
      // The zoom's similarity a fraction g of the way, about its fixed point q: the view's centre is where the lobule's sinusoid point p is now.
      // Its scale and angle are the ones it set out with, so nothing the layout does meanwhile moves it.
      const { g, p, q, rot, Z } = dive, zg = Z ** g, ct = Math.cos(rot * g), st = Math.sin(rot * g), dx = p[0] - q[0], dy = p[1] - q[1];
      C[0] = q[0] + zg * (dx * ct - dy * st); C[1] = q[1] + zg * (dx * st + dy * ct);
      k = dive.k * zg / Z; ang = dive.ang + rot * (g - 1);
    }
    CAM.k = k; CAM.ang = ang; CAM.ca = Math.cos(ang); CAM.sa = Math.sin(ang);
    // The stretch of sinusoid on screen, and in the free space (µm along it).
    const g = geo, ga = Math.cos(g.ang), gs = Math.sin(g.ang), cx = VW.C[0], cy = VW.C[1], kk = VW.k;
    LOC[0] = locAlong(0, 0, cx, cy, ga, gs, kk); LOC[1] = locAlong(g.W, 0, cx, cy, ga, gs, kk); LOC[2] = locAlong(0, g.H, cx, cy, ga, gs, kk); LOC[3] = locAlong(g.W, g.H, cx, cy, ga, gs, kk);
    const a0 = Math.min(LOC[0], LOC[1], LOC[2], LOC[3]), a1 = Math.max(LOC[0], LOC[1], LOC[2], LOC[3]);
    VW.vis[0] = Math.max(g.x0, a0 - 8); VW.vis[1] = Math.min(g.x1, a1 + 8);
    const f0 = locAlong(VW.fe.l, VW.fe.t, cx, cy, ga, gs, kk), f1 = locAlong(VW.fe.r, VW.fe.b, cx, cy, ga, gs, kk);
    VW.fr[0] = Math.min(f0, f1); VW.fr[1] = Math.max(f0, f1);
    return moving;
  }
  // Local (µm, along/across) → stage px, where the view rests (for the labels).
  // (into one kept pair: read it at once, as every caller does, before the next call)
  const SCR = [0, 0];
  const toScreen = (x, y) => { const ca = Math.cos(geo.ang), sa = Math.sin(geo.ang); SCR[0] = VW.C[0] + VW.k * (x * ca - y * sa); SCR[1] = VW.C[1] + VW.k * (x * sa + y * ca); return SCR; };

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
  // (css-color.js: read in script, in the canvas's 8-bit steps; no canvas made.)
  const rgbMemo = new Map();
  function rgb(c) {
    let o = rgbMemo.get(c);
    if (o) return o;
    o = cssColor8(c || 'black').slice(0, 3);   // alloc-rare: the first use of a colour string, kept in the memo
    if (rgbMemo.size > 256) rgbMemo.clear();
    rgbMemo.set(c, o);
    return o;
  }
  // dst = a mixed toward b by t, in place (dst may be a)
  function blendRgb(dst, a, b, t) { for (let i = 0; i < 3; i++) dst[i] = lerp(a[i], b[i], t); return dst; }
  function copyRgb(dst, a) { dst[0] = a[0]; dst[1] = a[1]; dst[2] = a[2]; return dst; }
  const cssVals = new Map();
  // (A value not read yet is asked for: read between frames with the others, and the frame that needed it is not painted.)
  let cssMiss = false;
  function readCss() {
    const cs = getComputedStyle(host);
    for (const n of cssVals.keys()) cssVals.set(n, cs.getPropertyValue(n).trim());
    cssStale = false; cssEpoch++;
  }
  let cssEpoch = 0;
  // The colours the shader takes, one kept object: the ones the theme sets are made again only when the theme or the css values
  // read between frames change (palKey); the lumen's and the lymph's follow the model and are written in place each frame.
  const rgb3 = () => [0, 0, 0];
  const PAL = {
    cBg: rgb3(), cShade: rgb3(), cLumen: rgb3(), cLymph: rgb3(), cCell: rgb3(), cUnder: rgb3(), cNuc: null, cCol: null, cBm: null, aBm: 0,
    cBile: null, cEndo: null, cEndoS: null, cEndoE: null, cEndoN: null, cHscQ: null, cHscA: null, cHscN: null, cKup: null, cKupN: null, cKupE: null,
    cRbc: null, cEndF: null, cEndE: null, cAlb: null, cAlbE: null, uShim: 0, uStreak: 0, uDark: 0,
    // (the camera and the reveal, written in place each frame)
    uI0: rgb3(), uI1: rgb3(), uF0: rgb3(), uF1: rgb3(), uEnd: [0, 0, 0, 0], uRev: [0, 0, 0, 0], uDet: [0, 0], uEndA: null,
  };
  const LY = { lo: null, mid: null, hi: null, bg: null };
  let palDark = null, palEpoch = -1;
  function cssv(n, d) {
    let x = cssVals.get(n);
    if (x == null) { cssVals.set(n, null); cssMiss = true; x = ''; }
    return x || d;
  }
  function palette(dark) {
    const m = model, U = PAL;
    if (palDark !== dark || palEpoch !== cssEpoch) {
      palDark = dark; palEpoch = cssEpoch;
      const bg = rgb(cssv('--stage-bg', cssv('--bg')));
      LY.bg = bg; LY.lo = rgb(cssv('--sv-gl-lymph-lo')); LY.mid = rgb(cssv('--sv-gl-lymph-mid')); LY.hi = rgb(cssv('--sv-gl-lymph-hi'));
      const gap = rgb(cssv('--og-liver-2'));
      const cell = copyRgb(TCELL, rgb(cssv('--og-liver-1')));
      if (dark) blendRgb(cell, gap, cell, 0.5);
      // The hepatocytes keep the lobule's colours; on a light page the clefts between them are drawn deeper, so each cell reads.
      const under = blendRgb(TUNDER, bg, gap, dark ? 0.55 : 0.5);
      copyRgb(U.cBg, bg);
      if (dark) copyRgb(U.cShade, bg); else blendRgb(U.cShade, bg, rgb(cssv('--sv-gl-shade')), 0.9);
      blendRgb(U.cCell, under, cell, dark ? 0.85 : 0.94);
      if (dark) copyRgb(U.cUnder, under); else blendRgb(U.cUnder, bg, gap, 0.8);
      U.cNuc = rgb(cssv('--sv-gl-nucleus'));
      U.cCol = rgb(cssv('--collagen')); U.cBm = rgb(cssv('--sv-gl-basement')); U.aBm = dark ? 0.6 : 0.8;
      U.cBile = rgb(cssv('--sv-gl-bile'));
      U.cEndo = rgb(cssv('--sv-gl-endothelium')); U.cEndoS = rgb(cssv('--sv-gl-endo-sheet')); U.cEndoE = rgb(cssv('--sv-gl-endo-edge')); U.cEndoN = rgb(cssv('--sv-gl-endo-nucleus'));
      U.cHscQ = rgb(cssv('--sv-gl-hsc-quiet')); U.cHscA = rgb(cssv('--sv-gl-hsc-active')); U.cHscN = rgb(cssv('--sv-gl-hsc-nucleus'));
      U.cKup = rgb(cssv('--sv-gl-kupffer')); U.cKupN = rgb(cssv('--sv-gl-kupffer-nucleus')); U.cKupE = rgb(cssv('--sv-gl-kupffer-edge'));
      U.cRbc = rgb(cssv('--sv-gl-rbc'));
      // The end arrows are inked as their labels: the text's colour inside the labels' halo.
      U.cEndF = rgb(cssv('--text')); U.cEndE = rgb(cssv('--label-halo'));
      U.cAlb = rgb(cssv('--sv-gl-albumin')); U.cAlbE = rgb(cssv('--sv-gl-albumin-edge'));
      U.uShim = dark ? 0.3 : 0.5; U.uStreak = dark ? 0.3 : 0.85; U.uDark = dark ? 1 : 0;
      if (cssMiss) palEpoch = -1;   // (a value not read yet: made again once it is)
    }
    // Pressure only: this view has no other lens.
    copyRgb(U.cLumen, rgb(m.hide ? cssv('--sv-lumen-hidden') : pressureColor(m.P2)));
    // Lymph: clear and faintly green, deeper with more protein (as the lobule's lymphatics).
    const pr = S.prot ?? 1;
    if (pr < 0.45) blendRgb(LYMPH, LY.lo, LY.mid, pr / 0.45); else blendRgb(LYMPH, LY.mid, LY.hi, (pr - 0.45) / 0.55);
    if (dark) blendRgb(U.cLymph, LY.bg, LYMPH, 0.34); else copyRgb(U.cLymph, LYMPH);
    return U;
  }
  const LYMPH = [0, 0, 0], TCELL = [0, 0, 0], TUNDER = [0, 0, 0];

  // ── What moves ──
  // The blood: the shader's shimmer, at the flow. Albumin rides in it (amber dots), each at
  // its lane's speed (parabolic: fastest in the middle). Plasma crosses the wall into Disse: its water
  // wherever it can (not drawn), albumin only through open fenestrae; at a closed wall albumin is turned back.
  // In Disse the lymph runs back toward the portal triad, carrying what crossed.
  let flowX = 0, lymX = 0, spawnAcc = 0, bounceAcc = 0;
  const albs = [], movers = [];   // movers: { kind: 'a' albumin | 'b' albumin turned back, side, x, y (depth in Disse, 0…1), t, ph }
  const rnd = rng(17);
  { const R = rng(23); for (let i = 0; i < 150; i++) albs.push({ u: R(), y: R() * 1.9 - 0.95, ph: R() * Math.PI * 2 }); }
  const poreW = (p) => p.w * poreOpenness(p.th, S.por);
  const WTS = [];   // (each pore's weight, kept; it grows to the most pores once)
  function pickPore(side, albumin) {
    const pores = geo.pores[side < 0 ? 0 : 1];
    let tot = 0;
    const wts = WTS;
    for (let i = 0; i < pores.length; i++) {
      const p = pores[i];
      const w = p.x > VW.vis[0] && p.x < VW.vis[1] ? poreW(p) : 0, k = albumin ? (w > 0.22 ? w * w : 0) : w > 0.02 ? w + 0.06 : 0;
      wts[i] = k; tot += k;
    }
    if (tot <= 0) return null;
    let r = rnd() * tot;
    for (let i = 0; i < pores.length; i++) { r -= wts[i]; if (r <= 0 && wts[i] > 0) return pores[i]; }
    return null;
  }
  function stepMovers(dt) {
    const span = VW.vis[1] - VW.vis[0], vB = S.v * 24, vL = -(1.5 + 4.5 * Math.min(S.filt, 4));   // µm/s: blood, and lymph (back toward the portal triad)
    flowX += vB * dt; lymX += vL * dt;
    // Filtration: crossings per second over this stretch of both walls, rising with the lymph; the share of albumin among
    // them is the lymph's protein (what the dots in Disse show is its concentration, not its amount).
    const rate = 0.07 * span * Math.sqrt(S.filt), pA = 0.5 * clamp((model.lyProt - 0.3) / 0.62, 0, 1) ** 2;
    spawnAcc += rate * dt;
    while (spawnAcc >= 1) {
      spawnAcc -= 1;
      if (movers.length > 900) continue;
      if (rnd() >= pA) continue;   // water: it crosses too, but only the albumin is drawn
      const side = rnd() < 0.5 ? -1 : 1, p = pickPore(side, true);
      if (!p) { bounceAcc += 1; continue; }   // nowhere for it to go: it is turned back
      addMover('a', side, p.x, 0.15 + 0.7 * rnd(), rnd() * Math.PI * 2);
    }
    // Albumin turned back at a sealed wall: it comes up to the lining and goes back into the stream.
    bounceAcc += 0.1 * span * (1 - S.por) * dt;
    while (bounceAcc >= 1) {
      bounceAcc -= 1;
      if (movers.length > 900) continue;
      addMover('b', rnd() < 0.5 ? -1 : 1, lerp(VW.vis[0] + 4, VW.vis[1] - 4, rnd()), 0, 0);
    }
    // (Each one steps, and those done leave: the others close up in order, the objects go back to the pool.)
    let w = 0;
    for (let i = 0; i < movers.length; i++) {
      const q = movers[i];
      q.t += dt;
      let gone;
      if (q.kind === 'b') { q.x += vB * 0.6 * dt; gone = q.t > BT; }
      else {
        // Through the wall (0.5 s, carried a little by the blood), then along Disse with the lymph.
        if (q.t < 0.5) q.x += vB * 0.25 * dt; else q.x += vL * (0.85 + 0.3 * Math.sin(q.ph)) * dt;
        gone = q.x < VW.vis[0] - 4 || q.x > VW.vis[1] + 4;
      }
      if (gone) movPool.push(q); else movers[w++] = q;
    }
    movers.length = w;
  }
  const movPool = [];
  function addMover(kind, side, x, y, ph) {
    const q = movPool.pop() || { kind: 'a', side: 1, x: 0, t: 0, y: 0, ph: 0 };
    q.kind = kind; q.side = side; q.x = x; q.t = 0; q.y = y; q.ph = ph;
    movers.push(q);
  }
  // The sprites for this frame: (x, y, radius, alpha, kind) — 0 albumin, 2 the flash at a sealed wall.
  const pts = new Float32Array(1400 * 5);
  const BT = 1.6;   // how long an albumin turned back at a sealed wall is shown (s)
  let albN = -1, spriteDt = 0;
  let spN = 0;
  function put(x, y, r, a, k) { if (spN >= 1400 || a <= 0.01) return; const o = spN * 5; pts[o] = x; pts[o + 1] = y; pts[o + 2] = r; pts[o + 3] = a; pts[o + 4] = k; spN++; }
  function sprites() {
    spN = 0;
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
      put(q.x, y, 0.38, al, 0);
    }
    return spN;
  }

  // ── Labels ──
  // The fenestrae's open share, read as a value beneath the name, "16% open" up to "100% open" (Mohammad, 20 Oct: the word
  // and the number agree; no "Closing" for a wall at rest). It counts by single percents with S.por, so it eases, never jumps.
  // (Made again only when the whole percent changes.)
  let fenN = -1, fenS = '', fenT = '';
  const fenPct = () => { const n = Math.round(S.por * 100); if (n !== fenN) { fenN = n; fenS = `${n}%`; fenT = `${n}%~open`; } return fenS; };   // alloc-rare: when the whole percent changes
  const fenTxt = () => { fenPct(); return fenT; };
  // Every frame: the share counts with S.por (the caption itself is built once; see caption).
  // (Written between frames, pageRun.)
  function fenTick() {
    const R = regions.fen;
    if (!R) return;
    const pct = fenPct();
    if (pct !== fenShown) {
      fenShown = pct; fenWant = pct; pageSoon();
      // (The GPU's words count in this frame, about the same centre.)
      R.lines = linesOf(R.text.split('|')[0], [fenTxt()]); // alloc-rare: words in a caption are built when they change (a number moved, a name set), never on a steady frame
      if (R.cx != null && cap.hasLook('fen')) { cap.measure('fen', R.lines); cap.paint(); }
    }
  }
  let fenShown = '';
  // The fenestra a callout points at: of the upper lining's pores near x, one in view that no endothelial cell body covers
  // (the swell over a nucleus hides the pores under it), the one that stays open longest (by place only, so the line does
  // not hop as the pores close).
  const fenAt = (x) => calloutPore(geo.pores[0], x, VW.fr[0] + 3, VW.fr[1] - 3, SEED.nucUp);
  // The numbers the names show, as the text: made again only when the number changes (a caption is compared by its words each layout,
  // and the layout runs every frame of a glide).
  const NV = new Float64Array(8).fill(NaN), NV2 = new Float64Array(8).fill(NaN), NS = [];
  function numTxt(slot, v, d, u) {   // "<v>~<u>", or "?" while hidden
    if (model.hide) return '?';
    if (NV[slot] !== v || NV2[slot] !== d || NS[slot * 2 + 1] !== u) { NV[slot] = v; NV2[slot] = d; NS[slot * 2 + 1] = u; NS[slot * 2] = `${fmt(v, d)}~${u}`; }   // alloc-rare: when the number changed
    return NS[slot * 2];
  }
  const LV = new Float64Array(4).fill(NaN), LV2 = new Float64Array(4).fill(NaN), LS = [];
  function lymphTxt(slot, tall) {   // the lymph's reading on one line (the no-break space before the dot keeps the caption from splitting it)
    const m = model;
    if (m.hide) return '?';
    if (LV[slot] !== m.lymph || LV2[slot] !== m.lyProt) { LV[slot] = m.lymph; LV2[slot] = m.lyProt; LS[slot] = `${fmt(m.lymph, 1)}~mL/min${tall ? ' ' : '\u00a0'}· Protein ${Math.round(m.lyProt * 100)}%`; }   // alloc-rare: when the number changed
    return LS[slot];
  }
  const PV = new Float64Array(2).fill(NaN), PS = [];
  function pressTxt(slot, P) { if (model.hide) return '?'; if (PV[slot] !== P) { PV[slot] = P; PS[slot] = fmt(P, 1); } return PS[slot]; }   // alloc-rare: when the number changed
  // Options of the names, kept (a layout makes none).
  const O_SIN = { along: true, side: 0, slide: false }, O_FEN = { along: false, side: -1, slide: true }, O_DISSE = { along: true, side: 0, slide: true };
  const O_LYMPH = { along: false, side: 1, slide: false }, O_KUP = { along: true, side: -1, slide: false };
  const O_HSC = [{ along: false, side: -1, slide: false }, { along: true, side: -1, slide: false }];   // (by whether the screen is portrait)
  const pickTags = (u) => lerp(VW.fr[0] + 8, VW.fr[1] - 8, u);
  const awayX = (x, from, d) => (Math.abs(x - from) < d ? from + (x < from ? -d : d) : x);
  const fenR = (xp, dx) => region('fen', 'Fenestrae', fenTxt(), xp + dx, -(hepIn(xp) + 1), O_FEN);
  const disseR = (x) => region('disse', 'Space of Disse', '', x, (geo.vert ? 1 : -1) * (wallIn(x) + disseW(x) * 0.5), O_DISSE);
  const lymphR = (x) => region('lymph', 'Lymph', lymphTxt(0, false), x, hepIn(x) + 1.2, O_LYMPH);
  const hepR = (x) => region('hep', 'Hepatocyte', '', x, hepIn(x) + UM.hep * (HEP_CELL.nv < 0.5 ? 0.78 : 0.22), NO_OPT);
  const PFD = { pores: null, nsd: 0, lo: 0, hi: 0, hs: [0, 0], fh: 0, dh: 0, fp: 0, xs: 0, far: 0 };   // (placeFenDisse's options, written in place)
  function layoutTags() {
    const g = geo, m = model, V = g.vert;
    // In the lumen: the sinusoid (mid-view), the Kupffer cell beside itself, and the fenestrae along the far wall.
    if (g.tall) { layoutTall(); return; }
    for (const k in lead) if (k !== 'lymph' && k !== 'fen') lead[k].show = 0;   // (across the screen only the lymph and the fenestrae have leaders)
    const xc = awayX(pickTags(0.5), g.xk, 30);
    region('sin', 'Sinusoid', numTxt(0, m.P2, 1, ''), xc, 0, O_SIN);
    kupName();
    // In the plates: the stellate cell named just beyond its body; the fenestrae in the same plate, well clear of it (120 px), with a
    // short callout straight down to an open fenestra in the lining, clear of the stellate cell's name, of the Space of Disse's and of
    // the callout's own line (fen-place.js). Placed in the view's resting frame and scale (not the one a glide is passing
    // through), so the names keep their places in the figure as the view eases.
    const hs = region('hsc', S.act > 0.5 ? 'Activated stellate cell' : 'Stellate cell', '', g.xs, -(hepIn(g.xs) + 1), O_HSC[V ? 1 : 0]);
    const fp = 16 / VW.k;
    const tk = VW.tk, hsHalf = hs.w / 2 / tk, hsx = hs.x, hshalf = hs.half;
    PFD.pores = g.pores[0]; PFD.nsd = SEED.nucUp; PFD.lo = (VW.f.l - VW.tC[0] + 6) / tk; PFD.hi = (VW.f.r - VW.tC[0] - 6) / tk;
    PFD.hs[0] = g.xs - hsHalf; PFD.hs[1] = g.xs + hsHalf; PFD.fh = fenR(0, 0).w / 2 / tk; PFD.dh = disseR(0).w / 2 / tk; PFD.fp = 16 / tk; PFD.xs = g.xs; PFD.far = 120 / tk;
    const spot = placeFenDisse(PFD);
    let xp, rf, xq = spot ? spot.xq : null;
    if (spot) { xp = spot.xp; rf = fenR(xp, spot.xc - xp); }
    else {
      xp = fenAt(pickTags(0.6)); rf = fenR(xp, 0);
      if (Math.abs(rf.x - hsx) - rf.half - hshalf < fp * 2) { xp = fenAt(hsx + hshalf + rf.half + fp * 2); rf = fenR(xp, 0); }
    }
    leader('fen', rf, xp, -(halfW(xp) + UM.endo * 0.5));
    // In Disse: its name (on the stellate cell's side on a wide screen, clear of it and of the fenestrae's callout),
    // and the lymph it carries, read in the plate just beyond it on the other side.
    if (xq != null) disseR(xq);
    else {
      // (Too narrow for the three side by side: the callout is placed alone, and this name steps clear of it, or the declutter does.)
      xq = V ? pickTags(0.24) : awayX(pickTags(0.86), g.xs, 40);
      const rq = disseR(xq);
      if (!V && xq - rq.half < rf.x + rf.half + fp && xq + rq.half > xp - fp) {
        xq = rf.x + rf.half + rq.half + fp;
        if (xq + rq.half > VW.fr[1]) xq = xp - fp - rq.half;
        disseR(xq);
      }
    }
    // (Its reading on one line, "0.5 mL/min · Protein 91%".)
    const xd = pickTags(V ? 0.55 : 0.2);
    let ly = lymphR(xd);
    // A hepatocyte named on itself, clear of its nucleus.
    const xh = pickTags(V ? 0.88 : 0.6), hc = cellAtInto(xh, SEED.plateDn, HEP_CELL);
    // The cell's name and the lymph's numbers share a plate: on a narrow view (a cell wider than its share of the
    // screen) the name slides back along its cell, then the numbers step on, until the two are clear.
    const pad = 16 / VW.k;   // (µm)
    let hl = hepR((hc.x0 + hc.x1) / 2);
    if (Math.abs(hl.x - ly.x) - hl.half - ly.half < pad) {
      const d = hl.x < ly.x ? -1 : 1;   // (the side of the numbers the name is on)
      hl = hepR(clamp(ly.x + d * (ly.half + hl.half + pad), hc.x0 + hl.half, hc.x1 - hl.half));
      if (Math.abs(hl.x - ly.x) - hl.half - ly.half < pad) ly = lymphR(hl.x - d * (hl.half + ly.half + pad));
    }
    // The lymph's numbers are tied by a short leader, straight up, to the space of Disse that carries it.
    leader('lymph', ly, ly.x, wallIn(ly.x) + disseW(ly.x) * 0.5);
  }
  // A portrait screen: the sinusoid runs top to bottom and every label reads level. The lumen keeps only its own
  // name; the narrow bands (fenestrae, Disse) and the cells are named in the plates beside them, the stellate cell's
  // side (right) and the Kupffer cell's side (left) each in its own column, spaced down the screen between the ends'
  // names, each tied to what it names by a thin leader.
  let tallU0 = 0, tallU1 = 0;
  const pickTall = (u) => lerp(tallU0, tallU1, u);
  const midTall = (x) => hepIn(x) + Math.min(UM.hep * 0.5, (geo.W / 2 / VW.k - hepIn(x)) * 0.5);   // the middle of the plate's part on screen
  const disX = (x) => wallIn(x) + disseW(x) * 0.5;
  function layoutTall() {
    const g = geo, m = model, k = VW.k;
    // The band between the ends' names (and below the legend), µm along the vessel.
    tallU0 = Math.max(VW.fr[0], (BAND[0] - VW.C[1]) / k); tallU1 = Math.min(VW.fr[1], (BAND[1] - VW.C[1]) / k);
    region('sin', 'Sinusoid', numTxt(1, m.P2, 1, ''), pickTall(0.42), 0);
    // Right (y < 0): fenestrae, stellate cell, a hepatocyte.
    let x = pickTall(0.08);
    const xp = fenAt(x);
    leader('fen', region('fen', 'Fenestrae', fenTxt(), x, -midTall(x)), xp, -(halfW(xp) + UM.endo * 0.5));
    x = clamp(g.xs, pickTall(0.3), pickTall(0.62));
    leader('hsc', region('hsc', S.act > 0.5 ? 'Activated\nstellate cell' : 'Stellate\ncell', '', x, -midTall(x)), g.xs, -(disX(g.xs) + 0.6));   // (stacked, to fit the plate)
    region('hep', 'Hepatocyte', '', pickTall(0.92), -midTall(pickTall(0.92)));
    // Left (y > 0): the space of Disse, the lymph it carries, the Kupffer cell.
    x = pickTall(0.08);
    leader('disse', region('disse', 'Space of\nDisse', '', x, midTall(x)), x, disX(x));
    x = pickTall(0.46);
    leader('lymph', region('lymph', 'Lymph', lymphTxt(1, true), x, midTall(x)), x + 2, disX(x + 2));
    // The Kupffer cell's name in the plate beside it (the lumen is narrower than its name), a short leader across the lining to its body.
    { const kx = geo.xk, ky = halfW(kx) - 2.5 * clamp(halfW(kx) / 5.2, 0.6, 1); region('kup', 'Kupffer\ncell', '', kx, midTall(kx)); const kc = regions.kup.cell || (regions.kup.cell = [0, 0]); kc[0] = kx; kc[1] = ky; }   // alloc-rare: the Kupffer cell's place, made once
  }
  // The fenestrae's and Disse's names on a wide screen are placed for the view at rest, and the pore the fenestrae's callout ends on by
  // where its name stands, so a card that opens or closes (or a pore picked anew) can move one at once, along the vessel. It is drawn
  // where it stood and catches up with the view's glide, `sd` µm behind its place, and never jumps. (The names laid against the eased
  // room, and every name on a portrait screen, move with it and need none.)
  const SLID = [null, null, null];
  const slid = () => { SLID[0] = regions.fen; SLID[1] = regions.disse; SLID[2] = lead.fen; return SLID; };   // (a kept list: the three that slide)
  function noteJumps() {
    let moved = false;
    for (const o of slid()) {
      if (!o || o.tx == null) continue;
      if (o.pt == null || o.pv !== geo.vert || dive) { if (o.sd) moved = true; o.sd = 0; }   // (a first look, a turn, or the zoom carrying the view)
      else if (Math.abs(o.tx - o.pt) * VW.k > 0.5) { o.sd = (o.sd || 0) + o.pt - o.tx; moved = true; }   // (half a pixel or less is no move)
      o.pt = o.tx; o.pv = geo.vert;
    }
    return moved;
  }
  function settleJumps() {
    for (const o of slid()) if (o?.sd) { o.sd *= 1 - easeA; if (Math.abs(o.sd) * VW.k < 0.3) o.sd = 0; else layoutBusy = true; }
  }
  // The Kupffer cell is named on one line just above it, clear of its highest process (sinusoid-gl.js sdKup0 reaches 6.6 µm into the
  // stream at its scale kupK), in the lumen, never over its body (its name tinted as the cell). (Mohammad, 2 Nov 2026, label mocks.)
  const kupTop = () => halfW(geo.xk) - 6.6 * clamp(halfW(geo.xk) / 5.2, 0.6, 1);
  const kupName = () => { const R = region('kup', 'Kupffer cell', '', geo.xk, kupTop() - 0.8, O_KUP); regions.kup.cell = null; return R; };
  const BAND = [0, 0];   // a portrait screen's band for the other names, between the ends' (px down the screen)
  // How much an end's name shows now (0 to 1): its pill's own fades (a presenter slide that is not about it, the names leaving).
  // In the presenter an end's arrow follows it, so no direction arrow shows without its name (Explore keeps both as they are).
  // (Its own fade is the GPU's, caption-gl.js: the page's model is clear.)
  const endShown = (key) => {
    const e = regions[key]?.el;
    if (!document.getElementById('app')?.classList.contains('presenting')) return 1;
    if (!e || e.hidden || !e.firstElementChild) return 0;
    return (endOp[key] ?? 0) * (cap.on ? cap.at(key, easeNow())?.a ?? 0 : 1);
  };
  // (The ends' fades as they stand, read between frames: a rest pass each frame the view is drawn.)
  const endOp = {};
  function readEnds() {
    let ch = false;
    for (const key of ['in', 'out']) {
      const e = regions[key]?.el;
      const v = !e || e.hidden || !e.firstElementChild ? 0 : Math.min(1, (cap.on ? 1 : +getComputedStyle(e).opacity || 0) * (+getComputedStyle(e.firstElementChild).opacity || 0) * (+getComputedStyle(labels).opacity || 0));
      if (Math.abs((endOp[key] ?? -1) - v) > 0.004) { endOp[key] = v; ch = true; }
    }
    return ch;
  }
  const END = [0, 0, 1];   // the end arrows: portal x, central x, size (µm)
  const ENDBOX = [null, null];
  const LEG = { x: 0, y: 0, w: 0, h: 0 };   // the legend's box (px)   // the ends' names on a wide screen (px), for the captions to keep clear of
  // Large text (or a narrow view): names that still overlap after the layout step apart, up or down the screen first,
  // then sideways, and ease there; a name's leader moves with it. The ends' names, the legend and the lumen's keep their places.
  // The cards over the stage, in stage px (what the lobule's labels keep off, too).
  // (Read four times a second, between frames (a rest pass), never in one: a card that comes or goes is followed within a moment, eased.)
  let bkAt = -1e9, bk = '', bkRects = [];
  function readBlockers() {
    bkAt = performance.now();
    const hr = host.getBoundingClientRect(), out = [];
    let k = '';
    for (const c of document.querySelectorAll('.stage-blocker:not([hidden])')) {
      const r = c.getBoundingClientRect();
      if (r.width) k += `${r.left | 0},${r.top | 0},${r.right | 0},${r.bottom | 0};`;
      if (r.width && r.height && getComputedStyle(c).visibility !== 'hidden') out.push({ l: r.left - hr.left, r: r.right - hr.left, t: r.top - hr.top, b: r.bottom - hr.top });
    }
    bkRects = out;
    if (k === bk) return false;
    bk = k;
    return true;
  }
  const blockers = () => bkRects;
  const blockKey = () => bk;
  // The reads the frames take as they were last made, all made here between two frames: the look's values, the ends' fades, the cards.
  let restAsk = 0;
  function readRest() {
    restAsk = 0;
    if (gapStale) { gapStale = false; readGap(); }
    if (shown <= 0) return;
    let ch = false;
    if (cssStale || cssMiss) { readCss(); cssMiss = false; ch = true; sizedNew = true; }   // (the leaders' inks too: laid out again)
    if (document.getElementById('app')?.classList.contains('presenting') && readEnds()) ch = true;
    if (performance.now() - bkAt >= 250 && readBlockers()) ch = true;
    if (ch) { gpuKey = ''; wake(); }
  }
  function askRest() { if (!restAsk) restAsk = restPass(readRest); }
  // The boxes placed so far (left, right, top, bottom each) in a kept list, and the candidate's in BX.
  let PL = new Float64Array(256), plN = 0;
  const BX = new Float64Array(4), TRY = new Float64Array(2), FOUND = new Float64Array(3), LEAST = new Float64Array(4);
  let dgx = 0, dgy = 0, dW = 0, dT = 0, dB = 0;
  function addPlaced(l, r, t, b) {
    if (plN * 4 + 4 > PL.length) { const g = new Float64Array(PL.length * 2); g.set(PL); PL = g; }   // alloc-rare: more boxes than ever before, once
    const o = plN++ * 4; PL[o] = l; PL[o + 1] = r; PL[o + 2] = t; PL[o + 3] = b;
  }
  // A box at offset (dx, dy) and scale s about the label's centre, into BX.
  function boxAt(cx, cy, w, hh, dx, dy, sc) { BX[0] = cx + dx - (w / 2) * sc; BX[1] = cx + dx + (w / 2) * sc; BX[2] = cy + dy - (hh / 2) * sc; BX[3] = cy + dy + (hh / 2) * sc; }
  function boxFree() {
    if (!(BX[0] >= 2 && BX[1] <= dW - 2 && BX[2] >= dT && BX[3] <= dB)) return false;
    for (let i = 0; i < plN; i++) { const o = i * 4; if (BX[0] < PL[o + 1] + dgx && PL[o] < BX[1] + dgx && BX[2] < PL[o + 3] + dgy && PL[o + 2] < BX[3] + dgy) return false; }
    return true;
  }
  function boxOverlap() {
    let a = 0;
    for (let i = 0; i < plN; i++) { const o = i * 4; a += Math.max(0, Math.min(BX[1], PL[o + 1] + dgx) - Math.max(BX[0], PL[o] - dgx)) * Math.max(0, Math.min(BX[3], PL[o + 3] + dgy) - Math.max(BX[2], PL[o + 2] - dgy)); }
    return a + (BX[0] < 2 || BX[1] > dW - 2 || BX[2] < dT || BX[3] > dB ? 1e7 : 0);
  }
  // The i-th place to try for a name of size w × hh at scale sc centred at cy, into TRY: up or down the screen first, then sideways, then snug
  // above or below each name already placed. False past the last.
  function tryOffset(i, sc, w, hh, cy) {
    if (i === 0) { TRY[0] = 0; TRY[1] = 0; return true; }
    i--;
    if (i < 12) { TRY[0] = 0; TRY[1] = (i & 1 ? -1 : 1) * ((i >> 1) + 1) * (hh * sc / 3 + 3); return true; }
    i -= 12;
    if (i < 4) { TRY[0] = (i < 2 ? 1 : -1) * (i & 1 ? w * sc + 8 : w * sc / 2 + 8); TRY[1] = 0; return true; }
    i -= 4;
    const pi = i >> 1;
    if (pi >= plN) return false;
    const o = pi * 4;
    TRY[0] = 0; TRY[1] = i & 1 ? PL[o + 2] - dgy - 1 - (cy + (hh / 2) * sc) : PL[o + 3] + dgy + 1 - (cy - (hh / 2) * sc);
    return true;
  }
  const DECK = ['in', 'out', 'sin', 'fen', 'lymph', 'disse', 'hsc', 'hep', 'kup'];
  function declutter() {
    // (From the boxes the layout recorded, not the screen: the view may be mid-zoom, scaled by the compositor.)
    const W = geo.W, lk = labelK();
    // (Clear of each other's halo, which grows with the text, and of each other's pill: app.css .sv-region::before reaches
    // --pill-x and --pill-y past the name at every side, so two names keep both pills and 3 px between them, lit or not.)
    const k0 = lk / 0.9, hw = clamp(k0, 0.8, 1.5), pillX = 6 * k0 + 2 * hw, pillY = 3 * k0 + 2 * hw;
    dgx = Math.max(6 + 2 * lk, 2 * pillX + 3); dgy = Math.max(2 + 2 * lk, 2 * pillY + 3);
    // (Within the stage, below the top bar and a presenter's words, above a presenter's bar.)
    dW = W; dT = VW.ins[1]; dB = VW.ins[2];
    plN = 0;
    if (LEG.w) addPlaced(LEG.x, LEG.x + LEG.w, LEG.y, LEG.y + LEG.h);
    // The cards over the figure (a presenter slide's words, data and summary panel, an open card): a name keeps off them,
    // and one that cannot fades out rather than sit under a card.
    const cards = blockers();
    for (let i = 0; i < cards.length; i++) addPlaced(cards[i].l, cards[i].r, cards[i].t, cards[i].b);
    // The ends' names and the lumen's are fixed; the rest give way in turn.
    for (let ki = 0; ki < DECK.length; ki++) {
      const k = DECK[ki];
      const R = regions[k];
      if (!R?.box || !cap.hasLook(k)) continue;
      const b = R.box, w = b.r - b.l, hh = b.b - b.t, cx = (b.l + b.r) / 2, cy = (b.t + b.b) / 2;
      const off = R.off || (R.off = [0, 0, 1]);   // alloc-rare: a name's offset list, made the first time it is placed
      off[0] = 0; off[1] = 0; off[2] = 1;
      boxAt(cx, cy, w, hh, 0, 0, 1);
      if (k !== 'in' && k !== 'out' && k !== 'sin' && !boxFree()) {
        // Up or down the screen first, then sideways; where nothing is free at full size (a crowded phone at large
        // text), the name is set a little smaller, then smaller again, before it may overlap.
        // Failing all, the spot that overlaps least.
        let found = false, haveLeast = false;
        for (let si = 0; si < 3 && !found; si++) {
          const sc = si === 0 ? 1 : si === 1 ? 0.85 : 0.72;
          for (let i = 0; tryOffset(i, sc, w, hh, cy); i++) {
            const dx = TRY[0], dy = TRY[1];
            if (Math.abs(dy) > 2.2 * hh) continue;   // (a name stays near what it names)
            boxAt(cx, cy, w, hh, dx, dy, sc);
            if (boxFree()) { FOUND[0] = dx; FOUND[1] = dy; FOUND[2] = sc; found = true; break; }
            const o = boxOverlap() + Math.abs(dy) * 0.01;
            if (!haveLeast || o < LEAST[0]) { haveLeast = true; LEAST[0] = o; LEAST[1] = dx; LEAST[2] = dy; LEAST[3] = sc; }
          }
        }
        if (found) { off[0] = FOUND[0]; off[1] = FOUND[1]; off[2] = FOUND[2]; } else if (haveLeast) { off[0] = LEAST[1]; off[1] = LEAST[2]; off[2] = LEAST[3]; }
      }
      boxAt(cx, cy, w, hh, off[0], off[1], off[2]);
      let covered = false;
      for (let i = 0; i < cards.length && !covered; i++) { const p = cards[i]; if (BX[0] < p.r && p.l < BX[1] && BX[2] < p.b && p.t < BX[3]) covered = true; }
      // (Covered, it fades out, and its leader goes at once; both eased by the GPU's picture, caption-gl.js.)
      R.covered = covered;
      if (lead[k]) lead[k].hide = covered;
      addPlaced(BX[0], BX[1], BX[2], BX[3]);
      // The Kupffer cell's name, crowded off its cell, is tied back to it by a thin leader.
      if (k === 'kup') {
        const to = R.cell || R.at, sc = toScreen(to[0], to[1]), tx = sc[0], ty = sc[1];
        if (tx < BX[0] - 6 || tx > BX[1] + 6 || ty < BX[2] - 6 || ty > BX[3] + 6) {
          // (from the nearest point of the name's box to the cell)
          const L = lead.kup ||= { key: 'kup' };   // alloc-rare: the Kupffer leader, made the first time the name is crowded off its cell
          L.x1 = clamp(tx, BX[0], BX[1]); L.y1 = clamp(ty, BX[2], BX[3]); L.x2 = tx; L.y2 = ty; L.show = 1; L.follow = false; L.hide = R.covered;
        } else if (lead.kup) lead.kup.show = 0;
        continue;
      }
      // (A leader's near end follows its name's step aside as the GPU eases it, to the edge of the smaller box when the name was set
      // smaller: caption-gl.js, follow.)
      const L = lead[k];
      if (L) { L.follow = true; L.sg = Math.sign(L.x2 - cx); }
    }
  }
  let legendMax = '', legendMaxN = -1;
  const END_NAMES = ['Portal venule', 'Central vein'];
  function layoutEnds() {
    const g = geo, f = VW.fe;
    // The ends: the portal venule the blood comes from and the central vein it goes to, with their pressures (as the lobule labels them).
    // The legend: at the top left, under the top bar.
    const lx = f.l + 2, ly = VW.ins[0] + 12;
    // (On a top-down sinusoid it stays in the plate on the left, clear of the vessel and the portal venule's name.)
    const lr = g.vert ? toScreen(0, hepIn(0))[0] - 8 : geo.W - 12;
    // (Its room, for the page's model: written between frames, domPlace.)
    const lmax = Math.max(90, lr - lx);
    if (lmax !== legendMaxN) { legendMaxN = lmax; legendMax = `${lmax}px`; }   // alloc-rare: when the legend's room changes
    // (Its size from its look, as the GPU sets it: a dot and a word in a rounded frost.)
    const LL = legLook;
    if (LL.sig) { LEG.w = 2 * LL.px + (LL.dot ? LL.dot.d + LL.gap : 0) + measure('Protein', legFont(LL)); LEG.h = 2 * LL.py + LL.lh; }
    else LEG.w = LEG.h = 0;
    LEG.x = lx; LEG.y = ly;
    // (The unit is said once, in the pressure legend, as the anatomy's and the lobule's labels have it; looks review L2.)
    const m = model;
    for (let u = 0; u < 2; u++) {
      const key = u ? 'out' : 'in', name = END_NAMES[u], value = pressTxt(u, u ? m.P3 : m.P1);
      // (The Sinusoid's own caption, class and all: same capitals, size, ink, halo and reading.)
      const T = caption(key, 'sv-region sv-region-sin sv-end', name, value);
      const wh = szOf(T), w = wh[0], hh = wh[1];
      let x, y;
      // Its arrow (drawn by the shader), outside the label, points toward the vessel off the view: the portal venule's
      // above it on a top-down sinusoid (left of it on a wide one), pointing up (left); the central vein's below it
      // (right of it), pointing down (right).
      const A = 22 + 26;   // (the arrow and its gaps, px: the arrow stands in the middle of A, so the name keeps 12 px or more from its head)
      if (g.vert) { x = VW.C[0] - w / 2; y = u ? f.b - hh - A : f.t + A; }
      else { x = u ? f.r - w - 8 - A : f.l + 8 + A; y = VW.C[1] - hh / 2; }
      // (Large text: the portal venule's name drops below the legend rather than run into it.)
      if (g.vert && !u && LEG.w && LEG.x + LEG.w > x - 6) y = Math.max(y, LEG.y + LEG.h + A);
      T.cx = x + w / 2; T.cy = y + hh / 2; T.end = true; 
      const a0 = T.at0 || (T.at0 = [0, 0]);   // alloc-rare: made once per end
      a0[0] = x; a0[1] = y;   // (its box's top left, as the page's model is placed)
      const tb = T.box || (T.box = { l: 0, r: 0, t: 0, b: 0 });   // alloc-rare: made once per end
      tb.l = x; tb.r = x + w; tb.t = y; tb.b = y + hh;
      if (g.vert) ENDBOX[u] = null;
      else { const eb = ENDBOX[u] || (ENDBOX[u] = { u, x0: 0, x1: 0, y0: 0, y1: 0 }); eb.u = u; eb.x0 = u ? x : x - A; eb.x1 = u ? x + w + A : x + w; eb.y0 = y; eb.y1 = y + hh; }   // alloc-rare: made once per end
      if (g.vert) BAND[u] = u ? y - 6 : y + hh + 6;
      const ax = g.vert ? VW.C[0] : u ? x + w + A / 2 : x - A / 2, ay = g.vert ? (u ? y + hh + A / 2 : y - A / 2) : VW.C[1];
      const ca = Math.cos(g.ang), sa = Math.sin(g.ang);
      END[u] = ((ax - VW.C[0]) * ca + (ay - VW.C[1]) * sa) / VW.k;
    }
    END[2] = Math.min(22 / VW.k, UM.lum * S.lum * 0.95);   // (a bold head, as wide as the names' capitals are tall, within the lumen)
    // (On a top-down sinusoid the other names keep below the legend too.)
    if (g.vert) BAND[0] = Math.max(BAND[0], VW.ins[0] + 12 + LEG.h + 8);
  }

  // ── The names, to the GPU (caption-gl.js) and to the page's model ──
  // (The ink as the GPU takes it, made again only when the css value changes; the records handed to the captions are kept, they copy what they need.)
  const INK = new Map();
  const inkOf = (n) => {
    const t = tok(n);
    let e = INK.get(n);
    if (!e || e.t !== t) { e = { t, v: rgbaOf(t) }; INK.set(n, e); }   // alloc-rare: when a css colour is first read or changes
    return e.v;
  };
  const PUT = { x: 0, y: 0, off: null, show: 1, now: 0 }, NO_OFF = [0, 0, 1];
  const LEGLINES = [[['Protein', 'name']]];   // (one list, so the legend's words are not set again each frame)
  let legDotFor = null, legDecor = null;
  const LEADO = { x1: 0, y1: 0, x2: 0, y2: 0, show: 1, cut: false, of: null, follow: false, sg: 0, colour: null };
  // (Each caption where the layout put it, its step aside, and whether a card covers it; each leader with its ink and its name.)
  // The leaders and dots as the Anatomy and Circuit labels have them (app.css .leader, .leader-dot, .leader-dot-halo): the leader ink, the stage's paper
  // under the dot and round it, the text ink's ring. Read through the token cache, so a theme change shows at once.
  const LEAD_LOOK = { line: '', lw: 1, r: 2.4, fill: '', ring: '', rw: 1.3, halo: '', haloR: 5 };
  // A slide that lights terms dims every name it does not light to 35 % and keeps its place (Mohammad's pick 14.3 B, 3 Nov): the page's lit terms, split when they change.
  let litRaw = null, litSet = new Set();
  const dimA = (R) => {
    const app = document.getElementById('app'), raw = app?.dataset.lit || '';
    if (raw !== litRaw) { litRaw = raw; litSet = new Set(raw ? raw.split(' ') : []); }   // alloc-rare: only when the slide's lit terms change
    if (!raw || !app.classList.contains('presenting') || !/(^| )(lobule|sinusoid):/.test(raw)) return 1;
    return litSet.has(`sinusoid:${SV_TARGET[R.key] || R.key}`) ? 1 : 0.35;
  };
  function putCaps() {
    const now = easeNow();
    LEAD_LOOK.line = inkOf('--leader'); LEAD_LOOK.fill = inkOf('--stage-bg'); LEAD_LOOK.halo = LEAD_LOOK.fill; LEAD_LOOK.ring = inkOf('--text-2');
    cap.leadLook(LEAD_LOOK);
    for (const key in regions) {
      const R = regions[key];
      if (R.cx == null || !cap.hasLook(R.key)) continue;
      cap.measure(R.key, R.lines);
      PUT.x = R.cx; PUT.y = R.cy; PUT.off = R.off || NO_OFF; PUT.show = R.covered ? 0 : dimA(R); PUT.now = now;
      cap.put(R.key, PUT);
    }
    for (const key in lead) {
      const L = lead[key];
      if (L.x1 == null) continue;
      LEADO.x1 = L.x1; LEADO.y1 = L.y1; LEADO.x2 = L.x2; LEADO.y2 = L.y2; LEADO.show = L.hide ? 0 : L.show * (regions[L.key] ? dimA(regions[L.key]) : 1); LEADO.cut = !!L.hide; LEADO.of = regions[L.key] ? L.key : null;
      LEADO.follow = !!L.follow; LEADO.sg = L.sg || 0; LEADO.colour = LEAD_LOOK.line;
      cap.lead(L.key, LEADO);
    }
    const LL = legLook;
    if (LL.sig && LEG.w && cap.hasLook('legend')) {
      const wsz = cap.measure('legend', LEGLINES), ww = wsz[0], dd = LL.dot ? LL.dot.d + LL.gap : 0;
      const left = LEG.x + LL.px;
      PUT.x = left + dd + ww / 2; PUT.y = LEG.y + LEG.h / 2; PUT.off = NO_OFF; PUT.show = 1; PUT.now = now;
      cap.put('legend', PUT);
      if (LL.dot && LL.dot !== legDotFor) {
        legDotFor = LL.dot;
        const r = LL.dot.d / 2, cx = -dd + r, cy = wsz[1] / 2, ring = [], N = 20;
        for (let i = 0; i < N; i++) ring.push(cx + r * Math.cos((i / N) * 2 * Math.PI), cy + r * Math.sin((i / N) * 2 * Math.PI));
        legDecor = [{ pts: ring, fill: LL.dot.fill, stroke: LL.dot.ring?.colour, sw: LL.dot.ring?.w }];
      }
      cap.decor('legend', LL.dot ? legDecor : null);
    } else cap.put('legend', { x: 0, y: 0, off: NO_OFF, show: 0, now });
  }
  // The page's model of the names, placed where the GPU draws them, between frames and once they rest: for screen readers and what reads
  // their boxes (credit.js keeps its art off them). A frame never writes it.
  let domAsk = 0, domKey = '';
  const domSoon = () => { if (!domAsk) domAsk = restPass(domPlace); };
  cap.onRest = domSoon;
  function domPlace() {
    domAsk = 0;
    if (svMoving || cap.moving()) return;   // (still on its way: the frame asks again once it rests)
    let k = '';
    for (const R of Object.values(regions)) k += `${R.key}:${R.cx?.toFixed(1)},${R.cy?.toFixed(1)},${R.off || ''},${!!R.covered}|`;
    k += `${LEG.x.toFixed(1)},${LEG.y.toFixed(1)},${legendMax}`;
    if (k === domKey) return;
    domKey = k;
    for (const R of Object.values(regions)) {
      const e = R.el;
      if (!e || R.cx == null) continue;
      e.style.transform = R.end ? `translate(${R.at0[0].toFixed(1)}px, ${R.at0[1].toFixed(1)}px)` : `translate(${R.cx.toFixed(1)}px, ${R.cy.toFixed(1)}px) translate(-50%, -50%)`;
      const o = R.off || [0, 0, 1];
      e.style.translate = o[0] || o[1] ? `${o[0].toFixed(1)}px ${o[1].toFixed(1)}px` : '';
      e.style.scale = o[2] !== 1 ? String(o[2]) : '';
      if (R.covered) e.dataset.covered = ''; else delete e.dataset.covered;
    }
    legend.style.transform = `translate(${LEG.x.toFixed(1)}px, ${LEG.y.toFixed(1)}px)`;
    if (legend.style.maxWidth !== legendMax) legend.style.maxWidth = legendMax;
  }

  // ── The frame ──
  // The layout is made again when one of these changes (the view's scale and centre to a pixel, the free space, the numbers the names show, the size of the
  // text, the cards): kept lists, written and compared in place. The two strings are the geometry's and the cards' own keys.
  const LKN = new Float64Array(32), LKP = new Float64Array(32);
  let lkGeo = null, lkBlock = null, lkValid = false;
  function layoutKeyChanged() {
    const m = model;
    let n = 0;
    LKN[n++] = Math.round(VW.k * 1000); LKN[n++] = Math.round(VW.C[0]); LKN[n++] = Math.round(VW.C[1]);
    LKN[n++] = Math.round(VW.f.l); LKN[n++] = Math.round(VW.f.t); LKN[n++] = Math.round(VW.f.r); LKN[n++] = Math.round(VW.f.b);
    LKN[n++] = Math.round(VW.fe.l); LKN[n++] = Math.round(VW.fe.t); LKN[n++] = Math.round(VW.fe.r); LKN[n++] = Math.round(VW.fe.b);
    for (let i = 0; i < VW.ins.length; i++) LKN[n++] = Math.round(VW.ins[i]);
    LKN[n++] = Math.round(S.lum * 1000); LKN[n++] = S.act > 0.5 ? 1 : 0; LKN[n++] = Math.round(S.por * 20); LKN[n++] = m.hide ? 1 : 0;
    LKN[n++] = Math.round(m.P2 * 10); LKN[n++] = Math.round(m.lymph * 10); LKN[n++] = Math.round(m.lyProt * 100); LKN[n++] = Math.round(m.P1 * 10); LKN[n++] = Math.round(m.P3 * 10);
    LKN[n++] = phoneMQ.matches ? 1 : 0; LKN[n++] = Math.round(labelK() * 1000);
    let same = lkValid && lkGeo === geoKey && lkBlock === blockKey();
    for (let i = 0; same && i < n; i++) if (LKN[i] !== LKP[i]) same = false;
    if (same) return false;
    for (let i = 0; i < n; i++) LKP[i] = LKN[i];
    lkValid = true; lkGeo = geoKey; lkBlock = blockKey();
    return true;
  }
  let descValid = false;   // the sentence's numbers: kept in DN, compared with DP
  const DN = new Float64Array(8), DP = new Float64Array(8);
  function descChanged() {
    const m = model;
    DN[0] = Math.round(S.por * 4); DN[1] = S.col > 0.15 ? 1 : 0; DN[2] = S.act > 0.4 ? 1 : 0; DN[3] = m.hide ? 1 : 0; DN[4] = Math.round(m.P2); DN[5] = Math.round(m.lymph * 10); DN[6] = Math.round(m.lyProt * 100);
    let same = descValid;
    for (let i = 0; same && i < 7; i++) if (DN[i] !== DP[i]) same = false;
    if (same) return false;
    for (let i = 0; i < 7; i++) DP[i] = DN[i];
    descValid = true;
    return true;
  }
  let lastKey = '', gpuKey = '', settled = false;   // settled: paused, nothing easing, the same picture as last frame
  // dt: the traffic's step (capped, so a long frame never jumps the cells along); ease: the time the eases step by, the
  // real time since the last frame (an exponential ease takes any step, so a slow frame settles as soon as a fast one would).
  function draw(dt, run = true, paint = true, ease = dt) {
    settled = false;
    const [W, H] = hostSize();
    ensureGeo(W, H);
    if (ease > 0 || S.lum == null) stepState(ease);
    const gliding = stepView(ease);
    go += ((isPaused() ? 0 : 1) - go) * (ease > 0 ? 1 - Math.exp(-ease / 0.25) : 0);
    if (go < 0.002) go = 0;
    if (run && dt > 0 && go > 0) stepMovers(dt * go);
    if (!paint) return;
    if (svWant != null && gpu && open && !dive) svSwap();
    const dpr = Math.min(saver() ? 1 : 2, devicePixelRatio || 1) * svScale() * zres;   // (Battery saver: one pixel per CSS pixel; zres: a card's zoom landed, sharpen)
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && darkMQ.matches);
    // The names are laid out where the view will rest, during the zoom too (hidden until it lands), so the end arrows
    // the shader draws are in place from the first frame and nothing moves when the names fade in.
    const lkNew = layoutKeyChanged();
    // (A name still on its way to a place the layout moved it to is laid out again next frame, until it has arrived.)
    askRest();
    if (lkNew || lastKey === '' || layoutBusy || sizedNew) {
      lastKey = 'laid'; layoutBusy = false; sizedNew = false;
      layoutEnds(); layoutTags();
      if (noteJumps()) layoutTags();   // (laid out again from where the names stood, so the frame they move in shows no step)
      settleJumps();
      declutter();
      putCaps();
    }
    fenTick();
    if (gpu) {
      const u = palette(dark);
      if (cssMiss || cssStale) { askRest(); settled = false; return; }   // (its colours read between frames first: this frame is not painted)
      const endA = ENDA;
      endA[0] = endShown('in'); endA[1] = endShown('out');
      const e0 = Math.round(endA[0] * 100), e1 = Math.round(endA[1] * 100);
      const n0 = cap.on ? Math.round((cap.at('in', easeNow())?.a ?? 0) * 100) : -1, n1 = cap.on ? Math.round((cap.at('out', easeNow())?.a ?? 0) * 100) : -1;
      if (ekA !== e0 || ekB !== e1 || nkA !== n0 || nkB !== n1) { ekA = e0; ekB = e1; nkA = n0; nkB = n1; endKey = endArrowsText(endA); nameKey = cap.on ? namesText(n0, n1) : ''; attrSoon(); }   // (for the browser checks: how much each end arrow shows; written between frames; the text is made when a share changes)
      // Device px ↔ local µm.
      const { C, k, ca, sa } = CAM, K = k * dpr;
      set3(u.uI0, ca / K, sa / K, -(C[0] * ca + C[1] * sa) / k);
      set3(u.uI1, -sa / K, ca / K, (C[0] * sa - C[1] * ca) / k);
      set3(u.uF0, K * ca, -K * sa, dpr * C[0]); set3(u.uF1, K * sa, K * ca, dpr * C[1]);
      u.uPx = 1 / K; u.uK = K; u.uKs = Math.min(K, 12 * dpr);   // (the particles no larger than on a phone)
      u.uLum = UM.lum * S.lum; u.uPinch = S.pinch; u.uXs = geo.xs; u.uXk = geo.xk; u.uKy = halfW(geo.xk); u.uHscA = wallIn(geo.xs) + disseW(geo.xs) * 0.5 + 0.8;
      u.uCol = S.col; u.uBm = S.bm; u.uMv = S.mv; u.uAct = S.act; u.uPor = S.por; u.uFlow = flowX; u.uLym = lymX; u.uLyF = clamp(0.32 * S.filt ** 1.5, 0.06, 1.75); u.uDir = Math.sign(S.v || 1);
      set4(u.uEnd, END[0], END[1], END[2], 0.95); u.uEndA = endA;
      // The zoom from the lobule: one camera move. The lobule (magnified by the compositor) carries it most of the way;
      // the view, already drawn where the lobule's own sinusoid is, comes in over all of it at once as the zoom lands
      // (no strip that appears and then lengthens), and its detail (fenestrae, microvilli, cells, traffic) resolves last.
      // Both follow the zoom's eased progress, so Back to Lobule plays the same frames in reverse.
      if (dive) {
        const g = dive.g;
        set4(u.uRev, 0, 0, 0, 0);
        u.uAll = smooth(0.5, 0.88, g);
        u.uDet[0] = smooth(0.72, 1, g); u.uDet[1] = 1e5;
        u.uFocus = smooth(0.82, 1, g);   // (the page shows around it only once it has landed, not as a band while it is small)
      } else { set4(u.uRev, 1, -1e5, 1e5, 1e5); u.uAll = 1; u.uDet[0] = 1; u.uDet[1] = 1e5; u.uFocus = 1; }
      spriteDt = Math.max(0, dt) * go;
      const n = sprites();
      // Paused and settled (nothing eases, no zoom): the same picture as last frame, so the two full-screen passes are skipped.
      const sameAsLast = go === 0 && !dive && !svFade && pictureSame(u, n);
      if (!sameAsLast) { gpu.draw(u, pts, n); noteDraw('sinusoid-view'); svYield?.drew(performance.now()); } else settled = true;
      gpuKey = go === 0 && !dive && !svFade;
      if (svFade) svFadeStep();
    }
    // (Not settled while the view is still gliding to the space the cards left, or a name to its place: the loop must not go to
    // sleep with the glide half done, which a paused simulation did.)
    if (gliding || layoutBusy) settled = false;
    svMoving = gliding || layoutBusy;   // (its names gliding to their places: the corner credit looks again, credit.js)
    if (!svMoving && !cap.moving()) domSoon();   // (the page's model placed between frames once the names rest; nothing written when they did not move)
    if (descChanged()) { descWant = describe(); attrSoon(); }
  }
  // (The canvas's words for screen readers and its end arrows' mark for the browser checks: written between frames, never in one.)
  let endKey = '', nameKey = '', descWant = '', attrAsk = 0;
  const attrSoon = () => { if (!attrAsk) attrAsk = restPass(writeAttrs); };
  function writeAttrs() {
    attrAsk = 0;
    if (canvas.dataset.endArrows !== endKey) canvas.dataset.endArrows = endKey;
    if (nameKey && canvas.dataset.endNames !== nameKey) canvas.dataset.endNames = nameKey;   // (how much the GPU shows each end's name)
    if (descWant && canvas.getAttribute('aria-label') !== descWant) canvas.setAttribute('aria-label', descWant);
  }
  // The picture as drawn last: its size, the uniforms and the sprites, in kept lists. Whether this frame's is the same.
  let SIG = new Float64Array(256), SIGP = new Float64Array(256), sigN = 0, sigOk = false, sigW = 0, sigH = 0, sigEpoch = -1, sigCount = -1;
  function pictureSame(u, n) {
    let c = 0;
    for (const key in u) {
      const v = u[key];
      if (typeof v === 'number') { if (c >= SIG.length) growSig(); SIG[c++] = v; } else for (let i = 0; i < v.length; i++) { if (c >= SIG.length) growSig(); SIG[c++] = v[i]; }
    }
    let same = gpuKey && sigOk && sigW === canvas.width && sigH === canvas.height && sigEpoch === gpu.epoch && sigCount === n && sigN === c;
    for (let i = 0; same && i < c; i++) if (SIG[i] !== SIGP[i]) same = false;
    if (same) return true;
    const T = SIGP; SIGP = SIG; SIG = T;   // (this frame's becomes the last)
    sigN = c; sigOk = true; sigW = canvas.width; sigH = canvas.height; sigEpoch = gpu.epoch; sigCount = n;
    return false;
  }
  function growSig() {   // alloc-rare: more uniforms than ever before, once
    const a = new Float64Array(SIG.length * 2), b = new Float64Array(SIG.length * 2); // alloc-rare: the picture signature grows once, when more uniforms than ever before appear
    a.set(SIG); b.set(SIGP); SIG = a; SIGP = b;
  }
  const ENDA = [0, 0];
  let ekA = -1, ekB = -1, nkA = -2, nkB = -2;
  function namesText(a, b) { return (a / 100).toFixed(2) + ' ' + (b / 100).toFixed(2); }   // alloc-rare: only when a name's share changed
  function endArrowsText(a) { return a[0].toFixed(2) + ' ' + a[1].toFixed(2); }   // alloc-rare: only when an end arrow's share changed
  function set3(a, x, y, z) { a[0] = x; a[1] = y; a[2] = z; }
  function set4(a, x, y, z, w) { a[0] = x; a[1] = y; a[2] = z; a[3] = w; }
  function describe() {
    const m = model;
    const parts = [`A sinusoid, cut along its length${m.hide ? '' : `, at ${fmt(m.P2, 1)} millimeters of mercury`}.`]; // alloc-rare: the screen-reader sentence is built only when the numbers it names change (descChanged)
    parts.push(S.por > 0.75 ? 'Its lining is fenestrated: plasma and its proteins pass through the open pores into the space of Disse.'
      : S.por > 0.25 ? 'Many of its fenestrae have closed: less protein gets through.' : 'Its fenestrae have closed: the wall is sealed, and protein is turned back.');
    if (!m.hide) parts.push(`Hepatic lymph ${fmt(m.lymph, 1)} milliliters per minute, flowing back along the space of Disse toward the portal triad, with ${Math.round(m.lyProt * 100)} percent of plasma protein.`); // alloc-rare: the screen-reader sentence is built only when the numbers it names change (descChanged)
    if (S.col > 0.15) parts.push('Collagen fills the space of Disse and the hepatocytes have lost their microvilli.');
    parts.push(S.act > 0.4 ? 'The stellate cell is activated: no vitamin A droplets, contracted, laying down collagen.' : 'The stellate cell is quiescent, full of vitamin A droplets.');
    return parts.join(' '); // alloc-rare: the screen-reader sentence is built only when the numbers it names change (descChanged)
  }
  // Drawn on every frame the screen offers, like the lobule's flow (15 a second in Battery saver); the zoom from the
  // lobule draws every frame, in step with it. Paused and settled, the loop stops asking for frames, as the figure
  // does: a new model, the zoom, the store (Play) wake it, and it looks again four times a second in case a change came
  // by a path that does not.
  let lastPaint = 0, sleepT = 0;
  const FRAME_OUT = { x: 0, y: 0, ang: 0, k: 0, lumen: 0 };   // (frame(): one kept record, read at once by its caller)
  const wake = () => { if (shown > 0 && !raf && model) raf = nextFrame(loop); };
  onSized = wake;
  store.on('*', wake);
  addEventListener('pps:occ', wake);   // (the room the cards leave changed: the view starts gliding to it at once, asleep or not)
  function loop(now) {
    raf = 0;
    if (shown <= 0 || !model) return;
    if (!dive && !drewNow && now - lastPaint < paceMs()) { raf = nextFrame(loop); return; }
    if (svYield && !dive && !drewNow && !svYield.ready(now)) { raf = nextFrame(loop); return; }   // (the zoom: drawn by place())
    lastPaint = now;
    const el = (now - (last || now)) / 1000; last = now;
    // (While the zoom runs, place() has already drawn this frame in step with the lobule.)
    draw(Math.min(0.1, el), !reduce.matches, !drewNow, el);   // (the wall's traffic eases to a stop while the clock is paused, and picks up again on resume)
    drewNow = false;
    if (settled && go === 0 && isPaused()) { last = 0; clearTimeout(sleepT); sleepT = setTimeout(wake, 250); return; }   // (on waking, the first frame steps nothing)
    raf = nextFrame(loop);
  }

  return {
    el,
    /** What the GPU's names drew in the last frame that landed ({ seq, gen, w, h, items }, caption-gl.js snapshot: CSS px from the names' canvas corner), for the browser checks. */
    captions: () => cap.snapshot(),
    /** A tap at client (x, y): the key of the explainable name the GPU drew there, or null (N4, label-explain.js). The tap's own read: no frame is running. */
    explainHit(x, y) {
      const snap = cap.snapshot(), r = boxOf(labels);
      for (const it of snap.items) { it.x += r.left; it.y += r.top; }
      const hit = hitLabel(snap.items, x, y, 8, (k) => !!SV_NOTE[k] && !!regions[k]);
      return hit ? { key: hit.key, target: `sinusoid:${SV_TARGET[hit.key] || hit.key}` } : null;
    },
    setExplain(key) { exKey = key; },
    /** A card's zoom (lobule-zoom.js zoomAt, card-zoom-plan.md): the view's picture and its names and leaders are carried by one camera, a point p drawn at
     *  k p + (e, f) (CSS px from the stage's corner), the names keeping their size. Nothing is laid out again. (1, 0, 0) gives it up. False: not the shared picture. */
    camera(k, e, f, r = 0) {
      if (!shareTop || !gpu || gpu.lost) return false;
      zk = k; ze = e; zf = f; if (r > 0) zr = r;
      cap.view(k, e, f);
      shareTop.present();
      return true;
    },
    /** A card's zoom has landed (on) or is going (off): the picture is drawn at k times the density, the same geometry and layout, so what the camera carries
     *  is sharp. Capped so the canvas is no more than 3 device px per CSS px. */
    sharpen(on) {
      const base = Math.min(saver() ? 1 : 2, devicePixelRatio || 1) * svScale();
      const z = on ? Math.max(1, Math.min(zk, 3 / (base || 1))) : 1;
      if (z === zres) return;
      zres = z; gpuKey = ''; wake();
    },
    get cameraReady() { return !!shareTop && !!gpu && !gpu.lost; },
    /** The glasses over the names (stage.js, glass-gl.js tellHoles): the names under them are left out. */
    setHoles: (list) => cap.holes(list),
    /** The canvas the cards' frosted glass is drawn into while the sinusoid is open and still (lobule-zoom.js glassHost), else null. */
    glassHost() {
      if (!gpu || gpu.lost || !open || shown < 1 || dive || !canvas.width || !canvas.height) return null;
      if (shareTop) { const f = shareTop; return { gl: f.gl, canvas: f.canvas, add: f.add, warmIn: f.warmIn, now: () => { f.present(); }, seq: () => gpu.drawSeq, onPicture: (fn) => gpu.onPicture(fn) }; }
      return { gl: gpu.top.gl, canvas, add: gpu.top.add, warmIn: gpu.top.warmIn, now: () => { gpu.present(); }, seq: () => gpu.drawSeq, onPicture: (f) => gpu.onPicture(f) };
    },
    /** The lobule's model (lobuleState), each time it changes. */
    setModel(m) { ensureGpu(); model = m; if (shown > 0 && !raf) raf = nextFrame(loop); },
    /**
     * Placement during the zoom from the lobule (lobule-zoom.js): opacity; the zoom's state, if it is
     * running (`dive`: g, its eased progress; p, the lobule's sinusoid point on screen at rest; q, the zoom's
     * fixed point; rot and Z, the full turn and scale; run, how far the vessel runs straight each way, in
     * lumen radii); whether it is fully open (takes input).
     */
    place({ opacity, dive: dv = null, isOpen = false }) {
      if (opacity > 0) ensureGpu();
      const was = shown;
      shown = opacity; dive = dv;
      el.style.opacity = opacity;
      el.style.visibility = opacity > 0 ? 'visible' : 'hidden';
      restClass(el, 'sv-live', opacity > 0);   // (its compositor layer only while it is shown)
      open = isOpen;
      restClass(el, 'on', isOpen);
      restAttr(el, 'aria-hidden', isOpen ? 'false' : 'true');
      // Closed: the drawing buffer is given back (it is sized again on the way in).
      if (opacity <= 0 && was > 0) { svFadeEnd(); canvas.width = 0; canvas.height = 0; gpuKey = ''; if (shareTop) { gpu?.free?.(); shareTop.present(); } }
      else if (shareTop && opacity > 0 && !model) shareTop.present();
      if (opacity > 0 && was <= 0) {
        svK = renderScale(); svWant = null;   // (Figure resolution, as it is now: taken up as it opens)
        last = 0; lastKey = ''; VW.k = 0; movers.length = 0; spawnAcc = 0; bounceAcc = 0;
        for (const o of [...slid(), ...Object.values(regions)]) if (o) { o.sd = 0; o.pt = null; o.tx = null; }   // alloc-rare: once, as the view opens
        if (model) {
          for (const k in S) delete S[k];
          // Arrive with the wall already at work: a few seconds of traffic run before the first frame.
          draw(0, false);
          for (let i = 0; i < 40; i++) stepMovers(0.1);
        }
      }
      // Drawn now, in step with the lobule's transform this frame (not a frame later), on a software renderer too.
      if (opacity > 0 && model) { draw(0, false); drewNow = true; }
      if (opacity > 0 && !raf && model) raf = nextFrame(loop);
    },
    /** Where the sinusoid's centre is drawn at rest (stage px), its direction (radians) and the lumen's width there (px). */
    frame() {
      const [W, H] = hostSize();
      ensureGeo(W, H);
      if (model && S.lum == null) stepState(0);
      FRAME_OUT.x = VW.tC[0]; FRAME_OUT.y = VW.tC[1]; FRAME_OUT.ang = geo.ang; FRAME_OUT.k = VW.tk; FRAME_OUT.lumen = 2 * UM.lum * (S.lum ?? 1) * VW.tk;
      return FRAME_OUT;
    },
    isOpen: () => open,
    /** The view's figure → stage px as an affine { a, b, c, d, e, f } (the ink's, ink-gl.js): written into o, true while the view rests open. */
    xform(o) { if (!open || !geo) return false; const ca = Math.cos(geo.ang), sa = Math.sin(geo.ang); o.a = VW.k * ca; o.b = VW.k * sa; o.c = -VW.k * sa; o.d = VW.k * ca; o.e = VW.C[0]; o.f = VW.C[1]; return true; },
    /** Where the GPU draws a name now (stage px: its box's centre; the legend's top left), by its key ('sin', 'fen', 'in', …, 'legend'). */
    captionAt(key) { if (key === 'legend') return [LEG.x, LEG.y]; const c = cap.at(key); return c ? [c.x, c.y] : null; },
    /** Whether its names are gliding to new places this frame (the corner credit's look, credit.js). */
    labelsMoving: () => open && svMoving,
    get available() { return gpuTried ? !!gpu : sinusoidSupported(); },
  };
}
