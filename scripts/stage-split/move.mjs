// Move one part out of a big closure (stage-split plan 2.4). The stage by default; --host presenter | lobule for src/ui/presenter.js and src/ui/lobule-zoom.js.
//   node scripts/stage-split/move.mjs [--host <h>] <part>        plan, write the part file, the host file, budgets (and docs/stage-map.md for the stage)
//   node scripts/stage-split/move.mjs [--host <h>] <part> --dry  print the plan (st, live, returned, refusals) and write nothing
//   node scripts/stage-split/move.mjs [--host <h>] --dry-all     dry run of every spec in the host's spec directory
// A spec (scripts/stage-split/<specDir>/<part>.json): { factory, file, about, lines: [[from, to]], names: [], stay: [], also: [] } — `lines` selects
// every top-level statement of the host's function that starts in those lines of the CURRENT host file; names add statements by what they declare.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { splitStage, useHost } from './lib.mjs';
import { HOSTS, ROOT, hostConfig, familyFiles } from './hosts.mjs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2), dry = args.includes('--dry') || args.includes('--dry-all');
const hostName = args.includes('--host') ? args[args.indexOf('--host') + 1] : 'stage';
const host = HOSTS[hostName];
if (!host) { console.error(`unknown host ${hostName}: ${Object.keys(HOSTS).join(', ')}`); process.exit(2); }
useHost(hostConfig(hostName));
const SPEC_DIR = join(ROOT, 'scripts/stage-split', host.specDir);
const FILE = join(ROOT, 'src/ui', host.file);
const timers = (s) => (s.match(/\b(setTimeout|setInterval)\(/g) || []).length;
const lines = (s) => s.split('\n').length - 1;

function report(name, r) {
  if (!r.ok) { console.log(`${name}: REFUSED\n  - ${r.refusals.join('\n  - ')}`); return; }
  const x = r.report;
  console.log(`${name}: ok, ${x.moved.length} statements; st ${x.st.length}, live ${x.live.length} (${x.live.join(', ')}), returned ${x.returned.length}, imports ${x.imports.length}${x.notes.length ? `\n  notes: ${x.notes.join('; ')}` : ''}`);
}
const rest = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--host');
const specs = args.includes('--dry-all') ? readdirSync(SPEC_DIR).filter((f) => f.endsWith('.json')).sort() : [`${rest[0]}.json`];
for (const f of specs) {
  const spec = JSON.parse(readFileSync(join(SPEC_DIR, f), 'utf8')), src = readFileSync(FILE, 'utf8');
  const r = splitStage(src, spec);
  report(f.replace('.json', ''), r);
  if (dry || !r.ok) { if (!r.ok && !dry) process.exit(1); continue; }
  const partPath = join(ROOT, 'src/ui', spec.file);
  if (existsSync(partPath)) { console.error(`${spec.file} already exists`); process.exit(1); }
  writeFileSync(partPath, r.part); writeFileSync(FILE, r.stage);
  // budgets: the host file and its family follow the new counts; timers split, the family sum unchanged; a part over 1500 lines needs its own entry.
  const sizeFile = join(ROOT, 'scripts/size-budget.json'), sz = JSON.parse(readFileSync(sizeFile, 'utf8'));
  const key = 'src/ui/' + host.file;
  if (key in sz.files) sz.files[key] = lines(r.stage);
  if (host.family in sz.files) sz.files[host.family] = familyFiles(hostName).reduce((a, n) => a + lines(readFileSync(join(ROOT, 'src/ui', n), 'utf8')), 0);
  if (lines(r.part) > 1500) sz.files['src/ui/' + spec.file] = lines(r.part);
  writeFileSync(sizeFile, JSON.stringify(sz, null, 1).replace(/\n {2,}"/g, ' "').replace(/\{\n {2}"src/, '{ "src') + '\n');
  const tFile = join(ROOT, 'scripts/timer-budget.json'), tb = JSON.parse(readFileSync(tFile, 'utf8'));
  if (key in tb.files) tb.files[key] = timers(r.stage);
  if (host.family in tb.files) tb.files[host.family] = familyFiles(hostName).reduce((a, n) => a + timers(readFileSync(join(ROOT, 'src/ui', n), 'utf8')), 0);
  writeFileSync(tFile, JSON.stringify(tb, null, 1).replace(/\{\n {2}"files": \{\n/, '{\n "files": {\n') + '\n');
  if (hostName === 'stage') execFileSync('node', [join(ROOT, 'scripts/stage-map.mjs')], { stdio: 'inherit' });
  console.log(`wrote src/ui/${spec.file} (${lines(r.part)} lines); ${host.file} ${lines(src)} -> ${lines(r.stage)}`);
}
