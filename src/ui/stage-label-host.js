// The labels' GPU host in the figure's present, and their pin to the figure.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { LABEL_VESSEL } from './anatomy.js';
import { gpuProbe } from './gpu-probe.js';
import { createLabelGL } from './label-gl.js';
import { cams } from './scene-cam.js';

// A pinned point under the cameras over the stage's own (scene-cam.js, card ∘ dive ∘ base): the dive's record (p' = k p + (x, y), stage px, the one
// veins-gl draws the figure under), then a card's zoom. Only the point is carried (the label keeps its size and offset): it rides the dive with the figure.
export function camOut(out, dive, zoomM) {
  if (dive && dive.k !== 1) { out[0] = dive.k * out[0] + dive.x; out[1] = dive.k * out[1] + dive.y; }
  if (zoomM) { const x = out[0], y = out[1]; out[0] = zoomM[0] * x + zoomM[4]; out[1] = zoomM[3] * y + zoomM[5]; }
  return out;
}
export function createLabelHost(st, live) {
  const { E, LABELS_ORDER, arcMid, easeInOut, frostWake, gLabels, gLeaders, gScan, geo, labelAnchor, labelHost, labelSvg, morphAnchorAt, nodePos, refreshCTM, worldToLocalInto, wrap } = st;
  // (The labels' pass in the figure's present: its prep, so they are laid before any glass takes its blur, which then has them in it.)
  const labelPass = () => {
    live.labelPassOff?.(); live.labelPassOff = null;
    if (live.labelGL && live.veins?.top) live.labelPassOff = live.veins.top.add({ order: LABELS_ORDER, prep: () => { if (!gpuProbe.skipLabels) live.labelGL?.drawInto(); }, draw: () => {} });
  };
  { const host = labelHost(); live.labelGL = host ? createLabelGL(labelSvg, gLabels, { software: live.SOFTWARE, marks: [gLeaders, gScan], onBoxes: frostWake, host }) : null; labelPass(); }
  // (Labels part of the figure: each station label drawn at its point as the figure has it in this frame, label-gl.js pinTo.)
  // (The same kind of point the layout took (pmid): the middle of the vessel it names, or the station itself. A view change that shows or hides
  // that vessel must not swap one for the other part way: the label would leap between the two.)
  const PIN_P = [0, 0];
  // (A point slid along its vessel by the tidy (au, 0.5 its middle): where it stands on that vessel now, stage px, into PIN_P; false if none.)
  function pinVesselAt(id, au) {
    const eid = LABEL_VESSEL[id], x = eid && E[eid], P = x && x.vis && !x.ghost ? geo[eid]?.cur : null;
    if (!(P?.length > 1)) return false;
    const m = arcMid(P, au); worldToLocalInto(PIN_P, m[0], m[1]);
    return true;
  }
  function pinKind(id, ax, ay, au) {
    if (!live.CTM) refreshCTM();
    const t = easeInOut(live.morph), a = labelAnchor(id, t);
    if (a.mid && (au == null || au === 0.5) && Math.hypot(a.ax - ax, a.ay - ay) < 1) return 1;
    if (au != null && au !== 0.5 && pinVesselAt(id, au) && Math.hypot(PIN_P[0] - ax, PIN_P[1] - ay) < 1) return 1;
    const p = nodePos(id, t); worldToLocalInto(PIN_P, p[0], p[1]);
    return Math.hypot(PIN_P[0] - ax, PIN_P[1] - ay) < 1 ? 2 : 0;
  }
  // (How a label's place moves as its gap grows by one px, per direction (stage.js offset).)
  const PIN_DIR = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0], EL: [1, 0], WL: [-1, 0], NE: [0.72, -0.72], NW: [-0.72, -0.72], SE: [0.72, 0.72], SW: [-0.72, 0.72] };
  const DIVEC = cams.stage.dive;
  if (live.labelGL) live.labelGL.pinTo((id, out, mid, au) => {
    if (!live.CTM) refreshCTM();
    if (mid && au != null && au !== 0.5 && pinVesselAt(id, au)) { out[0] = PIN_P[0]; out[1] = PIN_P[1]; camOut(out, DIVEC, live.zoomM); return Number.isFinite(out[0]) && Number.isFinite(out[1]); }
    const t = easeInOut(live.morph), a = labelAnchor(id, t);
    if (mid || !a.mid) { out[0] = a.ax; out[1] = a.ay; } else { const p = nodePos(id, t); worldToLocalInto(PIN_P, p[0], p[1]); out[0] = PIN_P[0]; out[1] = PIN_P[1]; }
    // (The dive's zoom and a card's zoom: the point is carried by the scene's cameras; the label's offset from it is not.)
    camOut(out, DIVEC, live.zoomM);
    return Number.isFinite(out[0]) && Number.isFinite(out[1]);
  }, (wx, wy, view, out, s) => {
    // (A world anchor, any figure label: where the point is under this frame's camera. Only at rest in the view it was laid out for: between the
    // two views the geometry moves, and those labels follow as before.)
    // (The change between the views, the view switch's or a plain setView's (under the HVPG catheter, the lobule open: no viewXf): the point rides
    // the vessel it lies on, under the same dive and card cameras as at rest. Never drawn frozen at its old screen spot while the figure morphs.)
    if (live.viewXf || !(live.morph === 0 || live.morph === 1)) {
      if (!live.CTM) refreshCTM();
      if (!morphAnchorAt(wx, wy, view, out, s)) return false;
      camOut(out, DIVEC, live.zoomM);
      return Number.isFinite(out[0]) && Number.isFinite(out[1]);
    }
    if (live.morph !== view) return false;
    if (!live.CTM) refreshCTM();
    worldToLocalInto(out, wx, wy);
    camOut(out, DIVEC, live.zoomM);   // (the dive's zoom and a card's zoom carry this point, as they do a station's: an organ's name rides a card's zoom with the figure)
    return Number.isFinite(out[0]) && Number.isFinite(out[1]);
  });
  wrap.dataset.labels = live.labelGL ? 'gpu' : 'svg';
  live.labelRider = live.labelGL;
  live.labelGL?.setProbeCam?.(() => live.zoomM);   // (the Doppler probe rides a card's zoom with the figure)
  return { PIN_DIR, labelPass, pinKind };
}
