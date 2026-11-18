// R14: a font or card-size change that arrives while the cards are on their throws is queued once for their landing, not laid out under
// them and not dropped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { presenterSource } from './split-src.js';

const PZ = presenterSource();

test('onFonts, the card size observers and the fit pass queue one refit for the landing while a throw runs', () => {
  assert.match(PZ, /const onFonts = \(\) => \{\n\s+if \(!(?:live\.)?ui\) return;\n[^\n]*\n[^\n]*\n\s+if \((?:live\.)?thrown\(\)\) layoutAtLanding\(\); else layout\(\);\n\s+\};/);
  assert.equal([...PZ.matchAll(/cardMoving\(\)\) \{ if \(thrown\(\)\) layoutAtLanding\(\); return; \}/g)].length, 3, 'the two observers and the landing pass itself');
});

test('the queued pass is one at a time, belongs to its talk and cards, and waits for the throws\' own landing', () => {
  const fn = PZ.slice(PZ.indexOf('  function layoutAtLanding() {'), PZ.indexOf('  const zoomOn = () =>'));
  assert.match(fn, /if \(landQ \|\| !(?:live\.)?ui\) return;/);
  assert.match(fn, /Promise\.all\(throwCards\(\)\.map\(\(el\) => el && throwLanded\(el\)\)\)/);
  assert.match(fn, /if \((?:live\.)?ui !== u \|\| (?:live\.)?sess !== s \|\| !s\?\.live\(\)\) return;/);
});

test('a real resize still lays out at once', () => {
  const rs = PZ.slice(PZ.indexOf('  const onResize = (e) => {'), PZ.indexOf('\n  };', PZ.indexOf('  const onResize = (e) => {')));
  assert.doesNotMatch(rs, /layoutAtLanding/);
  assert.match(rs, /\n {4}layout\(\);/);
});
