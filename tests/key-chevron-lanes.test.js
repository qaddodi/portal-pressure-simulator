import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EDGES } from '../src/engine/topology.js';
import { keyChevron, KEY_CHEV_LANES } from '../src/ui/blood.js';

const edge = (id) => EDGES.find((e) => e.id === id);

test('Key chevrons only: the azygos keeps its chevrons while the ascending lumbar collateral shares its lane', () => {
  const azy = edge('AZY_SVC');
  assert.equal(keyChevron(azy, () => false), false, 'a context vein fades with no collateral in it');
  assert.equal(keyChevron(azy, (id) => id === 'C9'), true, 'with C9 open, its course up the azygos lane keeps chevrons');
  assert.equal(keyChevron(edge('C9')), true);
  assert.equal(keyChevron(edge('PV_TRUNK')), true);
  assert.equal(keyChevron(edge('IVC_IS'), () => true), false, 'an open collateral lends its chevrons only to the lane it runs in');
});

test('every lane rule names a real vein and a real collateral', () => {
  for (const [vein, colls] of Object.entries(KEY_CHEV_LANES)) {
    assert.ok(edge(vein), vein);
    for (const c of colls) assert.equal(edge(c)?.kind, 'collateral', c);
  }
});

test('the stage asks keyChevron, with the collaterals drawn open, for each vessel\'s chevrons', () => {
  const src = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(src, /keyChevron\(EDGES\[k\], laneOpen\)/);
  assert.doesNotMatch(src, /KEY_IDS/);
});
