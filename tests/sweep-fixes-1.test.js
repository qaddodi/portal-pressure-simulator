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
  assert.match(rule('.lens-opt .mt-sw'), /inset 0 0 0 1px var\(--border-strong\)/);
  assert.match(rule(".lens-opt .mt-sw::after"), /background: var\(--light-ink\)/);
});

test('Settings may use the room down to the 8 px margin, and scrolling menus fade at the bottom', () => {
  assert.match(util, /el\.classList\.contains\('app-menu'\)\) el\.style\.maxHeight = /);
  assert.match(util, /fadeWhileMore\(el\)/);
  assert.match(css, /\.menu\.more::after \{[^}]*position: sticky; bottom: 0;/);
  assert.match(css, /\.um-col\.more, \.um-cols\.more \{[^}]*mask-image/);
});

test('a phone held sideways: the bar ends at the Tests card and its controls spread evenly', () => {
  assert.match(css, /\.app\.dock-open:has\(#dock\.side\) \.vdock \{ right: [^}]*width: auto; \}/);
  assert.match(css, /\.vdock \.timeline \{ justify-content: space-between; \}/);
});

test('a box at the end of a slide\'s words stays 8 px or more above the nav pill', () => {
  // clearPill measures the reach with 3 px to spare; the box adds 6 more (the card's zoom rounds by a fraction).
  assert.match(presenter, /Math\.ceil\(reach\) \+ 3/);
  const n = [...css.matchAll(/\.pz-pillclr \{ margin-bottom: calc\(\(var\(--pz-reach, 32px\) \+ var\(--pz-fkrow, 0px\) \+ (\d+)px\)/g)].map((m) => +m[1]);
  assert.ok(n.length >= 3 && n.every((v) => v + 3 >= 8), `pill clearance: ${n}`);
});

test('the credit never wraps onto two lines', () => {
  const credit = readFileSync(new URL('../src/ui/credit.js', import.meta.url), 'utf8');
  assert.match(credit, /for \(const two of \[false\]\)/);
});
