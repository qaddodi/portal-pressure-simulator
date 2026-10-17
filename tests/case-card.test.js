// The case card: a new patient's case covers the figure while the patient loads, and Next lifts it before the slide goes on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { SITES } from '../src/ui/decks/sites.js';
import { withOverview } from '../src/ui/decks.js';

const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('Sites and causes gives each site slide (and only those) a case', () => {
  const withCase = SITES.slides.filter((s) => s.vignette);
  assert.deepEqual(withCase.map((s) => s.site), ['pre', 'presin', 'sin', 'postsin', 'post', 'cardiac']);
  for (const s of withCase) assert.ok(s.preset && s.vignette.length < 220, s.id);
});

test('every case in every deck sits on a slide with a preset and stays under 220 characters', async () => {
  const dir = new URL('../src/ui/decks/', import.meta.url);
  let n = 0;
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    for (const deck of Object.values(await import(new URL(f, dir)))) {
      if (!deck?.slides) continue;
      // As presented (after the outline slide): the case slide itself loads a patient (the presenter's
      // changes()), so it is a new patient and the card shows, the deck's first slide included.
      for (const s of withOverview(deck).slides) {
        if (!s.vignette) continue;
        n++;
        assert.ok(s.preset && s.vignette.length < 220, `${f} ${s.id}`);
      }
    }
  }
  assert.ok(n >= 55, `only ${n} cases`);
});

test('Next lifts an open case card before it changes the slide', () => {
  assert.match(src, /const next = \(\) => \{\s*if \(caseLift\) \{ caseLift\(\); return; \}/);
  // Shown only going forward onto a new patient, and loaded behind the card before it lifts.
  assert.match(src, /s\.vignette && ui && !booting && !lap && to > lastAt && \(si !== shownState \|\| liveOff\)/);
});

test('behind the case card the camera glides once, to the slide\'s own framing; the tap makes no second move', () => {
  const run = src.slice(src.indexOf('async function caseRun('), src.indexOf('function caseShut('));
  // Loading the patient behind the card moves no camera (no zoom out to the fit first), and the card does not wait for the tap itself.
  assert.doesNotMatch(run, /camera\(/);
  assert.doesNotMatch(run, /lifted\)/);
  // The slide's own camera move runs with the card still up; the card lifts only once it has landed, just before the slide's cards come in.
  assert.match(src, /await settleRun\(\);\s*if \(!bare\) \{ await caseEnd\(cut\); if \(cut\(\)\) return; cardsIn\(\{ i: to, gen: g \}\); \}/);
  // (Between the patient's change and the lift, only the waits for a quiet figure, so the cards' fade is seen: slide-fade.test.js.)
  assert.match(src, /if \(later\) \{ if \(!await morphTo\(st, cut\)\) return; shownState = own \? -1 : si; \}\s*(?:\/\/[^\n]*\n\s*)*if \(swap\) \{ await until\(\(\) => cut\(\) \|\| stage\.organsSettled\(\), 1500\); if \(cut\(\)\) return; \}\s*await unseen\(cut\); if \(cut\(\)\) return;\s*await caseEnd\(cut\); if \(cut\(\)\) return;\s*bare = false; cardsIn\(\{ i: to, gen: g \}\);/);
  const gl = src.indexOf("await until(() => cut() || !stage.gliding(), 1500)");
  assert.ok(gl > 0 && gl < src.indexOf('await caseEnd(cut); if (cut()) return;\n      bare = false'));
  // A move cut short, or one that ends otherwise, never leaves the card up.
  assert.match(src, /stage\.holdHome\(false\); caseShut\(\);/);
});

test('the case card is cards glass, enters and leaves whole, never resizing', () => {
  const rule = css.match(/\.pz-case \{[^}]*\}/)[0];
  assert.match(rule, /backdrop-filter: blur\(16px\) saturate\(1\.15\)/);
  assert.match(rule, /height: fit-content/);
  assert.match(rule, /transition: opacity \.45s var\(--ease\), transform \.45s var\(--ease\);/);
  assert.doesNotMatch(rule, /scale/);
});

test('the case text is 2.5x the teaching card body, and eases down only to fit the card before it enters', () => {
  const p = css.match(/\.pz-case-p \{[^}]*\}/)[0];
  assert.match(p, /font: 500 calc\(var\(--s-body\) \* var\(--case-k, var\(--case-max\)\)\)/);
  assert.match(css, /\.pz-case \{ --case-max: 2\.5; \}/);
  // On a phone the words run a fifth smaller (2x), and the outline card's a little smaller too.
  assert.match(css, /\.pz\.stack \.pz-case \{ --case-max: 2; \}/);
  assert.match(css, /\.pz\.stack \.pz-outline \{ --pzo-fs: calc\(var\(--s-body\) \* \.85\)/);
  assert.match(src, /c\.scrollHeight > c\.clientHeight \+ 1; k -= 0\.1\) c\.style\.setProperty\('--case-k'[^\n]*\n\s*c\.classList\.add\('on'\)/);
});

test('on an upright tablet the case card is the teaching card\'s width, its own height, centred both ways', () => {
  // The teaching card there spans 70% (15% each side); the case card matches it, centred by inset 0 and auto margins.
  assert.match(css, /\.pz-shade\.stack\.tab \{ left: 15%; right: 15%; \}/);
  assert.match(css, /\.pz\.stack\.tab \.pz-case \{ width: 70%; \}/);
  const rule = css.match(/\.pz-case \{[^}]*\}/)[0];
  assert.match(rule, /position: absolute; inset: 0; margin: auto;/);
  assert.match(rule, /height: fit-content/);
});

test('the Case pill is set at the teaching card body size or larger, not the small site-tag size', () => {
  assert.match(css, /\.pz-case-tag \{[^}]*font-size: calc\(var\(--s-body\) \* 1\.15\)/);
});

test('the Case pill and the case text are centred on the card', () => {
  assert.match(css, /\.pz-case-tag \{[^}]*align-self: center/);
  assert.match(css.match(/\.pz-case-p \{[^}]*\}/)[0], /text-align: center/);
});

test('a let-go case card flies off when far out or flicked, either way, and springs back otherwise', async () => {
  const { caseFling } = await import('../src/ui/swipe.js');
  const w = 360;
  assert.equal(caseFling(-200, 0, w), -1);          // slow drag let go past a third: off to the left
  assert.equal(caseFling(200, 0, w), 1);            // and to the right
  assert.equal(caseFling(-60, -0.9, w), -1);        // quick flick from a short drag
  assert.equal(caseFling(60, 0.9, w), 1);
  assert.equal(caseFling(-60, 0, w), 0);            // short slow drag: back
  assert.equal(caseFling(-10, -2, w), 0);           // a twitch on lift-off is not a flick
  assert.equal(caseFling(-200, 0.6, w), 0);         // pulled far, carried back toward the middle: back
  assert.equal(caseFling(0, 0, w), 0);
  assert.equal(caseFling(NaN, 1, w), 0);
  assert.equal(caseFling(100, 1, 0), 0);
});

test('the case card follows a finger and a fling lifts it like a tap, also during the glide behind it', () => {
  // The slide swipe leaves touches on the card alone; the card's own drag is touch-only and swallows the click after it.
  assert.match(src, /sw = deck && e\.touches\.length === 1 && !caseOn\(e\)/);
  assert.match(src, /onclick: \(\) => \{ if \(performance\.now\(\) - caseDragAt > 400\) caseLift\?\.\(\); \}/);
  const fly = src.slice(src.indexOf('function caseFly('), src.indexOf('function caseBack('));
  // Flying off only marks the card lifted: no camera move, no slide change; caseEnd still waits for the glide to land.
  assert.match(fly, /caseGone\(card\)/);
  assert.doesNotMatch(fly, /camera\(|go\(|next\(/);
  // Once flown, Next/caseShut wait only for the rest of the flight, and the next case card comes back whole.
  assert.match(src, /const ms = card\.flown \? Math\.max\(0, Math\.ceil\(card\.flown - performance\.now\(\)\)\) : card\.ms;/);
  assert.match(src, /for \(const k of \['transform', 'transition', 'opacity'\]\) c\.style\.removeProperty\(k\);/);
});

test('a tap, Next or a swipe anywhere lifts the case card at once, even while the patient loads; the next one moves on', () => {
  assert.match(src, /caseLift = \(\) => caseGone\(card\);/);
  const gone = src.slice(src.indexOf('function caseGone('), src.indexOf('function caseShut('));
  // It fades now (no waiting for the load to end), and Next and swipes go back to changing slides.
  assert.match(gone, /if \(caseLift && caseCard === card\) caseLift = null;/);
  assert.match(gone, /card\.lifted = true;/);
  assert.match(gone, /card\.c\.classList\.remove\('on'\);\s*card\.flown = performance\.now\(\) \+ card\.ms;/);
  assert.doesNotMatch(gone, /go\(|next\(|camera\(/);
  // A swipe off the card goes through the slide swipe, which calls next() (so caseLift) like any slide.
  assert.match(src, /if \(d > 0\) next\(\); else if \(d < 0\) prev\(\);/);
  // The fading card lets touches and clicks through.
  assert.match(css, /\.pz-case:not\(\.on\) \{ pointer-events: none; \}/);
});

test('a flung case card glides off and fades over a visible time, and is hidden only after its flight', async () => {
  const { caseFlight, FLIGHT_MIN, FLIGHT_MAX } = await import('../src/ui/swipe.js');
  // A slow let-go halfway out (the iPhone report: it popped out of existence) still takes a visible flight.
  assert.ok(caseFlight(373, 0.05) >= 380 && caseFlight(373, 0.05) <= FLIGHT_MAX);
  assert.ok(caseFlight(373, 0) >= FLIGHT_MIN);
  assert.ok(caseFlight(200, 5) >= FLIGHT_MIN);   // a hard flick too
  assert.ok(caseFlight(NaN, NaN) >= FLIGHT_MIN);
  const fly = src.slice(src.indexOf('function caseFly('), src.indexOf('function caseBack('));
  // Both the move and the fade are transitions of the flight's length (never 'none'), ending at nothing; reduced motion still fades.
  assert.match(fly, /transform \$\{ms\}ms cubic-bezier\([^`]*opacity \$\{ms\}ms/);
  assert.match(fly, /reduce\.matches \? `opacity \$\{ms\}ms linear`/);
  assert.match(fly, /c\.style\.opacity = '0'/);
  assert.doesNotMatch(fly, /'none'|hidden|caseShut/);
  // The card is hidden only once the flight has run (caseShut waits for card.flown).
  assert.match(src, /const ms = card\.flown \? Math\.max\(0, Math\.ceil\(card\.flown - performance\.now\(\)\)\) : card\.ms;\s*setTimeout\(\(\) => \{ if \(!card\.c\.classList\.contains\('on'\)\) card\.c\.hidden = true; \}, ms\);/);
});

test('no slide card shows while a case card is up, a catheter slide included; they come in once it is lifted', () => {
  // The words keep their leave state behind a case card (wordsIn never lets it go then), and every slide, bare or not
  // (HVPG slide 2 is a catheter slide, whose words used to come in at once under the case), sets it while a case is up.
  assert.match(src, /if \(!caseCard\) text\.classList\.remove\('pz-leave'\);/);
  assert.doesNotMatch(src.slice(src.indexOf('function wordsIn('), src.indexOf('function wordsIn(') + 400), /^\s*text\.classList\.remove\('pz-leave'\);/m);
  assert.match(src, /if \(bare \|\| caseCard\) \{ ui\.text\.classList\.add\('pz-leave'\); ui\.root\.dataset\.bare = ''; \}/);
  // A non-bare slide brings its cards in only after caseEnd (the lift), and cardsIn is what lets the words go.
  assert.match(src, /if \(!bare\) \{ await caseEnd\(cut\); if \(cut\(\)\) return; cardsIn\(\{ i: to, gen: g \}\); \}/);
  assert.match(src, /function cardsIn\(at\) \{ if \(ui\) \{ if \(at\) \{ entering = at; layout\(\); \} reFit\(\); if \(!bare\) \{ ui\.text\.classList\.remove\('pz-leave'\);/);
});
