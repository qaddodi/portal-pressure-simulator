import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { veinBlocked } from '../src/ui/measure-model.js';

const params = (id) => { const e = new Engine(); e.loadPreset(id); return e.params; };

test('sinusoidal state: the right hepatic vein is open, so a wedge reading is interpretable', () => {
  assert.equal(veinBlocked(params('cirr-comp'), 'R'), false);
});

test('Budd-Chiari: the right hepatic vein is blocked, so no wedge reading is taken', () => {
  assert.equal(veinBlocked(params('budd-chiari'), 'R'), true);
});
