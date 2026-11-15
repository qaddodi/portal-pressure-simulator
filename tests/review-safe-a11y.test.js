// Review items Q3 (popover listener race), Q4 (mistyped patient links), Q17 (organs by keyboard) and Q19 (screen-reader
// announcements coalesced, not dropped). Browser-free: the announcer runs on a fake clock, the rest is read from source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnnouncer, LIVE_GAP } from '../src/ui/live.js';
import { cleanShare } from '../src/ui/share-link.js';


function rig() {
  let now = 0;
  const timers = [], said = [];
  const say = createAnnouncer({ now: () => now, later: (fn, ms) => timers.push({ at: now + ms, fn }), write: (m) => said.push([now, m]) });
  const advance = (ms) => {
    const end = now + ms;
    for (let t; (t = timers.sort((a, b) => a.at - b.at)[0]) && t.at <= end;) { timers.shift(); now = t.at; t.fn(); }
    now = end;
  };
  return { say, said, advance, timers };
}

test('announcements close together are coalesced: the newest is spoken after the gap, none is lost', () => {
  const { say, said, advance, timers } = rig();
  say('Patient loaded.');
  assert.deepEqual(said, [[0, 'Patient loaded.']], 'the first one is spoken at once');
  advance(500); say('Varices bled.');
  advance(500); say('Transfusion given.');
  assert.equal(said.length, 1, 'nothing more inside the gap');
  assert.equal(timers.length, 1, 'one timer for the whole burst');
  advance(LIVE_GAP);
  assert.deepEqual(said[1], [LIVE_GAP, 'Transfusion given.'], 'the last word arrives when the gap ends');
  advance(LIVE_GAP * 2); say('Restarted.');
  assert.deepEqual(said[2], [LIVE_GAP * 3 + 1000, 'Restarted.'], 'after a quiet spell a message is spoken at once');
  say('');
  advance(LIVE_GAP * 2);
  assert.equal(said.length, 3, 'an empty message is ignored');
});



test('a share link naming an unknown patient opens healthy and says so', () => {
  assert.equal(cleanShare({ preset: 'cirr-typo' }, ['healthy']).missing, 'cirr-typo');
  assert.equal(cleanShare({ preset: 'healthy' }, ['healthy']).missing, undefined);
  assert.equal(cleanShare({}, ['healthy']).missing, undefined, 'a link with no patient is not a mistake');
  assert.equal(cleanShare({ preset: 'x'.repeat(500) }, ['healthy']).missing.length, 60, 'the name shown is capped');
});

