// The instrument card (Mohammad, 13 Oct): on a laptop or tablet held sideways, an instrument beside tiles or a ladder sits in
// its own card at the bottom right, level with and as tall as the stacked data card, the figure open above it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('only an instrument beside tiles or a ladder, on a wide screen with the teaching card, gets its own card', () => {
  assert.match(js, /const split = cardOn && !!t && splitOk\(\);/);
  assert.match(js, /const splitOk = \(\) => \{[^}]*has-tool[^}]*!d\.classList\.contains\('tool-only'\)/);
  // (a phone and a phone on its side have no teaching card panel, cardOn: the instrument stays in the data card there)
  assert.match(js, /const cardOn = TEXT_CARD && !p && !\(W > H && H <= 500\);/);
});

test('the instrument card stands level with the stacked data card, one height, and goes back when the pair does not stack', () => {
  assert.match(js, /placeInst\(split && below,/);
  assert.match(js, /dd\.style\.minHeight = cs\.minHeight = `\$\{hh\}px`/);
  assert.match(js, /if \(!on\) \{ if \(ui\.tools\.el\.parentElement === c\) placeTool\(false\);/);
});

test('the instrument card shows, hides and eases with the data card, and the camera frames clear of it', () => {
  assert.match(js, /c\.classList\.toggle\('pz-hide', !on \|\| d\.classList\.contains\('pz-hide'\)\)/);
  assert.match(js, /if \(ins\) mid = mid\.flatMap\(\(q\) => split\(q, ins\)\);/);
  assert.match(js, /\[ui\.text, ui\.data, ui\.inst\]/);
});

test('its class does not clash with the instruments\' own pz-inst', () => {
  assert.match(js, /class: 'pz-data pz-icard has-tool stage-blocker pz-hide'/);
  assert.match(css, /\.pz-data\.pz-icard \{ right: auto; \}/);
  assert.doesNotMatch(css, /\.pz-data\.pz-inst\b/);
});
