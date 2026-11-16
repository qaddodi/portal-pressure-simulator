// The bile canaliculus in the sinusoid view (Mohammad, 16 Nov 2026: "Build the named canaliculus"): drawn on the GPU at each border
// between hepatocytes, mid-plate, cut across, still, and named "Bile canaliculus" (always on a wide screen; on a portrait one only while a
// slide points at it). Its name's leader lands where canaliculusAt() says, the shader's edgeAt(j, sd, HEP / 2); the source shapes that
// tie the two together are in scripts/rules-lint.mjs (PR-02).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canaliculusAt, cellEdge, CELL, SEED } from '../src/ui/sinusoid-gl.js';

test('one canaliculus on each cell border, in order along the plate', () => {
  for (const sd of [SEED.plateUp, SEED.plateDn]) for (let j = -20; j <= 20; j++) {
    const x = canaliculusAt(j, sd);
    assert.ok(Number.isFinite(x));
    assert.ok(Math.abs(x - cellEdge(j, sd)) <= 2.0001, `border ${j}: on its border (the bend moves it at most 2 µm at mid-plate)`);
    assert.ok(x > canaliculusAt(j - 1, sd) + CELL / 2, `border ${j}: one per border, in order`);
  }
});
