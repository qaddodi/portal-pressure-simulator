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
