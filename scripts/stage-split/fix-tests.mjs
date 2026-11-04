// After a move: a source-regex test that asserts a name which is now read as live.x fails on the prefix. This loosens exactly the regexes that
// failed with "did not match the regular expression /…/": each live name in them may carry `live.` (same assertion otherwise). Prints what it changed.
//   node scripts/stage-split/fix-tests.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const stage = readFileSync(join(ROOT, 'src/ui/stage.js'), 'utf8');
const block = stage.slice(stage.indexOf('// <stage-split live>'), stage.indexOf('// </stage-split live>'));
const names = [...new Set([...block.matchAll(/get (\w+)\(\)/g)].map((m) => m[1]))];
const tests = readdirSync(join(ROOT, 'tests')).filter((f) => f.endsWith('.test.js'));
let out;
try { out = execFileSync('node', ['--test', '--test-concurrency=4', ...tests.map((f) => join('tests', f))], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }); } catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
const regs = new Set([...out.matchAll(/did not match the regular expression (\/.+\/[a-z]*)\. Input:/g)].map((m) => m[1]));
let changed = 0;
for (const reg of regs) {
  const body = reg.slice(1, reg.lastIndexOf('/')), flags = reg.slice(reg.lastIndexOf('/') + 1);
  let next = body;
  for (const n of names) next = next.replace(new RegExp(`(?<![\\w.\\\\])${n}(?![\\w])`, 'g'), `(?:live\\.)?${n}`);
  if (next === body) continue;
  for (const f of tests) {
    const p = join(ROOT, 'tests', f), t = readFileSync(p, 'utf8'), lit = `/${body}/${flags}`;
    if (t.includes(lit)) { writeFileSync(p, t.split(lit).join(`/${next}/${flags}`)); changed++; console.log(`${f}: ${lit.slice(0, 90)}`); }
  }
}
// A failure whose message is the test's own text names no regex: loosen the match regexes inside the failing test's body the same way.
const failing = new Set([...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]));
const loosen = (body) => { let next = body; for (const n of names) next = next.replace(new RegExp(`(?<![\\w.\\\\])${n}(?![\\w])`, 'g'), `(?:live\\.)?${n}`); return next; };
for (const f of tests) {
  const p = join(ROOT, 'tests', f); let t = readFileSync(p, 'utf8'), touched = false;
  for (const m of [...t.matchAll(/^test\((['"`])((?:\\.|(?!\1).)*)\1,/gm)].reverse()) {
    const name = m[2].replace(/\\(['"`])/g, '$1');
    if (!failing.has(name)) continue;
    const end = t.indexOf('\n});', m.index) + 4;
    const seg = t.slice(m.index, end);
    const seg2 = seg.replace(/(assert\.(?:match|doesNotMatch)\([^,\n]+,\s*)(\/(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n[])+\/[a-z]*)/g, (all, pre, lit) => { const i = lit.lastIndexOf('/'); return pre + '/' + loosen(lit.slice(1, i)) + lit.slice(i); });
    if (seg2 !== seg) { t = t.slice(0, m.index) + seg2 + t.slice(end); touched = true; console.log(`${f}: loosened "${name.slice(0, 70)}"`); }
  }
  if (touched) writeFileSync(p, t);
}
console.log(`fix-tests: ${regs.size} failing regexes, ${changed} loosened`);
