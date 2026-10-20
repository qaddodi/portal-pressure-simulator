import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A phone's data card has three states and no Show or Hide (Mohammad, 17 Oct, round 2 A): partly open with its second part on a
// sheet whose edge shows under the card, fully open with the sheet flush, and closed to its edges at the top.
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

test('a phone instrument card shows the instrument first, its readings on a sheet whose edge carries the handle', () => {
  assert.match(js, /const dd0 = ui\.data, sheet = p && dd0\.classList\.contains\('has-tool'\) && !dd0\.classList\.contains\('tool-only'\);/, 'upright only: on its side the card shows everything');
  assert.match(js, /dd0\.classList\.toggle\('pz-sheet', sheet\);/);
  assert.match(js, /if \(sheet && dd0\.classList\.contains\('tool-open'\) && dd0\.dataset\.openFor !== String\(want\)\) \{ stopUnder\(\); dd0\.classList\.remove\('tool-open'\); \}/, 'each slide arrives partly open');
  // (Mohammad, 17 Oct: "I thought the Doppler will show first": the sheet holds the tiles, or the strip, never the instrument.)
  assert.match(js, /\(data\.classList\.contains\('pz-sheet'\) && !data\.classList\.contains\('tool-only'\)\) \? \(tiles\.el\.querySelector\('\.pz-tile'\) \? tiles\.el : ladder\.strip\) : tools\.el\);/);
  assert.match(css, /\.pz\.stack \.pz-data:is\(\.tool-lead, \.pz-sheet\):not\(\.tool-open\) > :is\(\.pz-tiles, \.pz-strip\) \{ max-height: 0; opacity: 0;/);
  assert.doesNotMatch(css, /\.pz:is\(\.stack, \.low\) \.pz-data\.has-tool:not\(\.tool-only\):not\(\.tool-open\) \.pz-tool \{ max-height: 0/, 'the instrument never folds away on a phone');
  assert.doesNotMatch(css, /tool-only:has\(\.pz-tool\[data-kind="flowtime"\]\):not\(\.tool-open\) \.pz-tool/, 'nor the after-meal chart alone');
  // (The edge is the card's sibling, kept at its foot: inside the card, its glass clipped it away on an iPhone.)
  assert.match(js, /fk, text, data, lip, panel,/);
  assert.match(js, /l\.style\.left = px\(d\.offsetLeft\); l\.style\.width = px\(d\.offsetWidth\); l\.style\.top = px\(d\.offsetTop \+ \(sliding && slip\.h0 != null \? slip\.h0 \+ u \* slip\.d : d\.offsetHeight\)\);/);
  assert.match(js, /l\.style\.translate = d\.style\.translate;/, 'it moves with the card');
  assert.match(js, /dockTouch\(data, lip\);/, 'and takes the card\'s own pulls and pushes');
  const edge = css.match(/\.pz:is\(\.stack, \.low\) \.pz-lip::before \{[^}]*\}/)?.[0] ?? '';
  assert.match(edge, /inset: 0 14px;/, 'a little narrower than the card');
  assert.match(edge, /background: color-mix\(in srgb, var\(--surface-2\) 94%, transparent\)/, 'a little darker');
  assert.match(css, /\.pz:is\(\.stack, \.low\) \.pz-data\.tool-open \+ \.pz-lip \{ margin-top: -24px; \}/, 'fully open: in the card\'s foot');
  assert.match(css, /\.pz:is\(\.stack, \.low\) \.pz-data\.tool-open \+ \.pz-lip::before \{ inset: 0; background-color: transparent;/, 'flush, the step gone');
  assert.match(css, /\.pz-lip \{ display: none; \}/, 'only on a phone');
});

test('no Show or Hide on a phone: the chip is never shown upright or sideways', () => {
  assert.doesNotMatch(css, /\.pz:is\(\.stack, \.low\)[^{]*\.pz-fold \{[^}]*display: inline-flex/);
  assert.doesNotMatch(css, /\.pz\.stack[^{]*\.pz-fold \{/);
  assert.doesNotMatch(js, /phoneFoldH|pz-ftight/);
});

test('closing the card leaves its edge and the sheet\'s at the top, and it opens again partly', () => {
  assert.match(js, /if \(phone\(\)\) return \[0, GRIP - \(lipOn\(d\) \? LIP : 0\) - \(d\.offsetTop \+ d\.offsetHeight\)\];/);
  assert.match(js, /if \(to === 1 && ui\?\.data\.classList\.contains\('pz-sheet'\) && ui\.data\.classList\.contains\('tool-open'\)\) ui\.setFold\(false\);/);
  // (The handle's tap steps through the three states: partly, fully, closed, then partly again.)
  // (Upright, the readings' card tucks away first: tests/upright-tablet-phone.test.js.)
  assert.match(js, /if \(dock\.to === 1\) \{ dock\.auto = false; dockTo\(0\); \}\n\s*else if \(data\.classList\.contains\('tool-open'\)\) \{ if \(split\) \{ dock\.down = want; setFold\(false\); \} else \{ dock\.auto = false; dockTo\(1\); \} \}\n\s*else if \(split && dock\.down === want\) \{ dock\.auto = false; dockTo\(1\); \}\n\s*else setFold\(true\);/);
  assert.match(js, /if \(performance\.now\(\) - \(dock\.tapAt \|\| 0\) < 700\) return;/, 'a touch that already opened it is not taken twice');
  // (A pull down on a partly open card brings the sheet out; a push up from either open state is the dock drag.)
  assert.match(js, /\(!btn\.offsetWidth && !sheet\) \|\| \(sheet && open && !split\)/, 'a phone\'s open sheet: the push up is the dock drag');
});

test('a slide whose card does not fit comes in closed, and the next one that fits brings it back', () => {
  const auto = js.match(/function autoDock\(shut\) \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
  assert.match(auto, /if \(shut && dock\.to === 0 && dock\.autoKey !== key && [^{]*\) \{ dock\.autoKey = key; dock\.auto = true;/, 'once per slide: brought back by the reader, it stays');
  assert.match(auto, /else if \(!shut && dock\.auto && dock\.to === 1\) \{ dock\.auto = false;/, 'a card the reader closed stays closed');
  assert.match(js, /const shut = !gone && \(both - data < words \|\| data - sheetLip > dmax \+ 0\.5\)/);
  assert.match(js, /if \(key\) phoneLock = \{ key, cap, shut, data: full, fig: phoneFig \};/);
  // (Brought back, it may cover the figure, never the words: the figure's share is kept only while it fits.)
  assert.match(js, /!phoneShut && !dd\.classList\.contains\('tool-open'\)/);
});

// A phone on its side shows the compact instrument with its tiles, all at once (Mohammad, 17 Oct: "Compact and they all show no
// need to open or pull"): the upright phone's compact instrument layouts, shorter.
test('a sideways phone shows the compact instrument and its tiles together, no sheet', () => {
  assert.match(css, /, \.pz\.stack \.pz-data\.has-tool, \.pz\.low \.pz-data\.has-tool\) \.pz-tool\[data-kind="doppler"\] \.dop-report \{ display: contents; \}/);
  assert.match(css, /\.pz\.low\.low \.pz-data\.has-tool\.has-tool \.pz-tool\[data-kind="doppler"\] \.dop-box \{ min-height: 0; height: 120px; \}/);
  assert.match(css, /\.pz\.low\.low \.pz-data\.has-tool\.has-tool \.pz-tool\[data-kind="beats"\] \.pt-box \{ height: 96px; min-height: 0; \}/);
  assert.match(css, /\.pz\.stack \.pz-data:is\(\.tool-lead, \.pz-sheet\):not\(\.tool-open\) > :is\(\.pz-tiles, \.pz-strip\)/, 'the tiles fold only upright');
});

// (An upright phone's sheet card waits for its entry hidden by visibility, not opacity, while the slide's camera frames: it still
// counts where it rests, or the figure framed as if no card stood at the top and the card came in over the slide's vessel (the
// test all deck's clot slide on an iPhone, 19 Oct). Only that card: the closed Tests sheet and Details panel are hidden by
// visibility too, and counted, the app opened on every screen size framed small, as if a sheet stood over the figure (19 Oct).)
test('a sheet card waiting unseen for its entry still counts where it rests; a closed sheet or panel never does', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(css, /\.pz\.stack\.stack \.pz-data\.pz-sheet\.pz-hide \{ opacity: 1; visibility: hidden;/, 'the case this guards');
  assert.match(js, /class: 'pz-data stage-blocker pz-hide', 'data-safe': 'right', 'data-safe-rest': '', 'data-safe-waits': ''/);
  // Only the slide's data card waits: no piece of the app (top bar, view switch, vitals, Tests sheet, Details, Treat, History) does.
  assert.ok((html.match(/data-safe=/g) || []).length >= 6);
  assert.doesNotMatch(html, /data-safe-waits/);
  for (const f of ['main.js', 'dock.js', 'card.js']) assert.doesNotMatch(readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8'), /safe-waits|safeWaits/);
  assert.equal((js.match(/data-safe-waits|safeWaits/g) || []).length, 1, 'set once, on the data card');
  // The check itself, run on pieces as each screen size has them: hidden by visibility, it counts only when it waits.
  const src = stage.match(/const unseenCard = (\(el\) => [^\n]+);/);
  assert.ok(src, 'stage.js unseenCard');
  const unseenCard = new Function('getComputedStyle', `return ${src[1]}`)((el) => ({ visibility: el.vis }));
  const piece = (vis, data = {}, cv = true) => ({ vis, dataset: data, ...(cv ? { checkVisibility: () => vis !== 'hidden' } : {}) });
  for (const cv of [true, false]) {   // (Safari before 17.4 has no checkVisibility)
    assert.equal(unseenCard(piece('hidden', { safe: 'bottom', safeRest: '' }, cv)), true, 'a closed Tests sheet or Details panel: not counted');
    assert.equal(unseenCard(piece('hidden', { safe: 'right', safeRest: '' }, cv)), true, 'a closed Treat or History card: not counted');
    assert.equal(unseenCard(piece('visible', { safe: 'bottom', safeRest: '' }, cv)), false, 'an open sheet: counted');
    assert.equal(unseenCard(piece('hidden', { safe: 'top', safeRest: '', safeWaits: '' }, cv)), false, 'the slide data card waiting: counted');
    assert.equal(unseenCard(piece('visible', { safe: 'top' }, cv)), false);
  }
  assert.equal((stage.match(/if \(unseenCard\(el\)\) continue;/g) || []).length, 2, 'both the camera (safeInsets) and the card space (cardSpace)');
  assert.doesNotMatch(stage, /^\s*if \(el\.checkVisibility \? !el\.checkVisibility\(\{ visibilityProperty: true \}\)/m);
});

// Mohammad, 20 Oct (iPhone): a stacked card that came in with its readings' card tucked closed itself when pulled down, instead of
// bringing the readings out. Their pull grows the card, and the layout re-planned mid-pull found it too tall and closed it.
test('pulling the readings out of a stacked card never closes the card', () => {
  assert.match(js, /if \(held\) \{ if \(dd\.classList\.contains\('tool-open'\) \|\| dd\.classList\.contains\('pz-sliding'\) \|\| 'folding' in dd\.dataset \|\|/, 'the plan made as the slide came in holds while the readings move');
  const auto = js.match(/function autoDock\(shut\) \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
  assert.match(auto, /if \(shut && dock\.to === 0 && dock\.autoKey !== key && !dock\.drag && !d\.classList\.contains\('pz-sliding'\) && !\('folding' in d\.dataset\)\)/, 'and the layout never closes a card under the finger');
});

// Mohammad, 20 Oct (iPhone, TIPS Doppler 9): the stacked card's monitor was taller with its readings tucked than out.
test('a stacked card keeps one size with its readings tucked or out: it is fitted with them out', () => {
  assert.match(js, /const under = el === ui\.data && splitSheet\(el\) && !el\.classList\.contains\('tool-open'\) && !el\.classList\.contains\('pz-sliding'\);\n\s*if \(under\) el\.classList\.add\('tool-open'\);/);
  assert.match(js, /if \(under\) \{ el\.classList\.remove\('tool-open'\); ui\.lipMO\?\.takeRecords\(\); \}\n\s*if \(stacked\) \{ el\.style\.removeProperty\('--pz-grow'\); ui\.lipMO\?\.takeRecords\(\); \}\n\s*fitDone\.set\(el, fitSig\(el\)\);/);
});

// Mohammad, 20 Oct (iPhone, TIPS Doppler 3, "With TIPS"): tucking the readings away, the instrument card's glass cut through the
// portal blood bar's names. The card's box was capped at its tucked height while the readings were still partly out, so the box
// was shorter than the instrument and the glass, which ends the readings' travel above the box's foot, ended inside the bar's names.
test('a stacked card\'s cap grows with its readings while they slide, so its glass never cuts the instrument', () => {
  assert.match(css, /\.pz\.stack\.stack \.pz-data\.pz-sheet\.pz-sheet\.pz-sliding:not\(\.tool-open\) \{ --pz-grow: calc\(var\(--pz-u\) \* var\(--pz-d, 0px\)\); \}/, 'mid-slide the cap grows by the share of the readings that is out');
  assert.match(css, /\.pz\.stack\.stack \.pz-data\.pz-sheet\.pz-sheet\.tool-open \{ --pz-grow: var\(--pz-d, 0px\); \}/, 'out, by all of them');
  assert.match(js, /const capT = roomT > 0 \? \(tuck === 'none' \? `\$\{roomT\}px` : `min\(\$\{tuck\}, \$\{roomT\}px\)`\) : tuck;\n\s*if \(roomO > 0\) dd\.style\.maxHeight = capT === 'none' \? `\$\{roomO\}px` : `min\(calc\(\$\{capT\} \+ var\(--pz-grow, 0px\)\), \$\{roomO\}px\)`;/, 'the phone\'s cap takes it, never past the opened card\'s room, even with no tucked room left');
  assert.doesNotMatch(js, /if \(roomT > 0\) dd\.style\.maxHeight/, 'an opened card is capped at its room whatever room the tucked card has');
  // (Fitted at rest, never mid-slide: fitCards' stacked fit runs only without .pz-sliding.)
  assert.match(js, /const under = el === ui\.data && splitSheet\(el\) && !el\.classList\.contains\('tool-open'\) && !el\.classList\.contains\('pz-sliding'\);/);
});

// Mohammad, 20 Oct (iPhone, Sites 3): opening the stacked cards, the upper card grew and its chart snapped to the new size. Open, the
// card was fitted against the opened card's room (no figure share, no sheet edge), tucked against the tucked card's, so the fit, and
// with it the pressure profile's height, changed the moment the readings came out. Now both are fitted against the tucked cap.
test('a stacked card is fitted against its tucked cap whether its readings are out or not, so opening never resizes it', () => {
  assert.match(css, /\.pz\.stack \.pz-data\.has-tool \{ --pz-cap: 50%; max-height: var\(--pz-cap\); \}/);
  assert.match(css, /\.pz\.stack\.stack \.pz-data\.pz-sheet\.has-tool\.tool-open \{ max-height: calc\(var\(--pz-cap\) \+ var\(--pz-d, 0px\)\); \}/);
  assert.match(js, /const tuck = cs\.getPropertyValue\('--pz-cap'\)\.trim\(\) \|\| 'none';/);
  assert.match(js, /const roomT = Math\.floor\(base - LIP - \(phoneCap != null && !phoneShut \? Math\.max\(0, phoneFig \/ k - LIP - 2\) : 0\)\), roomO = Math\.floor\(base\);/, 'the tucked room whatever state the readings are in');
  assert.match(js, /const stacked = el === ui\.data && splitSheet\(el\);\n\s*if \(stacked\) el\.style\.setProperty\('--pz-grow', 'var\(--pz-d, 0px\)'\);/, 'fitted against the cap it has with the readings out, in either state');
});

// Mohammad, 20 Oct (iPhone, One year 8, the abdomen card): opening the stacked cards slowly, the readings' card flickered over the
// instrument card and the ascites gauge hung past its foot. The header and readings zoomed with the fit while tucked but at full size
// once let go to come out (.tool-open), and the slide's sums divided by the fit, right for one zoom only.
test('a stacked card\'s header and readings keep one size tucked, sliding and out, and its slide sums use that size', () => {
  assert.match(css, /\.pz\.stack\.stack \.pz-data\.pz-sheet\.pz-sheet > :not\(\.pz-tool\) \{ zoom: 1; \}/);
  const sheet = css.split('\n').filter((l) => l.startsWith('.pz.stack.stack .pz-data.pz-sheet') || /^\s+(translate|--pz-cut|--pz-m):/.test(l)).join('\n');
  assert.match(sheet, /--pz-cut:/);
  assert.doesNotMatch(sheet, /var\(--pz-fit/, 'no sum in the stacked sheet divides by the fit');
});

// Mohammad, 20 Oct (iPhone, Sites 3): the stacked cards ran into the words. HVPG's bar shows none of its cut-off numbers (5 and 10
// too close), yet every tile in the row kept an empty row for them under its bar. A row whose bars show no number keeps none.
test('a stacked row of tiles whose bars show no cut-off number keeps no empty row for them', () => {
  assert.match(css, /\.pz\.stack \.pz-data \.pz-tiles\.pzb-nonum \.pzt-bar \{ height: 15px; \}/);
  assert.match(js, /row\.classList\.toggle\('pzb-nonum', !bars\.some\(\(b\) => \[\.\.\.b\.querySelectorAll\('\.pzb-l'\)\]\.some\(\(l\) => !l\.classList\.contains\('off'\) && l\.getBoundingClientRect\(\)\.width\)\)\);/);
  assert.match(js, /if \(!bars\.length \|\| bars\.some\(\(b\) => !b\.getBoundingClientRect\(\)\.width\)\) continue;/, 'decided only once the bars are laid out');
  assert.match(js, /el\.classList\.remove\('pzb-nonum'\);/, 'new bars keep the row until fitted');
});

// Mohammad, 20 Oct (iPhone, Sites 3, readings out): the stacked cards ended under the teaching card's glass. The glass reaches the
// deck's tab and 8 px above the words (about 30 px), but the data card's room and the words' plan counted 16 px.
test('a phone\'s data card and the words\' plan leave room for the glass as far as it really reaches, tab included', () => {
  assert.match(js, /const glassLift = \(k\) => \{/);
  assert.match(js, /\(parseFloat\(cs\.top\) \|\| 0\) - glassLift\(k\) - 8 - lip - fig\);/, 'the data card\'s room');
  assert.match(js, /const reach = glassLift\(k\) \* k, both = H - foot - reach - 8 - dtop - FIG_MIN\(H\);/, 'the words\' plan');
  assert.match(js, /const room = H - foot - reach - 8, mine/);
  assert.match(js, /const lift = p && t \? glassLift\(k\) : 16;/, 'the glass itself is placed by the same reach');
  assert.doesNotMatch(js, /- 16 - 8\b/);
});

// Mohammad, 20 Oct (iPhone, Sites 3/12): "started closed". The plan measured the card at full size, its pressure profile 20 px too
// tall to sit beside the figure's share and the words, though the card's own fit shortens that chart (only its height) anyway.
test('a phone\'s card whose chart only shortens comes in half-open with the chart given way, before it would come in closed', () => {
  assert.match(js, /const CHART_GIVE = 0\.8;/);
  assert.match(js, /const elastic = !gone && splitSheet\(dd\) && !!dd\.querySelector\(':scope > \.pz-tool:is\(\[data-kind="profile"\], \[data-kind="flows"\]\)'\);/, 'only charts whose words keep their size');
  assert.match(js, /const data = elastic && both - full < words \? Math\.min\(full, arriving\(CHART_GIVE\)\) : full;/, 'only where full size would close it');
  assert.match(js, /if \(key\) phoneLock = \{ key, cap, shut, data: full, fig: phoneFig \};/, 'the plan is kept against the card at full size, as the check measures it');
  assert.match(js, /if \(fit\) st\.setProperty\('--pz-fit', String\(fit\)\);/);
});

// Review of d4c53ae: measured at CHART_GIVE, a card that had no fit before kept that fit after the measure.
test('a phone\'s plan measuring a card at a given fit puts the card\'s own fit back, none included', () => {
  const nat = js.match(/const natural = \(el, st, fit = 0\) => \{[\s\S]*?\n {4}\};/)?.[0] ?? '';
  assert.match(nat, /if \(sv\[1\]\) st\.setProperty\('--pz-fit', sv\[1\]\); else st\.removeProperty\('--pz-fit'\);/);
  // (The readings' share it is fitted with never changes with the fit: the readings keep their size in every state.)
  assert.match(css, /\.pz\.stack\.stack \.pz-data\.pz-sheet\.pz-sheet > :not\(\.pz-tool\) \{ zoom: 1; \}/);
});
