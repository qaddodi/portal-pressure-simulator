import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// An upright iPad takes the phone's layout (Mohammad, 17 Oct: "replicate the phone cards and behavior of the bottom bar and cards
// to the upright iPad"): its cards, sheets, bottom bar, menus and the Tests card's one column. Its decks' instrument cards open
// their readings on a card of their own under the instrument ("The top data card doesn't truly open as an extended card under
// the Doppler. It should.").
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../styles/app.css');
const util = read('../src/ui/util.js');
const js = read('../src/ui/presenter.js');
const UP = '(max-width: 1100px) and (orientation: portrait)';

test('one query names the phone layout, and it takes in an upright tablet', () => {
  assert.match(util, /export const UPRIGHT_MQ = '\(max-width: 1100px\) and \(orientation: portrait\)';/);
  assert.match(util, /export const SIDEWAYS_MQ = '\(max-width: 1023px\) and \(max-height: 500px\) and \(orientation: landscape\)';/);
  assert.match(util, /export const PHONE_MQ = `\(max-width: 767px\), \$\{SIDEWAYS_MQ\}, \$\{UPRIGHT_MQ\}`;/);
  assert.match(util, /const asSheet = sheet && \(innerWidth < 768 \|\| matchMedia\(UPRIGHT_MQ\)\.matches\);/, 'menus rise as sheets');
  assert.match(read('../src/ui/main.js'), /const isPhone = isPhoneLayout;/, 'the dock, the cards\' sheets, History and the occupancy');
  assert.match(read('../src/ui/card.js'), /if \(isPhoneLayout\(\)\) \{\n\s*if \(el\.parentNode !== dockHost\) dockHost\.append\(el\);/, 'the vessel card docks over the tab row');
  assert.match(read('../src/ui/menu.js'), /const sheetMQ = matchMedia\(PHONE_MQ\);/);
  const dock = read('../src/ui/dock.js');
  assert.match(dock, /const ratio = heightRatio \?\? \(isPhoneLayout\(\) \? 0\.56 : 0\.46\);/);
  // (The thumb dock is the same screens: an upright tablet had the phone's tab row but not its cards.)
  assert.match(read('../src/ui/main.js'), /const thumbMQ = matchMedia\('\(max-width: 1100px\) and \(orientation: portrait\)'\);/);
  for (const f of ['main.js', 'card.js', 'menu.js', 'dock.js']) {
    assert.doesNotMatch(read(`../src/ui/${f}`), /matchMedia\('\(max-width: 767px\)[^']*'\)/, `${f}: no phone query of its own that leaves the upright tablet out`);
  }
});

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
  const m = css.match(/@media \(min-width: 768px\) and \(max-width: 1100px\) and \(orientation: portrait\) \{\n {2}\.app\.thumb \.instrument-workspace\.float-ui:not\(\.side\) \{ --one-col: 1; \}[\s\S]*?\n\}/)?.[0] ?? '';
  assert.ok(m, 'the block');
  assert.match(m, /:is\(\.instrument-view, \.dop-main, \.hv-main, \.ab-main\) \{ grid-template-columns: minmax\(0, 1fr\); \}/, 'Doppler\'s monitor no longer shares its row with a column of readings');
  assert.match(m, /\.ab-ctl \{ margin-top: var\(--ab-g\);[^}]*border-left: 0;/, 'Ascites stacks its controls under the belly');
});

test('an upright phone\'s or tablet\'s deck instrument card opens its readings on a card of their own under it', () => {
  // (Mohammad, 17 Oct: the iPhone too; a phone on its side keeps its compact card, everything shown: not .stack.)
  assert.match(js, /const splitSheet = \(d\) => !!ui\?\.root\.classList\.contains\('stack'\) && d\.classList\.contains\('pz-sheet'\);/, 'every upright phone and tablet');
  assert.doesNotMatch(js, /tabSheet\(/);
  assert.doesNotMatch(css, /\.pz\.stack\.tab \.pz-data\.pz-sheet/, 'no rule left for the tablet alone');
  // (Two stacked cards: the instrument's in front, the readings' behind it, its top never seen (Mohammad, 17 Oct: "it's as if they are
  // TWO cards ... should remain attached to the card above it and we never see the top of the tiles card").)
  assert.match(css, /\.pz\.stack\.stack \.pz-data\.pz-sheet\.pz-sheet \{ --pz-u: 0; --pz-sr: 18px; --pz-in: 8px; background: none; -webkit-backdrop-filter: none; backdrop-filter: none; border-color: transparent; box-shadow: none; overflow: visible; isolation: isolate; \}/);
  assert.match(css, /\.pz\.stack\.stack \.pz-data\.pz-sheet\.pz-sheet\.tool-open \{ --pz-u: 1; \}/, 'at rest the class says where the readings are');
  assert.match(js, /if \(sheet !== dd0\.classList\.contains\('pz-sheet'\) && p && dd0\.classList\.contains\('pz-hide'\)\) \{/, 'its glass never shows fading between two slides');
  // (The instrument's glass ends where the card ends with the readings tucked, whatever share of them is out.)
  assert.match(css, /\.pz\.stack\.stack \.pz-data\.pz-sheet::before \{ top: -1px; height: calc\(100% \+ 1px - var\(--pz-u\) \* var\(--pz-d, 0px\)\); \}/);
  // (The readings' card behind it, 22 px of its top under the instrument card's foot, its foot 24 px out while tucked; shown only under
  // the instrument card and behind its rounded corners: no gap, no line, no top edge.)
  assert.match(css, /\.pz\.stack\.stack \.pz-data\.pz-sheet::after \{ z-index: -2; left: calc\(var\(--pz-in\) - 1px\); right: calc\(var\(--pz-in\) - 1px\); bottom: calc\(-1px - 24px \* \(1 - var\(--pz-u\)\)\); height: calc\(var\(--pz-d, 0px\) \+ 23px\); border-top-left-radius: 0; border-top-right-radius: 0;/);
  assert.match(css, /--pz-m: calc\(22px - var\(--pz-sr\) \+ \(1 - var\(--pz-u\)\) \* \(var\(--pz-d, 0px\) - 24px\)\);/);
  assert.match(css, /mask: linear-gradient\(#000 0 0\) 0 calc\(var\(--pz-m\) \+ var\(--pz-sr\)\) \/ 100% 100% no-repeat, radial-gradient\(circle at 100% 0,/);
  assert.doesNotMatch(css, /pz-sheet:not\(\.tool-open\):not\(\.pz-sliding\)::after \{ visibility: hidden; \}/, 'tucked, its foot is the edge under the card');
  assert.match(css, /\.pz\.stack \.pz-data\.pz-sheet \+ \.pz-lip::before \{ content: none; \}/, 'the handle\'s button draws only the handle');
  // (The readings move with their card and are cut at the instrument card's foot while behind it.)
  assert.match(css, /\.pz\.stack\.stack \.pz-data\.pz-sheet\.pz-sheet\.tiles-only > \.pz-tiles \{ margin-top: calc\(14px - \(1 - var\(--pz-u\)\) \* var\(--pz-d, 0px\)\); \}/);
  assert.match(css, /translate: 0 calc\(24px \* \(1 - var\(--pz-u\)\)\);/);
  assert.match(css, /--pz-cut: calc\(\(\(1 - var\(--pz-u\)\) \* \(var\(--pz-d, 0px\) - 24px\) \+ 10px - var\(--pz-gap, 6px\)\) - 14px - var\(--pz-o, 0px\)\);/, 'cut at the instrument card\'s foot');
  assert.match(css, /\.pz\.stack\.stack \.pz-data\.pz-sheet\.tool-open \{ padding-bottom: 10px; \}/, 'the padding never changes');
  // (Measured in the card's own px, without its height cap; frame by frame, never a CSS transition: the card is frosted glass.)
  assert.match(js, /d\.style\.maxHeight = 'none';\n\s*parts\[0\]\.style\.marginTop = '14px';/);
  assert.match(js, /d\.style\.maxHeight = cap; ui\.lipMO\?\.takeRecords\(\);/, 'its own measure never sets it measuring again');
  assert.match(js, /if \(t < 1\) \{ d\.style\.setProperty\('--pz-u', \(from \+ \(to - from\) \* \(1 - \(1 - t\) \*\* 3\)\)\.toFixed\(4\)\); slip\.raf = nextFrame\(step\); \}/);
  assert.doesNotMatch(css + js, /--pz-top|sheetTop|tabMargins/, 'no measure of the instrument\'s own box');
  // (The handle rides in the readings' card's foot.)
  assert.match(css, /\.pz\.stack \.pz-data\.pz-sheet\.pz-sliding \+ \.pz-lip \{ margin-top: calc\(-24px \* var\(--pz-u, 0\)\);/);
  assert.match(js, /l\.style\.top = px\(d\.offsetTop \+ \(sliding && slip\.h0 != null \? slip\.h0 \+ u \* slip\.d : d\.offsetHeight\)\);/);
  // A glass piece inside a fading card loses its blur: the card stays opaque and its parts fade.
  assert.match(css, /\.pz\.stack\.stack \.pz-data\.pz-sheet\.pz-hide \{ opacity: 1; visibility: hidden; transition: transform \.32s var\(--ease\), visibility 0s linear \.32s; \}/);
  assert.match(css, /\.pz\.stack\.stack \.pz-data\.pz-sheet\.pz-hide::before, \.pz\.stack\.stack \.pz-data\.pz-sheet\.pz-hide::after, \.pz\.stack\.stack \.pz-data\.pz-sheet\.pz-hide > :is\(\.pz-dh, \.pz-tool, \.pz-tiles\) \{ opacity: 0; \}/);
  assert.doesNotMatch(css, /pz-strip/, 'no phone ladder strip left to fade');
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
  assert.match(dt, /if \(g\?\.pull\) sheetPull\.settle\(g\.pull, false\);/, 'a cancelled touch tucks them away');
  // (The same follow and settle as the readings' own pull: margins, fade and the eased rest, setFold.)
  assert.match(js, /sheetPull = \{ begin: \(\) => \{ const gg = grab\(0, 0, false\); take\(gg\); return gg; \}, follow, settle \};/);
  assert.match(js, /const u = clamp\(gg\.u0 \* gg\.full \+ dy, 0, gg\.full\) \/ \(gg\.full \|\| 1\);/, 'from wherever the readings stand');
  assert.match(js, /if \(gg\.split\) \{ el\.classList\.add\('pz-sliding'\); el\.style\.setProperty\('--pz-u', u\.toFixed\(4\)\); return; \}/, 'the whole readings\' card follows the finger');
  // (Closing stays two steps: a push up from fully open is the readings' own, a push up from partly open the card's.)
  assert.match(js, /\|\| dock\.lvl > 0 \|\|/, 'the readings\' pull never starts on a closed card: the card\'s drag owns it');
});

// (Mohammad, 17 Oct: the iPhone's bottom bar on an upright iPad, "scaled down proportionally, similar to how much we scalled down
// the teaching cards on ipad", "but also height wise too", "and not fill the whole screen ever, the ipad is too tall for that".)
test('an upright tablet\'s bottom bar and cards take the deck cards\' 70 % of the width, and never the whole height', () => {
  assert.match(util, /export const TABLET_UP_MQ = '\(min-width: 768px\) and \(max-width: 1100px\) and \(orientation: portrait\)';/);
  assert.match(css, /\.pz\.stack\.tab \.pz-data \{ left: 15%; right: 15%; \}/, 'the deck cards\' share');
  const m = css.match(/@media \(min-width: 768px\) and \(max-width: 1100px\) and \(orientation: portrait\) \{\n {2}\.app\.thumb \.vdock:not\(\.mini\) \{ left: 15%; right: 15%; \}[\s\S]*?\n\}/)?.[0] ?? '';
  assert.ok(m, 'the block');
  assert.match(m, /\.app\.thumb :is\(\.panel, \.treat-card, \.instrument-workspace\.float-ui:not\(\.side\)\) \{ left: 15% !important; right: 15% !important; max-height: min\(62%, /, 'Details, Treat and Tests');
  assert.match(m, /\.app\.thumb:not\(\.dock-open\) \.action-card\.docked \{ left: 15% !important; right: 15%; \}/, 'the vessel card');
  assert.match(m, /html\.thumb-ui \.menu\.as-sheet \{ left: 15% !important; right: 15%; max-height: min\(62dvh, /, 'the menus and History');
  // (After the phone's own rules, which it overrides at the same weight.)
  assert.ok(css.indexOf(m) > css.lastIndexOf('html.thumb-ui .menu.as-sheet { box-shadow'), 'after the phone\'s menu sheet');
  assert.ok(css.indexOf(m) > css.lastIndexOf('.app.thumb:not(.dock-open) .action-card.docked {\n'), 'after the phone\'s vessel card');
  const main = read('../src/ui/main.js');
  assert.match(main, /const tabletMQ = matchMedia\(TABLET_UP_MQ\);/);
  assert.match(main, /THUMB = \[0\.62, 1\], TABLET = \[0\.45, 0\.62\];/, 'Half an iPhone\'s 45 % of the screen, Full 62 %');
  assert.match(main, /const stops = \(\) => \(!thumb\(\) \? SIZES : tabletMQ\.matches \? TABLET\.map\(\(s\) => Math\.min\(1, \(s \* app\.clientHeight\) \/ \(room\(\) \|\| app\.clientHeight\)\)\) : THUMB\);/, 'as shares of the room, as the phone\'s');
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
  assert.match(js, /phone\(\) !== ui\.root\.classList\.contains\('stack'\) && dock\.to === 1 && !dock\.auto\) \{ cancelFrame\(dock\.raf\); dock\.to = 0; dock\.lvl = 0;/);
});
