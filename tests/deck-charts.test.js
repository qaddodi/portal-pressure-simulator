// Deck visuals package B (review/deck-visuals-recs.md §9): the pressure profile on slides (tool-profile.js), where the
// portal blood goes (tool-flows.js) and the treatment bands on the over-time charts (rx-bands.js), read from the slides'
// own fingerprints as the presenter computes them. No built-in deck sets any of their fields.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { EXT } from '../src/ui/slide-ext.js';
import { NODES } from '../src/engine/topology.js';
import { portalSplit } from '../src/ui/table-marks.js';
import { profileOf, STATIONS, TIGHT_NAMES, NAME_GAP, axisTop, nameFit, profileGeo, valueSides, placeValues, curveRuns, labelPlacer, bracketLabel } from '../src/ui/tool-profile.js';
import { flowParts, routeFlows, wholeShares, flowView, BAR_ROWS, MAX_ROUTES } from '../src/ui/tool-flows.js';
import { milePlaces } from '../src/ui/talk-trace.js';
import { RX, bandKeys, bandRuns, bandSpan, namePlaces } from '../src/ui/rx-bands.js';
import { deckStates, runSteps } from './deck-states.js';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const approxW = (f) => (t) => t.length * f * 0.58;

test('package B registers its two tools, and no built-in deck uses them or the bands', () => {
  assert.equal(EXT.owner.tools.profile, 'B');
  assert.equal(EXT.owner.tools.flows, 'B');
  assert.equal(EXT.tools.flows.title({ of: 'inflow' }), 'Blood into the liver');
  assert.equal(EXT.tools.profile.short({}), 'Gut to heart');
  for (const d of DECKS) for (const s of d.slides) {
    assert.ok(!['profile', 'flows'].includes(s.tool?.kind), `${d.id}/${s.id}`);
    assert.equal(s.tool?.bands, undefined, `${d.id}/${s.id} sets bands`);
  }
});

test('the profile reads the tiles\' numbers and the network\'s own pressures', async () => {
  const [healthy, csph, schisto] = await runSteps([{ preset: 'healthy' }, { preset: 'csph' }, { preset: 'schisto' }]);
  for (const fp of [healthy, csph, schisto]) {
    const p = profileOf(fp);
    assert.equal(p.v.length, STATIONS.length);
    assert.deepEqual([p.v[1], p.v[3], p.v[4], p.v[5], p.v[6], p.v[7]], [fp.pv, fp.whvp, fp.cv, fp.fhvp, fp.ivc, fp.ra]);
    // (The sinusoid's station shows the wedged reading, so the HVPG bracket is that point less the hepatic vein's.)
    const tenth = (x) => Math.round(x * 10) / 10;
    assert.ok(near(tenth(p.v[3]) - tenth(p.v[5]), fp.hvpg, 1e-6), `${p.v[3]} − ${p.v[5]} against ${fp.hvpg}`);
    assert.ok(near(p.v[0], fp.int) && near(p.v[2], fp.at.P[NI.RPV], 1e-4));
    assert.equal(p.hvpg, fp.hvpg); assert.equal(p.ppg, fp.ppg);
    assert.equal(p.w, undefined, 'no wedged ring (Mohammad, 19 Oct)');
    for (const v of p.v) assert.ok(Number.isFinite(v) && v >= -1 && v < 80, String(v));
  }
  // The healthy line falls gently; cirrhosis loses its pressure in the sinusoids, schistosomiasis before them.
  const h = profileOf(healthy).v, c = profileOf(csph).v, s = profileOf(schisto).v;
  assert.ok(h[1] - h[7] < 10, 'healthy: a small fall from portal vein to heart');
  assert.ok(c[3] - c[5] > c[1] - c[2], 'cirrhosis: the sinusoid to hepatic vein fall is the larger');
  assert.ok(s[1] - s[3] > s[3] - s[5], 'schistosomiasis: the fall before the sinusoids is the larger');
  assert.equal(profileOf(null), null);
  assert.equal(profileOf({ pv: 10 }), null, 'no network, no profile');
  assert.equal(axisTop({ v: [3, 2] }), 15);
  assert.equal(axisTop({ v: [22.4] }, null, { v: [9] }), 25);
  assert.equal(axisTop({ v: [44] }), 50);
});

test('the station names fit their slots on one row: full where there is room, else abbreviated, never an ellipsis', () => {
  const f = 12, tw = approxW(f);
  assert.equal(nameFit(120, tw).names[2], 'Portal venule');
  assert.equal(nameFit(120, tw).rows, 1);
  assert.equal(nameFit(120, tw).names[3], 'Sinusoid (WHVP)');
  assert.equal(nameFit(60, tw).names[3], 'WHVP');
  for (const n of Object.values(TIGHT_NAMES)) assert.ok(!/[….]/.test(n), n);
  // (A phone, an upright iPad and a Mac card, at the sizes the demo deck draws them: one row, no two names closer than the gap.)
  for (const [dev, ff, w] of [['phone', 13.8, 352], ['iPad', 15.6, 552], ['Mac', 12.02, 259], ['small phone', 13.8, 300]]) {
    const t = approxW(ff), G = profileGeo(w, 240, ff, t);
    assert.equal(G.fit.rows, 1, `${dev}: one row of names`);
    G.fit.names.forEach((n, i) => {
      assert.ok(ff >= 12, `${dev}: 12 px or more`);
      if (i) assert.ok(G.x(i) - t(n) / 2 - (G.x(i - 1) + t(G.fit.names[i - 1]) / 2) >= NAME_GAP - 1e-9, `${dev}: ${G.fit.names[i - 1]} and ${n} apart`);
    });
    assert.ok(G.x(0) - t(G.fit.names[0]) / 2 >= 0 && G.x(7) + t(G.fit.names[7]) / 2 <= w, `${dev}: names inside the chart`);
  }
  for (const w of [320, 358, 420, 520, 700]) for (const hh of [160, 240, 320]) {
    const G = profileGeo(w, hh, f, tw);
    assert.ok(G.B - G.T >= 3 * f, `${w}x${hh}: the plot keeps its room`);
    assert.ok(G.brY(1) + 0.5 * f <= hh + 1 || hh < 200, `${w}x${hh}: the brackets inside the chart`);
    assert.ok(G.x(0) > G.L && G.x(7) < G.R);
  }
});

test('a value goes under its dot only where the line is in the way above', () => {
  const f = 12, tw = approxW(f);
  // A flat line: every value above. A steep drop into a point: its value under it when the line before covers the top.
  assert.deepEqual(valueSides([[0, 100], [40, 100], [80, 100]], [], ['5.0', '5.0', '5.0'], f, tw, 20).map((v) => v.s), [-1, -1, -1]);
  const s = valueSides([[0, 30], [20, 110], [60, 112]], [], ['30.0', '10.0', '9.0'], f, tw, 20);
  assert.equal(s[1].s, 1);
  // Never on the axis: a low point's value goes above it, or beside, never under the axis line.
  const low = valueSides([[0, 60], [40, 118], [80, 119]], [], ['8.0', '0.3', '0.2'], f, tw, 20, { bottom: 117 });
  for (const v of low.slice(1)) assert.equal(v.s, -1);
  // Two values side by side never touch: the second moves.
  const pair = valueSides([[0, 80], [30, 80]], [], ['13.0', '12.7'], f, tw, 20);
  assert.ok(pair[1].s !== pair[0].s || Math.abs(pair[1].dx - pair[0].dx) > 0);
  // The curve, not its chord: a label clear of the straight line but on the curve's bulge moves.
  const P = [[0, 20], [40, 30], [80, 120], [120, 122]];
  const runs = curveRuns([P])[0];
  assert.ok(runs.length > P.length, 'the curve is sampled finely');
  // A steep drop counts as in the way, and each value keeps clear of its own line and nearest its own dot.
  const steep = [[0, 40], [40, 42], [80, 44], [88, 150], [130, 152]], vals = ['16.7', '13.4', '11.4', '3.6', '3.1'];
  const st = valueSides(steep, [], vals, f, tw, 0, { bottom: 160 });
  const own = labelPlacer(curveRuns([steep]), [], -1e9, 1e9, [4]);
  st.forEach(({ box: b }, i) => {
    assert.ok(own.lineCost(b) < 4, `${vals[i]} clear of its own line`);
    const cx = (b[0] + b[1]) / 2, cy = (b[2] + b[3]) / 2, d = (p) => Math.hypot(cx - p[0], cy - p[1]);
    assert.ok(steep.every((p, j) => j === i || d(p) > d(steep[i])), `${vals[i]} nearest its own dot`);
  });
  const lb = bracketLabel(100, 300, 70, 400, 30);
  assert.equal(lb.anchor, 'middle');
  assert.ok(lb.gap[0] > 100 && lb.gap[1] < 300);
  assert.equal(bracketLabel(100, 140, 70, 400, 30).anchor, 'start');
  assert.equal(bracketLabel(300, 380, 90, 400, 30).anchor, 'end');
});

test('on the resistance profiles no value touches a line or a word, and each is clearly its own dot\'s', async () => {
  const [hl, schisto, csph, sos, comp] = (await runSteps([{ preset: 'healthy' }, { preset: 'schisto' }, { preset: 'csph' }, { preset: 'sos' }, { preset: 'cirr-comp' }])).map(profileOf);
  const one = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const off = [];
  // (A phone, an upright iPad and a Mac card, at the sizes the demo deck draws them.)
  for (const [dev, f, w, h] of [['phone', 13.8, 352, 260], ['iPad', 15.6, 552, 270], ['Mac', 12.02, 259, 229]]) {
    for (const [name, g, ref] of [['healthy', hl, null], ['schisto', schisto, null], ['cirrhosis', csph, schisto], ['SOS', sos, csph], ['compensated', comp, null]]) {
      const tw = approxW(f), G = profileGeo(w, h, f, tw), goal = { ...g, top: axisTop(g, hl, ref) };
      const y = (v) => G.B - (G.B - G.T) * Math.min(v, goal.top) / goal.top, P = (p) => p.v.map((v, i) => [G.x(i), y(v)]);
      const pg = P(g), labels = g.v.map(one), all = pg;
      const s = placeValues(G, (t) => tw(t), goal, hl, ref);
      const lines = labelPlacer([...curveRuns([pg, P(hl), ...(ref ? [P(ref)] : [])]), [[0, G.B], [w, G.B]]], [], -1e9, 1e9, [4, 1, 1, 2]);
      const words = s.map((v) => v.box);
      for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) {
        const [a, b] = [words[i], words[j]];
        assert.ok(!(a[0] < b[1] && b[0] < a[1] && a[2] < b[3] && b[2] < a[3]), `${dev} ${name}: two words overlap`);
      }
      s.forEach(({ box: b, tier, across }, i) => {
        assert.ok(!across, `${dev} ${name}: no other line between ${labels[i]} and its dot`);
        const [cx, cy] = [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2], d = (p) => Math.hypot(cx - p[0], cy - p[1]);
        assert.ok(all.every((p, j) => j === i || d(all[i]) < d(p)), `${dev} ${name}: ${labels[i]} nearer its own dot`);
        if (tier || lines.lineCost(b)) off.push(`${dev} ${name} ${labels[i]}`);
        if (!tier) assert.equal(lines.lineCost(b), 0, `${dev} ${name}: ${labels[i]} touches no line`);
      });
    }
  }
  // (With the names on one row and no wedged ring, every value has a clear place, the Mac card's SOS too.)
  assert.deepEqual(off, []);
});

test('whole percents keep their sum', () => {
  assert.deepEqual(wholeShares([1, 1, 1], 100), [34, 33, 33]);
  assert.deepEqual(wholeShares([0, 0], 40), [0, 0]);
  for (const t of [0, 7, 38, 100]) assert.equal(wholeShares([0.3, 2.2, 5, 0.01], t).reduce((a, b) => a + b, 0), t ? t : 0);
});

test('the portal blood bar agrees with the Shunted tile on every deck slide', async () => {
  let routes = 0;
  for (const d of DECKS) {
    const fps = await deckStates(d);
    d.slides.forEach((s, i) => {
      const fp = fps[i];
      if (!fp?.at) return;
      const parts = flowParts(fp);
      const sum = parts.reduce((a, p) => a + p.pct, 0);
      assert.equal(sum, 100, `${d.id}/${s.id}: parts add up to 100`);
      const liver = parts.find((p) => p.id === 'liver')?.pct ?? 0;
      assert.equal(liver, portalSplit(fp.shunt).liver, `${d.id}/${s.id}: liver = 100 − Shunted`);
      assert.ok(parts.length <= MAX_ROUTES + 2);
      for (const p of parts) assert.ok(p.pct > 0 && Number.isInteger(p.pct));
      // The routes count the blood the shunt fraction counts.
      const { by, custom, inflow } = routeFlows(fp.at.Q);
      const shunted = Object.values(by).reduce((a, b) => a + b, 0) + custom;
      assert.ok(Math.abs(Math.min(1, shunted / inflow) - fp.shunt) < 2e-3, `${d.id}/${s.id}: ${shunted / inflow} against ${fp.shunt}`);
      routes += parts.length > 2 ? 1 : 0;
      const inf = flowParts(fp, 'inflow');
      assert.equal(inf.reduce((a, p) => a + p.pct, 0), 100, `${d.id}/${s.id}: inflow adds up to 100`);
    });
  }
  assert.ok(routes > 10, 'several slides have more than one route');
});

test('a TIPS shows as its own part; the inflow turns arterial after it', async () => {
  const [decomp, tips] = await runSteps([{ preset: 'cirr-decomp' }, { params: { tips: { on: true, d: 10 } } }]);
  const a = flowParts(decomp), b = flowParts(tips);
  assert.equal(a.find((p) => p.id === 'tips'), undefined);
  assert.ok(b.find((p) => p.id === 'tips').pct > 20, JSON.stringify(b));
  assert.ok(flowParts(tips, 'inflow').find((p) => p.id === 'artery').pct > flowParts(decomp, 'inflow').find((p) => p.id === 'artery').pct);
  assert.equal(flowParts({ shunt: 0.2 }), null, 'no flows, no bar');
  // The card: a headline of the liver against the rest, then the routes as bars, largest first, never more than it keeps room for.
  const v = flowView(b);
  assert.deepEqual(v.head.map(([n]) => n), ['Liver', 'Bypassing the liver']);
  assert.equal(v.head[0][1] + v.head[1][1], 100);
  assert.equal(v.head[0][1], b.find((p) => p.id === 'liver').pct);
  assert.ok(v.bars.every((p) => p.id !== 'liver') && v.bars.length <= BAR_ROWS);
  assert.equal(v.bars.reduce((s, p) => s + p.pct, 0), v.head[1][1], 'the bars add up to the bypassed share');
  for (let i = 1; i < v.bars.length; i++) assert.ok(v.bars[i - 1].pct >= v.bars[i].pct, 'largest first');
  const vi = flowView(flowParts(tips, 'inflow'), 'inflow');
  assert.deepEqual(vi.head.map(([n]) => n), ['Portal vein', 'Hepatic artery'], 'both halves named, one at 0 % too');
  assert.equal(vi.head[0][1] + vi.head[1][1], 100);
  for (let i = 1; i < vi.bars.length; i++) assert.ok(vi.bars[i - 1].pct >= vi.bars[i].pct);
});

test('the year chart\'s milestone names: level, inside the chart, never touching each other', () => {
  const W = 340, w = approxW(13);
  const names = ['Dx', 'Carvedilol', 'Clot', 'Anticoagulation', 'TIPS', '12 months'];
  for (const xs of [[10, 60, 70, 75, 300, 335], [0, 5, 10, 15, 20, 25], [50, 100, 150, 200, 250, 300]]) {
    const widths = names.map(w);
    const { at, rows } = milePlaces(xs, widths, W);
    assert.ok(rows >= 1 && rows <= names.length);
    at.forEach((a, i) => {
      assert.ok(a.x - widths[i] / 2 >= 0 && a.x + widths[i] / 2 <= W, `${names[i]} inside the chart`);
      for (let j = 0; j < i; j++) if (at[j].row === a.row) assert.ok(Math.abs(a.x - at[j].x) >= (widths[i] + widths[j]) / 2 + 10 - 1e-9, `${names[i]} clear of ${names[j]}`);
    });
  }
  assert.deepEqual(milePlaces([20, 200], [30, 30], 340).at.map((a) => a.row), [0, 0], 'names far apart share one row');
});

test('treatment bands: one run per stretch on, named once, the names on rows that never touch', () => {
  assert.deepEqual(bandKeys({ bands: ['tips', 'nope', 'tips', 'carvedilol'] }), ['tips', 'carvedilol']);
  assert.deepEqual(bandKeys({}), []);
  const P = [{}, { drugs: { carvedilol: true } }, { drugs: { carvedilol: true }, anticoag: true }, { drugs: { carvedilol: false }, anticoag: true }, { tips: { on: true } }];
  const runs = bandRuns(P, ['carvedilol', 'anticoag', 'tips']);
  assert.deepEqual(runs.map((r) => [r.key, r.i0, r.i1]), [['carvedilol', 1, 2], ['anticoag', 2, 3], ['tips', 4, 4]]);
  assert.deepEqual(bandRuns([{ anticoag: true }, {}, { anticoag: true }], ['anticoag']).map((r) => [r.i0, r.i1]), [[0, 0], [2, 2]]);
  const X = (i) => 100 + 50 * i;
  assert.deepEqual(bandSpan(runs[0], 5, X, 100, 300), [125, 225]);
  assert.deepEqual(bandSpan(runs[2], 5, X, 100, 300), [275, 300]);
  const spans = [[100, 200], [110, 250], [260, 300]], names = runs.map((r) => r.name);
  const at = namePlaces(spans, names, (t) => t.length * 7, { ends0: [150], maxX: 300 });
  assert.deepEqual(at.map((a) => a.row), [1, 0, 1]);
  assert.deepEqual(at.map((a) => a.x), [106, 158, 266]);
  // (the phone's year chart: Carvedilol on the second row, Anticoagulation clamped to the plot's end, just short of the first)
  const ph = namePlaces([[93, 220], [181, 226]], ['Carvedilol', 'Anticoagulation'], (t) => t.length * 7.2, { ends0: [110], maxX: 226 });
  assert.ok(ph[0].row !== ph[1].row || ph[1].x >= ph[0].x + 72 + 8, JSON.stringify(ph));
  assert.equal(namePlaces([[280, 300]], ['Anticoagulation'], (t) => t.length * 7, { maxX: 300 })[0].x, 300 - 15 * 7, 'a name near the end ends at the plot\'s edge');
  for (const [k, a] of at.entries()) assert.ok(a.x + names[k].length * 7 <= 300);
  for (const k of Object.keys(RX)) assert.equal(typeof RX[k][1](undefined), 'boolean');
});
