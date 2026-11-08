// The camera core: the view transform write (flush, apply), the box and safe-side reads, the world transform matrix and the coordinate conversions, the zoom at a point.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { CAM_MS_MAX } from './ease.js';
import { figOpt, noteCamera } from './frame.js';
import { gpuProbe } from './gpu-probe.js';
import { provideStage } from './layout-snap.js';
import { cams, camSet } from './scene-cam.js';
import { clamp } from './util.js';

export function createCamera(st, live) {
  const { CIRC_C, DOT_MIN_PX, animateVT, clampGs, clientToVBFast, flushGeo, geoHeld, haloEls, mapTurn, nd, nextFrame, nodeVerts, onViewChange, placeClampLabels, readFrame, rotDeg, safeInsets, sitesPaint, svg, syncSemantic, updateLabels, vbBox, world, wrap } = st;
  // (Holding 120 Hz §3.10, 2 Nov 2026: input is coalesced. A move, a wheel step or a pinch only sets the view (vt) and asks for the frame;
  // the SVG world's transform is written once, in that frame (flushVT, first thing in syncView), however many events came before it: a
  // trackpad reports a wheel step every few ms, and each wrote two transform attributes. The view's own maths (CTM, clientToVBFast) use
  // vt, never the attribute; a reader of the attribute's matrix (clientToWorld) flushes first.)
  let vtDirty = false;
  const flushVT = () => {
    if (!vtDirty) return;
    vtDirty = false;
    const deg = rotDeg(), tr = `translate(${live.vt.x} ${live.vt.y}) scale(${live.vt.k})${deg ? ` rotate(${deg.toFixed(3)} ${CIRC_C[0]} ${CIRC_C[1]})` : ''}`;
    mapTurn(deg);
    world.setAttribute('transform', tr);
    live.worldOver?.setAttribute('transform', tr);
  };
  const applyVT = () => {
    vtDirty = true; noteCamera();
    syncSemantic();
    live.CTM = null; live.viewVersion++; live.stageWake();
    live.viewHook?.();   // (the scope view's lens hides while the figure moves: scope-lens.js)
    // (While moving: the first step of a move drops the canvas to its moving share, once; it is back at rest when the view settles.)
    // (Not for the lobule's own moves: the unseen refit as a rise begins is no move of the viewer's, and dropping the share there
    // showed the whole rise soft, then faded back up partway through it.)
    if (live.resizeReady && !live.moveLow && figOpt('move') < 1 && !(live.diveT > 0)) { live.moveLow = true; live.easeRes(); live.settleRes(); }
    if (!live.viewRaf) live.viewRaf = nextFrame(syncView);
  };
  const syncLabelsRun = () => updateLabels(live.F), syncCardsRun = () => onViewChange?.();   // (made once: the probe is handed the same functions each frame)
  function syncView() {
    live.viewRaf = 0;
    flushVT();
    if (!live.F || live.lz?.isOpen()) return;
    refreshCTM();
    gpuProbe.time(null, 'labels (script)', syncLabelsRun);
    if (live.cath.st) live.cathLabelsSoon();
    // (updateLabels ends by painting the callouts and both probes, unless a camera glide held the labels back: they are painted here
    // only then, not a second time, whose reads came after the first paint's writes.)
    // (Nor while a glide runs: its own step paints them in this frame, after it has moved the view; painted here too, each was laid
    // out twice a frame, first at the view before the step. ?glidepaint=0: twice, as before.)
    if (!live.labelPainted && !live.vtGliding) {
      if (live.sites.list) sitesPaint();
      if (live.scan.on) live.scanPaint();
      live.dprobePaint();
    }
    // (Not while the camera zooms with a card: the cards are the ones moving it, and each frame's cards-follow pass was script per frame of the zoom.)
    if (!live.zoomBase) gpuProbe.time(null, 'cards follow (script)', syncCardsRun);
    // (The zoom pill reads it: at full ink while the view is away from its fit, quiet at home on a pointer device; app.css .off-home.)
    wrap.classList.toggle('off-home', !!live.homeAt && !live.sameView(live.vt, live.homeAt));
  }
  applyVT();
  const measureBox = () => {
    // Measured without the lobule dive's zoom (a CSS scale on the svg), or the vessels would be drawn zoomed twice.
    const tf = svg.style.transform; if (tf) svg.style.transform = '';
    const r = wrap.getBoundingClientRect(), q = svg.getBoundingClientRect();
    if (tf) svg.style.transform = tf; live.box = live.boxKept = { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom, sx: q.left - r.left, sy: q.top - r.top, sw: q.width, sh: q.height }; };
  // (1 Nov 2026, "Move everything to GPU": measured as the stage is made, when its size changes (the observer's callback, after the
  // browser's own layout) and first in the frame after a resize or a scroll that may have moved it (readFrame); never inside a frame's
  // writes. Until then the last box serves.)
  let boxAsk = 0;
  // (The read itself is its own function, handed to the read phase and called from nowhere else.)
  function boxRead() { boxAsk = 0; if (!live.box) { measureBox(); live.CTM = null; } }
  // (One read already asked for: a second call (stageBox while the box is still out) must not drop the transform refreshCTM has just
  // built from the kept box: the lobule's close threw on CTM.a in updateLabels.)
  const boxAgain = () => { if (boxAsk) return; live.box = null; live.CTM = null; boxAsk = readFrame(boxRead); };
  const stageBox = () => { if (!live.box) boxAgain(); return live.box || live.boxKept; };
  measureBox();
  new ResizeObserver(() => { measureBox(); live.CTM = null; live.viewHook?.(); }).observe(wrap);   // (the scope view's lens keeps to its ring through a resize too)
  addEventListener('resize', boxAgain);
  // (Only a scroll that can move the figure: the page's, or a box holding it. A card's own list scrolling (Treat, Tests, a menu) left the
  // box dropped, so the next model frame measured the whole figure again after writing it, on every frame of the scroll.)
  addEventListener('scroll', (e) => { const t = e.target; if (t === document || t === window || t?.contains?.(wrap)) boxAgain(); }, true);
  // The screen's left and right safe-area insets (a notched phone held sideways, 47 to 59 px), read once from a zero-size probe (an
  // unregistered custom property hands env() back unresolved) and again after a resize or a turn. Zero everywhere else.
  // (Read as the stage is made and after a resize or a turn, in those events: never on a frame.)
  let saSnap = null;
  const saRead = () => {
    {
      const p = document.createElement('div');
      p.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none;padding:0 env(safe-area-inset-right,0px) 0 env(safe-area-inset-left,0px)';
      document.body.append(p);
      const cs = getComputedStyle(p);
      saSnap = { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0 };
      p.remove();
    }
  };
  saRead();
  addEventListener('resize', saRead);
addEventListener('orientationchange', saRead);
  const saSides = () => saSnap;
  // (The page's layout snapshot (layout-snap.js) holds these three for the rest of the app: the kept box, the arithmetic matrix, the sides.)
  provideStage({ box: stageBox, ctm: () => { if (!live.CTM) refreshCTM(); return live.CTM; }, sides: saSides });
  let ctmLast = null;
  function refreshCTM() {
    const b = stageBox(), vb = vbBox;
    const s = Math.min(b.sw / vb.width, b.sh / vb.height);
    const ox = b.left + b.sx + (b.sw - vb.width * s) / 2 - vb.x * s, oy = b.top + b.sy + (b.sh - vb.height * s) / 2 - vb.y * s;
    // world → view box: translate(vt) · scale(k) · rotate(θ about the circuit's centre); then the view box → screen.
    const th = (rotDeg() * Math.PI) / 180, co = Math.cos(th), si = Math.sin(th), sk = s * live.vt.k;
    const ma = sk * co, mb = sk * si, mc = -sk * si, md = sk * co, me = ox + s * live.vt.x + sk * (CIRC_C[0] - co * CIRC_C[0] + si * CIRC_C[1]), mf = oy + s * live.vt.y + sk * (CIRC_C[1] - si * CIRC_C[0] - co * CIRC_C[1]);
    // An unchanged view keeps the same object, so the frame loop (which compares it) sees that nothing moved; a new one is made only when it moved.
    if (!(ctmLast && ctmLast.a === ma && ctmLast.b === mb && ctmLast.c === mc && ctmLast.d === md && ctmLast.e === me && ctmLast.f === mf && ctmLast.sc === sk)) ctmLast = { a: ma, b: mb, c: mc, d: md, e: me, f: mf, sc: sk };
    live.CTM = ctmLast;
    // (The stage's base camera record, stage px from the stage's corner, without the circuit's turn: the one place the stage box and vt meet, so the one writer.
    // A resize moves it with no write to vt.)
    camSet(cams.stage.base, s * live.vt.k, ox + s * live.vt.x - b.left, oy + s * live.vt.y - b.top);
    // (A dot keeps at least a 4 px radius on screen however far the map is zoomed out: written where the scale steps a quarter octave.)
    if (sk > 0) { const rm = DOT_MIN_PX / 2 ** (Math.round(Math.log2(sk) * 4) / 4); if (rm !== nd.rmin) { nd.rmin = rm; if (nd.at > 0) nodeVerts(nd.at); } }
    live.wrapRect = b;
    applyClampFs();
  }
  // (A narrowing's "60 %" is drawn in the figure: its size there is that of the labels' names on screen at any zoom, sweep batch 03 at 6–7 px.)
  function applyClampFs() {
    const sk = live.CTM?.sc || 0, cfs = sk > 0 ? (live.clampBase / sk).toFixed(2) : '';
    const csw = sk > 0 ? `${(7 / sk).toFixed(2)}px` : '';   // (the clamps' halo, 7 px on screen: --clamp-sw, app.css)
    if (csw && csw !== live.clampSw) { live.clampSw = csw; for (let i = 0; i < clampGs.length; i++) clampGs[i].style.setProperty('--clamp-sw', csw); }
    if (cfs && cfs !== live.clampFs) { live.clampFs = cfs; for (let i = 0; i < clampGs.length; i++) clampGs[i].style.setProperty('--clamp-fs', `${cfs}px`); placeClampLabels(); }
    // (The pressure-change halos and the shunt's target name: their size on screen at any zoom, as above.)
    const hk = sk > 0 ? (1 / sk).toFixed(3) : '';
    if (hk && hk !== live.haloK) { live.haloK = hk; for (const g of haloEls) g.style.setProperty('--halo-k', hk); }
  }
  function worldToLocal(x, y) {
    if (!live.CTM) refreshCTM();
    return [live.CTM.a * x + live.CTM.c * y + live.CTM.e - live.wrapRect.left, live.CTM.b * x + live.CTM.d * y + live.CTM.f - live.wrapRect.top];
  }
  /** worldToLocal, written into o (a kept pair) rather than made. */
  function worldToLocalInto(o, x, y) {
    if (!live.CTM) refreshCTM();
    o[0] = live.CTM.a * x + live.CTM.c * y + live.CTM.e - live.wrapRect.left; o[1] = live.CTM.b * x + live.CTM.d * y + live.CTM.f - live.wrapRect.top;
    return o;
  }
  // (The inverse: a stage point (local px) as a world point under the camera now.)
  const NO_ANCHOR = /^(lane:|scan|stage|60%:)/, ANCHOR_W = [0, 0];
  function localToWorldInto(o, x, y) {
    if (!live.CTM) refreshCTM();
    const px = x + live.wrapRect.left - live.CTM.e, py = y + live.wrapRect.top - live.CTM.f, det = live.CTM.a * live.CTM.d - live.CTM.b * live.CTM.c;
    if (!det) { o[0] = NaN; o[1] = NaN; return o; }
    o[0] = (live.CTM.d * px - live.CTM.c * py) / det; o[1] = (live.CTM.a * py - live.CTM.b * px) / det;
    return o;
  }
  function clientToWorld(cx, cy) {
    flushVT(); if (geoHeld.size) flushGeo();
    const m = world.getScreenCTM().inverse();
    return [m.a * cx + m.c * cy + m.e, m.b * cx + m.d * cy + m.f];
  }
  function clientToVB(cx, cy) {
    if (geoHeld.size) flushGeo();
    const m = svg.getScreenCTM().inverse();
    return [m.a * cx + m.c * cy + m.e, m.b * cx + m.d * cy + m.f];
  }
  function freeCentre() { const ins = safeInsets(), b = stageBox(); return [b.left + (ins.l + ins.W - ins.r) / 2, b.top + (ins.t + ins.H - ins.b) / 2]; }
  // A zoom step by the buttons (or a double click) glides there instead of jumping, in the time its reach needs (camMs, ease.js).
  function animZoomAt(cx, cy, factor) {
    live.fitted = false; live.handed = !live.lobuleOn;
    if (live.lobuleOn) return;
    const [vx, vy] = clientToVBFast(cx, cy), base = live.vtTarget && live.vtAnim ? live.vtTarget : live.vt;
    const k = clamp(base.k * factor, 0.6, 6), wx = (vx - live.vt.x) / live.vt.k, wy = (vy - live.vt.y) / live.vt.k;
    animateVT({ k, x: vx - wx * k, y: vy - wy * k }, CAM_MS_MAX, { scale: true });
  }
  // A trackpad pinch may stretch a little past the limits (it springs back when it ends).
  function zoomAt(cx, cy, factor, stretch = false) {
    if (live.lobuleOn) return;   // the lobule view has its own zoom
    // (By arithmetic, as a touch pinch does: asking the browser for the matrix (getScreenCTM) after the last event's new transform laid
    // the whole figure out again, on every wheel event of a trackpad pinch, several a frame on a Mac.)
    const [vx, vy] = clientToVBFast(cx, cy);
    const wx = (vx - live.vt.x) / live.vt.k, wy = (vy - live.vt.y) / live.vt.k;
    // (A new view, never the old one changed in place: the first fit sets the view, the home framing and the glide's target outright, and
    // a zoom that changed the one object changed them all, so the home look took the zoomed view for home and glided it back to the fit
    // as soon as a card moved: a pinch in the first seconds after the page opened was undone.)
    const k = stretch ? clamp(live.vt.k * factor, 0.5, 7.2) : clamp(live.vt.k * factor, 0.6, 6);
    live.vt = { k, x: vx - wx * k, y: vy - wy * k };
    applyVT(); live.CTM = null;
  }
  return { ANCHOR_W, NO_ANCHOR, animZoomAt, applyClampFs, applyVT, clientToVB, clientToWorld, flushVT, freeCentre, localToWorldInto, refreshCTM, saSides, stageBox, syncView, worldToLocal, worldToLocalInto, zoomAt };
}
