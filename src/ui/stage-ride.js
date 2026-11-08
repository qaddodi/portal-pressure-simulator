// The camera ride: the labels riding a glide, a hand zoom or a carry, drift and carry ends, the settle, the arc room and the follow of a framed move.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { VIEW } from './anatomy.js';
import { lerpInto } from './cam-arc.js';
import { cancelFrame } from './frame.js';
import { cams } from './scene-cam.js';
import { clamp, rideChanged } from './util.js';

export function createRide(st, live) {
  const { applyVT, dpr, labelSettleSoon, refreshCTM, sameView, sceneSet, sceneStart, sitesPaint, stageBox, updateLabels, vCanvas, vbBox, wrap } = st;
  const rideLeaders = (on) => { wrap.classList.toggle('lb-ride', on); rideChanged(); };   // (the leaders' layer fades under it: label-theme.js)
  // (A matrix in stage px, written into a kept six: stagePx is the camera the labels were last laid out under (layCTM keeps it, written in
  // place at each layout); a ride keeps its own copy, and the ride's frame matrix is one more.)
  const stagePxLay = [0, 0, 0, 0, 0, 0], stagePxRide = [0, 0, 0, 0, 0, 0], stagePxNow = [0, 0, 0, 0, 0, 0], rideM6 = [1, 0, 0, 1, 0, 0];
  const stagePxInto = (o, m) => { o[0] = m.a; o[1] = m.b; o[2] = m.c; o[3] = m.d; o[4] = m.e - live.wrapRect.left; o[5] = m.f - live.wrapRect.top; return o; };
  const stagePx = (m) => stagePxInto(stagePxLay, m);
  // (from: the camera the labels were last laid out under, stage px (layCTM); a presenter's glide starts from the camera as it is.)
  function rideStart(from = null) {
    if (live.rideCTM) return true;   // (a move taken over by another: the labels ride on from where they were laid out)
    // (A treatment's catheter keeps the figure's labels on (keep): they ride its glides too. The HVPG catheter hides them: nothing to carry.)
    if (!live.labelRider?.canRide() || (live.cath.st && !live.cath.st.keep) || live.lobuleOn || live.lz?.isOpen() || live.diveT > 0) return false;   // (reduced motion rides too: a label that stays on its point as the figure moves adds no motion of its own; hidden, the names went for every pinch and glide)
    refreshCTM();
    if (from) { for (let q = 0; q < 6; q++) stagePxRide[q] = from[q]; } else stagePxInto(stagePxRide, live.CTM);
    live.rideCTM = stagePxRide;
    rideLeaders(true);
    rideM6[0] = 1; rideM6[1] = 0; rideM6[2] = 0; rideM6[3] = 1; rideM6[4] = 0; rideM6[5] = 0;
    live.labelRider.ride(rideM6);
    return true;
  }
  // The one ride matrix, stage px: the card camera ∘ (the view now over the view the labels were laid out under). A glide moves the view and leaves the card
  // at the identity; a card's zoom moves the card and leaves the view (so the second factor is the identity); a camera-only move is the card alone.
  // Written into a kept six and handed to the labels, in this frame.
  function rideNow() {
    if (!live.rideCTM) return;
    if (!live.CTM) refreshCTM();
    const [a, b, c, d, e, f] = live.rideCTM, n = stagePxInto(stagePxNow, live.CTM), det = a * d - b * c || 1e-9, K = cams.stage.card;
    const i0 = d / det, i1 = -b / det, i2 = -c / det, i3 = a / det, i4 = (c * f - d * e) / det, i5 = (b * e - a * f) / det;   // (where the labels were laid out, inverted)
    rideM6[0] = K.k * (n[0] * i0 + n[2] * i1); rideM6[1] = K.k * (n[1] * i0 + n[3] * i1); rideM6[2] = K.k * (n[0] * i2 + n[2] * i3); rideM6[3] = K.k * (n[1] * i2 + n[3] * i3);
    rideM6[4] = K.k * (n[0] * i4 + n[2] * i5 + n[4]) + K.x; rideM6[5] = K.k * (n[1] * i4 + n[3] * i5 + n[5]) + K.y;
    live.labelRider.ride(rideM6);
  }
  function rideStep() {
    if (!live.rideCTM) return;
    refreshCTM();
    rideNow();
  }
  // (The landing, before the labels are laid out again: they glide on from where they rode.)
  function rideStop() {
    if (!live.rideCTM) return;
    live.rideCTM = null;
    live.labelRider?.rideEnd();
    rideLeaders(false);
  }
  function driftEnd() { if (!live.drifting) return; live.drifting = false; rideLeaders(false); labelSettleSoon(); }
  function camSettle() {
    if (!live.camMove) return;
    live.camMove = false; dpr.carry = false;
    rideStop();
    if (live.F) updateLabels(live.F);
  }
  const camSettleIdle = () => { if (!live.vtGliding) camSettle(); };
  // The viewBox units the stage really shows (the svg meets its viewBox, so the spare room on one axis shows more), and the widest
  // view an arc may pull back to: the whole figure's fit.
  function arcRoom() {
    const b = stageBox(), cw = b.sw, ch = b.sh;   // (the svg's box, kept: no layout read)
    if (!cw || !ch) return null;
    const s0 = Math.min(cw / VIEW.w, ch / VIEW.h), vb = { w: cw / s0, h: ch / s0, cx: VIEW.w / 2, cy: VIEW.h / 2 };
    // (The anatomy's fit zoom as last framed, kept by defaultVT: an arc's frames no longer measure the cards and the figure.)
    return { vb, wMax: vb.w / (live.fitKept || 1) };
  }
  function aimView(fn) {
    live.aiming = true; live.aimed = null;
    try { fn(); } finally { live.aiming = false; }
    const v = live.aimed || (live.vtGliding ? live.vtTarget : live.vt); live.aimed = null;
    return v ? { k: v.k, x: v.x, y: v.y } : null;
  }
  // (The view as it stands, when it stands still at a framing a card's room can be followed from: not mid-glide or push, nor in the
  // lobule, the circuit or a morph or dive.)
  const viewNow = () => (live.following || live.zoomBase || live.vtGliding || live.drifting || live.lobuleOn || live.morphTarget !== 0 || live.morph > 0 || live.diveT > 0 ? null : { k: live.vt.k, x: live.vt.x, y: live.vt.y });
  function followStart(v0, v1) {
    if (!v0 || !v1 || sameView(v0, v1) || !viewNow()) return false;
    cancelFrame(live.vtAnim); driftEnd();
    live.following = true; live.follow0 = { ...v0 }; live.follow1 = { ...v1 };
    // (A camera-only move, 4 Nov 2026, Mohammad: "the whole figure view moves instead of this being a camera only move with everything sticking to
    // their locations": the view stays as it rests and the scene camera carries it from v0 to where v1 puts it, as a card's zoom does (sceneSet);
    // the view takes v1 in the frame the move ends. With no room for that (the GPU figure not up) it is the view's own move, as before.)
    live.followScene = !!(live.veins && !live.veins.lost && live.veins.setScene && live.wrapRect && vCanvas);
    if (live.followScene) { sceneStart(); live.followU = 0; } else live.drifting = true;   // (drifting: the labels ride, see drifting; driftEnd solves them again)
    return true;
  }
  const FOLLOW_V = { k: 1, x: 0, y: 0 };   // (followAt's working view, written in place and read at once)
  function followAt(u) {
    if (!live.following) return;
    const f = clamp(u, 0, 1), a = live.follow0, b = live.follow1;
    if (live.followScene) {
      // (v(f) from v0: screen' = S screen + t, where S = k(f)/k0 and t = (O + s x(f)) - S (O + s x0), O and s the view box's place in the stage.)
      live.followU = f;
      const bx = stageBox(), vb = vbBox, sc = Math.min(bx.sw / vb.width, bx.sh / vb.height), O = bx.sx + (bx.sw - vb.width * sc) / 2 - vb.x * sc, Oy = bx.sy + (bx.sh - vb.height * sc) / 2 - vb.y * sc;
      // (Even on screen: the zoom runs on a log scale and the pan in step with it, as every glide does (lerpInto), so a tuck that also zooms 2x
      // does not run slowly at first and fast at the end.)
      const v = lerpInto(a, b, f, FOLLOW_V), k = v.k, x = v.x, y = v.y, S = k / a.k;
      sceneSet(S, O + sc * x - S * (O + sc * a.x), Oy + sc * y - S * (Oy + sc * a.y));
      return;
    }
    live.vt = f >= 1 ? { k: b.k, x: b.x, y: b.y } : lerpInto(a, b, f, { k: 1, x: 0, y: 0 });
    applyVT(); live.CTM = null;
    if (live.cath.st) { refreshCTM(); live.cathLabelsSoon(); }
    if (live.sites.list) { refreshCTM(); sitesPaint(); }
    if (live.scan.on) live.scanPaint(); live.dprobePaint();
  }
  return { aimView, arcRoom, camSettle, camSettleIdle, driftEnd, followAt, followStart, rideLeaders, rideNow, rideStart, rideStep, rideStop, stagePx, stagePxInto, stagePxNow, viewNow };
}
