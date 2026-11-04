import { stageSource } from './stage-src.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// While the GPU draws the plate, its SVG groups are hidden, and their masks are turned off with them: a hidden group's mask
// is still built on each repaint (the diaphragm's covered the whole abdomen with ascites, on every pan frame). The copy the
// GPU draws is cloned from the mask attributes, which the rule leaves alone.
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const stage = stageSource();

test('the hidden plate groups draw no masks', () => {
  const hide = css.match(/\.stage-view\.gl-plate :is\(([^)]*)\) \{ visibility: hidden; \}/);
  assert.ok(hide, 'the plate groups hide under gl-plate');
  const off = css.match(/\.stage-view\.gl-plate :is\(([^)]*)\) \{ mask: none; \}/);
  assert.ok(off, 'their masks are off under gl-plate');
  for (const id of hide[1].split(',').map((x) => x.trim())) {
    assert.ok(off[1].includes(`${id} [mask]`), `${id}: masks inside it stay on while hidden`);
  }
  assert.ok(off[1].split(',').map((x) => x.trim()).includes('#backdrop'), 'the diaphragm mask (on #backdrop itself) is off');
});


test('the page\'s own ascites, hidden while the GPU draws the fluid, builds no clip or mask either', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.stage-view\.gl-on :is\(#ascites, #ascites \[mask\]\) \{ mask: none; clip-path: none; \}/);
});


test('the caudate\'s veins build no mask once the lobe has faded out and hidden, and get it back as it fades in', () => {
  assert.match(css, /\.caud \{ opacity: 0; visibility: hidden;[^\n]*visibility 0s var\(--d-surface\); \}/);
  assert.match(css, /\.caud\.gone \.caud-veins \{ mask: none; \}/);
  assert.match(stage, /stageScope\.clear\(goneT\);\n\s+if \(on\) g\.classList\.remove\('gone'\); else goneT = stageScope\.timer\(\(\) => g\.classList\.add\('gone'\), 760\);/);
  assert.match(stage, /const veinsG = s\('g', \{ mask: 'url\(#caudMask\)', class: 'caud-veins' \}\);/);
});

test('the vessels are drawn by the GPU alone: no SVG tube part, halo, vessel mask or hit stroke is left', () => {
  assert.doesNotMatch(css, /\.v-hit\b/, 'no hit stroke left either: vessels are picked on their data');
  assert.doesNotMatch(css, /\.v-(shadow|wallP|lumenP|wall|lumen|shade|sheen|select|artery|halo|strand-wall)\b/);
  assert.doesNotMatch(css, /\.vg:not\(:focus-within\) \{ mask: none; \}/);
  assert.doesNotMatch(stage, /class: 'v-(wall|lumen|halo|shadow|shade|sheen)'/);
});

test('the liver\'s disease layers are hidden while faded to 0 (a clipped path at opacity 0 still drew its layer)', () => {
  assert.match(stage, /const lvFade = \(el, a\) => \{ const o = a\.toFixed\(3\), v = \+o > 0 \? '' : 'hidden'; el\.style\.opacity = o; if \(el\.style\.visibility !== v\) el\.style\.visibility = v; \};/);
  for (const k of ['cong', 'isl', 'sep', 'nod']) assert.match(stage, new RegExp(`${k}: s\\('path', \\{[^\\n]*class: 'lv-${k}', 'clip-path': 'url\\(#clip-liver\\)', style: 'opacity:0;visibility:hidden' \\}\\)`));
  assert.match(stage, /lvFade\(lv\.sep, cn\); lvFade\(lv\.nod, cn\);/);
  assert.match(stage, /const gn = (?:live\.)?(?:live\.)?smooth01\(g \/ 0\.5\); lvFade\(lv\.cong, gn\); lvFade\(lv\.isl, gn\);/);
});
