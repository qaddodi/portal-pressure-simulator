// Out of the lobule with a new patient (HVPG 7 to 8 and every other lobule exit): under the lobule the anatomy stops following the
// model, so its organs' picture still held the patient from before the dive. Dropped as the rise began, the live drawing showed,
// scaled up, and Safari lost the stomach and gut until partway down; held through the rise, the organs changed in one frame at
// landing (Mohammad, 20 Oct; review of 175b73d). Now the picture is made for the patient now before the rise, unseen, and the rise
// fades in that picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const pz = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const prep = st.match(/function prepRise\(\) \{[\s\S]*?\n {2}\}\n/)[0];
const ready = st.match(/function riseReady\(\) \{[\s\S]*?\n {2}\}\n/)[0];

test('before the way out, the covered anatomy follows the model again and its picture is made for the patient now', () => {
  assert.match(prep, /if \(!lobuleOn \|\| diveT < 1 \|\| morphTarget !== 0 \|\| risePrep\) return;/, 'only from a landed lobule');
  assert.match(prep, /if \(F && !inUpdate\) update\(F\);\n\s+platePoke\(\);/);
  assert.match(st, /const under = \(lobuleOn \|\| lz\?\.isOpen\(\)\) && !catchUp && !risePrep;/, 'model frames reach the organs meanwhile');
  // Done when the picture of the patient now lands; never left on.
  assert.match(st, /if \(!plateOn\(\)\) plateKey = '';[^\n]*\n\s+else if \(risePrep\) \{ risePrep = false; clearTimeout\(risePrepT\); \}/);
  assert.match(st, /function setLobule\(on\) \{\n[^\n]*\n\s+risePrep = false; clearTimeout\(risePrepT\);/);
});

test('ready means the picture shown is the state now: its key is the organs\' key, and nothing in it still eases', () => {
  assert.match(ready, /return plateOn\(\) && !plateBusy && !lvMoving && !fluidEasing\(\) && !spleenMoving\(\) && plateKey === plateStateKey\(\);/);
  assert.match(ready, /if \(!risePrep \|\|/, 'nothing to wait for once it is made (or none was asked for)');
});

test('the rise waits for it at rest in the lobule, then glides straight on and out; nothing holds a stale picture through the rise', () => {
  const ta = pz.match(/async function toAnatomy\(next\) \{[\s\S]*?\n {2}\}\n/)[0];
  const p = ta.indexOf('stage.prepRise?.();'), w = ta.indexOf('await until(() => stage.riseReady(), RISE_READY_MS);');
  const g = ta.indexOf("stage.lobuleFocus('fit'"), out = ta.indexOf('store.set({ lobule: false });');
  assert.ok(p > 0 && p < w && w < g && g < out, 'prep, wait, glide to the whole lobule, then the rise');
  assert.ok(+/const RISE_READY_MS = (\d+);/.exec(pz)[1] <= 3000);
  assert.match(pz, /if \(!store\.get\(\)\.sinusoid\) stage\.prepRise\?\.\(\);[^\n]*\n\s+const t0 = performance\.now\(\);\n\s+await until\(\(\) => cut\(\) \|\| !cardsEntering\(\), 1200\);/, 'begun while the new cards come in');
  assert.doesNotMatch(st, /plateAfterRise|const rising = /, 'no picture held through the rise');
  // During the rise the picture is only dropped for a change made after it was ready (its key no longer matches): platePoke's
  // check comes before any drop.
  const poke = st.match(/function platePoke\(\) \{[\s\S]*?\n {2}\}\n/)[0];
  assert.ok(poke.indexOf('if (key === plateKey && veins.hasPlate(0)) return;') < poke.indexOf('if ((themed || stale) && veins.hasPlate(0))'));
});

test('the picture for the way out is begun early, so Next goes straight out: ahead on a settled lobule slide, and as the change begins', () => {
  // As soon as a slide change that leaves the lobule begins (before the words leave and the new ones come in).
  assert.match(pz, /const cam = fv\.visual \? fv\.cam \|\| null : fv\.cam \|\| 'fit';\n(?:\s+\/\/[^\n]*\n)*\s+if \(!LOBULE_CAM\.test\(cam \|\| ''\)\) stage\.prepRise\?\.\(\);/);
  // Ahead, once a lobule slide whose next slide leaves the lobule has settled; only if it is still the slide shown.
  assert.match(pz, /if \(nx && LOBULE_CAM\.test\(cam \|\| ''\) && !LOBULE_CAM\.test\(nCam \|\| ''\)\) \{ clearTimeout\(prepAheadT\); prepAheadT = setTimeout\(\(\) => \{ if \(shown\?\.i === to && shown\.gen === g && gen === g\) stage\.prepRise\?\.\(\); \}, RISE_AHEAD_MS\); \}/);
  assert.ok(+/const RISE_AHEAD_MS = (\d+);/.exec(pz)[1] <= 2000);
  // Made ahead and nothing changed since: ready at once (its key still matches), so the wait in toAnatomy costs nothing.
  assert.match(st, /if \(key === plateKey && veins\.hasPlate\(0\)\) return;/);
});
