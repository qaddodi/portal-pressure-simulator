// The tick's metrics are written into one kept record per engine (computeMetrics(eng, out)); a reader that gives none gets a record of its
// own. Both must read the same, over the presets, a catheter wedged or free, a bleed, no gastrorenal shunt and a removed spleen's drug.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics } from '../src/engine/metrics.js';
import { detectEvents } from '../src/engine/events.js';
import { Engine } from '../src/engine/engine.js';
import { PRESETS } from '../src/engine/scenario.js';

const norm = (m) => JSON.parse(JSON.stringify(m, (k, v) => (v === undefined ? '__undefined' : Number.isNaN(v) ? '__nan' : v)));

test('metrics written into a kept record read the same as a fresh record, call after call', () => {
  const rec = {};
  for (const pr of PRESETS) {
    const e = new Engine(); e.loadPreset(pr.id);
    for (const v of [0, 1, 2, 3]) {
      e.params.spontaneous = { ...(e.params.spontaneous || {}), C5: v & 1 ? false : undefined };
      e.params.splenicRx = v & 2 ? 2 : 0;
      e.params.catheter.vein = v ? ['R', 'M', 'L'][v - 1] : null; e.params.catheter.wedged = !!(v & 1);
      e.bleed.active = !!(v & 1); e.bleed.site = 'VAR'; e.bleed.total = 1.5;
      for (let i = 0; i < 2; i++) {
        e.step(0.004);
        assert.deepEqual(norm(computeMetrics(e, rec)), norm(computeMetrics(e)), `${pr.id} case ${v}`);
      }
    }
  }
});

test('a frame\'s record is the engine\'s kept one, and a reader\'s own record is never reused', () => {
  const e = new Engine(); e.loadPreset(PRESETS[0].id);
  const a = detectEvents(e), b = detectEvents(e);
  assert.equal(a, b, 'the tick writes one record in place');
  const x = computeMetrics(e), y = computeMetrics(e);
  assert.notEqual(x, y, 'a reader with no record to write into is given a new one each time');
  assert.notEqual(x.varix, y.varix);
});
