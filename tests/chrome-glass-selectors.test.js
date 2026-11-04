// The solid fallback in app.css must list exactly the pills main.js CHROME gives glass, no wider.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MAIN = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the chrome [data-gl] rules list exactly the CHROME pills', () => {
  const m = MAIN.match(/const CHROME = \[(.+)\]\.join/);
  assert.ok(m, 'CHROME found');
  const sels = m[1].split(/',\s*'/).map((s) => s.replace(/^'|'$/g, '').trim());
  const list = sels.join(', ');
  const rules = CSS.split('\n').filter((l) => /^:root:root :is\(/.test(l) && /\[data-gl\]|:not\(\[data-gl\]\)/.test(l) && l.includes('.nb-views > .vp-face'));
  assert.equal(rules.length, 2);
  for (const r of rules) assert.ok(r.includes(`:is(${list})`), `rule lists CHROME: ${r.slice(0, 120)}`);
});
