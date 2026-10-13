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
