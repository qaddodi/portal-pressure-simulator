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

test('presenter: thrown cards go out and come in by card-throw.js; a swipe hands over its place', () => {
  assert.doesNotMatch(presenter, /CARD_THROW|cardthrow/);
  assert.match(presenter, /for \(const el of goes\) throwOut\(el, throwDir, dist\);/, 'every card leaving is thrown on the tap');
  assert.match(presenter, /if \(!t\.hidden && t\.childElementCount\) \{\n\s+throwIn\(t, k, 0\);\n\s+throwIn\(ui\.shade, k, 0\);\n\s+\}/, 'only a card that shows comes in; the words and their glass together');
  assert.match(presenter, /if \(throwDir && !el\.hidden && el\.childElementCount\) throwIn\(el, throwDir, delay\);/, 'a card that shows comes in thrown');
  assert.doesNotMatch(presenter, /railGhosts|railHold|railIn|railAway|railWaits|railCopies|railable|INSTANT/, 'the rail is gone');
  assert.match(presenter, /if \(throwDir\) await throwsOut\(\);/, 'the next words go in only once the old card is out of sight');
  assert.match(presenter, /if \(!bare\) \{ const dir = throwDir \|\| 'next'; for \(const el of \[ui\.text, ui\.shade, ui\.data, ui\.panel\]\) if \(throwPinned\(el\)\) \{[^\n]*throwIn\(el, dir, 0, throwD\); else throwRelease\(el\); \} throwDir = ''; \}/, 'bare words still come in thrown after the camera; copies left over go; a card sent out on the tap and kept by the new slide comes back in');
  assert.match(presenter, /if \(busy\) outNow\(\);\n\s+if \(!busy\) run\(\);/, 'a Next while the last change still runs sends the cards out on the tap');
  assert.match(presenter, /if \(out && throwDir\) return;/, 'a held swipe keeps the finger place for the throw');
  assert.match(presenter, /for \(const el of \(pull\.els \?\?= swipeEls\(\)\)\) \{ throwStop\(el\);/, 'a finger takes a card from the throw');
});

test('the rail\'s curve and spacing; no held copies: every card leaves on the tap', async () => {
  const ct = await import('../src/ui/card-throw.js');
  assert.equal(ct.RAIL_MS, 560);
  assert.equal(ct.RAIL_GAP, 24);
  assert.match(src, /const easeRail = cubicBezier\(0\.32, 0\.72, 0, 1\);/);
  assert.doesNotMatch(src, /INSTANT|railable|railIn|railHold|railWaits|railGhosts|railCopies|railAway/, 'the switch and its no-op stubs are gone');
});

test('instant: every leaving card sets off in the tap\'s task, on one distance, gone from sight within the first part of its way; in from as far', () => {
  const from = { x: 0, o: 1 }, to = { x: -400, o: 0 };
  let k0 = 1;
  for (let k = 0; k <= 1; k += 0.01) if (throwAt('out', k, from, to).o <= 0.001) { k0 = k; break; }
  assert.ok(k0 <= 0.45, `out of sight by ${k0}`);
  assert.ok(throwAt('out', 0.1, from, to).x < -80, 'it moves at once, fast');
  assert.match(presenter, /const dist = \(throwD = Math\.min\(innerWidth, Math\.max\(120, \.\.\.sized\.map\(wOf\)\) \+ RAIL_GAP\)\);/);
  assert.match(presenter, /if \(bare && throwDir && !el\.hidden && el\.childElementCount && !ui\.text\.hidden && ui\.text\.childElementCount && ui\.text\.classList\.contains\('pz-leave'\)\) return false;/, 'in together with the words');
  assert.match(src, /if \(k >= 1 \|\| \(r\.kind === 'out' && p\.o <= 0\.001\)\) land\(el, r, p\.x, p\.o\);/, 'out of sight ends the way out, so the next words go in at once');
});

test('a card comes in from a little to its side (THROW_IN), not from where the old one went; no drop shadow round the cards', () => {
  assert.match(src, /write\(el, s \* THROW_IN, 0\)/);
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /:root:root:not\(\[data-carddrop\]\) :is\(\.pz, \.pz-shade\) \{ --glass-drop: transparent; \}/);
});

test('glass: a card raised by --pz-rise or --pz-lift (untucking) has its glass raised with it each frame', () => {
  const glass = readFileSync(new URL('../src/ui/glass-gl.js', import.meta.url), 'utf8');
  assert.doesNotMatch(glass, /const RISE\b|RISE &&|glassrise=/);
  assert.match(glass, /if \(cards\?\.shift && !s\.translate && !anims\.get\(e\)\?\.size\) \{ const sh = cards\.shift\(e\);/);
  assert.match(presenter, /shift: riseShift \}\)/);
  assert.match(presenter, /el === ui\.data \? \(wide && el\.classList\.contains\('col'\) \? risePx\(el, '--pz-lift'\) : 0\)/);
});

test('R05: the cards that show wait for the slide going in to be prepared, at most PREP_MS, then leave', () => {
  assert.match(presenter, /if \(!slidePrep\.ready\(want\)\) prepHold\(want, goOn\); else goOn\(\);/);
  assert.match(presenter, /const PREP_MS = 160;/);
  assert.doesNotMatch(presenter, /PREP_HOLD|prephold/);
  assert.match(presenter, /if \(!deck \|\| want !== i \|\| !txnLive\(tx\)\) return;/, 'a newer press takes over (its transaction superseded too)');
});

test('a thrown readings sheet keeps its parts and glass whole: only the throw fades it (no CSS clock of its own)', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(src, /el\.classList\?\.add\(THROWING\); classSoon\(el, THROWING, true\);[^\n]*\n\s+el\.style\.setProperty\('transition', 'none', 'important'\);/, 'marked in the task that starts the move');
  assert.match(src, /const rest = \(el\) => \{[^\n]*classSoon\(el, THROWING, false\)/, 'let go at rest, a task after the frame');
  assert.doesNotMatch(src, /data-thrown/, 'no attribute written in a frame');
  assert.match(src, /if \(r\.kind !== 'out'\) \{ landed\.push\(el\); runSoon\(restLanded\); \}/, 'a card come in (or eased back) is let go a task after the frame (no closure made in the frame)');
  assert.match(src, /if \(!runs\.has\(el\) && !held\.has\(el\) && !pinned\.has\(el\)\) rest\(el\);/, 'unless a new move took it');
  for (const pre of ['.pz.stack.stack', '.pz.pz-wide.pz-wide']) {
    assert.ok(css.includes(`${pre} .pz-data.pz-sheet.pz-hide.pz-throwing { visibility: visible; pointer-events: none; }`), `${pre}: not hidden on its own timer`);
    assert.ok(css.includes(`${pre} .pz-data.pz-sheet.pz-throwing::before, ${pre} .pz-data.pz-sheet.pz-throwing::after, ${pre} .pz-data.pz-sheet.pz-throwing > :is(.pz-dh, .pz-tool, .pz-tiles) { opacity: 1; transition: none; }`), `${pre}: parts and glass pieces whole`);
    assert.ok(css.indexOf(`${pre} .pz-data.pz-sheet.pz-throwing::before`) > css.indexOf(`${pre} .pz-data.pz-sheet.pz-hide::before`), `${pre}: after the leave rule it overrides`);
  }
});
