// Opening or closing a card keeps the zoom and pans the view (Mohammad, 17 Nov 2026: "opening the test card should not zoom to fit automatically on
// mac at least", then "even on phone", then: "the zoom should remain the same when opening the cards; but the view should shift to keep as much as
// possible within the available window"). It reverses the 13 Nov U3 rule, which fitted (resized) the figure to the room the cards leave.
// Root cause: the framing counted the open cards in the room it SIZED the figure in, so every card change (main.js refitStage, the card's pps:occ, the
// resize after it) glided the figure to a smaller fit; the lobule did the same with its own free room (finding 21: zoomed in on a Mac, Tests blanked it).
// Now the size comes from the bars' room alone (stage-fit.js fIns, lobule-zoom.js liveFreeInto) and the cards only pan (card-clear.js panInto).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unsnap } from './unsnap.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { panInto } from '../src/ui/card-clear.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => unsnap(readFileSync(join(root, f), 'utf8'));
const between = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)));

test('panInto: inside stays, narrower moves just far enough, wider is centred (equal loss at both ends)', () => {
  assert.equal(panInto(100, 400, 0, 1000), 0, 'already inside');
  assert.equal(panInto(700, 1100, 0, 1000), -100, 'a card took the right: just clear of it');
  assert.equal(panInto(-50, 300, 0, 1000), 50, 'off the left edge: brought in');
  assert.equal(panInto(0, 1200, 0, 700), -250, 'wider than the room: centred in it, the zoom is not touched');
  assert.equal(panInto(0, 1200, 500, 1200), 250, 'centre to centre');
  assert.equal(panInto(5, 5, 0, 10), 0, 'an empty span asks nothing');
  assert.equal(panInto(0, 10, 5, 5), 0, 'an empty room asks nothing');
});

test('no card opens, closes or changes size by a refit that sizes the figure: they all pan (cardsMoved)', () => {
  const main = read('src/ui/main.js');
  assert.match(main, /const stageRefit = \(\) => stage\?\.cardsMoved\(\);/, 'every card (Tests, Details, Treat, History) goes through refitStage');
  assert.doesNotMatch(main, /const stageRefit = \(\) => stage\?\.refit\(\);/);
  const set = between(main, 'function setPanelTab(tab) {', '// ── Floating pieces');
  assert.match(set, /if \(!instr\) stage\?\.closeView\(\);\s*refitStage\(\);/, 'Tests: one path for open and close');
  assert.ok((main.match(/refitStage\(\)/g) || []).length >= 6, 'Details, Tests, Treat and History still announce their changes');
});

test('the camera sizes the figure in the room the bars leave and pans it for the cards', () => {
  const fit = read('src/ui/stage-fit.js');
  assert.match(fit, /const CARD_IDS = \['dock', 'panel', 'treatCard', 'historyCard'\];/);
  assert.match(fit, /safeInsets\(false, cardEls\)/, 'the size is worked out without the cards');
  const framing = between(fit, 'function insetVT(v, vbArr) {', 'const circVB');
  assert.match(framing, /const ins = fIns\(\)/);
  assert.doesNotMatch(framing, /safeInsets\(\)/);
  assert.match(between(fit, 'function uprightFit() {', 'function clearPill('), /uprightFitOf\(fIns\(\)/);
  const dflt = between(fit, 'function defaultVT(circuit) {', 'const circAt');
  assert.doesNotMatch(dflt, /safeInsets\(\)/, 'the fit never reads the cards for its size');
  assert.match(dflt, /return cardPanVT\(\{ k, x: cx - k \* \(\(x0 \+ x1\) \/ 2\)[^;]*VB_ANAT, ab\);/, 'the anatomy fit is panned for the cards, k untouched');
  assert.equal((dflt.match(/cardPanVT\(/g) || []).length, 3, 'anatomy, circuit whole map, circuit close-up');
  assert.match(fit, /const circWhole = \(\) => cardPanVT\(/);
  // the pan keeps k
  assert.match(between(fit, 'function cardPanVT(', 'let cardBase'), /return dx \|\| dy \? \{ k: v\.k, x: v\.x \+ dx \/ s0, y: v\.y \+ dy \/ s0 \} : v;/);
});

test('a view the learner placed is panned by the same amount, and brought back when the card closes, never refitted', () => {
  const fit = read('src/ui/stage-fit.js');
  const mv = between(fit, 'function cardsMoved() {', 'function safeInsetsFrom(');
  assert.match(mv, /if \(live\.fitted\) \{ cardBase = null; refit\(\); return; \}/, 'a fitted view is framed again (same size, panned)');
  assert.match(mv, /cardBase && sameView\(cur, cardBase\.at\)/, 'from where the view stood before our last pan, unless the learner moved it');
  assert.doesNotMatch(mv, /\bk: (?!cur\.k)/, 'the zoom is only ever the view\'s own');
  assert.match(mv, /animateVT\(to, 420, \{ steady: true \}\)/, 'a glide, never a jump');
});

test('Fit pressed on purpose still sizes the figure to the room the open cards leave, until none is open', () => {
  const fit = read('src/ui/stage-fit.js');
  assert.match(fit, /if \(cardsCount\) return safeInsets\(\);/);
  assert.match(between(fit, 'const fit = () => {', 'let refitAsk'), /cardsCount = true;/);
  assert.match(fit, /if \(cardsCount && !cardsSnap\.some\(\(c\) => cardEls\?\.includes\(c\.el\)\)\) cardsCount = false;/);
});

test('what must keep the real cards still does: the catheter room and a vessel reveal', () => {
  const fit = read('src/ui/stage-fit.js');
  assert.match(between(fit, 'function reveal(', 'function unreveal'), /const ins = safeInsets\(\);/);
  const cath = read('src/ui/stage-cath.js');
  assert.match(cath, /ins = safeInsets\(\)/);
  assert.match(cath, /cardSpaceRead\(\)/);
});

test('the lobule too: sized in the bars\' room, panned for the cards, a zoomed view moved by the same amount (finding 21)', () => {
  const main = read('src/ui/main.js');
  assert.match(main, /'--dock-occ': px\(vdock \+ gap\)/, 'the bottom bar alone, published beside --bot-occ (which holds a sheet above it)');
  const lz = read('src/ui/lobule-zoom.js');
  const free = between(lz, 'function liveFreeInto(o) {', "// The lobule and its labels' places");
  assert.match(free, /cssN\('--dock-occ'\)/, 'the bottom of the size room is the bar, not the bar and a card\'s sheet');
  assert.match(free, /r0 = W - pzR/, 'and its right edge is the stage, not the cards');
  assert.match(free, /lzPan\.x = panInto\(l, r0m, l, r1m\); lzPan\.y = panInto\(t, b0, t, b1\);/, 'the cards\' room is where it is panned to');
  assert.match(free, /o\.r = r0m \+ lzPan\.x/, 'width unchanged, so kFit is unchanged');
  const refit = between(lz, 'function refit() {', '// Zoomed in (a presenter');
  assert.match(refit, /lzApplied\.x = lzPan\.x/);
  assert.match(refit, /else reclamp\(dx, dy\);/, 'a zoomed or panned lobule moves by the pan');
  assert.match(lz, /function reclamp\(dx = 0, dy = 0\) \{[^}]*V\.x \+= dx; V\.y \+= dy; clampV\(\);/);
  assert.match(lz, /lzApplied\.x = lzPan\.x; lzApplied\.y = lzPan\.y;/, 'a lobule framed fresh is framed for the cards as they stand');
});

test('the zoom pill: its buttons are positioned, so a hovered button\'s tint covers only itself (hovering − hid +)', () => {
  const css = readFileSync(join(root, 'styles/app-07-floating.css'), 'utf8');
  const rule = css.split('\n').find((l) => l.startsWith('.zoom-pill .ib, .zoom-pill .stage-fit, .zoom-pill .stage-rotate {'));
  assert.ok(rule, 'the pill button rule');
  assert.match(rule, /position: relative;/, 'static put the ::before (inset 0) over the whole pill: it covered the buttons above it');
  assert.doesNotMatch(rule, /position: static/);
});

test('a one-line tooltip never wraps in the page\'s own words', () => {
  assert.match(read('src/ui/util.js'), /tip\.classList\.toggle\('one-line', L\.lines\.length === 1\);/);
  assert.match(readFileSync(join(root, 'styles/app-02-controls.css'), 'utf8'), /\.tooltip\.one-line \{ white-space: nowrap; \}/);
});
