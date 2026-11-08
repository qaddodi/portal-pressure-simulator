// Performance recs B2 (small half), B5 and B6 for label-gl.js (8 Nov 2026).
//  B2: a split picture is painted twice from one layBlock result; its shapes are made once, so the painter's mesh cache (keyed by the shape's
//      object) hits the second time.
//  B5: a label's data-gl is written only when it changes, and a set with nothing in it is not asked per label.
//  B6: the instance buffer is allocated at capacity and written with bufferSubData, not re-specified every draw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blockOps } from '../src/ui/label-gl.js';

const SRC = readFileSync(new URL('../src/ui/label-gl.js', import.meta.url), 'utf8');
const TEXT = await import('../src/ui/text-gl.js');
await TEXT.loadGlyphs();

test('B2: both paints of a split picture are given the very same shapes', () => {
  const run = { t: '12.3', it: false, fill: 'rgb(0, 0, 0)', stroke: 'rgba(255, 255, 255, 0.9)', sw: 3, strokeFirst: true, font: '500 14px Inter', size: 14, wt: 500, fam: 'Inter, system-ui, sans-serif', ls: 0, tnum: true };
  const textPart = { k: 'text', x: 0, y: 11, anchor: 'start', runs: [run] };
  const rectPart = { k: 'rect', x: 0, y: 0, w: 30, h: 16, rx: 8, fill: 'rgb(255, 0, 0)', stroke: '', sw: 0 };
  const d = { opacity: 1, filter: '', parts: [rectPart, textPart] };
  const lay = { m: [1, 0, 0, 1, 0, 0], lines: [{ p: textPart, runs: [{ r: run, x: 0 }] }] };
  const a = blockOps(d, lay, 1), b = blockOps(d, lay, 2);
  assert.ok(a.length > 0 && a.length === b.length);
  for (let i = 0; i < a.length; i++) assert.equal(a[i].geom, b[i].geom, `op ${i} paints the same shape in both modes`);
  const other = { m: lay.m, lines: lay.lines };
  assert.notEqual(blockOps(d, other, 1)[0].geom, a[0].geom, 'a new layBlock result makes its own');
});

test('B5: data-gl is written through glSet, which skips an unchanged label; empty sets are not asked', () => {
  assert.match(SRC, /function glSet\(g, st, on\) \{\s*if \(st\) \{ if \(st\.glA === on\) return; st\.glA = on; \}/);
  const loop = SRC.slice(SRC.indexOf('for (const s of last) {\n      const { g } = s, rot = !!s.rot;'), SRC.indexOf('const pinned = pinOf(s);'));
  assert.ok(loop.length > 500);
  assert.doesNotMatch(loop, /hasAttribute\('data-gl'\)|setAttribute\('data-gl'|removeAttribute\('data-gl'/, 'the label loop writes no attribute itself');
  assert.match(loop, /live\.size \? live\.get\(g\)/);
  assert.match(loop, /exact\.size \? exact\.get\(g\)/);
  assert.match(loop, /dirty\.size > 0 && dirty\.has\(g\)/);
  assert.match(loop, /pending\.size > 0 && pending\.has\(g\)/);
  // (Every place that takes the attribute off a label without glSet drops the kept state with it.)
  assert.equal((SRC.match(/for \(const s of last\) glDrop\(s\.g\);/g) || []).length, 2, 'release and the loss give every label back through glDrop');
});

test('B6: the instance buffer is sized when it grows and written in place each draw', () => {
  assert.match(SRC, /if \(inst\.byteLength > abufCap\) \{ gl\.bufferData\(gl\.ARRAY_BUFFER, inst\.byteLength, gl\.DYNAMIC_DRAW\); abufCap = inst\.byteLength; \}/);
  assert.match(SRC, /gl\.bufferSubData\(gl\.ARRAY_BUFFER, 0, inst, 0, ni \* IF\);/);
  assert.doesNotMatch(SRC, /gl\.bufferData\(gl\.ARRAY_BUFFER, inst, gl\.DYNAMIC_DRAW/, 'no re-specification per draw');
  assert.match(SRC, /abuf = gl\.createBuffer\(\); abufCap = 0;/, 'a new buffer (a restored context) owns nothing yet');
});
