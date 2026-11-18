// A slide's title uses the teaching card's whole text width, as its lines do (19 Oct: "the title is not using the entire slide
// width"; balanced, "Closing the shunt sends blood back through the liver" kept to the left 60 % of a wide card).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appCss } from './split-src.js';

const css = appCss();

test('a slide title fills its line before wrapping, never balanced or narrowed', () => {
  const base = css.match(/\n\.pz-h \{[^}]*\}/)?.[0] ?? '';
  assert.match(base, /text-wrap: pretty/);
  for (const m of css.matchAll(/([^{}\n]*\.pz-h(?![\w-])[^{}]*)\{([^}]*)\}/g)) {
    if (/\.pz-h\s+\./.test(m[1].split(',').filter((x) => x.includes('.pz-h')).join(','))) continue;   // (rules for a part inside the title)
    assert.doesNotMatch(m[2], /text-wrap:\s*balance/, `${m[1].trim()} balances the title`);
    assert.doesNotMatch(m[2], /max-width/, `${m[1].trim()} narrows the title`);
  }
});
