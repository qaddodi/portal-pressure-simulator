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
const { putText } = await import('../src/ui/util.js');

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('P5: the Over time trace is drawn before its hero text is written', () => {
  assert.match(read('src/ui/pressure-time.js'), /function redraw\(\) \{ if \(!frame\) return; if \(!\(ticking && live\(\)\)\) draw\(\); updateHero\(\); \}/);
});

test('P7: live labels, the clock and the stage readouts rewrite their text node in place', () => {
  const stage = read('src/ui/stage.js'), tl = read('src/ui/timeline.js');
  assert.match(stage, /putText\(sp, r\.t\);/);
  assert.match(stage, /if \(v != null\) putText\(b, v\);/);
  assert.match(tl, /putText\(timeLong, t\); putText\(timeShort,/);
});

test('putText keeps the text node and changes only its data; an element without one gets its text set', () => {
  const node = { nodeType: 3, nextSibling: null, data: '12.0' };
  const el = { firstChild: node, set textContent(v) { throw new Error('rebuilt'); }, get textContent() { return node.data; } };
  putText(el, '12.4');
  assert.equal(node.data, '12.4');
  putText(el, '12.4');
  const empty = { firstChild: null, textContent: '' };
  putText(empty, '7');
  assert.equal(empty.textContent, '7');
});

test('P6: the radius sync compares a copy element by element, with no joined key, spread max or some() per frame', () => {
  const sync = read('src/ui/stage.js').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(sync, /R\.join\(','\)/);
  assert.doesNotMatch(sync, /Math\.max\(\.\.\.R\)/);
  assert.doesNotMatch(sync, /tubeData\.some\(/);
  assert.match(sync, /o\.glRSent = Float64Array\.from\(R\); o\.glR = R; o\.glMaxR = mx;/);
});

test('P8: stepBlood keeps per-frame facts per model frame, syncEnds compares in place', () => {
  const stage = read('src/ui/stage.js').replace(/^\s*\/\/.*$/gm, ''), gl = read('src/ui/veins-gl.js');
  assert.match(stage, /if \(perF !== F \|\| perH !== H\) \{/);
  assert.match(stage, /advanceStream\(streams\[k\], velQf\[k\], velQ\[k\],/);
  assert.match(stage, /KEY_K\[k\] === 1 \|\| \(KEY_K\[k\] === 2 && keyChevron\(EDGES\[k\], laneOpen\)\)/);
  assert.doesNotMatch(stage, /list\.map\(\(x\) => x\.e\.id\)\.join/);
  assert.match(gl, /gl\.uniform3fv\(U\.originCol, originColOf\(/);
});

test('P10: the composite fragment shader is compiled once per context, and every program starts before any is waited on', () => {
  const gl = read('src/ui/veins-gl.js');
  assert.equal((gl.match(/COMP_FS\(\)/g) || []).length, 1);
  assert.match(gl, /gl\.getExtension\('KHR_parallel_shader_compile'\);/);
  assert.match(gl, /comp: startProgram\(gl, COMP_VS, compFS\), compCell: startProgram\(gl, COMP_CELL_VS, compFS\)/);
  // All five started before the first status read.
  assert.ok(gl.indexOf("line: startProgram(gl, LINE_VS, LINE_FS)") < gl.indexOf('prog = finishProgram(gl, started.prog)'));
});

test('round 2 pops: the legend key names only what it shows (NP8); the Over time axis glides (τ 0.15 s) and a paused chart draws on until it lands', () => {
  const main = read('src/ui/main.js'), pt = read('src/ui/pressure-time.js');
  assert.match(main, /key = m === 'heat' \|\| m === 'delta' \? `\$\{m\}\|\$\{ref\}` : m, same = key === legendKey;/);
  assert.match(pt, /const k = -Math\.expm1\(-Math\.min\(0\.1, \(now - ysAt\[key\]\) \/ 1000\) \/ 0\.15\)/);
  assert.match(pt, /if \(gliding && !glideReq && !\(ticking && live\(\)\)\) \{ glideReq = true; nextFrame\(/);
});
