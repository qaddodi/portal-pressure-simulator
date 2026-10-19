// A stent's sample spot is chosen by tapping the Proximal, Mid or Distal tile under the Doppler trace: real buttons in the dock,
// no separate dropdown, and plain tiles in Present (where each slide's own buttons move the gate).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/doppler.js', import.meta.url), 'utf8');
const tools = readFileSync(new URL('../src/ui/presenter-tools.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the spot dropdown is gone', () => {
  assert.doesNotMatch(src, /gateSel|dop-gate/);
  assert.doesNotMatch(css, /\.dop-gate/);
});

test('each segment tile holds a real button that sets the gate and says which one is pressed', () => {
  assert.match(src, /h\('button', \{ type: 'button', class: 'dop-seg', 'aria-pressed': 'false'/);
  assert.match(src, /btn\?\.addEventListener\('click', \(\) => pickSeg\(seg\)\)/);
  assert.match(src, /store\.set\(\{ dopGate: seg \}\)/);
  assert.match(src, /b\.setAttribute\('aria-pressed', on\)/);
  assert.match(src, /classList\.toggle\('on', seg === at\)/);   // (the highlight, a thicker edge, follows the gate as before)
});

test('the button covers its whole tile and is keyboard focusable', () => {
  assert.match(css, /\.dop-stats > div:has\(> dt > \.dop-seg\) \{ position: relative;/);
  assert.match(css, /\.dop-seg::after \{ content: ''; position: absolute; inset: 0;/);
  assert.match(css, /\.dop-seg:focus-visible::after \{ outline: 2px solid/);
});

test("Present's Doppler keeps plain tiles; its slide buttons own the gate", () => {
  assert.match(tools, /createDoppler\(\{ onProbe: noop, pickGate: false \}\)/);
  assert.match(src, /seg && pickGate \? h\('button'/);
});

test('the tiles show only on a stent', () => {
  assert.match(src, /for \(const k of \['Proximal', 'Mid', 'Distal'\]\) showStat\(statEls\[k\]\.wrap, isStent\);/);
  assert.match(src, /showStat\(statEls\.Trough\.wrap, !isStent\); showStat\(statEls\.Pulsatility\.wrap, !isStent\);/);
  assert.match(src, /const showStat = \(wrap, on\) => \{\s*if \(wrap\.hidden !== on\) return;\s*wrap\.hidden = !on;/);
});

test("a card's bottom edge is tappable: the play bar's empty row takes no touches while a card is open", () => {
  assert.match(css, /\.app\.thumb:is\(\.dock-open, \.panel-open\) \.vdock:not\(\.mini\), [^{]*\{ pointer-events: none; \}/);
  assert.match(css, /\.vdock:not\(\.mini\) \.thumb-bar \{ pointer-events: auto; \}/);
});

test('a new spot along a stent starts a new recording with its own scale, and the peak tile reads that spot', () => {
  assert.match(src, /if \(g !== gateNow\) \{ gateNow = g; buf = \[\]; wl = null; synth = null; scale = null; steady\.probe = null; \}/);
  assert.match(src, /setStat\(statEls\.Peak\.dd, num\(pk \* gf\), 'cm\/s'\)/);
});

test("the figure's stent callout points at the third the Doppler samples", () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /if \(dop\.id === sid && dop\.seg && geo\[sid\]\?\.cur\?\.length > 1\) \[ax, ay\] = worldToLocal\(\.\.\.pointAt\(geo\[sid\]\.cur, STENT_SITES\[dop\.seg\]\)\);/);
  assert.match(stage, /stentReady\(id, f\)\)\.join\(''\), dop\.key\]/);   // (a new gate lays the labels out again)
});
