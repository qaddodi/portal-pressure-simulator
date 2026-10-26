// The six ladders' charts on a wide screen, larger inside their cells (Mohammad, 26 Oct: "keep what it was before but each individual card graph
// should be bigger; like bigger lines/text, not the card itself bigger"). Sites 10 and Where-resistance 14 share the card (`.pz-panel.fill`), which
// keeps its size, its padding and its 1560 px cap; each chart is lettered larger where its cell has the room, and its lines grow with its type.
// (Mohammad, 26 Oct, a second time: "i want larger text size on it ... bigger size text etc": about 20 px on a 1877 x 1137 Mac, a larger floor on a
// laptop and an iPad on its side; the room comes from the card's own vertical padding and from the zone words, never from the card or the type.)
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { profileOf, profileGeo, axisTop, numberSides, placePills, placeBrackets, zoneSize, zoneFit, ZONE_MAX, ZONE_MIN } from '../src/ui/tool-profile.js';
import { runSteps } from './deck-states.js';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const CELL = '.pz:not(.stack) .pz-cell';
const rule = (sel) => css.match(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';

test('the card keeps its size, its padding and its 1560 px cap', () => {
  assert.match(css, /\.pz:not\(\.stack\) \.pz-panel \{ width: min\(1560px, calc\(100% - 2 \* var\(--pz-cm\)\)\);/);
  assert.match(css, /\.pz:not\(\.stack\) \.pz-panel\.fill \{ height: calc\(100% - 3 \* var\(--pz-cm\) - 44px\); \}/);
  assert.match(css, /\.pz-panel \{ position: absolute;[^}]*padding: clamp\(18px, calc\(3\.4 \* var\(--pzh\)\), 44px\) clamp\(20px, 3vw, 52px\);/);
  assert.match(css, /\.pz-grid \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); gap: clamp\(10px, calc\(2 \* var\(--pzh\)\), 26px\); \}/);
  assert.doesNotMatch(css, /\.pz-panel\.fill[^{]*\{[^}]*220 \* var\(--pzh\)/);
});

test('the card gives its charts back its own vertical padding, in height only', () => {
  const PANEL = '.pz:not(.stack):not(.low) .pz-panel.fill';
  assert.match(rule(PANEL), /gap: clamp\(8px, calc\(1\.2 \* var\(--pzh\)\), 16px\); padding-bottom: clamp\(12px, calc\(1\.8 \* var\(--pzh\)\), 24px\);/);
  assert.doesNotMatch(rule(PANEL), /width|padding-inline|padding-top/);
  assert.match(rule(`${PANEL} .pz-grid`), /^ row-gap: clamp\(8px, calc\(1\.2 \* var\(--pzh\)\), 16px\); $/);
  assert.match(rule(`${PANEL} .pz-cell`), /padding-top: clamp\(8px, calc\(1\.1 \* var\(--pzh\)\), 14px\); gap: clamp\(3px, calc\(\.6 \* var\(--pzh\)\), 8px\);/);
  // (A phone keeps its own rules: none of these reaches .stack or .low.)
  assert.doesNotMatch(css, /\.pz\.(?:stack|low)[^{]*\.pz-panel\.fill[^{]*\{[^}]*clamp\(8px, calc\(1\.2/);
});

test('a chart is lettered at the data card\'s chart size at least, larger by its cell\'s width, held by its height and at 20 px', () => {
  const r = rule(CELL);
  assert.match(r, /--ch-cap: max\(12px, calc\(var\(--s-cap\) \* \.74\), min\(4\.5cqi, calc\(1\.86 \* var\(--pzh\) - 1\.2px\), 20px\)\);/);
  // (The chart is the cell's child, so its cqi finds the cell as its container: the cell's own rule makes it one.)
  assert.match(css, /\.pz-cell \{ container-type: inline-size; \}/);
  assert.match(css, /\.pz-cell > \.pz-prof \{ flex: 1 1 0; min-height: 0; height: auto; font-size: var\(--ch-cap, 12px\); \}/);
  // (A phone, upright or on its side, keeps the strip and its type: a later rule of the same weight gives it the roles' own.)
  assert.match(css, /:is\(\.pz\.stack, \.pz\.low\) \.pz-cell \{[^}]*--ch-cap: var\(--s-cap\);/);
  assert.ok(css.indexOf(`${CELL} { --ch-cap`) < css.indexOf(':is(.pz.stack, .pz.low) .pz-cell { display: block'));
});

test('its lines grow with its type and are never thinner than they were at 12 px', () => {
  for (const [sel, w] of [['.ppf-line', 'max\\(3px, \\.2em\\)'], [':is(.ppf-hl, .ppf-bf)', 'max\\(1\\.75px, \\.14em\\)'], [':is(.ppf-br path, .ppf-brace path)', 'max\\(1\\.5px, \\.11em\\)'], [':is(.ppf-axis, .ptk-grid line)', 'max\\(1px, \\.075em\\)']]) {
    assert.match(rule(`${CELL} ${sel}`), new RegExp(`stroke-width: ${w};`), sel);
  }
  assert.match(rule(`${CELL} .ppf-hl`), /stroke-dasharray: max\(4px, \.33em\) max\(5px, \.42em\);/);
  assert.match(rule(`${CELL} .ppf-bf`), /stroke-dasharray: max\(1\.5px, \.125em\) max\(4\.5px, \.375em\);/);
  // (The halos behind the numbers stay 4 px: the chart's label placing counts 2 px of halo.)
  assert.match(css, /\.ppf-v \{[^}]*stroke-width: 4px;/);
  assert.doesNotMatch(css, /\.pz-cell[^{]*\.ppf-v[^{]*\{/);
  // (The data card's own chart is untouched.)
  assert.match(css, /\.ppf-line \{ fill: none; stroke-width: 3; /);
  assert.match(css, /\.ppf-axis \{ stroke: var\(--axis\); stroke-width: 1; \}/);
});

// (The chart's box in px from the same clamps as the CSS: pzh = 1vh, B = clamp(17, 2.311 pzh, 28), the card's margin cm, its padding, the title,
// the gaps and each cell's first row, the card's vertical padding as trimmed; the type as the rule above sets it.)
const clamp = (lo, v, hi) => Math.min(hi, Math.max(lo, v));
function chart(W, H) {
  const p = H / 100, B = clamp(17, 2.311 * p, 28), cm = clamp(16, Math.min(0.026 * W, 1.8 * B), 60), cp = clamp(18, 1.4 * B, 40);
  const sbig = clamp(28, 4.622 * p, 56), sbody = clamp(17, 2.311 * p, 28), sc = clamp(12, 1.733 * p, 21);
  const cardH = H - 3 * cm - 44, cardW = Math.min(1560, W - 2 * cm);
  const title = sbig * 0.8 * 1.06 + 0.3 * sbig * 0.8 + 2, trim = clamp(8, 1.2 * p, 16);
  const head = Math.max(clamp(18, 3.4 * p, 44), cp * 0.72 + 10) + trim + title + clamp(12, 1.8 * p, 24);
  const cellH = (cardH - head - trim) / 2, cellW = (cardW - 2 * clamp(20, 0.03 * W, 52) - 2 * clamp(10, 2 * p, 26)) / 3;
  const f0 = Math.max(12, sc * 0.74), w = cellW - 2 * clamp(12, 1.6 * p, 20), f = Math.max(f0, Math.min(0.045 * w, 1.86 * p - 1.2, 20));
  const h = cellH - clamp(8, 1.1 * p, 14) - clamp(4, 0.6 * p, 8) - 1.15 * sbody - clamp(3, 0.6 * p, 8) + 0.5 * f0;
  return { f0, f, w, h };
}
const SCREENS = [[1024, 768], [1180, 820], [1366, 768], [1440, 790], [1440, 900], [1512, 982], [1728, 1000], [1728, 1117], [1877, 1137], [1920, 1080], [2560, 1300], [2560, 1440]];

test('the type is never smaller than before, never over 20 px, and clearly larger on a Mac, a laptop and an iPad on its side', () => {
  for (const [W, H] of SCREENS) {
    const { f0, f } = chart(W, H);
    assert.ok(f >= f0 && f <= 20, `${W}x${H}: ${f0.toFixed(1)} -> ${f.toFixed(1)}`);
  }
  // (A Mac at 1877 x 1137: from about 14.6 to 19.5 px, about 20.)
  const mac = chart(1877, 1137);
  assert.ok(mac.f >= 19 && mac.f >= 1.3 * mac.f0, `${mac.f0.toFixed(1)} -> ${mac.f.toFixed(1)}`);
  // (A laptop and an iPad on its side read clearly larger too, where the cell's height and width allow.)
  for (const [W, H, least] of [[1180, 820, 13.5], [1440, 900, 15], [1512, 982, 16.5], [1728, 1000, 17], [1920, 1080, 18]]) {
    const { f0, f } = chart(W, H);
    assert.ok(f >= least && f >= 1.12 * f0, `${W}x${H}: ${f0.toFixed(1)} -> ${f.toFixed(1)}`);
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

test('at the larger type each of the six cases still names its zones, keeps its two pills and finds room for its brackets', async () => {
  const ids = ['healthy', 'pvt-chronic', 'schisto', 'cirr-decomp', 'sos', 'budd-chiari', 'rhf'];
  const [hl, ...six] = (await runSteps(ids.map((preset) => ({ preset })))).map(profileOf);
  // (A little wider than Inter's: the safe side.)
  const cwid = (ch) => (/[il.,'|:;!]/.test(ch) ? 0.26 : /[tfrjI]/.test(ch) ? 0.34 : ch === ' ' ? 0.28 : ch === '-' ? 0.36 : /[mwMW]/.test(ch) ? 0.85 : /[A-Z]/.test(ch) ? 0.66 : /[0-9]/.test(ch) ? 0.62 : 0.55);
  const approxW = (f) => (t, wt = 600) => [...t].reduce((a, ch) => a + cwid(ch), 0) * f * (wt >= 700 ? 1.04 : 1);
  for (const [W, H] of SCREENS) {
    const { f, w, h } = chart(W, H), tw = approxW(f), G = profileGeo(w, h, f, tw, true);
    assert.ok(G.zone.lines > 0, `${W}x${H}: the zones keep their names`);
    assert.ok(G.fit.rows <= 2, `${W}x${H}: the stations' names keep one row or the wedge's second`);
    assert.ok(G.need <= h, `${W}x${H}: the chart fits its box (${G.need.toFixed(0)} of ${h.toFixed(0)} px)`);
    six.forEach((p, k) => {
      const goal = { ...p, top: axisTop(p, hl, null) }, s = numberSides(G, tw, goal), pl = placePills(G, tw, goal, hl, null, s);
      const brk = placeBrackets(G, tw, goal, hl, null, s, null, pl || []);
      // (Where the brackets have no place in the plot they stand in the band at its foot, which the plot still has room for.)
      const Gb = brk ? G : profileGeo(w, h, f, tw);
      assert.ok(Gb.Z - Gb.T >= 0.38 * h, `${W}x${H} ${ids[k + 1]}: the plot keeps ${(Gb.Z - Gb.T).toFixed(0)} of ${h.toFixed(0)} px`);
      if (f > chart(W, H).f0 + 0.5) assert.ok(pl, `${W}x${H} ${ids[k + 1]}: both pills have a place`);
    });
  }
});
