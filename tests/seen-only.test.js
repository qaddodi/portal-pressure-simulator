// R17 (2 Nov 2026): a hidden consumer's work is left out at the source: the side panel's readings wait while it is shut and take
// the newest frame the moment it shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');

test('the panel\'s readings are painted only while it shows, and the kept frame lands when it opens', () => {
  assert.doesNotMatch(main, /SEEN_ONLY|seenonly/);
  assert.match(main, /if \(panelShown\(\)\) \{ inspStale = null; inspector\.update\(f\); \}\n\s+else inspStale = f;/);
  assert.match(main, /inspSeen\.observe\(app, \{ attributes: true, attributeFilter: \['class'\] \}\);/);
});
