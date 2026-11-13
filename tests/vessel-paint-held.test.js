import { stageSource } from './stage-src.js';
// A vessel's colours are fields the GPU reads (x.col); the SVG gradient stops they used to write are gone with the SVG tubes
// (2 Nov 2026, figure model to data). A colour that did not change is not written again, so nothing re-uploads.
import test from 'node:test';
import assert from 'node:assert/strict';

const st = stageSource();

test('vessel colours are a field, replaced only when one of the two changes', () => {
  assert.match(st, /setColPair\(x, c1, c2\);/);
  assert.match(st, /function setColPair\(o, a, b\) \{\n\s+const c = o\.col;\n\s+if \(!c\) o\.col = \[a, b\];\n\s+else if \(c\[0\] !== a \|\| c\[1\] !== b\) \{ c\[0\] = a; c\[1\] = b; \}/);
  assert.doesNotMatch(st, /set(G|Attr|Paint)?\([^)]*'stop-color'/);
});

test('no paint is held for a hidden SVG any more: setPaint and its flush are gone', () => {
  assert.doesNotMatch(st, /setPaint|paintHeld|flushPaint|tubesStale/);
});
