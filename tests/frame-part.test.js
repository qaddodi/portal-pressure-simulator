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
  assert.match(st, /if \(phase === 'early'\) ph\.early \+= ms; else if \(phase === 'late'\) ph\.late \+= ms; else if \(phase === 'final'\) ph\.final \+= ms;/, "an 'in' or 'outside' piece is not added to a phase's time twice");
  assert.match(readFileSync(new URL('../scripts/frame-gate.mjs', import.meta.url), 'utf8'), /worst\.top\.slice\(0, 4\)/);
});

test("gpuProbe's named steps are pieces of their frame too, and cost one call while nothing is measured", async () => {
  const { gpuProbe } = await import('../src/ui/gpu-probe.js');
  assert.equal(gpuProbe.time(null, 'x', () => 7), 7);
  gpuProbe.part = (name, f) => f() * 2;
  try { assert.equal(gpuProbe.time(null, 'x', () => 7), 14); } finally { gpuProbe.part = null; }
  assert.match(readFileSync(new URL('../src/ui/frame.js', import.meta.url), 'utf8'), /\ngpuProbe\.part = framePart;\n/);
  const gp = readFileSync(new URL('../src/ui/gpu-probe.js', import.meta.url), 'utf8');
  assert.match(gp, /if \(!this\.on\) return this\.part \? this\.part\(name, f, a, b, c\) : f\(a, b, c\);/);
});
