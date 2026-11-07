import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScanRec, scanRecReset, scanStep, scanTap, scanTo } from '../src/ui/scan-ease.js';
import { D_SMALL, D_SURFACE, cssCurve, easeArrive, EASE_MOVE } from '../src/ui/motion.js';

// L3 P9: the FibroScan probe's fades, turn and tap are numbers its writer eases in one record, as app.css eases its model.
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test('a fresh record takes its values at once, as a first style starts no transition', () => {
  const r = createScanRec();
  scanRecReset(r, {});
  assert.equal(scanTo(r, 'ang', 1, 0, D_SURFACE), false);
  assert.equal(r.ang, 1);
  assert.equal(scanStep(r, 10), false);
});

test('the fade in runs on --d-surface and --ease, and holds its end', () => {
  const r = createScanRec();
  scanRecReset(r, {}); r.fresh = false;
  assert.equal(r.op, 0);
  assert.equal(scanTo(r, 'op', 1, 1000, D_SURFACE), true);
  assert.equal(scanTo(r, 'op', 1, 1010, D_SURFACE), false, 'the same target starts nothing');
  assert.equal(scanStep(r, 1000 + D_SURFACE / 2), true);
  near(r.op, easeArrive(0.5));
  assert.equal(scanStep(r, 1000 + D_SURFACE), false);
  assert.equal(r.op, 1);
});

test('turning back mid-fade is shortened as CSS shortens a reversed transition', () => {
  const r = createScanRec();
  scanRecReset(r, {}); r.fresh = false; r.headOp = 1;
  scanTo(r, 'headOp', 0, 0, D_SMALL);
  scanStep(r, D_SMALL / 4);
  const at = r.headOp, f = easeArrive(0.25);
  scanTo(r, 'headOp', 1, D_SMALL / 4, D_SMALL);
  scanStep(r, D_SMALL / 4 + D_SMALL * f / 2);
  near(r.headOp, at + (1 - at) * easeArrive(0.5));
  assert.equal(scanStep(r, D_SMALL / 4 + D_SMALL * f + 0.01), false);
  assert.equal(r.headOp, 1);
});

test('the tap follows its keyframes on --ease-move and ends at rest', () => {
  const r = createScanRec();
  scanRecReset(r, {}); r.fresh = false;
  assert.equal(scanTap(r, 0), true);
  scanStep(r, D_SURFACE * 0.2);
  near(r.tipX, 2);
  scanStep(r, D_SURFACE * 0.1);
  near(r.tipX, 2 * cssCurve(EASE_MOVE)(0.5));
  assert.equal(scanStep(r, D_SURFACE), false);
  assert.equal(r.tipX, 0);
});
