import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The overnight screenshot sweep's leftovers (16 Oct). The browser check tests/e2e/sweep-leftovers.mjs measures each one on
// screen; these hold the rules in the source.
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const rule = (sel) => { const i = css.indexOf(sel + ' {'); assert.ok(i >= 0, `${sel} has a rule`); return css.slice(i, css.indexOf('}', i)); };

test('the patient name and the menu titles are never cut with an ellipsis', () => {
  assert.doesNotMatch(rule('.scenario-v'), /text-overflow/);
  assert.doesNotMatch(rule('.um-t'), /text-overflow|nowrap/);
  assert.doesNotMatch(css, /scenario-v[^{]*\{[^}]*line-clamp/, 'no line clamp either (it ends in "…")');
  // Every form main.js can pick has its styles, and the narrowest form is the compact one.
  assert.match(main, /\['l', 's', 's2', 'c2'\]/);
  for (const f of ['s', 's2', 'c2']) assert.ok(css.includes(`[data-form="${f}"]`), f);
});

test('the compact names are the short names that cannot fit two lines of 84 px', () => {
  const m = main.match(/const COMPACT = (\{[^}]*\})/);
  assert.ok(m, 'COMPACT map');
  const map = Function(`return ${m[1]}`)();
  assert.equal(map['Sinusoidal obstruction syndrome'], 'SOS');
  for (const v of Object.values(map)) assert.doesNotMatch(v, /…|\.\.\./);
});

test('the quick check keeps no room for a controls pill that no longer sits in its card', () => {
  assert.doesNotMatch(rule('.pz.stack .pz-check'), /padding-bottom/);
});

test('a wide Treat card lays the procedures out three or four to a row', () => {
  assert.match(css, /@container treatpane \(min-width: 560px\) \{ \.treat-pane > \.order-grid:not\(\.three\) \{ grid-template-columns: repeat\(3,/);
  assert.match(css, /@container treatpane \(min-width: 760px\) \{ \.treat-pane > \.order-grid:not\(\.three\) \{ grid-template-columns: repeat\(4,/);
});

test('every framing of the whole circuit keeps clear of the zoom pill', () => {
  assert.doesNotMatch(stage, /insetVT\(\{ k: 1, x: 0, y: 0 \}, circVB\(\)\)(?!, circVB\(\)\))/, 'the whole map is always circWhole()');
  assert.match(stage, /const circWhole = \(\) => clearPill\(insetVT\(\{ k: 1, x: 0, y: 0 \}, circVB\(\)\), circVB\(\)\);/);
});
