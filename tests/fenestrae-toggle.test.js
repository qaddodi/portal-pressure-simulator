// Lobule slide "Cirrhosis narrows the sinusoid": its buttons open the fenestrae on the live model and go back to the
// cirrhotic wall (Mohammad, 20 Oct: "a button that opens and closes the fenestration in real time to see how things
// change"). The fenestrae param sets the wall's open share in place of the one cirrhosis gives it: protein crosses again
// and the hepatic lymph runs faster, while the scar, the resistance and so the HVPG stay as they were.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge, defaultParams, sanitizeParams } from '../src/engine/scenario.js';
import { sinusoidTargets } from '../src/ui/sinusoid-model.js';
import { abChoice } from '../src/ui/presenter.js';
import { LOBULE } from '../src/ui/decks/lobule.js';

const preset = (id) => { const e = new Engine(); e.loadPreset(id); return e; };
const patch = (e, p) => { e.setParams(deepMerge(e.params, p)); e.settle(); };

test('fenestrae: null follows the disease; a set share opens the wall without touching the resistance', () => {
  assert.equal(defaultParams().fenestrae, null);
  const e = preset('cirr-decomp'), m0 = computeMetrics(e);
  const por = (m) => sinusoidTargets({ sigma: m.ascites.lymphSigma, fibSin: 0.5, lymph: 1, lymph0: 1, act: 0, zone: { sin: 1 }, congU: 0, flow: 1, lyProt: m.ascites.lymphProt }).por;
  assert.ok(por(m0) < 0.3, `cirrhosis: the wall mostly closed (${por(m0)})`);
  patch(e, { fenestrae: 1 });
  const m1 = computeMetrics(e);
  assert.ok(Math.abs(m1.ascites.lymphSigma - 0.15) < 1e-9, 'open: the healthy reflection coefficient');
  assert.equal(por(m1), 1);
  assert.ok(m1.ascites.lymphProt > m0.ascites.lymphProt + 0.2, `protein crosses: ${m0.ascites.lymphProt} → ${m1.ascites.lymphProt}`);
  assert.ok(m1.ascites.hepLymph > m0.ascites.hepLymph, 'the lymph runs faster with the oncotic pull gone');
  assert.ok(Math.abs(m1.hvpg - m0.hvpg) < 0.05, `HVPG unchanged: ${m0.hvpg} → ${m1.hvpg}`);
  patch(e, { fenestrae: null });
  const m2 = computeMetrics(e);
  assert.ok(Math.abs(m2.ascites.lymphSigma - m0.ascites.lymphSigma) < 1e-9, 'back to the cirrhotic wall');
});

test('fenestrae is sanitized: a number is clamped to 0..1, anything else follows the disease', () => {
  assert.equal(sanitizeParams({ fenestrae: 3 }).fenestrae, 1);
  assert.equal(sanitizeParams({ fenestrae: -1 }).fenestrae, 0);
  assert.equal(sanitizeParams({ fenestrae: 'x' }).fenestrae, null);
  assert.equal(sanitizeParams({}).fenestrae, null);
});

test('the lobule cirrhosis slide: Open patches the live model, its own button eases back to the slide', () => {
  const s = LOBULE.slides.find((x) => x.id === 'cirr');
  assert.equal(s.compare.length, 2);
  assert.deepEqual(abChoice(s.compare, 0), { kind: 'params', patch: { fenestrae: 1 } });
  assert.deepEqual(abChoice(s.compare, 1), { kind: 'state' });
});
