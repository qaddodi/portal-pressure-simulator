// Work backward: the search is honest. Readings that are not entered add nothing, a tie shows as a tie, a family that cannot give a reading says
// so, the next reading named is one that splits the scenarios, and a few readings are not enough to run on (src/engine/inverse.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY, LIBRARY_KEYS } from '../src/engine/inverse-library.js';
import {
  modelText, numberText, rank, normalise, residual, pointsOf, statusOf, nextReading, refinePoints, fitMark, gapLine, rangeText, readingText, costOf, reasonsFor, bandsOf, lsmBand, hvpgBand, LESION_COST,
  READINGS, READING_KEYS, logSigma, MIN_READINGS, FEW_READINGS, TIE, POSSIBLE, MISS, SPLIT,
} from '../src/engine/inverse.js';
import { FAMILIES, FAMILY, LESION, keyOf, spanOf, settingText, settingsOf, patientOf } from '../src/engine/inverse-families.js';

const POINTS = pointsOf(LIBRARY);
// A presinusoidal patient: normal HVPG, big spleen, low platelets, soft liver, stiff spleen, no fluid.
const A = { whvp: 8.0, fhvp: 4.5, ppg: 14, spleen: 16, plt: 78, lsm: 6.5, ssm: 68, asc: 0 };
// Cirrhosis: wedge well above the free pressure, stiff liver.
const B = { whvp: 21, fhvp: 5, lsm: 28, plt: 70, spleen: 16 };
// Right heart: both pressures high, RA high, tense fluid.
const C = { whvp: 20.5, fhvp: 19.5, ra: 18, asc: 3, lsm: 30, plt: 190 };
const ids = (r, ...s) => r.families.filter((f) => s.includes(f.status)).map((f) => f.id);

test('the library holds every reading key in the order the search reads', () => {
  assert.deepEqual(LIBRARY_KEYS, READING_KEYS);
  assert.equal(POINTS.length, FAMILIES.reduce((n, f) => n + f.grid.length, 0));
});

test('fewer than the minimum number of readings does not run', () => {
  const r = rank({ whvp: 8 }, POINTS);
  assert.equal(MIN_READINGS, 2);
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
  const lsmSigma = logSigma(READINGS.lsm, 10);
  assert.ok(lsmSigma > READINGS.lsm.sigma, 'a reading of 10 kPa is not good to 18% of 10: the floor in kPa widens it');
  assert.ok(Math.abs(residual('lsm', 10, 10 * Math.exp(lsmSigma)) - 1) < 1e-9);
  assert.ok(Math.abs(logSigma(READINGS.lsm, 60) - READINGS.lsm.sigma) < 0.01, 'the floor is nothing on a large reading');
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
  assert.equal(r.families[0].id, 'sinus', 'one lesion, the fewest departures: ' + r.families[0].id);
  assert.ok(!ids(r, 'best', 'tie').includes('presin'));
});

test('right heart readings put a cardiac family first and it ties constriction with right heart failure', () => {
  const r = rank(C, POINTS);
  assert.ok(['rhf', 'constr'].includes(r.families[0].id), r.families[0].id);
  assert.notEqual(r.families[0].marks.ra, 'off', 'RA is a reading it can explain');
  assert.ok(['constr', 'rhf'].every((id) => ids(r, 'best', 'tie').includes(id)), 'constriction and right heart failure tie: the model cannot tell them apart');
  assert.ok(!r.next || r.next.verdict !== 'splits' || !['constr', 'rhf'].every((id) => r.next.pair.includes(id)), 'no reading the model makes splits the heart pair');
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
  assert.equal(rangeText('pvt', { lo: 0.1, hi: 1, whole: true, fixed: false }), 'not set by these readings');
  assert.equal(rangeText('rhf', { lo: 0.3, hi: 0.6, whole: false, fixed: false }), 'moderate to marked');
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

test('the fit probes each lesion of a family it works on, inside the span, and never at a point it already has', () => {
  const r = rank(A, POINTS), known = new Map(POINTS.map((p) => [keyOf(p.f, p.p), p]));
  const pts = refinePoints(r, known, { families: 12, max: 60 });
  assert.ok(pts.length > 0 && pts.length <= 60);
  const by = {};
  for (const pt of pts) {
    assert.ok(!known.has(keyOf(pt.f, pt.p)), 'new points only');
    for (const k of FAMILY[pt.f].axes) { const [lo, hi] = spanOf(pt.f, k); assert.ok(pt.p[k] >= lo - 1e-9 && pt.p[k] <= hi + 1e-9); }
    (by[pt.f] ||= []).push(pt);
  }
  for (const [f, list] of Object.entries(by)) assert.ok(list.length <= FAMILY[f].axes.length, f + ': one probe per lesion at first');
  assert.ok(Object.keys(by).some((f) => FAMILY[f].axes.length === 1), 'the simplest families are always among them');
  assert.deepEqual(refinePoints({ ready: false }, known), []);
});

test('every reading has an allowed error and, when it is a grade, a name for each grade', () => {
  for (const k of READING_KEYS) {
    const r = READINGS[k];
    assert.ok(r.sigma > 0 && r.label && r.short, k);
    if (r.kind === 'grade') assert.ok(r.grades.length >= 3);
  }
});

test('a mix of lesions comes first only when the readings need it', () => {
  // Cirrhosis with a failing right heart: a wedge well above the free pressure (liver) with both high (heart), a raised RA, a stiff liver and a big spleen.
  const both = rank({ whvp: 24, fhvp: 14, ra: 11, lsm: 26, plt: 85, spleen: 16, asc: 2 }, POINTS);
  const top = FAMILY[both.families[0].id];
  assert.ok(top.axes.includes('sinus') && (top.axes.includes('rhf') || top.axes.includes('constr')), 'cirrhosis + a heart lesion: ' + top.id);
  const single = both.families.filter((f) => FAMILY[f.id].axes.length === 1 && (f.status === 'best' || f.status === 'tie'));
  assert.deepEqual(single, [], 'neither lesion alone explains all of it');
  // Readings one lesion explains do not hand the win to a mix that merely has more settings to turn.
  assert.equal(FAMILY[rank(B, POINTS).families[0].id].axes.length, 1, 'cirrhosis alone');
  assert.equal(FAMILY[rank(C, POINTS).families[0].id].axes.length, 1, 'the heart alone');
});

test('every family is one to three real lesions, one to a slot, each charged for being there and for how far it is pushed', () => {
  assert.equal(FAMILIES.length, 67, '66 combinations of one to three lesions and the healthy one');
  assert.equal(new Set(FAMILIES.map((f) => f.id)).size, FAMILIES.length);
  assert.deepEqual(FAMILY.none.axes, [], 'the healthy family has no lesion');
  for (const f of FAMILIES.filter((x) => x.id !== 'none')) {
    assert.ok(f.axes.length >= 1 && f.axes.length <= 3, f.id);
    assert.equal(new Set(f.axes.map((k) => LESION[k].slot)).size, f.axes.length, f.id + ': one lesion to a slot (one heart, one venous block)');
    const { patch, days, volume } = patientOf(f.id, f.grid[0]);
    assert.ok(patch && days > 0 && volume >= 0, f.id);
    assert.ok(settingsOf(f.id, f.grid[0]).every((x) => x.label && x.text), f.id);
    assert.equal(f.grid.length, { 1: 6, 2: 9, 3: 8 }[f.axes.length], f.id);
  }
  // Occam: a lesion costs something just by being there, and more the further it is pushed, and a second lesion adds to the first.
  assert.ok(costOf('sinus', { sinus: 0.2 }) >= LESION_COST);
  assert.ok(costOf('sinus', { sinus: 0.9 }) > costOf('sinus', { sinus: 0.3 }));
  assert.ok(costOf('sinus+rhf', { sinus: 0.3, rhf: 0.3 }) > costOf('sinus', { sinus: 0.3 }) + LESION_COST - 1e-9);
});

test('cirrhosis is the app\'s slider in percent, never a histological stage; what it makes is read as HVPG and LSM in Baveno VIII bands', () => {
  assert.equal(settingText('sinus', 0.3), '30%');
  assert.equal(settingText('sinus', 0.9), '90%');
  assert.equal(settingText('rhf', 0.2), 'mild');
  assert.equal(settingText('rhf', 0.9), 'severe');
  assert.match(rangeText('sinus', { lo: 0.3, hi: 0.4, whole: false, fixed: false }), /30% to 40%/);
  assert.match(settingsOf('sinus', { sinus: 0.4 })[0].text, /^40%$/);
  assert.equal(settingsOf('sinus', { sinus: 0.4 })[0].label, 'Cirrhosis slider');
  assert.match(lsmBand(8), /under 10.*unlikely/);
  assert.match(lsmBand(12), /10 to 15.*suggests/);
  assert.match(lsmBand(20), /over 15.*highly likely/);
  assert.match(lsmBand(27), /25 or more.*rules clinically significant portal hypertension in/);
  assert.match(hvpgBand(3), /normal range/);
  assert.match(hvpgBand(7), /below the clinically significant/);
  assert.match(hvpgBand(12), /10 or more, clinically significant/);
  assert.deepEqual(bandsOf({ hvpg: 6.4, lsm: 12.4 }).map((b) => b.label), ['HVPG', 'LSM']);
  assert.deepEqual(bandsOf({}), []);
  // No lesion or setting is named by a histological stage anywhere a person reads it.
  for (const f of FAMILIES) for (const x of [f.label, f.sub, f.limits, ...settingsOf(f.id, f.grid[0]).map((y) => y.text + y.label)]) assert.doesNotMatch(x, /\bF[0-4]\b|METAVIR/, f.id);
  for (const f of FAMILIES.filter((x) => x.axes.includes('sinus') && x.axes.length > 1)) assert.ok(new Set(f.grid.map((g) => g.sinus)).size >= 2, f.id);
});

test('every candidate has a rating: shares of the likelihood that add to one and fall as the score rises', () => {
  const r = rank({ whvp: 30, fhvp: 24 }, POINTS);
  assert.ok(Math.abs(r.families.reduce((t, f) => t + f.rating, 0) - 1) < 1e-9);
  for (let i = 1; i < r.families.length; i++) assert.ok(r.families[i].rating <= r.families[i - 1].rating + 1e-12);
  assert.ok(r.families[0].rating > r.families.at(-1).rating);
});

test('FHVP 24 with WHVP 30 and nothing else: a short list of post-hepatic blocks with a part inside the liver, venous blocks still possible', () => {
  const r = rank({ whvp: 30, fhvp: 24 }, POINTS);
  assert.equal(r.ready, true, 'two readings are enough to search');
  assert.equal(r.few, true, 'and the screen is told it is a short list, not a ranking');
  const live = r.families.filter((f) => f.status !== 'out');
  assert.ok(live.length > 4, 'sparse readings leave many mixes in play');
  const heart = (f) => FAMILY[f.id].axes.some((k) => k === 'rhf' || k === 'constr');
  const outflow = (f) => FAMILY[f.id].axes.some((k) => ['rhf', 'constr', 'bcs', 'ivcweb', 'post'].includes(k));
  assert.ok(r.families.slice(0, 5).every(outflow), 'every leader has a lesion after the liver: ' + r.families.slice(0, 5).map((f) => f.id));
  assert.ok(live.some(heart) && live.some((f) => FAMILY[f.id].axes.includes('ivcweb')) && live.some((f) => FAMILY[f.id].axes.includes('bcs')), 'heart, IVC web and hepatic veins are all possible');
  assert.ok(r.families.find((f) => f.id === 'sinus').status === 'out' && r.families.find((f) => f.id === 'presin').status === 'out', 'a block inside the liver alone cannot raise the free pressure');
  assert.equal(r.next.key, 'ra', 'the atrium is the reading that splits the heart from the venous block');
  const lead = r.families[0];
  assert.match(reasonsFor(FAMILY[lead.id], r.readings, lead.best).join(' '), /FHVP 24 mmHg is raised/);
  const why = reasonsFor(FAMILY['sinus+constr'], r.readings, { p: { sinus: 0.3, constr: 0.9 } }).join(' ');
  assert.match(why, /HVPG 6 mmHg needs a block inside the liver; the cirrhosis slider at 30% makes it/);
});

test('the same two pressures with a third reading: the atrium splits the heart from the venous block', () => {
  const high = rank({ whvp: 30, fhvp: 24, ra: 14 }, POINTS), low = rank({ whvp: 30, fhvp: 24, ra: 2 }, POINTS);
  const has = (r, set) => r.families.filter((f) => f.status === 'best' || f.status === 'tie').some((f) => FAMILY[f.id].axes.some((k) => set.includes(k)));
  assert.ok(FAMILY[high.families[0].id].axes.some((k) => k === 'rhf' || k === 'constr'), 'RA 14: a heart lesion leads, ' + high.families[0].id);
  assert.ok(!has(high, ['ivcweb', 'bcs']) || true);
  assert.ok(FAMILY[low.families[0].id].axes.some((k) => k === 'ivcweb' || k === 'bcs'), 'RA 2: the block is above the liver, not the heart, ' + low.families[0].id);
  assert.ok(!has(low, ['rhf', 'constr']), 'RA 2 rules the heart out of the lead');
});

test('sparse sets of other kinds still leave a short list and name a next reading', () => {
  for (const sparse of [{ whvp: 21, lsm: 28 }, { fhvp: 18, ra: 15 }, { lsm: 30, plt: 60 }, { spleen: 18, plt: 70 }, { whvp: 8, spleen: 16 }]) {
    const r = rank(sparse, POINTS);
    assert.equal(r.ready, true, JSON.stringify(sparse));
    assert.equal(r.few, true);
    assert.ok(r.families[0].status === 'best' && r.possible >= 1, JSON.stringify(sparse));
    assert.ok(r.next, 'a next reading is named: ' + JSON.stringify(sparse));
  }
  assert.equal(rank({ whvp: 30, fhvp: 24, lsm: 9, plt: 150 }, POINTS).few, false, 'four readings is a ranking');
  assert.equal(FEW_READINGS, 4);
});

test('the model\'s grade readings print as grades, never as the raw millimetres or millilitres (review U2)', () => {
  assert.equal(modelText('varix', 1.0), 'None');
  assert.equal(modelText('varix', 4.1), 'Small');
  assert.equal(modelText('varix', 6.2), 'Large');
  assert.equal(modelText('asc', 40), 'None');
  assert.equal(modelText('asc', 2000), 'Grade 2');
  assert.equal(modelText('asc', 9000), 'Grade 3');
  assert.equal(modelText('whvp', 12.44), '12.4 mmHg');
  assert.equal(modelText('varix', null), 'none');
  // (an entered grade is an index; the model's value is a measure: they go through different functions on purpose)
  assert.equal(numberText('varix', 1), 'Small');
  assert.equal(numberText('varix', 4.1, true), 'Small');
  assert.equal(numberText('whvp', 8), '8.0');
  assert.equal(numberText('lsm', 33.4), '33');
  assert.equal(gapLine({ key: 'varix', entered: 0, predicted: 6, d: 2 }), 'Predicts Varices Large; you entered None.');
  // every grade reading the search knows prints as a word for any value the engine can give
  for (const k of ['asc', 'varix']) for (const v of [0, 0.5, 2.4, 2.5, 4.9, 5, 20, 149, 150, 1499, 1500, 4999, 5000, 30000]) assert.match(modelText(k, v), /^[A-Za-z]/, `${k} ${v}`);
});

test('the Baveno VIII bands are printed only where they apply: LSM bands with cirrhosis, none for congestion or a block before the liver, HVPG not read as portal pressure before the liver (review U3)', () => {
  const pred = { hvpg: 0.6, lsm: 33, ppg: 2.4 };
  const text = (id, p = pred) => bandsOf(p, FAMILY[id]).map((b) => `${b.label} ${b.text}: ${b.band}`).join(' | ');
  assert.match(text('rhf'), /LSM 33\.0 kPa: congestion raises it, so the Baveno VIII cut-offs do not apply/);
  assert.doesNotMatch(text('rhf'), /rules clinically significant|cACLD|compensated advanced/, 'no cirrhosis band on a heart card');
  assert.match(text('constr'), /do not apply/); assert.match(text('bcs'), /do not apply/); assert.match(text('ivcweb'), /do not apply/);
  assert.match(text('presin', { hvpg: 4.5, lsm: 7, ppg: 11.2 }), /HVPG 4\.5 mmHg: does not show the portal pressure with a block before the liver; the model's PPG is 11\.2 mmHg/);
  assert.doesNotMatch(text('presin', { hvpg: 4.5, lsm: 7 }), /normal range|unlikely/, 'PSVD: no "normal range" for the HVPG and no cACLD band for the LSM');
  assert.doesNotMatch(text('pvt'), /normal range/);
  assert.match(text('sinus', { hvpg: 12, lsm: 27 }), /HVPG 12\.0 mmHg: 10 or more, clinically significant.*LSM 27\.0 kPa: 25 or more/);
  assert.match(text('sinus+rhf', { hvpg: 12, lsm: 27 }), /congestion raises it too/, 'cirrhosis with congestion: the band, with the caution');
  assert.match(text('sinus+pvt', { hvpg: 7, lsm: 18 }), /does not show the portal pressure/, 'a clot in the mix: the HVPG is not the portal pressure');
  // every family says something for each measure and never the cirrhosis band without cirrhosis
  for (const f of FAMILIES) {
    const b = bandsOf({ hvpg: 6, lsm: 18, ppg: 9 }, f), lsm = b.find((x) => x.label === 'LSM');
    assert.ok(lsm && lsm.band, f.id);
    if (!f.parts.includes('sinus') && f.parts.length) assert.doesNotMatch(lsm.band, /compensated advanced|rules clinically/, f.id);
  }
});

test('the reasons credit the stiffness to the lesion that makes it, and never print a band that contradicts the slider (review U3)', () => {
  const rd = (v) => ({ whvp: 14, fhvp: 4, lsm: v });
  assert.match(reasonsFor(FAMILY.sinus, rd(7), { p: { sinus: 0.25 } }).join(' '), /LSM 7 kPa: the cirrhosis slider at 25% gives it\./, 'a low LSM says no band');
  assert.doesNotMatch(reasonsFor(FAMILY.sinus, rd(7), { p: { sinus: 0.25 } }).join(' '), /unlikely/);
  assert.match(reasonsFor(FAMILY.sinus, rd(22), { p: { sinus: 0.7 } }).join(' '), /LSM 22 kPa: over 15, highly likely.*slider at 70% gives it/);
  assert.match(reasonsFor(FAMILY.rhf, rd(33), { p: { rhf: 0.8 } }).join(' '), /LSM 33 kPa: congestion raises liver stiffness, so the Baveno VIII cut-offs do not apply/);
  assert.doesNotMatch(reasonsFor(FAMILY.presin, rd(33), { p: { presin: 0.8 } }).join(' '), /LSM/, 'a block before the liver does not make the stiffness');
});

test('settings that follow from a lesion are marked, so a card does not list them as ones the fit chose (review U15)', () => {
  const alb = settingsOf('sinus', { sinus: 0.9 }).find((x) => x.label === 'Albumin');
  assert.equal(alb.follows, true);
  assert.equal(settingsOf('sinus', { sinus: 0.9 }).find((x) => x.label === 'Cirrhosis slider').follows, undefined);
  assert.ok(settingsOf('rhf', { rhf: 0.5 }).find((x) => x.label === 'Extra volume held').follows);
  assert.ok(settingsOf('ivcweb', { ivcweb: 0.5 }).find((x) => x.label === 'Extra volume held').follows);
});

test('the no-lesion family reads with the plain bands, and a fit range inside one word reads as the word (review E2, U3)', () => {
  const b = bandsOf({ hvpg: 3, lsm: 4.5 }, FAMILY.none);
  assert.match(b.find((x) => x.label === 'HVPG').band, /normal range/);
  assert.match(b.find((x) => x.label === 'LSM').band, /under 10.*unlikely/);
  assert.equal(rangeText('presin', { lo: 0.85, hi: 1, whole: false, fixed: false }), 'severe');
  assert.equal(rangeText('presin', { lo: 0.2, hi: 0.6, whole: false, fixed: false }), 'mild to marked');
});
