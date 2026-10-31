// 31 Oct sweep of forced layouts and repeated figure updates on the hot paths (code review; pixels unchanged).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const mn = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');

test("a card's own list scrolling keeps the figure's box; the page's scroll, or one holding the figure, drops it", () => {
  assert.match(st, /addEventListener\('scroll', \(e\) => \{ const t = e\.target; if \(t === document \|\| t === window \|\| t\?\.contains\?\.\(wrap\)\) \{ box = null; CTM = null; \} \}, true\);/);
  assert.doesNotMatch(st, /addEventListener\('scroll', \(\) => \{ box = null; CTM = null; \}, true\);/);
});

test('a hover reads the kept box and transform, never a fresh layout', () => {
  const hov = st.match(/function hoverAt\(ev\) \{[\s\S]*?\n {2}\}\n/)[0];
  assert.doesNotMatch(hov, /getBoundingClientRect|clientToWorld\(/);
  assert.match(hov, /const r = stageBox\(\);/);
  assert.match(hov, /clientToWorldFast\(ev\.clientX, ev\.clientY\)/);
});

test('a card leaving lays the page out only to restart a leave already playing', () => {
  assert.match(mn, /if \(el\.classList\.contains\('card-leaving'\)\) \{ el\.classList\.remove\('card-leaving'\); void el\.offsetWidth; \}\n\s+el\.classList\.add\('card-leaving'\);/);
});

test('focus, label level and selection redraw the figure only for a new value', () => {
  assert.match(mn, /for \(const k of \['focus', 'labelLevel', 'selection'\]\) \{ let was = store\.get\(\)\[k\]; store\.on\(k, \(v\) => \{ if \(v === was\) return; was = v; redraw\(\); \}\); \}/);
});
