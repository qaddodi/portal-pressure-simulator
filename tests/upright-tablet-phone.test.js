import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unsnap } from './unsnap.js';

// An upright iPad takes the phone's layout (Mohammad, 17 Oct: "replicate the phone cards and behavior of the bottom bar and cards
// to the upright iPad"): its cards, sheets, bottom bar, menus and the Tests card's one column. Its decks' instrument cards open
// their readings on a card of their own under the instrument ("The top data card doesn't truly open as an extended card under
// the Doppler. It should.").
const read = (p) => unsnap(readFileSync(new URL(p, import.meta.url), 'utf8'));
const css = read('../styles/app.css');
const js = read('../src/ui/presenter.js');
const UP = '(max-width: 1100px) and (orientation: portrait)';

test('every phone block in the stylesheet takes in the upright tablet, and every wide one leaves it out', () => {
  const blocks = [...css.matchAll(/@media ([^{]*)\{/g)].map((m) => m[1].trim());
  const phone = blocks.filter((q) => /\(max-width: 767px\)/.test(q));
  assert.ok(phone.length >= 37, `${phone.length} phone blocks`);
  for (const q of phone) assert.ok(q.includes(UP), `phone block without the upright tablet: @media ${q}`);
  for (const q of blocks.filter((b) => /\(min-width: 768px\)/.test(b) && !b.includes('max-width: 1100px'))) {
    assert.equal(q, '(min-width: 768px) and (orientation: landscape), (min-width: 1101px)', `a wide block that still takes the upright tablet: @media ${q}`);
  }
  assert.doesNotMatch(css, /--nb-l|--nb-r/, 'no tablet-only placing of Treat and Tests beside the phone\'s');
});

test('an upright tablet\'s Tests card keeps the phone\'s one column, its picture the card\'s width', () => {
  const m = css.match(/@media \(min-width: 700px\) and \(max-width: 1100px\) and \(orientation: portrait\) \{\n {2}\.app\.thumb \.instrument-workspace\.float-ui:not\(\.side\) \{ --one-col: 1; \}[\s\S]*?\n\}/)?.[0] ?? '';
  assert.ok(m, 'the block');
  assert.match(m, /:is\(\.instrument-view, \.dop-main, \.ab-main\) \{ grid-template-columns: minmax\(0, 1fr\); \}/, 'Doppler\'s monitor no longer shares its row with a column of readings');
  assert.match(m, /\.ab-ctl \{ margin-top: var\(--ab-g\);[^}]*border-left: 0;/, 'Ascites stacks its controls under the belly');
});

test('the first close tucks the readings\' card away, the next closes the instrument card', () => {
  // A push up from fully open is the fold's, not the dock drag's, on an upright tablet.
  assert.match(js, /\(sheet && open && !split\) \|\| dock\.lvl > 0/);
  assert.match(js, /if \(show !== gg\.open\) \{ if \(gg\.split && !show\) dock\.down = want; setFold\(show\); return; \}/);
  // The handle's tap: partly, fully, partly (tucked), closed, partly again.
  assert.match(js, /else if \(data\.classList\.contains\('tool-open'\)\) \{ if \(split\) \{ dock\.down = want; setFold\(false\); \}/);
  assert.match(js, /else if \(split && dock\.down === want\) \{ dock\.auto = false; dockTo\(1\); \}/);
  assert.match(js, /dock\.to = to;\n\s*if \(!to\) dock\.down = -1;/, 'opened again, the cycle starts over');
  assert.match(js, /open \? \(split \? 'Hide the readings' : 'Close the card'\) : split && dock\.down === want \? 'Close the card' : 'Show the rest of the card'/);
});

// (Mohammad, 17 Oct: "I can drag it up to close the tile card first? Then another drag closes both? Then when I open I open the
// main card first but if I keep sliding I can open both in one swipe?")
test('a pull down on the closed card brings out the instrument card, and carried on, the readings\' card in the same pull', () => {
  const dt = js.match(/function dockTouch\(el, \.\.\.more\) \{[\s\S]*?\n {2}\}\n/)?.[0] ?? '';
  assert.ok(dt, 'the closed card\'s own drag');
  // (Past the instrument card's rest, in px down, from a closed card only, upright, its readings tucked.)
  assert.match(dt, /const past = \(g\.lvl0 \+ g\.dl\) \* comp;/);
  assert.match(dt, /if \(g\.lvl0 > 0 && vert && sheetPull && \(g\.pull \|\| \(past > 0 && splitSheet\(el\) && !el\.classList\.contains\('tool-open'\)\)\)\) \{\n\s*g\.pull \|\|= sheetPull\.begin\(\);\n\s*sheetPull\.follow\(g\.pull, Math\.max\(0, past\)\);/, 'they follow the finger, and tuck back under it above that point');
  // (A short pull stops at the instrument card: the readings open only past half way or on a flick down, and only with the card open.)
  assert.match(dt, /if \(gg\.pull\) \{ const show = !to && \(flick < 0 \|\| gg\.pull\.u > 0\.5\); dockTo\(to, 300\); sheetPull\.settle\(gg\.pull, show\); \}/);
  assert.match(dt, /if \(gg\?\.pull\) sheetPull\.settle\(gg\.pull, false\);/, 'a cancelled touch tucks them away');
  // (The same follow and settle as the readings' own pull: margins, fade and the eased rest, setFold.)
  assert.match(js, /sheetPull = \{ begin: \(\) => \{ const gg = grab\(0, 0, false\); take\(gg\); return gg; \}, follow: foldFollow, settle \};/);
  assert.match(js, /const u = clamp\(gg\.u0 \* gg\.full \+ dy, 0, gg\.full\) \/ \(gg\.full \|\| 1\);/, 'from wherever the readings stand');
  assert.match(js, /if \(gg\.split\) \{ el\.classList\.add\('pz-sliding'\); el\.style\.setProperty\('--pz-u', u\.toFixed\(4\)\); liftTo\(u\); camAt\(u\); return; \}/, 'the whole readings\' card follows the finger');
  // (Closing stays two steps: a push up from fully open is the readings' own, a push up from partly open the card's.)
  assert.match(js, /\|\| dock\.lvl > 0 \|\|/, 'the readings\' pull never starts on a closed card: the card\'s drag owns it');
});

// Liver inflow 2 on an upright iPad (18 Oct): a deck started after one whose readings' card travelled as far had no --pz-d on its new
// card, so the readings' card stood out unpulled, a blank panel under the Doppler. Turned on its side, a card closed upright stood off
// the screen's left edge, and Safari's late size after a turn left the cards placed for the upright height (Stiffness 3).
test('the readings\' travel is set on every new card, and a turn lays the cards out for the size the stage settles to', () => {
  assert.match(js, /\|\| !d\.style\.getPropertyValue\('--pz-d'\)\) \{ slip\.d = h1 - h0; d\.style\.setProperty\('--pz-d'/);
  assert.match(js, /cancelFrame\(slip\.raf\); slip\.d = null; slip\.h0 = null;/, 'forgotten when the deck stops');
  assert.match(js, /new ResizeObserver\(\(\) => \{ if \(ui && sizeNow\(\) !== sizeSeen\) onResize\(\{ type: 'resize' \}\); \}\)/);
  assert.match(js, /wrapRO\?\.observe\(wrap\);/);
  assert.match(js, /wrapRO\?\.disconnect\(\);/);
  assert.match(js, /phone\(\) !== ui\.root\.classList\.contains\('stack'\) && dock\.to === 1 && !dock\.auto\) \{ dockHalt\(\); dock\.to = 0; dock\.lvl = 0;/);
});
