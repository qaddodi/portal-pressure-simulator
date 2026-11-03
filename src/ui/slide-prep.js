// A slide's resources, prepared as one set before it is shown, and its neighbours' ahead of the press (recs R05, 2 Nov 2026; Mohammad:
// "implement"). Each slide has a manifest: its model state computed, its data card's own points started (the tool's warm), the GPU
// glyphs loaded and every shader program that has finished compiling published (gl-compile.js prepareShaders, R10). aim(i, dir) is
// called on each Next, Back or jump: it starts a new generation, so every job of the one before (a slide the person has gone past, or
// a direction just reversed) stops at its next step and publishes nothing; then it prepares the slide going in, at once, and the one
// after it in the direction of travel, then the one behind, in idle time between frames (never in a frame of motion). At most three
// manifests are kept (the slide and its two neighbours); one further away is dropped.
// (recs-production-120hz §6, 2 Nov 2026: readiness is an awaited, versioned contract. A tool's warm returns its completion and is
// awaited; manifests are keyed by the deck's identity (identity(): deck id, revision, look, context generation) as well as the slide,
// so deck B's slide 0 never inherits deck A's; a shader step that still waits resumes when a program is published (whenShadersMove),
// up to SHADER_TRIES times, instead of leaving the slide unready for good; a step that fails marks the manifest failed, never ready;
// cancel() is the presenter's teardown and drops every manifest. States: unprepared, preparing, ready, failed.)
import { prepJob, prepLeft } from './prep-budget.js';
import { whenShadersMove } from './gl-compile.js';
import { caught } from './caught.js';

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
  const st = { aims: 0, jobs: 0, cancelled: 0, done: 0, failed: 0 };
  const shaderMs = () => Math.max(0, Math.min(SHADER_MS, prepLeft()));
  const fail = (m) => () => { m.failed = true; };
  function* plan(i, m, ok) {
    // (B16: a step that throws before its promise exists, or rejects, marks the manifest failed; a failed manifest plans nothing more.)
    const run = (f) => () => { try { return f(); } catch { m.failed = true; return null; } };
    if (!m.state && !m.failed && ok()) yield run(() => Promise.resolve(steps.state?.(i)).then((v) => {
      // (R04: a state that settles with nothing (the presentation's states were abandoned, or the slide could not be computed) is not a state: failed, so the next aim tries afresh. The tool's warm below may legitimately settle with nothing.)
      if (ok()) { if (v == null) m.failed = true; else m.state = true; }
    }, fail(m)));
    if (m.failed || !ok()) return;
    if (!m.glyphs) yield run(() => Promise.resolve(steps.glyphs?.()).then(() => { if (ok()) m.glyphs = true; }, fail(m)));
    // (Awaited: a warm that returns a promise (a curve's model days) is done when it settles, not when it was started.)
    if (m.failed || !ok()) return;
    if (!m.tool) yield () => { let r; try { r = steps.tool?.(i); } catch { m.failed = true; return null; } return Promise.resolve(r).then(() => { if (ok()) m.tool = true; }, fail(m)); };
    if (m.failed || !ok()) return;
    // (The shaders: published within the step's share; still waiting, the step waits for the next publication and tries again.)
    for (let t = 0; t < SHADER_TRIES && !m.shaders && !m.failed && ok(); t++) {
      yield () => {
        try { m.shaders = steps.shaders ? steps.shaders(shaderMs()) === 0 : true; } catch { m.failed = true; return; }
        // (B16: a publication that failed leaves the waiting set too; an empty set is not proof, so a failure since this manifest began fails it.)
        if ((steps.shadersFailed?.() ?? 0) > m.sf0) m.failed = true;
      };
      if (!m.shaders && !m.failed) yield () => whenShadersMove(250);
    }
    // (B19: out of tries with the shaders still compiling is a failure, not an eternal "preparing": the next aim tries the slide afresh.)
    if (!ok()) return;
    if (!m.shaders) m.failed = true;
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
  let last = null;   // (the last aim: what refresh() aims again)
  /** The person is going to slide i (dir: 'next', 'back' or 'jump'). Starts a new generation; stale jobs stop and leave the queue.
   *  alive (optional): the slide change this aim serves is still the current one. (B18: it holds the slide going in only. That slide's
   *  steps stop when its change is superseded, but the change LANDING ends the change too, and the slides beside it are the point of
   *  preparing ahead: their steps belong to the generation, the deck and the context, so they go on after the landing. A newer aim, a
   *  new deck, look or context generation, or cancel() stops them.) */
  function aim(i, dir = 'next', alive = () => true) {
    const g = ++gen;
    st.aims++;
    stopAll();
    const id = own();
    trim(i);
    last = { i, dir, alive };
    const ok = () => g === gen && String(identity() ?? '') === id;   // (this generation, this deck, look and context)
    const okIn = () => ok() && alive();
    // (R04: the failure baseline is taken before any shader publication this aim makes, the eager call below included, so a failure in it fails the slide.)
    const sf0 = steps.shadersFailed?.() ?? 0;
    // (The slide going in first, now: its shaders published in the press's own task, before its first frame, within the budget.)
    try { steps.shaders?.(shaderMs()); } catch (e) { caught('slide-prep:70', e); /* next time */ }
    const order = (dir === 'back' ? [i, i - 1, i + 1] : [i, i + 1, i - 1]).filter((k) => k >= 0 && k < count());
    const mOf = (at) => { let m = made.get(at); if (!m || m.failed) made.set(at, (m = { state: false, tool: false, glyphs: false, shaders: false, done: false, failed: false, id: idNow, sf0 })); return m; };
    // (One job, the slide going in first, then the one ahead, then the one behind: each a list of small steps. B19: a slide that failed
    // is counted, the job goes on to the next slide, and it is never counted as a completed job.)
    let bad = 0;
    function* all() { for (const at of order) if (!made.get(at)?.done) { const m = mOf(at); yield* plan(at, m, at === i ? okIn : ok); if (m.failed) bad++; } }
    const j = prepJob('slide-prep', all(), { alive: ok, onFail: () => { bad++; } });
    live.add(j); st.jobs++;
    j.done.then((fin) => { live.delete(j); if (fin && !bad) st.done++; else if (bad) st.failed++; });
  }
  const cur = (i) => { const m = made.get(i); return m && m.id === String(identity() ?? '') ? m : null; };
  return {
    aim,
    ready: (i) => !!cur(i)?.done,
    manifest: (i) => (cur(i) ? { ...cur(i) } : null),
    /** 'unprepared', 'preparing', 'ready' or 'failed' for slide i of the deck now. */
    state: (i) => { const m = cur(i); return !m ? 'unprepared' : m.failed ? 'failed' : m.done ? 'ready' : 'preparing'; },
    /** Teardown (the deck closed or changed): every job stops, publishes nothing, and every manifest is dropped. */
    cancel: () => { gen++; stopAll(); made.clear(); idNow = null; last = null; },
    /** B17: the GL resources the manifests were made against are gone (a context restored) or anything in identity() changed: the
     *  manifests are dropped and the slide last aimed at, with its neighbours, is prepared afresh before it is trusted ready. */
    refresh: () => { if (last && String(identity() ?? '') !== idNow) aim(last.i, last.dir, last.alive); },
    stats: () => ({ ...st, live: live.size, kept: made.size }),
  };
}
