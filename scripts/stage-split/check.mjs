// The proof for a move (stage-split plan 2.5). Reads code only: no browser, no screenshots.
//   node scripts/stage-split/check.mjs [--host <h>] [--base <git ref>]     (default host: the stage; base: HEAD when src/ui differs from it, else HEAD~1)
// 1. Inline equivalence: every part is put back at its call (live.x back to x) and the result is the same program as the host file at the base.
// 2. No copies: nothing a part gets by value is a let or a reassigned name; the second argument is the live record.
// 3. Budgets: the host file and its family are not over scripts/size-budget.json.
// 4. Boot (the stage only): tests/warm-alloc.test.js boots the real stage in node, so a part made too late for an earlier one (a TDZ at boot) fails here.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { checkEquivalence, checkNoCopies, inlineFamily, useHost } from './lib.mjs';
import { HOSTS, ROOT, hostConfig, partFiles } from './hosts.mjs';

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const args = process.argv.slice(2);
const hostName = args.includes('--host') ? args[args.indexOf('--host') + 1] : 'stage';
const host = HOSTS[hostName];
useHost(hostConfig(hostName));
let base = args.includes('--base') ? args[args.indexOf('--base') + 1] : null;
if (!base) { try { git('diff', '--quiet', 'HEAD', '--', 'src/ui'); base = 'HEAD~1'; } catch { base = 'HEAD'; } }
const stage = readFileSync(join(ROOT, 'src/ui', host.file), 'utf8');
const parts = partFiles(hostName).filter((n) => { try { readFileSync(join(ROOT, 'src/ui', n)); return true; } catch { return false; } });
const readBase = (f) => git('show', `${base}:src/ui/${f}`);
// A base that already has parts is read as its inlined self, so a later move is compared to the whole program as it stood.
let baseText = readBase(host.file), baseImports = [];
const hasPart = (t) => [...t.matchAll(/^import \{ (create[A-Z]\w*) \} from '(\.\/[^']+\.js)';/gm)].some((m) => hostConfig(hostName).isPart(m[2]));
if (hasPart(baseText)) { const r = inlineFamily(baseText, readBase); baseText = r.text; baseImports = r.partImports; }
const problems = [...checkEquivalence(baseText, stage, (f) => readFileSync(join(ROOT, 'src/ui', f), 'utf8'), baseImports), ...checkNoCopies(stage)];
const budget = JSON.parse(readFileSync(join(ROOT, 'scripts/size-budget.json'), 'utf8')).files;
const lines = (f) => readFileSync(join(ROOT, 'src/ui', f), 'utf8').split('\n').length - 1;
const fam = [host.file, ...parts].reduce((a, f) => a + lines(f), 0);
const key = 'src/ui/' + host.file;
if (budget[key] != null && lines(host.file) > budget[key]) problems.push(`${host.file} has ${lines(host.file)} lines, over its budget ${budget[key]}`);
if (budget[host.family] != null && fam > budget[host.family]) problems.push(`the ${hostName} family has ${fam} lines, over its budget ${budget[host.family]}`);
if (problems.length) { console.error(`split check (${hostName}): FAILED against ${base}\n  - ` + problems.join('\n  - ')); process.exit(1); }
if (host.boot) {
  const boot = spawnSync('node', ['--test', join(ROOT, host.boot)], { cwd: ROOT, encoding: 'utf8' });
  if (boot.status !== 0) { console.error(`split check (${hostName}): FAILED, the ${hostName} does not boot in node (${host.boot})\n` + (boot.stdout || '').split('\n').filter((l) => /error:|ReferenceError|TypeError/.test(l)).slice(0, 6).join('\n')); process.exit(1); }
}
console.log(`split check (${hostName}): ok against ${base} (${parts.length} part file${parts.length === 1 ? '' : 's'}, family ${fam} lines)`);
