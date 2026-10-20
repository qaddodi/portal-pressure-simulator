// Deck visuals, package F (figure callouts, src/ui/ext-callouts.js and callout-math.js): live readings in a mark's words, marks
// on organs, calipers, numbered steps and the circuit's brackets and lit zone. All opt-in: no built-in slide uses a field.
import './dom-shim.js';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { EDGES } from '../src/engine/topology.js';
import { NODE_POS, SPLEEN_CENTER, CIRCUIT_ZONES } from '../src/ui/anatomy.js';
import { DECKS } from '../src/ui/decks.js';
import { adopted } from './deck-adopted.js';
import { parseLive, liveRuns, valueText, valueTone, widest, widestRuns, runsText, ORGAN_ANCHOR, ORGAN_MARKS, organAnchor, spleenCaliper, SPLEEN_AXIS,
  acrossVessel, caliperOf, caliperText, stepPlan, stepGroups, zoneIndex, zoneBand, spanOf, spanPath, SPAN_Y, insideBy, clearOf, besideLine } from '../src/ui/callout-math.js';
import F from '../src/ui/ext-callouts.js';
import { expandIds } from '../src/ui/slide-ext.js';

const VESSELS = new Set(EDGES.map((e) => e.id));
const FP = { varix: 8.06, spleen: 14.83, ppg: 13.24, hvpg: 12.0, asc: 4980, plt: 88, pv: 16.1, at: { D: Float32Array.from(EDGES, () => 6.25) } };

test('a label reads its live values from braces naming a tile, and leaves everything else as written', () => {
  assert.equal(parseLive('Covered stent'), null);
  assert.equal(parseLive('A {nothing} here'), null, 'a brace naming no reading is plain words');
  assert.deepEqual(parseLive('Varix {varix}'), [{ t: 'Varix', sp: false }, { key: 'varix', sp: true }]);
  assert.deepEqual(parseLive('Spleen {spleen}, long'), [{ t: 'Spleen', sp: false }, { key: 'spleen', sp: true }, { t: ', long', sp: false }]);
  assert.deepEqual(parseLive('{ppg} PPG'), [{ key: 'ppg', sp: false }, { t: 'PPG', sp: true }]);
  assert.equal(runsText(liveRuns(parseLive('Spleen {spleen}, long'), FP)), 'Spleen 14.8 cm, long');
  assert.equal(runsText(liveRuns(parseLive('Varix {varix}'), {})), 'Varix …', 'an unknown reading waits as …');
});

test('values print as their tiles print them, in their rating colours', () => {
  assert.equal(valueText('ppg', FP), '13.2 mmHg', 'pressures to one decimal');
  assert.equal(valueText('asc', FP), '5.0 L');
  assert.equal(valueText('plt', FP), '88,000/µL');
  assert.equal(valueTone('ppg', FP), '--danger');
  assert.equal(valueTone('ppg', { ppg: 10.4 }, true), '--ok', 'after TIPS the PPG is read against its target');
  assert.equal(valueTone('co', { co: 5 }), null, 'an unrated reading has no colour');
});

test('a callout keeps room for its widest value', () => {
  assert.equal(widest('9.8 cm'), '88.8 cm');
  assert.equal(widest('14.8 cm'), '88.8 cm');
  assert.equal(widest('120,000/µL'), '888,888/µL');
  const w = widestRuns(liveRuns(parseLive('Spleen {spleen}'), { spleen: 9.8 }));
  assert.equal(w[0].t, 'Spleen', 'the words stay as they are');
  assert.equal(w[1].t, '88.8 cm');
});

test('every organ a mark can name has an anchor inside the figure, and the spleen\'s grows about its centre', () => {
  for (const id of ORGAN_MARKS) {
    const a = ORGAN_ANCHOR[id];
    assert.ok(a && a.at.every(Number.isFinite) && a.half.every((h) => h > 0), id);
    assert.ok(a.at[0] > 300 && a.at[0] < 1120 && a.at[1] > 0 && a.at[1] < 950, `${id} sits on the anatomy plate`);
  }
  assert.deepEqual(organAnchor('spleen', 1.4).at, SPLEEN_CENTER);
  assert.ok(Math.abs(organAnchor('spleen', 1.4).half[1] - 1.4 * ORGAN_ANCHOR.spleen.half[1]) < 1e-9);
  assert.equal(organAnchor('nowhere'), null);
});

test('calipers: the spleen\'s line scales with the organ; a vessel\'s crosses it square', () => {
  assert.deepEqual(spleenCaliper(1), SPLEEN_AXIS);
  const L = (s) => { const [[a, b], [c, d]] = spleenCaliper(s); return Math.hypot(c - a, d - b); };
  assert.ok(Math.abs(L(1.5) / L(1) - 1.5) < 1e-9, 'the line grows with the spleen');
  const [[x0, y0], [x1, y1]] = acrossVessel(100, 100, 1, 0, 5);
  assert.deepEqual([x0, x1], [100, 100]);
  assert.equal(Math.abs(y1 - y0), 10, 'wall to wall, square to the course');
  assert.deepEqual(caliperOf('varix'), { id: 'varix', edge: 'C1a', key: 'varix' });
  assert.equal(caliperText(caliperOf('spleen'), FP), '14.8 cm');
  assert.equal(caliperText(caliperOf('varix'), FP), '8.1 mm');
  assert.equal(caliperText(caliperOf('TIPS'), FP, { tips: { on: true, d: 8 } }), '8 mm', 'a stent as set, in whole millimetres');
  assert.equal(caliperText(caliperOf('TIPS'), FP, { tips: { on: false, d: 8 } }), '…');
  assert.equal(caliperText(caliperOf('PV_TRUNK'), FP, {}, 3), '6.3 mm');
});

test('steps follow the presenter\'s glow order, an organ or a target key included', () => {
  const plan = stepPlan(['heart', 'ivc', 'RHV_IVC'], 550, (id) => VESSELS.has(id), (id) => !!ORGAN_ANCHOR[id]);
  assert.deepEqual(plan.map((p) => [p.n, p.at, p.ids, p.organ]), [[1, 0, null, 'heart'], [2, 550, null, null], [3, 1100, ['RHV_IVC'], null]]);
  const lit = [{ id: 'PV_TRUNK', at: 0 }, { id: 'IVCS_RA', at: 550 }, { id: 'IVC_IS', at: 550 }, { id: 'RHV_IVC', at: 1100 }];
  assert.deepEqual(stepGroups(lit, plan).map((g) => [g.n, g.organ || g.ids.join()]), [[1, 'heart'], [2, 'IVCS_RA,IVC_IS'], [3, 'RHV_IVC']]);
  // (At 0 ms the slide's terms light too: the first step is the glow's own first entry, added after them.)
  const first = stepPlan(['ivc', 'hv'], 550, (id) => VESSELS.has(id), () => false);
  assert.deepEqual(stepGroups([{ id: 'PV_TRUNK', at: 0 }, { id: 'IVCS_RA', at: 0 }, { id: 'RHV_IVC', at: 550 }], first).map((g) => g.ids), [['IVCS_RA'], ['RHV_IVC']]);
});

test('the circuit\'s brackets span two stations under the circuit, and its zones are named', () => {
  const sp = spanOf('CONF', 'IVCS');
  assert.deepEqual([sp.x0, sp.x1], [NODE_POS.CONF[1][0], NODE_POS.IVCS[1][0]]);
  for (const v of Object.values(NODE_POS)) assert.ok(v[1][1] < SPAN_Y - 10, 'below every station');
  assert.ok(SPAN_Y - 10 >= 730 && SPAN_Y < 760, 'under the zone bands, inside the circuit\'s view');
  assert.equal(spanPath(sp), `M480 ${sp.y - 10}V${sp.y}H1120V${sp.y - 10}`);
  assert.equal(spanOf('CONF', 'NOWHERE'), null);
  assert.equal(spanOf('CONF', 'IVCS', 4).y, SPAN_Y, 'zoomed in, the bracket keeps its place');
  assert.ok(spanOf('CONF', 'IVCS', 0.25).y >= 725 + 24 / 0.25, 'drawn small, it keeps 24 px under the lowest lane');
  assert.equal(zoneIndex('liver'), 2);
  assert.equal(zoneIndex(9), -1);
  assert.deepEqual(zoneBand(zoneIndex('heart')), CIRCUIT_ZONES[4].slice(1));
});

test('a mark on an organ has no vessels to expand', () => {
  assert.deepEqual(expandIds(undefined), []);
  assert.deepEqual([...expandIds(['C1a'])], ['C1a']);
});

test('no built-in slide uses a package F field, and the label hook leaves every built-in mark as it is', () => {
  const hook = F.labels[0];
  for (const d of DECKS) for (const s of d.slides) {
    for (const k of ['calipers', 'steps', 'span', 'zone']) if (!adopted(d, s, k)) assert.equal(s[k], undefined, `${d.id}: ${s.title} sets ${k}`);
    if (!adopted(d, s, 'glow:group')) assert.ok(!(s.glow || []).some(Array.isArray), `${d.id}: ${s.title} groups its glow`);
    for (const m of [s.mark, ...(s.marks || [])].filter(Boolean)) {
      if (adopted(d, s, 'mark.organ')) continue;
      assert.equal(m.organ, undefined, `${d.id}: ${s.title}`);
      if (m.label) assert.equal(hook(m.label, m, { fp: FP }), m.label, `${d.id}: ${s.title}`);
    }
  }
});

test('a list in a numbered glow is one step: its vessels light together and its number takes a leader to each', () => {
  const got = [];
  const slide = { glow: [['V_INT', 'V_SPL', 'V_IMV'], ['PVH_R', 'PVH_L'], 'SIN_RR'], glowSeq: 550, steps: true };
  F.figure[0].show({ slide, stage: { callouts: (sp) => got.push(sp) }, fp: FP, params: {}, shown: () => true });
  assert.deepEqual(got.at(-1).steps.map((p) => [p.n, p.at, p.ids, !!p.group]), [[1, 0, ['V_INT', 'V_SPL', 'V_IMV'], true], [2, 550, ['PVH_R', 'PVH_L'], true], [3, 1100, ['SIN_RR'], false]]);
  const P = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(P, /forEach\(\(g0, i\) => \{ for \(const g of Array\.isArray\(g0\) \? expandIds\(g0\) : \[g0\]\)/, 'the presenter lights a group at its entry\'s moment');
  const S = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(S, /if \(g\.group && mids\.length > 1\) \{ fans = mids;/, 'a group\'s number stands between its vessels');
  assert.match(S, /\.\.\.nearFar\(near\)\.map\(\(ps\) => \(\{ \.\.\.ps, fans \}\)\)[^\n]*\.\.\.nearFar\(near\)\]/, 'its leaders keep clear first, and it never vanishes');
  assert.match(S, /k: `lf:\$\{it\.key\}:\$\{j\}`/, 'one leader to each vessel');
});

test('the figure hook hands the stage a slide\'s callouts, fills them as the model moves, and clears them', () => {
  const got = [];
  const stage = { callouts: (sp) => got.push(sp) };
  const slide = { marks: [{ edges: ['@nothing', 'C1a'], label: 'Varix {varix}', kind: 'note' }, { organ: 'kidney', label: 'Left kidney' }], calipers: ['spleen', 'TIPS', 'NOPE'],
    glow: ['V_INT', 'PV_TRUNK'], glowSeq: 400, steps: true, span: [{ from: 'CONF', to: 'IVCS', label: 'PPG {ppg}' }], zone: 'liver' };
  const ctx = { slide, stage, fp: FP, params: { tips: { on: true, d: 10 } }, shown: () => true };
  F.figure[0].show(ctx);
  const sp = got.at(-1);
  assert.deepEqual(Object.keys(sp.live), ['C1a|note']);
  assert.equal(sp.live['C1a|note'].label, 'Varix 8.1 mm');
  assert.deepEqual(sp.organs.map((o) => [o.organ, o.kind, o.label]), [['kidney-l', 'note', 'Left kidney']]);
  assert.deepEqual(sp.calipers.map((c) => [c.id, c.label]), [['spleen', '14.8 cm'], ['TIPS', '10 mm']]);
  assert.deepEqual(sp.steps.map((p) => [p.n, p.at, p.ids]), [[1, 0, ['V_INT']], [2, 400, ['PV_TRUNK']]]);
  assert.equal(sp.spans[0].label, 'PPG 13.2 mmHg');
  assert.equal(sp.zone, 2);
  F.figure[0].update({ ...FP, varix: 9.44, ppg: 10.1 });
  assert.equal(got.at(-1).live['C1a|note'].label, 'Varix 9.4 mm');
  assert.equal(got.at(-1).spans[0].runs.at(-1).tone, '--ok', 'after TIPS, PPG under 12 is green');
  F.figure[0].clear();
  assert.equal(got.at(-1), null);
  F.figure[0].show({ ...ctx, slide: { title: 'Plain' } });
  assert.equal(got.at(-1), null, 'a slide with none of the fields asks for nothing');
});

test('a reading\'s pill stands 12 px inside the stage, clear of drawn shapes by its gap, and faces out past a caliper\'s end', () => {
  const V = { x0: 0, y0: 0, x1: 390, y1: 844 };
  assert.ok(insideBy({ x0: 12, y0: 12, x1: 378, y1: 40 }, V, 12));
  assert.ok(!insideBy({ x0: 300, y0: 100, x1: 384, y1: 130 }, V, 12), '6 px from the edge is too close');
  const spleen = { x0: 100, y0: 100, x1: 160, y1: 220 };
  assert.ok(!clearOf({ x0: 162, y0: 150, x1: 210, y1: 170 }, [spleen], 4), '2 px off the organ touches it');
  assert.ok(clearOf({ x0: 165, y0: 150, x1: 210, y1: 170 }, [spleen], 4));
  assert.ok(clearOf({ x0: 0, y0: 0, x1: 1, y1: 1 }, undefined, 4));
  assert.deepEqual(besideLine([100, 100], [100, 140]).slice(0, 2), ['W', 'E'], 'a line running down: beside its middle, either side, first');
  assert.deepEqual(besideLine([100, 100], [140, 100]).slice(0, 2), ['S', 'N'], 'a level line: above or below its middle');
  assert.equal(new Set(besideLine([0, 0], [1, 1])).size, 8, 'every direction, once');
});

// ── A clot mark that follows the clot (mark.clot) ──
test('clot mark: words follow the cross-section card, gone with no clot', async () => {
  const { clotWords } = await import('../src/ui/callout-math.js');
  assert.equal(clotWords(0), null);
  assert.equal(clotWords(undefined), null);
  assert.equal(clotWords(0.004), null);
  assert.equal(clotWords(0.05), 'Nonocclusive clot');
  assert.equal(clotWords(0.6), 'Nonocclusive clot');
  assert.equal(clotWords(0.99), 'Nonocclusive clot');
  assert.equal(clotWords(0.995), 'Occlusive clot');
  assert.equal(clotWords(1), 'Occlusive clot');
});
test('clot mark: the PVT talk\'s clot slide names the clot live, never "partial"', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/ui/decks/pvt-cirrhosis.js', import.meta.url), 'utf8');
  assert.match(src, /mark: \{ edges: \['PV_TRUNK'\], clot: true \}/);
  assert.doesNotMatch(src, /label: 'Partial clot'/);
});
