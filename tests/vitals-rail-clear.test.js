// The alarm box behind a breached reading never reaches the hold rail under it (B8, play-test 16 Nov 2026, Carvedilol 8/16: the pink box covered the BP bar and the MAP <65 tick).
// The numbers' baseline is y0 + 18 + big; the box ends BOX_BELOW under it, the rail begins RAIL_GAP under that, and RAIL_H keeps the rail's words inside the card.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOX_BELOW, RAIL_GAP, RAIL_H } from '../src/ui/vitals-monitor.js';

test('the alarm box ends clear of the rail, and the rail\'s words fit the height kept for it', () => {
  assert.ok(RAIL_GAP >= 6, `${RAIL_GAP} px between the box and the rail's tick`);
  assert.ok(BOX_BELOW >= 2 && BOX_BELOW < RAIL_GAP);
  // the rail's words stand 22 px under its top, 12 px high: its top to the last descender is 22 + 4 px, plus the gap above it.
  assert.ok(RAIL_H >= BOX_BELOW + RAIL_GAP + 22 + 4 - 8, `RAIL_H ${RAIL_H}`);
});
