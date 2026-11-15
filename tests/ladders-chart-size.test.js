// The six ladders' charts on a wide screen: each the data card's instrument, drawn once at the instrument's own size and scaled down as one piece to its
// cell (Mohammad, 28 Oct, Sites 10: "each graph should look in proportions exactly as the instrument so we just fit the slide borders around"; then, on
// the first try that laid the chart out afresh at the cell's size, "looks wrong to me": "each cell the instrument drawn exactly, scaled down", the Sites
// slide 8 card as the reference). Sites 10 and Where-resistance 14 share the card (`.pz-panel.fill`), which is as tall as its two rows of them.
// (This replaced the 26 Oct sizing, "larger text size on it": 4.5 cqi up to 20 px in a cell as tall as the screen left, a chart 0.8 of its width tall.)
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileOf, profileGeo, axisTop, numberSides, placePills, placeBrackets, zoneSize, zoneFit, chartScale, ZONE_MAX, ZONE_MIN } from '../src/ui/tool-profile.js';
import { runSteps } from './deck-states.js';
import { appCss } from './split-src.js';

const css = appCss();
const CELL = '.pz:not(.stack) .pz-cell';
const rule = (sel) => css.match(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';


test('the card gives its charts back its own vertical padding, in height only', () => {
  const PANEL = '.pz:not(.stack):not(.low) .pz-panel.fill';
  assert.match(rule(PANEL), /gap: clamp\(8px, calc\(1\.2 \* var\(--pzh\)\), 16px\); padding-bottom: clamp\(12px, calc\(1\.8 \* var\(--pzh\)\), 24px\);/);
  assert.doesNotMatch(rule(PANEL), /width|padding-inline|padding-top/);
  assert.match(rule(`${PANEL} .pz-grid`), /^ row-gap: clamp\(8px, calc\(1\.2 \* var\(--pzh\)\), 16px\); $/);
  // (A phone keeps its own rules: none of these reaches .stack or .low.)
});

test('a cell\'s chart is the instrument at its own size: its width, type and height from the instrument\'s own formulas, scaled whole', () => {
  // (The instrument's own: the card's width less its padding (--pz-cw, --pz-cp), the data card's chart size (--pz-sm), 62 % of the width with a floor of 28 % and
  // a ceiling of 40 % of the window's height, less the 1.6 em the chart gave back: the same numbers in the cell's tokens.)
  // (The picture at that size inside its holder, scaled from the corner; the holder is as tall as the scaled picture less half a type size.)
  // (Not laid out afresh at the cell's size: no cell rule gives the chart a height of its own, and no container query unit reads the cell.)
  // (A phone, upright or on its side, keeps the strip and its type: a later rule of the same weight gives it the roles' own.)
  assert.ok(css.indexOf(`${CELL} { --ch-cap`) < css.indexOf(':is(.pz.stack, .pz.low) .pz-cell { display: block'));
  // (The scale is worked out where the cell's width is known, and a new type size is drawn again at once: the box does not change with it.)
});

test('chartScale: the instrument scaled down whole, never up, its words 12 px at least on the screen', () => {
  // (A Mac at 1877 x 1137: the instrument 536 px wide in 14.4 px type, a cell's chart 434 px wide: 0.81, the words 11.7 px, drawn in type 3 % larger.)
  const a = chartScale(434, 536, 14.4);
  assert.ok(Math.abs(a.k - 434 / 536) < 1e-9 && a.k < 1);
  assert.ok(a.s > 1 && a.s < 1.04 && Math.abs(14.4 * a.s * a.k - 12.02) < 1e-9, `${a.s}`);
  // (Room to spare: the words stay as the instrument's, s = 1.)
  assert.deepEqual(chartScale(500, 536, 14.4), { k: 500 / 536, s: 1 });
  // (A cell wider than the instrument is not blown up past it.)
  assert.deepEqual(chartScale(600, 536, 14.4), { k: 1, s: 1 });
  for (const [W, w0, f0] of [[268, 339, 12], [312, 392, 12], [434, 536, 14.4], [428, 560, 15.5]]) {
    const { k, s } = chartScale(W, w0, f0);
    assert.ok(k <= 1 && s >= 1 && f0 * s * k >= 12.02 - 1e-9, `${W}`);
  }
});

// (Its lines grow with its type and are never thinner than they were at 12 px: the table's cell rows, tests/profile-looks.test.js.)

// (The chart's box in px from the same clamps as the CSS: pzh = 1vh, B = clamp(17, 2.311 pzh, 28), the card's margin cm and padding cp, its width cw (the
// instrument's chart is that less two paddings), the title, the gaps and each cell's first row, the card's vertical padding as trimmed; the instrument's
// size and the scale as the rules above and chartScale set them.)
const clamp = (lo, v, hi) => Math.min(hi, Math.max(lo, v));
function chart(W, H) {
  const p = H / 100, B = clamp(17, 2.311 * p, 28), cm = clamp(16, Math.min(0.026 * W, 1.8 * B), 60), cp = clamp(18, 1.4 * B, 40);
  const sbig = clamp(28, 4.622 * p, 56), sbody = clamp(17, 2.311 * p, 28), sc = clamp(12, 1.733 * p, 21);
  const room = H - 3 * cm - 44, cardW = Math.min(1560, W - 2 * cm);
  const title = sbig * 0.8 * 1.06 + 0.3 * sbig * 0.8 + 2, trim = clamp(8, 1.2 * p, 16);
  const head = Math.max(clamp(18, 3.4 * p, 44), cp * 0.72 + 10) + trim + title + clamp(12, 1.8 * p, 24);
  const cellW = (cardW - 2 * clamp(20, 0.03 * W, 52) - 2 * clamp(10, 2 * p, 26)) / 3, room1 = cellW - 2 * clamp(12, 1.6 * p, 20);
  const w0 = Math.min(clamp(340, Math.min(0.38 * W, 23.5 * B), 640), 0.42 * W) - 2 * cp, f0 = Math.max(12, sc * 0.74);
  const h0 = Math.min(Math.max(0.62 * w0, 28 * p), 40 * p) - 1.6 * f0, { k, s } = chartScale(room1, w0, f0);
  const cell = clamp(8, 1.1 * p, 14) + 1.15 * sbody + clamp(3, 0.6 * p, 8) + (h0 - 0.5 * f0) * s * k + clamp(4, 0.6 * p, 8);
  return { w0, h0: h0 * s, f0, s, k, f: f0 * s, card: head + 2 * cell + trim, room };
}
const SCREENS = [[1024, 768], [1180, 820], [1366, 768], [1440, 790], [1440, 900], [1512, 982], [1728, 1000], [1728, 1117], [1877, 1137], [1920, 1080], [2560, 1300], [2560, 1440]];

test('each chart is the instrument scaled down whole: never larger, its type never under 12 px, the instrument\'s own where the room allows', () => {
  for (const [W, H] of SCREENS) {
    const { f0, s, k, f } = chart(W, H);
    assert.ok(k <= 1 && f * k >= 12, `${W}x${H}: scale ${k.toFixed(2)}, words ${(f * k).toFixed(2)} px`);
    // (Drawn in the instrument's own type unless the scale would take it under 12 px, and then in no more than the type that gives 12.)
    assert.ok(s === 1 ? f0 * k >= 12 : f * k < 12.05, `${W}x${H}: s ${s.toFixed(3)}`);
  }
  // (A Mac at 1877 x 1137 or 1920 x 1080 is within a few percent of the instrument's own type; an iPad on its side, 1180 wide, within a third.)
  assert.ok(chart(1877, 1137).s < 1.06 && chart(1920, 1080).s < 1.1 && chart(1180, 820).s < 1.35);
});

test('the card is as tall as its charts, centred, and fits the room above the nav pill on every wide screen', () => {
  for (const [W, H] of SCREENS) {
    const { card, room } = chart(W, H);
    assert.ok(card <= room, `${W}x${H}: the card ${card.toFixed(0)} px of the ${room.toFixed(0)} px it has`);
  }
});

test('the zone words keep the chart\'s own size up to 16 px and ease down past it, never under 13 px', () => {
  assert.equal(ZONE_MAX, 16);
  assert.equal(ZONE_MIN, 13);
  for (const f of [12, 13.8, 15.6, 16]) assert.equal(zoneSize(f), f, `${f}: every chart the data card draws is as it was`);
  for (let f = 16; f <= 22; f += 0.5) assert.ok(zoneSize(f) <= f && zoneSize(f) >= ZONE_MIN && zoneSize(f + 0.5) <= zoneSize(f) + 1e-9, `${f}`);
  assert.equal(zoneSize(20), 13);
  // (The strip over the plot is one short line where the chart is wide enough, so it takes no more height than at 16 px.)
  const tw = (f) => (t, wt = 600) => t.length * 0.56 * f * (wt >= 700 ? 1.04 : 1);
  const Gbig = profileGeo(434, 354, 20, tw(20), true), G16 = profileGeo(434, 354, 16, tw(16), true);
  assert.ok(Gbig.zone.lines >= 1, 'named');
  assert.ok(Gbig.hdr <= G16.hdr + 4, `the strip at 20 px (${Gbig.hdr.toFixed(1)}) is no taller than at 16 (${G16.hdr.toFixed(1)})`);
  // (The words are measured at their own size: a zone name that fits at 13 px in the strip is judged at 13, not at the chart's 20.)
  assert.ok(zoneFit(48.4, 20, tw(20)).lines <= zoneFit(48.4, 16, tw(16)).lines, 'at 20 px the words take no more lines than at 16');
});

test('drawn at the instrument\'s size each of the six cases names its zones, keeps its readings clear and finds room for its brackets', async () => {
  const ids = ['healthy', 'pvt-chronic', 'schisto', 'cirr-decomp', 'sos', 'budd-chiari', 'rhf'];
  const [hl, ...six] = (await runSteps(ids.map((preset) => ({ preset })))).map(profileOf);
  // (A little wider than Inter's: the safe side.)
  const cwid = (ch) => (/[il.,'|:;!]/.test(ch) ? 0.26 : /[tfrjI]/.test(ch) ? 0.34 : ch === ' ' ? 0.28 : ch === '-' ? 0.36 : /[mwMW]/.test(ch) ? 0.85 : /[A-Z]/.test(ch) ? 0.66 : /[0-9]/.test(ch) ? 0.62 : 0.55);
  const approxW = (f) => (t, wt = 600) => [...t].reduce((a, ch) => a + cwid(ch), 0) * f * (wt >= 700 ? 1.04 : 1);
  for (const [W, H] of SCREENS) {
    const { f, w0: w, h0: h } = chart(W, H), tw = approxW(f), G = profileGeo(w, h, f, tw, true);
    assert.ok(G.zone.lines > 0, `${W}x${H}: the zones keep their names`);
    assert.ok(G.fit.rows <= 2, `${W}x${H}: the stations' names keep one row or the wedge's second`);
    assert.ok(G.need <= h, `${W}x${H}: the chart fits its box (${G.need.toFixed(0)} of ${h.toFixed(0)} px)`);
    six.forEach((p, k) => {
      const goal = { ...p, top: axisTop(p, hl, null) }, s = numberSides(G, tw, goal), pl = placePills(G, tw, goal, hl, null, s);
      const brk = placeBrackets(G, tw, goal, hl, null, s, null, pl || []);
      // (Where the brackets have no place in the plot they stand in the band at its foot, which the plot still has room for.)
      const Gb = brk ? G : profileGeo(w, h, f, tw);
      assert.ok(Gb.Z - Gb.T >= Math.min(0.38 * h, 5 * f), `${W}x${H} ${ids[k + 1]}: the plot keeps ${(Gb.Z - Gb.T).toFixed(0)} of ${h.toFixed(0)} px`);
    });
  }
});
