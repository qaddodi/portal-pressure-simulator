// The lobule's flow tiles say what their % is of, and a reversed portal inflow says so beside the number
// ("Sinusoids 93% of healthy", "Portal in −21% of healthy, reversed"; 16 Nov 2026).
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOBULE_TILES } from '../src/ui/dock.js';

const by = (id) => LOBULE_TILES.find((t) => t.id === id);

test('every percent flow tile names its referent', () => {
  for (const id of ['lz-sin', 'lz-pv', 'lz-art']) {
    const t = by(id);
    assert.equal(t.u, '%');
    assert.equal(t.ux, ' of healthy', id);
    assert.doesNotMatch(t.title, /of normal/, id);
  }
});

test('a portal inflow below zero says reversed beside the number, and the status word agrees', () => {
  const t = by('lz-pv');
  assert.equal(t.uxs(-21), ' of healthy, reversed');
  assert.equal(t.uxs(75), ' of healthy');
  assert.equal(t.s(-21), 'Reversed');
  assert.equal(t.uxs(-2), t.s(-2) === 'Reversed' ? ' of healthy, reversed' : ' of healthy', 'the cut-off is the status word’s');
});
