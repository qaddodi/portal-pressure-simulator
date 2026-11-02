// Next and Back throw the cards on one clock (Mohammad, 2 Nov 2026: "Cards slides are super glitchy"): card-throw.js moves the words,
// their glass, a data card and a panel by inline transform and opacity in the scheduler's frame, never by a CSS transition or WAAPI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unsnap } from './unsnap.js';
import { throwAt, THROW_IN } from '../src/ui/card-throw.js';

const src = readFileSync(new URL('../src/ui/card-throw.js', import.meta.url), 'utf8');
const presenter = unsnap(readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8'));

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
  assert.match(presenter, /if \(!t\.hidden && t\.childElementCount\) \{\n\s+if \(!railIn\(t, k\)\) throwIn\(t, k, 0, throwD\);\n\s+if \(!stayTurn && !ui\.shade\.classList\.contains\('pz-turn'\)\) \{ if \(!railIn\(ui\.shade, k\)\) throwIn\(ui\.shade, k, 0, throwD\); \} else railAway\(ui\.shade\);\n\s+\} else \{ railAway\(t\); railAway\(ui\.shade\); \}/, 'only a card that shows; a copy with no card to follow goes alone');
  assert.match(presenter, /if \(throwDir && !el\.hidden && el\.childElementCount\) \{ if \(bare && railWaits\(el\) && railWaits\(ui\.text\)\) \{ \/\* rides with the words: wordsTurnIn \*\/ \} else if \(!railIn\(el, throwDir, delay\)\) throwIn\(el, throwDir, delay, throwD\); \} else railAway\(el\);/);
  assert.match(presenter, /const pairD = pair\.length \? Math\.max\(\.\.\.pair\.map\(\(el\) => el\.offsetWidth\)\) \+ RAIL_GAP : 0;/, 'the words and their glass keep one spacing on the rail');
  assert.match(presenter, /railGhosts\(\)\.filter/, 'the copies are drawn by the cards\' GPU glass');
  assert.match(presenter, /if \(throwDir\) await throwsOut\(\);/, 'the next words go in only once the old card is out of sight');
  assert.match(presenter, /if \(!bare\) \{ const dir = throwDir \|\| 'next'; for \(const el of \[ui\.text, ui\.shade, ui\.data, ui\.panel\]\) if \(throwPinned\(el\)\) \{[^\n]*throwIn\(el, dir, 0, throwD\); else throwRelease\(el\); \} throwDir = ''; railAway\(\); \}/, 'bare words still come in thrown after the camera; copies left over go; a card sent out on the tap and kept by the new slide comes back in');
  assert.match(presenter, /if \(busy\) outNow\(\);\n\s+if \(!busy\) run\(\);/, 'a Next while the last change still runs sends the cards out on the tap');
  assert.match(presenter, /if \(out && throwDir\) return;/, 'a held swipe keeps the finger place for the throw');
  assert.match(presenter, /for \(const el of \(pull\.els \?\?= swipeEls\(\)\)\) \{ throwStop\(el\);/, 'a finger takes a card from the throw');
});

test('the rail\'s curve and spacing; no held copies: every card leaves on the tap', async () => {
  const { RAIL_MS, RAIL_GAP, railable, railIn, railWaits, railGhosts } = await import('../src/ui/card-throw.js');
  assert.equal(RAIL_MS, 560);
  assert.equal(RAIL_GAP, 24);
  assert.match(src, /const easeRail = cubicBezier\(0\.32, 0\.72, 0, 1\);/);
  assert.match(src, /export const INSTANT = true;/);
  assert.equal(railable({}), false);
  assert.equal(railIn({}, 'next'), false);
  assert.equal(railWaits({}), false);
  assert.deepEqual(railGhosts(), []);
});

test('instant: every leaving card sets off in the tap\'s task, on one distance, gone from sight within the first part of its way; in from as far', () => {
  const from = { x: 0, o: 1 }, to = { x: -400, o: 0 };
  let k0 = 1;
  for (let k = 0; k <= 1; k += 0.01) if (throwAt('out', k, from, to).o <= 0.001) { k0 = k; break; }
  assert.ok(k0 <= 0.45, `out of sight by ${k0}`);
  assert.ok(throwAt('out', 0.1, from, to).x < -80, 'it moves at once, fast');
  assert.match(presenter, /const dist = INSTANT \? \(throwD = Math\.min\(innerWidth, Math\.max\(120, \.\.\.sized\.map\(wOf\)\) \+ RAIL_GAP\)\) : throwDist\(\);/);
  assert.match(presenter, /if \(INSTANT && bare && throwDir && !el\.hidden && el\.childElementCount && !ui\.text\.hidden && ui\.text\.childElementCount && ui\.text\.classList\.contains\('pz-leave'\)\) return false;/, 'in together with the words');
  assert.match(src, /if \(k >= 1 \|\| \(r\.kind === 'out' && p\.o <= 0\.001\)\) \{ runs\.delete\(el\);/, 'out of sight ends the way out, so the next words go in at once');
});

test('glass: a card\'s fade carried by a transition that has just finished stays at its end until the page is read again (?glassend=0 off)', () => {
  const glass = readFileSync(new URL('../src/ui/glass-gl.js', import.meta.url), 'utf8');
  assert.match(glass, /const ENDS = !\/\[\?&\]glassend=0\\b\/\.test\(SEARCH\);/);
  assert.match(glass, /if \(ENDS && st === 'finished'\) \{ const v = kf && motionAt\(kf, 1\);/, 'the last keyframe is kept as the element\'s place and fade');
  assert.match(glass, /if \(end\) \{ if \(!t && end\.t && !e\.style\?\.transform\) t = end\.t; if \(o == null && end\.o != null\) o = end\.o; \}/);
  assert.match(glass, /if \(dead \|\| lost\) return;\n\s+ended\.clear\(\);/, 'dropped at the next read, which sees the page as it is');
});

test('a card comes in from a little to its side (THROW_IN), not from where the old one went; no drop shadow round the cards', () => {
  assert.match(src, /write\(el, s \* THROW_IN, 0\)/);
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /:root:root:not\(\[data-carddrop\]\) :is\(\.pz, \.pz-shade\) \{ --glass-drop: transparent; \}/);
});

test('glass: a card raised by --pz-rise or --pz-lift (untucking) has its glass raised with it each frame (?glassrise=0 off)', () => {
  const glass = readFileSync(new URL('../src/ui/glass-gl.js', import.meta.url), 'utf8');
  assert.match(glass, /if \(RISE && cards\?\.shift && !s\.translate && !anims\.get\(e\)\?\.size\) \{ const sh = cards\.shift\(e\);/);
  assert.match(presenter, /shift: riseShift \}\)/);
  assert.match(presenter, /el === ui\.data \? \(wide && el\.classList\.contains\('col'\) \? risePx\(el, '--pz-lift'\) : 0\)/);
});

test('R05: the cards that show wait for the slide going in to be prepared, at most PREP_MS, then leave (?prephold=0 off)', () => {
  assert.match(presenter, /if \(PREP_HOLD && !slidePrep\.ready\(want\)\) prepHold\(want, goOn\); else goOn\(\);/);
  assert.match(presenter, /const PREP_HOLD = SLIDE_PREP && !\/\[\?&\]prephold=0\\b\/\.test\(location\.search \|\| ''\), PREP_MS = 160;/);
  assert.match(presenter, /if \(!deck \|\| want !== i \|\| !txnLive\(tx\)\) return;/, 'a newer press takes over (its transaction superseded too)');
});
