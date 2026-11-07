import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const between = (a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, a); return src.slice(i, src.indexOf(b, i + a.length)); };

test('B13: the whole preparation job is inside a try, and a failure settles every waiter and ends the talk', () => {
  const prep = between('  function prepare() {', '  // Each slide\'s numbers for the printed notes');
  assert.match(prep, /const prepFailed = \(\) => \{[\s\S]*?for \(const w of waiters\) w\.res\(null\);[\s\S]*?waiters = \[\];[\s\S]*?stop\(\);[\s\S]*?toast\(/);
  assert.match(prep, /\(async \(\) => \{\s*try \{[\s\S]*await host\.request\('snapshot'\)[\s\S]*\} catch \(err\) \{ console\.error\(err\); prepFailed\(\); \}\s*\}\)\(\);/);
});

test('B14: a start overtaken during its awaits returns before it writes the deck, saved state or UI', () => {
  const start = between('  async function start(id, at = 0, opts = null) {', '  // Ending a talk, the slide');
  const gen = start.indexOf('++startGen');
  const awaitCapture = start.indexOf('await capture()');
  const check = start.indexOf('if (startMine !== startGen) return;');
  const firstWrite = start.indexOf('if (deck) stopNow(false)');
  assert.ok(gen > 0 && gen < awaitCapture, 'the generation is taken before the first await');
  assert.ok(check > awaitCapture && check < firstWrite, 'checked after the awaits and before any shared write');
});

test('B15: toAnatomy takes a cut predicate, checks it after every wait, and every caller passes its own', () => {
  const fn = between('  async function toAnatomy(next, cut = () => false) {', '  // Glide the camera to a slide');
  // Every await is followed (on the same line or the next statement) by a cut() check before more writes.
  const lines = fn.split('\n');
  lines.forEach((l, i) => {
    if (!/\bawait\b/.test(l)) return;
    assert.ok(/cut\(\)/.test(l) || /cut\(\)/.test(lines[i + 1] || ''), `no cut() after the await in: ${l.trim()}`);
  });
  const calls = [...src.matchAll(/await toAnatomy\(([^;]*)\)/g)].map((m) => m[1]);
  assert.ok(calls.length >= 5);
  for (const c of calls) assert.match(c, /cut|mine/, `toAnatomy called without a cancel check: ${c}`);
});
