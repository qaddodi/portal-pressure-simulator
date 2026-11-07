// Move one part out of src/ui/stage.js (stage-split plan 2.4).
//   node scripts/stage-split/move.mjs <part>            plan, write the part file, stage.js, budgets and docs/stage-map.md
//   node scripts/stage-split/move.mjs <part> --dry      print the plan (st, live, returned, refusals) and write nothing
//   node scripts/stage-split/move.mjs --dry-all         dry run of every spec in scripts/stage-split/parts/
// A spec (scripts/stage-split/parts/<part>.json): { factory, file, about, lines: [[from, to]], names: [], stay: [], also: [] } — `lines` selects
// every top-level statement of createStage that starts in those lines of the CURRENT stage.js; names add statements by what they declare.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitStage } from './lib.mjs';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SPEC_DIR = join(ROOT, 'scripts/stage-split/parts');
const STAGE = join(ROOT, 'src/ui/stage.js');
const args = process.argv.slice(2), dry = args.includes('--dry') || args.includes('--dry-all');
const timers = (s) => (s.match(/\b(setTimeout|setInterval)\(/g) || []).length;
const lines = (s) => s.split('\n').length - 1;

function report(name, r) {
  if (!r.ok) { console.log(`${name}: REFUSED\n  - ${r.refusals.join('\n  - ')}`); return; }
  const x = r.report;
  console.log(`${name}: ok, ${x.moved.length} statements; st ${x.st.length}, live ${x.live.length} (${x.live.join(', ')}), returned ${x.returned.length}, imports ${x.imports.length}${x.notes.length ? `\n  notes: ${x.notes.join('; ')}` : ''}`);
}
const specs = args.includes('--dry-all') ? readdirSync(SPEC_DIR).filter((f) => f.endsWith('.json')).sort() : [`${args.find((a) => !a.startsWith('--'))}.json`];
for (const f of specs) {
  const spec = JSON.parse(readFileSync(join(SPEC_DIR, f), 'utf8')), src = readFileSync(STAGE, 'utf8');
  const r = splitStage(src, spec);
  report(f.replace('.json', ''), r);
  if (dry || !r.ok) { if (!r.ok && !dry) process.exit(1); continue; }
  const partPath = join(ROOT, 'src/ui', spec.file);
  if (existsSync(partPath)) { console.error(`${spec.file} already exists`); process.exit(1); }
  writeFileSync(partPath, r.part); writeFileSync(STAGE, r.stage);
  // budgets: stage.js and the family follow the new counts; timers split, the family sum unchanged; a part over 1500 lines needs its own entry.
  const sizeFile = join(ROOT, 'scripts/size-budget.json'), sz = JSON.parse(readFileSync(sizeFile, 'utf8'));
  sz.files['src/ui/stage.js'] = lines(r.stage);
  const fam = readdirSync(join(ROOT, 'src/ui')).filter((n) => /^stage(-.+)?\.js$/.test(n)).reduce((a, n) => a + lines(readFileSync(join(ROOT, 'src/ui', n), 'utf8')), 0);
  sz.files['src/ui/stage*'] = fam;
  if (lines(r.part) > 1500) sz.files['src/ui/' + spec.file] = lines(r.part);
  writeFileSync(sizeFile, JSON.stringify(sz, null, 1).replace(/\n {2,}"/g, ' "').replace(/\{\n {2}"src/, '{ "src') + '\n');
  const tFile = join(ROOT, 'scripts/timer-budget.json'), tb = JSON.parse(readFileSync(tFile, 'utf8'));
  tb.files['src/ui/stage.js'] = timers(r.stage);
  writeFileSync(tFile, JSON.stringify(tb, null, 1).replace(/\{\n {2}"files": \{\n/, '{\n "files": {\n') + '\n');
  execFileSync('node', [join(ROOT, 'scripts/stage-map.mjs')], { stdio: 'inherit' });
  console.log(`wrote src/ui/${spec.file} (${lines(r.part)} lines); stage.js ${lines(src)} -> ${lines(r.stage)}`);
}
