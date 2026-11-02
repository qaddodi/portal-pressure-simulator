import test from 'node:test';
import assert from 'node:assert/strict';
import { setLive, getLive, dropLive } from '../src/ui/live-style.js';

test('a held style value is read until the page has it written', () => {
  const el = {};
  assert.equal(getLive(el, 'opacity'), undefined);
  setLive(el, 'opacity', '0.4');
  assert.equal(getLive(el, 'opacity'), '0.4');
  setLive(el, 'opacity', '0.6');
  assert.equal(getLive(el, 'opacity'), '0.6');
  dropLive(el, 'opacity');
  assert.equal(getLive(el, 'opacity'), undefined);
});
