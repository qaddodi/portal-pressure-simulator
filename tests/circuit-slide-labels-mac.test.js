// Circuit slide 4 ("A meal raises portal flow"), framed gut to liver on a Mac (1440 x 900; teaching-cards headless run, finding
// #5): every station's reading stands clear of the vessels, the resistors' zigzags and the stations' rings. "Spleen 12.0" had sat on the
// colon's vein beside its station: on a slide every Circuit reading had been let keep a spot over a vessel, as only a slide-named one may.
// The real stage, in node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootCircuitSlide, labelFaults } from './circuit-slide-stage.js';

const boot = bootCircuitSlide({ W: 1440, H: 900, cardR: 545 });

test('Mac 1440: the Circuit slide\'s readings are clear of vessels, zigzags and rings', async () => {
  const { st } = await boot;
  const got = labelFaults(st, /^n:/, 1);
  assert.ok(got.length >= 6 && got.some((g) => g.key === 'n:SPL'), `the slide's stations are read, the spleen's among them: ${got.map((g) => g.key)}`);
  for (const g of got) {
    assert.deepEqual(g.vessels, [], `${g.key} at ${g.box} sits on ${g.vessels}`);
    assert.deepEqual(g.rings, [], `${g.key} at ${g.box} covers a station's ring at ${JSON.stringify(g.rings)}`);
  }
});

test("Mac 1440: the liver's resistance reading stands off the liver's vessels and zigzags", async () => {
  const { st } = await boot;
  const [res] = labelFaults(st, /^r:rLiver$/, 1);
  assert.ok(res, 'the slide reads the liver\'s resistance');
  assert.deepEqual(res.vessels, [], `"R liver" at ${res.box} sits on ${res.vessels}`);
  const [, ys] = st.worldToLocal(850, 303), [, yi] = st.worldToLocal(850, 387);   // (the two lobes' zigzags: stage-sites.js RES_LIVER)
  assert.ok(res.box[3] < ys - 12 || res.box[1] > yi + 12 || (res.box[1] > ys + 12 && res.box[3] < yi - 12), `"R liver" at ${res.box} is clear of the zigzags at y ${ys.toFixed(0)} and ${yi.toFixed(0)}`);
});
