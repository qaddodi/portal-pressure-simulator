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
  assert.match(css, /\.lz-lab, \.lz-zone \{ transition: opacity var\(--d-surface\) var\(--ease\); animation: lz-in var\(--d-small\)/, 'labels fade in and out');
  assert.match(css, /@keyframes lz-in \{ from \{ opacity: 0; \} \}/);
  assert.match(css, /\.lz-labels \.lz-off \{ opacity: 0; pointer-events: none; \}/);
  assert.match(css, /\.lz-labels :is\(\.lz-lab, \.lz-zone\)\.lz-off\.lz-off \{ transition-duration: var\(--d-small\)/, 'going, on the quicker clock');
  assert.match(css, /\.lz-leaders \.ld-gone \{ opacity: 0; transition: opacity var\(--d-small\)/);
  // The fades are layers' opacities (the compositor's, no repaint), so pill and letters fade together as their label does: no
  // registered variable is eased for them any more.
  assert.doesNotMatch(css, /--(lab|lit|off|pill)-o|--sv-in/, 'no label fade runs through a variable');
  assert.match(css, /:is\(\.lz-lab, \.lz-zone, \.sv-region\)::before \{[^}]*opacity: 0; transition: opacity var\(--d-surface\) var\(--ease\);/, 'lit pill fade');
  assert.match(css, /\.lz\.lz-cam \.lz-labels \{ opacity: 0; transition: opacity var\(--d-small\)/, 'the set fades as one layer');
});

test('a label\'s colour change does not rebuild it', () => {
  assert.match(js, /frame = `\$\{name\}\|\$\{short\}\|\$\{uk\}\|\$\{v === ''\}\|\$\{!!d\}`/);
});

test('the lobule\'s frame keeps its size, theme query and styles', () => {
  const draw = js.slice(js.indexOf('  function draw(dt) {'), js.indexOf('\n  }\n', js.indexOf('  function draw(dt) {')));
  assert.ok(draw.length > 100);
  assert.doesNotMatch(draw, /getBoundingClientRect|matchMedia|getComputedStyle/);
  assert.match(js, /new ResizeObserver\(\(\) => \{\s*const was = snap\.hostWH;\s*if \(readAll\(\) && fade > 0\) relayout\(\);/, 'the size is read again when the host resizes');
  assert.match(js, /if \(said !== tissueSaid\)/, 'the tissue label is written only when its words change');
});
