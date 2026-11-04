import { stageSource } from './stage-src.js';
// Round 2 review's same-picture performance items (MOTION_HEAT_REVIEW_ROUND2 §4): less work, nothing drawn differently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
const { putText, afterExit } = await import('../src/ui/util.js');

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('P5: the Over time trace is drawn before its hero text is written', () => {
  assert.match(read('src/ui/pressure-time.js'), /function redraw\(\) \{ if \(!frame\) return; if \(!\(ticking && live\(\)\)\) draw\(\); updateHero\(\); \}/);
});

test('P7: live labels, the clock and the stage readouts rewrite their text node in place', () => {
  const stage = stageSource(), tl = read('src/ui/timeline.js');
  assert.match(stage, /putText\(sp, r\.t\);/);
  assert.match(stage, /if \(v != null\) putText\(b, v\);/);
  assert.match(tl, /putText\(timeLong, t\); putText\(timeShort,/);
});

// (Rest passes run between frames, after a message task and under the shared preparation budget: how soon is the machine's, so a test waits for
// the effect itself, up to a second, never a fixed few milliseconds. What is asserted is unchanged.)
const until = async (ok, ms = 1000) => { const t0 = Date.now(); while (!ok() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 2)); };

test('putText keeps the text node and changes only its data; an element without one gets its text set (between frames)', async () => {
  const node = { nodeType: 3, nextSibling: null, data: '12.0' };
  const el = { firstChild: node, set textContent(v) { throw new Error('rebuilt'); }, get textContent() { return node.data; } };
  putText(el, '12.4');
  assert.equal(node.data, '12.0', 'not written in the frame that asked');
  await until(() => node.data === '12.4');   // (written in a rest pass between frames)
  assert.equal(node.data, '12.4');
  putText(el, '12.4');
  const empty = { firstChild: null, textContent: '' };
  putText(empty, '7');
  await until(() => empty.textContent === '7');
  assert.equal(empty.textContent, '7');
});

test('P6: the radius sync compares a copy element by element, with no joined key, spread max or some() per frame', () => {
  const sync = stageSource().replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(sync, /R\.join\(','\)/);
  assert.doesNotMatch(sync, /Math\.max\(\.\.\.R\)/);
  assert.doesNotMatch(sync, /tubeData\.some\(/);
  // (Since 2 Nov 2026 glR is that kept copy, its change told by glRv: no new array per change, sendRadii allocation-free.)
  assert.match(sync, /if \(sent && sent\.length === R\.length\) sent\.set\(R\); else o\.glRSent = Float64Array\.from\(R\);\s*o\.glR = o\.glRSent; o\.glMaxR = mx; o\.glRv = \(o\.glRv \|\| 0\) \+ 1;/);
});

test('P8: stepBlood keeps per-frame facts per model frame, syncEnds compares in place', () => {
  const stage = stageSource().replace(/^\s*\/\/.*$/gm, ''), gl = read('src/ui/veins-gl.js');
  assert.match(stage, /if \(perF !== F \|\| perH !== H\) \{/);
  assert.match(stage, /advanceStreamAt\(streams\[k\], velQf, velQ, k, so\)/);
  assert.match(stage, /KEY_K\[k\] === 1 \|\| \(KEY_K\[k\] === 2 && keyChevron\(EDGES\[k\], laneOpen\)\)/);
  assert.doesNotMatch(stage, /list\.map\(\(x\) => x\.e\.id\)\.join/);
  assert.match(gl, /UC\.fv3\(U\.originCol, originColOf\(/);
});

test('round 2 pops: the legend key names only what it shows (NP8); the Over time axis glides (τ 0.15 s) and a paused chart draws on until it lands', () => {
  const main = read('src/ui/main.js'), pt = read('src/ui/pressure-time.js');
  assert.match(main, /const legendSame = \(m, ref\) => m === legendM && \(!\(m === 'heat' \|\| m === 'delta'\) \|\| ref === legendRef\);/);
  assert.match(main, /same = legendSame\(m, ref\);/);
  assert.match(pt, /const k = -Math\.expm1\(-Math\.min\(0\.1, \(now - ysAt\[key\]\) \/ 1000\) \/ 0\.15\)/);
  assert.match(pt, /if \(gliding && !glideReq && !\(ticking && live\(\)\)\) \{ glideReq = true; nextFrame\(/);
});

test('NP11: afterExit hides once the exit animations end, never for an element opened again, and a later exit has its own wait', async () => {
  let resolve;
  const finished = new Promise((r) => { resolve = r; });
  const cls = new Set(['leaving']);
  const el = { classList: { contains: (c) => cls.has(c) }, getAnimations: () => [{ finished }] };
  let hidden = 0;
  afterExit(el, 'leaving', () => hidden++, 5000);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(hidden, 0, 'waits for the fade');
  resolve();
  await until(() => hidden === 1);
  assert.equal(hidden, 1);
  // Opened again before its fade ended: the leaving class is gone, nothing hides.
  let r2; const f2 = new Promise((r) => { r2 = r; });
  el.getAnimations = () => [{ finished: f2 }];
  const t = afterExit(el, 'leaving', () => hidden++, 5000);
  cls.delete('leaving'); clearTimeout(t); r2();
  await new Promise((r) => setTimeout(r, 60));   // (long enough for its rest pass to have run on an idle machine: nothing may hide)
  assert.equal(hidden, 1);
  // No animation at all: it hides at once (next task).
  cls.add('leaving'); el.getAnimations = () => [];
  afterExit(el, 'leaving', () => hidden++, 5000);
  await until(() => hidden === 2);
  assert.equal(hidden, 2);
});

test('NP9, NP11, NP12: the Compare badge stands under the desktop top bar; closing pieces wait for their fade; Rotate folds in the zoom pill', () => {
  const css = read('styles/app.css'), main = read('src/ui/main.js'), card = read('src/ui/card.js'), pal = read('src/ui/palette.js');
  assert.match(css, /@media \(min-width: 1024px\) \{ \.cmp-badge \{ top: calc\(var\(--top-safe, 0px\) \+ 6px \+ var\(--cmp-h, 0px\)\); \} \}/);
  assert.match(card, /closeTimer = afterExit\(el, 'ac-leaving',/);
  assert.match(main, /hintT = afterExit\(el, 'leaving',/);
  assert.match(main, /badge\._gone \|\|= \(\) => badge\.remove\(\);/);
  assert.match(main, /afterExit\(badge, 'leaving', badge\._gone\)/);
  assert.match(pal, /leaveT = afterExit\(back, 'leaving',/);
  assert.match(css, /\.zoom-pill \.stage-rotate\.ib \{ width: 0; height: 0; margin: -1px;/);
  assert.match(css, /\.cmap \.zoom-pill \.stage-rotate\.ib \{ width: 36px; height: 36px; margin: 0; opacity: 1;/);
  assert.doesNotMatch(css, /#zoomPill #rotateCircuit, #dock/);
});

test('RF4 and NP3: the lens key and its name are watched by the top bar glide; Add shunt targets glow and stand out on the GPU figure', () => {
  const tb = read('src/ui/topbar-motion.js'), stage = stageSource();
  assert.match(tb, /for \(const id of \['scenarioName', 'legend', 'colorModeLabel'\]\)/);
  assert.match(stage, /const GLOW_RANK = \[[^\]]*'shunt', 'key'\];/);
  assert.match(stage, /setGlowSrc\('shunt', \[\.\.\.shunt\.targets\.keys\(\)\]\.map\(\(id\) => \(\{ id, col: 'var\(--accent\)'/);
  assert.match(stage, /if \(shunt\) \{\n\s+out = vhOut; out\.clear\(\);\n\s+for \(const id of vh\.sel\) if \(E\[id\]\?\.vis\) out\.add\(id\);\n\s+if \(E\[shunt\.src\]\?\.vis\) out\.add\(shunt\.src\);\n\s+for \(const id of shunt\.targets\.keys\(\)\) if \(E\[id\]\?\.vis\) out\.add\(id\);/);
  assert.match(stage, /wrap\.classList\.remove\('shunting'\);\n\s*setGlowSrc\('shunt', \[\]\);/);
});

test('B7: vessel colour bins hold until the value is 0.4 mmHg from the bin shown (no flicker with the breath)', () => {
  const stage = stageSource();
  const def = stage.slice(stage.indexOf('  const qHold = '), stage.indexOf('  };', stage.indexOf('  const qHold = ')) + 4);
  assert.match(def, /if \(!\(Math\.abs\(v - was\) < 0\.4\)\) a\[i\] = qP\(v\);/);
  // The logic itself, on a value breathing across the 12.25 edge between the 12.0 and 12.5 bins.
  const qP = (v) => Math.round(v * 2) / 2, EDGES = [{}];
  const qHold = new Function('qP', 'EDGES', `const colourBins = new Map();\n${def}\nreturn qHold;`)(qP, EDGES);
  const shown = [12.2, 12.3, 12.2, 12.3, 12.35, 12.2].map((v) => qHold('pressure', 0, 0, v));
  assert.deepEqual(shown, [12, 12, 12, 12, 12, 12]);
  assert.equal(qHold('pressure', 0, 0, 12.45), 12.5);   // 0.45 from the bin shown: it moves on
  assert.equal(qHold('pressure', 0, 0, 12.2), 12.5);    // and holds there in turn
});

test('B8: label keep-out boxes are taken after the glide, and cut the arrowheads with a pixel of antialiasing', () => {
  const stage = stageSource(), gl = read('src/ui/veins-gl.js');
  assert.ok(stage.indexOf('    labelGlide(out);\n') < stage.indexOf('    noChevBoxes = out.filter('));
  assert.match(gl, /c \*= smoothstep\(-pxW, pxW, length\(max\(q, 0\.0\)\) \+ min\(max\(q\.x, q\.y\), 0\.0\)\);/);
  assert.doesNotMatch(gl, /bool hole/);
});

test('B11: bleed jets and the ascites ripple run on clocks that stand still while paused; the dye front reads the caliber between samples', () => {
  const stage = stageSource(), gl = read('src/ui/veins-gl.js');
  assert.match(stage, /return fadeBleedShapes\(bleedShapes\(sprayLast\.bleed, sprayLast\.rate, reduceMotion\.matches \? 0 : bloodClock, SITES, sprayLast\.hr\), sprayA\);/);   // (fading in and out: deck-review-bugs)
  assert.match(stage, /if \(run\) fluidPh = \(fluidPh \+ dt \/ 1\.1\) % \(20 \* Math\.PI\);/);
  assert.doesNotMatch(stage.replace(/^\s*\/\/.*$/gm, ''), /performance\.now\(\) \/ 1100/);
  const dye = gl.slice(gl.indexOf('float dyeAt('), gl.indexOf('void main()', gl.indexOf('float dyeAt(')));
  assert.match(dye, /float R = radAt\(id, s, len\);/);
});
