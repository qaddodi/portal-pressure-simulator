// Into or out of the sinusoid the view pill glides to its new home on the zoom's clock and curve, and its selected button
// crossfades (17 Oct, Mohammad: the pill "should transition as well nicely elegantly when going from to lobule to and from sinusoid").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const main = read('../src/ui/main.js');
const lz = read('../src/ui/lobule-zoom.js');
const css = read('../styles/app.css');

test('the pill glides over the sinusoid zoom\'s own time and curve', () => {
  const zoom = lz.match(/ms = \(reduce\.matches \? 280 : on \? (\d+) : (\d+)\)/);
  assert.ok(zoom, 'the sinusoid zoom times');
  assert.match(main, new RegExp(`const PILL_IN = ${zoom[1]}, PILL_OUT = ${zoom[2]};`), 'the pill takes the zoom\'s times, in and out');
  // The same cubic ease in and out as the zoom (easeIO), and the CSS crossfade on its cubic-bezier.
  assert.ok(lz.includes('const easeIO = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);'));
  assert.ok(main.includes('const easeIO3 = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);'));
  assert.ok(css.includes(':is(.nb-views, .sin-views).vp-glide #viewSeg button { transition-duration: var(--vp-ms, .95s); transition-timing-function: cubic-bezier(.65, 0, .35, 1); }'));
});

test('the pill starts where it was, moves only when its home changes, and its pressed button changes after the move', () => {
  const sync = main.match(/const syncViewSeg = \(\) => \{([^\n]*)\};/)[1];
  assert.match(sync, /pillFrom = sinWas !== !!\(st\.lobule && st\.sinusoid\) \? viewPillRect\(\) : null;/, 'measured before the class changes, only on a sinusoid change');
  const i = sync.indexOf('glideViewPill(pillFrom, !sinWas)'), j = sync.indexOf("b.setAttribute('aria-pressed'");
  assert.ok(i > 0 && j > i, 'the pressed state is set after the move, so it crossfades rather than snapping in the new parent');
  const glide = main.match(/function glideViewPill\(from, intoSin\) \{([\s\S]*?)\n\}/)[1];
  assert.match(glide, /prefers-reduced-motion: reduce/, 'reduced motion: the pill just takes its place');
  assert.match(glide, /- shift\[1\] \* z/, 'its resting place is read each frame, less its own shift');
  // The dock's published height reads the pill at rest, not mid-glide (the lobule's framing depends on it).
  assert.match(main, /nbv\.getBoundingClientRect\(\)\.top \+ \(pillEl === nbv \? pillShiftY : 0\) \+ 8/);
});

test('the glide lands exactly on the pill\'s resting place, and starts exactly where it was', () => {
  const easeIO3 = (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
  const from = 700, rest = 812;
  const at = (u) => rest + (from - rest) * (1 - easeIO3(u));
  assert.equal(at(0), from);
  assert.equal(at(1), rest);
  for (let u = 0.05; u < 1; u += 0.05) assert.ok(at(u) >= at(u - 0.05), 'one way, no overshoot');
});
