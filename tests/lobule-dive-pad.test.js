// Diving into a lobule framed zoomed in (a slide aimed at a station), the lobule showed as a cropped box until it
// landed: its layers were the screen's size, scaled down for the dive (Mohammad, 20 Oct, lobule deck 5 → 6).
// The layers are now drawn over the lobule's whole box for that dive, and go back to the screen's size once landed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');

test('an aimed dive draws the whole lobule, not the landing screen\'s rectangle', () => {
  const box = lz.match(/function padBox\(W, H\) \{[\s\S]*?\n {2}\}/)?.[0];
  assert.ok(box, 'the padded box is measured');
  assert.match(box, /r = geo\.R \* V\.k \* 1\.35/, 'it reaches past the lobule\'s rim');
  assert.match(box, /if \(!geo \|\| atFit\) return null;/, 'the fit view (no aim) keeps the screen-sized layers');
  // Staged ahead of the dive, so nothing is drawn mid-zoom.
  assert.match(lz, /setPad\(padBox\([^\n]*\)\); \}\n\s+idleDrawn = ''; draw\(0\); diveDrawn = true;/);
  // Every layer the dive scales is padded, and scaled about the same landing point.
  assert.match(lz, /const PAD_LAYERS = \[tissue, diveCv, glCv, fx\];/);
  assert.match(lz, /e\.style\.transformOrigin = `\$\{\(x \+ \(po\?\.l \|\| 0\)\)\.toFixed\(1\)\}px \$\{\(y \+ \(po\?\.t \|\| 0\)\)\.toFixed\(1\)\}px`;/);
});

test('landed, the layers return to the screen\'s size only once the picture has settled, and on release', () => {
  assert.match(lz, /if \(pad && fade > 0\.98 && !diveScaled && flowA >= 1\) setPad\(null\);/);
  assert.match(lz, /function release\(\) \{\n\s+setPad\(null\);/);
});
