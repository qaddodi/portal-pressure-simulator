// The relation charts of Circulation, Doppler, Hyperdynamic, Outflow, NCPH, Gastric varices, Encephalopathy and TIPS Doppler (26 Oct): each
// slide's chart is worked out from the deck's own tool, in node, and the numbers its words and notes quote are pinned here, so retuning
// the model shows up as a failing line rather than as a chart that disagrees with its title. Code only: nobody has looked on screen.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';
import { DECKS } from '../src/ui/decks.js';
import { curveSteps, curveSeries, dotSteps, dotsOf, ringAt, curveAt, drawnLines, againstsOf, patientOf } from '../src/ui/tool-curve.js';
import { changes } from './deck-states.js';

async function seq(steps, base = null) {
  const out = [];
  const core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, base, reqId: 1 });
  core.dispose();
  return out;
}
const stepOf = (s) => ({ preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days });

const slideOf = (deck, id = 'relation') => {
  const d = DECKS.find((x) => x.id === deck), i = d.slides.findIndex((s) => s.id === id);
  assert.ok(i > 0, `${deck}/${id}`);
  return { d, i, s: d.slides[i] };
};
// The slide's own state: the chain of model-changing slides from the last preset up to it.
async function stateOf({ d, i }) {
  let from = i;
  while (from > 0 && !d.slides[from].preset) from--;
  const steps = d.slides.slice(from, i + 1).filter((s, k) => k === 0 || changes(s)).map(stepOf);
  const out = await seq(steps);
  return out.at(-1);
}
const runs = new Map();
// The chart's states, kept by their steps (Doppler and Hyperdynamic share one sweep).
async function chartOf(deck) {
  const sl = slideOf(deck), t = sl.s.tool, st = await stateOf(sl);
  const steps = curveSteps(t), key = JSON.stringify([steps, patientOf(t) ? null : deck]);
  if (!runs.has(key)) runs.set(key, seq(steps, patientOf(t) ? null : st.snap));
  const states = await runs.get(key);
  const ser = curveSeries(t, states);
  assert.ok(ser, `${deck}: the chart's points are all there`);
  return { t, st, ser, states, line: sl.s.line, fp: st.fp, ring: ringAt(t, st.params, st.fp) };
}
const ys = (c, j = 0) => c.ser.ys[j], xs = (c, j = 0) => (c.ser.lx ? c.ser.lx[j] : c.ser.xs);
const at = (c, x, j = 0) => curveAt(c.ser, x)[j];
/** The x where line j first crosses v going down (dir -1) or up (dir 1), read between points. */
function cross(c, j, v, dir) {
  const X = xs(c, j), Y = ys(c, j);
  for (let i = 1; i < X.length; i++) if ((Y[i - 1] - v) * dir < 0 && (Y[i] - v) * dir >= 0) return X[i - 1] + (X[i] - X[i - 1]) * (v - Y[i - 1]) / (Y[i] - Y[i - 1]);
  return null;
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);

test('every pill in the eight lines names a reading the slide\'s state has, and the ring is where the slide stands', async () => {
  for (const deck of ['circulation', 'doppler', 'hyperdynamic', 'outflow', 'ncph', 'gastric-varices', 'encephalopathy', 'tips-doppler']) {
    const sl = slideOf(deck), st = await stateOf(sl);
    for (const m of sl.s.line.matchAll(/\{(\w+)(?:@[\w-]+)?\}/g)) assert.ok(Number.isFinite(st.fp[m[1]]), `${deck}: {${m[1]}} has a value`);
    assert.equal(sl.d.slides.at(-1).id === 'relation' || sl.d.slides[sl.i + 1].id === 'summary', true, `${deck}: the chart closes the talk or comes just before the summary`);
    assert.equal(sl.s.kicker, 'Summary', deck);
  }
});

test('Circulation: the HVPG passes 5, then 10, as scarring builds; the ring is the CSPH liver, on the line', async () => {
  const c = await chartOf('circulation');
  assert.ok(Math.min(...ys(c, 0)) < 5 && Math.max(...ys(c, 0)) > 10, 'the HVPG starts under 5 and ends past 10');
  assert.ok(Math.min(...ys(c, 1)) < 5 && Math.max(...ys(c, 1)) > 12, 'so does the PPG');
  assert.ok(ys(c, 0).every((y, i, a) => !i || y > a[i - 1]), 'the HVPG climbs with every step of scarring');
  near(c.ring.x, 60, 1e-6, 'the CSPH liver is 60% scarred');
  near(c.ring.ys[0], at(c, c.ring.x, 0), 0.15, 'the ring sits on the HVPG line');
  near(c.ring.ys[1], at(c, c.ring.x, 1), 0.2, 'and on the PPG line');
});

test('Doppler: the velocity holds to an HVPG of 10, is still normal at CSPH, and goes under 15 cm/s at about 16', async () => {
  const c = await chartOf('doppler');
  assert.equal(c.t.lines[0], 'pvVel');
  for (let i = 0; i < xs(c).length; i++) if (xs(c)[i] <= 10) assert.ok(ys(c, 0)[i] > 25, `HVPG ${xs(c)[i]}: ${ys(c, 0)[i]} cm/s`);
  assert.ok(c.fp.hvpg >= 10 && c.fp.pvVel > 15 + 5, `the CSPH patient: ${c.fp.hvpg} mmHg, ${c.fp.pvVel} cm/s`);
  const x15 = cross(c, 0, 15, -1);
  assert.ok(x15 > 15.5 && x15 < 16.7, `crosses 15 cm/s at an HVPG of ${x15}: the line says about 16`);
  assert.ok(ys(c, 1)[0] < Math.max(...ys(c, 1)) && ys(c, 1).at(-1) < ys(c, 1)[0], 'the flow first rises, then falls below where it began');
  near(c.ring.ys[0], at(c, c.ring.x, 0), 0.5, 'the ring sits on the velocity line');
});

test('Hyperdynamic: output 5.0 to 7.0 L/min, pressure 92 to 80 mmHg, heart rate low 60s to low 90s', async () => {
  const c = await chartOf('hyperdynamic');
  const co = ys(c, 0), map = ys(c, 1), hr = c.states.map((s) => s.fp.hr);
  near(co[0], 4.9, 0.15, 'output at the mild end'); near(co.at(-1), 7.0, 0.15, 'output at the severe end');
  near(map[0], 92, 1, 'pressure at the mild end'); near(map.at(-1), 80.5, 1, 'pressure at the severe end');
  assert.ok(hr[0] >= 60 && hr[0] < 66 && hr.at(-1) > 90 && hr.at(-1) < 96, `heart rate ${hr[0]} to ${hr.at(-1)}`);
  assert.ok(co.every((y, i) => !i || y > co[i - 1]) && map.every((y, i) => !i || y < map[i - 1]), 'output rises and pressure falls at every step');
  near(c.ring.ys[0], at(c, c.ring.x, 0), 0.2, 'the ring sits on the output line');
});

test('Outflow: stiffness follows the free hepatic vein pressure whatever the cause, and the HVPG stays under 2 mmHg', async () => {
  const c = await chartOf('outflow');
  assert.deepEqual(drawnLines(c.t).map((l) => l.k), ['hvpg', 'fhvp']);
  assert.ok(Math.max(...ys(c, 0)) < 2, `the web's HVPG stays under 2: ${Math.max(...ys(c, 0))}`);
  assert.ok(ys(c, 1).every((y, i, a) => !i || y > a[i - 1]) && ys(c, 1)[0] < 11 && ys(c, 1).at(-1) > 20, 'the free pressure climbs with the stiffness');
  near(c.ring.ys[1], at(c, c.ring.x, 1), 0.3, 'the ring sits on the free pressure line');
  const dots = await seq(dotSteps(c.t), null);
  assert.equal(dotsOf(c.t).length, 2);
  for (const [k, d] of dots.entries()) {
    assert.ok(d.fp.hvpg < 2, `dot ${k}: HVPG ${d.fp.hvpg}`);
    near(d.fp.fhvp, at(c, d.fp.lsm, 1), 0.6, `dot ${k} (stiffness ${d.fp.lsm.toFixed(1)}) falls on the web's free pressure line`);
  }
  assert.ok(dots[0].fp.lsm > 25 && dots[1].fp.lsm > 10 && dots[1].fp.lsm < 20, 'heart failure past 25 kPa, constriction between 10 and 20');
});

test('NCPH: cirrhosis raises stiffness, PPG and spleen together; the schistosomiasis ring sits far above the line', async () => {
  const c = await chartOf('ncph');
  assert.equal(c.t.lines.join(), 'ppg,spleen');
  assert.ok(ys(c, 0).at(-1) > 17 && ys(c, 1).at(-1) > 17, 'cirrhosis ends with a PPG and a spleen both high');
  near(c.ring.x, 6.1, 0.2, 'the stiffness of the ring');
  assert.ok(c.ring.ys[0] - at(c, c.ring.x, 0) > 9, `the PPG ${c.ring.ys[0]} is far above the cirrhosis line's ${at(c, c.ring.x, 0)} at that stiffness`);
  assert.ok(c.ring.ys[1] - at(c, c.ring.x, 1) > 4, `so is the spleen: ${c.ring.ys[1]} against ${at(c, c.ring.x, 1)}`);
  near(at(c, c.ring.x, 0), 5.2, 0.5, 'the notes say a PPG of about 5'); near(at(c, c.ring.x, 1), 11.3, 0.5, 'and a spleen of about 11 cm');
  const [csph] = await seq(dotSteps(c.t), null);
  near(csph.fp.ppg, at(c, csph.fp.lsm, 0), 0.5, 'the CSPH point sits on the cirrhosis line');
});

test('Gastric varices: closing the shunt flattens the fundal varix and grows the esophageal one, the same pressure by a new route', async () => {
  const c = await chartOf('gastric-varices');
  assert.deepEqual(drawnLines(c.t).map((l) => [l.k, l.name]), [['gv', 'Fundal, shunt open'], ['gv', 'Fundal, shunt closed'], ['varix', 'Esophageal, shunt closed']]);
  assert.equal(againstsOf(c.t)[1].of, 'varix');
  const open = ys(c, 0), closed = ys(c, 1), eso = ys(c, 2);
  assert.ok(open.every((y, i) => !i || y > open[i - 1]), 'the open shunt\'s fundal varix grows with the HVPG');
  assert.ok(Math.max(...closed) - Math.min(...closed) < 0.2 && Math.max(...closed) < 2.6 && Math.min(...closed) > 2.3, `closed, it stays near 2.4 mm: ${Math.min(...closed)} to ${Math.max(...closed)}`);
  near(eso[0], 2.0, 0.15, 'the esophageal varix starts at 2.0 mm'); near(eso.at(-1), 8.5, 0.3, 'and ends near 8.5 mm');
  assert.ok(eso.every((y, i) => !i || y > eso[i - 1]), 'and grows with the HVPG');
  near(c.fp.gv, 8.5, 0.1, 'the first slide\'s fundal varix'); near(c.ring.ys[0], at(c, c.ring.x, 0), 0.1, 'the ring sits on the open shunt\'s line');
  assert.ok(Math.abs(c.fp.varix - 2) < 0.05, 'the patient has no esophageal varix with the shunt open');
});

test('Encephalopathy: a wider stent lowers the PPG and takes liver flow; the HE index is past 1 at the ring, which is why the liver\'s flow is charted', async () => {
  const c = await chartOf('encephalopathy');
  assert.equal(c.t.lines.join(), 'ppg,liver');
  assert.ok(ys(c, 0).every((y, i, a) => !i || y < a[i - 1]) && ys(c, 1).every((y, i, a) => !i || y < a[i - 1]), 'both fall at every millimeter');
  assert.equal(xs(c).at(-1) - xs(c)[0], 6);
  near(c.fp.ppg, 9.2, 0.05, 'the 8 mm stent\'s PPG'); assert.ok(c.fp.ppg < 12, 'under the 12 mmHg target');
  near(c.ring.ys[0], at(c, 8, 0), 0.05, 'the ring is the 8 mm point');
  assert.ok(c.fp.he > 1, `the HE index ${c.fp.he} is past its 0 to 1 tile: the chart reads the liver's flow instead; revisit when the index is fixed`);
});

test('TIPS Doppler: the PPG passes 12 mmHg at about a third narrowed, the portal vein drops under 30 cm/s at about half; the ring is 60%', async () => {
  const c = await chartOf('tips-doppler');
  assert.equal(c.t.lines.join(), 'ppg,pvVel');
  const a = cross(c, 0, 12, 1), b = cross(c, 1, 30, -1);
  assert.ok(a > 28 && a < 40, `the PPG passes 12 at ${a}% narrowed`);
  assert.ok(b > 44 && b < 54, `the portal vein drops under 30 cm/s at ${b}% narrowed`);
  near(c.ring.x, 60, 1e-6, 'the ring is the 60% narrowing');
  near(c.ring.ys[0], at(c, 60, 0), 0.05, 'on the PPG line'); near(c.ring.ys[1], at(c, 60, 1), 0.05, 'and on the velocity line');
  assert.ok(c.fp.pvVel < 30, 'the narrowed stent\'s portal vein reads under 30 cm/s, as the slides before say');
});
