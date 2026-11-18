// ?watch in the address (preview only): the motion recorder and its red dot. Loaded by main.js only with the flag, so a plain load is untouched.
//   window.pps.watch.history({ seconds = 10 })   the last seconds as plain JSON (history.js), for the bug packet and the Node replay
//   window.pps.watch.findings()                   the motion rules' findings so far, { rule, what, where, why, owner, at, t0, t1 }
//   window.pps.watch.judge()                      judge the last seconds now
// Replay a pasted history in Node: import { replayHistory } from './replay.js'. Notes: docs/watch.md.
import { onFrameEnd } from '../frame.js';
import { restPass } from '../rest-pass.js';
import { createWatch } from './recorder.js';
import { pageSources, watchEvents } from './sources.js';
import { createDot } from './dot.js';

/** Waits for the app's window.pps (main.js makes it after the top bar is wired), up to `limit` ms, then starts. */
export async function startWatch(get = () => window.pps, limit = 30000) {
  let pps = typeof get === 'function' ? get() : get;
  for (let t = 0; !(pps && pps.stage) && t < limit; t += 100) { await new Promise((ok) => setTimeout(ok, 100)); pps = typeof get === 'function' ? get() : get; }
  return begin(pps);
}

export function begin(pps) {
  if (!pps || !pps.stage || pps.watch) return pps && pps.watch;
  const src = pageSources(pps);
  let dot = null;
  const w = createWatch({
    onFrames: onFrameEnd, rest: restPass, sources: src,
    env: () => ({ vw: innerWidth, vh: innerHeight }),
    onFinding: () => dot && dot.add(),
  });
  dot = createDot({ watch: w });
  document.body.append(dot.el);
  const viewName = () => { try { const s = pps.store.get(); return s.lobule ? (s.sinusoid ? 'sinusoid' : 'lobule') : s.view; } catch { return ''; } };
  const offEvents = watchEvents(w, { rest: restPass, viewName });
  w.start();
  pps.watch = {
    history: (o) => w.history(o), findings: () => w.findings(), judge: () => w.judge(), clear: () => w.clear(),
    stop() { w.stop(); offEvents(); src.release(); dot.remove(); delete pps.watch; },
  };
  return pps.watch;
}
