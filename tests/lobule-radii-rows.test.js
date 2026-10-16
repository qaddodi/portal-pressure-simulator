import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// In the lobule a vessel's new radii are drawn as its colour changes are: only that vessel's cells (veins-gl drawRows, or
// the moved layer on a pan), never the whole vessel layer. The renderer counts the row as changed (setRadii → radRows) and
// draws it only when the caller names it, so the caller has to name it.
const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const vg = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');

test('a lobule radius change names its vessel instead of dirtying the whole layer', () => {
  const line = lz.split('\n').find((l) => l.includes('g.setRadii(t.id, r)'));
  assert.ok(line, 'the lobule sends radii');
  assert.match(line, /glRows\.add\(t\.id\)/);
  assert.doesNotMatch(line, /glDirty = true/);
});

test('the renderer only stands in for a whole draw when every changed radius row is named', () => {
  assert.match(vg, /setRadii\(row, r\)[\s\S]*?radRows\.add\(row\)/);
  assert.match(vg, /drawRows\([^)]*\) \{[\s\S]*?!radCovered\(rows\)\) return false/);
  assert.match(vg, /const panAt = fboOK && radCovered\(rows\)/);
});
