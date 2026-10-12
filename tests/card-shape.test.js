import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Cards are physical: in the presenter they enter and leave whole, and never animate their own size in view.
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.trim(), body }));

test('presenter cards never transition their size', () => {
  const card = /\.pz-(data|text)\b|\.pz-shade\.pz-card/;
  for (const { sel, body } of rules) {
    if (!card.test(sel) || /stack/.test(sel) && !/:not\(\.stack\)/.test(sel)) continue;
    const t = body.match(/transition(-property)?:\s*([^;]+)/g) || [];
    for (const d of t) assert.doesNotMatch(d, /\b(width|height|max-height)\b/, `${sel} animates its size: ${d}`);
  }
});

test('the teaching card leaves and arrives like the data card', () => {
  assert.match(css, /\.pz-text\.pz-leave \{ opacity: 0; transform: translateX\(-18px\)/);
  assert.match(css, /\.pz-shade\.pz-card\.pz-leave:not\(\.stack\) \{ opacity: 0/);
});
