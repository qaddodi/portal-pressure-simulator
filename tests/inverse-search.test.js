// Work backward: the search is honest. Readings that are not entered add nothing, a tie shows as a tie, a family that cannot give a reading says
// so, the next reading named is one that splits the scenarios, and a few readings are not enough to run on (src/engine/inverse.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY, LIBRARY_KEYS } from '../src/engine/inverse-library.js';
import {
  rank, normalise, residual, pointsOf, statusOf, nextReading, refinePoints, fitMark, gapLine, rangeText, readingText,
  READINGS, READING_KEYS, MIN_READINGS, TIE, POSSIBLE, MISS, SPLIT,
} from '../src/engine/inverse.js';
import { FAMILIES, FAMILY, keyOf, spanOf } from '../src/engine/inverse-families.js';

const POINTS = pointsOf(LIBRARY);
// A presinusoidal patient: normal HVPG, big spleen, low platelets, soft liver, stiff spleen, no fluid.
const A = { whvp: 8.0, fhvp: 4.5, ppg: 14, spleen: 16, plt: 78, lsm: 6.5, ssm: 68, asc: 0 };
// Cirrhosis: wedge well above the free pressure, stiff liver.
const B = { whvp: 21, fhvp: 5, lsm: 28, plt: 70, spleen: 16 };
// Right heart: both pressures high, RA high, tense fluid.
const C = { whvp: 19.5, fhvp: 18.5, ra: 15, asc: 3, lsm: 30, plt: 210 };
const ids = (r, ...s) => r.families.filter((f) => s.includes(f.status)).map((f) => f.id);

test('the library holds every reading key in the order the search reads', () => {
  assert.deepEqual(LIBRARY_KEYS, READING_KEYS);
  assert.equal(POINTS.length, FAMILIES.reduce((n, f) => n + f.grid.length, 0));
});

test('fewer than the minimum number of readings does not run', () => {
  const r = rank({ whvp: 8, fhvp: 4.5, lsm: 6 }, POINTS);
  assert.equal(MIN_READINGS, 4);
  assert.equal(r.ready, false);
  assert.equal(r.next, null);
  assert.deepEqual(r.play, []);
  assert.ok(r.possible >= 1 && r.possible <= FAMILIES.length, 'the count of families left still runs, so a guided entry can show it');
  const none = rank({}, POINTS);
  assert.equal(none.ready, false);
  assert.equal(none.possible, FAMILIES.length, 'with nothing entered every family is still possible');
});

test('a reading left blank adds nothing: the same ranking with and without it', () => {
  const a = rank(A, POINTS), b = rank({ ...A, pv: '', ra: null, ivc: undefined, saag: NaN, varix: '' }, POINTS);
  assert.deepEqual(b.families.map((f) => [f.id, f.score]), a.families.map((f) => [f.id, f.score]));
  assert.equal(b.n, a.n);
});

test('readings out of range or not numbers are dropped and named, not scored', () => {
  const { readings, dropped } = normalise({ whvp: 8, fhvp: 'abc', lsm: 400, asc: 7, varix: 1.5, plt: 80 });
  assert.deepEqual(Object.keys(readings).sort(), ['plt', 'whvp']);
  assert.deepEqual(dropped.map((d) => d.key).sort(), ['asc', 'fhvp', 'lsm', 'varix']);
});

test('the HVPG and the PPG are dropped when the pressures they are made of are in', () => {
  const both = normalise({ whvp: 14, fhvp: 5, hvpg: 9, pv: 18, ivc: 6, ppg: 12 });
  assert.equal('hvpg' in both.readings, false);
  assert.equal('ppg' in both.readings, false);
  assert.deepEqual(both.dropped.map((d) => d.key).sort(), ['hvpg', 'ppg']);
  const one = normalise({ whvp: 14, hvpg: 9, pv: 18, ppg: 12 });
  assert.equal(one.readings.hvpg, 9);
  assert.equal(one.readings.ppg, 12);
});

test('residuals: absolute in allowed errors, log for stiffness and counts, a grade inside its range is perfect', () => {
  assert.equal(residual('whvp', 8, 8), 0);
  assert.ok(Math.abs(residual('whvp', 8, 9.5) - 1) < 1e-9);
  assert.ok(Math.abs(residual('lsm', 10, 10 * Math.exp(0.18)) - 1) < 1e-9);
  assert.equal(residual('asc', 1, 600), 0);
  assert.equal(residual('asc', 0, 100), 0);
  assert.ok(residual('asc', 0, 3000) > 3, 'tense fluid is far from none');
  assert.ok(residual('asc', 3, 100) < -3);
  assert.equal(residual('varix', 2, 6), 0);
  assert.ok(residual('varix', 2, 1) < 0);
  assert.equal(residual('ssm', 60, null), MISS);
});

test('statuses: the best and its ties, then possible, then ruled out', () => {
  assert.equal(statusOf(0), 'best');
  assert.equal(statusOf(TIE), 'tie');
  assert.equal(statusOf(TIE + 0.1), 'possible');
  assert.equal(statusOf(POSSIBLE), 'possible');
  assert.equal(statusOf(POSSIBLE + 0.1), 'out');
  assert.equal(fitMark(0.9), 'fit');
  assert.equal(fitMark(-1.5), 'near');
  assert.equal(fitMark(2), 'off');
});

test('readings of a presinusoidal patient tie the presinusoidal families and rule out cirrhosis', () => {
  const r = rank(A, POINTS);
  assert.equal(r.ready, true);
  const top = ids(r, 'best', 'tie');
  assert.ok(top.includes('presin'), `top ${top}`);
  assert.ok(top.length >= 2, 'one answer from this few readings would be a false sureness: ' + top);
  assert.ok(!top.includes('sinus'), 'ordinary cirrhosis does not give an HVPG this low with a spleen this big');
});

test('cirrhosis readings put a sinusoidal family first and no presinusoidal one in the tie', () => {
  const r = rank(B, POINTS);
  assert.ok(['sinus', 'mixpre'].includes(r.families[0].id), r.families[0].id);
  assert.ok(!ids(r, 'best', 'tie').includes('presin'));
});

test('right heart readings put a cardiac family first and it ties constriction with right heart failure', () => {
  const r = rank(C, POINTS);
  assert.ok(['rhf', 'constr', 'mixrhf'].includes(r.families[0].id), r.families[0].id);
  assert.notEqual(r.families[0].marks.ra, 'off', 'RA is a reading it can explain');
  assert.ok(r.families.slice(0, 2).every((f) => ['constr', 'rhf'].includes(f.id)), 'constriction and right heart failure tie: the model cannot tell them apart');
  assert.equal(r.next?.verdict, 'none', 'no reading the model makes splits them');
});

test('every family returns its fit range for each setting, and a whole-span range is marked as not set', () => {
  const r = rank(A, POINTS);
  for (const f of r.families) {
    for (const k of FAMILY[f.id].axes) {
      const g = f.ranges[k], [lo, hi] = spanOf(f.id, k);
      assert.ok(g.lo >= lo && g.hi <= hi && g.lo <= g.hi, f.id + ' ' + k);
      assert.equal(g.whole, hi > lo && g.lo <= lo && g.hi >= hi);
    }
  }
  assert.equal(rangeText('clot', { lo: 50, hi: 100, whole: true, fixed: false }), 'not set by these readings');
  assert.equal(rangeText('pre', { lo: 30, hi: 60, whole: false, fixed: false }), '×30 to ×60');
});

test('what a family cannot explain is listed with its prediction and what was entered', () => {
  const r = rank(B, POINTS);
  const presin = r.families.find((f) => f.id === 'presin');
  assert.ok(presin.gaps.length >= 1, 'a presinusoidal block does not give a wedge of 21 with a free pressure of 5');
  const g = presin.gaps[0];
  assert.match(gapLine(g), /^Predicts .+; you entered .+\.$/);
  assert.equal(readingText('asc', 2), 'Grade 2');
  assert.equal(readingText('whvp', 8), '8.0 mmHg');
});

test('the next reading is one that is not entered, and its verdict says how much it helps', () => {
  const r = rank(A, POINTS);
  assert.ok(r.next, 'a tie leaves a reading that could split it');
  assert.ok(!(r.next.key in r.readings));
  assert.ok(['splits', 'barely', 'none'].includes(r.next.verdict));
  assert.equal(r.next.verdict === 'splits', r.next.sep >= SPLIT);
  assert.ok(r.next.pair.every((id) => ids(r, 'best', 'tie').includes(id)));
});

test('with one scenario left there is nothing to split', () => {
  assert.equal(nextReading({}, []), null);
  assert.equal(nextReading({}, [{ id: 'sinus', best: { pred: { pv: 20 } } }]), null);
});

test('the next reading of two scenarios that differ in one number is that number', () => {
  const play = [{ id: 'a', best: { pred: { pvVel: 0, ra: 4 } } }, { id: 'b', best: { pred: { pvVel: 24, ra: 4.5 } } }];
  const n = nextReading({}, play);
  assert.equal(n.key, 'pvVel');
  assert.equal(n.verdict, 'splits');
  assert.deepEqual(n.pair, ['a', 'b']);
  const same = nextReading({}, [{ id: 'a', best: { pred: { pvVel: 20, ra: 4 } } }, { id: 'b', best: { pred: { pvVel: 21, ra: 4.1 } } }]);
  assert.equal(same.verdict, 'none');
});

test('refinement looks one step either side of the best fit, inside the span, and never at a point it already has', () => {
  const r = rank(A, POINTS), known = new Set(POINTS.map((p) => keyOf(p.f, p.p)));
  const pts = refinePoints(r, known, { families: 3, max: 40 });
  assert.ok(pts.length <= 40);
  for (const pt of pts) {
    assert.ok(!known.has(keyOf(pt.f, pt.p)));
    for (const k of FAMILY[pt.f].axes) { const [lo, hi] = spanOf(pt.f, k); assert.ok(pt.p[k] >= lo - 1e-9 && pt.p[k] <= hi + 1e-9); }
  }
  assert.deepEqual(refinePoints({ ready: false }, known), []);
});

test('every reading has an allowed error and, when it is a grade, a name for each grade', () => {
  for (const k of READING_KEYS) {
    const r = READINGS[k];
    assert.ok(r.sigma > 0 && r.label && r.short, k);
    if (r.kind === 'grade') assert.ok(r.grades.length >= 3);
  }
});

test('a combination of two lesions comes first only when the readings need both', () => {
  // Cirrhosis with a failing right heart: a wedge well above the free pressure (liver) with both high (heart), a raised RA, a stiff liver and a big spleen.
  const both = rank({ whvp: 24, fhvp: 14, ra: 11, lsm: 26, plt: 85, spleen: 16, asc: 2 }, POINTS);
  assert.ok(['mixconstr', 'mixrhf'].includes(both.families[0].id), 'cirrhosis + a heart lesion: ' + both.families[0].id);
  assert.ok(FAMILY[both.families[0].id].parts.includes('sinus'), 'and it is a two-lesion family');
  const single = both.families.filter((f) => !FAMILY[f.id].parts && (f.status === 'best' || f.status === 'tie'));
  assert.deepEqual(single, [], 'neither lesion alone explains all of it');
  // Readings one lesion explains do not hand the win to a combination that merely has more settings to turn.
  assert.ok(!FAMILY[rank(B, POINTS).families[0].id].parts, 'cirrhosis alone');
  assert.ok(!FAMILY[rank(C, POINTS).families[0].id].parts, 'the heart alone');
});

test('every combination is two real lesions, charged for the second, with settings that do not repeat', () => {
  const combos = FAMILIES.filter((f) => f.parts);
  assert.ok(combos.length >= 6);
  for (const f of combos) {
    assert.equal(f.parts.length, 2, f.id);
    assert.equal(f.free, f.axes.length + 1, f.id + ': the second lesion costs one more setting');
    assert.ok(f.parts.every((id) => FAMILY[id] && !FAMILY[id].parts), f.id + ': made of single lesions');
    const own = f.parts.flatMap((id) => FAMILY[id].axes);
    assert.equal(new Set(own).size, own.length, f.id + ': no setting belongs to both parts');
    assert.ok(f.axes.every((k) => own.includes(k)), f.id);
  }
  // The room for a combination in the ranking: it costs more than either part alone.
  for (const f of combos) for (const id of f.parts) assert.ok(f.free >= FAMILY[id].free - 1, f.id);
});
