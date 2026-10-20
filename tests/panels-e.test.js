// Deck visuals, package E (review/deck-visuals-recs.md §9): the plane's zones (V28) and the
// small Doppler traces (V16). The drawing needs a browser; what decides
// a zone, a branch, a place, a size or a part is pure and checked here, with the model's own numbers.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXT } from '../src/ui/slide-ext.js';
import { DECKS } from '../src/ui/decks.js';
import { adopted } from './deck-adopted.js';
import { holds, rangeOf, planeOf, zoneOf, zoneRect, PLANES, fitWords, placeNames, est, frame, scaler, lineBoxes, crosses } from '../src/ui/visual-plane.js';
import { wavePath, waveVessel } from '../src/ui/col-wave.js';
import { runSteps } from './deck-states.js';
import { createCore } from '../src/worker-core.js';

test('package E registers its visuals, instruments and columns', () => {
  assert.equal(EXT.owner.visuals.plane, 'E');
  assert.equal(EXT.owner.tools.plane, 'E');
  // (The chain and the guideline flowchart were taken out at Mohammad's word, 19 Oct.)
  for (const k of ['chain', 'flowchart']) assert.ok(!(k in EXT.owner.visuals) && !(k in EXT.owner.tools), k);
  for (const c of ['wave']) assert.equal(EXT.owner.columns[c], 'E', `column ${c}`);
  assert.equal(EXT.tools.plane.title({ kind: 'plane' }), 'Stiffness and platelets');
  assert.equal(EXT.tools.plane.title({ kind: 'plane', plane: 'hvpg-ppg' }), 'HVPG and PPG');
});

test('no built-in deck uses the new fields, so every talk is unchanged', () => {
  for (const d of DECKS) for (const s of d.slides) {
    for (const k of ['plane', 'chain', 'flow', 'case', 'wave', 'waveMax']) assert.ok(!(k in s) || adopted(d, s, k), `${d.id}/${s.id} sets ${k}`);
    assert.ok(!['plane', 'chain', 'flowchart'].includes(s.visual) && !['plane', 'chain', 'flowchart'].includes(s.tool?.kind), `${d.id}/${s.id}`);
    assert.ok(!(s.cols || []).some((c) => c === 'wave') || adopted(d, s, 'cols.wave'), `${d.id}/${s.id} cols`);
  }
});

test('conditions hold only when every one does, at their edges as written', () => {
  assert.equal(holds([['lsm', '<=', 15], ['plt', '>=', 150]], { lsm: 15, plt: 150 }), true);
  assert.equal(holds([['lsm', '<=', 15], ['plt', '>=', 150]], { lsm: 15.01, plt: 150 }), false);
  assert.equal(holds([['lsm', '<', 20]], { lsm: 20 }), false);
  assert.equal(holds([['lsm', '<', 20]], { lsm: null }), false, 'a missing number holds nothing');
  assert.equal(holds([['lsm', '=~', 20]], { lsm: 1 }), false, 'an unknown op holds nothing');
  assert.equal(holds(undefined, {}), true);
  assert.deepEqual(rangeOf([['lsm', '<=', 15], ['plt', '>=', 150]], 'lsm', 0, 40), [0, 15]);
  assert.deepEqual(rangeOf([['lsm', '<=', 15], ['plt', '>=', 150]], 'plt', 0, 300), [150, 300]);
});

test('the CSPH plane follows Baveno VIII: 15 and 150 rule out, 25 rules in, under 20 with 150 spares the scope', () => {
  const pl = planeOf('csph');
  const z = (lsm, plt) => zoneOf(pl, { lsm, plt })?.t;
  assert.equal(z(13, 180), 'No CSPH');
  assert.equal(z(15, 150), 'No CSPH');
  assert.equal(z(15, 149), 'Indeterminate');
  assert.equal(z(25, 250), 'CSPH');
  assert.equal(z(24.9, 90), 'Indeterminate');
  assert.equal(pl.source, 'Baveno VIII 1.15, 1.16');
  assert.ok(!/Baveno VII\b/.test(JSON.stringify(PLANES)), 'never Baveno VII');
  // (No "no screening scope" box and no 20 kPa line: Mohammad, 19 Oct.)
  assert.equal(pl.boxes, undefined);
  assert.deepEqual(pl.cuts, { x: [15, 25], y: [150] });
  assert.ok(pl.x.ticks.includes(20), '20 stays a plain axis number');
  assert.deepEqual(zoneRect(pl, pl.zones[1]), [0, 15, 150, 300]);
  // (The plan's own spelling of the field.)
  assert.equal(planeOf({ x: 'lsm', y: 'plt', zones: 'csph' }).zones.length, 3);
  assert.equal(planeOf({ x: 'hvpg', y: 'ppg' }).x.key, 'hvpg');
  assert.equal(planeOf('nope'), null);
});

test('the model\'s compensated patients fall where the stiffness deck says', async () => {
  const [healthy, comp, csph, csph2] = await runSteps([{ preset: 'healthy' }, { preset: 'cirr-comp' }, { preset: 'csph' }, { preset: 'csph', params: { cirrhosis: 0.75 } }]);
  const pl = planeOf('csph');
  assert.equal(zoneOf(pl, healthy).t, 'No CSPH');
  assert.equal(zoneOf(pl, comp).t, 'No CSPH');
  assert.equal(zoneOf(pl, csph).t, 'Indeterminate', 'the deck: "the third case falls between"');
  assert.equal(zoneOf(pl, csph2).t, 'CSPH');
  // HVPG against PPG: presinusoidal resistance raises the PPG alone, cirrhosis both.
  const [schisto, cirr] = await runSteps([{ preset: 'schisto' }, { preset: 'cirr-decomp' }]);
  assert.equal(zoneOf(planeOf('hvpg-ppg'), schisto).t, 'PPG raised, HVPG normal');
  assert.equal(zoneOf(planeOf('hvpg-ppg'), cirr).t, 'Both raised');
});

test('words fit whole or not at all, and names never overlap one another or leave the plot', () => {
  assert.deepEqual(fitWords('Gray zone', 200, 13), ['Gray zone']);
  assert.deepEqual(fitWords('No screening scope', 80, 13), ['No', 'screening', 'scope']);
  assert.equal(fitWords('Unbreakableveryveryverylongword', 60, 13), null);
  const pl = planeOf('csph'), fr = frame(360, 260, 13, pl);
  assert.ok(fr.L > 13 && fr.R < 360 && fr.T > 0 && fr.B < 260);
  const pts = [[200, 120, 'Compensated, CSPH by HVPG'], [206, 126, 'Compensated, CSPH'], [80, 60, 'Healthy'], [90, 70, 'Compensated, no CSPH'], [300, 200, 'Heart failure']].map(([x, y, name]) => ({ x, y, name }));
  const out = placeNames(pts, fr, 13);
  const boxes = out.filter(Boolean).map((o) => o.box);
  assert.equal(boxes.length, pts.length, 'every point keeps its name');
  // (The levels slide on a phone: six patients, four of them near the left axis; a name with no room beside its point sits
  // further out on a thin line.)
  const hp = planeOf('hvpg-ppg'), hf = frame(345, 290, 16, hp);   // (the phone's plot and its 16 px caption)
  const crowd = [[0.4, 22, 'Budd–Chiari'], [2, 15, 'Portal vein thrombosis', 'PVT'], [3.5, 16.5, 'Schistosomiasis'], [16, 17, 'Cirrhosis'], [2.2, 4, 'Healthy'], [0.5, 1.5, 'Heart failure']]
    .map(([a, b, name, short]) => ({ x: hf.L + (hf.R - hf.L) * a / 30, y: hf.B - (hf.B - hf.T) * b / 30, name, short }));
  const { X, Y } = scaler(hp, hf), rules = lineBoxes(hp, X, Y, hf);
  const named = placeNames(crowd, hf, 16, 8, rules);
  assert.ok(named.every(Boolean), 'all six are named');
  const touch = (a, o) => a[0] < o[2] && a[2] > o[0] && a[1] < o[3] && a[3] > o[1];
  for (const n of named) assert.ok(!rules.some((o) => touch(n.box, o)), 'no name sits on a cut-off line');
  for (const [i, n] of named.entries()) if (n.lead) for (const q of crowd) if (q !== crowd[i]) assert.ok(!crosses(crowd[i].x, crowd[i].y, n.lead[0], n.lead[1], [q.x - 10, q.y - 10, q.x + 10, q.y + 10]), 'a leader line passes no other point');
  for (const [i, a] of named.entries()) for (const b of named.slice(i + 1)) assert.ok(!(a.box[0] < b.box[2] && a.box[2] > b.box[0] && a.box[1] < b.box[3] && a.box[3] > b.box[1]));
  for (const [i, a] of boxes.entries()) {
    assert.ok(a[0] >= fr.L && a[2] <= fr.R && a[1] >= fr.T && a[3] <= fr.B, 'inside the plot');
    for (const b of boxes.slice(i + 1)) assert.ok(!(a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]), 'no two names overlap');
    for (const p of pts) assert.ok(!(a[0] < p.x + 10 && a[2] > p.x - 10 && a[1] < p.y + 10 && a[3] > p.y - 10), 'no name covers a point');
  }
  assert.ok(est('abc', 10) > 0);
});

test('the Doppler traces: forward hepatic vein flow below the line, a clotted portal vein flat', async () => {
  const out = [];
  const core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps: [{ preset: 'healthy', wave: ['PV_TRUNK', { vessel: 'RHV_IVC', secs: 2 }] }, { preset: 'pvt-acute', wave: 'PV_TRUNK' }], reqId: 1 });
  core.dispose();
  const pv = wavePath(out[0].extra.wave.PV_TRUNK, 'PV_TRUNK'), hv = wavePath(out[0].extra.wave.RHV_IVC, 'RHV_IVC'), clot = wavePath(out[1].extra.wave.PV_TRUNK, 'PV_TRUNK');
  assert.ok(pv.min > 0, 'portal flow toward the liver, above the line');
  assert.ok(hv.min < -5, 'hepatic vein forward flow away from the probe, below the line');
  assert.ok(Math.max(Math.abs(clot.min), Math.abs(clot.max)) < 1, 'an occlusive clot: a flat line');
  assert.ok(clot.peak < 1 && !clot.over, 'no flow stays flat');
  assert.ok(wavePath({ t: [0, 1], v: [150, 160] }, 'TIPS').over, 'a jet runs past the 50 cm/s scale, held at the edge');
  assert.ok(!wavePath({ t: [0, 1], v: [150, 160] }, 'TIPS', 200).over);
  assert.match(pv.d, /^M0\.0 /);
  assert.equal(wavePath(null, 'PV_TRUNK'), null);
  assert.equal(waveVessel({ wave: 'RHV_IVC' }, { wave: 'PV_TRUNK' }), 'RHV_IVC');
  assert.equal(waveVessel(null, { wave: 'TIPS' }), 'TIPS');
  assert.equal(waveVessel(null, {}), 'PV_TRUNK');
});

test('package E\'s styles stay inside its own block', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  const a = css.indexOf('/* ── Package E, panels and table columns: start ── */'), b = css.indexOf('/* ── Package E: end ── */');
  assert.ok(a > 0 && b > a);
  const outside = css.slice(0, a) + css.slice(b);
  assert.ok(!/\.pze-/.test(outside), 'no .pze- rule outside the block');
});
