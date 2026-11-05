// Circuit slide 4 ("A meal raises portal flow"), framed gut to liver on a sideways iPad (1366 x 1024; teaching-cards headless run, finding
// #5): every station's reading stands clear of the vessels, the resistors' zigzags and the stations' rings. "Spleen 12.0" had sat on the
// colon's vein beside its station: rescued far out on a leader across four vessels, the tidy moved it onto that vein. The real stage, in node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootCircuitSlide, labelFaults } from './circuit-slide-stage.js';

test('iPad 1366: the Circuit slide\'s readings are clear of vessels, zigzags and rings', async () => {
  const { st } = await bootCircuitSlide({ W: 1366, H: 1024, cardR: 570 });
  const got = labelFaults(st, /^n:/, 1);
  assert.ok(got.length >= 6 && got.some((g) => g.key === 'n:SPL'), `the slide's stations are read, the spleen's among them: ${got.map((g) => g.key)}`);
  for (const g of got) {
    assert.deepEqual(g.vessels, [], `${g.key} at ${g.box} sits on ${g.vessels}`);
    assert.deepEqual(g.rings, [], `${g.key} at ${g.box} covers a station's ring at ${JSON.stringify(g.rings)}`);
  }
});
