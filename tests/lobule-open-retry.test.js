import { stageSource } from './stage-src.js';
// The lobule asked for from the circuit is opened once the anatomy has come back, however long the turn takes (software GL turns slowly): the
// retry no longer gives up after forty tries (4.8 s), which left the lobule wanted in the store and never opened (gate views stage, 3 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const js = stageSource();

test('openLobule asks again for as long as the lobule is wanted, one timer at a time, and closing stops it', () => {
  assert.match(js, /stageScope\.clear\(lobuleRetryT\);\s*if \(!liverBox\(\) \|\| morphTarget !== 0 \|\| morph > 0\.02\) \{ lobuleRetryT = stageScope\.timer\(lobuleRetry, tries < 40 \? 120 : 400, tries \+ 1\); return; \}/);
  assert.doesNotMatch(js, /if \(tries < 40\) stageScope\.timer\(lobuleRetry/, 'no cap that gives up');
  assert.match(js, /function lobuleRetry\(tries\) \{ if \(store\.get\(\)\.lobule\) openLobule\(tries\); \}/);
  assert.match(js, /function closeLobule\(\) \{ stageScope\.clear\(lobuleRetryT\); setLobule\(false\); \}/);
});
