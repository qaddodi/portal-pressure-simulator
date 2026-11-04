// The slide overview strip (N5): the tile geometry, the scroll rules, and that the presenter wires the landing, the open and the deck's end.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { atlasRows, tileAt, fitTile, TILE_W, TILE_H, COLS, MAX_TILES } from '../src/ui/thumb-atlas.js';
import { scrollFor, scrollMax, CW, GAP, PAD } from '../src/ui/slide-strip.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('tiles lie row by row in the atlas, and the atlas has the rows its deck needs', () => {
  assert.deepEqual(tileAt(0), [0, 0]);
  assert.deepEqual(tileAt(COLS), [0, TILE_H]);
  assert.deepEqual(tileAt(COLS + 2), [2 * TILE_W, TILE_H]);
  assert.equal(atlasRows(1), 1);
  assert.equal(atlasRows(COLS), 1);
  assert.equal(atlasRows(COLS + 1), 2);
  assert.equal(atlasRows(10000), MAX_TILES / COLS, 'a deck past the cap does not grow the atlas');
});

test('a picture is fitted whole and centred in its tile, whatever its shape', () => {
  for (const [w, h] of [[1600, 1000], [390, 844], [1000, 300], [64, 64]]) {
    const [x, y, fw, fh] = fitTile(w, h);
    assert.ok(x >= -1e-9 && y >= -1e-9 && x + fw <= TILE_W + 1e-9 && y + fh <= TILE_H + 1e-9, `${w}x${h} inside the tile`);
    assert.ok(Math.abs(fw / fh - w / h) < 1e-6, 'aspect kept');
    assert.ok(Math.abs(x - (TILE_W - fw) / 2) < 1e-9 && Math.abs(y - (TILE_H - fh) / 2) < 1e-9, 'centred');
  }
  assert.deepEqual(fitTile(0, 0), [0, 0, TILE_W, TILE_H]);
});

test('the strip scrolls to show a cell, never past its ends', () => {
  const n = 30, vw = 400, max = scrollMax(vw, n);
  assert.ok(max > 0);
  assert.equal(scrollFor(0, vw, n, 200), 0, 'the first cell: all the way back');
  assert.equal(scrollFor(n - 1, vw, n, 0), max, 'the last cell: all the way on');
  const x = scrollFor(10, vw, n, 0), left = PAD + 10 * (CW + GAP);
  assert.ok(left >= x && left + CW <= x + vw, 'cell 10 whole in view');
  assert.equal(scrollFor(10, vw, n, x), x, 'a cell already in view does not move the row');
  assert.equal(scrollMax(10000, 3), 0, 'a few slides in a wide strip do not scroll');
});

test('the presenter takes a picture when a slide lands, builds the strip when the list opens, and lets the atlas go with the deck', () => {
  const pz = read('src/ui/presenter.js');
  assert.match(pz, /shown = \{ i: to, gen: g \}; lastAt = to; shownBeat = b0;\n\s+strip\.landed\(to\);/);
  assert.match(pz, /strip\.build\(j, \{ title: deck\.title, items: slides, cur: want, pick: go,/);
  assert.match(pz, /strip\.shown\(\);/);
  assert.match(pz, /strip\.hide\(\);/);
  assert.match(pz, /strip\.drop\(\);\n\s+slidePrep\.cancel\(\)/);
  assert.match(pz, /if \(ui && !ui\.jump\.hidden\) \{ jumpKey\(e\); return; \}/, 'the list keeps its own keys');
});

test('the strip and its atlas draw on the GPU only: no canvas 2D, no CPU pixel read', () => {
  for (const f of ['src/ui/thumb-atlas.js', 'src/ui/slide-strip.js']) {
    const src = read(f).replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /getContext\(\s*['"]2d['"]/, f);
    assert.doesNotMatch(src, /readPixels|getImageData|toDataURL|drawImage|requestAnimationFrame\(/, f);
  }
});
