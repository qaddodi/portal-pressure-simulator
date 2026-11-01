// The credit's art grid from geometry (cell-grid.js): the cells a fill or a stroke touches, as a canvas's covered pixels were.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CellGrid, geomOf } from '../src/ui/cell-grid.js';

const read = (g) => { const out = new Uint8Array(g.w * g.h); g.readInto(out); return out; };
const count = (a) => a.reduce((n, v) => n + v, 0);

test('a filled rectangle covers the cells it touches, part cells included, and nothing else', () => {
  const g = new CellGrid(); g.clearRect(0, 0, 10, 10);
  g.fill(geomOf('path', () => 'M2.5 2.5H6.5V5.5H2.5Z'));
  const c = read(g);
  for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) assert.equal(c[j * 10 + i], i >= 2 && i <= 6 && j >= 2 && j <= 5 ? 1 : 0, `cell ${i},${j}`);
});

test('a transform places the shape; a circle fills about its area; a hole by winding stays filled (non-zero)', () => {
  const g = new CellGrid(); g.clearRect(0, 0, 40, 40);
  g.setTransform(2, 0, 0, 2, 20, 20);
  g.fill(geomOf('circle', (k) => ({ cx: 0, cy: 0, r: 8 })[k]));
  const n = count(read(g)), area = Math.PI * 16 * 16;
  assert.ok(n > area && n < area + 2 * Math.PI * 16 + 8, `${n} cells for a disc of ${area.toFixed(0)}`);
});

test('a stroke takes the cells within half its width of the line, scaled by the transform', () => {
  const g = new CellGrid(); g.clearRect(0, 0, 20, 20);
  g.setTransform(0.5, 0, 0, 0.5, 0, 0);
  g.lineWidth = 4;   // (2 cells wide on the grid)
  g.stroke(geomOf('path', () => 'M4 20L36 20'));
  const c = read(g);
  for (let i = 2; i < 18; i++) { assert.equal(c[10 * 20 + i], 1); assert.equal(c[9 * 20 + i], 1); assert.equal(c[7 * 20 + i], 0); assert.equal(c[12 * 20 + i], 0); }
});

test('a path built on the grid (the lobule outline and its discs) fills as the canvas path did; clearing empties it', () => {
  const g = new CellGrid(); g.clearRect(0, 0, 10, 10);
  g.beginPath(); g.moveTo(1, 1); g.lineTo(5, 1); g.lineTo(5, 5); g.closePath(); g.fill();
  g.beginPath(); g.arc(8, 8, 1, 0, Math.PI * 2); g.fill();
  const c = read(g);
  assert.equal(c[1 * 10 + 4], 1); assert.equal(c[4 * 10 + 1], 0); assert.equal(c[8 * 10 + 8], 1);
  g.clearRect(0, 0, 10, 10); assert.equal(count(read(g)), 0);
});
