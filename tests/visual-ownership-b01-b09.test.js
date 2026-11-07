// Visual-ownership fixes from the 2 Nov 2026 static review (bugs-recs.md): B01, B02, B07/B08, B09. Source pins, as the repo's other
// render tests are (no browser here).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const util = rd('util.js'), words = rd('gl-words.js'), trace = rd('trace-gl.js'), svg = rd('svg-gl.js'), throwJs = rd('card-throw.js');

test('B01: once a wrapper exists putText routes every update through it, and the flush lands through it (no textContent over its canvas)', () => {
  assert.match(util, /if \(w\?\.disposed\) \{ wordsOfEl\.delete\(el\); w = null; \}/);
  assert.match(util, /if \(w && !odos\.has\(el\)\) \{[\s\S]*?if \(w\.text !== t\) w\.set\(t\);/);
  assert.doesNotMatch(util, /w && !odos\.has\(el\) && \(!el\.firstChild/, 'no single-text-node condition on the wrapper route');
  assert.match(util, /const w = wordsOfEl\.get\(el\);\n\s+if \(w && !w\.disposed\) \{ w\.now\(t\); continue; \}/);
  assert.match(words, /get owns\(\) \{ return !S\.dead && !!S\.txt && S\.txt\.parentNode === el; \}/);
});

test('B02: a measure asked while the picture is up is kept (dirty), landed and measured again, and no draw uses the stale look meanwhile', () => {
  assert.match(words, /if \(S\.on \|\| S\.pend\) \{ S\.stale = true; if \(S\.on\) askLand\(S\); return; \}/);
  assert.match(words, /S\.at = at; S\.stale = false;/);
  assert.match(words, /if \(!S\.at \|\| S\.stale \|\| S\.at\.sm !== /);
  assert.match(words, /if \(!S\.at \|\| S\.stale \|\| !glyphsReady\(\)/);
});

test('B07/B08: the card-copy hold (canvas copies, PICS_MAX, stale-value clones) is gone, so no clone can replace a card', () => {
  assert.doesNotMatch(throwJs, /PICS_MAX|cloneNode|glw-cv/);
  assert.doesNotMatch(throwJs, /railHold|railable/);
});
