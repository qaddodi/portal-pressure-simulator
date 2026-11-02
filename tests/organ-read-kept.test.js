// The organs' groups are read for painting (organ-paint readGroup) once and kept until something they were read from changes
// (2 Nov 2026, merged GPU plan; motion budget: about 1,800 to 3,000 style reads in one Varices slide change were the same groups
// read again). ?organread=0 reads them every time, as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const paint = readFileSync(new URL('../src/ui/organ-paint.js', import.meta.url), 'utf8');

test('a reading is kept with its group and the gradients it read, and ?organread=0 reads every time', () => {
  assert.match(stage, /const READ_KEEP = !\/\[\?&\]organread=0\\b\/\.test\(location\.search\);/);
  assert.match(stage, /if \(!READ_KEEP\) return readGroupNow\(el, opt\);/);
  assert.match(paint, /function readGradient\(doc, id\) \{\n\s+refsOut\?\.add\(id\);/, 'every gradient read is named');
  assert.match(paint, /export function readGroupRefs\(root, opt\) \{\n\s+refsOut = new Set\(\);\n\s+try \{ return \{ spec: readGroup\(root, opt\), refs: refsOut \}; \} finally \{ refsOut = null; \}/);
  assert.match(stage, /m\.set\(ok, \{ look: readLook\(\), spec, refs \}\)/);
});

test('a change drops only the readings it touches; a change to the organs\' own roots or other defs drops them all', () => {
  assert.match(stage, /if \(el\.contains\(t\) \|\| t\.contains\(el\) \|\| \(id && \[\.\.\.m\.values\(\)\]\.some\(\(k\) => k\.refs\.has\(id\)\)\)\) readKept\.delete\(el\);/);
  assert.match(stage, /if \(t === gOrgans \|\| t === gBackdrop \|\| \(defs\.contains\(t\) && !readGrad\(t\)\)\) \{ readEpoch\+\+; readKept\.clear\(\); return; \}/);
  for (const root of ['gOrgans', 'gBackdrop', 'defs']) assert.ok(stage.includes(`for (const root of [gOrgans, gBackdrop, defs]) readMo.observe(root, { subtree: true, childList: true, attributes: true, attributeOldValue: true`), root);
  assert.match(stage, /const readLook = \(\) => \{[^\n]*themeKey\(\)[^\n]*gestureFree\(wrap\.className\)/, 'a theme or lens change reads again');
});

test('what eases (outlines, opacities) and the lens grey (always taken off for a read) keep the readings', () => {
  assert.match(stage, /if \(m\.attributeName === 'd'\) \{ if \(!m\.oldValue !== !now\) readDrop\(m\.target\); continue; \}/);
  assert.match(stage, /filter\(\(m\) => !\/!\\s\*important\/i\.test\(m\[2\]\)\)/);
  assert.match(stage, /g\.el\.style\.setProperty\(g\.p, greyOf\(g\.c, sat\), 'important'\)/, 'the grey is set !important');
  const sig = (v) => [...String(v || '').matchAll(/(?:^|;)\s*(display|visibility|fill|stroke|stroke-width|stroke-dasharray|mask|clip-path|filter|stop-color|stop-opacity|mix-blend-mode|fill-rule)\s*:\s*([^;]*)/g)]
    .filter((m) => !/!\s*important/i.test(m[2])).map((m) => `${m[1]}:${m[2].trim()}`).sort().join(';');
  assert.equal(sig('opacity: 0.4; transform: translate(2px)'), sig('opacity: 0.9'));
  assert.equal(sig('fill: rgb(1, 2, 3) !important'), sig(''));
  assert.notEqual(sig('display: none'), sig(''));
});
