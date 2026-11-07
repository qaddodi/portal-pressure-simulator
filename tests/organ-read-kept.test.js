import { stageSource } from './stage-src.js';
// The organs' groups are read for painting (organ-paint readGroup) once and kept until something they were read from changes
// (2 Nov 2026, merged GPU plan; motion budget: about 1,800 to 3,000 style reads in one Varices slide change were the same groups
// read again).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = stageSource();
const paint = readFileSync(new URL('../src/ui/organ-paint.js', import.meta.url), 'utf8');

test('a reading is kept with its group and the gradients it read', () => {
  assert.match(stage, /if \(!\(gOrgans\.contains\(el\) \|\| gBackdrop\.contains\(el\) \|\| defs\.contains\(el\)\)\) return readGroupNow\(el, opt\);/,
    'only what the watch sees is kept: the overlays (the tamponade tube, rebuilt each frame it moves) are read afresh, or the GPU shows their first reading for good');
  assert.match(stage, /ok = opt \? `\$\{!!opt\.withMask\}\|\$\{!!opt\.nest\}\|\$\{!!opt\.strict\}\|\$\{!!opt\.shown\}`/, 'a strict reading is never handed out for a loose one, nor a shown one for another');
  assert.match(paint, /function readGradient\(doc, id\) \{\n\s+refsOut\?\.add\(id\);/, 'every gradient read is named');
  assert.match(paint, /export function readGroupRefs\(root, opt\) \{\n\s+REFS_TMP\.clear\(\);\n\s+refsOut = REFS_TMP;\n\s+let spec;\n\s+try \{ spec = readGroup\(root, opt\); \} finally \{ refsOut = null; \}/);
  assert.match(stage, /m\.set\(ok, \{ look: readLook\(\), spec, refs \}\)/);
});

test('a change drops only the readings it touches; a change to the organs\' own roots or other defs drops them all', () => {
  assert.match(stage, /if \(el\.contains\(t\) \|\| t\.contains\(el\) \|\| \(id && \[\.\.\.m\.values\(\)\]\.some\(\(k\) => k\.refs\.has\(id\)\)\)\) readKept\.delete\(el\);/);
  assert.match(stage, /if \(t === gOrgans \|\| t === gBackdrop \|\| \(defs\.contains\(t\) && !readGrad\(t\)\)\) \{ readEpoch\+\+; readKept\.clear\(\); return; \}/);
  for (const root of ['gOrgans', 'gBackdrop', 'defs']) assert.ok(stage.includes(`for (const root of [gOrgans, gBackdrop, defs]) readMo.observe(root, { subtree: true, childList: true, attributes: true, attributeOldValue: true`), root);
  assert.match(stage, /const readLook = \(\) => \{[^\n]*themeKey\(\)[^\n]*organKey\(wrap\)\}\|\$\{organKey\(document\.documentElement\)\}/, 'a theme or lens change reads again');
  assert.match(stage, /try \{ for \(const sh of document\.styleSheets\) walk\(sh\.cssRules\); \} catch \{ organCls = null; \}/, 'a sheet that cannot be read keeps every class');
  assert.match(stage, /const organKey = \(el\) => \{ const c = organClasses\(\); return c \? \[\.\.\.el\.classList\]\.filter\(\(k\) => c\.has\(k\)\)\.sort\(\)\.join\(' '\) : el\.className; \};/);
});

test('what eases (outlines, opacities) and the lens grey (always taken off for a read) keep the readings', () => {
  assert.match(stage, /if \(m\.attributeName === 'd'\) \{ if \(!m\.oldValue !== !now\) readDrop\(m\.target\); continue; \}/);
  assert.match(stage, /filter\(\(m\) => !\/!\\s\*important\/i\.test\(m\[2\]\)\)/);
  assert.match(stage, /g\.el\.style\.setProperty\(g\.p, greyOf\(g\.c, q\), 'important'\)/, 'the grey is set !important');
  const sig = (v) => [...String(v || '').matchAll(/(?:^|;)\s*(display|visibility|fill|stroke|stroke-width|stroke-dasharray|mask|clip-path|filter|stop-color|stop-opacity|mix-blend-mode|fill-rule)\s*:\s*([^;]*)/g)]
    .filter((m) => !/!\s*important/i.test(m[2])).map((m) => `${m[1]}:${m[2].trim()}`).sort().join(';');
  assert.equal(sig('opacity: 0.4; transform: translate(2px)'), sig('opacity: 0.9'));
  assert.equal(sig('fill: rgb(1, 2, 3) !important'), sig(''));
  assert.notEqual(sig('display: none'), sig(''));
});

test('the backdrop (the diaphragm) is read as shown: it is out of the page\'s layout (display: none) while the GPU draws the plate', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  // Why it must be: the plate's rule takes the backdrop out of layout, and a root that is display: none is read as hidden. 2 Nov 2026, e6d08386:
  // every reading made once the plate was up left the diaphragm out of the GPU's layers.
  assert.match(css, /\.stage-view\.gl-plate #backdrop \{ display: none; \}/);
  assert.match(stage, /const BACKDROP_READ = \{ shown: true \};/);
  assert.equal([...stage.matchAll(/add\('back', gBackdrop, BACKDROP_READ\)/g)].length, 2, 'both the whole set and the changing organs read the backdrop as shown');
  assert.doesNotMatch(stage, /add\('back', gBackdrop\)/);
  assert.match(stage, /if \((?:getComputedStyle|csNow)\(el\)\.display === 'none' && !opt\?\.shown\) return;/);
  assert.match(paint, /if \(cs\.display === 'none' && !\(c\.shown && el === root\)\) return;/);
});
