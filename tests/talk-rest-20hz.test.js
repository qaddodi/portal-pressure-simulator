// Mac heat rec 2 (13 Nov 2026, picked by Mohammad): a talk left on one slide steps down from 30 to 20 frames a second after 30 s
// untouched. It is rest pacing (frame.js restGapFor), not a whole-app cap: any input, a camera, view or figure move, or a slide change
// gives the full rate back on the next frame, sharpness is unchanged, and the blood and eases move on their own clocks (dt), so a held
// frame only skips pictures and nothing moves slower.
import test from 'node:test';
import assert from 'node:assert/strict';

async function talkFrame() {
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const f = await import(`../src/ui/frame.js?t=talk20${Math.random()}`);
  f.setRestTouch(true);
  f.setRestTalk(() => true);
  return f;
}
// (A loop's draw rule: a frame is drawn when now minus the last drawn frame is at least the gap; no phase is carried.)
const drawnPerSecond = (hz, gap) => { let last = -1e9, n = 0; for (let t = 0; t < 1000; t += 1000 / hz) if (t - last >= gap) { last = t; n++; } return n; };

test('a talk: full rate for 4 s, 30 a second to 30 s, then 20 a second, never 15', async () => {
  const f = await talkFrame();
  const t0 = 200000;
  f.noteInput(t0);
  assert.equal(f.TALK_IDLE_MS, 46);
  assert.ok(f.TALK_IDLE_MS > f.REST_MS && f.TALK_IDLE_MS === f.IDLE_MS, 'above the rest step, and the same as Explore\'s idle step (13 Nov 2026)');
  assert.equal(f.restGapFor(t0 + 3999), 0, 'under 4 s: every frame');
  assert.equal(f.restGapFor(t0 + 4000), f.REST_MS, '4 s: 30 a second');
  assert.equal(f.restGapFor(t0 + 29999), f.REST_MS, 'under 30 s: still 30');
  assert.equal(f.restGapFor(t0 + 30000), f.TALK_IDLE_MS, '30 s: 20 a second');
  assert.equal(f.restGapFor(t0 + 600000), f.TALK_IDLE_MS, 'and it stays 20, however long the slide is left');
  for (const hz of [60, 120]) assert.ok(Math.abs(drawnPerSecond(hz, f.TALK_IDLE_MS) - 20) <= 1, `${hz} Hz screen: 20 a second (every 3rd or 6th frame)`);
  assert.ok(Math.abs(drawnPerSecond(90, f.TALK_IDLE_MS) - 20) <= 2, '90 Hz screen: about 20 a second');
  assert.ok(Math.abs(drawnPerSecond(144, f.TALK_IDLE_MS) - 20) <= 1, '144 Hz screen: about 20 a second');
});

test('a talk at 20 Hz: an input, a slide change or a figure move gives the full rate back on the next frame', async () => {
  const f = await talkFrame();
  f.noteInput(0);
  assert.equal(f.restGapFor(40000), f.TALK_IDLE_MS);
  f.noteInput(40010);
  assert.equal(f.restGapFor(40011), 0, 'an input: the next frame is drawn at once');
  assert.equal(f.restGapFor(44010), f.REST_MS, 'and the clock runs again: 30 after 4 s');
  assert.equal(f.restGapFor(70010), f.TALK_IDLE_MS, '20 after 30 s');
  // (A slide change, a camera glide, a view switch or a figure change stamps the loop's own busy time, passed as activeAt.)
  assert.equal(f.restGapFor(80000, 79990), 0, 'a slide change 10 ms ago: full rate');
  assert.equal(f.restGapFor(85000, 79990), f.REST_MS);
  // (A transition in flight counts as motion, read with the module's own clock.)
  const g = await talkFrame();
  g.noteInput(0);
  const now = performance.now() + 100000;
  assert.equal(g.restGapFor(now), g.TALK_IDLE_MS);
  const end = g.beginMotion('glide', 60000);
  assert.equal(g.restGapFor(now + 5), 0, 'a move running: full rate');
  end();
  assert.equal(g.restGapFor(now + 4100), g.REST_MS, 'after the move: 30 from 4 s');
});

test('a talk at 20 Hz: Battery saver\'s 15 still wins, ?rest=off turns it off, and Explore keeps its 15', async () => {
  const f = await talkFrame();
  f.noteInput(0);
  f.setSaver(true);
  assert.ok(f.SAVER_MS >= f.TALK_IDLE_MS);
  assert.equal(f.restGapFor(40000), f.SAVER_MS, 'Battery saver\'s larger gap wins');
  f.setSaver(false);
  f.setRestOff(true);
  assert.equal(f.restGapFor(40000), 0, '?rest=off');
  f.setRestOff(false);
  assert.equal(f.restGapFor(40000), f.TALK_IDLE_MS);
  assert.equal(f.restRuleText(), 'talk idle 20 Hz', '?perf names the rule');
  f.setRestTalk(() => false);
  assert.equal(f.restGapFor(40000), f.IDLE_MS, 'Explore: 20 a second too');
  assert.equal(f.restRuleText(), 'idle 20 Hz');
});

test('not a whole-app cap: the motion gaps are untouched in a talk, and the loops\' time steps cover a 20 Hz frame whole', async () => {
  const f = await talkFrame();
  f.noteInput(0);
  f.restGapFor(40000);
  assert.equal(f.frameGapFor('hand'), 0, 'a hand move draws every frame');
  assert.equal(f.frameGapFor('glide'), f.figLab('motion60') ? f.MOTION60_MS : 0, 'a glide keeps its own gap');
  // (The blood and the eases step by the time that passed, capped at 0.1 s (stage.js, lobule-zoom.js: pinned in scripts/rules-lint.mjs): a 50 ms
  // frame at 20 Hz is under the cap, so nothing slows.)
  for (const hz of [60, 90, 120]) assert.ok(Math.ceil(f.TALK_IDLE_MS / (1000 / hz)) * (1000 / hz) < 100, `a 20 Hz frame on a ${hz} Hz screen is under the 0.1 s step cap`);
});
