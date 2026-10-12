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
const counts = new Map(), rates = new Map();
let windowAt = 0, frames = 0, fps = 0;

function flush(now) {
  pending = 0;
  current = queue;
  queue = new Map();   // asked for while running: the next frame, as with requestAnimationFrame
  frames++;
  try {
    for (const [id, [tag, cb]] of current) {
      current.delete(id);
      counts.set(tag, (counts.get(tag) || 0) + 1);
      try { cb(now); } catch (e) { setTimeout(() => { throw e; }); }   // one surface's error never stops the others
    }
  } finally { current = null; }
  if (now - windowAt >= 1000) {
    const span = now - windowAt;
    rates.clear();
    for (const [tag, n] of counts) rates.set(tag, Math.round(n * 1000 / span));
    fps = Math.round(frames * 1000 / span);
    counts.clear(); frames = 0; windowAt = now;
  }
  if (queue.size && !pending) pending = requestAnimationFrame(flush);
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

// Per-surface callbacks per second over the last full second, and which surfaces wait for a frame.
export function perf() {
  return { fps, surfaces: Object.fromEntries(rates), waiting: [...new Set([...queue.values()].map(([t]) => t))] };
}
