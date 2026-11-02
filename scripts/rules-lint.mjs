// Rules held by lint, not by memory (Holding 120 Hz, revision 2, 2 Nov 2026). Fails `npm run lint` when:
//
//   switches   a runtime switch read from the address (/[?&]name/, searchParams.has/get('name')) that is not one of the measuring aids
//              (perf, offgpu, fps, budget, inputs), a content deep link (script, slide, preset, home, back) or a cache stamp (v), and is not
//              in scripts/switches-left.json, the switches still waiting for their deletion pass. The list may only shrink: a name in it that
//              the source no longer reads fails too, so a deleted switch leaves the list in the same commit. No new switch, ever.
//   import()   a dynamic import that is not in scripts/lazy-imports.json, where each one says what reads its module in before a person can
//              reach it (an idle warm-up, the view before it, a measuring aid's own flag). A module first fetched in the tap that needs it
//              parses tens of ms inside that frame: nothing is imported on a user tap.
//   (The built chunks' 200 KB limit is held by scripts/build.mjs itself: the build fails on a chunk over it.)
//
//   node scripts/rules-lint.mjs            check
//   node scripts/rules-lint.mjs --list     print what it finds
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEEP = new Set(['perf', 'offgpu', 'fps', 'budget', 'inputs', 'script', 'slide', 'preset', 'home', 'back', 'v']);
const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => walk(join(p, f))) : [p]);
const files = [...walk(join(ROOT, 'src')).filter((f) => f.endsWith('.js')), join(ROOT, 'index.html'), join(ROOT, 'sw.js')];

const switches = new Map();   // name → [file:line]
const lazy = [];              // 'file → specifier'
for (const f of files) {
  const rel = relative(ROOT, f).split('\\').join('/');
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    const code = line.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/ .*$/, '');
    for (const m of code.matchAll(/\[\?&\]\(?((?:[a-z0-9_-]+\|?)+)\)?/gi)) for (const n of m[1].split('|').filter(Boolean)) (switches.get(n) || switches.set(n, []).get(n)).push(at);
    for (const m of code.matchAll(/(?:searchParams|URLSearchParams\([^)]*\))\.(?:has|get)\('([a-z0-9_-]+)'\)/gi)) (switches.get(m[1]) || switches.set(m[1], []).get(m[1])).push(at);
    for (const m of code.matchAll(/\bimport\(\s*(['"`])([^'"`]+)\1/g)) lazy.push(`${rel} → ${m[2].replace(/\?v=[0-9a-f]+$/, '')}`);
    if (/\bimport\(\s*[^'"`\s)]/.test(code)) lazy.push(`${rel} → (computed specifier, line ${i + 1})`);
  });
}

const left = JSON.parse(readFileSync(join(ROOT, 'scripts/switches-left.json'), 'utf8')).left;
const allowed = JSON.parse(readFileSync(join(ROOT, 'scripts/lazy-imports.json'), 'utf8')).imports;
const errors = [];
for (const [n, at] of switches) if (!KEEP.has(n) && !left.includes(n)) errors.push(`new runtime switch ?${n} (${at.join(', ')}): no new switches; build the one path`);
for (const n of left) if (!switches.has(n)) errors.push(`?${n} is no longer read: take it out of scripts/switches-left.json`);
for (const l of new Set(lazy)) if (!(l in allowed)) errors.push(`dynamic import ${l} is not in scripts/lazy-imports.json: say what reads it in before a person can reach it`);
for (const l of Object.keys(allowed)) if (!lazy.includes(l)) errors.push(`scripts/lazy-imports.json lists ${l}, which the source no longer has`);

if (process.argv.includes('--list')) {
  console.log('switches:', [...switches.keys()].filter((n) => !KEEP.has(n)).sort().join(' '));
  console.log('imports:\n  ' + [...new Set(lazy)].join('\n  '));
}
const waiting = [...switches.keys()].filter((n) => !KEEP.has(n)).length;
if (errors.length) { console.error(errors.map((e) => 'rules-lint: ' + e).join('\n')); process.exit(1); }
console.log(`rules-lint: ok (${waiting} switches left to delete, ${new Set(lazy).size} dynamic imports, each read in ahead)`);
