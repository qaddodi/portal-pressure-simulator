// The view switch's second press fits the view (Mohammad, 17 Nov 2026: "when I hit anatomy while in anatomy view or lobule while in lobule view
// etc the view should fit zoom"). One rule in the shared switch, so all three views have it: pressing the button of the view that is showing
// takes the camera back to that view's fit, as the slide camera's one straight move, sized to the room the open cards leave (Fit's framing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { viewTapAgain } from '../src/ui/view-tap.js';

const anat = { view: 'anatomic', lobule: false, sinusoid: false };
const circ = { view: 'circuit', lobule: false, sinusoid: false };
const lob = { view: 'anatomic', lobule: true, sinusoid: false };
const sin = { view: 'anatomic', lobule: true, sinusoid: true };

test('a press of the showing view is a second press, for each of the three views', () => {
  assert.equal(viewTapAgain('anatomic', anat), true);
  assert.equal(viewTapAgain('circuit', circ), true);
  assert.equal(viewTapAgain('lobule', lob), true);
});

test('a press of another view is a change of view, not a refit', () => {
  assert.equal(viewTapAgain('circuit', anat), false);
  assert.equal(viewTapAgain('anatomic', circ), false);
  assert.equal(viewTapAgain('lobule', anat), false);
  assert.equal(viewTapAgain('lobule', circ), false);
  assert.equal(viewTapAgain('anatomic', lob), false, 'the lobule is over the anatomy: its Anatomy button leaves it');
  assert.equal(viewTapAgain('circuit', lob), false);
});

test('the sinusoid is one level further in: its button, and the Lobule button inside it, keep their own jobs', () => {
  assert.equal(viewTapAgain('sinusoid', sin), false);
  assert.equal(viewTapAgain('lobule', sin), false, 'back out of the sinusoid to the lobule');
  assert.equal(viewTapAgain('anatomic', sin), false);
  assert.equal(viewTapAgain('sinusoid', lob), false);
  assert.equal(viewTapAgain('sinusoid', anat), false);
});

test('no state, or an unknown button, is never a second press', () => {
  assert.equal(viewTapAgain('anatomic', null), false);
  assert.equal(viewTapAgain('nonsense', anat), false);
});

// (The wiring of the switch and of stage.fitAgain is held by scripts/source-shapes/view-tap-fit-17nov.mjs, run by lint.)
