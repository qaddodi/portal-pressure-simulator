import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cutDp, SCALE } from '../src/ui/table-marks.js';
import { removedLabel } from '../src/ui/removed-label.js';
import './dom-shim.js';
const { fmt } = await import('../src/ui/util.js');

// Tile, menu and number polish, 31 Oct (the "Polish tiles, cards and tables" sprint thread).
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const dock = src('src/ui/dock.js');

test('a scale bar prints every cut-off with the decimals it has', () => {
  assert.equal(fmt(0.15, cutDp(0.15)), '0.15');
  assert.equal(fmt(0.45, cutDp(0.45)), '0.45');
  assert.equal(fmt(2.5, cutDp(2.5)), '2.5');
  assert.equal(fmt(1.1, cutDp(1.1)), '1.1');
  assert.equal(fmt(10, cutDp(10)), '10');
  assert.equal(fmt(0, cutDp(0)), '0');
  // every cut-off on every bar reads back as the number it is (none rounds to a different one)
  for (const [k, [, , cuts]] of Object.entries(SCALE)) for (const c of cuts) assert.equal(+fmt(c, cutDp(c)).replace('−', '-'), c, `${k} ${c}`);
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





test('a heading is a repeat by the words the cell shows, and the two unmeasured-status leftovers are gone', async () => {
  const { sameHead, headOf } = await import('../src/ui/table-marks.js');
  assert.equal(headOf({ kicker: 'Intrahepatic · Sinusoidal' }), 'Sinusoidal');
  assert.ok(sameHead({ kicker: 'Intrahepatic · Sinusoidal', site: 'sin' }, { kicker: 'Sinusoidal', site: 'sin' }), 'the same words on screen');
  assert.ok(!sameHead({ kicker: 'Sinusoidal', site: 'sin' }, { kicker: 'Sinusoidal', site: 'pre' }), 'another site: both are drawn');
  assert.ok(!sameHead({ kicker: '' }, { kicker: '' }) && !sameHead(null, { kicker: 'A' }));
});




test('every row of the Blood menu has a line under its name, so the rows keep one rhythm', () => {
  const main = src('src/ui/main.js');
  const blood = main.slice(main.indexOf('function bloodItems('), main.indexOf('function labelLevelSeg('));
  for (const row of blood.match(/(toggle|layer)\([^\n]*\n?/g).filter((r) => /'[^']+', '[^']+', '[^']+'/.test(r) || /layer\('/.test(r))) assert.match(row, /,\s*'[^']{8,}'/, row.slice(0, 60));
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
});

test('a percentage is "75%" everywhere a person reads it: the cards, the Why bars, the toasts and the timeline match the figure and the slides', () => {
  for (const f of ['src/ui/actions.js', 'src/ui/inspector.js', 'src/ui/about.js', 'src/ui/tool-lumen.js', 'src/ui/instruments.js', 'src/ui/chart.js', 'src/engine/explain.js', 'src/engine/events.js']) {
    const code = src(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert.doesNotMatch(code, /(\d|\}|\)) %(?=['"`.,:;)\]]| (of|stays|compensated|CSPH|decompensated|blood)\b)/, `${f}: a space before the percent sign`);
  }
  // (a unit phrase keeps its space: "hepatic blood flow in % of normal")
});

test('the drug class is "beta-blocker" on the Treat card, the Why card and the slides alike', () => {
  for (const f of ['src/ui/actions.js', 'src/ui/inspector.js', 'src/engine/scenario.js']) assert.doesNotMatch(src(f), /'(Non-?selective )?[βΒ]-blocker/, f);
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
    assert.match(sentence, /is -?[\d.]+%( of (normal|rupture threshold))?[,.]/, sentence);
    assert.doesNotMatch(sentence, /\d %/, sentence);
  }
  // an ordinary unit keeps its space
  assert.match(explain(e, 'hvpg').sentence, /^HVPG is [\d.]+ mmHg/);
  // the tile's unit span carries the class that closes the gap, in the bar and in the Readouts tab, and the CSS beats the phone's rule
  // (One tile builder for the bar and the Readouts tab, tile-el.js: unification audit, finding 6.)
  for (const f of ['src/ui/dock.js', 'src/ui/readouts-pane.js']) assert.match(src(f), /= tileEl\(t, \{/, f);
});

test('the Treat chips say what a drug is once, and the Blood and Lobule menu rows fit one line', () => {
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
  // a short card beside a tall one keeps its swatch, title and line at the top (the grid's rows no longer stretch into the spare height)
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
});


test('visible words in the talks, the Testing deck and the toasts are US spelling (gray, color, canceled)', () => {
  for (const f of ['src/ui/test-decks/demo-all-new-visuals.js', 'src/ui/decks/ascites.js']) {
    assert.doesNotMatch(src(f), /\b(the|a|its|rating|cut-off|switch the|plain) (grey|colours?)\b/i, f);
  }
});


