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
  assert.match(fn(PZ, 'async function transitionRun('), /const b0 = Math\.min\(beat, lastBeat\(to\)\), fv = figView\(beatView\(s, b0\), lap\); fig = \{ i: to, s: fv \}; push = null;/, 'a slide opens on its end framing unless it plays');
  assert.match(fn(PZ, 'function reframe('), /const s = figOf\(shown\.i\);/, 'a refit keeps the framing the figure shows');
  assert.match(fn(PZ, 'function fitAround('), /left > 0 \? \{ drift: true \} : \{ steady: true \}/, 'a refit during the push keeps pushing, over the seconds left');
  const pt = fn(PZ, 'function pushTo(');
  assert.match(pt, /reduce\.matches \|\| !stage\.canDrift\?\.\(\)/, 'no drift with reduced motion, or where the live organs would make it stutter');
});

test('the stage\'s drift keeps the labels up and carried, and every cut ends it', () => {
  const a = fn(ST, 'function animateVT(');
  assert.match(a, /store\.get\(\)\.presenting && !drift && !carry && !sameView\(from, to\)\) \{ camMove = true;/, 'a drift never fades the labels (cam-move), nor does a small move that carries them (label-carry.test.js)');
  assert.match(ST, /if \(opt\.drift\) animateVT\(to, ms, \{ drift: true \}\); else animateVT\(to, ms, \{ arc: true, steady: !!opt\.steady \}\);/, 'and never arcs');
  assert.match(a, /\(drift \? driftEase : easeInOut\)/, 'its own ease');
  assert.match(ST, /ride = drifting && !hand;\n\s*const solve = [^\n]*\(!ride && dz > \(hand \? SOLVE_ZOOM_HAND : SOLVE_ZOOM\)\)/, 'labels are carried through it however far it zooms');
  assert.match(ST, /if \(ride && dz > SOLVE_ZOOM\) carryClear = true;/, 'never onto each other');
  assert.match(ST, /if \(drifting\) \{ labelSettleT = setTimeout\(settle, 120\); return; \}/, 'and solved again once it lands');
  assert.match(ST, /function driftEnd\(\) \{ if \(!drifting\) return; drifting = false; carrying = false; rideLeaders\(false\); labelSettleSoon\(\); \}/);
  const cuts = ST.match(/cancelFrame\(vtAnim\);( driftEnd\(\);)?/g);
  assert.equal(cuts.filter((c) => !c.includes('driftEnd')).length, 1, 'every cut but animateVT\'s own (which sets it afresh) ends the drift');
});

test('Next goes through a slide\'s beats before the next slide, Back the other way; a slide opened any other way shows its last', () => {
  const nx = fn(PZ, 'const next = () => {');
  assert.ok(nx.indexOf('skipLapse()') < nx.indexOf('procNext()') && nx.indexOf('procNext()') < nx.indexOf('toBeat(beat + 1)') && nx.indexOf('toBeat(beat + 1)') < nx.indexOf('go(want + 1)'),
    'a case card, a time-lapse, a procedure step, then a beat, then the next slide');
  assert.match(nx, /\{ firstBeat = true; go\(want \+ 1\); firstBeat = false; \}/, 'stepping on opens the first beat');
  assert.match(PZ, /const prev = \(\) => \{ if \(procBack\(\)\) return; if \(beat > 0\) toBeat\(beat - 1\); else if \(want > 0\) go\(want - 1\); \};/, 'Back: the beat before, then the slide before (its last beat)');
  assert.match(fn(PZ, 'function go(i) {'), /beat = firstBeat \? 0 : lastBeat\(want\);/, 'a jump, Back, a reload or resume: the last beat');
  const tb = fn(PZ, 'function toBeat(k) {');
  assert.match(tb, /if \(zoomOn\(\)\) \{ ui\.zoom\.close\(\)\.then\(/, 'a zoomed card glides back first, as for a slide');
  const run = fn(PZ, 'async function run() {');
  assert.match(run, /shownBeat !== beat/); assert.match(run, /if \(landed\) await beatMove\(want, beat\); else await transition\(want\);/, 'one loop moves slides and beats, so a quick Next twice lands once');
  assert.match(fn(PZ, 'async function transitionRun('), /shown = \{ i: to, gen: g \}; lastAt = to; shownBeat = b0;/);
});

test('a beat moves only the figure: call-outs out, the camera, call-outs in; the cards and the model stay', () => {
  const bm = fn(PZ, 'async function beatMove(');
  assert.match(bm, /beat !== k/, 'a newer beat or slide cuts it');
  assert.match(bm, /if \(scalePick\) \{ scalePick = null;/, 'a flip of the scale ends at a beat');
  assert.ok(bm.indexOf('figureHooks(\'clear\')') < bm.indexOf('await camera(cam, v, cut)') && bm.indexOf('await camera(cam, v, cut)') < bm.indexOf('paintOverlays(v, i,'), 'out, move, in');
  assert.match(bm, /fig = \{ i, s: v \};/, 'a refit keeps the beat\'s framing');
  for (const no of ['wordsIn(', 'cardsIn(', 'morphTo(', 'applyState(', 'keepFor(', 'dataTo(']) assert.ok(!bm.includes(no), `no ${no}`);
  assert.match(PZ, /if \(shownBeat !== beat\) return; {3}\/\/ \(a beat still on its way\)/, 'no flip while a beat moves');
  const chrome = fn(PZ, 'function paintChrome() {');
  assert.match(chrome, /more = !skip && beat < lastBeat\(i\), last = i === n - 1 && !skip && !more;/, 'Next stays on for the last slide\'s beats');
  assert.match(chrome, /`Next view, \$\{beat \+ 2\} of \$\{lastBeat\(i\) \+ 1\}`/);
});

test('Varices, Other collaterals: the paraumbilical vein, then the rectal varices, then both, each framed and called out on its own', () => {
  const s = DECKS.find((d) => d.id === 'varices').slides.find((x) => x.id === 'umbilical');
  assert.equal(beatCount(s), 3);
  assert.deepEqual([0, 1, 2].map((b) => beatView(s, b).cam), ['wall', 'rectum', [380, 330, 1020, 960]], 'the last beat is the framing the slide had before');
  assert.deepEqual(beatView(s, 2).labels, s.labels); assert.deepEqual(beatView(s, 2).terms, s.terms);
});
