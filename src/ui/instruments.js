// Instruments (blueprint §8.3, §9.4, §9.5, §6.4): endoscopy,
// varix cross-section, abdomen.

import { NODES } from '../engine/topology.js';
import { gastricUp } from '../engine/scenario.js';
import { wallRead } from '../engine/wall-read.js';
import { pressureColor } from './colormap.js';
import { h, fmt, canvasSize, cssVar, cssAlpha, clamp, icon, swapText, putText, countTo } from './util.js';
import { wordSetter } from './gl-words.js';
import { simTime, isPaused } from './clock.js';
import { acquireEndoGL } from './endo-gl.js';
import { surface } from './gpu-surfaces.js';
import { renderEndo } from './endo-render.js';
import { endoGrow, airRatio, airFlat } from './endo-size.js';
import { varixMean } from './varix-look.js';
import { SIZE_TAU_MS, DEFLATE_TAU_MS, BAND_TAU_MS, BAND_DELAY_MS, fadeIn, glide, scopeTear } from './endo-motion.js';
import { drawScopeBleed } from './endo-bleed.js';
import { poolFill } from './blood.js';
import { FONT } from './charts.js';
import { store, updateParams, varicesPresent } from './store.js';
import { classSoon, attrSoon, dataSoon, propSoon } from './class-soon.js';
import { balanceHold, balanceLine } from './balance-hold.js';
import { lateFrameFor, cancelFrame, framePhase, easeNow } from './frame.js';
import { restPass } from './rest-pass.js';
import { createTraceGL, fitPen } from './trace-gl.js';
import { createSvgGL, svgModel, setWords, wordsOf, setGeo } from './svg-gl.js';
import { textWidth } from './text-gl.js';
import { D_SURFACE, easeArrive } from './ease.js';
import { inkBox } from './glyph-measure.js';
import { reduceMotionMQ } from './motion.js';
import { TOKEN_OF_SEV } from '../engine/pressure-cuts.js';
import { darkMQ } from './look.js';
import { createEusPpg } from './eus-ppg.js';
// (The endoscope's field: drawn in the late part of a frame, after the model's frame of it has been taken in, so once a frame.)
const drawFrame = lateFrameFor('instruments');

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));

// ── Words made once and kept ──
// A text made from a whole number is built the first time that number is seen and kept (the readings run over a few hundred values), so
// a frame that shows a number it has shown before builds nothing.
const intCache = (make) => { const c = []; return (n) => c[n] ?? (c[n] = make(n)); };
const intTxt = intCache((n) => String(n));   // alloc-rare: the first time that number is shown
const tearTxt = intCache((n) => `${n}% of the rupture point`);   // alloc-rare: the first time that percent is shown
const slideTxt = intCache((k) => `${k / 10 - 100}% 0px`);   // alloc-rare: the first time that fill is set (slid in from the left inside its track, by tenths of a percent)
const riseTxt = intCache((p) => `0px ${100 - p}%`);   // alloc-rare: the first time that height is set (risen by sliding up inside the belly, by whole percents)
// A reading's words: fmt(v, d) then a suffix, rebuilt only when the number it shows changes (a cell is { k, s }, one for each place that prints).
const numCell = () => ({ k: undefined, s: '' });
function shownNum(c, v, d, suffix, prefix = '') {
  const m = d ? 10 : 1, k = Number.isFinite(v) ? Math.round(v * m) : v;
  if (!Object.is(c.k, k)) { c.k = k; c.s = `${prefix}${fmt(Number.isFinite(k) ? k / m : k, d)}${suffix}`; }   // alloc-rare: only when the number shown differs from the one its words were built from
  return c.s;
}
const NO_PARAMS = {};   // (gastricUp reads a frame's params; a frame with none is read as this)

// ── Endoscopy ───────────────────────────────────────
export function createEndoscopy({ onAction }) {
  const el = h('div', { class: 'dock-pane', 'data-pane': 'endoscopy' });
  const box = h('div', { class: 'chart-box square' });
  const cv = h('canvas', { role: 'img', 'aria-label': 'Endoscopic view' });
  box.append(cv);
  const view = 'eso'; // the esophageal variceal view only
  // The position is a caption under the view, never over it.
  const stage = h('div', { class: 'endo-stage' }, box, h('span', { class: 'endo-pos' }, 'Distal esophagus · 36 cm'));
  const bandBtn = h('button', { class: 'btn primary', onclick: () => onAction({ kind: 'band' }) }, icon('band'), 'Band (EVL)');   // (one name on every card: the phone's and the side card's, 13 Nov 2026)
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
    h('div', { class: 'endo-tile endo-pr', title: 'Intravariceal pressure.' }, h('dt', {}, 'Intravariceal'), pIn),
    h('div', { class: 'endo-tile endo-pr', title: 'Intraluminal esophageal pressure around the varix, set by insufflation (simulated).' }, h('dt', {}, 'Intraluminal'), pLum),
    h('div', { class: 'endo-tile endo-pr', title: 'Transmural pressure = intravariceal − intraluminal pressure: the pressure that distends the varix wall.' }, h('dt', {}, 'Transmural'), pAcross)];
  const stats = h('dl', { class: 'endo-read' },
    item('endo-chip', h('dt', {}, 'Bands', h('span', { class: 'endo-dt-x' }, ' placed')), bands),
    h('div', { class: 'endo-g', title: 'Small, <5 mm; Large, ≥5 mm.' }, h('dt', {}, 'Grade'), grade),
    item('endo-tile', h('dt', {}, 'Diameter'), diam),
    item('endo-tile', h('dt', {}, 'Wall', h('span', { class: 'endo-dt-x' }, ' thickness')), wall),
    h('div', { class: 'endo-chip endo-red', title: 'In the model, red wale marks and cherry-red spots appear once the wall stress exceeds 70% of the rupture point.' }, h('dt', {}, 'Stigmata'), red));
  // EUS-PPG, played on the anatomy from here (eus-ppg.js): in Tests › Scope, not on a slide's card unless the slide asks (configure).
  const eus = createEusPpg();
  const side = h('div', { class: 'chart-side' }, stats, bandBtn, eus.el);
  el.append(stage, side);
  // (The readings change with the model: drawn on the GPU while they change, gl-words.js.)
  const set = wordSetter([gradeLabel, diam, wall, pIn, pLum, pAcross, redWord, redMore, bands]);
  const cDiam = numCell(), cWall = numCell(), cIn = numCell(), cLum = numCell(), cAcross = numCell();
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
    set(diam, shownNum(cDiam, rest * airRatio(mv?.air ?? vx.air, opt.air), 1, ' mm')); set(wall, shownNum(cWall, vx.w, 1, ' mm'));
    if (opt.readings) { set(pIn, shownNum(cIn, inV, 1, ' mmHg')); set(pLum, shownNum(cLum, opt.air, 1, ' mmHg')); set(pAcross, shownNum(cAcross, inV - opt.air, 1, ' mmHg')); }
    const redV = !vx.present ? 'None' : (opt.red ?? vx.redWale) ? 'Red wale, cherry spots' : 'None';
    set(redWord, redV === 'None' ? redV : 'Red wale'); set(redMore, redV === 'None' ? '' : ', cherry spots'); dataSoon(red, 'long', redV === 'None' ? null : ''); dataSoon(red.parentNode, 'on', redV !== 'None');
    const nb = Math.round(f.bands || 0);
    set(bands, intTxt(nb)); dataSoon(bands.parentNode, 'on', nb !== 0);
    // A model frame taken in at the start of a frame is drawn by the field's own late callback of that frame (one already asked
    // for by an ease, or one asked now): the field is drawn once a frame, with the newest state. Anywhere else, at once.
    if (framePhase() === 'early') { last = lastS; lastS.f = f; lastS.vx = vx; if (!raf) raf = drawFrame(redraw); return; }
    draw(f, vx);
  }
  // Rendered endoscopic view (see endo-render.js): a per-pixel 3D shading of the lumen with raised,
  // winding varices, drawn once per state into a cached bitmap, so it is perfectly steady. Balloon,
  // bleeding and the scope mask are drawn on top.
  // The shader's WebGL context is made when the scope is about to show (shown(true) from the dock, or the first field drawn) and given
  // back when its tab leaves the screen (shown(false)): a page holds only so many (iOS Safari about 16, dropping the oldest, which is
  // the figure's). The picture on the page is the drawer's texture, so nothing blanks; the shader is made afresh, through gl-compile.js,
  // on the way back.
  // (What is asked of the frame clock and the shader's context is made once: a draw asks for the next frame again and again while it eases.)
  const lastS = { f: null, vx: null };   // (the frame and its varix the field was last asked to draw: `last` is this, written in place, or null)
  const redraw = () => { raf = 0; if (last) draw(last.f, last.vx); };
  const glOpts = { onBack: () => { if (!raf) raf = drawFrame(redraw); }, pen: null };
  const mkGl = () => { glOpts.pen = pen; return acquireEndoGL(glOpts); };   // (the field is shaded in the context of the chart drawer that lays it: no context of its own)
  const gImg = { glVer: 0 };   // (the shaded field as the picture shown: its version)
  let gl = null, wasGl = false, glGone = false, noGl = false, away = false;   // (wasGl: which renderer drew the field last, so a change between them fades; glGone: the context was given back, not failed; away: the tab is off the screen)
  function needGl() {
    if (gl || noGl || away) return;
    gl = mkGl();
    if (!gl) noGl = true; else if (glGone) { glGone = false; glId = 0; }
  }
  // The scope's picture is laid by the GPU's chart drawer over this canvas (trace-gl.js): the field as a texture (taken from the shader's
  // canvas, GPU to GPU, once per state), the old one under it while the new fades in, the balloon, the bleed and the rim, clipped to the
  // lumen. Nothing is drawn on a 2D canvas (1 Nov: nothing off the GPU); ?tracegl=0 draws the overlays on this canvas and leaves the field out.
  const pen = createTraceGL(cv, { redraw: () => { pSig.ok = false; if (last) draw(last.f, last.vx); } });
  let glVer = 0, swap = false;   // (glVer: the shader canvas's content, counted; swap: the field shown is kept as the old one before the new goes up)
  // (The ?perf surfaces list, gpu-surfaces.js: read by the readout only.)
  // (Its answers are made once: the readout asks twice a second and reads them, never keeps or changes them.)
  const SURF_GPU = { on: 'gpu', via: 'shaded WebGL2 once per state, laid by the GPU drawer' }, SURF_WAIT = { on: 'gpu', via: 'shaded WebGL2 once per state, laid by the GPU drawer (its first picture not laid yet)' };
  const SURF_LOST = { on: 'fallback', via: 'CPU shading, laid by the GPU drawer', why: 'context lost' }, SURF_NOGL = { on: 'fallback', via: 'CPU shading, laid by the GPU drawer', why: 'no WebGL2, or its shader failed' };
  const offSurface = surface('endoscopy field', () => (!cv.isConnected || away || cv.checkVisibility?.() === false ? null : gl && !gl.lost ? (pen?.presented ? SURF_GPU : SURF_WAIT) : gl ? SURF_LOST : noGl ? SURF_NOGL : null));
  let peak = 0, peakRed = 0, an = null, lastT = 0, last = null, raf = 0, bleedLast = null, poolA = 0, mv = null, mvHeld = {}, held = null, pinned = null;
  // What identifies the field shown, kept as numbers (a frame joins no text): glId, the shader field's (0: none shaded since a reset), cacheId, the CPU renderer's;
  // the numbers they were made from, to tell whether a draw has a new one; and what was last painted over it (pSig, ok: false until painted).
  const gkNow = new Float64Array(24), gkLast = new Float64Array(24), ckNow = new Float64Array(5), ckLast = new Float64Array(5), heldBuf = [0, 0, 0];
  let glId = 0, cacheId = 0, glSeq = 0, cacheImg = null;
  const pSig = { ok: false, cvW: 0, cvH: 0, w: 0, hh: 0, id: 0, balloon: false, shut: false, theme: null, palette: null, cls: '', dark: false };
  // (The field's state for the shader, the CPU renderer's options, the bleed's and the targets of the tweens: kept, written in place each draw.)
  const rOpt = { grow: 0, vis: 0, red: 0, def: [0, 0, 0, 0], kn: new Array(16).fill(0) }, cpuOpt = { grow: 0, bands: 0, vis: 0, red: 0 };
  const bleedS = { rate: undefined, total: 0, hr: undefined }, bleedOpt = { cx: 0, cy: 0, R: 0, jx: 0, jy: 0, t: 0, a: 0, rate: undefined, fill: 0, hr: undefined };
  const defT = [0, 0, 0, 0], knT = new Array(16).fill(0);
  // A slide's options for this scope (configure, below): air, the air's pressure in the lumen in mmHg (the varix is drawn and measured as it is seen
  // at that pressure; the grade, the pressure inside it and the model are not touched); red, true or false (the red wale marks shown or hidden whatever
  // the wall stress; absent: the model's rule); readings, three more rows (the pressure in the varix, in the lumen and across the wall).
  const opt = { air: 0, red: null, readings: false };
  const dark = darkMQ, still = reduceMotionMQ;
  // The field as it showed before it last changed (the drawer's texture 'old'), the new one fading in over it from fadeT0
  // (endo-motion.js); the balloon's and the jet's strength (0..1) easing toward on or off. On the display clock, so a
  // paused model still finishes a fade.
  let fadeT0 = -1, shown = null, fadeA = 1, balA = 0, shutA = 0, jetA = 0, uiT = 0;
  // Before the field changes: the one on screen is kept as the old one (its texture moved, on the GPU) and the new fades in over it.
  function keep() {
    if (!shown || still.matches) { fadeT0 = -1; return; }   // (the first field: drawn as it is)
    swap = true; fadeT0 = performance.now();
  }
  // A column's deflation and a band's knuckle follow their target like everything else in the scope view (endo-motion.js glide, a time
  // constant), the target taken `delay` ms after it changes (the band cinches in a beat after the vein). Busy while it waits or has not landed.
  const tw = (v) => ({ v, to: v, at: 0, cur: v });   // alloc-rare: only when the tweens are first made (the first draw)
  function tween(t, target, wall, dtMs, tau, delay) {
    if (target !== t.to) { t.to = target; t.at = wall + delay; }
    if (wall < t.at) return true;
    t.cur = t.v = glide(t.cur, t.to, dtMs, tau);
    return t.cur !== t.to;
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
    last = lastS; lastS.f = f; lastS.vx = vx;
    const wall = performance.now();
    // The field's size, stigmata and presence ease on the display clock (a paused model still finishes them), as the figure's varices do.
    const dt = Math.min(0.1, Math.max(0, (wall - lastT) / 1000)); lastT = wall;
    // The field shows the varix over the beat, not each beat's swell: the model's size and wall stress rise and fall with every
    // heartbeat, and following them redrew the whole shaded field many times a second (a browser without a GPU spent a second on
    // each redraw and its page stopped answering), while the comment above promises a steady view. It follows the same running mean
    // the figure's varices do (varix-look.js varixMean, VARIX_MEAN_MS): it was averaged over four seconds, twice as slow, and never took
    // a paused model's frame or a jump at once, so the varices came up in the scope a good while after they were on the figure.
    mvHeld.snap = f.running === false || !!f.jump;
    const dMean = varixMean(mvHeld, vx.d, wall), kb = mvHeld.k;
    if (!mv) mv = { d: dMean, ratio: vx.ratio, air: vx.air?.slice() };   // alloc-rare: only the first draw (mv is then kept and eased in place)
    else {
      mv.d = dMean; mv.ratio += (vx.ratio - mv.ratio) * kb;
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
    defT.fill(0); knT.fill(0);
    for (let c = 0; c < 4; c++) {
      const nb = Math.floor(bands / 4) + (c < bands % 4 ? 1 : 0);
      defT[c] = nb > 0 ? 1 : 0;
      for (let k = 0; k < Math.min(nb, 4); k++) knT[c * 4 + k] = 1;
    }
    if (!an) {
      // alloc-rare: only the first draw (the eased state is then kept and updated in place)
      an = { g: tg, v: tv, r: tr, def: defT.map((x) => tw(x)), kn: knT.map((x) => tw(x)) };
      an.def.forEach((t, i) => { t.v = defT[i]; }); an.kn.forEach((t, i) => { t.v = knT[i]; });   // alloc-rare: the same first draw
    }
    // Size and presence follow the model continuously (critically damped, ~0.2 s); banding follows its target the
    // same way, a beat apart: the vein deflates first, the knuckle and band follow.
    const kf = 1 - Math.exp(-dt * 1000 / SIZE_TAU_MS);
    an.g += (tg - an.g) * kf; an.v += (tv - an.v) * kf; an.r += (tr - an.r) * kf;
    if (Math.abs(tg - an.g) < 0.0008) an.g = tg;
    if (Math.abs(tv - an.v) < 0.0008) an.v = tv;
    if (Math.abs(tr - an.r) < 0.0008) an.r = tr;
    let busy = an.g !== tg || an.v !== tv || an.r !== tr;
    // The banded vein starts deflating at once; its band cinches in from a wide loop a beat later (endo-motion.js).
    for (let c = 0; c < 4; c++) busy = tween(an.def[c], defT[c], wall, dt * 1000, DEFLATE_TAU_MS, 0) || busy;
    for (let i = 0; i < 16; i++) busy = tween(an.kn[i], knT[i], wall, dt * 1000, BAND_TAU_MS, knT[i] ? BAND_DELAY_MS : 0) || busy;
    if (busy && !raf) raf = drawFrame(redraw);   // (on the display clock: a paused model's field finishes its ease too)
    const res = clamp(Math.round(2 * R * (window.devicePixelRatio || 1)), 160, 480);
    let img;
    needGl();
    if (gl && !gl.ready() && !gl.lost) { gl.dispose(); gl = null; glId = 0; noGl = true; }   // (its shader failed: the CPU renderer below, as with no WebGL)
    // (A lost context is not a failure: the CPU renderer draws the field while it is gone, and the GPU takes over again, with the new
    // field fading in over the old, when the browser gives it back and builds the shader afresh: endo-gl.js.)
    const onGl = !!gl && !gl.lost;
    if (onGl !== wasGl) { if (shown && gl) keep(); wasGl = onGl; }
    if (onGl) {
      // Drawn once per state and kept as a 2D bitmap: a steady field costs no shader pass or GPU readback.
      // (Size, presence and stigmata redraw once they have moved a step and a half of 32 from the field shown, so a slow drift
      // or the last of the beat's swell does not redraw it to and fro across one step; banding redraws at every step.)
      for (let i = 0; i < 3; i++) { const x = i === 0 ? an.g : i === 1 ? an.v : an.r; heldBuf[i] = held && Math.abs(x * 32 - heldBuf[i]) < 1.5 ? heldBuf[i] : Math.round(x * 32); }
      held = heldBuf;
      // (The field's key: the size, the three held steps, and each column's and knuckle's step, as numbers compared with the last shaded.)
      gkNow[0] = res; gkNow[1] = heldBuf[0]; gkNow[2] = heldBuf[1]; gkNow[3] = heldBuf[2];
      for (let c = 0; c < 4; c++) gkNow[4 + c] = Math.round(an.def[c].cur * 32);
      for (let i = 0; i < 16; i++) gkNow[8 + i] = Math.round(an.kn[i].cur * 32);
      let sameKey = glId !== 0;
      for (let i = 0; i < 24 && sameKey; i++) if (gkNow[i] !== gkLast[i]) sameKey = false;
      // (A shader still compiling draws no new field: the one shown stays, and endo-gl's onBack asks for this frame again once it is published.)
      if (!sameKey && !gl.pending) {
        if (glId) keep(); else fadeT0 = -1;
        gkLast.set(gkNow); glId = ++glSeq;
        rOpt.grow = an.g; rOpt.vis = an.v; rOpt.red = an.r;
        for (let c = 0; c < 4; c++) rOpt.def[c] = an.def[c].cur;
        for (let i = 0; i < 16; i++) rOpt.kn[i] = an.kn[i].cur;
        // (shaded straight into the drawer's texture, in its own context; the one shown kept as the old one first. A drawer not ready yet has
        // the field shaded again when it is.)
        glVer++;
        if (pen?.ready) { if (swap) { pen.keepImage('field', 'old'); swap = false; } if (!gl.shade('field', glVer, res, rOpt)) glId = 0; } else glId = 0;
        gImg.glVer = glVer;
        dataSoon(cv, 'renders', cv._renders = (cv._renders || 0) + 1);   // (read by the browser checks: a steady field is not redrawn)
      }
      img = gImg;
    } else {
      // No WebGL: the CPU renderer draws the target state without transitions.
      const r2 = Math.min(res, 300), gq = Math.round(tg * 14) / 14;
      ckNow[0] = r2; ckNow[1] = gq; ckNow[2] = bands; ckNow[3] = Math.round(tv * 10); ckNow[4] = Math.round(tr * 8);
      let sameCpu = cacheId !== 0;
      for (let i = 0; i < 5 && sameCpu; i++) if (ckNow[i] !== ckLast[i]) sameCpu = false;
      if (!sameCpu) {
        if (cacheImg) keep();
        cpuOpt.grow = gq; cpuOpt.bands = bands; cpuOpt.vis = tv; cpuOpt.red = Math.round(tr * 8) / 8;
        cacheImg = renderEndo(r2, cpuOpt); cacheImg.glVer = ++glVer;
        ckLast.set(ckNow); cacheId = ++glSeq;
      }
      img = cacheImg;
    }
    // Nothing on the field changed since the last paint (the same bitmap, size, balloon and theme, no bleeding): it is left
    // as it is. It is asked for on every frame of the model, and a full repaint each time (a scaled bitmap and the rim) held
    // a phone's or a browser without a GPU's main thread for most of every frame.
    const bleedNow = !!(f.bleed?.active && f.bleed.site === 'VAR'), balloon = !!f.params?.balloonEso, shut = gastricUp(f.params || NO_PARAMS), root = document.documentElement;
    // (The last bleed seen: its jet and pool keep drawing from it while they fade out after the bleed stops.)
    if (bleedNow) { bleedLast = bleedS; bleedS.rate = f.metrics?.bleeding?.rate; bleedS.total = f.bleed.total; bleedS.hr = f.metrics?.vitals?.hr ?? f.metrics?.hr; }
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
    if (moving && !raf) raf = drawFrame(redraw);
    if (!moving) uiT = 0;   // (the next ease starts from its first frame, not from the last one painted)
    const fieldId = onGl ? glId : cacheId, theme = root.getAttribute('data-theme'), palette = root.getAttribute('data-palette'), cls = root.className, darkNow = dark.matches;
    if (!bleeding && !moving && pSig.ok && pSig.cvW === cvW && pSig.cvH === cvH && pSig.w === w && pSig.hh === hh && pSig.id === fieldId && pSig.balloon === balloon && pSig.shut === shut
      && pSig.theme === theme && pSig.palette === palette && pSig.cls === cls && pSig.dark === darkNow) return;
    if (bleeding || moving) pSig.ok = false;
    else { pSig.ok = true; pSig.cvW = cvW; pSig.cvH = cvH; pSig.w = w; pSig.hh = hh; pSig.id = fieldId; pSig.balloon = balloon; pSig.shut = shut; pSig.theme = theme; pSig.palette = palette; pSig.cls = cls; pSig.dark = darkNow; }
    const p = fitPen(cv, pen), ctx = p.ctx, G = ctx.onGPU === true ? ctx.gpu : null;
    try {
    if (!G) pSig.ok = false;   // (no drawer: drawn again when it comes)
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
      bleedOpt.cx = cx; bleedOpt.cy = cy; bleedOpt.R = R; bleedOpt.jx = cx + tear.x * R; bleedOpt.jy = cy + tear.y * R; bleedOpt.t = still.matches ? 0.3 : simTime();
      bleedOpt.a = jetA; bleedOpt.rate = bleedLast.rate; bleedOpt.fill = poolA; bleedOpt.hr = bleedLast.hr;
      drawScopeBleed(ctx, bleedOpt);
    }
    if (jetA <= 0 && !bleeding) { bleedLast = null; poolA = 0; }
    ctx.restore();
    // The bezel: --scope-rim is one near-black on every look, which is gone on Dark, Navy and Black; there the ring gives 1 px of its 7 to a
    // --border hairline on its outer edge (the same footprint, R - 3 to R + 4, inside the field's 4 px margin).
    const darkLook = theme === 'dark' || (theme !== 'light' && theme !== 'soft' && darkNow);
    ctx.strokeStyle = cssVar('--scope-rim'); ctx.lineWidth = darkLook ? 6 : 7; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    if (darkLook) { ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R + 3.5, 0, Math.PI * 2); ctx.stroke(); }
    } finally { ctx.end?.(); }
  }
  /** This slide's options (presenter-tools show and option): { air, red, readings } as described at opt above. Eased, never snapped: the drawing
   *  follows the new air through the same 0.2 s ease as any change of size, the red marks through theirs. */
  function configure(t) {
    const air = clamp(+t?.air || 0, 0, 20), red = typeof t?.red === 'boolean' ? t.red : null, readings = !!t?.readings;
    const changed = air !== opt.air || red !== opt.red || readings !== opt.readings;
    Object.assign(opt, { air, red, readings });
    eus.el.hidden = false;   // (a slide's compact card always has EUS-PPG's play button; a slide that asks for the panel (t.eus) shows its readings instead, the deck plays it)
    el.toggleAttribute('data-eus-slide', !!t?.eus);
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
    if (!on) { if (gl) { gl.dispose(); gl = null; glId = 0; glGone = true; } return; }
    if (!gl && !noGl) { needGl(); if (gl && last) { raf ||= drawFrame(redraw); } }
  }
  return { id: 'endoscopy', label: 'Endoscopy', el, update, configure, pin, shown: shown_, setView() {}, dispose() { eus.dispose(); offRun(); cancelFrame(raf); raf = 0; gl?.dispose(); pen?.dispose(); last = null; offSurface(); } };
}

// ── Varix wall cross-section (L3) ───────────────────
// Scope's Wall mechanics tab: a cross-section of the esophagus with the varix in its wall, and Laplace's
// law as readings in the same tiles and meter as the scope view.
const WALL_SEV = { ok: 'Low', caution: 'High', danger: 'Near rupture', critical: 'Rupture risk' };
// The meter's four states by the stress's share of the tear point (one rule, read by the bar, the readout and the rim of the varix drawn below).
const wallState = (r) => (r > 1 ? 'critical' : r > 0.7 ? 'danger' : r > 0.4 ? 'caution' : 'ok');
const RIM_INK = { ...TOKEN_OF_SEV, critical: '--critical' };
// A name's ink as drawn (centred, baseline middle): the box round its glyphs' own ink, from the GPU atlas (glyph-measure.js inkBox: no
// canvas is drawn and read back). Names are placed by the ink itself, not their line box.
const inkRows = (font, t) => inkBox(t, font);
// How far a name's ink at (x, y) keeps from things round it, in px: inside a circle (its edge), outside one, from a box.
// (Each row is [top, bottom, left, right]; the rows are looked over by index, so a search that tries a name at hundreds of places makes nothing.)
const inkIn = (rows, x, y, ox, oy, r) => {
  let m = Infinity;
  for (let i = 0; i < rows.length; i++) { const q = rows[i]; m = Math.min(m, r - Math.hypot(Math.max(Math.abs(x + q[2] - ox), Math.abs(x + q[3] - ox)), Math.max(Math.abs(y + q[0] - oy), Math.abs(y + q[1] - oy)))); }
  return m;
};
const inkOut = (rows, x, y, ox, oy, r) => {
  let m = Infinity;
  for (let i = 0; i < rows.length; i++) { const q = rows[i]; m = Math.min(m, Math.hypot(Math.max(0, x + q[2] - ox, ox - x - q[3]), Math.max(0, y + q[0] - oy, oy - y - q[1])) - r); }
  return m;
};
/** box: [left, top, right, bottom]. */
const inkFrom = (rows, x, y, box) => {
  const bl = box[0], bt = box[1], br = box[2], bb = box[3];
  let m = Infinity;
  for (let i = 0; i < rows.length; i++) {
    const q = rows[i], dx = Math.max(bl - (x + q[3]), x + q[2] - br), dy = Math.max(bt - (y + q[1]), y + q[0] - bb);
    m = Math.min(m, dx > 0 && dy > 0 ? Math.hypot(dx, dy) : Math.max(dx, dy));
  }
  return m;
};
/** The least / the most of column k (0 top, 1 bottom, 2 left, 3 right) over a name's rows. */
const colMin = (rows, k) => { let m = Infinity; for (let i = 0; i < rows.length; i++) m = Math.min(m, rows[i][k]); return m; };
const colMax = (rows, k) => { let m = -Infinity; for (let i = 0; i < rows.length; i++) m = Math.max(m, rows[i][k]); return m; };
/** The ink box of rows set at (x, y), into out as [left, top, right, bottom]. */
const inkBoxInto = (out, rows, x, y) => { out[0] = x + colMin(rows, 2); out[1] = y + colMin(rows, 0); out[2] = x + colMax(rows, 3); out[3] = y + colMax(rows, 1); };
// The picture's names, in the order they are drawn, as the checks read them from data-labels: one text for each set of them drawn (bit i: name i).
const WALL_NAMES = ['r', 'σ', 'w', 'lumen', 'muscle'];
const WALL_LABELS = Array.from({ length: 32 }, (_, m) => WALL_NAMES.filter((_n, i) => m & (1 << i)).join(','));
const DASH_RADIUS = [3, 3], NO_DASH = [];
export function createVarixWall() {
  const geo = { w: NaN, hh: NaN, fs: NaN, wc: NaN, R: 0, cy: 0, off: new Set() };   // (the picture's fitted size, for the size, type size and wall it was fitted to, and the names left out at it, drawWall below)
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
  const wPct = h('span'), wBig = h('b', { class: 'wall-big' }, wPct, h('small', {}, '%', h('span', { class: 'wall-of' }, ' of rupture point'))), wSev = h('span', { class: 'wall-sev' });
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
  const readFs = () => { cv._fsAsk = 0; if (!cv.isConnected) return; cv._fsKw = cv._fsWw; cv._fsKh = cv._fsWh; const was = cv._fs; cv._fs = parseFloat(getComputedStyle(cv).fontSize) || 12; if (cv._fs !== was && lastF) update(lastF); };
  function update(f) {
    lastF = f;
    const v = f.metrics.varix;
    const wr = wallRead(v);   // (the index is worked out from the shown ΔP, r and w, so the tiles multiply out)
    set(ptm.v, wr.ptm); set(rad.v, wr.r); set(wal.v, wr.w); set(idx.v, wr.index);
    set(stressTxt, v.ratioShown > 1 ? 'above the rupture point' : tearTxt(Math.round(v.ratioShown * 100)));
    const sev = wallState(v.ratioShown);
    dataSoon(stressBar, 'sev', sev);
    // (The stress swings with each beat and each breath: the number is its mean over the last several breaths, a plain
    // average while that many have not passed yet, so it reads steady and the same on every screen, folded or open.)
    const now = performance.now();
    if (wMean == null || now - wT > 3000) { wMean = v.ratioShown; wN = 1; } else { wN++; wMean += (v.ratioShown - wMean) * Math.max(1 / wN, 1 - Math.exp(-(now - wT) / 6000)); }
    wT = now;
    // (On a slide the figure is the slide's own, the state its tiles show (pin), so every screen reads the same number.)
    if (Number.isFinite(wPin)) wMean = wPin;
    const ms = wallState(wMean);
    set(wPct, intTxt(Math.round(wMean * 100))); set(wSev, WALL_SEV[ms]);
    dataSoon(wSev, 'sev', ms); dataSoon(wBig, 'sev', ms);
    const wPctW = slideTxt(Math.round(clamp(v.ratioShown, 0, 1) * 1000));   // (slid in from the left inside its track: app.css .endo-bar i)
    if (stressFill.style.translate !== wPctW) stressFill.style.translate = wPctW;
    const pen = fitPen(cv, wallGL), ctx = pen.ctx;
    try { drawWall(ctx, pen.w, pen.h, v, f); } finally { ctx.end?.(); }
  }
  // drawWall's parts are made once and read this draw's values from W; its answers are written into kept objects (a draw makes none).
  const W = { v: null, fs: 12, cx: 0, hh: 0, fsInk: NaN, f6: '', f5: '', inkT: null, inkR: null, inkW: null, inkL: null, inkM: null };
  const PP = { Rl: 0, rr: 0, vy: 0, lw: 0, ro: 0, len: 0, tx: 0, ty: 0, top: 0 };
  const boxDash = [0, 0, 0, 0], boxW = [0, 0, 0, 0], boxBrk = [0, 0, 0, 0];
  const gR = { fill: 0, dash: 0 }, gSig = { ring: 0, top: 0 }, gW = {}, gLumen = { edge: 0, w: 0, arrows: 0 }, gMuscle = { outer: 0, band: 0 }, gPic = { R: 0, cy: 0, h: 0 };
  const gaps = { r: undefined, 'σ': undefined, w: undefined, lumen: undefined, muscle: undefined, picture: gPic };   // (what the checks read as cv.wallGaps: a name not drawn is undefined)
  // The varix and its marks for a picture of radius R round (cx, cy), at this beat's radius, wall and ΔP, into PP.
  // (most: the largest varix and ΔP the picture can show, which set its size, so the ring holds still through every beat)
  const parts = (R, cy, most) => {
    const { v, fs, cx, inkT } = W;
    const Rl = R * 0.52, rr = most ? R * 0.3 : clamp(v.r * R * 0.05, 4, R * 0.3), vy = cy - Rl - rr * 0.25, lw = clamp((most ? Math.ceil(v.w * 10) / 10 : v.w) * R / 20, 1, 10);
    const ro = rr + lw / 2 + Math.max(5, R / 30), len = (most ? 30 : clamp(v.ptm, 0, 30)) / 30 * rr * 0.9 + 4;
    // σ beside the ΔP arrow's shaft, just right of its head; where it would sit on the wall's outline it rises until its
    // ink is 2 px or more clear of the line's soft edge (it follows the varix through the beat, so it never touches it).
    const tx = cx + (4 + R / 60) * 0.45 + 2 - colMin(inkT, 2);
    let ty = vy - ro - fs * 0.75;
    if (inkIn(inkT, tx, ty, cx, cy, R - 1) < 2) for (let k = 0; k < 400 && inkOut(inkT, tx, ty, cx, cy, R + 1) < 2; k++) ty -= 0.25;
    const tTop = ty + colMin(inkT, 0);
    PP.Rl = Rl; PP.rr = rr; PP.vy = vy; PP.lw = lw; PP.ro = ro; PP.len = len; PP.tx = tx; PP.ty = ty;
    PP.top = Math.min(vy - Math.max(rr + lw / 2, ro + 2.5, rr + 3 + len + 1), tTop);
    return PP;
  };
  const atR = (R) => { const c0 = W.hh - 6 - R; return Math.min(W.hh - 1 - R, c0 + Math.max(0, 1 - parts(R, c0, true).top)); };
  const okR = (R) => parts(R, atR(R), true).top >= 1;
  // (A name that once misses at this size stays out until the size changes: r and the w label move with the beat, and a name
  // blinking in and out with it would read as a glitch.)
  const keepName = (t, ok) => { if (!ok) geo.off.add(t); return !geo.off.has(t); };
  function drawWall(ctx, w, hh, v, f) {
    if (w < 32 || hh < 32) return;
    ctx.clearRect(0, 0, w, hh);
    // (On a slide the labels take the card's small size, so they never fall under 12 px; 12 px is the floor in the Tests card too.)
    // (The card's type size is read between frames, rest-pass.js, when the picture's size changes; drawn meanwhile at the last one read.)
    const onCard = !!cv.closest('.pz-tool');
    if (onCard && (cv._fsKw !== w || cv._fsKh !== hh) && !cv._fsAsk) { cv._fsWw = w; cv._fsWh = hh; cv._fsAsk = restPass(readFs); }
    const fs = onCard ? cv._fs || 12 : clamp((Math.min(w, hh) / 2 - 6) / 11, 12, 14);
    // (The names' type and their ink are looked up when the type size changes.)
    if (W.fsInk !== fs) {
      W.fsInk = fs;
      // alloc-rare: only when the type size changes (a resize, or the card's size read)
      W.f6 = FONT(600, fs); W.f5 = FONT(500, fs);
      W.inkT = inkRows(W.f6, 'σ'); W.inkR = inkRows(W.f6, 'r'); W.inkW = inkRows(W.f6, 'w'); W.inkL = inkRows(W.f5, 'lumen'); W.inkM = inkRows(W.f5, 'muscle');
    }
    const { f6, f5, inkT, inkR, inkW, inkL, inkM } = W;
    const cx = w / 2;
    W.v = v; W.fs = fs; W.cx = cx; W.hh = hh;
    // The wall stress's σ and the ΔP arrow rise above the varix at the top of the wall: the picture, its foot 6 px above the box's
    // foot (or lower, into those 6 px, where that is all it needs), is the largest whose σ and arrow ink at the largest varix
    // and ΔP stays 1 px or more inside the canvas (a 12 px T, the symbol before σ, had its crossbar cut). The ring is set once for the box, and only
    // the varix and its marks move with the beat.
    const wc = Math.ceil(v.w * 10);
    if (geo.w !== w || geo.hh !== hh || geo.fs !== fs || geo.wc !== wc) {
      let lo = 20, hi = Math.min(w, hh) / 2 - 6;
      if (okR(hi)) lo = hi; else for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (okR(m)) lo = m; else hi = m; }
      if (geo.w !== w || geo.hh !== hh || geo.fs !== fs) geo.off.clear();
      geo.w = w; geo.hh = hh; geo.fs = fs; geo.wc = wc; geo.R = lo; geo.cy = atR(lo);
    }
    const { R, cy } = geo;
    const { Rl, rr, vy, lw, ro, len, tx, ty } = parts(R, cy, false);
    // The wall: muscle outside, mucosa inside, the lumen in the middle.
    ctx.fillStyle = cssVar('--organ-stomach'); ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(cx, cy, R * 0.74, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = cssVar('--hairline'); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    ctx.fillStyle = cssVar('--surface'); ctx.beginPath(); ctx.arc(cx, cy, Rl, 0, 7); ctx.fill();
    // The varix in the submucosa at the top, bulging into the lumen; its size follows the model's radius.
    const rim = cssVar(RIM_INK[wallState(v.ratioShown)]);   // (the stress meter's four states, below: ok, caution, danger, critical)
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
    ctx.strokeStyle = cssAlpha('--white', 0.85); ctx.lineWidth = 1.25; ctx.setLineDash(DASH_RADIUS);
    ctx.beginPath(); ctx.moveTo(cx, vy); ctx.lineTo(cx + rr, vy); ctx.stroke(); ctx.setLineDash(NO_DASH);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    gaps.r = gaps['σ'] = gaps.w = gaps.lumen = gaps.muscle = undefined;
    let drawn = 0;   // (bit i: WALL_NAMES[i] is drawn)
    // "r" just under the dashed radius, its ink 2 px or more clear of the dashes and 1 px or more inside the varix's fill;
    // on a small varix it moves in toward the centre, still under the dashes.
    const rTop = colMin(inkR, 0), rL = colMin(inkR, 2);
    const ry = vy + 3.4 - rTop;
    boxDash[0] = cx; boxDash[1] = vy - 1.1; boxDash[2] = cx + rr; boxDash[3] = vy + 1.1;   // (the dashes' soft edge included)
    let rx = cx + rr / 2, rFill = inkIn(inkR, rx, ry, cx, vy, rr - lw / 2 - 0.5), rDash = inkFrom(inkR, rx, ry, boxDash);
    if (rFill < 2) {
      const qx = cx + 1.5 - rL, qFill = inkIn(inkR, qx, ry, cx, vy, rr - lw / 2 - 0.5);
      if (qFill > rFill) { rx = qx; rFill = qFill; rDash = inkFrom(inkR, qx, ry, boxDash); }
    }
    // (The one label style: the theme's text ink over its --label-halo, 3 px, laid under the fill, so the "r" reads on every pressure fill.)
    if (keepName('r', rFill >= 1 && rDash >= 2)) {
      ctx.font = f6; ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = cssVar('--label-halo'); ctx.strokeText('r', rx, ry);
      ctx.fillStyle = cssVar('--text'); ctx.fillText('r', rx, ry); drawn |= 1; gR.fill = rFill; gR.dash = rDash; gaps.r = gR;
    }
    // Laplace's other two terms on the picture: the wall stress σ along the wall (two arrows pulling apart round the top,
    // heavier as the stress rises) and the wall thickness w across the rim (a bracket, in the faded label ink).
    const ink = cssVar('--text-3');
    ctx.strokeStyle = rim; ctx.fillStyle = rim; ctx.lineWidth = clamp(1.25 + 2.5 * clamp(v.ratio, 0, 1.2), 1.25, 4);
    for (let si = 0; si < 2; si++) {
      const s = si === 0 ? -1 : 1;
      const a0 = -Math.PI / 2 + s * 0.22, a1 = -Math.PI / 2 + s * 1.05;
      ctx.beginPath(); ctx.arc(cx, vy, ro, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
      const ex = cx + Math.cos(a1) * ro, ey = vy + Math.sin(a1) * ro, ux = -Math.sin(a1) * s, uy = Math.cos(a1) * s, hd = 5 + R / 50;
      ctx.beginPath(); ctx.moveTo(ex + ux * hd * 0.2, ey + uy * hd * 0.2);
      ctx.lineTo(ex - ux * hd + uy * hd * 0.55, ey - uy * hd - ux * hd * 0.55); ctx.lineTo(ex - ux * hd - uy * hd * 0.55, ey - uy * hd + ux * hd * 0.55); ctx.fill();
    }
    ctx.font = f6; ctx.fillText('σ', tx, ty); drawn |= 2;
    gSig.ring = Math.max(inkIn(inkT, tx, ty, cx, cy, R - 0.5), inkOut(inkT, tx, ty, cx, cy, R + 0.5)); gSig.top = ty + colMin(inkT, 0); gaps['σ'] = gSig;
    const aw = Math.PI * 0.62, bx = Math.cos(aw), by = Math.sin(aw);
    const i0 = rr - lw / 2, o0 = rr + lw / 2 + 3;
    ctx.strokeStyle = ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx + bx * i0, vy + by * i0); ctx.lineTo(cx + bx * (o0 + 6), vy + by * (o0 + 6)); ctx.stroke();
    for (let di = 0; di < 2; di++) { const d = di === 0 ? i0 : rr + lw / 2; ctx.beginPath(); ctx.moveTo(cx + bx * d - by * 3, vy + by * d + bx * 3); ctx.lineTo(cx + bx * d + by * 3, vy + by * d - bx * 3); ctx.stroke(); }
    const wx = cx + bx * (o0 + 6 + fs * 0.6), wy = vy + by * (o0 + 6 + fs * 0.6);
    ctx.fillStyle = ink; ctx.font = f6; ctx.fillText('w', wx, wy); drawn |= 4; gaps.w = gW;
    // "lumen" as high in the lumen as its ink keeps 1 px inside the lumen's edge and 2 px clear of the w label, its bracket
    // and the ΔP arrows; "muscle" where its ink keeps the most room inside the muscle ring, 1 px or more on each side.
    // A name is drawn only where its ink fits, never across a ring's edge.
    ctx.fillStyle = cssVar('--text-3');
    inkBoxInto(boxW, inkW, wx, wy);
    boxBrk[0] = cx + bx * (o0 + 6) - 3.5; boxBrk[1] = vy + by * i0 - 3.5; boxBrk[2] = cx + bx * i0 + 3.5; boxBrk[3] = vy + by * (o0 + 6) + 3.5;
    let lumenY = 0, lumenFound = false;
    for (let y = cy + Rl * 0.35; y < cy + Rl; y += 0.25) {
      const edge = inkIn(inkL, cx, y, cx, cy, Rl - 0.35), gw = Math.min(inkFrom(inkL, cx, y, boxW), inkFrom(inkL, cx, y, boxBrk)), arrows = inkOut(inkL, cx, y, cx, vy, rr + 3 + len + 1);
      if (edge < 1) break;
      if (gw >= 2.5 && arrows >= 2) { lumenFound = true; lumenY = y; gLumen.edge = edge; gLumen.w = gw; gLumen.arrows = arrows; break; }   // (2.5: both names' soft edges)
    }
    if (keepName('lumen', lumenFound)) { ctx.font = f5; ctx.fillText('lumen', cx, lumenY); drawn |= 8; gaps.lumen = gLumen; }
    let muscleY = 0, muscleOuter = 0, muscleBand = 0, muscleFound = false;
    for (let y = cy + R * 0.74; y < cy + R; y += 0.25) {
      const outer = inkIn(inkM, cx, y, cx, cy, R - 0.5), band = inkOut(inkM, cx, y, cx, cy, R * 0.74);
      if (!muscleFound || Math.min(outer, band) > Math.min(muscleOuter, muscleBand)) { muscleFound = true; muscleY = y; muscleOuter = outer; muscleBand = band; }
    }
    if (keepName('muscle', muscleFound && Math.min(muscleOuter, muscleBand) >= 1)) { ctx.font = f5; ctx.fillText('muscle', cx, muscleY); drawn |= 16; gMuscle.outer = muscleOuter; gMuscle.band = muscleBand; gaps.muscle = gMuscle; }
    // (What the picture shows, for the checks: the names drawn and how far each keeps from its neighbours.)
    dataSoon(cv, 'labels', WALL_LABELS[drawn]);
    gPic.R = R; gPic.cy = cy; gPic.h = hh;
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
const IAP_SAY = ['· normal', '· IAH', '· compartment syndrome'];   // (the words beside the abdominal pressure's number, by band: below 12, to 20, from 20)
const iapAria = intCache((n) => `Intra-abdominal pressure ${n} mmHg, ${IAP_WORD[iapSev(Math.min(n, IAP_MAX))].toLowerCase()}`);   // alloc-rare: the first time that whole mmHg is set
const r1 = (x) => Math.round(x * 10) / 10;
// (On the GPU, 2 Nov 2026, "Move everything to GPU": the dial is a model (svg-gl svgModel, never SVG the page paints) drawn by createSvgGL
// in the charts' shared context; its knob eases round on the frame clock, its number and word are the model's words.)
function iapDial() {
  const s = (t, a = {}, txt) => { const e = svgModel(t, a); if (txt != null) setWords(e, txt); return e; };
  const C = 64, R = 56, TX = 42;   // pivot on the flat (belly) side, ring radius, the text column
  const pt = (v, r) => { const t = Math.PI / 2 + (v / IAP_MAX) * Math.PI; return [C + r * Math.cos(t), C + r * Math.sin(t)]; };
  const arc = (a, b, r) => { const [x0, y0] = pt(a, r), [x1, y1] = pt(b, r); return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
  const svg = s('svg', { class: 'ab-dial', 'data-look': 'inst.root', viewBox: '-12 0 76 128', preserveAspectRatio: 'xMidYMid meet' });
  const live = [];
  for (const [a, b, sev] of IAP_BANDS) {
    const a1 = a ? a + 0.3 : a, b1 = b < IAP_MAX ? b - 0.3 : b, d = arc(a1, b1, R);
    svg.append(s('path', { class: 'ab-dial-band', 'data-look': 'inst.dial.band', d, 'data-rate': sev }));
    const lp = s('path', { class: 'ab-dial-live', 'data-look': 'inst.dial.live', d, 'data-rate': sev, pathLength: '100', 'stroke-dasharray': '0 100' });
    svg.append(lp); live.push([a1, b1, lp]);
  }
  const tls = [];
  for (const v of [12, 20]) {
    const [x0, y0] = pt(v, R + 5), [x1, y1] = pt(v, R + 9);
    svg.append(s('line', { class: 'ab-dial-tick', 'data-look': 'inst.dial.tick', x1: x0.toFixed(2), y1: y0.toFixed(2), x2: x1.toFixed(2), y2: y1.toFixed(2) }));
    const tl = s('text', { class: 'ab-dial-tl', 'data-look': 'inst.dial.tl', 'font-size': 8.5 }, String(v));
    svg.append(tl); tls.push([v, tl]);
  }
  // The knob: drawn pointing right (into the belly), then turned to the reading about the pivot, eased round the ring.
  const knob = s('g', { class: 'ab-dial-knob', 'data-look': 'inst.g' });
  knob.append(s('line', { 'data-look': 'inst.dial.knob.line', x1: C + R - 12, y1: C, x2: C + R - 6, y2: C }), s('circle', { 'data-look': 'inst.dial.knob.dot', cx: C + R, cy: C, r: 4.6 }));
  const num = s('text', { class: 'ab-dial-n', 'data-look': 'inst.dial.n', x: TX, y: 70 }, '—'), word = s('text', { class: 'ab-dial-w', 'data-look': 'inst.dial.w', 'font-size': 9, x: TX }, '');
  const key = s('text', { class: 'ab-dial-k', 'data-look': 'inst.dial.k', 'font-size': 8.5, x: TX, y: 43 }, 'IAP'), unit = s('text', { class: 'ab-dial-u', 'data-look': 'inst.dial.u', 'font-size': 8.5, x: TX }, 'mmHg');
  svg.append(knob, key, num, unit, word);
  const el = h('div', { class: 'ab-dial-box svg-gl-box', title: 'Intra-abdominal pressure (IAP). IAP ≥12 mmHg: intra-abdominal hypertension (IAH). IAP ≥20 mmHg: abdominal compartment syndrome.' }, svg);
  const gl = createSvgGL(el, { host: 'dock' });
  gl.show(svg, false);
  // The small words are 12 px on screen at least, however small the dial is drawn (sweep batch 04: the ticks at about 7 px,
  // the caption at 9.6 px on a phone): their size in the drawing grows as the dial shrinks, the lines below the number move
  // down to make room, and the word under them is left out when it no longer fits inside the half circle (the number's
  // colour and the arc still say how high it is; the dial's label reads the word). The dial's width comes from its observer.
  let fitK = 0, boxW = 0;
  const fitOpt = { weight: 650, size: 9 };   // (textWidth's options for the word: the size written in place)
  const fit = () => {
    const w = boxW;
    if (!w) return;
    const k = 76 / w;
    if (Math.abs(k - fitK) < 0.005) return;
    fitK = k;
    const f = (base) => Math.max(base, 12.2 * k);
    const fk = f(8.5), fu = f(8.5), fw = f(9), ft = f(8.5);
    key.setAttribute('font-size', fk.toFixed(2)); unit.setAttribute('font-size', fu.toFixed(2)); word.setAttribute('font-size', fw.toFixed(2));   // (a model's size is its attribute: the table sets none for these)
    const yu = 74 + 0.72 * fu, yw = yu + 3.5 + 0.72 * fw;
    unit.setAttribute('y', yu.toFixed(2)); word.setAttribute('y', yw.toFixed(2));
    for (const [v, tl] of tls) {
      const [lx, ly] = pt(v, R + 10 + 0.65 * ft);
      tl.setAttribute('font-size', ft.toFixed(2)); tl.setAttribute('x', lx.toFixed(2)); tl.setAttribute('y', (ly + 0.36 * ft).toFixed(2));
    }
    gl.relook();   // (the new type sizes are styles: the model's looks are read again, between frames)
    fitWord();
  };
  // (The chord of the ring's inside at the word's baseline, from the text column to the flat side; the word's width from its outlines.)
  const fitWord = () => {
    const fw = parseFloat(word.getAttribute('font-size')) || 9, y = parseFloat(word.getAttribute('y')) || 92, top = y - 0.72 * fw;
    const dy = Math.max(Math.abs(y - C), Math.abs(top - C)), half = Math.sqrt(Math.max(0, (R - 4) ** 2 - dy * dy));
    fitOpt.size = fw;
    const tw = textWidth(wordsOf(word), fitOpt);
    word.style.display = tw > 0 && (tw / 2 > C - TX + 0 || TX - tw / 2 < C - half) ? 'none' : '';
    gl.paint();
  };
  // (The Circuit view re-colours the dock in the dark looks: the figure's wrap carries .cmap from the middle of the change of view, and the dial's
  // tokens are the map's from then on. The wrap's class is read once the dial is on the page and watched from then, never read in a frame.)
  let wrapMO = null;
  const viewNow = () => { const w = el.closest('.stage-wrap'); return w && w.classList.contains('cmap') ? 'circuit' : 'anatomic'; };
  const hookView = () => {
    const w = el.closest('.stage-wrap');
    if (!w || wrapMO) return;
    gl.setCtx({ view: viewNow() });
    wrapMO = new MutationObserver(() => gl.setCtx({ view: viewNow() }));
    wrapMO.observe(w, { attributes: true, attributeFilter: ['class'] });
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver((es) => { const b = es[es.length - 1].contentBoxSize?.[0]; boxW = b ? b.inlineSize : es[es.length - 1].contentRect.width; hookView(); fit(); }).observe(el);
  // The knob's turn, eased on the frame clock as the page's transition was (D_SURFACE on the arrive curve); reduced motion: at once.
  let ang = 90, turn = null, turnAsk = 0;
  const KNOB_STILL = typeof matchMedia === 'function' ? reduceMotionMQ : { matches: false };
  const rotTxt = [];   // (the knob's turn by hundredths of a degree, made the first time that angle is drawn and kept)
  const knobAt = (a) => { const k = Math.round(a * 100); setGeo(knob, 'transform', rotTxt[k] ?? (rotTxt[k] = `rotate(${(k / 100).toFixed(2)} ${C} ${C})`)); };   // alloc-rare: only the first time that angle is drawn
  knobAt(ang);
  function knobStep() {
    turnAsk = 0;
    if (!turn) return;
    const u = clamp((easeNow() - turn.t0) / D_SURFACE, 0, 1);
    ang = turn.from + (turn.to - turn.from) * easeArrive(u);
    knobAt(ang); gl.paint();
    if (u < 1) turnAsk = drawFrame(knobStep); else turn = null;
  }
  let last = null;
  const turnS = { from: 0, to: 0, t0: 0 };   // (the knob's turn under way: `turn` is this, written in place, or null)
  const dashText = live.map(() => []);   // (each band's dash by the pressure in whole mmHg: made the first time it is set and kept)
  const dashOf = (i, v) => dashText[i][v] ?? (dashText[i][v] = `${(clamp((v - live[i][0]) / (live[i][1] - live[i][0]), 0, 1) * 100).toFixed(1)} 100`);   // alloc-rare: only the first time that pressure is set
  function set(iap) {
    const n = Math.max(0, Math.round(iap) || 0), v = Math.min(n, IAP_MAX);   // (whole mmHg, as the number reads, so the word and the arc agree with it)
    if (n === last) return;
    last = n;
    const sev = iapSev(v);
    setWords(num, intTxt(n)); setWords(word, IAP_WORD[sev]);
    dataSoon(svg, 'rate', sev);   // (the rating, read by the table's rows: data-rate is the attribute the picture watches)
    for (let i = 0; i < live.length; i++) setGeo(live[i][2], 'stroke-dasharray', dashOf(i, v));
    const to = 90 + (v / IAP_MAX) * 180;
    if (KNOB_STILL.matches) { turn = null; ang = to; knobAt(ang); } else { turn = turnS; turnS.from = ang; turnS.to = to; turnS.t0 = easeNow(); if (!turnAsk) turnAsk = drawFrame(knobStep); }
    attrSoon(el, 'aria-label', iapAria(n));
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
  const volMinus = h('button', { class: 'ab-dp-sb', 'aria-label': 'Decrease volume to drain', onclick: () => setL(L - 0.5) }, '−');
  const volPlus = h('button', { class: 'ab-dp-sb', 'aria-label': 'Increase volume to drain', onclick: () => setL(L + 0.5) }, '+');
  const drain = h('button', { class: 'ab-drain', onclick: () => onAction({ kind: 'paracentesis', mL: L * 1000, albumin: albOn() }) });
  function paintVol() {
    const warn = L > 5 && !albOn();
    paintStep(volOut, L, 1, 'L');
    propSoon(volMinus, 'disabled', L <= 1); propSoon(volPlus, 'disabled', L >= 10);
    // (Optional / Advised / grams crossfade into each other; the grams count on as the litres change.)
    // alloc-rare: paintVol runs only when the litres, the albumin switch or whether there is fluid to drain changes (a tap, or update's hasFluid flip), never per frame
    const albTxt = albOn() ? `${Math.round(L * 8)} g` : warn ? 'Advised' : 'Optional', albKind = albTxt.replace(/\d+/, '#');
    if (albS._kind !== albKind) { albS._kind = albKind; swapText(albS, albTxt); } else putText(albS, albTxt);
    classSoon(albS, 'ab-warn', warn);
    classSoon(alb, 'ab-warn', warn);
    alb.title = warn ? `For >5 L, give albumin (${Math.round(L * 8)} g, 8 g per liter of ascites removed) to prevent post-paracentesis circulatory dysfunction.` : 'Albumin 8 g per liter of ascites removed: advised for >5 L, optional for ≤5 L.';   // alloc-rare: the same, paintVol runs only on a change
    swapText(drain, hasFluid ? 'Drain' : 'No ascites');
    propSoon(drain, 'disabled', !hasFluid);
  }
  paintVol();
  // Diuretics drives the same parameter as the Treatments chip.
  const diu = toggle('pill', h('b', {}, 'Diuretics'), h('small', {}, 'Spironolactone 100 mg + furosemide 40 mg'),
    'Spironolactone + furosemide: natriuresis mobilizes ascites. Keep the 100:40 mg ratio.',
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
  const rateLabel = (b) => (b === 0 ? ['steady', '', 'Steady'] : b > 0 ? ['up', '▲', `${fmt(b, 0)} mL/day`] : ['down', '▼', `${fmt(-b, 0)} mL/day`]);   // alloc-rare: called only when the held balance changes (below)
  function paintRate(raw) {
    const b = rateHold.step(raw, performance.now());
    if (b != null) showRate(...rateLabel(b));   // alloc-rare: balanceHold gives a value only when the shown hundred changes, at most once every 1.5 s
  }
  const belly = h('div', { class: 'ab-belly' }, bellyFill, h('div', { class: 'ab-big' }, bigEl, gradeEl, rateEl));
  const gauge = h('div', { class: 'ab-gauge' }, belly);
  // Beside the belly in the Ascites tab: the pressure dial on its left, the drain on its right (both hidden on a slide).
  const dial = iapDial();
  gauge.append(dial.el);
  const dp = h('div', { class: 'ab-dp', role: 'group', 'aria-label': 'Paracentesis' },
    h('div', { class: 'ab-dp-k' }, 'Drain'),
    h('div', { class: 'ab-dp-vol', role: 'group', 'aria-label': 'Volume to drain, liters' }, volMinus, volOut, volPlus),
    alb, drain);
  // Abdominal pressure as one slim bar, 0–30 mmHg, ticked at 12 (IAH) and 20 (ACS).
  const iapFill = h('i', { class: 'ab-iap-fill' }), iapNum = h('b'), iapWord = h('span', { class: 'ab-w' });
  const iapBar = h('div', { class: 'ab-iap-bar', role: 'img', title: '≥12 mmHg: intra-abdominal hypertension · ≥20 mmHg: abdominal compartment syndrome' }, iapFill,
    h('i', { class: 'ab-iap-mark', style: { left: '40%' } }), h('i', { class: 'ab-iap-mark', style: { left: '66.7%' } }));
  // The tap, g/dL: three flat tiles, SAAG first. With no result, one quiet line takes their place (same height).
  const lab = (k) => { const v = h('span', { class: 'ab-n' }, '—'); return [h('dl', { class: 'ab-tile' }, h('dt', {}, k), h('dd', {}, v, h('span', { class: 'ab-u' }, 'g/dL'))), v]; };
  const [saagEl, saagV] = lab('SAAG'), [tpEl, tpV] = lab('Fluid protein'), [albEl, albV] = lab('Fluid albumin');
  const why = h('div', { class: 'ab-why' });
  const tiles = h('div', { class: 'ab-tiles' }, saagEl, tpEl, albEl, why);
  const read = h('div', { class: 'ab-read' },
    h('div', { class: 'ab-vol' }, h('div', { class: 'ab-vol-l' }, trendEl), gauge, dp),
    h('div', { class: 'ab-iap' }, h('div', { class: 'ab-kv' }, h('span', {}, 'Intra-abdominal pressure'), h('span', { class: 'ab-v' }, iapNum, iapWord)), iapBar),
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
  // (Words built from the numbers: kept with the numbers they were built from, and rebuilt only when one differs.)
  const cTrend = { k: undefined, up: false, w: '', s: '' }, cIap = numCell(), cIapAria = numCell(), cTip = { a: undefined, b: undefined, s: '' };
  const setAttr = attrSoon;
  const setData = dataSoon;
  function update(f) {
    const a = f.metrics.ascites, p = store.get().params;
    setText(numEl, fmt(a.volume / 1000, 1));
    setText(gradeEl, GRADE[a.grade] || a.label); setAttr(gradeEl, 'title', GRADE_TIP[a.grade] || '');
    setData(gradeEl, 'sev', SEV[a.grade] || 'danger'); setData(bigEl, 'sev', SEV[a.grade] || 'danger');
    setAttr(diu, 'aria-checked', !!p.diuretics);
    if (sa.get() !== p.albumin) sa.set(p.albumin);
    const r = a.ratePerDay, trend = Math.abs(r) < 20 ? 'steady' : r > 0 ? 'building up' : 'resolving';
    paintRate(r);
    const rk = Number.isFinite(r) ? Math.round(r) : r;
    if (!Object.is(cTrend.k, rk) || cTrend.up !== r > 0 || cTrend.w !== trend) {
      cTrend.k = rk; cTrend.up = r > 0; cTrend.w = trend;
      cTrend.s = `${r > 0 ? '+' : ''}${fmt(rk, 0)} mL a day · ${trend}`;   // alloc-rare: only when the rounded rate, its sign or its word changes
    }
    setText(trendEl, cTrend.s);
    const sev = iapSev(a.iap);
    dial.set(a.iap);
    setText(iapNum, shownNum(cIap, a.iap, 0, ' mmHg'));
    setText(iapWord, IAP_SAY[a.iap >= 20 ? 2 : a.iap >= 12 ? 1 : 0]);
    setData(iapWord, 'sev', sev); setData(iapFill, 'sev', sev);
    const iw = slideTxt(Math.round(clamp(a.iap / 30, 0, 1) * 1000));   // (slid in from the left inside its track: app.css .ab-iap-fill)
    if (iapFill.style.translate !== iw) iapFill.style.translate = iw;
    setAttr(iapBar, 'aria-label', shownNum(cIapAria, a.iap, 0, ' mmHg', 'Intra-abdominal pressure '));
    // SAAG from the rounded parts, so serum − ascitic always adds up on screen.
    const tapped = a.volume > 150;
    const saag = r1(r1(p.albumin) - r1(a.albumin));
    setText(saagV, tapped ? fmt(saag, 1) : '—'); setText(tpV, tapped ? fmt(a.totalProtein, 1) : '—'); setText(albV, tapped ? fmt(a.albumin, 1) : '—');
    let tip = null;
    if (tapped) {
      const ka = r1(p.albumin), kb = r1(a.albumin);   // (the two parts as the line prints them, to a tenth)
      if (!Object.is(cTip.a, ka) || !Object.is(cTip.b, kb)) {
        cTip.a = ka; cTip.b = kb;
        cTip.s = `SAAG ${fmt(ka, 1)} − ${fmt(kb, 1)} = ${fmt(saag, 1)} g/dL. SAAG ≥1.1 g/dL indicates portal hypertension.`;   // alloc-rare: only when either albumin, to a tenth, changes
      }
      tip = cTip.s;
    }
    setAttr(saagEl, 'title', tip);
    setText(why, a.volume < 1 ? 'No ascites to sample' : 'Too little ascites to sample');
    setAttr(tiles, 'data-empty', tapped ? null : '');
    if (hasFluid !== a.volume > 150) { hasFluid = a.volume > 150; paintVol(); }
    // Whole percents only: rewriting the height every frame would keep restarting its ease.
    const bh = riseTxt(Math.round(a.volume > 150 ? 15 + clamp(a.volume / 8000, 0, 1) * 70 : 0));   // (risen by sliding up inside the belly: app.css .ab-belly-fill)
    if (bellyFill.style.translate !== bh) bellyFill.style.translate = bh;
  }
  return { id: 'abdomen', label: 'Ascites and paracentesis', el, update };
}
