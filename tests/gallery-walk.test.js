// The phone check's runner (src/ui/gallery/walk.js): what each step is flagged for, the report it builds, the resume after the browser ends the tab (the step it
// ended on is the finding), the time limit, and the stop. Runs with fake steps, a fake page reading and a fake storage: no page, no GPU.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWalk, flagsFor, grewOwners, buildWalkReport, groupProblems, savedWalk, forgetWalk, WALK_KEY, MAX_KILLS, NEAR_SHARE, LIMIT_SHARE, JUMP_MB, KEPT_MB } from '../src/ui/gallery/walk.js';

const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const J = (id, labels, extra = {}) => ({ id, title: `Path ${id}`, priority: 1, steps: labels.map((l) => ({ op: 'pane', label: l, ...extra })) });
const reading = (mb, o = {}) => ({ mb, peak: mb, own: 1, charts: 1, live: 3, lost: 0, owners: [{ owner: 'veins', mb: mb * 0.7 }, { owner: 'tests', mb: mb * 0.3 }], ...o });
const ENV = 320;

function rig({ mbs = {}, fail = {}, die = null, problems = {}, errors = {}, unsettled = {}, clock = { t: 0 }, cost = 100 } = {}) {
  const seen = [];
  let cur = null, err = 0;
  return {
    seen,
    io: {
      storage: null, now: () => clock.t, wall: () => 1e12 + clock.t,
      async exec(step) {
        seen.push(step.label); cur = step.label; clock.t += cost;
        if (die === step.label) throw Object.assign(new Error('boom'), { kill: true });
        if (fail[step.label]) return { ok: false, error: fail[step.label] };
        if (errors[step.label]) err += errors[step.label];
        return unsettled[step.label] ? { ok: true, settled: false } : { ok: true, settled: true };
      },
      read: () => { const v = mbs[cur]; return typeof v === 'object' ? { ...reading(v.mb), ...v } : reading(v ?? 100); },
      judge: async () => ({ problems: problems[cur] || [], findings: [] }),
      errors: () => err,
    },
  };
}

test('flagsFor: near, at the limit, over, a jump that names who grew, contexts, a lost context, errors, a failed and an unsettled step', () => {
  const none = flagsFor({ mb: 100, own: 1, charts: 1, live: 3, lost: 0, errors: 0, settled: true }, null, { envelopeMb: ENV });
  assert.deepEqual(none, []);
  const kinds = (row, prev) => flagsFor({ own: 1, charts: 1, live: 3, lost: 0, errors: 0, settled: true, grew: [], ...row }, prev, { envelopeMb: ENV }).map((f) => f.kind);
  assert.deepEqual(kinds({ mb: ENV * NEAR_SHARE + 1 }), ['near']);
  assert.deepEqual(kinds({ mb: ENV * LIMIT_SHARE + 1 }), ['limit']);
  assert.deepEqual(kinds({ mb: ENV + 1 }), ['over']);
  const j = flagsFor({ mb: 160, own: 1, charts: 1, live: 3, lost: 0, errors: 0, settled: true, grew: [{ owner: 'veins', mb: 30 }] }, { mb: 120, lost: 0 }, { envelopeMb: ENV });
  assert.equal(j[0].kind, 'jump'); assert.match(j[0].text, /added 40 MB: veins \+30/);
  assert.equal(kinds({ mb: 100 }, { mb: 100 + 0 }).length, 0);
  assert.deepEqual(kinds({ mb: 100, live: 12 }), ['contexts']);
  assert.deepEqual(kinds({ mb: 100, own: 3 }), ['contexts']);
  assert.deepEqual(kinds({ mb: 100, lost: 1 }, { mb: 100, lost: 0 }), ['ctx-lost']);
  assert.deepEqual(kinds({ mb: 100, errors: 2 }), ['errors']);
  assert.deepEqual(kinds({ mb: 100, error: 'x' }), ['failed']);
  assert.deepEqual(kinds({ mb: 100, settled: false }), ['unsettled']);
  assert.ok(JUMP_MB > 0 && KEPT_MB > 0);
});

test('grewOwners names the owners that gained, biggest first, and ignores small changes', () => {
  assert.deepEqual(grewOwners([{ owner: 'a', mb: 10 }, { owner: 'b', mb: 50 }], [{ owner: 'a', mb: 40 }, { owner: 'b', mb: 51 }, { owner: 'c', mb: 8 }]), [{ owner: 'a', mb: 30 }, { owner: 'c', mb: 8 }]);
  assert.deepEqual(grewOwners(undefined, undefined), []);
});

test('a quiet walk is all clear, and the report says how long and how many steps', async () => {
  const { io } = rig();
  const r = await runWalk([J('a', ['one', 'two']), J('b', ['three'])], io, { envelope: { mb: ENV }, when: 'now' });
  assert.equal(r.summary.steps, 3);
  assert.match(r.text, /ALL CLEAR/);
  assert.match(r.text, /3 steps in 2 paths/);
  assert.match(r.text, /NOT CHECKED HERE/);
});

test('a step that adds a lot is named with the owner that grew; one at the limit is listed with its room', async () => {
  const { io } = rig({ mbs: { one: 100, two: { mb: 200, owners: [{ owner: 'veins', mb: 190 }, { owner: 'tests', mb: 10 }] }, three: 310 } });
  const r = await runWalk([J('a', ['one', 'two', 'three'])], io, { envelope: { mb: ENV } });
  assert.match(r.text, /PROBLEMS: .*1 step at the memory limit/);
  assert.match(r.text, /AT THE LIMIT[^]*a > three: 310 MB/);
  assert.match(r.text, /BIG STEPS[^]*two: this step added 100 MB: veins \+/);
  assert.equal(r.summary.atLimit, 1);
  assert.equal(r.summary.peakAt, 'three');
});

test('a path that ends above where it began, with everything put away, kept memory', async () => {
  const { io } = rig({ mbs: { one: 150, two: 190, close: 180 } });
  const r = await runWalk([J('a', ['one', 'two', 'close'])], io, { envelope: { mb: ENV } });
  assert.equal(r.journeys[0].startMb, 100);
  assert.ok(r.journeys[0].kept >= KEPT_MB);
  assert.match(r.text, /KEPT AFTER CLOSING[^]*Path a: 100 to 180 MB \(\+80\)/);
});

test('fit and self-check findings from many stops are one line with the stops counted', async () => {
  const p = { kind: 'cut', text: 'Card cut off at the bottom', where: 'card' };
  const { io } = rig({ problems: { one: [p], two: [p], three: [] } });
  const r = await runWalk([J('a', ['one', 'two', 'three'])], io, { envelope: { mb: ENV } });
  assert.equal(r.summary.problems, 1);
  assert.match(r.text, /\[fit cut\] Card cut off at the bottom \(2 stops\); first at "one"/);
  assert.equal(groupProblems(r.rows).length, 1);
});

test('a step with judge:false is not judged; a failed step is a finding and does not stop the walk', async () => {
  let judged = 0;
  const { io } = rig({ fail: { two: 'the app is in anatomy, not lobule' } });
  io.judge = async () => { judged++; return { problems: [], findings: [] }; };
  const jr = J('a', ['one', 'two', 'three']); jr.steps[0].judge = false;
  const r = await runWalk([jr], io, { envelope: { mb: ENV } });
  assert.equal(judged, 1, 'step 1 is not judged, step 2 failed, step 3 is');
  assert.equal(r.summary.failed, 1);
  assert.match(r.text, /STEPS THAT FAILED[^]*a > two: the app is in anatomy/);
  assert.equal(r.rows.length, 3);
});

test('a step that throws is a row with the error, and counted errors are laid to the step that made them', async () => {
  const { io } = rig({ die: 'two', errors: { three: 2 } });
  const r = await runWalk([J('a', ['one', 'two', 'three'])], io, { envelope: { mb: ENV } });
  assert.equal(r.rows[1].error, 'boom');
  assert.equal(r.rows[2].errors, 2);
  assert.equal(r.rows[0].errors, 0);
});

test('the tab ended: the next run names the step it ended on, the path before it and the last read, and goes on with the next path', async () => {
  const s = store();
  const clock = { t: 0 };
  // Run 1: dies (no more code runs) in the middle of step "three" of path a. We stop the run by throwing from read() after the step is open.
  const r1 = rig({ clock, mbs: { one: 120, two: 260 } });
  r1.io.storage = s;
  const realExec = r1.io.exec;
  r1.io.exec = async (step) => { if (step.label === 'three') { throw new Error('(the page went away)'); } return realExec(step); };
  // (The page cannot run code after a kill: copy the saved place as it was when step three opened, and start over from that.)
  const origSet = s.setItem; let atThree = null;
  s.setItem = (k, v) => { if (JSON.parse(v).open?.label === 'three') atThree = v; origSet(k, v); };
  await runWalk([J('a', ['one', 'two', 'three', 'four']), J('b', ['five', 'six'])], r1.io, { envelope: { mb: ENV } });
  assert.ok(atThree, 'the place was kept before step three started');
  const s2 = store(); s2.setItem(WALK_KEY, atThree);
  assert.equal(savedWalk(s2, 1e12 + 1000).open.label, 'three');
  const r2 = rig({ clock: { t: 5000 }, mbs: { five: 90, six: 95 } });
  r2.io.storage = s2; r2.io.wall = () => 1e12 + 6000;
  const rep = await runWalk([J('a', ['one', 'two', 'three', 'four']), J('b', ['five', 'six'])], r2.io, { envelope: { mb: ENV } });
  assert.deepEqual(r2.seen, ['five', 'six'], 'path a is not played again from the middle; path b is walked on a clean page');
  assert.equal(rep.summary.killed, 1);
  assert.match(rep.text, /THE TAB WAS ENDED by the browser on "Path a", step 3: three/);
  assert.match(rep.text, /Last read before it: 260 MB \(81%\)/);
  assert.match(rep.text, /Steps before it on this path: one > two/);
  assert.match(rep.text, /resumed 1 time/);
  assert.match(rep.text, /PROBLEMS: 1 tab ended/);
});

test('after MAX_KILLS the check stops and reports what it has', async () => {
  const s = store();
  const seed = (open) => ({ sig: 'a:2|b:1|c:1', state: 'running', rows: [], events: Array.from({ length: MAX_KILLS - 1 }, () => ({ type: 'kill', j: 0, i: 0, journey: 'a', label: 'x', path: [], last: null })), kills: MAX_KILLS - 1, resumes: 2, elapsed: 0, jStart: {}, next: { j: 1, i: 0 }, open, wall: 1e12 });
  s.setItem(WALK_KEY, JSON.stringify(seed({ j: 1, i: 0, label: 'five', mb: 200 })));
  const r = rig();
  r.io.storage = s;
  const rep = await runWalk([J('a', ['one', 'two']), J('b', ['five']), J('c', ['six'])], r.io, { envelope: { mb: ENV } });
  assert.deepEqual(r.seen, [], 'nothing more is walked');
  assert.match(rep.text, /NOT WALKED[^]*Path c/);
  assert.equal(rep.summary.killed, MAX_KILLS);
});

test('a place older than a quarter hour or from another set of paths is not resumed', async () => {
  const s = store();
  s.setItem(WALK_KEY, JSON.stringify({ sig: 'a:2', state: 'running', rows: [], events: [], kills: 0, resumes: 0, elapsed: 0, jStart: {}, next: { j: 0, i: 1 }, open: null, wall: 1e12 - 3600e3 }));
  const r = rig(); r.io.storage = s;
  await runWalk([J('a', ['one', 'two'])], r.io, { envelope: { mb: ENV } });
  assert.deepEqual(r.seen, ['one', 'two']);
  assert.equal(savedWalk(s, 1e12 + 1), null, 'a finished run is not resumable');
  s.setItem(WALK_KEY, JSON.stringify({ sig: 'zzz:9', state: 'running', rows: [], events: [], kills: 0, resumes: 0, elapsed: 0, jStart: {}, next: { j: 0, i: 1 }, open: null, wall: 1e12 }));
  const r2 = rig(); r2.io.storage = s;
  await runWalk([J('a', ['one', 'two'])], r2.io, { envelope: { mb: ENV } });
  assert.deepEqual(r2.seen, ['one', 'two']);
  forgetWalk(s); assert.equal(s.getItem(WALK_KEY), null);
});

test('the time limit drops the paths that have not started, and the report names them; a path that has started finishes', async () => {
  const clock = { t: 0 };
  const { io, seen } = rig({ clock, cost: 1000 });
  const r = await runWalk([J('a', ['one', 'two', 'three']), J('b', ['four']), J('c', ['five'])], io, { envelope: { mb: ENV }, deadlineMs: 2500 });
  assert.deepEqual(seen, ['one', 'two', 'three'], 'a is walked to its end though it ran past the limit; b and c did not start');
  assert.deepEqual(r.dropped, ['b', 'c']);
  assert.match(r.text, /NOT WALKED \(out of time\)[^]*Path b; Path c/);
  const full = rig({ clock: { t: 0 }, cost: 1000 });
  await runWalk([J('a', ['one', 'two', 'three']), J('b', ['four'])], full.io, { envelope: { mb: ENV }, deadlineMs: 0 });
  assert.deepEqual(full.seen, ['one', 'two', 'three', 'four'], 'deadlineMs 0 is no limit');
});

test('Stop ends after the step in hand and names the rest', async () => {
  const { io, seen } = rig();
  let n = 0; io.shouldStop = () => n++ >= 3;
  const r = await runWalk([J('a', ['one', 'two', 'three']), J('b', ['four'])], io, { envelope: { mb: ENV } });
  assert.deepEqual(seen, ['one', 'two']);
  assert.match(r.text, /NOT WALKED \(stopped\)/);
});

test('buildWalkReport of nothing says so', () => {
  const r = buildWalkReport({});
  assert.match(r.text, /Nothing was walked/);
});

test('progress is announced before each step and once at the end', async () => {
  const { io } = rig(); const got = [];
  io.onProgress = (p) => got.push(p.finished ? 'end' : p.step.label);
  await runWalk([J('a', ['one', 'two'])], io, { envelope: { mb: ENV } });
  assert.deepEqual(got, ['one', 'two', 'end']);
});

test('a step with its own gate fails over it; unmet pressure and the rest gate are findings', async () => {
  const { io } = rig({ mbs: { one: { mb: 270 }, two: { mb: 250, unmet: 4 } } });
  const jr = J('a', ['one', 'two']); jr.steps[0].maxShare = 0.75;
  const r = await runWalk([jr], io, { envelope: { mb: ENV } });
  assert.equal(r.summary.gated, 2);
  assert.match(r.text, /OVER A STEP'S OWN GATE[^]*a > one: 270 MB is 84% of the envelope; this step's gate is 75%/);
  assert.match(r.text, /two: the budget could not free 4.0 MB/);
  const hi = rig({ mbs: { one: 100 } });
  hi.io.read = () => reading(250);
  const r2 = await runWalk([J('a', ['one'])], hi.io, { envelope: { mb: ENV } });
  assert.equal(r2.summary.rest, 1);
  assert.match(r2.text, /REST \(before a path began[^]*before "Path a": 250 MB \(78%\)/);
});

test('errors are printed once per tag with the words the app caught and the first step they appeared on; owners over 5 MB and soft holders are named', async () => {
  const tags = { n: 0 };
  const { io } = rig({ errors: { two: 1, three: 2 } });
  const base = io.read;
  let step = null;
  const orig = io.exec; io.exec = async (s) => { step = s.label; if (s.label === 'two') tags['gl:draw'] = { n: 1, last: 'INVALID_OPERATION: bindTexture ' + 'x'.repeat(300) }; if (s.label === 'three') { tags['gl:draw'].n = 2; tags['walker:x'] = { n: 1, last: 'boom' }; } return orig(s); };
  io.errorTags = () => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(tags).filter(([k]) => k !== 'n'))));
  io.read = () => { const r = base(); return { ...r, owners: [{ owner: 'veins', mb: 150 }, { owner: 'tests', mb: 3 }], holders: step === 'three' ? [{ owner: 'veins', kind: 'warm', mb: 12.5 }] : [] }; };
  const r = await runWalk([J('a', ['one', 'two', 'three'])], io, { envelope: { mb: ENV }, info: { steps: true } });
  assert.match(r.text, /ERRORS COUNTED \(pps\.caught\): 3 on 2 steps, 2 distinct tags/);
  const line = r.text.split('\n').find((l) => l.includes('gl:draw'));
  assert.match(line, /"INVALID_OPERATION: bindTexture x+" \(2x on 2 steps\); first on a > two/);
  assert.ok(line.length < 260, 'the words are cut at 160 characters');
  assert.match(r.text, /walker:x: "boom" \(1x on 1 step\); first on a > three/);
  assert.match(r.text, /SOFT HOLDERS[^]*a: veins warm 12\.5 MB/);
  assert.match(r.text, /EVERY STEP[^]*\[a\][^]*1 one: \d+ MB \(.*\), 1\+1, veins 150/);
  assert.ok(!/tests 3/.test(r.text), 'an owner under 5 MB is not named');
  const quiet = await runWalk([J('a', ['one'])], rig().io, { envelope: { mb: ENV }, info: { steps: false } });
  assert.ok(!/EVERY STEP/.test(quiet.text));
});
