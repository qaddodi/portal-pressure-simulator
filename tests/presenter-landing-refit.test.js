// R14: a font or card-size change that arrives while the cards are on their throws is queued once for their landing, not laid out under
// them and not dropped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PZ = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

test('onFonts, the card size observers and the fit pass queue one refit for the landing while a throw runs', () => {
  assert.match(PZ, /const onFonts = \(\) => \{ if \(!ui\) return; if \(thrown\(\)\) layoutAtLanding\(\); else layout\(\); \};/);
  assert.equal([...PZ.matchAll(/cardMoving\(\)\) \{ if \(thrown\(\)\) layoutAtLanding\(\); return; \}/g)].length, 3, 'the two observers and the landing pass itself');
});

test('the queued pass is one at a time, belongs to its talk and cards, and waits for the throws\' own landing', () => {
  const fn = PZ.slice(PZ.indexOf('  function layoutAtLanding() {'), PZ.indexOf('  // ── The data card zoomed to the middle'));
  assert.match(fn, /if \(landQ \|\| !ui\) return;/);
  assert.match(fn, /Promise\.all\(throwCards\(\)\.map\(\(el\) => el && throwLanded\(el\)\)\)/);
  assert.match(fn, /if \(ui !== u \|\| sess !== s \|\| !s\?\.live\(\)\) return;/);
});

test('a real resize still lays out at once', () => {
  const rs = PZ.slice(PZ.indexOf('  const onResize = (e) => {'), PZ.indexOf('  // Projector-size labels'));
  assert.doesNotMatch(rs, /layoutAtLanding/);
  assert.match(rs, /\n {4}layout\(\);/);
});
