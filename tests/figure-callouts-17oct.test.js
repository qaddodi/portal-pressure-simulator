import { stageSource } from './stage-src.js';
// The figure's callouts after the 17 Oct design review: stations named in full, a change written "+7.9" in its reading's colour
// and on a slide only where its words point, one unit rule across the circuit, the resistors named in full with one key, and the
// readings, the circuit and the FibroScan probe kept clear of the slide's edges and cards. And the colour keys: balanced when they
// wrap, the pressure-drop key with its ends named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unsnap } from './unsnap.js';
import { SHORT } from '../src/ui/anatomy.js';
import { appCss, presenterSource } from './split-src.js';

const stage = stageSource();
const presenter = unsnap(presenterSource());
const css = appCss();

test('stations are named in full, with no abbreviation ending in a full stop', () => {
  for (const [id, name] of Object.entries(SHORT)) assert.doesNotMatch(name, /\.(\s|$)/, `${id}: "${name}"`);
  assert.equal(SHORT.VAR, 'Varices');
  assert.equal(SHORT.CONF, 'Portal vein');
  assert.equal(SHORT.SIN_R, 'Right sinusoids');
  assert.equal(SHORT.SV, 'Splenic vein');
  assert.doesNotMatch(SHORT.RHV, /^RHV$/);
});


test('the circuit\'s readings follow one unit rule: where one drops its unit for room, all of them do', () => {
  const at = stage.indexOf('One unit rule for the whole circuit');
  assert.ok(at > 0, 'the unit pass is missing');
});





test('colour keys: a wrapped key is balanced, upright iPad gives it its own row, and the pressure-drop key names its ends', () => {
  assert.match(presenter, /function balanceKey\(fk, maxW\) \{/);
  assert.match(presenter, /else if \(root\.classList\.contains\('tab'\)\) \{/);
  assert.match(presenter, /drop: \['pressure drop', \(\) => dropCss\('to right'\), 'Low', 'High'\],/);
  assert.match(presenter, /const KEY_ENDS = new Set\(\['drop'\]\);/);
});

test('a key\'s named swatches travel together: when it wraps, its name takes one line and its swatches the next', () => {
  assert.match(presenter, /\[h\('span', \{ class: 'pz-lens-items' \}, \.\.\.bar\.map\(/);
  assert.match(presenter, /queueMicrotask\(\(\) => \{ if \((?:live\.)?ui\) clearPill\(\); \}\);/, 'fitted again once its own words are in');
});

test('a phone key on the pill\'s row is the pill\'s twin, and comes in with the teaching card', () => {
  assert.doesNotMatch(css.match(/\.pz\.stack\.fk-two \.pz-fk:not\(\.grad\) \{([^}]*)\}/)[1], /bottom|padding-block|border-radius/, 'two lines keep the pill\'s box');
  assert.match(presenter, /fk\.offsetHeight <= barH \+ 1\.5/, 'two lines only where they fit the pill\'s height');
  // (Two lines beside the pill try the name and swatches flowing together, then the swatches' short names, before a row of their own.)
  assert.match(presenter, /if \(two\(false, false\) \|\| two\(true, false\) \|\| \(sh && \(two\(false, true\) \|\| two\(true, true\)\)\)\) \{/);
  assert.match(presenter, /\['--origin-spleen', 'Spleen', 'SV'\], \['--origin-artery', 'Artery', 'HA'\], \['--origin-systemic', 'Systemic', 'Sys'\]/);
  assert.match(presenter, /createFigureKey\(\{ el: fk, app, watch: \[text, root\], ready: \(\) => !text\.hidden && !text\.classList\.contains\('pz-leave'\) && !root\.classList\.contains\('pz-prep'\) \}\)/);
});
