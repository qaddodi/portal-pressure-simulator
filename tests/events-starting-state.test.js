// History events say what CHANGED in the patient (Mohammad's play-tests, 16 Nov 2026): "Clinically significant PH" and "Bleeding more likely" fired when a TIPS was
// taken out of a patient who started at HVPG 16, and "Ascites forming" fired on a patient already shown with ascites. A condition true at the start never fires, and one
// that fired, cleared and is true again fires a second time only after a day of model time clear (events.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { detectEvents } from '../src/engine/events.js';

const patient = (id = 'cirr-decomp') => {
  const e = new Engine(); e.loadPreset(id); e.beat = true;
  for (let i = 0; i < 1500; i++) e.step(0.008);   // (the worker's run-in, WARM_STEPS)
  e.evState = {}; e.evAvg = null; detectEvents(e, true); e.newEvents = []; e.eventLog = [];   // (and the starting state taken after it, worker-core preset)
  return e;
};
const run = (e, s) => { for (let t = 0; t < s; t += 0.1) { for (let i = 0; i < 25; i++) e.step(0.004); detectEvents(e); } };
const toggle = (e, fn) => { const p = structuredClone(e.params); fn(p); e.setParams(p); };
const count = (e, id) => e.eventLog.filter((x) => x.id === id).length;

test('a patient\'s starting conditions are not events, and taking a treatment off does not announce them again', () => {
  const e = patient();
  run(e, 60);
  assert.deepEqual(e.eventLog.map((x) => x.id), [], 'a patient left alone fires nothing it began with');
  for (let r = 0; r < 3; r++) {
    toggle(e, (p) => { p.tips = { on: true, d: 8 }; }); run(e, 40);
    toggle(e, (p) => { p.tips.on = false; }); run(e, 40);
  }
  for (const id of ['CSPH', 'BLEED_RISK', 'ASCITES_FORMING']) assert.equal(count(e, id), 0, `${id} was the patient's own state`);
  assert.ok(count(e, 'INTRAHEPATIC_REVERSAL') <= 1, 'what a TIPS adds is told once, not at every toggle');
});

test('a condition that was not there at the start fires, and returns within the day are one story', () => {
  const e = patient();
  e.evState = {}; e.evStart = null;   // (forgotten: every standing condition is newly on)
  run(e, 3);
  assert.equal(count(e, 'CSPH'), 1);
  toggle(e, (p) => { p.tips = { on: true, d: 8 }; }); run(e, 40);
  toggle(e, (p) => { p.tips.on = false; }); run(e, 40);
  assert.equal(count(e, 'CSPH'), 1, 'back in minutes: no second event');
  toggle(e, (p) => { p.tips = { on: true, d: 8 }; }); run(e, 40);
  e.day += 3;   // (three days on: a return after that is news)
  toggle(e, (p) => { p.tips.on = false; }); run(e, 40);
  assert.equal(count(e, 'CSPH'), 2, 'back after days: told again');
});
