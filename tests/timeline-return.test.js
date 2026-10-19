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
const secs = (v) => parseFloat(v) * (v.endsWith('ms') ? 0.001 : 1);
const timing = (body, prop) => {
  const m = body.match(new RegExp(`transition:[^;]*\\b${prop} ([\\d.]+m?s) var\\(--ease\\)(?: ([\\d.]+m?s))?`));
  assert.ok(m, `no ${prop} transition in ${body}`);
  return { dur: secs(m[1]), delay: m[2] ? secs(m[2]) : 0 };
};
const OPEN = '.app.thumb:is(.dock-open, .panel-open) .vdock:not(.mini)';
const CARD_EXIT = 0.18;   // thumbOut, the phone card's slide down

test('the play bar, views pill and glass come back after the card has mostly sunk, never over it', () => {
  for (const [sel, props] of [['.app.thumb .vdock:not(.mini) > :not(.thumb-bar)', ['opacity', 'translate']], ['.app.thumb .vdock:not(.mini)::before', ['opacity']], ['.app.thumb .vdock:not(.mini) .thumb-bar', ['box-shadow', 'border-radius', 'border-top-width', 'padding-top']]]) {
    for (const p of props) {
      const { dur, delay } = timing(rule(sel), p);
      assert.ok(delay >= CARD_EXIT / 2 && delay < CARD_EXIT, `${sel} ${p} waits for the card (${delay}s)`);
      assert.ok(dur >= 0.2, `${sel} ${p} eases in (${dur}s)`);
    }
  }
  assert.match(css, /@keyframes thumbOut \{ to \{ --sink: 100%; \} \}/);
  assert.match(css, /#treatCard\.card-leaving[^{]*\{[^}]*animation: var\(--card-out\) \.18s/);
});

test('they step aside at once, and quickly, when a card rises', () => {
  const kids = css.slice(css.indexOf(`${OPEN} > :is(.nb-views, .stage-bar, .readouts),`));
  const body = kids.slice(kids.indexOf('{'), kids.indexOf('}'));
  assert.match(body, /opacity: 0/);
  assert.match(body, /translate: 0 var\(--bar-sink, 0px\)/);
  for (const p of ['opacity', 'translate']) assert.deepEqual(timing(body, p), { dur: 0.12, delay: 0 });
  const glass = css.slice(css.indexOf(`${OPEN}::before,`));
  assert.deepEqual(timing(glass.slice(0, glass.indexOf('}')), 'opacity'), { dur: 0.12, delay: 0 });
});

test('the rise is motion, so reduced motion only fades', () => {
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{ \.app\.thumb \.vdock:not\(\.mini\) \{ --bar-sink: 6px; \} \}/);
  assert.equal(css.match(/--bar-sink: 6px/g).length, 1);
});
