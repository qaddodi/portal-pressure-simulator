// The belly's daily balance must never flash (Mohammad, 19 Oct: "it still flashes on and off when it changes the number").
// The old line dipped to 15% opacity for 0.16 s on every new value. Now the same nodes stay mounted and only their words
// change, in place: no class, style, visibility or child list is touched between values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { balanceHold, balanceLine } from '../src/ui/balance-hold.js';

// A minimal element that records every write that could hide, fade or re-create it.
function fakeEl() {
  const writes = [];
  const el = { writes, dataset: {}, _t: '', hidden: false, style: {}, children: [] };
  Object.defineProperty(el, 'textContent', { get: () => el._t, set: (v) => { writes.push(['text', v]); el._t = String(v); } });
  el.classList = { add: (c) => writes.push(['class+', c]), remove: (c) => writes.push(['class-', c]), toggle: (c) => writes.push(['class~', c]) };
  return el;
}

test('a run of balance changes rewrites the words in place and never hides, fades or re-creates the line', () => {
  const line = fakeEl(), arrow = fakeEl(), text = fakeEl();
  line.children.push(arrow, text);
  const kids = [...line.children];
  const show = balanceLine(line, arrow, text);
  const label = (b) => (b === 0 ? ['steady', '', 'Steady'] : b > 0 ? ['up', '▲', `${b} mL/day`] : ['down', '▼', `${-b} mL/day`]);
  const hold = balanceHold();
  const seen = [];
  // 60 s at 60 frames a second: a rate that climbs, crosses zero and falls (the arrow flips through Steady).
  for (let f = 0; f <= 3600; f++) {
    const t = f * 1000 / 60, b = hold.step(600 * Math.sin(t / 9000), t);
    if (b == null) continue;
    show(...label(b));
    seen.push(b);
    // Right after every change the line already shows the new value, whole: nothing waits on a timer.
    const [dir, a, words] = label(b);
    assert.equal(line.dataset.dir, dir); assert.equal(arrow.textContent, a); assert.equal(text.textContent, words);
  }
  assert.ok(seen.length >= 6 && seen.some((b) => b > 0) && seen.some((b) => b < 0) && seen.includes(0), `values ${seen}`);
  for (const el of [line, arrow, text]) {
    assert.deepEqual(el.writes.filter(([k]) => k !== 'text'), [], 'no class toggled (no dip or fade)');
    assert.equal(el.hidden, false); assert.deepEqual(el.style, {});
  }
  assert.deepEqual(line.children, kids, 'the same nodes stay mounted');
  assert.equal(line.writes.length, 0, 'the line itself is never emptied or rewritten');
  // Only real changes are written: no blank in between (a blank would read as the line going off).
  assert.ok(text.writes.every(([, v]) => v !== ''), 'the words are never blanked');
  assert.ok(text.writes.length <= seen.length);
});

test('the belly paints the balance through balanceLine, with no fade class or timer', () => {
  const js = readFileSync(new URL('../src/ui/instruments.js', import.meta.url), 'utf8');
  assert.match(js, /showRate = balanceLine\(rateEl, rateArrow, rateTxt\)/);
  assert.match(js, /if \(b != null\) showRate\(\.\.\.rateLabel\(b\)\);/);
  assert.doesNotMatch(js, /ab-rate-out|rateTimer/);
});
