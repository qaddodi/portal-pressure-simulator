// The lobule's labels, zone names and leaders fade out where they go and in where they come (P15), and the lobule's frame
// reads nothing from the page that lays it out or restyles it (H2): its size, theme and styles are kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
import { LOOKS } from '../src/ui/chart-looks/index.js';
import { makeCtx, withCtx, resolveProps } from '../src/ui/chart-looks/resolve.js';

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
  for (const k of ['small.lead.line', 'small.lead.dot']) {   // (a leader and dot leave with their label: the looks table, chart-looks/small.js)
    const p = resolveProps(LOOKS[k], withCtx(makeCtx({ host: 'lobule' }), { theme: 'light', dark: false, palette: 'navy', view: 'anatomic' }), { gone: true }, {});
    assert.equal(p.opacity, 0, k); assert.ok(p.ease.opacity.ms > 0, `${k} fades, it does not cut`);
  }
  // The fades are layers' opacities (the compositor's, no repaint), so pill and letters fade together as their label does: no
  // registered variable is eased for them any more.
  assert.doesNotMatch(css, /--(lab|lit|off|pill)-o|--sv-in/, 'no label fade runs through a variable');
  assert.match(css, /:is\(\.lz-lab, \.lz-zone, \.sv-region\)::before \{[^}]*opacity: 0; transition: opacity var\(--d-surface\) var\(--ease\);/, 'lit pill fade');
  assert.match(css, /\.lz\.lz-cam \.lz-labels \{ opacity: 0; transition: opacity var\(--d-small\)/, 'the set fades as one layer');
});

test('a label\'s colour change does not rebuild it', () => {
  // (The label's make-up, part by part: name, short name, unit with numerals as zeros, whether it has a number, whether it has a change.)
  assert.match(js, /const hasX = !!x, same = L\.fN === name && L\.fS === short && L\.fU === uk && L\.fE === empty && L\.fD === hasD && !!L\.fX === hasX;/);
  assert.match(js, /L\.lk = `\$\{name\}\|\$\{short\}\|\$\{uk\}\|\$\{empty\}\|\$\{hasD\}\|\$\{hasX\}`;/);
});

test('the lobule\'s frame keeps its size, theme query and styles', () => {
  const draw = js.slice(js.indexOf('  function draw(dt) {'), js.indexOf('\n  }\n', js.indexOf('  function draw(dt) {')));
  assert.ok(draw.length > 100);
  assert.doesNotMatch(draw, /getBoundingClientRect|matchMedia|getComputedStyle/);
  assert.match(js, /new ResizeObserver\(\(\) => \{\s*const was = snap\.hostWH;\s*if \(readAll\(\) && fade > 0\) relayout\(\);/, 'the size is read again when the host resizes');
  assert.match(js, /if \(said !== tissueSaid\)/, 'the tissue label is written only when its words change');
});
