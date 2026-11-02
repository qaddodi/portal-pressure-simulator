// A vessel's colours are fields the GPU reads (x.col); the SVG gradient stops they used to write are gone with the SVG tubes
// (2 Nov 2026, figure model to data). A colour that did not change is not written again, so nothing re-uploads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('vessel colours are a field, replaced only when one of the two changes', () => {
  assert.match(st, /if \(x\.col\?\.\[0\] !== c1 \|\| x\.col\?\.\[1\] !== c2\) x\.col = \[c1, c2\];/);
  assert.doesNotMatch(st, /set(G|Attr|Paint)?\([^)]*'stop-color'/);
});

test('no paint is held for a hidden SVG any more: setPaint and its flush are gone', () => {
  assert.doesNotMatch(st, /setPaint|paintHeld|flushPaint|tubesStale/);
});
