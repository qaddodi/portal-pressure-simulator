import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The varix wall card's readings: the value and unit never wrap or shrink, and the name (Transmural ΔP is the long one) takes the
// room left and wraps, so nothing spills out of its tile. (tests/e2e/tile-fit.mjs checks every data card's tiles in a browser.)
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.trim().replace(/^\/\*[\s\S]*?\*\/\s*/, ''), body }));
const rule = (sel) => rules.filter((r) => r.sel.split(',').map((x) => x.trim()).includes(sel)).map((r) => r.body).join(' ');

test('a wall reading keeps its value whole and lets its name wrap', () => {
  const dt = rule('.pz-tool[data-kind="wall"] .endo-read dt');
  assert.match(dt, /min-width:\s*0/);
  assert.match(dt, /white-space:\s*normal/);
  assert.doesNotMatch(dt, /white-space:\s*nowrap/);
  const num = rule('.pz-tool[data-kind="wall"] .endo-num');
  assert.match(num, /flex:\s*none/);
  assert.match(num, /white-space:\s*nowrap/);
});

test('the stress reading wraps instead of being clipped with an ellipsis', () => {
  const v = rule('.pz-tool[data-kind="wall"] .endo-stress-v');
  assert.match(v, /white-space:\s*normal/);
  assert.doesNotMatch(css, /\.pz-tool\[data-kind="wall"\] \.endo-stress-v \{[^}]*text-overflow/);
});
