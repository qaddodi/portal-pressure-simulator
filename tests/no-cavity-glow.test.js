// The anatomy has no body-cavity shading: the old soft, lighter pool behind the abdomen read as a glow. Only the
// diaphragm stays on the background plane.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKDROP } from '../src/ui/anatomy.js';


test('no body-cavity glow is drawn behind the abdomen', () => {
  assert.equal(BACKDROP.cavity, undefined);
});

