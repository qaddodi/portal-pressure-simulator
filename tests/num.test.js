// num.js (unification audit 17 and 19, 13 Nov 2026): the app's number text and shaping in one pure module. These are its outputs, byte for
// byte as the copies it replaced printed them: fmt's true minus and no "−0", minusFixed's "−0.0" kept for the chart tools, and the shapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmt, NOT_SHOWN, minusFixed, fix1, round1 } from '../src/ui/num.js';

// (The copies num.js replaced, as they were written: util.js fmt without its cache, and the chart tools' signed text.)
const oldFmt = (v, d = 1) => { if (v == null || !Number.isFinite(v)) return '—'; const t = v.toFixed(d); return /^-0(\.0+)?$/.test(t) ? t.slice(1) : t.replace('-', '−'); };
const oldTool = (v, d) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

test('fmt: a true minus (U+2212), never "−0", the dash for no number, and the same text again from its cache', () => {
  assert.equal(fmt(-3.25, 1), '−' + (3.25).toFixed(1));
  assert.equal(fmt(-1.5, 1), '−1.5');
  assert.ok(!fmt(-1.5, 1).includes('-'), 'no hyphen-minus');
  assert.equal(fmt(-0.04, 1), '0.0');
  assert.equal(fmt(-0, 1), '0.0');
  assert.equal(fmt(-0.4, 0), '0');
  assert.equal(fmt(-0.0004, 3), '0.000');
  assert.equal(fmt(12.34), '12.3');
  for (const v of [null, undefined, NaN, Infinity, -Infinity]) assert.equal(fmt(v, 1), NOT_SHOWN);
  assert.equal(NOT_SHOWN, '—');
  const r = rng(3);
  for (let i = 0; i < 20000; i++) {
    const v = (r() - 0.5) * 400, d = i % 4;
    assert.equal(fmt(v, d), oldFmt(v, d), `${v} ${d}`);
    assert.equal(fmt(v, d), oldFmt(v, d), `${v} ${d} (cached)`);
  }
  for (const v of [-0.05, -0.049, 0.05, -0.15, 1e21, -1e21]) for (let d = 0; d <= 5; d++) assert.equal(fmt(v, d), oldFmt(v, d), `${v} ${d}`);
});

test('minusFixed: the chart tools\' text, a true minus for any value below zero, "−0.0" for a small negative, toFixed\'s own for no number', () => {
  assert.equal(minusFixed(-0.04, 1), '−0.0');
  assert.equal(minusFixed(-0, 1), '0.0');
  assert.equal(minusFixed(-2.5, 0), '−' + (2.5).toFixed(0));
  assert.equal(minusFixed(NaN, 1), 'NaN');
  assert.equal(minusFixed(-Infinity, 1), '−Infinity');
  const r = rng(5);
  for (let i = 0; i < 20000; i++) { const v = (r() - 0.5) * 200, d = i % 3; assert.equal(minusFixed(v, d), oldTool(v, d)); }
});

test('fix1 and round1 stay toFixed(1) below zero, where the table does not reach (a hyphen-minus, as toFixed writes it)', () => {
  assert.equal(fix1(-1.25), (-1.25).toFixed(1));
  assert.equal(fix1(-0.04), '-0.0');
  assert.ok(Object.is(round1(-0.04), -0));
});
