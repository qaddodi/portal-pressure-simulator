// will-change is a layer held in memory: the lobule, sinusoid and divider-guide layers have it only while they are shown or dragged
// (classes lz-live, sv-live, dg-live), and ?willchange=0 keeps them always, as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

test('lobule, sinusoid and guide hold will-change only under their live class', () => {
  assert.doesNotMatch(css, /^\.lz \{[^}]*will-change/m);
  assert.doesNotMatch(css, /^\.sv \{[^}]*will-change/m);
  assert.doesNotMatch(css, /^\.dock-guide \{[^}]*will-change/m);
  assert.match(css, /\.lz\.lz-live, \.sv\.sv-live \{ will-change: transform, opacity; \}/);
  assert.match(css, /\.dock-guide\.dg-live \{ will-change: transform, opacity; \}/);
});

test('the classes follow the motion, and ?willchange=0 keeps them on', () => {
  const lz = src('lobule-zoom.js'), sv = src('sinusoid-view.js'), dock = src('dock.js');
  assert.match(lz, /classList\.toggle\('lz-live', fade > 0\)/);
  assert.match(lz, /LZ_LAYER \? 'lz' : 'lz lz-live'/);
  assert.match(sv, /restClass\(el, 'sv-live', opacity > 0\)/);
  assert.match(sv, /SV_LAYER \? 'sv' : 'sv sv-live'/);
  assert.match(dock, /classList\.add\('dg-live', 'on'\)/);
  assert.match(dock, /if \(!GUIDE_LAYER\) guide\.classList\.add\('dg-live'\)/);
  for (const s of [lz, sv, dock]) assert.match(s, /willchange=0/);
});
