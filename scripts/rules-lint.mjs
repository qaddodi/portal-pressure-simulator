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
//   shadow   a name bound from a create…() call's result (const { a, b } = createX(…)) that one of the file's own imports already names: the
//              part's export silently stood in for the import (the Doppler's unclamped smooth01 for the liver's clamped one, so the cirrhotic
//              liver lost its nodules and got its gloss back above half scarring, 6 Nov 2026).
//   (The built chunks' 200 KB limit is held by scripts/build.mjs itself: the build fails on a chunk over it.)
//
//   node scripts/rules-lint.mjs            check
//   node scripts/rules-lint.mjs --list     print what it finds
//   node scripts/rules-lint.mjs --prune    take the switches the source no longer reads out of scripts/switches-left.json
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'espree';
import { sourceRegexTests } from './test-classes.mjs';
import { appCssFiles, appCssText } from './app-css.mjs';
import { HOSTS, familyFiles } from './stage-split/hosts.mjs';
import { inventory as chartInventory, countsOf as chartCounts } from './chart-looks-inventory.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// (lumen, lumenscale: the lumen layer's device A/B, brief PL 10 Nov 2026: ?lumen=off draws no lumen pass and no blood, ?lumenscale=<0.25..1> sets the lumen layer's share of the vessel layer's size.)
// (rest: rest pacing on touch devices, brief H1 10 Nov 2026: ?rest=off turns the slow-down at rest off, to compare on a device.)
// (gallery: the preview-only card gallery page and its device frames, ?gallery and ?gallery=frame, src/ui/gallery/, docs/card-gallery.md: loaded only on the preview copy.)
// (embed: a deep link like script and preset, not a switch: ?embed is the app for an iframe on someone else's page, O1, 13 Nov 2026; src/ui/embed.js.)
const KEEP = new Set(['perf', 'offgpu', 'fps', 'budget', 'inputs', 'lap', 'script', 'slide', 'preset', 'home', 'embed', 'back', 'presenter-view', 'v', 'lumen', 'lumenscale', 'rest', 'gallery', 'watch']);   // (watch: the motion recorder's red dot, a preview-only measuring aid like perf and offgpu; src/ui/watch)
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
// The text a rule judges: 'styles/app-*.css' is the app's stylesheet, its parts joined in order (scripts/app-css.mjs); any other name is the file.
const familyOf = (f) => Object.entries(HOSTS).find(([n, h]) => n !== 'stage' && h.family === f)?.[0];   // 'src/ui/presenter*' is the presenter and its parts
const sourceText = (f) => (f === 'styles/app-*.css' ? appCssText(ROOT) : familyOf(f) ? familyFiles(familyOf(f)).map((g) => readFileSync(join(ROOT, 'src/ui', g), 'utf8')).join('\n') : readFileSync(join(ROOT, f), 'utf8'));
const PART_MAX = 1500;   // (lines: no part passes it unless size-budget.json lists the part with its own number)

// Size budget: the three files that grow fastest may not pass their committed line count; a file under it asks for the number to come down.
{
  const sizeFile = join(ROOT, 'scripts/size-budget.json'), doc = JSON.parse(readFileSync(sizeFile, 'utf8'));
  const tighten = process.argv.includes('--tighten');
  const lines = (rel) => readFileSync(join(ROOT, rel), 'utf8').split('\n').length - 1;
  for (const rel of [...stageFamily().slice(1), ...appCssFiles(ROOT), ...['presenter', 'lobule'].flatMap((h) => familyFiles(h).slice(1).map((f) => 'src/ui/' + f))]) if (!(rel in doc.files) && lines(rel) > PART_MAX) errors.push(`${rel} has ${lines(rel)} lines, over the ${PART_MAX} a part may have (PR-09)`);
  for (const [rel, max] of Object.entries(doc.files)) {
    // (A key ending in * is the sum over a family: the stage and its parts, or the app's stylesheet files, so a move between members hands no free room to the next feature.)
    const host = Object.entries(HOSTS).find(([, h]) => h.family === rel && rel !== 'src/ui/stage*')?.[0];   // (presenter, lobule: the file and the parts moved out of it)
    const n = rel === 'styles/app-*.css' ? appCssFiles(ROOT).reduce((a, f) => a + lines(f), 0) : host ? familyFiles(host).reduce((a, f) => a + lines('src/ui/' + f), 0) : rel.endsWith('*') ? stageFamily().reduce((a, f) => a + lines(f), 0) : lines(rel);
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
    const fam = Object.entries(HOSTS).find(([, h]) => h.family === rel && rel !== 'src/ui/stage*')?.[0];   // (lobule: the file and the parts moved out of it)
    const n = fam ? familyFiles(fam).reduce((a, f) => a + count('src/ui/' + f), 0) : rel.endsWith('*') ? stageFamily().reduce((a, f) => a + count(f), 0) : count(rel);
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

// Source shapes moved out of tests (6 Nov 2026, PR-02): app-review-fixes, blood-heads, lymph-dashes and scope-lens read src/ text, which the tests rule
// forbids. Each rule keeps its one-line reason; a pattern that no longer matches means the code it guarded changed, so look before editing the rule.
{
  const text = sourceText;
  const need = (file, rules) => {
    const src = text(file);
    for (const [re, why] of rules) if (!(typeof re === 'string' ? src.includes(re) : re.test(src))) errors.push(`${file}: ${why} (${re})`);
  };
  const forbid = (file, re, why) => { if (re.test(text(file))) errors.push(`${file}: ${why} (${re})`); };
  need('src/ui/presenter*', [
    [/c\.classList\.contains\('pz-tiles'\) \? 0 :/, "the tiles' own scroll height is no overflow: their numbers' GPU pictures reach past a tile, and counted it zoomed the readings card down in a what-if drag (7 Nov 2026)"],
    [/el\.classList\.contains\('tiles-only'\) && !el\.querySelector\(':scope > \.pz-tool'\) && fitDone\.has\(el\) && (?:live\.)?cardsStill\(\)\) continue;/, "a tiles-only readings card keeps the fit it came in with while a what-if or compare drives its numbers (7 Nov 2026)"],
  ]);
  // A chart is an instrument card, never part of the teaching card (14 Nov 2026 the trial card, 15 Nov 2026 the procedure's event graph and the time-lapse graph, PC-6).
  // presenter-tools.js builds every instrument into the instrument card; slide-instrument.js gives a slide that names none its chart. The presenter builds none for the words.
  forbid('src/ui/presenter*', /\b(createFlowTime|createEventGraph|createDoppler|createFibroScan|createPressureTime|createVitalsMonitor|createHvpgCard|createEndoscopy|createAbdomen|createVarixWall|talkTrace|createTrial|createForest)\b/, 'an instrument is built by the instrument card (presenter-tools.js), never for the teaching card');
  forbid('src/ui/presenter*', /pz-timegraph|pz-evtime/, 'no chart box in the words');
  forbid('styles/app-*.css', /\.pz-timegraph/, 'no style for a chart in the words');
  need('src/ui/presenter-tools.js', [[/createFlowTime\(\)/, 'the flow-time chart is the instrument card\'s'], [/createEventGraph\(\)/, 'the procedure graph is the instrument card\'s']]);
  // A menu sheet's entrance and exit are written by the frames, never run by the compositor (16 Nov 2026, iPhone: the Patients menu's search row floated
  // over the figure with no card behind it while the sheet rose). The GPU glass is drawn by the page from the page's time, and a compositor slide can stand a
  // display frame or two off it in Safari, which is half a sheet's height on its quick first frames. sheet-ride.js writes the sheet's inline translate in the frame
  // the glass reads it in; a slide keyframe on one of these surfaces (or a new sheet that rides nothing) brings the lag back.
  forbid('styles/app-*.css', /(?:\.umenu\.sheet|\.menu\.as-sheet|\.why-pop\.as-sheet|\.pal)(?![-\w])[^{}]*\{[^}]*animation(?:-name)?\s*:\s*(?:slide-from-edge|slide-to-edge|dock-sheet-in|dock-sheet-out)/, 'a menu sheet slides by a CSS animation: write it with sheet-ride.js (rideIn / rideOut) so its glass and its words move in one frame');
  need('src/ui/menu.js', [[/rideIn\(el, reduce\.matches\)/, 'the main menu sheet rides in'], [/rideOut\(panel, reduce\.matches\)/, 'the main menu sheet rides out']]);
  need('src/ui/util.js', [[/rideIn\(el, reduceMotionMQ\.matches/, 'a popover sheet rides in'], [/rideOut\(el, reduceMotionMQ\.matches/, 'a popover sheet rides out'], [/rideStop\(panel\)/, 'a finger takes a riding sheet over']]);
  need('src/ui/why.js', [[/rideIn\(pop,/, 'the Why? sheet rides in'], [/rideOut\(pop,/, 'the Why? sheet rides out']]);
  need('src/ui/palette.js', [[/rideIn\(box,/, 'the Search sheet rides in'], [/rideOut\(box,/, 'the Search sheet rides out']]);
  need('src/ui/ink-gl.js', [
    [/if \(touches\.size > 1\) return;/, 'the laser is armed by one finger'],
    [/e\.target !== window\) return;/, "the laser ignores other elements' blur"],
    [/t !== topOf \|\| t\.gl !== gl/, 'the laser rehosts on a new top'],
  ]);
  need('src/ui/lobule-zoom*', [[/sv\.rehost\(\)/, 'the lobule rehosts the sinusoid view when the figure comes back']]);
  need('src/ui/sinusoid-view.js', [[/if \(share && !ft\) return;/, 'a shared sinusoid view is not rebuilt by the rehost']]);

  const gl = text('src/ui/veins-gl.js');
  const comp = gl.slice(gl.indexOf('    composite(look, blood = NOBLOOD, full = false, part = 0) {'));
  const compRules = [
    [/if \(headP && blood\.chev && !bleeding && axisN > 0\) \{/, 'heads as quads when the arrowheads\' program is ready and nothing bleeds'],
    [/const stillUse = still && !\(quads && \(part \|\| dirt \|\| pool \|\| \(fl\?\.ripple && nFluid\) \|\| cathRect\)\);/, 'still lumens kept only when that is exact'],
  ];
  for (const [re, why] of compRules) if (!re.test(comp)) errors.push(`src/ui/veins-gl.js composite(): ${why} (${re})`);
  if (!(comp.indexOf('drawHeads(m, layer, glow, warm, useStack, stillUse);') > comp.indexOf('UC.i1(U.bloodOnly, 1);'))) errors.push('src/ui/veins-gl.js composite(): the heads are drawn after the blood-only picture');
  if (!(comp.indexOf('if (quads) drawHeads(m, false, glow, warm, useStack, false);') < comp.indexOf("gpuProbe.time(gl, 'catheter', cathT);"))) errors.push('src/ui/veins-gl.js composite(): the heads are drawn again, in a catheter box, before the catheter timing');
  // The Tube vessel renderer (10 Nov 2026, docs/tube-renderer.md): no hybrid, and the draw buffers set once.
  need('src/ui/veins-gl.js', [
    ['tubePass(pM, pLook);\n  };', 'the Tube pass is the only geometry pass (no Mesh, no classic pass: draw() draws nothing until meshUse() says the Tube can)'],
    ['if (!tubeReady()) return;', 'draw() waits for the Tube (tubeReady) and draws nothing without it'],
  ]);
  {
    const tp = text('src/ui/tube-pass.js');
    const body = (from, to) => tp.slice(tp.indexOf(from), tp.indexOf(to, tp.indexOf(from)));
    const tubeDrawBody = body('function tubeDraw(', 'function tubePair(');
    if (!tubeDrawBody || /drawBuffers/.test(tubeDrawBody)) errors.push('src/ui/tube-pass.js tubeDraw: holds no gl.drawBuffers (the strip and the patch write the same four targets, so the draw buffers never change between them)');
    const tubePassBody = body('function tubePass(', 'return tubePass;');
    if (!tubePassBody || /MESH_NONE/.test(tubePassBody)) errors.push('src/ui/tube-pass.js tubePass: holds no MESH_NONE (the prepass masks the colour; it never turns the draw buffers off)');
  }
  // The Tube's stage 2 (brief S2-D, 10 Nov 2026): a failed stage 2 program leaves the Tube at stage 1, never the classic; patches are not drawn when the joins are webs.
  {
    const vg = text('src/ui/veins-gl.js'), tp = text('src/ui/tube-pass.js');
    const slice = (t, from, to) => t.slice(t.indexOf(from), t.indexOf(to, t.indexOf(from)));
    const meshUseBody = slice(vg, 'const meshUse = () => {', '\n  };');
    if (!meshUseBody || /tube2|tubeLean|stage2/i.test(meshUseBody)) errors.push('src/ui/veins-gl.js meshUse: names no stage 2 program (a Tube frame that stage 1 can draw is never refused because a stage 2 program failed)');
    const finishTubeBody = slice(vg, 'const finishTube = () => {', '\n  };');
    if (!finishTubeBody || /tube2/i.test(finishTubeBody)) errors.push('src/ui/veins-gl.js finishTube: leaves stage 2 to finishTube2 (a failed stage 2 program must not take stage 1 down with it)');
    const draw2Body = slice(tp, 'function draw2(', '// A pass and its prepass for tier t');
    if (!/webCall\(/.test(draw2Body) || /patchCall\(/.test(draw2Body)) errors.push('src/ui/tube-pass.js draw2: stage 2 draws the webs, never the patches (no ?tubejoin=patch since 11 Nov 2026)');
    if ((tp.match(/patchCall\(/g) || []).length !== 2) errors.push('src/ui/tube-pass.js: patchCall is called from tubeDraw (stage 1 and the glows) only, and defined once');
    if (/tubeStrip|tubePatch/.test(slice(vg, 'const finishTube2 = () => {', '\n'))) errors.push('src/ui/veins-gl.js finishTube2: finishes the four stage 2 programs only');
  }
  // No vessel glow program (15 Nov 2026, app review R1-7, owner's Q1: the glow program, its MP.GLOW and MP.UP passes and the glow engine's easing are deleted; no vessel takes a glow or halo since 13 Nov).
  {
    const vg = text('src/ui/veins-gl.js'), tp = text('src/ui/tube-pass.js');
    if (/tubeGlow|glowStart|glowFinish|finishGlow/.test(vg)) errors.push('src/ui/veins-gl.js: no Tube glow program is started, finished or deleted (the glow program is gone)');
    if (/glowP|MP\.GLOW|MP\.UP\b|tubeGlow|tb\.lit/.test(tp)) errors.push('src/ui/tube-pass.js: no glow pass (MP.GLOW, MP.UP) is drawn and no glow program is set up (the glow program is gone)');
    if (/glowStep|nextFrame\(/.test(text('src/ui/stage-glow.js'))) errors.push('src/ui/stage-glow.js: the glow sources ease nothing and ask for no frame (nothing draws a glow)');
  }
  // The liver's congestion at rest (12 Nov 2026, his Mac: the organ layer painted twice a second, "page changed: liver g.organ transform"): its target is
  // held on the venous pressure with the breath low-passed out, so a breath never tips it a step and the liver is not rewritten at rest.
  {
    const dg = text('src/ui/stage-diaphragm.js');
    if (!/live\.lvGT = stepHeld\(live\.lvGT, gLow, 0\.03\);/.test(dg) || !/gLow \+= \(gRaw - gLow\) \* -Math\.expm1\(-\(gNow - gLowAt\) \/ BREATH_TAU\);/.test(dg)) errors.push('src/ui/stage-diaphragm.js easeLiver: the congestion target is held on the breath-free venous pressure (gLow, BREATH_TAU)');
  }
  // The Tube's cull (brief PD part 3, 10 Nov 2026): rows wholly outside the vessel layer are left out of the stage 2 buckets (the buckets are built from the cull's mask in place of the rows with points),
  // never while a stretch of the change between the views moves the points (joinBase >= 0), and the pad it grows the layer by is the widest pass's reach (glow and shadow), not a guess of one pass.
  {
    const vg = text('src/ui/veins-gl.js'), s2 = text('src/ui/tube-stage2.js'), tp = text('src/ui/tube-pass.js');
    if (!/tubeBuckets\(tubeNow, C \? C\.mask : B\.pts\.on, nTubes, st\.R\.rows, D\.tb\);/.test(s2)) errors.push('src/ui/tube-stage2.js frame: the rows by tier are bucketed from the cull\'s mask (C ? C.mask : B.pts.on)');
    if (!/const C = view && view\.ok && \(joinBase < 0 \|\| \(B\.morph && B\.morph\.rowBox\)\) \? cullUpdate\(B, nTubes, view\) : null/.test(s2)) errors.push('src/ui/tube-stage2.js frame: between the views (joinBase >= 0) a row is culled only by the boxes its stretch was made with (B.morph.rowBox, R1b-13), never by the bundle\'s points; nor without a usable view');
    if (!/websByTier\(st\.W\.data, st\.W\.count, tubeNow, D\.wb, B\.pts\.on, !B\.noEnds[,)]/.test(s2)) errors.push('src/ui/tube-stage2.js frame: the joins\' webs are not culled (websByTier keeps B.pts.on)');
    // (12 Nov 2026: a frame between the views draws only the webs of the joins it has, the morph set's joins.on, not every join of the stretch.)
    if (!/websByTier\([^\n]*jv >= 0 && st\.ji \? websLive\(st, joins\) : null\)/.test(s2)) errors.push('src/ui/tube-stage2.js frame: between the views the webs are those of the frame\'s own joins (websLive)');
    if (!/Math\.max\(meshPad\(MP\.UP, look, px\), meshPad\(MP\.SHADOW, look, px\)\)/.test(vg)) errors.push('src/ui/veins-gl.js layerView: the cull\'s pad is the larger of the glow pass\'s and the shadow pass\'s reach (meshPad)');
    if ((tp.match(/D\.frame\(/g) || []).length !== 1) errors.push('src/ui/tube-pass.js: the stage 2 data is binned in frameD alone, with the layer\'s view, so the layer pass and the lumen pass cull the same rows');
  }
  // The lumen layer at a share of the vessel layer's size (brief PL item 1, 10 Nov 2026): while the lumen pass draws, its view, shifts, scissors and size are the target's (lumK), and the cull's rectangle is the layer pass's.
  {
    const vg = text('src/ui/veins-gl.js');
    const slice = (t, from, to) => t.slice(t.indexOf(from), t.indexOf(to, t.indexOf(from)));
    const lf = slice(vg, 'function lumenFrame(', '\n  }\n');
    if (!/lumK = LK; \}/.test(lf) || !/eachPiece\(la\[0\], la\[1\], fboW, fboH\);\n\s+pMode = 0; lumK = null;/.test(lf)) errors.push('src/ui/veins-gl.js lumenFrame: lumK is set only around the lumen pass\'s eachPiece and cleared straight after it');
    if (!/pM = scaled \? lumenView\(m, LK\.sx, LK\.sy, LK\.ms\) : m;/.test(lf)) errors.push('src/ui/veins-gl.js lumenFrame: the lumen pass is given the view in the target\'s pixels (lumenView) when the target is smaller than the layer');
    if (!/lumenDepth\.needs\(m, wo, la, lw0, lh0, bx\)/.test(lf) || !/lumenDepth\.drawn\(m, wo, la, lw0, lh0, bx\)/.test(lf)) errors.push('src/ui/veins-gl.js lumenFrame: the depth stamp is told the target\'s size');
    if (!/const SW = size \? size\[0\] : lumK \? lumK\.w : fboW/.test(vg)) errors.push('src/ui/veins-gl.js vesselSet: the layer\'s size uniforms are the target\'s while lumK is set');
    if (!/if \(lumK\) m = lumK\.m;/.test(vg)) errors.push('src/ui/veins-gl.js layerView: the cull\'s rectangle comes from the full view while the lumen pass draws at a share (the layer pass\'s rectangle)');
    if (!/tubePass\.webColour = !!\(blood\.origin \|\| \(dyeAny && blood\.dye !== false\)\);/.test(lf)) errors.push('src/ui/veins-gl.js lumenFrame: the lumen colour draw includes the webs only when the origin colours or the dye are on (tubePass.webColour; a web\'s lumen pixel is the plain fill otherwise)');
    if (!/if \(w && tubePass\.webColour\) \{ webCall\(P3\.webLumen,/.test(text('src/ui/tube-pass.js'))) errors.push('src/ui/tube-pass.js tubeLumenPass: the webs\' colour draw follows tubePass.webColour; their depth prepass does not');
    if (!/const bx = !LUM_OFF && tubePass\.lumenBox\(m, look, LB\) \? LB : null;/.test(lf) || !/LUMC\.n = 0; LUMC\.all = !bx;/.test(lf) || !/LUMD\.all = LUMC\.all; LUMD\.n = LUMC\.n; LUMD\.r\.set\(LUMC\.r\);/.test(lf)) errors.push('src/ui/veins-gl.js lumenFrame: the lumen pass is cut to the box of the rows inside and their webs (PL item 3), clears what the last frame may have drawn in, and keeps the rects it drew in for the next clear');
    const ep = slice(vg, 'function eachPiece(', '\n  }\n');
    if (!/lumenPiece\(x0, x1 - x0, kx, PCX\)/.test(ep) || !/AXX\[i \* 3 \+ 2\] \* kx/.test(ep)) errors.push('src/ui/veins-gl.js eachPiece: a lumen pass at a share scissors and shifts its pieces in the target\'s pixels (lumenPiece, times the share)');
  }
  // The lumen layer keeps its depth (brief PD part 2, 10 Nov 2026): any draw of the vessel layer marks it stale, and the lumen pass never draws lumens over a depth marked stale: it draws the
  // depth again first (cleared, the prepasses), and a fresh depth is neither cleared nor invalidated.
  {
    const vg = text('src/ui/veins-gl.js'), tp = text('src/ui/tube-pass.js');
    const slice = (t, from, to) => t.slice(t.indexOf(from), t.indexOf(to, t.indexOf(from)));
    const pieceBody = slice(vg, '  const pieceFn = () => {', '  function eachPiece(');
    const iLumen = pieceBody.indexOf('if (pMode === 5)'), iStale = pieceBody.indexOf('lumenDepth.stale();'), iClear = pieceBody.indexOf('if (pMode >= 3) clearLayer();');
    if (iLumen < 0 || iStale < iLumen || iClear < iStale) errors.push('src/ui/veins-gl.js pieceFn: every draw of the vessel layer (every mode but the lumen layer\'s own) marks the lumen depth stale first (lumenDepth.stale() before the draw)');
    const lf = slice(vg, '  function lumenFrame(', '  // The composite\'s textures, each on its unit');
    const iNeeds = lf.indexOf('pRedo = lumenDepth.needs('), iEach = lf.indexOf('eachPiece('), iDrawn = lf.indexOf('if (pRedo) { lumenDepth.drawn(');
    if (iNeeds < 0 || iEach < iNeeds || iDrawn < iEach || !/if \(T\.made !== made\) \{ lumenDepth\.stale\(\); LUMD\.all = true; \}/.test(lf)) errors.push('src/ui/veins-gl.js lumenFrame: the depth is asked for (lumenDepth.needs) before the pieces, recorded as drawn after them, and a new or resized lumen target makes it stale');
    if (!/lost = true; lumenDepth\.stale\(\);/.test(vg)) errors.push('src/ui/veins-gl.js: a context loss marks the lumen depth stale');
    const lp = slice(tp, '  function tubeLumenPass(', '  tubePass.drew = 0;');
    const iRedo = lp.indexOf('if (redo) {'), iDepth = lp.indexOf('gl.clearBufferfv(gl.DEPTH'), iLum = lp.indexOf('stripCall(P3.lumen');
    if (iRedo < 0 || iDepth < iRedo || iLum < iDepth || (lp.match(/gl\.clearBufferfv\(gl\.DEPTH/g) || []).length !== 1 || /invalidateFramebuffer/.test(lp) || !/if \(redo\) \{\n\s+gl\.depthMask\(true\);\n\s+gl\.clearBufferfv\(gl\.DEPTH/.test(lp)) errors.push('src/ui/tube-pass.js tubeLumenPass: the depth is cleared and drawn only in if (redo), before the lumens, and is never invalidated (a fresh depth is kept)');
  }
  // The organ stack's shift (13 Nov 2026, heat D-2): the picture's version changes only when a layer moved (a bowel float handed over again unchanged must not make a new picture).
  if (!/shift: \(name, dy\) => \{ const did = stack\.shift\(name, dy\); if \(did\) texVer\+\+; return did; \}/.test(text('src/ui/veins-gl.js'))) errors.push('src/ui/veins-gl.js organs.shift: bumps texVer only when the stack moved a layer (heat D-2)');
  // Heat D-4 and D-6 (13 Nov 2026): setTubes sends only the changed rows (changedRows, as setFlow) and nothing while they match; the blood cells' boxes are walked once while the cells (bloodVer), matrix and canvas stand (bloodBoxes), and bloodMark and picMark take the kept tile mask (addFrom).
  { const v = text('src/ui/veins-gl.js'), st = v.slice(v.indexOf('    setTubes(data) {'), v.indexOf('    paintOrgans(shapes, rect, k) {'));
    if (!/changedRows\(data, tubeNow, ROW_W, nTubes, SPAN\)/.test(st) || /texSubImage2D\(gl\.TEXTURE_2D, 0, 0, 0, TUBE_TEXELS, nTubes, gl\.RGBA, gl\.FLOAT, data\);\s*\n\s*\},/.test(st)) errors.push('src/ui/veins-gl.js setTubes: only the rows that differ from what the texture holds go up (changedRows), and nothing while they match (heat D-4)');
    if (!/bloodVer\+\+/.test(v) || !/bb\.ver === bloodVer/.test(v) || !/bloodBoxT, 0\)/.test(v) || /markCells\(T, bloodCPU/.test(v)) errors.push('src/ui/veins-gl.js: the blood cells\' boxes are kept while the cells (bloodVer), their number and size, the matrix and the canvas stand (bloodBoxes + addFrom), not walked in each blood frame and picture (heat D-6)'); }
  // The ascites ripple's frames (13 Nov 2026, heat D-3): a frame where only the ripple's phase moved besides the blood is counted as the blood's (bloodSeq, the band added to its dirty rects), not as a new picture.
  if (!/const bloodAlone = !full && !part && !dirt && !pool && !cath && bare && !figNew && \(rippling \? sameRipple && fluidW\[2\] > fluidW\[0\] : same\);/.test(text('src/ui/veins-gl.js')) || !/bloodMark\(bloodSeq, [^;]*, rippling \? fluidW : null\)/.test(text('src/ui/veins-gl.js'))) errors.push('src/ui/veins-gl.js composite: a frame where only the ripple\'s phase moved besides the blood is the blood\'s (bloodAlone with sameRipple, the fluid band in bloodMark), not a new picture (heat D-3)');
  // The geometry bundle per binning (10 Nov 2026, the Anatomy to Circuit switch): a morph set's derived data (points, join list, patches, the Tube's stage 2 record) is made when the set is
  // (prepareSet, called through api.prepareMorphSet by the caller, a free moment of its own after makeMorphSet), never inside meshGeo for a set that has it, and the patches only where a renderer draws them (not for the Tube's web joins).
  {
    const vg = text('src/ui/veins-gl.js'), ts = text('src/ui/tube-stage2.js');
    const slice = (t, from, to) => t.slice(t.indexOf(from), t.indexOf(to, t.indexOf(from)));
    const mk = slice(vg, '    makeMorphSet(bins) {', '    prepareMorphSet(S) {');
    if (!/const keptVer = figVer, keptOK = fboOK, keptAll = movedAll;\n\s+useMorphSet\(null\);/.test(mk) || !/useMorphSet\(was\);\n\s+figVer = keptVer; fboOK = keptOK; movedAll = keptAll;\n\s+return S;/.test(mk) || /prepareSet\(/.test(mk)) errors.push('src/ui/veins-gl.js makeMorphSet: puts figVer, fboOK and movedAll back after the swap back (making a set never causes a whole redraw) and does not prepare the set (api.prepareMorphSet, a slice of its own)');
    if (!/prepareMorphSet\(S\) \{ if \(S && S\.owner === api && morphSets\.has\(S\)\) prepareSet\(S\); \},/.test(vg) || !/if \(S && S\.prepKey === undefined\) prepareSet\(S\);\n\s+useMorphSet\(S\);/.test(vg)) errors.push('src/ui/veins-gl.js: api.prepareMorphSet(S) prepares a set of this renderer, and api.useMorphSet prepares a set never prepared at once, before the swap');
    const meshGeoBody = slice(vg, '  function meshGeo() {', '  // A morph set\'s bundle, made');
    if (/pointsFromEntries\(|joinEntryList\(|patchGroups\(|stage2Prepare\(/.test(meshGeoBody) || !/deriveBundle\(B, entCPU/.test(meshGeoBody)) errors.push('src/ui/veins-gl.js meshGeo: derives through deriveBundle / deriveJoinPatches only, for the bundle in use');
    if ((vg.match(/patchGroups\(/g) || []).length !== 1 || (vg.match(/deriveJoinPatches\(B\)/g) || []).length !== 2) errors.push('src/ui/veins-gl.js: patchGroups is called once, in deriveJoinPatches (plus its import), and deriveJoinPatches is defined once and called from meshGeo and prepareSet only');
    if (!/if \(!B\.patchOk && patchesWanted\(\)\) deriveJoinPatches\(B\);/.test(meshGeoBody) || !/if \(patchesWanted\(\) && !B\.patchOk\) deriveJoinPatches\(B\);/.test(slice(vg, '  function prepareSetStep(S, step) {', '  // The sets made under another mode'))) errors.push('src/ui/veins-gl.js: the joins\' patches are built only where patchesWanted() (not for the Tube\'s web joins)');
    if (!/if \(webJoins\(\)\) stage2Prepare\(B, tubeNow, nTubes, S\.morph\.joinBase\);/.test(vg) || (vg.match(/stage2Prepare\(/g) || []).length !== 1) errors.push('src/ui/veins-gl.js: the Tube\'s stage 2 record of a morph set is made by prepareSet, for web joins only (stage2Prepare is called there alone)');
    if (!/if \(!st \|\| st\.gen !== B\.gen \|\| !st\.R\.rows\) \{ st = stage2Prepare\(/.test(ts)) errors.push('src/ui/tube-stage2.js frame: bins only through stage2Prepare, and only for a bundle with no current record');
  }
  // The Tube's stage 3 (brief S3-D, 10 Nov 2026): the lumen layer. In stage 3 the compositor program is a Tube build and the lumen pass runs before it on every blood frame;
  // in stages 1 and 2 nothing of stage 3 runs (the old builds and the second flow target are as they were); a failed stage 3 program leaves stage 2.
  {
    const vg = text('src/ui/veins-gl.js'), tp = text('src/ui/tube-pass.js');
    const slice = (t, from, to) => t.slice(t.indexOf(from), t.indexOf(to, t.indexOf(from)));
    const meshUseBody = slice(vg, 'const meshUse = () => {', '\n  };');
    if (!meshUseBody || /tube3|tubeLumen|stage3/i.test(meshUseBody)) errors.push('src/ui/veins-gl.js meshUse: names no stage 3 program (a Tube frame that stage 2 can draw is never refused because a stage 3 program failed)');
    const finishTubeBody = slice(vg, 'const finishTube = () => {', '\n  };');
    if (!finishTubeBody || /tube3/i.test(finishTubeBody)) errors.push('src/ui/veins-gl.js finishTube: leaves stage 3 to finishTube3');
    if (/tubeStrip|tubePatch|tubeLean|tube2/.test(slice(vg, 'const finishTube3 = () => {', '\n'))) errors.push('src/ui/veins-gl.js finishTube3: finishes the six stage 3 programs only');
    if (!/const stage3 = !!tube3 && meshUse\(\) && tubePass\.stage\(\) === 3;/.test(vg)) errors.push('src/ui/veins-gl.js composite: stage 3 is the Tube chosen and drawing, tube3 ready and the pass at stage 3 (const stage3 = ...)');
    const prgLine = (vg.match(/\n[^\n]*const prg = [^\n]*/) || [''])[0];
    if (!/stage3 \? tube3\.compCell : compCell/.test(prgLine) || !/stage3 \? tube3\.plainCell : plainCell/.test(prgLine) || !/const cPlain = stage3 \? tube3\.plain : plain, cFull = stage3 \? tube3\.comp : comp;/.test(vg)) errors.push('src/ui/veins-gl.js composite: in stage 3 the compositor program is a Tube build (tube3.comp, compCell, plain, plainCell), and the old builds in stages 1 and 2');
    const nUse = (vg.match(/tube3\.(comp|compCell|plain|plainCell)\b/g) || []).length, nGuard = (vg.match(/stage3 \? tube3\.(comp|compCell|plain|plainCell)\b/g) || []).length;
    if (nUse !== nGuard) errors.push('src/ui/veins-gl.js: a Tube compositor build (tube3.comp, compCell, plain, plainCell) is named only after stage3 ?, so stages 1 and 2 never use one');
    const lumIf = vg.indexOf("if (stage3 && (blood.on || (dyeAny && blood.dye !== false) || blood.origin)) {\n        fencePart('before lumen pass');   // (?perf: what was queued ahead of the lumen pass is a step of its own, so the next one is the pass alone)\n        gpuProbe.time(gl, 'lumen layer', lumenFrame, m, look, blood);");
    const firstBind = vg.indexOf('compBind(U, layer, glow, warm, useStack);', lumIf);
    if (lumIf < 0 || firstBind < 0 || lumIf > firstBind) errors.push('src/ui/veins-gl.js composite: in stage 3 the lumen pass runs on every blood frame (blood, dye or origin), before the compositor binds its textures and draws (if (stage3 && (blood.on || ...)) { gpuProbe.time(gl, \'lumen layer\', lumenFrame, ...))');
    if ((vg.match(/function lumenFrame\(/g) || []).length !== 1 || (vg.match(/lumenFrame, m, look/g) || []).length !== 1) errors.push('src/ui/veins-gl.js: lumenFrame is defined once and called once, in the composite, in stage 3');
    if (!/if \(pMode === 5\) \{ tubePass\.lumen\(pM, pLook, pRedo\); return; \}/.test(vg)) errors.push('src/ui/veins-gl.js pieceFn: the lumen layer\'s piece is the Tube pass\'s lumen pass alone (pMode 5)');
    if (!/if \(stageNow\(\)\.stage !== 3\) return false;/.test(slice(tp, 'function tubeLumenPass(', 'const D = FR.D'))) errors.push('src/ui/tube-pass.js tubeLumenPass: draws nothing outside stage 3');
    if (!/AT = choice\.stage === 3 \? A3 : ATTACH;/.test(tp)) errors.push('src/ui/tube-pass.js tubePass: the layer pass writes no second flow target in stage 3 only (AT = choice.stage === 3 ? A3 : ATTACH)');
    if (/P3\.|E\.tube3\b(?!Failed)/.test(slice(tp, 'function tubePass(', '// ---- Stage 3'))) errors.push('src/ui/tube-pass.js tubePass: the layer pass names no lumen program (the lumen pass is tubeLumenPass)');
  }
  need('src/ui/veins-gl.js', [
    [/heads: who === 'stage' \?/, 'the lobule is given no axes: its renderer keeps the composite heads'],
    [/bool isLy = f1\.x < -0\.5;/, 'a lymph row is marked in the shader'],
    [/if \(blood == 1 && isLy && f1\.z > 0\.0\) \{\n\s*float lc, lk;\n\s*lymphAt\(s1, y1, f0, len1, R1, lc, lk\);/, 'a lymph row draws its dashes'],
  ]);
  // (lymphAt moved to comp-glsl.js with the rest of the lumen text, 10 Nov 2026: the rule moved with it, as written.)
  need('src/ui/comp-glsl.js', [[/chev == 1 && chevQuad == 0 && f1\.z > 0\.0 && !isLy/, 'arrowheads skip a lymph row (the chevrons the compositor draws itself: moved to comp-glsl.js with the Tube build, 10 Nov 2026)']]);
  need('src/ui/comp-glsl.js', [[/void lymphAt\(float s, float y, vec4 f0, float len, float R, out float cover, out float core\)/, 'the composite has a lymph dash function']]);
  const cg = text('src/ui/comp-glsl.js');
  const lymphFn = cg.slice(cg.indexOf('void lymphAt('), cg.indexOf('// How much of a lumen is an opaque cast'));
  if (!/fract\(\(s - f0\.x\) \/ pitch\)/.test(lymphFn)) errors.push('src/ui/comp-glsl.js lymphAt: the dash phase runs along the channel in world units, so a pan or pinch cannot slide it');
  if (!/ya = y \* R/.test(lymphFn)) errors.push('src/ui/comp-glsl.js lymphAt: across the channel in world units');
  if (/gl_FragCoord|\bFC\b/.test(lymphFn)) errors.push('src/ui/comp-glsl.js lymphAt: no screen-space coordinate (the dashes would slide off their vessel)');
  need('src/ui/lobule-zoom*', [
    [/const lyOn = lymphOn && !m\.hide;/, 'lymph rows only with the Lymph layer on'],
    [/blood\.on = \(lyOn \|\| biOn\) && flowA > 0\.002;/, 'the composite is on for lymph'],
    [/if \(t\.kind !== 'ly' && t\.kind !== 'lt'\) continue;\n\s*const mo = motionOf\(t\), o = t\.id \* FLOW_TEXELS \* 4;/, 'one flow row per lymph channel'],
    [/\(t\.kind === 'ly' \? -1 : 1\) \* dt \* lyVw/, 'out along the space of Disse, in along the terminal lymphatics'],
    [/flowData\[o \+ 6\] = 1;/, 'the lymph row is marked'],
  ]);
  forbid('src/ui/lobule-zoom*', /lyDrops|fxGLErase|lyRaw|lyNd/, 'nothing is built or drawn per frame for the lymph overlay any more');

  const sl = text('src/ui/scope-lens.js');
  const open = sl.slice(sl.indexOf('  function open()'), sl.indexOf('  function feed()'));
  if (!/drop\(\);[\s\S]*inst = createEndoscopy\(/.test(open)) errors.push("src/ui/scope-lens.js open(): the last opening's scope lets go and a new one is made (a kept scope showed a stale varix)");
  if (!/if \(fp\) inst\.pin\?\.\(fp\);/.test(open)) errors.push("src/ui/scope-lens.js open(): the scope is pinned to the slide's own numbers, as the tiles and the Scope card");
  need('src/ui/scope-lens.js', [
    [/function feed\(\) \{[\s\S]*const f = store\.get\(\)\.frame;[\s\S]*inst\.update\(f\)/, 'fed the frame the figure has, once it has its size'],
    [/const seen = \(f\) => !gastricUp\(store\.get\(\)\.params \|\| NO_P\) && \(grows \|\| varicesPresent\(f\)\);/, 'no ring with a tamponade balloon in'],
    [/stage\.scopeRingInto\?\.\(rg\)[\s\S]*follow\(\);/, 'the lens follows its ring on every step of the camera, never hidden by it'],
  ]);
  const pres = text('src/ui/presenter*');
  if ((pres.match(/ui\.tools\.pin\((\w+(?:\.fp)?)\); (?:live\.)?ui\.scope\?\.pin\(\1\);/g) || []).length !== 3) errors.push('src/ui/presenter.js: the scope is pinned wherever the Scope card is (3 places)');
  if (!/ink\?\.clear\(\);[^\n]*\n\s+ui\?\.scope\?\.close\(\);/.test(pres)) errors.push('src/ui/presenter.js: the scope shuts as the slide turns');

  // One glass (16 Nov 2026, style play-test: "the glass is not the same on every panel"; 11 Nov, Mohammad: "Tint and blur of glass should be the same EVERYWHERE"):
  // every region the page registers with stage.glass.add (sheets, toasts, chrome, menus, the Present cards) asks for the one card glass (card: true: CARD's blur,
  // the look's surface at CARD.tint, glass-gl.js), whatever its own --gl-tint says. The figure's callouts (stage.js) are the one region with their own ways.
  for (const f of ['src/ui/main.js', 'src/ui/menu-glass.js', 'src/ui/presenter-start.js']) forbid(f, /(?:\bglass\??\.add|\bapi\??\.add)\((?![^\n]*card: true)/, 'a glass region without card: true wears its own tint and blur, not the one glass');
  // A turn of the device frames a hand-placed view again (16 Nov 2026, style play-test, iPad portrait in Navy: a leftover zoom cropped the figure until Fit).
  need('src/ui/stage-fit.js', [[/turnMQ\.addEventListener\('change', onTurn\)/, 'a turn of the device (orientation change) refits a view the learner zoomed or panned, as Fit does']]);

  // The zoom pill's glyphs at rest on a pointer device keep 3:1 on the glass in every look (16 Nov 2026): muted ink at .5 was 2.5:1 in Light and Soft.
  need('styles/app-07-floating.css', [[/\.zoom-pill \.ib:not\(\.stage-rotate\):not\(:disabled\) \{ opacity: \.7;/, "the zoom pill's resting ink is .7 (3.9:1 or more in all five looks; .5 was 2.5:1 in Light)"]]);

  // The phone's slim bar has about 73 px a reading (play-test T02, 16 Nov 2026: "of healthy" ran the four lobule readings 67 px past a 390 px bar).
  need('styles/app-*.css', [[/@media \(max-width: 480px\) \{\s*\.app\.thumb \.vdock \.readouts\.lob \.metric \.v \.u-x \{ font-size: 0;/, "the lobule readings' referent (\"of healthy\") is left off a phone's slim bar, which keeps only \"reversed\""]]);
  // The bottom bar's grid always has the readings' area (16 Nov 2026, Mohammad: "the timeline looks glitched"): the play bar and the strip are the grid's two named areas ("tl", "ro").
  // A rule that gave .vdock areas with no "ro" while the Lobule's readings were showing sent them to an implicit row under the play controls. Such a rule is for a bar that has no
  // readings (the Tests side card hides the strip), or it says so with :not(:has(.readouts.lob)).
  for (const m of text('styles/app-*.css').matchAll(/([^{}]*\.vdock[^{}]*)\{[^}]*?grid-template-areas:\s*([^;}]*)/g)) {
    const sel = m[1].trim().split('\n').pop();
    if (/\bro\b/.test(m[2]) || /:not\(:has\(\.readouts\.lob\)\)|#dock\.side/.test(sel)) continue;
    errors.push(`styles/app-*.css: ${sel.slice(0, 120)} gives the bottom bar areas ${m[2].trim()} with no "ro": the Lobule's readings would fall into an implicit row under the play controls (add :not(:has(.readouts.lob)) to the selector)`);
  }
  // The pressure ramps tests/chevron-contrast.test.js judges the heads' ink on (16 Nov 2026): a ramp changed in the styles must change there too.
  need('styles/tokens.css', [
    ['--ramp-pressure: #B8D5ED 0, #85B6E9 5, #6787E8 10, #925CDD 12, #A4216E 20, #680C2F 30;', "Light's pressure ramp, as tests/chevron-contrast.test.js has it"],
    ['--ramp-pressure: #8DB8E2 0, #6A9FDE 5, #6787E8 10, #925CDD 12, #A4216E 20, #680C2F 30;', "Soft's pressure ramp, as tests/chevron-contrast.test.js has it"],
    ['--ramp-pressure: #D7E7F4 0, #9DC9F7 5, #7BA1FC 10, #A074F4 12, #BD2C92 20, #B31553 30;', "the dark looks' pressure ramp, as tests/chevron-contrast.test.js has it"],
  ]);

  // Readouts and the glass at rest (15 Nov 2026, app review WORDS-1): source shapes moved out of tests (PR-02), each with its reason.
  need('src/ui/gl-words.js', [[/createSvgGL\(host, \{ still: true \}\)/, 'a GPU readout\'s picture follows no class or child writes on its own element (the page\'s words landing and the glw-on mark), or each new number drew three times']]);
  need('src/ui/svg-gl.js', [[/if \(!opts\?\.still && typeof MutationObserver === 'function'\) g\.mo = new MutationObserver\(g\.relook\);/, 'a still picture (a readout) makes no observer of its looks']]);

  // The sinusoid view's reads (15 Nov 2026, app review OG-3): the ends' fades are read while a fade runs and four times a second, not on every drawn frame, and
  // every style and box read goes through layout-snap.js.
  need('src/ui/sinusoid-view.js', [
    [/if \(!endsDirty && now >= endFadeUntil && now - endAt < 250\) return false;/, "the ends' three computed-style reads a drawn frame are made only while a fade runs, when the looks change, or four times a second (OG-3)"],
    [/labels\.addEventListener\('transitionrun', endsMoved\); labels\.addEventListener\('animationstart', endsMoved\);/, "a fade that starts inside the labels is read each frame until it is over"],
    [/const askLooks = \(\) => \{ endsDirty = true;/, "a look change reads the ends again at once"],
  ]);
  forbid('src/ui/sinusoid-view.js', /getComputedStyle\(|getBoundingClientRect\(/, 'the sinusoid view reads styles and boxes through layout-snap.js (readStyle, readBox), never directly (OG-3)');

  // The change between the views is culled too (15 Nov 2026, app review R1b-13): source shapes moved out of tests (PR-02), each with its reason.
  need('src/ui/stage-morph.js', [[/b\.rowBox = pc\.path \? sweptRowBoxes\(pc\.path, MORPH_SLACK, GL_ROWS, null\) : null;/, "a stretch's set is made with each row's box over the whole stretch (its samples grown by the slack), for the Tube's cull"]]);
  need('src/ui/tube-stage2.js', [
    [/\(joinBase < 0 \|\| \(B\.morph && B\.morph\.rowBox\)\) \? cullUpdate\(B, nTubes, view\) : null/, "the Tube culls between the views by the stretch's boxes; without them it draws every row, as before"],
    [/D\.lumBox\.on = !!C && joinBase < 0;/, "the lumen pass is scissored to the rows' box only at rest: between the views the rows' points move, and the bundle's points are the first sample's"],
  ]);

  // The lobule's label search is a generator bounded by a count of solves (15 Nov 2026 LZ2-1; 19 Nov 2026 STG-1): source shapes moved out of tests (PR-02), each with its reason.
  need('src/ui/lobule-zoom*', [
    [/searchBudget\.begin\(\);\n\s+do \{\n\s+const s2 = solve\(permOf\(items, idx, ord\), base, LC\.ld0, trial\);\n\s+searchBudget\.spend\(\);/, "the order search begins its budget and counts each solve, so a crowded layout is bounded by the same number of solves on every device"],
    [/if \(searchBudget\.over\(\)\) break;\n\s+if \(sliceOver\(\)\) yield;\n\s+\} while \(nextPerm\(idx, items\.length\)\);/, "the six-label order loop stops at its budget and yields between solves once its frame's slice is spent"],
    [/if \(sol\.total >= 1e5 && !searchBudget\.over\(\)\) sol = yield\* retryClash\(/, "the other-sinusoid retry only starts inside the budget, and goes on in later frames where it stopped"],
    [/function\* layoutBody\(fr0, g, jb\)/, "the layout is a generator: a search that is not finished goes on in the next frame, the labels standing where they were seen until it lands (STG-1)"],
    [/cands\.length = Math\.min\(cands\.length, 8\);/, "eight other sinusoids at most"],
    [/if \(searchBudget\.over\(\)\) break;\n\s+sinIt\.a\[0\] = a\[0\]; sinIt\.a\[1\] = a\[1\];/, "the candidate loop stops at its budget"],
    [/if \(winSin != null\) pick\.sin = winSin;/, "the sinusoid that carries the label is set once, when the search has finished, never under a search that is cut"],
    [/const callLead = placeCall\(fr, placed, cards, LC\.none, crosses, ring, hex, keep, into, callOutMain, true\);/, "the pill is placed dry (no write to the page) and written once, landCall, when the layout lands"],
  ]);
  forbid('src/ui/lobule-zoom*', /performance\.now\(\) > (?:live\.)?deadline|searchBudget\.end\(/, 'the label search is bounded by a count of solves, never a clock: the same lobule state must give the same layout on every device (STG-1)');
  forbid('src/ui/lobule-zoom*', /pick\.sin = t\.id/, 'pick.sin is set once when the search has finished (STG-1)');
  // What covers the figure is one list, src/ui/blockers.js (19 Nov 2026, bible review STG-2): source shapes moved out of tests (PR-02), each with its reason.
  for (const f of ['src/ui/stage-label-items.js', 'src/ui/lobule-zoom.js', 'src/ui/sinusoid-view.js']) forbid(f, /querySelectorAll\(\s*['"`]\.stage-blocker:not\(\[hidden\]\)['"`]\s*\)|BLOCKER_SEL\s*=/, 'what covers the figure is read from src/ui/blockers.js (one list, one set of rules, rest boxes), never a copy: a label tucked under the teaching glass in the lobule and sinusoid when each kept its own');
  need('src/ui/stage-fit.js', [
    [/function cardSpaceFrom\(list\) \{[\s\S]{0,300}for \(const \{ el, rest: q,/, "the room the catheter's readings keep to counts each card at its rest box, so a card still sliding in does not move them twice (STG-2)"],
  ]);

  // The sinusoid view's cells pass is scissored to the cells' boxes (15 Nov 2026, app review OG-2): source shapes moved out of tests (PR-02), each with its reason.
  need('src/ui/sinusoid-gl.js', [
    [/const nb = u\.uF0 && u\.uF1 \? cellBoxes\(u, canvas\.width, canvas\.height, CELL_BOX\) : -1;/, "the cells' pass is drawn only inside the boxes the shader can colour (a draw with no camera still draws it whole)"],
    [/gl\.scissor\(CELL_BOX\[i \* 4\][^\n]*tissue\(u, 1\); \}\n\s+gl\.disable\(gl\.SCISSOR_TEST\);/, "each box is its own scissored draw, and the test is switched off again for what is drawn after"],
  ]);

  // The path card's head and foot (16 Nov 2026, Mohammad: "the info on top is redundant given we have the tiles"; "the Baveno citation can go down in the same line as the fig 1 text"): source shapes kept here (PR-02), each with its reason.
  need('src/ui/tool-path.js', [
    [/L\.footH = Math\.max\(L\.foot\.h, PILL_H\)/, "the source's pill stands in the foot row, level with the figure's number"],
    [/px = lay\.Wv - lay\.pillW/, 'the pill sits at the right end of the foot row'],
    [/chipsOf\(of, p, tiled\)/, "the chips leave out the readings the card's header tiles already show"],
  ]);
  forbid('src/ui/tool-path.js', /[Ll]ay?\.y\.kick/, "the source's pill is never a row above the figure again");

  // The bile canaliculus (16 Nov 2026, Mohammad: "Build the named canaliculus"): source shapes kept here (PR-02), each with its reason.
  need('src/ui/sinusoid-gl.js', [
    [/float vm = HEP \* \(0\.3 \+ 0\.4 \* h1\(j, sd \+ 9\)\), bend = 4\.0 \* \(h1\(j, sd \+ 10\) - 0\.5\)/, "the shader's cell border is the one canaliculusAt() follows, so the name's leader lands on the canaliculus drawn"],
    [/vec2 q = vec2\(x - edgeAt\(j \+ k, sd, v\), v - 0\.5 \* HEP\);/, 'each canaliculus sits on a cell border, mid-plate'],
  ]);
  forbid('src/ui/sinusoid-gl.js', /Bile canaliculi between neighbouring cells[\s\S]{0,1400}?\b(uFlow|uLym|uShim|uLyF)\b[\s\S]{0,200}?return outC;/, 'the canaliculi are still: canalicular bile moves by diffusion, not as a stream (Vartak, Hepatology 2021)');
  need('src/ui/sinusoid-view.js', [
    [/region\('bc', 'Bile canaliculus'/, 'one canaliculus is named in the view'],
    [/const DECK = \[[^\]]*'bc'\]/, "its name gives way to the other names (it is the last to place)"],
    [/if \(litNow\(\)\.has\('sinusoid:canaliculus'\)\)/, 'a portrait screen has no room for a seventh name: it is named there only while a slide points at it'],
    [/R\.key === 'bc' && !bcOn\) \? 0 : dimA\(R\)/, 'a canaliculus the layout did not name fades its name out (never left where it was)'],
  ]);
  need('styles/app-*.css', [
    ['[data-target="sinusoid:canaliculus"] { --term-c: var(--bile-duct); }', "a lit canaliculus takes the bile ducts' ink, as the lobule's ductule does"],
    ['.app[data-lit~="sinusoid:canaliculus"] [data-target="sinusoid:canaliculus"]', 'a lit canaliculus name is coloured like every lit sinusoid name'],
  ]);

  // The lobule's layers (16 Nov 2026, Mohammad: "when I toggle zones on and off in lobule view, the zones labels do not disappear"): source shapes kept here (PR-02), each with its reason.
  // The zone names had been taken out of zoneEls, the list the GPU captions walk, so the GPU kept drawing them at their last alpha with the layer off.
  // Now a layer's names are only faded, never taken out, and every layer is one table (LAYERS, LAB_LAYER) read by the layout, the kept layout record and the labels.
  forbid('src/ui/lobule-zoom*', /zoneEls\.(pop|shift|splice)\(|zoneEls\.length\s*=[^=]/, "a zone name is never taken out of the list the GPU captions walk (a name out of it stays drawn at its last alpha)");
  forbid('src/ui/lobule-zoom*', /k === 'lymph' && !live\.lymphOn/, 'a label tests its layer through labelLayerOff, not by hand');
  need('src/ui/lobule-zoom*', [
    [/if \(!layerOn\('zones'\)\) \{ for \(let i = 0; i < zoneEls\.length; i\+\+\) fadeOut\(zoneEls\[i\]\); return NO_BOXES; \}/, 'Zones off: every zone name fades out where it stands'],
    [/if \(labelLayerOff\(k\)[) ]/, "the layout fades a layer's station label out through the one table (LAB_LAYER)"],
    [/for \(let i = 0; i < LAYERS\.length; i\+\+\) if \(f\.ly\[i\] !== layerOn\(LAYERS\[i\]\)\) return false;/, "a layer's switch starts the layout over"],
    [/const off = !e\.isConnected \|\| gone\(e\)/, 'the GPU fades a name whose element is gone (capSync)'],
  ]);
  // The names are read in the layer's own px (16 Nov 2026, Mohammad's Mac: Lobule → Sinusoid → Lobule left the sin, cv and triad names 28 times too big, gone): source shapes kept here (PR-02).
  need('src/ui/lobule-zoom*', [
    [/if \(live\.layerScaled\) \{ mirHeld = true; return; \}/, 'no name is read into the captions (mirrorOf) while the dive or the sinusoid zoom scales the layer: a box read then carries the scale'],
    [/if \(live\.layerScaled\) \{ measHeld = true; return; \}/, "no label's letter boxes are read (inkRows) while the layer is scaled"],
    [/get layerScaled\(\) \{ return diveScaled \|\| sinU > 0; \}/, 'the layer is scaled during the dive in and the zoom on into a sinusoid'],
    [/sv\.place\(placeArg\);\n\s+mirrorRelease\(\);/, 'the names held back are read again once the sinusoid zoom has put the layer straight'],
    [/if \(!diveScaled\) \{ diveDrawn = false; mirrorRelease\(\); \}/, 'and once the dive has landed'],
  ]);
  {   // every layer the store keeps is in LAYERS and has its switch on the lobule
    const lz = text('src/ui/lobule-zoom*'), st = text('src/ui/store.js');
    const layers = [...((/const LAYERS = \[([^\]]*)\]/.exec(lz) || ['', ''])[1]).matchAll(/'(\w+)'/g)].map((m) => m[1]);
    const stored = [...((/lobuleLayers: \{([^}]*)\}/.exec(st) || ['', ''])[1]).matchAll(/(\w+):/g)].map((m) => m[1]);
    if (layers.slice().sort().join() !== stored.slice().sort().join()) errors.push(`src/ui/lobule-zoom-labels.js LAYERS (${layers}) must list exactly the layers store.lobuleLayers keeps (${stored}): a layer left out keeps its names on when it is off`);
    for (const n of layers) if (!new RegExp(`get ${n}On\\(\\) \\{ return ${n}On; \\}`).test(lz)) errors.push(`src/ui/lobule-zoom.js: live.${n}On is the switch of the ${n} layer`);
    for (const m of (/const LAB_LAYER = \{([^}]*)\}/.exec(lz) || ['', ''])[1].matchAll(/\w+: '(\w+)'/g)) if (!layers.includes(m[1])) errors.push(`src/ui/lobule-zoom-labels.js LAB_LAYER names a layer that is not in LAYERS: ${m[1]}`);
  }

  // The calipers' tick text is built only when a number of it changed (15 Nov 2026, app review SF-3): source shapes moved out of tests (PR-02), each with its reason.
  need('src/ui/stage-outlines.js', [
    [/if \(el0 && !el0\.going && segsSame\(el0\.capN, g\.segs\)\) \{ el0\.seen = true; continue; \}/, "a caliper that stands still keeps its element and builds no path text"],
    [/if \(el1\) el1\.capN = segsSave\(el1\.capN, g\.segs\);/, "the numbers drawn are kept for the next frame"],
  ]);

  // The probe's waves reach the GPU pass as numbers (15 Nov 2026, app review SF-2): source shapes moved out of tests (PR-02), each with its reason.
  need('src/ui/stage-scan.js', [
    [/toDom = !live\.labelGL\?\.setWaves \|\| !live\.labelGL\.wavesOn\(\)/, "the page's wave elements are written only where the labels' GPU pass is not drawing the probe (they are a mailbox it no longer reads)"],
    [/live\.labelGL\?\.setWaves\?\.\(wrec\);/, "the packets' numbers are handed to the GPU pass each frame they move"],
  ]);
  need('src/ui/label-gl.js', [[/if \(waveRec && waveOn\) \{/, "the probe's waves are drawn from the record's numbers, with no path text parsed (SF-2); the element read stays for a pass with no record"]]);

  // A transform list is read as a matrix without writing to the element (15 Nov 2026, app review OG-1): consolidate() replaces the list by one matrix(),
  // which rewrites the attribute and wakes every attribute observer; transform-read.js reads the items and multiplies them instead.
  for (const f of files) if (f.endsWith('.js') && !/transform-read\.js$/.test(f) && /^(?!\s*\/\/)[^\n]*\.consolidate\(/m.test(readFileSync(f, 'utf8'))) errors.push(`${f.slice(ROOT.length + 1)}: a transform list is read with listMatrix (transform-read.js), never consolidate() (it rewrites the transform attribute and wakes the page's attribute observers)`);

  // Link previews, ?embed and the wake lock (13 Nov 2026, A23/A24/O1): source shapes moved out of tests (PR-02), each with its reason.
  need('index.html', [
    [/setAttribute\('data-embed',''\)/, '?embed marks <html> before the first paint, so the top bar never shows in an iframe'],
    [/property="og:image" content="https:\/\/[^"]+\/brand\/share\/healthy\.jpg"/, 'a link to the app shows the healthy patient card (an absolute address: previewers do not resolve a relative one)'],
    [/name="twitter:card" content="summary_large_image"/, 'the card is a large picture, not a thumbnail'],
    [/name="theme-color" content="#F1EBE0" media="\(prefers-color-scheme: light\)"/, 'the manifest theme colour (#F1EBE0) matches the light page colour'],
  ]);
  need('styles/app-*.css', [[/html\[data-embed\] \.topbar/, '?embed hides the top bar']]);
  need('src/ui/main.js', [
    [/location\.protocol !== 'file:' && !EMBED\)/, 'an embed on another site installs no offline worker'],
    [/function showFirstHint\(\) \{\n {2}if \(EMBED\) return;/, 'an embed shows no first-run hint'],
    [/function armFeedbackAsk\(\) \{\n {2}if \(EMBED\) return;/, 'an embed never asks for feedback'],
    [/store\.on\('presenting', \(v\) => keepAwake\(!!v \|\| projector\)\)/, 'a talk keeps the screen awake (wake-lock.js)'],
    [/keepAwake\(projector \|\| !!store\.get\(\)\.presenting\)/, 'so does projector mode'],
  ]);
  need('src/ui/presenter*', [[/function stop\(restore = true\) \{\n {4}if \(!(?:live\.)?deck \|\| (?:live\.)?leaving \|\| document\.documentElement\.hasAttribute\('data-embed'\)\) return;/, 'an embedded talk stays on its last slide (stop does nothing; start() ends the old talk itself)']]);
  need('src/ui/presenter-view-page.js', [[/keepAwake\(!!st\);/, "the notes window keeps its screen awake while a talk runs"]]);

  // The bottom bar stays as it is while the figure moves (13 Nov 2026, Mohammad: "why does the timeline bar change when I pan"): a pan once folded
  // it to a play-and-clock pill on the phone layout. figure-focus now only slides the top bar's second row away; nothing styles the bottom bar with it.
  forbid('src/ui/main.js', /foldDock|foldSoon|classList\.toggle\('mini'/, 'a pan, pinch or wheel does not fold the bottom bar to a pill (it must stay steady while the figure moves)');
  forbid('styles/app-*.css', /\.vdock\.mini\b/, 'the bottom bar has no folded pill any more');
  forbid('styles/app-*.css', /\.figure-focus[^{}]*(?:\.vdock|\.timeline|\.readouts|\.stage-bar\.bottom|\.thumb-bar)[^{}]*\{/, 'figure-focus does not style the bottom bar');
  forbid('styles/app-*.css', /\.figure-focus \.zoom-pill:not\(\.under-sheet\) \{ translate/, 'the zoom pill does not drop into the bottom bar\'s row during a pan');

  // Presenter waits and hand-overs (8 Nov 2026, animation review push B, items 2 to 4): source shapes moved out of tests (PR-02), each with its reason.
  need('src/ui/presenter*', [
    [/const \{ waitCut, until \} = createWaits\(\{ frame: nextFrame \}\);/, 'until is polled by frame, and waitCut ends a wait at a newer press (wait-cut.js), not a 40 ms timer or a bare setTimeout'],
    [/const viewSettled = \(cut, stage\) => waitCut\(VIEW_CHANGE_MS \+ 400, \(\) => cut\(\) \|\| !stage\.viewChanging\?\.\(\)\);/, "a step after a switch of view waits for the change to land (stage.viewChanging), with VIEW_CHANGE_S's margin as the longest"],
    [/stage\.lobuleFocus\(part, \{ zoom, ms \}\)\) await waitCut\(ms \+ 300, \(\) => cut\(\) \|\| !stage\.lobuleGlide\?\.\(\)\);/, "the wait after a lobule focus is the lobule glide's landing (the focus times itself by reach), ms only its ceiling"],
    [/setViewKey\('sinusoid'\); if \(ms\) await waitCut\(1250 \+ 400, \(\) => cut\(\) \|\| !stage\.sinBusy\(\)\)/, 'into the sinusoid: until its zoom has landed'],
    [/setViewKey\('lobule'\); if \(ms\) await waitCut\(1000 \+ 400, \(\) => cut\(\) \|\| !stage\.sinBusy\(\)\)/, 'out of the sinusoid: until its zoom has landed'],
    [/const switching = store\.get\(\)\.view !== v;\s*if \(switching\) setViewKey\(v === 'circuit' \? 'circuit' : 'anatomy'\);/, "a slide's switch of view sets off and its framing is asked of the running change at once (camera travels once)"],
    [/\{ setViewKey\('anatomy'\); await viewSettled\(cut, stage\); if \(cut\(\)\) return; \}/, 'the dive after a switch to Anatomy waits for the change to land, not 700 ms'],
    [/if \(threw\) \{ thrownNow = true; return 0; \}/, 'every card that leaves is thrown: wordsOut asks for no fixed floor, throwsOut() ends when they are out of sight (about 170 ms, not 260)'],
    [/if \(outMs\) await waitCut\(Math\.max\(0, outMs - \(performance\.now\(\) - outAt\)\), cut\);\s*\n\s*if \(throwDir\) await throwsOut\(\);/, 'the old cards are waited for by their own end of sight'],
    [/if \(!slidePrep\.ready\(want\)\) \{ outNow\(\); prepHold\(want, goOn\); \} else goOn\(\);/, "the cards that show are thrown on the press, before the wait for the slide's preparation"],
  ]);
  forbid('src/ui/presenter*', /\bwait\(700\)|async function until\(/, 'no 700 ms wait left from the 0.6 s change, and no 40 ms timer poll');
  {
    const pz = text('src/ui/presenter*'), c0 = pz.indexOf('  async function camera('), cam = pz.slice(c0, c0 + 1 + pz.slice(c0 + 1).search(/\n {2}(?:async )?function |\n {2}\/\/ \(left: only the entrances/));   // (the next function after it, or the note that used to follow it)
    if (/\bwait\(/.test(cam)) errors.push('src/ui/presenter.js camera(): a wait here is waitCut or until, so a newer press cuts it');
    const at = cam.indexOf('const switching = store.get().view !== v;');
    if (!(at > 0 && cam.indexOf('frameTo(cam, s, gl, SLIDE_OPT);', at) > at && cam.indexOf('viewSettled(cut, stage)', at) > cam.indexOf('frameTo(cam, s, gl, SLIDE_OPT);', at))) errors.push('src/ui/presenter.js camera(): the framing is asked of the change before any wait for it to land');
  }
  {
    // M10 step 2 (8 Nov 2026): a bare `await wait(` is a wait Next cannot cut. The ones left, per file; the number only goes down.
    const bare = { 'src/ui/presenter*': 3 /* boot cover settle loop; putHealthy's two closing fade waits */, 'src/ui/stage.js': 2 /* lobule fit on open */ };
    for (const [f, n] of Object.entries(bare)) {
      const c = (text(f).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').match(/await wait\(/g) || []).length;
      if (c !== n) errors.push(`${f}: ${c} bare await wait( (allowance ${n}): use waitCut(ms, cut), or lower the allowance in scripts/rules-lint.mjs when one goes`);
    }
    const pz = text('src/ui/presenter*'), cth = pz.slice(pz.indexOf('  async function cathTo('), pz.indexOf('  // ── A time-lapse on the live model'));
    if (/\bwait\(/.test(cth.replace(/waitCut\(/g, ''))) errors.push('src/ui/presenter.js cathTo(): every wait is waitCut(ms, cut), so Next cuts the catheter descent');
  }
  need('src/ui/stage-view.js', [
    [/const ms = reducedMs\(VIEW_CHANGE_MS\); live\.vtUntil = performance\.now\(\) \+ viewXfLeftMs\(live\.morph, live\.morphTarget, ms\); live\.vtMs = ms;/, "the change's length for whoever waits on it comes from VIEW_CHANGE_S"],
    [/if \(xfSolveSlice\(x\.lab, XF_SLICE_MS\)\)/, 'a pending label solve goes on for the camera it began for, whatever the camera is retargeted to'],
  ]);
  forbid('src/ui/stage-view.js', /vtUntil = performance\.now\(\) \+ 700|vtMs = 700/, 'the change is not 700 ms');
  need('src/ui/stage-glide.js', [[/if \(live\.viewXf && viewXfRetargetTo\(to\)\) \{ live\.following = false; return; \}/, "a framing asked for during a change between the views is the change's new end, not a second glide"]]);
  need('src/ui/stage-gestures.js', [[/viewXfDetach\(live\.viewXf\);[^\n]*\n\s+if \(live\.vtGliding\) \{ cancelFrame/, 'a wheel or pinch takes the camera from a running change'], [/viewXfDetach\(live\.viewXf\);[^\n]*\n\s+cancelFrame\(live\.vtAnim\);/, 'a press takes the camera from a running change']]);
  need('src/ui/stage-fit.js', [[/viewXfDetach\(live\.viewXf\);[^\n]*\n\s+const goal = /, 'a turn of the circuit ends a running change cleanly']]);
  need('src/ui/stage.js', [
    [/const u = viewXfCamU\(viewXf, viewXfP\(\)\);/, "the change's camera is its share since the last retarget"],
    [/gliding: \(\) => vtGliding \|\| !!viewXf,/, 'the camera is still moving while a change between the views lands, even when it has nowhere to go'],
    [/viewChanging: \(\) => !!viewXf \|\| morph !== morphTarget \|\| circWait,/, 'the stage says when the change between the views is still under way'],
    [/glideLeft: \(\) => \(vtGliding \|\| viewXf \?/, "glideLeft counts the change between the views, camera moving or not"],
    [/viewXfCameraInto\(viewXf, u, viewBoxAt\(/, "the camera through a change between the views is worked out on the screen against the view box as it stands (a lerp in the box's own units bowed the landing framing off its line and back, 15 Nov 2026)"],
  ]);
  forbid('src/ui/stage.js', /lerpVT\(viewXf\./, "the change's camera is never lerped in the view box's units: view-xf.js viewXfCameraInto");
  need('src/ui/stage-frame.js', [[/viewBoxAt\(t, rr, VB_ANAT, VB_CIRC, VB_CIRC_R, vbNow\)/, 'the view box is drawn by the one formula the camera reads (view-xf.js viewBoxAt)']]);
  need('src/ui/stage-view.js', [[/vb0: \[vbBox\.x, vbBox\.y, vbBox\.width, vbBox\.height\]/, 'a change keeps the view box its camera was written for'], [/sameView\(live\.vt, to\), \[vbBox\.x/, 'a retarget keeps the box the camera it sets out from stands in']]);
  need('src/ui/stage-fit.js', [[/viewXfCameraInto\(g\.x, /, "the phone's turn glide is worked out on the screen too: the view box turns under the camera"]]);
  forbid('src/ui/stage-glide.js', /camMs\([^)]*VIEW\.w|springSlope\([^)]*VIEW\.w/, "a glide's time and carried speed count the screen's real width (stage-ride.js screenW), not the old 1400 plate");
  need('src/ui/stage-glide.js', [[/else if \(opt\.slow\) animateVT\(to, ms, \{ scale: true, floor: CAM_MS_MAX, slide \}\)/, "the move in from a case card takes the time the move out took (frameBox opt.slow)"]]);
  need('src/ui/presenter.js', [
    [/prep = bare \? unseenFit\(cut\) : null, Promise\.resolve\(prep\)\.then\(\(ok\) => \(bare && !ok \? null : camera\(cam, fv, cut\)\)\)/, "the lead-in camera frames only after the unseen cards' last fitting (Carvedilol 3 to 4, 16 Nov 2026: a framing taken before it was undone by a second move)"],
    [/else if \(cam\) \{ if \(prepWith\) \{ prep \|\|= unseenFit\(cut\); if \(!await prep\) return; \} await camera\(cam, fv, cut, plate \? CARDS_AT : 0\); \}/, "the slide's camera frames only after the unseen cards' last fitting, for every kind of slide change over the plate (same patient, new patient, case card)"],
  ]);
  need('src/ui/presenter.js', [[/await caseLifted\(cut\); if \(cut\(\)\) return; caseExit = true;/, "the camera behind a case card is at the whole patient: its move in takes 900 ms (presenter-proc.js frameTo reads caseExit)"]]);
  need('src/ui/presenter-proc.js', [[/live\.caseExit && !opt\.drift \? \{ \.\.\.opt, slow: true \} : opt/, "frameTo asks the move in from a case card slow"]]);
  // A card zoom's callouts come back through their fade (19 Nov 2026, bible review STG-6): source shapes kept here (PR-02), each with its reason.
  need('src/ui/stage-zoom.js', [
    [/h\.el\.style\.transition = `opacity \$\{D_SMALL\}ms var\(--ease\)`; h\.el\.style\.opacity = h\.was; \}\n\s+stageScope\.timer\(\(\) => \{ for \(const h of back\) h\.el\.style\.transition = h\.tr; \}, D_SMALL \+ 40\);/, "the callouts hidden under a zoomed card return under the fade they left by, and drop the inline transition once it has run: opacity and transition written together popped them back in one frame"],
  ]);
  // The catheter stack's row flip is a soft dip and rise, and a crossing is marked (19 Nov 2026, bible review STG-9): source shapes kept here (PR-02).
  need('src/ui/stage-cath.js', [[/t\.animate\(\[\{ opacity: 0\.25 \}, \{ opacity: 1 \}\], \{ duration: D_SMALL, easing: EASE_ARRIVE \}\)/, 'the order flip of the HVPG stack plays a dip-and-rise on the box and its leaders (the motion scale\'s time and curve, no keyframes of its own), never an instant swap'], [/el\.dataset\.leadsUnclean = '1'/, 'a stack whose leaders cross either way is marked on its root']]);
  // One reading-text rule for the figure's labels and the lobule's stations (19 Nov 2026, bible review STG-5): source shapes kept here (PR-02).
  need('src/ui/lobule-zoom-labels.js', [[/badgeOn\(m\.cmp\), off = badgeOff\(m\.cmp\)/, 'the lobule station badge reads the one rule (change-badge.js)'], [/rollStep\(rl, v, 0\.5, performance\.now\(\), reduce\.matches\)/, 'a lobule station number counts to its new value as every other reading does (count-roll.js)'], [/padDigits\(L\.el\.innerHTML\)/, 'a label key pads its digits: 9.9 and 10.0 are one key']]);
  need('src/ui/stage-label-items.js', [[/badge\(\(cmp \? 'pc:' : 'p:'\) \+ id, Math\.abs\(P - ref\), badgeOn\(cmp\), badgeOff\(cmp\)\)/, 'the figure\'s change badge reads the one rule (change-badge.js)']]);
  // The camera has one path, the straight one (19 Nov 2026, bible review STG-4; Mohammad, 18 Nov: "camera must zoom straight from any view to any view"): no pull-back arc, no blend of two paths, no arc option.
  for (const f of ['src/ui/stage.js', 'src/ui/stage-glide.js', 'src/ui/stage-cath.js', 'src/ui/stage-ride.js', 'src/ui/stage-fit.js', 'src/ui/stage-view.js']) forbid(f, /\barcRoom\b|\bcamPath\b|\bblendPaths\b|\barcRun\b|\bviewsOverlap\b|\barc: true|\{ arc\b/, 'the camera goes straight from any view to any view: no pull-back arc, no blended refit, no arc option (cam-arc.js lerpInto)');
  forbid('src/ui/proc-anim.js', /\barc:\s*(?:true|false)/, 'a procedure shot goes straight: no arc option (STG-4)');
  forbid('src/ui/stage-ride.js', /VIEW\./, 'the arcs read the stage\'s real view box (cam-arc.js camWindow), never the old 1400 x 1000 plate');
  need('src/ui/lobule-zoom*', [[/diveMapInto\(D\.p, D\.c, D\.rot, D\.Z, g, DM\)/, 'the lobule is carried by the dive map: turned and grown about its sinusoid, which goes straight to its place']]);
  forbid('src/ui/lobule-zoom*', /D\.q\b/, 'no fixed point: the zoom into a sinusoid spiralled about it (15 Nov 2026)');
  need('src/ui/sinusoid-view.js', [[/diveAlong\(Z, g\)/, "the sinusoid view's centre is on the same straight line, at the same share, as the lobule's sinusoid"]]);
}

// Rest pacing, Mac heat recs 2 and 7 (13 Nov 2026): tests/talk-rest-20hz.test.js and tests/instruments-rest-pace.test.js run the pacing and
// the strips' loops; these pin the wiring a unit test cannot reach without the page. A pattern that no longer matches means the code it guarded
// changed: look before editing the rule.
{
  const text = sourceText;
  const need = (file, rules) => {
    const src = text(file);
    for (const [re, why] of rules) if (!(typeof re === 'string' ? src.includes(re) : re.test(src))) errors.push(`${file}: ${why} (${re})`);
  };
  need('src/ui/stage.js', [[/const dt = Math\.min\(0\.1, \(now - lastT\) \/ 1000\);/, "the figure's blood steps by the time that passed, capped at 0.1 s: a talk's 20 Hz frame (50 ms) loses no time, so nothing slows"]]);
  need('src/ui/lobule-zoom*', [[/const dt = Math\.min\(0\.1, \(now - \(last \|\| now\)\) \/ 1000\);/, "the lobule's blood steps by the time that passed: its 20 Hz talk frame loses no time"]]);
  need('src/ui/main.js', [[/setRestTalk\(\(\) => presenter\.active\(\)\)/, "a talk's rest steps (30, then 20 after 30 s, never 15) follow the presenter"]]);
  need('src/ui/frame-hud.js', [['blood pacing (untouched): ${restRule}', '?perf names the rest rule in force']]);
  need('src/ui/doppler.js', [
    [/const paced = live\(\) && !labBusy, pace = paced \? paceMs\(\) : 0, rest = paced \? restGapFor\(now\) : 0, gap = Math\.max\(pace, rest\);/, 'the running Doppler is rest-paced; a change while paused, or the lab drawing, is drawn at once'],
    [/if \(gap && now - paintAt < gap\) \{ if \(!\(rest > pace && park\(gap - \(now - paintAt\)\)\)\) raf = nextFrame\(loop\); return; \}/, 'at rest the Doppler waits on a timer between its frames, not on every screen frame'],
    [/clearTimeout\(parkT\); parkT = 0;/, 'the Doppler lets its rest timer go with it'],
    [/const tNow = buf\.length >= 2 \? clockNow\(now\) : null;/, "the Doppler's sweep is drawn from the clock, so rest pacing steps it less often but never slower"],
    [/const cNow = Math\.floor\(tNow \* g\.cps\);/, "the Doppler's newest column is the clock's"],
  ]);
  need('src/ui/pressure-time.js', [
    [/const pace = paceMs\(\), rest = restGapFor\(now\), gap = Math\.max\(pace, rest\), due = !gap \|\| now - tickAt >= gap;/, 'the pressure strip is rest-paced'],
    [/clearTimeout\(parkT\); parkT = 0;/, 'the pressure strip lets its rest timer go with it'],
  ]);
}

// The stall on slide changes (16 Nov 2026, Mohammad's play-test: 450 to 800 ms frozen on every Present change, then the camera snapped; a headless
// profile, JS time only, found the three causes below). tests/slide-change-budget.test.js runs the hold (frame.js beginChange, settling).
{
  const text = sourceText;
  const need = (file, rules) => {
    const src = text(file);
    for (const [re, why] of rules) if (!(typeof re === 'string' ? src.includes(re) : re.test(src))) errors.push(`${file}: ${why} (${re})`);
  };
  const forbid = (file, re, why) => { if (re.test(text(file))) errors.push(`${file}: ${why} (${re})`); };
  // 1. The presenter's change marks are attributes on #app, never classes: a dozen watchers take #app's class text for the look, and each toggle made the
  // overlays read every unit again (130 to 540 ms a time), dropped the stage's style snapshot and had the cards placed again, twice or more in a change.
  forbid('src/ui/presenter.js', /classList\.(add|remove|toggle)\(\s*'pz-(moving|morph|morph-under)'/, "a change mark on #app is a data attribute (data-pz-moving, data-pz-morph, data-pz-morph-under), never a class: every watcher of #app's class text starts over for a class (stage.js overKey, main.js, credit.js)");
  for (const m of text('src/ui/presenter.js').matchAll(/\bapp\.classList\.(?:add|remove|toggle)\(\s*'([^']+)'/g)) {
    if (!['pz-hush', 'pz-hush-in', 'pz-hi', 'pz-blacked', 'pz-held', 'presenting'].includes(m[1])) errors.push(`src/ui/presenter.js: #app class "${m[1]}" is written by the presenter: a marker no style sheet reads is a data attribute (a class makes every watcher of #app's class text start over, 16 Nov 2026 slide change stall)`);
  }
  need('src/ui/credit.js', [[/attributeFilter: \['class', 'data-pz-moving'\]/, "the credit placer wakes when data-pz-moving changes, as it woke on the class"]]);
  need('src/ui/figure-key.js', [[/attributeFilter: \['class', 'data-pz-moving'\]/, "the colour key wakes when data-pz-moving changes, as it woke on the class"]]);
  for (const f of ['src/ui/credit.js', 'src/ui/figure-key.js', 'src/ui/stage.js', 'src/ui/main.js']) forbid(f, /classList\.contains\(\s*'pz-(moving|morph)/, 'a change mark is read as the attribute (hasAttribute), not as a class');
  // 2. A slide change holds the background work that can wait (frame.js settling) from its press to its landing, never into a time-lapse's playing.
  need('src/ui/presenter.js', [
    [/changeOff = \(endChange = beginChange\(\)\)/, 'transition() begins the change: background work that can wait does not start in its waits for frames and cards'],
    [/creditOff\(\); changeOff\(\);/, 'and ends it whatever ended the move'],
    [/shown = \{ i: to, gen: g \}; lastAt = to; shownBeat = b0; endChange\?\.\(\);/, "the hold is given back as the slide lands, before a time-lapse of minutes plays"],
  ]);
  need('src/ui/stage-tubes.js', [[/sinceInput\(\) < 700 \|\| settling\(\)\) stageScope\.timer\(prepIdleGo/, "the lobule's pictures made ahead wait out a slide change (100 to 250 ms a piece, in the waits ahead of the camera)"]]);
  need('src/ui/stage-vessels.js', [
    [/if \(settling\(\) \|\| live\.coilEasing\) \{ envSoon\(\)/, "the vessels' envelope waits out a slide change"],
    [/\(settling\(\) \|\| sinceInput\(\) < 700\) && snaps\.length/, "the envelope's stretches wait out a slide change"],
    [/live\.coilEasing \|\| settling\(\) \|\| live\.inUpdate\) \{ et\.restT/, "the ease's rest waits out a slide change"],
    [/live\.coilEasing \|\| settling\(\) \|\| live\.inUpdate\) \{ mt\.restT/, "the pieces' rest waits out a slide change"],
  ]);
  need('src/ui/stage-morph.js', [
    [/if \(settling\(\) \|\| live\.rotU !== live\.rotTarget\)/, "the morph's check waits out a slide change"],
    [/if \(settling\(\) \|\| live\.coilEasing \|\| live\.morph !== live\.morphTarget\) \{ mt\.coilCheck = null/, "the coil's check waits out a slide change"],
  ]);
  need('src/ui/lobule-zoom.js', [[/if \(handOn\(\) \|\| gliding \|\| settling\(\)\) \{ spareSoon\(\); return; \}/, "the lobule's spare picture waits out a slide change"]]);
  // 3. The time-lapse chart calms a trace when a card draws it, once for each change of the days: calming a dozen traces over up to 1,500 days on every
  // new day held the page 200 to 500 ms a time (16 Nov 2026).
  need('src/ui/pressure-time.js', [
    [/function calmDays\(\) \{\n {4}calmVer\+\+;/, 'a new day only stamps the days as changed'],
    [/if \(c && c\.ver === calmVer\) return c;/, 'a trace is calmed once for each version of the days'],
    [/const c = calmOf\(key\);/, 'the series asks for the trace it draws'],
  ]);
  forbid('src/ui/pressure-time.js', /for \(const k of days\.length \? Object\.keys/, 'calmDays does not calm every trace on every new day');
  // 4. A deck's slide states are worked out behind the Present menu (the 3 to 8 s wait after the press was the first slide's patient): the row under the pointer or
  // focus warms its deck, the cache holds the states from the start of the work (so a press joins it, never a second sequence), and a start takes them.
  need('src/ui/menu.js', [[/for \(const ev of \['pointerenter', 'focus', 'pointerdown'\]\) row\.addEventListener\(ev, \(\) => lib\.warm\?\.\(d\.id\)/, 'a deck row warms its deck as the pointer, focus or a touch reaches it']]);
  need('src/ui/presenter-library.js', [[/testing: live\.TESTING, start, warm,/, 'the library offers warm to the menu']]);
  need('src/ui/presenter.js', [
    [/const key = d\.mine \? null : d\.id, c = lane\.begin\(key \?\? LANE_MINE\); if \(key\) cache\.set\(key, \{ states: mine, done: false \}\);/, 'the cache holds a deck\'s states from the start of the work: a start while it runs adopts the same array'],
    [/const hit = key && cache\.get\(key\);[^\n]*\n\s+if \(hit\) \{ states = hit\.states; waiters = \[\]; return; \}/, 'prepare takes the states a warm or an earlier talk made, finished or not'],
    [/if \(sl\?\.\[0\]\?\.preset\) solve\(d, sl, \[\], solvePlan\(sl\)\);/, 'only a deck whose first slide names its patient is warmed (the calc needs nothing of the viewer\'s own)'],
  ]);
}

// Camera and hand (motion recommendations, push E, items 11, 12 and 14; tests/camera-hand.test.js runs what it can and these pin the wiring a unit
// test cannot reach without the page). A pattern that no longer matches means the code it guarded changed: look before editing the rule.
{
  const text = sourceText;
  const need = (file, rules) => {
    const src = text(file);
    for (const [re, why] of rules) if (!(typeof re === 'string' ? src.includes(re) : re.test(src))) errors.push(`${file}: ${why} (${re})`);
  };
  need('src/ui/stage-fit.js', [
    [/animateVT\(to, CAM_MS_MAX, \{ scale: true \}\);\n/, 'Fit glides in the time its reach needs (camMs), not a fixed 420 ms'],
    [/animateVT\(revealTo, CAM_MS_MAX, \{ scale: true \}\)/, 'a reveal glides by its reach'],
    [/animateVT\(revealFrom, CAM_MS_MAX, \{ scale: true \}\)/, 'the unreveal glides by its reach'],
    [/const goal = live\.vtGliding \? live\.vtTarget : live\.vt;\n\s+if \(live\.vtGliding\) \{ cancelFrame\(live\.vtAnim\); driftEnd\(\); live\.vtGliding = false; \}/, "a circuit turn during a glide starts from where the view is, not from the glide's end (item 14)"],
  ]);
  need('src/ui/stage-camera.js', [[/animateVT\(\{ k, x: vx - wx \* k, y: vy - wy \* k \}, CAM_MS_MAX, \{ scale: true \}\)/, 'the zoom pill and a double click glide by their reach']]);
  need('src/ui/stage.js', [[/animateVT\(lo, CAM_MS_MAX, \{ scale: true \}\)/, "the zoom pill's last step out glides by its reach"], [/animateVT\(d, VIEW_CHANGE_S \* 1000\)/, 'the view change stays 1.3 s (kept as decided)']]);
  need('src/ui/stage-gestures.js', [
    [/animateVT\(d, CAM_MS_MAX, \{ scale: true, v0 \}\)/, 'the spring-back to the fit glides by its reach, with the hand\'s speed'],
    [/animateVT\(to, CAM_MS_MAX, \{ scale: true, v0 \}\)/, 'the spring-back inside the limits glides by its reach, with the hand\'s speed'],
    [/const v0 = hand\.take\(performance\.now\(\), handAge\);/, 'the spring-back takes the hand\'s speed as it let go'],
    [/if \(wheelGlide\.active\) \{ settleSoon\(60\); return; \}/, 'the spring-back waits for a wheel notch that is still gliding'],
    [/applyVT\(\); live\.CTM = null; handSample\(80\);/, 'a pinch and a drag give the hand tracker a sample at each step'],
    [/zoomAt\(ev\.clientX, ev\.clientY, Math\.exp\(-clamp\(dy, -50, 50\) \* 0\.01\), true\); handSample\(300\);/, 'a trackpad pinch stays direct (zoomAt at once), and is sampled'],
    [/wheelKind = isPadWheel\(ev\) \? 'pad' : 'wheel';/, 'a notch is told from a trackpad by isPadWheel (wheel-glide.js)'],
    [/stopGlide\(\); wheelGlide\.cancel\(\); stageScope\.clear\(settleT\); panFit = null;/, 'a button takes the notch glide over'],
    [/wheelGlide\.cancel\(\); hand\.begin\(\);/, 'a press takes the notch glide over'],
  ]);
  const gest = text('src/ui/stage-gestures.js');
  if (!(gest.indexOf('if (ev.ctrlKey || ev.metaKey) {') >= 0 && gest.indexOf('if (ev.ctrlKey || ev.metaKey) {') < gest.indexOf('wheelGlide.push('))) errors.push('src/ui/stage-gestures.js: the trackpad pinch (ctrlKey) is handled before the notch glide, direct');
  need('src/ui/lobule-zoom*', [
    [/focusOn\(part, \{ zoom = 2, ms = 1400, ease = 'inOut' \} = \{\}\) \{/, 'focusOn: the ms it is given is a ceiling (the presenter gives 1500)'],
    [/glideTo\(to, ms, true, atFit \? null : \{ part, zoom, to \}, ease, false, true\);/, 'focusOn times itself by reach'],
    [/if \(reach && ease !== 'in'\) ms = Math\.min\(ms, lobuleMs\(from, to, Math\.max\(1, snap\.w\)\)\);/, "the lobule's glide takes the least of the ms given and its reach's (lobuleMs), the way out to the rise keeping its own"],
    [/glideTo\(target, LOBULE_MS_MAX, false, null, 'inOut', false, true\);/, 'the lobule buttons glide by their reach'],
    [/glideTo\(F0, LOBULE_MS_MAX, false, null, 'inOut', false, true\); \}/, 'the lobule Fit glides by its reach'],
    [/const kS = kMax \* Math\.pow\(rawHi \/ kMax, 0\.3\), rS = kS \/ V\.k;/, "the lobule's zoom-in limit stretches at the stage's 0.3 power on a pinch"],
    [/zoomAround\(mx, my, \(pinch\.k \* d \/ pinch\.d\) \/ \(rawHi \|\| V\.k\), true\);/, 'a touch pinch stretches past the zoom-in limit'],
    [/zoomAround\(px, py, f, pinchy\);/, 'a wheel pinch stretches past the zoom-in limit'],
    [/if \(rawHi\) springHi\(\);/, 'the last finger up lets the stretch go'],
    [/function endStretch\(\) \{ if \(!rawK && !rawHi\) return;/, "a wheel pinch's stretch past the zoom-in limit springs back when the wheel is quiet"],
    [/zoomAround\(localX\(ev\), localY\(ev\), V\.k < kFit \* KMAX \* 0\.98 \? 2 : 1 \/ KMAX\)/, 'a double click stops hard at the limit, as the stage\'s does'],
    [/if \(wheelKind === 'wheel' && !reduce\.matches && !ev\.ctrlKey && !ev\.metaKey\) \{ wheelGlide\.push\(/, "a mouse wheel's notch glides in the lobule, a trackpad pinch stays direct"],
    [/wheelKind = ev\.ctrlKey \|\| ev\.metaKey \? 'pinch' : isPadWheel\(ev\) \? 'pad' : 'wheel';/, 'the lobule tells a notch from a trackpad by the same isPadWheel'],
  ]);
  {
    const lz = text('src/ui/lobule-zoom*');
    if (/glideTo\([^\n]*, 380\)/.test(lz)) errors.push('src/ui/lobule-zoom.js: a fixed 380 ms glide is back: time it by its reach (lobuleMs, item 12)');
    if (/animateVT\([^\n]*, (?:260|320|380|420)\)/.test(text('src/ui/stage-gestures.js') + text('src/ui/stage-fit.js') + text('src/ui/stage-camera.js'))) errors.push('src/ui/stage-*.js: a fixed 260/320/380/420 ms glide is back: time it by its reach (camMs, item 12)');
  }
  need('src/ui/stage-glide.js', [
    [/const v0 = opt\.v0 \|\| \(!drift && live\.vtGliding \? vtTrack\.take\(performance\.now\(\)\) : null\);/, "a glide takes the hand's speed (opt.v0) or the glide's it replaces"],
    [/if \(v0 && !sameView\(from, to\)\) \{/, 'a glide carries the old speed on (item 14), on the straight path'],
  ]);
  need('src/ui/stage-ride.js', [[/lerpInto\(a, b, f, FOLLOW_V\)/, 'the card-room follow zooms in log space (item 14)']]);
  need('src/ui/card-zoom.js', [
    [/const ms = reverseMs\(SHUT_MS, s\.cur\.s, s\.plan\.s\);/, 'a zoom shut part-way takes the share of the time that is left'],
    [/st\.cur = lerpTo\(m, m\.m0 >= 0 \? settleAt\(p, m\.m0\) : easeArrive\(p\)\);/, 'a glide turned back mid-way starts on the speed it carries'],
    [/export const ZOOM_MS = 520;/, 'the card zoom in stays 520 ms (kept as decided)'],
    [/export const SHUT_MS = 440;/, 'the card zoom back stays 440 ms (kept as decided)'],
  ]);
}

// Code never rides after a line comment in stepBlood (6 Nov 2026): 0eec029 left so.speed, so.still, so.dt and so.bt after the // on so.phasic's
// line, so every stream stepped with dt 0 and a reversed portal vein kept its hepatopetal chevrons under the reversed orange. The options the
// streams read are each set in code, on a line no // comes before.
{
  const src = readFileSync(join(ROOT, 'src/ui/stage-blood.js'), 'utf8');
  for (const f of ['phasic', 'speed', 'still', 'dt', 'bt']) {
    const re = new RegExp(`\\bso\\.${f} = `), lines = src.split('\n').filter((l) => re.test(l));
    if (!lines.length) errors.push(`src/ui/stage-blood.js no longer sets so.${f} in stepBlood: the streams would step without it`);
    for (const l of lines) { const cm = l.indexOf('//'); if (cm >= 0 && cm < l.search(re)) errors.push(`src/ui/stage-blood.js sets so.${f} after a // on its line, so it is a comment, not code: ${l.trim().slice(0, 100)}`); }
  }
}

// Chart heads and the catheter labels' shadow (8 Nov 2026, motion recs 16 and 17). The flow-time and event-graph heads glide by time, through
// headStep (display-state.js: 1 - exp(-dt / tau)), never a fixed fraction per frame (twice as fast at 120 Hz as at 60). A catheter label's drop
// shadow is the opacity of its ::before; a box-shadow in its transition list repainted every frame it moved.
{
  for (const f of ['flow-time', 'event-graph']) {
    const src = readFileSync(join(ROOT, `src/ui/${f}.js`), 'utf8');
    if (!/headStep\(shown, goal, dt\)/.test(src)) errors.push(`src/ui/${f}.js: the head steps by headStep(shown, goal, dt), the time between frames, not a fraction per frame`);
    if (/shown \+= \(goal - shown\)/.test(src)) errors.push(`src/ui/${f}.js: shown += (goal - shown) * k per frame is faster at 120 Hz than at 60: use headStep`);
  }
  const css = appCssText(ROOT);
  if (!/\.cath-label::before \{[^}]*box-shadow: var\(--(?:shadow-cath-label|glass-shadow)\)[^}]*transition: opacity/.test(css)) errors.push('styles/app-*.css: the catheter label\'s shadow is its ::before, faded by opacity');
  for (const l of css.split('\n')) if (/\.cath-label/.test(l) && /transition[^;}]*box-shadow/.test(l)) errors.push(`styles/app-*.css: a catheter label transition lists box-shadow (fade the ::before's opacity): ${l.trim().slice(0, 90)}`);
}

// Chrome glass (4 Nov 2026, "the top bar is not all glass"): app.css's [data-gl] / :not([data-gl]) fallback rules for the figure's chrome pills must list
// exactly the selectors of main.js CHROME; a wider list paints a pill that main.js gives no glass (the patient pill, the Colored-by key) solid.
{
  const m = readFileSync(join(ROOT, 'src/ui/main.js'), 'utf8').match(/const CHROME = \[(.+)\]\.join/);
  const css = appCssText(ROOT).split('\n').filter((l) => /^:root:root :is\(/.test(l) && l.includes('.nb-views > .vp-face'));
  const list = m && m[1].split(/',\s*'/).map((x) => x.replace(/^'|'$/g, '').trim()).join(', ');
  if (!list) errors.push('main.js CHROME list not found (chrome glass rule)');
  else if (css.length !== 2 || css.some((l) => !l.includes(`:is(${list})`))) errors.push('styles/app-*.css: the chrome [data-gl] and :not([data-gl]) rules must list exactly the selectors of main.js CHROME');
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

// Chart looks (chart-looks-in-code plan, WP0): the count of chart look rules left in styles/app-*.css, per chart, may not rise above
// scripts/chart-look-allowance.json. A chart's migration PR deletes its rules and lowers its number (--tighten); WP12 ends at 0.
{
  const aFile = join(ROOT, 'scripts/chart-look-allowance.json'), aDoc = JSON.parse(readFileSync(aFile, 'utf8'));
  const now = chartCounts(chartInventory(appCssText(ROOT)));
  for (const [chart, n] of Object.entries(now)) if (n > (aDoc.charts[chart] ?? 0)) errors.push(`styles/app-*.css has ${n} ${chart} chart look rules, over the allowance of ${aDoc.charts[chart] ?? 0} in scripts/chart-look-allowance.json: a chart's look belongs in its chart-looks table, not in app.css (node scripts/chart-looks-inventory.mjs --chart ${chart})`);
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

// A create…() part's result never binds a name the file imports (shadow, above).
{
  const bound = (p) => (p.type === 'Identifier' ? [p.name] : p.type === 'ObjectPattern' ? p.properties.flatMap((q) => bound(q.value || q.argument))
    : p.type === 'ArrayPattern' ? p.elements.filter(Boolean).flatMap(bound) : p.type === 'AssignmentPattern' ? bound(p.left) : p.type === 'RestElement' ? bound(p.argument) : []);
  const visit = (n, fn) => { if (!n || typeof n.type !== 'string') return; fn(n); for (const k in n) { if (k === 'parent') continue; const v = n[k]; if (Array.isArray(v)) for (const x of v) visit(x, fn); else if (v && typeof v.type === 'string') visit(v, fn); } };
  for (const f of files.filter((x) => x.endsWith('.js'))) {
    let ast;
    try { ast = parse(readFileSync(f, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module', loc: true }); } catch { continue; }
    const imp = new Set();
    for (const n of ast.body) if (n.type === 'ImportDeclaration') for (const sp of n.specifiers) imp.add(sp.local.name);
    if (!imp.size) continue;
    visit(ast, (n) => {
      if (n.type !== 'VariableDeclarator' || n.id.type !== 'ObjectPattern' || n.init?.type !== 'CallExpression' || !/^create/.test(n.init.callee?.name || '')) return;
      for (const k of bound(n.id)) if (imp.has(k)) errors.push(`${relative(ROOT, f)}:${n.loc.start.line} binds ${k} from ${n.init.callee.name}(), shadowing its own import of ${k}: rename one`);
    });
  }
}

// Nothing pops in or out (owner, 15 Nov 2026): under Reduce Motion a fade keeps its length (motion.js fadeMs / fadeStep), only movement is
// dropped. (1) No Reduce Motion rule in styles/ kills an opacity transition or a fade keyframe (scripts/reduced-css-scan.mjs, its movement-only
// list with reasons). (2) No file answers "at once" under Reduce Motion more often than scripts/reduced-fade-allowance.json, or less: lower it
// (node scripts/reduced-fade-scan.mjs --write). What is left in the allowance is movement, or still to move onto fadeMs.
{
  const { reducedCssProblems } = await import(pathToFileURL(join(ROOT, 'scripts/reduced-css-scan.mjs')).href);
  for (const x of reducedCssProblems(ROOT)) errors.push(`${x}: a Reduce Motion rule turns a fade into an instant swap; write transition-property: opacity (or add a movement-only piece with its reason to scripts/reduced-css-scan.mjs)`);
  const { scan } = await import(pathToFileURL(join(ROOT, 'scripts/reduced-fade-scan.mjs')).href);
  const allow = JSON.parse(readFileSync(join(ROOT, 'scripts/reduced-fade-allowance.json'), 'utf8')), now = scan(join(ROOT, 'src/ui'));
  const rel = (f) => f.slice(ROOT.length + 1).replace(/\\/g, '/');
  const seen = Object.fromEntries(Object.entries(now).map(([f, n]) => [rel(f), n]));
  for (const [f, n] of Object.entries(seen)) if (n > (allow[f] || 0)) errors.push(`${f} answers "at once" under Reduce Motion ${n} times (allowed ${allow[f] || 0}): use fadeMs / fadeStep from src/ui/motion.js, a fade is not motion`);
  for (const [f, n] of Object.entries(allow)) if ((seen[f] || 0) < n) errors.push(`${f}: ${seen[f] || 0} "at once" answers under Reduce Motion, under its allowance of ${n}: lower it (node scripts/reduced-fade-scan.mjs --write)`);
}

// (3) No file shows or hides a piece of the page in one frame (a write of .hidden or style.display) more often than
// scripts/bare-hidden-allowance.json, or less: lower it (node scripts/bare-hidden-scan.mjs --write). New code uses util.js fadeShown, fold()
// or swapFade, or says `// off-screen: <why>` on the line.
{
  const { scan } = await import(pathToFileURL(join(ROOT, 'scripts/bare-hidden-scan.mjs')).href);
  const allow = JSON.parse(readFileSync(join(ROOT, 'scripts/bare-hidden-allowance.json'), 'utf8')), now = scan(join(ROOT, 'src/ui'));
  const seen = Object.fromEntries(Object.entries(now).map(([f, n]) => [f.slice(ROOT.length + 1).replace(/\\/g, '/'), n]));
  for (const [f, n] of Object.entries(seen)) if (n > (allow[f] || 0)) errors.push(`${f} shows or hides a piece at once ${n} times (allowed ${allow[f] || 0}): use fadeShown / fold / swapFade from src/ui/util.js, or mark the line // off-screen: <why>`);
  for (const [f, n] of Object.entries(allow)) if ((seen[f] || 0) < n) errors.push(`${f}: ${seen[f] || 0} instant show/hide writes, under its allowance of ${n}: lower it (node scripts/bare-hidden-scan.mjs --write)`);
}

// (4) No waterfall instrument card (Mohammad, 15 Nov 2026: "I hate the waterfall instrument card. Don't use it"). The "causes" tool (a step
// per cause from the healthy reading to the case's) is gone: no deck sets `kind: 'causes'`, no module builds it, no stylesheet styles it.
// A slide that needs "what raises the reading" uses the pressure ladder (profile), a curve over the setting or the time-lapse chart instead.
// (The Why? popover's own contribution list is a popover, not an instrument card, and is not covered here.)
{
  const NO_WATERFALL = /kind:\s*['"]causes['"]|tool-causes|createCauses|\bcauseBars\b|\bpz-cbars\b|data-kind="causes"/;
  const hit = [...files, ...appCssFiles().map((f) => (f.startsWith('/') ? f : join(ROOT, f)))].filter((f) => NO_WATERFALL.test(readFileSync(f, 'utf8')));
  for (const f of hit) errors.push(`${relative(ROOT, f).split('\\').join('/')}: the waterfall instrument card (tool kind 'causes') is gone and must not come back; use the pressure ladder, a curve or the time-lapse chart`);
}

// Source shapes moved out of tests (8 Nov 2026, PR-02): each scripts/source-shapes/*.mjs default-exports rules of the form
//   { file, need: [pattern, why] }  the file's text (file may be an array, and 'src/ui/stage*' is the stage and its parts: their texts joined) must match the pattern (a RegExp, or a string it must contain), or
//   { file, forbid: [pattern, why] } it must not.
//   Options on either: between: [from, to] (judge one function's text), uncomment (drop // comments), uncss (drop /* */), exactly: [pattern, n, why] (a count), scan: (text) => messages (a loop).
// A rule is a test's old source assertion, kept with its one-line reason; a pattern that no longer matches means the code it guarded changed.
for (const name of readdirSync(join(ROOT, 'scripts/source-shapes')).filter((n) => n.endsWith('.mjs')).sort()) {
  const rules = (await import(pathToFileURL(join(ROOT, 'scripts/source-shapes', name)).href)).default;
  for (const r of rules) {
    let src = [].concat(r.file).flatMap((f) => (f === 'styles/app-*.css' || familyOf(f) ? [f] : f.endsWith('*') ? stageFamily() : [f])).map(sourceText).join('\n');
    // between: [from, to]  judge only the text from the first `from` to the next `to` (one function's body); uncomment: leave // comments out first.
    if (r.between) {
      const a = src.indexOf(r.between[0]), b = a < 0 ? -1 : src.indexOf(r.between[1], a + 1);
      if (b < 0) { errors.push(`${r.file}: the markers ${JSON.stringify(r.between)} are gone, so the rule below cannot look: move it with the code [source-shapes/${name}]`); continue; }
      src = src.slice(a, b);
    }
    if (r.uncomment) src = src.replace(/\/\/[^\n]*/g, '');
    if (r.uncss) src = src.replace(/\/\*[\s\S]*?\*\//g, '');
    // scan: (text) => [messages]  a rule that needs a loop over the text (every CSS rule, every line); each message is one error.
    if (r.scan) { for (const m of r.scan(src)) errors.push(`${r.file}: ${m} [source-shapes/${name}]`); continue; }
    // exactly: [pattern, n, why]  the (global) pattern matches n times, no more and no fewer.
    if (r.exactly) { const [xre, n, xwhy] = r.exactly, got = [...src.matchAll(new RegExp(xre.source, xre.flags.includes('g') ? xre.flags : xre.flags + 'g'))].length; if (got !== n) errors.push(`${r.file}: ${xwhy} (${xre} matches ${got} times, not ${n}) [source-shapes/${name}]`); continue; }
    const [re, why] = r.need || r.forbid, has = typeof re === 'string' ? src.includes(re) : re.test(src);
    if (r.need && !has) errors.push(`${r.file}: ${why} (${re}) [source-shapes/${name}]`);
    if (r.forbid && has) errors.push(`${r.file}: ${why} (${re}) [source-shapes/${name}]`);
  }
}

if (process.argv.includes('--list')) {
  console.log('switches:', [...switches.keys()].filter((n) => !KEEP.has(n)).sort().join(' '));
  console.log('imports:\n  ' + [...new Set(lazy)].join('\n  '));
}
const waiting = [...switches.keys()].filter((n) => !KEEP.has(n)).length;
if (errors.length) { console.error(errors.map((e) => 'rules-lint: ' + e).join('\n')); process.exit(1); }
console.log(`rules-lint: ok (${waiting} switches left to delete, ${new Set(lazy).size} dynamic imports, each read in ahead)`);
