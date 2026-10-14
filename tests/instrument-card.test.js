// The instrument card (Mohammad, 13 Oct): on a laptop or tablet held sideways, an instrument beside tiles or a ladder sits in
// its own card at the bottom right, level with and as tall as the stacked data card, the figure open above it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('every slide with an instrument, on a wide screen with the teaching card, gets its own card (tiles or not)', () => {
  assert.match(js, /const split = cardOn && !!t && splitOk\(\);/);
  assert.match(js, /const splitOk = \(\) => \{[^}]*has-tool'\); \};/);
  assert.doesNotMatch(js, /const splitOk = [^\n]*tool-only/);
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

const tools = readFileSync(new URL('../src/ui/presenter-tools.js', import.meta.url), 'utf8');
const fibro = readFileSync(new URL('../src/ui/fibroscan.js', import.meta.url), 'utf8');

test('the instrument card holds only the picture: every instrument\'s readings go to the data card', () => {
  // (Doppler report, scope and wall readings, the abdomen's numbers with the belly left behind, FibroScan's kPa as words.)
  assert.match(tools, /doppler: \{ sel: '\.dop-report', wrap: 'dop' \}/);
  assert.match(tools, /scope: \{ sel: '\.chart-side' \}/);
  assert.match(tools, /wall: \{ sel: '\.chart-side' \}/);
  assert.match(tools, /abdomen: \{ sel: '\.ab-read', wrap: 'ab', inner: 'ab-main', keep: '\.ab-belly' \}/);
  assert.match(tools, /fibroscan: \{ read: true \}/);
  assert.match(tools, /mv\(ghostEl, reads\)/);
  // (the readings sit under the data card's header, and come back whole when the split ends or the tool changes)
  assert.match(js, /ui\.data\.insertBefore\(rd, ui\.data\.querySelector\('\.pz-dh'\)\.nextSibling\)/);
  assert.match(js, /ui\.tools\.split\(on\);/);
  assert.match(tools, /if \(!inst\) \{ this\.hide\(\); return; \}\n\s*unpart\(\);/);
  assert.match(tools, /hide\(\) \{ unpart\(\);/);
  // (the canvas leaves its reading out while the words show it; a covered quiz reading stays covered there)
  assert.match(fibro, /const bare = readEl\.isConnected/);
  assert.match(css, /\.pz-reads\.ask \.fs-v \{ opacity: 0; \}/);
});

test('a chart with no readings and no tiles: the data card keeps its place unseen, the chart bottom right', () => {
  assert.match(js, /ui\.data\.classList\.toggle\('pz-void', on && rd\.hidden && ui\.data\.classList\.contains\('tool-only'\)\)/);
  assert.match(css, /\.pz-data\.pz-void \{ visibility: hidden; \}/);
});
