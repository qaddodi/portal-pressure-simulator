// On a phone the Doppler spectrum is the main thing: the direction and the mean are sized as readings (not headings),
// and the spectrum runs nearly edge to edge on the Explore sheet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const rule = (sel) => { const i = css.indexOf(sel); assert.ok(i >= 0, `missing rule ${sel}`); return css.slice(i, css.indexOf('}', i)); };

test('Explore phone sheet: direction and mean are small, the spectrum bleeds to the edges', () => {
  assert.match(rule('.instrument-workspace.float-ui:not(.side) .dop-dir {'), /font-size: var\(--fs-16\)/);
  assert.match(rule('.instrument-workspace.float-ui:not(.side) .dop-vel b {'), /font-size: var\(--fs-20\)/);
  assert.match(rule('.instrument-workspace.float-ui:not(.side) .instrument-view.dop .dop-box {'), /margin-inline: -10px/);
});

test('Present phone data card: direction and mean step down, the spectrum is taller', () => {
  assert.match(rule('.pz.stack .pz-tool .dop-report > .dop-dir'), /font-size: var\(--s-body\)/);
  assert.match(rule('.pz.stack .pz-tool .dop-vel b'), /font-size: var\(--s-val\)/);
  const h = Number(rule('.pz.stack .pz-tool[data-kind="doppler"] .dop-box').match(/height: (?:calc\()?(\d+)px/)?.[1]);
  assert.ok(h >= 140, `spectrum is ${h}px`);
});

test('Present phone: the Doppler and FibroScan zoom stops at .85 and the fit shortens their pictures', () => {
  const r = rule('.pz.stack:not(.low) .pz-data.has-tool.has-tool > .pz-tool:is([data-kind="doppler"], [data-kind="fibroscan"])');
  assert.match(r, /--tz: max\(var\(--pz-fit, 1\), \.85\)/);
  assert.match(r, /zoom: var\(--tz\)/);
  assert.match(rule('.pz.stack:not(.low) .pz-data.has-tool.has-tool .pz-tool[data-kind="doppler"] .dop-box'), /128px \* var\(--pz-fit, 1\) \/ var\(--tz, 1\)/);
  assert.match(rule('.pz.stack:not(.low) .pz-data.has-tool.has-tool .pz-tool[data-kind="fibroscan"] .fibroscan-box'), /168px \* var\(--pz-fit, 1\) \/ var\(--tz, 1\)/);
});

test('a slide\'s Doppler strip reads signed as drawn and as a steady running mean', () => {
  const src = readFileSync(new URL('../src/ui/doppler.js', import.meta.url), 'utf8');
  assert.match(src, /const mean = ovOn \? steadyMean\(r\.mean\) : r\.mean, drawn = ovOn \? mean \* pol\(\) : mean;/);
  assert.match(src, /shownVel\.set\(probe, \{ v: Math\.abs\(mean\)/);
});
