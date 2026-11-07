// Render-cost plan 1 (5 Nov 2026): one answer to "is the stage seen?" for the anatomy's, the lobule's and the sinusoid's loops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageCoveredBy, stageCovered } from '../src/ui/seen.js';

const docWith = (classes, hidden = false) => {
  const set = new Set(classes);
  const app = { isConnected: true, classList: { contains: (c) => set.has(c) } };
  return { hidden, getElementById: (id) => (id === 'app' ? app : null), set };
};

test('each reason the stage is covered', () => {
  assert.equal(stageCoveredBy(docWith([], true)), 'page hidden');
  assert.equal(stageCoveredBy(docWith(['home-open'])), 'home');
  assert.equal(stageCoveredBy(docWith(['presenting', 'pz-blacked'])), 'black screen');
  assert.equal(stageCoveredBy(docWith(['presenting'])), '');
  assert.equal(stageCovered(docWith(['pz-blacked'])), true);
  assert.equal(stageCoveredBy(null), '');
});

