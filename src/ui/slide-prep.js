// A slide's resources, prepared as one set before it is shown, and its neighbours' ahead of the press (recs R05, 2 Nov 2026; Mohammad:
// "implement"). Each slide has a manifest: its model state computed, its data card's own points started (the tool's warm), the GPU
// glyphs loaded and every shader program that has finished compiling published (gl-compile.js prepareShaders, R10). aim(i, dir) is
// called on each Next, Back or jump: it starts a new generation, so every job of the one before (a slide the person has gone past, or
// a direction just reversed) stops at its next step and publishes nothing; then it prepares the slide going in, at once, and the one
// after it in the direction of travel, then the one behind, in idle time between frames (never in a frame of motion). At most three
// manifests are kept (the slide and its two neighbours); one further away is dropped.
// ?slideprep=0: nothing prepared ahead, as before.
// (recs-production-120hz §6, 2 Nov 2026: readiness is an awaited, versioned contract. A tool's warm returns its completion and is
// awaited; manifests are keyed by the deck's identity (identity(): deck id, revision, look, context generation) as well as the slide,
// so deck B's slide 0 never inherits deck A's; a shader step that still waits resumes when a program is published (whenShadersMove),
// up to SHADER_TRIES times, instead of leaving the slide unready for good; a step that fails marks the manifest failed, never ready;
// cancel() is the presenter's teardown and drops every manifest. States: unprepared, preparing, ready, failed.)
import { prepJob, prepLeft } from './prep-budget.js?v=bd17380ca7';
import { whenShadersMove } from './gl-compile.js?v=0ca233872f';
export const SLIDE_PREP = !(typeof location !== 'undefined' && /[?&]slideprep=0\b/.test(location.search || ''));

// (Review pass 2, priorities 1 and 3: each slide's preparation is a job of the shared preparation budget, prep-budget.js, one step at a
// time (its state, its glyphs, its data card's warm, its shaders), the deadline checked between steps, a promise's continuation admitted
// through the budget too. A job belongs to one generation: a newer aim cancels the older jobs and takes them out of the queue at once
// (cancelled: counted in stats()), and an aim may name the slide change it serves (alive), so a job also stops when that change is
// superseded. The press's own shader step is held to what the budget has left.)
const SHADER_MS = 4, SHADER_TRIES = 8;

/**
 * steps: { state(i) → Promise, tool(i) → Promise, glyphs() → Promise, shaders(ms) → waiting } — the presenter's own preparation calls,
 * each optional. count(): the number of slides. identity(): what the manifests belong to (a change drops them all).
 * Returns { aim, ready, manifest, state, cancel, stats }.
 */
export function createSlidePrep({ count, steps = {}, keep = 3, identity = () => '' }) {
  let gen = 0, idNow = null;
  const made = new Map();   // i → { state, tool, glyphs, shaders, done, failed, id }
  const live = new Set();   // (the jobs of this generation, cancelled by the next)
  const st = { aims: 0, jobs: 0, cancelled: 0, done: 0 };
  const shaderMs = () => Math.max(0, Math.min(SHADER_MS, prepLeft()));
  const fail = (m) => () => { m.failed = true; };
  function* plan(i, m, ok) {
    if (!m.state) yield () => Promise.resolve(steps.state?.(i)).then(() => { if (ok()) m.state = true; }, fail(m));
    if (!m.glyphs) yield () => Promise.resolve(steps.glyphs?.()).then(() => { if (ok()) m.glyphs = true; }, fail(m));
    // (Awaited: a warm that returns a promise (a curve's model days) is done when it settles, not when it was started.)
    if (!m.tool) yield () => { let r; try { r = steps.tool?.(i); } catch { m.failed = true; return null; } return Promise.resolve(r).then(() => { if (ok()) m.tool = true; }, fail(m)); };
    // (The shaders: published within the step's share; still waiting, the step waits for the next publication and tries again.)
    for (let t = 0; t < SHADER_TRIES && !m.shaders && !m.failed; t++) {
      yield () => { m.shaders = steps.shaders ? steps.shaders(shaderMs()) === 0 : true; };
      if (!m.shaders) yield () => whenShadersMove(250);
    }
    yield () => { m.done = !m.failed && m.state && m.glyphs && m.tool && m.shaders; };
  }
  function trim(i) {
    for (const k of [...made.keys()]) if (Math.abs(k - i) > (keep >> 1)) made.delete(k);
  }
  // (The deck, its revision, the look or the GL context changed: every manifest is someone else's now.)
  function own() {
    const id = String(identity() ?? '');
    if (id !== idNow) { idNow = id; made.clear(); }
    return id;
  }
  function stopAll() { for (const j of live) { j.cancel(); st.cancelled++; } live.clear(); }
  /** The person is going to slide i (dir: 'next', 'back' or 'jump'). Starts a new generation; stale jobs stop and leave the queue.
   *  alive (optional): the slide change this aim serves is still the current one. */
  function aim(i, dir = 'next', alive = () => true) {
    if (!SLIDE_PREP) return;
    const g = ++gen;
    st.aims++;
    stopAll();
    own();
    trim(i);
    const ok = () => g === gen && alive();
    // (The slide going in first, now: its shaders published in the press's own task, before its first frame, within the budget.)
    try { steps.shaders?.(shaderMs()); } catch { /* next time */ }
    const order = (dir === 'back' ? [i, i - 1, i + 1] : [i, i + 1, i - 1]).filter((k) => k >= 0 && k < count());
    const mOf = (at) => { let m = made.get(at); if (!m || m.failed) made.set(at, (m = { state: false, tool: false, glyphs: false, shaders: false, done: false, failed: false, id: idNow })); return m; };
    // (One job, the slide going in first, then the one ahead, then the one behind: each a list of small steps.)
    function* all() { for (const at of order) if (!made.get(at)?.done) yield* plan(at, mOf(at), ok); }
    const j = prepJob('slide-prep', all(), { alive: ok });
    live.add(j); st.jobs++;
    j.done.then((fin) => { live.delete(j); if (fin) st.done++; });
  }
  const cur = (i) => { const m = made.get(i); return m && m.id === String(identity() ?? '') ? m : null; };
  return {
    aim,
    ready: (i) => !!cur(i)?.done,
    manifest: (i) => (cur(i) ? { ...cur(i) } : null),
    /** 'unprepared', 'preparing', 'ready' or 'failed' for slide i of the deck now. */
    state: (i) => { const m = cur(i); return !m ? 'unprepared' : m.failed ? 'failed' : m.done ? 'ready' : 'preparing'; },
    /** Teardown (the deck closed or changed): every job stops, publishes nothing, and every manifest is dropped. */
    cancel: () => { gen++; stopAll(); made.clear(); idNow = null; },
    stats: () => ({ ...st, live: live.size, kept: made.size }),
  };
}
