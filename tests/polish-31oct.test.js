import { stageSource } from './stage-src.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cutDp, SCALE } from '../src/ui/table-marks.js';
import { removedLabel } from '../src/ui/removed-label.js';
import './dom-shim.js';
const { fmt } = await import('../src/ui/util.js');

// Tile, menu and number polish, 31 Oct (the "Polish tiles, cards and tables" sprint thread).
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const css = src('styles/app.css'), presenter = src('src/ui/presenter.js'), menu = src('src/ui/menu.js'), dock = src('src/ui/dock.js');

test('a scale bar prints every cut-off with the decimals it has', () => {
  assert.equal(fmt(0.15, cutDp(0.15)), '0.15');
  assert.equal(fmt(0.45, cutDp(0.45)), '0.45');
  assert.equal(fmt(2.5, cutDp(2.5)), '2.5');
  assert.equal(fmt(1.1, cutDp(1.1)), '1.1');
  assert.equal(fmt(10, cutDp(10)), '10');
  assert.equal(fmt(0, cutDp(0)), '0');
  // every cut-off on every bar reads back as the number it is (none rounds to a different one)
  for (const [k, [, , cuts]] of Object.entries(SCALE)) for (const c of cuts) assert.equal(+fmt(c, cutDp(c)).replace('−', '-'), c, `${k} ${c}`);
  assert.match(presenter, /fmt\(c, cutDp\(c\)\)/);
});

test('a percent tile sits its unit against the number, and the High word is mixed with the text as the amber word is', () => {
  assert.match(presenter, /class: 'pzt-vu' \+ \(T\.u === '%' \? ' pct' : ''\)/);
  assert.match(css, /\.pz \.pz-data \.pz-tiles \.pz-tile \.pzt-vu\.pct\.pct\.pct \{ column-gap: \.06em; \}/);
  assert.match(css, /\.pz-tile\[data-rate="hi"\] \.pzt-r \{ color: var\(--danger-ink\); \}/);   // (U2: the status ink, the one red, as the amber word beside it takes --caution-ink)
});

test('the patient preview prints its gradients to one decimal and rates the number it prints', () => {
  assert.match(menu, /const one = \(v\) => fmt\(v, 1\);/);
  assert.match(menu, /sev\(HVPG_CUTS, shownOf\(s\.hvpg\)\)/);
  assert.match(menu, /sev\(PPG_CUTS, shownOf\(fp\.ppg\)\)/);
  assert.doesNotMatch(menu, /toFixed\(v < 10/);
});

test('the instrument chips agree with the tiles (the breath-averaged velocity, one decimal of stiffness)', () => {
  assert.match(dock, /pvVelMean \?\? f\.metrics\.pvVel/);
  assert.match(dock, /fmt\(f\.metrics\.lsm, 1\)\} kPa/);
});

test('About the model lists its cut-offs the way the tiles and decks write them, with no value between two bands', () => {
  const a = dock.indexOf('export const CUTOFFS = ['), rows = dock.slice(a, dock.indexOf('];', a));
  const cells = [...rows.matchAll(/'([^']*)'/g)].map((m) => m[1]);
  for (const c of cells) {
    assert.doesNotMatch(c, /[<>≤≥] /, `a symbol sits hard against its number: ${c}`);
    assert.doesNotMatch(c, / %/, `no space before a percent: ${c}`);
    assert.doesNotMatch(c, /\d–\d/, `a range says "to": ${c}`);
  }
  for (const c of ['5.1 to 9.9 (subclinical)', '6 to 11.9', '10.1 to 14.9', '13.1 to 16 cm']) assert.ok(cells.includes(c), c);
});

test('a toggle row in a menu is a plain row with a switch, not a card with a ring', () => {
  assert.match(css, /\.lens-opt \{ grid-template-columns: var\(--ic-s\) 1fr; column-gap: 12px; align-items: center; margin: 0; padding: 8px 12px; border: 0; background: transparent; \}/);
  assert.match(css, /\.lens-opt\.on \{ box-shadow: none; background: transparent; \}/);
  assert.match(css, /\.lens-opt:hover, \.lens-opt\.on:hover \{ background: var\(--surface-2\); \}/);
  assert.match(css, /\.menu-item:focus-visible, \.lens-opt:focus-visible \{ outline-offset: -2px; \}/);
  assert.doesNotMatch(css, /\.blood-pop \.menu-title \{ text-align: center; \}/);
});

test('the iPhone full-screen hint and the text-size letters use the type scale', () => {
  assert.match(css, /\.fs-hint \{ display: block; padding: 4px 12px 8px; font-size: var\(--fs-12\);/);
  assert.match(css, /\.text-size \.ts-sm \{ font-size: var\(--fs-12\); \} \.text-size \.ts-lg \{ font-size: var\(--fs-20\); \}/);
  assert.doesNotMatch(css, /max\(9px, calc\(var\(--s-cap\) \* \.75\)\)/, 'the site pill never drops under 12 px');
});

test('no stale "Measure" call to action on the bar\'s tile, which is not a button', () => {
  assert.doesNotMatch(css, /\.metric \.status\.unmeas::after \{ content: 'Measure'/);
  // (and a narrow bar tile says the same fact in one word that fits its room, not "Not measured" cut by an ellipsis)
  assert.match(css, /\.vdock \.readouts \.metric \.status\.unmeas::after \{ content: 'Unmeasured'; font-size: var\(--fs-12\); \}/);
});

test('Enter full screen is a row like the others in Settings, not a bordered button that the top bar\'s .menu-btn rule turned centred', () => {
  const main = src('src/ui/main.js');
  const fs = main.slice(main.indexOf('function fullscreenControl('), main.indexOf('let fsSync'));
  assert.match(fs, /menuItem\('Enter full screen', \{ icon: 'fullscreen' \}\)/);
  assert.doesNotMatch(fs, /btn block menu-btn/);
  assert.doesNotMatch(css, /\.btn\.menu-btn/);
});

test('a heading is a repeat by the words the cell shows, and the two unmeasured-status leftovers are gone', async () => {
  const { sameHead, headOf } = await import('../src/ui/table-marks.js');
  assert.equal(headOf({ kicker: 'Intrahepatic · Sinusoidal' }), 'Sinusoidal');
  assert.ok(sameHead({ kicker: 'Intrahepatic · Sinusoidal', site: 'sin' }, { kicker: 'Sinusoidal', site: 'sin' }), 'the same words on screen');
  assert.ok(!sameHead({ kicker: 'Sinusoidal', site: 'sin' }, { kicker: 'Sinusoidal', site: 'pre' }), 'another site: both are drawn');
  assert.ok(!sameHead({ kicker: '' }, { kicker: '' }) && !sameHead(null, { kicker: 'A' }));
  assert.doesNotMatch(css, /\.rp-tiles \.metric \.status\.unmeas/);
});

test('no tile rule carries an accent-stripe slot: --key-w was never set, and a key tile has no styling (cards-critique, 17 Oct)', () => {
  assert.doesNotMatch(css, /--key-w/);
  assert.match(css, /\.pz-data \.pz-tile, \.pz-data \.pz-tool \.endo-read > div \{ background: color-mix\(in srgb, var\(--white\) 78%, transparent\); box-shadow: inset 0 0 0 1px color-mix\(in srgb, var\(--text\) 8%, transparent\); \}/);
});

test('the Guide says what a figure label shows now: the value, the unit once in the legend, the change only where it is asked for', () => {
  const main = src('src/ui/main.js');
  assert.doesNotMatch(main, /Labels give the value in mmHg; ▲ \/ ▼ is the change from healthy/);
  assert.match(main, /the legend names the unit once\. A label gives a station’s value\. Select the station, color by Change or compare with an earlier moment to see ▲ \/ ▼/);
  // US spelling in what a reader sees
  assert.doesNotMatch(stageSource(), /still show their colours and readings/);
  assert.doesNotMatch(src('src/ui/why.js'), /grey is what they add together/);
});

test('About the model describes the readouts as they are: a bar and a status word, amber borderline, red past a threshold (no dot)', () => {
  const main = src('src/ui/main.js');
  assert.match(main, /Every readout’s bar and status word follow a clinical cut-off;/);
  assert.match(main, /Amber is borderline; red means a threshold has been crossed\./);
  assert.doesNotMatch(main, /readout’s dot, bar/);
});

test('every row of the Blood menu has a line under its name, so the rows keep one rhythm', () => {
  const main = src('src/ui/main.js');
  const blood = main.slice(main.indexOf('function bloodItems('), main.indexOf('function labelLevelSeg('));
  for (const row of blood.match(/(toggle|layer)\([^\n]*\n?/g).filter((r) => /'[^']+', '[^']+', '[^']+'/.test(r) || /layer\('/.test(r))) assert.match(row, /,\s*'[^']{8,}'/, row.slice(0, 60));
  assert.match(blood, /layer\('labels', 'liver', 'Organ names', 'The caption on each organ'\)/);
});

test('a coloring has one name: the Colored by menu and the pill say the same words', () => {
  const main = src('src/ui/main.js');
  const lenses = main.slice(main.indexOf('const LENSES = {'), main.indexOf('const COLOR_MODES'));
  const modes = main.slice(main.indexOf('const COLOR_MODES = {'), main.indexOf('let stage, inspector'));
  const a = Object.fromEntries([...lenses.matchAll(/\n {2}(\w+): \['([^']+)'/g)].map((m) => [m[1], m[2]]));
  const b = Object.fromEntries([...modes.matchAll(/(\w+): '([^']+)'/g)].map((m) => [m[1], m[2]]));
  assert.ok(Object.keys(a).length >= 9);
  assert.deepEqual(a, b);
});

test('the Guide lists every key the figure answers: dye, zoom, color lens, undo, step, settle', () => {
  const main = src('src/ui/main.js');
  const guide = main.slice(main.indexOf('function openHelp('), main.indexOf('// Help and About open at a named section'));
  for (const kbd of ["'J', 'Inject dye (hold for longer)'", "'Ctrl/⌘ + / − / 0', 'Zoom in / out / fit the figure'", "'L', 'Next vessel coloring", "'Z', 'Settle to equilibrium'", "'.', 'Step'"]) assert.ok(guide.includes(kbd), kbd);
  // each is a key the handler really takes (the handler's start moves with its hardening, so the keys are read from the whole file)
  assert.match(main, /k === 'j' && !store\.get\(\)\.imaging/);
  assert.match(main, /e\.key === '=' \|\| e\.key === '\+' \? 'in'/);
  assert.match(main, /e\.key === '0' \? 'fit'/);
});

test('a percentage is "75%" everywhere a person reads it: the cards, the Why bars, the toasts and the timeline match the figure and the slides', () => {
  for (const f of ['src/ui/actions.js', 'src/ui/inspector.js', 'src/ui/about.js', 'src/ui/tool-lumen.js', 'src/ui/instruments.js', 'src/ui/chart.js', 'src/engine/explain.js', 'src/engine/events.js']) {
    const code = src(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert.doesNotMatch(code, /(\d|\}|\)) %(?=['"`.,:;)\]]| (of|stays|compensated|CSPH|decompensated|blood)\b)/, `${f}: a space before the percent sign`);
  }
  assert.match(src('src/ui/actions.js'), /const pct = \(v\) => `\$\{Math\.round\(v \* 100\)\}%`;/);
  assert.match(src('src/ui/inspector.js'), /sub: '40% compensated · 60% CSPH · 85% decompensated'/);
  // (a unit phrase keeps its space: "hepatic blood flow in % of normal")
  assert.match(src('src/ui/presenter.js'), /hepatic blood flow in % of normal/);
});

test('the drug class is "beta-blocker" on the Treat card, the Why card and the slides alike', () => {
  for (const f of ['src/ui/actions.js', 'src/ui/inspector.js', 'src/engine/scenario.js']) assert.doesNotMatch(src(f), /'(Non-?selective )?[βΒ]-blocker/, f);
  assert.match(src('src/ui/actions.js'), /propranolol: 'Nonselective beta-blocker', carvedilol: 'Beta-blocker \+ α1 blockade'/);
  assert.match(src('src/ui/decks/treatment.js'), /kicker: 'Nonselective beta-blocker'/);
});

test('US spelling in what a reader sees: liters, center, favors, color', () => {
  assert.doesNotMatch(src('src/ui/instruments.js'), /'Litres to drain|per litre drained/);
  assert.doesNotMatch(src('src/ui/decks/choose-treatment.js'), /experienced centre/);
  assert.doesNotMatch(src('src/ui/decks/next-bleed.js'), /AASLD favours/);
  assert.doesNotMatch(src('src/ui/decks/sites.js'), /in one colour/);
});

test('the credit in the Help menu keeps one voice: "Created by <name>" over "More teaching tools", the About link\'s own words', () => {
  const main = src('src/ui/main.js');
  assert.match(main, /'More teaching tools ', icon\('chev-right'\)/);
  assert.doesNotMatch(main, /All my tools/);
});

test('where pressure is lost is "resistance", never a "block" (cards, About and the Why text)', () => {
  assert.doesNotMatch(src('src/ui/actions.js'), /local block|makes the block post-sinusoidal/);
  assert.doesNotMatch(src('src/ui/inspector.js'), /Blocked in schistosomiasis/);
  assert.doesNotMatch(src('src/engine/scenario.js'), /Presinusoidal block/);
  assert.match(src('src/engine/scenario.js'), /summary: 'Presinusoidal resistance: high portal pressure/);
  assert.match(src('src/ui/actions.js'), /makes the resistance post-sinusoidal/);
  assert.doesNotMatch(src('src/ui/about.js'), /when the IVC is blocked|hepatic veins are blocked/);
});

test('the bleed-risk event is named for what it means, not as a threshold (12 is not a cut-off; the number sits in its line)', () => {
  const ev = src('src/engine/events.js');
  assert.match(ev, /title: 'Bleeding more likely', detail: 'HVPG ≥12 mmHg\. Bleeding risk climbs with the gradient from about 12 mmHg, but varices can bleed below it/);
  assert.doesNotMatch(ev, /title: 'HVPG ≥ 12 mmHg'/);
  assert.match(ev, /15–30% of blood volume lost/);
  // event sentences read aloud: 'below', not a '<' sign, and a percent hugs its number
  assert.match(ev, /Doppler velocity below 9 cm\/s:/);
  assert.match(ev, /Total sinusoidal flow is below 60% of normal\./);
  assert.doesNotMatch(ev, /detail: '[^']*[a-z] <\s?\d/);
});

test('the Patients menu groups say Pre-hepatic and Post-hepatic as the slides do, and every group has its "where" line', () => {
  const sc = src('src/engine/scenario.js'), menu = src('src/ui/menu.js');
  const groups = [...new Set([...sc.matchAll(/group: '([^']+)'/g)].map((m) => m[1]))];
  assert.ok(groups.includes('Pre-hepatic') && groups.includes('Post-hepatic'));
  assert.ok(!groups.includes('Prehepatic') && !groups.includes('Posthepatic'));
  const where = menu.match(/const GROUP_WHERE = \{[^\n]*\};/)[0];
  for (const g of groups) assert.ok(where.includes(/^\w+$/.test(g) ? `${g}:` : `'${g}':`), `${g} has a line in GROUP_WHERE`);
});

test('a percent hugs its number in the Why headline and on the readout tiles ("69%", "41% of rupture")', async () => {
  const { Engine } = await import('../src/engine/engine.js');
  const { explain, METRICS } = await import('../src/engine/explain.js');
  const e = new Engine(); e.loadPreset('csph'); for (let i = 0; i < 4; i++) e.settleQuick();
  for (const id of Object.keys(METRICS).filter((k) => METRICS[k].unit.startsWith('%'))) {
    const { sentence } = explain(e, id);
    assert.match(sentence, /is -?[\d.]+%( of (normal|rupture))?[,.]/, sentence);
    assert.doesNotMatch(sentence, /\d %/, sentence);
  }
  // an ordinary unit keeps its space
  assert.match(explain(e, 'hvpg').sentence, /^HVPG is [\d.]+ mmHg/);
  // the tile's unit span carries the class that closes the gap, in the bar and in the Readouts tab, and the CSS beats the phone's rule
  // (One tile builder for the bar and the Readouts tab, tile-el.js: unification audit, finding 6.)
  assert.match(src('src/ui/tile-el.js'), /class: t\.u === '%' \? 'unit pct' : 'unit'/, 'src/ui/tile-el.js');
  for (const f of ['src/ui/dock.js', 'src/ui/readouts-pane.js']) assert.match(src(f), /= tileEl\(t, \{/, f);
  assert.match(css, /\.metric \.v \.unit\.pct\.pct\.pct \{ margin-left: 1px; \}/);
});

test('the Treat chips say what a drug is once, and the Blood and Lobule menu rows fit one line', () => {
  const chart = src('src/ui/chart.js');
  assert.match(chart, /DRUGS\[k\]\.info \|\| DRUG_NOTE\[k\] \|\| ''/);
  assert.doesNotMatch(chart, /\$\{DRUG_NOTE\[k\] \|\| ''\}\. \$\{DRUGS\[k\]\.info/);
  const m = src('src/ui/main.js');
  // every row of the Blood and Lobule layer menus: its description (the longest quoted string on the row) fits one line of the menu's text column (about 230 px at 12 px: 38 characters)
  const rows = m.slice(m.indexOf('function bloodItems'), m.indexOf('function lensKeys')).split('\n').filter((l) => /^\s*(?:toggle|layer|menuToggle)\(/.test(l));
  assert.ok(rows.length >= 8, `found ${rows.length} rows`);
  for (const l of rows) {
    const d = [...l.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((q) => q[1].replace(/\\u2019/g, '’')).sort((a, b) => b.length - a.length)[0];
    assert.ok(d.length <= 38, `${d.length}: ${d}`);
  }
});

test('the Colored by cards are two lines at most in the 142 px column of a two-card row, so a row never has one card tall and one short', () => {
  const m = src('src/ui/main.js');
  const block = m.slice(m.indexOf('const LENSES = {'), m.indexOf('const COLOR_MODES'));
  const descs = [...block.matchAll(/^\s+\w+: \['[^']+', '((?:[^'\\]|\\.)*)'/gm)].map((q) => q[1].replace(/\\u2019/g, '’'));
  assert.equal(descs.length, 10);
  // 142 px at 12 px Inter is about 22 characters a line: two lines hold 44 with the slack of a word
  for (const d of descs) assert.ok(d.length <= 40, `${d.length}: ${d}`);
  assert.match(css, /\.lens-d \{[^}]*text-wrap: balance/);
  // a short card beside a tall one keeps its swatch, title and line at the top (the grid's rows no longer stretch into the spare height)
  assert.match(css, /\.lens:not\(\.lens-opt\) \{ align-content: start; \}/);
  assert.doesNotMatch(src('src/ui/main.js'), /width = flow/);
});

test('the Readouts tab on a phone (two columns) gives the last tile of an odd group the whole row, so no group ends with a hole', () => {
  assert.match(css, /@container \(max-width: 399px\) \{ \.rp-tiles \.metric:last-child:nth-child\(odd\) \{ grid-column: 1 \/ -1; \} \}/);
  // tiles stay in the grid when their value is hidden (they blank, never leave), so the odd-child rule counts what is drawn
  assert.doesNotMatch(src('src/ui/readouts-pane.js'), /\.remove\(\)|display = 'none'|style\.display/);
});

test('the Why headline never says "-0" and never repeats a zero baseline ("69%, 69 above healthy")', async () => {
  const { Engine } = await import('../src/engine/engine.js');
  const { explain, METRICS } = await import('../src/engine/explain.js');
  const e = new Engine(); e.loadPreset('cirr-decomp'); for (let i = 0; i < 4; i++) e.settleQuick();
  for (const id of Object.keys(METRICS)) {
    const { sentence } = explain(e, id);
    assert.doesNotMatch(sentence, /\bis -/, sentence);
    assert.doesNotMatch(sentence, /is −0(\.0+)? /, sentence);
  }
  // the shunt fraction's healthy value is zero: the headline is the value alone
  assert.match(explain(e, 'shunt').sentence, /^Shunt fraction is \d+%\. Most of that is/);
  // a nonzero baseline keeps its clause
  assert.match(explain(e, 'hvpg').sentence, /^HVPG is [\d.]+ mmHg, [\d.]+ above healthy\./);
});

test('the MAP formula ends in its result and carries its units, as the HVPG and PPG lines do', async () => {
  const { Engine } = await import('../src/engine/engine.js');
  const { explain } = await import('../src/engine/explain.js');
  const e = new Engine(); e.loadPreset('cirr-decomp'); for (let i = 0; i < 4; i++) e.settleQuick();
  assert.match(explain(e, 'map').formula, /^MAP = CO × SVR \+ RA = [\d.]+ L\/min × [\d.]+ WU \+ [\d.]+ mmHg = \d+ mmHg$/);
});

test('a Treat chip that is on reads heavier as well as ticked; the Compare table has no unexplained row shading and columns with room', () => {
  assert.match(css, /\.order-chip\[aria-pressed="true"\] \{ font-weight: 600; \} \.order-chip\[aria-pressed="true"\]:not\(:disabled\) \.oc-t::before \{ opacity: 1; \}/);
  // (Its colour eases as a brighter copy faded in by opacity; its weight is set at once: a weight ease re-laid its words every frame, Holding 120 Hz §3.11.)
  assert.match(css, /\.order-chip \.oc-t::before \{ content: attr\(data-t\);[^}]*transition: opacity var\(--d-small\) var\(--ease\)/);
  assert.doesNotMatch(css, /\.order-chip \{[^}]*font-weight var\(--d-small\)/);
  assert.doesNotMatch(css, /\.cmp-table tr\.big/);
  assert.doesNotMatch(src('src/ui/compare.js'), /'big'/);
  assert.match(css, /\.cmp-table td \{ padding: 8px 0 8px 14px;/);
});

test('the Patients and Present previews opened by the (i) on touch scroll their row into view once they have eased open', () => {
  const m = src('src/ui/menu.js');
  const fn = m.slice(m.indexOf('function toggleInline('), m.indexOf('const $$rows'));
  assert.match(fn, /li\.scrollIntoView\(\{ block: 'nearest', behavior: reduce\.matches \? 'auto' : 'smooth' \}\)/);
  // It opens at the tap (a slide by transform, fold-slide.js), the scroll waits out the slide, and the row leaves a margin above the
  // footer and below the sticking heading.
  // (the scroll itself runs between frames, in a rest pass: scrollIntoView lays the page out)
  assert.match(fn, /fold\(box, li, true, \(v\) => box\.classList\.toggle\('on', v\)\);[\s\S]*setTimeout\(\(\) => restPass\(scrollRow\), reduce\.matches \? 0 : D_SMALL \+ 30\);[\s\S]*function scrollRow\(\) \{ if \(box\.isConnected && box\.classList\.contains\('on'\)\) li\.scrollIntoView/);
  assert.match(css, /\.um-g li \{[^}]*scroll-margin: 28px 0 36px;/);
});

test('the Patients preview names what its curve plots and its scale', () => {
  assert.match(src('src/ui/menu.js'), /class: 'hp-cap' \}, 'Pressure, splanchnic bed to right atrium \(0 to 30 mmHg\)'/);
  assert.match(css, /\.um-pv-in \.hp-cap \{ display: block;[^}]*font-size: var\(--fs-12\)/);
});

test('the Readouts tab never calls cardiac output just "Output"', () => {
  assert.match(src('src/ui/readouts-pane.js'), /\['co', 'Cardiac output', 'Cardiac output'\]/);
});

test('History says a put-away change as what is off: acronyms keep their case, values and units are cut, the odd ones read in words', () => {
  const r = removedLabel;
  assert.equal(r('tips', 'TIPS 8 mm'), 'No TIPS');
  assert.equal(r('dips', 'DIPS 10 mm'), 'No DIPS');
  assert.equal(r('drug:carvedilol', 'Carvedilol'), 'No carvedilol');
  assert.equal(r('cirrhosis', 'Cirrhosis 60%'), 'No cirrhosis');
  assert.equal(r('fib:pre', 'Presinusoidal fibrosis ×2.0'), 'No presinusoidal fibrosis');
  assert.equal(r('fib:R:sin', 'Sinusoidal fibrosis, right lobe ×1.5'), 'No sinusoidal fibrosis, right lobe');
  assert.equal(r('splTone', 'Splanchnic tone ×0.80'), 'Splanchnic tone back to normal');
  assert.equal(r('sysTone', 'Systemic tone ×1.20'), 'Systemic tone back to normal');
  assert.equal(r('habr', 'Arterial buffer ×0.50'), 'Arterial buffer back to normal');
  assert.equal(r('contractility', 'RV contractility 80%'), 'RV contractility back to normal');
  assert.equal(r('albumin', 'Albumin 3.0 g/dL'), 'Albumin back to 4.0 g/dL');
  assert.equal(r('meal', 'After a meal'), 'Back to fasting');
  assert.equal(r('sten:SV', 'Splenic vein narrowed 50%'), 'Splenic vein no longer narrowed');
  assert.equal(r('thr:PV', 'Portal vein thrombus 40%'), 'Portal vein thrombus cleared');
  assert.equal(r('occ:C5', 'BRTO (gastrorenal shunt occluded)'), 'Gastrorenal shunt open again');
  assert.equal(r('occ:C6', 'Splenorenal shunt occluded'), 'Splenorenal shunt open again');
  assert.equal(r('C5', 'No gastrorenal shunt (no fundal varices)'), 'Gastrorenal shunt present again');
  assert.equal(r('pericardial', 'Pericardial constraint 50%'), 'No pericardial constraint');
  assert.equal(r('gestation', 'Pregnancy 20 weeks'), 'No pregnancy');
  // and the timeline uses it, not the old lowercasing
  const t = src('src/ui/timeline.js');
  assert.match(t, /parts\.push\(removedLabel\(k, l\)\)/);
  assert.doesNotMatch(t, /toLowerCase\(\)\}`\)/);
});

test('the PPG tile names the gradient as the rest of the app does (portal pressure gradient)', () => {
  // (The bar's tile takes its tooltip from the reading's one definition, table-marks.js TILE: unification audit, finding 6.)
  assert.match(dock, /id: 'ppg', \.\.\.fromTile\('ppg'\)/);
  assert.match(src('src/ui/table-marks.js'), /\n {2}ppg: \{[^\n]*long: 'Portal pressure gradient: PPG = portal vein pressure − IVC pressure/);
  assert.doesNotMatch(dock, /Portosystemic pressure gradient/);
  assert.doesNotMatch(src('src/ui/table-marks.js'), /Portosystemic pressure gradient/);
});

test('visible words in the talks, the Testing deck and the toasts are US spelling (gray, color, canceled)', () => {
  for (const f of ['src/ui/test-decks/demo-all-new-visuals.js', 'src/ui/decks/ascites.js']) {
    assert.doesNotMatch(src(f), /\b(the|a|its|rating|cut-off|switch the|plain) (grey|colours?)\b/i, f);
  }
  assert.doesNotMatch(stageSource(), /toast\('[^']*cancelled/);
});

test('a History change line that folds extra parts says "+N more", as the Compare line does', () => {
  assert.match(src('src/ui/timeline.js'), /parts\.length > 3 \? ` · \+\$\{parts\.length - 3\} more`/);
  assert.match(src('src/ui/compare.js'), /· \+\$\{labels\.length - 4\} more/);
});

test('a zoomable data card\'s heading keeps clear of its expand button (a long title wraps before the corner)', () => {
  assert.match(css, /\.pz\.pz-wide \.pz-data\.pz-zoomable > \.pz-dh \{ position: relative; padding-inline: calc\(28px \/ var\(--pz-z, 1\)\);/);
});
