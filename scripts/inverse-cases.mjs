// The 27 hand-entered clinical cases of the independent review of From readings (recs/from-readings-review.md, 15 Nov 2026): textbook readings, not the model's
// own, with sparse, conflicting, impossible and normal inputs. tests/inverse-cases.test.js ranks each on the shipped grid and checks what the review found wrong
// stays right; run as a tool it fits each on the real engine, as the worker does (about 20 s each):
//   node scripts/inverse-cases.mjs [C01 C04 ...]
// Readings use the keys of inverse.js READINGS; grades are indexes (asc 0 to 3, varix 0 to 2).
import { pathToFileURL } from 'node:url';

/** truth: the lesion mix the case is meant to be ('?' when no scenario should be trusted). */
export const CASES = Object.freeze([
  { id: 'C01', name: 'compensated CSPH', truth: 'sinus', readings: { whvp: 18, fhvp: 6, ra: 5, lsm: 28, plt: 95, spleen: 14, varix: 1 } },
  { id: 'C02', name: 'decompensated', truth: 'sinus', readings: { whvp: 24, fhvp: 7, ra: 6, lsm: 45, plt: 60, spleen: 16, asc: 2, saag: 1.9, varix: 2 } },
  { id: 'C03', name: 'early cACLD', truth: 'sinus', readings: { hvpg: 7, lsm: 13, plt: 170, spleen: 12.5 } },
  { id: 'C04', name: 'PSVD', truth: 'presin', readings: { whvp: 9, fhvp: 5, ra: 4, lsm: 7, ssm: 55, spleen: 18, plt: 70, varix: 2 } },
  { id: 'C05', name: 'schistosomiasis, non-invasive', truth: 'presin', readings: { lsm: 8, ssm: 60, spleen: 19, plt: 65, varix: 2, asc: 0 } },
  { id: 'C06', name: 'chronic PVT', truth: 'pvt', readings: { whvp: 8, fhvp: 5, lsm: 5.5, spleen: 15, plt: 100, pvVel: 0, varix: 2 } },
  { id: 'C07', name: 'Budd-Chiari, no catheter', truth: 'bcs', readings: { ra: 5, lsm: 45, asc: 3, saag: 1.6, spleen: 14, plt: 140 } },
  { id: 'C08', name: 'IVC web', truth: 'ivcweb', readings: { whvp: 20, fhvp: 18, ivc: 17, ra: 4, asc: 2, lsm: 30 } },
  { id: 'C09', name: 'SOS after transplant', truth: 'post', readings: { whvp: 22, fhvp: 6, ra: 4, lsm: 30, asc: 2, plt: 50, spleen: 13 } },
  { id: 'C10', name: 'right heart failure', truth: 'rhf', readings: { whvp: 21, fhvp: 18, ra: 18, lsm: 25, asc: 3, saag: 1.5, plt: 180, spleen: 12 } },
  { id: 'C11', name: 'constriction', truth: 'constr', readings: { whvp: 19, fhvp: 16, ra: 16, lsm: 28, asc: 2, saag: 1.4, plt: 200, spleen: 11.5 } },
  { id: 'C12', name: 'cirrhosis + right heart failure', truth: 'sinus+rhf', readings: { whvp: 28, fhvp: 15, ra: 14, lsm: 50, plt: 80, spleen: 15, asc: 2 } },
  { id: 'C13', name: 'cirrhosis + PVT', truth: 'sinus+pvt', readings: { whvp: 18, fhvp: 6, ra: 4, lsm: 30, plt: 70, spleen: 16, pvVel: 0, varix: 2 } },
  { id: 'C14', name: 'two pressures only', truth: 'sinus', readings: { whvp: 18, fhvp: 6 } },
  { id: 'C15', name: 'HVPG + LSM', truth: 'sinus', readings: { hvpg: 12, lsm: 25 } },
  { id: 'C16', name: 'LSM + platelets', truth: 'sinus', readings: { lsm: 30, plt: 90 } },
  { id: 'C17', name: 'conflict: HVPG 18, LSM 6', truth: '?', readings: { whvp: 24, fhvp: 6, lsm: 6, plt: 220, spleen: 11 } },
  { id: 'C18', name: 'impossible: FHVP below RA', truth: '?', readings: { whvp: 12, fhvp: 5, ra: 15 } },
  { id: 'C19', name: 'normal', truth: 'none', readings: { whvp: 7, fhvp: 4, ra: 3, lsm: 4.5, plt: 260, spleen: 10, asc: 0, varix: 0 } },
  { id: 'C20', name: 'normal, sparse', truth: 'none', readings: { lsm: 4.5, plt: 260 } },
  { id: 'C21', name: 'extreme cirrhosis', truth: 'sinus', readings: { whvp: 36, fhvp: 6, lsm: 75, plt: 30, spleen: 20, asc: 3 } },
  { id: 'C22', name: 'MASLD grey zone', truth: 'sinus', readings: { hvpg: 8, lsm: 18, plt: 140, spleen: 13 } },
  { id: 'C23', name: 'congestion, sparse', truth: 'rhf', readings: { lsm: 35, ra: 15 } },
  { id: 'C24', name: 'PSVD with a noisy wedge', truth: 'presin', readings: { whvp: 11, fhvp: 4, lsm: 8, ssm: 62, spleen: 18, plt: 75 } },
  { id: 'C25', name: 'spleen only', truth: 'n/a', readings: { whvp: 6, fhvp: 4, spleen: 16, plt: 85, ssm: 50, lsm: 5 } },
  { id: 'C26', name: 'EUS-PPG + LSM', truth: 'sinus', readings: { ppg: 14, lsm: 22 } },
  { id: 'C27', name: 'Budd-Chiari with a wedge', truth: 'bcs', readings: { whvp: 30, fhvp: 26, ra: 5, lsm: 50, asc: 3 } },
]);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { LIBRARY } = await import('../src/engine/portal/inverse-library.js');
  const { rank, refinePoints, pointsOf, REFINE_ROUNDS, REFINE_PER_ROUND } = await import('../src/engine/portal/inverse.js');
  const { runPatient } = await import('../src/engine/portal/inverse-run.js');
  const { keyOf } = await import('../src/engine/portal/inverse-families.js');
  // A one-off set of readings: node scripts/inverse-cases.mjs whvp=30 fhvp=24 ...
  const args = process.argv.slice(2), custom = args.filter((a) => a.includes('='));
  const list = custom.length ? [{ id: 'X', name: custom.join(' '), truth: '?', readings: Object.fromEntries(custom.map((a) => a.split('=')).map(([k, v]) => [k, +v])) }] : CASES;
  const want = new Set(custom.length ? [] : args);
  for (const c of list) {
    if (want.size && !want.has(c.id)) continue;
    const known = new Map(pointsOf(LIBRARY).map((pt) => [keyOf(pt.f, pt.p), pt]));
    for (let round = 1; round <= REFINE_ROUNDS; round++) {
      const todo = refinePoints(rank(c.readings, [...known.values()]), known, { families: 12, max: REFINE_PER_ROUND, round });
      if (!todo.length) break;
      for (const t of todo) known.set(keyOf(t.f, t.p), { f: t.f, p: t.p, r: runPatient(t.f, t.p) });
    }
    const r = rank(c.readings, [...known.values()]);
    console.log(`${c.id} ${c.name} (truth ${c.truth}) fit ${r.fit.ok ? 'ok' : 'POOR chi/n ' + r.fit.perReading.toFixed(1)}${r.warnings.length ? ' warn ' + r.warnings.map((w) => w.code) : ''}`);
    for (const f of r.families.filter((x) => x.status !== 'out').slice(0, 5)) console.log(`   ${f.status.padEnd(8)} ${(f.rating * 100).toFixed(0).padStart(3)}% chi ${f.best.chi.toFixed(1).padStart(5)} ${f.id} ${JSON.stringify(f.best.p)}`);
  }
}
