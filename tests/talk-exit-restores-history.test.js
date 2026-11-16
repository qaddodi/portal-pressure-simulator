// Closing a talk puts back the viewer's own History list and undo stack along with the patient, the treatments and the clock (play-test, 16 Nov 2026:
// after the Demo deck the free model's History held six entries the deck's slides had made). The slides load their own patients and change settings,
// which the timeline records as the viewer's; the talk keeps what was there at its start (presenter-start.js capture) and puts it back in putHealthy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './dom-shim.js';
import { updateParams, undo, clearHistory, saveHistory, loadHistory, store, replaceParams } from '../src/ui/store.js';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

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

test('a talk captures the History and the undo stack at its start and puts them back with the patient, the timeline drops its own timers', () => {
  const st = src('presenter-start.js'), tl = src('timeline.js'), mn = src('main.js');
  assert.match(st, /history: patientHistory\?\.save\(\) \?\? null/, 'captured at the start');
  assert.match(st, /if \(b\.history\) patientHistory\?\.load\(b\.history\)/, 'put back on the way out');
  assert.match(mn, /patientHistory: \{ save: \(\) => \(\{ timeline: timeline\.save\(\), stacks: saveHistory\(\) \}\), load: \(k\) => \{ loadHistory\(k\.stacks\); timeline\.load\(k\.timeline\); \} \}/);
  const load = /load: \(s\) => \{[\s\S]*?\n {4}\},/.exec(tl)?.[0] || '';
  assert.match(load, /clearTimeout\(pending\.timer\)/, 'an edit still being typed in is not recorded into the restored list');
  assert.match(load, /tlGen\+\+/, 'a snapshot an entry of the deck asked for later is dropped');
});
