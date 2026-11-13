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
  assert.match(src, /attrSoon\(b, 'aria-pressed', here\)/);
  assert.match(src, /classSoon\(w, 'on', here\)/);   // (the highlight, a thicker edge, follows the gate as before)
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
  assert.match(src, /for \(let i = 0; i < SEGS\.length; i\+\+\) showStat\(statEls\[SEGS\[i\]\[1\]\]\.wrap, isStent\);/);   // (the three segment tiles)
  // (and the pulsatility tile is hidden on the hepatic veins and the IVC too, which have no such index: 13 Nov 2026)
  assert.match(src, /showStat\(statEls\.Trough\.wrap, !isStent\); showStat\(statEls\.Pulsatility\.wrap, !isStent && p\.kind !== 'hepatic' && p\.kind !== 'ivc'\);/);
  assert.match(src, /const showStat = \(wrap, on\) => \{\s*if \(\(wrap\._on \?\? !wrap\.hidden\) === on\) return;\s*wrap\._on = on;\s*restPass\(wrap\._flip\);[^]*?propSoon\(wrap, 'hidden', !on\);/);
});

test('a new spot along a stent starts a new recording with its own scale, and the peak tile reads that spot', () => {
  assert.match(src, /if \(g !== gateNow\) \{ gateNow = g; clearBuf\(\); wl = null; synth = null; scale = null; heldTo = null; steady\.probe = null; \}/);
  assert.match(src, /setStat\(statEls\.Peak\.dd, num\(pk \* gf\), 'cm\/s'\)/);
});

// (13 Nov 2026, the hepatic artery's Doppler: tests/ha-doppler.test.js has the model's side.)
test('the Doppler names an artery\'s pulsatility by Gosling\'s index, and has none for the hepatic veins and the IVC', () => {
  assert.match(src, /const piV = p\.kind === 'artery' \? \(Math\.abs\(r\.mean\) > 0\.5 \? \(r\.vmax - r\.vmin\) \/ Math\.abs\(r\.mean\) : 0\) : it\.pi;/);
  assert.match(src, /setStat\(statEls\.Pulsatility\.dd, fmt\(piV, 2\)\);/);
  assert.match(src, /showStat\(statEls\.Pulsatility\.wrap, !isStent && p\.kind !== 'hepatic' && p\.kind !== 'ivc'\);/);
  // A portal vein's pulsatility is read within each beat, as its index is defined, not across the breath as well.
  assert.match(src, /const pi = p\.kind === 'portal' && r\.beatPi >= 0 \? r\.beatPi : big > 0\.5 \? swing \/ big : 0;/);
});

test('while it acquires, the Doppler shows only the vessel\'s own tiles (no stent segments or CI under an artery)', () => {
  assert.match(src, /for \(const k in statEls\) setStat\(statEls\[k\]\.dd, '—'\);[^]{0,400}?showTiles\(meta\(\)\);\s*return;/);
  assert.match(src, /function showTiles\(p\) \{[^]*?showStat\(statEls\.CI\.wrap, probe === 'PV_TRUNK'\);/);
});
