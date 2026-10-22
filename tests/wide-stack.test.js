import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Mac and iPad landscape get the phone's stacked data card (Mohammad, 22 Oct: "is there a way to build something similar for mac and
// ipad, stacked card to show the main card and the stacked card behind it"; "You can make the teaching card move up a little bit to
// make room if the bottom doesn't fit"): the instrument's card in front, the readings' card behind it.
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../styles/app.css');
const js = read('../src/ui/presenter.js');

test('a wide screen stacks its instrument card under the words as two cards, a Gut to heart chart excepted', () => {
  assert.match(js, /const wide = cardOn && !low;\n\s*ui\.root\.classList\.toggle\('pz-wide', wide\);/);
  assert.match(js, /sheet = \(p \|\| \(wide && !dd0\.hasAttribute\('data-ladder'\)\)\)/);
  assert.match(js, /data\.toggleAttribute\('data-ladder', s\.tool\?\.kind === 'profile'\);/);
  assert.match(js, /const wideSheet = \(d\) => !!ui\?\.root\.classList\.contains\('pz-wide'\) && d\.classList\.contains\('pz-sheet'\);/);
  // (Its tiles live on the readings' card: none beside the instrument while it is a stack; back beside it when it is not.)
  assert.match(js, /if \(!p\) dd0\.classList\.toggle\('pz-beside', !sheet && dd0\.hasAttribute\('data-beside'\) && !dd0\.classList\.contains\('pz-folds'\)\);/);
});

test('each slide brings the readings out; the reader\'s tuck is kept on that slide; a card that is no stack lets go of it', () => {
  assert.match(js, /else if \(sheet && !p && dd0\.dataset\.openFor !== String\(want\)\) \{ stopUnder\(\); dd0\.classList\.add\('tool-open'\); dd0\.dataset\.openFor = String\(want\); dd0\.dataset\.wideOpen = ''; \}/);
  assert.match(js, /else if \(!sheet && 'wideOpen' in dd0\.dataset\) \{ delete dd0\.dataset\.wideOpen; if \(!p\) dd0\.classList\.remove\('tool-open'\); \}/);
  // (Never folded behind Show: tucking the readings is its smaller state.)
  assert.match(js, /const canFold = [^\n]*&& !dd\.classList\.contains\('pz-sheet'\);/);
});

test('the instrument is fitted to the tucked room; readings that need more room lift the pair, frame by frame, and it comes back down', () => {
  const col = js.match(/function colHeight\(w, dk = 1\) \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
  assert.match(col, /if \(sheet\) \{ d\.classList\.remove\('tool-open', 'pz-sliding'\); ds\.removeProperty\('--pz-u'\); for \(const c of parts\) c\.style\.display = 'none'; \}/, 'measured tucked');
  assert.match(col, /const hh = d\.offsetHeight \+ \(sheet \? LIP : 0\);/, 'with the readings\' card\'s foot');
  assert.match(col, /d\.className = sv\[0\]; ds\.width = sv\[1\];/, 'put back as it was');
  assert.match(col, /d\.classList\.add\('col'\); if \(dk < 1\) ds\.setProperty\('--pz-dk', dk\);/, 'measured at the step asked');
  // (The cap: the tucked room, grown by what is out of the readings; fitted, as an upright phone's, with them out against it.)
  assert.match(js, /const capOf = \(d, room\) => \(wideSheet\(d\) \? `calc\(\$\{\(room - LIP\)\.toFixed\(1\)\}px \+ var\(--pz-grow, 0px\)\)` : `\$\{room\.toFixed\(1\)\}px`\);/);
  assert.match(js, /const under = el === ui\.data && splitSheet\(el\) && !el\.classList\.contains\('tool-open'\) && !el\.classList\.contains\('pz-sliding'\);/);
  // (Centred for the tucked card; the rise is what the readings would reach past the foot, at most the words' card and the gap.)
  assert.match(js, /const tuckH = ws \? dd\.offsetHeight - underU\(dd\) \* dpx \+ LIP : dd\.offsetHeight;/);
  assert.match(js, /if \(ws\) slip\.lift = Math\.max\(0, Math\.min\(top0 \+ shift \+ t\.height \+ 2 \* pad \+ gap \+ \(tuckH - LIP \+ dpx\) \* k - foot, t\.height \+ 2 \* pad \+ gap\)\) \/ k;/);
  // (Moved with the readings' card every frame, by the finger or the ease, and put back when it rests.)
  assert.match(js, /d\.style\.setProperty\('--pz-u', u\.toFixed\(4\)\); liftTo\(u\); slip\.raf = nextFrame\(step\);/);
  assert.match(js, /ui\.data\.classList\.remove\('pz-sliding'\); liftTo\(underU\(ui\.data\)\);/);
  assert.match(js, /el\.style\.setProperty\('--pz-u', u\.toFixed\(4\)\); liftTo\(u\); return;/);
  assert.ok(css.includes('.pz.pz-wide .pz-text, .pz.pz-wide .pz-data.col, .pz.pz-wide .pz-lip, .pz-shade.pz-card:not(.stack):not(.low) { translate: 0 calc(-1 * var(--pz-lift, 0px)); }'), 'the words, their glass, the card and its handle rise together');
  // (A slide whose readings would lift the words comes in with them tucked, its words whole.)
  assert.match(js, /else if \(slip\.lift > 0\.5 && dd\.dataset\.wideOpen === '' && dd\.classList\.contains\('tool-open'\) && \(off\(dd\) \|\| dd\.classList\.contains\('pz-hide'\) \|\| ui\.root\.classList\.contains\('pz-prep'\)\)\) \{ stopUnder\(\); dd\.classList\.remove\('tool-open'\); dd\.dataset\.wideOpen = 'tucked'; \}/);
});

test('the handle only brings the readings out or tucks them away, eased; it never closes the card', () => {
  assert.match(js, /else if \(wideSheet\(data\)\) setFold\(!data\.classList\.contains\('tool-open'\)\);/);
  assert.match(js, /wideSheet\(d\) \? \(open \? 'Hide the readings' : 'Show the readings'\)/);
  // (setFold slides the readings' card frame by frame, slideUnder, never snapping.)
  assert.match(js, /if \(splitSheet\(data\)\) \{\n\s*const u0 = underU\(data\);/);
});

test('the wide stack draws the phone\'s two pieces of glass with the wide card\'s corners', () => {
  const W = '.pz.pz-wide.pz-wide .pz-data.pz-sheet';
  assert.ok(css.includes(`${W}.pz-sheet { --pz-u: 0; --pz-sr: clamp(16px, calc(2.2 * var(--pzh) / var(--vz)), 28px); --pz-in: 8px; background: none;`), 'its corners are the wide card\'s');
  assert.ok(css.includes(`${W}.pz-sheet.tool-open { --pz-u: 1; }`));
  assert.ok(css.includes(`${W}::before { top: -1px; height: calc(100% + 1px - var(--pz-u) * var(--pz-d, 0px)); }`), 'the instrument\'s card');
  assert.ok(css.includes(`${W}::after { z-index: -2; left: calc(var(--pz-in) - 1px); right: calc(var(--pz-in) - 1px); bottom: calc(-1px - 24px * (1 - var(--pz-u)));`), 'the readings\' card, behind it and narrower');
  assert.ok(css.includes(`${W}.pz-sheet.tiles-only > .pz-tiles { margin-top: calc(14px - (1 - var(--pz-u)) * var(--pz-d, 0px)); }`));
  assert.ok(css.includes(`${W}.pz-sheet > :not(.pz-tool) { zoom: 1; }`), 'its words keep their size; the picture shrinks instead');
  assert.ok(css.includes('.pz.pz-wide .pz-lip:not([hidden]) { display: block;'), 'the handle shows');
  // (It comes and goes whole, its glass opaque while its parts fade, the old card's top glide kept.)
  assert.ok(css.includes(`${W}.pz-hide { opacity: 1; visibility: hidden; transition: transform .32s var(--ease), visibility 0s linear .32s; }`));
  assert.ok(css.includes(`${W}:not(.pz-hide) { visibility: visible; transition: transform .5s var(--ease) .12s, top .45s var(--ease), visibility 0s linear 0s; }`));
});
