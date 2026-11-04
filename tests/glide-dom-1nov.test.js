import { stageSource } from './stage-src.js';
// A slide's camera glide sets off no style passes of its own (1 Nov 2026, iPhone: the slide-change zoom at about 3 fps). Its classes
// (cam-move, pinch-hide, off-home) change no colour the stage, the organs' grey, the vessel marks or the glow read, nor any label's
// look; the vessel marks read every style before writing any data-gl; and a glide's own step paints the callouts and probes once a
// frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GESTURE_LOOK, onlyClasses } from '../src/ui/idle-keys.js';

const STAGE = stageSource();
const CSS = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the glide\'s classes are no look the stage\'s keyed readers depend on', () => {
  const src = STAGE.match(/const gestureFree = \(c\) => \(c \|\| ''\)\.replace\((\/[^ ]+\/g), ''\);/)[1];
  const re = new RegExp(src.slice(1, -2), 'g'), free = (c) => c.replace(re, '');
  assert.equal(free('stage-view gl-on cam-move'), free('stage-view gl-on'));
  assert.equal(free('stage-view gl-on off-home pinch-hide'), free('stage-view gl-on'));
  assert.notEqual(free('stage-view gl-on in-lobule'), free('stage-view gl-on'), 'a class that changes the look still counts');
  // (What the three do in the style sheet: the label layer's opacity and the zoom pill's ink, nothing the marks, organs or glow read.)
  const rules = CSS.split('\n').filter((l) => /cam-move|pinch-hide|off-home/.test(l) && !/^\s*\/?\*/.test(l) && /\{/.test(l));
  for (const r of rules) assert.match(r, /(#labels|\.lb-glass|\.zoom-pill)[^{]*\{ opacity: [\d.]+; \}/, r);
});

test('off-home changes no label\'s look (label-gl.js reads them again only for a look)', () => {
  assert.ok(GESTURE_LOOK.has('off-home'));
  assert.ok(onlyClasses('stage-view gl-on', 'stage-view gl-on off-home', GESTURE_LOOK));
});

test('the vessel marks read every style before writing any data-gl', () => {
  const at = STAGE.indexOf('  function marksBuild() {'), fn = STAGE.slice(at, STAGE.indexOf('\n  }\n', at));
  assert.match(fn, /const drawn = mkDrawn;\n\s+drawn\.clear\(\);/);
  assert.match(fn, /\n\s+let cs = getComputedStyle\(el\)/);
  assert.match(fn, / drawn\.add\(el\);/);
  // (Written once, after the reads, and only where it changes.)
  const loop = fn.indexOf('    for (const g of Object.values(ov)) for (const el of g.querySelectorAll(');
  assert.ok(loop > fn.indexOf('drawn.add(el)'), 'after the reading loop');
  assert.match(fn.slice(loop), /if \(drawn\.has\(el\)\) \{ if \(!el\.hasAttribute\('data-gl'\)\) el\.setAttribute\('data-gl', ''\); \} else if \(el\.hasAttribute\('data-gl'\)\) el\.removeAttribute\('data-gl'\);/);
  // (data-gl hides a mark and nothing else: the reads are the same with it on or off.)
  assert.match(CSS, /\.stage-view\.gl-on #overlays \[data-gl\] \{ visibility: hidden; \}/);
});

test('a glide\'s own step paints the callouts and probes; the view\'s frame does not paint them a second time', () => {
  const at = STAGE.indexOf('  function animateVT('), fn = STAGE.slice(at, STAGE.indexOf('\n  }\n', at));
  assert.match(fn, /if \(sites\.list\) \{ refreshCTM\(\); sitesPaint\(\); \}\n\s+if \(scan\.on\) scanPaint\(\);\n\s+dprobePaint\(\);/);
});

test('the status bar\'s colour is taken from the token cache for a new look only, never for a class on #app', () => {
  const MAIN = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.match(MAIN, /^onTheme\(syncStatusBar\);$/m);
  assert.match(MAIN, /const c = cssVar\('--stage-bg'\);/);
  assert.doesNotMatch(MAIN, /observe\(document\.getElementById\('app'\)[^\n]*syncStatusBar|statusLater/);
  // (The stage's colour is the theme's: no class on #app sets it.)
  const TOKENS = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
  for (const l of (CSS + TOKENS).split('\n').filter((x) => /--stage-bg:/.test(x))) assert.doesNotMatch(l, /figure-focus|stage-busy|cam-move|off-home|panning|pinch-hide|lb-ride/);
});

// bugs-recs 8 (2 Nov 2026): the still-frame and look keys read the figure's classes as a set (wrapCls): the gesture classes left out
// and the rest sorted, so the same classes in another order are no change and no redraw.
test('the figure class key ignores gesture classes and class order', () => {
  assert.match(STAGE, /k\.cath = cathVer; k\.morph = morph; k\.rot = rotU; k\.cls = wrapCls\(\);/);   // (rev 2 §2.8: the still key as a struct, in place)
  assert.doesNotMatch(STAGE, /\$\{wrap\.className\}/);
  const body = STAGE.match(/const wrapCls = \(\) => \{([\s\S]*?)\n {2}\};/)[1];
  assert.match(body, /gestureFree\(c\)\.split\(\/\\s\+\/\)\.filter\(Boolean\)\.sort\(\)\.join\(' '\)/);
});
