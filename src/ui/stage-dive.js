// The lobule dive and rise: one continuous zoom from a spot in the liver (the camera's compositor scale, the field's bloom, the layers hidden and given back), setLobule and its waits.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { D_SMALL } from './ease.js';
import { PACED, cancelFrame, easeNow } from './frame.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { fadeStop } from './res-fade.js';
import { riseCentre } from './rise-path.js';
import { store } from './store.js';
import { clamp, lerp } from './util.js';
import { OVER_ALL } from './stage-over.js';
import { cams, camAbout, camId } from './scene-cam.js';

import { stageScope } from './stage-scope.js';
export function createDive(st, live) {
  const { applyVT, defaultVT, drawFrame, drawVeins, driftEnd, liverBox, lobuleBackstop, lobuleStep, nextFrame, refreshCTM, riseVT, sameView, spleenMoving, svg, syncSemantic, update, updateLabels, vCanvas, worldToLocal, wrap } = st;
  const DIVEC = cams.stage.dive;   // (the dive's camera, a scene-cam record in canvas px: setDiveScale is its only writer, pushCam hands it to the figure)
  const diveAtBuf = [0, 0];   // (diveAt's pair, written in place)
  const DIVE_MS = 2200, RISE_MS = 1300;
  // The anatomy's share of the zoom (×16), the field's the rest: the camera goes deep into one part of the liver, its vessels still
  // drawn, before any lobule shows (Mohammad, 24 Oct, on an iPad: at ×5 the liver and its portal branches still filled the screen as
  // the lobules came in). RH: a lobule's radius on screen (px) at that zoom, about true to scale, a lobule (1 to 1.5 mm) being about
  // 1/130 of the liver's width (6 px at ×5). The whole dive stays about ×140 on a phone and ×230 on a Mac.
  const LC = Math.log(16);
  const RH = 19;
  // The hand-over from the anatomy to the field, on the zoom: the field starts to come in at FIELD_IN and is whole (opaque) at
  // FIELD_WHOLE, where the magnified anatomy under it is hidden. About two octaves of zoom (×4.7), so it takes about a third of a
  // second at the dive's fastest instead of a sixth: the lobules came in, and the anatomy's vessels went, all at once (Mohammad, 25 Oct).
  const FIELD_IN = LC - 1.2, FIELD_WHOLE = LC + 0.35;
  // (The zoomed layers, in one kept list written in place: the callers loop over it at once and never keep it.)
  const diveZoomBuf = [], diveAllBuf = [];
  // The GPU draws the whole figure (the vessels, the organs' plate), its overlays when they are all on it, and the labels as sprites: the
  // page's layers then show nothing the canvas does not, and are not scaled at all (Safari re-rasterised three screen-sized bitmaps at each
  // scale), only hidden as the dive starts. Lite, or a context not holding the plate, keeps the CSS zoom.
  const diveGpu = () => !!live.veins && !live.veins.lost && wrap.classList.contains('gl-on') && wrap.classList.contains('gl-plate');
  const overOnGPU = (over) => !!over && over.classList.contains(OVER_ALL);
  // (Every layer the dive touches, in one kept list; diveZoomEls is those it zooms.)
  const diveEls = () => {
    const b = diveAllBuf, over = wrap.querySelector('#stageOver'), lab = wrap.querySelector('#labels');
    b.length = 0;
    if (svg) b.push(svg);
    if (over) b.push(over);
    if (lab) b.push(lab);
    if (vCanvas) b.push(vCanvas);
    return b;
  };
  const diveZoomEls = () => {
    const all = diveEls(), b = diveZoomBuf, gpu = diveGpu();
    b.length = 0;
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (gpu && el !== vCanvas && (el.id !== 'stageOver' || overOnGPU(el))) continue;   // (el === svg has no id of its own to match: the overlay is the one with the id)
      b.push(el);
    }
    return b;
  };
  // The page's layers the GPU stands in for, hidden for the dive (not scaled); the labels' own layer follows its fade (setDiveHidden).
  let domHid = false;
  const domOnGPU = (el) => el !== vCanvas && el.id !== 'labels' && (el.id !== 'stageOver' || overOnGPU(el));
  function setDomHidden(on) {
    if (on === domHid) return;
    domHid = on;
    const all = diveEls();
    for (let i = 0; i < all.length; i++) if (domOnGPU(all[i])) all[i].style.visibility = on ? 'hidden' : '';
  }
  // Each zoomed layer's offset in the stage, for its zoom's origin. From the boxes, not offsetLeft/Top: an SVG has none, and its origin
  // would fall back to its own centre, so the overlays (stents, the Doppler's glow) drifted from the anatomy as it zoomed. Read when a
  // dive or rise is asked for (setLobule, an input or a slide's change), never in the zoom's frames.
  const diveOffs = new Map();
  const diveOffPool = [[0, 0], [0, 0], [0, 0], [0, 0]], DIVE_ORIGIN_ZERO = [0, 0];   // (one pair per zoomed layer, written in place; the layers are four at most)
  function diveOffsRead() {
    const w0 = wrap.getBoundingClientRect();
    diveOffs.clear();
    const els = diveZoomEls();
    for (let i = 0; i < els.length; i++) { const el = els[i], r = el.getBoundingClientRect(), o = diveOffPool[i]; o[0] = r.left - w0.left; o[1] = r.top - w0.top; diveOffs.set(el, o); }
  }
  const diveTargetPt = [0, 0];   // (the dive's spot in the liver, written in place; its callers read it at once)
  function diveTarget() {
    const lb = liverBox();
    if (!lb) return null;
    diveTargetPt[0] = lb.x + lb.w * 0.42; diveTargetPt[1] = lb.y + lb.h * 0.5;
    return diveTargetPt;
  }
  const smoothT = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function setDiveHidden(on, lab = on) {
    lab = !!(on || lab);
    if (on === live.diveHid && lab === live.labHid) return;
    live.diveHid = on; live.labHid = lab;
    const els = diveEls();
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (domHid && domOnGPU(el)) continue;   // (hidden for the whole dive by setDomHidden)
      // (The lobule is drawn in the figure's own canvas: hiding that canvas hid the lobule and its field with it, black until the dive settled. The figure's alpha, camDive, hides the anatomy there.)
      if (el === vCanvas && live.lz?.shared) { el.style.visibility = ''; continue; }
      el.style.visibility = (el.id === 'labels' ? lab : on) ? 'hidden' : '';
    }
    live.labelGL?.check();   // (the label layer shown or hidden: label-gl.js check)
  }
  // The anatomy is out of sight: under the landed lobule (or the sinusoid), or under the dive's field once it is whole. Until then,
  // through the start of a dive and the end of a rise, it shows, magnified, and goes on following the patient as it does anywhere:
  // the ascites filling, a varix growing, the liver changing play on through the zoom (Mohammad, 30 Oct: they paused while the
  // view zoomed into or out of the lobule, and went on once it landed).
  // (Only with the changing organs painted live: otherwise an ease drops the organs' picture for the live SVG, which Safari, scaled by
  // the dive, drew without its masked groups (the stomach, the gut). There the anatomy holds through the dive as before.)
  const anatCovered = () => (live.lobuleOn && live.diveT >= 1) || !!live.lz?.isOpen() || !!live.lz?.covers() || (live.diveHid && live.diveT > 0 && live.diveT < 1) || (live.lobuleOn && !live.liveOn());
  function pushCam() {
    if (!live.veins || live.veins.lost) return;
    const sx = vCanvas.width / (live.boxW || vCanvas.width || 1), sy = vCanvas.height / (live.boxH || vCanvas.height || 1);
    // (Landed in the lobule drawn in this renderer's own context: the figure under it is not laid at all, as #veins was hidden before.)
    live.veins.setCameraRec(DIVEC.k, DIVEC.x * sx, DIVEC.y * sy, live.lobIn ? 0 : live.camDive * live.camShow);
  }
  function camShowStep(now) {
    live.camShowRaf = 0;
    const u = Math.min(1, (now - live.camShowT0) / D_SMALL), e = u * u * (3 - 2 * u);
    live.camShow = live.camShowFrom + (live.camShowTo - live.camShowFrom) * e;
    pushCam();
    if (u < 1) live.camShowRaf = drawFrame(camShowStep);
  }
  // (The figure's own fade, the first framing and a hide: eased over the same D_SMALL the canvas's CSS transition had, as an alpha.)
  function camShowTo_(to) {
    if (live.camShowTo === to && (live.camShowRaf || live.camShow === to)) return;
    live.camShowFrom = live.camShow; live.camShowTo = to; live.camShowT0 = performance.now();
    if (live.camShowRaf) cancelFrame(live.camShowRaf);
    if (reduceMotion.matches) { live.camShow = to; live.camShowRaf = 0; pushCam(); return; }
    live.camShowRaf = drawFrame(camShowStep);
  }
  function setDiveFade(o) {
    const q = o === null ? null : Math.round(o * 1000) / 1000;   // (o is 0 or 1 here; to the thousandth, with no string made)
    if (q === live.diveFadeO) return;
    live.diveFadeO = q;
    fadeStop(vCanvas);   // (a resolution fade gives the canvas's opacity back to the dive at once: both set it, and its copy does not zoom)
    const els = diveEls();
    for (let i = 0; i < els.length; i++) { const el = els[i]; if (el.id === 'labels') continue; if (el === vCanvas) { live.camDive = q === null ? 1 : q; pushCam(); continue; } el.style.transition = q === null ? '' : 'none'; el.style.opacity = q === null ? '' : q; }
  }
  // (keep: landed in the lobule, the anatomy stays hidden under it a moment longer, see diveFrame.)
  let unhideAt = 0;
  // The zoomed layers and the origin each is scaled about: one list, its pairs kept and written in place. (diveOrig is that list while a dive
  // is on, null otherwise; the list stays as it was after the dive, for the layer hint's drop a frame later.)
  const diveOrigBuf = [], diveOrigPool = [[null, ''], [null, ''], [null, ''], [null, '']];
  const diveWillOff = () => {
    if (live.diveOrig) return;
    for (let i = 0; i < diveOrigBuf.length; i++) { const el = diveOrigBuf[i][0]; el.style.willChange = ''; el.style.transform = ''; }
  };
  const diveUnhide = () => { if (live.diveT >= 1 && live.lobuleOn) { setDomHidden(false); setDiveHidden(false, false); setDiveFade(null); } };
  function setDiveScale(k, keep = false) {
    if (k <= 1.0001) {
      if (!keep) { setDomHidden(false); setDiveHidden(false, false); setDiveFade(null); }
      // The transform goes first and the layer hint a frame later: dropping both at once can leave the
      // browser showing the last zoomed picture while clicks already land on the unzoomed figure.
      if (live.diveOrig) { for (let i = 0; i < live.diveOrig.length; i++) { const el = live.diveOrig[i][0]; if (el === vCanvas) continue; el.style.transform = 'none'; el.style.transformOrigin = ''; } camId(DIVEC); pushCam(); nextFrame(diveWillOff); }
      // The stage's measured box (and so the drawing transform) may have been taken while the dive's zoom
      // was on, which would keep the canvas drawn zoomed in after it ends: measure again.
      if (live.diveOrig) { live.box = null; live.CTM = null; }
      live.diveOrig = null; return;
    }
    if (!live.diveOrig) {
      const [ox, oy] = live.diveAt;
      // (The layers' offsets in the stage were read as the dive was asked for (diveOffsRead), outside any frame; a layer not
      // read then stands at the stage's corner, as all of them do.)
      const els = diveZoomEls(), b = diveOrigBuf;
      b.length = 0;
      for (let i = 0; i < els.length; i++) { const el = els[i], d = diveOffs.get(el) || DIVE_ORIGIN_ZERO, pr = diveOrigPool[i]; pr[0] = el; pr[1] = `${(ox - d[0]).toFixed(1)}px ${(oy - d[1]).toFixed(1)}px`; b.push(pr); if (el === vCanvas) { live.camOx = +(ox - d[0]).toFixed(1); live.camOy = +(oy - d[1]).toFixed(1); } }
      live.diveOrig = b;
      for (let i = 0; i < b.length; i++) { const el = b[i][0]; if (el === vCanvas) continue; el.style.willChange = 'transform'; el.style.transformOrigin = b[i][1]; }
      fadeStop(vCanvas);   // (likewise: the copy laid over the canvas would stand still while the dive zooms it)
    }
    const tf = `scale(${k.toFixed(4)})`;
    for (let i = 0; i < live.diveOrig.length; i++) { const el = live.diveOrig[i][0]; if (el !== vCanvas) el.style.transform = tf; }
    camAbout(DIVEC, k, live.camOx, live.camOy); pushCam();
  }
  // The anatomy's labels through a dive and a rise are part of the figure: each pinned label, its dot and its leader are drawn at its point under
  // the dive's own camera record (stage-label-host.js camOut, the record veins-gl draws the figure under), the few with no point ride the same
  // matrix (label-gl ride, zone titles left out as for a card's zoom), and their layer shows exactly as much as the anatomy shows through the
  // field (1 - its cover, on the zoom, never a clock), so on a rise they are on the figure for its whole last stretch, moving with it; no fade
  // at the landing. (Mohammad, 4 Nov 2026, "labels show up too early, wrong place, in place while zoom is zooming out": pinned under the rest
  // camera alone they stood at their landed places over a figure still magnified; f4f2c22 then hid them for the rise and faded them in after it.)
  const diveRideM = [1, 0, 0, 1, 0, 0];
  let labOpTxt = null;   // (the layer's opacity text as written: written only when it changes)
  function labelsRide(lab, t, cover) {
    const op = t <= 0 ? '' : t >= 1 ? '0' : (1 - cover).toFixed(3);
    if (lab && op !== labOpTxt) { labOpTxt = op; lab.style.opacity = op; lab.style.transition = t > 0 && t < 1 ? 'none' : ''; live.labelGL?.check(); }   // (its own CSS fade off while the zoom drives it: a fade lagged the figure)
    const r = live.labelRider;
    if (!r || live.rideCTM) return;   // (a card's zoom owns the ride; none during a dive)
    if (DIVEC.k > 1.0001 && t > 0 && t < 1) { diveRideM[0] = DIVEC.k; diveRideM[3] = DIVEC.k; diveRideM[4] = DIVEC.x; diveRideM[5] = DIVEC.y; r.ride(diveRideM); }
    else if (r.riding) { r.rideEnd(); r.pinDraw(); }
  }
  const diveFrom = [0, 0], diveTo = [0, 0];   // (the rise's two ends, written in place for riseCentre)
  const diveField = { a: 0, x: 0, y: 0, r: 0, ox: 0, oy: 0, quiet: 0, focus: 0, blur: 0, dof: 0 };   // (the field's state for lz.setDive, written in place)
  function diveFrame(t) {
    live.stageWake();   // (C5: a dive or rise frame wakes a figure asleep under the lobule, which no longer looks once a second: stage-idle.js sleep)
    if (live.diveAt && live.diveLand) {
      // The whole zoom in one log scale. The lobule's place is read live, so the field settles exactly
      // where the view frames it.
      if (live.lz.isShown()) live.diveLand = live.lz.current();
      else if (live.lobuleOn) live.lz.warm();
      const lt = LC + Math.log(Math.max(RH * 2, live.diveLand.r) / RH);
      // Eased in and out (smootherstep), one ease over the whole log scale: the anatomy's part and the field's run on at the same
      // speed where they meet. (Each part had its own rate, so the zoom sped up by a sixth or more, suddenly, a third of the way in.)
      // (riseFast: a way out of the landed lobule moves from its first frame; the dive's ease starts at rest and held the lobule
      // still for its first 120-160 ms. A reversal keeps the curve it was on, so nothing jumps.)
      // (A sine ease: from rest and back to rest, its fastest a sixth slower than the smootherstep's, which passed the hand-over at
      // its peak speed.)
      const TJ = live.riseFast ? 1 : 0.84, u = clamp(t / TJ, 0, 1);
      const p = live.riseFast ? u * u * (2 - u) : (1 - Math.cos(Math.PI * u)) / 2;
      const z = lt * p;
      live.diveZ = z;
      // Landed in the lobule: the anatomy under it is shown again only once the lobule has settled and its flow marks have
      // faded in. (Shown in the landing frame, Safari redrew the whole figure there, with everything else the landing does.)
      const landed = t >= 1 && !live.diveOut;
      setDiveScale(t >= 1 ? 1 : Math.exp(Math.min(z, LC + 0.4)), landed);
      if (landed) { stageScope.clear(unhideAt); unhideAt = stageScope.timer(diveUnhide, 500); }
      // The anatomy stays whole under the field as it fades in (and out, on the way back), and is hidden only once the field covers
      // it. (Faded out on the field's curve, the two half-clear layers let the page through, about a fifth of it, for a fifth of a
      // second as the field took over: a dark flash zooming in, in dark mode, Mohammad, 24 Oct. Zooming out it fell where the field
      // itself was already fading into the page, so it did not show.)
      setDiveFade(t <= 0 ? null : landed ? 0 : 1);
      const lab = wrap.querySelector('#labels');
      // The detailed lobule comes in while the zoom is still settling, zooming with the field.
      const r = RH * Math.exp(z - LC);
      const [ox, oy] = live.diveAt;
      // Going in, the zoom's centre drifts from the dive point to the lobule's place. Going out (riseLine), one straight pull-out:
      // the lobule is scaled about one fixed point, so it leaves its place in step with the zoom and ends on the dive point, with
      // no sideways pan across it first (rise-path.js).
      const g = smoothT(LC - 0.5, lt, z);
      let px, py;
      if (live.riseLine) { diveFrom[0] = live.diveLand.x; diveFrom[1] = live.diveLand.y; diveTo[0] = ox; diveTo[1] = oy; const c = riseCentre(diveFrom, diveTo, Math.exp(-lt), Math.exp(z - lt)); px = c[0]; py = c[1]; }
      else { px = lerp(ox, live.diveLand.x, g); py = lerp(oy, live.diveLand.y, g); }
      // The detailed lobule rides on the field's own lobule at that centre, so it grows out of it.
      live.lz.setDiveZoom(t >= 1 ? 1 : clamp(r / live.diveLand.r, 0.05, 1), live.diveLand.x, live.diveLand.y, px, py, !!live.diveOut);
      // (The field's state is one kept object written in place: lobule-zoom.js reads it at once and keeps none of it.)
      const df = diveField;
      if (t <= 0 || t >= 1) { live.lz.setDive(null); labelsRide(lab, t, t >= 1 ? 1 : 0); }
      else {
        // The field comes in only over the anatomy's last stretch (×5 to ×23, its lobules a fine grain a few px across), whole
        // where the anatomy is hidden; its neighbours drain and fade into the page only once it is whole, toward the landing, so the
        // grain fills the screen first. (On the zoom, not the clock: the way out passes the same pictures in reverse.)
        df.a = smoothT(FIELD_IN, FIELD_WHOLE, z); df.x = px; df.y = py;
        df.r = r; df.ox = ox; df.oy = oy; df.quiet = smoothT(lerp(FIELD_WHOLE, lt, 0.4), lt, z); df.focus = smoothT(FIELD_WHOLE, lt, z);
        // A focus pull: the field comes in soft, the liver's grain, and sharpens into lobules as it becomes whole; and a depth of
        // field: the lobules away from the one being landed on stay a little soft through the zoom, sharp again as it lands, where
        // the lobule view's own surround takes over (GPU only: lobule-zoom.js paintFieldGL).
        df.blur = 1 - smoothT(FIELD_IN, FIELD_WHOLE + 0.3, z); df.dof = smoothT(FIELD_IN + 0.3, FIELD_WHOLE + 0.6, z) * (1 - smoothT(lt - 0.9, lt, z));
        live.lz.setDive(df);
        labelsRide(lab, t, df.a);   // (the labels show through the field as the anatomy does, and ride the zoom with it)
      }
      // Once the field is whole (fully opaque, from z = FIELD_WHOLE) the magnified anatomy beneath it is not seen: it is hidden, so the
      // browser stops compositing it (Safari redraws a scaled SVG at each new scale, every frame); the labels as soon as they have faded.
      if (!landed && diveGpu()) setDomHidden(t > 0 && t < 1);
      if (!landed) setDiveHidden(t > 0 && t < 1 && z >= FIELD_WHOLE, !!lab && t > 0 && t < 1 && +labOpTxt <= 0.001);
    }
    live.lobU = live.easeInOut(clamp((t - 0.48) / 0.4, 0, 1));
    syncSemantic();
  }
  // Next-view pre-render: at prepRise the covered anatomy is taken to the rise's fit unseen and brought up to date there, so the tap has no
  // refit or catch-up to do (preVT/preF: that fit and model frame; anything else moved, the tap does it all. zShift keeps the dive's zoom whole).
  let preVT = null, preF = null;
  function preFit() {
    preVT = null; preF = null;
    if (!liverBox() || live.vtGliding || live.lz?.sinBusy?.() || document.getElementById('app')?.classList.contains('sin-focus')) return false;
    refreshCTM(); const zOld = Math.log(live.CTM.sc) + live.zShift;
    const d = defaultVT(false); live.vt = { ...d }; live.homeAt = d; live.fitted = true; applyVT(); live.CTM = null; refreshCTM();
    live.zShift = zOld - Math.log(live.CTM.sc);
    preVT = { ...live.vt };
    return true;
  }
  function prepRise() {
    if (!live.lobuleOn || live.diveT < 1 || live.morphTarget !== 0 || live.risePrep) return;
    live.risePrep = true; stageScope.clear(live.risePrepT); live.risePrepT = stageScope.timer(() => { live.risePrep = false; }, 6000);   // (never left on in the lobule)
    const fit = preFit();
    if (live.F && !live.inUpdate) { live.catchUp = fit; try { update(live.F); } finally { live.catchUp = false; } if (fit) preF = live.F; }
    if (preF) preDraw();
    live.platePoke();
  }
  // The vessels drawn ahead for that fit, their trimmed targets made again: the lobule's pass covers the canvas (the figure's alpha is 0
  // under it), so nothing shows, and the rise's first frame finds the layer drawn for its view and only lays it. (The warm window starts
  // again: a rise that never comes gives them back as before.)
  function preDraw() {
    if (!live.veins || live.veins.lost || !live.lz?.isOpen() || !live.lobIn && !live.diveHid) return;
    live.veinsHold?.drop(); live.veinsHold = null; live.veinsTrimmed = false; live.hiddenAt = 0;
    drawVeins(true, 'rise ahead');
  }
  // The organs' picture is made for the patient now (prepRise is done: it ends when that picture lands), or there is none to wait for.
  function riseReady() {
    if (!live.risePrep || !live.F || !live.veins || live.veins.lost || !live.glWanted(live.easeInOut(live.morph)) || live.figureHidden() || !live.lobuleOn) return true;
    // (With the changing organs painted live, the picture holds none of them: the rise sets off while the fluid, the liver or the
    // spleen still ease, and they go on easing in view as it zooms out, drawn live, rather than finishing unseen first.)
    return live.plateOn() && !live.plateBusy && (live.liveOn() || (!live.lvMoving && !live.fluidEasing() && !spleenMoving())) && live.plateKey === live.plateStateKey();
  }
  function setLobule(on, painted = false) {
    if (on && live.morphTarget !== 0) return;
    live.risePrep = false; stageScope.clear(live.risePrepT);
    if (on) { preVT = null; preF = null; }   // (a fit made ahead holds only for the rise it was made for)
    if (live.diveWait) { live.diveWait = 0; live.diveGen++; }   // (any other ask calls a waiting dive off; a dive asked again waits afresh)
    const from0 = live.diveT;
    live.diveOut = !on;
    if (on) { live.riseBox = null; live.riseUsed = false; }
    if (live.lobuleOn === on && live.diveT === (on ? 1 : 0)) return;
    // Into the lobule for a new patient: its tissue bitmap is painted in the worker first (lz.paintAhead), so the frame the zoom
    // starts in does not paint it on the main thread (1.8 s on CI's laptop profile, HVPG 5 to 6). The anatomy stays as it is
    // meanwhile (nothing is set: lobuleOn waits too), the slide's words still coming in; the dive then starts as before.
    if (on && live.diveT === 0 && !painted) {
      const ahead = live.lz?.paintAhead?.();
      if (ahead) {
        const gen = ++live.diveGen;
        live.diveWait = gen;
        ahead.then(() => { if (live.diveWait === gen && !live.lobuleOn && live.diveT === 0) { live.diveWait = 0; if (store.get().lobule) setLobule(true, true); } });
        return;
      }
    }
    live.lobuleOn = on;
    live.logMove({ t: performance.now(), kind: on ? 'dive' : 'rise' });
    cancelFrame(live.lobAnim);
    if (on && live.diveT === 0) {
      live.riseFast = false; live.riseLine = false;
      const w = diveTarget();
      if (w) {
        refreshCTM();
        const [x, y] = worldToLocal(w[0], w[1]);
        diveAtBuf[0] = clamp(x, 0, wrap.clientWidth); diveAtBuf[1] = clamp(y, 0, wrap.clientHeight); live.diveAt = diveAtBuf;
      } else { diveAtBuf[0] = wrap.clientWidth / 2; diveAtBuf[1] = wrap.clientHeight / 2; live.diveAt = diveAtBuf; }
      diveOffsRead();
      live.diveLand = live.lz.landing();
      live.lz.prewarm(live.diveLand.r);
      live.lz.stage();   // the lobule is drawn now, for where it lands, and only then does the zoom start (its clock starts below)
    } else if (!on && live.diveT >= 1) {
      live.riseLine = true;   // (kept through a reversal, so the lobule stays on the line it was on)
      diveOffsRead();
      live.riseFast = true;
      live.lz.stageRise();   // (out of a zoomed-in lobule: its whole copy is drawn now, before the rise's clock starts)
      live.diveLand = live.lz.current();
      // The anatomy is covered by the lobule at this point: take it to its fit framing now, unseen, so the way out is one
      // continuous zoom from the lobule's fit to the anatomy's fit, with no correction after it lands.
      if (live.morphTarget === 0 && liverBox()) {
        // Leaving from the sinusoid, its focus class (main.js) still hides the dock and bars until the store's other
        // listeners run: drop it first, or the fit is measured without them and lands too close, cutting off the ascites.
        if (!store.get().lobule) document.getElementById('app')?.classList.remove('sin-focus');
        cancelFrame(live.vtAnim); driftEnd(); live.vtGliding = false;
        refreshCTM(); const zOld = Math.log(live.CTM.sc) + live.zShift;   // (zShift: an unseen refit made ahead, preFit)
        const d = defaultVT(false);
        const ahead = !!preVT && sameView(preVT, live.vt) && sameView(d, live.vt) && !!live.F && preF === live.F;
        preVT = null; preF = null;
        if (!ahead) {
          live.vt = { ...d }; live.homeAt = d; live.fitted = true; applyVT(); live.CTM = null; refreshCTM();
          // The plate stopped updating under the lobule, so it still holds the old zoom's culling and detail: bring it up to date for the fit now, not when the zoom lands.
          if (live.F && !live.inUpdate) { live.catchUp = true; try { update(live.F); } finally { live.catchUp = false; } }
        } else { live.homeAt = d; live.fitted = true; }
        // The next slide's own framing, if it asked for one: the rise lands there, not at the fit.
        const rv = riseVT();
        live.riseUsed = !!rv && !sameView(rv, d);
        if (live.riseUsed) { live.vt = { ...rv }; applyVT(); live.CTM = null; refreshCTM(); if (live.F && !live.inUpdate) { live.catchUp = true; try { update(live.F); } finally { live.catchUp = false; } } }
        live.zShift = zOld - Math.log(live.CTM.sc);
        const w = diveTarget(); if (w) { const [x, y] = worldToLocal(w[0], w[1]); diveAtBuf[0] = clamp(x, 0, wrap.clientWidth); diveAtBuf[1] = clamp(y, 0, wrap.clientHeight); live.diveAt = diveAtBuf; }
        diveOffsRead(); live.diveOrig = null; live.drawOnce = live.forceDraw = true;   // the vessel canvas is frozen for the zoom: redraw it now at the fit, not the old camera
        if (live.F) updateLabels(live.F);   // the labels are laid out for the final framing now, so they come in where they will stay
      }
    }
    // (Lite mode: no zoom, the figure fades in at the lobule or the anatomy.)
    // A reversal mid-way glides back from where it is, at the speed of the move it turns round (eased from rest, not at full speed at once).
    const turn = from0 > 0 && from0 < 1, from = live.diveT, to = on ? 1 : 0;
    const ms = reduceMotion.matches ? 0 : turn ? (on ? RISE_MS : DIVE_MS) : on ? DIVE_MS : RISE_MS;
    // (Timed by the eases' clock, frame.js easeNow: a long frame mid-zoom holds it back rather than letting it leap ahead. The backstop
    // below passes `end` to land it.)
    const t0 = PACED ? easeNow() : performance.now();
    live.lobOn = on; live.lobFrom = from; live.lobTo = to; live.lobTurn = turn; live.lobMs = ms; live.lobT0 = t0; live.lobSeen = -1;
    lobuleStep(t0);
    // Backstop: if the frames stop (a throttled or dropped frame loop), land on the end state anyway.
    stageScope.clear(live.lobEnd);
    // (With the eases' clock a run of long frames makes the zoom take longer: it is landed only once it stops moving, frames having stopped.)
    live.lobEnd = stageScope.timer(lobuleBackstop, ms * Math.abs(to - from) + 250);
  }
  return { anatCovered, camShowTo_, diveFrame, prepRise, pushCam, riseReady, setDiveScale, setLobule };
}
