// Case content checks: every case, in every variant, is complete and internally consistent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASES, ORDER_META } from '../src/ui/cases/index.js';

const DERIVED = new Set(['fibroscan', 'doppler', 'hvpg']);
const M = { spleen: { platelets: 100, length: 13 }, varix: { d: 4, ratio: 0.5, redWale: false, grade: { label: 'Small' } }, blood: { hb: 13 }, ascites: { volume: 0 } };
const fake = (cs) => new Proxy({ cs, m: M, params: { albumin: 3.5 }, hr: '112', bp: '96/58', flag: () => 'nsbb', hbLab: () => 6.4, count: () => 0, did: () => true, read: () => ({}), pick: () => 0 }, { get: (t, k) => (k in t ? t[k] : () => undefined) });
const val = (x, c) => (typeof x === 'function' ? x(c) : x);

const merged = [];
for (const base of CASES) for (const v of base.variants || [{}]) { const cs = { ...base, ...v }; Object.assign(cs, cs.build(cs)); merged.push(cs); }

test('twelve cases, unique ids, each with the pieces the runtime needs', () => {
  assert.equal(CASES.length, 12);
  assert.equal(new Set(CASES.map((c) => c.id)).size, 12);
  for (const cs of merged) {
    const tag = `${cs.id}/${cs.vid}`;
    assert.ok(cs.title && cs.level && cs.summary && cs.preset, `${tag}: header fields`);
    assert.ok(cs.patient?.name && cs.patient.age && cs.patient.setting && cs.patient.problem, `${tag}: patient`);
    assert.equal(cs.pearls.length, 3, `${tag}: three pearls`);
    assert.ok(cs.steps.length >= 3 && cs.steps.length <= 5, `${tag}: 3 to 5 decision points`);
    assert.equal(typeof cs.chart, 'function'); assert.equal(typeof cs.intro, 'function');
  }
});

test('key action weights sum to 100 and at least one is critical', () => {
  for (const cs of merged) {
    const sum = cs.objectives.reduce((s, o) => s + o.weight, 0);
    assert.equal(sum, 100, `${cs.id}/${cs.vid}: weights sum to ${sum}`);
    assert.ok(cs.objectives.some((o) => o.critical), `${cs.id}/${cs.vid}: a critical action`);
    assert.equal(new Set(cs.objectives.map((o) => o.id)).size, cs.objectives.length);
  }
});

test('steps: options, answers, effects and gating all refer to real things', () => {
  for (const cs of merged) {
    const c = fake(cs), ids = new Set();
    for (const s of cs.steps) {
      const tag = `${cs.id}/${cs.vid}/${s.id}`;
      assert.ok(!ids.has(s.id), `${tag}: duplicate step id`); ids.add(s.id);
      assert.equal(typeof val(s.q, c), 'string', `${tag}: question`);
      const opts = val(s.options, c);
      assert.ok(opts.length >= 3 && opts.length <= 7, `${tag}: option count`);
      for (const o of opts) {
        assert.ok(typeof o === 'string' ? o.length : o.t.length, `${tag}: option text`);
        for (const id of o.does || []) assert.ok(ORDER_META[id], `${tag}: unknown order ${id}`);
      }
      const ans = [].concat(val(s.answer, c));
      assert.ok(ans.length && ans.every((i) => Number.isInteger(i) && i >= 0 && i < opts.length), `${tag}: answer in range`);
      for (const id of [...(s.needs || []), ...(s.needsAny || [])]) assert.ok(cs.orders.includes(id), `${tag}: needs ${id} must be offered`);
      if (s.multi) assert.ok(Array.isArray(s.answer) && (s.avoid || []).every((i) => i < opts.length), `${tag}: multi`);
    }
  }
});

test('orders: every offered order exists, and every study has a result', () => {
  for (const cs of merged) {
    for (const id of cs.orders) {
      const meta = ORDER_META[id];
      assert.ok(meta, `${cs.id}: unknown order ${id}`);
      if (meta.g === 'assess' && !DERIVED.has(id)) assert.ok(cs.results?.[id] !== undefined, `${cs.id}/${cs.vid}: no result authored for ${id}`);
    }
    for (const id of Object.keys(cs.results || {})) assert.ok(ORDER_META[id], `${cs.id}: result for unknown order ${id}`);
    const items = cs.chart(fake(cs));
    assert.ok(items.length >= 2 && items.every((it) => it.id && it.section && it.title), `${cs.id}: chart items`);
  }
});

test('the chart never states the decision', () => {
  const banned = /\b(recommend|should (start|have|get|receive)|best (plan|answer)|the answer|contraindicat)/i;
  for (const cs of merged) {
    const text = JSON.stringify(cs.chart(fake(cs))) + JSON.stringify(Object.values(cs.results || {}).map((r) => (typeof r === 'function' ? r(fake(cs)) : r)));
    assert.ok(!banned.test(text), `${cs.id}/${cs.vid}: chart contains an answer-giving phrase`);
  }
});

test('learner text uses clinical words: no vessel codes or model controls', () => {
  const codes = /\b(C1b|C[2-9]\b|CAUD|SV_CONF|PV_TRUNK|IVCS|RHV_IVC|Cirrhosis control|Splanchnic arteriolar|supplied|simulated)\b/;
  for (const cs of merged) {
    const c = fake(cs);
    const all = JSON.stringify([cs.title, cs.summary, cs.intro(c), cs.chart(c), cs.pearls, cs.steps.map((s) => [s.title, val(s.q, c), val(s.options, c), s.why]), cs.objectives.map((o) => o.text)]);
    assert.ok(!codes.test(all), `${cs.id}/${cs.vid}: jargon: ${all.match(codes)?.[0]}`);
  }
});

test('course units 6–8: stems have five options, an answer and a line each; orders are real', async () => {
  const { CASE_UNITS } = await import('../src/ui/cases/units.js');
  assert.deepEqual(Object.keys(CASE_UNITS), ['u6-new-ascites', 'u7-bleed', 'u8-refractory']);
  for (const [id, u] of Object.entries(CASE_UNITS)) {
    const base = CASES.find((x) => x.id === u.caseId);
    assert.ok(base && base.variants[u.variant], `${id}: case and variant`);
    assert.equal(u.keyPoints.length, 3, `${id}: three key points`);
    assert.ok(u.orders.length <= 6 && u.need.every((o) => u.orders.includes(o)) && u.orders.every((o) => ORDER_META[o]), `${id}: orders`);
    assert.equal(typeof u.result, 'function');
    for (const s of u.steps) {
      if (s.type === 'watch') { assert.equal(typeof s.run, 'function'); continue; }
      assert.equal(s.type, 'stem');
      assert.equal(typeof s.stem, 'string', `${id}/${s.sid}: stem text stands alone`);
      assert.equal(s.options.length, 5, `${id}/${s.sid}: five options`);
      assert.equal(s.explain.length, 5, `${id}/${s.sid}: a line per option`);
      assert.ok(Number.isInteger(s.answer) && s.answer >= 0 && s.answer < 5, `${id}/${s.sid}: answer`);
    }
  }
});
