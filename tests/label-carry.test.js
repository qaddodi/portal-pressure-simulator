// A presenter's small camera move keeps its labels (31 Oct, round2-recs § 6.4, his yes to the combined plan): the names ride with the
// figure as a slow push's do and only the leaders fade (lb-ride), back in once it lands. A move that is big, that changes what the labels
// show, or that has a layer of its own to move (callouts, a probe, a scan, a treatment) keeps the usual fade (cam-move).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

// carryable, run on its own source with the stage's state stubbed in.
const fnSrc = stage.match(/function carryable\(from, to\) \{[\s\S]*?\n {2}\}\n/)?.[0];
const base = () => ({
  store: { get: () => ({ presenting: true }) }, reduceMotion: { matches: false }, F: {}, solvedFor: { sig: 'S' }, camMove: false, pinchHide: false,
  cath: { st: null }, lobuleOn: false, lz: null, morph: 0, morphTarget: 0, diveT: 0, sites: { list: null }, scan: { on: false }, dpr: { on: false },
  E: {}, arcRoom: () => ({ vb: { w: 1000 } }), CARRY_ZOOM: 0.35, CARRY_PAN: 0.3, homeAt: { k: 1 }, labelSig: () => 'S',
});
const carryable = (over = {}, from = { k: 1, x: 0, y: 0 }, to = { k: 1.2, x: -30, y: 20 }) => {
  const env = { ...base(), ...over };
  return new Function(...Object.keys(env), `${fnSrc}\nreturn carryable;`)(...Object.values(env))(from, to);
};

test('a small move on a settled presenter slide carries its labels', () => {
  assert.ok(fnSrc, 'carryable is declared');
  assert.equal(carryable(), true);
  assert.equal(carryable({}, { k: 1, x: 0, y: 0 }, { k: 1, x: 250, y: 0 }), true, 'a pan of a quarter of the width on view');
});

test('only a presenter\'s move, and only where the labels lie as solved for what they show', () => {
  assert.equal(carryable({ store: { get: () => ({ presenting: false }) } }), false, 'Explore keeps its own ways');
  assert.equal(carryable({ reduceMotion: { matches: true } }), false, 'reduced motion: the short plain glide');
  assert.equal(carryable({ F: null }), false);
  assert.equal(carryable({ solvedFor: null }), false, 'nothing solved yet');
  assert.equal(carryable({ camMove: true }), false, 'labels already hidden by an earlier move');
  assert.equal(carryable({ pinchHide: true }), false);
  assert.equal(carryable({ labelSig: () => 'T' }), false, 'what the labels show has changed since they were solved');
});

test('callouts, probes, scans, treatments, the lobule, the circuit morph and the dive keep the fade', () => {
  assert.equal(carryable({ cath: { st: {} } }), false);
  assert.equal(carryable({ lobuleOn: true }), false);
  assert.equal(carryable({ lz: { isOpen: () => true } }), false);
  assert.equal(carryable({ morph: 0.4, morphTarget: 1 }), false);
  assert.equal(carryable({ diveT: 0.2 }), false);
  assert.equal(carryable({ sites: { list: [1] } }), false);
  assert.equal(carryable({ scan: { on: true } }), false);
  assert.equal(carryable({ dpr: { on: true } }), false);
  assert.equal(carryable({ E: { TIPS: { vis: true } } }), false);
  assert.equal(carryable({ E: { DIPS: { vis: true } } }), false);
});

test('a big move, or one across the zoom levels the labels turn on, keeps the fade', () => {
  assert.equal(carryable({}, { k: 1, x: 0, y: 0 }, { k: 1.5, x: 0, y: 0 }), false, 'a zoom of over 35 %');
  assert.equal(carryable({}, { k: 1.5, x: 0, y: 0 }, { k: 1, x: 0, y: 0 }), false);
  assert.equal(carryable({}, { k: 1, x: 0, y: 0 }, { k: 1, x: 310, y: 0 }), false, 'a pan of over 30 % of the width on view');
  assert.equal(carryable({ arcRoom: () => null }), false, 'no stage to measure');
  assert.equal(carryable({}, { k: 1.3, x: 0, y: 0 }, { k: 1.4, x: 0, y: 0 }), false, 'across 1.35x');
  assert.equal(carryable({}, { k: 1.2, x: 0, y: 0 }, { k: 1.4, x: 0, y: 0 }), false, 'across 1.3x home as well');
  assert.equal(carryable({ homeAt: { k: 0.9 } }, { k: 1.1, x: 0, y: 0 }, { k: 1.25, x: 0, y: 0 }), false, 'across 1.3x of a smaller home');
  assert.equal(carryable({ homeAt: null }, { k: 1.4, x: 0, y: 0 }, { k: 1.45, x: 0, y: 0 }), true, 'both ends past the levels: nothing crossed');
});

test('animateVT decides the carry after the arc, and a carry rides as a slow push does, without the fade', () => {
  const fn = stage.match(/function animateVT\(to, ms = 700, opt = \{\}\) \{[\s\S]*?\n {2}\}\n/)[0];
  assert.match(fn, /const carry = !drift && !arcRun && !sameView\(from, to\) && carryable\(from, to\);/);
  assert.ok(fn.indexOf('const carry =') > fn.indexOf('arcRun = { from, to, t0, ms, at }'), 'after the arc is known');
  assert.match(fn, /if \(carry\) \{ drifting = carrying = true; rideLeaders\(true\); \}\n\s+else if \(carrying\) \{ carrying = false; rideLeaders\(false\); \}/);
  assert.match(fn, /store\.get\(\)\.presenting && !drift && !carry && !sameView\(from, to\)\) \{ camMove = true;/, 'a carried move never fades the labels');
  assert.match(fn, /camSettle\(\); if \(drift \|\| carry\) driftEnd\(\); \}/, 'the landing hands the labels to the usual settle');
  assert.match(fn, /\(drift \? driftEase : easeInOut\)/, 'its pace is the presenter\'s, not a push\'s');
  assert.match(fn, /carry, zoom:/, 'the move log says which glides carried');
});

test('a carry ends with the move, and a change of what the labels show hands it to the fade', () => {
  assert.match(stage, /function driftEnd\(\) \{ if \(!drifting\) return; drifting = false; carrying = false; rideLeaders\(false\); labelSettleSoon\(\); \}/);
  const abort = stage.match(/function carryAbort\(\) \{[\s\S]*?\n {2}\}\n/)[0];
  assert.match(abort, /carrying = false; drifting = false; rideLeaders\(false\);/);
  assert.match(abort, /if \(!vtGliding\) return;/);
  assert.match(abort, /camMove = true; dpr\.carry = false; wrap\.classList\.add\('cam-move'\);/);
  assert.match(stage, /if \(carrying && solvedFor\?\.sig !== sig\) \{ carryAbort\(\); return; \}/);
  // (before the layout is solved for the new signature, so no new label is drawn part way through)
  assert.ok(stage.indexOf('if (carrying && solvedFor?.sig !== sig)') < stage.indexOf('const solve = !solvedFor || solvedFor.sig !== sig'));
});

test('carryAbort and driftEnd, run on their own source: the usual fade begins, or the leaders come back', () => {
  const abort = stage.match(/function carryAbort\(\) \{[\s\S]*?\n {2}\}\n/)[0];
  const end = stage.match(/function driftEnd\(\) \{[^\n]*\}\n/)[0];
  const run = (gliding) => {
    const cls = new Set(['lb-ride']);
    const env = { carrying: true, drifting: true, camMove: false, vtGliding: gliding, settled: 0, dpr: { carry: true },
      wrap: { classList: { add: (c) => cls.add(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) } } };
    const fn = new Function('env', `let carrying = env.carrying, drifting = env.drifting, camMove = env.camMove, vtGliding = env.vtGliding, dpr = env.dpr, wrap = env.wrap;
      const rideLeaders = (on) => wrap.classList.toggle('lb-ride', on); const labelSettleSoon = () => { env.settled++; };
      ${abort}\n${end}\n return { abort: carryAbort, end: driftEnd, get: () => ({ carrying, drifting, camMove }) };`)(env);
    return { fn, cls, env };
  };
  const a = run(true); a.fn.abort();
  assert.deepEqual(a.fn.get(), { carrying: false, drifting: false, camMove: true }, 'mid-move: the labels fade as a presenter\'s move always did');
  assert.ok(a.cls.has('cam-move') && !a.cls.has('lb-ride'));
  const b = run(false); b.fn.abort();
  assert.deepEqual(b.fn.get(), { carrying: false, drifting: false, camMove: false }, 'landed already: nothing fades');
  assert.ok(!b.cls.has('lb-ride') && !b.cls.has('cam-move'));
  const c = run(true); c.fn.end();
  assert.deepEqual(c.fn.get(), { carrying: false, drifting: false, camMove: false });
  assert.ok(!c.cls.has('lb-ride'));
  assert.equal(c.env.settled, 1, 'the labels are solved again for where the view stopped');
});

test('the leaders\' layer eases out while a move carries the labels; the names themselves are untouched', () => {
  assert.match(css, /\.lb-leaders \{ transition: opacity \.25s var\(--ease\); \}\n\.stage-view\.lb-ride \.lb-leaders \{ opacity: 0; \}/);
  assert.doesNotMatch(css, /lb-ride[^\n]*(#labels\b|#labelGl|lb-glass)/, 'only the leaders; the label layer and its glass stay');
  // (A presenter's other moves still fade the whole label layer.)
  assert.match(css, /\.stage-view\.cam-move > #labels, \.stage-view\.cam-move > #labelGl, \.stage-view\.cam-move \.lb-glass \{ opacity: 0; \}/);
});

test('the carry\'s class is a gesture\'s: no label is read again for it, no placed piece moves with it, and the stage\'s look is not dropped', () => {
  const keys = readFileSync(new URL('../src/ui/idle-keys.js', import.meta.url), 'utf8');
  assert.match(keys, /export const GESTURE_LOOK = new Set\(\[[^\]]*'lb-ride'\]\);/);
  assert.match(keys, /export const GESTURE_MOVE_FREE = new Set\(\[[^\]]*'lb-ride'\]\);/);
  assert.match(stage, /\(\?:panning\|stage-busy\|figure-focus\|lb-ride\)\(\?=/);
  // (It sets no custom property and styles nothing in the figure, only the opacity of the leaders' layer: frame-costs-glow.test.js reads every rule that names it.)
  for (const m of css.matchAll(/([^{}]*\.lb-ride\b[^{}]*)\{([^{}]*)\}/g)) {
    assert.doesNotMatch(m[2], /--[\w-]+\s*:/);
    assert.match(m[1], /\.lb-leaders/);
  }
});
