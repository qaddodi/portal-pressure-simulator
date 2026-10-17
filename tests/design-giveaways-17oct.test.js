import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The four safe fixes from docs/design-humanizer.md's first audit (DG2–DG5), picked by Mohammad on 17 Oct.
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const css = read('styles/app.css'), tokens = read('styles/tokens.css');
const chart = read('src/ui/chart.js'), main = read('src/ui/main.js'), dock = read('src/ui/dock.js');
const rule = (sel) => { const at = css.indexOf('\n' + sel); assert.ok(at >= 0, sel); return css.slice(at, css.indexOf('}', at)); };

test('DG2: a card of tiles alone has no "The patient" header on any screen', () => {
  assert.match(css, /\n\.pz \.pz-data\.tiles-only:not\(\.has-tool\):not\(\.pz-folds\) > \.pz-dh \{ display: none; \}/);
  assert.ok(!/\.pz:is\(\.stack, \.low\) \.pz-data\.tiles-only:not\(\.has-tool\):not\(\.pz-folds\) > \.pz-dh/.test(css), 'not only on a phone');
});

test('DG3: the accent is kept for controls: the progress line and the "What if" label are ink, the focus ring is the accent', () => {
  assert.ok(!/var\(--accent/.test(rule('.pz-prog i {')), 'progress line');
  assert.ok(!/var\(--accent/.test(rule('.pzi-k {')), '"What if" label');
  assert.ok(!/#3B82F6/i.test(tokens), 'no stock UI-kit blue');
  assert.match(tokens, /--focus: #3155D1;/);
});

test('DG4: a chosen slide button is ink with an accent underline, not a filled accent pill, and the card draws no track', () => {
  const on = rule('.pz-abb[aria-pressed="true"] {');
  assert.ok(!/background/.test(on), 'no fill');
  assert.match(on, /text-decoration-color: var\(--accent\)/);
  assert.match(rule('.pz-abb {'), /text-decoration-color: transparent;[^}]*transition:[^}]*text-decoration-color/, 'the underline eases in');
  assert.match(rule('.pz-text .pz-ab {'), /background: none; border-color: transparent;/);
});

test('DG5: Treat and History are text-only headers, Treat tabs have no icons, drugs are rows with a check on the right', () => {
  for (const [src, name] of [[main, 'Treat'], [main, 'History'], [dock, 'Tests']]) {
    assert.ok(new RegExp(`card-title' \\}, h\\('span', \\{\\}, '${name}'\\)`).test(src), `${name} title has no icon`);
  }
  const tabs = chart.slice(chart.indexOf("const panes = [['drugs'"), chart.indexOf('show(treatTab);'));
  assert.ok(!/svgIcon/.test(tabs), 'Treat tabs');
  assert.match(chart, /section\('changes', 'Changes', null,/);
  assert.match(chart, /h\('span', \{ class: 'oc-t' \}, label\), h\('span', \{ class: 'oc-dot' \}, icon\('check'\)\)/, 'name first, check after');
  const chip = rule('.order-chip {');
  assert.match(chip, /border: 0; border-bottom: 1px solid var\(--hairline\); border-radius: 0; background: none;/);
  assert.ok(!/background/.test(rule('.order-chip[aria-pressed="true"] {')), 'a running drug is not a filled chip');
});
