// The Gut to heart ladder's two pills, HVPG and PPG, in the plot's top right (Mohammad, 22 Oct: "should probably add two pills HVPG and PPG
// pills in the figure as well on top right for each card"). Their place is the nearest clear one to the corner; where the plot has none
// they stand down (the brackets carry the same two numbers).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { profileOf, profileGeo, axisTop, numberSides, curveRuns, labelPlacer, placePills, placeBrackets, placeLineNames, pillSize, PILL_GAP, BR_PAD, blocksOf, blockBox, zoneBoxes, bracketBox, SPANS } from '../src/ui/tool-profile.js';
import { runSteps } from './deck-states.js';

const prof = readFileSync(new URL('../src/ui/tool-profile.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const approxW = (f) => (t, wt = 600) => t.length * 0.58 * f * (wt >= 700 ? 1.04 : 1);
const hit = (a, b, g = 0) => a[0] < b[1] + g && b[0] < a[1] + g && a[2] < b[3] + g && b[2] < a[3] + g;
const SIZES = [['phone', 13.8, 352, 248], ['iPad', 15.6, 552, 245], ['Mac', 13, 450, 280], ['grid cell', 12.02, 259, 210]];

test('each pill is as wide as its name and the widest value, so a number changing never moves an edge', () => {
  for (const f of [12, 13.8, 15.6]) {
    const tw = approxW(f), { w, h, pad } = pillSize({ f }, tw);
    assert.equal(h, 1.5 * f);
    assert.equal(pad, 0.6 * f);
    SPANS.forEach(([, name], k) => assert.ok(Math.abs(w[k] - (tw(`${name} 00`, 700) + 2 * pad)) < 1e-9, `${name}: its name and 00, the pad each side`));
    assert.ok(h >= 1.2 * f, 'tall enough for the 12 px text');
  }
});

test('the pills stand at the plot\'s top right, two in a row, clear of every line, reading, block, name and bracket', async () => {
  const [hl, schisto, csph, sos, comp] = (await runSteps([{ preset: 'healthy' }, { preset: 'schisto' }, { preset: 'csph' }, { preset: 'sos' }, { preset: 'cirr-comp' }])).map(profileOf);
  let placed = 0;
  for (const [dev, f, w, h] of SIZES) {
    const tw = approxW(f), G = profileGeo(w, h, f, tw, true);
    for (const [name, g, ref] of [['healthy', hl, null], ['schisto', schisto, null], ['cirrhosis', csph, schisto], ['SOS', sos, csph], ['compensated', comp, null]]) {
      const goal = { ...g, top: axisTop(g, hl, ref) }, s = numberSides(G, tw, goal), pl = placePills(G, tw, goal, hl, ref, s);
      if (!pl) continue;
      placed++;
      const [a, b] = pl;
      assert.equal(pl.length, 2, `${dev} ${name}: HVPG then PPG`);
      // (Inside the plot.)
      for (const [x0, x1, y0, y1] of pl) assert.ok(x0 >= G.L && x1 <= G.R + 1e-9 && y0 >= G.T && y1 <= G.Z, `${dev} ${name}: inside the plot`);
      // (A gap between the two, and at the right edge in the corner where nothing is in the way.)
      assert.ok(Math.max(b[0] - a[1], a[0] - b[1], b[2] - a[3], a[2] - b[3]) >= PILL_GAP - 1e-9, `${dev} ${name}: ${PILL_GAP} px between the pills`);
      assert.ok(Math.abs(Math.max(a[1], b[1]) - G.R) < 1e-9, `${dev} ${name}: at the plot's right edge`);
      // (BR_PAD px from every line: the slide's, the healthy one and the earlier one.)
      const y = (v) => G.Z - (G.Z - G.T) * Math.max(0, Math.min(v, goal.top)) / goal.top, P = (q) => q.v.map((v, i) => [G.x(i), y(v)]);
      const lines = labelPlacer(curveRuns([P(goal), P(hl), ...(ref ? [P(ref)] : [])]), [], -1e9, 1e9, [], [0, 0], BR_PAD);
      assert.equal(lines.lineCost(a) + lines.lineCost(b), 0, `${dev} ${name}: clear of the lines`);
      // (BR_PAD px from every reading, block, zone name and dot.)
      s.forEach((v, i) => assert.ok(!hit(a, v.box, BR_PAD - 1e-9) && !hit(b, v.box, BR_PAD - 1e-9), `${dev} ${name}: clear of reading ${i}`));
      for (const i of blocksOf(goal, hl)) assert.ok(!hit(a, blockBox(G, tw, goal, i), BR_PAD - 1e-9) && !hit(b, blockBox(G, tw, goal, i), BR_PAD - 1e-9), `${dev} ${name}: clear of block ${i}`);
      for (const z of zoneBoxes(G, tw)) assert.ok(!hit(a, z, BR_PAD - 1e-9) && !hit(b, z, BR_PAD - 1e-9), `${dev} ${name}: clear of the zone names`);
      // (The brackets and the lines' names, placed after them, stand clear of both.)
      const brk = placeBrackets(G, tw, goal, hl, ref, s, null, pl);
      if (brk) for (const r of [0, 1]) assert.ok(!hit(a, bracketBox(G, r, brk[r])) && !hit(b, bracketBox(G, r, brk[r])), `${dev} ${name}: the bracket ${r} clear of the pills`);
      for (const n of placeLineNames(G, tw, goal, hl, ref, s, brk, 'Before', pl)) {
        const nb = [n.x - tw(n.t, 500) / 2, n.x + tw(n.t, 500) / 2, n.y - 0.72 * f, n.y + 0.2 * f];
        assert.ok(!hit(a, nb) && !hit(b, nb), `${dev} ${name}: the ${n.t} name clear of the pills`);
      }
    }
  }
  assert.ok(placed >= 15, `the pills find a place on most of the sizes and states (${placed} of 20)`);
});

test('given the brackets\' rows, the pills keep clear of those too; given a plot with no room, they stand down', async () => {
  const [hl, csph] = (await runSteps([{ preset: 'healthy' }, { preset: 'csph' }])).map(profileOf);
  const f = 13, tw = approxW(f), G = profileGeo(450, 280, f, tw, true), goal = { ...csph, top: axisTop(csph, hl, null) }, s = numberSides(G, tw, goal);
  const free = placePills(G, tw, goal, hl, null, s);
  assert.ok(free);
  // (A bracket standing where the pills would: they move off it, to the next clear place, or none.)
  const brk = [free[0][2] + 1, free[0][2] + 1].map((y) => y + 0.36 * f), moved = placePills(G, tw, goal, hl, null, s, brk);
  if (moved) for (const r of [0, 1]) for (const p of moved) assert.ok(!hit(p, bracketBox(G, r, brk[r])), `bracket ${r} clear of the pills`);
  // (A sliver of a chart: nothing to put two pills in.)
  const tiny = profileGeo(100, 120, 12, approxW(12), true);
  assert.equal(placePills(tiny, approxW(12), { ...csph, top: axisTop(csph, hl, null) }, hl, null, numberSides(tiny, approxW(12), { ...csph, top: axisTop(csph, hl, null) })), null);
});

test('the pills are drawn over the chart, tinted as the brackets rate them, glide where they move and fade where they come and go', () => {
  // (Rated by the table's own cut-offs, as the brackets are.)
  assert.match(prof, /class: 'ppf-pill', 'data-rate': rate, 'data-k': key/);
  assert.match(prof, /RATE\[key\]\(v\)\[0\]/);
  assert.match(prof, /whole\(v\)/);
  // (Over the brackets in the picture's stack, so nothing hides them.)
  const at = (re) => prof.search(re);
  assert.ok(at(/class: 'ppf-br'/) < at(/class: 'ppf-pill'/), 'drawn after the brackets');
  // (Moves ease through glideAt and a pill that comes or goes fades with the blocks' ease; the chart keeps drawing while either runs.)
  assert.match(prof, /glideAt\(pillAt\[k\]/);
  assert.match(prof, /blkOp\(pillK, t\)/);
  assert.match(prof, /t - pillK\.t0 < FADE_MS/);
  // (The brackets keep their place in the plot before the pills do: they stand down, with the plot's height unchanged.)
  assert.match(prof, /if \(!brk && !band\) \{ brk = placeBrackets\(g, tw, goal, hl, bf, s, old\?\.brk, \[\]\); pl = brk \? placePills\(g, tw, goal, hl, bf, s, brk\) : null; \}/);
  // (The look: a soft fill in the rating's own tone, a ring, bold figures; the same three tones as the .pz-val pills.)
  assert.match(css, /\.ppf-pill \{ --tone: var\(--ok\); \}/);
  assert.match(css, /\.ppf-pill\[data-rate="mid"\] \{ --tone: var\(--caution\); \} \.ppf-pill\[data-rate="hi"\] \{ --tone: var\(--danger\); \}/);
  assert.match(css, /\.ppf-pill rect \{ fill: color-mix\(in srgb, var\(--tone\) 15%, var\(--surface\)\); stroke: color-mix\(in srgb, var\(--tone\) 50%, transparent\);/);
});
