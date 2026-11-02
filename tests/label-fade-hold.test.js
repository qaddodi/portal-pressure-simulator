// "Labels turn on and off randomly" (Mohammad, iPhone, 2 Nov 2026). Traced frame by frame: a label's entry fade, filling forwards, stayed on
// its opacity after it ended, so the browser started no fade for any later hide or show (they snapped off and on), and the GPU labels drew
// an at-rest or first-frame opacity while a fade was starting or under way (blinks of one to five frames). These pin the fixes and their
// off switches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const css = read('styles/app.css'), gl = read('src/ui/label-gl.js'), stage = read('src/ui/stage.js');

test('no label or leader entry fade fills forwards (it would block every later fade); html.label-fill-both, ?labelfill=0, as before', () => {
  for (const m of css.matchAll(/^([^\n{]*(?:#labels \.lb|\.lb-leaders > \*)[^\n{]*)\{[^}]*animation: crossfade[^;}]*;/gm)) assert.ok(!/ both;/.test(m[0]), `${m[1].trim()} fills forwards`);
  assert.match(css, /html\.label-fill-both :is\(#labels \.lb, \.lb-leaders > \*\) \{ animation-fill-mode: both; \}/);
  assert.match(stage, /if \(\/\[\?&\]labelfill=0\\b\/\.test\(location\.search\)\) document\.documentElement\.classList\.add\('label-fill-both'\);/);
});

test('GPU labels hold their opacity until a fade is known, and keep following one mid-way (?fadehold=0 off)', () => {
  assert.match(gl, /const FADE_HOLD = !\/\[\?&\]fadehold=0\\b\/\.test\(SEARCH\);/);
  // (Read at rest with a new opacity: held where drawn, followed from the next frame.)
  assert.match(gl, /if \(FADE_HOLD && !tracked && !isLive && st\.mode === 'gl' && was !== null && !REDUCE\?\.matches && Math\.abs\(\(was \?\? 0\) - st\.opacity\) > 0\.01\) \{\s*st\.opacity = was \?\? 0;\s*live\.set\(g, now \+ 700\);/);
  // (No animations taken yet: the fade it had carries on; one the SVG drew stays the SVG's for that frame.)
  assert.match(gl, /if \(old && !old\.ended && old\.ops\?\.length\) st0\.trk = \{ ops: old\.ops, under: old\.under, paint: null, end: old\.end, carry: true \};\s*else if \(was === null\) st0\.mode = 'svg';[^\n]*\n\s*else st0\.opacity = was \?\? 0;/);
  assert.match(gl, /\(isLive && \(exact\.has\(g\) \|\| !st\.trk \|\| st\.trk\.carry\)\)/);
  assert.match(gl, /st\.held = st\.opacity;/);
  // (A style read mid-ease makes the label followed, not drawn at that moment's opacity.)
  assert.match(gl, /if \(FADE_HOLD\) \{ const g = labelOf\(el\); if \(g\?\.isConnected && !markOf\(g\)\) \{ keepAnims\(g, true\); live\.set\(g, performance\.now\(\) \+ 700\); dirty\.add\(g\); \} \}/);
});

test('a card on its way out hides no label (?leaveblock=1 as before)', () => {
  assert.match(stage, /\(!LEAVE_BLOCK && el\.classList\.contains\('pz-leave'\)\)\) return null;/);
});

test('organ names and crowded labels come back only with room to spare (?labelhyst=0 off)', () => {
  assert.match(stage, /obstacles\.some\(\(o\) => hits\(LABEL_HYST \? grown : edge, o\)\)/);
  assert.match(stage, /const p = LABEL_HYST && lapWas\.has\(it\.key\) \? 4 : 0;/);
  assert.match(stage, /if \(!it\.sel && crowded\(it, r\)\) \{ it\.hide = true; lapHid\.add\(it\.key\); continue; \}/);
});
