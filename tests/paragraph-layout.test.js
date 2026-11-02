// Paragraph layout (text-gl.js layoutParagraph): greedy filling at UAX #14 break opportunities, from the font's metrics at the text's
// optical size. The browser comparison is tests/e2e/paragraph-match.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMetrics, layoutParagraph, mayBreak, metricsCover } from '../src/ui/text-gl.js';

test('mayBreak: after spaces and dashes, never inside words, before stops or round no-break spaces', () => {
  assert.equal(mayBreak(' ', 'a'), true);
  assert.equal(mayBreak('a', 'b'), false);
  assert.equal(mayBreak(' ', ','), false);
  assert.equal(mayBreak(' ', 'a'), false);
  assert.equal(mayBreak('a', ' '), false);
  assert.equal(mayBreak('-', 'a'), true);
  assert.equal(mayBreak('-', '5'), false);
  assert.equal(mayBreak('–', '⁠'), false);
});

test('layoutParagraph: lines fill the column, hanging spaces take no width, and a longer column never adds lines', async () => {
  await loadMetrics();
  const text = 'The splenic and superior mesenteric veins join behind the pancreas to form the portal vein, which brings the liver about three quarters of its blood.';
  assert.ok(metricsCover(text));
  const run = { text, weight: 400, size: 17.4 };
  let prev = Infinity;
  for (const w of [200, 260, 320, 400, 600, 2000]) {
    const { lines } = layoutParagraph([run], w);
    for (const l of lines.slice(0, -1)) assert.ok(l.w <= w + 0.01, `line ${l.w} within ${w}`);
    assert.ok(lines.length <= prev); prev = lines.length;
    assert.equal(lines[0].start, 0);
    assert.equal(lines.at(-1).end, text.length);
  }
  assert.equal(layoutParagraph([run], 2000).lines.length, 1);
  // optical size: the same words are narrower at 17 px than at 14 px per em (Inter's opsz axis)
  const at = (size) => layoutParagraph([{ ...run, size }], 1e5).lines[0].w / size;
  assert.ok(at(24) < at(14));
});

test('layoutParagraph: a no-wrap run is never split, a word wider than the column overflows on its own line', async () => {
  await loadMetrics();
  const { lines } = layoutParagraph([{ text: 'alpha ', weight: 400, size: 16 }, { text: '12 mmHg', weight: 600, size: 16, nowrap: true }, { text: ' omega', weight: 400, size: 16 }], 90);
  assert.ok(lines.some((l) => l.runs.some((r) => r.text === '12 mmHg')));
  const wide = layoutParagraph([{ text: 'Supercalifragilistic is', weight: 400, size: 16 }], 40).lines;
  assert.equal(wide.length, 2);
});
