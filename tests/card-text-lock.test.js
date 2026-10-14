import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the teaching card text sizes settle once per slide and are reused while it is in view', () => {
  assert.match(js, /textLock = \{ key: lockKey/);
  assert.match(js, /if \(lock\) \{\s*for \(const \[n, v\] of lock\.vars\)/);
  assert.match(js, /if \(!below\) ladder\(\);/);
});

test('the teaching and data cards keep one width on every slide: the column never widens', () => {
  assert.doesNotMatch(js, /widen\(\)/);
  assert.match(js, /dd\.style\.width = cw \? /);
  assert.match(js, /dd\.style\.maxWidth = cw \? 'none'/);
  assert.doesNotMatch(js, /setProperty\('--pz-sw'/);
  assert.match(js, /below = title\(1, TK_SOFT\);\s*if \(!below\) ladder\(\);/);
  const w = 'width: min(calc(clamp(300px, calc(29vw / var(--vz)), 600px) * var(--pz-wk, 1)';
  assert.ok(css.includes('.pz-text {') && css.slice(css.indexOf('.pz-text {')).split('}')[0].includes(w), 'teaching card width');
  assert.ok(css.slice(css.indexOf('.pz-data { position: absolute;')).split('}')[0].includes(w), 'data card (top right) at the same width');
});

test('a slide Doppler card lays its readings two across so labels and values never overlap', () => {
  assert.match(css, /\.pz:not\(\.stack\) \.pz-tool \.dop \.dop-report \.dop-stats \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
