// A tile's name never runs out of its tile (17 Nov 2026, play-test finding 7: on a Mac at 1024 "Liver blood flow, % of healthy" was wider than its
// tile, its short form "Liver flow vs healthy" was nearly as wide, and the centred name clipped on both sides into its neighbour's).
// The fit (presenter-zoom.js fitCards) goes long name, short name (data-s), then wraps; the wrap step is pinned in scripts/source-shapes/tile-names-17nov.mjs.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { TILE } from '../src/ui/table-marks.js';

const SHORT_MAX = 14;   // characters a short name may take: it has to fit the narrowest tile (a column of tiles beside an instrument)

test('every tile with a short name has one that is shorter than the long name and fits a narrow tile', () => {
  for (const [k, v] of Object.entries(TILE)) {
    if (v.n == null) continue;
    assert.ok(v.n.length < v.t.length || v.t.length <= 10, `${k}: the short name "${v.n}" is not shorter than "${v.t}", so it cannot make room`);
    assert.ok(v.n.length <= SHORT_MAX, `${k}: the short name "${v.n}" is ${v.n.length} characters, over ${SHORT_MAX}`);
  }
});

test('a long tile name has a short form', () => {
  for (const [k, v] of Object.entries(TILE)) assert.ok(v.t.length <= 22 || v.n, `${k}: "${v.t}" (${v.t.length} characters) has no short name`);
});
