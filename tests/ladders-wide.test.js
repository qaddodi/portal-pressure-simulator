// The six ladders on a wide screen (a laptop, an iPad on its side): the card takes the screen between the one margin at each side and gives
// the charts the room it spent round them (Mohammad, 26 Oct: "this slide could use larger diagrams"). Sites 10 and Where-resistance 14
// share the card (`.pz-panel.fill`); a phone and a tablet held upright keep their own layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const rule = (sel) => css.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';

const PANEL = '.pz:not(.stack):not(.low) .pz-panel.fill';

test('the ladders card has no 1560 px cap on a wide screen, only the one margin at each side', () => {
  const p = rule(PANEL);
  assert.match(p, /width: min\(calc\(100% - 2 \* var\(--pz-cm\)\), calc\(220 \* var\(--pzh\)\)\);/);
  assert.doesNotMatch(p, /1560/);
  // (The cap stays on the base rule for every other full card: they take their own widths below, --pz-rw-*.)
  assert.match(css, /\.pz:not\(\.stack\) \.pz-panel \{ width: min\(1560px, calc\(100% - 2 \* var\(--pz-cm\)\)\);/);
  // (The room for the nav pill under the card is the same as before.)
  assert.match(css, /\.pz:not\(\.stack\) \.pz-panel\.fill \{ height: calc\(100% - 3 \* var\(--pz-cm\) - 44px\); \}/);
});

test('the card, its grid and its cells give the charts their room back, on a wide screen only', () => {
  assert.match(rule(PANEL), /padding-inline: clamp\(14px, 1\.5vw, 28px\); padding-bottom: clamp\(12px, calc\(1\.8 \* var\(--pzh\)\), 24px\); gap: clamp\(8px, calc\(1\.2 \* var\(--pzh\)\), 16px\);/);
  assert.match(rule(`${PANEL} .pz-grid`), /gap: clamp\(8px, calc\(1\.2 \* var\(--pzh\)\), 16px\);/);
  assert.match(rule(`${PANEL} .pz-cell`), /padding-top: clamp\(8px, calc\(1\.1 \* var\(--pzh\)\), 14px\); padding-inline: clamp\(10px, calc\(1\.2 \* var\(--pzh\)\), 16px\); gap: clamp\(3px, calc\(\.6 \* var\(--pzh\)\), 8px\);/);
  // (The title keeps its room under the tab: no padding-top here, the tab's own rule decides it. The foot of the chart keeps its pinned padding.)
  assert.doesNotMatch(rule(PANEL), /padding-top/);
  assert.doesNotMatch(css, /\.pz\.(?:stack|low)[^{]*\.pz-panel\.fill[^{]*\{[^}]*220 \* var\(--pzh\)/);
  assert.match(css, /\.pz:not\(\.stack\):not\(\.low\) \.pz-cell \{ padding-bottom: clamp\(4px, calc\(\.6 \* var\(--pzh\)\), 8px\); \}/);
});

// (The cell's size in px, from the same clamps: pzh = 1vh, cm = clamp(16, min(2.6vw, 1.8 B), 60), B = clamp(17, 2.311 vh, 28).)
const cell = (W, H, wide) => {
  const vh = H / 100, B = Math.min(28, Math.max(17, 2.311 * vh)), cm = Math.min(60, Math.max(16, Math.min(0.026 * W, 1.8 * B)));
  const clamp = (lo, v, hi) => Math.min(hi, Math.max(lo, v));
  const cardW = wide ? Math.min(W - 2 * cm, 220 * vh) : Math.min(1560, W - 2 * cm), cardH = H - 3 * cm - 44;
  const side = wide ? clamp(14, 0.015 * W, 28) : clamp(20, 0.03 * W, 52);
  const gap = wide ? clamp(8, 1.2 * vh, 16) : clamp(10, 2 * vh, 26), inner = wide ? clamp(10, 1.2 * vh, 16) : clamp(12, 1.6 * vh, 20);
  const foot = wide ? clamp(12, 1.8 * vh, 24) : clamp(18, 3.4 * vh, 44), head = wide ? clamp(8, 1.2 * vh, 16) : clamp(12, 2.4 * vh, 32);
  const top = wide ? clamp(8, 1.1 * vh, 14) : clamp(10, 1.6 * vh, 20);
  // (The title's height is the same in both, so it cancels: one 40 px stands for it.)
  const w = (cardW - 2 * side - 2 * gap) / 3 - 2 * inner, h = (cardH - clamp(18, 3.4 * vh, 44) - 40 - head - foot - gap) / 2 - top;
  return { w, h };
};

test('every wide screen gets wider and taller chart cells than before, and none a strip', () => {
  for (const [W, H] of [[1024, 768], [1133, 744], [1180, 820], [1194, 834], [1366, 1024], [1440, 900], [1512, 982], [1728, 1117], [1877, 1137], [1920, 1080], [2560, 1440], [3440, 1440]]) {
    const was = cell(W, H, false), now = cell(W, H, true);
    assert.ok(now.w >= was.w && now.h > was.h, `${W}x${H}: ${was.w.toFixed(0)}x${was.h.toFixed(0)} -> ${now.w.toFixed(0)}x${now.h.toFixed(0)}`);
    assert.ok(now.w / now.h < 2.6, `${W}x${H}: a cell stays a chart, not a strip (${(now.w / now.h).toFixed(2)})`);
  }
  // (A Mac at 1877 x 1137, the screenshot behind the request: the cells were 470 px wide and are about 20% wider.)
  assert.ok(cell(1877, 1137, true).w > 1.15 * cell(1877, 1137, false).w);
});
