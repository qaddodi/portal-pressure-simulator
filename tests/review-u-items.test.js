// Review items U2, U4, U8, U9, U10, U11, U12, U13 and U16 (docs/REVIEW_2026-10.md on its branch): undo on touch, a way out of
// the collapse banner (banner removed 18 Oct), "Why?" sentences that read aloud, Why? for Hb, failures in learner words, the shunt hint,
// "colored by" instead of "lens", one platelet unit, and the toast policy. The UI modules need a DOM, so they are read as text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { explain, METRICS } from '../src/engine/explain.js';
import { computeMetrics } from '../src/engine/metrics.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const settled = (id) => { const e = new Engine(); e.loadPreset(id); for (let i = 0; i < 4; i++) e.settleQuick(); return e; };

test('U8: the Why? sentence reads aloud: no nested brackets, no arrows, "above healthy"', () => {
  const e = settled('csph');
  for (const id of ['hvpg', 'ppg', 'pv', 'map', 'hb']) {
    const { sentence } = explain(e, id);
    assert.doesNotMatch(sentence, /\([^)]*\(/, sentence);
    assert.doesNotMatch(sentence, /[▲▼:]/, sentence);
    assert.doesNotMatch(sentence, /vs\. healthy|mainly because of|Offsetting/, sentence);
  }
  const s = explain(e, 'hvpg').sentence;
  assert.match(s, /^HVPG is [\d.]+ mmHg, [\d.]+ above healthy\. Most of that is the cirrhosis \(\+[\d.]+\)/, s);
  assert.match(s, /[\d.]+ is taken off by the collaterals\.$/, s);
  // The bars' names are short, with the amount kept for the tooltip ("Cirrhosis 60 %").
  for (const c of explain(e, 'hvpg').contributions) assert.doesNotMatch(c.label, /[():]/, c.label);
});

test('U9: hemoglobin has a Why? of its own, and a bleed explains it', () => {
  assert.equal(METRICS.hb.unit, 'g/dL');
  const e = settled('csph');
  const hb0 = computeMetrics(e).blood.hb;
  e.hemorrhage(1500);
  for (let i = 0; i < 8; i++) e.settleQuick();
  // (Whole blood is lost: the hemoglobin holds at first, and is heading lower; it falls once the plasma has refilled, a day on.)
  const m1 = computeMetrics(e);
  assert.ok(Math.abs(m1.blood.hb - hb0) < 0.1 && m1.blood.hbSettled < hb0 - 2, `Hb ${hb0} → ${m1.blood.hb} heading to ${m1.blood.hbSettled}`);
  e.plasmaRefill(86400);
  for (let i = 0; i < 8; i++) e.settleQuick();
  const r = explain(e, 'hb');
  assert.ok(r.total < -0.1, `Hb change ${r.total}`);
  assert.equal(r.contributions[0].label, 'Blood loss');
  assert.ok(r.contributions[0].delta < 0);
  assert.match(r.sentence, /below healthy\. Most of that is the blood loss/, r.sentence);
});




test('U12 and U13: "colored by", never "lens", in words people see; platelets per µL', () => {
  for (const f of ['../src/ui/main.js', '../src/ui/palette.js']) assert.doesNotMatch(read(f), /[`'"]Lens: /, f);
  for (const f of ['../src/ui/actions.js', '../src/ui/inspector.js', '../src/ui/table-marks.js', '../src/ui/presenter.js']) assert.doesNotMatch(read(f), /10⁹/, f);
});

test('U16: no toast for what the figure already shows, and none but errors while presenting', () => {
  for (const f of ['../src/ui/main.js', '../src/ui/actions.js', '../src/ui/chart.js']) assert.doesNotMatch(read(f), /Band placed|Hemorrhage: 500 mL lost|Injecting dye/, f);
});
