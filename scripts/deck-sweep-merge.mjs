// Joins the deck sweep's shares into one report and prints its summary: node scripts/deck-sweep-merge.mjs <dir with the shares' .json files> [--out merged.json]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mergeReports, summarize } from './deck-sweep-lib.mjs';

const dir = process.argv[2];
const outAt = process.argv.indexOf('--out');
const out = outAt > 0 ? process.argv[outAt + 1] : '';
if (!dir) { console.error('usage: node scripts/deck-sweep-merge.mjs <dir> [--out merged.json]'); process.exit(2); }
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.json') ? [join(d, e.name)] : []));
const reports = walk(dir).map((f) => JSON.parse(readFileSync(f, 'utf8'))).filter((r) => r && r.results);
if (!reports.length) { console.error(`no deck-sweep report in ${dir}`); process.exit(2); }
const merged = mergeReports(reports);
const text = summarize(merged);
if (out) { writeFileSync(out, JSON.stringify(merged, null, 1)); writeFileSync(out.replace(/\.json$/, '') + '.txt', `${text}\n`); }
console.log(text);
process.exit(Object.values(merged.results).some((r) => r.ok === false || r.problems.length) ? 1 : 0);
