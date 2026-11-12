// A test switched by a tap or a menu is built before it is shown (dock.js stageIn): laid out hidden in the open pane's cell, fed the frame,
// given two frames to size and draw, then swapped under the old pane's fade. A swipe keeps its own path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dock = readFileSync(new URL('../src/ui/dock.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const sheet = readFileSync(new URL('../src/ui/dock-sheet.js', import.meta.url), 'utf8');

test('a tapped tab and a menu both stage the pane first; a swipe does not', () => {
  assert.match(dock, /else stageIn\(open\.find\(\(x\) => tabOf\(x\) === id\) \|\| id, \(\) => pickCommit\(id, false\)\)/);
  assert.match(dock, /if \(swiped\) \{ cancelStage\(\); pickCommit\(id, true\); \}/);
  assert.match(dock, /pick\(TABS\[s\.j\], true\)/, 'endSwipe says the pane was swiped in');
  assert.match(dock, /if \(!opts\.alongside && open\.length === 1 && !open\.includes\(id\)\) stageIn\(id, \(\) => showCommit\(id, opts\)\)/);
});

test('the staged pane is hidden, fed and drawn twice before the swap, with a time limit', () => {
  const src = dock.slice(dock.indexOf('function stageIn('), dock.indexOf('function openGrid('));
  assert.match(src, /el\.classList\.add\('active', 'staging'\)/);
  assert.match(src, /p\.shown\?\.\(true\)/, 'its GPU context starts before it is shown');
  assert.match(src, /feed\(target\);\n\s+const go/, 'fed the frame at once');
  assert.match(src, /nextFrame\(\(\) => \{ if \(stage !== s\) return; feed\(target\); nextFrame\(go\); \}\)/, 'fed again a frame on, swapped a frame after');
  assert.match(src, /s\.timer = setTimeout\(go, afterMs\(STAGE_MAX\)\)/);
  assert.match(src, /el\.classList\.add\('landed'\)/, 'no entrance of its own');
});

test('layout keeps a staged pane up, and a swipe, a close and a newer ask end the staging', () => {
  assert.match(dock, /const on = open\.includes\(p\.id\) \|\| stage\?\.p === p;/);
  assert.match(dock, /cancelStage\(\);\n\s+sw\.on = true;/);
  assert.match(dock, /function close\(\) \{\n\s+cancelStage\(\);/);
  assert.match(dock, /function stageIn\(target, commit\) \{\n\s+cancelStage\(\);/);
});

test('the pane that is left is the one the open list names, not a query that could find the staged one', () => {
  assert.match(dock, /const was = open\.length === 1 \? byId\[open\[0\]\]\.el : null/);
  assert.match(dock, /sw\.cur = body\.querySelector\('\.dock-pane\.active:not\(\.staging\)'\)/);
  assert.match(sheet, /\.dock-pane\.active:not\(\.staging\)/);
});

test('the staged pane shares the open pane\'s cell, unseen and untouchable, with no animation', () => {
  assert.match(css, /\.dock-pane\.active\.staging \{ grid-area: 1 \/ 1; opacity: 0; pointer-events: none; animation: none !important; \}/);
  assert.match(css, /\.dock-body:has\(\.staging\) > \.dock-pane\.active \{ grid-area: 1 \/ 1; \}/);
  assert.match(css, /\.dock-pane\.active:not\(\.landed\):is\(\[data-pane="profile"\]/);
});
