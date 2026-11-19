// Play-test findings of 16 Nov 2026 on the treatment model, each at its source:
// 1. A varix's drawn and printed diameter held still at rest (the card flickered 5.1 to 5.4 mm and the fundal one 8.3 to 9.8 mm): the mean pressure was set against the
//    breath's instantaneous outside pressure.
// 2. A varix that BRTO (or coils, or a Warren shunt) had closed regrows over seconds when it opens again, not in one frame to "Large 9.7 mm" with red wale signs; a closed one
//    carries a flag so its card does not print a pressure beside "Grade none".
// 3. Partial splenic embolization shrinks the spleen and raises the platelets (on the disease clock).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/portal/engine.js';
import { computeMetrics } from '../src/engine/portal/metrics.js';

const settled = (id) => { const e = new Engine(); e.loadPreset(id); e.beat = true; for (let i = 0; i < 3000; i++) e.step(0.004); return e; };
const run = (e, s, each) => { for (let t = 0; t < s; t += 0.1) { for (let i = 0; i < 25; i++) e.step(0.004); each?.(t); } };
const toggle = (e, fn) => { const p = structuredClone(e.params); fn(p); e.setParams(p); };

test('the varices\' diameter holds still at rest, the esophageal and the fundal', () => {
  for (const [id, key] of [['cirr-decomp', 'varix'], ['gastric-varix', 'gastricVarix']]) {
    const e = settled(id), rec = {}, d = [];
    run(e, 30);
    run(e, 20, () => d.push(computeMetrics(e, rec)[key].d));
    const spread = Math.max(...d) - Math.min(...d);
    assert.ok(spread < 0.05, `${id}: ${key} spread ${spread.toFixed(3)} mm over a breath and a beat should be nil`);
  }
});

test('BRTO off: the fundal varix regrows smoothly to its size, never above it, and is "closed" while BRTO is on', () => {
  const e = settled('gastric-varix'), rec = {};
  run(e, 20);
  const base = computeMetrics(e, rec).gastricVarix.d;
  assert.ok(base > 7, 'a large fundal varix to start');
  toggle(e, (p) => { p.occluded = { ...p.occluded, C5: true }; });
  run(e, 15);
  const shut = { ...computeMetrics(e, rec).gastricVarix };   // (the record is kept and written in place: copy what is kept)
  assert.equal(shut.closed, true); assert.ok(shut.d < 3, 'obliterated');
  toggle(e, (p) => { p.occluded = { ...p.occluded, C5: false }; });
  const seq = [];
  run(e, 25, () => { const g = computeMetrics(e, rec).gastricVarix; seq.push({ d: g.d, closed: g.closed }); });
  assert.equal(seq[0].closed, false);
  let worst = 0;
  for (let i = 1; i < seq.length; i++) worst = Math.max(worst, Math.abs(seq[i].d - seq[i - 1].d));
  assert.ok(worst < 0.5, `no step of more than half a millimeter in a tenth of a second (worst ${worst.toFixed(2)})`);
  assert.ok(seq[3].d < base - 3, 'a third of a second after BRTO comes off it is still far from large');
  assert.ok(Math.max(...seq.map((x) => x.d)) < base + 0.15, `it never overshoots its size (${base.toFixed(2)})`);
  assert.ok(Math.abs(seq.at(-1).d - base) < 0.15, 'and lands on it');
});

test('partial splenic embolization shrinks the spleen and raises the platelets over weeks; nothing happens in the first minute', () => {
  const e = settled('gastric-varix'), rec = {};
  const before = computeMetrics(e, rec).spleen; const L0 = before.length, plt0 = before.platelets;   // (numbers taken: the record is rewritten in place)
  toggle(e, (p) => { p.splenicRx = 1; });
  run(e, 20);
  assert.ok(Math.abs(computeMetrics(e, rec).spleen.length - L0) < 0.3, 'the infarct is absorbed over weeks, not seconds');
  const it = e.advanceDaySteps(60); while (!it.next().done);
  const aft = computeMetrics(e, rec).spleen, after = { length: aft.length, platelets: aft.platelets };
  assert.ok(after.length < L0 * 0.85, `spleen ${L0.toFixed(1)} → ${after.length.toFixed(1)} cm`);
  assert.ok(after.platelets > plt0 * 1.5, `platelets ${Math.round(plt0)} → ${Math.round(after.platelets)}`);
  toggle(e, (p) => { p.splenicRx = 0; });
  const it2 = e.advanceDaySteps(120); while (!it2.next().done);
  assert.ok(computeMetrics(e, rec).spleen.length > after.length, 'taken back, the infarct stays but the share regrown by the pressure grows again');
});
