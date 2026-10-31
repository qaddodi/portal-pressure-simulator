// A slide change is one move (premium-feel R1): over the plate the cards come in during the camera's last 40 percent, and a change
// of patient eases under the glide, where the figure can move smoothly while its organs change. ?onemove=0 is the chain as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const run = src.slice(src.indexOf('async function transitionRun('), src.indexOf('function paintOverlays('));
const cam = src.slice(src.indexOf('async function camera('), src.indexOf('const cardsEntering ='));

test('the flag, the share of the glide and the shared morph window', () => {
  assert.match(src, /const ONE_MOVE = !\/\[\?&\]onemove=0\\b\/\.test\(location\.search\);/);
  assert.match(src, /const CARDS_AT = 0\.4, MORPH_ONE_MS = 1200;/);
  assert.match(src, /const MORPH_MS = 2000;/, 'the old window stays for ?onemove=0 and a question\'s answer');
});

test('the stage says what is left of its glide, read from the glide itself', () => {
  assert.match(stage, /vtGliding = true; vtUntil = t0 \+ ms; vtMs = ms;/);
  assert.match(stage, /glideLeft: \(\) => \(vtGliding \? \{ left: Math\.max\(0, vtUntil - performance\.now\(\)\), ms: vtMs \} : \{ left: 0, ms: 0 \}\),/);
});

test('camera() resolves at the glide\'s last part only when asked, over the plate', () => {
  assert.match(cam, /async function camera\(cam, s, cut, early = 0\)/);
  assert.match(cam, /frameTo\(v === 'circuit' \? 'fit' : cam, s, gl\);\s*(?:\/\/[^\n]*\n\s*)*if \(early && gl\) \{ await until\(\(\) => \{ if \(cut\(\)\) return true; const g = stage\.glideLeft\?\.\(\); return !g \|\| g\.left <= g\.ms \* early; \}, gl \+ 1500\); return; \}\s*await wait\(gl\);/);
  // (The lobule's way in keeps its own waits: its branch returns before the plate's glide.)
  const lob = cam.slice(cam.indexOf('if (LOBULE_CAM.test(cam))'), cam.indexOf("const v = s.view || 'anatomic';"));
  assert.doesNotMatch(lob, /early/);
});

test('what stays serial: the liver, a catheter, a case or question card, an instrument, a figure that cannot move smoothly', () => {
  assert.match(run, /const plate = ONE_MOVE && bare && !ct && !!cam && !LOBULE_CAM\.test\(cam\) && !store\.get\(\)\.lobule && !store\.get\(\)\.sinusoid;/);
  assert.match(run, /const under = plate && later && !caseCard && !s\.tool && !!stage\.canDrift\?\.\(\) && \(fv\.view \|\| 'anatomic'\) === store\.get\(\)\.view;/);
  assert.match(run, /else if \(cam\) await camera\(cam, fv, cut, plate \? CARDS_AT : 0\);/);
});

test('the change of patient starts with the glide, and is awaited only once the cards are in', () => {
  const start = run.indexOf("morphP = morphTo(st, cut, MORPH_ONE_MS, false).finally(() => app.classList.remove('pz-morph-under'));");
  const glide = run.indexOf('else if (cam) await camera(cam, fv, cut, plate ? CARDS_AT : 0);');
  const cards = run.indexOf('bare = false; cardsIn({ i: to, gen: g });');
  const awaited = run.indexOf('if (morphP) { if (!await morphP) return; shownState = own ? -1 : si; ui?.tools.hold(false); }');
  assert.ok(start > 0 && start < glide && glide < cards && cards < awaited);
  // (A kept data card rides the model as it eases, from the start of the change.)
  assert.ok(run.lastIndexOf('if (keepNow.data && keepNow.swap) followData(s, to, st, cut);', start) > run.indexOf('if (under) {'));
});

test('a change after the landing never starts mid-glide, and the move ends only once the glide has landed', () => {
  assert.match(run, /if \(!plate \|\| \(later && !under\)\) await until\(\(\) => cut\(\) \|\| !stage\.gliding\(\), 1500\);/);
  assert.match(run, /if \(later && !under\) \{ if \(!await morphTo\(st, cut, ONE_MOVE \? MORPH_ONE_MS : MORPH_MS\)\) return;/);
  assert.match(run, /await wait\(60\); await until\(\(\) => cut\(\) \|\| !cardsEntering\(\), 1200\);\s*if \(cut\(\)\) return;\s*(?:\/\/[^\n]*\n\s*)*if \(plate\) \{ await until\(\(\) => cut\(\) \|\| !stage\.gliding\(\), 1500\); if \(cut\(\)\) return; \}/);
});
