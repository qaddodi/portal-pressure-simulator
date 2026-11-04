// The proof for a move (stage-split plan 2.5). Reads code only: no browser, no screenshots.
//   node scripts/stage-split/check.mjs [--base <git ref>]     (default: HEAD when src/ui differs from it, else HEAD~1)
// 1. Inline equivalence: every part is put back at its call (live.x back to x) and the result is the same program as stage.js at the base.
// 2. No copies: nothing a part gets by value is a let or a reassigned name; the second argument is the live record.
// 3. Budgets: stage.js and the family are not over scripts/size-budget.json.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { checkEquivalence, checkNoCopies, inlineFamily } from './lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const args = process.argv.slice(2);
let base = args.includes('--base') ? args[args.indexOf('--base') + 1] : null;
if (!base) { try { git('diff', '--quiet', 'HEAD', '--', 'src/ui'); base = 'HEAD~1'; } catch { base = 'HEAD'; } }
const stage = readFileSync(join(ROOT, 'src/ui/stage.js'), 'utf8');
const parts = readdirSync(join(ROOT, 'src/ui')).filter((n) => /^stage-.+\.js$/.test(n));
const readBase = (f) => git('show', `${base}:src/ui/${f}`);
// A base that already has parts is read as its inlined self, so a later move is compared to the whole program as it stood.
let baseText = readBase('stage.js');
if (/import \{ create[A-Z]\w* \} from '\.\/stage-[^']+\.js'/.test(baseText)) baseText = inlineFamily(baseText, readBase).text;
const problems = [...checkEquivalence(baseText, stage, (f) => readFileSync(join(ROOT, 'src/ui', f), 'utf8')), ...checkNoCopies(stage)];
const budget = JSON.parse(readFileSync(join(ROOT, 'scripts/size-budget.json'), 'utf8')).files;
const lines = (f) => readFileSync(join(ROOT, 'src/ui', f), 'utf8').split('\n').length - 1;
const fam = ['stage.js', ...parts].reduce((a, f) => a + lines(f), 0);
if (budget['src/ui/stage.js'] != null && lines('stage.js') > budget['src/ui/stage.js']) problems.push(`stage.js has ${lines('stage.js')} lines, over its budget ${budget['src/ui/stage.js']}`);
if (budget['src/ui/stage*'] != null && fam > budget['src/ui/stage*']) problems.push(`the stage family has ${fam} lines, over its budget ${budget['src/ui/stage*']}`);
if (problems.length) { console.error('stage-split check: FAILED against ' + base + '\n  - ' + problems.join('\n  - ')); process.exit(1); }
console.log(`stage-split check: ok against ${base} (${parts.length} part file${parts.length === 1 ? '' : 's'}, family ${fam} lines)`);
