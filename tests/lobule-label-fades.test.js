// The lobule's labels, zone names and leaders fade out where they go and in where they come (P15), and the lobule's frame
// reads nothing from the page that lays it out or restyles it (H2): its size, theme and styles are kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('lobule labels, zone names and leaders never cut out', () => {
  assert.doesNotMatch(js, /(L\.line|L\.dotEl)\.style\.display\s*=/, 'a leader or dot is faded (.ld-gone), not display none');
  assert.doesNotMatch(js, /L\.el\.hidden = true; L\.line/, 'a label is faded out before it is hidden');
  assert.doesNotMatch(js, /zoneEls\.pop\(\)\.remove\(\)/, 'zone names fade out before they are removed');
  assert.doesNotMatch(js, /z\.hidden = !at/, 'a zone name with no spot fades out');
  assert.match(js, /function fadeOut\(el, done\)/);
  assert.match(css, /@property --off-o \{[^}]*inherits: true; initial-value: 1;/);
  assert.match(css, /\.lz-lab, \.lz-zone \{[^}]*--off-o \.3s[^}]*animation: lz-in \.3s/, 'labels fade in and out');
  assert.match(css, /@keyframes lz-in \{ from \{ --off-o: 0; \} \}/);
  assert.match(css, /\.lz-labels \.lz-off \{ --off-o: 0; pointer-events: none; \}/);
  assert.match(css, /\.lz-leaders \.ld-gone \{ opacity: 0; transition: opacity \.3s/);
  // Every opacity a label's parts take carries the fade, its lit pill included, so pill and letters fade together.
  assert.match(css, /\.lz-labels > \* > \* \{ opacity: calc\([^}]*var\(--off-o, 1\)\); \}/);
  for (const m of css.matchAll(/\.lz-zone span \{[^}]*opacity: calc\(([^}]*)\); \}/g)) assert.match(m[1], /--off-o/, 'zone name fade');
  assert.match(css, /:is\(\.lz-lab, \.lz-zone, \.sv-region\)::before \{[^}]*opacity: calc\([^;]*var\(--off-o, 1\)\);/, 'lit pill fade');
});

test('a label\'s colour change does not rebuild it', () => {
  assert.match(js, /frame = `\$\{name\}\|\$\{short\}\|\$\{uk\}\|\$\{v === ''\}\|\$\{!!d\}`/);
});

test('the lobule\'s frame keeps its size, theme query and styles', () => {
  const draw = js.slice(js.indexOf('  function draw(dt) {'), js.indexOf('\n  }\n', js.indexOf('  function draw(dt) {')));
  assert.ok(draw.length > 100);
  assert.doesNotMatch(draw, /getBoundingClientRect|matchMedia|getComputedStyle/);
  assert.match(js, /new ResizeObserver\(\(\) => \{\s*const was = hostWH; hostWH = null;/, 'the size is read again when the host resizes');
  assert.match(js, /if \(said !== tissueSaid\)/, 'the tissue label is written only when its words change');
});
