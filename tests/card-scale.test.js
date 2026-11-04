// card-scale.js mirrors the stylesheet's card type scale (WP3): pinned here at the sample windows the plan names (vh 900/700/430, ts 1/1.4, each layout).
import test from 'node:test';
import assert from 'node:assert/strict';
import { cardScale, pzh } from '../src/ui/card-scale.js';

const near = (a, b, m = '') => assert.ok(Math.abs(a - b) < 0.01, `${m} ${a} vs ${b}`);

test('a laptop at 900 px: the roles of the comment at app.css:1873', () => {
  const s = cardScale({ vw: 1440, vh: 900, part: 'panel' });
  near(s.cap, 15.597, 'cap'); near(s.lab, 18.198, 'lab'); near(s.body, 20.799, 'body'); near(s.val, 28.602, 'val'); near(s.big, 41.598, 'big'); near(s.title, 57.204, 'title');
});
test('floors and ceilings', () => {
  near(cardScale({ vw: 800, vh: 430, part: 'data' }).cap, 12); near(cardScale({ vw: 800, vh: 430, part: 'data' }).title, 32);
  near(cardScale({ vw: 3000, vh: 2000, part: 'panel' }).title, 77); near(cardScale({ vw: 3000, vh: 2000, part: 'panel' }).cap, 21);
});
test('the text size setting multiplies', () => {
  const a = cardScale({ vw: 1440, vh: 900, part: 'panel' }), b = cardScale({ vw: 1440, vh: 900, part: 'panel', ts: 1.4 });
  near(b.body, a.body * 1.4); near(b.cap, a.cap * 1.4);
});
test('an upright tablet follows the width', () => {
  near(pzh(820, 1180), 6.15); near(pzh(1440, 900), 9); near(pzh(600, 900), 9);
});
test('the words in a floating card: steps, a 12 px floor, a shorter title', () => {
  const s = cardScale({ vw: 1440, vh: 900, part: 'text', card: true, bk: 0.9, tk: 0.9 });
  near(s.body, 20.799 * 0.9); near(s.title, 49.914 * 0.9); near(cardScale({ vw: 800, vh: 430, part: 'text', card: true, bk: 0.5 }).cap, 12);
});
test('a phone upright: the roles times 1.45 on the words, plain on a table, 1.15 on a data card', () => {
  const t = cardScale({ vw: 390, vh: 844, layout: 'stack', part: 'text' }), tb = cardScale({ vw: 390, vh: 844, layout: 'stack', part: 'table' }), d = cardScale({ vw: 390, vh: 844, layout: 'stack', part: 'data' });
  near(t.body, 14 * 1.45); near(t.title, 28 * 1.45); near(tb.body, 14); near(d.cap, 12 * 1.15); near(d.lab, 12 * 1.15); near(d.body, 14);
});
test('an upright iPad: 1.39 and 1.3', () => {
  near(cardScale({ vw: 820, vh: 1180, layout: 'tab', part: 'text' }).body, 14.0 + (820 - 390) * 0.00392 > 16 ? 16 * 1.39 : (14 + 430 * 0.00392) * 1.39);
  near(cardScale({ vw: 820, vh: 1180, layout: 'tab', part: 'data' }).cap, 12 * 1.3);
});
test('a phone on its side: the words and panel at 1.3', () => {
  const s = cardScale({ vw: 844, vh: 390, part: 'panel' }), w = cardScale({ vw: 844, vh: 390, part: 'data' });
  near(s.cap, 12 * 1.3); near(w.cap, 12);
});
test('the compact layout under 860 px tall: the stacked roles, label 12 px or more', () => {
  const s = cardScale({ vw: 1180, vh: 820, layout: 'short', part: 'data' });
  near(s.cap, 12); near(s.lab, 12 + 430 * 0.00392); near(s.body, 14 + 430 * 0.00392); near(s.val, 16 + 430 * 0.01176); near(s.title, 6.356 * 8.2);
});
test('derived sizes: the small size, the number, the chart caption, the instrument sizes', () => {
  const s = cardScale({ vw: 1440, vh: 900, part: 'data' });
  near(s.sm, 12); near(s.num, 28.602 * 1.08); near(s.fs12, 15.597); near(s.fs14, 15.597 * 1.12);
  near(cardScale({ vw: 1440, vh: 900, part: 'data', dk: 0.5 }).fs12, 23);
  near(cardScale({ vw: 800, vh: 430, part: 'cell' }).chCap, 12); near(cardScale({ vw: 1440, vh: 900, part: 'cell' }).chLab, 18);
});
test('the same input is the same object', () => {
  assert.equal(cardScale({ vw: 1440, vh: 900 }), cardScale({ vw: 1440.2, vh: 900.1 }));
});
