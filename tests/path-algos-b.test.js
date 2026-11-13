// Guideline path card, algorithms of group B (7 Nov 2026): psvdscope, pvtocc, pvtdur and aasld (src/ui/path-algos/). The cut-offs are those of
// guidelines/ (Baveno VIII 8.46 to 8.48, 9.3, 9.6 to 9.10; AASLD 2024 Fig. 3 and guidance statement 7), the boundaries included.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import psvdscope from '../src/ui/path-algos/psvdscope.js';
import pvtocc from '../src/ui/path-algos/pvtocc.js';
import pvtdur from '../src/ui/path-algos/pvtdur.js';
import aasld, { side } from '../src/ui/path-algos/aasld.js';
import { leavesOf } from '../src/ui/path-algos/helpers.js';

const ALGOS = [psvdscope, pvtocc, pvtdur, aasld];
const nodes = (t) => [t, ...(t.kids || []).flatMap(nodes)];
const shown = (k, v) => +v.toFixed(1);
const out = (A, p) => A.outcomeOf(A.lit(p));

// A grid of patients for each algorithm, to run the generic checks over.
const GRID = {
  psvdscope: [32, 39.9, 40, 46, 70, 100].flatMap((ssm) => [0.3, 0.9, 1, 1.2, 9.9].flatMap((bili) => ['none', 'small'].map((v) => ({ ssm, bili, v })))),
  pvtocc: [0, 0.5, 30, 49.9, 50, 80, 100].map((rl) => ({ rl })),
  pvtdur: ['3', '6'].flatMap((at) => [0, 1].flatMap((rec) => [0, 1].flatMap((rev) => [0, 1].flatMap((perm) => [0, 1].map((ext) => ({ at, rec: !!rec, rev: !!rev, perm: !!perm, ext: !!ext })))))),
  aasld: [3, 9.9, 10, 14.9, 15, 17, 19.9, 20, 22, 24.9, 25, 28, 45, 100].flatMap((lsm) => [40, 109, 110, 130, 149, 150, 190, 320, 1000].map((plt) => ({ lsm, plt }))),
};

test('each algorithm is a tree with the contract\'s fields, unique node ids and at most three leaf columns', () => {
  assert.deepEqual(ALGOS.map((A) => A.id), ['psvdscope', 'pvtocc', 'pvtdur', 'aasld']);
  for (const A of ALGOS) {
    assert.equal(A.kind, 'tree');
    assert.ok(A.label && A.source && typeof A.cite === 'string' && A.notes, A.id);
    for (const f of ['lit', 'outcomeOf', 'reading', 'chips', 'patientFor']) assert.equal(typeof A[f], 'function', `${A.id}.${f}`);
    const ids = nodes(A.tree).map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length, `${A.id}: ids are unique`);
    assert.equal(A.tree.id, 'root');
    assert.ok(leavesOf(A.tree) <= 3, `${A.id}: ${leavesOf(A.tree)} leaf columns`);
    for (const n of nodes(A.tree)) {
      assert.ok(['n', 'ok', 'warn', 'bad'].includes(n.tone), `${A.id}/${n.id} tone`);
      assert.ok(n.t, `${A.id}/${n.id} has a condition`);
      if (n.id !== 'root') assert.ok(Array.isArray(A.mapWords[n.id]) && A.mapWords[n.id].length >= 1 && A.mapWords[n.id].length <= 2, `${A.id}/${n.id} has map words`);
    }
    for (const k of Object.keys(A.mapWords)) assert.ok(ids.includes(k), `${A.id}: map words for a node that exists (${k})`);
  }
  assert.equal(aasld.source, 'AASLD 2024');
  assert.equal(aasld.cite, 'Fig. 3');
  for (const A of [psvdscope, pvtocc, pvtdur]) assert.equal(A.source, 'Baveno VIII');
});

test('every lit set holds the root and one outcome, and every outcome has a reading with a tone', () => {
  for (const A of ALGOS) {
    const seen = new Set();
    for (const p of GRID[A.id]) {
      const L = A.lit(p), ids = new Set(nodes(A.tree).map((n) => n.id));
      assert.ok(L.has('root'), A.id);
      for (const i of L) assert.ok(ids.has(i), `${A.id}: lit ${i} is a node`);
      const k = A.outcomeOf(L);
      assert.ok(A.outcomes.includes(k), `${A.id}: ${k}`);
      seen.add(k);
      const r = A.reading(k, p);
      assert.ok(r.head && r.why && r.next && r.stmt && ['n', 'ok', 'warn', 'bad'].includes(r.tone), `${A.id}/${k}`);
      assert.doesNotMatch(`${r.head} ${r.why} ${r.next}`, /undefined|NaN|null|\[object/, `${A.id}/${k}`);
      for (const c of A.chips(p)) assert.doesNotMatch(c, /undefined|NaN|null/, `${A.id} chips`);
    }
    assert.deepEqual([...seen].sort(), [...A.outcomes].sort(), `${A.id}: the grid reaches every outcome`);
    assert.equal(A.outcomeOf(new Set(['root'])), null, `${A.id}: nothing lit but the start is no outcome`);
    for (const k of A.outcomes) assert.ok(A.reading(k, A.worst).tone, `${A.id}/${k} reads for the widest patient`);
  }
});

test('psvdscope: Baveno VIII 8.47 spares the scope only below both cut-offs, and a finding sets the repeat', () => {
  const o = (p) => out(psvdscope, { ssm: 46, bili: 0.8, v: 'none', ...p });
  assert.equal(o({ ssm: 32, bili: 0.7 }), 'skip');
  assert.equal(o({ ssm: 39.9, bili: 0.9 }), 'skip');
  assert.equal(o({ ssm: 40, bili: 0.5 }), 'none', 'SSM 40 is not <40');
  assert.equal(o({ ssm: 30, bili: 1 }), 'none', 'bilirubin 1 is not <1');
  assert.equal(o({ ssm: 30, bili: 1.2, v: 'small' }), 'small');
  assert.equal(o({ ssm: 52, bili: 1.2, v: 'small' }), 'small');
  assert.equal(o({ ssm: 32, bili: 0.7, v: 'small' }), 'skip', 'a spared patient has no scope finding');
  assert.deepEqual([...psvdscope.lit({ ssm: 46, bili: 0.8, v: 'none' })].sort(), ['none', 'root', 'scope']);
  assert.deepEqual([...psvdscope.lit({ ssm: 32, bili: 0.7, v: 'none' })].sort(), ['root', 'skip']);
  assert.match(psvdscope.reading('none', { ssm: 46, bili: 0.8, v: 'none' }).why, /SSM 46 kPa is ≥40/);
  assert.match(psvdscope.reading('none', { ssm: 30, bili: 1.2, v: 'none' }).why, /bilirubin 1.2 mg\/dL is ≥1/);
  assert.match(psvdscope.reading('small', {}).head, /1 year/);
  assert.match(psvdscope.reading('none', { ssm: 46, bili: 0.8 }).head, /2 years/);
  assert.deepEqual(psvdscope.chips({ ssm: 32, bili: 0.7, v: 'none' }), ['SSM 32 kPa', 'Bilirubin 0.7 mg/dL']);
  assert.deepEqual(psvdscope.chips({ ssm: 52, bili: 1.2, v: 'small' }), ['SSM 52 kPa', 'Bilirubin 1.2 mg/dL', 'Small varices']);
});

test('psvdscope: the spleen stiffness is the model\'s live reading, as the tile prints it, over the slide\'s own', () => {
  const t = { of: 'psvdscope', patient: { ssm: 30, bili: 1.4, v: 'small' } };
  assert.deepEqual(psvdscope.patientFor(t, { ssm: 46.04 }, shown), { ssm: 46, bili: 1.4, v: 'small' });
  assert.deepEqual(psvdscope.patientFor(t, { lsm: 20, plt: 100 }, shown), { ssm: 30, bili: 1.4, v: 'small' }, 'no spleen reading: the slide\'s');
  assert.deepEqual(psvdscope.patientFor({ of: 'psvdscope' }, null, shown), { ssm: 46, bili: 0.8, v: 'none' }, 'no reading, no patient: the defaults');
  assert.equal(psvdscope.patientFor({ of: 'psvdscope' }, { ssm: NaN }, shown).ssm, 46, 'never NaN');
  assert.equal(psvdscope.patientFor(t, { ssm: 39.96 }, (k, v) => +v.toFixed(0)).ssm, 40, 'judged on what the tile shows');
});

test('pvtocc: Baveno VIII 9.3, minimal from RL 50%, partial below it, complete only at zero', () => {
  const o = (rl) => out(pvtocc, { rl });
  assert.equal(o(80), 'min');
  assert.equal(o(50), 'min', 'RL ≥50% is inclusive');
  assert.equal(o(49.9), 'par');
  assert.equal(o(30), 'par');
  assert.equal(o(1), 'par');
  assert.equal(o(0.1), 'par');
  assert.equal(o(0), 'com');
  assert.deepEqual([...pvtocc.lit({ rl: 30 })].sort(), ['par', 'root']);
  assert.deepEqual(pvtocc.chips({ rl: 30 }), ['Remnant lumen 30%']);
  assert.match(pvtocc.reading('par', { rl: 30 }).why, /Remnant lumen 30% is <50%/);
  assert.equal(pvtocc.patientFor({ patient: { rl: 80 } }, { lsm: 30 }, shown).rl, 80);
  assert.equal(pvtocc.patientFor({}, null, shown).rl, 30, 'a default, never NaN');
  assert.equal(pvtocc.patientFor({ patient: { rl: 140 } }).rl, 100, 'kept between 0 and 100');
  assert.equal(pvtocc.patientFor({ patient: { rl: -5 } }).rl, 0);
});

test('pvtdur: Baveno VIII 9.8 stops early only with all three conditions, 9.9 extends only for a blocked extension at 6 months', () => {
  const base = { at: '3', rec: false, rev: false, perm: false, ext: false };
  const o = (p) => out(pvtdur, { ...base, ...p });
  assert.equal(o({ rec: true, rev: true }), 'stop', '3 months, all clear');
  assert.equal(o({}), 'cont', '3 months, still blocked');
  assert.equal(o({ rec: true, rev: true, perm: true }), 'cont', 'a permanent factor');
  assert.equal(o({ rec: true, rev: false }), 'cont', 'the reversible factor is not gone');
  assert.equal(o({ rec: false, rev: true }), 'cont', 'not recanalised');
  assert.equal(o({ at: '6', ext: true }), 'ext', '6 months, extension, blocked');
  assert.equal(o({ at: '6', ext: true, rec: true }), 'lt', 'an extension that recanalised');
  assert.equal(o({ at: '6', rec: true }), 'lt');
  assert.equal(o({ at: '6' }), 'lt', 'still blocked without extension: the long-term plan, no 6 more months');
  assert.equal(o({ at: '6', rec: true, rev: true }), 'lt', 'the early stop belongs to the 3-month review');
  assert.deepEqual([...pvtdur.lit({ ...base, at: '6', ext: true })].sort(), ['cont', 'ext', 'root']);
  assert.deepEqual([...pvtdur.lit({ ...base })].sort(), ['cont', 'root']);
  assert.match(pvtdur.reading('cont', base).why, /conditions to stop early are not all met/);
  assert.match(pvtdur.reading('lt', { ...base, at: '6' }).why, /not recanalized, but the thrombus did not extend/);
  assert.match(pvtdur.reading('lt', { ...base, at: '6', rec: true }).why, /vein is recanalized/);
  assert.deepEqual(pvtdur.chips({ at: '6', rec: false, rev: true, perm: true, ext: true }), ['At 6 months', 'Not recanalized', 'Reversible factor resolved', 'Permanent factor', 'SMV or splenic extension']);
  assert.deepEqual(pvtdur.patientFor({ patient: { at: 6, rec: 1 } }, { lsm: 30 }, shown), { at: '6', rec: true, rev: false, perm: false, ext: false });
  assert.deepEqual(pvtdur.patientFor({}, null, shown), base);
});

test('aasld: the rule of five of AASLD 2024 Fig. 3, with its boundaries', () => {
  const o = (lsm, plt) => out(aasld, { lsm, plt });
  assert.equal(o(22, 130), 'in');
  assert.equal(o(18, 140), 'gray');
  assert.equal(o(12, 190), 'out');
  assert.equal(o(28, 200), 'in', 'LSM >25 is in whatever the platelets');
  assert.equal(o(25, 400), 'in', 'the figure\'s box is ≥25');
  assert.equal(o(24.9, 149), 'in');
  assert.equal(o(24.9, 150), 'gray', '20–25 needs platelets <150');
  assert.equal(o(20, 149), 'in', '20 belongs to the 20–25 box');
  assert.equal(o(20, 150), 'gray');
  assert.equal(o(19.9, 109), 'in');
  assert.equal(o(19.9, 110), 'gray', '15–20 needs platelets <110');
  assert.equal(o(15, 109), 'in', '15 belongs to the 15–20 box');
  assert.equal(o(15, 150), 'gray', 'rule-out needs LSM <15');
  assert.equal(o(14.9, 150), 'out');
  assert.equal(o(14.9, 149), 'gray', 'rule-out needs platelets ≥150');
  assert.equal(o(8, 90), 'gray', 'low stiffness with low platelets rules nothing in or out');
  assert.equal(side({ lsm: 30, plt: 50 }), 'in');
  assert.deepEqual([...aasld.lit({ lsm: 22, plt: 130 })].sort(), ['in', 'root']);
  assert.match(aasld.reading('in', { lsm: 28, plt: 200 }).why, /≥25/);
  assert.match(aasld.reading('in', { lsm: 22, plt: 130 }).why, /20–25 and platelets 130 are <150/);
  assert.match(aasld.reading('in', { lsm: 18, plt: 100 }).why, /15–20 and platelets 100 are <110/);
  assert.deepEqual(aasld.chips({ lsm: 22, plt: 130 }), ['LSM 22 kPa', 'Platelets 130']);
});

test('aasld: the live LSM and platelets, as the tiles print them, over the slide\'s own; and the Baveno VIII line for the same patient', () => {
  assert.deepEqual(aasld.patientFor({ of: 'aasld', patient: { lsm: 18, plt: 140 } }, { lsm: 20.76, plt: 160.4, ssm: 35 }, shown), { lsm: 20.8, plt: 160.4 });
  assert.deepEqual(aasld.patientFor({ of: 'aasld', patient: { lsm: 18, plt: 140 } }, { ssm: 35 }, shown), { lsm: 18, plt: 140 });
  assert.deepEqual(aasld.patientFor({ of: 'aasld' }, null, shown), { lsm: 22, plt: 130 }, 'defaults, never NaN');
  assert.equal(aasld.compare({ lsm: 22, plt: 130 }), 'Baveno VIII, same patient: indeterminate zone');
  assert.equal(aasld.compare({ lsm: 28, plt: 200 }), 'Baveno VIII, same patient: rules CSPH in');
  assert.equal(aasld.compare({ lsm: 25, plt: 90 }), 'Baveno VIII, same patient: rules CSPH in');
  assert.equal(aasld.compare({ lsm: 12, plt: 190 }), 'Baveno VIII, same patient: rules CSPH out');
  assert.equal(aasld.compare({ lsm: 8, plt: 190 }), 'Baveno VIII, same patient: rules cACLD out');
  assert.equal(aasld.compare({ lsm: 15, plt: 150 }), 'Baveno VIII, same patient: rules CSPH out', 'Baveno VIII: ≤15 and ≥150');
  assert.equal(out(aasld, { lsm: 15, plt: 150 }), 'gray', 'while AASLD needs <15: the two differ at exactly 15');
  assert.equal(aasld.compare({ lsm: 14.9, plt: 149 }), 'Baveno VIII, same patient: indeterminate zone');
});

test('the widest patient prints the longest chips and readings, so the card never changes size', () => {
  for (const A of ALGOS) {
    const len = (p) => A.chips(p).join(' ').length;
    for (const p of GRID[A.id]) assert.ok(len(A.worst) >= len(p), `${A.id}: chips of ${JSON.stringify(p)} are no longer than the widest patient's`);
    for (const k of A.outcomes) {
      const text = (p) => { const r = A.reading(k, p); return `${r.head} ${r.why} ${r.next}`.length; };
      for (const p of GRID[A.id]) assert.ok(text(A.worst) >= text(p), `${A.id}/${k}: reading for ${JSON.stringify(p)} is no longer than the widest patient's`);
    }
  }
});

test('words rules: symbols for comparisons, no arrows, no statement numbers in the node words, "Baveno VIII", Child–Pugh with an en dash', () => {
  const BAD = /\b(at least|over|under|more than|or more|less than|greater than|fewer than)\b/i;
  const STMT = /\b\d{1,2}\.\d{1,2}[a-c]?\b/;
  const units = (s) => s.replace(/\d+(\.\d+)?\s?(mg\/dL|kPa|%|mmHg)/g, '');
  const all = (A) => {
    const words = [A.label, ...nodes(A.tree).flatMap((n) => [n.t, n.r, n.s]), ...Object.values(A.mapWords).flat()];
    const read = [];
    for (const p of [...GRID[A.id], A.worst]) { for (const c of A.chips(p)) read.push(c); for (const k of A.outcomes) { const r = A.reading(k, p); read.push(r.head, r.why, r.next); } }
    if (A.compare) for (const p of GRID[A.id]) read.push(A.compare(p));
    return { words: words.filter(Boolean), read, notes: A.notes, stmts: nodes(A.tree).map((n) => n.stmt).filter(Boolean) };
  };
  for (const A of ALGOS) {
    const { words, read, notes, stmts } = all(A);
    for (const s of [...words, ...read, notes, ...stmts]) {
      assert.doesNotMatch(s, BAD, `${A.id}: "${s}"`);
      assert.doesNotMatch(s, /→|->|=>/, `${A.id}: "${s}"`);
      assert.doesNotMatch(s, /Baveno\s*\d|Baveno (?!VIII)/, `${A.id}: "${s}"`);
      assert.doesNotMatch(s, /Child-Pugh|Childs? Pugh/, `${A.id}: "${s}"`);
      assert.doesNotMatch(s, /\b[Oo]esophag/, `${A.id}: "${s}" (the app writes "esophageal", American spelling)`);
    }
    for (const s of [...words, ...read]) assert.doesNotMatch(units(s), STMT, `${A.id}: a statement number in "${s}"`);
    for (const s of [...words, ...read]) assert.doesNotMatch(s, /\bstatement\b/i, `${A.id}: "${s}"`);
    assert.ok(notes.length > 80 && !/\n/.test(notes), `${A.id}: notes are one paragraph`);
  }
  assert.match(psvdscope.notes, /8\.46/, 'the notes may cite statement numbers');
});
