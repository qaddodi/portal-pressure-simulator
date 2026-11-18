// A pointer that is gone must not stop a gesture (tester's console, 18 Nov 2026: page-push.js setPointerCapture threw NotFoundError).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { capture } from '../src/ui/pointer-capture.js';

test('capture hands the pointer on, and a refused or missing capture never throws', () => {
  const got = [];
  capture({ setPointerCapture: (id) => got.push(id) }, 7);
  assert.deepEqual(got, [7]);
  assert.doesNotThrow(() => capture({ setPointerCapture() { throw new DOMException('no such pointer', 'NotFoundError'); } }, 9));
  assert.doesNotThrow(() => capture({}, 1));
});

test('no file calls setPointerCapture outside a try (they use capture())', () => {
  const bad = [];
  for (const f of readdirSync(new URL('../src/ui/', import.meta.url))) {
    if (!f.endsWith('.js') || f === 'pointer-capture.js') continue;
    readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8').split('\n').forEach((l, i) => {
      if (/\.setPointerCapture\b/.test(l) && !/\btry\b/.test(l)) bad.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, []);
});
