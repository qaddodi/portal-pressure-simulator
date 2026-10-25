// Beta feedback (18 Oct): Send feedback is one tap into Settings in every mode (talks too), addressed to the one
// FEEDBACK_EMAIL constant; a timed ask comes after FEEDBACK_ASK_MIN minutes of active use, at most twice per device,
// never during a drag, a talk or projector mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FEEDBACK_EMAIL } from '../src/version.js';

const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
const between = (a, b) => main.slice(main.indexOf(a), main.indexOf(b, main.indexOf(a)));

test('Send feedback heads Settings in every mode, not Help, and mails the one address with the view', () => {
  assert.match(FEEDBACK_EMAIL, /^[^@\s]+@[^@\s]+\.[a-z]+$/);
  const settings = between('function openSettings(', 'function presenterSettings(');
  assert.ok(settings.indexOf("menuItem('Send feedback'") < settings.indexOf("'Appearance'"), 'above Appearance');
  assert.ok(settings.indexOf("menuItem('Send feedback'") < settings.indexOf("menuItem('Search'"), 'above the dock\'s Search and Help');
  assert.ok(settings.indexOf("menuItem('Send feedback'") < settings.indexOf('...(talk ? [] : ['), 'outside the not-in-a-talk block');
  assert.doesNotMatch(between('function openHelpMenu(', '], at);'), /Send feedback/);
  const send = between('function sendFeedback(', 'function doUndo(');
  assert.match(send, /mailto:\$\{FEEDBACK_EMAIL\}\?subject=/);
  assert.match(send, /preview-badge/);
  assert.match(send, /View: \$\{resumeUrl\(\)\}/);
  assert.match(send, /localStorage\.setItem\(ASK_KEY, 'done'\)/);
});

test('the timed ask counts active, visible time, waits out drags, talks and projector mode, and asks at most twice', () => {
  assert.match(main, /const FEEDBACK_ASK_MIN = 10;/);
  const ask = between('function armFeedbackAsk(', 'main().catch(');
  assert.match(ask, /if \(navigator\.webdriver\) return;|navigator\.webdriver\) return;/);
  assert.match(ask, /if \(was === 'done'\) return;/);
  assert.match(ask, /document\.visibilityState === 'visible' && now - lastInput < IDLE/);
  assert.match(ask, /\|\| down \|\| presenter\.active\(\) \|\| projector \|\|/);
  assert.match(ask, /answer\(was === 'later' \? 'done' : 'later'\)/);
  assert.match(ask, /actions: \[\['Send feedback', \(\) => sendFeedback\(\)\], \['Not now', \(\) => \{\}\]\]/);
  assert.match(main, /if \(!deep\) firstRun\(\);\n\s*armFeedbackAsk\(\);/);
});

test('only the person\'s own answer counts: a feedback card pushed out by newer messages asks again later', () => {
  const util = readFileSync(new URL('../src/ui/util.js', import.meta.url), 'utf8');
  const toast = util.slice(util.indexOf('export function toast('), util.indexOf('return close;', util.indexOf('export function toast(')));
  // Pushed out, either through the two-message limit or removed from the card stack, the card says so.
  assert.match(util, /while \(stay\.length >= 2\) \{ const o = stay\.shift\(\); if \(o\._close\) o\._close\('pushed'\);/);
  assert.match(toast, /if \(!gone\) \{ gone = true; clearTimeout\(timer\); onClose\?\.\('pushed'\); \}/);
  // A tap, the ×, a swipe or a button close as the person's own answer (the click handler never passes its event on).
  assert.match(toast, /const close = \(why = 'user'\) => \{[^}]*onClose\?\.\(why\)/);
  assert.match(toast, /t\.addEventListener\('click', \(\) => close\(\)\);/);
  assert.doesNotMatch(toast, /addEventListener\('click', close\)/);
  // The ask records nothing when pushed out, and starts another FEEDBACK_ASK_MIN active minutes.
  const ask = between('function armFeedbackAsk(', 'main().catch(');
  const pushed = ask.indexOf("if (why === 'pushed')"), record = ask.indexOf("answer(was === 'later'");
  assert.ok(pushed > 0 && pushed < record, 'checked before anything is recorded');
  assert.match(ask, /if \(why === 'pushed'\) \{ active = 0; last = performance\.now\(\); timer = setInterval\(tick, TICK\); return; \}/);
});
