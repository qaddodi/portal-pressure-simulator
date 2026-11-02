// A slide's resources, prepared as one set before it is shown, and its neighbours' ahead of the press (recs R05, 2 Nov 2026; Mohammad:
// "implement"). Each slide has a manifest: its model state computed, its data card's own points started (the tool's warm), the GPU
// glyphs loaded and every shader program that has finished compiling published (gl-compile.js prepareShaders, R10). aim(i, dir) is
// called on each Next, Back or jump: it starts a new generation, so every job of the one before (a slide the person has gone past, or
// a direction just reversed) stops at its next step and publishes nothing; then it prepares the slide going in, at once, and the one
// after it in the direction of travel, then the one behind, in idle time between frames (never in a frame of motion). At most three
// manifests are kept (the slide and its two neighbours); one further away is dropped.
// ?slideprep=0: nothing prepared ahead, as before.
export const SLIDE_PREP = !(typeof location !== 'undefined' && /[?&]slideprep=0\b/.test(location.search || ''));

const idle = (f) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(f, { timeout: 300 }) : setTimeout(f, 16));

/**
 * steps: { state(i) → Promise, tool(i), glyphs() → Promise, shaders() } — the presenter's own preparation calls, each optional.
 * count(): the number of slides. Returns { aim, ready, manifest, cancel }.
 */
export function createSlidePrep({ count, steps = {}, keep = 3 }) {
  let gen = 0;
  const made = new Map();   // i → { gen, state, tool, glyphs, shaders, done }
  const alive = (g) => g === gen;
  async function prep(i, g) {
    if (i < 0 || i >= count() || !alive(g)) return;
    let m = made.get(i);
    if (m?.done) { if (steps.shaders) try { steps.shaders(); } catch { /* next time */ } return; }
    if (!m) made.set(i, (m = { state: false, tool: false, glyphs: false, shaders: false, done: false }));
    try {
      if (!m.state) { await steps.state?.(i); if (!alive(g)) return; m.state = true; }
      if (!m.glyphs) { await steps.glyphs?.(); if (!alive(g)) return; m.glyphs = true; }
      if (!m.tool) { steps.tool?.(i); m.tool = true; }
      m.shaders = steps.shaders ? steps.shaders() === 0 : true;
      m.done = m.state && m.glyphs && m.tool && m.shaders;
    } catch { /* a step that failed is tried again on the next aim */ }
  }
  function trim(i) {
    for (const k of [...made.keys()]) if (Math.abs(k - i) > (keep >> 1)) made.delete(k);
  }
  /** The person is going to slide i (dir: 'next', 'back' or 'jump'). Starts a new generation; stale jobs stop. */
  function aim(i, dir = 'next') {
    if (!SLIDE_PREP) return;
    const g = ++gen;
    trim(i);
    // (The slide going in first, now: its shaders published in the press's own task, before its first frame.)
    try { steps.shaders?.(); } catch { /* next time */ }
    const order = dir === 'back' ? [i, i - 1, i + 1] : [i, i + 1, i - 1];
    let k = 0;
    const next = () => { if (!alive(g) || k >= order.length) return; const at = order[k++]; prep(at, g).finally(() => { if (alive(g)) idle(next); }); };
    idle(next);
  }
  return {
    aim,
    ready: (i) => !!made.get(i)?.done,
    manifest: (i) => (made.get(i) ? { ...made.get(i) } : null),
    cancel: () => { gen++; },
  };
}
