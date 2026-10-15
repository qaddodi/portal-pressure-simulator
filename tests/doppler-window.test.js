import test from 'node:test';
import assert from 'node:assert/strict';
import { windowIndexFor } from '../src/ui/dopplerWindow.js';

test('a narrow Doppler trace starts on the 3 s window, a wide one on 6 s', () => {
  assert.equal(windowIndexFor(285), 1);   // beside two tiles (the squished monitor)
  assert.equal(windowIndexFor(359), 1);
  assert.equal(windowIndexFor(360), 0);
  assert.equal(windowIndexFor(700), 0);   // full width
});

import { scaleFor } from '../src/ui/dopplerWindow.js';

test('the velocity scale clears a high stent jet instead of stopping at 300 cm/s', () => {
  assert.equal(scaleFor(60), 80);
  assert.equal(scaleFor(250), 300);
  assert.equal(scaleFor(325), 400);   // TIPS distal narrowing, 325 cm/s: the spectrum no longer fills the box
  assert.equal(scaleFor(700), 1000);
});
