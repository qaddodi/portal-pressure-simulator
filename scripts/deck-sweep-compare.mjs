// Compares two deck-sweep reports over the slides both hold (deck-sweep.mjs --out): a full run and a cards-only one (--cards-only), or any two.
//
//   node scripts/deck-sweep-compare.mjs <a.json> <b.json>
//
// For each slide at each size in both: the problems only one of them found. Exit 1 when any differ, so a cards-only run that misses (or invents)
// a problem the full app shows is caught. Slides in only one report are counted, not judged.

import { readFileSync } from 'node:fs';
import { compareReports } from './deck-sweep-lib.mjs';

const [fa, fb] = process.argv.slice(2);
if (!fa || !fb) { console.error('usage: node scripts/deck-sweep-compare.mjs <a.json> <b.json>'); process.exit(2); }
const [a, b] = [fa, fb].map((f) => JSON.parse(readFileSync(f, 'utf8')));
const c = compareReports(a, b);
for (const d of c.differ) {
  console.log(`${d.key}:`);
  for (const p of d.onlyA) console.log(`    only in ${fa}: ${p}`);
  for (const p of d.onlyB) console.log(`    only in ${fb}: ${p}`);
}
console.log(`${c.both} slide-sizes in both: ${c.same} the same, ${c.differ.length} differ; ${c.onlyA} only in the first, ${c.onlyB} only in the second.`);
process.exit(c.differ.length ? 1 : 0);
