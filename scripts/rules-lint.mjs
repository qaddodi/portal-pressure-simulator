// Rules held by lint, not by memory (Holding 120 Hz, revision 2, 2 Nov 2026). Fails `npm run lint` when:
//
//   switches   a runtime switch read from the address (/[?&]name/, searchParams.has/get('name')) that is not one of the measuring aids
//              (perf, offgpu, fps, budget, inputs), a content deep link (script, slide, preset, home, back, presenter-view) or a cache stamp (v), and is not
//              in scripts/switches-left.json, the switches still waiting for their deletion pass. The list may only shrink: a name in it that
//              the source no longer reads fails too, so a deleted switch leaves the list in the same commit. No new switch, ever.
//   import()   a dynamic import that is not in scripts/lazy-imports.json, where each one says what reads its module in before a person can
//              reach it (an idle warm-up, the view before it, a measuring aid's own flag). A module first fetched in the tap that needs it
//              parses tens of ms inside that frame: nothing is imported on a user tap.
//   imports  a name imported from one of the app's own modules that the module does not export (a deleted switch's constant left in an
//              import list breaks the page, and every test that loads it, only when the module loads).
//   size     stage.js, presenter.js or app.css longer (in lines) than its number in scripts/size-budget.json. The numbers only go down (PR-09).
//   tests    a new tests/*.test.js that reads the text of src/, styles/ or index.html (a source-regex test) and is not in scripts/source-regex-tests.json.
//              The list may only shrink (a listed test that no longer reads source is reported; take it off with node scripts/test-classes.mjs --write) (PR-02).
//   motion   (PR-22, PR-28) the Reduce Motion media query is read only by src/ui/motion.js (import reduceMotionMQ / reduced() from it; four files still
//              read it themselves, listed in MOTION_READERS, and may only come off); and the count of transition/animation lines in styles/ that
//              carry no --d-* duration token may not rise above scripts/motion-allowance.json (it only falls: --tighten lowers it).
//   look     (PR-19) the dark-mode media query is made only by src/ui/look.js (import darkMQ / isDark() from it); stage.js's list of queries, fibroscan.js,
//              organ-paint.js and theme-epoch.js (guarded forms) are the only other readers.
//   css      (PR-21) the count of lines in styles/*.css with !important, and with a doubled class (.a.a, a specificity hack), may not rise above
//              scripts/css-allowance.json; --tighten lowers each number to today's count. A new surface wins by order or by the state layer, not by doubling.
//   (The built chunks' 200 KB limit is held by scripts/build.mjs itself: the build fails on a chunk over it.)
//
//   node scripts/rules-lint.mjs            check
//   node scripts/rules-lint.mjs --list     print what it finds
//   node scripts/rules-lint.mjs --prune    take the switches the source no longer reads out of scripts/switches-left.json
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'espree';
import { sourceRegexTests } from './test-classes.mjs';
import { inventory as chartInventory, countsOf as chartCounts } from './chart-looks-inventory.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEEP = new Set(['perf', 'offgpu', 'fps', 'budget', 'inputs', 'script', 'slide', 'preset', 'home', 'back', 'presenter-view', 'v']);
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

const leftFile = join(ROOT, 'scripts/switches-left.json'), leftDoc = JSON.parse(readFileSync(leftFile, 'utf8'));
if (process.argv.includes('--prune')) { leftDoc.left = leftDoc.left.filter((n) => switches.has(n)); writeFileSync(leftFile, JSON.stringify(leftDoc, null, 1).replace(/\n {2,}"/g, ' "').replace(/\[\n /, '[') + '\n'); }
const left = leftDoc.left;
const allowed = JSON.parse(readFileSync(join(ROOT, 'scripts/lazy-imports.json'), 'utf8')).imports;
const errors = [];
for (const [n, at] of switches) if (!KEEP.has(n) && !left.includes(n)) errors.push(`new runtime switch ?${n} (${at.join(', ')}): no new switches; build the one path`);
for (const n of left) if (!switches.has(n)) errors.push(`?${n} is no longer read: take it out of scripts/switches-left.json`);
for (const l of new Set(lazy)) if (!(l in allowed)) errors.push(`dynamic import ${l} is not in scripts/lazy-imports.json: say what reads it in before a person can reach it`);
for (const l of Object.keys(allowed)) if (!lazy.includes(l)) errors.push(`scripts/lazy-imports.json lists ${l}, which the source no longer has`);

// Every name imported from one of the app's own modules is exported there (a deleted switch constant left in an import list fails only
// when the module loads: the whole page, and every test that reads it).
const exportsOf = new Map();
const namesOf = (f) => {
  if (exportsOf.has(f)) return exportsOf.get(f);
  const out = new Set(), ast = parse(readFileSync(f, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
  const names = (p) => (p.type === 'Identifier' ? [p.name] : p.type === 'ObjectPattern' ? p.properties.flatMap((q) => names(q.value || q.argument))
    : p.type === 'ArrayPattern' ? p.elements.filter(Boolean).flatMap(names) : p.type === 'AssignmentPattern' ? names(p.left) : p.type === 'RestElement' ? names(p.argument) : []);
  for (const n of ast.body) {
    if (n.type === 'ExportAllDeclaration' || n.type === 'ExportDefaultDeclaration') out.add('*');
    if (n.type !== 'ExportNamedDeclaration') continue;
    const d = n.declaration;
    if (d?.declarations) for (const v of d.declarations) for (const k of names(v.id)) out.add(k);
    else if (d?.id) out.add(d.id.name);
    for (const sp of n.specifiers || []) out.add(sp.exported.name ?? sp.exported.value);
  }
  exportsOf.set(f, out); return out;
};
for (const f of files.filter((x) => x.endsWith('.js'))) {
  const t = readFileSync(f, 'utf8');
  for (const m of t.matchAll(/^import\s*\{([^}]*)\}\s*from\s*'(\.{1,2}\/[^'?]+)(?:\?[^']*)?'/gm)) {
    const target = resolve(dirname(f), m[2]);
    let have; try { have = namesOf(target); } catch { errors.push(`${relative(ROOT, f)} imports ${m[2]}, which does not exist`); continue; }
    if (have.has('*')) continue;
    for (const n of m[1].split(',')) { const k = n.trim().split(/\s+as\s+/)[0].trim(); if (k && !have.has(k)) errors.push(`${relative(ROOT, f)} imports ${k} from ${m[2]}, which does not export it`); }
  }
}

// The stage family: stage.js and every src/ui/stage-*.js part (stage-split plan). A budget key ending in * is the sum over the family, so a
// move out of stage.js hands no free room to the next feature.
const stageFamily = () => ['src/ui/stage.js', ...readdirSync(join(ROOT, 'src/ui')).filter((n) => /^stage-.+\.js$/.test(n)).sort().map((n) => 'src/ui/' + n)];
const PART_MAX = 1500;   // (lines: no part passes it unless size-budget.json lists the part with its own number)

// Size budget: the three files that grow fastest may not pass their committed line count; a file under it asks for the number to come down.
{
  const sizeFile = join(ROOT, 'scripts/size-budget.json'), doc = JSON.parse(readFileSync(sizeFile, 'utf8'));
  const tighten = process.argv.includes('--tighten');
  const lines = (rel) => readFileSync(join(ROOT, rel), 'utf8').split('\n').length - 1;
  for (const rel of stageFamily().slice(1)) if (!(rel in doc.files) && lines(rel) > PART_MAX) errors.push(`${rel} has ${lines(rel)} lines, over the ${PART_MAX} a stage part may have (PR-09)`);
  for (const [rel, max] of Object.entries(doc.files)) {
    const n = rel.endsWith('*') ? stageFamily().reduce((a, f) => a + lines(f), 0) : lines(rel);
    // (Over the line: an error with BUILD_STRICT (main and ci.yml), a warning on the preview, as the build's chunk cap does: a few lines
    // too many never paints every preview push red while the stage split moves code out.)
    if (n > max) (process.env.BUILD_STRICT ? errors.push.bind(errors) : (t) => console.warn(`::warning title=Size budget::${t}`))(`${rel} has ${n} lines, over its budget of ${max} in scripts/size-budget.json: move code out into its own module first (PR-09)`);
    else if (n < max && tighten) doc.files[rel] = n;   // (a file under its number passes; --tighten lowers the number so the gain cannot be spent again)
  }
  if (tighten) writeFileSync(sizeFile, JSON.stringify(doc, null, 1).replace(/\n {2,}"/g, ' "').replace(/\{\n {2}"src/, '{ "src') + '\n');
}

// Timer budget (PR-10): the stage, the lobule and main may not add bare timers; a new one belongs to a scope (docs/scheduling.md).
{
  const tfile = join(ROOT, 'scripts/timer-budget.json'), doc = JSON.parse(readFileSync(tfile, 'utf8'));
  const tighten = process.argv.includes('--tighten');
  for (const [rel, max] of Object.entries(doc.files)) {
    const count = (f) => (readFileSync(join(ROOT, f), 'utf8').match(/\b(setTimeout|setInterval)\(/g) || []).length;
    const n = rel.endsWith('*') ? stageFamily().reduce((a, f) => a + count(f), 0) : count(rel);
    if (n > max) errors.push(`${rel} has ${n} bare timers, over its budget of ${max} in scripts/timer-budget.json: give the new timer to a scope (src/ui/scope.js, docs/scheduling.md) (PR-10)`);
    else if (n < max && tighten) doc.files[rel] = n;
  }
  if (tighten) writeFileSync(tfile, JSON.stringify(doc, null, 1).replace(/\{\n {2}"files": \{\n/, '{\n "files": {\n') + '\n');
}

// No new source-regex tests (PR-02): a test judges behaviour, or its rule lives here with a reason.
{
  const doc = JSON.parse(readFileSync(join(ROOT, 'scripts/source-regex-tests.json'), 'utf8')), listed = new Set(doc.files), now = sourceRegexTests();
  for (const n of now) if (!listed.has(n)) errors.push(`tests/${n} reads the text of src/ or styles/: test what the module does instead, or put the rule in scripts/rules-lint.mjs with a one-line reason (PR-02)`);
  const gone = doc.files.filter((n) => !now.includes(n));
  if (gone.length) console.warn(`rules-lint: ${gone.length} listed source-regex test(s) no longer read source (${gone.slice(0, 3).join(', ')}${gone.length > 3 ? ', …' : ''}): run node scripts/test-classes.mjs --write`);
}

// Motion (PR-22): one reduce-motion read, and no new bare durations in the stylesheets.
{
  const MOTION_READERS = new Set(['src/ui/motion.js', 'src/ui/stage.js', 'src/ui/focus-ring.js', 'src/ui/fibroscan.js', 'src/ui/ext-highlights.js']);
  for (const f of files.filter((x) => x.endsWith('.js'))) {
    const rel = relative(ROOT, f).split('\\').join('/');
    if (!MOTION_READERS.has(rel) && /prefers-reduced-motion/.test(readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'))) errors.push(`${rel} reads prefers-reduced-motion itself: import reduceMotionMQ or reduced() from src/ui/motion.js (PR-22)`);
  }
  const LOOK_READERS = new Set(['src/ui/look.js', 'src/ui/stage.js', 'src/ui/fibroscan.js', 'src/ui/organ-paint.js', 'src/ui/theme-epoch.js']);
  for (const f of files.filter((x) => x.endsWith('.js'))) {
    const rel = relative(ROOT, f).split('\\').join('/');
    if (!LOOK_READERS.has(rel) && /matchMedia\??\.?\(\s*['"]\(prefers-color-scheme/.test(readFileSync(f, 'utf8'))) errors.push(`${rel} makes its own prefers-color-scheme query: import darkMQ or isDark() from src/ui/look.js (PR-19)`);
  }
  {
    const cssLines = readdirSync(join(ROOT, 'styles')).filter((n) => n.endsWith('.css')).flatMap((name) => readFileSync(join(ROOT, 'styles', name), 'utf8').split('\n'));
    const live = cssLines.filter((l) => !/^\s*(?:\/\*|\*)/.test(l));
    const imp = live.filter((l) => /!important/.test(l)).length, dbl = live.filter((l) => /(\.[\w-]+)\1(?![\w-])/.test(l)).length;
    const cFile = join(ROOT, 'scripts/css-allowance.json'), cDoc = JSON.parse(readFileSync(cFile, 'utf8'));
    if (imp > cDoc.important) errors.push(`styles/ has ${imp} lines with !important, over the allowance of ${cDoc.important} in scripts/css-allowance.json (PR-21)`);
    if (dbl > cDoc.doubledClass) errors.push(`styles/ has ${dbl} lines with a doubled class (.a.a), over the allowance of ${cDoc.doubledClass} in scripts/css-allowance.json: win by order or the state layer, not by doubling (PR-21)`);
    if (process.argv.includes('--tighten')) writeFileSync(cFile, JSON.stringify({ ...cDoc, important: Math.min(imp, cDoc.important), doubledClass: Math.min(dbl, cDoc.doubledClass) }, null, 1) + '\n');
  }
  const bare = readdirSync(join(ROOT, 'styles')).filter((n) => n.endsWith('.css')).reduce((n, name) => n + readFileSync(join(ROOT, 'styles', name), 'utf8').split('\n')
    .filter((l) => /(?:^|[\s;{])(?:transition|animation)(?:-duration)?\s*:/.test(l) && !/var\(--d-|var\(--vp-ms|var\(--dur|transition\s*:\s*(?:none|var\()|animation\s*:\s*none/.test(l)).length, 0);
  const mFile = join(ROOT, 'scripts/motion-allowance.json'), mDoc = JSON.parse(readFileSync(mFile, 'utf8'));
  if (bare > mDoc.bareDurations) errors.push(`styles/ has ${bare} transition/animation lines without a --d-* duration token, over the allowance of ${mDoc.bareDurations} in scripts/motion-allowance.json: use var(--d-flip|small|surface|camera) and var(--ease-*) (PR-22)`);
  else if (bare < mDoc.bareDurations && process.argv.includes('--tighten')) writeFileSync(mFile, JSON.stringify({ ...mDoc, bareDurations: bare }, null, 1) + '\n');
}

// Chart looks (chart-looks-in-code plan, WP0): the count of chart look rules left in styles/app.css, per chart, may not rise above
// scripts/chart-look-allowance.json. A chart's migration PR deletes its rules and lowers its number (--tighten); WP12 ends at 0.
{
  const aFile = join(ROOT, 'scripts/chart-look-allowance.json'), aDoc = JSON.parse(readFileSync(aFile, 'utf8'));
  const now = chartCounts(chartInventory(readFileSync(join(ROOT, 'styles/app.css'), 'utf8')));
  for (const [chart, n] of Object.entries(now)) if (n > (aDoc.charts[chart] ?? 0)) errors.push(`styles/app.css has ${n} ${chart} chart look rules, over the allowance of ${aDoc.charts[chart] ?? 0} in scripts/chart-look-allowance.json: a chart's look belongs in its chart-looks table, not in app.css (node scripts/chart-looks-inventory.mjs --chart ${chart})`);
  if (process.argv.includes('--tighten')) writeFileSync(aFile, JSON.stringify({ ...aDoc, charts: Object.fromEntries(Object.entries(now).map(([c, n]) => [c, Math.min(n, aDoc.charts[c] ?? n)])) }, null, 1) + '\n');
}

// Chart looks (WP12): the GPU picture and the chart builders ask the page for no style. svg-gl.js, svg-morph.js, chart-looks/ and every chart
// builder (tool-*.js, flow-time.js, talk-trace.js, visual-plane.js) hold no getComputedStyle: a chart's looks are its table's (src/ui/chart-looks/).
// The page-element code that also makes a model keeps its reads, named here: callout.js (its outline's colour is the callout's own --c, read between
// frames and written as attributes), gl-words.js (it draws a page element's own words in that element's style), instruments.js (the endoscopy
// card's font size, a canvas), lobule-zoom.js and timeline.js (page elements), presenter.js (the cards).
{
  const strict = files.filter((f) => /\/src\/ui\/(svg-gl|svg-morph|tool-[\w-]+|flow-time|talk-trace|visual-plane|chart-looks\/[\w-]+)\.js$/.test(f.replace(/\\/g, '/')));
  for (const f of strict) {
    const code = readFileSync(f, 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    if (/getComputedStyle|readStyle\(/.test(code)) errors.push(`${relative(ROOT, f)} reads the page's style (getComputedStyle): a chart's looks live in src/ui/chart-looks/ (chart-looks-in-code plan, WP12)`);
  }
}

if (process.argv.includes('--list')) {
  console.log('switches:', [...switches.keys()].filter((n) => !KEEP.has(n)).sort().join(' '));
  console.log('imports:\n  ' + [...new Set(lazy)].join('\n  '));
}
const waiting = [...switches.keys()].filter((n) => !KEEP.has(n)).length;
if (errors.length) { console.error(errors.map((e) => 'rules-lint: ' + e).join('\n')); process.exit(1); }
console.log(`rules-lint: ok (${waiting} switches left to delete, ${new Set(lazy).size} dynamic imports, each read in ahead)`);
