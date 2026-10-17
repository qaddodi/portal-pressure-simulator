import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A phone's data card has three states and no Show or Hide (Mohammad, 17 Oct, round 2 A): partly open with its second part on a
// sheet whose edge shows under the card, fully open with the sheet flush, and closed to its edges at the top.
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

test('a phone card with a second part keeps it on a sheet whose edge carries the handle', () => {
  assert.match(js, /const dd0 = ui\.data, sheet = \(p \|\| low\) && dd0\.classList\.contains\('has-tool'\) && \(!dd0\.classList\.contains\('tool-only'\)/);
  assert.match(js, /dd0\.classList\.toggle\('pz-sheet', sheet\);/);
  assert.match(js, /if \(sheet && dd0\.classList\.contains\('tool-open'\) && dd0\.dataset\.openFor !== String\(want\)\) dd0\.classList\.remove\('tool-open'\);/, 'each slide arrives partly open');
  assert.match(js, /tiles\.el, h\('span', \{ class: 'pz-grip', 'aria-hidden': 'true' \}\), lip\);/);
  const lip = css.match(/\.pz:is\(\.stack, \.low\) \.pz-data\.pz-sheet > \.pz-lip \{[^}]*\}/)?.[0] ?? '';
  assert.match(lip, /top: 100%; left: 14px; right: 14px; height: 24px;/, 'a little narrower than the card, 24 px under it');
  assert.match(lip, /background: color-mix\(in srgb, var\(--surface-2\) 94%, transparent\)/, 'a little darker');
  assert.match(css, /\.pz:is\(\.stack, \.low\) \.pz-data\.pz-sheet:not\(\.tool-open\) \{ overflow-y: visible; \}/, 'the edge shows outside the card');
  assert.match(css, /\.pz:is\(\.stack, \.low\) \.pz-data\.pz-sheet\.tool-open > \.pz-lip \{ left: 0; right: 0; translate: 0 -24px;/, 'fully open: flush, the step gone');
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
  assert.match(js, /if \(dock\.to === 1\) \{ dock\.auto = false; dockTo\(0\); \} else if \(data\.classList\.contains\('tool-open'\)\) \{ dock\.auto = false; dockTo\(1\); \} else setFold\(true\);/);
  assert.match(js, /if \(performance\.now\(\) - \(dock\.tapAt \|\| 0\) < 700\) return;/, 'a touch that already opened it is not taken twice');
  // (A pull down on a partly open card brings the sheet out; a push up from either open state is the dock drag.)
  assert.match(js, /\(!btn\.offsetWidth && !sheet\) \|\| \(sheet && open\)/);
});

test('a slide whose card does not fit comes in closed, and the next one that fits brings it back', () => {
  const auto = js.match(/function autoDock\(shut\) \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
  assert.match(auto, /if \(shut && dock\.to === 0 && dock\.autoKey !== key\) \{ dock\.autoKey = key; dock\.auto = true;/, 'once per slide: brought back by the reader, it stays');
  assert.match(auto, /else if \(!shut && dock\.auto && dock\.to === 1\) \{ dock\.auto = false;/, 'a card the reader closed stays closed');
  assert.match(js, /const shut = !gone && \(both - data < words \|\| data - sheetLip > dmax \+ 0\.5\)/);
  assert.match(js, /if \(key\) phoneLock = \{ key, cap, shut, data \};/);
  // (Brought back, it may cover the figure, never the words: the figure's share is kept only while it fits.)
  assert.match(js, /!phoneShut && !dd\.classList\.contains\('tool-open'\)/);
});
