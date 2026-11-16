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
  assert.ok(settings.indexOf("menuItem('Send feedback'") < settings.indexOf("menuItem('History'"), 'above the dock\'s History and Help');
  assert.ok(settings.indexOf("menuItem('Send feedback'") < settings.indexOf('...(talk ? [] : ['), 'outside the not-in-a-talk block');
});


test('only the person\'s own answer counts: a feedback card pushed out by newer messages asks again later', () => {
  // Pushed out, either through the two-message limit or removed from the card stack, the card says so.
  // A tap, the ×, a swipe or a button close as the person's own answer (the click handler never passes its event on).
  // The ask records nothing when pushed out, and starts another FEEDBACK_ASK_MIN active minutes.
  const ask = between('function armFeedbackAsk(', 'main().catch(');
  const pushed = ask.indexOf("if (why === 'pushed')"), record = ask.indexOf("answer(was === 'later'");
  assert.ok(pushed > 0 && pushed < record, 'checked before anything is recorded');
});

test('the ask never stays over a talk: it steps aside when one starts, and leaves by itself (B13, 16 Nov 2026)', () => {
  const ask = between('function armFeedbackAsk(', 'main().catch(');
  assert.match(ask, /store\.on\('presenting', \(v\) => \{ if \(v\) closeAsk\?\.\('pushed'\); \}\)/, 'a talk starting closes it as pushed (not an answer)');
  assert.match(ask, /sticky: true, life: ASK_LIFE/, 'it has a life');
  const util = readFileSync(new URL('../src/ui/util.js', import.meta.url), 'utf8');
  assert.match(util, /const keep = \(sticky \|\| !!actions\?\.length\) && !ownLife/, 'a toast with a life of its own is not kept for good by its buttons');
});
