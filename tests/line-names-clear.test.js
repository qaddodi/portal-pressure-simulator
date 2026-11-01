// The Gut to heart chart names its healthy (and earlier) line on the drawing. Where no place at the line's own side was clear, the name was
// written over the line or a number: "Healthy" on the line between the 7 and the 5, Circulation 5 on a Mac, and over the dashed line on
// Sites 8 on an iPad (screenshot sweep, 1 Nov). Now it stands at the nearest clear place a little further off (up to NAME_REACH rows of type),
// and in a plot too crowded even for that at the nearest one 1 px clear. Where a clear place was had before, it is the one taken still.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { profileOf, profileGeo, axisTop, numberSides, placePills, placeBrackets, placeLineNames, labelPlacer, curveRuns, blocksOf, blockBox, zoneBoxes, bracketBox, NAME_REACH } from '../src/ui/tool-profile.js';
import { runSteps } from './deck-states.js';

const prof = readFileSync(new URL('../src/ui/tool-profile.js', import.meta.url), 'utf8');
const approxW = (f) => (t, wt = 600) => t.length * 0.58 * f * (wt >= 700 ? 1.04 : 1);
// Chart sizes as the app draws them: a Mac's card (429 x 247 measured on screen), an iPad's, a phone's, a grid cell, the six ladders.
const SIZES = [['phone', 13.8, 352, 248], ['iPad', 15.6, 552, 245], ['iPad card', 12, 393, 215], ['Mac', 12, 429, 247], ['Mac, taller', 13, 450, 280], ['six ladders, Mac', 16, 433, 357], ['six ladders, laptop', 14, 379, 250]];
const PRESETS = ['healthy', 'schisto', 'csph', 'sos', 'cirr-comp', 'cirr-decomp', 'budd-chiari', 'pvt-acute', 'rhf'];

/** The plan draw() makes for a chart (pills, brackets, then the names), and a placer holding everything a name must keep clear of. */
function planFor(goal0, hl, ref, [f, W, H]) {
  const tw = approxW(f), goal = { ...goal0, top: axisTop(goal0, hl, ref) };
  let G = profileGeo(W, H, f, tw, true), s = numberSides(G, tw, goal), pl = placePills(G, tw, goal, hl, ref, s);
  let brk = placeBrackets(G, tw, goal, hl, ref, s, null, pl || []);
  if (!brk) { brk = placeBrackets(G, tw, goal, hl, ref, s, null, []); pl = brk ? placePills(G, tw, goal, hl, ref, s, brk) : null; }
  if (!brk) { G = profileGeo(W, H, f, tw); s = numberSides(G, tw, goal); pl = placePills(G, tw, goal, hl, ref, s); }
  const names = placeLineNames(G, tw, goal, hl, ref, s, brk, 'Before', pl || []);
  const yg = (v) => G.Z - (G.Z - G.T) * Math.max(0, Math.min(v, goal.top)) / goal.top, ptsG = (p) => p.v.map((v, i) => [G.x(i), yg(v)]), dotR = Math.max(4, 0.36 * f);
  const pg = ptsG(goal), runs = curveRuns([pg, ...[hl, ref].filter(Boolean).map(ptsG)]);
  // (Touching: no padding at all, so a name merely close to a line is not counted, only one written over it or over a word.)
  const touch = labelPlacer(runs, [], -1e9, 1e9, [], [0, 0], 0);
  for (const [x, y] of pg) touch.take([x - dotR - 1, x + dotR + 1, y - dotR - 1, y + dotR + 1]);
  for (const v of s || []) if (v?.box) touch.take(v.box);
  for (const i of blocksOf(goal, hl)) touch.take(blockBox(G, tw, goal, i));
  for (const r of [0, 1]) touch.take(bracketBox(G, r, brk ? brk[r] : G.brY(r)));
  for (const b of zoneBoxes(G, tw)) touch.take(b);
  for (const b of pl || []) touch.take(b);
  return { names, touch, tw, f, G };
}

test('no line name is written over a line or a number, on any case at any card size that holds the chart', async () => {
  const profs = (await runSteps(PRESETS.map((preset) => ({ preset })))).map(profileOf), hl = profs[0], bad = [];
  let named = 0;
  for (let gi = 0; gi < PRESETS.length; gi++) for (const ri of [null, 1, 2, 3, 4, 5]) {
    if (ri === gi) continue;
    for (const [dev, ...sz] of SIZES) {
      const { names, touch, tw, f } = planFor(profs[gi], hl, ri == null ? null : profs[ri], sz);
      for (const n of names) {
        named++;
        const w = tw(n.t, 500), b = [n.x - w / 2, n.x + w / 2, n.y - 0.72 * f, n.y + 0.2 * f];
        if (touch.cost(b) !== 0) bad.push(`${PRESETS[gi]}${ri == null ? '' : ` vs ${PRESETS[ri]}`}, ${dev}: ${n.t} at ${n.x.toFixed(0)}, ${n.y.toFixed(0)}`);
      }
    }
  }
  assert.ok(named > 300, `names were placed (${named})`);
  assert.deepEqual(bad, []);
});

test('Circulation 5 on a Mac: the healthy case\'s name stands clear of its line and the 7 and the 5 (it stood between them)', async () => {
  const [hl] = (await runSteps([{ preset: 'healthy' }])).map(profileOf);
  const { names, touch, tw, f, G } = planFor(hl, hl, null, [12, 429, 247]);
  assert.equal(names.length, 1);
  const [n] = names, w = tw(n.t, 500), b = [n.x - w / 2, n.x + w / 2, n.y - 0.72 * f, n.y + 0.2 * f];
  assert.equal(touch.cost(b), 0, `"${n.t}" at ${n.x.toFixed(0)}, ${n.y.toFixed(0)} touches nothing`);
  assert.ok(b[0] >= G.L && b[1] <= G.R && b[2] >= G.T && b[3] <= G.Z, 'inside the plot');
});

test('the search is the old one first: a clear place at the line\'s own side is still taken, and the reach is a few rows of type, not the plot', () => {
  assert.ok(NAME_REACH >= 2 && NAME_REACH <= 4);
  // (The wider search only runs after the old loop found no clear place.)
  const at = (re) => prof.search(re);
  assert.ok(at(/if \(place\.cost\(b\) === 0\) \{ got = \{ t, c, x: cx, y: base, b \}; break; \}/) < at(/for \(const pl of \[place, snug\]\)/), 'the nearest-side search first, then the wider ones');
  assert.ok(at(/for \(const pl of \[place, snug\]\)/) < at(/got = got \|\| best;/), 'and the least crowded place only after both');
});
