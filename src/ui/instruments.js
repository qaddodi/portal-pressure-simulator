// Instruments (blueprint §8.3, §9.4, §9.5, §6.4): endoscopy,
// varix cross-section, abdomen.

import { NODES } from '../engine/topology.js?v=4044766e96';
import { gastricUp } from '../engine/scenario.js?v=d2669cef9b';
import { wallRead } from '../engine/wall-read.js?v=09449acd01';
import { pressureColor } from './colormap.js?v=687b52d514';
import { h, fmt, canvasSize, cssVar, cssAlpha, clamp, icon, swapText, putText, countTo } from './util.js?v=5c99534b1f';
import { wordSetter } from './gl-words.js?v=178edb3e7e';
import { simTime, isPaused } from './clock.js?v=cc9a38ce08';
import { createEndoGL } from './endo-gl.js?v=69745b7ca2';
import { surface } from './gpu-surfaces.js?v=2af17044e7';
import { renderEndo } from './endo-render.js?v=4ac032f5bf';
import { endoGrow, airRatio, airFlat } from './endo-size.js?v=e0a58bf20e';
import { DEFLATE_MS, BAND_MS, BAND_DELAY_MS, fadeIn, glide, scopeTear } from './endo-motion.js?v=ea7ccb902e';
import { drawScopeBleed } from './endo-bleed.js?v=a25732b4de';
import { poolFill } from './blood.js?v=a70439097a';
import { FONT } from './charts.js?v=b0b27d779d';
import { store, updateParams, varicesPresent } from './store.js?v=2ac7b3a9d2';
import { classSoon, attrSoon, dataSoon, propSoon } from './class-soon.js?v=97b9d0e0db';
import { balanceHold, balanceLine } from './balance-hold.js?v=1792704e7a';
import { lateFrameFor, cancelFrame, framePhase, easeNow } from './frame.js?v=1d147c7c9a';
import { restPass } from './rest-pass.js?v=d13e397f0b';
import { createTraceGL, fitPen } from './trace-gl.js?v=516ddfbcc9';
import { createSvgGL, svgModel, setWords, wordsOf } from './svg-gl.js?v=c37cd9a50a';
import { textWidth } from './text-gl.js?v=96ad9e26a5';
import { D_SURFACE, easeArrive } from './ease.js?v=7513a88c68';
import { inkBox } from './glyph-measure.js?v=d1e89aeb28';
// (The endoscope's field: drawn in the late part of a frame, after the model's frame of it has been taken in, so once a frame.)
const drawFrame = lateFrameFor('instruments');

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));

// ── Endoscopy ───────────────────────────────────────
export function createEndoscopy({ onAction }) {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'endoscopy' });
  const box = h('div', { class: 'chart-box square' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Endoscopic view' });
  box.append(cv);
  const view = 'eso'; // the esophageal variceal view only
  // The position is a caption under the view, never over it.
  const stage = h('div', { class: 'endo-stage' }, box, h('span', { class: 'endo-pos' }, 'Distal esophagus · 36 cm'));
  const bandBtn = h('button', { class: 'btn primary', onclick: () => onAction({ kind: 'band' }) }, icon('band'), 'Band a column (EVL)');
  // The readings: the bands placed lead, then the grade, size and wall side by side,
  // and the stigmata as a chip. Built once; each frame only changes text, widths and states.
  const dd = (cls) => h('dd', { class: cls });
  // (The grade is its word alone, Small or Large: the code slot stays empty, which the styles already lay out as "None" was.)
  const gradeLabel = h('span');
  const grade = h('dd', { class: 'endo-grade' }, h('b'), gradeLabel);
  const diam = dd('endo-num'), wall = dd('endo-num'), red = dd('endo-chip-v'), bands = dd('endo-chip-v');
  const redWord = h('span'), redMore = h('span', { class: 'endo-more' });   // (the sign, then its detail: a slide's compact row shows the sign alone)
  red.append(redWord, redMore);
  const item = (cls, ...kids) => h('div', { class: cls }, ...kids);
  // The three pressures of a lesson slide (the readings option, configure below): they join the list after the wall, in the same tiles.
  const pIn = dd('endo-num'), pLum = dd('endo-num'), pAcross = dd('endo-num');
  const pRows = [
    h('div', { class: 'endo-tile endo-pr', title: 'The pressure inside the varix.' }, h('dt', {}, 'In the varix'), pIn),
    h('div', { class: 'endo-tile endo-pr', title: 'The pressure of the air in the esophagus around the varix (simulated).' }, h('dt', {}, 'Lumen'), pLum),
    h('div', { class: 'endo-tile endo-pr', title: 'The pressure inside the varix less the pressure in the lumen: what stretches the wall.' }, h('dt', {}, 'Across the wall'), pAcross)];
  const stats = h('dl', { class: 'endo-read' },
    item('endo-chip', h('dt', {}, 'Bands', h('span', { class: 'endo-dt-x' }, ' placed')), bands),
    h('div', { class: 'endo-g', title: 'Small, <5 mm; Large, ≥5 mm.' }, h('dt', {}, 'Grade'), grade),
    item('endo-tile', h('dt', {}, 'Diameter'), diam),
    item('endo-tile', h('dt', {}, 'Wall', h('span', { class: 'endo-dt-x' }, ' thickness')), wall),
    h('div', { class: 'endo-chip endo-red', title: 'In the model, red wale marks and cherry spots show once the wall stress passes 70% of its tear point.' }, h('dt', {}, 'Stigmata'), red));
  const side = h('div', { class: 'chart-side' }, stats, bandBtn);
  el.append(stage, side);
  // (The readings change with the model: drawn on the GPU while they change, gl-words.js.)
  const set = wordSetter([gradeLabel, diam, wall, pIn, pLum, pAcross, redWord, redMore, bands]);
  function update(f) {
    const m = f.metrics;
    const vx = view === 'eso' ? m.varix : m.gastricVarix;
    const noVx = !varicesPresent(f, view === 'eso' ? 'VAR' : 'GV');
    propSoon(bandBtn, 'disabled', noVx); bandBtn.title = noVx ? 'No varices to band' : '';
    set(gradeLabel, vx.grade.label);
    dataSoon(grade, 'sev', vx.grade.label === 'Small' ? 'caution' : vx.grade.label === 'None' ? 'ok' : 'danger');
    // The size seen: the size at rest (the slide's own number when there is one) at the air's pressure (airRatio, the beat-averaged table).
    // The grade above stays the size at rest.
    const pinTo = view === 'eso' && pinned, rest = pinTo && Number.isFinite(pinned.d) ? pinned.d : vx.d, inV = pinTo && Number.isFinite(pinned.ptm) ? pinned.ptm : vx.ptm;
    set(diam, `${fmt(rest * airRatio(mv?.air ?? vx.air, opt.air), 1)} mm`); set(wall, `${fmt(vx.w, 1)} mm`);
    if (opt.readings) { set(pIn, `${fmt(inV, 1)} mmHg`); set(pLum, `${fmt(opt.air, 1)} mmHg`); set(pAcross, `${fmt(inV - opt.air, 1)} mmHg`); }
    const redV = !vx.present ? 'None' : (opt.red ?? vx.redWale) ? 'Red wale, cherry spots' : 'None';
    set(redWord, redV === 'None' ? redV : 'Red wale'); set(redMore, redV === 'None' ? '' : ', cherry spots'); dataSoon(red, 'long', redV === 'None' ? null : ''); dataSoon(red.parentNode, 'on', String(redV !== 'None'));
    const nb = String(Math.round(f.bands || 0));
    set(bands, nb); dataSoon(bands.parentNode, 'on', String(nb !== '0'));
    // A model frame taken in at the start of a frame is drawn by the field's own late callback of that frame (one already asked
    // for by an ease, or one asked now): the field is drawn once a frame, with the newest state. Anywhere else, at once.
    if (framePhase() === 'early') { last = { f, vx }; if (!raf) raf = drawFrame(() => { raf = 0; if (last) draw(last.f, last.vx); }); return; }
    draw(f, vx);
  }
  // Rendered endoscopic view (see endo-render.js): a per-pixel 3D shading of the lumen with raised,
  // winding varices, drawn once per state into a cached bitmap, so it is perfectly steady. Balloon,
  // bleeding and the scope mask are drawn on top.
  // The shader's WebGL context is made when the scope is about to show (shown(true) from the dock, or the first field drawn) and given
  // back when its tab leaves the screen (shown(false)): a page holds only so many (iOS Safari about 16, dropping the oldest, which is
  // the figure's). The picture on the page is the drawer's texture, so nothing blanks; the shader is made afresh, through gl-compile.js,
  // on the way back.
  const mkGl = () => createEndoGL({ onBack: () => { if (!raf) raf = drawFrame(() => { raf = 0; if (last) draw(last.f, last.vx); }); } });
  let gl = null, wasGl = false, glGone = false, noGl = false, away = false;   // (wasGl: which renderer drew the field last, so a change between them fades; glGone: the context was given back, not failed; away: the tab is off the screen)
  function needGl() {
    if (gl || noGl || away) return;
    gl = mkGl();
    if (!gl) noGl = true; else if (glGone) { glGone = false; glKey = ''; }
  }
  // The scope's picture is laid by the GPU's chart drawer over this canvas (trace-gl.js): the field as a texture (taken from the shader's
  // canvas, GPU to GPU, once per state), the old one under it while the new fades in, the balloon, the bleed and the rim, clipped to the
  // lumen. Nothing is drawn on a 2D canvas (1 Nov: nothing off the GPU); ?tracegl=0 draws the overlays on this canvas and leaves the field out.
  const pen = createTraceGL(cv, { redraw: () => { painted = ''; if (last) draw(last.f, last.vx); } });
  let glVer = 0, swap = false;   // (glVer: the shader canvas's content, counted; swap: the field shown is kept as the old one before the new goes up)
  // (The ?perf surfaces list, gpu-surfaces.js: read by the readout only.)
  const offSurface = surface('endoscopy field', () => (!cv.isConnected ? null : gl && !gl.lost ? { on: cv.style.opacity === '0' ? 'gpu' : 'mixed', via: 'shaded WebGL2 once per state, laid by the GPU drawer' } : { on: 'fallback', via: 'CPU shading, laid by the GPU drawer', why: gl ? 'context lost' : 'no WebGL2, or its shader failed' }));
  let peak = 0, peakRed = 0, an = null, lastT = 0, last = null, raf = 0, bleedLast = null, poolA = 0, cache = { key: '', img: null }, glKey = '', painted = '', mv = null, held = null, pinned = null;
  // A slide's options for this scope (configure, below): air, the air's pressure in the lumen in mmHg (the varix is drawn and measured as it is seen
  // at that pressure; the grade, the pressure inside it and the model are not touched); red, true or false (the red wale marks shown or hidden whatever
  // the wall stress; absent: the model's rule); readings, three more rows (the pressure in the varix, in the lumen and across the wall).
  const opt = { air: 0, red: null, readings: false };
  const dark = matchMedia('(prefers-color-scheme: dark)'), still = matchMedia('(prefers-reduced-motion: reduce)');
  // The field as it showed before it last changed (the drawer's texture 'old'), the new one fading in over it from fadeT0
  // (endo-motion.js); the balloon's and the jet's strength (0..1) easing toward on or off. On the display clock, so a
  // paused model still finishes a fade.
  let fadeT0 = -1, shown = null, fadeA = 1, balA = 0, shutA = 0, jetA = 0, uiT = 0;
  // Before the field changes: the one on screen is kept as the old one (its texture moved, on the GPU) and the new fades in over it.
  function keep() {
    if (!shown || still.matches) { fadeT0 = -1; return; }   // (the first field: drawn as it is)
    swap = true; fadeT0 = performance.now();
  }
  // An eased tween toward a target value: cur follows from -> to over dur ms after a delay.
  const tw = (v) => ({ v, from: v, to: v, t0: 0, dur: 1, delay: 0, cur: v });
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function tween(t, target, now, dur, delay) {
    if (target !== t.to) { t.from = t.cur; t.to = target; t.t0 = now; t.dur = dur; t.delay = delay; }
    if (t.dur <= 1) { t.cur = t.v = t.to; return false; } // snap
    const k = Math.min(1, Math.max(0, (now - t.t0 - t.delay) / t.dur));
    t.cur = t.from + (t.to - t.from) * ease(k); t.v = t.cur;
    return k < 1 && t.cur !== t.to;
  }
  const offRun = store.on('running', () => { if (last && !isPaused()) draw(last.f, last.vx); });
  function draw(f, vx) {
    const { w, h: hh, W: cvW, H: cvH } = canvasSize(cv);
    if (w < 32 || hh < 32) return; // hidden/reflowing canvas: wait for its measured size
    // The field fills the box.
    const cx = w / 2, cy = hh / 2, R = Math.min(w, hh) / 2 - 4;
    const bands = Math.round(f.bands || 0);
    // Banding deflates the banded columns only. The model's single varix size falls as bands go on,
    // so unbanded columns keep the size seen before the first band.
    last = { f, vx };
    const now = simTime() * 1000, dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000)); lastT = now; // sim clock: frozen while paused
    // The field shows the varix over the beat, not each beat's swell: the model's size and wall stress rise and fall with every
    // heartbeat, and following them redrew the whole shaded field many times a second (a browser without a GPU spent a second on
    // each redraw and its page stopped answering), while the comment above promises a steady view. Averaged over about four seconds,
    // a breath and more: over one second the breath's swell still crossed the field's steps every second or two.
    const kb = 1 - Math.exp(-dt / 4);
    if (!mv) mv = { d: vx.d, ratio: vx.ratio, air: vx.air?.slice() };
    else {
      mv.d += (vx.d - mv.d) * kb; mv.ratio += (vx.ratio - mv.ratio) * kb;
      if (mv.air && vx.air) for (let i = 0; i < mv.air.length; i++) mv.air[i] += (vx.air[i] - mv.air[i]) * kb;
    }
    const gNow = endoGrow(mv.d); // (endo-size.js: a large varix, 5 mm or more, is drawn plainly large)
    // With air in the lumen the drawing flattens with the size seen (endo-size.js airFlat); with none, as it always was.
    const kAir = airRatio(mv.air, opt.air), gAir = gNow * airFlat(mv.d, kAir);
    peak = bands > 0 ? Math.max(peak, gAir) : gAir;
    const tg = peak, tv = bands > 0 ? 1 : clamp((mv.d * kAir - 2.5) / 1.0, 0, 1);
    // Stigmata follow the modeled wall stress: they start below the red-wale threshold (70 % of the
    // tear point) and are full near it. Unbanded columns keep what they showed before the first band.
    const rNow = clamp((mv.ratio - 0.55) / 0.35, 0, 1);
    peakRed = bands > 0 ? Math.max(peakRed, rNow) : rNow;
    const tr = opt.red == null ? peakRed : +opt.red;
    // Targets: each column is deflated and knuckled once banded (the 4 bands fill columns in turn).
    const defT = [0, 0, 0, 0], knT = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) {
      const nb = Math.floor(bands / 4) + (c < bands % 4 ? 1 : 0);
      defT[c] = nb > 0 ? 1 : 0;
      for (let k = 0; k < Math.min(nb, 4); k++) knT[c * 4 + k] = 1;
    }
    if (!an) {
      an = { g: tg, v: tv, r: tr, def: defT.map((x) => tw(x)), kn: knT.map((x) => tw(x)) };
      an.def.forEach((t, i) => { t.v = defT[i]; }); an.kn.forEach((t, i) => { t.v = knT[i]; });
    }
    // Size and presence follow the model continuously (critically damped, ~0.2 s); banding plays a
    // slower eased tween: the vein deflates first, the knuckle and band follow.
    const kf = 1 - Math.exp(-dt / 0.2);
    an.g += (tg - an.g) * kf; an.v += (tv - an.v) * kf; an.r += (tr - an.r) * kf;
    if (Math.abs(tg - an.g) < 0.0008) an.g = tg;
    if (Math.abs(tv - an.v) < 0.0008) an.v = tv;
    if (Math.abs(tr - an.r) < 0.0008) an.r = tr;
    let busy = an.g !== tg || an.v !== tv || an.r !== tr;
    // The banded vein starts deflating at once; its band cinches in from a wide loop a beat later (endo-motion.js).
    for (let c = 0; c < 4; c++) busy = tween(an.def[c], defT[c], now, DEFLATE_MS, 0) || busy;
    for (let i = 0; i < 16; i++) busy = tween(an.kn[i], knT[i], now, BAND_MS, knT[i] ? BAND_DELAY_MS : 0) || busy;
    if (busy && !raf && !isPaused()) raf = drawFrame(() => { raf = 0; if (last) draw(last.f, last.vx); });
    const res = clamp(Math.round(2 * R * (window.devicePixelRatio || 1)), 160, 480);
    let img;
    needGl();
    if (gl && !gl.ready() && !gl.lost) { gl.dispose(); gl = null; glKey = ''; noGl = true; }   // (its shader failed: the CPU renderer below, as with no WebGL)
    // (A lost context is not a failure: the CPU renderer draws the field while it is gone, and the GPU takes over again, with the new
    // field fading in over the old, when the browser gives it back and builds the shader afresh: endo-gl.js.)
    const onGl = !!gl && !gl.lost;
    if (onGl !== wasGl) { if (shown && gl) keep(); wasGl = onGl; }
    if (onGl) {
      // Drawn once per state and kept as a 2D bitmap: a steady field costs no shader pass or GPU readback.
      // (Size, presence and stigmata redraw once they have moved a step and a half of 32 from the field shown, so a slow drift
      // or the last of the beat's swell does not redraw it to and fro across one step; banding redraws at every step.)
      held = [an.g, an.v, an.r].map((x, i) => (held && Math.abs(x * 32 - held[i]) < 1.5 ? held[i] : Math.round(x * 32)));
      const gk = [res, ...held, ...[...an.def.map((t) => t.cur), ...an.kn.map((t) => t.cur)].map((x) => Math.round(x * 32))].join('|');
      // (A shader still compiling draws no new field: the one shown stays, and endo-gl's onBack asks for this frame again once it is published.)
      if (gk !== glKey && !gl.pending) {
        if (glKey) keep(); else fadeT0 = -1;
        glKey = gk;
        gl.render(res, { grow: an.g, vis: an.v, red: an.r, def: an.def.map((t) => t.cur), kn: an.kn.map((t) => t.cur) });
        gl.canvas.glVer = ++glVer;
        // (taken up by the drawer as a texture at once, while the shader's picture is there: GPU to GPU; the one shown kept as the old one
        // first. A drawer not ready yet has the field shaded again when it is.)
        if (pen?.ready) { if (swap) { pen.keepImage('field', 'old'); swap = false; } pen.upload(gl.canvas, 'field', glVer); } else glKey = '';
        dataSoon(cv, 'renders', String(cv._renders = (cv._renders || 0) + 1));   // (read by the browser checks: a steady field is not redrawn)
      }
      img = gl.canvas;
    } else {
      // No WebGL: the CPU renderer draws the target state without transitions.
      const r2 = Math.min(res, 300), gq = Math.round(tg * 14) / 14;
      const key = [r2, gq, bands, Math.round(tv * 10), Math.round(tr * 8)].join('|');
      if (cache.key !== key) { if (cache.img) keep(); }
      if (cache.key !== key) { cache = { key, img: renderEndo(r2, { grow: gq, bands, vis: tv, red: Math.round(tr * 8) / 8 }) }; cache.img.glVer = ++glVer; }
      img = cache.img;
    }
    // Nothing on the field changed since the last paint (the same bitmap, size, balloon and theme, no bleeding): it is left
    // as it is. It is asked for on every frame of the model, and a full repaint each time (a scaled bitmap and the rim) held
    // a phone's or a browser without a GPU's main thread for most of every frame.
    const bleedNow = !!(f.bleed?.active && f.bleed.site === 'VAR'), balloon = !!f.params?.balloonEso, shut = gastricUp(f.params || {}), root = document.documentElement;
    // (The last bleed seen: its jet and pool keep drawing from it while they fade out after the bleed stops.)
    if (bleedNow) bleedLast = { rate: f.metrics?.bleeding?.rate, total: f.bleed.total, hr: f.metrics?.vitals?.hr ?? f.metrics?.hr };
    // The new field fades in over the old; the balloon and the jet ease in and out (endo-motion.js). (The esophageal balloon, the tube's second
    // step, fills the view; the gastric one, the first, lies below it in the stomach and shows only as the jet easing out.)
    const tu = performance.now(), du = uiT ? Math.min(100, tu - uiT) : 0; uiT = tu;
    const poolT = bleedLast ? poolFill(bleedLast.total) : 0;
    // (The tube's gastric balloon, up and drawn against the cardia, presses the tear shut: the jet and pool ease out once it has filled, and come
    // back if it is let down while the model still bleeds. The model's own bleed ends a moment after it is on: engine.js BALLOON_SEAL_S.)
    if (still.matches) { fadeT0 = -1; balA = +balloon; shutA = +shut; } else { balA = glide(balA, +balloon, du); shutA = glide(shutA, +shut, du); }
    const bleeding = bleedNow && !(shut && shutA >= 1);
    if (still.matches) { jetA = +bleeding; poolA = poolT; }
    else { jetA = glide(jetA, +bleeding, du); poolA = poolA ? glide(poolA, poolT, du, 600) : poolT; }
    fadeA = fadeT0 < 0 ? 1 : fadeIn(tu - fadeT0);
    if (fadeA >= 1) fadeT0 = -1;
    shown = img;
    const moving = fadeT0 >= 0 || balA !== +balloon || shutA !== +shut || jetA !== +bleeding;
    if (moving && !raf) raf = drawFrame(() => { raf = 0; if (last) draw(last.f, last.vx); });
    if (!moving) uiT = 0;   // (the next ease starts from its first frame, not from the last one painted)
    const sig = [cvW, cvH, w, hh, onGl ? glKey : cache.key, balloon, shut, root.getAttribute('data-theme'), root.getAttribute('data-palette'), root.className, dark.matches].join('|');
    if (!bleeding && !moving && sig === painted) return;
    painted = bleeding || moving ? '' : sig;
    const p = fitPen(cv, pen), ctx = p.ctx, G = ctx.onGPU === true ? ctx.gpu : null;
    try {
    if (!G) painted = '';   // (no drawer: drawn again when it comes)
    ctx.clearRect(0, 0, w, hh);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    if (G) {
      if (swap) { G.keepImage('field', 'old'); swap = false; }   // (the CPU-shaded field: its pixels stay, so it goes up as it is drawn)
      if (fadeA < 1 && G.hasImage('old')) G.image(null, cx - R, cy - R, 2 * R, 2 * R, 1, 'old');
      G.image(onGl ? null : img, cx - R, cy - R, 2 * R, 2 * R, fadeA < 1 && G.hasImage('old') ? fadeA : 1, 'field', img.glVer || 0);
    }
    if (balA > 0) {
      const g = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.1, cx, cy, R * 0.85);
      g.addColorStop(0, cssVar('--scope-balloon-hi')); g.addColorStop(1, cssVar('--scope-balloon-lo'));
      ctx.globalAlpha = balA;
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 0.82, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = cssAlpha('--white', 0.5); ctx.lineWidth = 2; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (jetA > 0 && bleedLast) {
      // Active bleeding: blood spurting (or oozing) from the ruptured column, running down the wall and pooling in the
      // lowest part of the lumen (endo-bleed.js). On the model's clock, so a paused bleed holds still.
      // (the tear lies on the column as the field was last drawn)
      const tear = scopeTear(onGl && held ? held[0] / 32 : an.g);
      drawScopeBleed(ctx, { cx, cy, R, jx: cx + tear.x * R, jy: cy + tear.y * R, t: still.matches ? 0.3 : simTime(), a: jetA, rate: bleedLast.rate, fill: poolA, hr: bleedLast.hr });
    }
    if (jetA <= 0 && !bleeding) { bleedLast = null; poolA = 0; }
    ctx.restore();
    ctx.strokeStyle = cssVar('--scope-rim'); ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    } finally { ctx.end?.(); }
  }
  /** This slide's options (presenter-tools show and option): { air, red, readings } as described at opt above. Eased, never snapped: the drawing
   *  follows the new air through the same 0.2 s ease as any change of size, the red marks through theirs. */
  function configure(t) {
    const air = clamp(+t?.air || 0, 0, 20), red = typeof t?.red === 'boolean' ? t.red : null, readings = !!t?.readings;
    const changed = air !== opt.air || red !== opt.red || readings !== opt.readings;
    Object.assign(opt, { air, red, readings });
    if (readings) { if (pRows[0].parentNode !== stats) stats.lastElementChild.before(...pRows); } else for (const r of pRows) r.remove();
    el.toggleAttribute('data-readings', readings);   // (a slide's card lays them out in a row of their own, styles/app.css)
    if (changed && last) update(last.f);
  }
  // The slide's own numbers (presenter-tools pin): the size and the pressure in the varix the tiles and the words show, not the beat's swing.
  function pin(fp) {
    const P = fp?.at?.P;
    pinned = fp && Number.isFinite(fp.varix) ? { d: fp.varix, ptm: P ? P[NI.VAR] : NaN } : null;
    if (last) update(last.f);
  }
  // The dock says when this tab is on the screen. Off it, the context goes back; on it, the shader starts compiling now (published when
  // the driver is done), ahead of the first field.
  function shown_(on) {
    away = !on;
    if (!on) { if (gl) { gl.dispose(); gl = null; glKey = ''; glGone = true; } return; }
    if (!gl && !noGl) { needGl(); if (gl && last) { raf ||= drawFrame(() => { raf = 0; if (last) draw(last.f, last.vx); }); } }
  }
  return { id: 'endoscopy', label: 'Endoscopy', el, update, configure, pin, shown: shown_, setView() {}, dispose() { offRun(); cancelFrame(raf); raf = 0; gl?.dispose(); pen?.dispose(); last = null; offSurface(); } };
}

// ── Varix wall cross-section (L3) ───────────────────
// Scope's Wall mechanics tab: a cross-section of the esophagus with the varix in its wall, and Laplace's
// law as readings in the same tiles and meter as the scope view.
const WALL_SEV = { ok: 'Low', caution: 'High', danger: 'Near tear', critical: 'Rupture risk' };
// A name's ink as drawn (centred, baseline middle): the box round its glyphs' own ink, from the GPU atlas (glyph-measure.js inkBox: no
// canvas is drawn and read back). Names are placed by the ink itself, not their line box.
const inkRows = (font, t) => inkBox(t, font);
// How far a name's ink at (x, y) keeps from things round it, in px: inside a circle (its edge), outside one, from a box.
const inkIn = (rows, x, y, ox, oy, r) => Math.min(...rows.map(([t, b, l, rt]) => r - Math.hypot(Math.max(Math.abs(x + l - ox), Math.abs(x + rt - ox)), Math.max(Math.abs(y + t - oy), Math.abs(y + b - oy)))));
const inkOut = (rows, x, y, ox, oy, r) => Math.min(...rows.map(([t, b, l, rt]) => Math.hypot(Math.max(0, x + l - ox, ox - x - rt), Math.max(0, y + t - oy, oy - y - b)) - r));
const inkFrom = (rows, x, y, [bl, bt, br, bb]) => Math.min(...rows.map(([t, b, l, rt]) => {
  const dx = Math.max(bl - (x + rt), x + l - br), dy = Math.max(bt - (y + b), y + t - bb);
  return dx > 0 && dy > 0 ? Math.hypot(dx, dy) : Math.max(dx, dy);
}));
export function createVarixWall() {
  const geo = { k: '', R: 0, cy: 0, off: new Set() };   // (the picture's fitted size and the names left out at it, update below)
  const el = h('div', { class: 'dock-pane', 'data-pane': 'varixwall' });
  const box = h('div', { class: 'chart-box square' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Varix cross-section: transmural pressure stretches the varix wall' });
  box.append(cv);
  // (the cross-section drawn by the GPU's chart drawer over this canvas: trace-gl.js, ?tracegl=0 on the canvas)
  const wallGL = createTraceGL(cv, { redraw: () => { if (lastF) update(lastF); } });
  let lastF = null;
  const stage = h('div', { class: 'endo-stage' }, box, h('span', { class: 'endo-pos' }, h('span', { class: 'wall-cap' }, 'Laplace’s law: '), 'σ = ΔP · r / w'));
  const dd = (cls) => h('dd', { class: cls });
  const item = (cls, ...kids) => h('div', { class: cls }, ...kids);
  const stressTxt = dd('endo-stress-v'), stressFill = h('i'), stressBar = h('span', { class: 'endo-bar', 'aria-hidden': 'true' }, stressFill);
  // Each number with its unit in smaller type, so a long reading still fits a narrow tile. (Every reading has a unit line, an
  // empty one for the index, so a narrow Tests card can set each unit under its value and the values still share a line.)
  const num = (unit) => { const v = h('span'); const d = h('dd', { class: 'endo-num' }, v, h('small', {}, unit ? ' ' + unit : '')); d.v = v; return d; };
  // A narrow tile in the Tests card shows a name's short form ("ΔP", "Index"), so a name never breaks inside a word (a slide keeps the long one).
  const name = (long, short) => h('dt', {}, h('span', { class: 'wall-long' }, long), h('span', { class: 'wall-short' }, short));
  const ptm = num('mmHg'), rad = num('mm'), wal = num('mm'), idx = num('');
  // A slide's screen reads the stress as one number top left and its state top right (the pane keeps its sentence).
  const wPct = h('span'), wBig = h('b', { class: 'wall-big' }, wPct, h('small', {}, '%', h('span', { class: 'wall-of' }, ' of tear point'))), wSev = h('span', { class: 'wall-sev' });
  const stats = h('dl', { class: 'endo-read' },
    item('endo-g wall-law', h('dt', {}, 'Laplace’s law'), h('dd', { class: 'wall-formula' }, 'σ = ΔP · r / w')),
    item('endo-stress', name('Wall stress (model)', 'Wall stress'), stressTxt, wBig, wSev, stressBar),
    item('endo-tile', name('Transmural ΔP', 'ΔP'), ptm),
    item('endo-tile', h('dt', {}, 'Radius r'), rad),
    item('endo-tile', h('dt', {}, 'Wall w'), wal),
    item('endo-tile', name('Stress index', 'Index'), idx));
  const side = h('div', { class: 'chart-side' }, stats,
    h('div', { class: 'ctl-sub' }, 'A wider varix, higher transmural pressure and a thinner wall all raise the stress. Remodeling enlarges the varix and thins its wall over months; a balloon raises the pressure outside it.'));
  el.append(stage, side);
  // (The readings change with the model: drawn on the GPU while they change, gl-words.js.)
  const set = wordSetter([ptm.v, rad.v, wal.v, idx.v, stressTxt, wPct, wSev]);
  let wMean = null, wT = 0, wN = 0, wPin = NaN, wPinT = 0;
  // (A what-if or a time-lapse pins a new state every few frames: each eases into the last, so the figure does not flicker.)
  function pin(fp) {
    const x = fp?.wall, now = performance.now();
    wPin = !Number.isFinite(x) ? NaN : Number.isFinite(wPin) && now - wPinT < 1000 ? wPin + (x - wPin) * 0.35 : x;
    wPinT = now;
  }
  // (The card's type size for the picture's labels: read between frames, never in one; a new size draws again.)
  const readFs = () => { cv._fsAsk = 0; if (!cv.isConnected) return; cv._fsKey = cv._fsWant; const was = cv._fs; cv._fs = parseFloat(getComputedStyle(cv).fontSize) || 12; if (cv._fs !== was && lastF) update(lastF); };
  function update(f) {
    lastF = f;
    const v = f.metrics.varix;
    const wr = wallRead(v);   // (the index is worked out from the shown ΔP, r and w, so the tiles multiply out)
    set(ptm.v, wr.ptm); set(rad.v, wr.r); set(wal.v, wr.w); set(idx.v, wr.index);
    set(stressTxt, v.ratioShown > 1 ? 'above the tear point' : `${Math.round(v.ratioShown * 100)}% of the tear point`);
    const sev = v.ratioShown > 1 ? 'critical' : v.ratioShown > 0.7 ? 'danger' : v.ratioShown > 0.4 ? 'caution' : 'ok';
    dataSoon(stressBar, 'sev', sev);
    // (The stress swings with each beat and each breath: the number is its mean over the last several breaths, a plain
    // average while that many have not passed yet, so it reads steady and the same on every screen, folded or open.)
    const now = performance.now();
    if (wMean == null || now - wT > 3000) { wMean = v.ratioShown; wN = 1; } else { wN++; wMean += (v.ratioShown - wMean) * Math.max(1 / wN, 1 - Math.exp(-(now - wT) / 6000)); }
    wT = now;
    // (On a slide the figure is the slide's own, the state its tiles show (pin), so every screen reads the same number.)
    if (Number.isFinite(wPin)) wMean = wPin;
    const ms = wMean > 1 ? 'critical' : wMean > 0.7 ? 'danger' : wMean > 0.4 ? 'caution' : 'ok';
    set(wPct, String(Math.round(wMean * 100))); set(wSev, WALL_SEV[ms]);
    dataSoon(wSev, 'sev', ms); dataSoon(wBig, 'sev', ms);
    const wPctW = `${Math.round(clamp(v.ratioShown, 0, 1) * 1000) / 10 - 100}% 0px`;   // (slid in from the left inside its track: app.css .endo-bar i)
    if (stressFill.style.translate !== wPctW) stressFill.style.translate = wPctW;
    const pen = fitPen(cv, wallGL), ctx = pen.ctx;
    try { drawWall(ctx, pen.w, pen.h, v, f); } finally { ctx.end?.(); }
  }
  function drawWall(ctx, w, hh, v, f) {
    if (w < 32 || hh < 32) return;
    ctx.clearRect(0, 0, w, hh);
    // (On a slide the labels take the card's small size, so they never fall under 12 px; 12 px is the floor in the Tests card too.)
    // (The card's type size is read between frames, rest-pass.js, when the picture's size changes; drawn meanwhile at the last one read.)
    const onCard = !!cv.closest('.pz-tool'), fk = `${w}x${hh}`;
    if (onCard && cv._fsKey !== fk && !cv._fsAsk) { cv._fsWant = fk; cv._fsAsk = restPass(readFs); }
    const fs = onCard ? cv._fs || 12 : clamp((Math.min(w, hh) / 2 - 6) / 11, 12, 14);
    const f6 = FONT(600, fs), f5 = FONT(500, fs), inkT = inkRows(f6, 'σ');
    const cx = w / 2;
    // The varix and its marks for a picture of radius R round (cx, cy), at this beat's radius, wall and ΔP.
    // (most: the largest varix and ΔP the picture can show, which set its size, so the ring holds still through every beat)
    const parts = (R, cy, most) => {
      const Rl = R * 0.52, rr = most ? R * 0.3 : clamp(v.r * R * 0.05, 4, R * 0.3), vy = cy - Rl - rr * 0.25, lw = clamp((most ? Math.ceil(v.w * 10) / 10 : v.w) * R / 20, 1, 10);
      const ro = rr + lw / 2 + Math.max(5, R / 30), len = (most ? 30 : clamp(v.ptm, 0, 30)) / 30 * rr * 0.9 + 4;
      // σ beside the ΔP arrow's shaft, just right of its head; where it would sit on the wall's outline it rises until its
      // ink is 2 px or more clear of the line's soft edge (it follows the varix through the beat, so it never touches it).
      const tx = cx + (4 + R / 60) * 0.45 + 2 - Math.min(...inkT.map((q) => q[2]));
      let ty = vy - ro - fs * 0.75;
      if (inkIn(inkT, tx, ty, cx, cy, R - 1) < 2) for (let k = 0; k < 400 && inkOut(inkT, tx, ty, cx, cy, R + 1) < 2; k++) ty -= 0.25;
      const tTop = ty + Math.min(...inkT.map((q) => q[0]));
      return { Rl, rr, vy, lw, ro, len, tx, ty, top: Math.min(vy - Math.max(rr + lw / 2, ro + 2.5, rr + 3 + len + 1), tTop) };
    };
    // The wall stress's σ and the ΔP arrow rise above the varix at the top of the wall: the picture, its foot 6 px above the box's
    // foot (or lower, into those 6 px, where that is all it needs), is the largest whose σ and arrow ink at the largest varix
    // and ΔP stays 1 px or more inside the canvas (a 12 px T, the symbol before σ, had its crossbar cut). The ring is set once for the box, and only
    // the varix and its marks move with the beat.
    const gk = `${w}x${hh}x${fs}x${Math.ceil(v.w * 10)}`;
    if (geo.k !== gk) {
      const at = (R) => { const c0 = hh - 6 - R; return Math.min(hh - 1 - R, c0 + Math.max(0, 1 - parts(R, c0, true).top)); };
      const ok = (R) => parts(R, at(R), true).top >= 1;
      let lo = 20, hi = Math.min(w, hh) / 2 - 6;
      if (ok(hi)) lo = hi; else for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
      if (geo.k.split('x').slice(0, 3).join('x') !== gk.split('x').slice(0, 3).join('x')) geo.off.clear();
      Object.assign(geo, { k: gk, R: lo, cy: at(lo) });
    }
    const { R, cy } = geo;
    const { Rl, rr, vy, lw, ro, len, tx, ty } = parts(R, cy);
    // The wall: muscle outside, mucosa inside, the lumen in the middle.
    ctx.fillStyle = cssVar('--organ-stomach'); ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(cx, cy, R * 0.74, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = cssVar('--hairline'); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    ctx.fillStyle = cssVar('--surface'); ctx.beginPath(); ctx.arc(cx, cy, Rl, 0, 7); ctx.fill();
    // The varix in the submucosa at the top, bulging into the lumen; its size follows the model's radius.
    const rim = v.ratio > 0.7 ? cssVar('--danger') : cssVar('--text-2');
    // Transmural pressure pushes outward on the varix wall: longer arrows for a higher ΔP.
    ctx.strokeStyle = cssVar('--text-2'); ctx.fillStyle = cssVar('--text-2'); ctx.lineWidth = Math.max(1.25, R / 140);
    for (let a = -Math.PI; a < Math.PI - 0.01; a += Math.PI / 4) {
      const x0 = cx + Math.cos(a) * (rr + 3), y0 = vy + Math.sin(a) * (rr + 3), x1 = cx + Math.cos(a) * (rr + 3 + len), y1 = vy + Math.sin(a) * (rr + 3 + len);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      const hd = 4 + R / 60;
      ctx.beginPath(); ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - Math.cos(a - 0.45) * hd, y1 - Math.sin(a - 0.45) * hd); ctx.lineTo(x1 - Math.cos(a + 0.45) * hd, y1 - Math.sin(a + 0.45) * hd); ctx.fill();
    }
    ctx.fillStyle = pressureColor(f.P[NI.VAR]); ctx.beginPath(); ctx.arc(cx, vy, rr, 0, 7); ctx.fill();
    ctx.strokeStyle = rim; ctx.lineWidth = lw; ctx.stroke();
    // The radius, drawn across the varix.
    ctx.strokeStyle = cssAlpha('--white', 0.85); ctx.lineWidth = 1.25; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(cx, vy); ctx.lineTo(cx + rr, vy); ctx.stroke(); ctx.setLineDash([]);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // (A name that once misses at this size stays out until the size changes: r and the w label move with the beat, and a name
    // blinking in and out with it would read as a glitch.)
    const keep = (t, ok) => { if (!ok) geo.off.add(t); return !geo.off.has(t); };
    const drawn = [], gaps = {};
    const put = (t, font, x, y, g) => { ctx.font = font; ctx.fillText(t, x, y); drawn.push(t); gaps[t] = g; };
    // "r" just under the dashed radius, its ink 2 px or more clear of the dashes and 1 px or more inside the varix's fill;
    // on a small varix it moves in toward the centre, still under the dashes.
    const inkR = inkRows(f6, 'r'), rTop = Math.min(...inkR.map((q) => q[0])), rL = Math.min(...inkR.map((q) => q[2]));
    const ry = vy + 3.4 - rTop, dash = [cx, vy - 1.1, cx + rr, vy + 1.1];   // (the dashes' soft edge included)
    const rAt = (x) => ({ x, fill: inkIn(inkR, x, ry, cx, vy, rr - lw / 2 - 0.5), dash: inkFrom(inkR, x, ry, dash) });
    let rp = rAt(cx + rr / 2);
    if (rp.fill < 2) { const q = rAt(cx + 1.5 - rL); if (q.fill > rp.fill) rp = q; }
    ctx.fillStyle = cssVar('--white');
    if (keep('r', rp.fill >= 1 && rp.dash >= 2)) put('r', f6, rp.x, ry, { fill: rp.fill, dash: rp.dash });
    // Laplace's other two terms on the picture: the wall stress σ along the wall (two arrows pulling apart round the top,
    // heavier as the stress rises) and the wall thickness w across the rim (a bracket, in the faded label ink).
    const ink = cssVar('--text-3');
    ctx.strokeStyle = rim; ctx.fillStyle = rim; ctx.lineWidth = clamp(1.25 + 2.5 * clamp(v.ratio, 0, 1.2), 1.25, 4);
    for (const s of [-1, 1]) {
      const a0 = -Math.PI / 2 + s * 0.22, a1 = -Math.PI / 2 + s * 1.05;
      ctx.beginPath(); ctx.arc(cx, vy, ro, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
      const ex = cx + Math.cos(a1) * ro, ey = vy + Math.sin(a1) * ro, tx = -Math.sin(a1) * s, ty = Math.cos(a1) * s, hd = 5 + R / 50;
      ctx.beginPath(); ctx.moveTo(ex + tx * hd * 0.2, ey + ty * hd * 0.2);
      ctx.lineTo(ex - tx * hd + ty * hd * 0.55, ey - ty * hd - tx * hd * 0.55); ctx.lineTo(ex - tx * hd - ty * hd * 0.55, ey - ty * hd + tx * hd * 0.55); ctx.fill();
    }
    put('σ', f6, tx, ty, { ring: Math.max(inkIn(inkT, tx, ty, cx, cy, R - 0.5), inkOut(inkT, tx, ty, cx, cy, R + 0.5)), top: ty + Math.min(...inkT.map((q) => q[0])) });
    const aw = Math.PI * 0.62, bx = Math.cos(aw), by = Math.sin(aw);
    const i0 = rr - lw / 2, o0 = rr + lw / 2 + 3;
    ctx.strokeStyle = ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx + bx * i0, vy + by * i0); ctx.lineTo(cx + bx * (o0 + 6), vy + by * (o0 + 6)); ctx.stroke();
    for (const d of [i0, rr + lw / 2]) { ctx.beginPath(); ctx.moveTo(cx + bx * d - by * 3, vy + by * d + bx * 3); ctx.lineTo(cx + bx * d + by * 3, vy + by * d - bx * 3); ctx.stroke(); }
    const wx = cx + bx * (o0 + 6 + fs * 0.6), wy = vy + by * (o0 + 6 + fs * 0.6), inkW = inkRows(f6, 'w');
    ctx.fillStyle = ink; put('w', f6, wx, wy, {});
    // "lumen" as high in the lumen as its ink keeps 1 px inside the lumen's edge and 2 px clear of the w label, its bracket
    // and the ΔP arrows; "muscle" where its ink keeps the most room inside the muscle ring, 1 px or more on each side.
    // A name is drawn only where its ink fits, never across a ring's edge.
    ctx.fillStyle = cssVar('--text-3');
    const box = (rows, x, y) => [x + Math.min(...rows.map((q) => q[2])), y + Math.min(...rows.map((q) => q[0])), x + Math.max(...rows.map((q) => q[3])), y + Math.max(...rows.map((q) => q[1]))];
    const wBox = box(inkW, wx, wy), brk = [cx + bx * (o0 + 6) - 3.5, vy + by * i0 - 3.5, cx + bx * i0 + 3.5, vy + by * (o0 + 6) + 3.5];
    const inkL = inkRows(f5, 'lumen');
    let lp = null;
    for (let y = cy + Rl * 0.35; y < cy + Rl; y += 0.25) {
      const g = { edge: inkIn(inkL, cx, y, cx, cy, Rl - 0.35), w: Math.min(inkFrom(inkL, cx, y, wBox), inkFrom(inkL, cx, y, brk)), arrows: inkOut(inkL, cx, y, cx, vy, rr + 3 + len + 1) };
      if (g.edge < 1) break;
      if (g.w >= 2.5 && g.arrows >= 2) { lp = { y, g }; break; }   // (2.5: both names' soft edges)
    }
    if (keep('lumen', !!lp)) put('lumen', f5, cx, lp.y, lp.g);
    const inkM = inkRows(f5, 'muscle');
    let mp = null;
    for (let y = cy + R * 0.74; y < cy + R; y += 0.25) {
      const g = { outer: inkIn(inkM, cx, y, cx, cy, R - 0.5), band: inkOut(inkM, cx, y, cx, cy, R * 0.74) };
      if (!mp || Math.min(g.outer, g.band) > Math.min(mp.g.outer, mp.g.band)) mp = { y, g };
    }
    if (keep('muscle', Math.min(mp.g.outer, mp.g.band) >= 1)) put('muscle', f5, cx, mp.y, mp.g);
    // (What the picture shows, for the checks: the names drawn and how far each keeps from its neighbours.)
    const lab = drawn.join(',');
    dataSoon(cv, 'labels', lab);
    gaps.picture = { R, cy, h: hh };
    cv.wallGaps = gaps;
  }
  return { id: 'varixwall', label: 'Varix wall', el, update, pin };
}

// ── Ascites (L2c) ───────────────────────────────────
// The one home for ascites: how much there is, whether it is building up, what it does to the
// abdomen, what a diagnostic tap would show, and the two treatments (diuretics, paracentesis).
// Tapping the fluid on the figure, the Ascites readout's actions and Treat > Paracentesis all open it.
// Two blocks: what you read (plain values and flat tiles, nothing pressable), then what you change, in one
// control vocabulary: a stepper (value, then − and + side by side), the app's switch, and one button, Drain.
const SEV = ['ok', 'caution', 'danger', 'danger'];
const GRADE = ['None', 'Grade 1', 'Grade 2', 'Grade 3'];
const GRADE_TIP = ['No free fluid', 'Grade 1: seen on ultrasound only', 'Grade 2: moderate, symmetric distension', 'Grade 3: tense, marked distension'];
// Abdominal pressure as the left half of a dial beside the belly: 0 at the bottom, 30 mmHg at the top, green below
// 12 (intra-abdominal hypertension), amber to 20 (compartment syndrome), red above. The coloured arc fills up to the
// reading and a knob rides the ring; the number, its unit and a word sit inside the half circle. One drawing in a
// 76 × 128 box, so every part keeps its place at any size.
const IAP_MAX = 30, IAP_BANDS = [[0, 12, 'ok'], [12, 20, 'caution'], [20, 30, 'danger']];
const iapSev = (v) => (v >= 20 ? 'danger' : v >= 12 ? 'caution' : 'ok');
const IAP_WORD = { ok: 'Normal', caution: 'High', danger: 'Very high' };
// (On the GPU, 2 Nov 2026, "Move everything to GPU": the dial is a model (svg-gl svgModel, never SVG the page paints) drawn by createSvgGL
// in the charts' shared context; its knob eases round on the frame clock, its number and word are the model's words.)
function iapDial() {
  const s = (t, a = {}, txt) => { const e = svgModel(t, a); if (txt != null) setWords(e, txt); return e; };
  const C = 64, R = 56, TX = 42;   // pivot on the flat (belly) side, ring radius, the text column
  const pt = (v, r) => { const t = Math.PI / 2 + (v / IAP_MAX) * Math.PI; return [C + r * Math.cos(t), C + r * Math.sin(t)]; };
  const arc = (a, b, r) => { const [x0, y0] = pt(a, r), [x1, y1] = pt(b, r); return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
  const svg = s('svg', { class: 'ab-dial', viewBox: '-12 0 76 128', preserveAspectRatio: 'xMidYMid meet' });
  const live = [];
  for (const [a, b, sev] of IAP_BANDS) {
    const a1 = a ? a + 0.3 : a, b1 = b < IAP_MAX ? b - 0.3 : b, d = arc(a1, b1, R);
    svg.append(s('path', { class: 'ab-dial-band', d, 'data-sev': sev }));
    const lp = s('path', { class: 'ab-dial-live', d, 'data-sev': sev, pathLength: '100', 'stroke-dasharray': '0 100' });
    svg.append(lp); live.push([a1, b1, lp]);
  }
  const tls = [];
  for (const v of [12, 20]) {
    const [x0, y0] = pt(v, R + 5), [x1, y1] = pt(v, R + 9);
    svg.append(s('line', { class: 'ab-dial-tick', x1: x0.toFixed(2), y1: y0.toFixed(2), x2: x1.toFixed(2), y2: y1.toFixed(2) }));
    const tl = s('text', { class: 'ab-dial-tl' }, String(v));
    svg.append(tl); tls.push([v, tl]);
  }
  // The knob: drawn pointing right (into the belly), then turned to the reading about the pivot, eased round the ring.
  const knob = s('g', { class: 'ab-dial-knob' });
  knob.append(s('line', { x1: C + R - 12, y1: C, x2: C + R - 6, y2: C }), s('circle', { cx: C + R, cy: C, r: 4.6 }));
  const num = s('text', { class: 'ab-dial-n', x: TX, y: 70 }, '—'), word = s('text', { class: 'ab-dial-w', x: TX }, '');
  const key = s('text', { class: 'ab-dial-k', x: TX, y: 43 }, 'IAP'), unit = s('text', { class: 'ab-dial-u', x: TX }, 'mmHg');
  svg.append(knob, key, num, unit, word);
  const el = h('div', { class: 'ab-dial-box svg-gl-box', title: 'Intra-abdominal pressure. 12 mmHg and above: intra-abdominal hypertension. 20 mmHg and above: abdominal compartment syndrome.' }, svg);
  const gl = createSvgGL(el);
  gl.show(svg, false);
  // The small words are 12 px on screen at least, however small the dial is drawn (sweep batch 04: the ticks at about 7 px,
  // the caption at 9.6 px on a phone): their size in the drawing grows as the dial shrinks, the lines below the number move
  // down to make room, and the word under them is left out when it no longer fits inside the half circle (the number's
  // colour and the arc still say how high it is; the dial's label reads the word). The dial's width comes from its observer.
  let fitK = 0, boxW = 0;
  const fit = () => {
    const w = boxW;
    if (!w) return;
    const k = 76 / w;
    if (Math.abs(k - fitK) < 0.005) return;
    fitK = k;
    const f = (base) => Math.max(base, 12.2 * k);
    const fk = f(8.5), fu = f(8.5), fw = f(9), ft = f(8.5);
    key.style.fontSize = `${fk.toFixed(2)}px`; unit.style.fontSize = `${fu.toFixed(2)}px`; word.style.fontSize = `${fw.toFixed(2)}px`;
    const yu = 74 + 0.72 * fu, yw = yu + 3.5 + 0.72 * fw;
    unit.setAttribute('y', yu.toFixed(2)); word.setAttribute('y', yw.toFixed(2));
    for (const [v, tl] of tls) {
      const [lx, ly] = pt(v, R + 10 + 0.65 * ft);
      tl.style.fontSize = `${ft.toFixed(2)}px`; tl.setAttribute('x', lx.toFixed(2)); tl.setAttribute('y', (ly + 0.36 * ft).toFixed(2));
    }
    gl.relook();   // (the new type sizes are styles: the model's looks are read again, between frames)
    fitWord();
  };
  // (The chord of the ring's inside at the word's baseline, from the text column to the flat side; the word's width from its outlines.)
  const fitWord = () => {
    const fw = parseFloat(word.style.fontSize) || 9, y = parseFloat(word.getAttribute('y')) || 92, top = y - 0.72 * fw;
    const dy = Math.max(Math.abs(y - C), Math.abs(top - C)), half = Math.sqrt(Math.max(0, (R - 4) ** 2 - dy * dy));
    const tw = textWidth(wordsOf(word), { weight: 650, size: fw });
    word.style.display = tw > 0 && (tw / 2 > C - TX + 0 || TX - tw / 2 < C - half) ? 'none' : '';
    gl.paint();
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver((es) => { const b = es[es.length - 1].contentBoxSize?.[0]; boxW = b ? b.inlineSize : es[es.length - 1].contentRect.width; fit(); }).observe(el);
  // The knob's turn, eased on the frame clock as the page's transition was (D_SURFACE on the arrive curve); reduced motion: at once.
  let ang = 90, turn = null, turnAsk = 0;
  const KNOB_STILL = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const knobAt = (a) => knob.setAttribute('transform', `rotate(${a.toFixed(2)} ${C} ${C})`);
  knobAt(ang);
  function knobStep() {
    turnAsk = 0;
    if (!turn) return;
    const u = clamp((easeNow() - turn.t0) / D_SURFACE, 0, 1);
    ang = turn.from + (turn.to - turn.from) * easeArrive(u);
    knobAt(ang); gl.paint();
    if (u < 1) turnAsk = lateFrameFor('instruments')(knobStep); else turn = null;
  }
  let last = null;
  function set(iap) {
    const n = Math.max(0, Math.round(iap) || 0), v = Math.min(n, IAP_MAX);   // (whole mmHg, as the number reads, so the word and the arc agree with it)
    if (n === last) return;
    last = n;
    const sev = iapSev(v);
    setWords(num, String(n)); setWords(word, IAP_WORD[sev]);
    dataSoon(svg, 'sev', sev);
    for (const [a, b, lp] of live) lp.setAttribute('stroke-dasharray', `${(clamp((v - a) / (b - a), 0, 1) * 100).toFixed(1)} 100`);
    const to = 90 + (v / IAP_MAX) * 180;
    if (KNOB_STILL.matches) { turn = null; ang = to; knobAt(ang); } else { turn = { from: ang, to, t0: easeNow() }; if (!turnAsk) turnAsk = lateFrameFor('instruments')(knobStep); }
    attrSoon(el, 'aria-label', `Intra-abdominal pressure ${n} mmHg, ${IAP_WORD[sev].toLowerCase()}`);
    if (fitK) fitWord(); else gl.paint();
  }
  el.setAttribute('role', 'img');
  return { el, set };
}
/** A stepper's number rolls to its new value over a small step instead of jumping (the tiles' number roll, util.js countTo); the
 *  first paint is written at once, the unit stays put beside it. */
const stepOut = (unit, attrs = {}) => h('output', { class: 'ab-dp-l', ...attrs }, h('span', { class: 'ab-dp-n' }), h('small', {}, unit));
const paintStep = (out, v, dp) => {
  const n = out.firstElementChild;   // (its number and unit are built with it, stepOut: never in a frame)
  countTo(n, v, dp);
};
export function createAbdomen({ onAction }) {
  // The stepper for serum albumin: − value +, the value between the buttons, the same control as the litres to drain.
  const stepper = (label, unit, min, max, stepBy, dp, start, onSet) => {
    let v = start;
    const out = stepOut(unit);
    const paint = () => { paintStep(out, v, dp, unit); propSoon(minus, 'disabled', v <= min); propSoon(plus, 'disabled', v >= max); };
    const go = (d) => { v = +clamp(v + d, min, max).toFixed(dp); paint(); onSet(v); };
    const minus = h('button', { class: 'ab-dp-sb', 'aria-label': `${label}: less`, onclick: () => go(-stepBy) }, '−');
    const plus = h('button', { class: 'ab-dp-sb', 'aria-label': `${label}: more`, onclick: () => go(stepBy) }, '+');
    paint();
    return { out, el: h('div', { class: 'ab-dp-vol ab-sa', role: 'group', 'aria-label': label }, minus, out, plus), get: () => v, set: (x) => { if (x !== v) { v = x; paint(); } } };
  };
  // A switch row: the whole row is the tap target, the switch sits at its right edge.
  const toggle = (ic, title, sub, tip, onclick) => h('button', { class: 'ab-row ab-tg', role: 'switch', 'aria-checked': 'false', title: tip, onclick },
    ic ? icon(ic) : h('span'), h('span', { class: 'ab-txt' }, title, sub), h('span', { class: 'switch-vis', 'aria-hidden': 'true' }, h('i')));
  // Paracentesis: litres, Drain, and the albumin switch under it whose advice turns amber above 5 L without it.
  const albT = h('b', {}, 'Albumin'), albS = h('small');
  const alb = h('button', { class: 'ab-dp-alb', role: 'switch', 'aria-checked': 'false', onclick: () => { alb.setAttribute('aria-checked', String(!albOn())); paintVol(); } },
    h('span', { class: 'ab-dp-at' }, albT, albS), h('span', { class: 'switch-vis', 'aria-hidden': 'true' }, h('i')));
  alb.setAttribute('aria-checked', 'true');
  const albOn = () => alb.getAttribute('aria-checked') === 'true';
  let hasFluid = true;
  // The litres to drain: − value +, the value between the buttons like a dial's own reading.
  let L = 5;
  const volOut = stepOut('L', { 'aria-live': 'polite' });
  const setL = (x) => { L = +clamp(x, 1, 10).toFixed(1); paintVol(); };
  const volMinus = h('button', { class: 'ab-dp-sb', 'aria-label': 'Liters to drain: less', onclick: () => setL(L - 0.5) }, '−');
  const volPlus = h('button', { class: 'ab-dp-sb', 'aria-label': 'Liters to drain: more', onclick: () => setL(L + 0.5) }, '+');
  const drain = h('button', { class: 'ab-drain', onclick: () => onAction({ kind: 'paracentesis', mL: L * 1000, albumin: albOn() }) });
  function paintVol() {
    const warn = L > 5 && !albOn();
    paintStep(volOut, L, 1, 'L');
    propSoon(volMinus, 'disabled', L <= 1); propSoon(volPlus, 'disabled', L >= 10);
    // (Optional / Advised / grams crossfade into each other; the grams count on as the litres change.)
    const albTxt = albOn() ? `${Math.round(L * 8)} g` : warn ? 'Advised' : 'Optional', albKind = albTxt.replace(/\d+/, '#');
    if (albS._kind !== albKind) { albS._kind = albKind; swapText(albS, albTxt); } else putText(albS, albTxt);
    classSoon(albS, 'ab-warn', warn);
    classSoon(alb, 'ab-warn', warn);
    alb.title = warn ? `For >5 L, give albumin (${Math.round(L * 8)} g, 8 g per liter drained) to protect the kidneys.` : 'Albumin 8 g per liter drained: advised for >5 L, optional for ≤5 L.';
    swapText(drain, hasFluid ? 'Drain' : 'No fluid');
    propSoon(drain, 'disabled', !hasFluid);
  }
  paintVol();
  // Diuretics drives the same parameter as the Treatments chip.
  const diu = toggle('pill', h('b', {}, 'Diuretics'), h('small', {}, 'Spironolactone 100 mg + furosemide 40 mg'),
    'Spironolactone + furosemide: renal sodium and water loss mobilizes ascites. Keep the 100 : 40 mg ratio (5 : 2).',
    () => updateParams((p) => { p.diuretics = !p.diuretics; return p; }, { label: 'Diuretics' }));
  // Serum albumin is a patient input that drives ascites (oncotic pull back into the vessels) and the SAAG.
  const sa = stepper('Serum albumin', 'g/dL', 1.5, 5, 0.1, 1, 4, (v) => updateParams((p) => { p.albumin = v; return p; }, { label: 'Serum albumin' }));
  // Volume, grade and daily change, with a small belly that fills with the fluid.
  const numEl = h('span', {}, '—'), gradeEl = h('span', { class: 'ab-grade' }), trendEl = h('div', { class: 'ab-trend' });
  const bigEl = h('b', {}, numEl, h('small', {}, 'L'));   // (the volume, coloured by its grade like the Ascites tile)
  const bellyFill = h('i', { class: 'ab-belly-fill' });
  // The litres sit inside the belly and the grade under it, so the reading and the picture stay one object.
  // The daily balance: always on its line, never appearing or going, through balanceHold (below). A new value is written in
  // place, no fade: amber with ▲ while fluid builds up, teal with ▼ while it goes, outlined in the card's colour (no pill).
  const rateArrow = h('i', { class: 'ab-rate-a', 'aria-hidden': 'true' }), rateTxt = h('span');
  const rateEl = h('span', { class: 'ab-rate', 'data-dir': 'steady' }, rateArrow, rateTxt);
  const rateHold = balanceHold(), showRate = balanceLine(rateEl, rateArrow, rateTxt);
  const rateLabel = (b) => (b === 0 ? ['steady', '', 'Steady'] : b > 0 ? ['up', '▲', `${fmt(b, 0)} mL/day`] : ['down', '▼', `${fmt(-b, 0)} mL/day`]);
  function paintRate(raw) {
    const b = rateHold.step(raw, performance.now());
    if (b != null) showRate(...rateLabel(b));
  }
  const belly = h('div', { class: 'ab-belly' }, bellyFill, h('div', { class: 'ab-big' }, bigEl, gradeEl, rateEl));
  const gauge = h('div', { class: 'ab-gauge' }, belly);
  // Beside the belly in the Ascites tab: the pressure dial on its left, the drain on its right (both hidden on a slide).
  const dial = iapDial();
  gauge.append(dial.el);
  const dp = h('div', { class: 'ab-dp', role: 'group', 'aria-label': 'Paracentesis' },
    h('div', { class: 'ab-dp-k' }, 'Drain'),
    h('div', { class: 'ab-dp-vol', role: 'group', 'aria-label': 'Liters to drain' }, volMinus, volOut, volPlus),
    alb, drain);
  // Abdominal pressure as one slim bar, 0–30 mmHg, ticked at 12 (IAH) and 20 (ACS).
  const iapFill = h('i', { class: 'ab-iap-fill' }), iapNum = h('b'), iapWord = h('span', { class: 'ab-w' });
  const iapBar = h('div', { class: 'ab-iap-bar', role: 'img', title: '12 mmHg: intra-abdominal hypertension · 20 mmHg: compartment syndrome' }, iapFill,
    h('i', { class: 'ab-iap-mark', style: { left: '40%' } }), h('i', { class: 'ab-iap-mark', style: { left: '66.7%' } }));
  // The tap, g/dL: three flat tiles, SAAG first. With no result, one quiet line takes their place (same height).
  const lab = (k) => { const v = h('span', { class: 'ab-n' }, '—'); return [h('dl', { class: 'ab-tile' }, h('dt', {}, k), h('dd', {}, v, h('span', { class: 'ab-u' }, 'g/dL'))), v]; };
  const [saagEl, saagV] = lab('SAAG'), [tpEl, tpV] = lab('Fluid protein'), [albEl, albV] = lab('Fluid albumin');
  const why = h('div', { class: 'ab-why' });
  const tiles = h('div', { class: 'ab-tiles' }, saagEl, tpEl, albEl, why);
  const read = h('div', { class: 'ab-read' },
    h('div', { class: 'ab-vol' }, h('div', { class: 'ab-vol-l' }, trendEl), gauge, dp),
    h('div', { class: 'ab-iap' }, h('div', { class: 'ab-kv' }, h('span', {}, 'Abdominal pressure'), h('span', { class: 'ab-v' }, iapNum, iapWord)), iapBar),
    tiles);
  const ctl = h('div', { class: 'ab-ctl' },
    h('div', { class: 'ab-row' }, icon('drop'), h('span', { class: 'ab-txt' }, h('b', {}, 'Serum albumin')), h('span', { class: 'ab-end' }, sa.el)),
    diu);
  const el = h('div', { class: 'ab', 'data-pane': 'abdomen' }, h('div', { class: 'ab-main' }, read, ctl));
  // (A small belly is 84 px, not 72: its "300 mL/day" line sits where the circle is only about 65 px across and the edge cut it.)
  el.dataset.belly = '84';
  // Every frame calls this, but a pane the learner is scrolling must not be touched when nothing changed: on a phone,
  // rewriting a text node or an attribute to the same value is enough to make the browser stop a scroll in flight.
  // (Its numbers and words change with the model: drawn on the GPU while they change, gl-words.js.)
  const setText = wordSetter([numEl, gradeEl, trendEl, iapNum, iapWord, saagV, tpV, albV, why]);
  const setAttr = attrSoon;
  const setData = dataSoon;
  function update(f) {
    const a = f.metrics.ascites, p = store.get().params;
    setText(numEl, fmt(a.volume / 1000, 1));
    setText(gradeEl, GRADE[a.grade] || a.label); setAttr(gradeEl, 'title', GRADE_TIP[a.grade] || '');
    setData(gradeEl, 'sev', SEV[a.grade] || 'danger'); setData(bigEl, 'sev', SEV[a.grade] || 'danger');
    setAttr(diu, 'aria-checked', String(!!p.diuretics));
    if (sa.get() !== p.albumin) sa.set(p.albumin);
    const r = a.ratePerDay, trend = Math.abs(r) < 20 ? 'steady' : r > 0 ? 'building up' : 'resolving';
    paintRate(r);
    setText(trendEl, `${r > 0 ? '+' : ''}${fmt(r, 0)} mL a day · ${trend}`);
    const sev = iapSev(a.iap);
    dial.set(a.iap);
    setText(iapNum, `${fmt(a.iap, 0)} mmHg`);
    setText(iapWord, `· ${a.iap >= 20 ? 'compartment syndrome' : a.iap >= 12 ? 'high' : 'normal'}`);
    setData(iapWord, 'sev', sev); setData(iapFill, 'sev', sev);
    const iw = `${Math.round(clamp(a.iap / 30, 0, 1) * 1000) / 10 - 100}% 0px`;   // (slid in from the left inside its track: app.css .ab-iap-fill)
    if (iapFill.style.translate !== iw) iapFill.style.translate = iw;
    setAttr(iapBar, 'aria-label', `Abdominal pressure ${fmt(a.iap, 0)} mmHg`);
    // SAAG from the rounded parts, so serum − ascitic always adds up on screen.
    const tapped = a.volume > 150;
    const r1 = (x) => Math.round(x * 10) / 10, saag = r1(r1(p.albumin) - r1(a.albumin));
    setText(saagV, tapped ? fmt(saag, 1) : '—'); setText(tpV, tapped ? fmt(a.totalProtein, 1) : '—'); setText(albV, tapped ? fmt(a.albumin, 1) : '—');
    setAttr(saagEl, 'title', tapped ? `SAAG ${fmt(p.albumin, 1)} − ${fmt(a.albumin, 1)} = ${fmt(saag, 1)} g/dL. ≥ 1.1 means portal hypertension.` : null);
    setText(why, a.volume < 1 ? 'No fluid to tap' : 'Too little fluid to tap');
    setAttr(tiles, 'data-empty', tapped ? null : '');
    if (hasFluid !== a.volume > 150) { hasFluid = a.volume > 150; paintVol(); }
    // Whole percents only: rewriting the height every frame would keep restarting its ease.
    const bh = `0px ${100 - Math.round(a.volume > 150 ? 15 + clamp(a.volume / 8000, 0, 1) * 70 : 0)}%`;   // (risen by sliding up inside the belly: app.css .ab-belly-fill)
    if (bellyFill.style.translate !== bh) bellyFill.style.translate = bh;
  }
  return { id: 'abdomen', label: 'Ascites & paracentesis', el, update };
}
