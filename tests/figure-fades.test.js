// The figure's labels, their leaders, the slides' readings (sites and resistors) and the lobule's pointer fade and glide on a slide's
// or a patient's change, never snap (17 Oct: "resistance and labels and callouts all snap instead of fade or transition").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const stage = read('src/ui/stage.js'), css = read('styles/app.css'), lz = read('src/ui/lobule-zoom.js');

test('a label no longer wanted fades out before it leaves, and fades back if wanted again', () => {
  assert.match(stage, /b\.g\.classList\.add\('lb-off'\);\s*const tok = b\.gone = \{\};\s*setTimeout\(\(\) => \{ if \(b\.gone === tok\) \{ b\.gone = null; b\.g\.style\.display = 'none'; \} \}, 360\);/);
  assert.match(stage, /b\.gone = null;\s*b\.g\.style\.display = '';/);
  assert.match(css, /#labels \.lb \{ transition: opacity \.3s var\(--ease\); animation: pz-fade \.3s var\(--ease\) both; \}/);
  // (Never the old instant drop.)
  assert.ok(!/b\.seen !== frameNo && !\(k === 'scan' && \(scan\.leaving \|\| scan\.on\)\)\) b\.g\.style\.display = 'none'/.test(stage));
});

test('a moved label glides, keeping to the point it names, and is laid out each frame until it lands', () => {
  const fn = stage.slice(stage.indexOf('function labelGlide(out)'), stage.indexOf('function paintLeaders('));
  assert.match(fn, /const ox = rel \? it\.ax : 0, oy = rel \? it\.ay : 0, tx = it\.x - ox, ty = it\.y - oy;/);
  // (Hidden figure, reduced motion, a label just shown or turned: it takes its spot at once.)
  assert.match(fn, /const snap = reduceMotion\.matches \|\| camMove \|\| wrap\.classList\.contains\('cam-move'\)/);
  assert.match(fn, /if \(!b\.at \|\| snap \|\| b\.rot !== !!it\.rot \|\| b\.rel !== rel \|\| \(!rel && !still\)\) b\.gl = null;/);
  assert.match(fn, /if \(moving && !glideRaf\) glideRaf = nextFrame\(\(\) => \{ glideRaf = 0; if \(F && !camMove\) updateLabels\(F, true\); \}\);/);
  // (Glided before the leaders are drawn, so each leader runs to its label where it stands.)
  const lay = stage.slice(stage.indexOf('function layoutLabels(f, solve)'));
  assert.ok(lay.indexOf('labelGlide(out);') > 0 && lay.indexOf('labelGlide(out);') < lay.indexOf('const DISC = 5, pts'));
});

test('leaders and dots are kept by their label: new ones fade in, old ones fade out', () => {
  assert.match(stage, /paintLeaders\(leaders\);/);
  assert.ok(!/gLeaders\.innerHTML = leaders/.test(stage));
  assert.match(stage, /el\.classList\.add\('ld-gone'\);/);
  assert.match(css, /\.lb-leaders > \* \{ transition: opacity \.3s var\(--ease\); animation: pz-fade \.3s var\(--ease\) both; \}/);
  assert.match(css, /\.lb-leaders > \.ld-gone \{ opacity: 0; \}/);
});

test("a slide's reading fades out whole, glass and all, and counts to a new number as the tiles do", () => {
  assert.match(stage, /function siteLeave\(k, el\) \{[\s\S]*?el\.classList\.add\('cath-leave'\);[\s\S]*?, reduceMotion\.matches \? 0 : 700\);/);
  assert.match(css, /\.cath-label\.site\.cath-leave > \.cl-glass \{ visibility: hidden; transition: opacity \.6s var\(--ease\), visibility 0s linear \.6s; \}/);
  assert.match(css, /\.cath-label\.site\.cath-leave, \.cath-label\.site\.cath-leave > \* \{ transition-delay: 0s; \}/);
  assert.match(stage, /const COUNT_MS = 950/);
  assert.match(stage, /siteCount\(el, ratio, 0\.15\)/);
  // (The resistors' group glides when a reading joins it; class-driven offsets ease too.)
  assert.match(stage, /resDy = ra0 && resH \? resShift\(resDy\)/);
  assert.match(css, /\.cath-label\.site \{ transition: scale \.6s var\(--ease\) \.35s, box-shadow \.6s var\(--ease\) \.35s, translate \.45s var\(--ease\); \}/);
});

test("the resistance zigzag's halo eases with its line, and it is removed only once faded", () => {
  assert.match(css, /\.res-one \.res-halo \{[^}]*transition: stroke-width \.8s var\(--ease\), stroke \.6s var\(--ease\), opacity \.6s var\(--ease\); \}/);
  assert.match(stage, /setTimeout\(\(\) => g\.remove\(\), 700\)/);
});

test("the lobule's pointer fades out before it moves to a new spot or takes new words", () => {
  assert.match(lz, /if \(c && !reduce\.matches && \(fading \|\| \(call && callEl\.classList\.contains\('on'\)\)\)\) \{ if \(call\) callSet\(null\); callSwap = setTimeout\(\(\) => \{ callSwap = 0; callSet\(callWant\); \}, 500\); return; \}/);
});
