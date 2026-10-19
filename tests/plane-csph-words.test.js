// The stiffness and platelets plane names its own zones (Mohammad, 19 Oct: "the area labeling is not working also just say No
// CSPH, CSPH, and Indeterminate"): one word each on the drawing, the amber L as one zone, no key under it, and the data card's
// case a dot in proportion to the plot ("on the phone it's huge"; "a dot with clearance around it"). Every zone's words keep
// 4 px or more clear of the dot and its gap wherever it stands and all along its way when it moves, at 12 px or more, never cut
// short. Checked at the card's sizes on an iPhone (upright and sideways), an iPad and a Mac.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planeOf, frame, scaler, placeCardWords, dotBoxes, dotSize, cutSegs, lineBoxes, layoutPlane, planeReading, zoneOf } from '../src/ui/visual-plane.js';
import { runSteps } from './deck-states.js';

const pl = planeOf('csph');
const touch = (a, o) => a[0] < o[2] && a[2] > o[0] && a[1] < o[3] && a[3] > o[1];
const gapTo = (b, x, y) => Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - y, 0, y - b[3]));
// [W, H, caption px, where]: the data card's plot (its key's room given to it).
const CARD = [[330, 190, 14, 'iPhone upright'], [360, 195, 16, 'iPhone wide upright'], [500, 159, 16, 'iPhone sideways'], [460, 304, 14, 'iPad'], [560, 387, 18, 'Mac']];

test('the three zones carry his words, and the readout under the card uses them', () => {
  assert.deepEqual(pl.zones.map((z) => z.t), ['CSPH', 'No CSPH', 'Indeterminate']);
  assert.deepEqual(pl.zones.map((z) => z.tone), ['hi', 'ok', 'mid']);
  assert.equal(pl.key, 'never');
  assert.ok(planeReading(pl, { lsm: 12.5, plt: 159 }).endsWith('· No CSPH'));
  assert.ok(planeReading(pl, { lsm: 21, plt: 115 }).endsWith('· Indeterminate'));
  assert.ok(planeReading(pl, { lsm: 30, plt: 90 }).endsWith('· CSPH'));
  // (The cut-offs only where two zones meet, so the amber reads as one L: 15 kPa above 150, 25 kPa all the way, 150 left of 15.)
  const fr = { L: 40, R: 440, T: 10, B: 310 }, { X, Y } = scaler(pl, fr);
  const segs = cutSegs(pl, X, Y, fr).map((c) => [c.x1, Math.min(c.y1, c.y2), c.x2, Math.max(c.y1, c.y2)].map(Math.round));
  assert.deepEqual(segs, [[190, 10, 190, 160], [290, 10, 290, 310], [40, 160, 190, 160]]);
  assert.equal(cutSegs(planeOf('hvpg-ppg'), X, Y, fr).length, 4, 'the HVPG against PPG plane keeps its whole lines');
});

test('the data card: no key, a dot in proportion to the plot with a gap around it, every zone named clear of it', () => {
  // (The test DOM draws no SVG: the drawing's own lines, read as written.)
  const src = readFileSync(new URL('../src/ui/visual-plane.js', import.meta.url), 'utf8'), css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(src, /pl\.key === 'never' \? null : planeCardKey\(pl\)/, 'no key under the card plot');
  assert.match(src, /card && pl\.key === 'never' \? ' pze-ownwords' : ''/, 'the plot takes the key\'s room');
  assert.match(css, /\.pz\.stack \.pze-plot\.pze-incard\.pze-ownwords \{ height: calc\(168px \+ 1\.3em \+ 6px\); \}/);
  assert.match(src, /ringG = sv\('g', \{ class: 'pze-ring' \}, halo, dot\)/, 'a dot with its gap, no ring');
  assert.match(src, /svg\.append\(base, wordsG, ringG\)/, 'the dot and the words stay the same elements, so they ease');
  assert.match(css, /\.pze-ring \.pze-halo \{ fill: var\(--surface\); \}/);
  assert.match(css, /\.pze-ring \{ transition: transform \.7s var\(--ease\)/, 'the dot eases to each new reading');
  for (const [W, H, fs, where] of CARD) {
    const fr = frame(W, H, fs, pl), { X, Y } = scaler(pl, fr), { r, g } = dotSize(fr), R = r + g, rules = lineBoxes(pl, X, Y, fr);
    assert.ok(r >= 4 && r <= Math.min(fr.R - fr.L, fr.B - fr.T) * 0.05 && g >= 2.5, `${where}: the dot in proportion (r ${r.toFixed(1)})`);
    // (The slides' own readings and the moves between them, then the whole plane.)
    const moves = [[null, [12.5, 159]], [[12.5, 159], [24, 88]], [[16, 140], [27, 120]], [null, null]];
    for (let a = 0; a <= 40; a += 4) for (let b = 0; b <= 300; b += 30) moves.push([null, [a, b]]);
    for (const [from, to] of moves) {
      const px = (p) => p && { x: X(p[0]), y: Y(p[1]) }, at = px(to), was = px(from);
      const words = placeCardWords(pl, fr, X, Y, fs, dotBoxes(at, was, R));
      const tag = `${where}, dot ${to}${from ? ` from ${from}` : ''}`;
      assert.deepEqual(words.map((w) => w.z.t), ['CSPH', 'No CSPH', 'Indeterminate'], `${tag}: every zone named`);
      for (const w of words) {
        assert.ok(w.fs >= 12, `${tag}: ${w.z.t} at 12 px or more`);
        assert.equal(w.lines.join(' '), w.z.t, `${tag}: ${w.z.t} whole, never cut short`);
        assert.ok(!w.onLine && !rules.some((o) => touch(w.box, o)), `${tag}: ${w.z.t} clear of every line`);
        assert.equal(zoneOf(pl, { lsm: (pl.x.max * ((w.x - fr.L) / (fr.R - fr.L))), plt: pl.y.max * ((fr.B - (w.box[1] + w.box[3]) / 2) / (fr.B - fr.T)) }), w.z, `${tag}: ${w.z.t} in its own zone`);
        if (at) assert.ok(gapTo(w.box, at.x, at.y) >= R + 4 - 0.01, `${tag}: ${w.z.t} 4 px clear of the dot and its gap`);
        if (at && was) for (let k = 0; k <= 20; k++) assert.ok(gapTo(w.box, was.x + (at.x - was.x) * k / 20, was.y + (at.y - was.y) * k / 20) >= R + 4 - 2.5, `${tag}: ${w.z.t} clear of the dot's way`);
        for (const v of words) if (v !== w) assert.ok(!touch(w.box, v.box), `${tag}: words apart`);
      }
    }
  }
});

test('the summary (slide "plane"): no key anywhere, every zone named beside the patients\' names', async () => {
  const [healthy, comp, csph, csph2] = await runSteps([{ preset: 'healthy' }, { preset: 'cirr-comp' }, { preset: 'csph' }, { preset: 'csph', params: { cirrhosis: 0.75 } }]);
  const rows = [[healthy, 'Healthy'], [comp, 'Compensated, no CSPH', 'No CSPH'], [csph, 'Between the cut-offs', 'Undecided'], [csph2, 'Six months on', '6 months']];
  for (const [W, H, fs, where] of [[345, 300, 16, 'iPhone upright'], [620, 260, 14, 'iPhone sideways'], [800, 450, 16, 'iPad'], [1290, 570, 18, 'Mac']]) {
    const fr = frame(W, H, fs, pl), { X, Y } = scaler(pl, fr);
    const pts = rows.map(([f, name, short]) => ({ x: X(f.lsm), y: Y(f.plt), name, short }));
    const { names, words, rules } = layoutPlane(pl, fr, X, Y, fs, pts);
    assert.ok(names.every(Boolean), `${where}: every patient named`);
    assert.deepEqual(words.map((w) => w.z.t).sort(), ['CSPH', 'Indeterminate', 'No CSPH'], `${where}: every zone named`);
    for (const w of words) {
      for (const o of [...names.map((n) => n.box), ...rules]) assert.ok(!touch(w.box, o), `${where}: ${w.z.t} clear`);
      for (const p of pts) assert.ok(gapTo(w.box, p.x, p.y) >= 8, `${where}: ${w.z.t} clear of a point`);
    }
  }
});
