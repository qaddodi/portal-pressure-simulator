// One render scheduler for the whole app.
//
// Every surface (figure, glow, hover, lobule, sinusoid, charts, Doppler, FibroScan, pressure-time,
// presenter glides…) asks for its next frame here instead of calling requestAnimationFrame itself.
// All the callbacks asked for during one frame run together in a single browser frame, in the order
// they were asked, with the same timestamp: exactly what separate rAF calls would have done, so every
// loop keeps its own pacing, caps and idle stops. When nothing asks, no frame is requested at all and
// the browser can drop to its low-power state.
//
//   const raf = frameFor('lobule');   raf(cb) -> id (never 0)
//   cancelFrame(id)
//
// window.pps.perf (see perf()) reports callbacks per second for each surface over the last second.

import { gpuProbe } from './gpu-probe.js?v=9832eccfbe';
let queue = new Map();   // id -> [tag, cb], in request order
let current = null;      // the batch running now
// Asked for with lateFrame: run after every other callback of the frame (one asked for while that frame's callbacks run still
// runs in it), so a surface that draws what the others set up (the figure's one render pass) draws their final state, once.
let late = new Map(), lateNow = null;
// Asked for with finalFrame: run after the late ones (the glass over the figure: every writer of the frame, the figure's own pass
// included, has run by then, so it is drawn once, over their final state).
let fin = new Map(), finalNow = null;
let next = 1, pending = 0;
const counts = new Map(), rates = new Map(), draws = new Map(), drawRates = new Map(), totals = { asks: {}, drawn: {}, ms: {} };
let windowAt = 0, frames = 0, fps = 0, allFrames = 0;

function flush(now) {
  pending = 0;
  current = queue;
  queue = new Map();   // asked for while running: the next frame, as with requestAnimationFrame
  frames++; allFrames++;
  try {
    run(current, now);
    lateNow = late;
    late = new Map();   // asked for while the late ones run: the next frame
    run(lateNow, now);
    finalNow = fin;
    fin = new Map();    // (likewise)
    run(finalNow, now);
  } finally { current = null; lateNow = null; finalNow = null; }
  globalThis.__frameProbe?.(now);   // (the tests read the camera here, once every frame has been drawn)
  roll(now);
  if ((queue.size || late.size || fin.size) && !pending) pending = requestAnimationFrame(flush);
}

function run(batch, now) {
  for (const [id, [tag, cb]] of batch) {
    batch.delete(id);
    counts.set(tag, (counts.get(tag) || 0) + 1); totals.asks[tag] = (totals.asks[tag] || 0) + 1;
    const t0 = performance.now();
    try { if (gpuProbe.on) gpuProbe.time(null, `${tag} (script)`, () => cb(now)); else cb(now); } catch (e) { setTimeout(() => { throw e; }); }   // one surface's error never stops the others
    totals.ms[tag] = (totals.ms[tag] || 0) + performance.now() - t0;
  }
}

// Closes the per-second window once a second has passed (also when perf() is read, so a page whose surfaces all stopped
// asking reports zero rather than its last busy second).
function roll(now) {
  if (now - windowAt < 1000) return;
  const span = now - windowAt;
  rates.clear();
  for (const [tag, n] of counts) rates.set(tag, Math.round(n * 1000 / span));
  drawRates.clear();
  for (const [tag, n] of draws) drawRates.set(tag, Math.round(n * 1000 / span));
  fps = Math.round(frames * 1000 / span);
  counts.clear(); draws.clear(); frames = 0; windowAt = now;
}

export function frame(cb, tag = 'other') {
  const id = next++;
  queue.set(id, [tag, cb]);
  if (!pending && !current) pending = requestAnimationFrame(flush);
  return id;
}

/** As frame(), but run after every other callback of its frame (see `late`). */
export function lateFrame(cb, tag = 'other') {
  const id = next++;
  late.set(id, [tag, cb]);
  if (!pending && !current) pending = requestAnimationFrame(flush);
  return id;
}

/** As lateFrame(), but run after the late ones too (see `fin`). */
export function finalFrame(cb, tag = 'other') {
  const id = next++;
  fin.set(id, [tag, cb]);
  if (!pending && !current) pending = requestAnimationFrame(flush);
  return id;
}

// Like cancelAnimationFrame: also stops a callback of the running frame that has not run yet.
export function cancelFrame(id) {
  if (id && !queue.delete(id) && !late.delete(id) && !fin.delete(id) && !current?.delete(id) && !lateNow?.delete(id)) finalNow?.delete(id);
}

/** Where the scheduler is now: 'early' (the frame's first callbacks), 'late', 'final', or null (outside a frame). A surface asked to
 *  draw while the early ones run can leave it to its own late callback, which still runs in this frame, and so draw once in it. */
export const framePhase = () => (finalNow ? 'final' : lateNow ? 'late' : current ? 'early' : null);

export const frameFor = (tag) => (cb) => frame(cb, tag);
export const lateFrameFor = (tag) => (cb) => lateFrame(cb, tag);
export const finalFrameFor = (tag) => (cb) => finalFrame(cb, tag);

// A surface that paces itself (asks every frame, draws only some) notes each frame it really drew, for perf().drawn.
export function noteDraw(tag) { draws.set(tag, (draws.get(tag) || 0) + 1); totals.drawn[tag] = (totals.drawn[tag] || 0) + 1; }

// Per-surface callbacks per second over the last full second, the frames each pacing surface really drew in it,
// which surfaces wait for a frame, and the running totals of both since the page opened (for checks over any span;
// totals.frames: the browser frames the scheduler ran, so a surface's draws can be held against the frames on offer;
// totals.ms: the main-thread time each surface's callbacks took, in ms: CPU time issuing work, not the GPU's own time).
export function perf() {
  roll(performance.now());
  return { fps, surfaces: Object.fromEntries(rates), drawn: Object.fromEntries(drawRates), totals: { asks: { ...totals.asks }, drawn: { ...totals.drawn }, ms: { ...totals.ms }, frames: allFrames }, waiting: [...new Set([...queue.values(), ...late.values(), ...fin.values()].map(([t]) => t))] };
}

// Battery saver (no longer in Settings, 20 Oct; kept for tests): the anatomy's blood, the lobule, the sinusoid and the FibroScan
// move at 15 frames a second at a lower resolution. Each surface reads it every frame; stage.setSaver() sets it.
// Otherwise nothing is paced: steady motion (the blood and flow, a glide toward values that keep moving, an instrument's
// sweep or speckle) is drawn on every frame the screen offers, 60, 120 or more a second. Motion follows elapsed time,
// never the number of frames, so a faster screen shows the same speeds in more steps.
// (No longer a Setting, 20 Oct: always off. A value an older build stored is dropped.)
try { localStorage.removeItem('pps.saver'); } catch { /* storage unavailable */ }
let saverOn = false;
export const saver = () => saverOn;
export function setSaver(on) { saverOn = !!on; }
// (Battery saver's pacing: a little under 67 ms, so a frame lands on the screen's next refresh, not the one after.)
export const SAVER_MS = 1000 / 15 - 4;
// Render resolution (Settings, 29 Oct, an experiment): the figure's canvases (the anatomy's vessels, organs, blood and glows on
// the GPU, the lobule and the sinusoid) are drawn at this share of their usual pixels, and the browser scales them up. Words
// (labels, cards, the instruments' readings) are not on those canvases and stay sharp. 1 (Full) changes nothing.
// 'auto' (30 Oct): the anatomy follows its zoom (stage.js autoScale), 100% zoomed out down to 10% zoomed in; the lobule and the
// sinusoid stay at Full.
export const RENDER_SCALES = ['auto', 1, 0.75, 0.5, 0.25];
let renderK = 1;
try { const t = localStorage.getItem('pps.renderScale'), v = t === 'auto' ? t : +t; if (RENDER_SCALES.includes(v)) renderK = v; } catch { /* storage unavailable */ }
const renderSubs = new Set();
/** The chosen setting: 'auto' or a fixed share. */
export const renderSetting = () => renderK;
/** The fixed share of the pixels (1 under Auto, which only the anatomy applies, by its zoom). */
export const renderScale = () => (renderK === 'auto' ? 1 : renderK);
export function setRenderScale(k) {
  if (!RENDER_SCALES.includes(k) || k === renderK) return;
  renderK = k;
  try { if (k === 1) localStorage.removeItem('pps.renderScale'); else localStorage.setItem('pps.renderScale', String(k)); } catch { /* storage unavailable */ }
  for (const f of renderSubs) f(k);
}
/** Called with the new scale each time Settings changes it (and each time one of the options below changes). */
export function onRenderScale(f) { renderSubs.add(f); return () => renderSubs.delete(f); }
// The figure's further resolution options (30 Oct, experiments, all off until chosen; the anatomy's canvas only, stage.js):
// move: the share while the view moves (a pinch, a pan, a glide), Full again once it has settled; 1 = off.
// glow: the share the glow layers (an organ's soft glow, a lit organ's warm edge) are drawn at, the vessels and organs at Full.
// cap: the most megapixels the canvas holds (a big screen draws fewer, a phone is under it); 0 = off.
// floor: the lowest share Auto goes to (10%, 25% or 50%).
// adapt: after each move, one step lower if the frames came slowly, one step back up when they came at the screen's pace.
export const FIG_OPTS = { move: [1, 0.75, 0.5, 0.25], glow: [1, 0.5, 0.25], cap: [0, 8, 4, 2], adapt: [false, true], floor: [0.1, 0.25, 0.5] };
const figOpts = { move: 1, glow: 1, cap: 0, adapt: false, floor: 0.1 };
for (const k of Object.keys(figOpts)) {
  try { const t = localStorage.getItem(`pps.fig.${k}`), v = t === 'true' ? true : +t; if (t != null && FIG_OPTS[k].includes(v)) figOpts[k] = v; } catch { /* storage unavailable */ }
}
export const figOpt = (k) => figOpts[k];
export function setFigOpt(k, v) {
  if (!FIG_OPTS[k]?.includes(v) || figOpts[k] === v) return;
  figOpts[k] = v;
  try { if (v === FIG_OPTS[k][0]) localStorage.removeItem(`pps.fig.${k}`); else localStorage.setItem(`pps.fig.${k}`, String(v)); } catch { /* storage unavailable */ }
  for (const f of renderSubs) f(renderK);
}
// Figure performance (30 Oct, Round 3 of the review, each off until chosen; Settings › Figure performance). Unlike the options above,
// none of these changes the canvas's size, so a change is told only to its own listeners (onFigLab), never to the resolution's.
// motion60: steady motion (the blood, the lobule, the sinusoid, the instruments) is drawn at most about 60 times a second on a faster
//   screen; pans and zooms stay at the screen's rate. A 60 Hz screen draws as before.
// glassCache: the callouts' GPU glass keeps each callout's box, fade and shadow until something says they changed (glass-gl.js).
// creditLean: in Present, the corner credit's once-a-second look runs only when the layout may have changed (credit.js).
// pinchReuse: while a hand zooms, all but one in 2 (2) or in 3 (3) of the one-pass zoom frames lay the last shaded picture again,
//   moved and scaled to the view now (veins-gl.js reuseDraw); a zoom out, which uncovers the edges, is shaded every frame.
// upscale: under Full, the anatomy's canvas stays at Full and the figure, drawn at its share into the renderer's own buffer, is upscaled
//   onto it by a sharper filter than the browser's (veins-gl.js UP_FS). The lobule and the sinusoid are not included.
// lymphBoxes: in the lobule with the GPU's vessels, the lymph's layer is cleared and drawn again only in the tiles its drops left or
//   reached, while nothing else on it changed (lobule-zoom.js lyKey).
// lightArt: the colon's and small bowel's lines with about half their points, none more than 0.05 units off (stage.js syncArtLite).
// pinchLow: a zoom frame under a hand draws the vessel layer at PINCH_LOW_K of its width and height and stretches it; the view a
//   pinch stops at is drawn at Full (veins-gl.js lowPass). Pinch frame reuse, when on, takes those frames instead.
// tissueLive: the open lobule's tissue (cells, collagen, stellate cells, septa, tracts) drawn by the shader on every frame it changes
//   (lobule-live.js, tissue-gl.js) instead of laid from the painted bitmap, so it stays sharp at every zoom and its colours ease. Off,
//   the bitmap alone is shown, as before the shader drew any of it. Flipping it eases the lobule between the two (lobule-zoom.js liveGoal).
export const FIG_LAB = { tissueLive: [false, true], motion60: [false, true], glassCache: [false, true], creditLean: [false, true], lymphBoxes: [false, true], pinchReuse: [0, 2, 3], upscale: [false, true], lightArt: [false, true], pinchLow: [false, true] };
const figLabs = Object.fromEntries(Object.entries(FIG_LAB).map(([k, v]) => [k, v[0]]));
for (const k of Object.keys(figLabs)) {
  try { const t = localStorage.getItem(`pps.fig.${k}`), v = t === 'true' ? true : +t; if (t != null && FIG_LAB[k].includes(v)) figLabs[k] = v; } catch { /* storage unavailable */ }
}
const labSubs = new Set();
export const figLab = (k) => figLabs[k];
export function setFigLab(k, v) {
  if (!FIG_LAB[k]?.includes(v) || figLabs[k] === v) return;
  figLabs[k] = v;
  try { if (v === FIG_LAB[k][0]) localStorage.removeItem(`pps.fig.${k}`); else localStorage.setItem(`pps.fig.${k}`, String(v)); } catch { /* storage unavailable */ }
  for (const f of labSubs) f(k, v);
}
/** Called with (key, value) each time one of the Figure performance switches changes. */
export function onFigLab(f) { labSubs.add(f); return () => labSubs.delete(f); }
// (Motion at 60: a frame of steady motion is skipped when the last was drawn under 10 ms ago. A 120 Hz screen's frames come 8.3 ms
// apart, so every other one is drawn; a 60 Hz screen's 16.7 ms, so all of them, as before; a 90 Hz screen's 11.1 ms, all of them.)
export const MOTION60_MS = 10;
/** Vessels lower while pinching: the share of the layer's width and height (0.71: half its pixels). */
export const PINCH_LOW_K = 0.71;
/** The least time between two drawn frames of steady motion: 0 (every frame) unless Battery saver or Motion at 60 is on. */
export const paceMs = () => (saverOn ? SAVER_MS : figLabs.motion60 ? MOTION60_MS : 0);
