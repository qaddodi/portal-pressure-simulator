import { stageSource } from './stage-src.js';
// The frame's read phase (frame.js readFrame; 1 Nov 2026, "Move everything to GPU": zero layout inside the frame): boxes are read first
// in a frame, while the layout is the last frame's, and the writes that follow them run in the same frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('read callbacks run before every other callback of their frame, and what they ask for runs in that frame', async () => {
  const cbs = [];
  globalThis.requestAnimationFrame = (f) => { cbs.push(f); return cbs.length; };
  const { frame, lateFrame, readFrame, framePhase, cancelFrame } = await import('../src/ui/frame.js');
  const log = [];
  frame(() => log.push('early'));
  lateFrame(() => log.push('late'));
  readFrame(() => { log.push(`read:${framePhase()}`); frame(() => log.push('asked from read')); readFrame(() => log.push('next read')); });
  const gone = readFrame(() => log.push('cancelled'));
  cancelFrame(gone);
  assert.equal(cbs.length, 1, 'one browser frame asked for');
  cbs.shift()(16);
  assert.deepEqual(log, ['read:read', 'early', 'asked from read', 'late']);
  assert.equal(cbs.length, 1, 'a read asked from a read waits for the next frame');
  cbs.shift()(32);
  assert.deepEqual(log.slice(4), ['next read']);
  assert.equal(framePhase(), null);
});

test('stage: the figure\'s boxes are read in the read phase at a change, never between the frame\'s writes', () => {
  const st = stageSource();
  assert.match(st, /homeAsk \|\|= readFrame\(homeLookRead\);/, 'the home look');
  assert.match(st, /kpAsk \|\|= readFrame\(keyPillRead\);/, 'the key pill');
  assert.match(st, /dprCardsAsk \|\|= readFrame\(dprCardsRead\);/, 'the Doppler probe\'s cards');
  assert.match(st, /if \(!dprQuiet\(\)\) dprMonAsk \|\|= readFrame\(dprMonRead\);/, 'the Doppler monitor check');
  assert.match(st, /o\.ask = readFrame\(SCAN_READS\[key\]\)/, 'the FibroScan probe\'s cards');
  assert.match(st, /hoverRaf \|\|= readFrame\(hoverRead\);/, 'a hover\'s hit tests');
  assert.match(st, /shuntAsk \|\|= readFrame\(shuntRead\);/, 'a shunt drag\'s target');
  assert.match(st, /function refit\(\) \{ refitAsk \|\|= readFrame\(refitRead\); \}/, 'a refit');
  assert.match(st, /function springBack\(\) \{ springAsk \|\|= readFrame\(springRead\); \}/, 'the spring back');
  assert.match(st, /watch\.onTouch\(snapAgain\);/, 'the cards\' and pills\' snapshot, at a change');
  assert.match(st, /function snapFresh\(\) \{ if \(snapDirty\) snapRead\(\); \}/);
  assert.match(st, /\{ sitePreQ\.push\(el\); nextFrame\(sitePreRun\); \}/, 'no forced layout to start a reading\'s fade');
  assert.match(st, /sitePreRun = \(\) => \{ for \(let i = 0; i < sitePreQ\.length; i\+\+\) sitePreQ\[i\]\.classList\.remove\('cath-pre'\); sitePreQ\.length = 0; sitesAgain\(\); \}/);
  assert.match(st, /function safeInsets\(exact = false, skip = null\) \{\n\s+return \{ \.\.\.insKept\(/, 'the cards\' room kept while nothing laid out moved');
});
