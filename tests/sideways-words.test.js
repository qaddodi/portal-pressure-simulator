import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDE, COMPACT, SIDEWAYS_MAX_H, SIDEWAYS_WORDS, WORDS_MIN_PX, sidewaysWords } from '../src/ui/card-type.js';

// A phone held sideways (844 x 390) takes the Mac and iPad landscape layout: the words' card stacked over the data card at the left.
// For a slide whose data card cannot fit at full size (the Doppler, "The hepatic veins pulse with the right atrium"), the words' card
// used to step down through SIDEWAYS_WORDS and then jump back up to Compact, leaving the data card about 126 px of 390 and its spectrum
// a strip. Now the words stay at the last step that keeps 12 px, so the data card keeps the room. The cards' layout is measured in a
// browser; this pins the sizes each step gives (the wide card's sums: styles/app.css .pz-card --s-title, --s-body, --s-lab, with
// --pk 1.3 on a screen 500 px tall or less) and the rule that picks the step.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const px = (H, tk, bk) => {   // (--pzh is 1vh; with the CAUSES line gone the title takes at most WIDE.tight)
  const pzh = H / 100, pk = H <= SIDEWAYS_MAX_H ? 1.3 : 1;
  return {
    title: clamp(5.546 * pzh, 32, 67) * pk * Math.min(tk, WIDE.tight),
    body: clamp(2.311 * pzh, 17, 28) * pk * bk,
    buttons: clamp(2.022 * pzh, 14, 24.5) * pk * bk,
  };
};
const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, +v.toFixed(1)]));

test('844 x 390: the sizes each step gives', () => {
  const at = (i) => px(390, ...SIDEWAYS_WORDS[i]);
  // Compact, where the old fallback left the words (the card two thirds of the screen): a 25.8 px title over a 19.4 px body.
  assert.deepEqual(round(px(390, WIDE.title, WIDE.words)), { title: 25.8, body: 19.4, buttons: 16 });
  assert.deepEqual(SIDEWAYS_WORDS.map((_, i) => +at(i).body.toFixed(1)), [17.7, 15.9, 14.1, 12.8]);
  assert.deepEqual(SIDEWAYS_WORDS.map((_, i) => +at(i).title.toFixed(1)), [25.8, 24.1, 22.5, 20.8]);
  for (let i = 0; i < SIDEWAYS_WORDS.length; i++) {
    assert.ok(at(i).body >= WORDS_MIN_PX, `step ${i}: body ${at(i).body.toFixed(1)} px under 12`);
    assert.ok(at(i).title > at(i).body * 1.15, `step ${i}: title not well above the words`);
    if (i) assert.ok(SIDEWAYS_WORDS[i][0] <= SIDEWAYS_WORDS[i - 1][0] && SIDEWAYS_WORDS[i][1] < SIDEWAYS_WORDS[i - 1][1], 'every step is smaller');
  }
  assert.ok(SIDEWAYS_WORDS[0][1] < WIDE.words, 'the first step is already below Compact');
  // The buttons' row (14 px labels) is under 12 px from the third step: why a step is kept only while the smallest lettering says 12 px.
  assert.deepEqual(SIDEWAYS_WORDS.map((_, i) => at(i).buttons >= WORDS_MIN_PX), [true, true, false, false]);
});

// A fake layout: the pair fits from step `fitAt` (index) on (-1: never); the smallest lettering is `floorAt` steps in (-1: always 12 px or more).
const run = (fitAt, gateAt = -1) => {
  const put = []; let cur = -1;
  const out = sidewaysWords(
    (tk, bk) => { cur = SIDEWAYS_WORDS.findIndex(([a, b]) => a === tk && b === bk); put.push(cur); return fitAt >= 0 && cur >= fitAt; },
    () => (gateAt >= 0 && cur >= gateAt ? 11 : 12.8));
  return { ...out, put, cur };
};

test('the words stop at the first step the pair fits', () => {
  const r = run(1);
  assert.equal(r.below, true); assert.deepEqual(r.last, SIDEWAYS_WORDS[1]); assert.deepEqual(r.put, [0, 1]);
});

test('where no step fits the pair the words stay at the smallest step, not back at Compact', () => {
  const r = run(-1);
  assert.equal(r.below, false); assert.deepEqual(r.last, SIDEWAYS_WORDS[3]); assert.deepEqual(r.put, [0, 1, 2, 3]); assert.equal(r.cur, 3);
});

test('a step under 12 px is not kept: the words return to the step before it', () => {
  const r = run(-1, 2);   // (the buttons' row falls under 12 px at the third step)
  assert.equal(r.below, false); assert.deepEqual(r.last, SIDEWAYS_WORDS[1]); assert.deepEqual(r.put, [0, 1, 2, 1]); assert.equal(r.cur, 1);
  // (not even the first: nothing kept, the caller sets Compact)
  assert.equal(run(-1, 0).last, null);
});

test('390 x 844, 1180 x 820 and 1440 x 900 never take the sideways steps and keep their sizes', () => {
  assert.deepEqual([WIDE.title, WIDE.words, WIDE.tight, COMPACT, SIDEWAYS_MAX_H], [0.8, 0.88, 0.62, 0.8, 500]);
  for (const [w, h] of [[390, 844], [1180, 820], [1440, 900]]) {
    assert.ok(h > SIDEWAYS_MAX_H, `${w}x${h}: not a screen 500 px tall or less`);
    assert.equal(px(h, 1, 1).body, clamp(2.311 * h / 100, 17, 28), `${w}x${h}: no --pk 1.3`);
  }
  assert.deepEqual(round(px(820, WIDE.title, WIDE.words)), { title: 28.2, body: 16.7, buttons: 14.6 });
  assert.deepEqual(round(px(900, WIDE.title, WIDE.words)), { title: 30.9, body: 18.3, buttons: 16 });
});
