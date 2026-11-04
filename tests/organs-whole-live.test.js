import { stageSource } from './stage-src.js';
// The organs never fall back to the page's SVG while their pictures are made (2 Nov 2026, merged GPU plan; Mohammad: "no SVG
// fallback"): every layer is painted live on the GPU until the pictures land, at start and after a theme change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = stageSource();
const gl = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
const veins = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');

test('the stack shows the whole set painted live as if its pictures were in, until any other set is given', () => {
  assert.match(gl, /has: \(slot\) => live\[slot\]\.size > 0 \|\| \(slot === 0 && full\),/);
  assert.match(gl, /pictured: \(slot\) => live\[slot\]\.size > 0,/);
  assert.match(gl, /setLiveAll\(organs\) \{ this\.setLive\(organs, null\); full = liveOrgans\.size > 0; \}/);
  assert.match(gl, /function watchLive\(\) \{\n\s+full = false;/, 'every setLive ends the whole set');
  assert.match(veins, /setLiveAll\(organs\) \{ texVer\+\+; const r = stack\.setLiveAll\(organs\); notePlate\(\); return r; \}/);
  assert.match(veins, /pictured: \(slot\) => stack\.pictured\(slot\),/);
});

test('with no picture in (or one being replaced) every layer is read live, in its own colours, as the pictures read it', () => {
  assert.match(stage, /const fullWanted = \(\) => fullOk\(\) && \(fullSwap \|\| !veins\.organs\.pictured\(0\)\);/);
  assert.match(stage, /add\(L, k, LIVE_LAYERS\.has\(L\) \? undefined : \{ nest: true \}\)/, 'nested groups as bakeAll reads them');
  assert.match(stage, /if \(greyed\) \{ greyClear\(\); organDimKey = ''; \}\n\s+\/\/[^\n]*\n\s+try \{ add\('back', gBackdrop, BACKDROP_READ\);/);
  assert.match(stage, /k\[9\] = themeKey\(\); k\[10\] = fullWanted\(\);/, 'its change reads the organs again');
});

test('a dropped picture stays until the whole set takes over; an unreadable layer gives the whole set up for the old way', () => {
  assert.match(stage, /function hidePlate\(\) \{\n[^}]*if \(keepForWhole\(\)\) return;/);
  assert.match(stage, /if \(v\.organs\.pictured\(0\)\) v\.dropPlate\(0\);[^\n]*\n\s+v\.organs\.setLiveAll\(organs\); liveSet = true;/);
  assert.match(stage, /if \(!ok\) fullFailed = true; const swap = fullSwap; fullSwap = false; liveKeyWas = ''; if \(swap\) hidePlate\(\);/);
});
