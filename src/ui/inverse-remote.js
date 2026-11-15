// Work backward as the screen sees it: the search over the shipped library at once (ranking 186 patients is a fraction of a millisecond, so
// it runs on the page at every reading typed) and the live refinement in its worker (inverse-worker.js) adding patients near the best fits,
// round by round, until the numbers stop moving. The same calls whether or not a worker could be made:
//   peek(raw)      the ranking of these readings now, nothing started (a screen asks it at every key typed)
//   set(raw)       the readings now entered: ranks at once and starts a refinement; returns the result
//   result()       the latest ranking (library and everything refined so far)
//   status()       'idle' | 'refining' | 'done' | 'library' (no worker, or it failed: the ranking is the grid's, and says so)
// The worker is made when the first refinement is asked for (a person has entered enough readings), never before: opening the screen costs nothing.
//   progress()     { round, rounds } while refining
//   on(fn)         fn(result) after each round; returns the off function
//   dispose()      ends the worker
// A reply to an older request is dropped, a refinement that has been silent for REFINE_TIMEOUT_MS is given up (the worker ended, the ranking
// stays the grid's plus what came back), and nothing here ever blocks the page.
import { rank, pointsOf, normalise, MIN_READINGS, REFINE_ROUNDS as ROUNDS } from '../engine/inverse.js';
import { LIBRARY } from '../engine/inverse-library.js';
import { keyOf } from '../engine/inverse-families.js';

export const REFINE_TIMEOUT_MS = 40000;

/** `makeWorker()` returns the worker (the module that holds the URL builds it, so the bundle can point it at its file). */
export function createInverseRemote(makeWorker, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const points = new Map(pointsOf(LIBRARY).map((pt) => [keyOf(pt.f, pt.p), pt]));
  let w = null, state = typeof Worker === 'function' && makeWorker ? 'idle' : 'library', seq = 0, res = rank({}, []), raw = {}, round = 0, timer = null;
  const subs = new Set();
  const emit = () => { for (const fn of subs) fn(res); };
  const rerank = () => { res = rank(raw, [...points.values()]); };
  const quiet = () => { if (timer != null) { clearTimer(timer); timer = null; } };
  const giveUp = () => { quiet(); if (state === 'refining') { state = 'library'; try { w?.postMessage({ t: 'cancel' }); } catch { /* (the worker is gone) */ } emit(); } };
  const arm = () => { quiet(); timer = setTimer(giveUp, REFINE_TIMEOUT_MS); };
  // (The worker, made on the first refinement: its replies are read by seq, so a reply to an older request is dropped.)
  function ensure() {
    if (w || state === 'library') return !!w;
    try { w = makeWorker(); } catch { w = null; }
    if (!w) { state = 'library'; return false; }
    w.onmessage = (e) => {
      const m = e.data;
      if (m.seq !== seq || state !== 'refining') return;
      if (m.t === 'error') { giveUp(); return; }
      if (m.t !== 'points') return;
      for (const [f, vals, rs] of m.rows) { const pt = pointsOf([[f, vals, rs]])[0]; points.set(keyOf(pt.f, pt.p), pt); }
      round = m.round;
      if (m.done) { quiet(); state = 'done'; } else arm();
      rerank(); emit();
    };
    w.onerror = w.onmessageerror = () => { state = 'library'; quiet(); emit(); };
    return true;
  }
  return {
    set(next) {
      raw = next || {};
      rerank();
      const was = state;
      seq++; quiet();
      const { readings } = normalise(raw);
      if (state !== 'library' && Object.keys(readings).length >= MIN_READINGS && ensure()) {
        state = 'refining'; round = 0; arm();
        try { w.postMessage({ t: 'refine', seq, readings }); } catch { state = 'library'; quiet(); }
      } else if (state !== 'library') { state = 'idle'; if (was === 'refining') try { w?.postMessage({ t: 'cancel' }); } catch { /* (the worker is gone) */ } }
      return res;
    },
    peek: (next) => rank(next || {}, [...points.values()]),
    result: () => res,
    status: () => state,
    progress: () => ({ round, rounds: ROUNDS }),
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
    dispose() { quiet(); subs.clear(); if (w) { w.onmessage = w.onerror = w.onmessageerror = null; try { w.terminate(); } catch { /* (already gone) */ } w = null; } state = 'library'; },
  };
}
