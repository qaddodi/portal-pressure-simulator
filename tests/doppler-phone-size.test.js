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
