// ?offgpu=1 names the caller of each counted call (16 Nov 2026: a report listed one address, chunk-XCRVZ23O.js:2:330, for every site,
// because the built page's first frame outside offgpu-overlay.js was the overlay's own counting function). The stack's own three
// frames (site, count, the wrapper) are skipped by depth, so the first one left is the page's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callers } from '../src/ui/offgpu-overlay.js';

test('the caller is the frame after the overlay\'s three, in a Chrome stack', () => {
  const stack = ['Error', 'at site (https://x.io/preview/assets/chunk-AAA.js:2:100)', 'at count (https://x.io/preview/assets/chunk-AAA.js:2:330)',
    'at HTMLElement.getBoundingClientRect (https://x.io/preview/assets/chunk-AAA.js:2:900)', 'at readBox (https://x.io/preview/assets/chunk-BBB.js:7:41)',
    'at measureGeo (https://x.io/preview/assets/chunk-BBB.js:9:12)'].join('\n');
  assert.equal(callers(stack), 'readBox (/preview/assets/chunk-BBB.js:7:41) ← measureGeo (/preview/assets/chunk-BBB.js:9:12)');
});

test('and in a Safari stack, which has no header line', () => {
  const stack = ['site@https://x.io/a/c.js:2:10', 'count@https://x.io/a/c.js:2:20', 'wrapper@https://x.io/a/c.js:2:30', 'readBox@https://x.io/a/d.js:1:5'].join('\n');
  assert.equal(callers(stack, 1), 'readBox@/a/d.js:1:5');
});

test('an empty stack gives an empty caller, never a throw', () => {
  assert.equal(callers(''), '');
  assert.equal(callers(undefined), '');
});
