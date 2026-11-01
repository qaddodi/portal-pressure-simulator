// A slide's camera glide sets off no style passes of its own (1 Nov 2026, iPhone: the slide-change zoom at about 3 fps). Its classes
// (cam-move, pinch-hide, off-home) change no colour the stage, the organs' grey, the vessel marks or the glow read, nor any label's
// look; the vessel marks read every style before writing any data-gl; and a glide's own step paints the callouts and probes once a
// frame. ?glidekeys=0, ?marksbatch=0 and ?glidepaint=0 turn each off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GESTURE_LOOK, onlyClasses } from '../src/ui/idle-keys.js';

const STAGE = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the glide\'s classes are no look the stage\'s keyed readers depend on', () => {
  const src = STAGE.match(/const gestureFree = \(c\) => \(c \|\| ''\)\.replace\(GLIDE_KEYS \? (\/[^ ]+\/g) :/)[1];
  const re = new RegExp(src.slice(1, -2), 'g'), free = (c) => c.replace(re, '');
  assert.equal(free('stage-view gl-on cam-move'), free('stage-view gl-on'));
  assert.equal(free('stage-view gl-on off-home pinch-hide'), free('stage-view gl-on'));
  assert.notEqual(free('stage-view gl-on in-lobule'), free('stage-view gl-on'), 'a class that changes the look still counts');
  // (What the three do in the style sheet: the label layer's opacity and the zoom pill's ink, nothing the marks, organs or glow read.)
  const rules = CSS.split('\n').filter((l) => /cam-move|pinch-hide|off-home/.test(l) && !/^\s*\/?\*/.test(l) && /\{/.test(l));
  for (const r of rules) assert.match(r, /(#labels|#labelGl|\.lb-glass|\.zoom-pill)[^{]*\{ opacity: [\d.]+; \}/, r);
});

test('off-home changes no label\'s look (label-gl.js reads them again only for a look)', () => {
  assert.ok(GESTURE_LOOK.has('off-home'));
  assert.ok(onlyClasses('stage-view gl-on', 'stage-view gl-on off-home', GESTURE_LOOK));
});

test('the vessel marks read every style before writing any data-gl', () => {
  const at = STAGE.indexOf('  function marksBuild() {'), fn = STAGE.slice(at, STAGE.indexOf('\n  }\n', at));
  assert.match(fn, /const drawn = MARKS_BATCH \? new Set\(\) : null;/);
  assert.match(fn, /if \(!drawn\) el\.removeAttribute\('data-gl'\);\n\s+let cs = getComputedStyle\(el\)/);
  assert.match(fn, /if \(drawn\) drawn\.add\(el\); else el\.setAttribute\('data-gl', ''\);/);
  // (Written once, after the reads, and only where it changes.)
  const loop = fn.indexOf('if (drawn) for (const g of Object.values(ov))');
  assert.ok(loop > fn.indexOf('drawn.add(el)'), 'after the reading loop');
  assert.match(fn.slice(loop), /if \(drawn\.has\(el\)\) \{ if \(!el\.hasAttribute\('data-gl'\)\) el\.setAttribute\('data-gl', ''\); \} else if \(el\.hasAttribute\('data-gl'\)\) el\.removeAttribute\('data-gl'\);/);
  assert.match(STAGE, /const MARKS_BATCH = !\/\[\?&\]marksbatch=0\\b\/\.test\(location\.search\);/);
  // (data-gl hides a mark and nothing else: the reads are the same with it on or off.)
  assert.match(CSS, /\.stage-view\.gl-on #overlays \[data-gl\] \{ visibility: hidden; \}/);
});

test('a glide\'s own step paints the callouts and probes; the view\'s frame does not paint them a second time', () => {
  const at = STAGE.indexOf('  function animateVT('), fn = STAGE.slice(at, STAGE.indexOf('\n  }\n', at));
  assert.match(fn, /if \(sites\.list\) \{ refreshCTM\(\); sitesPaint\(\); \}\n\s+if \(scan\.on\) scanPaint\(\);\n\s+dprobePaint\(\);/);
  assert.match(STAGE, /const GLIDE_PAINT = !\/\[\?&\]glidepaint=0\\b\/\.test\(location\.search\);/);
});
