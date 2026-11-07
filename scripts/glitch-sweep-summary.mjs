// Joins the glitch sweep's findings (one findings.json per job, in folders under the given directory) into one list grouped by rule:
// node scripts/glitch-sweep-summary.mjs [dir]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || 'test-results/glitch-sweep';
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f === 'findings.json') files.push(p); } };
walk(dir);
const all = files.flatMap((p) => JSON.parse(readFileSync(p, 'utf8')));
const by = {};
for (const f of all) (by[f.rule] ||= []).push(f);
console.log(`### Glitch sweep: ${all.length} finding(s) from ${files.length} job(s)\n`);
for (const [r, l] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n**${r}** (${l.length})\n`);
  for (const f of l.slice(0, 80)) console.log(`- ${f.unit} frames ${f.from}-${f.to} (${f.ms[0]}-${f.ms[1]} ms): ${f.detail}`);
  if (l.length > 80) console.log(`- ... ${l.length - 80} more`);
}
