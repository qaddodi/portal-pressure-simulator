// A slide's resources, prepared as one set before it is shown, and its neighbours' ahead of the press (recs R05, 2 Nov 2026; Mohammad:
// "implement"). Each slide has a manifest: its model state computed, its data card's own points started (the tool's warm), the GPU
// glyphs loaded and every shader program that has finished compiling published (gl-compile.js prepareShaders, R10). aim(i, dir) is
// called on each Next, Back or jump: it starts a new generation, so every job of the one before (a slide the person has gone past, or
// a direction just reversed) stops at its next step and publishes nothing; then it prepares the slide going in, at once, and the one
// after it in the direction of travel, then the one behind, in idle time between frames (never in a frame of motion). At most three
// manifests are kept (the slide and its two neighbours); one further away is dropped.
// ?slideprep=0: nothing prepared ahead, as before.
import { prepJob, prepLeft } from './prep-budget.js?v=ba310174e2';
export const SLIDE_PREP = !(typeof location !== 'undefined' && /[?&]slideprep=0\b/.test(location.search || ''));

// (Review pass 2, priorities 1 and 3: each slide's preparation is a job of the shared preparation budget, prep-budget.js, one step at a
// time (its state, its glyphs, its data card's warm, its shaders), the deadline checked between steps, a promise's continuation admitted
// through the budget too. A job belongs to one generation: a newer aim cancels the older jobs and takes them out of the queue at once
// (cancelled: counted in stats()), and an aim may name the slide change it serves (alive), so a job also stops when that change is
// superseded. The press's own shader step is held to what the budget has left.)
const SHADER_MS = 4;

/**
 * steps: { state(i) → Promise, tool(i), glyphs() → Promise, shaders(ms) } — the presenter's own preparation calls, each optional.
 * count(): the number of slides. Returns { aim, ready, manifest, cancel, stats }.
 */
export function createSlidePrep({ count, steps = {}, keep = 3 }) {
  let gen = 0;
  const made = new Map();   // i → { state, tool, glyphs, shaders, done }
  const live = new Set();   // (the jobs of this generation, cancelled by the next)
  const st = { aims: 0, jobs: 0, cancelled: 0, done: 0 };
  const shaderMs = () => Math.max(0, Math.min(SHADER_MS, prepLeft()));
  function* plan(i, m) {
    if (!m.state) yield () => Promise.resolve(steps.state?.(i)).then(() => { m.state = true; });
    if (!m.glyphs) yield () => Promise.resolve(steps.glyphs?.()).then(() => { m.glyphs = true; });
    if (!m.tool) yield () => { steps.tool?.(i); m.tool = true; };
    yield () => { m.shaders = steps.shaders ? steps.shaders(shaderMs()) === 0 : true; m.done = m.state && m.glyphs && m.tool && m.shaders; };
  }
  function trim(i) {
    for (const k of [...made.keys()]) if (Math.abs(k - i) > (keep >> 1)) made.delete(k);
  }
  function stopAll() { for (const j of live) { j.cancel(); st.cancelled++; } live.clear(); }
  /** The person is going to slide i (dir: 'next', 'back' or 'jump'). Starts a new generation; stale jobs stop and leave the queue.
   *  alive (optional): the slide change this aim serves is still the current one. */
  function aim(i, dir = 'next', alive = () => true) {
    if (!SLIDE_PREP) return;
    const g = ++gen;
    st.aims++;
    stopAll();
    trim(i);
    const ok = () => g === gen && alive();
    // (The slide going in first, now: its shaders published in the press's own task, before its first frame, within the budget.)
    try { steps.shaders?.(shaderMs()); } catch { /* next time */ }
    const order = (dir === 'back' ? [i, i - 1, i + 1] : [i, i + 1, i - 1]).filter((k) => k >= 0 && k < count());
    const mOf = (at) => { let m = made.get(at); if (!m) made.set(at, (m = { state: false, tool: false, glyphs: false, shaders: false, done: false })); return m; };
    // (One job, the slide going in first, then the one ahead, then the one behind: each a list of small steps.)
    function* all() { for (const at of order) if (!made.get(at)?.done) yield* plan(at, mOf(at)); }
    const j = prepJob('slide-prep', all(), { alive: ok });
    live.add(j); st.jobs++;
    j.done.then((fin) => { live.delete(j); if (fin) st.done++; });
  }
  return {
    aim,
    ready: (i) => !!made.get(i)?.done,
    manifest: (i) => (made.get(i) ? { ...made.get(i) } : null),
    cancel: () => { gen++; stopAll(); },
    stats: () => ({ ...st, live: live.size, kept: made.size }),
  };
}
