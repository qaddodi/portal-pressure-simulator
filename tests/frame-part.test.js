// framePart (frame.js): a named piece of a surface's work, timed only while frames are watched, so the frame-time gate's long frames
// name what inside the lobule took the time (lz.stage, lz.buildWide's callers, lz.paintWorld, lz.layTiles, lz.drawTile, ...).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('framePart returns what it runs, and costs nothing while nobody watches', async () => {
  const { framePart } = await import('../src/ui/frame.js');
  assert.equal(framePart('x', () => 42), 42);
  assert.throws(() => framePart('x', () => { throw new Error('boom'); }), /boom/);
});

test('pieces outside the scheduler are listed with the next frame, never in its script time; the gate shows four per slide', () => {
  const fr = readFileSync(new URL('../src/ui/frame.js', import.meta.url), 'utf8');
  assert.match(fr, /parts = watching \? outsideParts\.splice\(0\) : null;/);
  assert.match(fr, /const e = \[tag, parts \? 'in' : 'outside', performance\.now\(\) - t0\];/);
  const st = readFileSync(new URL('../src/ui/frame-stats.js', import.meta.url), 'utf8');
  assert.match(st, /if \(phase in ph\) ph\[phase\] \+= ms;/, "an 'in' or 'outside' piece is not added to a phase's time twice");
  assert.match(readFileSync(new URL('../scripts/frame-gate.mjs', import.meta.url), 'utf8'), /worst\.top\.slice\(0, 4\)/);
});
