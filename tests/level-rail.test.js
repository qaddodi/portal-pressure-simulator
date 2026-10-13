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

test('the rail marks the block with the phone ladder block (hatched, outlined) wrapped round the whole bar', () => {
  assert.match(js, /function railBlock\(\)[\s\S]*hatch\(id, 7\)[\s\S]*class: 'pzs-drop'[\s\S]*width: '100%'/);
  assert.ok(js.includes('i === at ? railBlock() : null'));
  const b = css.split('\n').find((l) => l.startsWith('.pz-rail li > i .pz-rail-blk {'));
  const [, hgt] = b.match(/height: ([\d.]+)em/);
  assert.ok(b.includes('width: calc(100% +'), 'spans the whole bar');
  assert.ok(+hgt > 0.62 + 0.1, 'taller than the bar');
  assert.ok((+hgt - 0.62) / 2 < 0.5, 'overhang stays inside the gap above the label (.5em)');
  assert.ok(!css.split('\n').some((l) => l.startsWith('.pz-rail li > i b {')));
  // (the block reaches past the end bars, so the rail keeps that much room at its sides, or the card edge clips it)
  const [, over] = b.match(/left: -([\d.]+)em/);
  const rail = css.split('\n').find((l) => l.startsWith('.pz-rail {'));
  const [, rp] = rail.match(/--rp: ([\d.]+)em/);
  assert.ok(rail.includes('padding: 1.6em var(--rp) 0'), 'rail padded at both sides');
  assert.ok(+rp > +over, 'side room covers the overhang and its outline');
});
