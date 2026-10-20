// A zoomed-in lobule whose free space changes (a presenter slide's cards coming in) glides to its new framing, never jumps:
// leaving a central-vein close-up for an anatomy slide snapped the lobule sideways before the zoom out (20 Oct).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');

test('refit of a zoomed-in lobule glides to the clamped framing', () => {
  const refit = js.match(/function refit\(\) \{[\s\S]*?else reclamp\(\); \}\n/)?.[0];
  assert.ok(refit, 'the zoomed-in case goes through reclamp');
  assert.doesNotMatch(refit, /else \{ clampV\(\); viewChanged\(\); \}/, 'no snap to the clamp');
  const re = js.match(/function reclamp\(\) \{[\s\S]*?\n {2}\}/)[0];
  assert.match(re, /Object\.assign\(V, saved\)/, 'the clamp is measured on a copy');
  assert.match(re, /glideTo\(to, \d+\)/, 'and glided to');
});
