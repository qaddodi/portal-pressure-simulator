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

test('the systemic values carry their data card tile\'s bar, scale, cut-offs, words and colours (22 Oct: any tile should have its normals)', async () => {
  const { SCALE, RATE } = await import('../src/ui/table-marks.js');
  for (const id of ['map', 'hr', 'co', 'ra', 'hb']) assert.ok(SCALE[id] && SCALE[id][2].length && RATE[id], `${id} has its tile's scale and rating`);
  assert.match(pane, /import \{ SCALE, RATE \} from '\.\/table-marks\.js/);
  assert.match(pane, /const S = SCALE\[v\.id\];/);
  assert.match(pane, /RATE\[x\.v\.id\]\(shownOf\(r\.v, x\.v\.d\), \{\}\)/, 'the word and colour are the tile\'s, judging the number as shown');
  assert.match(pane, /h\('span', \{ class: 'rb', 'aria-hidden': 'true' \}, fill, S\[2\]\.map/, 'a bar with a tick at each cut-off, as the other readouts have');
});
