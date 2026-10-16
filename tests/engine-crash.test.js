// An engine that throws, or whose numbers stop being numbers, stops the clock and says so once ('crash'), keeps
// the last good frame on screen (no frame after the crash), and loading a patient starts it again (review item 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCore } from '../src/worker-core.js';

function setup(t) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const messages = [];
  const core = createCore((m) => messages.push(m));
  t.after(() => core.dispose());
  const advance = (ms) => { for (let i = 0; i < ms; i += 33) { now += 33; t.mock.timers.tick(33); } };
  return { core, messages, advance, count: (type) => messages.filter((m) => m.type === type).length };
}

test('a throw inside the clock stops it and posts one crash, not a frozen silence', async (t) => {
  const { core, messages, advance, count } = setup(t);
  await core.handle({ type: 'init' });
  advance(200);
  const eng = core.engine();
  eng.step = () => { throw new Error('Singular matrix'); };
  advance(500);
  assert.equal(count('crash'), 1, 'one crash message');
  assert.match(messages.find((m) => m.type === 'crash').message, /Singular matrix/);
  const frames = count('frame');
  advance(1000);
  assert.equal(count('frame'), frames, 'no frames after the crash: the last good one stays');
  assert.equal(count('crash'), 1, 'the crash is said once');
  // A command that is not a new state does not restart the broken clock.
  await core.handle({ type: 'run', running: true });
  advance(500);
  assert.equal(count('crash'), 1);
  // Restarting the patient (a preset) starts it again on a fresh engine state.
  delete eng.step;
  await core.handle({ type: 'preset', id: 'healthy', reqId: 1 });
  const t0 = core.engine().t;
  advance(500);
  assert.ok(core.engine().t > t0, 'the clock runs again');
  assert.equal(count('crash'), 1);
});

test('pressures that stop being numbers count as a crash', async (t) => {
  const { core, advance, count } = setup(t);
  await core.handle({ type: 'init' });
  advance(100);
  const eng = core.engine(), step = eng.step.bind(eng);
  eng.step = (h) => { step(h); eng.P[0] = NaN; };
  advance(300);
  assert.equal(count('crash'), 1);
  const frames = count('frame');
  advance(500);
  assert.equal(count('frame'), frames);
  await core.handle({ type: 'reset' });
  advance(300);
  assert.equal(count('crash'), 1, 'reset brings a fresh engine back');
  assert.ok(count('frame') > frames);
});

test('the page turns a crash into a card with Restart patient and Reload', () => {
  const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.match(main, /host\.on\('crash'/);
  assert.match(main, /'The model stopped\. Reload, or restart this patient\.'/);
  assert.match(main, /\['Restart patient', \(\) => restartPatient\(\)\], \['Reload', \(\) => location\.reload\(\)\]/);
  const host = readFileSync(new URL('../src/ui/host.js', import.meta.url), 'utf8');
  assert.match(host, /w\.onerror = \(e\) => \{ e\.preventDefault\?\.\(\); crashed\(/, 'an uncaught worker error after start-up is a crash');
});
