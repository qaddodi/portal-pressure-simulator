import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the teaching card text sizes settle once per slide and are reused while it is in view', () => {
  assert.match(js, /textLock = \{ key: lockKey/);
  assert.match(js, /if \(lock\) \{ for \(const \[n, v\] of lock\.vars\)/);
  assert.match(js, /else ladder\(\);/);
});

test('a slide Doppler card lays its readings two across so labels and values never overlap', () => {
  assert.match(css, /\.pz:not\(\.stack\) \.pz-tool \.dop \.dop-report \.dop-stats \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
