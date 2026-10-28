import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRefine, refineMsFrom, REFINE_MS } from '../src/ui/refine.js';

// Optional refinement (the organ pictures made sharper, the gut's) shares one small CPU allowance per display frame, and waits out a
// gesture. A fake frame clock and a fake probe stand in for the browser.
const probe = () => { const notes = {}, gauges = {}; return { on: true, notes, gauges, note: (k) => { notes[k] = (notes[k] || 0) + 1; }, gauge: (k, v) => { gauges[k] = v; } }; };
function clock() {
  let t = 16, waiting = [];
  return {
    wait: () => new Promise((res) => waiting.push(res)),
    // One display frame: everyone waiting resumes, in the order they asked, with the frame's time.
    frame: async () => { t += 16.67; const w = waiting; waiting = []; for (const r of w) r(t); await new Promise((r) => setImmediate(r)); },
  };
}

test('a frame gives its allowance to one job, the first to ask: the others wait for the next frame', () => {
  const r = createRefine({ ms: 1, probe: probe() });
  assert.equal(r.left(100), 1);
  assert.equal(r.left(100), 0, 'the second job of the same frame (taken when asked: all resume before any has run)');
  assert.equal(r.left(100), 0);
  assert.equal(r.left(116.7), 1, 'the next frame has its own');
});

test('a step that ran over its allowance is noted by name, and the next frame starts clean', () => {
  const r = createRefine({ ms: 1, probe: probe() });
  r.left(1); r.spent(13, 'organ layer gut');
  assert.equal(r.left(2), 1, 'not carried as debt: the one indivisible op is noted, the frames after it are not starved');
  assert.deepEqual({ ms: r.longest.ms, name: r.longest.name }, { ms: 13, name: 'organ layer gut' });
  r.spent(5, 'smaller'); assert.equal(r.longest.name, 'organ layer gut', 'the longest is kept');
});

test('nothing is given in a gesture, and the held frames are counted', () => {
  const p = probe();
  const r = createRefine({ ms: 1, probe: p });
  assert.equal(r.left(1, true), 0);
  assert.equal(r.left(2, true), 0);
  assert.equal(p.notes['refinement: frames held for a gesture'], 2);
  assert.equal(r.left(3, false), 1, 'let go: the next frame has its allowance');
});

test('the longest step and its allowance are put in the ?perf readout when it ran over', () => {
  const p = probe();
  const r = createRefine({ ms: 1, probe: p });
  r.spent(0.5, 'a'); assert.equal(p.gauges['refinement: longest step'], undefined, 'within its allowance: nothing to report');
  r.spent(7.46, 'organ layer liver');
  assert.match(p.gauges['refinement: longest step'], /^organ layer liver 7\.5 ms \(allowance 1 ms\)$/);
  assert.equal(p.notes['refinement: steps'], 2);
});

test('turn() waits out a gesture frame by frame, then resolves with the frame\'s allowance', async () => {
  const c = clock(), r = createRefine({ ms: 1, probe: probe() });
  let held = true, got;
  r.turn(c.wait, () => held).then((v) => { got = v; });
  await c.frame(); await c.frame(); await c.frame();
  assert.equal(got, undefined, 'three frames of gesture');
  held = false;
  await c.frame();
  assert.equal(got, 1);
});

test('a burst of jobs waiting out a gesture is released one step a frame, not all at once', async () => {
  const c = clock(), r = createRefine({ ms: 1, probe: probe() });
  let held = true;
  const order = [];
  const job = async (name) => { for (let i = 0; i < 3; i++) { const ms = await r.turn(c.wait, () => held); assert.equal(ms, 1); order.push(name); r.spent(ms, name); } };
  const done = Promise.all(['a', 'b', 'c'].map(job));
  for (let i = 0; i < 4; i++) await c.frame();
  assert.deepEqual(order, [], 'nothing runs in the gesture');
  held = false;
  const perFrame = [];
  for (let i = 0; i < 12; i++) { const n = order.length; await c.frame(); perFrame.push(order.length - n); }
  await done;
  assert.ok(perFrame.every((n) => n <= 1), `at most one full step a frame: ${perFrame}`);
  assert.equal(order.length, 9);
  assert.deepEqual(order.slice(0, 3), ['a', 'b', 'c'], 'one step each, round robin: a job that took its turn goes to the back');
  assert.deepEqual(perFrame, [1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0], 'nine steps, one a frame');
});

test('work that is no longer wanted is dropped while it waits, not after the gesture ends', async () => {
  const c = clock(), r = createRefine({ ms: 1, probe: probe() });
  let gone = false, got = 'unset';
  r.turn(c.wait, () => true, () => gone).then((v) => { got = v; });
  await c.frame();
  assert.equal(got, 'unset');
  gone = true;
  await c.frame();
  assert.equal(got, null);
});

test('the allowance is 1 ms, or what ?refinems= says within a quarter ms and 16', () => {
  assert.equal(REFINE_MS, 1);
  assert.equal(refineMsFrom(''), 1);
  assert.equal(refineMsFrom('?perf&refinems=3'), 3);
  assert.equal(refineMsFrom('?refinems=0'), 0.25);
  assert.equal(refineMsFrom('?refinems=900'), 16);
  assert.equal(refineMsFrom('?refinems=abc'), 1);
});

test('the stage gives every refinement a turn: the layer bake, the strip pictures and the gut picture, none a fixed 6 ms of its own', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /const refineHeld = \(\) => gestureOn\(\) \|\| !leftAlone\(120\);/, 'a gesture, or an input in the last 120 ms or a finger down');
  assert.match(stage, /const refineTurn = \(gone\) => refine\.turn\(\(\) => new Promise\(\(res\) => nextFrame\(res\)\), refineHeld, gone\);/);
  assert.doesNotMatch(stage, /performance\.now\(\) \+ 6\)/);
  const bake = stage.slice(stage.indexOf('async function bakeLayer'), stage.indexOf('const matOfEl'));
  assert.match(bake, /await refineTurn\(gone\)/);
  assert.match(bake, /refine\.spent\(performance\.now\(\) - t0, `organ layer \$\{L\}`\)/, 'the longest step is named by layer');
  const layers = stage.slice(stage.indexOf('async function rasterLayers'), stage.indexOf('function bakeAll'));
  assert.match(layers, /if \(await refineTurn\(\(\) => seq0 !== plateSeq \|\| drops0 !== plateDrops \|\| v !== veins \|\| !v \|\| v\.lost\) === null\) return false;/, 'reading every organ\'s shapes waits its turn too');
  assert.match(layers, /refineStep\('organ layers: shapes read', bakeAll\)/);
  const gut = stage.slice(stage.indexOf('async function makeGutPic'), stage.indexOf('function clientToWorldFast'));
  assert.match(gut, /await refineTurn\(\(\) => seq !== gutPicSeq\)/);
});
