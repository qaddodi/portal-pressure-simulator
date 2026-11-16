// Closing a talk puts back the viewer's own History list and undo stack along with the patient, the treatments and the clock (play-test, 16 Nov 2026:
// after the Demo deck the free model's History held six entries the deck's slides had made). The slides load their own patients and change settings,
// which the timeline records as the viewer's; the talk keeps what was there at its start (presenter-start.js capture) and puts it back in putHealthy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { updateParams, undo, clearHistory, saveHistory, loadHistory, store, replaceParams } from '../src/ui/store.js';


test('the undo and redo stacks are kept and put back whole', () => {
  clearHistory();
  replaceParams({ diuretics: false, x: 0 });
  updateParams({ x: 1 }, { label: 'one' });
  const kept = saveHistory();
  assert.equal(kept.past.length, 1);
  updateParams({ diuretics: true }, { label: 'the deck turned diuretics on' });
  updateParams({ x: 5 }, { label: 'and more' });
  assert.equal(saveHistory().past.length, 3);
  loadHistory(kept);
  assert.equal(saveHistory().past.length, 1, 'the deck\'s steps are not the viewer\'s undo');
  assert.equal(saveHistory().future.length, 0);
  assert.equal(undo(), 'one');
  loadHistory(null);
  assert.equal(saveHistory().past.length, 0);
  void store;
});
