// The Doppler's usual velocity range for a stent follows the stent's open diameter (17 Nov 2026: "the Doppler card flags TIPS velocities outside 90 to 190 cm/s, but that
// range was set for 8 to 10 mm stents: a patent 6 mm stent reads 201 to 223 cm/s and is wrongly flagged"). Inside 8 to 10 mm the range is the reference array itself, so no
// number that was read there moves; outside it, the ceiling (and, for a wider stent, the floor) is scaled by 1 / diameter², provisionally: no guideline gives a range for
// any other diameter. The one function is engine/stent-geom.js stentBand; every reader asks it (velNormal.js stentNormal for the figure and the Doppler card, table-marks.js
// stentCuts for the tiles, the presenter's bar and the Tests view's IR tile, ir-tips.js peakBand for the stent peak tile).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { deepMerge } from '../src/engine/scenario.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { fingerprintOf } from '../src/engine/fingerprint.js';
import { stentBand, stentBandIsRef, STENT_BAND_D, STENT_BAND_MIN_D } from '../src/engine/stent-geom.js';
import { EDGES } from '../src/engine/topology.js';
import { PROBE_NORMAL, stentNormal, velNormal, STENT_PV_NORMAL } from '../src/ui/velNormal.js';
import { rateOf, stentCuts, STENT_RANGE } from '../src/ui/table-marks.js';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const REF = PROBE_NORMAL.TIPS;
const band = (d) => [...stentBand(d, REF, [0, 0])];

test('8 to 10 mm (and no stent) keep the reference range: the same array, so nothing that reads it moves', () => {
  for (const d of [8, 8.5, 9, 9.9, 10, 0, undefined, null, NaN]) assert.equal(stentBand(d, REF, [0, 0]), REF, `${d}`);
  assert.deepEqual([...REF], [90, 190]);
  assert.deepEqual([...STENT_BAND_D], [8, 10]);
  for (const d of [8, 9, 10]) assert.ok(stentBandIsRef(d));
  assert.ok(stentBandIsRef(0) && !stentBandIsRef(6) && !stentBandIsRef(12));
});

test('a narrower stent: the ceiling rises by (8 / d)², the floor stays (a narrow stent carries less flow, so its velocity rises less than 1 / d²)', () => {
  assert.deepEqual(band(6), [90, 338]);
  assert.deepEqual(band(7), [90, 248]);
  // the model's own patent 6 mm stent in a decompensated patient (205 to 228 cm/s, Mohammad's 201 to 223) is inside, and the 8 to 10 mm range called it high
  assert.ok(205 > REF[1] && 205 <= band(6)[1] && 228 <= band(6)[1]);
});

test('a wider stent: both edges fall by (10 / d)²', () => {
  assert.deepEqual(band(12), [63, 132]);
  assert.deepEqual(band(11), [74, 157]);
});

test('the range is continuous at 8 and 10 mm, never rises with the diameter, and stops at the narrowest stent the tool offers', () => {
  assert.ok(Math.abs(band(7.999)[1] - 190) <= 1 && Math.abs(band(10.001)[0] - 90) <= 1 && Math.abs(band(10.001)[1] - 190) <= 1);
  let prev = [Infinity, Infinity];
  for (let d = STENT_BAND_MIN_D; d <= 12; d += 0.25) {
    const b = band(d);
    assert.ok(b[0] <= prev[0] && b[1] <= prev[1], `${d}: ${b} after ${prev}`);
    assert.ok(b[0] > 0 && b[1] > b[0], `${d}: a range`);
    prev = b;
  }
  // (a stent opening or closing eases through every width, stent-ease.js: its range holds at the 6 mm one, not 25000 times 190)
  assert.deepEqual(band(0.05), band(STENT_BAND_MIN_D)); assert.deepEqual(band(3), band(6));
});

test('the figure and the Doppler card read it through velNormal: the stent probe\'s own range, scaled by its open diameter; nothing else moves', () => {
  const frame = (d, id = 'TIPS') => ({ D: EDGES.map((e) => (e.id === id ? d : 1)) });
  for (const id of ['TIPS', 'DIPS']) {
    assert.equal(velNormal(EI[id], frame(10, id), null), PROBE_NORMAL[id], `${id} 10 mm: the reference array`);
    assert.equal(velNormal(EI[id], frame(8, id), null), PROBE_NORMAL[id], `${id} 8 mm`);
    assert.deepEqual([...velNormal(EI[id], frame(6, id), null)], [90, 338], `${id} 6 mm`);
    assert.deepEqual([...velNormal(EI[id], frame(12, id), null)], [63, 132], `${id} 12 mm`);
  }
  assert.deepEqual([...stentNormal('TIPS', 6)], [90, 338]);
  assert.equal(stentNormal('DIPS', undefined), PROBE_NORMAL.DIPS, 'a frame with no diameter reads the reference');
  // a TIPS and a DIPS in one patient keep their own ranges (one kept list each)
  const both = { D: EDGES.map((e) => (e.id === 'TIPS' ? 6 : e.id === 'DIPS' ? 12 : 1)) };
  const a = velNormal(EI.TIPS, both, null), b = velNormal(EI.DIPS, both, null);
  assert.deepEqual([[...a], [...b]], [[90, 338], [63, 132]]);
  // the main portal vein beside a stent keeps its floor of 30 cm/s and no ceiling, whatever the stent's width
  assert.equal(velNormal(EI.PV_TRUNK, frame(6), null), STENT_PV_NORMAL);
});

const settled = (patch, preset = 'cirr-decomp') => {
  const e = new Engine(); e.loadPreset(preset);
  e.setParams(deepMerge(e.params, patch)); e.settle(); e.advanceDays(30, { noRupture: true, silent: true }); e.settle();
  return e;
};

test('a patent small stent reads inside its own range at every gate, and the stents the range was set for read as they did', () => {
  for (const preset of ['cirr-decomp', 'pregnancy', 'csph', 'sos']) {
    for (const d of [6, 7]) {
      const m = computeMetrics(settled({ tips: { on: true, d } }, preset)), t = m.tips, b = band(d);
      for (const g of t.peaks) assert.ok(g <= b[1], `${preset} ${d} mm reads ${Math.round(g)} against a ceiling of ${b[1]}`);
      assert.ok(t.vPeak <= b[1]);
    }
  }
  // the 6 mm stent in the decompensated patient is what the 8 to 10 mm range wrongly called high
  const six = computeMetrics(settled({ tips: { on: true, d: 6 } })).tips;
  assert.ok(Math.max(...six.peaks) > REF[1], `the model reads ${Math.round(Math.max(...six.peaks))}: over 190, so the old flag was a false one`);
});

test('a real narrowing in a small stent still jets over its own ceiling, and a stent that has all but closed still reads slow', () => {
  for (const d of [6, 7]) {
    const t = computeMetrics(settled({ tips: { on: true, d }, stenosis: { TIPS: 0.65 } })).tips;   // (the TIPS Doppler talk's 65 % pinch: the jet)
    assert.ok(t.vPeak > band(d)[1], `${d} mm with a 65 % pinch reads ${Math.round(t.vPeak)} against ${band(d)[1]}`);
  }
  const thrombosed = computeMetrics(settled({ tips: { on: true, d: 6 }, thrombus: { TIPS: 0.9 } }, 'cirr-comp')).tips;
  assert.ok(Math.min(...thrombosed.peaks) < band(6)[0] || thrombosed.vPeak < band(6)[0] || thrombosed.flow < 0.3, `${thrombosed.peaks}`);
});

test('a narrowing is never a diameter: the range follows the open stent, so a 10 mm stent with a 6 mm waist (the TIPS deck\'s waist slide) still reads its jet against 90 to 190', () => {
  // Scaling the range to the local lumen would make every stenosis read normal: the jet is the sign the Doppler looks for. A deliberate reduction (a smaller stent
  // placed inside) is a stent of the smaller width, so its width is the stent's d and the diameter rule above covers it.
  const frame = { D: EDGES.map((e) => (e.id === 'TIPS' ? 10 : 1)) };
  assert.equal(velNormal(EI.TIPS, frame, null), PROBE_NORMAL.TIPS);
  for (const waist of [{ waist: 1, trans: 0 }, { waist: 4 }, { trans: 1 }]) {
    const t = computeMetrics(settled({ tips: { on: true, d: 10 }, stenosis: { TIPS: 0.4 }, stentGeom: { TIPS: waist } })).tips;
    assert.ok(t.dWaist === 6 && t.vPeak > REF[1], `${JSON.stringify(waist)}: ${Math.round(t.vPeak)} cm/s at a 6 mm waist is over ${REF[1]}`);
    assert.equal(stentCuts('tips', { tipsD: t.d }), STENT_RANGE, 'and the fingerprint rates it against the 10 mm range');
  }
  // a stent reduced to 6 mm by a coaxial stent is a 6 mm stent: its own range
  assert.deepEqual([...stentNormal('TIPS', 6)], [90, 338]);
});

test('the summary tiles, the presenter bar and the IR tile rate the stent peak against the stent\'s own diameter, the fingerprint carrying it', () => {
  const fp = (d, id = 'tips') => fingerprintOf(computeMetrics(settled({ [id]: { on: true, d } })));
  for (const [id, key] of [['tips', 'tipsVel'], ['dips', 'dipsVel']]) {
    assert.equal(fp(6, id)[`${id}D`], 6); assert.equal(fp(10, id)[`${id}D`], 10);
    assert.equal(rateOf(key, { [key]: 215, [`${id}D`]: 6 })[1], 'Normal', `${key}: 215 cm/s in a 6 mm stent`);
    assert.equal(rateOf(key, { [key]: 215, [`${id}D`]: 10 })[1], 'High', `${key}: 215 cm/s in a 10 mm stent`);
    assert.equal(rateOf(key, { [key]: 215 })[1], 'High', `${key}: no diameter, the reference range as before`);
    assert.equal(rateOf(key, { [key]: 350, [`${id}D`]: 6 })[1], 'High');
    assert.equal(rateOf(key, { [key]: 70, [`${id}D`]: 12 })[1], 'Normal', `${key}: 70 cm/s in a 12 mm stent`);
    assert.equal(rateOf(key, { [key]: 70, [`${id}D`]: 10 })[1], 'Low');
  }
  assert.equal(fingerprintOf(computeMetrics(settled({}))).tipsD, null, 'no stent, no diameter');
  assert.deepEqual([...STENT_RANGE], [90, 190]);
  assert.equal(stentCuts('tips', { tipsD: 10 }), STENT_RANGE); assert.deepEqual([...stentCuts('dips', { dipsD: 6 })], [90, 338]);
});

// Every place that applies the range reads it from one function. A new copy of the range or a read of the stent probe's fixed range would give a 6 mm stent the 8 to 10 mm
// verdict again, so the files that apply it are named, and a stent range written out anywhere else fails here.
const walk = (dir, out = []) => { for (const n of readdirSync(dir)) { const p = `${dir}/${n}`; if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p); } return out; };
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('no file but the three that hold the reference writes the stent range out, and the places that apply it read it by diameter', () => {
  const holders = new Set(['src/ui/velNormal.js', 'src/ui/table-marks.js', 'src/ui/ir-tips.js']);
  for (const f of walk(new URL('../src', import.meta.url).pathname).map((p) => p.replace(/^.*\/src\//, 'src/'))) {
    if (holders.has(f) || /glyph|liver-geo|inverse-library|stop-tokens/.test(f)) continue;
    const code = read(f).split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    assert.ok(!/\[\s*90\s*,\s*190\s*\]/.test(code), `${f} writes the stent range [90, 190] out`);
  }
  // the Doppler card judges every stent segment, its note and its gauge against normalOf (the open stent's diameter), never the probe's fixed range
  const dop = read('src/ui/doppler.js');
  assert.ok(!/p\.normal\[/.test(dop) && !/\.rangeNote\b/.test(dop), 'the Doppler card judges a stent by its probe\'s fixed range');
  assert.match(dop, /p\.kind === 'tips'\) && frame\?\.D \? velNormal\(EI\[p\.id\], frame\)/);
  assert.match(dop, /rangeNoteOf\(p, normal, frame\?\.D\?\.\[EI\[p\.id\]\]\)/);
  // the stent card's lumen colours, the figure's, the tiles' and the IR tile's
  assert.ok(!/PROBE_NORMAL/.test(read('src/ui/tool-stent.js')) && /stentNormal\(id, d\)/.test(read('src/ui/tool-stent.js')));
  assert.ok(!/v < STENT_RANGE|v > STENT_RANGE/.test(read('src/ui/table-marks.js')), 'the tiles\' rating reads stentCuts');
  assert.ok(!/v >= STENT_RANGE|v <= STENT_RANGE/.test(read('src/ui/ir-tips.js')), 'the IR tile reads peakBand');
});
