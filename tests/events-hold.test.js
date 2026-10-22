import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { detectEvents } from '../src/engine/events.js';

// An event's hold is model time, not a count of evaluations: a slider drag posts a frame per change (many evaluations in a
// few milliseconds of model time) and 8x posts one per 0.8 s of model time; both wait the same quarter second now.
test('events hold on model time: many evaluations at one instant fire nothing, a quarter second of model time does', () => {
  const e = new Engine(); e.loadPreset('cirr-decomp'); e.beat = true;
  e.evState = {};   // (the preset's load marked its conditions as known: forgotten, they are newly on)
  for (let i = 0; i < 25; i++) e.step(0.004);
  for (let i = 0; i < 50; i++) detectEvents(e);   // fifty frames with the clock stopped (a drag)
  assert.equal(e.newEvents.length, 0, 'no event fires while no model time has passed');
  for (let f = 0; f < 10; f++) { for (let i = 0; i < 25; i++) e.step(0.004); detectEvents(e); }   // 1 s of model time
  assert.ok(e.newEvents.length > 0, 'the preset\'s standing conditions fire once the hold has passed');
  const n = e.newEvents.length;
  for (let f = 0; f < 10; f++) { for (let i = 0; i < 25; i++) e.step(0.004); detectEvents(e); }
  assert.equal(e.newEvents.length, n, 'and only once');
});
