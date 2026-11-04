// The case card: a new patient's case covers the figure while the patient loads, and Next lifts it before the slide goes on.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { unsnap } from './unsnap.js';
import { SITES } from '../src/ui/decks/sites.js';
import { withOverview } from '../src/ui/decks.js';
import { createCore } from '../src/worker-core.js';

const src = unsnap(readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8'));
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
  assert.match(src, /s\.vignette && ui && !booting && \(!lap \|\| !!own\) && to > lastAt && \(si !== shownState \|\| liveOff \|\| !!own\)/);
});

test('behind the case card the camera eases out to the whole patient, then the patient changes; the tap zooms once to the slide', () => {
  const run = src.slice(src.indexOf('async function caseRun('), src.indexOf('// A question card (slide field question)'));
  // The leaving slide's cards stop counting for the framing, then the camera eases out to the fit and is still before the morph.
  assert.match(run, /ui\.safe\.hidden = true;/);
  const fit = run.indexOf('stage.fitSlow(gl)'), still = run.indexOf('!stage.gliding()'), morph = run.indexOf('await morphTo(st, cut');
  assert.ok(fit > 0 && fit < still && still < morph, 'zoom out, then still, then the patient changes');
  // A card lifted before the zoom out skips it; the card itself never waits for the tap, nor moves to the slide's framing.
  assert.match(run, /if \(!card\.lifted\) \{\s*const gl = /);
  assert.doesNotMatch(run, /camera\(/);
  // The refit for a grown ascites or spleen waits for the organs' GPU copy, so it is never a move over the live drawing.
  assert.match(run, /stage\.organsSettled\(\), CATH_SETTLE_MS\); if \(cut\(\)\) return false;\s*if \(!card\.lifted\) stage\.fitSlow\(/);
  // The slide's own camera move waits for the tap (and for the organs' GPU copy), so it runs as the card fades.
  const lifted = src.slice(src.indexOf('async function caseLifted('), src.indexOf('async function caseEnd('));
  assert.match(lifted, /await until\(\(\) => cut\(\) \|\| card\.lifted, 864e5\);/);
  assert.match(lifted, /stage\.organsSettled\(\), CATH_SETTLE_MS\)/);
  const wait = src.indexOf('if (caseCard) { await caseLifted(cut); if (cut()) return; }');
  assert.ok(wait > 0 && wait < src.indexOf('else if (cam) await camera(cam, fv, cut, plate ? CARDS_AT : 0, prepWith);'));
  // The words are fitted unseen before that; a catheter slide's cards still wait for the lift before they come in.
  assert.match(src, /await settleRun\(\);\s*if \(!bare\) \{ await caseEnd\(cut\); if \(cut\(\)\) return; cardsIn\(\{ i: to, gen: g \}\); \}/);
  // (Between the patient's change and the lift, only the waits for a quiet figure, so the cards' fade is seen: slide-fade.test.js.)
  assert.match(src, /if \(later && !under\) \{ if \(!await morphTo\(st, cut, MORPH_ONE_MS\)\) return; shownState = own \? -1 : si; ui\?\.tools\.hold\(false\); \}\s*(?:\/\/[^\n]*\n\s*)*if \(swap\) \{ await until\(\(\) => cut\(\) \|\| stage\.organsSettled\(\), 1500\); if \(cut\(\)\) return; \}\s*if \(prep\) \{ if \(await prep\) await smooth\(cut, QUICK_SMOOTH\); \} else await unseen\(cut\);\s*if \(cut\(\)\) return;\s*const filled = await ui\.tools\.ready\(900\); if \(cut\(\)\) return;\s*if \(!filled\) degrade\('window'\);[^\n]*\n\s*await caseEnd\(cut\); if \(cut\(\)\) return;\s*bare = false; cardsIn\(\{ i: to, gen: g \}\);/);
  const gl = src.indexOf("await until(() => cut() || !stage.gliding(), 1500)");
  assert.ok(gl > 0 && gl < src.indexOf('await caseEnd(cut); if (cut()) return;\n      bare = false'));
  // A move cut short, or one that ends otherwise, never leaves the card up.
  assert.match(src, /homeOff\(\);[^]*?caseShut\(\);/);
});

test('the case card is cards glass, enters and leaves whole, never resizing', () => {
  const rule = css.match(/\.pz-case \{[^}]*\}/)[0];
  assert.match(rule, /--gl-glass: 1;/);   // (its frost the cards' GPU glass; no CSS blur since 1 Nov 2026)
  assert.match(rule, /height: fit-content/);
  // (No CSS transition: its compositor run parted from the GPU glass by a frame. presenter.js caseFade writes the fade on the frame clock.)
  assert.doesNotMatch(rule, /transition/);
  assert.match(rule, /opacity: 0;/);
  assert.match(css, /\.pz-case\.on \{ opacity: 1; translate: none; \}/);
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
  // (The card is a flex column that starts its items at the left: a line shorter than the card, such as the case's own short question
  // (caseQ), sat at the left under its centred text-align until each line stretched across the card.)
  assert.match(css.match(/\.pz-case \{[^}]*\}/)[0], /align-items: flex-start/);
  assert.match(css.match(/\.pz-case-p \{[^}]*\}/)[0], /align-self: stretch/);
  assert.doesNotMatch(css.match(/\.pz-case-q \{[^}]*\}/)[0], /align-self|text-align|margin-inline|width/);
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
});

test('a tap, Next or a swipe anywhere lifts the case card at once, even while the patient loads; the next one moves on', () => {
  assert.match(src, /caseLift = \(\) => caseGone\(card\);/);
  const gone = src.slice(src.indexOf('function caseGone('), src.indexOf('function caseShut('));
  // It fades now (no waiting for the load to end), and Next and swipes go back to changing slides.
  assert.match(gone, /if \(caseLift && caseCard === card\) caseLift = null;/);
  assert.match(gone, /card\.lifted = true;/);
  assert.match(gone, /card\.c\.classList\.remove\('on'\);\s*caseFade\(card\.c, false, card\.ms\);\s*card\.flown = performance\.now\(\) \+ card\.ms;/);
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
});

test('no slide card shows while a case card is up, a catheter slide included; they come in once it is lifted', () => {
  // The words keep their leave state behind a case card (wordsIn never lets it go then), and every slide, bare or not
  // (HVPG slide 2 is a catheter slide, whose words used to come in at once under the case), sets it while a case is up.
  assert.match(src, /if \(!caseCard && !bare && !\(throwDir && !s\.visual\)\) text\.classList\.remove\('pz-leave'\);/, 'and never while thrown in later (card-throw.js)');
  assert.doesNotMatch(src.slice(src.indexOf('function wordsIn('), src.indexOf('function wordsIn(') + 400), /^\s*text\.classList\.remove\('pz-leave'\);/m);
  assert.match(src, /if \(bare \|\| caseCard\) \{ ui\.text\.classList\.add\('pz-leave'\); ui\.root\.dataset\.bare = ''; \}/);
  // A non-bare slide brings its cards in only after caseEnd (the lift), and cardsIn is what lets the words go.
  assert.match(src, /if \(!bare\) \{ await caseEnd\(cut\); if \(cut\(\)\) return; cardsIn\(\{ i: to, gen: g \}\); \}/);
  assert.match(src, /function cardsIn\(at\) \{ if \(ui\) \{ if \(!reduce\.matches\) holdMotion\(D_SURFACE \+ 220\); if \(at\) \{ entering = at; layout\(\); \} reFit\(\); if \(!bare\) \{ ui\.text\.classList\.remove\('pz-leave'\);/);
});

test('a case card may open a time-lapse: it covers the patient as it loads at the time-lapse\'s own start, and the days play after the lift', async () => {
  // The presenter: no longer skipped on a lapse slide, but only where the lapse has a start of its own to cover; the card's morph leaves the
  // live figure at that start (not at a slide's state), and the slide does not morph to it a second time.
  assert.match(src, /let loaded = false;\s*if \(!skipCase && s\.vignette && ui && !booting && \(!lap \|\| !!own\) && to > lastAt && \(si !== shownState \|\| liveOff \|\| !!own\)\) \{ if \(!await caseRun\(s, si, st, cut, !!own\)\) return; loaded = true; \}/);
  assert.match(src, /const swap = !loaded && \(si !== shownState \|\| liveOff \|\| !!own\);/);
  const run = src.slice(src.indexOf('async function caseRun('), src.indexOf('// A question card (slide field question)'));
  assert.match(run, /shownState = own \? -1 : si;/);
  // The days play only once the cards are in, which is after the lift.
  assert.ok(src.indexOf('await caseEnd(cut); if (cut()) return;\n      bare = false') < src.indexOf('if (lap) await playLapse(s, to, cut);'));
  // The worker gives a time-lapse step a start of its own only with params: a case slide with a preset, a vignette and a lapse names its params.
  const out = [];
  const core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps: [{ preset: 'healthy' }, { preset: 'csph', params: { cirrhosis: 0.75 }, days: 365, fine: true }, { preset: 'csph', days: 365, fine: true }], reqId: 1 });
  core.dispose();
  assert.ok(out[1].start?.snap && out[1].start.fp, 'with params the lapse has its own start');
  assert.ok(out[1].start.fp.hvpg > out[1].fp.hvpg, 'the start is the patient before the days run (the cure has not yet lowered it), not where they end');
  assert.equal(out[2].start, null, 'without params there is no start to cover');
});

test('the case card fades on the frame clock, from where it stands, never on a CSS transition', () => {
  const fade = src.slice(src.indexOf('function caseFade('), src.indexOf('let caseLift = null'));
  assert.match(fade, /glideTranslate\(c, 0, on \? RISE_CASE : 0, 0, on \? 0 : RISE_CASE, ms, easeArrive\)/);
  assert.match(fade, /glideOpacity\(c, on \? 0 : 1, on \? 1 : 0, ms, easeArrive\)/);
  assert.match(src, /c\.classList\.add\('on'\);\s*caseFade\(c, true, ms\);/);
  assert.match(css, /\.pz-case \{[^}]*translate: 0 14px;/);
});
