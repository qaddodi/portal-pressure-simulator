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
  assert.match(src, /for \(const k of \['Proximal', 'Mid', 'Distal'\]\) statEls\[k\]\.wrap\.hidden = !isStent;/);
});
