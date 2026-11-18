// Where the figure, label and camera readers get their records: the stage's own accessors (window.pps.stage), nothing measured a second way.
// Each `*Source(pps)` returns the plain object its reader (read-figure.js, read-labels.js, read-camera.js) takes; each `read*(pps)` is both steps.
// Layout is read only for the stage's box and the cards' boxes, through layout-snap.js, and only when the report is asked for (a tap or a call), never in a frame.
import { viewKey, store } from '../store.js';
import { readBox, readMetric, readRects, readStyle, readCTM, stageBox } from '../layout-snap.js';
import { readBoxes } from '../gallery/readers.js';
import { readCamera } from './read-camera.js';
import { readFigure } from './read-figure.js';
import { readLabels } from './read-labels.js';

const io = { box: readBox, rects: readRects, style: readStyle, metric: readMetric, ctm: readCTM };
const safe = (f, dflt = null) => { try { return f(); } catch { return dflt; } };

/** The stage's box in client px, { left, top, width, height }, or null before the figure is up. */
function stageRect() {
  const b = stageBox();
  return b && b.width > 0 ? { left: b.left, top: b.top, width: b.width, height: b.height } : null;
}

/** The open cards' boxes moved to the stage's corner (stage px), the frame the labels are laid in. `boxes`: readBoxes' answer, or one the report already took. */
export function cardsInStage(boxes, corner) {
  const out = {};
  for (const [sel, b] of Object.entries(boxes || {})) out[sel] = [b[0] - corner.left, b[1] - corner.top, b[2] - corner.left, b[3] - corner.top];
  return out;
}

export function labelSource(pps, { boxes } = {}) {
  const st = pps.stage, r = stageRect() || { left: 0, top: 0, width: 0, height: 0 };
  const laid = safe(() => st.labelLaid().items, []);
  const snap = safe(() => st.labelSnapshot(), null);
  // (label-gl's snapshot is in page px: moved back to the stage's corner, so every box here is in one frame)
  const drawn = snap ? snap.items.map((d) => ({ key: d.key, x: d.x - r.left, y: d.y - r.top, w: d.w, h: d.h, a: d.drawn ?? d.a, clipped: d.clipped, pin: d.pin })) : null;
  const classes = {};
  for (const g of document.querySelectorAll('#labels g.lb[data-key]')) classes[g.dataset.key] = [...g.classList];
  return {
    stage: { w: r.width, h: r.height }, laid, drawn, classes,
    cards: cardsInStage((boxes || readBoxes(io).boxes), r), carry: safe(() => st.labelCarry()), marks: snap?.marks?.length || 0,
  };
}

export function cameraSource(pps) {
  const st = pps.stage;
  const traces = safe(() => st.cameraTraces(), []);
  const left = safe(() => st.glideLeft(), { left: 0, ms: 0 });
  return {
    view: viewKey(store.get()), state: safe(() => st.cameraState()), zoom: safe(() => st.cameraZoom()),
    vb: traces.at(-1)?.vb || null,
    moving: { gliding: !!safe(() => st.gliding()), viewChanging: !!safe(() => st.viewChanging()), drifting: !!safe(() => st.drifting()), following: !!safe(() => st.following()), left: left.left, ms: left.ms, hand: !!safe(() => st.handMoved()) },
    moves: safe(() => st.cameraMoves(), []), traces,
  };
}

export function figureSource(pps) {
  const st = pps.stage, f = safe(() => st.figureRows(), { lens: 'pressure', morph: 0, rows: [] });
  return { ...f, view: viewKey(store.get()), glows: safe(() => st.steadyGlows(), []) };
}

export const readLabelsNow = (pps, o) => readLabels(labelSource(pps, o));
export const readCameraNow = (pps) => readCamera(cameraSource(pps));
export const readFigureNow = (pps) => readFigure(figureSource(pps));
