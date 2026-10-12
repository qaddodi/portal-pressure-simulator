// The liver's outline and nodule sites are computed ahead (scripts/liver-geo.mjs). They must belong to the outline the
// artwork draws now, or the stage quietly falls back to computing them on every load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORGANS } from '../src/ui/anatomy.js';
import { strHash, nodularCells } from '../src/ui/liver-geo.js';
import { LIVER_GEO } from '../src/ui/liver-geo-data.js';

test('the stored liver geometry matches the outline in anatomy.js', () => {
  assert.equal(LIVER_GEO.key, strHash(ORGANS.find((o) => o.id === 'liver').d), 'the liver outline changed: run node scripts/liver-geo.mjs, then npm run stamp');
  assert.equal(LIVER_GEO.pts.length, 720);
  assert.ok(LIVER_GEO.sites.length > 2000 && LIVER_GEO.sites.length % 2 === 0);
});

test('the stored sites make a full set of nodules', () => {
  const sites = [];
  for (let i = 0; i < LIVER_GEO.sites.length; i += 2) sites.push([LIVER_GEO.sites[i], LIVER_GEO.sites[i + 1]]);
  const cells = nodularCells(sites);
  assert.ok(cells.length > sites.length * 0.9);
  for (const c of cells) assert.ok(c.v.length >= 3 && c.v.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
});
