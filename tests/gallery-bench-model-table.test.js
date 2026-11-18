// The Model table bench (src/ui/gallery/benches/model-table.js): the pure parts, in node. Every patient the engine has gets a snapshot row (or is
// listed as missing), a live frame equal to the snapshot has no drift, and a number past the stated tolerance is flagged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import bench, { TOLERANCE, NUMBERS, snapshotRows, missingSnapshots, orphanSnapshots, compareSnapshot, liveReading, limitOf, limitText, fmtNumber, tableText, overviewText } from '../src/ui/gallery/benches/model-table.js';
import { BENCHES } from '../src/ui/gallery/benches/index.js';
import { SNAPSHOTS, PATH } from '../src/ui/snapshots.js';
import { PRESETS } from '../src/engine/scenario.js';
import { NODES } from '../src/engine/topology.js';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
/** A live frame that has exactly the snapshot's numbers (what a freshly loaded, settled patient reports). */
function frameOf(s) {
  const P = new Float32Array(NODES.length);
  PATH.forEach(([node], n) => { P[NI[node]] = s.P[n]; });
  return { P, Pf: P, metrics: { hvpg: s.hvpg, whvp: s.fp.whvp, fhvp: s.fp.fhvp, ppg: s.fp.ppg, pv: s.pv, pvFlow: s.pvFlow, ascites: { volume: s.fp.asc } } };
}

test('the bench is the one the list names', () => {
  const entry = BENCHES.find((b) => b.id === 'model-table');
  assert.equal(bench.id, entry.id);
  assert.equal(bench.title, entry.title);
  assert.equal(typeof bench.mount, 'function');
});

test('the tolerance is the stated one', () => {
  assert.equal(TOLERANCE.pressureMmHg, 0.5);
  assert.equal(TOLERANCE.flowPct, 5);
  assert.ok(Object.isFrozen(TOLERANCE));
});

test('every patient the engine has is a snapshot row or is listed as missing', () => {
  const rows = snapshotRows();
  assert.equal(rows.length, PRESETS.length);
  assert.deepEqual(rows.map((r) => r.id), PRESETS.map((p) => p.id));
  const missing = missingSnapshots();
  assert.deepEqual(rows.filter((r) => r.missing).map((r) => r.id), missing);
  for (const r of rows) assert.ok(r.snap || r.missing, r.id);
  // (snapshots.js is written from the model by scripts/snapshots.mjs and checked by snapshots.test.js: nobody is missing, nothing is left over)
  assert.deepEqual(missing, []);
  assert.deepEqual(orphanSnapshots(), []);
});

test('a patient without a snapshot is a missing row with no numbers', () => {
  const rows = snapshotRows([{ id: 'nobody', label: 'Nobody', group: 'Yours' }, PRESETS[0]], SNAPSHOTS);
  assert.equal(rows[0].missing, true);
  assert.equal(rows[0].snap, null);
  assert.equal(rows[0].summary, null);
  assert.equal(rows[1].missing, false);
  assert.deepEqual(missingSnapshots([{ id: 'nobody' }], SNAPSHOTS), ['nobody']);
  assert.deepEqual(orphanSnapshots([PRESETS[0]], SNAPSHOTS).length, Object.keys(SNAPSHOTS).length - 1);
});

test('the rows carry the snapshot in the units the table prints: mmHg and mL/min', () => {
  const healthy = snapshotRows().find((r) => r.id === 'healthy');
  assert.equal(healthy.summary.hvpg, SNAPSHOTS.healthy.hvpg);
  assert.equal(healthy.summary.flow, Math.round(SNAPSHOTS.healthy.pvFlow * 1000));   // (L/min in the file, mL/min on the page)
  assert.equal(NUMBERS.find((n) => n.key === 'pvFlow').unit, 'mL/min');
  assert.ok(NUMBERS.filter((n) => n.kind === 'pressure').every((n) => n.unit === 'mmHg'));
  assert.equal(NUMBERS.find((n) => n.key === 'ppg').label, 'PPG (PV − IVC)');
  assert.match(NUMBERS.find((n) => n.key === 'hvpg').label, /^HVPG/);
  assert.equal(new Set(NUMBERS.map((n) => n.key)).size, NUMBERS.length);
});

test('a live frame equal to the snapshot has no drift, for every patient', () => {
  for (const r of snapshotRows()) {
    const c = compareSnapshot(r.snap, frameOf(r.snap));
    assert.deepEqual(c.drifted, [], r.id);
    assert.equal(c.drift, false);
    assert.equal(c.compared, NUMBERS.length, `${r.id}: every number compared`);
    for (const row of c.rows) assert.equal(row.diff, 0, `${r.id} ${row.key}`);
  }
});

test('a pressure past 0.5 mmHg is drift, exactly 0.5 is not', () => {
  const s = SNAPSHOTS['cirr-decomp'];
  const f = frameOf(s);
  f.metrics.hvpg = s.hvpg + 0.5;
  assert.equal(compareSnapshot(s, f).drift, false);
  f.metrics.hvpg = s.hvpg + 0.6;
  const c = compareSnapshot(s, f);
  assert.deepEqual(c.drifted, ['hvpg']);
  assert.equal(c.rows.find((r) => r.key === 'hvpg').diff, 0.6);
  // a station of the pathway too, and a lower value
  const g = frameOf(s);
  g.Pf[NI.RA] = s.P[7] - 1;
  assert.deepEqual(compareSnapshot(s, g).drifted, ['P.RA']);
});

test('a flow is held to 5 percent, with the snapshot\'s own rounding step as the least', () => {
  const s = SNAPSHOTS.healthy;   // 1.09 L/min = 1090 mL/min: 5 % is 54.5
  const f = frameOf(s);
  f.metrics.pvFlow = s.pvFlow * 1.04;
  assert.equal(compareSnapshot(s, f).drift, false);
  f.metrics.pvFlow = s.pvFlow * 1.07;
  assert.deepEqual(compareSnapshot(s, f).drifted, ['pvFlow']);
  // zero flow (acute portal vein thrombosis): 5 % of nothing is nothing, so the step is the allowance
  const t = SNAPSHOTS['pvt-acute'], g = frameOf(t);
  g.metrics.pvFlow = 0.009;
  assert.equal(compareSnapshot(t, g).drift, false);
  g.metrics.pvFlow = 0.02;
  assert.deepEqual(compareSnapshot(t, g).drifted, ['pvFlow']);
  assert.equal(limitOf('flow', 1090), 54.5);
  assert.equal(limitOf('flow', 0), TOLERANCE.flowFloorMlMin);
  assert.equal(limitOf('pressure', 99), 0.5);
});

test('a tolerance can be passed, and a number the live frame lacks is not drift', () => {
  const s = SNAPSHOTS.csph;
  const f = frameOf(s);
  f.metrics.ppg = s.fp.ppg + 1;
  assert.equal(compareSnapshot(s, f).drift, true);
  assert.equal(compareSnapshot(s, f, { ...TOLERANCE, pressureMmHg: 2 }).drift, false);
  const bare = compareSnapshot(s, { P: null, Pf: null, metrics: {} });
  assert.equal(bare.drift, false);
  assert.equal(bare.compared, 0);
  assert.equal(compareSnapshot(s, null).compared, 0);
  assert.equal(compareSnapshot(null, frameOf(s)).compared, 0);
  assert.deepEqual(Object.values(liveReading(null)).filter((v) => v !== null), []);
  assert.equal(liveReading(frameOf(s)).hvpg, s.hvpg);
});

test('the text names the patient, the units, the allowance and the drift', () => {
  const s = SNAPSHOTS['cirr-decomp'];
  const f = frameOf(s); f.metrics.hvpg = s.hvpg + 2;
  const text = tableText('Decompensated cirrhosis', compareSnapshot(s, f), 'Live numbers are for this patient.');
  assert.match(text, /^Model table: Decompensated cirrhosis/);
  assert.match(text, /HVPG \(WHVP − FHVP\)\tmmHg\t16\.5\t18\.5\t\+2\.0\t0\.5 mmHg\tDRIFT/);
  assert.match(text, /Portal vein flow\tmL\/min\t770\t770/);
  assert.match(text, /Drift in 1 number: hvpg/);
  assert.match(tableText('x', compareSnapshot(s, frameOf(s)), ''), /No drift/);
  assert.match(tableText('x', compareSnapshot(s, null), ''), /Nothing compared/);
  assert.match(overviewText(snapshotRows()), /PPG \(PV − IVC\) \(mmHg\)/);
  assert.equal(fmtNumber(null, 'pressure'), '—');
  assert.equal(fmtNumber(7.84, 'pressure'), '7.8');
  assert.equal(fmtNumber(1089.6, 'flow'), '1090');
  assert.equal(limitText('flow'), '5% (at least 10 mL/min)');
});
