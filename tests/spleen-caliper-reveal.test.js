import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 11 Nov 2026, Mohammad: "when the spleen caliper appears it actually only half appears then it shows up fully". The caliper was
// made while the patient was still morphing to the slide's spleen, at the size the spleen had by then, and grew with it. A caliper not
// yet drawn now waits for the morph to land (neither the line nor the reading is made), then comes in whole at the landed length.
const src = readFileSync(new URL('../src/ui/stage-outlines.js', import.meta.url), 'utf8');

test('a spleen caliper not yet drawn waits while the patient morphs', () => {
  assert.match(src, /const capHolds = \(c, f\) => !!f\.morphing && !capShown\.has\(c\.id\);/);
  const at = src.slice(src.indexOf('function caliperAt'), src.indexOf('function caliperSegs'));
  assert.match(at, /capHolds\(c, f\)\) return null;/, 'the spleen caliper (line and reading) is not made while held');
  assert.match(at, /capShown\.add\(c\.id\);/, 'one drawn is not held again: it follows the spleen');
});

test('the labels are solved again when the held caliper is let in', () => {
  const sync = src.slice(src.indexOf('function fxSync'), src.indexOf('let fxOpT'));
  assert.match(sync, /if \(capWas && !capWait && live\.fx\) \{ live\.fx = \{ \.\.\.live\.fx \}; live\.stageWake\(\); \}/);
});

test('a new set of callouts forgets which calipers were drawn', () => {
  assert.match(src, /if \(!sp \|\| sig !== live\.fxSig\) \{ capShown\.clear\(\); capWas = false;/);
});
