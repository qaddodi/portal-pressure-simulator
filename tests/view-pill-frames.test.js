// The view pill never leaves the screen or blinks into and out of the sinusoid (17 Oct, Mohammad on 7da46e6: "going from lobule
// to sinusoid the pill flashes off and then on ... going from sinusoid to lobule the pill disappears completely then reappears
// by folding out and glides up"). Every frame of both moves is stepped through here, in the order main.js sinMotion runs them,
// at 60 and 120 Hz and under an interface zoom: the pill is drawn on its own path from where it was to where it rests, in view
// and whole all the way, and its fold never hides the buttons that stay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { easeIO3, glideShift, foldPlan, FOLD_EASE } from '../src/ui/pill-motion.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const main = read('../src/ui/main.js');
const css = read('../styles/app.css');
const fn = (name) => main.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`))[1];

// A phone 844 px high: the dock's top rests at 700 (144 px tall with its 12 px gap below); the pill is 42 px tall, 8 px above it.
const H = 844, DOCK = 700, PILL = 42, GAP = 12, OFF = H - DOCK + 24;
const PILL_IN = +main.match(/PILL_IN = (\d+)/)[1], PILL_OUT = +main.match(/PILL_OUT = (\d+)/)[1];
const lobuleRest = (dock) => DOCK + dock - 8 - PILL / 2;            // above the dock, riding on it
const sinRest = (botOcc) => H - (botOcc + 8) - PILL / 2;            // the sinusoid view's home: bottom: calc(--bot-occ + 8px)

// The frames of one move, as sinMotion draws them: the space is published first (publishNow), the dock placed, then the pill's
// box read (its resting place, its shift and the dock's slide in it) and its new shift written. Returns each frame's pill centre
// on screen and the dock's top. (publishFirst false: the order before the fix, for contrast.)
function play({ into, hz, z, publishFirst = true }) {
  const ms = into ? PILL_IN : PILL_OUT, frames = [];
  const from = into ? lobuleRest(0) : sinRest(GAP);
  let botOcc = into ? H - DOCK + 8 + PILL + GAP : GAP, pending = into, shift = 0;   // (into: the space with the dock gone is still to publish)
  for (let n = 0; ; n++) {
    const u = Math.min(1, (n * 1000 / hz) / ms), e = easeIO3(u);
    if (pending && n > 0 && publishFirst) { botOcc = GAP; pending = false; }
    const dock = into ? OFF * e : OFF * (1 - e);                    // (into: sliding away, out: rising from past the foot)
    const rest = into ? sinRest(botOcc) : lobuleRest(0), slide = into ? 0 : dock;
    const at = rest + slide + shift * z;                             // where its box is drawn now (getBoundingClientRect)
    shift = u >= 1 ? 0 : glideShift(at, shift, z, slide, from, 1 - e).shift;
    if (pending && n > 0 && !publishFirst) { botOcc = GAP; pending = false; }   // (published after the pill's frame, before the paint)
    const drawn = (into ? sinRest(botOcc) : lobuleRest(0)) + slide + shift * z;   // (as painted: its box where the space put it)
    frames.push({ u, e, drawn, dockTop: DOCK + dock, want: from + ((into ? sinRest(GAP) : lobuleRest(0)) - from) * e });
    if (u >= 1) return frames;
  }
}

for (const into of [true, false]) {
  for (const hz of [60, 120]) {
    for (const z of [1, 1.25]) {
      test(`${into ? 'into' : 'out of'} the sinusoid at ${hz} Hz, zoom ${z}: the pill glides on its own path, in view every frame`, () => {
        const f = play({ into, hz, z });
        for (const [i, fr] of f.entries()) {
          assert.ok(Math.abs(fr.drawn - fr.want) < 1e-6, `frame ${i}: drawn at ${fr.drawn.toFixed(1)}, its path is at ${fr.want.toFixed(1)}`);
          assert.ok(fr.drawn - PILL / 2 >= 0 && fr.drawn + PILL / 2 <= H - 8, `frame ${i}: whole on the screen`);
          if (!into) assert.ok(fr.drawn + PILL / 2 <= fr.dockTop - 8 + 1e-6, `frame ${i}: above the rising dock`);
          if (i) assert.ok(Math.abs(fr.drawn - f[i - 1].drawn) < 40 * 60 / hz, `frame ${i}: no jump`);
        }
        assert.equal(f[0].drawn, into ? lobuleRest(0) : sinRest(GAP), 'it starts where it was');
        assert.equal(f.at(-1).drawn, into ? sinRest(GAP) : lobuleRest(0), 'and lands where it rests, as the zoom lands');
      });
    }
  }
}

test('the two faults Mohammad saw, reproduced: without them taken off, the pill left the screen or jumped', () => {
  // Out of the sinusoid, leaving the dock's slide in drew the pill on the dock, past the screen's foot, until the dock rose.
  const z = 1, from = sinRest(GAP), rest = lobuleRest(0);
  const old = (dock, k) => (from - rest) * k;                        // (the shift 7da46e6 wrote: its resting place less only its own shift)
  assert.ok(rest + OFF + old(OFF, 1) * z - PILL / 2 > H, 'drawn off the screen at the start');
  assert.equal(rest + OFF + glideShift(rest + OFF, 0, z, OFF, from, 1).shift * z, from, 'now drawn where it was');
  // Into the sinusoid, the space was published after the pill's frame: one frame drawn against the old space, then a jump.
  const late = play({ into: true, hz: 60, z: 1, publishFirst: false });
  assert.ok(late.some((fr) => Math.abs(fr.drawn - fr.want) > 50), 'the old order drew a frame far off its path');
});

test('nothing hides or rebuilds the pill on the way: it is moved, whole, in one task, and only moved', () => {
  const change = fn('pillChange'), m = fn('sinMotion');
  // Moved to its new home straight after the buttons change, before anything is drawn (never a frame homeless or in a hidden home).
  assert.match(change, /change\(\);\n {2}syncThumb\(\);/);
  assert.match(main, /if \(home && seg\.parentElement !== home\) \{ if \(pres\) stopFold\(\); home\.append\(seg\); \}/, 'the same element, moved');
  for (const body of [change, m]) assert.doesNotMatch(body, /opacity|visibility|\.hidden =|display|innerHTML|cloneNode|replaceWith|remove\(\)/, 'the pill itself is only moved');
  assert.ok(m.includes('if (now > t0) publishNow();') && m.includes('vd.style.translate = u >= 1'));
  assert.ok(m.indexOf('if (now > t0) publishNow();') < m.indexOf('vd.style.translate = u >= 1') && m.indexOf('if (now > t0) publishNow();') < m.indexOf('el.getBoundingClientRect()'), 'the space first');
  assert.match(main, /publishNow = \(\) => \{ if \(pubRaf\) \{ cancelFrame\(pubRaf\); publish\(\); \} \};/);
  // The sinusoid view's rules hide the dock and the pill's old home, never the pill or its new home: only Anatomy and Circuit.
  for (const rule of css.match(/[^{}]*#app\.sin-focus[^{}]*\{[^{}]*(display: none|opacity: 0|visibility: hidden)[^{}]*\}/g)) {
    const sel = rule.split('{')[0];
    assert.doesNotMatch(sel.replace(/#viewSeg \[data-view="(anatomic|circuit)"\]/g, ''), /#viewSeg|\.sin-views|#sinViews/, sel.trim());
  }
  assert.match(css, /#app\.sin-focus:not\(\.presenting\) \.sin-views \{ display: flex;/);
});

// cubic-bezier(x1, y1, x2, y2) as a function of time, for the fold's own curve.
const bezier = (x1, y1, x2, y2) => (t) => {
  const c = (a, b, s) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (c(x1, x2, mid) < t) lo = mid; else hi = mid; }
  return c(y1, y2, (lo + hi) / 2);
};

test('every frame of the fold keeps the buttons that stay whole and opaque inside the face, both ways', () => {
  const ease = bezier(...FOLD_EASE.match(/[\d.]+/g).map(Number));
  const ORDER = ['circuit', 'anatomic', 'lobule', 'sinusoid'], Wd = { circuit: 70, anatomic: 80, lobule: 66, sinusoid: 86 }, PAD = 6;
  const lay = (keys) => {
    const inner = keys.reduce((s, k) => s + Wd[k], 0) + 2 * (keys.length - 1);
    let x = -inner / 2;
    return { btns: keys.map((key) => { const e = { key, l: x, r: x + Wd[key], o: 1 }; x += Wd[key] + 2; return e; }), w: inner + 2 * PAD };
  };
  for (const [a, b] of [[ORDER, ['lobule', 'sinusoid']], [['lobule', 'sinusoid'], ORDER], [['circuit', 'anatomic', 'lobule'], ORDER], [ORDER, ['circuit', 'anatomic', 'lobule']]]) {
    const before = lay(a), after = lay(b), plan = foldPlan(before.btns, after.btns, ORDER);
    for (let t = 0; t <= 1.0001; t += 1 / 50) {
      const e = ease(Math.min(1, t)), half = (before.w + (after.w - before.w) * e) / 2;
      assert.ok(half * 2 >= Math.min(before.w, after.w) - 1e-9, 'the face never shrinks past its end');
      for (const [k, p] of plan) {
        if (p.kind !== 'stay') continue;
        const rest = after.btns.find((x) => x.key === k), dx = p.dx0 + (p.dx1 - p.dx0) * e;
        assert.ok(rest.l + dx >= -half + PAD - 1e-6 && rest.r + dx <= half - PAD + 1e-6, `${a.join('+')} → ${b.join('+')}: ${k} inside the face at ${t.toFixed(2)}`);
        assert.equal(p.o0, 1); assert.equal(p.o1, 1);
      }
    }
  }
});
