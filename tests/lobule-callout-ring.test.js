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
  assert.match(js, /setGeo\(callLine, 'x1', a\[0\] \+ \(bx - a\[0\]\) \* e0\)/, 'leader start is offset by the ring radius');
  assert.doesNotMatch(js, /callLine\.setAttribute\('x1', a\[0\]\); callLine/, 'leader no longer starts at the ring centre');
  assert.match(js, /const rd = ringDepth\(ring, cb\);[\s\S]*?\(rd > 0 \? 1e6 \+ rd \* 1e3 : 0\)/, 'labels pay the full clash cost for touching the ring');
  assert.match(js, /\(rd0 > 0 \? 1e6 \+ rd0 \* 1e4 : 0\)/, 'the pill pays the full clash cost for touching the ring too');
});

test('the pointer pill prefers spots outside the lobule, falling back inside only when there is no room', () => {
  const js = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
  assert.match(js, /const hexOf = \(\) =>/, 'the lobule outline on screen is measured each layout');
  assert.match(js, /\+ hex\.share\(cBox\) \* INSIDE_COST \+ c4/, 'the pill prefers outside');
  const cost = Number(js.match(/INSIDE_COST = (\d+)/)?.[1]);
  assert.ok(cost > 0 && cost * 6 < 1e5, 'the inside cost stays well below the clash costs, so it never causes overlaps');
});

test('resistance callouts in the lobule are one short word, so they never crowd the vessel labels', async () => {
  const { readdirSync } = await import('node:fs');
  const dir = new URL('../src/ui/decks/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/callout: \{ at: '\w+', label: '([^']*)' \}/g)) if (/resist/i.test(m[1])) assert.equal(m[1], 'Resistance', `${f}: "${m[1]}"`);
  }
});

test('the credit keeps clear of the lobule pill\'s ring', () => {
  const js = readFileSync(new URL('../src/ui/credit.js', import.meta.url), 'utf8');
  assert.match(js, /\.lz-call, \.lz-call-r\.on,/);
});
