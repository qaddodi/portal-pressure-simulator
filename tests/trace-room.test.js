// The catheter monitor in the teaching card must always have room to draw its grid and trace: a card that shrinks its
// words to fit never takes the monitor below the floor, and at that floor the trace area is still tall enough.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { traceRoom, TRACE_MIN, MON_MIN } from '../src/ui/trace-room.js';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('at the monitor box floor the trace area is tall enough, at every width', () => {
  for (const hh of [MON_MIN, 136]) {
    for (let w = 240; w <= 900; w += 20) {
      const { top, bot } = traceRoom(w - 28, hh - 18);
      assert.ok(bot - top >= TRACE_MIN, `box ${w}x${hh}: trace area ${bot - top}px`);
    }
  }
});

test('the card layout never shrinks the monitor box below the floor, and the CSS floor matches', () => {
  const rule = css.match(/\.pz\.pz-card:not\(\.stack\) \.pz-text \.pz-mon \.hvpg-box \{[^}]*\}/)?.[0] || '';
  assert.match(rule, /height: max\(var\(--mon-min, (\d+)px\)/);
  assert.equal(+rule.match(/--mon-min, (\d+)px/)[1], MON_MIN);
  assert.match(css, /\.pz\.stack \.pz-mon \.hvpg-box \{ height: (\d+)px; \}/);
  assert.ok(+css.match(/\.pz\.stack \.pz-mon \.hvpg-box \{ height: (\d+)px; \}/)[1] >= MON_MIN);
});
