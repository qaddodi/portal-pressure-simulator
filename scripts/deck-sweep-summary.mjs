// Summarises the deck layout sweep's results (deck-sweep/<deck>.<size>.json, or one folder per artifact under the
// given directory) into one short table and the list of findings: node scripts/deck-sweep-summary.mjs [dir]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || 'deck-sweep';
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.json')) files.push(p); } };
walk(dir);
const rows = {}, findings = [];
for (const p of files.sort()) {
  const [deck, size] = p.split('/').pop().replace('.json', '').split('.');
  const r = JSON.parse(readFileSync(p, 'utf8'));
  const lines = [];
  r.errors.forEach((e) => lines.push(`console: ${e.slice(0, 160)}`));
  r.fwd.forEach((s, i) => {
    s.issues.forEach((x) => lines.push(`slide ${i + 1}: ${x}`));
    const b = r.back?.[i];
    if (b && (b.text !== s.text || b.panel !== s.panel)) lines.push(`slide ${i + 1}: words differ going back`);
  });
  (rows[deck] ||= {})[size] = `${r.fwd.length} slides${lines.length ? `, ${lines.length} finding(s)` : ', clean'}`;
  for (const l of lines) findings.push(`${deck} ${size} ${l}`);
}
console.log('deck | desktop | ipad | phone');
for (const [d, s] of Object.entries(rows)) console.log(`${d} | ${s.desktop || 'MISSING'} | ${s.ipad || 'MISSING'} | ${s.phone || 'MISSING'}`);
console.log(`\n${findings.length} finding(s)`);
for (const f of findings) console.log(f);
