// Guideline path card, algorithm modules of group A (src/ui/path-algos/): gastric, ascites, stopcarv, holdcarv, secprop.
// The lit path for every preset patient of the mock and the cut-offs either side, the readings, and the words rules over every string.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import gastric from '../src/ui/path-algos/gastric.js';
import ascites from '../src/ui/path-algos/ascites.js';
import stopcarv from '../src/ui/path-algos/stopcarv.js';
import holdcarv from '../src/ui/path-algos/holdcarv.js';
import secprop from '../src/ui/path-algos/secprop.js';
import { leavesOf } from '../src/ui/path-algos/helpers.js';
import { flat, slots, treeBoxes, treePlace, nodeParas, flow, COL_MIN, NODE_MAX, NODE_MAX_E3, E3_LEAVES } from '../src/ui/tool-path.js';
import { loadMetrics, textCovers } from '../src/ui/text-gl.js';

const ALGOS = [gastric, ascites, stopcarv, holdcarv, secprop];
const TONES = ['n', 'ok', 'warn', 'bad'];
const nodes = (a) => flat(a.tree).map((x) => x.n);
const lit = (a, p) => a.lit(a.patientFor({ of: a.id, patient: p }, null));
const sorted = (L) => [...L].sort();

test('every module has the contract\'s shape, unique ids and node ids', () => {
  assert.deepEqual(ALGOS.map((a) => a.id), ['gastric', 'ascites', 'stopcarv', 'holdcarv', 'secprop']);
  assert.equal(new Set(ALGOS.map((a) => a.id)).size, ALGOS.length);
  for (const a of ALGOS) {
    assert.equal(a.kind, 'tree', a.id);
    assert.equal(a.source, 'Baveno VIII', a.id);
    assert.equal(typeof a.cite, 'string', a.id);
    assert.ok(a.label && a.notes && a.notes.length > 100, a.id);
    const ids = nodes(a).map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length, `${a.id}: node ids are unique`);
    assert.equal(ids[0], 'root');
    for (const n of nodes(a)) {
      assert.ok(TONES.includes(n.tone), `${a.id}/${n.id} has a tone`);
      assert.ok(n.t, `${a.id}/${n.id} has a condition`);
      if (n.id !== 'root') assert.ok(n.sh, `${a.id}/${n.id} has a short name`);
      if (n.id !== 'root') assert.ok(Array.isArray(a.mapWords[n.id]) && a.mapWords[n.id].length >= 1 && a.mapWords[n.id].length <= 2, `${a.id}/${n.id} has map words`);
    }
    for (const k of Object.keys(a.mapWords)) assert.ok(ids.includes(k) && k !== 'root', `${a.id}: map words for a node that exists (${k})`);
    assert.ok(leavesOf(a.tree) <= 3, `${a.id}: at most 3 leaf columns`);
    assert.equal(slots(a.tree).n, leavesOf(a.tree));
  }
  assert.equal(gastric.cite, 'Fig. 3');
  for (const a of [ascites, stopcarv, holdcarv, secprop]) assert.equal(a.cite, '', `${a.id} has no figure`);
});

// [name, patient, lit set of ids, outcome]
const CASES = {
  gastric: [
    ['Child–Pugh B9, fit', { cp: 9, fit: true }, ['acute', 'root', 'tipsg'], 'tipsg'],
    ['Child–Pugh C14', { cp: 14, fit: true }, ['acute', 'mdt', 'root'], 'mdt'],
    ['Heart failure', { cp: 10, fit: false }, ['acute', 'mdt', 'root'], 'mdt'],
    ['C13 is the last score that takes TIPS', { cp: 13, fit: true }, ['acute', 'root', 'tipsg'], 'tipsg'],
    ['A5, fit', { cp: 5, fit: true }, ['acute', 'root', 'tipsg'], 'tipsg'],
    ['C15', { cp: 15, fit: true }, ['acute', 'mdt', 'root'], 'mdt'],
  ],
  ascites: [
    ['TIPS possible', { tips: true, lt: true }, ['root', 'tips'], 'tips'],
    ['TIPS possible, no transplant', { tips: true, lt: false }, ['root', 'tips'], 'tips'],
    ['No TIPS, transplant candidate', { tips: false, lt: true }, ['lt', 'nt', 'root'], 'lt'],
    ['No TIPS, no transplant', { tips: false, lt: false }, ['drain', 'nt', 'root'], 'drain'],
  ],
  stopcarv: [
    ['LSM 8', { hv: 'none', lsm: 8, ssm: 20 }, ['res', 'root', 'stop'], 'stop'],
    ['LSM 13, SSM 20', { hv: 'none', lsm: 13, ssm: 20 }, ['res', 'root', 'stop'], 'stop'],
    ['LSM 28', { hv: 'none', lsm: 28, ssm: 50 }, ['keep', 'open', 'root'], 'keep'],
    ['HVPG 7 off carvedilol', { hv: 'low', lsm: 18, ssm: 40 }, ['res', 'root', 'stop'], 'stop'],
    ['LSM 9.9 is <10', { hv: 'none', lsm: 9.9, ssm: 60 }, ['res', 'root', 'stop'], 'stop'],
    ['LSM 10 is not <10', { hv: 'none', lsm: 10, ssm: 25 }, ['keep', 'open', 'root'], 'keep'],
    ['LSM 14.9 with SSM 24.9', { hv: 'none', lsm: 14.9, ssm: 24.9 }, ['res', 'root', 'stop'], 'stop'],
    ['LSM 15 is not <15', { hv: 'none', lsm: 15, ssm: 20 }, ['keep', 'open', 'root'], 'keep'],
    ['SSM 25 is not <25', { hv: 'none', lsm: 14, ssm: 25 }, ['keep', 'open', 'root'], 'keep'],
    ['LSM 25 does not rule in; nothing resolved', { hv: 'none', lsm: 25, ssm: 30 }, ['keep', 'open', 'root'], 'keep'],
    ['HVPG ≥10 off carvedilol beats a low stiffness', { hv: 'high', lsm: 8, ssm: 20 }, ['keep', 'open', 'root'], 'keep'],
  ],
  holdcarv: [
    ['Low pressure, HRS-AKI', { held: false, sbp: 84, hrs: true }, ['low', 'root'], 'low'],
    ['Stable', { held: false, sbp: 112, hrs: false }, ['okk', 'root'], 'okk'],
    ['Recovered, held', { held: true, sbp: 108, hrs: false }, ['back', 'root'], 'back'],
    ['SBP 90 is not <90', { held: false, sbp: 90, hrs: false }, ['okk', 'root'], 'okk'],
    ['SBP 89', { held: false, sbp: 89, hrs: false }, ['low', 'root'], 'low'],
    ['HRS-AKI alone', { held: false, sbp: 120, hrs: true }, ['low', 'root'], 'low'],
    ['Held, still low', { held: true, sbp: 80, hrs: false }, ['low', 'root'], 'low'],
    ['Held, HRS-AKI persists', { held: true, sbp: 110, hrs: true }, ['low', 'root'], 'low'],
    ['MAP 65 is not <65', { held: false, sbp: 100, hrs: false, map: 65 }, ['okk', 'root'], 'okk'],
    ['MAP 64', { held: false, sbp: 100, hrs: false, map: 64 }, ['low', 'root'], 'low'],
  ],
  secprop: [
    ['Both possible', { more: false, can: 'both' }, ['both', 'only', 'root'], 'both'],
    ['Banding only', { more: false, can: 'evl' }, ['mono', 'only', 'root'], 'mono'],
    ['Carvedilol only', { more: false, can: 'nsbb' }, ['mono', 'only', 'root'], 'mono'],
    ['Ascites too', { more: true, can: 'both' }, ['more', 'root'], 'more'],
    ['Ascites too, banding only', { more: true, can: 'evl' }, ['more', 'root'], 'more'],
  ],
};

test('the lit path for each preset patient and either side of each cut-off', () => {
  for (const a of ALGOS) {
    assert.ok(CASES[a.id].length >= 4, a.id);
    for (const [name, p, ids, outcome] of CASES[a.id]) {
      const L = lit(a, p);
      assert.deepEqual(sorted(L), ids, `${a.id}: ${name}`);
      assert.equal(a.outcomeOf(L), outcome, `${a.id}: ${name}`);
    }
    // always the root; every lit node is in the tree and its parent is lit
    const parent = new Map(flat(a.tree).flatMap(({ n }) => (n.kids || []).map((k) => [k.id, n.id])));
    for (const [, p] of CASES[a.id]) {
      const L = lit(a, p);
      assert.ok(L.has('root'));
      for (const id of L) { if (id !== 'root') { assert.ok(parent.has(id), `${a.id}: ${id} is a node`); assert.ok(L.has(parent.get(id)), `${a.id}: ${id}'s parent is lit`); } }
    }
  }
});

test('gastric: the acute phase always, TIPS when Child–Pugh ≤13 and fit, else the other options; it keeps its two readings', () => {
  for (let cp = 5; cp <= 15; cp++) for (const fit of [true, false]) {
    const p = { src: 'gv', cp, fit };
    assert.deepEqual(sorted(gastric.lit(p)), sorted(['root', 'acute', cp <= 13 && fit ? 'tipsg' : 'mdt']), `cp ${cp} fit ${fit}`);
    const key = gastric.outcomeOf(gastric.lit(p));
    const r = gastric.reading(key, p);
    assert.equal(r.head, 'Two phases, in parallel');
    assert.match(r.next, key === 'tipsg' ? /Then TIPS ± embolization as soon as possible/ : /TIPS is not an option/);
  }
  assert.deepEqual(gastric.outcomes, ['tipsg', 'mdt']);
  assert.deepEqual(gastric.patientFor({ of: 'gastric' }, { lsm: 20, hvpg: 12 }), { src: 'gv', cp: 9, fit: true }, 'default: Child–Pugh 9, fit; the live readings are not used');
  assert.deepEqual(gastric.patientFor({ of: 'gastric', patient: { cp: 14, fit: false } }), { src: 'gv', cp: 14, fit: false });
  assert.match(gastric.reading('mdt', { src: 'gv', cp: 14, fit: true }).next, /Child–Pugh C14/);
  assert.match(gastric.reading('mdt', { src: 'gv', cp: 10, fit: false }).next, /\(not a candidate\)/);
  assert.deepEqual(gastric.chips({ src: 'gv', cp: 14, fit: false }), ['GOV2 or IGV1', 'Child–Pugh C14', 'Not a TIPS candidate']);
  assert.deepEqual(gastric.chips({ src: 'gv', cp: 9, fit: true }), ['GOV2 or IGV1', 'Child–Pugh B9']);
});

test('the patient is the defaults, the slide\'s own facts over them, and the live readings over both', () => {
  const shown = (k, v) => Math.round(v * 10) / 10;
  assert.deepEqual(ascites.patientFor({ of: 'ascites' }), { tips: true, lt: true });
  assert.deepEqual(ascites.patientFor({ of: 'ascites', patient: { tips: false } }), { tips: false, lt: true });
  assert.deepEqual(stopcarv.patientFor({ of: 'stopcarv' }, null, shown), { hv: 'none', lsm: 8, ssm: 20 });
  assert.deepEqual(stopcarv.patientFor({ of: 'stopcarv', patient: { hv: 'low', lsm: 18 } }, { lsm: 7.26 }, shown), { hv: 'low', lsm: 7.3, ssm: 20 });
  assert.deepEqual(stopcarv.patientFor({ of: 'stopcarv' }, { lsm: NaN, ssm: 31.04 }, shown), { hv: 'none', lsm: 8, ssm: 31 }, 'a missing reading leaves the slide\'s own');
  assert.deepEqual(holdcarv.patientFor({ of: 'holdcarv' }), { held: false, sbp: 84, hrs: true });
  assert.deepEqual(holdcarv.patientFor({ of: 'holdcarv', patient: { held: true, sbp: 108, hrs: false, map: 70 } }), { held: true, sbp: 108, hrs: false, map: 70 });
  assert.deepEqual(secprop.patientFor({ of: 'secprop' }), { more: false, can: 'both' });
  assert.deepEqual(secprop.patientFor({ of: 'secprop', patient: { can: 'evl' } }), { more: false, can: 'evl' });
  for (const a of ALGOS) {
    const p = a.patientFor({ of: a.id }, { lsm: NaN, plt: undefined }, shown);
    assert.doesNotMatch(JSON.stringify(a.chips(p)), /undefined|NaN|null/, a.id);
  }
});

test('every outcome has a reading with a tone and no stray words, from the patient\'s own numbers', () => {
  for (const a of ALGOS) {
    assert.ok(a.outcomes.length >= 2, a.id);
    for (const [name, p, , outcome] of CASES[a.id]) {
      const r = a.reading(outcome, a.patientFor({ of: a.id, patient: p }));
      assert.ok(r.head && r.why && r.next && r.stmt && TONES.includes(r.tone), `${a.id}/${outcome} (${name})`);
      assert.doesNotMatch(`${r.head} ${r.why} ${r.next}`, /undefined|NaN|null|\[object/, `${a.id}/${outcome} (${name})`);
    }
    for (const k of a.outcomes) {
      const seen = CASES[a.id].some((c) => c[3] === k);
      assert.ok(seen, `${a.id}: a case ends in ${k}`);
      assert.equal(a.outcomeOf(new Set(['root', k])), k, `${a.id}/${k}`);
    }
    assert.equal(a.outcomeOf(new Set(['root'])), null, `${a.id}: nothing lit past the start has no outcome`);
  }
  assert.match(stopcarv.reading('stop', { hv: 'none', lsm: 8, ssm: 20 }).why, /LSM 8 kPa is <10/);
  assert.match(stopcarv.reading('stop', { hv: 'none', lsm: 13, ssm: 20 }).why, /LSM 13 kPa is <15 and SSM 20 kPa is <25/);
  assert.match(stopcarv.reading('stop', { hv: 'low', lsm: 18, ssm: 40 }).why, /HVPG is <10 mmHg off carvedilol/);
  assert.match(stopcarv.reading('keep', { hv: 'none', lsm: 28, ssm: 50 }).why, /LSM 28 kPa is >25/);
  assert.match(stopcarv.reading('keep', { hv: 'none', lsm: 12, ssm: 30 }).why, /No test has shown/);
  assert.match(stopcarv.reading('keep', { hv: 'high', lsm: 8, ssm: 20 }).why, /HVPG is ≥10 mmHg/);
  assert.match(holdcarv.reading('low', { held: false, sbp: 84, hrs: true }).why, /^SBP 84 mmHg is <90 and there is HRS-AKI\.$/);
  assert.match(holdcarv.reading('low', { held: false, sbp: 120, hrs: true }).why, /^There is HRS-AKI\.$/);
  assert.match(holdcarv.reading('low', { held: false, sbp: 100, hrs: false, map: 60 }).why, /^MAP 60 mmHg is <65\.$/);
  assert.equal(holdcarv.reading('low', { held: true, sbp: 84, hrs: true }).head, 'Stay off carvedilol');
  assert.equal(holdcarv.reading('low', { held: false, sbp: 84, hrs: true }).head, 'Reduce or stop carvedilol');
  assert.match(holdcarv.reading('okk', { held: false, sbp: 112, hrs: false }).why, /112 mmHg is ≥90/);
  assert.equal(secprop.reading('mono', { more: false, can: 'evl' }).head, 'Banding alone');
  assert.equal(secprop.reading('mono', { more: false, can: 'nsbb' }).head, 'Carvedilol alone');
  assert.deepEqual(secprop.chips({ more: false, can: 'evl' }), ['Esophageal bleed', 'Bleed only', 'Banding only']);
  assert.deepEqual(ascites.chips({ tips: false, lt: false }), ['Refractory ascites', 'No TIPS', 'Not a transplant candidate']);
  assert.deepEqual(ascites.chips({ tips: true, lt: true }), ['Refractory ascites', 'TIPS possible']);
  assert.deepEqual(holdcarv.chips({ held: false, sbp: 84, hrs: true }), ['On carvedilol', 'SBP 84', 'HRS-AKI']);
  assert.deepEqual(stopcarv.chips({ hv: 'none', lsm: 8, ssm: 20 }), ['HVPG not measured', 'LSM 8 kPa', 'SSM 20 kPa']);
});

test('worst prints the longest chips, so the card reserves room for any patient', () => {
  const len = (a, p) => a.chips(p).join('').length;
  const grids = {
    gastric: [5, 6, 7, 9, 10, 13, 14, 15].flatMap((cp) => [true, false].map((fit) => ({ src: 'gv', cp, fit }))),
    ascites: [true, false].flatMap((tips) => [true, false].map((lt) => ({ tips, lt }))),
    stopcarv: ['none', 'low', 'high'].flatMap((hv) => [8, 28, 99.9].map((lsm) => ({ hv, lsm, ssm: 99.9 }))),
    holdcarv: [true, false].flatMap((held) => [true, false].flatMap((hrs) => [70, 112, 140].map((sbp) => ({ held, hrs, sbp, map: 100 })))),
    secprop: [true, false].flatMap((more) => ['both', 'evl', 'nsbb'].map((can) => ({ more, can }))),
  };
  for (const a of ALGOS) {
    const w = len(a, a.worst);
    for (const p of grids[a.id]) assert.ok(len(a, p) <= w, `${a.id}: ${JSON.stringify(p)} (${len(a, p)}) is longer than worst (${w})`);
    // the longest reading too
    const lr = (p) => a.reading(a.outcomeOf(a.lit(p)), p);
    const wr = lr(a.worst);
    assert.ok(a.chips(a.worst).length >= 2);
    assert.ok(wr.head, a.id);
  }
});

test('the words rules: symbols for comparisons, no arrows, no statement numbers in the drawn words, Baveno VIII, Child–Pugh with an en dash', async () => {
  await loadMetrics();
  const BAD_WORDS = /\b(at least|over|under|more than|less than|or more|or less|below|above|greater than|fewer than)\b/i;
  for (const a of ALGOS) {
    const drawn = new Set();
    for (const n of nodes(a)) for (const k of ['t', 'r', 's']) if (n[k]) drawn.add(n[k]);
    for (const w of Object.values(a.mapWords)) for (const s of w) drawn.add(s);
    for (const [, p] of CASES[a.id]) {
      const pt = a.patientFor({ of: a.id, patient: p });
      for (const s of a.chips(pt)) drawn.add(s);
      for (const k of a.outcomes) { const r = a.reading(k, pt); for (const f of ['head', 'why', 'next']) drawn.add(r[f]); }
    }
    for (const k of a.outcomes) { const r = a.reading(k, a.worst); for (const f of ['head', 'why', 'next']) drawn.add(r[f]); }
    for (const s of a.chips(a.worst)) drawn.add(s);
    drawn.add(a.label); drawn.add(a.source); if (a.cite) drawn.add(a.cite);
    for (const s of drawn) {
      assert.doesNotMatch(s, BAD_WORDS, `${a.id}: a comparison in words in "${s}"`);
      assert.doesNotMatch(s, /→|->/, `${a.id}: an arrow in "${s}"`);
      assert.doesNotMatch(s, /Baveno 8/, `${a.id}: "${s}"`);
      assert.doesNotMatch(s, /Child-Pugh|Child Pugh/, `${a.id}: Child–Pugh needs an en dash in "${s}"`);
      assert.doesNotMatch(s, /\boesophag/i, `${a.id}: the app's spelling is American (esophageal) in "${s}"`);
      assert.ok(textCovers(s), `${a.id}: the outlines have every character of "${s}"`);
    }
    for (const n of nodes(a)) for (const k of ['t', 'r', 's']) if (n[k]) assert.doesNotMatch(n[k], /\b\d+\.\d+\b/, `${a.id}/${n.id}.${k}: no statement number`);
    for (const [, p] of CASES[a.id]) {
      const pt = a.patientFor({ of: a.id, patient: p });
      for (const k of a.outcomes) { const r = a.reading(k, pt); for (const f of ['head', 'why', 'next']) assert.doesNotMatch(r[f].replace(/\b\d+\.\d\b(?= kPa)/g, ''), /\b\d+\.\d+\b/, `${a.id}/${k}.${f}: no statement number in "${r[f]}"`); }
    }
    for (const k of a.outcomes) assert.ok(a.reading(k, a.worst).stmt);
    assert.match(a.notes, /\d\.\d/, `${a.id}: the handout notes may cite statements`);
    assert.doesNotMatch(a.notes, /→|Baveno 8|Child-Pugh/);
  }
});

test('the chart: a column per leaf, nodes inside the card, none overlapping, every node\'s words fit its box', () => {
  for (const a of ALGOS) {
    const { n } = slots(a.tree);
    for (const W of [n * COL_MIN, 500, 716 - 32, 804 - 32]) {
      const boxes = treeBoxes(a.tree, W), byRow = new Map();
      for (const [id, b] of boxes) {
        assert.ok(b.left >= 0 && b.left + b.w <= W + 1e-6, `${a.id}/${id} inside the card at ${W}`);
        assert.ok(b.w <= (id === 'root' ? 330 : n <= E3_LEAVES ? NODE_MAX_E3 : NODE_MAX) + 1e-6, `${a.id}/${id}`);
        (byRow.get(b.d) || byRow.set(b.d, []).get(b.d)).push(b);
      }
      for (const row of byRow.values()) { row.sort((x, y) => x.left - y.left); for (let i = 1; i < row.length; i++) assert.ok(row[i].left >= row[i - 1].left + row[i - 1].w + 4, `${a.id}: row ${row[0].d} at ${W}`); }
      const pl = treePlace(a.tree, boxes, new Map(flat(a.tree).map(({ n: x }) => [x.id, x.id === 'root' ? 60 : 78])));
      assert.ok(pl.H > 0);
    }
    const boxes = treeBoxes(a.tree, 716 - 32);
    for (const { n: x } of flat(a.tree)) {
      const b = boxes.get(x.id), f = flow(nodeParas(x, x.id === 'root'), b.w, { align: 'center', gap: 2 });
      assert.ok(f.h >= 16 && f.h < 180, `${a.id}/${x.id}: ${f.h}`);
      for (const i of f.items) assert.ok(i.x >= -0.5, `${a.id}/${x.id}: a line starts inside its column`);
    }
  }
});
