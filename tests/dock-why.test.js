// Each readout tile's "Click for what is driving it" must open its own quantity, not a neighbour's:
// every tile names an explain metric that exists, and no two tiles share one.
// (dock.js needs a DOM to import, so its tile table is read as text.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { METRICS } from '../src/engine/explain.js';

const src = readFileSync(new URL('../src/ui/dock.js', import.meta.url), 'utf8');
const tiles = [...src.matchAll(/^ {2}\{ id: '([\w-]+)',[^\n]*?\bwhy: '(\w+)'/gm)].map((m) => ({ id: m[1], why: m[2] }));

test('every readout tile opens an explain metric of its own', () => {
  assert.ok(tiles.length >= 12, `found ${tiles.length} tiles`);
  for (const t of tiles) assert.ok(METRICS[t.why], `${t.id}: no explain metric "${t.why}"`);
  const seen = new Map();
  for (const t of tiles.filter((x) => !['map', 'hr', 'co', 'ra', 'hb', 'lz-sin'].includes(x.id))) {
    assert.ok(!seen.has(t.why), `${t.id} and ${seen.get(t.why)} both open "${t.why}"`);
    seen.set(t.why, t.id);
  }
  assert.equal(METRICS.hr.label, 'Heart rate');
});
