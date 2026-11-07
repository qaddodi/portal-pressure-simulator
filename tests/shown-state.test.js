// Premium-feel R4: one shown state for every number and trace (display-state.js createShownState, createFollow). A model frame sets
// each reading's target and every display frame steps the shown value on the widths' filter (follow2, tau 0.2 s); a small step at rest
// is shown at once (a steady model costs no frames), and a jump of the model (noteJump) is never blended into the state before it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createShownState, createFollow, noteJump, SHOWN_TAU } from '../src/ui/display-state.js';
import { tenthGap } from '../src/engine/gap.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
// A scheduler the test drives: ask() keeps the one callback asked for; run(t) runs it at time t.
function sched() {
  let cb = null;
  return { ask: (f) => { cb = f; return 1; }, run(t) { const f = cb; cb = null; f?.(t); }, get asked() { return !!cb; } };
}

test('a small step at rest is shown at once and asks for no frame', () => {
  const s = sched(), S = createShownState({ ask: s.ask, now: () => 0 });
  assert.equal(S.set('k', 10, { small: 0.05 }), 10);
  assert.equal(S.set('k', 10.04, { small: 0.05 }), 10.04);
  assert.equal(s.asked, false);
  assert.equal(S.moving, false);
});

test('a larger step follows over frames, the same curve at 60 or 120 Hz, and lands exactly', () => {
  const run = (hz) => {
    const s = sched(), S = createShownState({ ask: s.ask, now: () => 0 });
    S.set('k', 0); S.set('k', 10, { small: 0.05, eps: 0.005 });
    assert.equal(S.get('k'), 0, 'nothing jumps on the model frame');
    const at = {};
    for (let i = 1; s.asked; i++) { const t = (i * 1000) / hz; s.run(t); if (Math.abs(t - 200) < 1e-6) at[200] = S.get('k'); }
    return { at, end: S.get('k') };
  };
  const a = run(60), b = run(120);
  assert.equal(a.end, 10); assert.equal(b.end, 10);
  // (Critically damped two stages, tau 0.2 s: after one tau the shown value is 1 − 2/e of the way.)
  const want = 10 * (1 - 2 / Math.E);
  for (const r of [a, b]) assert.ok(Math.abs(r.at[200] - want) < 0.05, `${r.at[200]} vs ${want}`);
  assert.equal(SHOWN_TAU, 0.2);
});

test('a jump of the model is taken at once; a bar length glides across it', () => {
  const s = sched(), S = createShownState({ ask: s.ask, now: () => 0 });
  S.set('n', 0); S.set('bar', 0, { across: true });
  S.set('n', 10); S.set('bar', 10, { across: true });
  s.run(16);
  const nMid = S.get('n'), bMid = S.get('bar');
  assert.ok(nMid > 0 && nMid < 10 && bMid > 0 && bMid < 10);
  noteJump();
  assert.equal(S.set('n', 20), 20, 'the number takes the jumped state at once');
  assert.notEqual(S.set('bar', 20, { across: true }), 20, 'the bar keeps gliding');
  s.run(32);
  assert.equal(S.get('n'), 20);
  assert.ok(S.get('bar') < 20);
});

test('a gradient drawn from its two shown ends always reads as their difference', () => {
  const s = sched(), S = createShownState({ ask: s.ask, now: () => 0 });
  S.set('whvp', 14); S.set('fhvp', 6);
  S.set('whvp', 22); S.set('fhvp', 7);
  for (let t = 16; s.asked; t += 16) {
    s.run(t);
    const w = S.get('whvp'), f = S.get('fhvp');
    assert.equal(tenthGap(w, f, null), Math.round((Math.round(w * 10) / 10 - Math.round(f * 10) / 10) * 10) / 10);
  }
  assert.equal(tenthGap(S.get('whvp'), S.get('fhvp'), null), 15);
});

test('one follower: snaps when told, on a jump, and when not finite', () => {
  const f = createFollow({ small: 0.05 });
  assert.equal(f.step(5, 0.016), 5);
  const v = f.step(8, 0.016);
  assert.ok(v > 5 && v < 8 && f.moving);
  assert.equal(f.step(8, 0.016, true), 8);
  f.step(12, 0.016);
  noteJump();
  assert.equal(f.step(3, 0.016), 3);
  assert.ok(Number.isNaN(f.step(NaN, 0.016)));
});

test('the bar, the Readouts tab, the charts and the instruments read the one shown state', () => {
  const dock = read('../src/ui/dock.js'), pane = read('../src/ui/readouts-pane.js'), main = read('../src/ui/main.js'), worker = read('../src/worker-core.js');
  assert.match(dock, /shownState\.set\(x\.kBar, v, followOpts\(t\.d, !eased\)\)/);
  assert.match(dock, /shownState\.on\(\(\) => \{ if \(frame\) paintStrip\(frame, true\); \}\)/);
  assert.match(dock, /gap\.hvpg = tenthGap\(sm\.whvp, sm\.fhvp, null\); gap\.ppg = tenthGap\(sm\.pv, sm\.ivc, null\);/);
  assert.match(pane, /shownState\.set\('rp:' \+ t\.id, v, followOpts\(t\.d, !eased\)\)/);
  assert.match(read('../styles/app.css'), /\.rb-fill \{[^}]*transition: opacity var\(--d-small\) var\(--ease\);/, 'it fades; its colour is taken at once (1 Nov 2026, move everything to GPU: a colour, shadow or edge eased repaints every frame, so it is taken at once)');
  assert.match(main, /if \(jumpSeen\) \{ jumpSeen = false; noteJump\(\); \}/);
  assert.match(worker, /jump: jumpDirty \|\| clock !== postedClock/);
  assert.match(worker, /function stateChanged\(replaced = true\) \{[^}]*jumpDirty = true;/);
  assert.match(read('../src/ui/util.js'), /const r = follow2\(v\[i\], w\[i\], T, dt, tau, eps\)/);
  assert.match(read('../src/ui/tool-profile.js'), /follow2\(shown\.v\[i\], shownW\.v\[i\], goal\.v\[i\], dt, SHOWN_TAU, 0\.005\)/);
  assert.match(read('../src/ui/tool-hvpg.js'), /follow2\(cur\[key\], curW\[key\], target\[key\], dt, SHOWN_TAU, 0\.02\)/);
  assert.match(read('../src/ui/fibroscan.js'), /shown = kShown\.step\(model, dt, REDUCED_MQ\.matches \|\| isPaused\(\)\)/);
  assert.match(read('../src/ui/doppler.js'), /mean = velShown\.step\(mean, dt, velProbe !== probe \|\| !frame\?\.running\)/);
  assert.match(read('../src/ui/pressure-time.js'), /const hv = Math\.max\(0, shownOr\('hvpg', frame\.metrics\.hvpg\)\)/);
});
