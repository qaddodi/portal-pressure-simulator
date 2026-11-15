// Review LBL-7 (15 Nov 2026): one roll for a figure reading. A site's number and a station label's number step through the same function: COUNT_MS on
// easeArrive, following inside the tolerance, at once the first time, under reduced motion and after a spell hidden.
import test from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { newRoll, rollStep, labelRoll, onLabelRoll } from '../src/ui/count-roll.js';
import { COUNT_MS, easeArrive } from '../src/ui/motion.js';

test('a number counts to its new value over COUNT_MS on the arrive curve, and stands on it', () => {
  const r = newRoll();
  assert.equal(rollStep(r, 10, 0.5, 0), 10, 'the first number is shown at once');
  assert.equal(rollStep(r, 10.2, 0.5, 16), 10.2, 'inside the tolerance it follows');
  const a = rollStep(r, 20, 0.5, 100);   // (the roll starts here)
  assert.equal(a, 10.2);
  const mid = rollStep(r, 20, 0.5, 100 + COUNT_MS / 2);
  assert.ok(Math.abs(mid - (10.2 + (20 - 10.2) * easeArrive(0.5))) < 1e-9, `${mid}`);
  assert.equal(r.on, true);
  assert.equal(rollStep(r, 20, 0.5, 100 + COUNT_MS), 20);
  assert.equal(r.on, false, 'done');
  assert.equal(rollStep(r, 20.3, 0.5, 700), 20.3);
});
test('a change mid-roll starts from the number shown, never a jump; reduced motion and a missing number take theirs at once', () => {
  const r = newRoll();
  rollStep(r, 5, 0.5, 0); rollStep(r, 15, 0.5, 10);
  const shown = rollStep(r, 15, 0.5, 10 + COUNT_MS / 4);
  const next = rollStep(r, 30, 0.5, 10 + COUNT_MS / 4);
  assert.equal(next, shown, 'the new roll starts where the old one was');
  assert.equal(rollStep(r, 3, 0.5, 600, true), 3, 'still: at once');
  assert.ok(Number.isNaN(rollStep(r, NaN, 0.5, 700)));
  assert.equal(r.v, null);
});
test('a station label rolls and asks for frames while it does; one not asked for a while is shown at its value', () => {
  let asked = 0;
  onLabelRoll(() => { asked++; });
  assert.equal(labelRoll('n:PV', 8, 0.5, 0), 8);
  assert.equal(asked, 0);
  assert.equal(labelRoll('n:PV', 12, 0.5, 20), 8);
  assert.ok(asked > 0, 'a frame is asked for while it counts');
  const v = labelRoll('n:PV', 12, 0.5, 20 + COUNT_MS / 2);
  assert.ok(v > 8 && v < 12);
  assert.equal(labelRoll('n:PV', 12, 0.5, 20 + COUNT_MS), 12);
  assert.equal(labelRoll('n:PV', 3, 0.5, 5000), 3, 'long unseen: no count from the old number');
  onLabelRoll(null);
});
