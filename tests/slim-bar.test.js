// The bottom bar is one slim row: the key readouts are HVPG and PPG only, the strip no longer opens
// (every readout is in Tests > Readouts), and the narrator line is off unless Settings turns it on.
// (dock.js and main.js need a DOM to import, so they are read as text.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

test('the bar keeps HVPG and PPG, two lobule flows, and no chevron', () => {
  const dock = read('../src/ui/dock.js');
  assert.match(dock, /export const PRIMARY = new Set\(\['hvpg', 'ppg'\]\)/);
  assert.match(dock, /export const LOBULE_PRIMARY = new Set\(\['lz-sin', 'lz-pv'\]\)/);
  assert.doesNotMatch(dock, /ro-more/);
  assert.doesNotMatch(dock, /classList\.toggle\('all'/);
});

test('tapping the bar\'s HVPG or PPG does nothing: a plain div, no click handler, no hover or pointer', () => {
  const dock = read('../src/ui/dock.js');
  assert.match(dock, /const BAR_INERT = PRIMARY;/);
  assert.match(dock, /h\(inert \? 'div' : 'button'/);
  assert.match(dock, /if \(inert\) \{ \/\* readout only \*\/ \}\n\s+else if \(t\.pane\)/);
  const css = read('../styles/app.css');
  assert.match(css, /\.metric\.inert \{ cursor: default; \}/);
  assert.match(css, /\.metric\.inert:hover \{ background: transparent; \}/);
});

test('the narrator is off by default for both roles', () => {
  assert.match(read('../src/ui/main.js'), /NARRATOR_DEFAULT = \{ student: false, instructor: false \}/);
});

test('from a tablet up the dock is a fixed, centred width (no shifting as the clock runs)', () => {
  const css = read('../styles/app.css');
  const slim = css.slice(css.indexOf('The slim bottom bar'));
  assert.match(slim, /\.vdock:not\(\.mini\) \{ width: min\(calc\(100% - 2 \* var\(--gap\)\), 640px\)/);
  assert.match(slim, /\.metric\.primary \{ flex: 0 0 128px; width: 128px; \}/);
});
