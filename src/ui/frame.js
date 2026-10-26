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

import { gpuProbe } from './gpu-probe.js?v=be7cefbb53';
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
/** The least time between two drawn frames of steady motion: 0 (every frame) unless Battery saver is on. */
export const paceMs = () => (saverOn ? SAVER_MS : 0);
