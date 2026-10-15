// The Tests card's Readouts tab lists every readout the old bottom bar carried: all three tile groups and the five
// systemic values. (dock.js and readouts-pane.js need a DOM to import, so they are read as text.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dock = readFileSync(new URL('../src/ui/dock.js', import.meta.url), 'utf8');
const pane = readFileSync(new URL('../src/ui/readouts-pane.js', import.meta.url), 'utf8');

test('Readouts is a tab of the Tests card, after the other instruments', () => {
  assert.match(dock, /ORDER = \[[^\]]*'fibroscan', 'readouts'\]/);
  assert.match(dock, /readouts: \['grid',/);
  assert.match(dock, /readouts: 'Readouts'/);
  assert.match(dock, /createReadoutsPane\(\{ tiles: TILES, groups: GROUPS, vitals: VITALS/);
});

test('the pane shows every group and every systemic value, and each tile can say what drives it', () => {
  const ids = [...pane.matchAll(/\['(map|hr|co|ra|hb)', '/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['map', 'hr', 'co', 'ra', 'hb']);
  assert.match(pane, /section\('systemic', 'Systemic'/);
  assert.match(pane, /groups\.map\(\(\[g, label\]\) => section\(g, label, tiles\.filter\(\(t\) => t\.group === g\)/);
  assert.match(pane, /onWhy\(t\.why, el\)/);
  assert.match(pane, /onWhy\(v\.why, el\)/);
});
