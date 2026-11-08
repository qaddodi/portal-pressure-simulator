// The lobule's labels are drawn by the GPU captions; the page's clear model of them is written between frames (2 Nov 2026): a class a layout
// asks for goes through classSoon and is read back with classHas, so the layout, the ride and the captions' frame never write or read it from the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const between = (a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));

test('the label layout, the ride and the captions\' frame write no class and read none from the page', () => {
  const parts = [between('function ride()', 'function bakeFollow()'), between('function bakeFollow()', '\n  }\n'), between('function layoutLabels()', 'function syncLeaders()'), between('function capSync(', 'cap.onFrame = capSync;')];
  for (const [i, p] of parts.entries()) {
    assert.ok(p.length > 200, `part ${i} found`);
    assert.doesNotMatch(p, /\.classList\.(add|remove|toggle|contains)\(/, `part ${i}: no class is written or read from the page in a frame`);
  }
});

test('a label\'s swatch colour and the pill\'s words are written between frames', () => {
  assert.match(src, /L\.swWant = col \|\| 'var\(--border-strong\)'; swQ\.add\(L\); pageSoon\(\);/);
  assert.match(src, /textSoon\(callEl, c\.label\);/);
  assert.doesNotMatch(src, /--edge-a/, 'the no-GPU edge variables are gone');
});
