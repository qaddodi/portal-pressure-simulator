// The level rail names each level once, on one line under its bar (no vessel names, no mid-word breaks); a card too
// narrow for flat names tilts them 45° instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('rail names carry no vessel text or soft hyphens', () => {
  const block = js.slice(js.indexOf('const SITES = ['), js.indexOf('// ── Visuals over the dimmed figure'));
  assert.ok(!/Portal tracts|Central veins|Hepatic veins|Sinusoids|\\u00AD|­/.test(block));
  assert.ok(!block.includes("class: 'p'"));
});

test('rail names stay on one line, sized to their column, and tilt 45° when the card is narrow', () => {
  const n = css.split('\n').find((l) => l.startsWith('.pz-rail .n {'));
  assert.ok(n.includes('white-space: nowrap') && n.includes('cqw'));
  assert.match(css, /@container \(max-width: \d+px\)\s*\{[^@]*rotate: -45deg/);
});

test('the rail marks the block with the ladder hatching (diagonal red stripes), not a solid bar', () => {
  const b = css.split('\n').find((l) => l.startsWith('.pz-rail li > i b {'));
  assert.ok(b.includes('repeating-linear-gradient(45deg') && b.includes('var(--danger)') && !b.includes('box-shadow') && b.includes('inset: 0'));
});
