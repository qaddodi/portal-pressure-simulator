// The figure's callouts after the 17 Oct design review: stations named in full, a change written "+7.9" in its reading's colour
// and on a slide only where its words point, one unit rule across the circuit, the resistors named in full with one key, and the
// readings, the circuit and the FibroScan probe kept clear of the slide's edges and cards. And the colour keys: balanced when they
// wrap, the pressure-drop key with its ends named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHORT } from '../src/ui/anatomy.js';

const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const presenter = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('stations are named in full, with no abbreviation ending in a full stop', () => {
  for (const [id, name] of Object.entries(SHORT)) assert.doesNotMatch(name, /\.(\s|$)/, `${id}: "${name}"`);
  assert.equal(SHORT.VAR, 'Varices');
  assert.equal(SHORT.CONF, 'Portal vein');
  assert.equal(SHORT.SIN_R, 'Right sinusoids');
  assert.equal(SHORT.SV, 'Splenic vein');
  assert.doesNotMatch(SHORT.RHV, /^RHV$/);
});

test('a change reads "+7.9", in its reading\'s colour, and on a slide only on the stations its words point at', () => {
  const runs = stage.slice(stage.indexOf('  function pressureRuns('), stage.indexOf('  function layerRuns('));
  assert.doesNotMatch(runs, /▲|▼/, 'no arrow before the change');
  assert.match(runs, /deltaHere\(id\) && badge\(/);
  assert.match(runs, /const signed = \(d, txt\) => `\$\{d > 0 \? '\+' : '−'\}\$\{txt\}`;/);
  assert.match(runs, /const deltaHere = \(id\) => !store\.get\(\)\.presenting \|\| !!termTone\(id\);/);
  assert.match(css, /\.lb-delta \{ fill: var\(--text\); \}/);
  assert.match(css, /#labels \.lb\.term [^{]*\.lb-delta \{ fill: var\(--term\); \}/);
});

test('the circuit\'s readings follow one unit rule: where one drops its unit for room, all of them do', () => {
  const at = stage.indexOf('One unit rule for the whole circuit');
  assert.ok(at > 0, 'the unit pass is missing');
  const pass = stage.slice(at, stage.indexOf('// Collateral and shunt lanes, captioned along their run.', at));
  assert.match(pass, /if \(shown\.some\(\(it\) => it\.short === 1\)\)/);
  assert.match(pass, /sol\.short = 1/, 'the carried slot keeps the bare form');
});

test('the resistors are named in full, and "vs healthy liver" is said once, in their key', () => {
  assert.match(stage, /rLiver: \{ kicker: 'Liver resistance', cls: 'res', unit: '',/);
  assert.match(stage, /rColl: \{ kicker: 'Collateral resistance', cls: 'res coll', unit: '',/);
  assert.match(stage, /rGut: \{ kicker: 'Gut arteriole resistance', cls: 'res gut', unit: '',/);
  assert.doesNotMatch(stage, /unit: 'vs healthy liver'/);
  assert.match(stage, /const RES_KEY = '× healthy liver’s resistance';/);
  assert.match(css, /\.cath-label\.site\.res\.keyed \.res-k \{ display: block;/);
});

test('a slide\'s readings keep the cards\' margin from every edge and stay above the nav pill\'s row', () => {
  assert.match(stage, /pillEdge = r\?\.width \? \{ m: Math\.max\(6, Math\.round\(wr\.right - r\.right\)\), top: r\.top - wr\.top \} : null;/);
  assert.match(stage, /const view = \{ x0: M, y0: M, x1: W - M, y1: H - M \}/);
  assert.match(stage, /if \(st\.presenting && pillEdge\) view\.y1 = Math\.max\(H \* 0\.5, Math\.min\(view\.y1, pillEdge\.top - 8\)\);/);
  assert.match(stage, /const x0 = Math\.max\(M, pzInset\('--pz-l'\) \+ 8\), x1 = W - Math\.max\(M, pzInset\('--pz-r'\) \+ 8\)/);
});

test('on a slide the circuit stands centred in the free height, and its readings keep out of the header row', () => {
  assert.match(stage, /return centreDrawn\(clearPill\(insetVT\(\{ k: 1, x: 0, y: 0 \}, VB_CIRC\), VB_CIRC\)\);/);
  const fn = stage.slice(stage.indexOf('  function centreDrawn(v) {'), stage.indexOf('  const circWhole = () =>'));
  assert.match(fn, /if \(!store\.get\(\)\.presenting\) return v;/, 'Explore keeps its framing');
  assert.match(fn, /return hi > 0 && dy > 0 \?/, 'it only ever moves down, and never past the pill');
  assert.match(stage, /placed\.push\(st\.presenting \? \{ x0: a, y0: -1e4, x1: b, y1: y1 \+ 2, zone: true \}/);
});

test('the FibroScan probe turns clear of the slide\'s cards', () => {
  const turn = stage.slice(stage.indexOf('  function scanTurn('), stage.indexOf('  function scanPaint('));
  assert.match(turn, /const cards = scanCards\(\), clear = /);
  assert.match(turn, /if \(alt\.length\) deg = alt\.sort/);
  assert.match(stage, /document\.querySelectorAll\('\.pz-shade, \.pz-data\.stage-blocker, \.pz-panel\.stage-blocker'\)/);
});

test('colour keys: a wrapped key is balanced, upright iPad gives it its own row, and the pressure-drop key names its ends', () => {
  assert.match(presenter, /function balanceKey\(fk, maxW\) \{/);
  assert.match(presenter, /else if \(root\.classList\.contains\('tab'\)\) \{/);
  assert.match(presenter, /drop: \['pressure drop', \(\) => dropCss\('to right'\), 'Low', 'High'\],/);
  assert.match(presenter, /const KEY_ENDS = new Set\(\['drop'\]\);/);
  assert.match(css, /\.pz-lens-ends \{ display: inline-flex;/);
});

test('a key\'s named swatches travel together: when it wraps, its name takes one line and its swatches the next', () => {
  assert.match(presenter, /\[h\('span', \{ class: 'pz-lens-items' \}, \.\.\.bar\.map\(/);
  assert.match(css, /\.pz\.stack:is\(\.fk-two, \.fk-wrap\) \.pz-fk:not\(\.grad\) \.pz-lens-items \{ flex-wrap: wrap; row-gap: \.1em; flex-basis: 100%; \}/);
  assert.match(presenter, /queueMicrotask\(\(\) => \{ if \(ui\) clearPill\(\); \}\);/, 'fitted again once its own words are in');
});

test('a phone key on the pill\'s row is the pill\'s twin, and comes in with the teaching card', () => {
  const pill = css.match(/\.pz\.stack \.pz-bar \{([^}]*)\}/)[1];
  assert.match(pill, /height: 38px;/);
  assert.match(pill, /bottom: calc\(21px \+ var\(--pz-sb\)\);/);
  assert.match(css, /\.pz\.stack:not\(\.fk-up\) \.pz-fk \{ bottom: calc\(21px \+ var\(--pz-sb\)\); min-height: 38px; padding-block: 0;/);
  assert.doesNotMatch(css.match(/\.pz\.stack\.fk-two \.pz-fk:not\(\.grad\) \{([^}]*)\}/)[1], /bottom|padding-block|border-radius/, 'two lines keep the pill\'s box');
  assert.match(presenter, /fk\.offsetHeight <= barH \+ 1\.5/, 'two lines only where they fit the pill\'s height');
  // (Two lines beside the pill try the name and swatches flowing together, then the swatches' short names, before a row of their own.)
  assert.match(presenter, /if \(two\(false, false\) \|\| two\(true, false\) \|\| \(sh && \(two\(false, true\) \|\| two\(true, true\)\)\)\) \{/);
  assert.match(presenter, /\['--origin-spleen', 'Spleen', 'SV'\], \['--origin-artery', 'Artery', 'HA'\], \['--origin-systemic', 'Systemic', 'Sys'\]/);
  assert.match(css, /\.pz\.stack\.fk-two\.fk-flow \.pz-fk:not\(\.grad\) \.pz-lens-items \{ display: contents; \}/);
  assert.match(presenter, /createFigureKey\(\{ el: fk, app, watch: \[text, root\], ready: \(\) => !text\.hidden && !text\.classList\.contains\('pz-leave'\) && !root\.classList\.contains\('pz-prep'\) \}\)/);
  assert.match(css, /\.pz-fk\.on \{ opacity: 1; transition: opacity \.5s var\(--ease\) \.12s; \}/);
});
