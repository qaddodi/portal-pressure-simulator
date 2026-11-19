import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unreachable } from '../scripts/reachability.mjs';

// A module of src/ that the page, the workers, the scripts and the browser tools never reach is dead code, and a unit test that imports it only keeps it alive
// (8 modules and 742 lines stood that way on 19 Nov 2026, one of them pinned by two tests that made deleting it fail). Delete the module with its test.
test('every module of src/ is reached by the page, a worker, a script or a browser tool', () => {
  assert.deepEqual(unreachable(), []);
});
