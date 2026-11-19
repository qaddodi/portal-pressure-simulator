// Read what any debug tool printed or copied (bible review 19 Nov 2026, DBG-3): one Run report block ("-----BEGIN REPORT JSON-----"), a bug packet or a replay result.
//
//   node scripts/report.mjs show <paste.txt | ->           the report as text: build, device, scope, health, every finding with its severity, owner and why
//   node scripts/report.mjs compare <before> <after>       what changed between two (any two tools; findings match by rule and words): fixed, still, NEW
//
// `-` reads standard input. Exit status: show 0 when nothing failed, 1 when a finding is `fail`, 2 for text that cannot be read; compare 0 for fixed or unchanged, 1 otherwise.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseReport, renderRun, compareRuns, validateRun } from '../src/ui/report/run.js';

const [cmd, ...rest] = process.argv.slice(2);
const files = rest.filter((a) => !a.startsWith('--'));
const read = (f) => {
  const text = f === '-' || !f ? readFileSync(0, 'utf8') : readFileSync(resolve(f), 'utf8');
  const r = parseReport(text);
  if (!r.ok) { console.error(`Cannot read ${f || 'the input'}: ${r.why}`); process.exit(2); }
  const v = validateRun(r.run);
  if (!v.ok) { console.error(`Not a valid report: ${v.errors.slice(0, 3).join('; ')}`); process.exit(2); }
  return r;
};

if (cmd === 'show') {
  const { run, from } = read(files[0]);
  console.log(renderRun(run, { json: false }));
  if (from !== 'run') console.log(`\n(read from a ${from}; run \`node scripts/packet.mjs show\` for its state and screen)`);
  process.exit(run.findings.some((f) => f.sev === 'fail') ? 1 : 0);
}
if (cmd === 'compare') {
  const a = read(files[0]), b = read(files[1]);
  const c = compareRuns(a.run, b.run);
  for (const l of c.lines) console.log(l);
  process.exit(['fixed', 'unchanged'].includes(c.verdict) ? 0 : 1);
}
console.error('usage: node scripts/report.mjs show <paste | ->   |   compare <before> <after>   (see the top of the file)');
process.exit(2);
