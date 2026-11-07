// The card zoom: the figure's scene scaled and shifted under a card, its layers, glass and sharpness, and the follow that ends it.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { D_SMALL } from './ease.js';
import { cams, camId, camSet, sceneCam, zoomRide } from './scene-cam.js';

export function createZoom(st, live) {
  const { applyVT, drawVeins, driftEnd, flushVT, refreshCTM, rideNow, rideStart, rideStop, svg, vCanvas, viewNow, wrap } = st;
  const CARD = cams.stage.card;   // (the card camera: sceneSet is its only writer, sceneStop its identity; zoomM6, zoomT and zoomAff are views of it)
  const zoomM6 = [1, 0, 0, 1, 0, 0], zoomT = [0, 0];
  const zoomGlass = [], zoomHid = [], zoomAff = { s: 1, dx: 0, dy: 0, ox: 0, oy: 0 };   // (the callouts' glass bodies given the zoom, and the callouts that go out under the zoomed card; zoomAff: C in client px, written in place each frame, the record the glass reads through zoomRide)
  function zoomOpen() {
    if (live.zoomBase) return false;
    if (live.lobuleOn && live.lz?.zoomOpen) { if (!live.lz.zoomOpen()) return false; live.zoomBase = { lz: true }; live.zoomLz = true; return true; }
    if (!viewNow()) return false;
    sceneStart();
    // (The figure's callouts (the HVPG pressures, a stent's points, the Doppler's readings) are page elements in two of those layers: their glass is drawn
    // from the same camera (zoomRide, scene-cam.js), and one that would end under the zoomed card goes out through the zoom, since a page element cannot be
    // blurred behind the card's glass as the picture is: it showed sharp over the card.)
    zoomGlass.length = 0; zoomHid.length = 0;
    const aim = sceneCam.aim;
    if (aim) {
      const S = aim.s;
      const tx = (aim.ox - live.wrapRect.left) * (1 - S) + aim.dx, ty = (aim.oy - live.wrapRect.top) * (1 - S) + aim.dy;
      const fx = Math.min(0, Math.max(live.wrapRect.width * (1 - S), tx)), fy = Math.min(0, Math.max(live.wrapRect.height * (1 - S), ty));
      const bx = aim.box, pad = 8;
      for (const L of [live.cath.labels, live.sites.el]) {
        if (!L) continue;
        for (const c of L.children) {
          const r = c.getBoundingClientRect();
          if (!(r.width > 0)) continue;
          const l = live.wrapRect.left + S * (r.left - live.wrapRect.left) + fx, t = live.wrapRect.top + S * (r.top - live.wrapRect.top) + fy, rr = l + r.width * S, bb = t + r.height * S;
          if (l < bx.right + pad && rr > bx.left - pad && t < bx.bottom + pad && bb > bx.top - pad) zoomHid.push({ el: c, was: c.style.opacity, tr: c.style.transition });
        }
        for (const g of L.getElementsByClassName('cl-glass')) { zoomRide.set(g, zoomAff); zoomGlass.push(g); }
      }
      for (const h of zoomHid) { h.el.style.transition = `opacity ${D_SMALL}ms var(--ease)`; h.el.style.opacity = '0'; }
      live.frostWake();
    }
    live.zoomBase = { scene: true };
    return true;
  }
  // The scene camera's layers, for a card's zoom and for the readings' card tucking away or coming out (followStart): the figure's page layers are taken
  // (where each stands is read now, before any write: the frames read nothing), and the labels with no station ride by their centres (the leaders' page
  // layer eases out as in a ride).
  function sceneStart() {
    refreshCTM();
    const layers = [svg, wrap.querySelector('#stageOver'), live.cath.labels, live.sites.el].filter(Boolean);
    live.zoomLayers = layers.map((el) => { const r = el.getBoundingClientRect(); return { el, left: r.left, top: r.top }; });
    for (const l of live.zoomLayers) { l.el.style.transformOrigin = '0 0'; l.el.style.transition = 'none'; }
    zoomGlass.length = 0; zoomHid.length = 0;
    rideStart();
  }
  // One frame of the camera: p' = S p + (tx, ty) in stage px. The figure's canvas (canvas px), the page's figure layers (one matrix each), the callouts'
  // glass and the labels, all from the same numbers, in this frame.
  function sceneSet(S, tx, ty) {
    if (!live.zoomLayers || !live.wrapRect) return;
    camSet(CARD, S, tx, ty);
    zoomT[0] = CARD.x; zoomT[1] = CARD.y;
    zoomM6[0] = CARD.k; zoomM6[3] = CARD.k; zoomM6[4] = CARD.x; zoomM6[5] = CARD.y;
    live.zoomM = zoomM6;
    zoomAff.s = S; zoomAff.dx = live.wrapRect.left * (1 - S) + tx; zoomAff.dy = live.wrapRect.top * (1 - S) + ty;
    const sx = vCanvas.width / (live.boxW || vCanvas.width || 1), sy = vCanvas.height / (live.boxH || vCanvas.height || 1);
    if (live.drawCam && (Math.abs(live.drawCam[0] - S) > 1e-4 || Math.abs(live.drawCam[4] - tx) > 0.01 || Math.abs(live.drawCam[5] - ty) > 0.01)) zoomSharp(false);   // (the zoom moved: the rest picture carried again)
    if (!live.drawCam) live.veins?.setScene?.(S, tx * sx, ty * sy);
    for (const l of live.zoomLayers) l.el.style.transform = `matrix(${S.toFixed(5)},0,0,${S.toFixed(5)},${((S - 1) * (l.left - live.wrapRect.left) + tx).toFixed(2)},${((S - 1) * (l.top - live.wrapRect.top) + ty).toFixed(2)})`;
    if (live.rideCTM) rideNow();   // (draws every label from the one ride matrix, card ∘ (the view now over the view they were laid out under): the stations' at C(their points), the rest carried)
    else live.labelGL?.pinDraw();
  }
  // Sharp at landing (card-zoom-plan.md 3.5): once the card has landed, the figure's layer is drawn again for exactly the view the camera carries it
  // to, and the camera is let go for the figure's canvas: nothing moves, only the sharpness changes (the layout keeps reading the rest view, and the
  // labels' points are still carried by C). Going back, or a change of the zoom (the readings coming out), carries the rest picture again first.
  function zoomSharp(on) {
    if (live.zoomLz && live.zoomBase) { live.lz?.zoomSharp?.(on); return; }
    if (!live.zoomBase?.scene || !live.zoomLayers || !live.veins || live.veins.lost) return;
    if (on === !!live.drawCam) return;
    if (on) {
      if (!live.zoomM) return;
      live.drawCam = zoomM6.slice();
      live.veins.setScene(1, 0, 0);
    } else {
      live.drawCam = null;
      live.veins.setScene(1, 0, 0);
    }
    live.veinsDirty = true; live.CTM = null; refreshCTM();
    drawVeins(true, 'zoom-sharp');
    if (!on && live.zoomM) { const sx = vCanvas.width / (live.boxW || vCanvas.width || 1), sy = vCanvas.height / (live.boxH || vCanvas.height || 1); live.veins.setScene(zoomM6[0], zoomM6[4] * sx, zoomM6[5] * sy); }
  }
  function sceneStop() {
    live.zoomM = null; camId(CARD);
    if (live.drawCam) { live.drawCam = null; live.veinsDirty = true; live.CTM = null; refreshCTM(); drawVeins(true, 'zoom-end'); }   // (landed sharp: drawn for the rest view again before the camera is let go)
    live.veins?.setScene?.(1, 0, 0);
    for (const l of live.zoomLayers || []) { l.el.style.transform = ''; l.el.style.transformOrigin = ''; l.el.style.transition = ''; }
    live.zoomLayers = null;
    for (const g of zoomGlass) zoomRide.drop(g);
    for (const h of zoomHid) { h.el.style.opacity = h.was; h.el.style.transition = h.tr; }
    zoomGlass.length = 0; zoomHid.length = 0;
    live.frostWake();
    rideStop();
    live.labelGL?.pinDraw();
    live.stageWake();
  }
  function cardZoomAt(S, px, py, dx, dy) {
    const z = live.zoomBase;
    if (!z) return;
    if (live.zoomLz) { live.lz.zoomAt(S, px, py, dx, dy); return; }
    if (!z.scene || !live.wrapRect) return;
    sceneCam.set(S, px, py, dx, dy);
    // (The picture is only the stage's size: where C's own move would bare a strip of the stage (a card at an edge), the figure and its
    // labels take the nearest move that covers it: sceneCam.cover.)
    sceneCam.cover(zoomT, live.wrapRect.left, live.wrapRect.top, live.wrapRect.width, live.wrapRect.height);
    sceneSet(S, zoomT[0], zoomT[1]);
  }
  function zoomEnd() {
    if (!live.zoomBase) return;
    const z = live.zoomBase; live.zoomBase = null;
    if (live.zoomLz) { live.zoomLz = false; live.lz?.zoomEnd(); return; }
    if (!z.scene) return;
    sceneCam.off();
    sceneStop();
  }
  function followEnd() {
    if (!live.following) return;
    const a = live.follow0, b = live.follow1, f = live.followU, scene = live.followScene;
    live.following = false; live.follow0 = live.follow1 = null; live.followScene = false;
    if (scene) {
      // (The view takes where the camera has carried it, drawn whole in this frame before the camera is given up, so nothing is seen to move.)
      live.vt = { k: a.k + (b.k - a.k) * f, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      applyVT(); live.CTM = null; refreshCTM(); flushVT();
      drawVeins(true, 'follow-end');
      sceneStop();
      live.drifting = true;
    }
    driftEnd();
  }
  return { cardZoomAt, followEnd, sceneSet, sceneStart, zoomEnd, zoomOpen, zoomSharp };
}
