// Work backward's live fit, off the main thread. The shipped library (inverse-library.js) is a coarse grid; this worker runs the real engine on
// the best fits with a Gauss-Newton fit (it probes each lesion, solves for the step that lowers the squared residuals and the Occam cost, and takes it inside a
// trust region that shrinks round by round), and sends each round's patients back (inverse-remote.js adds them to its own table and ranks again). It stops early
// when a round no longer moves the best score (EARLY_STOP). A reading's patient takes about a quarter of a second, so a round is a few seconds, and it is its own worker:
// the engine worker runs the live figure and its jobs go one at a time, so a refinement there would hold the clock.
// A new request ends the old one between two patients (the loop yields so the message can arrive).
import { rank, refinePoints, pointsOf, rowOf, REFINE_ROUNDS as ROUNDS, REFINE_PER_ROUND as PER_ROUND } from '../engine/inverse.js';
import { LIBRARY } from '../engine/inverse-library.js';
import { runPatient } from '../engine/inverse-run.js';
import { keyOf } from '../engine/inverse-families.js';

const known = new Map(pointsOf(LIBRARY).map((pt) => [keyOf(pt.f, pt.p), pt]));
// The patients run but not yet sent: a request ended in the middle of a round (the typing went on, or "Show scenarios" asked again) leaves them
// here, and the next request sends them first, so the page's table and this one are never different. (A patient this worker holds and the page
// lacks would be skipped as already scored, and the page would call the fit done without the best points.)
const unsent = new Map();
let latest = 0;
const EARLY_STOP = 0.2;   // three rounds in a row that move the best score by less than this end the fit (review E11)
const STALLED = 3;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function refine({ seq, readings }) {
  if (unsent.size) { self.postMessage({ t: 'points', seq, rows: [...unsent.values()], round: 0, rounds: ROUNDS, done: false }); unsent.clear(); }
  let before = null, still = 0;
  for (let round = 1; round <= ROUNDS; round++) {
    const res = rank(readings, [...known.values()]);
    const now = res.ready && res.families.length ? res.families[0].score : null;
    still = round > 1 && before !== null && now !== null && Math.abs(before - now) < EARLY_STOP ? still + 1 : 0;
    if (still >= STALLED) break;
    before = now;
    const todo = res.ready ? refinePoints(res, known, { families: 12, max: PER_ROUND, round }) : [];
    if (!todo.length) break;
    const rows = [];
    for (const t of todo) {
      await tick();
      if (latest !== seq) return;
      const r = runPatient(t.f, t.p);
      known.set(keyOf(t.f, t.p), { f: t.f, p: t.p, r });
      const row = rowOf(t.f, t.p, r);
      rows.push(row); unsent.set(keyOf(t.f, t.p), row);
    }
    self.postMessage({ t: 'points', seq, rows, round, rounds: ROUNDS, done: false });
    for (const row of rows) { const pt = pointsOf([row])[0]; unsent.delete(keyOf(pt.f, pt.p)); }
  }
  if (latest === seq) self.postMessage({ t: 'points', seq, rows: [], round: ROUNDS, rounds: ROUNDS, done: true });
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.t === 'refine') { latest = m.seq; refine(m).catch((err) => self.postMessage({ t: 'error', seq: m.seq, message: String(err && err.message || err) })); }
  else if (m.t === 'cancel') latest = 0;
  else if (m.t === 'state') self.postMessage({ t: 'state', held: known.size, unsent: unsent.size });   // (for the test that checks the two tables agree)
};
