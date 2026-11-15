// "Yours": a patient made from readings is rebuilt from its family every time, never read back from storage, and the list kept is safe whatever
// storage holds (src/engine/yours.js, src/ui/yours-store.js, the worker's 'yours' message).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yoursId, yoursLabel, yoursRecord, cleanYours, yoursPreset, setYours, readingsLine, YOURS_MAX, YOURS_GROUP, YOURS_NOTE } from '../src/engine/yours.js';
import { PRESETS } from '../src/engine/scenario.js';
import { FAMILIES } from '../src/engine/inverse-families.js';
import { Engine } from '../src/engine/engine.js';
import { createCore } from '../src/worker-core.js';

const R = { whvp: 8, fhvp: 4.5, lsm: 6.5, plt: 78, asc: 0 };
const mine = () => PRESETS.filter((p) => p.group === YOURS_GROUP);

test('the same scenario is the same patient, a different one is not, and the name says the settings', () => {
  const a = yoursId('presin', { presin: 0.6 });
  assert.equal(a, yoursId('presin', { presin: 0.6, extra: 9 }));
  assert.notEqual(a, yoursId('presin', { presin: 0.7 }));
  assert.notEqual(a, yoursId('pvt', { pvt: 0.75 }));
  assert.match(a, /^yours-[0-9a-z]+$/);
  assert.equal(yoursLabel('presin', { presin: 0.6 }), 'Presinusoidal marked');
  assert.equal(yoursLabel('pvt', { pvt: 0.75 }), 'Portal clot severe');
  assert.equal(yoursLabel('sinus+constr', { sinus: 0.3, constr: 0.9 }), 'Cirrhosis 30% + Constriction severe', 'a mix names each lesion and how far it is pushed');
});

test('a record keeps only what the family needs and the readings that are numbers', () => {
  const rec = yoursRecord('presin', { presin: 0.6, junk: 1 }, { ...R, ra: 'x', hvpg: NaN, nonsense: 5 }, 1000);
  assert.deepEqual(rec.p, { presin: 0.6 });
  assert.deepEqual(rec.readings, R);
  assert.equal(rec.at, 1000);
  assert.equal(yoursRecord('nope', {}, R), null);
  assert.equal(yoursRecord('presin', {}, R), null, 'a setting is missing');
  assert.equal(yoursRecord('presin', { presin: '0.6' }, R), null, 'a setting is not a number');
});

test('what storage held is made safe: junk dropped, one to an id, newest first, at most the limit', () => {
  assert.deepEqual(cleanYours(null), []);
  assert.deepEqual(cleanYours('x'), []);
  const old = yoursRecord('pvt', { pvt: 0.75 }, R, 1), fresh = yoursRecord('pvt', { pvt: 0.5 }, R, 5);
  const out = cleanYours([null, 4, { f: 'bad' }, old, { ...old, at: 99 }, fresh]);
  assert.equal(out.length, 2, 'two records of one id are one patient');
  assert.deepEqual(out.map((r) => r.at), [99, 5], 'newest first, and the newer of the two with one id');
  assert.equal(out[0].id, old.id);
  const many = Array.from({ length: YOURS_MAX + 6 }, (_, i) => yoursRecord('sinus', { sinus: 0.2 + i * 0.01 }, R, i));
  assert.equal(cleanYours(many).length, YOURS_MAX);
  assert.equal(cleanYours(many)[0].at, YOURS_MAX + 5);
});

test('an edited record cannot make a patient the family cannot: the patch is rebuilt, not read', () => {
  const rec = { ...yoursRecord('presin', { presin: 0.6 }, R, 1), patch: { cirrhosis: 99 }, days: 1e9 };
  const [clean] = cleanYours([rec]);
  assert.equal('patch' in clean, false);
  const pre = yoursPreset(clean);
  assert.deepEqual(pre.patch, { fibrosis: { R: { pre: 18.3, sin: 1 }, L: { pre: 18.3, sin: 1 } } });
  assert.equal(pre.days, 365);
});

test('every family makes a preset the engine loads', () => {
  for (const f of FAMILIES) {
    const p = f.grid[0], pre = yoursPreset(yoursRecord(f.id, p, R, 1));
    assert.equal(pre.group, YOURS_GROUP);
    assert.equal(pre.note, YOURS_NOTE);
    assert.match(pre.summary, /not a diagnosis/);
    assert.ok(pre.label && pre.id);
  }
});

test('setYours puts exactly the saved patients in the list, replaces the old ones, and leaves the built-ins', () => {
  const builtIn = PRESETS.filter((p) => p.group !== YOURS_GROUP).length;
  const a = yoursRecord('presin', { presin: 0.6 }, R, 2), b = yoursRecord('pvt', { pvt: 0.75 }, R, 1);
  assert.equal(setYours([a, b]), 2);
  assert.deepEqual(mine().map((p) => p.id).sort(), [a.id, b.id].sort());
  assert.equal(setYours([b]), 1);
  assert.deepEqual(mine().map((p) => p.id), [b.id]);
  assert.equal(setYours(null), 0);
  assert.equal(mine().length, 0);
  assert.equal(PRESETS.filter((p) => p.group !== YOURS_GROUP).length, builtIn);
});

test('a Yours patient loads in the engine like a built-in, with its settings', () => {
  const rec = yoursRecord('presin', { presin: 0.6 }, R, 1);
  setYours([rec]);
  try {
    const e = new Engine();
    e.loadPreset(rec.id);
    assert.equal(e.params.fibrosis.R.pre, 18.3);
    assert.equal(e.params.fibrosis.L.sin, 1);
  } finally { setYours([]); }
});

test('the worker takes the saved list and answers with the patient list', async () => {
  const out = [];
  const core = createCore((m) => out.push(m));
  const rec = yoursRecord('pvt', { pvt: 0.75 }, R, 1);
  await core.handle({ type: 'init' });
  await core.handle({ type: 'yours', list: [rec], reqId: 3 });
  try {
    const m = out.find((x) => x.type === 'presets' && x.reqId === 3);
    assert.ok(m, 'the answer is the presets message with the same request id');
    assert.ok(m.presets.some((p) => p.id === rec.id && p.group === YOURS_GROUP));
    assert.ok(m.presets.some((p) => p.id === 'healthy'));
  } finally { setYours([]); core.dispose(); }
});

test('the readings line names the first few and counts the rest', () => {
  assert.equal(readingsLine({ whvp: 8, fhvp: 4.5 }), 'WHVP 8.0 mmHg, FHVP 4.5 mmHg');
  assert.match(readingsLine({ whvp: 8, fhvp: 4.5, pv: 20, ra: 4, ivc: 5, lsm: 6, ssm: 60 }), /and 2 more$/);
});
