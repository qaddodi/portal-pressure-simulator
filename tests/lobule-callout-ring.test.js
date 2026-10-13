// The presenter's lesion pointer in the lobule (ring and leader) is drawn at a bold, fixed screen weight so it reads on
// phone, iPad and Mac at any zoom (only its radius follows the zoom).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the lobule callout ring and leader are at least 4px thick, in every kind', () => {
  const rule = css.match(/^\.lz-call-l, \.lz-call-r \{[^}]*\}/m)?.[0] || '';
  const w = parseFloat(rule.match(/stroke-width:\s*([\d.]+)px/)?.[1]);
  assert.ok(w >= 4, `stroke-width is ${w}px`);
  assert.doesNotMatch(css, /\.lz-call-[lr][^{]*\{[^}]*stroke-width:\s*[0-3](\.\d+)?px/);
});

test('the lesion leader starts on the ring\'s edge, and labels keep clear of the ring', () => {
  const js = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
  assert.match(js, /callLine\.setAttribute\('x1', a\[0\] \+ \(best\.x - a\[0\]\) \* e0\)/, 'leader start is offset by the ring radius');
  assert.doesNotMatch(js, /callLine\.setAttribute\('x1', a\[0\]\); callLine/, 'leader no longer starts at the ring centre');
  assert.match(js, /ringDepth\(ring, box\) > 0 \? 1e6/, 'labels pay the full clash cost for touching the ring');
  assert.match(js, /ringDepth\(ring, box\) \* 1e4/, 'the pill keeps off the ring too');
});

test('lobule labels and the pointer pill prefer spots outside the lobule, falling back inside only when there is no room', () => {
  const js = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
  assert.match(js, /const hexOf = \(\) =>/, 'the lobule outline on screen is measured each layout');
  assert.match(js, /for \(const c of hex\.outside\(a, w, hh\)\) candidates\.push\(c\)/, 'labels try spots just beyond the rim');
  assert.match(js, /hex\.share\(box\) \* INSIDE_COST/, 'a label inside the lobule pays a soft cost (never above a clash)');
  assert.match(js, /ringDepth\(ring, box\) \* 1e4 \+ hex\.share\(box\) \* INSIDE_COST/, 'the pill prefers outside too');
  const cost = Number(js.match(/INSIDE_COST = (\d+)/)?.[1]);
  assert.ok(cost > 0 && cost * 6 < 1e5, 'the inside cost stays well below the clash costs, so it never causes overlaps');
});
