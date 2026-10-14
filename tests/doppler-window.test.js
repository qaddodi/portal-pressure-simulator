import test from 'node:test';
import assert from 'node:assert/strict';
import { windowIndexFor } from '../src/ui/dopplerWindow.js';

test('a narrow Doppler trace starts on the 3 s window, a wide one on 6 s', () => {
  assert.equal(windowIndexFor(285), 1);   // beside two tiles (the squished monitor)
  assert.equal(windowIndexFor(359), 1);
  assert.equal(windowIndexFor(360), 0);
  assert.equal(windowIndexFor(700), 0);   // full width
});
