// The treatment procedures played on the anatomy (proc-anim.js): each eases in and back out, its step order holds, the model
// takes the change the Treat buttons make, one the patient cannot have says why, and built-in slides use it only where adopted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROCS, PROC_KINDS, procBlocked, procOffered, procFrame, stepAt, stepMark, STEP_NUM, markAt, playProcedure, GV_MIN_MM } from '../src/ui/proc-anim.js';
import { LABEL_VESSEL } from '../src/ui/anatomy.js';
import { defaultParams } from '../src/engine/scenario.js';
import { isOccluded } from '../src/engine/topology.js';
import { DECKS } from '../src/ui/decks.js';
import { adopted } from './deck-adopted.js';

const times = (T) => Array.from({ length: Math.ceil(T.end / 20) + 1 }, (_, i) => i * 20);

test('every procedure eases: no value jumps between frames, and it starts and ends out of sight', () => {
  for (const k of PROC_KINDS) {
    let prev = null;
    for (const t of times(PROCS[k].T)) {
      const f = procFrame(k, t);
      for (const key of ['u', 'balloon', 'column', 'opacity']) {
        assert.ok(f[key] >= 0 && f[key] <= 1, `${k} ${key} at ${t}: ${f[key]}`);
        if (prev) assert.ok(Math.abs(f[key] - prev[key]) < 0.08, `${k} ${key} jumps at ${t} ms`);
      }
      prev = f;
    }
    assert.equal(procFrame(k, 0).u, 0);
    const end = procFrame(k, PROCS[k].T.end);
    assert.equal(end.opacity, 0); assert.equal(end.u, 0); assert.equal(end.balloon, 0); assert.equal(end.column, 0);
    assert.equal(end.step, -1);
  }
});

test('the steps run in order, the work happens with the catheter in, and the change lands before it leaves', () => {
  for (const k of PROC_KINDS) {
    const T = PROCS[k].T;
    let last = 0;
    for (const t of times(T)) { const s = procFrame(k, t).step; if (s >= 0) { assert.ok(s >= last, `${k}: step back at ${t}`); last = s; } }
    assert.equal(last, PROCS[k].steps.length - 1);
    assert.ok(T.apply < T.back, `${k}: applied before the catheter starts out`);
    assert.equal(procFrame(k, T.apply - 1).u, 1, `${k}: the tip is all the way in while it works`);
    assert.ok(procFrame(k, T.apply).step >= PROCS[k].steps.length - 2, `${k}: the change lands in the last steps`);
  }
  // The TIPS's needle crosses the tract between the hepatic vein and the portal vein (the route's stops).
  const stops = { tract: [0.5, 0.8] };
  assert.equal(procFrame('tips', PROCS.tips.T.needle0, stops).u, 0.5);
  assert.equal(procFrame('tips', PROCS.tips.T.needle1, stops).u, 0.8);
  assert.ok(procFrame('tips', (PROCS.tips.T.inflate0 + PROCS.tips.T.inflate1) / 2, stops).balloon > 0.3);
  assert.equal(procFrame('brto', PROCS.brto.T.fill1).column, 1);
});

test('the change each one leaves matches the Treat buttons', () => {
  const p = defaultParams();
  const tips = PROCS.tips.apply(structuredClone(p));
  assert.equal(tips.tips.on, true); assert.equal(tips.tips.d, 8);
  for (const k of ['brto', 'bato']) {
    const q = PROCS[k].apply(structuredClone({ ...p, spontaneous: { ...p.spontaneous, C5: true } }));
    assert.equal(q.occluded.C5, true);
    assert.ok(isOccluded(q, 'C5') && isOccluded(q, 'C2'), `${k} closes the shunt and its gastric feeder`);
  }
});

test('one the patient cannot have says why', () => {
  const p = defaultParams();   // (no gastrorenal shunt by default)
  assert.equal(procBlocked('tips', p), '');
  assert.match(procBlocked('tips', { ...p, tips: { on: true, d: 8 } }), /already/);
  assert.match(procBlocked('tips', { ...p, thrombus: { RHV_IVC: 1 } }), /clotted/);
  assert.match(procBlocked('brto', p), /no gastrorenal shunt/);
  const grs = { ...p, spontaneous: { C5: true, C6: false } };
  assert.equal(procBlocked('brto', grs), ''); assert.equal(procBlocked('bato', grs), '');
  assert.match(procBlocked('brto', { ...grs, occluded: { C5: true } }), /already closed/);
  assert.match(procBlocked('bato', { ...grs, thrombus: { PV_TRUNK: 1 } }), /portal vein is clotted/);
  assert.ok(procBlocked('nope', p));
});

test('built-in slides use procedure only where adopted, each naming a known one', () => {
  for (const d of DECKS) for (const s of d.slides) {
    if (s.procedure == null) continue;
    assert.ok(adopted(d, s, 'procedure'), `${d.id}/${s.id} uses procedure without being listed in tests/deck-adopted.js`);
    const k = typeof s.procedure === 'string' ? s.procedure : s.procedure.kind;
    assert.ok(PROCS[k], `${d.id}/${s.id}: unknown procedure ${k}`);
  }
});

test('a patient who already has the result can have it taken back and put back (a slide that shows it done)', () => {
  const p = { ...defaultParams(), spontaneous: { C5: true, C6: false } };
  for (const k of PROC_KINDS) {
    const done = PROCS[k].apply(structuredClone(p));
    assert.ok(PROCS[k].had(done) && !PROCS[k].had(p), k);
    const back = PROCS[k].undo(structuredClone(done));
    assert.ok(!PROCS[k].had(back), `${k}: taken back`);
    assert.equal(procBlocked(k, back), '', `${k}: playable again`);
  }
  assert.ok(!isOccluded(PROCS.brto.undo(structuredClone(PROCS.brto.apply(structuredClone(p)))), 'C2'), 'the gastric feeder reopens with the shunt');
});

// Review 23 Oct: BRTO and BATO are offered only while there are gastric varices to treat, and play slowly enough to follow.
test('BRTO and BATO are offered only with gastric varices (TIPS always), and say why when there are none', () => {
  const p = defaultParams(); p.spontaneous = { ...p.spontaneous, C5: true };
  const none = { gastricVarix: { d: 0 } }, small = { gastricVarix: { d: GV_MIN_MM - 0.1 } }, some = { gastricVarix: { d: 6 } };
  for (const k of ['brto', 'bato']) {
    assert.equal(procOffered(k, p, none), false, `${k} with no varices`);
    assert.equal(procOffered(k, p, small), false, `${k} below grading size`);
    assert.equal(procOffered(k, p, some), true, `${k} with varices`);
    assert.match(procBlocked(k, p, none), /no gastric varices/);
    assert.equal(procBlocked(k, p, some), '');
    // Once it has closed them, it can still be watched again (a slide plays it from just before).
    assert.equal(procOffered(k, { ...p, occluded: { C5: true } }, none), true, `${k} already done`);
  }
  assert.equal(procOffered('tips', p, none), true);
  assert.equal(procBlocked('tips', p, none), '');
});

test('BRTO and BATO run slowly enough to follow', () => {
  for (const k of ['brto', 'bato']) {
    const T = PROCS[k].T;
    assert.ok(T.end >= 22000, `${k} lasts ${T.end} ms`);
    assert.ok(T.travel1 - T.travel0 >= 6000, `${k}: the catheter travels for at least 6 s`);
    assert.ok(T.fill1 - T.fill0 >= 4000, `${k}: the sclerosant fills for at least 4 s`);
  }
});

// His ask, 29 Oct: the zoom jumped, the callouts moved and looked unlike the app's, and the steps were hard to follow. Each step
// now plays whole inside one still shot, its callout the slide's own mark on a vessel, one step per Next.
test('every step plays inside one shot, the camera moving only between steps, two shots and in order', () => {
  for (const k of PROC_KINDS) {
    const P = PROCS[k], T = P.T;
    assert.equal(P.stops.length, P.steps.length, `${k}: a stop for every step`);
    assert.equal(P.stops.at(-1), T.end, `${k}: the last step ends with the catheter gone`);
    for (let i = 1; i < P.stops.length; i++) assert.ok(P.stops[i] > P.stops[i - 1], `${k}: stops in order`);
    // (shots: the whole way in first, then the close-up for the rest; never back out mid-procedure. BRTO and BATO frame the
    // balloon closer still, then the tip on to the varices for the sclerosant: his ask, 29 Oct, "zoom into the balloon catheter tip")
    assert.deepEqual(P.steps.map((s) => s[4]), k === 'tips' ? ['way', 'tip', 'tip', 'tip'] : ['way', 'tip', 'work', 'work'], `${k} shots`);
    for (const t of times(T)) {
      const f = procFrame(k, t);
      if (f.step >= 0) { assert.equal(f.step, stepAt(k, t)); assert.equal(f.shot, P.steps[f.step][4], `${k} at ${t}`); }
      else assert.equal(f.shot, '');
    }
    // Held at a stop, the step is the one that just played (its callout stays up) and nothing is moving.
    P.stops.slice(0, -1).forEach((x, i) => {
      assert.equal(stepAt(k, x), i, `${k}: held at stop ${i}`);
      const a = procFrame(k, x - 40), b = procFrame(k, x + 40);
      for (const key of ['u', 'balloon', 'column']) assert.ok(Math.abs(a[key] - b[key]) < 1e-9, `${k}: ${key} still across stop ${i}`);
    });
    // Where the shot changes, nothing moves for a while after it (the camera lands first; playProcedure also waits for it).
    const cut = P.stops[P.steps.findIndex((s) => s[4] === 'tip') - 1];
    const c0 = procFrame(k, cut), c1 = procFrame(k, cut + 250);
    for (const key of ['u', 'balloon', 'column']) assert.ok(Math.abs(c0[key] - c1[key]) < 1e-9, `${k}: ${key} still as the close-up lands`);
  }
});

test("each step's callout is a treatment mark on a vessel of its own route, and its names are the figure's stations", () => {
  const routes = { tips: ['SVC_RA', 'IVCS_RA', 'IVC_IS', 'RHV_IVC', 'TIPS', 'PVH_R', 'PV_TRUNK'], brto: ['ILI_IVC', 'IVC_IS', 'LRV_IVC', 'C5'], bato: ['PVH_R', 'PV_TRUNK', 'SV_CONF', 'C2'] };
  for (const k of PROC_KINDS) PROCS[k].steps.forEach((s, i) => {
    const m = stepMark(k, i);
    // (numbered as its step in the teaching card, at its own point on the part it names, kept clear of the vessels: his asks, 29 Oct)
    assert.deepEqual(m, { edges: [s[5]], label: `${STEP_NUM[i]} ${s[1]}`, kind: 'treat', f: s[7], pin: true, ghost: true });
    assert.ok(s[7] > 0 && s[7] < 1, `${k} step ${i}: a point along its vessel`);
    assert.ok(routes[k].includes(s[5]), `${k} step ${i}: ${s[5]} is on its route`);
    for (const n of s[6]) assert.ok(LABEL_VESSEL[n], `${k} step ${i}: ${n} is a station label`);
    assert.ok(s[3] && s[3].length <= 8, `${k} step ${i}: short word "${s[3]}"`);
  });
  assert.equal(stepMark('brto', 99), null);
  // The TIPS callouts after the catheter is in name the tract (his ask, 29 Oct: "the callout should be on the tract").
  assert.deepEqual(PROCS.tips.steps.slice(1).map((s) => s[5]), ['TIPS', 'TIPS', 'TIPS']);
  // The BRTO slide just plays BRTO (his ask, 29 Oct): no Shunt open / Shunt closed buttons and no mark of its own; played through,
  // the last step's callout stays.
  const s = DECKS.find((d) => d.id === 'gastric-varices').slides.find((x) => x.id === 'brto');
  assert.equal(s.compare, undefined); assert.equal(s.mark, undefined); assert.equal(s.procedure, 'brto');
});

// A stand-in for the stage and the frame clock: playProcedure on a clock the test moves by hand.
function rig() {
  const q = [];
  let now = 0, gl = 0;
  globalThis.performance = { now: () => now };
  globalThis.requestAnimationFrame = (fn) => { q.push(fn); return q.length; };
  globalThis.cancelAnimationFrame = () => {};
  const moves = [], cats = [];
  const stage = {
    setCatheter: (st) => cats.push(st), cathStops: () => null, gliding: () => now < gl,
    cathFocus: (mode, ms) => { moves.push({ mode, at: now, ms }); gl = now + ms; return true; },
  };
  const run = (ms, step = 16) => { for (let t = 0; t < ms; t += step) { now += step; const f = q.splice(0); for (const fn of f) fn(now); } };
  return { stage, run, moves, cats, idle: () => q.length === 0, now: () => now };
}

test('presented, it holds at each step until Next, waits for each shot to land, and Back runs a step backwards', async () => {
  const saved = { p: globalThis.performance, r: globalThis.requestAnimationFrame, c: globalThis.cancelAnimationFrame };
  try {
    const R = rig(), steps = [], marks = [], ends = [];
    let applied = 0;
    const play = playProcedure(R.stage, 'brto', { stepped: true, apply: () => applied++, unapply: () => applied--, onStep: (k) => steps.push(k), onMark: (m) => marks.push(m && m.label), onEnd: (e) => ends.push(e) });
    assert.deepEqual([steps.length, marks.length], [0, 0], 'no callback runs inside the call (the caller names the run it returns)');
    R.run(12000);
    const P = PROCS.brto;
    assert.deepEqual(R.moves.map((m) => m.mode), ['way'], 'one shot for the way in');
    assert.equal(play.at, 0); assert.ok(R.idle(), 'held at the first stop with no frames running');
    assert.deepEqual(steps, [0]); assert.deepEqual(marks, [false, '\u278A Catheter in'], 'no callout while it travels in, then the step on its vessel');
    // (nothing moved while the first shot glided in)
    const during = R.cats.filter((c, i) => i < R.cats.length && c && c.u > 0).length;
    assert.ok(during > 0 && R.cats[0].u === 0 && R.cats[0].keep === true, 'the figure keeps its names');
    assert.ok(play.next());
    R.run(30000);
    assert.deepEqual(R.moves.map((m) => m.mode), ['way', 'tip']);
    assert.equal(steps.at(-1), 1); assert.equal(marks.at(-1), '\u278B Balloon up');
    assert.ok(play.next()); R.run(30000);
    assert.equal(applied, 1, 'the model took the change as the sclerosant filled');
    assert.ok(play.back()); R.run(30000);
    assert.equal(applied, 0, 'and gave it back going back');
    assert.equal(steps.at(-1), 1);
    assert.ok(play.back()); R.run(30000);
    assert.deepEqual(R.moves.map((m) => m.mode), ['way', 'tip', 'work', 'tip', 'way'], 'back through each shot, between steps');
    assert.ok(play.back()); R.run(30000);
    assert.equal(play.running, false); assert.deepEqual(ends, [{ done: false, rewound: true }]);
    assert.equal(R.moves.at(-1).mode, 'home'); assert.equal(marks.at(-1), null);
    assert.equal(R.cats.at(-1), null, 'the catheter is gone');
    void P;
  } finally { Object.assign(globalThis, { performance: saved.p, requestAnimationFrame: saved.r, cancelAnimationFrame: saved.c }); }
});

test('in Tests it plays through by itself, every step in turn, and leaves the change made', () => {
  const saved = { p: globalThis.performance, r: globalThis.requestAnimationFrame, c: globalThis.cancelAnimationFrame };
  try {
    for (const k of PROC_KINDS) {
      const R = rig(), steps = [], ends = [];
      let applied = 0;
      playProcedure(R.stage, k, { apply: () => applied++, onStep: (i) => steps.push(i), onEnd: (e) => ends.push(e) });
      R.run(60000);
      assert.deepEqual(steps, [0, 1, 2, 3], k);
      assert.equal(applied, 1, k);
      assert.deepEqual(ends, [{ done: true, rewound: false }], k);
      assert.deepEqual(R.moves.map((m) => m.mode), k === 'tips' ? ['way', 'tip', 'home'] : ['way', 'tip', 'work', 'home'], `${k}: a move only between shots`);
      assert.ok(R.moves.every((m) => m.ms >= 1400), `${k}: every move glides as a slide's camera does`);
    }
  } finally { Object.assign(globalThis, { performance: saved.p, requestAnimationFrame: saved.r, cancelAnimationFrame: saved.c }); }
});

// His asks, 29 Oct (10:05 AM ET): "this should be guided ... i click next, and then the first step happens, catheter in ... and
// then it steps through them one by one as i click next", and there was no catheter to see.
test('presented, Next drives it: the first Next starts it, each Next plays a step, then the slide moves on; the steps are progress only', async () => {

  const pz = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  const next = pz.match(/const next = \(\) => \{[\s\S]*?\n {2}\};/)[0];
  assert.ok(next.indexOf('procNext()') > 0 && next.indexOf('procNext()') < next.indexOf('go(want + 1)'), 'a procedure step comes before the next slide');
  assert.match(pz, /const prev = \(\) => \{ if \(procBack\(\)\) return;/);
  const pn = pz.match(/const procNext = \(\) => \{[\s\S]*?\n {2}\};/)[0];
  assert.match(pn, /if \(procRun\) return procRun\.next\(\);/);
  assert.match(pn, /procDoneAt === want/, 'once played through, Next moves on');
  assert.match(pn, /procPlay\(s, want, 0\);\n\s+return true;/, 'the first Next puts the catheter in');
  const el = pz.match(/function procEl\([\s\S]*?\n {2}\}/)[0];
  assert.doesNotMatch(el, /onclick|'button'/, 'the steps are not buttons');
  assert.match(pz, /stopLapse\(\); procStop\(\); abSlow\(\); handOn = false; procDoneAt = done && s\.procedure \? to : -1;/, 'a new slide starts it afresh (back onto it, it is done)');
  // The steps are a line of the slides' own numbered circles, not pills.
  assert.match(el, /class: 'pz-step'/); assert.doesNotMatch(el, /pz-abb/);
  // Going forward, the slide opens on its state before the procedure (the worker's before), its words on the state after.
  assert.match(pz, /const own = lap \? \(await stateReady\(stateOf\[to\]\)\)\?\.start \|\| null : pre \? \(await stateReady\(to\)\)\?\.before \|\| null : null;/);
  assert.match(pz, /before: s\.procedure \? PROCS\[s\.procedure\.kind \|\| s\.procedure\]\?\.before : undefined/);
  const wk = readFileSync(new URL('../src/worker-core.js', import.meta.url), 'utf8');
  assert.match(wk, /if \(st\.before\) \{\n\s+const b = new Engine\(\); b\.restore\(e\.snapshot\(\)\); b\.setParams\(deepMerge\(b\.params, st\.before\)\); b\.settle\(\);/);
  for (const k of PROC_KINDS) assert.ok(PROCS[k].before && PROCS[k].had(PROCS[k].apply({})) && !PROCS[k].had(structuredClone(PROCS[k].before)), `${k}: before undoes it`);
  // A catheter you can see: half the narrowest vein, a dark rim, a balloon wall to wall, and a close shot that follows the tip.
  assert.match(st, /cath\.rc = r\.parts \? procRc\(r, Rf\) :/);
  // (one caliber for all three, the TIPS one: his ask, 29 Oct, the BRTO catheter was hair thin)
  assert.match(st, /if \(E\.RHV_IVC\) for \(let f = 0\.2; f <= 1\.001; f \+= 0\.1\) t = Math\.min\(t, cathRadOf\('RHV_IVC', f\)\);/);
  assert.match(st, /return Math\.max\(0\.5, Math\.min\(t \* 0\.5, m \* 0\.85\)\);/);
  assert.match(st, /const PROC_K_TIP = 8;/);
  // A step callout keeps clear of every vessel on a short leader, at its own point, on a vessel not drawn yet too (the tract).
  assert.match(st, /const tidy = \(lv \|\| m\.pin\) && !dop\.all \?/);
  assert.match(st, /const segAt = m\.f \?\? /);
  assert.match(st, /m\.ghost && geo\[m\.edges\[0\]\]\?\.cur\?\.length/);
  assert.match(st, /if \(r\.parts\) shaftPart\(0, rc \* 1\.45, 0, \[0\.06, 0\.08, 0\.14\], 0\.9\);/);
  assert.match(st, /r\.parts \? Math\.max\(rc \* 1\.35, Rb\) : rc \* 1\.35/);
  assert.match(st, /const PROC_K_MAX = 5;/);
  assert.match(st, /if \(r\.parts\) \{\n\s+const tq = cathAt\(r, Math\.max\(tipD, procIn\(r\)\)\)\.p/, 'the view follows the tip in');
});

test('a TIPS is placed step by step only where a slide teaches the placement; elsewhere it is simply there', () => {
  const guided = new Set();
  for (const d of DECKS) for (const s of d.slides) if (s.procedure === 'tips') guided.add(`${d.id}/${s.id}`);
  assert.deepEqual([...guided].sort(), ['gastric-varices/tips', 'shunts/play', 'ten-years/tips', 'variceal-bleed/tips']);
  for (const d of DECKS) {
    assert.ok(d.slides.filter((s) => s.procedure === 'tips').length <= 1, `${d.id}: one guided TIPS at most`);
    for (const s of d.slides) if (s.procedure) assert.ok(!s.lapse && !s.cath && !s.question, `${d.id}/${s.id}: no time-lapse, catheter or question with it`);
  }
});

// His ask, 29 Oct: "the callout should show up AFTER the step happens". Each step's callout comes once its step has played.
test("a step's callout comes only once its step has happened", () => {
  for (const k of PROC_KINDS) {
    const P = PROCS[k];
    P.stops.forEach((x, i) => {
      const a = markAt(k, i), from = i ? P.stops[i - 1] : 0;
      assert.ok(a > from && a <= x, `${k} step ${i}: its callout at ${a} ms, inside the step and at its end`);
      if (i < P.stops.length - 1) assert.equal(a, x, `${k} step ${i}: at its stop, where the step has played`);
    });
    assert.ok(markAt(k, P.stops.length - 1) >= P.T.apply, `${k}: the last callout once the change is made`);
  }
  const pa = readFileSync(new URL('../src/ui/proc-anim.js', import.meta.url), 'utf8');
  assert.match(pa, /const mk = f\.step < 0 \? -2 : t >= markAt\(kind, f\.step\) \? f\.step : -1;/);
  // (and it keeps off the catheter, its balloon and the part it names, which the vessels' lines do not hold)
  const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(st, /const av = m\.pin \? pinAvoid\(m\.edges\[0\]\) : undefined;/);
});
