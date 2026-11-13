// num.js fix1 (fix-text.js until 13 Nov 2026): one-decimal text from a table of tenths. It must be exactly what toFixed(1) gives, for every number: the table only saves
// making a string for a tenth already met, and a number within an ulp of a half tenth (or below zero, or out of range) is made the long way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fix1, round1, tenths, printedKey } from '../src/ui/num.js';

// (A small deterministic generator: the same numbers each run.)
const rng = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

test('fix1 is toFixed(1) and round1 is +toFixed(1) for numbers across the range, at ties, and off the table', () => {
  const r = rng(7);
  const xs = [0, -0, 0.05, 0.15, 0.25, 0.35, 0.45, 0.95, 1.05, 2.675, 99.95, 1e4 - 0.05, 9999.95, 1e5, 123456.78, -0.04, -0.05, -3.25, NaN, Infinity];
  for (let i = 0; i < 20000; i++) xs.push(r() * 400, r() * 20, Math.round(r() * 4000) / 20, Math.round(r() * 4000) / 40);
  for (let k = 0; k < 3000; k++) for (const e of [-1e-9, 0, 1e-9, -1e-7, 1e-7]) xs.push(k / 10 + 0.05 + e);   // (the half tenths and their neighbours)
  for (const x of xs) {
    assert.equal(fix1(x), x.toFixed(1), `fix1(${x})`);
    assert.ok(Object.is(round1(x), +x.toFixed(1)) || (Number.isNaN(round1(x)) && Number.isNaN(+x.toFixed(1))), `round1(${x})`);
  }
});

test('tenths names the rounded tenth where plain rounding is certain, and -1 where it is not', () => {
  assert.equal(tenths(12.34), 123);
  assert.equal(tenths(12.36), 124);
  assert.equal(tenths(-1), -1);
  assert.equal(tenths(0.05), -1);   // (a half tenth: left to toFixed)
  assert.equal(tenths(1e6), -1);
});

test('printedKey is the same for numbers that print the same, at 0 to 3 decimals, and NaN where it is not certain', () => {
  const r = rng(11);
  for (let d = 0; d <= 3; d++) {
    for (let i = 0; i < 20000; i++) {
      const v = r() * 300, a = printedKey(v, d);
      if (Number.isNaN(a)) continue;
      assert.equal(String(a / 10 ** d), String(+v.toFixed(d)), `printedKey(${v}, ${d})`);
      const w = v + (r() - 0.5) * 10 ** -(d + 3);
      const b = printedKey(w, d);
      if (!Number.isNaN(b) && a === b) assert.equal(v.toFixed(d), w.toFixed(d), `same key, same text at ${d}: ${v} ${w}`);
    }
  }
  assert.ok(Number.isNaN(printedKey(-1, 1)));
});
