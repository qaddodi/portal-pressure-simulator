// The figure's resolution and size: the canvas share (Auto, Adapt, While moving, Size cap), its eased changes, its resize and the density watch.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { TIERS_ON, TIER_TOP, onTierWarm } from './adapt-tier.js';
import { figLab, figOpt, inMotion, renderScale, renderSetting } from './frame.js';
import { capDensity } from './pixel-budget.js';
import { leftAlone } from './quiet.js';
import { fadeOver } from './res-fade.js';

import { stageScope } from './stage-scope.js';
export function createRes(st, live) {
  const { OVER_ASK, QUALITY, drawVeins, schedulePlateView, stageBox, vCanvas, wrap } = st;
  const AUTO_STEPS = [1, 0.75, 0.5, 0.35, 0.25, 0.18, 0.14, 0.1];
  const autoScale = (zoom) => { const want = 1 / Math.max(1, zoom); let b = 1; for (let i = 0; i < AUTO_STEPS.length; i++) { const s = AUTO_STEPS[i]; if (s >= want - 1e-6) b = s; } return b; };
  // (A margin at each step's edges: the step Auto is on is kept while 1/zoom stays within AUTO_HOLD of it, so a zoom let go near 2×
  // does not flip between 75% and 50% from one settle to the next, each reallocating and fading (review, 30 Oct). The steps
  // themselves, and where each starts, are as chosen.)
  const AUTO_HOLD = 1.08;
  const autoSticky = (zoom, cur) => {
    const k = autoScale(zoom), want = 1 / Math.max(1, zoom), i = AUTO_STEPS.indexOf(cur);
    if (i < 0 || k === cur) return k;
    if (k > cur && want <= cur * AUTO_HOLD) return cur;   // (a little sharper wanted: not yet)
    if (k < cur && i + 1 < AUTO_STEPS.length && want * AUTO_HOLD > AUTO_STEPS[i + 1]) return cur;   // (a little softer allowed: not yet)
    return k;
  };
  // (Auto's step for the view now, no lower than Settings › Auto's lowest.)
  const autoNow = (cur = 0) => (renderSetting() === 'auto' ? Math.max(figOpt('floor'), autoSticky(live.vt.k / Math.max(1e-6, live.homeAt?.k ?? 1), cur)) : 1);
  const moveGaps = [], fastGaps = [], moveGapsSorted = [];   // (kept lists, written in place)
  const byValue = (a, b) => a - b;
  function adaptStep() {
    if (!figOpt('adapt')) { live.adaptK = 1; moveGaps.length = 0; return; }
    if (moveGaps.length < 20) return;
    const g = moveGapsSorted;
    g.length = moveGaps.length;
    for (let i = 0; i < moveGaps.length; i++) g[i] = moveGaps[i];
    g.sort(byValue);
    const med = g[g.length >> 1];
    fastGaps.push(g[Math.floor(g.length * 0.1)]); if (fastGaps.length > 5) fastGaps.shift();
    let lowest = Infinity;
    for (let i = 0; i < fastGaps.length; i++) lowest = Math.min(lowest, fastGaps[i]);
    live.fastGap = Math.max(4, lowest);
    moveGaps.length = 0;
    const at = AUTO_STEPS.indexOf(live.adaptK);
    if (med > live.fastGap * 1.5 && live.adaptK > 0.25) live.adaptK = AUTO_STEPS[at + 1];
    else if (med < live.fastGap * 1.15 && live.adaptK < 1) live.adaptK = AUTO_STEPS[at - 1];
  }
  function noteMoveFrame() {
    const t = performance.now();
    if (t - live.lastMoveAt < 250) { moveGaps.push(t - live.lastMoveAt); if (moveGaps.length > 240) moveGaps.shift(); }
    live.lastMoveAt = t;
  }
  // Once the view has settled and been let go: Auto's step for the zoom, the canvas back from its moving share, Adapt's next step.
  function settleRes() {
    if (renderSetting() !== 'auto' && live.autoK === 1 && !live.moveLow && !figOpt('adapt') && live.adaptK === 1) return;
    stageScope.clear(live.autoT);
    live.autoT = stageScope.timer(resSettled, 200);
  }
  function resSettled() {
    // (Never during a dive or a rise: its copy, laid over the canvas, would stand still while the dive's scale zooms the rest.)
    if (!leftAlone(280) || live.vtGliding || (live.diveT > 0 && live.diveT < 1)) { live.autoT = stageScope.timer(resSettled, 120); return; }
    const k = autoNow(live.autoK), a = live.adaptK;
    adaptStep();
    if (k === live.autoK && !live.moveLow && a === live.adaptK) return;
    live.autoK = k; live.moveLow = false; easeRes();
    if (live.plateOn()) schedulePlateView();   // (the view's sharp picture, made again for the new resolution)
  }
  // Every change of the share eases (Mohammad, 30 Oct: "nothing snaps"): the picture as drawn is laid over the canvas and fades out
  // (res-fade.js) while the canvas is resized and drawn again under it; the copy follows the view from the transform it was drawn
  // in (glM then) to the one each frame is drawn in.
  let fadeM0 = null;
  const fadeM0Buf = [0, 0, 0, 0, 0, 0], resFollowOut = [0, 0, 0, 0, 0, 0], fadeBox = { w: 0, h: 0 };
  const veinsPresent = () => live.veins?.present?.();
  function resFollow() {
    if (!fadeM0 || !live.glM) return null;
    const [a, b, c, d, e, f] = fadeM0, det = a * d - b * c;
    if (!det) return null;
    const ia = d / det, ib = -b / det, ic = -c / det, id = a / det, ie = (c * f - d * e) / det, iff = (b * e - a * f) / det;
    const [A, B, C, D, E, G] = live.glM, o = resFollowOut;   // (now ∘ then⁻¹; written into a kept six, which the fade reads at once)
    o[0] = A * ia + C * ib; o[1] = B * ia + D * ib; o[2] = A * ic + C * id; o[3] = B * ic + D * id; o[4] = A * ie + C * iff + E; o[5] = B * ie + D * iff + G;
    return o;
  }
  // Below Full a canvas pixel spans more of the screen, and the renderer draws the figure at whole canvas pixels (veins-gl whole()):
  // the canvas is moved by the rest, in CSS px, so a pan glides with the labels instead of stepping (review, 30 Oct). At Full nothing
  // is set, as on the live site. (`translate`, not `transform`: the dive scales the canvas by its transform.)
  function subPixel(T) {
    let v = '';
    if (live.vdpr < live.vBase - 1e-9) {
      const fx = T[4] - Math.round(T[4]), fy = T[5] - Math.round(T[5]);
      if (fx || fy) {
        if (fx !== subFx || fy !== subFy || live.vdpr !== subVd) { subFx = fx; subFy = fy; subVd = live.vdpr; subTxt = `${(fx / live.vdpr).toFixed(3)}px ${(fy / live.vdpr).toFixed(3)}px`; }
        v = subTxt;
      }
    }
    if (vCanvas.style.translate !== v) vCanvas.style.translate = v;
    if (live.veins?.overlay) live.veins.overlay.snap = live.vdpr < live.vBase - 1e-9;   // (the overlays drawn in the canvas go at whole pixels with the vessels)
  }
  let subFx = NaN, subFy = NaN, subVd = NaN, subTxt = '';   // (the rest and density the kept text was made for: the text is made again only when they change)
  function easeRes() {
    // (The kept picture is copied onto the canvas before each read of it: the canvas keeps none of its own between frames.)
    if (live.glM && !(live.lz?.isOpen() || live.lz?.covers()) && !live.diveOrig) {
      // (The picture kept for the fade is the figure without the glasses drawn in its canvas: they go back to their own way first, and
      // come back once the fade has ended, frostOn.)
      live.frostHold = true;
      try { live.glassGL?.release(); fadeBox.w = live.boxW; fadeBox.h = live.boxH; fadeOver(vCanvas, resFollow, veinsPresent, live.veins && !live.veins.lost ? live.veins.top : null, fadeBox); } finally { live.frostHold = false; }
      for (let q = 0; q < 6; q++) fadeM0Buf[q] = live.glM[q];
      fadeM0 = fadeM0Buf;
    }
    resizeCanvas();
  }
  // (The canvas's share of its pixels: the setting (or Auto's step), While moving's share during a move, Adapt's step, and at most
  // Size cap's megapixels; never under a tenth of the screen's density.)
  function figShare(w, h, base) {
    let k = (renderSetting() === 'auto' ? live.autoK : renderScale()) * (live.moveLow ? figOpt('move') : 1) * live.adaptK;
    const cap = figOpt('cap') * 1e6, px = w * h * (base * k) ** 2;
    if (cap > 0 && px > cap) k *= Math.sqrt(cap / px);
    return Math.max(0.1, k);
  }
  let resTxtOf = NaN;
  const picNext = [0, 0], picKept = [0, 0];   // (the size asked for now, and the size kept in picNow: two pairs written in place)
  function resizeCanvas() {
    const r = stageBox(), was = live.vdpr;   // (the stage's box, kept by its observer: no layout read on the frame)
    const base = Math.min(2, devicePixelRatio || 1) * QUALITY[live.quality].res;
    live.vdpr = base * figShare(r.width, r.height, base); live.vBase = base;   // (Settings › Figure resolution)
    live.veins?.setLayerScale?.(figOpt('glow'));   // (Figure resolution › Glows: the glow layers' own share)
    if (live.vdpr !== resTxtOf) { resTxtOf = live.vdpr; wrap.dataset.res = live.vdpr.toFixed(2); }   // (the vessel canvas's pixels per CSS pixel, for diagnosis; written when it changes)
    let bw = Math.max(1, Math.round(r.width * live.vdpr)), bh = Math.max(1, Math.round(r.height * live.vdpr));
    const pw = bw, ph = bh;
    // (With the overlays on the GPU (?stageover=gpu) the canvas is at the screen's own density, as the SVG they replace is drawn, and
    // the figure, at its own, upscaled onto it by a plain filtered copy, as the page's compositor upscales a smaller canvas.)
    let full = live.veins?.overlay && (!live.SOFTWARE || OVER_ASK) ? devicePixelRatio || 1 : 0;
    // (The pixel budget holds for that canvas too (figOpt('cap'), 8 MP): on a big external screen at the screen's own density it had been
    // 14.7 MP, the figure upscaled onto it past the budget. Every laptop, iPad and phone is under it, so none of them changes.)
    full = capDensity(full, r.width, r.height, figOpt('cap'));
    let lin = false;
    if (full && live.vdpr < full - 1e-9) { bw = Math.max(1, Math.round(r.width * full)); bh = Math.max(1, Math.round(r.height * full)); lin = !figLab('upscale'); }
    else if (figLab('upscale') && live.veins?.setPicture && !live.SOFTWARE && live.vdpr < base - 1e-9) { bw = Math.max(1, Math.round(r.width * base)); bh = Math.max(1, Math.round(r.height * base)); }
    const pic = bw !== pw || bh !== ph ? picNext : null;
    if (pic) { pic[0] = pw; pic[1] = ph; }
    wrap.classList.toggle('compact', r.height < 600);
    // A notice that changed nothing the buffer holds (same backing size and ratio) leaves the canvas as it is: assigning a
    // width, even the same one, clears every surface drawn on it, and the figure was drawn again in the same task. A box
    // that moved by less than a backing pixel is drawn again on the next frame, as any change is, without the clear.
    if (live.resizeReady && bw === vCanvas.width && bh === vCanvas.height && live.vdpr === was && (pic ? !!live.picNow && pic[0] === live.picNow[0] && pic[1] === live.picNow[1] : !live.picNow) && lin === live.picLin) {
      live.CTM = null;
      if (r.width !== live.boxW || r.height !== live.boxH) { live.boxW = r.width; live.boxH = r.height; live.forceDraw = true; live.stageWake(); }
      return;
    }
    live.boxW = r.width; live.boxH = r.height;
    vCanvas.width = bw; vCanvas.height = bh;
    if (pic || live.picNow) { if (pic) { picKept[0] = pic[0]; picKept[1] = pic[1]; live.picNow = picKept; } else live.picNow = null; live.picLin = lin; live.veins?.setPicture?.(pic, lin); }
    live.CTM = null; live.forceDraw = true; live.stageWake();
    // Resizing clears the canvas, and the organs (the plate) and vessels drawn on it with it: draw
    // them again in the same task. A pinch or a layout change can land after this frame's draw
    // (Safari delivers touches outside the frame loop), and the figure would vanish for a frame.
    if (live.resizeReady && live.F && !live.inUpdate && !(live.lz?.isOpen() || live.lz?.covers())) { live.veinsDirty = true; drawVeins(false, 'resize'); }
  }
  new ResizeObserver(resizeCanvas).observe(wrap);
  // (A change that leaves the canvas's size as it is (Glows alone) still draws the figure again, its glow layers remade.)
  // (Auto's step is taken at once for the view as it stands, so a change goes in one eased step, not by Full and back.)
  if (TIERS_ON) onTierWarm(() => { if (live.veins && !live.veins.lost) live.veins.prepLow?.(TIER_TOP); });   // (the tiers' targets, made between frames)
    // (B3: the lower targets, made between frames a moment after the canvas was sized, so the first moving frame allocates nothing.)
  let lowWarmT = 0;
  const lowWarm = () => { stageScope.clear(lowWarmT); lowWarmT = stageScope.timer(() => { if (live.veins && !live.veins.lost && !inMotion()) live.veins.prepLow?.(TIER_TOP); }, 1500); };
  lowWarm();
new ResizeObserver(lowWarm).observe(wrap);
  return { autoNow, easeRes, moveGaps, noteMoveFrame, resizeCanvas, settleRes, subPixel };
}
