import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';

// Review #35: "Jump ahead > Until something happens" stopped at the first new event by comparing the event log's
// length, but the log is capped at 200, so once it was full the jump always ran the full two years.
test('Until something happens stops at the next event even when the event log is full', async (t) => {
  const core = createCore(() => {});
  t.after(() => core.dispose());
  await core.handle({ type: 'init' });
  const eng = core.engine();
  for (let i = 0; i < 250; i++) eng.pushEvent({ id: 'filler', text: 'filler' });
  assert.equal(eng.eventLog.length, 200, 'the log keeps the last 200');
  assert.equal(new Set(eng.eventLog.map((e) => e.key)).size, 200, 'event keys stay unique once the log is full');
  eng.newEvents = [];
  const steps = eng.advanceDaySteps.bind(eng);
  const day0 = eng.day;
  eng.advanceDaySteps = function* (n, o) {
    const r = yield* steps(n, o);
    if (this.day - day0 === 3) this.pushEvent({ id: 'test-event', text: 'Something happened' });
    return r;
  };
  await core.handle({ type: 'advance', untilEvent: true });
  assert.equal(eng.day - day0, 3, 'the jump stops on the day the event fires');
});
