// Deck visuals package B (review/deck-visuals-recs.md §9): the pressure profile on slides (tool-profile.js), where the
// portal blood goes (tool-flows.js) and the treatment bands on the over-time charts (rx-bands.js), read from the slides'
// own fingerprints as the presenter computes them. No built-in deck sets any of their fields.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { adopted } from './deck-adopted.js';
import { EXT } from '../src/ui/slide-ext.js';
import { NODES } from '../src/engine/topology.js';
import { portalSplit } from '../src/ui/table-marks.js';
import { profileOf, STATIONS, TIGHT_NAMES, NAME_GAP, axisTop, nameFit, profileGeo, valueSides, placeValues, curveRuns, labelPlacer, bracketLabel, bracketFit, oneLineGap, LABEL_PAD, BAR_MIN, BR_CLEAR, BR_MIN, BRACE_NAME, SPANS, placeBrackets, bracketBox, BR_PAD } from '../src/ui/tool-profile.js';
import { flowParts, routeFlows, wholeShares, flowView, MAX_ROUTES, flowLayout, LABEL_GAP } from '../src/ui/tool-flows.js';
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
    assert.ok(!['profile', 'flows'].includes(s.tool?.kind) || adopted(d, s, `kind:${s.tool.kind}`), `${d.id}/${s.id}`);
    if (!adopted(d, s, 'tool.bands')) assert.equal(s.tool?.bands, undefined, `${d.id}/${s.id} sets bands`);
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
  assert.equal(nameFit(120, tw).rows, 1);
  assert.equal(nameFit(120, tw).names[1], 'Portal vein');
  // The liver's stations are Pre-, Intra- and Post- on every card (Mohammad, 19 Oct), a brace under them named sinusoidal.
  const si = STATIONS.indexOf('SIN_R');
  for (const ff of [12, 12.02, 13.8, 15.6, 18]) for (let slot = 10; slot <= 200; slot += 0.5) {
    const F = nameFit(slot, approxW(ff));
    assert.deepEqual(F.names.slice(si - 1, si + 2), ['Pre-', 'Intra-', 'Post-'], `${ff} px, slot ${slot}`);
  }
  assert.equal(BRACE_NAME, 'sinusoidal');
  // (Wide capitals, as a real font draws 'WHVP': eased apart on one row, else that name alone on a second row, else staggered;
  // on every row no two names closer than the gap, none more than a quarter slot off its dot.)
  const wide = (t) => [...t].reduce((a, c) => a + (/[A-Z]/.test(c) ? 0.8 : 0.55) * 12, 0);
  let eased = 0, lifted = 0;
  for (let slot = 20; slot <= 60; slot += 0.25) {
    const F = nameFit(slot, wide), X = (i) => slot * i + F.dx[i];
    assert.equal(F.names[si], 'Intra-');
    if (F.rows === 1 && F.dx.some((d) => d)) eased++;
    if (F.low.filter(Boolean).length === 1) { assert.ok(F.low[si]); lifted++; }
    for (const row of [false, true]) {
      const on = F.names.map((nm, i) => i).filter((i) => F.low[i] === row);
      on.forEach((i, k) => { if (k) assert.ok(X(i) - wide(F.names[i]) / 2 - (X(on[k - 1]) + wide(F.names[on[k - 1]]) / 2) >= NAME_GAP - 1e-6, `slot ${slot}: ${F.names[on[k - 1]]} and ${F.names[i]}`); });
    }
    F.dx.forEach((d) => assert.ok(Math.abs(d) <= slot / 4 + 1e-9));
  }
  assert.ok(eased > 0 && lifted > 0, `eased ${eased}, lifted ${lifted}`);
  for (const n of Object.values(TIGHT_NAMES)) assert.ok(!/[….]/.test(n), n);
  // (A phone, an upright iPad and a Mac card, at the sizes the demo deck draws them: one row, no two names closer than the gap.)
  for (const [dev, ff, w] of [['phone', 13.8, 352], ['iPad', 15.6, 552], ['Mac', 12.02, 259], ['small phone', 13.8, 300]]) {
    const t = approxW(ff), G = profileGeo(w, 240, ff, t);
    // (One row; on the narrowest, Intra alone on a second row under its dot.)
    assert.ok(G.fit.rows === 1 || (G.fit.low.filter(Boolean).length === 1 && G.fit.low[si]), `${dev}: one row of names`);
    G.fit.names.forEach((n, i) => {
      assert.ok(ff >= 12, `${dev}: 12 px or more`);
      if (i && G.fit.low[i] === G.fit.low[i - 1]) assert.ok(G.nameX(i) - t(n) / 2 - (G.nameX(i - 1) + t(G.fit.names[i - 1]) / 2) >= NAME_GAP - 1e-9, `${dev}: ${G.fit.names[i - 1]} and ${n} apart`);
      assert.ok(Math.abs(G.nameX(i) - G.x(i)) <= G.slot / 4 + 1e-9, `${dev}: ${n} nearer its own dot`);
    });
    assert.ok(G.nameX(0) - t(G.fit.names[0]) / 2 >= 0 && G.nameX(7) + t(G.fit.names[7]) / 2 <= w, `${dev}: names inside the chart`);
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
  const lb = bracketLabel(100, 300, 70);
  assert.equal(lb.mode, 'gap');
  assert.ok(lb.gap[0] > 100 && lb.gap[1] < 300);
  assert.equal(bracketLabel(100, 180, 70).mode, 'tight');
  assert.equal(bracketLabel(100, 160, 70, [36, 22]).mode, 'stack');
});

test('a bracket\'s label stays between its two ends, clear of the other labels, 12 px or more, on every card size', () => {
  // (Sites 4 and 5, 19 Oct: "HVPG 2.4" was drawn past its bracket's right end. Bold capitals measured wide, as a real font draws them.)
  const wide = (f) => (t, wt = 600) => [...t].reduce((a, c) => a + (/[A-Z]/.test(c) ? 0.8 : /[0-9]/.test(c) ? 0.62 : 0.32) * f * (wt >= 700 ? 1.04 : 1), 0);
  let stacked = 0, tight = 0;
  // (Down to narrower than any card draws it at each type size: a Mac's 12 px card, a phone's 13.8, an iPad's 15.6 and 18.)
  for (const [f, w0] of [[12, 220], [13.8, 280], [15.6, 340], [18, 400]]) for (let w = w0; w <= 900; w += 7) for (const h of [150, 240, 320]) {
    const tw = wide(f), G = profileGeo(w, h, f, tw), cap = 0.72 * f;
    assert.ok(f >= 12);
    const boxes = SPANS.map(([, name, a, b], r) => {
      const x0 = G.x(STATIONS.indexOf(a)), x1 = G.x(STATIONS.indexOf(b)), yy = G.brY(r);
      return ['2', '15', '24', '00'].map((val) => {
        // (On one line at the bracket's own type size, never under 12 px: Mohammad, 19 Oct.)
        const fs = G.brFs[r], z = fs / f;
        assert.ok(fs >= 12 && fs <= f, `${w}x${h} at ${f} px: ${name} at ${fs} px`);
        const lb = bracketLabel(x0, x1, z * tw(`${name} ${val}`, 700), [z * tw(name, 600), z * tw(val, 700)]);
        const stack = G.brMode[r] === 'stack', wd = stack ? Math.max(tw(name, 600), tw(val, 700)) : z * tw(`${name} ${val}`, 700);
        if (stack) stacked++; else if (G.brMode[r] === 'tight') tight++;
        const box = [lb.x - wd / 2, lb.x + wd / 2, stack ? yy - 0.19 * f - cap : yy + 0.36 * f - cap, stack ? yy + 0.91 * f : yy + 0.36 * f];
        assert.ok(box[0] >= x0 + 3 && box[1] <= x1 - 3, `${w}x${h} at ${f} px: ${name} ${val} between its ends (${box[0].toFixed(1)}–${box[1].toFixed(1)} in ${x0.toFixed(1)}–${x1.toFixed(1)})`);
        if (!stack && G.brMode[r] === 'gap') assert.ok(lb.gap[0] >= x0 + 8 - 1e-9 && lb.gap[1] <= x1 - 8 + 1e-9, `${w}x${h}: ${name}'s bar shows each side`);
        return box;
      });
    });
    // (In the band at the plot's foot: under the zero line, over the axis, the HVPG over the PPG, never touching.)
    for (const hv of boxes[0]) {
      assert.ok(hv[2] >= G.Z + 3, `${w}x${h} at ${f} px: the HVPG under the zero line`);
      for (const pp of boxes[1]) assert.ok(hv[3] + 3 <= pp[2] && pp[3] <= G.B - 3, `${w}x${h} at ${f} px: the HVPG clear of the PPG, the PPG over the axis`);
    }
    assert.ok(G.Z - G.T >= 3 * f - 1e-9, `${w}x${h}: the plot keeps its room`);
  }
  assert.ok(stacked > 0 && tight > 0, `narrow cards stack or tighten the label (stacked ${stacked}, tight ${tight})`);
  // (A Mac card's full width, as on Sites 5 under the words: the label on one line with the bar each side of it.)
  assert.deepEqual(profileGeo(600, 200, 12, wide(12)).brMode, ['gap', 'gap']);
});

test('the HVPG label goes on one line in smaller type before it stacks its name over its value', () => {
  // (Mohammad, 19 Oct, on a Mac: "HVPG can fit in one line inside the bracket, can make it smaller text".)
  const wide = (f) => (t, wt = 600) => [...t].reduce((a, c) => a + (/[A-Z]/.test(c) ? 0.8 : /[0-9]/.test(c) ? 0.62 : 0.32) * f * (wt >= 700 ? 1.04 : 1), 0);
  const tw = wide(15), wd = tw('HVPG 00', 700);
  assert.deepEqual(bracketFit(wd + 26, 'HVPG', tw, 15), { mode: 'gap', fs: 15 });
  // (Room for the bar at a smaller size: smaller, with the bar each side, 8 px of it at least.)
  const g = bracketFit(0.9 * wd + 26, 'HVPG', tw, 15);
  assert.equal(g.mode, 'gap');
  assert.ok(g.fs < 15 && g.fs >= BR_MIN && wd * g.fs / 15 <= 0.9 * wd + 1e-9, `${g.fs} px keeps the bar`);
  // (Too short for 8 px of bar: smaller type, so a bar still shows each side where it can, never under 12 px.)
  const t = bracketFit(wd + 2 * BR_CLEAR + 1, 'HVPG', tw, 15);
  assert.ok(t.mode === 'tight' && t.fs < 15 && t.fs >= BR_MIN && wd * t.fs / 15 <= wd + 2 * (BR_CLEAR + 1) - 2 * (LABEL_PAD + BAR_MIN) + 1e-9, `${t.fs} px`);
  const small = bracketFit(0.97 * wd, 'HVPG', tw, 15);
  assert.equal(small.mode, 'tight');
  assert.ok(small.fs < 15 && small.fs >= BR_MIN && wd * small.fs / 15 <= 0.97 * wd - 2 * BR_CLEAR + 1e-9, `${small.fs} px fits`);
  // (Never under 12 px: a span too short even then stacks, at the chart's size.)
  assert.deepEqual(bracketFit(0.5 * wd, 'HVPG', tw, 15), { mode: 'stack', fs: 15 });
  // (A Mac card beside its tiles, 12 px type: one line, not stacked.)
  for (const [w, f] of [[335, 12], [352, 13.8], [552, 15.6]]) assert.notEqual(profileGeo(w, 260, f, wide(f)).brMode[0], 'stack', `${w} px at ${f}: HVPG on one line`);
});

test('the HVPG bracket shows its bar each side of its label where there is room, as on the Mac on slides 19 to 23', () => {
  // (Mohammad, 19 Oct, on 8ebf324: "19-23 still no bracket on HVPG": a Mac card 335 px wide, 12 px type, "HVPG 2" with some 10 px
  // free each side and the bar left out, judged from the widest value with 8 px of bar. Widths as Inter Bold draws them.)
  const EM = { H: 0.74, V: 0.7, P: 0.66, G: 0.77, ' ': 0.26 };
  const inter = (f) => (t) => [...t].reduce((a, c) => a + (EM[c] ?? (/[0-9]/.test(c) ? 0.63 : 0.6)) * f, 0);
  for (const [w, f, vals] of [[335, 12, ['2', '6', '12']], [300, 12, ['2', '6']], [352, 13.8, ['2', '6', '12']], [390, 13.8, ['2', '6', '12']], [552, 15.6, ['2', '6', '12']]]) for (const val of vals) {
    const tw = inter(f), G = profileGeo(w, 260, f, tw, true), [, name, a, b] = SPANS[0];
    const x0 = G.x(STATIONS.indexOf(a)), x1 = G.x(STATIONS.indexOf(b)), fs = G.brFs[0], lw = tw(`${name} ${val}`) * fs / f;
    assert.notEqual(G.brMode[0], 'stack', `${w} px at ${f}: on one line`);
    assert.ok(fs >= BR_MIN && fs <= f, `${w} px at ${f}: ${fs} px type`);
    const [g0, g1] = oneLineGap(x0, x1, lw);
    // (The bar each side: BAR_MIN px of it at least, LABEL_PAD px clear of the label; the label between the ends.)
    assert.ok(g0 - x0 >= BAR_MIN && x1 - g1 >= BAR_MIN, `${w} px at ${f}: HVPG ${val}'s bar shows each side (${(g0 - x0).toFixed(1)}, ${(x1 - g1).toFixed(1)} px of ${(x1 - x0).toFixed(1)})`);
    assert.ok(Math.abs((g1 - g0) - (lw + 2 * LABEL_PAD)) < 1e-9 && LABEL_PAD >= BR_CLEAR);
  }
  // (No room: the ends alone.)
  assert.deepEqual(oneLineGap(0, 40, 30), [0, 40]);
});

test('a new state keeps each bracket on its row while that row stays clear, and moves it to the nearest clear row', async () => {
  // (Mohammad, 19 Oct: "HVPG and PPG keep jumping up and down".)
  const [hl, csph, comp] = (await runSteps([{ preset: 'healthy' }, { preset: 'csph' }, { preset: 'cirr-comp' }])).map(profileOf);
  const f = 12, w = 335, h = 300, tw = approxW(f), G = profileGeo(w, h, f, tw, true);
  const goalOf = (g) => ({ ...g, top: axisTop(g, hl, null) }), sides = (goal) => goal.v.map((v, i) => ({ box: [G.x(i) - 8, G.x(i) + 8, 0, 0] }));
  const a = goalOf(csph), brk = placeBrackets(G, tw, a, hl, null, sides(a));
  assert.ok(brk);
  // (The same state again, from where they stand: unchanged.)
  assert.deepEqual(placeBrackets(G, tw, a, hl, null, sides(a), brk), brk);
  // (A nudged state, the numbers a hair different: still unchanged.)
  const nudged = goalOf({ ...csph, v: csph.v.map((v) => v + 0.05) });
  assert.deepEqual(placeBrackets(G, tw, nudged, hl, null, sides(nudged), brk), brk);
  // (Another state: wherever they go, each row is clear, and a row that stays clear is kept.)
  const b = goalOf(comp), fresh = placeBrackets(G, tw, b, hl, null, sides(b)), moved = placeBrackets(G, tw, b, hl, null, sides(b), brk);
  if (fresh) {
    assert.ok(moved);
    const clear = placeBrackets(G, tw, b, hl, null, sides(b), moved);
    assert.deepEqual(clear, moved, 'the rows it moved to are clear rows');
  }
});

test('on the resistance profiles no value touches a line or a word, and each is clearly its own dot\'s', async () => {
  const [hl, schisto, csph, sos, comp] = (await runSteps([{ preset: 'healthy' }, { preset: 'schisto' }, { preset: 'csph' }, { preset: 'sos' }, { preset: 'cirr-comp' }])).map(profileOf);
  const one = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const off = [];
  // (A phone, an upright iPad and a Mac card, at the sizes the demo deck draws them.)
  for (const [dev, f, w, h] of [['phone', 13.8, 352, 260], ['iPad', 15.6, 552, 270], ['Mac', 12.02, 259, 229]]) {
    for (const [name, g, ref] of [['healthy', hl, null], ['schisto', schisto, null], ['cirrhosis', csph, schisto], ['SOS', sos, csph], ['compensated', comp, null]]) {
      const tw = approxW(f), G = profileGeo(w, h, f, tw), goal = { ...g, top: axisTop(g, hl, ref) };
      const y = (v) => G.Z - (G.Z - G.T) * Math.min(v, goal.top) / goal.top, P = (p) => p.v.map((v, i) => [G.x(i), y(v)]);
      const pg = P(g), labels = g.v.map(one), all = pg;
      const s = placeValues(G, (t) => tw(t), goal, hl, ref);
      const lines = labelPlacer([...curveRuns([pg, P(hl), ...(ref ? [P(ref)] : [])]), [[0, G.Z], [w, G.Z]]], [], -1e9, 1e9, [4, 1, 1, 2]);
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

test('the HVPG and PPG brackets stand inside the plot, 4 px clear of every line, dot, value, word, the axis and each other', async () => {
  // (Mohammad, 19 Oct: "put the HVPG and PPG brackets INSIDE the chart not outside", each label inside its own bracket.)
  const [hl, schisto, csph, sos, comp, pvt] = (await runSteps([{ preset: 'healthy' }, { preset: 'schisto' }, { preset: 'csph' }, { preset: 'sos' }, { preset: 'cirr-comp' }, { preset: 'pvt-chronic' }])).map(profileOf);
  const inside = [], under = [];
  const gap = (a, b) => Math.max(b[0] - a[1], a[0] - b[1], b[2] - a[3], a[2] - b[3]);
  for (const [dev, f, w, h] of [['phone', 13.8, 352, 260], ['iPad', 15.6, 552, 270], ['Mac', 12.02, 259, 229], ['Mac wide', 12.02, 600, 150], ['Mac beside', 12, 335, 300], ['phone sideways', 12, 300, 170]]) {
    for (const [name, g, ref] of [['healthy', hl, null], ['schisto', schisto, null], ['cirrhosis', csph, schisto], ['SOS', sos, csph], ['compensated', comp, null], ['PVT', pvt, null]]) {
      if (!g) continue;
      // (As the chart plans it: inside the plot where both have room, else in the band at its foot.)
      const tw = approxW(f), goal = { ...g, top: axisTop(g, hl, ref) };
      let G = profileGeo(w, h, f, tw, true), s = placeValues(G, (t) => tw(t), goal, hl, ref), brk = placeBrackets(G, tw, goal, hl, ref, s);
      if (brk) inside.push(`${dev} ${name}`);
      else { under.push(`${dev} ${name}`); G = profileGeo(w, h, f, tw); s = placeValues(G, (t) => tw(t), goal, hl, ref); brk = [G.brY(0), G.brY(1)]; }
      const y = (v) => G.Z - (G.Z - G.T) * Math.min(v, goal.top) / goal.top, P = (p) => p.v.map((v, i) => [G.x(i), y(v)]);
      const lines = labelPlacer(curveRuns([P(g), P(hl), ...(ref ? [P(ref)] : [])]), [], -1e9, 1e9, [4, 1, 1], [0, 0], BR_PAD);
      const boxes = brk.map((yy, r) => bracketBox(G, r, yy));
      boxes.forEach((b, r) => {
        const what = `${dev} ${name}: the ${SPANS[r][1]} bracket`;
        assert.ok(b[2] >= G.T - 1e-9 && b[3] <= G.B - BR_PAD + 1e-9, `${what} inside the plot, clear of the axis`);
        assert.ok(G.inside || b[2] >= G.Z + BR_PAD - 1e-9, `${what} under the zero line`);
        assert.equal(lines.lineCost(b), 0, `${what} clear of the lines`);
        s.forEach((v, i) => assert.ok(gap(b, v.box) >= BR_PAD - 1e-9, `${what} clear of the value ${i}`));
        P(g).forEach(([x, yy]) => assert.ok(gap(b, [x - 4, x + 4, yy - 4, yy + 4]) >= BR_PAD - 1e-9, `${what} clear of the dots`));
        assert.ok(f >= 12);
      });
      assert.ok(gap(boxes[0], boxes[1]) >= BR_PAD - 1e-9, `${dev} ${name}: the brackets clear of each other`);
      // (The brace under Pre, Intra and Post: inside their band, its name no wider than it, under the names and over the chart's foot.)
      const i0 = STATIONS.indexOf('RPV'), i1 = STATIONS.indexOf('CV_R'), xa = G.x(i0) - 0.42 * G.slot, xb = G.x(i1) + 0.42 * G.slot;
      assert.ok(xa >= G.x(i0) - G.slot / 2 && xb <= G.x(i1) + G.slot / 2, `${dev}: the brace inside the liver's stations`);
      assert.ok(tw(BRACE_NAME) <= xb - xa, `${dev}: Sinusoidal no wider than its brace`);
      assert.ok(G.braceY >= Math.max(...STATIONS.map((_, i) => G.nameY(i))) + 0.2 * f, `${dev}: the brace under the names`);
      assert.ok(G.braceY + 1.55 * f <= h - 0.2 * f || h < G.need, `${dev}: Sinusoidal inside the chart`);
    }
  }
  // (His slide, health on a phone, an iPad and a Mac card: in the plot among the lines.)
  for (const dev of ['phone', 'iPad', 'Mac beside']) assert.ok(inside.includes(`${dev} healthy`), `${dev} healthy: inside (band: ${under.join(', ')})`);
  console.log(`among the lines ${inside.length}, in the band ${under.length}: ${under.join(', ')}`);
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
  // The card: one bar, the liver first and then the routes largest first, a bracket over the bypass routes.
  const v = flowView(b);
  assert.equal(v.bar[0].id, 'liver');
  assert.equal(v.bar.reduce((s, p) => s + p.pct, 0), 100, 'the bar is all the portal blood');
  assert.deepEqual(v.bracket, ['Bypassing the liver', 100 - v.bar[0].pct]);
  const routes = v.bar.filter((p) => p.id !== 'liver' && p.id !== 'other');
  assert.equal(v.bar.slice(1).reduce((s, p) => s + p.pct, 0), v.bracket[1], 'the bracket spans every bypass segment');
  for (let i = 1; i < routes.length; i++) assert.ok(routes[i - 1].pct >= routes[i].pct, 'largest first');
  const vi = flowView(flowParts(tips, 'inflow'), 'inflow');
  assert.equal(vi.bracket, null, 'no bracket on the inflow');
  assert.deepEqual(vi.bar.map((p) => p.id), ['portal', 'artery'].filter((id) => vi.bar.some((p) => p.id === id)));
  assert.equal(vi.bar.reduce((s, p) => s + p.pct, 0), 100);
});

// The label rule on every deck slide's bars, at every card width from the narrowest real one (240 px: a 320 px Mac or iPad
// card less its widest padding, 2 × 40 px; a phone's is 280 px or more) to a Mac's widest: the rows' names ("Healthy",
// "Now") in the gutter at the bars' left; each name 12 px or more, inside the card; a name on its own segment g clear of the
// segment's edges and inside the bar's height, else under the bar on a leader, ≥ 4 px from every other name, every other
// name's leader and the bar; the rows inside the card's height. The Healthy bar's words sit on their own segments too.
function checkRule(parts, of, w, hh, f, at, hParts = null) {
  const m = (t, ff) => t.length * ff * 0.58;
  const lay = flowLayout(parts, of, w, hh, f, m, hParts), geo = lay.geo, g = geo.g;
  assert.equal(lay.parts.reduce((a, p) => a + p.pct, 0), 100, `${at}: the bar is still all the blood`);
  assert.ok(f >= 12 && g >= LABEL_GAP);
  assert.ok(lay.ok, `${at}: the names fit in ${lay.rows} rows`);
  // The rows' names clear of the bars, the two bars close, as tall as each other.
  assert.ok(Math.max(m('Healthy', f), m('Now', f)) + g <= lay.gut + 1e-9 && lay.gut < w / 2, `${at}: Healthy and Now beside their bars`);
  assert.ok(lay.segs[0].a === lay.gut && Math.abs(lay.segs.at(-1).b - w) < 1e-6, `${at}: the bar runs from the gutter to the card's edge`);
  assert.ok(geo.head - geo.barH <= Math.max(g, 0.5 * f) + 1e-9, `${at}: the bars sit close`);
  assert.ok(lay.top >= 0 && lay.top + geo.head + geo.barH + lay.rows * geo.step <= hh + 1e-6, `${at}: inside the card's height`);
  // Two lines on a bar: inside it, a line's height apart.
  assert.ok(geo.n1 - 0.75 * f >= 0.3 * f && geo.n2 <= geo.barH - 0.3 * f && geo.n2 - geo.n1 >= 1.1 * f, `${at}: two lines fit on a bar`);
  if (hParts) {
    assert.deepEqual(lay.hsegs.map((h) => h.id).filter((id) => lay.segs.some((q) => q.id === id)), lay.segs.map((q) => q.id).filter((id) => lay.hsegs.some((h) => h.id === id)), `${at}: Healthy in the Now bar's order`);
    lay.hsegs.forEach((h, i) => {
      const room = h.b - h.a - 2 * g, mode = lay.hmode[i];
      if (mode === 'both') assert.ok(Math.max(m(h.name, f), m(`${h.pct}%`, f)) <= room + 1e-9, `${at}: Healthy ${h.name} fits its segment`);
      if (mode === 'pct') assert.ok(m(`${h.pct}%`, f) <= room + 1e-9, `${at}: Healthy ${h.pct}% fits its segment`);
    });
  }
  const barB = lay.top + geo.head + geo.barH;
  const boxOf = (l) => { const t = barB + geo.band + l.row * geo.step; return { x0: l.L, x1: l.L + l.lw, y0: t, y1: t + geo.lab }; };
  lay.labels.forEach((l, i) => {
    const s = lay.segs[i];
    if (!l.lead) {
      assert.equal(l.row, -1, `${at}: ${s.name} on its segment`);
      assert.ok(l.L >= s.a + g - 1e-9 && l.L + l.lw <= s.b - g + 1e-9, `${at}: ${s.name} on its own segment, clear of its edges`);
      return;
    }
    const b = boxOf(l);
    assert.ok(l.row >= 0 && l.row < lay.rows, `${at}: ${s.name} in a row under the bar`);
    assert.ok(b.x0 >= -1e-9 && b.x1 <= w + 1e-9, `${at}: ${s.name} inside the card`);
    assert.ok(b.y0 - barB >= g - 1e-9, `${at}: ${s.name} clear of the bar`);
    assert.ok(l.ex >= b.x0 && l.ex <= b.x1, `${at}: ${s.name}'s leader ends over it`);
    lay.labels.forEach((n, j) => {
      if (j === i || !n.lead) return;
      const o = boxOf(n);
      if (n.row === l.row) assert.ok(Math.max(o.x0 - b.x1, b.x0 - o.x1) >= g - 1e-9, `${at}: ${s.name} clear of ${lay.segs[j].name}`);
      // Another name's leader drops straight down through the rows above that name: never within g of this one.
      if (n.row > l.row) assert.ok(n.ex <= b.x0 - g + 1e-9 || n.ex >= b.x1 + g - 1e-9, `${at}: ${lay.segs[j].name}'s leader clear of ${s.name}`);
    });
  });
  // The slants keep the bar's order, so no two leaders cross.
  const ex = lay.labels.filter((l) => l.lead).map((l) => l.ex);
  for (let i = 1; i < ex.length; i++) assert.ok(ex[i] > ex[i - 1], `${at}: leaders never cross`);
  return lay;
}

test('the portal blood bar: names keep the label rule on every deck slide and card width', async () => {
  const f = 12, H = { portal: 9.25 * f, inflow: 9.25 * f };
  const [healthy] = await runSteps([{ preset: 'healthy' }]);
  const hp = { portal: flowParts(healthy, 'portal'), inflow: flowParts(healthy, 'inflow') };
  assert.ok(hp.portal.find((p) => p.id === 'liver').pct > 80, 'healthy: most portal blood reaches the liver');
  let leads = 0, n = 0;
  for (const d of DECKS) {
    const fps = await deckStates(d);
    d.slides.forEach((s, i) => {
      if (!fps[i]?.at) return;
      for (const of of ['portal', 'inflow']) {
        const parts = flowParts(fps[i], of);
        for (const w of [240, 260, 280, 340, 420, 560, 720]) {
          const lay = checkRule(parts, of, w, H[of], f, `${d.id}/${s.id} ${of} ${w}px`, hp[of]);
          leads += lay.labels.filter((l) => l.lead).length; n++;
        }
      }
    });
  }
  assert.ok(n > 100 && leads > 0, 'many bars checked, some names on leaders');
  // Thin segments side by side (a TIPS slide's crumbs) and the most names the bar shows, in a narrow card.
  const crumbs = [{ id: 'liver', name: 'Liver', pct: 4 }, { id: 'tips', name: 'TIPS', pct: 86 }, { id: 'var', name: 'Varices', pct: 4 },
    { id: 'pum', name: 'Paraumbilical', pct: 3 }, { id: 'grs', name: 'Gastrorenal', pct: 2 }, { id: 'other', name: 'Other', pct: 1 }];
  for (const w of [260, 300, 400]) checkRule(crumbs, 'portal', w, H.portal, f, `crumbs ${w}px`);
  const six = [{ id: 'liver', name: 'Liver', pct: 20 }, { id: 'ret', name: 'Retroperitoneal', pct: 18 }, { id: 'pum', name: 'Paraumbilical', pct: 17 },
    { id: 'grs', name: 'Gastrorenal', pct: 16 }, { id: 'srs', name: 'Splenorenal', pct: 15 }, { id: 'other', name: 'Other', pct: 14 }];
  for (const w of [440, 500, 600]) checkRule(six, 'portal', w, H.portal, f, `six ${w}px`);
  // Narrower still (a large text size): the smallest routes join Other until the names keep the rule, the liver's share
  // unchanged, one route still named.
  for (const w of [200, 220]) {
    const lay = checkRule(six, 'portal', w, H.portal, f, `six ${w}px`);
    assert.ok(lay.parts.length < six.length, `six ${w}px: some routes joined Other`);
    assert.equal(lay.parts.find((p) => p.id === 'liver').pct, 20);
    assert.ok(lay.parts.some((p) => !['liver', 'other'].includes(p.id)), 'a route still named');
  }
  for (const w of [440, 500]) assert.equal(flowLayout(six, 'portal', w, H.portal, f, approxW(f)).parts, six, `six ${w}px: nothing merged where the names fit`);
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
  // (grow: the phone's year chart from Dx, Anticoagulation after a name that leaves no room: a row of its own, inside the edge)
  const g = namePlaces([[200, 290], [270, 300]], ['Carvedilol', 'Anticoagulation'], (t) => t.length * 7, { rows: 1, maxX: 300, grow: true });
  assert.deepEqual(g.map((a) => a.row), [0, 1]);
  assert.ok(g[1].x + 15 * 7 <= 300 && g[1].x >= 0, JSON.stringify(g));
  assert.deepEqual(namePlaces([[200, 290], [270, 300]], ['Carvedilol', 'Anticoagulation'], (t) => t.length * 7, { rows: 1, maxX: 300 }).map((a) => a.row), [0, 0], 'without grow, the rows stay as asked');
  for (const k of Object.keys(RX)) assert.equal(typeof RX[k][1](undefined), 'boolean');
});
