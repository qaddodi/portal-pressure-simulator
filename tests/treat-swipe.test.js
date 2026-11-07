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
  assert.match(css, /\.treat-pane > \.tp-off \{ visibility: hidden; opacity: 0;/);   // (hidden but still laid out; it fades out first, 1 Nov)
  assert.match(css, /visibility 0s linear var\(--d-flip\)/, 'the pane leaves the page only once its fade is done');
});

test('#21 a swipe in phone Tests first finishes the previous swipe still settling, once it moves, and takes the pane over from where it is drawn', () => {
  const start = dock.slice(dock.indexOf("body.addEventListener('touchstart'"), dock.indexOf("body.addEventListener('touchmove'"));
  assert.doesNotMatch(start, /settle\?\.\(\)/, 'a touch alone (a tap) leaves the panes easing');
  const move = dock.slice(dock.indexOf("body.addEventListener('touchmove'"), dock.indexOf('const endSwipe'));
  assert.match(move, /sw\.carry = resting && settle \? shiftX\(resting\) : 0;\s*settle\?\.\(\);/);
  assert.match(move, /const tdx = dx \+ sw\.carry, d = tdx < 0 \? 1 : -1/);
  const end = dock.slice(dock.indexOf('const endSwipe'), dock.indexOf("body.addEventListener('touchend'"));
  assert.match(end, /const timer = setTimeout\(done, 250\);\s*settle = done; resting = go \? s\.nb : s\.cur;/);
  assert.match(end, /clearTimeout\(timer\); settle = null;/);
});
