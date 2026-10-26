// The six ladders' charts on a wide screen, larger inside their cells (Mohammad, 26 Oct: "keep what it was before but each individual card graph
// should be bigger; like bigger lines/text, not the card itself bigger"). Sites 10 and Where-resistance 14 share the card (`.pz-panel.fill`), which
// keeps its size, its padding and its 1560 px cap; each chart is lettered larger where its cell has the room, and its lines grow with its type.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { profileOf, profileGeo, axisTop, numberSides, placePills, placeBrackets } from '../src/ui/tool-profile.js';
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

test('a chart is lettered at the data card\'s chart size at least, larger by its cell\'s width, held by its height and at 20 px', () => {
  const r = rule(CELL);
  assert.match(r, /--ch-cap: max\(12px, calc\(var\(--s-cap\) \* \.74\), min\(3\.8cqi, calc\(2\.1 \* var\(--pzh\) - 6\.4px\), 20px\)\);/);
  // (The chart is the cell's child, so its cqi finds the cell as its container: the cell's own rule makes it one.)
  assert.match(css, /\.pz-cell \{ container-type: inline-size; \}/);
  assert.match(css, /\.pz-cell > \.pz-prof \{ flex: 1 1 0; min-height: 0; height: auto; font-size: var\(--ch-cap, 12px\); \}/);
  // (A phone, upright or on its side, keeps the strip and its type: a later rule of the same weight gives it the roles' own.)
  assert.match(css, /:is\(\.pz\.stack, \.pz\.low\) \.pz-cell \{[^}]*--ch-cap: var\(--s-cap\);/);
  assert.ok(css.indexOf(`${CELL} { --ch-cap`) < css.indexOf(':is(.pz.stack, .pz.low) .pz-cell { display: block'));
});

test('its lines grow with its type and are never thinner than they were at 12 px', () => {
  for (const [sel, w] of [['.ppf-line', 'max\\(3px, \\.24em\\)'], [':is(.ppf-hl, .ppf-bf)', 'max\\(1\\.75px, \\.14em\\)'], [':is(.ppf-br path, .ppf-brace path)', 'max\\(1\\.5px, \\.11em\\)'], [':is(.ppf-axis, .ptk-grid line)', 'max\\(1px, \\.075em\\)']]) {
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
// the gaps and each cell's first row; the type as the rule above sets it.)
const clamp = (lo, v, hi) => Math.min(hi, Math.max(lo, v));
function chart(W, H) {
  const p = H / 100, B = clamp(17, 2.311 * p, 28), cm = clamp(16, Math.min(0.026 * W, 1.8 * B), 60), cp = clamp(18, 1.4 * B, 40);
  const sbig = clamp(28, 4.622 * p, 56), sbody = clamp(17, 2.311 * p, 28), sc = clamp(12, 1.733 * p, 21);
  const cardH = H - 3 * cm - 44, cardW = Math.min(1560, W - 2 * cm);
  const title = sbig * 0.8 * 1.06 + 0.3 * sbig * 0.8 + 2, head = Math.max(clamp(18, 3.4 * p, 44), cp * 0.72 + 10) + clamp(12, 2.4 * p, 32) + title + clamp(18, 3.4 * p, 44);
  const cellH = (cardH - head - clamp(10, 2 * p, 26)) / 2, cellW = (cardW - 2 * clamp(20, 0.03 * W, 52) - 2 * clamp(10, 2 * p, 26)) / 3;
  const f0 = Math.max(12, sc * 0.74), f = Math.max(f0, Math.min(0.038 * (cellW - 2 * clamp(12, 1.6 * p, 20)), 2.1 * p - 6.4, 20));
  const h = cellH - clamp(10, 1.6 * p, 20) - clamp(4, 0.6 * p, 8) - 1.15 * sbody - clamp(4, 0.8 * p, 10) + 0.5 * f0;
  return { f0, f, w: cellW - 2 * clamp(12, 1.6 * p, 20), h };
}
const SCREENS = [[1180, 820], [1366, 768], [1440, 790], [1440, 900], [1512, 982], [1728, 1000], [1728, 1117], [1877, 1137], [1920, 1080], [2560, 1300], [2560, 1440]];

test('the type is never smaller than before, never over 20 px, and grows where the cell has the width and the height', () => {
  for (const [W, H] of SCREENS) {
    const { f0, f } = chart(W, H);
    assert.ok(f >= f0 && f <= 20, `${W}x${H}: ${f0.toFixed(1)} -> ${f.toFixed(1)}`);
  }
  // (A Mac at 1877 x 1137: from about 14.6 to 16.5 px, lines 3 px to 4.)
  const mac = chart(1877, 1137);
  assert.ok(mac.f >= 1.1 * mac.f0 && mac.f >= 16, `${mac.f0.toFixed(1)} -> ${mac.f.toFixed(1)}`);
  // (A short window, or an iPad on its side, whose cells have no room to spare, keep the type they had.)
  assert.equal(chart(1180, 820).f, chart(1180, 820).f0);
  assert.equal(chart(1366, 768).f, chart(1366, 768).f0);
});

test('at the larger type each of the six cases still names its zones, keeps its two pills and finds room for its brackets', async () => {
  const ids = ['healthy', 'pvt-chronic', 'schisto', 'cirr-decomp', 'sos', 'budd-chiari', 'rhf'];
  const [hl, ...six] = (await runSteps(ids.map((preset) => ({ preset })))).map(profileOf);
  const approxW = (f) => (t, wt = 600) => t.length * 0.58 * f * (wt >= 700 ? 1.04 : 1);   // (wider than Inter's: the safe side)
  for (const [W, H] of SCREENS) {
    const { f, w, h } = chart(W, H), tw = approxW(f), G = profileGeo(w, h, f, tw, true);
    assert.ok(G.zone.lines > 0, `${W}x${H}: the zones keep their names`);
    assert.ok(G.need <= h, `${W}x${H}: the chart fits its box (${G.need.toFixed(0)} of ${h.toFixed(0)} px)`);
    six.forEach((p, k) => {
      const goal = { ...p, top: axisTop(p, hl, null) }, s = numberSides(G, tw, goal), pl = placePills(G, tw, goal, hl, null, s);
      const brk = placeBrackets(G, tw, goal, hl, null, s, null, pl || []);
      // (Where the brackets have no place in the plot they stand in the band at its foot, which the plot still has room for.)
      const Gb = brk ? G : profileGeo(w, h, f, tw);
      assert.ok(Gb.Z - Gb.T >= 0.4 * h, `${W}x${H} ${ids[k + 1]}: the plot keeps ${(Gb.Z - Gb.T).toFixed(0)} of ${h.toFixed(0)} px`);
      if (f > chart(W, H).f0 + 0.5) assert.ok(pl, `${W}x${H} ${ids[k + 1]}: both pills have a place`);
    });
  }
});
