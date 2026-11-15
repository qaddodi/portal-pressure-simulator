// Work backward's live fit, off the main thread. The shipped library (inverse-library.js) is a coarse grid; this worker runs the real engine on
// the points around the best fits, a pattern search whose moves narrow each round, and sends each round's readings back (inverse-remote.js adds them to its
// own table and ranks again). A reading's patient takes about a quarter of a second, so a round is a few seconds, and it is its own worker:
// the engine worker runs the live figure and its jobs go one at a time, so a refinement there would hold the clock.
// A new request ends the old one between two patients (the loop yields so the message can arrive).
import { rank, refinePoints, pointsOf, rowOf, REFINE_ROUNDS as ROUNDS, REFINE_PER_ROUND as PER_ROUND } from '../engine/inverse.js';
import { LIBRARY } from '../engine/inverse-library.js';
import { runPatient } from '../engine/inverse-run.js';
import { keyOf } from '../engine/inverse-families.js';

const known = new Map(pointsOf(LIBRARY).map((pt) => [keyOf(pt.f, pt.p), pt]));
let latest = 0;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function refine({ seq, readings }) {
  for (let round = 1; round <= ROUNDS; round++) {
    const res = rank(readings, [...known.values()]);
    const todo = res.ready ? refinePoints(res, known, { families: 12, max: PER_ROUND, round }) : [];
    if (!todo.length) break;
    const rows = [];
    for (const t of todo) {
      await tick();
      if (latest !== seq) return;
      const r = runPatient(t.f, t.p);
      known.set(keyOf(t.f, t.p), { f: t.f, p: t.p, r });
      rows.push(rowOf(t.f, t.p, r));
    }
    self.postMessage({ t: 'points', seq, rows, round, rounds: ROUNDS, done: false });
  }
  if (latest === seq) self.postMessage({ t: 'points', seq, rows: [], round: ROUNDS, rounds: ROUNDS, done: true });
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.t === 'refine') { latest = m.seq; refine(m).catch((err) => self.postMessage({ t: 'error', seq: m.seq, message: String(err && err.message || err) })); }
  else if (m.t === 'cancel') latest = 0;
};
