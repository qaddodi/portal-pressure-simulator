import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLimits, limitsFor, judgeFrames, judgeInput, frameLines, inputLines, breachLine, allBreaches, annotation, exitCode, summaryMarkdown, verdictOf, idleLines, IDLE, MIN_FRAMES } from '../scripts/frame-gate-lib.mjs';
import { createFrameRecorder, summarizeRaw } from '../src/ui/frame-stats.js';
import { PROFILES } from '../scripts/perf-profiles.mjs';

// The frame-time and input-latency gate (recs R2, R5): what it decides, and where it runs. (The browser half, scripts/frame-gate.mjs,
// runs in the workflows; nothing here opens a browser.)
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
// (The numbers these tests judge against are their own, not the limits file's, which is retuned as the runners report.)
const LIM = { target: { p95: 16.7, max: 100, input: 100 }, fail: { p95: 33.4, max: 250, input: 200 } };

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

test("a scenario's own ceiling replaces the profile's for that scenario only, and must be at or above its bar", () => {
  const j = loadLimits();
  for (const p of ['laptop', 'phone']) for (const [name, own] of Object.entries(j[p].scenarios)) for (const [k, v] of Object.entries(own)) assert.ok(v >= j[p].target[k], `${p} ${name} ${k}`);
  const mine = { target: LIM.target, fail: { p95: 300, max: 2000, input: 400 }, scenarios: { pan: { p95: 150, max: 400 } } };
  assert.deepEqual(limitsFor(mine, 'pan').fail, { p95: 150, max: 400, input: 400 });
  assert.deepEqual(limitsFor(mine, 'pinch').fail, mine.fail, 'a scenario with none of its own gets the profile\'s');
  assert.deepEqual(limitsFor(LIM, 'pan'), LIM, 'a file with no scenarios at all');
  // A scenario ceiling below its bar, or on a measure that does not exist, is a typo that would judge nothing right.
  const dir = mkdtempSync(join(tmpdir(), 'limits-'));
  const write = (scenarios) => { const f = join(dir, 'l.json'); writeFileSync(f, JSON.stringify({ laptop: { ...j.laptop, scenarios }, phone: j.phone })); return f; };
  assert.throws(() => loadLimits(write({ pan: { p95: 10 } })), /scenarios\["pan"\]\.p95/);
  assert.throws(() => loadLimits(write({ pan: { p99: 500 } })), /scenarios\["pan"\]\.p99/);
  assert.doesNotThrow(() => loadLimits(write({ pan: { p95: 200 } })));
});

test('a measure over the bar but under the ceiling names the ceiling, not the bar, as the limit', () => {
  const [b] = judgeFrames(sum(60, 20, 16.7), LIM);
  assert.equal(b.level, 'target');
  assert.equal(b.ceiling, 33.4);
  assert.match(breachLine(b), /^over the bar: script p95 20\.0 ms is past 16\.7 ms \(the limit is 33\.4 ms\)$/);
  const [i] = judgeInput([{ ms: 150, what: 'click button#x' }], LIM);
  assert.match(breachLine(i), /\(the limit is 200 ms\)$/);
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
  assert.match(frameJs, /get inputToPaint\(\) \{ return inputMeasure\(\); \}, frames: frameRecording/, 'the page offers what the gate calls');
  assert.match(read('package.json'), /"perf:gate": "node scripts\/frame-gate\.mjs"/);
});

test('the frame gate warns on the preview (checks.yml) and blocks in ci.yml, in the visual job of browser.yml, and adds no job', () => {
  const browser = read('.github/workflows/browser.yml'), checks = read('.github/workflows/checks.yml'), ci = read('.github/workflows/ci.yml');
  assert.match(browser, /PERF_GATE: \$\{\{ inputs\.strict && 'block' \|\| 'warn' \}\}\n[^\n]*\n\s+run: npm run perf:gate -- dist/);
  assert.match(checks, /uses: \.\/\.github\/workflows\/browser\.yml\n\s+with:\n[^\n]*\n\s+strict: false/, 'checks.yml only warns');
  assert.match(ci, /uses: \.\/\.github\/workflows\/browser\.yml\n\s+with:\n[^\n]*\n\s+strict: true/, 'ci.yml blocks');
  // (the step is in the visual job, the last in browser.yml: a job of its own would take two more runners)
  assert.ok(browser.indexOf('perf:gate') > browser.indexOf('\n  visual:\n'), 'browser.yml: in the visual job');
  const jobs = (yml) => [...yml.slice(yml.indexOf('\njobs:')).matchAll(/^ {2}([a-z][a-z-]*):\s*$/gm)].map((m) => m[1]);
  assert.deepEqual(jobs(browser), ['plan', 'browser-checks', 'gpu-organs', 'webkit', 'visual'], 'browser.yml: the browser jobs');
  assert.deepEqual(jobs(checks).slice(0, 2), ['build', 'browser'], 'checks.yml: the build, then browser.yml (the gate and the sweeps follow)');
  assert.deepEqual(jobs(ci), ['quick', 'browser', 'idle', 'gesture', 'text-floor'], 'ci.yml: quick, browser.yml and its own checks');
  assert.ok(!/perf:gate|frame-gate/.test(read('.github/workflows/pages.yml')), 'pages.yml, the deploy, does not run it');
  assert.match(browser, /continue-on-error: \$\{\{ !inputs\.strict \}\}\n\s+timeout-minutes: 15\n\s+env:\n\s+PERF_PROFILE/, 'a warning unless strict, never a red preview run');
});

test('the gate keeps to its time: a budget inside the step\'s, a verdict whatever is done, a second run only if it fits', () => {
  const js = read('scripts/frame-gate.mjs');
  const budget = +js.match(/flag\('budget', 'PERF_BUDGET', '(\d+)'\)/)[1];
  // (the budget, the 90 s grace of the watchdog and a minute to close the browser must fit in the step's 15 minutes)
  assert.match(read('.github/workflows/browser.yml'), /timeout-minutes: 15\n\s+env:\n\s+PERF_PROFILE/);
  assert.ok(budget + 90 + 60 < 15 * 60, `${budget} s and its grace fit in 15 minutes`);
  assert.match(js, /setTimeout\(\(\) => finish\(true\), BUDGET \+ 90000\)/, 'a call that hangs is cut off with the verdict');
  assert.match(js, /left\(\) < took \* 2 \+ 30000/, 'a frame scenario runs again only if there is time for two more');
  assert.match(js, /if \(!afford\(what, need\)\) return;/, 'and is not started if there is not time for it');
  assert.match(js, /writeFileSync\(`\$\{OUT\}\/perf-gate-\$\{res\.name\}\.json`/, 'the files are written as the run goes, not only at its end');
});

test('the gate loads each page with ?inputs, opens the Treat card where the phone has it, and waits for the boot cover to lift', () => {
  const js = read('scripts/frame-gate.mjs');
  assert.equal([...js.matchAll(/openPage\(ctx, prof, ([`'][^,]*), errors\)/g)].filter((m) => /&inputs/.test(m[1])).length, 3, 'all three pages');
  assert.match(js, /#thumbBar \[data-tab="treat"\]/, 'a phone held upright has no Treat button in the top bar');
  assert.match(js, /!document\.getElementById\('boot'\)/, 'nobody taps through the cover, and Playwright would wait for it for 30 s');
  assert.match(js, /left unanswered after 800 ms/, 'a Next nobody answered says how many inputs the page left unanswered');
  assert.match(js, /inputScenario\('menu \(cold\)', false,/, 'the cold open is reported, not judged, until a ceiling can be set from more than one sample');
});

test('the idle scenario lists what each surface cost in a second of the model left running, most expensive first, and the job summary carries it', () => {
  const r = createFrameRecorder();
  // 120 frames 8 ms apart (0.96 s): the stage ran in all of them at 1.5 ms, the dock in every fifth at 0.4 ms.
  for (let i = 0; i < 120; i++) r.add({ now: i * 8, gap: 8, script: i % 5 ? 1.5 : 1.9, parts: [['stage', 'early', 1.5], ...(i % 5 ? [] : [['dock', 'late', 0.4]])] });
  const raw = r.raw(), lines = idleLines(raw);
  assert.match(lines[0], /per surface over 1\.0 s \(120 frames\)/);
  assert.match(lines[1], /^\s+stage\s+120\s+1\.50\s+1\.50\s+187\.\d$/, 'the stage: 120 frames at 1.5 ms is about 187 ms of script a second');
  assert.match(lines[2], /^\s+dock\s+24\s+0\.40/);
  assert.match(lines.at(-1), /all surfaces\s+19\d\.\d$/);
  assert.match(idleLines({ frames: 0, gaps: [], byTag: {} }).at(-1), /no surface ran/);
  assert.equal(IDLE, 'idle (Play)');
  const res = [{ name: 'laptop', cpu: 4, renderer: 'gpu', frames: [{ name: IDLE, raw, sum: summarizeRaw(raw), breaches: [] }], inputs: [], skipped: [] }];
  const md = summaryMarkdown(res);
  assert.match(md, /idle \(Play\), by surface:/);
  assert.match(md, /```[\s\S]*stage\s+120/);
  // (A recording without its raw numbers, as the older tests build them, adds nothing.)
  assert.doesNotMatch(summaryMarkdown([{ ...res[0], frames: [{ ...res[0].frames[0], raw: undefined }] }]), /by surface/);
  const gate = read('scripts/frame-gate.mjs');
  assert.match(gate, /await frameScenario\(IDLE, async \(\) => \{\s+await home\(\);\s+return recorded\(A, async \(\) => \{ await sleep\(6000\); \}, 0\);\s+\}, 20000\);/);
});
