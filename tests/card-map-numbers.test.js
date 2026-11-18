// A vessel card and the map print one number for one pressure (play-test 17 Nov 2026, V19/F4: the card said 30.5 → 11.6, the map "PV 30.9"): the stations the bottom bar
// reads go through the bar's reading in the card as they do in the label.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const keys = (src, name) => {
  const m = src.match(new RegExp(`${name} = \\{([^}]*)\\}`));
  assert.ok(m, `${name} found`);
  return Object.fromEntries([...m[1].matchAll(/(\w+): '(\w+)'/g)].map((x) => [x[1], x[2]]));
};

test('the vessel card reads the bar stations as the map label does', () => {
  const card = read('src/ui/actions.js'), label = read('src/ui/stage-label-items.js');
  assert.deepEqual(keys(card, 'BAR_KEY'), keys(label, 'LADDER_KEY'), 'the same stations, the same readings');
  assert.match(card, /P = st \? stationP\(f, st, PF\)/, 'the card’s own reading');
  assert.match(card, /H1 = ends \? stationP\(f, ends\[0\], PF\)/, 'the in → out of a narrowed vessel');
  assert.match(card, /H2 = ends \? stationP\(f, ends\[1\], PF\)/);
});
