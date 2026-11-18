// The "Portal blood" callout has no card (Mohammad, 17 Nov 2026, "Build D"): the share that bypasses the liver is a number with a caption and a
// hairline bar in the figure's own label look, and a 1 px leader to the vein. His second report the same night, on the iPhone: "a solid black
// rectangle" under it. The leader's carrier was a .cl-glass with its fill set to none, and the stylesheet's own rules for glass (the no-glass
// fallback, the reduced-transparency one) out-ranked that. Now the carrier is not a glass at all (.cl-leader), and these checks keep every
// fill, shadow and blur off the callout and its carrier.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const css = readdirSync(join(root, 'styles')).filter((f) => /^app-.*\.css$/.test(f)).map((f) => read('styles/' + f)).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const sitesPaint = read('src/ui/stage-sites-paint.js'), sites = read('src/ui/stage-sites.js'), callout = read('src/ui/callout.js');

// every rule (selector list, body) of the stylesheets, media queries flattened
const rules = [...css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
const FILL = /(^|;|\s)(background(-color|-image)?|box-shadow|backdrop-filter|-webkit-backdrop-filter|filter)\s*:(?!\s*none\b)/;   // (none is no fill)

test('the portal blood callout is made bare, its words wear the label halo', () => {
  assert.match(sitesPaint, /glassCallout\(el, d\.split \? BARE : undefined\)/, 'the split reading is the only bare one');
  assert.match(sitesPaint, /glWords\(e, \{ halo: true \}\)/, 'its changing words wear the label look');
});

test('a bare callout draws a leader only, on a carrier that is not a glass', () => {
  assert.match(callout, /bare = false/);
  assert.match(callout, /if \(bare\) glass\.className = 'cl-leader';/, 'the carrier is not a .cl-glass: no glass rule can fill it');
  assert.doesNotMatch(callout, /cl-bare/);
  assert.match(callout, /const d = bare \? leader\(/, 'no card outline');
  assert.match(callout, /len = PTR \+ tl \+ \(bare && dir !== 'none' \? LEAD_REACH : 0\)/, 'the line runs on to its point, not 7 px short of it like a wedge');
  assert.match(callout, /\$\{bare \? '' : `clip-path:path/, 'a leader is not clipped to a card');
});

test('nothing in the stylesheets can paint a backing under the bare callout or its carrier', () => {
  const mine = rules.filter((r) => /\.cl-leader|\.cath-label\.site\.split(?![\w-])/.test(r.sel) && !/\.sp-(bar|l|s)\b|\.sp-bar i/.test(r.sel));
  assert.ok(mine.length >= 5, 'the callout\'s rules were found');
  for (const r of mine) assert.doesNotMatch(r.body, FILL, `no fill, shadow or blur on: ${r.sel}`);
  // the carrier is never matched by a glass rule: not a .cl-glass, and no rule reaches it through a wildcard child either
  assert.ok(!rules.some((r) => /\.cl-leader/.test(r.sel) && /\.cl-glass/.test(r.sel)));
  const bar = rules.filter((r) => /\.sp-bar\b/.test(r.sel) || /\.sp-l\b|\.sp-s\b/.test(r.sel));
  for (const r of bar) if (FILL.test(r.body)) assert.match(r.sel, /\.sp-(l|s)\b/, 'only the bar\'s two parts are filled');
  assert.match(css, /\.cl-leader \{[^}]*background: none;/);
});

test('it is small: the number is one and a half times a 11.5 px line, never the card-sized 25 px', () => {
  assert.match(css, /\.sp-n, \.cath-label\.site\.split \.sp-pc \{ font-size: 1\.5em;/);
  assert.match(css, /\.cath-label\.site\.split b[^{]*\{[^}]*font-size: calc\(11\.5px \* min\(var\(--label-scale, 1\), 1\.7\)\)/);
  assert.match(css, /\.sp-bar \{[^}]*height: 2px;[^}]*width: 6\.4em;/);
});

test('the number, its caption and the bar are in the callout, in that order', () => {
  const i = sites.indexOf('class="sp-h"'), j = sites.indexOf('class="sp-cap"'), k = sites.indexOf('class="sp-bar"');
  assert.ok(i > 0 && j > i && k > j);
  assert.ok(sites.indexOf('class="sp-n"') < sites.indexOf('class="sp-lt"') && sites.indexOf('class="sp-lt"') < sites.indexOf('class="sp-st"'));
});
