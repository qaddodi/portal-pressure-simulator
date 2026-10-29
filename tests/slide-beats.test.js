// A time-lapse's slow push (lapse.cam) and camera beats inside a slide (beats): slide-beats.js's rules, the drift's ease (cam-arc.js),
// and the presenter's and stage's wiring, read from the code (the moves themselves need a browser).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS, REGIONS } from '../src/ui/decks.js';
import { driftEase } from '../src/ui/cam-arc.js';
import { lapseCamProblems, beatProblems, beatView, beatCount, BEAT_KEYS } from '../src/ui/slide-beats.js';

const PZ = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const ST = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const fn = (src, head) => { const i = src.indexOf(head); assert.ok(i >= 0, `${head} is there`); return src.slice(i, src.indexOf('\n  }\n', i)); };

test('the push eases in, moves evenly and eases out, never past its ends or backwards', () => {
  assert.equal(driftEase(0), 0); assert.equal(driftEase(1), 1);
  assert.ok(Math.abs(driftEase(0.5) - 0.5) < 1e-12, 'symmetric: half way at half time');
  let last = 0, speeds = [];
  for (let i = 1; i <= 1000; i++) { const p = driftEase(i / 1000); assert.ok(p >= last - 1e-12 && p <= 1, `monotone at ${i}`); speeds.push((p - last) * 1000); last = p; }
  // (No jump in speed anywhere: it starts and ends at rest, and the even middle is 1.25× the mean, not an ease-in-out's 2×.)
  for (let i = 1; i < speeds.length; i++) assert.ok(Math.abs(speeds[i] - speeds[i - 1]) < 0.01, `speed changes smoothly at ${i}`);
  assert.ok(speeds[0] < 0.01 && speeds.at(-1) < 0.01, 'at rest at both ends');
  assert.ok(Math.abs(speeds[500] - 1.25) < 0.01, 'the middle moves evenly');
});

test('lapse.cam takes any anatomy framing, and only on a slide whose camera is the anatomy', () => {
  for (const pc of ['varices', 'fit', [100, 100, 400, 400], ['portal', 'spleen'], { on: ['spleen'] }]) assert.deepEqual(lapseCamProblems({ cam: 'fit', lapse: { cam: pc } }, REGIONS), [], JSON.stringify(pc));
  assert.deepEqual(lapseCamProblems({ lapse: { seconds: 8 } }, REGIONS), [], 'no push, no problem');
  const bad = [[{ cam: 'fit', lapse: { cam: 'nowhere' } }, /no region nowhere/], [{ cam: 'fit', lapse: { cam: 'lobule:triad' } }, /no lobule/],
    [{ cam: 'route', cath: {}, lapse: { cam: 'liver' } }, /drives its own camera/], [{ view: 'circuit', lapse: { cam: 'liver' } }, /circuit/],
    [{ cam: 'lobule:triad', lapse: { cam: 'liver' } }, /opens in the liver/]];
  for (const [s, re] of bad) assert.ok(lapseCamProblems(s, REGIONS).some((p) => re.test(p)), JSON.stringify(s));
});

test('a beat changes only the figure, builds on the one before, and a slide has at most three', () => {
  const s = { title: 'T', cam: 'liver', glow: ['SIN_RR'], mark: { edges: ['C5'] }, line: 'Words', beats: [{ cam: 'varices', glow: ['C5'] }, { mark: null }] };
  assert.equal(beatCount(s), 3); assert.equal(beatCount({ title: 'T' }), 1); assert.equal(beatCount({ beats: [{}], visual: 'table' }), 1);
  assert.equal(beatView(s, 0), s, 'beat 1 is the slide itself');
  assert.deepEqual([beatView(s, 1).cam, beatView(s, 1).glow, beatView(s, 1).mark, beatView(s, 1).line], ['varices', ['C5'], s.mark, 'Words']);
  assert.deepEqual([beatView(s, 2).cam, beatView(s, 2).glow, beatView(s, 2).mark], ['varices', ['C5'], null], 'beat 3 keeps beat 2\'s and clears the mark');
  assert.deepEqual(beatProblems(s, REGIONS), []);
  const bad = [[{ beats: [] }, /one view or more/], [{ beats: [{}, {}, {}] }, /at most 3/], [{ beats: [{ params: {} }] }, /not params/],
    [{ beats: [{ line: 'x' }] }, /not line/], [{ lapse: {}, beats: [{}] }, /time-lapse/], [{ scales: ['lobule'], beats: [{}] }, /scale switch/],
    [{ cath: {}, beats: [{}] }, /catheter/], [{ cam: 'liver', beats: [{ cam: 'lobule:triad' }] }, /one side/], [{ cam: 'liver', beats: [{ cam: 'nowhere' }] }, /no region/]];
  for (const [b, re] of bad) assert.ok(beatProblems(b, REGIONS).some((p) => re.test(p)), JSON.stringify(b));
  assert.ok(!BEAT_KEYS.some((k) => ['params', 'preset', 'days', 'tool', 'data', 'tiles', 'title', 'line', 'lens', 'lapse'].includes(k)), 'nothing that changes the words, the card or the model');
});

test('every built-in slide\'s push and beats follow the rules', () => {
  let pushes = 0;
  for (const d of DECKS) for (const s of d.slides) {
    const where = `${d.id}/${s.id}`;
    assert.deepEqual(lapseCamProblems(s, REGIONS), [], where);
    assert.deepEqual(beatProblems(s, REGIONS), [], where);
    if (s.lapse?.cam) pushes++;
  }
  assert.ok(pushes >= 1, 'a deck uses the push');
  const v = DECKS.find((d) => d.id === 'varices')?.slides.find((s) => s.id === 'lapse');
  assert.equal(v?.lapse?.cam, 'varices', 'Varices: the days push in from the whole patient to the varices they grow');
});

test('the presenter pushes while the days run, finishes with Next, and opens on the end framing when the days are not played', () => {
  const play = fn(PZ, 'async function playLapse(');
  assert.match(play, /host\.send\(\{ type: 'lapse'[^\n]*\n\s*pushTo\(s, to, \(s\.lapse\.seconds \|\| 8\) \* 1000\)/, 'the push starts with the days, over their seconds');
  assert.match(play, /lapseOn = false; paintChrome\(\);\n\s*pushEnd\(s, to,/, 'and lands (measured afresh) as they end');
  assert.match(fn(PZ, 'function skipLapse('), /pushEnd\(slides\[want\], want, 600\)/, 'Next runs the push out with the days, in 600 ms');
  assert.match(fn(PZ, 'async function transitionRun('), /const fv = figView\(s, lap\); fig = \{ i: to, s: fv \}; push = null;/, 'a slide opens on its end framing unless it plays');
  assert.match(fn(PZ, 'function reframe('), /const s = figOf\(shown\.i\);/, 'a refit keeps the framing the figure shows');
  assert.match(fn(PZ, 'function fitAround('), /left > 0 \? \{ drift: true \} : \{\}/, 'a refit during the push keeps pushing, over the seconds left');
  const pt = fn(PZ, 'function pushTo(');
  assert.match(pt, /reduce\.matches \|\| !stage\.canDrift\?\.\(\)/, 'no drift with reduced motion, or where the live organs would make it stutter');
});

test('the stage\'s drift keeps the labels up and carried, and every cut ends it', () => {
  const a = fn(ST, 'function animateVT(');
  assert.match(a, /store\.get\(\)\.presenting && !drift && !sameView\(from, to\)\) \{ camMove = true;/, 'a drift never fades the labels (cam-move)');
  assert.match(ST, /if \(opt\.drift\) animateVT\(to, ms, \{ drift: true \}\); else animateVT\(to, ms, \{ arc: true \}\);/, 'and never arcs');
  assert.match(a, /\(drift \? driftEase : easeInOut\)/, 'its own ease');
  assert.match(ST, /ride = drifting && !hand;\n\s*const solve = [^\n]*\(!ride && dz > \(hand \? SOLVE_ZOOM_HAND : SOLVE_ZOOM\)\)/, 'labels are carried through it however far it zooms');
  assert.match(ST, /if \(ride && dz > SOLVE_ZOOM\) carryClear = true;/, 'never onto each other');
  assert.match(ST, /if \(drifting\) \{ labelSettleT = setTimeout\(settle, 120\); return; \}/, 'and solved again once it lands');
  assert.match(ST, /function driftEnd\(\) \{ if \(!drifting\) return; drifting = false; labelSettleSoon\(\); \}/);
  const cuts = ST.match(/cancelFrame\(vtAnim\);( driftEnd\(\);)?/g);
  assert.equal(cuts.filter((c) => !c.includes('driftEnd')).length, 1, 'every cut but animateVT\'s own (which sets it afresh) ends the drift');
});
