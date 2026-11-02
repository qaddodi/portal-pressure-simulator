// Next and Back throw the cards on one clock (Mohammad, 2 Nov 2026: "Cards slides are super glitchy"): card-throw.js moves the words,
// their glass, a data card and a panel by inline transform and opacity in the scheduler's frame, never by a CSS transition or WAAPI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { throwAt, THROW_IN } from '../src/ui/card-throw.js';

const src = readFileSync(new URL('../src/ui/card-throw.js', import.meta.url), 'utf8');
const presenter = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

test('out: gathers pace and fades; in: from the side, no overshoot, whole by 60 %', () => {
  const from = { x: 0, o: 1 }, to = { x: -200, o: 0 };
  let last = 1;
  for (let k = 0; k <= 1.0001; k += 0.05) {
    const p = throwAt('out', k, from, to);
    assert.ok(p.x <= 0 && p.x >= -200 && p.o <= last + 1e-9);
    last = p.o;
  }
  assert.deepEqual(throwAt('out', 1, from, to), { x: -200, o: 0 });
  const a = { x: THROW_IN, o: 0 }, b = { x: 0, o: 1 };
  let lx = THROW_IN;
  for (let k = 0; k <= 1.0001; k += 0.02) {
    const p = throwAt('in', k, a, b);
    assert.ok(p.x >= -1e-9 && p.x <= lx + 1e-9, `${k}: moves one way only, never past rest`);
    assert.ok(p.o >= 0 && p.o <= 1);
    lx = p.x;
  }
  assert.equal(throwAt('in', 0.6, a, b).o, 1);
  assert.deepEqual(throwAt('in', 1, a, b), { x: 0, o: 1 });
});

test('one clock: the scheduler frame and the eases clock, inline values only, no transition, no WAAPI, no raw rAF', () => {
  assert.match(src, /const nextFrame = frameFor\('card-throw'\);/);
  assert.match(src, /const now = easeNow\(\);/);
  assert.match(src, /el\.style\.setProperty\('transition', 'none', 'important'\);\n\s+write\(el, from\.x, from\.o\);/, 'the first place written in the task that starts it');
  assert.doesNotMatch(src, /\.animate\(|requestAnimationFrame|getComputedStyle|getBoundingClientRect/);
});

test('presenter: thrown cards go out and come in by card-throw.js; a swipe hands over its place; ?cardthrow=0 off', () => {
  assert.match(presenter, /const CARD_THROW = CARD_PAGE && !\/\[\?&\]cardthrow=0\\b\/\.test\(location\.search\);/);
  assert.match(presenter, /for \(const el of goes\) throwOut\(el, throwDir, dist\);/);
  assert.match(presenter, /if \(!t\.hidden && t\.childElementCount\) \{\n\s+throwIn\(t, k\);\n\s+if \(!stayTurn && !ui\.shade\.classList\.contains\('pz-turn'\)\) throwIn\(ui\.shade, k\);/, 'only a card that shows');
  assert.match(presenter, /if \(throwDir && !el\.hidden && el\.childElementCount\) throwIn\(el, throwDir, delay\);/);
  assert.match(presenter, /if \(throwDir\) await throwsOut\(\);/, 'the next words go in only once the old card is out of sight');
  assert.match(presenter, /if \(!bare\) throwDir = '';/, 'bare words still come in thrown after the camera');
  assert.match(presenter, /if \(out && throwDir\) return;/, 'a held swipe keeps the finger place for the throw');
  assert.match(presenter, /for \(const el of pageEls\(\)\) \{ throwStop\(el\);/, 'a finger takes a card from the throw');
});
