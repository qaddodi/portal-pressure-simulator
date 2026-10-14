// The figure's "Portal blood" callout: the share that bypasses the liver as its headline, over one bar split into the
// liver's and the shunts' shares, tinted like the shunt tile, easing to a new share and never changing size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { portalSplit, RATE } from '../src/ui/table-marks.js';

const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the two shares are whole percents that always add to 100, clamped to 0..1', () => {
  for (const sh of [0, 0.004, 0.07, 0.125, 0.5, 0.93, 0.996, 1, -0.2, 1.4, NaN]) {
    const p = portalSplit(sh);
    assert.equal(p.shunt + p.liver, 100, `shares at ${sh}`);
    assert.ok(Number.isInteger(p.shunt) && p.shunt >= 0 && p.shunt <= 100);
  }
  assert.deepEqual([portalSplit(0.93).shunt, portalSplit(0.93).liver], [93, 7]);
});

test('the tint follows the shunt tile: plain, amber, red', () => {
  for (const sh of [0, 0.05, 0.1, 0.2, 0.3, 0.93]) assert.equal(portalSplit(sh).rate, RATE.shunt(sh)[0]);
  assert.deepEqual([0.05, 0.15, 0.5].map((v) => portalSplit(v).rate), ['ok', 'mid', 'hi']);
  assert.match(css, /\.cath-label\.site\.split\[data-rate="mid"\] \{ --sp-c: var\(--caution\)/);
  assert.match(css, /\.cath-label\.site\.split\[data-rate="hi"\] \{ --sp-c: var\(--danger\)/);
});

test('the callout is a headline over a split bar, not the old two-stroke fork', () => {
  assert.match(stage, /<span class="sp-h"><em class="sp-n"><\/em>% bypasses the liver<\/span>/);
  assert.match(stage, /<span class="sp-bar"><i class="sp-l"><\/i><i class="sp-s"><\/i><\/span>/);
  assert.doesNotMatch(stage, /M4 20 C26 20 32 7 60 7/);
  assert.doesNotMatch(css, /\.cath-label\.site\.split svg/);
});

test('a new share eases over 0.8 s, and the callout keeps one size (fixed headline width, stacked on phones)', () => {
  assert.match(stage, /\(now - t0\) \/ 800\); splitShow\(el, el\._sh = from \+ \(to - from\) \* easeInOut\(k\)\)/);
  assert.match(stage, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.cath-label\.site\.split \.sp-h \{ width: 12\.6em;/);
  assert.match(css, /\.cath-label\.site\.split, \.app\.presenting \.cath-label\.site\.split \{[^}]*flex-direction: column;/);
});
