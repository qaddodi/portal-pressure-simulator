// The displayed-label snapshot (R17): { seq, gen, items: [{ key, x, y, w, h, a, clipped }] } from the pictures drawn in the last frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snapshotItem } from '../src/ui/label-gl.js';

const lg = readFileSync(new URL('../src/ui/label-gl.js', import.meta.url), 'utf8');
const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('an item is in CSS px with its opacity, and clipped only where it leaves the canvas', () => {
  assert.deepEqual(snapshotItem('a', 20, 40, 60, 30, 0.5, 2, 400, 300), { key: 'a', x: 10, y: 20, w: 30, h: 15, a: 0.5, clipped: false });
  assert.equal(snapshotItem('a', -1, 0, 10, 10, 1, 1, 100, 100).clipped, true);
  assert.equal(snapshotItem('a', 95, 0, 10, 10, 1, 1, 100, 100).clipped, true);
  assert.equal(snapshotItem('a', 90, 90, 10, 10, 1, 1, 100, 100).clipped, false);
});

test('seq counts drawn frames, gen every layout and repack, and only pictures drawn that frame are listed', () => {
  assert.match(lg, /nb = 0;\n\s+frameSeq\+\+;/);
  assert.match(lg, /last = list; gen\+\+;/);
  assert.match(lg, /packer\.reset\(\); outgoing\.length = 0; gen\+\+;/);
  assert.match(lg, /st\.seq = frameSeq;\n\s+takeItem\(/);
  assert.match(lg, /st\.seq === frameSeq/);
  assert.match(lg, /return \{ seq: frameSeq, gen, items \};/);
  // (drawnLabels stays as it was; the stage hands the snapshot out beside it, in page px.)
  assert.match(lg, /drawnLabels\(\) \{/);
  assert.match(st, /labelSnapshot: \(\) => \{ const r = stageBox\(\), o = labelGL\?\.snapshot\?\.\(\)/);
});
