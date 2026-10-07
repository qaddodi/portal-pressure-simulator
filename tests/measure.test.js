import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { measureView, veinBlocked } from '../src/ui/measure-model.js';

const state = (id) => { const e = new Engine(); e.loadPreset(id); return { m: computeMetrics(e), p: e.params }; };

test('sinusoidal state: labeled FHVP/WHVP/HVPG, nothing blocked', () => {
  const { m, p } = state('cirr-comp');
  const v = measureView(m, p, null);
  assert.equal(v.blocked, false);
  assert.deepEqual(v.model.map((r) => r[0]), ['FHVP', 'WHVP', 'HVPG']);
  assert.ok(v.model.every((r) => r[2] === 'mmHg' && r[3]));
});

test('Budd-Chiari: not interpretable, hepatic vein values withheld, network pressures separate', () => {
  const { m, p } = state('budd-chiari');
  assert.equal(veinBlocked(p, 'R'), true);
  const v = measureView(m, p, null);
  assert.equal(v.blocked, true);
  assert.equal(v.model.length, 0);
  assert.equal(v.recorded.length, 0);
  assert.match(v.notes[0], /Not interpretable/);
  assert.ok(v.network.length >= 2);
});

test('a case that hides true HVPG and portal pressure shows only recorded values', () => {
  const { m, p } = state('cirr-comp');
  const v = measureView(m, p, new Set(['trueHVPG', 'pv']));
  assert.equal(v.model.length, 0);
  assert.equal(v.network.length, 0);
});
