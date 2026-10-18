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
