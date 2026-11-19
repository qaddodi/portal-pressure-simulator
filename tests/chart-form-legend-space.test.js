// The profile chart's form (the plot, or the strip of readings) must not change the chart's own box: the legend hides in the strip form, and
// when that took it out of the layout the chart grew by its row, the plot then fit, the legend came back, the chart shrank, and the form
// flipped about 18 times a second (found by the gallery layout sweep on tests-profile/*, 19 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/charts.js', import.meta.url), 'utf8');
const setForm = src.slice(src.indexOf('const setForm = (strip) =>'), src.indexOf('// The strip\'s kept columns'));

test('the strip form hides the legend but keeps its row, so the chart box does not depend on the form', () => {
  assert.ok(setForm.length > 50, 'setForm found');
  assert.match(setForm, /legend\.style\.visibility/);
  assert.doesNotMatch(setForm, /setDisplay\(\s*legend/, 'the legend is never taken out of the layout by the form');
});

test('no other code in the chart changes the legend\'s display with the form', () => {
  const rest = src.replace(setForm, '');
  assert.doesNotMatch(rest, /setDisplay\(\s*legend\s*,/);
});
