// Review #20 and #21 (chart.js and dock.js need a DOM to import, so they are read as text).
// A browser run of the old build: the phone Treat card measured 278 / 208 / 348 px on Drugs / Fluids / Procedures, and
// two quick swipes in Tests moved one tab; with these fixes it is 348 px on every tab and the swipes move two tabs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chart = readFileSync(new URL('../src/ui/chart.js', import.meta.url), 'utf8');
const dock = readFileSync(new URL('../src/ui/dock.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('#20 the Treat card keeps every tab in one grid cell, so it is as tall as the tallest tab on all of them', () => {
  assert.match(chart, /h\('div', \{ class: 'treat-pane' \}, panes\.map\(\(x\) => x\[2\]\)\)/);
  assert.doesNotMatch(chart, /body\.replaceChildren\(panes\.find/);
  assert.match(css, /\.treat-pane \{[^}]*display: grid;/);
  assert.match(css, /\.treat-pane > \* \{ grid-area: 1 \/ 1;/);
  assert.match(css, /\.treat-pane > \.tp-off \{ visibility: hidden; \}/);
});

test('#21 a swipe in phone Tests first finishes the previous swipe still settling', () => {
  const start = dock.slice(dock.indexOf("body.addEventListener('touchstart'"), dock.indexOf("body.addEventListener('touchmove'"));
  assert.match(start, /settle\?\.\(\);\s*sw = /);
  const end = dock.slice(dock.indexOf('const endSwipe'), dock.indexOf("body.addEventListener('touchend'"));
  assert.match(end, /const timer = setTimeout\(done, 250\);\s*settle = done;/);
  assert.match(end, /clearTimeout\(timer\); settle = null;/);
});
