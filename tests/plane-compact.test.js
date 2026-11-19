import './dom-shim.js';
// The HVPG against PPG chart, 17 Nov 2026 (Mohammad: "no need to mention both raised, PPG only etc. on the chart itself, you have a legend already ... the chart
// doesn't need to be that tall ... why extend it horizontally so far out? HVPG 20 maybe ... it needs to be elegant. Everywhere."): the zones are tints the legend
// names, never words on the plot; the HVPG axis stops at 20; the plot is wide and low.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planeOf, PLANES, frame, scaler, plotNumbers, placeCardWords, placeZoneWords, layoutPlane, cutSegs } from '../src/ui/visual-plane.js';
import { runSteps } from './deck-states.js';
import { appCss } from './split-src.js';

const pl = planeOf('hvpg-ppg');

test('the HVPG axis stops at 20 mmHg and no reading on any slide is clamped at either edge', async () => {
  assert.equal(pl.x.max, 20);
  assert.equal(pl.x.min, 0);
  // (The PPG axis keeps its 28: the acute clot's 27.3 is a reading the plot must show where it is, not at its edge.)
  const fps = await runSteps(['pvt-acute', 'cirr-decomp', 'gastric-varix', 'pregnancy', 'budd-chiari', 'csph'].map((preset) => ({ preset })));
  for (const f of fps) {
    assert.ok(f.hvpg < pl.x.max - 1, `HVPG ${f.hvpg.toFixed(1)} inside the axis`);
    assert.ok(f.ppg < pl.y.max, `PPG ${f.ppg.toFixed(1)} inside the axis`);
  }
  // (Every cut-off stays on the plot, with room after the last one.)
  for (const v of pl.cuts.x) assert.ok(v < pl.x.max * 0.6);
  for (const v of pl.cuts.y) assert.ok(v < pl.y.max * 0.6);
  // (Every deck that draws the plane takes it from here: none sets its own range.)
  const decks = ['sites', 'hvpg', 'choose-treatment', 'masld'].map((n) => readFileSync(new URL(`../src/ui/decks/${n}.js`, import.meta.url), 'utf8'));
  for (const src of decks) assert.ok(!/plane:\s*\{[^}]*x:\s*\{[^}]*hvpg/.test(src), 'no deck sets its own HVPG axis');
  assert.equal(planeOf({ base: 'hvpg-ppg', diag: { label: 'HVPG = PPG' } }).x.max, 20, 'the masld plane inherits the axis');
});

test('no zone name is written on the plot, in the card or the summary, at any size; the legend names all four', () => {
  assert.equal(pl.noWords, true);
  assert.equal(planeOf({ base: 'hvpg-ppg', diag: { label: 'HVPG = PPG' } }).noWords, true, 'the masld plane inherits it');
  assert.deepEqual(pl.zones.map((z) => z.short), ['Both normal', 'PPG only', 'HVPG only', 'Both raised'], 'the legend\'s four names');
  for (const [W, H, fs] of [[345, 150, 16], [345, 288, 16], [800, 190, 16], [1290, 440, 18]]) {
    const fr = frame(W, H), { X, Y } = scaler(pl, fr);
    assert.equal(placeCardWords(pl, fr, X, Y, fs, []).length, 0, `${W}x${H}: the card writes no zone words`);
    assert.equal(placeZoneWords(pl, fr, X, Y, fs, [], [], false).length, 0, `${W}x${H}: the summary writes none`);
    assert.equal(placeZoneWords(pl, fr, X, Y, fs, [], [], true).length, 0, `${W}x${H}: nor does the card's layout`);
    assert.equal(layoutPlane(pl, fr, X, Y, fs, [{ x: X(10.5), y: Y(13.9), name: 'Cirrhosis' }], false).words.length, 0, `${W}x${H}: layoutPlane places none`);
  }
  // (The CSPH plane is unchanged: it still names its own zones.)
  assert.ok(!PLANES.csph.noWords);
  // (The source draws a zone's words only through those two functions, so no other path can write one.)
  const src = readFileSync(new URL('../src/ui/visual-plane.js', import.meta.url), 'utf8');
  assert.equal((src.match(/'pze-zw'/g) || []).length >= 1, true);
  assert.match(src, /if \(pl\.noWords\) return out;/);
});

test('a low, wide plot still numbers every cut-off and keeps the lines, in the card and the summary, on every size', () => {
  for (const [W, H, fs, what] of [[330, 150, 13, 'iPhone card'], [345, 150, 16, 'iPhone card, large type'], [560, 170, 14, 'iPad card'], [800, 200, 16, 'iPad card wide'], [1290, 250, 18, 'Mac card']]) {
    const fr = frame(W, H), { X, Y } = scaler(pl, fr), nums = plotNumbers(pl, fr, X, Y, fs);
    for (const v of ['5', '10', '6', '12']) assert.ok(nums.some((n) => n.text === v), `${what}: the cut-off ${v} is numbered`);
    assert.equal(cutSegs(pl, X, Y, fr).length, 4, `${what}: the four lines`);
    // (The two axes are named, and nothing written on the plot overlaps anything else.)
    const boxes = nums.map((n) => n.box);
    for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) assert.ok(!(a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]), `${what}: ${nums[i].text} and the number or name beside it do not touch`);
  }
});

test('the plane\'s plot is wide and low: the compact rules are in the stylesheet and apply to this plane only', () => {
  assert.equal(pl.compact, true);
  assert.ok(!PLANES.csph.compact && !PLANES['flow-ppg'].compact);
  const css = appCss();
  for (const sel of ['.pze-plot.pze-short {', '.pz.stack .pze-plot.pze-short {', '.pze-plot.pze-incard.pze-short {', '.pz.stack .pze-plot.pze-incard.pze-short {', '.pz.low .pze-plot.pze-incard.pze-short {']) assert.ok(css.includes(sel), sel);
  // (The card's height: well under the 300 px (an iPhone) and 360 px (a Mac) the zones' plot had.)
  const m = css.match(/\.pze-plot\.pze-incard\.pze-short \{ height: clamp\((\d+)px, calc\((\d+) \* var\(--pzh\)\), (\d+)px\)/);
  assert.ok(m && +m[3] <= 220 && +m[1] <= 140, 'the card plot is at most 220 px');
  const ph = css.match(/\.pz\.stack \.pze-plot\.pze-incard\.pze-short \{ height: min\(calc\(clamp\((\d+)px, (\d+)cqi, (\d+)px\)/);
  assert.ok(ph && +ph[3] <= 190, 'an iPhone card plot is at most 190 px');
  // (No card scrolls sideways: the plot is as wide as its card, the legend wraps.)
  assert.match(css, /\.pze-ckey \{ display: flex; flex-wrap: wrap;/);
});
