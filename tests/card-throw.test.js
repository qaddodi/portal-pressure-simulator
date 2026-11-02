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
  assert.match(presenter, /if \(railOK\(el\)\) railHold\(el, [^;]+;\n\s+else throwOut\(el, throwDir, dist\);/, 'a card rides the rail, or is thrown');
  assert.match(presenter, /if \(!t\.hidden && t\.childElementCount\) \{\n\s+if \(!railIn\(t, k\)\) throwIn\(t, k\);\n\s+if \(!stayTurn && !ui\.shade\.classList\.contains\('pz-turn'\)\) \{ if \(!railIn\(ui\.shade, k\)\) throwIn\(ui\.shade, k\); \} else railAway\(ui\.shade\);\n\s+\} else \{ railAway\(t\); railAway\(ui\.shade\); \}/, 'only a card that shows; a copy with no card to follow goes alone');
  assert.match(presenter, /if \(throwDir && !el\.hidden && el\.childElementCount\) \{ if \(!railIn\(el, throwDir, delay\)\) throwIn\(el, throwDir, delay\); \} else railAway\(el\);/);
  assert.match(presenter, /const pairD = pair\.length \? Math\.max\(\.\.\.pair\.map\(\(el\) => el\.offsetWidth\)\) \+ RAIL_GAP : 0;/, 'the words and their glass keep one spacing on the rail');
  assert.match(presenter, /railGhosts\(\)\.filter/, 'the copies are drawn by the cards\' GPU glass');
  assert.match(presenter, /if \(throwDir\) await throwsOut\(\);/, 'the next words go in only once the old card is out of sight');
  assert.match(presenter, /if \(!bare\) \{ throwDir = ''; railAway\(\); \}/, 'bare words still come in thrown after the camera; copies left over go');
  assert.match(presenter, /if \(out && throwDir\) return;/, 'a held swipe keeps the finger place for the throw');
  assert.match(presenter, /for \(const el of pageEls\(\)\) \{ throwStop\(el\);/, 'a finger takes a card from the throw');
});

test('one track: both cards on one curve with no overshoot, the old whole for its first half, the new whole by 40 %, one spacing', async () => {
  const { RAIL_MS, RAIL_GAP } = await import('../src/ui/card-throw.js');
  assert.equal(RAIL_MS, 560);
  assert.equal(RAIL_GAP, 24);
  assert.match(src, /const easeRail = cubicBezier\(0\.32, 0\.72, 0, 1\);/);
  const d = 400;
  let lo = 0, li = d;
  for (let k = 0; k <= 1.0001; k += 0.02) {
    const o = throwAt('rail-out', k, { x: 0, o: 1 }, { x: -d, o: 0 }), n = throwAt('rail-in', k, { x: d, o: 0 }, { x: 0, o: 1 });
    assert.ok(o.x <= lo + 1e-9 && o.x >= -d - 1e-9, `${k}: the old card moves one way, never past its end`);
    assert.ok(n.x <= li + 1e-9 && n.x >= -1e-9, `${k}: the new card moves one way, never past rest`);
    assert.ok(Math.abs((n.x - o.x) - d) < 1e-6, `${k}: the two keep one spacing`);
    lo = o.x; li = n.x;
  }
  assert.equal(throwAt('rail-out', 0.05, { x: 0, o: 1 }, { x: -d, o: 0 }).o, 1, 'the old card is whole as it starts');
  assert.deepEqual(throwAt('rail-in', 1, { x: d, o: 0 }, { x: 0, o: 1 }), { x: 0, o: 1 });
  assert.match(src, /export const RAIL = typeof location === 'undefined' \|\| !\/\[\?&\]rail=0\\b\/\.test/, '?rail=0 off');
  assert.match(src, /if \(!c\.classList\.contains\('glw-cv'\)\) return false;/, 'a card with a GPU picture in it is thrown, not copied (a canvas copies empty)');
});
