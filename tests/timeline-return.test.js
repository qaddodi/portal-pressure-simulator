// 17 Oct, Mohammad: "Time line appearing when cards slide down to disappear should be smoother." On a phone or an upright
// iPad the play bar (the timeline), the views pill and the dock's glass step aside while a card is up. When the card sinks
// away they wait until it has mostly gone, then fade in and rise into place; when a card rises they go fast, at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const rule = (sel) => {
  const at = css.indexOf(`${sel} {`);
  assert.ok(at >= 0, `missing rule ${sel}`);
  return css.slice(at, css.indexOf('}', at));
};
// (Seconds: a number, or a step of the motion scale, tokens.css --d-flip, --d-small, --d-surface.)
const STEPS = { 'var(--d-flip)': 0.12, 'var(--d-small)': 0.24, 'var(--d-surface)': 0.42 };
const secs = (v) => (v in STEPS ? STEPS[v] : parseFloat(v) * (v.endsWith('ms') ? 0.001 : 1));
const T = String.raw`(?:[\d.]+m?s|var\(--d-(?:flip|small|surface)\))`;
const timing = (body, prop) => {
  const m = body.match(new RegExp(`transition:[^;]*\\b${prop} (${T}) var\\(--ease\\)(?: (${T}))?`));
  assert.ok(m, `no ${prop} transition in ${body}`);
  return { dur: secs(m[1]), delay: m[2] ? secs(m[2]) : 0 };
};
const CARD_EXIT = 0.12;   // thumbOut, the phone card's slide down (one flip step)

test('the play bar, views pill and glass come back after the card has mostly sunk, never over it', () => {
  for (const [sel, props] of [['.app.thumb .vdock:not(.mini) > :not(.thumb-bar)', ['opacity', 'translate']], ['.app.thumb .vdock:not(.mini)::before', ['opacity']], ['.app.thumb .vdock:not(.mini) .thumb-bar::before', ['opacity']], ['.app.thumb .vdock:not(.mini) .thumb-bar::after', ['opacity']]]) {
    for (const p of props) {
      const { dur, delay } = timing(rule(sel), p);
      assert.ok(delay >= CARD_EXIT / 2 && delay < CARD_EXIT, `${sel} ${p} waits for the card (${delay}s)`);
      assert.ok(dur >= 0.2, `${sel} ${p} eases in (${dur}s)`);
    }
  }
  assert.match(css, /@keyframes thumbOut \{ to \{ opacity: 0; translate: 0 var\(--thumb-rise, 24px\); \} \}/);
  assert.match(css, /#treatCard\.card-leaving[^{]*\{[^}]*animation: var\(--card-out\) var\(--d-flip\)/);
});

test('the rise is motion, so reduced motion only fades', () => {
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{ \.app\.thumb \.vdock:not\(\.mini\) \{ --bar-sink: 6px; \} \}/);
  assert.equal(css.match(/--bar-sink: 6px/g).length, 1);
});
