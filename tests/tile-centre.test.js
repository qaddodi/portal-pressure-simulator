import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Every stat tile of a data card (HVPG, PPG, SAAG and the rest) centres its name, value with unit, rating and change.
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.trim().replace(/^\/\*[\s\S]*?\*\/\s*/, ''), body }));
const rule = (sel) => rules.filter((r) => r.sel === sel).map((r) => r.body).join(' ');

test('a tile centres its contents on every layout', () => {
  assert.match(rule('.pz-tile'), /align-items:\s*center/);
  assert.match(rule('.pz-tile'), /text-align:\s*center/);
  assert.match(rule('.pzt-vu'), /justify-content:\s*center/);
  assert.match(rule('.pzt-r'), /justify-content:\s*center/);
  assert.match(rule('.app.pz-hi .pzt-r'), /align-self:\s*center/, 'the high-contrast pill is centred too');
});

test('on the stacked (phone) layout the value and its rating sit as one centred group, never pushed to the edges', () => {
  const tile = rule('.pz.stack .pz-data .pz-tiles .pz-tile');
  assert.match(tile, /justify-content:\s*center/);
  assert.match(tile, /justify-items:\s*center/);
  assert.doesNotMatch(tile, /minmax\(0,\s*1fr\)/, 'no stretched column that leaves the rating at the far edge');
  const r = rule('.pz.stack .pz-data .pz-tiles .pzt-r');
  assert.match(r, /justify-self:\s*center/);
  assert.match(r, /text-align:\s*center/);
  assert.doesNotMatch(css, /\.pz\.stack \.pz-data \.pz-tiles \.pzt-r \{[^}]*(justify-self:\s*(start|end)|text-align:\s*(start|end))/, 'no rating pinned to a side');
});
