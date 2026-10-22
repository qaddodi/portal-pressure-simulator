import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Codebase review 22 Oct, group 2: per-frame work in the lobule, the sinusoid, the data-card plane and the charts that
// gave the same pixels every time is done once and kept. Each test pins one item.

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('item 38: chart and Doppler strip labels are measured once per font and text, forgotten when the fonts arrive', () => {
  const charts = read('../src/ui/charts.js'), dop = read('../src/ui/doppler.js');
  assert.match(charts, /export const textW = \(ctx, t\) =>/);
  assert.match(charts, /'loadingdone', \(\) => widths\.clear\(\)/);
  // The ladder's tilt and strip searches and the monitor's top strip go through the cache.
  assert.doesNotMatch(charts.slice(charts.indexOf('function geometry'), charts.indexOf('function drawStrip') + 2000), /measureText\(/);
  const strip = dop.slice(dop.indexOf("const label = probe ? probeName"), dop.indexOf("if (waves && meta().kind === 'hepatic')"));
  assert.doesNotMatch(strip, /measureText\(/);
  assert.match(strip, /textW\(ctx, label\)/);
});

test('item 36: the data-card plane skips a redraw whose size, font, points, reading and last dot place are all unchanged', () => {
  const src = read('../src/ui/visual-plane.js');
  const draw = src.slice(src.indexOf('const draw = () => {'), src.indexOf('const kids = [];'));
  assert.match(draw, /if \(key === drawn\) return;/);
  // (The dot's previous place is in the key, so the words still settle once after the dot stops.)
  assert.match(draw, /\$\{sizeWas\}\|\$\{was \?/);
  assert.match(src, /set\(points, r = ring\) \{ pts = points \|\| \[\]; ptsVer\+\+;/);
});
