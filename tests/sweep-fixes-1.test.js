// Small layout rules from the overnight screenshot sweeps (review/random-sweep, batches 01 to 03). Each was seen broken
// on a device; these checks keep the rule that fixed it in place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const util = readFileSync(new URL('../src/ui/util.js', import.meta.url), 'utf8');
const presenter = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const rule = (sel) => { const i = css.indexOf(sel + ' {'); assert.ok(i >= 0, `${sel} is missing`); return css.slice(i, css.indexOf('}', i)); };

test('a press or drag on the figure leaves no ring round the whole view', () => {
  assert.match(css, /\.stage-view #stage:focus, \.stage-view #stage:focus-visible \{ outline: none; \}/);
});

test('a menu switch that is off stays visible: white knob, strong edge, as the other switches', () => {
  assert.match(rule('.lens-opt .mt-sw'), /inset 0 0 0 1px var\(--hairline\)/);
  assert.match(rule(".lens-opt .mt-sw::after"), /background: var\(--light-ink\)/);
});

test('Settings may use the room down to the 8 px margin, and scrolling menus fade at the bottom', () => {
  assert.match(util, /el\.classList\.contains\('app-menu'\)\) \{/);
  assert.match(util, /barTop = d\.top;/, 'and stops above the bottom bar where the two meet');
  assert.match(util, /\(barTop \?\? visibleBottom\(\)\) - r\.bottom - 16/);
  assert.match(util, /fadeWhileMore\(el\)/);
  assert.match(css, /\.um-col\.more, \.um-cols\.more \{[^}]*mask-image/);
});

test('a phone held sideways: the bar ends at the Tests card and its controls spread evenly', () => {
  assert.match(css, /\.app\.dock-open:has\(#dock\.side\) \.vdock \{ right: [^}]*width: auto; \}/);
  assert.match(css, /\.vdock \.timeline \{ justify-content: space-between; \}/);
});

test('a box at the end of a slide\'s words ends 8 px above the nav pill on a tablet; a phone keeps its 3', () => {
  assert.match(presenter, /--pz-reach-box', ui\.root\.classList\.contains\('tab'\) \? `\$\{Math\.max\(0, \(restRect\(text\)\.top \+ restRect\(text\)\.height - restRect\(bar\)\.top\) \/ k \+ 8\)/);
  assert.match(presenter, /: `\$\{Math\.max\(0, Math\.ceil\(reach\) \+ 3\)\}px`\);/);
  const n = [...css.matchAll(/\.pz-pillclr \{ margin-bottom: calc\(\(var\(--pz-reach-box, 37px\) \+ var\(--pz-fkrow, 0px\)\)/g)].length;
  assert.ok(n >= 3, `pill clearance rules: ${n}`);
});

test('the sideways bar reads evenly spaced to the eye (the glyphs sit inside their buttons)', () => {
  assert.match(css, /\.vdock \.timeline \.tl-time \{ margin-left: 11\.5px; \}/);
  assert.match(css, /\.vdock \.timeline \.tl-pin \{ margin-left: -1\.5px; \}/);
});

test('a scrolling menu fades right to its own bottom edge, and Settings above the bar casts no shadow on it', () => {
  assert.match(css, /\.menu\.more::after \{ content: ''; position: sticky; bottom: calc\(-1 \* var\(--fade-pb, 8px\)\);/);
  assert.match(util, /el\.style\.setProperty\('--fade-pb', getComputedStyle\(el\)\.paddingBottom\)/);
  assert.match(util, /el\.style\.clipPath = barAt == null \? '' : `inset\(-64px -64px \$\{\(-Math\.max\(0, gap\) \/ z\)\.toFixed\(2\)\}px -64px\)`/);
});

test('the credit keeps off a steady vessel glow', () => {
  const credit = readFileSync(new URL('../src/ui/credit.js', import.meta.url), 'utf8'), stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /steadyGlows: \(\) => \['sel', 'dop', 'slide', 'focus'\]/);
  assert.match(credit, /\+ 2 \* 12 \* Math\.min\(1\.3, Math\.max\(0\.5, wide\)\)/);
});

test('the credit never wraps onto two lines', () => {
  const credit = readFileSync(new URL('../src/ui/credit.js', import.meta.url), 'utf8');
  assert.match(credit, /for \(const two of \[false\]\)/);
});

test('in the lobule the credit keeps off the portal tracts and neighbouring central veins, not only the outline', () => {
  const credit = readFileSync(new URL('../src/ui/credit.js', import.meta.url), 'utf8');
  const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
  assert.match(lz, /out\.discs = \[\]/);
  assert.match(lz, /for \(const c of l\.corners\)/);
  assert.match(credit, /for \(const \[x, y, rr\] of ring\.discs \|\| \[\]\)/);
});
