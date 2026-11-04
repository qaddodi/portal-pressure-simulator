// S6.6: the camera has one writer. `vt` is assigned in exactly one place, writeVT (which drops the transform with it); every part writes
// `live.vt = ...`, and the live record's setter is writeVT. So a transform made for another view can never be read after a move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageSource, stageFiles } from './stage-src.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('vt is assigned only inside writeVT; the live record routes every write through it', () => {
  const src = stageSource();
  const bare = [...src.matchAll(/(^|[^.\w$])vt = /gm)].map((m) => src.slice(m.index, m.index + 60).replace(/\n.*/s, ''));
  assert.equal(bare.length, 2, `a bare "vt = " other than the declaration and writeVT: ${bare.join(' | ')}`);
  assert.match(src, /function writeVT\(v\) \{ vt = v; CTM = null; \}/);
  assert.match(src, /set vt\(v\) \{ writeVT\(v\); \}/);
  assert.equal(stageFiles().length > 1, true);
});

test('no part holds a copy of the camera between frames', () => {
  const dir = fileURLToPath(new URL('../src/ui/', import.meta.url));
  for (const f of stageFiles().filter((n) => n !== 'stage.js')) {
    const t = readFileSync(dir + f, 'utf8');
    assert.ok(!/\b(?:let|var|const)\s+vt\b/.test(t), `${f} declares its own vt`);
  }
});
