import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Mac and iPad landscape get the phone's stacked data card (Mohammad, 22 Oct: "is there a way to build something similar for mac and
// ipad, stacked card to show the main card and the stacked card behind it"; "make so I open the stacked card untuck it to the TOP not to the
// bottom. Cuz that's easier to pull up and the teaching card goes up"): the instrument's card in front, the readings' card behind it.
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../styles/app.css');
const js = read('../src/ui/presenter.js');

test('a wide screen stacks every instrument card with readings under the words as two cards, the Gut to heart chart too', () => {
  assert.match(js, /const wide = cardOn && !low;\n\s*ui\.root\.classList\.toggle\('pz-wide', wide\);/);
  // (Mohammad, 22 Oct: "every stacked should be stacked": the Gut to heart chart stacks too, its tiles on the readings' card.)
  assert.match(js, /const dd0 = ui\.data, sheet = \(p \|\| wide\) && dd0\.classList\.contains\('has-tool'\) && !dd0\.classList\.contains\('tool-only'\);/);
  assert.doesNotMatch(js, /stackShort/, 'no chart folds behind Show or keeps its tiles beside it any more');
  assert.doesNotMatch(css, /data-ladder/);
  assert.match(js, /const wideSheet = \(d\) => !!ui\?\.root\.classList\.contains\('pz-wide'\) && d\.classList\.contains\('pz-sheet'\);/);
  // (Its tiles live on the readings' card: none beside the instrument while it is a stack; back beside it when it is not.)
  assert.match(js, /if \(!p\) dd0\.classList\.toggle\('pz-beside', !sheet && dd0\.hasAttribute\('data-beside'\) && !dd0\.classList\.contains\('pz-folds'\)\);/);
});

test('each slide comes in with the readings tucked; the card starts in its place and never closes to the side', () => {
  assert.match(js, /if \(sheet && dd0\.classList\.contains\('tool-open'\) && dd0\.dataset\.openFor !== String\(want\)\) \{ stopUnder\(\); dd0\.classList\.remove\('tool-open'\); \}/);
  assert.doesNotMatch(js, /wideOpen/);
  // (Never folded behind Show: tucking the readings is its smaller state.)
  assert.match(js, /const canFold = [^\n]*&& !dd\.classList\.contains\('pz-sheet'\);/);
  // (Its glass is opaque while it is hidden, so whether it is showing is read from pz-hide: it slides in from the left, never from the right.)
  assert.match(js, /\(dd\.classList\.contains\('pz-sheet'\) \? !dd\.classList\.contains\('pz-hide'\) : \+getComputedStyle\(dd\)\.opacity > 0\.05\)/);
  // (Mohammad, 22 Oct: "shouldn't be able to close the card to the left".)
  assert.match(js, /if \(e\.touches\.length !== 1 \|\| !deck \|\| ui\?\.root\.classList\.contains\('pz-wide'\)\) \{ reset\(\); return; \}/);
  // (A pull up brings the readings out, a push down tucks them.)
  assert.match(js, /g\.dir = wideSheet\(el\) \? -1 : 1;/);
  assert.match(js, /follow\(g, dy \* g\.dir\);/);
});

test('the instrument is fitted to the tucked room; readings that need more room lift the pair, frame by frame, and it comes back down', () => {
  const col = js.match(/function colHeight\(w, dk = 1\) \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
  assert.match(col, /if \(sheet\) \{ d\.classList\.remove\('tool-open', 'pz-sliding'\); ds\.removeProperty\('--pz-u'\); for \(const c of parts\) c\.style\.display = 'none'; \}/, 'measured tucked');
  assert.match(col, /const hh = d\.offsetHeight \+ \(sheet \? LIP : 0\);/, 'with the readings\' card\'s foot');
  assert.match(col, /d\.className = sv\[0\]; ds\.width = sv\[1\];/, 'put back as it was');
  assert.match(col, /d\.classList\.add\('col'\); if \(dk < 1\) ds\.setProperty\('--pz-dk', dk\);/, 'measured at the step asked');
  // (The cap: the tucked room, grown by what is out of the readings; fitted, as an upright phone's, with them out against it.)
  assert.match(js, /const capOf = \(d, room\) => \(wideSheet\(d\) \? `calc\(\$\{\(room \+ slip\.base\)\.toFixed\(1\)\}px \+ var\(--pz-grow, 0px\)\)` : `\$\{room\.toFixed\(1\)\}px`\);/);
  assert.match(js, /const under = el === ui\.data && splitSheet\(el\) && !el\.classList\.contains\('tool-open'\) && !el\.classList\.contains\('pz-sliding'\);/);
  // (Centred for the tucked card, its handle above it; the readings come out upward, the pair rising by their whole travel.)
  assert.match(js, /const tuckH = ws \? dd\.offsetHeight - underU\(dd\) \* dpx \+ LIP : dd\.offsetHeight;/);
  assert.match(js, /if \(ws\) slip\.lift = dpx \+ slip\.base;/);
  // (Moved with the readings' card every frame, by the finger or the ease, and put back when it rests.)
  assert.match(js, /d\.style\.setProperty\('--pz-u', u\.toFixed\(4\)\); liftTo\(u\); slip\.raf = nextFrame\(step\);/);
  assert.match(js, /ui\.data\.classList\.remove\('pz-sliding'\); liftTo\(underU\(ui\.data\)\);/);
  assert.match(js, /el\.style\.setProperty\('--pz-u', u\.toFixed\(4\)\); liftTo\(u\); return;/);
  assert.ok(css.includes('.pz.pz-wide .pz-text, .pz.pz-wide .pz-data.col, .pz.pz-wide .pz-lip, .pz-shade.pz-card:not(.stack):not(.low) { translate: 0 calc(-1 * var(--pz-lift, 0px)); }'), 'the words, their glass, the card and its handle rise together');
});

test('the handle only brings the readings out or tucks them away, eased; it never closes the card', () => {
  assert.match(js, /else if \(wideSheet\(data\)\) setFold\(!data\.classList\.contains\('tool-open'\)\);/);
  assert.match(js, /wideSheet\(d\) \? \(open \? 'Hide the readings' : 'Show the readings'\)/);
  // (setFold slides the readings' card frame by frame, slideUnder, never snapping.)
  assert.match(js, /if \(splitSheet\(data\)\) \{\n\s*const u0 = underU\(data\);/);
});

test('the wide stack draws the phone\'s two pieces of glass upside down, the readings\' card behind the instrument card\'s top', () => {
  const W = '.pz.pz-wide.pz-wide .pz-data.pz-sheet';
  assert.ok(css.includes(`${W}.pz-sheet { --pz-u: 0; --pz-sr: clamp(16px, calc(2.2 * var(--pzh) / var(--vz)), 28px); --pz-in: 8px; padding-top: 10px; background: none;`), 'its corners are the wide card\'s');
  assert.ok(css.includes(`${W}.pz-sheet.tool-open { --pz-u: 1; }`));
  assert.ok(css.includes(`${W}::before { top: calc(var(--pz-u) * var(--pz-d, 0px) - 1px); bottom: -1px; }`), 'the instrument\'s card, below what is out');
  assert.ok(css.includes(`${W}::after { z-index: -2; left: calc(var(--pz-in) - 1px); right: calc(var(--pz-in) - 1px); top: calc(-1px - 24px * (1 - var(--pz-u)));`), 'the readings\' card, above it, behind it and narrower');
  assert.ok(css.includes(`${W}.pz-sheet > .pz-tiles { order: -1;`), 'the readings stand above the instrument');
  assert.ok(css.includes(`${W}.pz-sheet > :not(.pz-tool) { zoom: 1; }`), 'its words keep their size; the picture shrinks instead');
  assert.ok(css.includes('.pz.pz-wide .pz-lip:not([hidden]) { display: block;'), 'the handle shows');
  assert.ok(css.includes('.pz.pz-wide .pz-data > .pz-grip { display: none; }'), 'no edge handle: it never docks to the side');
  // (It comes and goes whole, its glass opaque while its parts fade, the old card's top glide kept.)
  assert.ok(css.includes(`${W}.pz-hide { opacity: 1; visibility: hidden; transition: transform .32s var(--ease), visibility 0s linear .32s; }`));
  assert.ok(css.includes(`${W}:not(.pz-hide) { visibility: visible; transition: transform .5s var(--ease) .12s, top .45s var(--ease), visibility 0s linear 0s; }`));
});

// The Gut to heart chart is drawn at its own size and never zoomed by the fit (styles/app.css), so where the pair is too tall for it even at the
// smallest steps it is not folded or shrunk: the words' card rises with the data card, its top slipping behind the screen's top if need be
// (Mohammad, 22 Oct: "It's ok if the top of the teaching card slips behind upper part of the screen as the info below is more pertinent").
test('a Gut to heart chart too tall for the room under the words lifts the pair by slip.base instead of spilling', () => {
  assert.match(js, /slip\.base = 0;\n/, 'worked out afresh on every pass');
  assert.match(js, /if \(wideSheet\(dd\) && dd\.hasAttribute\('data-ladder'\)\) \{\n\s*const b = Math\.max\(0, Math\.min\(top0 \+ t\.height \+ 2 \* pad \+ gap \+ ch - foot, t\.height \+ 2 \* pad \+ gap\)\) \/ k;\n\s*slip\.base = b > 0\.5 \? b : 0;/);
  assert.match(js, /if \(!\(below && t && wideSheet\(dd\)\)\) \{ slip\.lift = 0; slip\.base = 0; \}/);
  // (The rise is the base always, and the readings add the rest of their lift on top, by u.)
  assert.match(js, /const liftTo = \(u\) => \{ const w = slip\.base \+ \(u > 0 \? u \* Math\.max\(0, slip\.lift - slip\.base\) : 0\)/);
});
