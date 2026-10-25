import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The stage's view (vt: zoom and place) is replaced, never changed in place. The first fit sets the view, the home framing (homeAt) and the
// glide's target (vtTarget) outright; when they were one object, the first zoom changed all three, the home look (followHome) then took the
// zoomed view for home and glided it back to the fit as soon as a card moved: a pinch in the first seconds after the page opened was undone
// (4 times in 10 loads of the production build; the browser check "pan and pinch: marks and labels stay locked to the figure" tripped on it).
const src = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('no code changes a field of the view in place', () => {
  const hits = src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /\bvt\.[kxy]\s*(?:[-+*/]?=)(?!=)/.test(l));
  assert.deepEqual(hits, [], 'vt.k, vt.x and vt.y are read, never assigned: make a new view');
});

test('the view, the home framing and the glide target are never one object', () => {
  assert.doesNotMatch(src, /\bvt\s*=\s*(?:homeAt|vtTarget|d)\s*=/, 'no chain that gives vt and the home framing one object');
  assert.doesNotMatch(src, /\bhomeAt\s*=\s*vtTarget\b|\bvtTarget\s*=\s*homeAt\b|\bhomeAt\s*=\s*vt\b(?!\.)/, 'nor homeAt and vtTarget, nor homeAt and vt');
  const fit = /if \(figureShown\) \{ homeAt = d;[^\n]*\n\s*else \{([^\n]*)\}/.exec(src);
  assert.ok(fit, 'the first fit is in stage.js');
  assert.match(fit[1], /vt = \{ \.\.\.d \}; homeAt = d; vtTarget = \{ \.\.\.d \};/, 'the first fit, set outright, gives each its own copy');
});

test('a zoom builds a new view', () => {
  const at = src.indexOf('function zoomAt(');
  assert.ok(at > 0);
  const body = src.slice(at, src.indexOf('\n  }\n', at));
  assert.match(body, /vt = \{ k, x: /);
});
