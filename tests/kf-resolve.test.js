// The menu sheets' keyframes, written against their own size or a custom property, as pixels for the glass (13 Nov 2026: a sheet's frost
// trailed it a frame because glass-motion.js could not read calc(100% + 8px)).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pxShift, evalLength, fillVars } from '../src/ui/kf-resolve.js';

const vars = { '--edge-y': 'calc(100% + 8px)', '--edge-x': '0px', '--edge-o': '1' };
const get = (n) => vars[n];

test('dock-sheet-in and its exit from part way, in px of the sheet', () => {
  assert.equal(pxShift('translateY(calc(100% + 8px))', 'transform', 390, 654, get), 'translate(0px, 662px)');
  assert.equal(pxShift('translateY(calc((100% + 8px) * 0.5))', 'transform', 390, 654, get), 'translate(0px, 331px)');
});
test('slide-from-edge through its custom properties, and menu-leave.js scaling them', () => {
  assert.equal(pxShift('translate(var(--edge-x, 0px), var(--edge-y, 0px))', 'transform', 390, 654, get), 'translate(0px, 662px)');
  assert.equal(pxShift('translate(calc(var(--edge-x, 0px) * 0.5), calc(var(--edge-y, 0px) * 0.5))', 'transform', 390, 654, get), 'translate(0px, 331px)');
  assert.equal(evalLength(fillVars('calc(var(--edge-o, 1) + (1 - var(--edge-o, 1)) * 0.5)', get), 0), 1);
});
test('what it cannot read is left alone', () => {
  assert.equal(pxShift('scale(0.9)', 'transform', 390, 654, get), null);
  assert.equal(pxShift('translateY(calc(100% + 1em))', 'transform', 390, 654, get), null);
  assert.ok(Number.isNaN(evalLength('auto', 10)));
});
