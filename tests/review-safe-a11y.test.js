// Review items Q3 (popover listener race), Q4 (mistyped patient links), Q17 (organs by keyboard) and Q19 (screen-reader
// announcements coalesced, not dropped). Browser-free: the announcer runs on a fake clock, the rest is read from source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAnnouncer, LIVE_GAP } from '../src/ui/live.js';
import { cleanShare } from '../src/ui/share-link.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

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

test('util.js re-exports the coalescing announcer and no longer drops messages', () => {
  const util = read('src/ui/util.js');
  assert.match(util, /export \{ announce \} from '\.\/live\.js';/);
  assert.doesNotMatch(util, /liveLast/);
});

test('a mistyped ?preset= link says so and opens Patients with a search, never a different patient', () => {
  const main = read('src/ui/main.js');
  const fn = main.slice(main.indexOf('async function openDeepLink'), main.indexOf('const redraw ='));
  assert.match(fn, /toast\(`No patient called “\$\{id\.slice\(0, 60\)\}”\. Pick one from Patients\.`, 'bad'\);/);
  assert.match(fn, /mainMenu\.open\('patients', \{ query: /);
  assert.doesNotMatch(fn, /near/, 'no nearest-match guess');
  const menu = read('src/ui/menu.js');
  assert.match(menu, /open = true; query = opts\.query \|\| '';/);
  assert.match(menu, /value: query/, 'the search field starts with the query');
});

test('a share link naming an unknown patient opens healthy and says so', () => {
  assert.equal(cleanShare({ preset: 'cirr-typo' }, ['healthy']).missing, 'cirr-typo');
  assert.equal(cleanShare({ preset: 'healthy' }, ['healthy']).missing, undefined);
  assert.equal(cleanShare({}, ['healthy']).missing, undefined, 'a link with no patient is not a mistake');
  assert.equal(cleanShare({ preset: 'x'.repeat(500) }, ['healthy']).missing.length, 60, 'the name shown is capped');
  const main = read('src/ui/main.js');
  const fn = main.slice(main.indexOf('async function loadShared'), main.indexOf('function resumeUrl'));
  assert.match(fn, /const missing = s\.missing && `This link names a patient the app does not have/);
  assert.match(fn, /if \(missing\) toast\(missing, 'bad'\);/);
});

test('the organs a tap opens are keyboard items of the figure that never take the pointer or show a ring', () => {
  const stage = read('src/ui/stage.js');
  assert.match(stage, /const ORGAN_KEYS = \[\['heart', 'Right heart'\], \['liver', 'Liver'\], \['spleen', 'Spleen'\]\];/);
  const keys = stage.slice(stage.indexOf('  const figKeys = '), stage.indexOf('  // ── Shunts: from a source vessel to a drop target ──'));
  assert.match(keys, /if \(morph < 0\.5\) for \(const \[id\] of ORGAN_KEYS\) out\.push\('organ:' \+ id\);/, 'no organ items in the circuit view');
  assert.match(keys, /return `\$\{ORGAN_NAME\.get\(item\.slice\(6\)\)\}\. Press Enter for its card\.`;/);
  assert.match(keys, /onSelect\(\{ type: 'organ', id: item\.slice\(6\) \}, \{ keyboard: true \}\)/);
  assert.match(keys, /setOrganHover\(sel\?\.type === 'organ' && sel\.id === org \? null : org\);/, 'focus shows as the hover outline');
  const css = read('styles/app.css');
  assert.match(css, /#world :is\(g, path, [^)]*\) \{ pointer-events: none; \}/, 'world paths take no pointer');
  assert.match(css, /\.stage-view #stage:focus, \.stage-view #stage:focus-visible \{ outline: none; \}/, 'no ring round the figure');
  // Every keyboard organ is one the pointer can open too.
  for (const id of ['heart', 'liver', 'spleen']) assert.match(stage, new RegExp(`ORGAN_OF = \\{[^}]*\\b${id}: '${id}'`));
});
