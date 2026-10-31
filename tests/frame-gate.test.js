import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLimits, judgeFrames, judgeInput, frameLines, inputLines, breachLine, allBreaches, annotation, exitCode, summaryMarkdown, verdictOf, MIN_FRAMES } from '../scripts/frame-gate-lib.mjs';
import { createFrameRecorder, summarizeRaw } from '../src/ui/frame-stats.js';
import { PROFILES } from '../scripts/perf-profiles.mjs';

// The frame-time and input-latency gate (recs R2, R5): what it decides, and where it runs. (The browser half, scripts/frame-gate.mjs,
// runs in the workflows; nothing here opens a browser.)
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const LIM = loadLimits().laptop;

/** The summary of `n` frames that each cost `script` ms and came `gap` ms apart. */
function sum(n, script, gap, extra = {}) {
  const r = createFrameRecorder();
  for (let i = 0; i < n; i++) r.add({ now: i * 16, gap, script: i === n - 1 && extra.last ? extra.last : script, parts: [['stage', 'early', script]] });
  return summarizeRaw(r.raw());
}

test("the limits file holds the recs' bars and a ceiling at or above each", () => {
  const j = loadLimits();
  assert.deepEqual(j.laptop.target, { p95: 16.7, max: 100, input: 100 });
  assert.deepEqual(j.phone.target, { p95: 33, max: 100, input: 150 });
  for (const p of ['laptop', 'phone']) for (const k of ['p95', 'max', 'input']) assert.ok(j[p].fail[k] >= j[p].target[k], `${p}.fail.${k}`);
});

test('a scenario within the bar has no breach; between the bar and the ceiling it misses the bar; past it, it fails', () => {
  assert.deepEqual(judgeFrames(sum(60, 5, 16.7), LIM), []);
  const near = judgeFrames(sum(60, 20, 16.7), LIM);
  assert.deepEqual(near.map((b) => [b.metric, b.level]), [['script p95', 'target']]);
  const over = judgeFrames(sum(60, 40, 16.7), LIM);
  assert.deepEqual(over.map((b) => [b.metric, b.level, b.limit, b.target]), [['script p95', 'fail', 33.4, 16.7]]);
});

test('the longest frame is judged on its own', () => {
  const b = judgeFrames(sum(60, 5, 16.7, { last: 120 }), LIM);
  assert.deepEqual(b.map((x) => [x.metric, x.level]), [['script max', 'target']]);
  const c = judgeFrames(sum(60, 5, 16.7, { last: 300 }), LIM);
  assert.equal(c[0].level, 'fail');
});

test('the interval between frames is judged only on a GPU, where the app and not the renderer sets the pace', () => {
  const slow = sum(60, 3, 130);
  assert.deepEqual(judgeFrames(slow, LIM), [], 'software renderer: script time only');
  const gpu = judgeFrames(slow, LIM, { gpu: true });
  assert.deepEqual(gpu.map((b) => b.metric).sort(), ['interval max', 'interval p95']);
  assert.ok(gpu.every((b) => b.level === 'fail' || b.level === 'target'));
});

test('too few frames are not judged', () => {
  assert.deepEqual(judgeFrames(sum(MIN_FRAMES - 1, 500, 16), LIM), []);
  assert.equal(judgeFrames(sum(MIN_FRAMES, 500, 16), LIM).length > 0, true);
});

test('an input is judged by its slowest answer', () => {
  const s = (...ms) => ms.map((m) => ({ ms: m, what: 'click button#x' }));
  assert.deepEqual(judgeInput(s(30, 60, 90), LIM), []);
  assert.deepEqual(judgeInput(s(30, 150), LIM).map((b) => b.level), ['target']);
  assert.deepEqual(judgeInput(s(30, 250), LIM).map((b) => [b.level, b.limit]), [['fail', 200]]);
  assert.deepEqual(judgeInput([], LIM), []);
});

const profile = (breaches = [], name = 'laptop') => ({ name, cpu: 4, renderer: 'software', skipped: [], errors: [], inputs: [{ name: 'menu (cold)', gated: true, samples: [{ ms: 250, what: 'click button#btnMenu' }], breaches }], frames: [] });
const failing = { metric: 'input to first change', value: 250, limit: 200, target: 100, level: 'fail' };
const missed = { ...failing, value: 150, level: 'target' };

test('warn mode never fails the run; block mode fails on a ceiling, not on a missed bar', () => {
  assert.equal(exitCode('warn', [profile([failing])]), 0);
  assert.equal(exitCode('block', [profile([failing])]), 1);
  assert.equal(exitCode('block', [profile([missed])]), 0);
  assert.equal(exitCode('block', [profile([])]), 0);
});

test('a run that measured nothing is not a pass in block mode', () => {
  const empty = { name: 'laptop', cpu: 4, renderer: 'unknown', frames: [], inputs: [], skipped: [{ name: 'everything', why: 'launch failed' }], errors: [] };
  assert.equal(exitCode('block', [empty]), 1);
  assert.equal(exitCode('warn', [empty]), 0);
});

test('the annotation is an error in block mode, a warning in warn mode, and none for a missed bar alone', () => {
  const b = allBreaches(profile([failing]))[0];
  assert.equal(b.scenario, 'menu (cold)');
  assert.match(annotation(b, 'block'), /^::error title=Frame time and input latency \(laptop\)::menu \(cold\): input to first change 250\.0 ms is past the 200 ms limit \(the bar is 100 ms\)$/);
  assert.match(annotation(b, 'warn'), /^::warning /);
  assert.equal(annotation({ ...b, level: 'target' }, 'block'), null);
});

test('the report names the surface that cost the most and the breach', () => {
  const r = createFrameRecorder();
  for (let i = 0; i < 20; i++) r.add({ now: i * 16, gap: 16.7, script: 40, parts: [['lobule-zoom', 'early', 30], ['glass', 'final', 10]] });
  const s = summarizeRaw(r.raw()), breaches = judgeFrames(s, LIM);
  const lines = frameLines({ name: 'camera glide', sum: s, breaches, notes: ['long frame: 1.0 s'] });
  assert.match(lines[0], /^ {2}camera glide +20 frames {3}script p50 40\.0 p95 40\.0 max 40\.0 {3}interval p50 16\.7 p95 16\.7 max 16\.7 \(not judged: software renderer\)$/);
  assert.match(lines[1], /by surface: lobule-zoom p95 30\.0 max 30\.0 · glass p95 10\.0 max 10\.0$/);
  assert.ok(lines.some((l) => /OVER THE LIMIT: script p95 40\.0 ms is past the 33\.4 ms limit \(the bar is 16\.7 ms\)/.test(l)));
  assert.ok(lines.some((l) => l.endsWith('long frame: 1.0 s')));
  assert.match(breachLine(missed), /^over the bar: /);
  const input = inputLines({ name: 'Next', gated: true, samples: [{ ms: 30, what: 'click button.pzb-next (1/12 to 2/12)' }, { ms: 70, what: 'click button.pzb-next (2/12 to 3/12)' }], breaches: [] });
  assert.match(input[0], /Next +2 samples {2}p50 70 ms {2}worst 70 ms$/);
});

test('the verdict lists what could not be measured, each measure past its ceiling, and the exit code', () => {
  const p = { ...profile([failing, missed]), skipped: [{ name: 'verb (Treat order)', why: 'locator timeout' }] };
  const warn = verdictOf([p], 'warn');
  assert.equal(warn.code, 0);
  assert.equal(warn.lines.length, 3);
  assert.ok(warn.lines.slice(0, 2).every((l) => l.startsWith('::warning title=Frame time and input latency (laptop)::')));
  assert.equal(warn.lines[2], '1 past a ceiling, 1 over the bar only');
  assert.match(warn.lines[0], /verb \(Treat order\) was not measured: locator timeout/);
  const block = verdictOf([p], 'block');
  assert.equal(block.code, 1);
  assert.ok(block.lines.some((l) => l.startsWith('::error ')));
  assert.equal(block.lines.at(-1), 'blocking: a measure is past its ceiling (scripts/perf-limits.json)');
  assert.match(block.markdown, /## Frame time and input latency/);
  const none = verdictOf([{ name: 'phone', cpu: 6, renderer: 'unknown', frames: [], inputs: [], skipped: [{ name: 'everything', why: 'launch failed' }], errors: [] }], 'block');
  assert.equal(none.code, 1);
  assert.equal(none.lines.at(-1), 'blocking: nothing could be measured');
  assert.equal(verdictOf([profile([])], 'block').code, 0);
});

test('the job summary has a table for each profile', () => {
  const r = createFrameRecorder();
  for (let i = 0; i < 12; i++) r.add({ now: i * 16, gap: 16.7, script: 4, parts: [['stage', 'early', 4]] });
  const p = { ...profile([failing]), frames: [{ name: 'pan', sum: summarizeRaw(r.raw()), breaches: [] }], skipped: [{ name: 'verb', why: 'no chip' }] };
  const md = summaryMarkdown([p]);
  assert.match(md, /### laptop \(CPU 4×, software renderer\)/);
  assert.match(md, /\| pan \| 12 \| 4\.0 \| 4\.0 \| 16\.7 \| ok \|/);
  assert.match(md, /\| menu \(cold\) \| 1 \| 250 \| 250 \| OVER THE LIMIT \|/);
  assert.match(md, /Not measured: verb \(no chip\)/);
});

test('the gate drives the page through the scheduler and the input tracker, and runs the two profiles', () => {
  const js = read('scripts/frame-gate.mjs');
  assert.match(js, /pps\.perf\.frames\.start\(\)/);
  assert.match(js, /pps\.perf\.frames\.stop\(\)/);
  assert.match(js, /pps\.perf\.inputToPaint\.entries\(/);
  for (const what of ["'pan'", 'pinch', "'camera glide'", 'slide change', "'Next'", 'lens (L key)', 'verb (Treat order)', 'menu (cold)', 'menu (warm)']) assert.ok(js.includes(what), `${what} is driven`);
  assert.deepEqual(Object.keys(PROFILES).filter((p) => p !== 'desktop'), ['laptop', 'phone']);
  assert.match(js, /\['laptop', 'phone'\]\.includes\(p\)/);
  const frameJs = read('src/ui/frame.js');
  assert.match(frameJs, /inputToPaint: inputMeasure\(\), frames: frameRecording/, 'the page offers what the gate calls');
  assert.match(read('package.json'), /"perf:gate": "node scripts\/frame-gate\.mjs"/);
});

test('checks.yml only warns and ci.yml blocks, both in the visual job, and no job is added to the runners', () => {
  const checks = read('.github/workflows/checks.yml'), ci = read('.github/workflows/ci.yml');
  assert.match(checks, /PERF_GATE: warn\n[^\n]*\n\s+run: npm run perf:gate -- dist/);
  assert.match(ci, /PERF_GATE: block\n[^\n]*\n\s+run: npm run perf:gate -- dist/);
  assert.ok(!/PERF_GATE: block/.test(checks), 'checks.yml never blocks');
  assert.ok(!/PERF_GATE: warn/.test(ci), 'ci.yml never only warns');
  // (the step is in the visual job, the last in each file: a job of its own would take two of the account's ~20 runners from pages.yml)
  for (const [name, yml] of [['checks.yml', checks], ['ci.yml', ci]]) {
    assert.ok(yml.indexOf('perf:gate') > yml.indexOf('\n  visual:\n'), `${name}: in the visual job`);
  }
  const jobs = (yml) => [...yml.slice(yml.indexOf('\njobs:')).matchAll(/^ {2}([a-z][a-z-]*):\s*$/gm)].map((m) => m[1]);
  assert.deepEqual(jobs(checks), ['build', 'browser-checks', 'gpu-organs', 'webkit', 'visual'], 'checks.yml: the same jobs as before');
  assert.deepEqual(jobs(ci), ['quick', 'browser-checks', 'gpu-organs', 'webkit', 'idle', 'gesture', 'text-floor', 'visual'], 'ci.yml: the same jobs as before');
  assert.ok(!/perf:gate|frame-gate/.test(read('.github/workflows/pages.yml')), 'pages.yml, the deploy, does not run it');
  assert.match(checks, /continue-on-error: true\n\s+timeout-minutes: 15\n\s+env:\n\s+PERF_PROFILE/, 'a warning here, never a red run');
});
