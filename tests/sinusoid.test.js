// The sinusoid view's drawing targets follow the engine: an open wall with protein-rich lymph when
// healthy, a sealed, capillarized one with protein-poor lymph in cirrhosis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sinusoidTargets } from '../src/ui/sinusoid-model.js';

const base = { fibSin: 0, act: 0, zone: { sin: 1 }, congU: 0, flow: 1, rev: { sin: false }, lymph: 0.6, lymph0: 0.6 };

test('healthy: fenestrae open, no collagen, protein-rich lymph', () => {
  const t = sinusoidTargets({ ...base, sigma: 0.15, lyProt: 0.9 });
  assert.equal(t.por, 1);
  assert.equal(t.col, 0);
  assert.ok(t.prot > 0.9);
  assert.ok(Math.abs(t.lum - 1) < 1e-9);
});

test('cirrhosis: the wall seals, collagen fills Disse, the lumen narrows', () => {
  const t = sinusoidTargets({ ...base, sigma: 0.6, lyProt: 0.47, fibSin: 0.95, act: 0.9, zone: { sin: 21 }, lymph: 3, flow: 0.6 });
  assert.ok(t.por < 1e-9);
  assert.ok(t.bm > 0.9 && t.mv < 0.4 && t.col > 0.9);
  assert.ok(t.prot < 0.15);
  assert.ok(t.lum < 0.75);
  assert.ok(t.filt > 4);
});

test('reversed sinusoidal flow runs the blood backwards', () => {
  assert.ok(sinusoidTargets({ ...base, rev: { sin: true }, lyProt: 0.9 }).v < 0);
});
