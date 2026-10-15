// The bottom bar is one slim row: the key readouts are HVPG and PPG only, the strip no longer opens
// (every readout is in Tests > Readouts), and no pill (event, narrator, bleed or passing note) floats above the timeline.
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

test('no pill (event, narrator, bleed or passing note) floats above the timeline (History keeps the events)', () => {
  const js = read('../src/ui/timeline.js') + read('../src/ui/main.js') + read('../src/ui/util.js');
  const css = read('../styles/app.css'), html = read('../index.html');
  for (const name of ['tl-latest', 'narrator', 'nr-why', 'tl-ld', 'pps:event', 'bleed-pill', 'bleedPill', 'bp-dot', 'vd-note', 'vd-status', 'vdStatus', 'inlineNote']) {
    assert.ok(!js.includes(name), `a script still uses ${name}`);
    assert.ok(!css.includes(name), `app.css still styles ${name}`);
    assert.ok(!html.includes(name), `index.html still has ${name}`);
  }
  assert.match(read('../src/ui/timeline.js'), /kind: 'event'/);   // events are still recorded for History
  assert.match(read('../src/ui/timeline.js'), /tl-hist/);
});

test('from a tablet up the dock is a fixed, centred width (no shifting as the clock runs)', () => {
  const css = read('../styles/app.css');
  const slim = css.slice(css.indexOf('The slim bottom bar'));
  assert.match(slim, /\.vdock:not\(\.mini\) \{ width: min\(calc\(100% - 2 \* var\(--gap\)\), 640px\)/);
  assert.match(slim, /\.metric\.primary \{ flex: 0 0 128px; width: 128px; \}/);
});
