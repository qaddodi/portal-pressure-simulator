// The left renal vein (the splenorenal shunts' landing) is drawn over the bowel loops, not behind them (13 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BACK_EDGES, CONTEXT_EDGES } from '../src/ui/anatomy.js';

test('the left renal vein is not a back edge, so no organ veils it', () => {
  for (const id of ['LRV_IVC', 'V_KID_L']) {
    assert.ok(!BACK_EDGES.has(id), `${id} is drawn above the organs`);
    assert.ok(CONTEXT_EDGES.has(id), `${id} stays a quiet context vein`);
  }
});
