// The figure's labels, their leaders, the slides' readings (sites and resistors) and the lobule's pointer fade and glide on a slide's
// or a patient's change, never snap (17 Oct: "resistance and labels and callouts all snap instead of fade or transition").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const stage = read('src/ui/stage.js'), css = read('styles/app.css'), lz = read('src/ui/lobule-zoom.js');

test('a label no longer wanted fades out before it leaves, and fades back if wanted again', () => {
  assert.match(stage, /b\.g\.classList\.add\('lb-off'\); labelStop\(b, true\);\s*const tok = b\.gone = \{\};\s*setTimeout\(\(\) => \{ if \(b\.gone === tok\) \{ b\.gone = null; b\.g\.style\.display = 'none'; \} \}, 360\);/);
  assert.match(stage, /b\.gone = null;\s*b\.g\.style\.display = '';/);
  assert.match(css, /#labels \.lb \{ transition: opacity var\(--d-small\) var\(--ease\); animation: crossfade var\(--d-small\) var\(--ease\) backwards; \}/);
  // (Never the old instant drop.)
  assert.ok(!/b\.seen !== frameNo && !\(k === 'scan' && \(scan\.leaving \|\| scan\.on\)\)\) b\.g\.style\.display = 'none'/.test(stage));
});

test('a moved label glides, keeping to the point it names, and is laid out each frame until it lands', () => {
  const fn = stage.slice(stage.indexOf('function labelGlide(out)'), stage.indexOf('function paintLeaders('));
  // (It eases the slot's offset from its point, never the edge's pull: a label held against the stage's edge stays on the screen while the
  // figure pans past it, instead of riding with the figure and easing back one camera step behind, every frame: 3 Nov 2026.)
  assert.match(fn, /const px = it\.px \|\| 0, py = it\.py \|\| 0, ox = rel \? it\.ax : 0, oy = rel \? it\.ay : 0, tx = it\.x - px - ox, ty = it\.y - py - oy;/);
  assert.match(fn, /it\.x = ox \+ sx \+ px; it\.y = oy \+ sy \+ py;/);
  const lay0 = stage.slice(stage.indexOf('function layoutLabels(f, solve, dry = false)'));
  assert.match(lay0, /it\.x \+= cx; it\.y \+= cy; it\.px \+= cx; it\.py \+= cy;/);   // (the pull-in records what it pulled)
  assert.match(lay0, /ringPull\.set\(it, \[cx \+ step\[0\], cy \+ step\[1\]\]\)/);   // (the ring pass too)
  // (Hidden figure, reduced motion, a label just shown or turned: it takes its spot at once.)
  assert.match(fn, /const snap = reduceMotion\.matches \|\| camMove \|\| wrap\.classList\.contains\('cam-move'\)/);
  assert.match(fn, /if \(!b\.at \|\| snap \|\| b\.rot !== !!it\.rot \|\| b\.rel !== rel \|\| \(!rel && !still\)\) b\.gl = null;/);
  assert.match(fn, /if \(moving && !glideRaf\) glideRaf = nextFrame\(labelGlideTick\);/);
  assert.match(stage, /function labelGlideTick\(\) \{ glideRaf = 0; if \(F && !camMove\) updateLabels\(F, true\); \}/);   // (one kept function, not a closure made each frame)
  // (Glided before the leaders are drawn, so each leader runs to its label where it stands.)
  const lay = stage.slice(stage.indexOf('function layoutLabels(f, solve, dry = false)'));
  assert.ok(lay.indexOf('labelGlide(out);') > 0 && lay.indexOf('labelGlide(out);') < lay.indexOf('const DISC = 5, pts'));
});

test('leaders and dots are kept by their label: new ones fade in, old ones fade out', () => {
  assert.match(stage, /paintLeaders\(leaders\);/);
  assert.ok(!/gLeaders\.innerHTML = leaders/.test(stage));
  assert.match(stage, /el\.classList\.add\('ld-gone'\);/);
  assert.match(css, /\.lb-leaders > \* \{ transition: opacity var\(--d-small\) var\(--ease\); animation: crossfade var\(--d-small\) var\(--ease\) backwards; \}/);
  assert.match(css, /\.lb-leaders > \.ld-gone \{ opacity: 0; \}/);
});

test("a slide's reading fades out whole, glass and all, and counts to a new number as the tiles do", () => {
  assert.match(stage, /function siteLeave\(k, el\) \{[\s\S]*?el\.classList\.add\('cath-leave'\);[\s\S]*?, reduceMotion\.matches \? 0 : 700(?:, el)?\);/);
  assert.match(css, /\.cath-label\.site\.cath-leave > \.cl-glass \{ visibility: hidden; transition: opacity var\(--d-surface\) var\(--ease\), visibility 0s linear var\(--d-surface\); \}/);
  assert.match(css, /\.cath-label\.site\.cath-leave, \.cath-label\.site\.cath-leave > \* \{ transition-delay: 0s; \}/);
  assert.match(stage, /const COUNT_MS = 950/);
  assert.match(stage, /siteCount\(el, ratio, 0\.15\)/);
  // (The resistors' readings are figure labels at their zigzags now, resItem: no group glides.)
  assert.match(css, /\.cath-label\.site \{ transition: scale var\(--d-surface\) var\(--ease\) \.35s, translate var\(--d-surface\) var\(--ease\); \}/, 'its shadow is no longer eased (1 Nov 2026, move everything to GPU: a colour, shadow or edge eased repaints every frame, so it is taken at once)');
});

test("the resistance zigzag's halo eases with its line, and it is dropped only once faded", () => {
  // (3 Nov 2026: a resistor is a kept record drawn by the overlay painter, over-records.js; its fade is the page's own surface step and
  // curve, run in script. Its width and tone are taken at once, as the CSS took them.)
  assert.match(stage, /const recs = recordLayer\(\{ ease: easeArrive, ms: D_SURFACE \}\);/);
  assert.match(stage, /recs\.drop\(RES_KEYS\[k\], now, reduceMotion\.matches\)/);
  assert.doesNotMatch(css, /\.res-one/, 'no resistor element is styled: none is made');
});

test("the lobule's pointer fades out before it moves to a new spot or takes new words", () => {
  assert.match(lz, /if \(c && !reduce\.matches && \(fading \|\| \(call && classHas\(callEl, 'on'\)\)\)\) \{ if \(call\) callSet\(null\); callSwap = setTimeout\(\(\) => \{ callSwap = 0; callSet\(callWant\); \}, 500\); return; \}/);
});
