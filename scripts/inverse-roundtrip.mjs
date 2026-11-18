// Round trip for From readings (15 Nov 2026): draw a random virtual patient from the model's own sliders (one to three lesions at any severity, and the side
// sliders the lesions carry: pump strength, tricuspid leak, the volume held, albumin, splanchnic tone), run it to its readings, give those readings to the search
// exactly as the worker does, and check the search finds a scenario that gives the same readings at no more Occam cost than the one drawn.
//   node scripts/inverse-roundtrip.mjs [count=10] [seed=1] [--lib]    (--lib: the shipped library alone, no fit; fast)
import { pathToFileURL } from 'node:url';
import { LIBRARY } from '../src/engine/inverse-library.js';
import { rank, refinePoints, pointsOf, costOf, normalise, REFINE_ROUNDS, REFINE_PER_ROUND } from '../src/engine/inverse.js';
import { runPatient } from '../src/engine/inverse-run.js';
import { FAMILIES, FAMILY, SIDE, sidesOf, sideDefault, sideClamp, keyOf } from '../src/engine/inverse-families.js';

/** The readings a clinic might have: the pressures, the stiffness, the blood count, the spleen, the fluid and the portal flow. */
export const ENTERED = ['whvp', 'fhvp', 'ra', 'lsm', 'plt', 'spleen', 'asc', 'pvVel'];

const lcg = (seed) => { let s = (seed * 2654435761) >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/** A random patient: { f, p } with severities 0.15 to 1 and, for half the sides the family has, a setting drawn over the slider's own range. */
export function randomPatient(rand, maxLesions = 3) {
  const fams = FAMILIES.filter((f) => f.id !== 'none' && f.axes.length <= maxLesions), fam = fams[Math.floor(rand() * fams.length)];
  const p = Object.fromEntries(fam.axes.map((k) => [k, Math.round((0.15 + 0.85 * rand()) * 100) / 100]));
  for (const x of sidesOf(fam.axes)) if (rand() < 0.5) {
    const v = sideClamp(x.id, x.lo + (x.hi - x.lo) * (0.1 + 0.8 * rand()));
    if (Math.abs(v - sideDefault(fam.axes, x.id, p)) > x.round) p[x.id] = v;
  }
  return { f: fam.id, p };
}

/** Fit `readings` as the worker does (library, then Gauss-Newton rounds on the real engine). */
export function fit(readings, { lib = false } = {}) {
  const known = new Map(pointsOf(LIBRARY).map((pt) => [keyOf(pt.f, pt.p), pt]));
  let before = null, still = 0;
  for (let round = 1; !lib && round <= REFINE_ROUNDS; round++) {
    const res = rank(readings, [...known.values()]);
    const now = res.families[0].score;
    still = round > 1 && Math.abs(before - now) < 0.2 ? still + 1 : 0;
    if (still >= 3) break;
    before = now;
    const todo = refinePoints(res, known, { families: 12, max: REFINE_PER_ROUND, round });
    if (!todo.length) break;
    for (const t of todo) known.set(keyOf(t.f, t.p), { f: t.f, p: t.p, r: runPatient(t.f, t.p) });
  }
  return rank(readings, [...known.values()]);
}

/**
 * One round trip: { ok, drawn, found, ... }. ok: a scenario the search still holds in play (not ruled out, not a smaller mix with a trace added) gives the readings
 * (chi under half an allowed error per reading, squared) at an Occam cost within 1.5 of the drawn one: the drawn patient, or one as simple that reads the same.
 */
export function roundTrip(seed, opts = {}) {
  const rand = lcg(seed), drawn = randomPatient(rand, opts.maxLesions || 3), r = runPatient(drawn.f, drawn.p);
  const { readings } = normalise(Object.fromEntries(ENTERED.filter((k) => r[k] != null).map((k) => [k, r[k]])));
  const res = fit(readings, opts), n = Object.keys(readings).length, drawnCost = costOf(drawn.f, drawn.p);
  const match = res.families.filter((f) => !f.redundant && f.status !== 'out' && f.best.chi <= 0.5 * n && f.best.cost <= drawnCost + 1.5).sort((a, b) => a.score - b.score)[0];
  const lead = res.families.find((f) => !f.redundant) || res.families[0], show = match || lead;
  return { ok: !!match, seed, drawn, drawnCost, readings, found: { f: show.id, p: show.best.p, chi: show.best.chi, score: show.best.score, leader: lead.id } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--')), lib = process.argv.includes('--lib');
  const count = +args[0] || 10, seed0 = +args[1] || 1, maxLesions = +(process.argv.find((a) => a.startsWith('--max='))?.slice(6)) || 3;
  let good = 0;
  for (let i = 0; i < count; i++) {
    const t = roundTrip(seed0 + i, { lib, maxLesions });
    if (t.ok) good++;
    console.log(t.ok ? 'ok  ' : 'MISS', t.seed, 'drawn', t.drawn.f, JSON.stringify(t.drawn.p), 'cost', t.drawnCost.toFixed(1), '| found', t.found.f, JSON.stringify(t.found.p), 'chi', t.found.chi.toFixed(2), 'score', t.found.score.toFixed(1), t.ok ? '' : JSON.stringify(t.readings));
  }
  console.log(`${good} of ${count} found`);
}
