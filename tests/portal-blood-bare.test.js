// The "Portal blood" callout has no card (Mohammad, 17 Nov 2026, "Build D"): the share that bypasses the liver is a big number with a caption and a
// hairline bar in the figure's own label look, and a 1 px leader to the vein. Its glass is only that leader: never frosted, no tint, no outline.
// These checks keep a card (a frosted body, a pointer wedge) from creeping back onto it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const css = readdirSync(join(root, 'styles')).filter((f) => /^app-.*\.css$/.test(f)).map((f) => read('styles/' + f)).join('\n');
const sitesPaint = read('src/ui/stage-sites-paint.js'), sites = read('src/ui/stage-sites.js'), callout = read('src/ui/callout.js'), stage = read('src/ui/stage.js');

test('the portal blood callout is made bare, its words wear the label halo', () => {
  assert.match(sitesPaint, /glassCallout\(el, d\.split \? BARE : undefined\)/, 'the split reading is the only bare one');
  assert.match(sitesPaint, /glWords\(e, \{ halo: true \}\)/, 'its changing words wear the label look');
});

test('a bare callout draws a leader only, and its glass is left out of the frosted list', () => {
  assert.match(callout, /bare = false/);
  assert.match(callout, /glass\.classList\.add\('cl-bare'\)/);
  assert.match(callout, /const d = bare \? leader\(/, 'no card outline');
  assert.match(callout, /\$\{bare \? '' : `clip-path:path/, 'a leader is not clipped to a card');
  assert.match(stage, /!c\[i\]\.classList\.contains\('cl-bare'\)\) body\.push/, 'never frosted');
});

test('its stylesheet has no card: no padding, no tint, no outline round it; a hairline leader', () => {
  assert.match(css, /\.cath-label\.site\.split, \.app\.presenting \.cath-label\.site\.split \{[^}]*padding: 0; border-radius: 0;/);
  assert.match(css, /--leader: var\(--text-2\);/, 'a hairline leader in the text colour');
  assert.match(callout, /bare \? cs\.getPropertyValue\('--leader'\)/);
  assert.match(css, /:root:root \.cl-glass\.cl-bare:not\(\[data-gl\]\) \{ background: none;/);
  assert.match(css, /\.cath-label\.site\.split \.sp-bar \{[^}]*height: 2px;/, 'a hairline bar');
});

test('the number, its caption and the bar are in the callout, in that order', () => {
  const i = sites.indexOf('class="sp-h"'), j = sites.indexOf('class="sp-cap"'), k = sites.indexOf('class="sp-bar"');
  assert.ok(i > 0 && j > i && k > j);
  // (the three changing readings keep their order: number, liver share, shunt share; stage-sites-paint.js splitShow reads them so)
  assert.ok(sites.indexOf('class="sp-n"') < sites.indexOf('class="sp-lt"') && sites.indexOf('class="sp-lt"') < sites.indexOf('class="sp-st"'));
});
