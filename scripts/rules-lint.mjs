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
import { inventory as chartInventory, countsOf as chartCounts } from './chart-looks-inventory.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// (lumen, lumenscale: the lumen layer's device A/B, brief PL 10 Nov 2026: ?lumen=off draws no lumen pass and no blood, ?lumenscale=<0.25..1> sets the lumen layer's share of the vessel layer's size.)
// (rest: rest pacing on touch devices, brief H1 10 Nov 2026: ?rest=off turns the slow-down at rest off, to compare on a device.)
const KEEP = new Set(['perf', 'offgpu', 'fps', 'budget', 'inputs', 'script', 'slide', 'preset', 'home', 'back', 'presenter-view', 'v', 'lumen', 'lumenscale', 'rest']);
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

// Source shapes moved out of tests (6 Nov 2026, PR-02): app-review-fixes, blood-heads, lymph-dashes and scope-lens read src/ text, which the tests rule
// forbids. Each rule keeps its one-line reason; a pattern that no longer matches means the code it guarded changed, so look before editing the rule.
{
  const text = (f) => readFileSync(join(ROOT, f), 'utf8');
  const need = (file, rules) => {
    const src = text(file);
    for (const [re, why] of rules) if (!(typeof re === 'string' ? src.includes(re) : re.test(src))) errors.push(`${file}: ${why} (${re})`);
  };
  const forbid = (file, re, why) => { if (re.test(text(file))) errors.push(`${file}: ${why} (${re})`); };
  need('src/ui/presenter.js', [
    [/c\.classList\.contains\('pz-tiles'\) \? 0 :/, "the tiles' own scroll height is no overflow: their numbers' GPU pictures reach past a tile, and counted it zoomed the readings card down in a what-if drag (7 Nov 2026)"],
    [/el\.classList\.contains\('tiles-only'\) && !el\.querySelector\(':scope > \.pz-tool'\) && fitDone\.has\(el\) && cardsStill\(\)\) continue;/, "a tiles-only readings card keeps the fit it came in with while a what-if or compare drives its numbers (7 Nov 2026)"],
  ]);
  need('src/ui/ink-gl.js', [
    [/if \(touches\.size > 1\) return;/, 'the laser is armed by one finger'],
    [/e\.target !== window\) return;/, "the laser ignores other elements' blur"],
    [/t !== topOf \|\| t\.gl !== gl/, 'the laser rehosts on a new top'],
  ]);
  need('src/ui/lobule-zoom.js', [[/sv\.rehost\(\)/, 'the lobule rehosts the sinusoid view when the figure comes back']]);
  need('src/ui/sinusoid-view.js', [[/if \(share && !ft\) return;/, 'a shared sinusoid view is not rebuilt by the rehost']]);

  const gl = text('src/ui/veins-gl.js');
  const comp = gl.slice(gl.indexOf('    composite(look, blood = NOBLOOD, full = false, part = 0) {'));
  const compRules = [
    [/if \(headP && blood\.chev && !bleeding && !fused && axisN > 0\) \{/, 'heads as quads never on a one-pass (zoom) frame: it writes no layer for them to read'],
    [/const stillUse = still && !\(quads && \(part \|\| dirt \|\| pool \|\| \(fl\?\.ripple && nFluid\) \|\| cathRect\)\);/, 'still lumens kept only when that is exact'],
  ];
  for (const [re, why] of compRules) if (!re.test(comp)) errors.push(`src/ui/veins-gl.js composite(): ${why} (${re})`);
  if (!(comp.indexOf('drawHeads(m, layer, glow, warm, useStack, stillUse);') > comp.indexOf('UC.i1(U.bloodOnly, 1);'))) errors.push('src/ui/veins-gl.js composite(): the heads are drawn after the blood-only picture');
  if (!(comp.indexOf('if (quads) drawHeads(m, false, glow, warm, useStack, false);') < comp.indexOf("gpuProbe.time(gl, 'catheter', cathT);"))) errors.push('src/ui/veins-gl.js composite(): the heads are drawn again, in a catheter box, before the catheter timing');
  // The Tube vessel renderer (10 Nov 2026, docs/tube-renderer.md): no hybrid, and the draw buffers set once.
  need('src/ui/veins-gl.js', [
    ['if ((pMode === 0 || pMode >= 3) && meshUse() && tubePass(pM, pLook)) return;', 'the Tube pass is the only geometry pass (no Mesh: when it is not ready, meshUse() is false and the classic pass draws)'],
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
    if (!meshUseBody || /tube2|tubeLean|stage2/i.test(meshUseBody)) errors.push('src/ui/veins-gl.js meshUse: names no stage 2 program (a Tube frame that stage 1 can draw is never drawn by the Mesh or the classic because a stage 2 program failed)');
    const finishTubeBody = slice(vg, 'const finishTube = () => {', '\n  };');
    if (!finishTubeBody || /tube2/i.test(finishTubeBody)) errors.push('src/ui/veins-gl.js finishTube: leaves stage 2 to finishTube2 (a failed stage 2 program must not take stage 1 down with it)');
    const draw2Body = slice(tp, 'function draw2(', '// A pass and its prepass for tier t');
    if (!/webCall\(/.test(draw2Body) || /patchCall\(/.test(draw2Body)) errors.push('src/ui/tube-pass.js draw2: stage 2 draws the webs, never the patches (no ?tubejoin=patch since 11 Nov 2026)');
    if ((tp.match(/patchCall\(/g) || []).length !== 2) errors.push('src/ui/tube-pass.js: patchCall is called from tubeDraw (stage 1 and the glows) only, and defined once');
    if (/tubeStrip|tubePatch/.test(slice(vg, 'const finishTube2 = () => {', '\n'))) errors.push('src/ui/veins-gl.js finishTube2: finishes the four stage 2 programs only');
  }
  // The Tube's glow program (brief PD part 4, 10 Nov 2026): optional on its own (a failure leaves the glow pairs on the strip program and takes no stage down); only the glow passes use it.
  {
    const vg = text('src/ui/veins-gl.js'), tp = text('src/ui/tube-pass.js');
    const slice = (t, from, to) => t.slice(t.indexOf(from), t.indexOf(to, t.indexOf(from)));
    const meshUseBody = slice(vg, 'const meshUse = () => {', '\n  };');
    if (!meshUseBody || /tubeGlow/i.test(meshUseBody)) errors.push('src/ui/veins-gl.js meshUse: names no glow program (a Tube frame is never drawn by the Mesh or the classic because the glow program failed)');
    if (/tubeStrip|tubePatch|tubeLean|tube2|tube3/.test(slice(vg, 'const finishGlow = () => {', '\n'))) errors.push('src/ui/veins-gl.js finishGlow: finishes the glow program only');
    if (!/const P = pass === MP\.GLOW \|\| pass === MP\.UP \? glowP : E\.tubeS;/.test(tp) || !/glowP = E\.tubeGlow \|\| E\.tubeS;/.test(tp)) errors.push('src/ui/tube-pass.js tubeDraw: the glow passes (MP.GLOW, MP.UP) draw with E.tubeGlow, else E.tubeS; no other pass uses the glow program');
    if ((tp.match(/glowP/g) || []).length !== 6) errors.push('src/ui/tube-pass.js: glowP is set once per frame and read by tubeDraw and the program set-up only');
  }
  // The Tube's cull (brief PD part 3, 10 Nov 2026): rows wholly outside the vessel layer are left out of the stage 2 buckets (the buckets are built from the cull's mask in place of the rows with points),
  // never while a stretch of the change between the views moves the points (joinBase >= 0), and the pad it grows the layer by is the widest pass's reach (glow and shadow), not a guess of one pass.
  {
    const vg = text('src/ui/veins-gl.js'), s2 = text('src/ui/tube-stage2.js'), tp = text('src/ui/tube-pass.js');
    if (!/tubeBuckets\(tubeNow, C \? C\.mask : B\.pts\.on, nTubes, st\.R\.rows, D\.tb\);/.test(s2)) errors.push('src/ui/tube-stage2.js frame: the rows by tier are bucketed from the cull\'s mask (C ? C.mask : B.pts.on)');
    if (!/const C = view && view\.ok && joinBase < 0 \? cullUpdate\(B, nTubes, view\) : null/.test(s2)) errors.push('src/ui/tube-stage2.js frame: no row is culled during the change between the views (joinBase >= 0), nor without a usable view');
    if (!/websByTier\(st\.W\.data, st\.W\.count, tubeNow, D\.wb, B\.pts\.on, !B\.noEnds\)/.test(s2)) errors.push('src/ui/tube-stage2.js frame: the joins\' webs are not culled (websByTier keeps B.pts.on)');
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
    if (!/if \(!B\.patchOk && patchesWanted\(\)\) deriveJoinPatches\(B\);/.test(meshGeoBody) || !/if \(patchesWanted\(\) && !B\.patchOk\) deriveJoinPatches\(B\);/.test(slice(vg, '  function prepareSet(S) {', '  // The sets made under another mode'))) errors.push('src/ui/veins-gl.js: the joins\' patches are built only where patchesWanted() (not for the Tube\'s web joins)');
    if (!/if \(webJoins\(\)\) stage2Prepare\(B, tubeNow, nTubes, S\.morph\.joinBase\);/.test(vg) || (vg.match(/stage2Prepare\(/g) || []).length !== 1) errors.push('src/ui/veins-gl.js: the Tube\'s stage 2 record of a morph set is made by prepareSet, for web joins only (stage2Prepare is called there alone)');
    if (!/if \(!st \|\| st\.gen !== B\.gen \|\| !st\.R\.rows\) \{ st = stage2Prepare\(/.test(ts)) errors.push('src/ui/tube-stage2.js frame: bins only through stage2Prepare, and only for a bundle with no current record');
  }
  // The Tube's stage 3 (brief S3-D, 10 Nov 2026): the lumen layer. In stage 3 the compositor program is a Tube build and the lumen pass runs before it on every blood frame;
  // in stages 1 and 2 nothing of stage 3 runs (the old builds, the second flow target and the half-size streaks are as they were); a failed stage 3 program leaves stage 2.
  {
    const vg = text('src/ui/veins-gl.js'), tp = text('src/ui/tube-pass.js');
    const slice = (t, from, to) => t.slice(t.indexOf(from), t.indexOf(to, t.indexOf(from)));
    const meshUseBody = slice(vg, 'const meshUse = () => {', '\n  };');
    if (!meshUseBody || /tube3|tubeLumen|stage3/i.test(meshUseBody)) errors.push('src/ui/veins-gl.js meshUse: names no stage 3 program (a Tube frame that stage 2 can draw is never drawn by the Mesh or the classic because a stage 3 program failed)');
    const finishTubeBody = slice(vg, 'const finishTube = () => {', '\n  };');
    if (!finishTubeBody || /tube3/i.test(finishTubeBody)) errors.push('src/ui/veins-gl.js finishTube: leaves stage 3 to finishTube3');
    if (/tubeStrip|tubePatch|tubeLean|tube2/.test(slice(vg, 'const finishTube3 = () => {', '\n'))) errors.push('src/ui/veins-gl.js finishTube3: finishes the six stage 3 programs only');
    if (!/const stage3 = !!tube3 && meshUse\(\) && tubePass\.stage\(\) === 3;/.test(vg)) errors.push('src/ui/veins-gl.js composite: stage 3 is the Tube chosen and drawing, tube3 ready and the pass at stage 3 (const stage3 = ...)');
    if (!/const halfOn = !stage3 && /.test(vg)) errors.push('src/ui/veins-gl.js composite: the half-size streak pass is not run in stage 3 (const halfOn = !stage3 && ...)');
    const prgLine = (vg.match(/\n[^\n]*const prg = [^\n]*/) || [''])[0];
    if (!/stage3 \? tube3\.compCell : compCell/.test(prgLine) || !/stage3 \? tube3\.plainCell : plainCell/.test(prgLine) || !/const cPlain = stage3 \? tube3\.plain : plain, cFull = stage3 \? tube3\.comp : comp;/.test(vg)) errors.push('src/ui/veins-gl.js composite: in stage 3 the compositor program is a Tube build (tube3.comp, compCell, plain, plainCell), and the old builds in stages 1 and 2');
    const nUse = (vg.match(/tube3\.(comp|compCell|plain|plainCell)\b/g) || []).length, nGuard = (vg.match(/stage3 \? tube3\.(comp|compCell|plain|plainCell)\b/g) || []).length;
    if (nUse !== nGuard) errors.push('src/ui/veins-gl.js: a Tube compositor build (tube3.comp, compCell, plain, plainCell) is named only after stage3 ?, so stages 1 and 2 never use one');
    const lumIf = vg.indexOf("if (stage3 && (blood.on || (dyeAny && blood.dye !== false) || blood.origin)) {\n        fencePart('before lumen pass');   // (?perf: what was queued ahead of the lumen pass is a step of its own, so the next one is the pass alone)\n        gpuProbe.time(gl, 'lumen layer', lumenFrame, m, look, blood);");
    const firstBind = vg.indexOf('compBind(U, layer, glow, warm, useStack);', lumIf);
    const halfBlock = vg.indexOf('      if (halfOn) {\n        // (The streaks', lumIf);
    if (lumIf < 0 || firstBind < 0 || halfBlock < 0 || lumIf > halfBlock || lumIf > firstBind) errors.push('src/ui/veins-gl.js composite: in stage 3 the lumen pass runs on every blood frame (blood, dye or origin), before the compositor binds its textures and draws (if (stage3 && (blood.on || ...)) { gpuProbe.time(gl, \'lumen layer\', lumenFrame, ...))');
    if ((vg.match(/function lumenFrame\(/g) || []).length !== 1 || (vg.match(/lumenFrame, m, look/g) || []).length !== 1) errors.push('src/ui/veins-gl.js: lumenFrame is defined once and called once, in the composite, in stage 3');
    if (!/if \(pMode === 5\) \{ tubePass\.lumen\(pM, pLook, pRedo\); return; \}/.test(vg)) errors.push('src/ui/veins-gl.js pieceFn: the lumen layer\'s piece is the Tube pass\'s lumen pass alone (pMode 5)');
    if (!/if \(stageNow\(\)\.stage !== 3\) return false;/.test(slice(tp, 'function tubeLumenPass(', 'const D = FR.D'))) errors.push('src/ui/tube-pass.js tubeLumenPass: draws nothing outside stage 3');
    if (!/AT = choice\.stage === 3 \? A3 : ATTACH;/.test(tp)) errors.push('src/ui/tube-pass.js tubePass: the layer pass writes no second flow target in stage 3 only (AT = choice.stage === 3 ? A3 : ATTACH)');
    if (/P3\.|E\.tube3\b(?!Failed)/.test(slice(tp, 'function tubePass(', '// ---- Stage 3'))) errors.push('src/ui/tube-pass.js tubePass: the layer pass names no lumen program (the lumen pass is tubeLumenPass)');
  }
  need('src/ui/veins-gl.js', [
    [/heads: who === 'stage' \?/, 'the lobule is given no axes: its renderer keeps the composite heads'],
    [/bool isLy = f1\.x < -0\.5;/, 'a lymph row is marked in the shader'],
    [/if \(blood == 1 && blendA\.x > 0\.0 && f1\.z > 0\.0 && !isLy\) \{/, 'blood streaks skip a lymph row'],
    [/if \(blood == 1 && isLy && f1\.z > 0\.0\) \{\n\s*float lc, lk;\n\s*lymphAt\(s1, y1, f0, len1, R1, lc, lk\);/, 'a lymph row draws its dashes'],
  ]);
  // (lymphAt moved to comp-glsl.js with the rest of the lumen text, 10 Nov 2026: the rule moved with it, as written.)
  need('src/ui/comp-glsl.js', [[/chev == 1 && chevQuad == 0 && f1\.z > 0\.0 && !isLy/, 'arrowheads skip a lymph row (the chevrons the compositor draws itself: moved to comp-glsl.js with the Tube build, 10 Nov 2026)']]);
  need('src/ui/comp-glsl.js', [[/void lymphAt\(float s, float y, vec4 f0, float len, float R, out float cover, out float core\)/, 'the composite has a lymph dash function']]);
  const cg = text('src/ui/comp-glsl.js');
  const lymphFn = cg.slice(cg.indexOf('void lymphAt('), cg.indexOf('// Moving blood in one lumen at arc length s'));
  if (!/fract\(\(s - f0\.x\) \/ pitch\)/.test(lymphFn)) errors.push('src/ui/comp-glsl.js lymphAt: the dash phase runs along the channel in world units, so a pan or pinch cannot slide it');
  if (!/ya = y \* R/.test(lymphFn)) errors.push('src/ui/comp-glsl.js lymphAt: across the channel in world units');
  if (/gl_FragCoord|\bFC\b/.test(lymphFn)) errors.push('src/ui/comp-glsl.js lymphAt: no screen-space coordinate (the dashes would slide off their vessel)');
  need('src/ui/lobule-zoom.js', [
    [/const lyOn = lymphOn && !m\.hide;/, 'lymph rows only with the Lymph layer on'],
    [/blood\.on = \(bloodOn \|\| lyOn\) && flowA > 0\.002;/, 'the composite is on for lymph'],
    [/if \(t\.kind !== 'ly' && t\.kind !== 'lt'\) continue;\n\s*const mo = motionOf\(t\), o = t\.id \* FLOW_TEXELS \* 4;/, 'one flow row per lymph channel'],
    [/\(t\.kind === 'ly' \? -1 : 1\) \* dt \* lyVw/, 'out along the space of Disse, in along the terminal lymphatics'],
    [/flowData\[o \+ 6\] = 1;/, 'the lymph row is marked'],
  ]);
  forbid('src/ui/lobule-zoom.js', /lyDrops|fxGLErase|lyRaw|lyNd/, 'nothing is built or drawn per frame for the lymph overlay any more');

  const sl = text('src/ui/scope-lens.js');
  const open = sl.slice(sl.indexOf('  function open()'), sl.indexOf('  function feed()'));
  if (!/drop\(\);[\s\S]*inst = createEndoscopy\(/.test(open)) errors.push("src/ui/scope-lens.js open(): the last opening's scope lets go and a new one is made (a kept scope showed a stale varix)");
  if (!/if \(fp\) inst\.pin\?\.\(fp\);/.test(open)) errors.push("src/ui/scope-lens.js open(): the scope is pinned to the slide's own numbers, as the tiles and the Scope card");
  need('src/ui/scope-lens.js', [
    [/function feed\(\) \{[\s\S]*const f = store\.get\(\)\.frame;[\s\S]*inst\.update\(f\)/, 'fed the frame the figure has, once it has its size'],
    [/const seen = \(f\) => !gastricUp\(store\.get\(\)\.params \|\| NO_P\) && \(grows \|\| varicesPresent\(f\)\);/, 'no ring with a tamponade balloon in'],
    [/stage\.scopeRingInto\?\.\(rg\)[\s\S]*follow\(\);/, 'the lens follows its ring on every step of the camera, never hidden by it'],
  ]);
  const pres = text('src/ui/presenter.js');
  if ((pres.match(/ui\.tools\.pin\((\w+(?:\.fp)?)\); ui\.scope\?\.pin\(\1\);/g) || []).length !== 3) errors.push('src/ui/presenter.js: the scope is pinned wherever the Scope card is (3 places)');
  if (!/ink\?\.clear\(\);[^\n]*\n\s+ui\?\.scope\?\.close\(\);/.test(pres)) errors.push('src/ui/presenter.js: the scope shuts as the slide turns');

  // Presenter waits and hand-overs (8 Nov 2026, animation review push B, items 2 to 4): source shapes moved out of tests (PR-02), each with its reason.
  need('src/ui/presenter.js', [
    [/const \{ waitCut, until \} = createWaits\(\{ frame: nextFrame \}\);/, 'until is polled by frame, and waitCut ends a wait at a newer press (wait-cut.js), not a 40 ms timer or a bare setTimeout'],
    [/const viewSettled = \(cut, stage\) => waitCut\(VIEW_CHANGE_MS \+ 400, \(\) => cut\(\) \|\| !stage\.viewChanging\?\.\(\)\);/, "a step after a switch of view waits for the change to land (stage.viewChanging), with VIEW_CHANGE_S's margin as the longest"],
    [/stage\.lobuleFocus\(part, \{ zoom, ms \}\)\) await waitCut\(ms \+ 300, \(\) => cut\(\) \|\| !stage\.lobuleGlide\?\.\(\)\);/, "the wait after a lobule focus is the lobule glide's landing (the focus times itself by reach), ms only its ceiling"],
    [/store\.set\(\{ sinusoid: true \}\); if \(ms\) await waitCut\(1250 \+ 400, \(\) => cut\(\) \|\| !stage\.sinBusy\(\)\)/, 'into the sinusoid: until its zoom has landed'],
    [/store\.set\(\{ sinusoid: false \}\); if \(ms\) await waitCut\(1000 \+ 400, \(\) => cut\(\) \|\| !stage\.sinBusy\(\)\)/, 'out of the sinusoid: until its zoom has landed'],
    [/const switching = store\.get\(\)\.view !== v;\s*if \(switching\) store\.set\(\{ view: v \}\);/, "a slide's switch of view sets off and its framing is asked of the running change at once (camera travels once)"],
    [/\{ store\.set\(\{ view: 'anatomic' \}\); await viewSettled\(cut, stage\); if \(cut\(\)\) return; \}/, 'the dive after a switch to Anatomy waits for the change to land, not 700 ms'],
    [/if \(threw\) \{ thrownNow = true; return 0; \}/, 'every card that leaves is thrown: wordsOut asks for no fixed floor, throwsOut() ends when they are out of sight (about 170 ms, not 260)'],
    [/if \(outMs\) await waitCut\(Math\.max\(0, outMs - \(performance\.now\(\) - outAt\)\), cut\);\s*\n\s*if \(throwDir\) await throwsOut\(\);/, 'the old cards are waited for by their own end of sight'],
    [/if \(!slidePrep\.ready\(want\)\) \{ outNow\(\); prepHold\(want, goOn\); \} else goOn\(\);/, "the cards that show are thrown on the press, before the wait for the slide's preparation"],
  ]);
  forbid('src/ui/presenter.js', /\bwait\(700\)|async function until\(/, 'no 700 ms wait left from the 0.6 s change, and no 40 ms timer poll');
  {
    const pz = text('src/ui/presenter.js'), cam = pz.slice(pz.indexOf('  async function camera('), pz.indexOf('  // (left: only the entrances with more than this many ms still to run count'));
    if (/\bwait\(/.test(cam)) errors.push('src/ui/presenter.js camera(): a wait here is waitCut or until, so a newer press cuts it');
    const at = cam.indexOf('const switching = store.get().view !== v;');
    if (!(at > 0 && cam.indexOf('frameTo(cam, s, gl);', at) > at && cam.indexOf('viewSettled(cut, stage)', at) > cam.indexOf('frameTo(cam, s, gl);', at))) errors.push('src/ui/presenter.js camera(): the framing is asked of the change before any wait for it to land');
  }
  {
    // M10 step 2 (8 Nov 2026): a bare `await wait(` is a wait Next cannot cut. The ones left, per file; the number only goes down.
    const bare = { 'src/ui/presenter.js': 3 /* boot cover settle loop; putHealthy's two closing fade waits */, 'src/ui/stage.js': 2 /* lobule fit on open */, 'src/ui/tool-hvpg.js': 2 /* the learner-run sweep, not a slide change */ };
    for (const [f, n] of Object.entries(bare)) {
      const c = (text(f).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').match(/await wait\(/g) || []).length;
      if (c !== n) errors.push(`${f}: ${c} bare await wait( (allowance ${n}): use waitCut(ms, cut), or lower the allowance in scripts/rules-lint.mjs when one goes`);
    }
    const pz = text('src/ui/presenter.js'), cth = pz.slice(pz.indexOf('  async function cathTo('), pz.indexOf('  // ── A time-lapse on the live model'));
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
    [/viewChanging: \(\) => !!viewXf \|\| morph !== morphTarget,/, 'the stage says when the change between the views is still under way'],
    [/glideLeft: \(\) => \(vtGliding \|\| viewXf \?/, "glideLeft counts the change between the views, camera moving or not"],
  ]);
}

// Camera and hand (motion recommendations, push E, items 11, 12 and 14; tests/camera-hand.test.js runs what it can and these pin the wiring a unit
// test cannot reach without the page). A pattern that no longer matches means the code it guarded changed: look before editing the rule.
{
  const text = (f) => readFileSync(join(ROOT, f), 'utf8');
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
  need('src/ui/lobule-zoom.js', [
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
    const lz = text('src/ui/lobule-zoom.js');
    if (/glideTo\([^\n]*, 380\)/.test(lz)) errors.push('src/ui/lobule-zoom.js: a fixed 380 ms glide is back: time it by its reach (lobuleMs, item 12)');
    if (/animateVT\([^\n]*, (?:260|320|380|420)\)/.test(text('src/ui/stage-gestures.js') + text('src/ui/stage-fit.js') + text('src/ui/stage-camera.js'))) errors.push('src/ui/stage-*.js: a fixed 260/320/380/420 ms glide is back: time it by its reach (camMs, item 12)');
  }
  need('src/ui/stage-glide.js', [
    [/const v0 = opt\.v0 \|\| \(!drift && live\.vtGliding \? vtTrack\.take\(performance\.now\(\)\) : null\);/, "a glide takes the hand's speed (opt.v0) or the glide's it replaces"],
    [/if \(v0 && \(!live\.arcRun \|\| newArc\) && !sameView\(from, to\)\) \{/, 'a fresh arc carries the old speed on, as a plain glide does (item 14)'],
    [/t0 = prev\.t0; ms = prev\.ms;\n\s+live\.arcRun = \{ from: prev\.from, to, t0, ms, at \};/, "a refit's blend of a running arc keeps its pace and end time"],
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
  const css = readFileSync(join(ROOT, 'styles/app.css'), 'utf8');
  if (!/\.cath-label::before \{[^}]*box-shadow: var\(--shadow-cath-label\)[^}]*transition: opacity/.test(css)) errors.push('styles/app.css: the catheter label\'s shadow is its ::before, faded by opacity');
  for (const l of css.split('\n')) if (/\.cath-label/.test(l) && /transition[^;}]*box-shadow/.test(l)) errors.push(`styles/app.css: a catheter label transition lists box-shadow (fade the ::before's opacity): ${l.trim().slice(0, 90)}`);
}

// Chrome glass (4 Nov 2026, "the top bar is not all glass"): app.css's [data-gl] / :not([data-gl]) fallback rules for the figure's chrome pills must list
// exactly the selectors of main.js CHROME; a wider list paints a pill that main.js gives no glass (the patient pill, the Colored-by key) solid.
{
  const m = readFileSync(join(ROOT, 'src/ui/main.js'), 'utf8').match(/const CHROME = \[(.+)\]\.join/);
  const css = readFileSync(join(ROOT, 'styles/app.css'), 'utf8').split('\n').filter((l) => /^:root:root :is\(/.test(l) && l.includes('.nb-views > .vp-face'));
  const list = m && m[1].split(/',\s*'/).map((x) => x.replace(/^'|'$/g, '').trim()).join(', ');
  if (!list) errors.push('main.js CHROME list not found (chrome glass rule)');
  else if (css.length !== 2 || css.some((l) => !l.includes(`:is(${list})`))) errors.push('styles/app.css: the chrome [data-gl] and :not([data-gl]) rules must list exactly the selectors of main.js CHROME');
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

// Source shapes moved out of tests (8 Nov 2026, PR-02): each scripts/source-shapes/*.mjs default-exports rules of the form
//   { file, need: [pattern, why] }  the file's text (file may be an array, and 'src/ui/stage*' is the stage and its parts: their texts joined) must match the pattern (a RegExp, or a string it must contain), or
//   { file, forbid: [pattern, why] } it must not.
// A rule is a test's old source assertion, kept with its one-line reason; a pattern that no longer matches means the code it guarded changed.
for (const name of readdirSync(join(ROOT, 'scripts/source-shapes')).filter((n) => n.endsWith('.mjs')).sort()) {
  const rules = (await import(pathToFileURL(join(ROOT, 'scripts/source-shapes', name)).href)).default;
  for (const r of rules) {
    const src = [].concat(r.file).flatMap((f) => (f.endsWith('*') ? stageFamily() : [f])).map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n'), [re, why] = r.need || r.forbid, has = typeof re === 'string' ? src.includes(re) : re.test(src);
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
