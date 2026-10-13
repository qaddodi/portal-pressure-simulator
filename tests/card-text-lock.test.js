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

test('a stacked pair widens the words\' column before it shrinks the title or text, and the chart keeps its size', () => {
  const at = (re) => js.search(re);
  const soft = at(/below = title\(1, TK_SOFT\);/), wide = at(/if \(!below\) \{ widen\(\); below = title\(1, TK_SOFT\); \}/), steps = at(/if \(!below\) ladder\(\);/);
  assert.ok(soft > 0 && soft < wide && wide < steps, 'title (soft floor) at the usual width, then widened, then the shrinking steps');
  assert.match(js, /TK_SOFT = 0\.8/);
  assert.match(js, /--pz-cwr/);
  assert.match(css, /width: calc\(100% \* var\(--pz-fit, 1\) \* var\(--pz-dk, 1\) \* var\(--pz-cwr, 1\)\)/);
});

test('a slide Doppler card lays its readings two across so labels and values never overlap', () => {
  assert.match(css, /\.pz:not\(\.stack\) \.pz-tool \.dop \.dop-report \.dop-stats \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
