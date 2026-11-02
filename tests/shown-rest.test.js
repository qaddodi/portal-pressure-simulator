// Heat, 31 Oct (laptop heat, H1): a running model never rests, so a follower that lands only within `eps` of its target (a few thousandths)
// was on its way on nearly every display frame, and every surface that repaints from it drew at the screen's rate for nothing (a bar's
// sub-pixel writes, the Pressure chart's whole canvas). A follower lands once both its stages are within `small` of the target, `small` being
// what the screen cannot show; the Pressure chart's glide counts only the stations it draws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './dom-shim.js';
import { createShownState, createFollow, FILL_SMALL, fillQ } from '../src/ui/display-state.js';
import { createEaser } from '../src/ui/util.js';
import { createCore } from '../src/worker-core.js';
import { NODES } from '../src/engine/topology.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
function sched() {
  let cb = null;
  return { ask: (f) => { cb = f; return 1; }, run(t) { const f = cb; cb = null; f?.(t); }, get asked() { return !!cb; } };
}

test('a follower on its way lands once both stages are within small of the target, and a target that moves by under small asks for nothing', () => {
  const s = sched(), S = createShownState({ ask: s.ask, now: () => 0 });
  const o = { small: 0.05, eps: 0.005 };
  S.set('k', 10, o);
  S.set('k', 12, o);            // (a real step: it follows)
  assert.ok(s.asked && S.moving);
  let t = 0, frames = 0;
  while (s.asked && frames < 600) { s.run(t += 1000 / 120); frames++; }
  assert.equal(S.get('k'), 12, 'lands exactly on the target');
  assert.ok(frames < 180, `landed in ${frames} frames`);
  // (A wobble of under small around where it rests: shown at once each time, no frame asked.)
  for (let i = 0; i < 50; i++) { S.set('k', 12 + (i % 2 ? 0.02 : -0.02), o); assert.equal(s.asked, false); }
});

test('one follower lands within small too, on the step and while it moves', () => {
  const f = createFollow({ small: 0.05, eps: 0.005 });
  f.step(5, 0.008);
  assert.equal(f.step(5.04, 0.008), 5.04);
  assert.equal(f.moving, false);
  f.step(8, 0.008);
  assert.equal(f.moving, true);
  let n = 0;
  while (f.moving && n < 600) { f.step(8, 0.008); n++; }
  assert.equal(f.value, 8);
  assert.ok(n < 200, `landed in ${n} frames`);
});

test('an easer lands within small, counts only the values it is told to watch, and with small 0 is as it was', () => {
  const real = performance.now.bind(performance);
  let clock = 1000; performance.now = () => clock;
  try {
    const run = (e, targets, watch) => {
      let moving = 0;
      e.step(targets(0), watch);
      for (let i = 1; i <= 240; i++) { clock += 1000 / 120; if (e.step(targets(i), watch).moving) moving++; }
      return moving;
    };
    // (A value that swings by half a unit every model frame (10 Hz) beside one that holds: the easer is under way while it swings, unless it is not watched.)
    const wobble = (i) => [Math.round(i / 12) % 2 ? 90.5 : 90, 11.5];
    assert.ok(run(createEaser(undefined, { small: 0.05 }), wobble) > 100, 'unwatched wobble keeps it moving');
    assert.equal(run(createEaser(undefined, { small: 0.05 }), wobble, Uint8Array.from([0, 1])), 0, 'a value that is not drawn never keeps it moving');
    const e = createEaser(undefined, { small: 0.05 });
    e.step([90, 11.5], Uint8Array.from([0, 1]));
    assert.equal(e.step([91, 11.5], Uint8Array.from([0, 1])).v[0], 91, 'and is taken at once');
    // small 0 (the lobule's ladder, as it was): it follows to the target and lands on it.
    const z = createEaser();
    z.step([0]);
    clock += 100; z.step([10]);
    let r;
    for (let i = 0; i < 600; i++) { clock += 1000 / 120; r = z.step([10]); if (!r.moving) break; }
    assert.equal(r.v[0], 10);
    assert.equal(r.moving, false);
  } finally { performance.now = real; }
});

// The real engine, a few seconds of its frames: with the model running and nothing touched, the Pressure chart's easer (small 0.05) and the
// bar's followers must be at rest on nearly every display frame. (Before: the chart's, on 99 % of them, because the aorta's and the hepatic
// artery's beat-filtered pressures, which it never draws, move by tenths of a mmHg from one model frame to the next.)
async function modelFrames(preset, ms) {
  const out = [];
  const core = createCore((m) => { if (m.type === 'frame' && m.samples?.t.length) out.push({ at: performance.now(), f: m }); });
  await core.handle({ type: 'preset', id: preset });
  core.handle({ type: 'run', running: true });
  const t0 = Date.now();
  while (Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 50));
  core.dispose();
  return out;
}
const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const PATH = ['INT', 'CONF', 'RPV', 'SIN_R', 'CV_R', 'RHV', 'IVCS', 'RA'];

test('under a steady running model the Pressure chart rests, though the arterial pressures do not', async () => {
  const fr = await modelFrames('cirr-decomp', 4500);
  assert.ok(fr.length > 25, `${fr.length} model frames`);
  const settled = fr.slice(10);
  const arterial = settled.slice(1).filter((x, i) => Math.abs(x.f.Pf[NI.AO] - settled[i].f.Pf[NI.AO]) > 0.05).length;
  assert.ok(arterial > settled.length / 2, 'the arterial pressure moves by more than the chart prints from frame to frame (what kept it going)');
  const mask = new Uint8Array(NODES.length); for (const n of PATH) mask[NI[n]] = 1;
  const real = performance.now.bind(performance);
  let clock = 0; performance.now = () => clock;
  try {
    const rate = (watch) => {
      const e = createEaser(undefined, { small: 0.1, jumps: true });
      let fi = 0, moving = 0, total = 0, was = false;
      for (let t = settled[0].at; t < settled.at(-1).at; t += 1000 / 120) {
        clock = t;
        let fresh = null;
        while (fi < settled.length && settled[fi].at <= t) fresh = settled[fi++].f.Pf;
        if (!fresh && !was) { total++; continue; }
        const r = e.step(fresh ? Array.from(fresh) : e.last, watch);
        was = r.moving; if (r.moving) moving++; total++;
        e.last = Array.from(fresh || e.last);
      }
      return moving / total;
    };
    assert.ok(rate(null) > 0.5, 'without the mask the glide never rests (the bug)');
    assert.ok(rate(mask) < 0.1, `with the drawn stations only it rests (moving ${(rate(mask) * 100).toFixed(0)} % of display frames)`);
  } finally { performance.now = real; }
});

test('the bar and the Readouts pane land, quantise their writes, and repaint only the tiles that moved', () => {
  const dock = read('../src/ui/dock.js'), pane = read('../src/ui/readouts-pane.js'), charts = read('../src/ui/charts.js');
  for (const [name, src] of [['dock.js', dock], ['readouts-pane.js', pane]]) {
    // (The bar writes its options into one kept object, the pane makes its own: either way the number lands within one step of its last digit.)
    assert.match(src, name === 'dock.js' ? /const followOpts = \(d, snap\) => \{ FOLLOW\.snap = snap; FOLLOW\.small = Math\.pow\(10, -d\); FOLLOW\.eps = 0\.05 \* FOLLOW\.small; return FOLLOW; \};/ : /const followOpts = \(d, snap\) => \(\{ snap, small: Math\.pow\(10, -d\), eps: 0\.05 \* Math\.pow\(10, -d\) \}\);/, `${name}: a number lands within one step of its last digit`);
    assert.match(src, name === 'dock.js' ? /o\.small = FILL_SMALL \* r; o\.eps = 0\.0005 \* r;/ : /small: FILL_SMALL \* r, eps: 0\.0005 \* r, across: true/, `${name}: a bar lands within what the screen cannot show`);
    assert.match(src, /fl = fillQ\(Math\.min\(w, o\) \/ 100\), fw = fillQ\(Math\.abs\(w - o\) \/ 100\)/, `${name}: the fill's writes are quantised`);
    assert.match(src, name === 'dock.js' ? /if \(follow\) \{ const fv = shownState\.or\(x\.kFill, null\); if \(x\.fkOn && x\.fkV === v && x\.fkF === fv\) continue; x\.fkOn = true; x\.fkV = v; x\.fkF = fv; \} else x\.fkOn = false;/ : /if \(follow\) \{ const fk = `\$\{[^`]*`; if \(fk === x\.followKey\) continue; x\.followKey = fk; \} else x\.followKey = null;/, `${name}: a display frame skips a tile whose shown values have not moved`);
  }
  assert.match(charts, /easeP\.step\(src, drawnMask\(curPath\(\)\)\)/, 'the chart watches the stations it draws');
  assert.match(charts, /for \(const n of \[\.\.\.path\.nodes, \.\.\.STRIP\]\) if \(!ARTERIAL\.has\(n\)/, 'and never an arterial one');
  assert.ok(FILL_SMALL > 0 && FILL_SMALL <= 0.0075, 'a bar lands inside about a pixel of its track');
  assert.equal(fillQ(0), 0); assert.equal(fillQ(1), 1);
  assert.ok(Math.abs(fillQ(0.3333) - 0.3333) < 1 / 4096);
});
