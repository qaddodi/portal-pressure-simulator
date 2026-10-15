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

let queue = new Map();   // id -> [tag, cb], in request order
let current = null;      // the batch running now
let next = 1, pending = 0;
const counts = new Map(), rates = new Map(), draws = new Map(), drawRates = new Map(), totals = { asks: {}, drawn: {} };
let windowAt = 0, frames = 0, fps = 0;

function flush(now) {
  pending = 0;
  current = queue;
  queue = new Map();   // asked for while running: the next frame, as with requestAnimationFrame
  frames++;
  try {
    for (const [id, [tag, cb]] of current) {
      current.delete(id);
      counts.set(tag, (counts.get(tag) || 0) + 1); totals.asks[tag] = (totals.asks[tag] || 0) + 1;
      try { cb(now); } catch (e) { setTimeout(() => { throw e; }); }   // one surface's error never stops the others
    }
  } finally { current = null; }
  globalThis.__frameProbe?.(now);   // (the tests read the camera here, once every frame has been drawn)
  roll(now);
  if (queue.size && !pending) pending = requestAnimationFrame(flush);
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

// Like cancelAnimationFrame: also stops a callback of the running frame that has not run yet.
export function cancelFrame(id) {
  if (id && !queue.delete(id)) current?.delete(id);
}

export const frameFor = (tag) => (cb) => frame(cb, tag);

// A surface that paces itself (asks every frame, draws only some) notes each frame it really drew, for perf().drawn.
export function noteDraw(tag) { draws.set(tag, (draws.get(tag) || 0) + 1); totals.drawn[tag] = (totals.drawn[tag] || 0) + 1; }

// Per-surface callbacks per second over the last full second, the frames each pacing surface really drew in it,
// which surfaces wait for a frame, and the running totals of both since the page opened (for checks over any span).
export function perf() {
  roll(performance.now());
  return { fps, surfaces: Object.fromEntries(rates), drawn: Object.fromEntries(drawRates), totals: { asks: { ...totals.asks }, drawn: { ...totals.drawn } }, waiting: [...new Set([...queue.values()].map(([t]) => t))] };
}

// Settings › Battery saver (off by default): the anatomy's blood, the lobule, the sinusoid and the FibroScan
// move at 15 frames a second at a lower resolution. Each surface reads it every frame; stage.setSaver() sets it.
let saverOn = (() => { try { return localStorage.getItem('pps.saver') === '1'; } catch { return false; } })();
export const saver = () => saverOn;
export function setSaver(on) { saverOn = !!on; }
export const SAVER_MS = 1000 / 15 - 4;   // (a frame's pacing in Battery saver, with the same slack as GLIDE_MS)
