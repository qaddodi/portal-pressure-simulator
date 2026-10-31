import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cutDp, SCALE } from '../src/ui/table-marks.js';
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
  assert.match(css, /\.pz-tile\[data-rate="hi"\] \.pzt-r \{ color: color-mix\(in srgb, var\(--danger\) 85%, var\(--text\)\); \}/);
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
  for (const c of ['5 to 9.9 (subclinical)', '6 to 11.9', '10.1 to 14.9', '13.1 to 16 cm']) assert.ok(cells.includes(c), c);
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

test('Settings keeps the model rows apart from the accessibility switch, and a Why? name wraps rather than ending in an ellipsis', () => {
  const main = src('src/ui/main.js');
  const settings = main.slice(main.indexOf('function openSettings('), main.indexOf('function presenterSettings('));
  const blur = settings.indexOf("'Blur effect'"), hvpg = settings.indexOf("'Always show HVPG'");
  assert.ok(blur > 0 && hvpg > blur, 'the HVPG switch follows the blur switch');
  assert.ok(settings.slice(blur, hvpg).includes("class: 'menu-sep'"), 'a divider between them: Always show HVPG is not an accessibility setting');
  assert.ok(settings.indexOf("'Advanced physiology'") > hvpg, 'the model rows keep together');
  const rule = css.match(/\n\.wf-row \.lab \{[^}]*\}/)[0];
  assert.doesNotMatch(rule, /ellipsis|nowrap|overflow: hidden/);
  assert.match(rule, /overflow-wrap: anywhere/);
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
  assert.doesNotMatch(src('src/ui/stage.js'), /still show their colours and readings/);
  assert.doesNotMatch(src('src/ui/why.js'), /grey is what they add together/);
});

test('About the model describes the readouts as they are: a bar and a status word, amber borderline, red past a threshold (no dot)', () => {
  const main = src('src/ui/main.js');
  assert.match(main, /Every readout’s bar and status word follow a clinical cut-off;/);
  assert.match(main, /Amber is borderline; red means a threshold has been crossed\./);
  assert.doesNotMatch(main, /readout’s dot, bar/);
});
