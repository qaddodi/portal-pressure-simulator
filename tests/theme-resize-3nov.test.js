import { stageSource } from './stage-src.js';
// Glitch audit second pass (3 Nov 2026): TH1/TH2 theme epoch, RS1-RS5 resize, FN1/FN2 fonts, FL1 first load.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('TH1: the surfaces that redraw for a new look listen to the one theme epoch, not their own observers', () => {
  for (const f of ['src/ui/widget-gl.js', 'src/ui/col-wave.js', 'src/ui/gl-words.js', 'src/ui/stage.js', 'src/ui/main.js']) assert.match(f === 'src/ui/stage.js' ? stageSource() : src(f), /onTheme\(/, f);
  const E = src('src/ui/theme-epoch.js');
  assert.match(E, /export function onTheme/);
  assert.match(E, /export function themeSettled/);
  assert.equal((E.match(/new MutationObserver/g) || []).length, 1);
});

test('RS1: the late home looks run only if the stage box moved since the last look', () => {
  const S = stageSource();
  assert.match(S, /setTimeout\(lookHomeIfMoved, 500\)/);
  assert.match(S, /setTimeout\(lookHomeIfMoved, 1300\)/);
  assert.doesNotMatch(S, /setTimeout\(lookHome, (500|1300)\)/);
});

test('RS2/RS3: the Tests card sizes itself in one rest pass per frame and keeps the pair it was cut from', () => {
  const D = src('src/ui/dock.js');
  assert.match(D, /addEventListener\('resize', \(\) => \{ if \(!sizeAsk\) sizeAsk = restPass\(sizePass\); \}\)/);
  assert.match(D, /wanted = open\.slice\(0, 2\); open = open\.slice\(0, 1\)/);
  assert.match(D, /open = wanted; wanted = null/);
});

test('RS4/RS5: the charts drop their looks once a resize has settled; the labels re-arm the density query', () => {
  assert.doesNotMatch(src('src/ui/svg-gl.js'), /addEventListener\('resize', \(\) => clearShared\(\)\)/);
  assert.match(src('src/ui/svg-gl.js'), /sizeT = setTimeout\(\(\) => \{ sizeT = 0; if \(!themeAsk\) themeAsk = restPass\(themeRead\); \}, 150\)/);
  assert.match(src('src/ui/label-gl.js'), /\{ once: true \}\);\n {2}watchDensity\(\);/);
});

test('FN1/FN2: label widths drop at every font that loads; the fallback face has Inter\'s metrics', () => {
  assert.match(stageSource(), /fonts\?\.addEventListener\?\.\('loadingdone', fontsIn\)/);
  assert.match(src('fonts/fonts.css'), /font-family: 'Inter Fallback';[\s\S]*size-adjust: 107\.4%;[\s\S]*ascent-override/);
  assert.match(src('styles/tokens.css'), /--font-ui: 'Inter', 'Inter Fallback'/);
});

test('FL1: the loading cover waits for the labels\' and the glass\'s first picture', () => {
  for (const f of ['src/ui/label-gl.js', 'src/ui/glass-gl.js']) assert.match(src(f), /holdCover\(new Promise\(\(done\) => \{ coverOpen = done;/, f);
});
