// The view pill never leaves the screen or blinks into and out of the sinusoid (17 Oct, Mohammad on 7da46e6: "going from lobule
// to sinusoid the pill flashes off and then on"). Since 2 Nov the sinusoid view keeps the dock (Mohammad: "keep the timeline even in
// sinusoid view; instead of having the pause button up"), so the pill stays in its home above it and only folds: every frame of the
// fold is stepped through here, both ways, and nothing hides the pill, its home or the dock on the way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { foldPlan, FOLD_EASE } from '../src/ui/pill-motion.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const main = read('../src/ui/main.js');
const css = read('../styles/app.css');
const fn = (name) => main.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`))[1];

test('nothing hides or rebuilds the pill on the way: it stays in its home above the dock and only folds, in one task', () => {
  const change = fn('pillChange');
  assert.match(change, /change\(\);\n {2}syncThumb\(\);/);
  assert.doesNotMatch(change, /opacity|visibility|\.hidden =|display|innerHTML|cloneNode|replaceWith|remove\(\)|transform|translate/, 'the pill itself is only folded');
  assert.doesNotMatch(main, /function sinMotion|vd-out|sinViews/, 'no slide away of the dock, no second home for the pill');
  // The sinusoid view's rules hide Anatomy and Circuit, never the pill, its home or the dock.
  for (const rule of css.match(/[^{}]*#app\.sin-focus[^{}]*\{[^{}]*(display: none|opacity: 0|visibility: hidden)[^{}]*\}/g)) {
    const sel = rule.split('{')[0];
    assert.doesNotMatch(sel.replace(/#viewSeg \[data-view="(anatomic|circuit)"\]/g, ''), /#viewSeg|\.nb-views|#nbViews|#vdock|\.vdock|#timeline|#strip|\.readouts/, sel.trim());
  }
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
